import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, type AppStateStatus } from 'react-native';
import { AudioManager } from 'react-native-audio-api';

import {
  checkMicPermission,
  requestMicPermission,
  startMicStream,
  type PermissionStatus,
} from '@/audio/mic';
import { PitchTracker } from '@/audio/pitch';
import { useSettings } from '@/store/settings';
import { IN_TUNE_CENTS } from '@/tuning/constants';
import { fToNote, type NoteName } from '@/tuning/notes';

export type TunerState = {
  permission: PermissionStatus | 'Requesting' | 'Unknown';
  error: string | null;
  running: boolean;
  note: NoteName | null;
  octave: number | null;
  /** Equal-tempered Hz of the displayed (nearest) note at the current A reference. */
  targetFrequency: number;
  /** Smoothed Hz from pitch detection (what you are actually playing). */
  detectedFrequency: number;
  cents: number;
  /** Rounded MIDI of the nearest note (needle center / chromatic neighbors). */
  midi: number | null;
  isLive: boolean;
  isHeld: boolean;
  reduceMotion: boolean;
};

/** iOS route-change reasons that commonly invalidate an active mic stream. */
const ROUTE_RESTART_REASONS = new Set<string>([
  'NewDeviceAvailable',
  'OldDeviceUnavailable',
  // CategoryChange is intentionally excluded: configureSession() is called on
  // every pipeline restart, and iOS fires CategoryChange when the session
  // category/mode is applied. Including it here causes an infinite restart
  // loop — each restart triggers CategoryChange → restart → CategoryChange …
  // Hardware-disconnection cases are covered by OldDeviceUnavailable above.
]);

export function useTuner(): TunerState & {
  start: () => Promise<void>;
  stop: () => void;
} {
  const aRef = useSettings((s) => s.aRef);
  const [state, setState] = useState<TunerState>({
    permission: 'Unknown',
    error: null,
    running: false,
    note: null,
    octave: null,
    targetFrequency: 0,
    detectedFrequency: 0,
    cents: 0,
    midi: null,
    isLive: false,
    isHeld: false,
    reduceMotion: false,
  });

  const trackerRef = useRef<PitchTracker | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const aRefRef = useRef(aRef);
  const wasInTune = useRef(false);

  /** Bumps when the mic pipeline is torn down so stale callbacks exit early. */
  const micGenerationRef = useRef(0);
  /** True after a successful `attachMicPipeline` until `stop()`. */
  const listeningRef = useRef(false);
  /** Wall-clock time of the last audio chunk (watchdog / foreground recovery). */
  const lastChunkWallMsRef = useRef(0);
  const restartDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attachMicPipelineRef = useRef<() => Promise<void>>(async () => {});
  /** Ensures we never run two attaches concurrently (would corrupt `stopRef`). */
  const pipelineGateRef = useRef(Promise.resolve());
  /**
   * True when we stopped the mic because the app went to background. Used so
   * that foregrounding auto-resumes only when _we_ suspended, not when the
   * user had explicitly paused before backgrounding.
   */
  const autoSuspendedRef = useRef(false);
  /** Stable refs for start/stop so effects can call them without re-subscribing. */
  const startRef = useRef<() => Promise<void>>(async () => {});
  const stopRef2 = useRef<() => void>(() => {});

  // Keep latest A reference in a ref so the chunk callback picks it up
  // without re-subscribing the mic stream.
  useEffect(() => {
    aRefRef.current = aRef;
  }, [aRef]);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setState((s) => ({ ...s, reduceMotion: enabled }));
    });
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => {
        if (mounted) setState((s) => ({ ...s, reduceMotion: enabled }));
      }
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    checkMicPermission().then((p) => {
      if (mounted) setState((s) => ({ ...s, permission: p }));
    });
    return () => {
      mounted = false;
    };
  }, []);

  const scheduleDebouncedPipelineRestart = useCallback(() => {
    if (!listeningRef.current) return;
    if (restartDebounceRef.current) {
      clearTimeout(restartDebounceRef.current);
    }
    restartDebounceRef.current = setTimeout(() => {
      restartDebounceRef.current = null;
      if (!listeningRef.current) return;
      void attachMicPipelineRef.current();
    }, 200);
  }, []);

  // System audio events: native recorder often stops after interruptions /
  // route changes without invoking `onError`.
  useEffect(() => {
    const intSub = AudioManager.addSystemEventListener(
      'interruption',
      (e: { type: string; shouldResume: boolean }) => {
        if (e.type === 'ended' && e.shouldResume) {
          scheduleDebouncedPipelineRestart();
        }
      }
    );

    const routeSub = AudioManager.addSystemEventListener(
      'routeChange',
      (e: { reason: string }) => {
        if (!ROUTE_RESTART_REASONS.has(e.reason)) return;
        scheduleDebouncedPipelineRestart();
      }
    );

    return () => {
      intSub.remove();
      routeSub.remove();
      if (restartDebounceRef.current) {
        clearTimeout(restartDebounceRef.current);
        restartDebounceRef.current = null;
      }
    };
  }, [scheduleDebouncedPipelineRestart]);

  // Release the mic when the app goes to the background so the OS mic
  // indicator disappears and no audio is captured while we're not visible.
  // Auto-resume on return to foreground, but only if we were the ones who
  // suspended (so an explicit user pause stays paused across background).
  useEffect(() => {
    const onAppState = (next: AppStateStatus) => {
      if (next === 'background') {
        if (listeningRef.current) {
          stopRef2.current();
          autoSuspendedRef.current = true;
        }
        return;
      }
      if (next === 'active') {
        if (autoSuspendedRef.current) {
          autoSuspendedRef.current = false;
          void startRef.current();
          return;
        }
        if (
          listeningRef.current &&
          Date.now() - lastChunkWallMsRef.current > 500
        ) {
          void attachMicPipelineRef.current();
        }
      }
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => sub.remove();
  }, []);

  // Watchdog: recover when the native callback silently stops (no error).
  useEffect(() => {
    const id = setInterval(() => {
      if (!listeningRef.current) return;
      if (Date.now() - lastChunkWallMsRef.current > 900) {
        void attachMicPipelineRef.current();
      }
    }, 400);
    return () => clearInterval(id);
  }, []);

  async function attachMicPipeline() {
    const myGen = ++micGenerationRef.current;
    lastChunkWallMsRef.current = Date.now();

    stopRef.current?.();
    stopRef.current = null;
    if (trackerRef.current) {
      trackerRef.current.softReset();
    } else {
      trackerRef.current = new PitchTracker();
    }

    try {
      stopRef.current = await startMicStream(
        ({ samples, sampleRate, when }) => {
          if (micGenerationRef.current !== myGen) return;
          lastChunkWallMsRef.current = Date.now();

          const tracker = trackerRef.current;
          if (!tracker) return;

          const nowMs =
            typeof when === 'number' && Number.isFinite(when)
              ? when * 1000
              : Date.now();

          const result = tracker.push(samples, sampleRate, nowMs);
          if (result.smoothed > 0) {
            const n = fToNote(result.smoothed, aRefRef.current);
            const inTune =
              result.isLive && Math.abs(n.cents) <= IN_TUNE_CENTS;
            if (inTune && !wasInTune.current) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                () => undefined
              );
            }
            wasInTune.current = inTune;
            setState((s) => ({
              ...s,
              running: true,
              note: n.name,
              octave: n.octave,
              targetFrequency: n.targetFrequency,
              detectedFrequency: result.smoothed,
              cents: n.cents,
              midi: n.midi,
              isLive: result.isLive,
              isHeld: result.isHeld,
            }));
          } else {
            wasInTune.current = false;
            setState((s) => ({
              ...s,
              running: true,
              isLive: false,
              isHeld: false,
              targetFrequency: 0,
              detectedFrequency: 0,
              note: null,
              octave: null,
              cents: 0,
              midi: null,
            }));
          }
        },
        (message) => {
          micGenerationRef.current += 1;
          listeningRef.current = false;
          stopRef.current?.();
          stopRef.current = null;
          trackerRef.current?.reset();
          trackerRef.current = null;
          wasInTune.current = false;
          setState((s) => ({
            ...s,
            error: message,
            running: false,
            isLive: false,
            isHeld: false,
            note: null,
            octave: null,
            targetFrequency: 0,
            detectedFrequency: 0,
            cents: 0,
            midi: null,
          }));
        }
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setState((s) => ({ ...s, error: message, running: false }));
      listeningRef.current = false;
      throw e;
    }
  }

  async function attachMicPipelineQueued() {
    const prev = pipelineGateRef.current;
    let done!: () => void;
    pipelineGateRef.current = new Promise<void>((resolve) => {
      done = resolve;
    });
    await prev.catch(() => undefined);
    try {
      await attachMicPipeline();
    } finally {
      done();
    }
  }

  attachMicPipelineRef.current = attachMicPipelineQueued;

  async function start() {
    // User intent takes precedence over any pending lifecycle auto-resume.
    autoSuspendedRef.current = false;
    setState((s) => ({ ...s, error: null }));

    let permission = await checkMicPermission();
    if (permission !== 'Granted') {
      setState((s) => ({ ...s, permission: 'Requesting' }));
      permission = await requestMicPermission();
    }
    setState((s) => ({ ...s, permission }));
    if (permission !== 'Granted') return;

    try {
      await attachMicPipelineQueued();
      listeningRef.current = true;
      setState((s) => ({ ...s, running: true }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setState((s) => ({ ...s, error: message, running: false }));
      listeningRef.current = false;
    }
  }

  function stop() {
    // User intent takes precedence over any pending lifecycle auto-resume.
    autoSuspendedRef.current = false;
    micGenerationRef.current += 1;
    listeningRef.current = false;
    if (restartDebounceRef.current) {
      clearTimeout(restartDebounceRef.current);
      restartDebounceRef.current = null;
    }
    stopRef.current?.();
    stopRef.current = null;
    trackerRef.current?.reset();
    trackerRef.current = null;
    wasInTune.current = false;
    setState((s) => ({
      ...s,
      running: false,
      isLive: false,
      isHeld: false,
      note: null,
      octave: null,
      targetFrequency: 0,
      detectedFrequency: 0,
      cents: 0,
      midi: null,
    }));
  }

  startRef.current = start;
  stopRef2.current = stop;

  useEffect(() => {
    return () => {
      micGenerationRef.current += 1;
      listeningRef.current = false;
      stopRef.current?.();
      stopRef.current = null;
    };
  }, []);

  return { ...state, start, stop };
}
