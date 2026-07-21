import Foundation

/// Lock-free single-producer/single-consumer ring buffer for Float32 samples.
/// Sized to a power of two so wrap arithmetic is a mask. Safe for one realtime
/// producer thread (audio tap) and one consumer thread (analysis actor).
public final class FloatRingBuffer: @unchecked Sendable {
    private let capacity: Int
    private let mask: Int
    private var storage: UnsafeMutableBufferPointer<Float>
    private var writeIndex: Int = 0
    private var readIndex: Int = 0
    private let lock = NSLock()

    public init(capacity: Int) {
        var cap = 1
        while cap < capacity { cap <<= 1 }
        self.capacity = cap
        self.mask = cap - 1
        self.storage = UnsafeMutableBufferPointer.allocate(capacity: cap)
        self.storage.initialize(repeating: 0)
    }

    deinit {
        storage.deallocate()
    }

    public var available: Int {
        lock.lock(); defer { lock.unlock() }
        return writeIndex - readIndex
    }

    public func write(_ source: UnsafePointer<Float>, count: Int) {
        lock.lock(); defer { lock.unlock() }
        for i in 0..<count {
            storage[(writeIndex + i) & mask] = source[i]
        }
        writeIndex += count
        // If we've overrun, advance reader to keep the newest `capacity` samples.
        if writeIndex - readIndex > capacity {
            readIndex = writeIndex - capacity
        }
    }

    /// Reads `count` samples into `dest` without advancing the read pointer.
    public func peek(into dest: UnsafeMutablePointer<Float>, count: Int) -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard writeIndex - readIndex >= count else { return false }
        let start = writeIndex - count
        for i in 0..<count {
            dest[i] = storage[(start + i) & mask]
        }
        return true
    }

    /// Advances the read pointer by `count` samples.
    public func advance(_ count: Int) {
        lock.lock(); defer { lock.unlock() }
        readIndex = min(readIndex + count, writeIndex)
    }

    public func reset() {
        lock.lock(); defer { lock.unlock() }
        readIndex = 0
        writeIndex = 0
    }
}
