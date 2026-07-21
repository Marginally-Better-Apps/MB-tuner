import Foundation
@testable import TunerAudio
import TunerCore

/// In-memory `AudioInput` that replays a synthetic sample array at a chosen
/// sample rate. Used to exercise the full `TunerEngine` pipeline in tests
/// without touching AVAudioEngine, AVAudioSession, or the microphone. This
/// is the same abstraction real apps use to run on the watchOS Simulator
/// (which has no mic) and on CI.
final class FixtureInput: AudioInput, @unchecked Sendable {
    let sampleRate: Double
    private let samples: [Float]
    private let chunk: Int
    private var task: Task<Void, Never>?

    init(samples: [Float], sampleRate: Double, chunk: Int = 1024) {
        self.samples = samples
        self.sampleRate = sampleRate
        self.chunk = chunk
    }

    func start(onBuffer: @escaping @Sendable (UnsafePointer<Float>, Int, Double) -> Void) throws {
        let samples = self.samples
        let chunk = self.chunk
        let sr = self.sampleRate
        let intervalNs = UInt64(Double(chunk) / sr * 1_000_000_000)

        task = Task.detached(priority: .userInitiated) {
            var i = 0
            while !Task.isCancelled {
                let remaining = samples.count - i
                if remaining <= 0 { i = 0; continue } // loop indefinitely
                let take = min(chunk, remaining)
                samples.withUnsafeBufferPointer { buf in
                    onBuffer(buf.baseAddress!.advanced(by: i), take, sr)
                }
                i += take
                try? await Task.sleep(nanoseconds: intervalNs)
            }
        }
    }

    func stop() {
        task?.cancel()
        task = nil
    }
}
