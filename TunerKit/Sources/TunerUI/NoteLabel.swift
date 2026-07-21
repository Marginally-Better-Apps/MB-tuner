import SwiftUI
import TunerCore

/// Large, minimalist note readout. Letter in primary weight with a small
/// octave superscript; tint shifts only by tuning state.
public struct NoteLabel: View {
    public let reading: TunerReading
    public var fontSize: CGFloat

    public init(reading: TunerReading, fontSize: CGFloat = 104) {
        self.reading = reading
        self.fontSize = fontSize
    }

    public var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(reading.isSilent ? "—" : reading.note.name)
                .font(.system(size: fontSize, weight: .light, design: .rounded))
                .kerning(-2)
                .monospacedDigit()
                .foregroundStyle(TuningColors.tintColor(for: reading))

            if !reading.isSilent {
                Text("\(reading.note.octave)")
                    .font(.system(size: fontSize * 0.38, weight: .regular, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(TuningColors.primary.opacity(0.45))
            }
        }
        .contentTransition(.numericText())
        .animation(.snappy(duration: 0.12), value: reading.note.displayName)
    }
}
