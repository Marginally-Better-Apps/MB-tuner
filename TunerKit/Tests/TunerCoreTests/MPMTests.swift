import XCTest
@testable import TunerCore

final class MPMTests: XCTestCase {

    func testA4SineAt44100() throws {
        let sr = 44_100.0
        let det = MPMDetector(windowSize: 4096, sampleRate: sr)
        let samples = SineGenerator.generate(frequency: 440.0, sampleRate: sr, count: 4096)
        let r = samples.withUnsafeBufferPointer { det.detect($0.baseAddress!, count: 4096) }
        XCTAssertGreaterThan(r.clarity, 0.9)
        XCTAssertEqual(r.frequency, 440.0, accuracy: cents(1, at: 440))
    }

    func testLowEAt48000() throws {
        let sr = 48_000.0
        let det = MPMDetector(windowSize: 4096, sampleRate: sr)
        let samples = SineGenerator.generate(frequency: 82.41, sampleRate: sr, count: 4096)
        let r = samples.withUnsafeBufferPointer { det.detect($0.baseAddress!, count: 4096) }
        XCTAssertGreaterThan(r.clarity, 0.9)
        XCTAssertEqual(r.frequency, 82.41, accuracy: cents(3, at: 82.41))
    }

    func testHarmonicGuitarLowE() throws {
        // The key test: strong 2nd harmonic tries to trick autocorrelation
        // into reporting E3 (164.8 Hz). MPM's first-key-max rule should pick
        // the low E fundamental.
        let sr = 48_000.0
        let det = MPMDetector(windowSize: 4096, sampleRate: sr)
        let samples = SineGenerator.harmonicGuitar(fundamental: 82.41, sampleRate: sr, count: 4096)
        let r = samples.withUnsafeBufferPointer { det.detect($0.baseAddress!, count: 4096) }
        XCTAssertGreaterThan(r.clarity, 0.85)
        XCTAssertEqual(r.frequency, 82.41, accuracy: cents(5, at: 82.41))
    }

    func testStandardGuitarStrings() throws {
        let sr = 48_000.0
        let det = MPMDetector(windowSize: 4096, sampleRate: sr)
        let strings: [Double] = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63]
        for f in strings {
            let samples = SineGenerator.harmonicGuitar(fundamental: f, sampleRate: sr, count: 4096)
            let r = samples.withUnsafeBufferPointer { det.detect($0.baseAddress!, count: 4096) }
            XCTAssertGreaterThan(r.clarity, 0.85, "clarity low at \(f) Hz")
            XCTAssertEqual(r.frequency, f, accuracy: cents(5, at: f),
                           "frequency off at \(f) Hz: got \(r.frequency)")
        }
    }

    func testSilenceReturnsZero() throws {
        let sr = 48_000.0
        let det = MPMDetector(windowSize: 4096, sampleRate: sr)
        let samples = [Float](repeating: 0, count: 4096)
        let r = samples.withUnsafeBufferPointer { det.detect($0.baseAddress!, count: 4096) }
        XCTAssertEqual(r.frequency, 0)
        XCTAssertEqual(r.clarity, 0)
    }

    func testNoiseDoesNotProduceConfidentPitch() throws {
        let sr = 48_000.0
        let det = MPMDetector(windowSize: 4096, sampleRate: sr)
        var rng = SystemRandomNumberGenerator()
        var samples = [Float]()
        samples.reserveCapacity(4096)
        for _ in 0..<4096 {
            samples.append(Float.random(in: -0.3...0.3, using: &rng))
        }
        let r = samples.withUnsafeBufferPointer { det.detect($0.baseAddress!, count: 4096) }
        // Either no frequency, or clarity well below the musical threshold.
        XCTAssertTrue(r.frequency == 0 || r.clarity < 0.9,
                      "noise falsely detected at \(r.frequency) Hz with clarity \(r.clarity)")
    }

    func testMultiplePhasesStillAccurate() throws {
        let sr = 44_100.0
        let det = MPMDetector(windowSize: 4096, sampleRate: sr)
        let f = 220.0
        for phase in stride(from: 0.0, to: .pi * 2, by: .pi / 7) {
            let samples = SineGenerator.generate(frequency: f, sampleRate: sr, count: 4096, phase: phase)
            let r = samples.withUnsafeBufferPointer { det.detect($0.baseAddress!, count: 4096) }
            XCTAssertEqual(r.frequency, f, accuracy: cents(2, at: f),
                           "phase \(phase) broke detection")
        }
    }

    // MARK: - helpers

    /// Convert a cents tolerance into an absolute Hz tolerance at a given frequency.
    private func cents(_ cents: Double, at f: Double) -> Double {
        f * (pow(2.0, cents / 1200.0) - 1.0)
    }
}
