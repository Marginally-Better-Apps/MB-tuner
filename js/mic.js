// Web Audio mic capture. Equivalent of src/audio/mic.ts for the browser.
// Uses an AudioWorklet when available (glitch-free, runs on the audio thread)
// and falls back to ScriptProcessorNode for older browsers.
//
// The callback receives mono Float32 samples in [-1, 1] and the effective
// sampleRate reported by the AudioContext, mirroring the RN contract.

/** @typedef {{ samples: Float32Array, sampleRate: number, when: number }} MicChunk */

const WORKLET_SRC = `
class MicTapProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0) {
      // Copy so we can transfer ownership to the main thread without
      // clobbering the render buffer on the next quantum.
      const channel = input[0];
      if (channel && channel.length > 0) {
        const copy = new Float32Array(channel);
        this.port.postMessage(copy, [copy.buffer]);
      }
    }
    return true;
  }
}
registerProcessor('mic-tap', MicTapProcessor);
`;

export async function getPermissionState() {
  if (!navigator.permissions) return 'Undetermined';
  try {
    const res = await navigator.permissions.query({ name: 'microphone' });
    if (res.state === 'granted') return 'Granted';
    if (res.state === 'denied') return 'Denied';
    return 'Undetermined';
  } catch {
    return 'Undetermined';
  }
}

/**
 * Start a mic stream. Resolves with a stop function that tears everything
 * down. Throws on any failure (including permission denial — the caller
 * should map the `NotAllowedError` / `SecurityError` to "Denied").
 */
export async function startMicStream(onChunk, onError) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('MediaDevices API not available in this browser.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      // Match iOS `measurement` mode as closely as the browser allows —
      // disable AGC / NS / echo cancellation so the DSP does not corrupt
      // the signal before pitch analysis. Chrome honors these hints;
      // Safari mostly ignores them but respects explicit `false`.
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    },
    video: false,
  });

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error('Web Audio API not available.');
  }
  const ctx = new AudioCtx({ latencyHint: 'interactive' });
  if (ctx.state === 'suspended') {
    await ctx.resume().catch(() => undefined);
  }

  const source = ctx.createMediaStreamSource(stream);
  let stopped = false;
  let dispose = () => undefined;

  const handleError = (e) => {
    if (stopped) return;
    onError(e instanceof Error ? e.message : String(e));
  };

  try {
    if (typeof AudioWorkletNode !== 'undefined' && ctx.audioWorklet) {
      const blob = new Blob([WORKLET_SRC], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      const node = new AudioWorkletNode(ctx, 'mic-tap', {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount: 1,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
      });
      node.port.onmessage = (ev) => {
        if (stopped) return;
        onChunk({
          samples: ev.data,
          sampleRate: ctx.sampleRate,
          when: ctx.currentTime,
        });
      };
      node.onprocessorerror = (e) => handleError(e);
      source.connect(node);
      dispose = () => {
        try { source.disconnect(node); } catch {}
        try { node.port.onmessage = null; } catch {}
        try { node.disconnect(); } catch {}
      };
    } else {
      const bufSize = 2048;
      const processor = ctx.createScriptProcessor(bufSize, 1, 1);
      // ScriptProcessor only runs if its output is connected. Use a silent
      // gain node so we don't leak the mic to the speakers.
      const silentSink = ctx.createGain();
      silentSink.gain.value = 0;
      processor.onaudioprocess = (ev) => {
        if (stopped) return;
        const ch = ev.inputBuffer.getChannelData(0);
        onChunk({
          samples: new Float32Array(ch),
          sampleRate: ctx.sampleRate,
          when: ctx.currentTime,
        });
      };
      source.connect(processor);
      processor.connect(silentSink);
      silentSink.connect(ctx.destination);
      dispose = () => {
        try { source.disconnect(processor); } catch {}
        try { processor.disconnect(); } catch {}
        try { silentSink.disconnect(); } catch {}
        processor.onaudioprocess = null;
      };
    }
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    try { await ctx.close(); } catch {}
    throw e;
  }

  // Observe track/device lifecycle events that commonly invalidate the stream.
  const [track] = stream.getAudioTracks();
  const onTrackEnd = () => handleError(new Error('Microphone track ended.'));
  track?.addEventListener('ended', onTrackEnd);

  return () => {
    if (stopped) return;
    stopped = true;
    try { dispose(); } catch {}
    try { track?.removeEventListener('ended', onTrackEnd); } catch {}
    stream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
    ctx.close().catch(() => undefined);
  };
}
