import SwiftUI
import TunerCore

/// Slim horizontal cents bar with a centered tick, a faint in-tune band
/// and a single dot indicator.
public struct CentsBar: View {
    public let reading: TunerReading
    public var range: Double = 50

    public init(reading: TunerReading, range: Double = 50) {
        self.reading = reading
        self.range = range
    }

    public var body: some View {
        GeometryReader { geo in
            let width = geo.size.width
            let height = geo.size.height
            let center = width / 2
            let clamped = max(-range, min(range, reading.cents))
            let x = center + CGFloat(clamped / range) * (width / 2)

            ZStack {
                // Track
                Capsule()
                    .fill(TuningColors.text.opacity(0.08))
                    .frame(height: 3)

                // In-tune zone
                Capsule()
                    .fill(TuningColors.accent.opacity(0.45))
                    .frame(width: width * CGFloat(10 / (2 * range)), height: 3)

                // Center tick
                Rectangle()
                    .fill(TuningColors.primary.opacity(0.55))
                    .frame(width: 1, height: height * 0.6)
                    .position(x: center, y: height / 2)

                // Indicator
                Circle()
                    .fill(TuningColors.tintColor(for: reading))
                    .frame(width: height, height: height)
                    .overlay(
                        Circle()
                            .stroke(TuningColors.background, lineWidth: 2)
                    )
                    .position(x: reading.isSilent ? center : x, y: height / 2)
                    .opacity(reading.isSilent ? 0.35 : 1.0)
                    .animation(.snappy(duration: 0.08), value: reading.cents)
            }
        }
        .frame(height: 14)
    }
}
