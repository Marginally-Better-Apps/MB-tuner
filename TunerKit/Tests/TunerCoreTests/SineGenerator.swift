import Foundation

enum SineGenerator {
    static func generate(frequency: Double,
                         sampleRate: Double,
                         count: Int,
                         amplitude: Float = 0.5,
                         phase: Double = 0) -> [Float] {
        var out = [Float](repeating: 0, count: count)
        let w = 2.0 * .pi * frequency / sampleRate
        for n in 0..<count {
            out[n] = amplitude * Float(sin(Double(n) * w + phase))
        }
        return out
    }

    static func harmonicGuitar(fundamental: Double,
                               sampleRate: Double,
                               count: Int,
                               amplitude: Float = 0.4) -> [Float] {
        // Rough guitar-string model: strong fundamental, decreasing partials,
        // a slight second-harmonic boost (typical for plucked steel strings).
        let harmonics: [(mult: Double, amp: Float)] = [
            (1, 1.0), (2, 0.85), (3, 0.55), (4, 0.35), (5, 0.20), (6, 0.12)
        ]
        var out = [Float](repeating: 0, count: count)
        let twoPiOverSR = 2.0 * .pi / sampleRate
        for (mult, amp) in harmonics {
            let w = fundamental * mult * twoPiOverSR
            for n in 0..<count {
                out[n] += amplitude * amp * Float(sin(Double(n) * w))
            }
        }
        return out
    }
}
