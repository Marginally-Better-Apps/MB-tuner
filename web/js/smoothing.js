// Port of src/tuning/smoothing.ts — log-frequency EMA.

export class LogFrequencySmoother {
  constructor(tauMs = 120) {
    this.tauMs = tauMs;
    this.logF = null;
  }

  peek() {
    return this.logF === null ? null : Math.exp(this.logF);
  }

  push(frequency, dtMs, tauMsOverride) {
    const lf = Math.log(frequency);
    if (this.logF === null) {
      this.logF = lf;
      return frequency;
    }
    const tau = tauMsOverride ?? this.tauMs;
    const alpha = 1 - Math.exp(-Math.max(0, dtMs) / tau);
    this.logF = this.logF + alpha * (lf - this.logF);
    return Math.exp(this.logF);
  }

  reset() {
    this.logF = null;
  }
}
