import SwiftUI
import TunerAudio
import TunerUI

@main
struct GuitarTunerApp: App {
    @State private var engine = TunerEngine()

    var body: some Scene {
        WindowGroup("Tuner") {
            RootView()
                .environment(engine)
                .frame(minWidth: 460, minHeight: 620)
                .preferredAppTheme()
        }
        .windowResizability(.contentSize)
        .defaultSize(width: 500, height: 680)
        .commands {
            CommandGroup(replacing: .appInfo) {
                Button("About GuitarTuner") {
                    NSApp.orderFrontStandardAboutPanel()
                }
            }
        }

        Settings {
            SettingsView(engine: engine)
                .frame(width: 340)
                .preferredAppTheme()
        }
    }
}
