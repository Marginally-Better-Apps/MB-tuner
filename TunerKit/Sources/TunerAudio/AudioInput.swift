import Foundation
import AVFoundation

/// Abstract audio source. Production uses `MicInput`; tests and CI use
/// `FileInput` to replay fixed WAV fixtures through the same pipeline.
public protocol AudioInput: AnyObject, Sendable {
    var sampleRate: Double { get }
    func start(onBuffer: @escaping @Sendable (UnsafePointer<Float>, Int, Double) -> Void) throws
    func stop()
}
