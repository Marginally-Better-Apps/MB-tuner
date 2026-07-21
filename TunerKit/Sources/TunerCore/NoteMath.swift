import Foundation

public struct Note: Hashable, Sendable {
    public let midi: Int
    public let a4: Double

    public init(midi: Int, a4: Double = TunerDefaults.defaultA4) {
        self.midi = midi
        self.a4 = a4
    }

    public var name: String {
        Self.noteNames[((midi % 12) + 12) % 12]
    }

    public var octave: Int {
        midi / 12 - 1
    }

    public var frequency: Double {
        a4 * pow(2.0, Double(midi - 69) / 12.0)
    }

    public var displayName: String {
        "\(name)\(octave)"
    }

    public static let noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
}

public enum NoteMath {
    /// Closest MIDI note (as continuous value) for a frequency against reference A4.
    public static func midiExact(frequency: Double, a4: Double = TunerDefaults.defaultA4) -> Double {
        69.0 + 12.0 * log2(frequency / a4)
    }

    /// Rounded MIDI note number for a frequency.
    public static func midi(frequency: Double, a4: Double = TunerDefaults.defaultA4) -> Int {
        Int(round(midiExact(frequency: frequency, a4: a4)))
    }

    /// Cents deviation from the nearest equal-tempered note (-50 .. +50).
    public static func cents(frequency: Double, a4: Double = TunerDefaults.defaultA4) -> Double {
        let exact = midiExact(frequency: frequency, a4: a4)
        let nearest = Double(Int(round(exact)))
        return 100.0 * (exact - nearest)
    }

    /// Full closest note + cents deviation.
    public static func closest(frequency: Double, a4: Double = TunerDefaults.defaultA4) -> (note: Note, cents: Double) {
        let exact = midiExact(frequency: frequency, a4: a4)
        let midi = Int(round(exact))
        let cents = 100.0 * (exact - Double(midi))
        return (Note(midi: midi, a4: a4), cents)
    }

    /// Cents between any two frequencies.
    public static func cents(from a: Double, to b: Double) -> Double {
        1200.0 * log2(b / a)
    }
}

/// Standard guitar tunings.
public enum GuitarTuning: String, CaseIterable, Sendable {
    case standard   // EADGBE
    case dropD      // DADGBE
    case halfStepDown // Eb Ab Db Gb Bb Eb

    public var strings: [Note] {
        switch self {
        case .standard:
            return [40, 45, 50, 55, 59, 64].map { Note(midi: $0) }
        case .dropD:
            return [38, 45, 50, 55, 59, 64].map { Note(midi: $0) }
        case .halfStepDown:
            return [39, 44, 49, 54, 58, 63].map { Note(midi: $0) }
        }
    }
}
