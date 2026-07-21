import XCTest
@testable import TunerAudio
@testable import TunerCore

final class PipelineTests: XCTestCase {

    /// End-to-end: fixture input → ring buffer → MPM → smoother → `TunerReading`.
    /// Replays a synthetic harmonic guitar A4 and waits for the engine to
    /// converge on A4 ±5 cents.
    @MainActor
    func testEngineConvergesOnA4() async throws {
        let sr = 48_000.0
        let samples = makeHarmonic(fundamental: 440, sampleRate: sr, seconds: 2)
        let engine = TunerEngine(
            inputFactory: { FixtureInput(samples: samples, sampleRate: sr) }
        )

        await engine.start()
        XCTAssertEqual(engine.state, .running)

        // Poll up to 2 s for a good reading.
        var good: TunerReading?
        for _ in 0..<40 {
            try? await Task.sleep(nanoseconds: 50_000_000)
            if !engine.reading.isSilent && engine.reading.clarity > 0.9 {
                good = engine.reading
                break
            }
        }
        engine.stop()

        let reading = try XCTUnwrap(good, "engine never produced a confident reading")
        XCTAssertEqual(reading.note.displayName, "A4")
        XCTAssertLessThan(abs(reading.cents), 5)
    }

    /// Parity check: guitar low-E (the textbook failure case for raw
    /// autocorrelation) must produce E2, not E3.
    @MainActor
    func testLowEPipelineParity() async throws {
        let sr = 48_000.0
        let samples = makeHarmonic(fundamental: 82.41, sampleRate: sr, seconds: 2)
        let engine = TunerEngine(
            inputFactory: { FixtureInput(samples: samples, sampleRate: sr) }
        )
        await engine.start()

        var good: TunerReading?
        for _ in 0..<60 {
            try? await Task.sleep(nanoseconds: 50_000_000)
            if !engine.reading.isSilent && engine.reading.clarity > 0.85 {
                good = engine.reading
                break
            }
        }
        engine.stop()

        let reading = try XCTUnwrap(good)
        XCTAssertEqual(reading.note.displayName, "E2",
                       "Expected E2 (82.4 Hz) but got \(reading.note.displayName) @ \(reading.frequency) Hz")
    }

    /// Latency/throughput budget: MPM on a 4096-sample buffer must finish
    /// well under the 46 ms budget for a 2048-sample hop at 44.1 kHz. The
    /// target is <10 ms per detect on modern Apple silicon.
    func testDetectorThroughput() {
        let sr = 48_000.0
        let det = MPMDetector(windowSize: 4096, sampleRate: sr)
        let samples = makeHarmonic(fundamental: 220, sampleRate: sr, seconds: 0.1)

        let iterations = 50
        let start = ProcessInfo.processInfo.systemUptime
        samples.withUnsafeBufferPointer { buf in
            for _ in 0..<iterations {
                _ = det.detect(buf.baseAddress!, count: 4096)
            }
        }
        let elapsed = ProcessInfo.processInfo.systemUptime - start
        let perCallMs = elapsed / Double(iterations) * 1000.0
        print("MPM per-call latency: \(String(format: "%.2f", perCallMs)) ms")
        XCTAssertLessThan(perCallMs, 20.0,
                          "MPM too slow: \(perCallMs) ms per call")
    }

    // MARK: - helpers

    private func makeHarmonic(fundamental: Double,
                              sampleRate: Double,
                              seconds: Double,
                              amplitude: Float = 0.4) -> [Float] {
        let count = Int(sampleRate * seconds)
        var out = [Float](repeating: 0, count: count)
        let harmonics: [(Double, Float)] = [
            (1, 1.0), (2, 0.85), (3, 0.55), (4, 0.35), (5, 0.2), (6, 0.12)
        ]
        let twoPiOverSR = 2.0 * .pi / sampleRate
        for (m, a) in harmonics {
            let w = fundamental * m * twoPiOverSR
            for n in 0..<count {
                out[n] += amplitude * a * Float(sin(Double(n) * w))
            }
        }
        return out
    }
}
