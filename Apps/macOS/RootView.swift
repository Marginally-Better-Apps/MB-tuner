import SwiftUI
import TunerAudio
import TunerUI

struct RootView: View {
    @Environment(TunerEngine.self) private var engine

    var body: some View {
        NavigationStack {
            ZStack {
                TunerBackground()
                TunerView(engine: engine)
            }
            .frame(minWidth: 460, minHeight: 620)
            .navigationTitle("Tuner")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    NavigationLink {
                        SettingsScreen(engine: engine)
                    } label: {
                        Image(systemName: "slider.horizontal.3")
                    }
                    .help("Settings")
                    .accessibilityLabel("Settings")
                }
            }
        }
        .tint(TuningColors.primary)
    }
}

/// Pushed settings screen. Tuning is stopped on appear so opening
/// Settings always pauses pitch detection — the user restarts it
/// explicitly when they come back.
private struct SettingsScreen: View {
    let engine: TunerEngine

    var body: some View {
        SettingsContentView(engine: engine)
            .navigationTitle("Settings")
            .onAppear {
                engine.stop()
            }
    }
}

/// Hosted by the macOS `Settings { … }` scene via Cmd+,. Provides the
/// same surface as the pushed screen but sized for the Settings window.
struct SettingsView: View {
    @Bindable var engine: TunerEngine

    var body: some View {
        NavigationStack {
            SettingsContentView(engine: engine)
        }
        .frame(width: 420, height: 520)
        .tint(TuningColors.primary)
    }
}
