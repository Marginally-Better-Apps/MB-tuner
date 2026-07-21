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
            .navigationTitle("Tuner")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        SettingsScreen(engine: engine)
                    } label: {
                        Image(systemName: "slider.horizontal.3")
                            .font(.system(size: 17, weight: .medium))
                            .foregroundStyle(TuningColors.primary)
                    }
                    .accessibilityLabel("Settings")
                }
            }
            .toolbarBackground(TuningColors.background, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
        }
        .tint(TuningColors.primary)
    }
}

/// Pushed settings screen. Tuning is stopped on appear — the user
/// restarts detection explicitly when they return.
private struct SettingsScreen: View {
    let engine: TunerEngine

    var body: some View {
        SettingsContentView(engine: engine)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(TuningColors.background, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .onAppear {
                engine.stop()
            }
    }
}
