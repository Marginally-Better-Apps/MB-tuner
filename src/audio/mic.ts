import {
  AudioManager,
  AudioRecorder,
  type AudioBuffer,
} from 'react-native-audio-api';

type AudioReadyEvent = {
  buffer: AudioBuffer;
  numFrames: number;
  when: number;
};

export type PermissionStatus = 'Undetermined' | 'Denied' | 'Granted';

export type MicChunk = {
  samples: Float32Array;
  sampleRate: number;
  when: number;
};

export type MicStreamOptions = {
  sampleRate?: number;
  bufferLength?: number;
};

const DEFAULT_SAMPLE_RATE = 48000;
const DEFAULT_BUFFER_LENGTH = 2048;

/**
 * Configures the iOS audio session for mic-only, measurement-quality capture.
 *
 * - `record` category (not `playAndRecord`) avoids output-route interactions
 *   entirely. We never play audio.
 * - `measurement` mode disables iOS DSP (AGC, noise suppression, high-pass).
 *   Any of those would corrupt pitch analysis, especially on low strings.
 * - We deliberately pass an empty options array. In particular we do NOT set
 *   `allowBluetoothHFP`: HFP routes mic capture through an 8–16 kHz bluetooth
 *   voice profile with heavy band-limiting, which destroys low-string content
 *   (low E ≈ 82 Hz, baritone A/B ≈ 55–62 Hz) and causes mid-session route
 *   changes that look like the tuner "giving up" after a second or two.
 *
 * Safe to call repeatedly.
 */
export function configureSession(): void {
  AudioManager.setAudioSessionOptions({
    iosCategory: 'record',
    iosMode: 'measurement',
    iosOptions: [],
  });
  // Required for `AudioManager.addSystemEventListener('interruption', …)` to
  // fire after calls, Siri, other apps, etc. Without it the recorder can stop
  // delivering buffers with no `onError` callback.
  try {
    AudioManager.observeAudioInterruptions(true);
  } catch {
    // Non-fatal on older native builds.
  }
}

export async function checkMicPermission(): Promise<PermissionStatus> {
  return AudioManager.checkRecordingPermissions();
}

export async function requestMicPermission(): Promise<PermissionStatus> {
  return AudioManager.requestRecordingPermissions();
}

/**
 * iOS transiently refuses session activation with
 * `AVAudioSessionErrorCodeCannotInterruptOthers` (`!pni`, OSStatus 561015905)
 * during JS reloads and for a short window after interruptions (Siri, calls,
 * other audio apps). Retrying with a short back-off is the documented
 * workaround.
 */
async function activateSessionWithRetry(attempts = 4, delayMs = 150) {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await AudioManager.setAudioSessionActivity(true);
      return;
    } catch (e) {
      lastError = e;
      if (i < attempts - 1) {
        await new Promise((res) => setTimeout(res, delayMs));
      }
    }
  }
  throw lastError;
}

/**
 * Starts the mic pipeline. Returns a stop function that tears everything down.
 *
 * The callback receives interleaved-mono Float32 PCM samples in [-1, 1]. The
 * reported `sampleRate` may differ from the requested value when the hardware
 * enforces its own rate; always use the reported value when passing to a
 * pitch detector.
 */
export async function startMicStream(
  onChunk: (chunk: MicChunk) => void,
  onError: (message: string) => void,
  options: MicStreamOptions = {}
): Promise<() => void> {
  configureSession();
  await activateSessionWithRetry();

  // If another app briefly takes over audio (phone call, Siri), try to
  // reclaim the session automatically so the tuner resumes on its own.
  try {
    AudioManager.activelyReclaimSession(true);
  } catch {
    // Not available in all versions; non-fatal.
  }

  const recorder = new AudioRecorder();
  let stopped = false;

  recorder.onError((e) => {
    if (!stopped) onError(e.message);
  });

  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const bufferLength = options.bufferLength ?? DEFAULT_BUFFER_LENGTH;

  recorder.onAudioReady(
    { sampleRate, bufferLength, channelCount: 1 },
    (event: AudioReadyEvent) => {
      if (stopped) return;
      const samples = event.buffer.getChannelData(0);
      onChunk({
        samples,
        sampleRate: event.buffer.sampleRate,
        when: event.when,
      });
    }
  );

  const result = recorder.start();
  if (result.status !== 'success') {
    stopped = true;
    try {
      recorder.clearOnAudioReady();
      recorder.clearOnError();
    } catch {
      // no-op
    }
    try {
      AudioManager.activelyReclaimSession(false);
    } catch {
      // no-op
    }
    await AudioManager.setAudioSessionActivity(false).catch(() => undefined);
    throw new Error(`Failed to start mic: ${JSON.stringify(result)}`);
  }

  return () => {
    if (stopped) return;
    stopped = true;
    try {
      recorder.stop();
    } catch {
      // no-op
    }
    try {
      recorder.clearOnAudioReady();
      recorder.clearOnError();
    } catch {
      // no-op
    }
    try {
      AudioManager.activelyReclaimSession(false);
    } catch {
      // no-op
    }
    AudioManager.setAudioSessionActivity(false).catch(() => undefined);
  };
}
