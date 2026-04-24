import { LogFrequencySmoother } from '../smoothing';

describe('LogFrequencySmoother', () => {
  it('locks to the first sample', () => {
    const s = new LogFrequencySmoother(100);
    expect(s.push(440, 16)).toBeCloseTo(440);
  });

  it('approaches target asymptotically in the log domain', () => {
    const s = new LogFrequencySmoother(60);
    s.push(440, 16);
    // Step up half a semitone.
    const target = 440 * Math.pow(2, 0.5 / 12);
    let out = 0;
    for (let i = 0; i < 20; i++) out = s.push(target, 16);
    expect(Math.abs(out - target) / target).toBeLessThan(0.001);
  });

  it('decays symmetrically up and down', () => {
    const up = new LogFrequencySmoother(80);
    const down = new LogFrequencySmoother(80);
    up.push(440, 16);
    down.push(440, 16);
    const upOut = up.push(440 * 1.05, 16);
    const downOut = down.push(440 / 1.05, 16);
    // Ratios vs the anchor should be mirror images on a log scale.
    const upRatio = upOut / 440;
    const downRatio = 440 / downOut;
    expect(upRatio).toBeCloseTo(downRatio, 6);
  });

  it('resets', () => {
    const s = new LogFrequencySmoother(80);
    s.push(440, 16);
    s.reset();
    expect(s.push(880, 16)).toBeCloseTo(880);
  });

  it('peek returns null before the first sample and tracks the EMA', () => {
    const s = new LogFrequencySmoother(100);
    expect(s.peek()).toBeNull();
    s.push(440, 16);
    expect(s.peek()).toBeCloseTo(440);
    s.push(880, 16);
    expect(s.peek()).not.toBeCloseTo(440);
  });

  it('honors a per-step tau override (slower step moves less)', () => {
    const s = new LogFrequencySmoother(100);
    s.push(440, 100);
    const fast = s.push(880, 100);
    s.reset();
    s.push(440, 100);
    const slow = s.push(880, 100, 800);
    expect(Math.abs(slow - 440)).toBeLessThan(Math.abs(fast - 440));
  });
});
