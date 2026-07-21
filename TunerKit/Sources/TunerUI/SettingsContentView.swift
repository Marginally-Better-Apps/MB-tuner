import SwiftUI
import TunerAudio
import TunerCore

/// Shared settings content used on iOS and macOS.
///
/// Embed this inside a `NavigationStack` — the "Debug logs" row pushes
/// a `DebugLogView`, so navigation context is required.
public struct SettingsContentView: View {
    @Bindable public var engine: TunerEngine

    public init(engine: TunerEngine) {
        self.engine = engine
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                sectionHeader("Appearance")
                DarkModeToggle()
                    .padding(18)
                    .background(card)

                sectionHeader("Reference")
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("A4")
                            .font(.system(.body, design: .rounded).weight(.medium))
                            .foregroundStyle(TuningColors.textBody)
                        Spacer()
                        Text(String(format: "%.1f Hz", engine.referenceA))
                            .font(.system(.body, design: .monospaced))
                            .foregroundStyle(TuningColors.primary)
                    }
                    Slider(value: $engine.referenceA,
                           in: 440...445,
                           step: 0.1) {
                        Text("Reference A4")
                    } minimumValueLabel: {
                        Text("440")
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(TuningColors.textFaint)
                    } maximumValueLabel: {
                        Text("445")
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(TuningColors.textFaint)
                    }
                    .tint(TuningColors.accent)
                }
                .padding(18)
                .background(card)

                sectionHeader("About")
                VStack(spacing: 0) {
                    row("Version", AppVersion.short)
                    divider
                    row("Build", AppVersion.build)
                    divider
                    row("Algorithm", "McLeod Pitch Method")
                    divider
                    row("Window", "4096 samples")
                    divider
                    row("Privacy", "All on-device")
                }
                .background(card)

                sectionHeader("Diagnostics")
                VStack(spacing: 0) {
                    NavigationLink {
                        DebugLogView()
                    } label: {
                        HStack {
                            Label("Debug logs", systemImage: "ladybug")
                                .font(.system(.body, design: .rounded))
                                .foregroundStyle(TuningColors.textBody)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(TuningColors.textFaint)
                        }
                        .padding(.horizontal, 18)
                        .padding(.vertical, 14)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                .background(card)
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(TuningColors.background.ignoresSafeArea())
    }

    // MARK: - Styling helpers

    private var card: some View {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(TuningColors.surface)
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(TuningColors.hairline, lineWidth: 1)
            )
    }

    private var divider: some View {
        Rectangle()
            .fill(TuningColors.hairline)
            .frame(height: 1)
            .padding(.leading, 18)
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title.uppercased())
            .font(.caption.weight(.semibold))
            .tracking(1.2)
            .foregroundStyle(TuningColors.primary.opacity(0.7))
            .padding(.leading, 4)
    }

    private func row(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title)
                .font(.system(.body, design: .rounded))
                .foregroundStyle(TuningColors.textBody)
            Spacer()
            Text(value)
                .font(.system(.body, design: .monospaced))
                .foregroundStyle(TuningColors.textMuted)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
    }
}

// MARK: - App version lookup

public enum AppVersion {
    public static var short: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—"
    }

    public static var build: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "—"
    }

    public static var full: String {
        "\(short) (\(build))"
    }
}
