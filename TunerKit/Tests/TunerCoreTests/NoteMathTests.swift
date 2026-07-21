import XCTest
@testable import TunerCore

final class NoteMathTests: XCTestCase {

    func testA4Exact() {
        let (note, cents) = NoteMath.closest(frequency: 440)
        XCTAssertEqual(note.midi, 69)
        XCTAssertEqual(note.name, "A")
        XCTAssertEqual(note.octave, 4)
        XCTAssertEqual(cents, 0, accuracy: 1e-9)
    }

    func testMiddleC() {
        let (note, _) = NoteMath.closest(frequency: 261.6255653)
        XCTAssertEqual(note.midi, 60)
        XCTAssertEqual(note.name, "C")
        XCTAssertEqual(note.octave, 4)
    }

    func testLowEStrings() {
        let (e2, e2c) = NoteMath.closest(frequency: 82.4068892)
        XCTAssertEqual(e2.midi, 40)
        XCTAssertEqual(e2.name, "E")
        XCTAssertEqual(e2.octave, 2)
        XCTAssertEqual(e2c, 0, accuracy: 0.01)
    }

    func testCentsArithmetic() {
        // 12-tet: 100 cents between consecutive semitones.
        let deltaSemitone = NoteMath.cents(from: 440, to: 466.163762)
        XCTAssertEqual(deltaSemitone, 100, accuracy: 0.01)

        // An octave is 1200 cents.
        XCTAssertEqual(NoteMath.cents(from: 220, to: 440), 1200, accuracy: 0.01)
    }

    func testSharpReadings() {
        // +10 cents above A4
        let sharp = 440.0 * pow(2.0, 10.0 / 1200.0)
        let (note, cents) = NoteMath.closest(frequency: sharp)
        XCTAssertEqual(note.midi, 69)
        XCTAssertEqual(cents, 10, accuracy: 0.01)
    }

    func testStandardGuitarTuning() {
        let strings = GuitarTuning.standard.strings
        XCTAssertEqual(strings.map(\.displayName), ["E2", "A2", "D3", "G3", "B3", "E4"])
    }

    func testCustomA4Reference() {
        // 442 Hz reference — A4 should still be MIDI 69 but with 0 cents deviation.
        let (note, cents) = NoteMath.closest(frequency: 442, a4: 442)
        XCTAssertEqual(note.midi, 69)
        XCTAssertEqual(cents, 0, accuracy: 1e-9)
    }
}
