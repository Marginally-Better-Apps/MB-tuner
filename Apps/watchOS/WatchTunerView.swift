import SwiftUI
import TunerCore
import TunerAudio
import TunerUI

/// Compact tuner surface sized for Apple Watch. Reuses `NeedleMeter` from
/// `TunerUI` but provides a watch-specific layout, Digital Crown A4
/// calibration, and an auto-stop-on-silence heuristic to protect battery.
struct WatchTunerView: View {
    @Environment(TunerEngine.self) private var engine
    @State private var idleSeconds = 0
    private let autoStopAfterSilenceSeconds = 45

    private let silenceTick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        @Bindable var engineBindable = engine

        ZStack {
            TunerBackground()

            VStack(spacing: 6) {
                NeedleMeter(reading: engine.reading)
                    .frame(height: 70)

                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(engine.reading.isSilent ? "—" : engine.reading.note.name)
                        .font(.system(size: 42, weight: .light, design: .rounded))
                        .kerning(-1)
                        .foregroundStyle(TuningColors.tintColor(for: engine.reading))
                    if !engine.reading.isSilent {
                        Text("\(engine.reading.note.octave)")
                            .font(.system(size: 16, weight: .regular, design: .rounded))
                            .foregroundStyle(TuningColors.primary.opacity(0.5))
                    }
                }

                Text(centsText)
                    .font(.system(.caption, design: .monospaced).weight(.medium))
                    .foregroundStyle(TuningColors.tintColor(for: engine.reading))

                controls
            }
            .padding(.horizontal, 6)
        }
        .tint(TuningColors.primary)
        .focusable()
        .digitalCrownRotation(
            $engineBindable.referenceA,
            from: 415.0,
            through: 466.0,
            by: 0.1,
            sensitivity: .medium,
            isHapticFeedbackEnabled: true
        )
        .task {
            if engine.state == .idle {
                await engine.start()
            }
        }
        .onReceive(silenceTick) { _ in
            if engine.state == .running && engine.reading.isSilent {
                idleSeconds += 1
                if idleSeconds >= autoStopAfterSilenceSeconds {
                    engine.stop()
                    idleSeconds = 0
                }
            } else {
                idleSeconds = 0
            }
        }
    }

    private var centsText: String {
        guard !engine.reading.isSilent else { return "— ¢" }
        let sign = engine.reading.cents >= 0 ? "+" : ""
        return "\(sign)\(Int(round(engine.reading.cents))) ¢"
    }

    @ViewBuilder private var controls: some View {
        switch engine.state {
        case .idle:
            Button("Start") { Task { await engine.start() } }
                .buttonStyle(.borderedProminent)
                .tint(TuningColors.primary)
                .controlSize(.small)

        case .requestingPermission:
            ProgressView()
                .controlSize(.small)
                .tint(TuningColors.primary)

        case .denied:
            VStack(spacing: 2) {
                Image(systemName: "mic.slash")
                    .foregroundStyle(TuningColors.muted)
                Text("Enable microphone in the iPhone Watch app.")
                    .font(.caption2)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(TuningColors.textMuted)
            }

        case .running:
            Button("Stop") { engine.stop() }
                .buttonStyle(.bordered)
                .tint(TuningColors.primary)
                .controlSize(.mini)

        case .failed:
            Button("Retry") { Task { await engine.start() } }
                .buttonStyle(.bordered)
                .tint(TuningColors.primary)
                .controlSize(.mini)
        }
    }
}
