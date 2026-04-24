import { PitchDetector } from 'pitchy';

import { LogFrequencySmoother } from '@/tuning/smoothing';

export type PitchSample = {
  frequency: number;
  clarity: number;
  rms: number;
};

export type PitchTrackerOptions = {
  clarityThreshold?: number;
  minFrequency?: number;
  maxFrequency?: number;
  smoothingTauMs?: number;
  holdMs?: number;
  /**
   * Minimum RMS of the analysis window required to attempt detection. Guards
   * against tracking room noise between notes.
   */
  minRms?: number;
  /**
   * Number of samples used per pitch analysis. Samples from successive `push`
   * calls are accumulated in an internal ring buffer; detection is only run
   * once the ring is full. Larger values reliably track lower fundamentals at
   * the cost of latency.
   *
   * Default 4096 @ 48 kHz ≈ 85 ms (tunable). Larger windows help the lowest
   * strings at the cost of latency.
   */
  analysisSize?: number;
  /**
   * Lock-in window: the tracker collects the last N passing raw detections
   * (in log-Hz) and only emits a live reading once at least `lockMinSamples`
   * of them agree within `lockSpreadCents`. The emitted value is the median
   * of the window, which is robust to isolated octave / sub-harmonic errors
   * during the pluck transient. Samples older than `lockWindowMs` are
   * discarded so the lock follows real pitch changes (new pluck, new note).
   */
  lockMinSamples?: number;
  lockSpreadCents?: number;
  lockWindowMs?: number;
  /** Hard cap on how many raw samples we retain for the lock window. */
  lockRingMax?: number;
};

const DEFAULTS: Required<PitchTrackerOptions> = {
  // External gate on the NSDF value *after* MPM has selected the fundamental
  // (separate from pitchy's internal `k` constant; see findPitch call below).
  // MPM clarity on a decaying steel string commonly sits around 0.75-0.9; a
  // strict 0.9 gate kills detection a second into the note even while it's
  // clearly audible. 0.7 keeps noise out while letting sustained notes through.
  clarityThreshold: 0.7,
  // Covers baritone (down to A1 ≈ 55 Hz) and drop tunings down to ~B0.
  minFrequency: 30,
  // A tuner never needs to resolve above the 5th fret of the high E string.
  maxFrequency: 1500,
  // Short EMA once locked: the median filter has already removed outliers, so
  // the smoother only needs to take the edge off sub-cent jitter.
  smoothingTauMs: 60,
  // Hold the last good reading across short gaps in clarity so the UI stays
  // stable through a sustaining note.
  holdMs: 2000,
  // Slightly below 0.003: attack transients on phone mics often sit ~0.001–0.002
  // RMS while still being a clear pluck; waiting for 0.003+ felt like “let it
  // ring first” (see H2 rejects in debug logs).
  minRms: 0.002,
  // 4096 @ 48 kHz ≈ 85 ms window — much snappier than 8192 (~170 ms) while
  // still giving many periods at 82 Hz+ (low E). Baritone 55 Hz is ~7 periods.
  analysisSize: 4096,
  // Two agreeing frames after the ring is full — faster first live read than
  // three, still enough to filter a single bad frame in most cases.
  lockMinSamples: 2,
  // Plucked-string attack transients routinely swing ±30-60 cents before
  // settling; 35 cents is tight enough to reject octave/harmonic captures
  // (which sit hundreds of cents away) while tolerating normal attack bend.
  lockSpreadCents: 35,
  lockWindowMs: 260,
  lockRingMax: 6,
};

function rmsOf(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/**
 * Subtract the mean (DC component) from the window in place.
 *
 * iOS mic chains in `measurement` mode deliberately skip AGC / high-pass, so a
 * small DC bias leaks through. FFT-based autocorrelation concentrates that bias
 * in bin 0, which lifts the entire NSDF baseline and reduces the *relative*
 * prominence of the fundamental peak vs. harmonic peaks. That matters most for
 * low strings where the fundamental is already weaker than the 2nd harmonic —
 * removing DC lets MPM lock onto E2/B1 instead of falling through to H2.
 */
function removeDc(samples: Float32Array): void {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i];
  const mean = sum / samples.length;
  if (mean === 0) return;
  for (let i = 0; i < samples.length; i++) samples[i] -= mean;
}

/** Median of an array (does not need to be sorted); mutates a local copy. */
function medianLog(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return NaN;
  const mid = n >> 1;
  return n % 2 === 1 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);
}

/**
 * Maintains a PitchDetector sized to a configurable analysis window and a
 * log-frequency EMA smoother, and exposes a push-and-read API.
 *
 * Samples are fed through an internal ring buffer so the mic can deliver
 * small low-latency chunks while detection runs on a large window. The
 * larger window is what makes low-string (baritone/drop) tracking reliable.
 *
 * - Clarity and RMS gates reject low-confidence / silent frames.
 * - Out-of-range frequencies are rejected.
 * - Passing raw frames flow through a short log-frequency median filter
 *   (the "lock-in" window). A live reading is only emitted once the window
 *   holds a tight cluster of agreeing samples; during the transient the
 *   tracker reports the previous reading as held instead of displaying the
 *   pluck wobble.
 * - When the gate trips entirely, the last good smoothed frequency is held
 *   for `holdMs` so the UI doesn't flicker to silence while a note sustains.
 */
export class PitchTracker {
  private detector: PitchDetector<Float32Array> | null = null;
  private detectorSize = 0;
  private readonly smoother: LogFrequencySmoother;
  private readonly options: Required<PitchTrackerOptions>;

  private ring: Float32Array | null = null;
  private linearBuf: Float32Array | null = null;
  private ringWrite = 0;
  private ringFilled = 0;

  private lastGoodFrequency = 0;
  private lastGoodAt = 0;
  private lastPushedAt = 0;

  // Log-frequency samples of recent passing raw detections, oldest first.
  private rawLogRing: { logF: number; t: number }[] = [];
  private locked = false;

  constructor(options: PitchTrackerOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.smoother = new LogFrequencySmoother(this.options.smoothingTauMs);
  }

  push(
    samples: Float32Array,
    sampleRate: number,
    nowMs: number = Date.now()
  ): {
    smoothed: number;
    raw: PitchSample;
    isLive: boolean;
    isHeld: boolean;
  } {
    const size = this.options.analysisSize;
    this.ensureBuffers(size);
    this.writeRing(samples);

    const dtMs = this.lastPushedAt === 0 ? 0 : nowMs - this.lastPushedAt;
    this.lastPushedAt = nowMs;

    // Not enough samples yet. Return held state if a recent good reading
    // exists (e.g. pipeline just restarted mid-note), otherwise silent.
    if (this.ringFilled < size) {
      return this.heldOrSilent(nowMs, { frequency: 0, clarity: 0, rms: 0 });
    }

    const linear = this.readLinear();
    // RMS is measured on the raw window (before DC removal) so the gate still
    // reflects actual signal level rather than AC-coupled content.
    const rms = rmsOf(linear);
    removeDc(linear);

    if (this.detectorSize !== size) {
      this.detectorSize = size;
      this.detector = PitchDetector.forFloat32Array(size);
      // This is the MPM constant `k` from McLeod & Wyvill, NOT a rejection
      // gate. pitchy walks NSDF key maxima in ascending lag order and returns
      // the first peak whose value is ≥ k * max(peak). Setting k too low
      // (e.g. 0.01) makes it lock onto the first tiny bump it sees, which on
      // low strings is almost always a short-lag noise/harmonic peak — that
      // was silently breaking low E / baritone detection because the real
      // fundamental's peak at lag=T was skipped entirely. The paper and
      // pitchy's own default recommend 0.8–0.95; 0.9 rejects sub-harmonic
      // octave errors while still tolerating a weaker-than-H2 fundamental,
      // which is exactly the low-E-on-phone-mic case.
      this.detector.clarityThreshold = 0.9;
    }

    const [frequency, clarity] = this.detector!.findPitch(linear, sampleRate);
    let normalizedFrequency = frequency;
    let octaveLifts = 0;
    // Some pluck transients come back as deep subharmonics (roughly single-digit
    // to ~15 Hz) even with strong clarity. Lift by octaves into the configured
    // range. Do not lift 20+ Hz: values just below `minFrequency` are often
    // garbage bins, not subharmonics (see unit test for sub-min noise).
    const shouldLiftSubharmonic =
      Number.isFinite(frequency) && frequency > 0 && frequency < 20;
    if (shouldLiftSubharmonic) {
      while (
        Number.isFinite(normalizedFrequency) &&
        normalizedFrequency > 0 &&
        normalizedFrequency < this.options.minFrequency &&
        octaveLifts < 8
      ) {
        normalizedFrequency *= 2;
        octaveLifts += 1;
      }
    }
    const raw: PitchSample = { frequency: normalizedFrequency, clarity, rms };

    const passes =
      rms >= this.options.minRms &&
      clarity >= this.options.clarityThreshold &&
      normalizedFrequency >= this.options.minFrequency &&
      normalizedFrequency <= this.options.maxFrequency &&
      Number.isFinite(normalizedFrequency);

    if (passes) {
      return this.handlePass(normalizedFrequency, dtMs, nowMs, raw);
    }

    return this.handleFail(nowMs, raw);
  }

  private handlePass(
    frequency: number,
    dtMs: number,
    nowMs: number,
    raw: PitchSample
  ): { smoothed: number; raw: PitchSample; isLive: boolean; isHeld: boolean } {
    const ring = this.rawLogRing;
    // Drop stale entries so the window follows real pitch changes (new
    // pluck / new note) instead of being contaminated by old samples.
    const cutoff = nowMs - this.options.lockWindowMs;
    while (ring.length > 0 && ring[0].t < cutoff) ring.shift();

    ring.push({ logF: Math.log(frequency), t: nowMs });
    while (ring.length > this.options.lockRingMax) ring.shift();

    const logs = ring.map((s) => s.logF);
    const medLog = medianLog(logs);
    // Count samples that cluster around the median. Using the median (not
    // max-min spread) as the reference means one rogue octave frame doesn't
    // pretend the ring "disagrees" when 4/5 frames actually agree — the
    // median pins to the majority and the outlier is simply ignored.
    const tolLog = (this.options.lockSpreadCents * Math.LN2) / 1200;
    let clusterCount = 0;
    for (let i = 0; i < logs.length; i++) {
      if (Math.abs(logs[i] - medLog) <= tolLog) clusterCount++;
    }
    const consensus = clusterCount >= this.options.lockMinSamples;

    if (this.locked && !consensus) {
      // The cluster has fractured (e.g. user actually switched notes and
      // the median itself has migrated). Drop lock and wait for re-consensus.
      this.locked = false;
      this.smoother.reset();
      // Drop conflicting history so harmonic flip-flops cannot deadlock the
      // lock (median sits between two groups and clusterCount never reaches
      // `lockMinSamples`). Keep only the frame we just ingested.
      if (ring.length > 1) {
        const last = ring[ring.length - 1];
        ring.length = 0;
        ring.push(last);
      }
    }

    if (!this.locked && consensus) {
      this.locked = true;
      this.smoother.reset();
    }

    if (!this.locked) {
      return this.heldOrSilent(nowMs, raw);
    }

    const median = Math.exp(medLog);
    const smoothed = this.smoother.push(median, dtMs);
    this.lastGoodFrequency = smoothed;
    this.lastGoodAt = nowMs;
    return { smoothed, raw, isLive: true, isHeld: false };
  }

  private handleFail(
    nowMs: number,
    raw: PitchSample
  ): { smoothed: number; raw: PitchSample; isLive: boolean; isHeld: boolean } {
    // A gate miss is likely either genuine silence or a sustained note
    // dipping in clarity. Don't flush the lock-in ring on a single miss;
    // let the time cutoff retire stale entries naturally on the next pass.
    if (
      this.lastGoodFrequency > 0 &&
      nowMs - this.lastGoodAt <= this.options.holdMs
    ) {
      return {
        smoothed: this.lastGoodFrequency,
        raw,
        isLive: false,
        isHeld: true,
      };
    }

    if (nowMs - this.lastGoodAt > this.options.holdMs) {
      this.smoother.reset();
      this.lastGoodFrequency = 0;
      this.rawLogRing.length = 0;
      this.locked = false;
    }
    return { smoothed: 0, raw, isLive: false, isHeld: false };
  }

  private heldOrSilent(
    nowMs: number,
    raw: PitchSample
  ): { smoothed: number; raw: PitchSample; isLive: boolean; isHeld: boolean } {
    if (
      this.lastGoodFrequency > 0 &&
      nowMs - this.lastGoodAt <= this.options.holdMs
    ) {
      return {
        smoothed: this.lastGoodFrequency,
        raw,
        isLive: false,
        isHeld: true,
      };
    }
    return { smoothed: 0, raw, isLive: false, isHeld: false };
  }

  reset() {
    this.smoother.reset();
    this.lastGoodFrequency = 0;
    this.lastGoodAt = 0;
    this.lastPushedAt = 0;
    this.ringWrite = 0;
    this.ringFilled = 0;
    this.rawLogRing.length = 0;
    this.locked = false;
    if (this.ring) this.ring.fill(0);
  }

  /**
   * Resets the ring buffer and detection state while preserving the last
   * good frequency and hold timestamp. Use this on pipeline restarts so the
   * note display stays visible (isHeld) while the ring refills.
   */
  softReset() {
    this.smoother.reset();
    this.lastPushedAt = 0;
    this.ringWrite = 0;
    this.ringFilled = 0;
    this.rawLogRing.length = 0;
    this.locked = false;
    if (this.ring) this.ring.fill(0);
  }

  private ensureBuffers(size: number) {
    if (!this.ring || this.ring.length !== size) {
      this.ring = new Float32Array(size);
      this.linearBuf = new Float32Array(size);
      this.ringWrite = 0;
      this.ringFilled = 0;
    }
  }

  private writeRing(samples: Float32Array) {
    const ring = this.ring!;
    const cap = ring.length;
    const n = samples.length;

    // Chunk is at least as large as the ring: keep only the most recent tail.
    if (n >= cap) {
      ring.set(samples.subarray(n - cap));
      this.ringWrite = 0;
      this.ringFilled = cap;
      return;
    }

    const firstRun = Math.min(n, cap - this.ringWrite);
    ring.set(samples.subarray(0, firstRun), this.ringWrite);
    const remainder = n - firstRun;
    if (remainder > 0) ring.set(samples.subarray(firstRun), 0);
    this.ringWrite = (this.ringWrite + n) % cap;
    this.ringFilled = Math.min(cap, this.ringFilled + n);
  }

  private readLinear(): Float32Array {
    const ring = this.ring!;
    const out = this.linearBuf!;
    const cap = ring.length;
    // Oldest sample is at ringWrite once the ring is full.
    const start = this.ringWrite;
    const tail = cap - start;
    out.set(ring.subarray(start), 0);
    if (start > 0) out.set(ring.subarray(0, start), tail);
    return out;
  }
}
