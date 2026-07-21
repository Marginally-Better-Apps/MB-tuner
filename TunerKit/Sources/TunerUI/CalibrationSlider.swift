import SwiftUI
import TunerAudio

/// A4 reference calibration slider, styled to match the tuner palette.
public struct CalibrationSlider: View {
    @Bindable public var engine: TunerEngine

    public init(engine: TunerEngine) {
        self.engine = engine
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Reference A4")
                    .font(.caption.weight(.medium))
                    .tracking(0.6)
                    .foregroundStyle(TuningColors.textMuted)
                Spacer()
                Text(String(format: "%.1f Hz", engine.referenceA))
                    .font(.system(.caption, design: .monospaced).weight(.semibold))
                    .foregroundStyle(TuningColors.primary)
            }
            Slider(value: $engine.referenceA, in: 440...445, step: 0.1)
                .tint(TuningColors.accent)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(TuningColors.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(TuningColors.hairline, lineWidth: 1)
                )
        )
        .padding(.horizontal)
    }
}
