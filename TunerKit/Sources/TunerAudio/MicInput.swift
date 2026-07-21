import Foundation
import AVFoundation
import TunerCore

/// Live microphone capture via AVAudioEngine with `.measurement` mode
/// (on iOS/iPadOS/watchOS) and mono-downmix inside the tap closure.
///
/// Crucial correctness invariants:
///   1. The tap format *must* match `inputNode.outputFormat(forBus: 0)`
///      read after AVAudioSession is active (iOS/watchOS) or after mic
///      permission has been granted (macOS). Otherwise
///      `IsFormatSampleRateAndChannelCountValid` asserts.
///   2. `.measurement` disables AGC, the ~80 Hz high-pass, noise
///      suppression, and echo cancellation — essential for low-E.
///   3. Route/config changes silently flip hardware rate; we observe
///      the notifications and reinstall the tap.
public final class MicInput: AudioInput, @unchecked Sendable {
    public private(set) var sampleRate: Double = 48_000

    private let engine = AVAudioEngine()
    private var onBuffer: (@Sendable (UnsafePointer<Float>, Int, Double) -> Void)?
    private var observers: [NSObjectProtocol] = []
    private var isRunning = false
    private var isSuspended = false
    private let bufferSize: AVAudioFrameCount

    public init(bufferSize: AVAudioFrameCount = AVAudioFrameCount(TunerDefaults.analysisWindow)) {
        self.bufferSize = bufferSize
    }

    deinit {
        for token in observers {
            NotificationCenter.default.removeObserver(token)
        }
    }

    public func start(onBuffer: @escaping @Sendable (UnsafePointer<Float>, Int, Double) -> Void) throws {
        self.onBuffer = onBuffer
        try configureSession()
        try configureEngine()
        try engine.start()
        isRunning = true
        installObservers()
    }

    public func stop() {
        isRunning = false
        for token in observers {
            NotificationCenter.default.removeObserver(token)
        }
        observers.removeAll()
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()

        #if os(iOS) || os(watchOS)
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        #endif
    }

    // MARK: - Session (iOS + watchOS only)

    private func configureSession() throws {
        #if os(iOS) || os(watchOS)
        let s = AVAudioSession.sharedInstance()
        try s.setCategory(.record, mode: .measurement, options: [.mixWithOthers])
        try s.setPreferredSampleRate(48_000)
        try s.setPreferredIOBufferDuration(0.005)
        try s.setActive(true)
        #endif
    }

    private func configureEngine() throws {
        let input = engine.inputNode

        // Best-effort: turn off any Apple-provided voice processing (redundant
        // with `.measurement` on iOS; no-op on watchOS; relevant for macOS).
        #if !os(watchOS)
        try? input.setVoiceProcessingEnabled(false)
        #endif

        let hwFormat = input.outputFormat(forBus: 0)
        guard hwFormat.sampleRate > 0, hwFormat.channelCount > 0 else {
            throw NSError(domain: "MicInput", code: -10,
                          userInfo: [NSLocalizedDescriptionKey:
                                     "Input format unavailable. Check mic permission & audio session."])
        }
        sampleRate = hwFormat.sampleRate

        let sr = hwFormat.sampleRate
        let channelCount = Int(hwFormat.channelCount)

        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: bufferSize, format: hwFormat) { [weak self] buffer, _ in
            guard let self, let cb = self.onBuffer,
                  let chData = buffer.floatChannelData else { return }
            let frames = Int(buffer.frameLength)
            if channelCount == 1 {
                cb(chData[0], frames, sr)
            } else {
                // Mono-downmix inside the tap to avoid allocating another
                // AVAudioConverter pipeline on the realtime thread. The
                // downmix scratch buffer is allocated once per tap install.
                let scratch = MicInput.sharedScratch(for: frames)
                let inv = 1.0 / Float(channelCount)
                for f in 0..<frames {
                    var sum: Float = 0
                    for c in 0..<channelCount { sum += chData[c][f] }
                    scratch[f] = sum * inv
                }
                cb(scratch, frames, sr)
            }
        }

        engine.prepare()
    }

    // Shared scratch buffer for mono downmix (single-producer = the tap thread).
    private static var scratchBuffer: UnsafeMutablePointer<Float>?
    private static var scratchCapacity: Int = 0
    private static let scratchLock = NSLock()

    fileprivate static func sharedScratch(for frames: Int) -> UnsafeMutablePointer<Float> {
        scratchLock.lock(); defer { scratchLock.unlock() }
        if frames > scratchCapacity {
            scratchBuffer?.deallocate()
            scratchBuffer = UnsafeMutablePointer<Float>.allocate(capacity: frames)
            scratchCapacity = frames
        }
        return scratchBuffer!
    }

    // MARK: - Notifications

    private func installObservers() {
        let nc = NotificationCenter.default

        #if os(iOS) || os(watchOS)
        observers.append(nc.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: nil, queue: .main) { [weak self] note in
                guard let self else { return }
                guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                      let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
                switch type {
                case .began:
                    self.isSuspended = true
                case .ended:
                    if let optRaw = note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt {
                        let options = AVAudioSession.InterruptionOptions(rawValue: optRaw)
                        if options.contains(.shouldResume) {
                            self.resumeAfterChange()
                        }
                    }
                @unknown default:
                    break
                }
            })

        observers.append(nc.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: nil, queue: .main) { [weak self] _ in
                self?.handleRouteChange()
            })

        observers.append(nc.addObserver(
            forName: AVAudioSession.mediaServicesWereResetNotification,
            object: nil, queue: .main) { [weak self] _ in
                self?.handleMediaServicesReset()
            })
        #endif

        observers.append(nc.addObserver(
            forName: .AVAudioEngineConfigurationChange,
            object: engine, queue: .main) { [weak self] _ in
                self?.handleConfigurationChange()
            })
    }

    private func handleRouteChange() {
        guard isRunning else { return }
        reinstallTap()
    }

    private func handleConfigurationChange() {
        guard isRunning, !isSuspended else { return }
        reinstallTap()
    }

    private func handleMediaServicesReset() {
        guard isRunning else { return }
        engine.stop()
        engine.reset()
        do {
            try configureSession()
            try configureEngine()
            try engine.start()
        } catch {
            isRunning = false
        }
    }

    private func resumeAfterChange() {
        isSuspended = false
        guard isRunning else { return }
        do {
            try configureSession()
            if !engine.isRunning {
                try engine.start()
            }
        } catch {
            isRunning = false
        }
    }

    private func reinstallTap() {
        do {
            engine.inputNode.removeTap(onBus: 0)
            try configureEngine()
            if !engine.isRunning {
                try engine.start()
            }
        } catch {
            isRunning = false
        }
    }
}
