import Foundation

/// Exponential moving average for the cents display.
public struct EMASmoother {
    public var alpha: Double
    public private(set) var value: Double?

    public init(alpha: Double = TunerDefaults.centsEmaAlpha) {
        self.alpha = alpha
    }

    @discardableResult
    public mutating func update(_ x: Double) -> Double {
        if let current = value {
            let next = alpha * x + (1 - alpha) * current
            value = next
            return next
        } else {
            value = x
            return x
        }
    }

    public mutating func reset() { value = nil }
}

/// Median-of-N filter for stabilising the displayed note name against
/// single-frame octave flips.
public struct MedianFilter<T: Comparable> {
    private var buffer: [T] = []
    public let size: Int

    public init(size: Int = 5) {
        precondition(size > 0 && size % 2 == 1, "Median window must be odd and > 0")
        self.size = size
    }

    public mutating func push(_ value: T) -> T {
        buffer.append(value)
        if buffer.count > size { buffer.removeFirst() }
        return buffer.sorted()[buffer.count / 2]
    }

    public mutating func reset() { buffer.removeAll(keepingCapacity: true) }
}

/// Combines an EMA on cents + median on MIDI note + clarity-decay gate
/// to produce a display-stable `TunerReading`.
public final class ReadingSmoother {
    private var centsEMA = EMASmoother()
    private var midiMedian = MedianFilter<Int>(size: 5)
    private var lowClarityCount = 0

    public init() {}

    public func smooth(_ raw: MPMDetector.Result,
                       a4: Double,
                       timestamp: TimeInterval) -> TunerReading {
        if raw.frequency <= 0 || raw.clarity < TunerDefaults.minClarity {
            lowClarityCount += 1
            if lowClarityCount >= TunerDefaults.decayFrames {
                centsEMA.reset()
                midiMedian.reset()
            }
            return TunerReading(
                frequency: 0,
                note: Note(midi: 69, a4: a4),
                cents: 0,
                clarity: raw.clarity,
                rms: raw.rms,
                timestamp: timestamp
            )
        }
        lowClarityCount = 0

        let exact = NoteMath.midiExact(frequency: raw.frequency, a4: a4)
        let stableMidi = midiMedian.push(Int(round(exact)))
        let rawCents = 100.0 * (exact - Double(stableMidi))
        let smoothCents = centsEMA.update(rawCents)
        return TunerReading(
            frequency: raw.frequency,
            note: Note(midi: stableMidi, a4: a4),
            cents: smoothCents,
            clarity: raw.clarity,
            rms: raw.rms,
            timestamp: timestamp
        )
    }

    public func reset() {
        centsEMA.reset()
        midiMedian.reset()
        lowClarityCount = 0
    }
}
