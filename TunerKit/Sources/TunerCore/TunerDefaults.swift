import Foundation

public enum TunerDefaults {
    /// Default analysis window (samples). ~85 ms at 48 kHz, ~7 periods of low-E (82.41 Hz).
    public static let analysisWindow: Int = 4096

    /// Default hop size between analysis frames (samples). 75% overlap with 4096 window.
    public static let hopSize: Int = 1024

    /// Threshold constant `k` for MPM first-key-maximum rule (McLeod 2005).
    public static let mpmThreshold: Double = 0.93

    /// RMS level below which we treat the signal as silence.
    public static let silenceRMS: Float = 0.005

    /// NSDF clarity below which we ignore a candidate frequency.
    public static let minClarity: Double = 0.85

    /// Plausibility range for a 6-string guitar (60 Hz .. 1400 Hz).
    public static let minFrequency: Double = 60.0
    public static let maxFrequency: Double = 1400.0

    /// Default reference frequency for A4.
    public static let defaultA4: Double = 440.0

    /// EMA smoothing factor for cents display.
    public static let centsEmaAlpha: Double = 0.25

    /// Frames of sustained clarity loss before we declare "decaying / silent".
    public static let decayFrames: Int = 3
}
