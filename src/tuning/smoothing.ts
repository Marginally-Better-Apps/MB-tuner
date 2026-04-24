/**
 * Exponential moving average in the log-frequency domain so that flat and
 * sharp deviations decay symmetrically and octave jumps behave predictably.
 *
 * tauMs is the time constant; alpha per sample is derived from dtMs / tauMs.
 */
export class LogFrequencySmoother {
  private logF: number | null = null;

  constructor(private readonly tauMs: number = 120) {}

  /** Current EMA estimate without ingesting a new sample (null before first push). */
  peek(): number | null {
    return this.logF === null ? null : Math.exp(this.logF);
  }

  /**
   * @param tauMsOverride — optional time constant for this step only (e.g. slower
   *   smoothing during the attack phase of a pluck).
   */
  push(frequency: number, dtMs: number, tauMsOverride?: number): number {
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
