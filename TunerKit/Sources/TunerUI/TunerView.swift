import SwiftUI
import TunerCore
import TunerAudio

/// Full tuner surface: needle, note label, cents readout, frequency and
/// start/stop affordance. Used as-is on iOS/iPadOS/macOS; watchOS has a
/// compact sibling view.
///
/// Visual language:
///   - Flat background (`TuningColors.background`)
///   - Deep primary text, accent used only for active / in-tune moments
///   - Heavy use of monospaced + rounded fonts for calm, technical feel
public struct TunerView: View {
    @Bindable public var engine: TunerEngine

    public init(engine: TunerEngine) {
        self.engine = engine
    }

    public var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 28) {
                NeedleMeter(reading: engine.reading)
                    .frame(maxWidth: 440)
                    .aspectRatio(2.0, contentMode: .fit)
                    .padding(.top, 8)

                NoteLabel(reading: engine.reading)

                VStack(spacing: 6) {
                    Text(centsText)
                        .font(.system(.title3, design: .rounded).monospacedDigit().weight(.medium))
                        .foregroundStyle(TuningColors.tintColor(for: engine.reading))
                        .animation(.snappy(duration: 0.12), value: engine.reading.cents)

                    Text(frequencyText)
                        .font(.system(.footnote, design: .monospaced))
                        .tracking(0.5)
                        .foregroundStyle(TuningColors.textMuted)
                }

                CentsBar(reading: engine.reading)
                    .frame(maxWidth: 360)
                    .padding(.horizontal, 8)
            }

            Spacer(minLength: 28)

            controls
                .padding(.bottom, 8)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(TunerBackground())
        .task {
            if engine.state == .idle {
                await engine.start()
            }
        }
    }

    private var centsText: String {
        guard !engine.reading.isSilent else { return "—  ¢" }
        let sign = engine.reading.cents >= 0 ? "+" : ""
        return "\(sign)\(Int(round(engine.reading.cents)))  ¢"
    }

    private var frequencyText: String {
        guard !engine.reading.isSilent else { return "—  Hz" }
        return String(format: "%.1f  Hz", engine.reading.frequency)
    }

    @ViewBuilder private var controls: some View {
        switch engine.state {
        case .idle:
            PrimaryButton(title: "Start Tuning", systemImage: "tuningfork") {
                Task { await engine.start() }
            }

        case .requestingPermission:
            HStack(spacing: 10) {
                ProgressView()
                    .controlSize(.small)
                    .tint(TuningColors.primary)
                Text("Requesting microphone…")
                    .font(.footnote)
                    .foregroundStyle(TuningColors.textMuted)
            }

        case .denied:
            VStack(spacing: 10) {
                Image(systemName: "mic.slash")
                    .font(.title2)
                    .foregroundStyle(TuningColors.muted)
                Text("Microphone access is required to detect pitch.")
                    .font(.footnote)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(TuningColors.textMuted)
                #if os(iOS)
                SecondaryButton(title: "Open Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                }
                #endif
            }
            .frame(maxWidth: 320)

        case .running:
            SecondaryButton(title: "Stop", systemImage: "stop.fill") {
                engine.stop()
            }

        case .failed(let message):
            VStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle")
                    .foregroundStyle(TuningColors.primary)
                Text(message)
                    .font(.footnote)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(TuningColors.textMuted)
                SecondaryButton(title: "Retry") { Task { await engine.start() } }
            }
        }
    }
}

// MARK: - Buttons

/// Filled pill button tinted with `primary`. Used for the main action.
public struct PrimaryButton: View {
    let title: String
    let systemImage: String?
    let action: () -> Void

    public init(title: String, systemImage: String? = nil, action: @escaping () -> Void) {
        self.title = title
        self.systemImage = systemImage
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let systemImage {
                    Image(systemName: systemImage)
                }
                Text(title)
            }
            .font(.system(.headline, design: .rounded).weight(.semibold))
            .foregroundStyle(TuningColors.background)
            .padding(.horizontal, 24)
            .padding(.vertical, 14)
            .frame(minWidth: 180)
            .background(
                Capsule().fill(TuningColors.primary)
            )
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// Outlined pill button. Used for "Stop", "Retry", etc.
public struct SecondaryButton: View {
    let title: String
    let systemImage: String?
    let action: () -> Void

    public init(title: String, systemImage: String? = nil, action: @escaping () -> Void) {
        self.title = title
        self.systemImage = systemImage
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let systemImage {
                    Image(systemName: systemImage)
                }
                Text(title)
            }
            .font(.system(.subheadline, design: .rounded).weight(.semibold))
            .foregroundStyle(TuningColors.primary)
            .padding(.horizontal, 22)
            .padding(.vertical, 12)
            .frame(minWidth: 140)
            .background(
                ZStack {
                    Capsule().fill(TuningColors.wash)
                    Capsule().stroke(TuningColors.primary.opacity(0.28), lineWidth: 1)
                }
            )
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

#if canImport(UIKit)
import UIKit
#endif
