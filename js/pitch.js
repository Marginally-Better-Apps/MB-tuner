// Port of src/audio/pitch.ts — PitchTracker with MPM (pitchy) + lock-in filter
// + hold window + log-frequency EMA. Same behavior and defaults as the RN app.

import { PitchDetector } from 'https://cdn.jsdelivr.net/npm/pitchy@4/+esm';
import { LogFrequencySmoother } from './smoothing.js';

const DEFAULTS = {
  clarityThreshold: 0.7,
  minFrequency: 30,
  maxFrequency: 1500,
  smoothingTauMs: 60,
  holdMs: 2000,
  minRms: 0.002,
  analysisSize: 4096,
  lockMinSamples: 2,
  lockSpreadCents: 35,
  lockWindowMs: 260,
  lockRingMax: 6,
};

function rmsOf(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

function removeDc(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i];
  const mean = sum / samples.length;
  if (mean === 0) return;
  for (let i = 0; i < samples.length; i++) samples[i] -= mean;
}

function medianLog(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return NaN;
  const mid = n >> 1;
  return n % 2 === 1 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);
}

export class PitchTracker {
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.smoother = new LogFrequencySmoother(this.options.smoothingTauMs);

    this.detector = null;
    this.detectorSize = 0;

    this.ring = null;
    this.linearBuf = null;
    this.ringWrite = 0;
    this.ringFilled = 0;

    this.lastGoodFrequency = 0;
    this.lastGoodAt = 0;
    this.lastPushedAt = 0;

    this.rawLogRing = [];
    this.locked = false;
  }

  push(samples, sampleRate, nowMs = Date.now()) {
    const size = this.options.analysisSize;
    this.ensureBuffers(size);
    this.writeRing(samples);

    const dtMs = this.lastPushedAt === 0 ? 0 : nowMs - this.lastPushedAt;
    this.lastPushedAt = nowMs;

    if (this.ringFilled < size) {
      return this.heldOrSilent(nowMs, { frequency: 0, clarity: 0, rms: 0 });
    }

    const linear = this.readLinear();
    const rms = rmsOf(linear);
    removeDc(linear);

    if (this.detectorSize !== size) {
      this.detectorSize = size;
      this.detector = PitchDetector.forFloat32Array(size);
      // MPM `k` constant — matches the RN port; see pitch.ts for rationale.
      this.detector.clarityThreshold = 0.9;
    }

    const [frequency, clarity] = this.detector.findPitch(linear, sampleRate);
    let normalizedFrequency = frequency;
    let octaveLifts = 0;
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
    const raw = { frequency: normalizedFrequency, clarity, rms };

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

  handlePass(frequency, dtMs, nowMs, raw) {
    const ring = this.rawLogRing;
    const cutoff = nowMs - this.options.lockWindowMs;
    while (ring.length > 0 && ring[0].t < cutoff) ring.shift();

    ring.push({ logF: Math.log(frequency), t: nowMs });
    while (ring.length > this.options.lockRingMax) ring.shift();

    const logs = ring.map((s) => s.logF);
    const medLog = medianLog(logs);
    const tolLog = (this.options.lockSpreadCents * Math.LN2) / 1200;
    let clusterCount = 0;
    for (let i = 0; i < logs.length; i++) {
      if (Math.abs(logs[i] - medLog) <= tolLog) clusterCount++;
    }
    const consensus = clusterCount >= this.options.lockMinSamples;

    if (this.locked && !consensus) {
      this.locked = false;
      this.smoother.reset();
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

  handleFail(nowMs, raw) {
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

  heldOrSilent(nowMs, raw) {
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

  softReset() {
    this.smoother.reset();
    this.lastPushedAt = 0;
    this.ringWrite = 0;
    this.ringFilled = 0;
    this.rawLogRing.length = 0;
    this.locked = false;
    if (this.ring) this.ring.fill(0);
  }

  ensureBuffers(size) {
    if (!this.ring || this.ring.length !== size) {
      this.ring = new Float32Array(size);
      this.linearBuf = new Float32Array(size);
      this.ringWrite = 0;
      this.ringFilled = 0;
    }
  }

  writeRing(samples) {
    const ring = this.ring;
    const cap = ring.length;
    const n = samples.length;

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

  readLinear() {
    const ring = this.ring;
    const out = this.linearBuf;
    const cap = ring.length;
    const start = this.ringWrite;
    const tail = cap - start;
    out.set(ring.subarray(start), 0);
    if (start > 0) out.set(ring.subarray(0, start), tail);
    return out;
  }
}
