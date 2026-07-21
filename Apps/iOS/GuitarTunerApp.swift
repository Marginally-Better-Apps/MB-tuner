import SwiftUI
import TunerAudio
import TunerUI

@main
struct GuitarTunerApp: App {
    @State private var engine = TunerEngine()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(engine)
                .preferredAppTheme()
                .task {
                    UIApplication.shared.isIdleTimerDisabled = true
                }
                .onChange(of: scenePhase) { _, phase in
                    switch phase {
                    case .active:
                        UIApplication.shared.isIdleTimerDisabled = true
                    case .inactive, .background:
                        engine.stop()
                        UIApplication.shared.isIdleTimerDisabled = false
                    @unknown default:
                        break
                    }
                }
        }
    }
}
