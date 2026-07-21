import Foundation

public struct TunerReading: Sendable, Equatable {
    public let frequency: Double
    public let note: Note
    public let cents: Double
    public let clarity: Double
    public let rms: Float
    public let timestamp: TimeInterval

    public init(frequency: Double,
                note: Note,
                cents: Double,
                clarity: Double,
                rms: Float,
                timestamp: TimeInterval) {
        self.frequency = frequency
        self.note = note
        self.cents = cents
        self.clarity = clarity
        self.rms = rms
        self.timestamp = timestamp
    }

    public static let silent = TunerReading(
        frequency: 0,
        note: Note(midi: 69),
        cents: 0,
        clarity: 0,
        rms: 0,
        timestamp: 0
    )

    public var isSilent: Bool {
        clarity < TunerDefaults.minClarity || frequency <= 0
    }

    public var isInTune: Bool {
        !isSilent && abs(cents) <= 5.0
    }
}
