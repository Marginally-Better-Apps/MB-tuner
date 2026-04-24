let nextFinding: [number, number] = [0, 0];

jest.mock('pitchy', () => ({
  PitchDetector: {
    forFloat32Array: (size: number) => ({
      size,
      clarityThreshold: 0.01,
      findPitch: (_buf: Float32Array, _sr: number) => nextFinding,
    }),
  },
}));

import { PitchTracker } from '../pitch';

const SR = 44100;

function setDetection(frequency: number, clarity: number) {
  nextFinding = [frequency, clarity];
}

function chunk(n: number, amplitude = 0.1): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amplitude;
  return out;
}

/**
 * Drives the tracker through `pushes` calls at `spacingMs` intervals. Returns
 * the last result. Useful because most behaviours require the ring to fill
 * AND the lock-in window to accumulate ≥ `lockMinSamples` agreeing frames.
 */
function runFrames(
  tracker: PitchTracker,
  pushes: number,
  chunkSize: number,
  spacingMs: number,
  amplitude = 0.1,
  startT = 0
) {
  let last: ReturnType<PitchTracker['push']> | null = null;
  for (let i = 0; i < pushes; i++) {
    last = tracker.push(
      chunk(chunkSize, amplitude),
      SR,
      startT + i * spacingMs
    );
  }
  return last!;
}

describe('PitchTracker', () => {
  beforeEach(() => {
    setDetection(0, 0);
  });

  it('does not report a reading while the ring is warming up', () => {
    const tracker = new PitchTracker({ analysisSize: 4096 });
    setDetection(110, 0.99);
    const r = tracker.push(chunk(1024), SR, 0);
    expect(r.isLive).toBe(false);
    expect(r.isHeld).toBe(false);
    expect(r.smoothed).toBe(0);
  });

  it('holds (not live) during lock-in, then goes live after consensus', () => {
    const tracker = new PitchTracker({
      analysisSize: 4096,
      lockMinSamples: 3,
    });
    setDetection(110, 0.99);
    // Fill the ring (needs ≥ 4 pushes of 1024 to reach 4096).
    runFrames(tracker, 4, 1024, 20, 0.1, 0);
    // One detection frame so far: lock-in ring has 1 entry, not locked.
    const afterOne = tracker.push(chunk(1024), SR, 80);
    expect(afterOne.isLive).toBe(false);
    // Two more consistent detection frames → ≥ 3 agreeing samples → locked.
    tracker.push(chunk(1024), SR, 100);
    const locked = tracker.push(chunk(1024), SR, 120);
    expect(locked.isLive).toBe(true);
    expect(locked.smoothed).toBeCloseTo(110, 0);
  });

  it('accepts low baritone fundamentals (~55 Hz) when clarity is adequate', () => {
    const tracker = new PitchTracker({ analysisSize: 4096 });
    setDetection(55, 0.85);
    runFrames(tracker, 4, 1024, 20, 0.1, 0);
    tracker.push(chunk(1024), SR, 100);
    tracker.push(chunk(1024), SR, 120);
    const r = tracker.push(chunk(1024), SR, 140);
    expect(r.isLive).toBe(true);
    expect(r.smoothed).toBeCloseTo(55, 0);
  });

  it('still passes at 0.7 clarity (default threshold)', () => {
    const tracker = new PitchTracker({ analysisSize: 4096 });
    setDetection(82, 0.72);
    runFrames(tracker, 4, 1024, 20, 0.1, 0);
    tracker.push(chunk(1024), SR, 100);
    tracker.push(chunk(1024), SR, 120);
    const r = tracker.push(chunk(1024), SR, 140);
    expect(r.isLive).toBe(true);
  });

  it('rejects frequencies below the floor (noise)', () => {
    const tracker = new PitchTracker({ analysisSize: 4096, minFrequency: 30 });
    setDetection(20, 0.95);
    runFrames(tracker, 4, 1024, 20, 0.1, 0);
    const r = tracker.push(chunk(1024), SR, 100);
    expect(r.isLive).toBe(false);
  });

  it('rejects frames below the RMS floor (silence with false detection)', () => {
    const tracker = new PitchTracker({ analysisSize: 4096, minRms: 0.01 });
    setDetection(110, 0.95);
    // amplitude = 0.001 → rms = 0.001, below the 0.01 floor.
    runFrames(tracker, 4, 1024, 20, 0.001, 0);
    const r = tracker.push(chunk(1024, 0.001), SR, 100);
    expect(r.isLive).toBe(false);
  });

  it('suppresses isolated octave errors via the lock-in median', () => {
    const tracker = new PitchTracker({
      analysisSize: 4096,
      lockMinSamples: 3,
      lockSpreadCents: 35,
    });
    // Fill the ring, then establish a lock at 110 Hz.
    setDetection(110, 0.95);
    runFrames(tracker, 4, 1024, 20, 0.1, 0);
    tracker.push(chunk(1024), SR, 80);
    tracker.push(chunk(1024), SR, 100);
    const locked = tracker.push(chunk(1024), SR, 120);
    expect(locked.isLive).toBe(true);
    expect(locked.smoothed).toBeCloseTo(110, 0);

    // A single octave-up outlier. The median stays pinned to 110 (three
    // agreeing samples beat one dissenter), so the smoothed output does not
    // show the outlier and the lock is preserved.
    setDetection(220, 0.95);
    const outlier = tracker.push(chunk(1024), SR, 140);
    expect(outlier.isLive).toBe(true);
    expect(outlier.smoothed).toBeLessThan(130);

    // The lock remains through further correct frames.
    setDetection(110, 0.95);
    const recovered = tracker.push(chunk(1024), SR, 160);
    expect(recovered.isLive).toBe(true);
    expect(recovered.smoothed).toBeCloseTo(110, 0);
  });

  it('unlocks when the cluster genuinely migrates (new note)', () => {
    const tracker = new PitchTracker({
      analysisSize: 4096,
      lockMinSamples: 3,
      lockSpreadCents: 35,
      lockWindowMs: 260,
    });
    // Lock on 110 Hz.
    setDetection(110, 0.95);
    runFrames(tracker, 4, 1024, 20, 0.1, 0);
    tracker.push(chunk(1024), SR, 80);
    tracker.push(chunk(1024), SR, 100);
    const locked = tracker.push(chunk(1024), SR, 120);
    expect(locked.isLive).toBe(true);

    // Now the detector persistently reports a different note. As the lock-in
    // window's time cutoff evicts the old 110 samples, the cluster around
    // them loses majority and the median migrates to 165. At that point the
    // tracker unlocks, then re-locks on the new consensus.
    setDetection(165, 0.95);
    tracker.push(chunk(1024), SR, 140);
    tracker.push(chunk(1024), SR, 160);
    tracker.push(chunk(1024), SR, 420);
    tracker.push(chunk(1024), SR, 440);
    const relocked = tracker.push(chunk(1024), SR, 460);
    expect(relocked.isLive).toBe(true);
    expect(relocked.smoothed).toBeCloseTo(165, 0);
  });

  it('holds the last good frequency across a temporary gate drop', () => {
    const tracker = new PitchTracker({ analysisSize: 4096, holdMs: 1500 });
    setDetection(110, 0.95);
    runFrames(tracker, 4, 1024, 20, 0.1, 0);
    tracker.push(chunk(1024), SR, 80);
    tracker.push(chunk(1024), SR, 100);
    const live = tracker.push(chunk(1024), SR, 120);
    expect(live.isLive).toBe(true);

    setDetection(110, 0.2);
    const held = tracker.push(chunk(1024), SR, 200);
    expect(held.isLive).toBe(false);
    expect(held.isHeld).toBe(true);
    expect(held.smoothed).toBeGreaterThan(0);
  });

  it('releases the held frequency after the hold window expires', () => {
    const tracker = new PitchTracker({ analysisSize: 4096, holdMs: 300 });
    setDetection(110, 0.95);
    runFrames(tracker, 4, 1024, 20, 0.1, 0);
    tracker.push(chunk(1024), SR, 80);
    tracker.push(chunk(1024), SR, 100);
    tracker.push(chunk(1024), SR, 120);

    setDetection(110, 0.2);
    const past = tracker.push(chunk(1024), SR, 120 + 1000);
    expect(past.isLive).toBe(false);
    expect(past.isHeld).toBe(false);
    expect(past.smoothed).toBe(0);
  });

  it('keeps analyzing when chunk size does not divide the ring size', () => {
    const tracker = new PitchTracker({ analysisSize: 4096 });
    setDetection(200, 0.95);
    // 1500 does not divide 4096; ring should still fill correctly.
    runFrames(tracker, 4, 1500, 20, 0.1, 0);
    tracker.push(chunk(1500), SR, 100);
    tracker.push(chunk(1500), SR, 120);
    const r = tracker.push(chunk(1500), SR, 140);
    expect(r.isLive).toBe(true);
  });

  it('handles chunks larger than the ring by keeping the tail', () => {
    const tracker = new PitchTracker({ analysisSize: 2048 });
    setDetection(330, 0.95);
    // Each oversized push refills the whole ring, so three back-to-back
    // pushes give us three detection frames — enough to lock.
    const big = () => chunk(8192);
    tracker.push(big(), SR, 0);
    tracker.push(big(), SR, 20);
    const r = tracker.push(big(), SR, 40);
    expect(r.isLive).toBe(true);
    expect(r.smoothed).toBeCloseTo(330, 0);
  });
});
