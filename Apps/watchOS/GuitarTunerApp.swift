import SwiftUI
import TunerAudio

@main
struct GuitarTunerApp: App {
    @State private var engine = TunerEngine()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            WatchTunerView()
                .environment(engine)
                .onChange(of: scenePhase) { _, phase in
                    // Stop the engine whenever the wrist drops or the app
                    // moves out of foreground — microphone + DSP is a heavy
                    // battery combo on Apple Watch.
                    if phase != .active {
                        engine.stop()
                    }
                }
        }
    }
}
