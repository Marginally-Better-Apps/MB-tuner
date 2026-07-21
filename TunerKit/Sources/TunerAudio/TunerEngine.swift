import Foundation
import AVFoundation
import Observation
import TunerCore

/// Main-actor, `@Observable` facade that UI code binds to. Internally owns:
///   • an `AudioInput` (mic on device, file in tests)
///   • a `FloatRingBuffer` written by the realtime tap
///   • a background analysis task (non-main actor) running MPM + smoothing
///   • a `ReadingSmoother` producing display-stable cents/notes
///
/// `@Observable` does NOT infer `@MainActor`, so we annotate explicitly —
/// otherwise `reading` could be mutated from the audio thread.
@Observable
@MainActor
public final class TunerEngine {

    public private(set) var reading: TunerReading = .silent
    public private(set) var state: State = .idle
    public var referenceA: Double = TunerDefaults.defaultA4 {
        didSet {
            if referenceA != oldValue {
                smoother.reset()
                tunerLog(String(format: "Reference A4 set to %.1f Hz", referenceA),
                         level: .debug)
            }
        }
    }

    public enum State: Equatable, Sendable {
        case idle
        case requestingPermission
        case denied
        case running
        case failed(String)
    }

    @ObservationIgnored private var audioInput: AudioInput?
    @ObservationIgnored private let smoother = ReadingSmoother()
    @ObservationIgnored private var detector: MPMDetector?
    @ObservationIgnored private var ring: FloatRingBuffer?
    @ObservationIgnored private var analysisTask: Task<Void, Never>?
    @ObservationIgnored private let inputFactory: @Sendable () -> AudioInput
    @ObservationIgnored private let windowSize: Int
    @ObservationIgnored private let hopSize: Int

    public init(inputFactory: @escaping @Sendable () -> AudioInput = { MicInput() },
                windowSize: Int = TunerDefaults.analysisWindow,
                hopSize: Int = TunerDefaults.hopSize) {
        self.inputFactory = inputFactory
        self.windowSize = windowSize
        self.hopSize = hopSize
    }

    public func start() async {
        guard state != .running else { return }
        tunerLog("Engine start requested", level: .info)

        switch MicPermissions.current {
        case .granted:
            break
        case .denied:
            state = .denied
            tunerLog("Microphone permission denied", level: .warning)
            return
        case .undetermined:
            state = .requestingPermission
            tunerLog("Requesting microphone permission", level: .info)
            let result = await MicPermissions.request()
            if result != .granted {
                state = .denied
                tunerLog("Microphone permission not granted", level: .warning)
                return
            }
        }

        do {
            let input = inputFactory()
            let ring = FloatRingBuffer(capacity: max(windowSize * 4, 16_384))
            self.ring = ring

            try input.start { [ring] ptr, count, _ in
                ring.write(ptr, count: count)
            }
            self.audioInput = input

            let detector = MPMDetector(windowSize: windowSize,
                                       sampleRate: input.sampleRate)
            self.detector = detector
            launchAnalysis(detector: detector, ring: ring, sampleRate: input.sampleRate)
            state = .running
            tunerLog(String(format: "Engine running @ %.0f Hz (A4=%.1f)",
                            input.sampleRate, referenceA), level: .info)
        } catch {
            state = .failed(error.localizedDescription)
            tunerLog("Engine start failed: \(error.localizedDescription)",
                     level: .error)
        }
    }

    public func stop() {
        analysisTask?.cancel()
        analysisTask = nil
        audioInput?.stop()
        audioInput = nil
        detector = nil
        ring?.reset()
        ring = nil
        smoother.reset()
        reading = .silent
        let wasRunning = state == .running
        state = .idle
        if wasRunning {
            tunerLog("Engine stopped", level: .info)
        }
    }

    // MARK: - Analysis loop

    private func launchAnalysis(detector: MPMDetector,
                                ring: FloatRingBuffer,
                                sampleRate: Double) {
        analysisTask?.cancel()
        let windowSize = self.windowSize
        let hopSize = self.hopSize
        let intervalNs = UInt64(Double(hopSize) / sampleRate * 1_000_000_000)

        analysisTask = Task.detached(priority: .userInitiated) { [weak self] in
            let scratch = UnsafeMutablePointer<Float>.allocate(capacity: windowSize)
            defer { scratch.deallocate() }

            while !Task.isCancelled {
                if ring.available >= windowSize,
                   ring.peek(into: scratch, count: windowSize) {
                    ring.advance(hopSize)
                    let raw = detector.detect(scratch, count: windowSize)
                    let now = ProcessInfo.processInfo.systemUptime
                    let a4 = await self?.referenceA ?? TunerDefaults.defaultA4
                    let smoothed = await self?.smooth(raw: raw, a4: a4, timestamp: now)
                    if let smoothed {
                        await self?.publish(smoothed)
                    }
                } else {
                    try? await Task.sleep(nanoseconds: intervalNs)
                }
            }
        }
    }

    private func smooth(raw: MPMDetector.Result, a4: Double, timestamp: TimeInterval) -> TunerReading {
        smoother.smooth(raw, a4: a4, timestamp: timestamp)
    }

    private func publish(_ reading: TunerReading) {
        self.reading = reading
    }
}
