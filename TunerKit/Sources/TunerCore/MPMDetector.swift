import Foundation
import Accelerate

/// McLeod Pitch Method (McLeod & Wyvill, ICMC 2005).
///
/// Computes the Normalized Square Difference Function
///     n'(τ) = 2·r'(τ) / m'(τ)
/// where r'(τ) is the Type-II windowed autocorrelation (via FFT, Wiener-
/// Khinchin) and m'(τ) is the running-sum energy term, then picks the first
/// key maximum whose NSDF value is at least `k · max(key_maxima)`. Parabolic
/// interpolation refines the lag for sub-sample precision.
///
/// All hot-path buffers are preallocated; no allocations occur per detect.
public final class MPMDetector {

    public struct Result: Sendable, Equatable {
        public let frequency: Double
        public let clarity: Double
        public let rms: Float

        public static let none = Result(frequency: 0, clarity: 0, rms: 0)
    }

    public let windowSize: Int
    public let sampleRate: Double
    public let threshold: Double
    public let minFrequency: Double
    public let maxFrequency: Double

    private let log2n: vDSP_Length
    private let fftSize: Int
    private let fftSetup: FFTSetup

    private var realp: [Float]
    private var imagp: [Float]
    private var paddedInput: [Float]
    private var autocorr: [Float]
    private var nsdf: [Float]

    public init(windowSize: Int = TunerDefaults.analysisWindow,
                sampleRate: Double,
                threshold: Double = TunerDefaults.mpmThreshold,
                minFrequency: Double = TunerDefaults.minFrequency,
                maxFrequency: Double = TunerDefaults.maxFrequency) {
        self.windowSize = windowSize
        self.sampleRate = sampleRate
        self.threshold = threshold
        self.minFrequency = minFrequency
        self.maxFrequency = maxFrequency

        // FFT size must be power of two >= 2N to avoid circular wraparound.
        var fft = 1
        while fft < windowSize * 2 { fft <<= 1 }
        self.fftSize = fft
        self.log2n = vDSP_Length(log2(Double(fft)).rounded())

        guard let setup = vDSP_create_fftsetup(log2n, Int32(kFFTRadix2)) else {
            fatalError("vDSP_create_fftsetup failed for size \(fft)")
        }
        self.fftSetup = setup

        self.realp = [Float](repeating: 0, count: fft / 2)
        self.imagp = [Float](repeating: 0, count: fft / 2)
        self.paddedInput = [Float](repeating: 0, count: fft)
        self.autocorr = [Float](repeating: 0, count: fft)
        self.nsdf = [Float](repeating: 0, count: windowSize)
    }

    deinit {
        vDSP_destroy_fftsetup(fftSetup)
    }

    /// Detect pitch from a mono Float32 buffer of at least `windowSize` samples.
    public func detect(_ samples: UnsafePointer<Float>, count: Int) -> Result {
        precondition(count >= windowSize, "Buffer must be at least windowSize long")

        // RMS silence gate -----------------------------------------------------
        var rms: Float = 0
        vDSP_rmsqv(samples, 1, &rms, vDSP_Length(windowSize))
        if rms < TunerDefaults.silenceRMS {
            return Result(frequency: 0, clarity: 0, rms: rms)
        }

        // Autocorrelation via FFT (Wiener-Khinchin) ---------------------------
        paddedInput.withUnsafeMutableBufferPointer { p in
            memset(p.baseAddress, 0, fftSize * MemoryLayout<Float>.size)
            memcpy(p.baseAddress, samples, windowSize * MemoryLayout<Float>.size)
        }

        realp.withUnsafeMutableBufferPointer { rP in
            imagp.withUnsafeMutableBufferPointer { iP in
                var split = DSPSplitComplex(realp: rP.baseAddress!, imagp: iP.baseAddress!)

                // Pack real time-domain samples into split-complex (interleaved halves).
                paddedInput.withUnsafeBufferPointer { inBuf in
                    inBuf.baseAddress!.withMemoryRebound(to: DSPComplex.self,
                                                        capacity: fftSize / 2) { cptr in
                        vDSP_ctoz(cptr, 2, &split, 1, vDSP_Length(fftSize / 2))
                    }
                }

                // Forward FFT.
                vDSP_fft_zrip(fftSetup, &split, 1, log2n, FFTDirection(FFT_FORWARD))

                // Power spectrum (zrip packing: realp[0]=DC, imagp[0]=Nyquist).
                let n = fftSize / 2
                let dc = rP[0]
                let nyq = iP[0]
                rP[0] = dc * dc
                iP[0] = nyq * nyq
                for k in 1..<n {
                    let re = rP[k]
                    let im = iP[k]
                    rP[k] = re * re + im * im
                    iP[k] = 0
                }

                // Inverse FFT -> real autocorrelation packed into split complex.
                vDSP_fft_zrip(fftSetup, &split, 1, log2n, FFTDirection(FFT_INVERSE))

                // Unpack split-complex back to a contiguous real array.
                autocorr.withUnsafeMutableBufferPointer { ac in
                    ac.baseAddress!.withMemoryRebound(to: DSPComplex.self,
                                                     capacity: fftSize / 2) { cptr in
                        vDSP_ztoc(&split, 1, cptr, 2, vDSP_Length(fftSize / 2))
                    }
                }
            }
        }

        // vDSP zrip IFFT is unscaled; divide by (2 * fftSize) for true amplitude.
        var scale = Float(1.0 / Float(2 * fftSize))
        autocorr.withUnsafeMutableBufferPointer { buf in
            vDSP_vsmul(buf.baseAddress!, 1, &scale, buf.baseAddress!, 1, vDSP_Length(windowSize))
        }

        // m'(τ) running energy term (McLeod 2005 recurrence) -------------------
        // m'(0) = 2·Σ x[i]² for i in 0..<W
        // m'(τ) = m'(τ-1) − x[τ-1]² − x[W-τ]²
        var energy: Float = 0
        vDSP_svesq(samples, 1, &energy, vDSP_Length(windowSize))
        var mPrime = 2.0 * energy

        nsdf[0] = 0
        for tau in 1..<windowSize {
            let drop1 = samples[tau - 1]
            let drop2 = samples[windowSize - tau]
            mPrime -= drop1 * drop1
            mPrime -= drop2 * drop2
            let m = max(mPrime, 1e-9)
            nsdf[tau] = 2 * autocorr[tau] / m
        }

        // Key maxima + first-good-enough peak ----------------------------------
        let minTau = max(2, Int(floor(sampleRate / maxFrequency)))
        let maxTau = min(windowSize - 2, Int(ceil(sampleRate / minFrequency)))
        guard maxTau > minTau else { return Result(frequency: 0, clarity: 0, rms: rms) }

        var keyMaxima: [(tau: Int, value: Float)] = []
        keyMaxima.reserveCapacity(64)

        var tau = minTau
        // NSDF starts near 1 at τ=0 and descends through the first zero crossing;
        // skip until we enter a negative region before looking for a positive run.
        while tau < maxTau && nsdf[tau] > 0 { tau += 1 }
        while tau < maxTau {
            while tau < maxTau && nsdf[tau] <= 0 { tau += 1 }
            guard tau < maxTau else { break }
            var localTau = tau
            var localVal = nsdf[tau]
            while tau < maxTau && nsdf[tau] > 0 {
                if nsdf[tau] > localVal {
                    localVal = nsdf[tau]
                    localTau = tau
                }
                tau += 1
            }
            keyMaxima.append((localTau, localVal))
        }

        guard !keyMaxima.isEmpty else { return Result(frequency: 0, clarity: 0, rms: rms) }

        let highest = keyMaxima.map(\.value).max() ?? 0
        guard highest > 0 else { return Result(frequency: 0, clarity: 0, rms: rms) }

        let cutoff = Float(threshold) * highest
        guard let chosen = keyMaxima.first(where: { $0.value >= cutoff }) else {
            return Result(frequency: 0, clarity: 0, rms: rms)
        }

        let refinedTau = parabolicInterpolate(tau: chosen.tau)
        guard refinedTau > 0 else { return Result(frequency: 0, clarity: 0, rms: rms) }

        let frequency = sampleRate / refinedTau
        guard frequency >= minFrequency && frequency <= maxFrequency else {
            return Result(frequency: 0, clarity: 0, rms: rms)
        }

        let clarity = min(max(Double(chosen.value), 0), 1)
        return Result(frequency: frequency, clarity: clarity, rms: rms)
    }

    private func parabolicInterpolate(tau: Int) -> Double {
        guard tau > 0 && tau < windowSize - 1 else { return Double(tau) }
        let y1 = Double(nsdf[tau - 1])
        let y2 = Double(nsdf[tau])
        let y3 = Double(nsdf[tau + 1])
        let denom = 2.0 * (2.0 * y2 - y1 - y3)
        guard abs(denom) > 1e-12 else { return Double(tau) }
        let delta = (y3 - y1) / denom
        return Double(tau) + delta
    }
}
