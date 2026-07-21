import Foundation
import AVFoundation
import TunerCore

/// Plays back an AVAudioFile at real-time pace, invoking the buffer callback
/// with ~`hopSize` sample chunks. Used by unit tests, CI, and the watchOS
/// Simulator (which has no microphone).
public final class FileInput: AudioInput, @unchecked Sendable {
    private let file: AVAudioFile
    private let hopSize: Int
    private var timerTask: Task<Void, Never>?

    public let sampleRate: Double

    public init(url: URL, hopSize: Int = TunerDefaults.hopSize) throws {
        let f = try AVAudioFile(forReading: url)
        self.file = f
        self.sampleRate = f.processingFormat.sampleRate
        self.hopSize = hopSize
    }

    public func start(onBuffer: @escaping @Sendable (UnsafePointer<Float>, Int, Double) -> Void) throws {
        let fmt = file.processingFormat
        let hopFrames = AVAudioFrameCount(hopSize)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: hopFrames) else {
            throw NSError(domain: "FileInput", code: -1)
        }

        let intervalNs = UInt64(Double(hopSize) / sampleRate * 1_000_000_000)
        let sr = sampleRate
        let src = file

        timerTask = Task.detached(priority: .userInitiated) { [weak self] in
            while let self, !Task.isCancelled {
                buffer.frameLength = 0
                do {
                    try src.read(into: buffer, frameCount: hopFrames)
                } catch {
                    return
                }
                if buffer.frameLength == 0 { return }
                let count = Int(buffer.frameLength)
                if let ch = buffer.floatChannelData?[0] {
                    onBuffer(ch, count, sr)
                }
                _ = self
                try? await Task.sleep(nanoseconds: intervalNs)
            }
        }
    }

    public func stop() {
        timerTask?.cancel()
        timerTask = nil
    }
}
