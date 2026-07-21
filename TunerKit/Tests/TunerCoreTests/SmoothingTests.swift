import XCTest
@testable import TunerCore

final class SmoothingTests: XCTestCase {

    func testEMAMovesTowardTarget() {
        var ema = EMASmoother(alpha: 0.25)
        _ = ema.update(0)
        for _ in 0..<50 { _ = ema.update(10) }
        XCTAssertEqual(ema.value ?? -1, 10, accuracy: 0.01)
    }

    func testMedianRejectsSingleSpike() {
        var m = MedianFilter<Int>(size: 5)
        _ = m.push(60); _ = m.push(60); _ = m.push(60); _ = m.push(60)
        let result = m.push(72)
        XCTAssertEqual(result, 60)
    }

    func testReadingSmootherRespectsClarityGate() {
        let s = ReadingSmoother()
        let raw = MPMDetector.Result(frequency: 0, clarity: 0, rms: 0)
        let reading = s.smooth(raw, a4: 440, timestamp: 0)
        XCTAssertTrue(reading.isSilent)
    }
}
