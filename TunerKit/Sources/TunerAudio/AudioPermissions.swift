import Foundation
import AVFoundation

/// Unified microphone permission across iOS/iPadOS/watchOS/macOS.
///
/// On iOS 17 / watchOS 10 the new `AVAudioApplication` API replaces the
/// deprecated `AVAudioSession.requestRecordPermission` path. On macOS we use
/// `AVCaptureDevice.authorizationStatus(for: .audio)`.
public enum MicPermission: Sendable {
    case granted
    case denied
    case undetermined
}

public enum MicPermissions {

    public static var current: MicPermission {
        #if os(macOS)
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized: return .granted
        case .denied, .restricted: return .denied
        case .notDetermined: return .undetermined
        @unknown default: return .undetermined
        }
        #else
        if #available(iOS 17.0, watchOS 10.0, *) {
            switch AVAudioApplication.shared.recordPermission {
            case .granted: return .granted
            case .denied: return .denied
            case .undetermined: return .undetermined
            @unknown default: return .undetermined
            }
        } else {
            switch AVAudioSession.sharedInstance().recordPermission {
            case .granted: return .granted
            case .denied: return .denied
            case .undetermined: return .undetermined
            @unknown default: return .undetermined
            }
        }
        #endif
    }

    /// Requests permission; resolves on the calling task's executor.
    public static func request() async -> MicPermission {
        #if os(macOS)
        let granted = await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
            AVCaptureDevice.requestAccess(for: .audio) { cont.resume(returning: $0) }
        }
        return granted ? .granted : .denied
        #else
        if #available(iOS 17.0, watchOS 10.0, *) {
            let granted = await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
                AVAudioApplication.requestRecordPermission { cont.resume(returning: $0) }
            }
            return granted ? .granted : .denied
        } else {
            let granted = await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
                AVAudioSession.sharedInstance().requestRecordPermission { cont.resume(returning: $0) }
            }
            return granted ? .granted : .denied
        }
        #endif
    }
}
