import Foundation
import Observation

/// In-memory ring-buffer log store shared across the app.
///
/// Writes are cheap and safe from any actor via the static `log` helpers;
/// observers (SwiftUI views) must read `shared.entries` from the main actor.
/// Storage is capped at `capacity` entries — oldest entries are dropped first
/// so memory stays bounded regardless of session length.
@Observable
@MainActor
public final class TunerLog {
    public static let shared = TunerLog()

    public struct Entry: Identifiable, Sendable, Hashable {
        public let id: UUID
        public let date: Date
        public let level: Level
        public let message: String

        public init(id: UUID = UUID(), date: Date = Date(), level: Level, message: String) {
            self.id = id
            self.date = date
            self.level = level
            self.message = message
        }
    }

    public enum Level: String, Sendable, CaseIterable {
        case debug, info, warning, error

        public var symbol: String {
            switch self {
            case .debug:   return "ant"
            case .info:    return "info.circle"
            case .warning: return "exclamationmark.triangle"
            case .error:   return "xmark.octagon"
            }
        }
    }

    /// Maximum number of entries retained in memory. Older entries are dropped.
    public let capacity: Int

    public private(set) var entries: [Entry] = []

    public init(capacity: Int = 500) {
        self.capacity = max(16, capacity)
    }

    public func append(_ entry: Entry) {
        entries.append(entry)
        if entries.count > capacity {
            entries.removeFirst(entries.count - capacity)
        }
    }

    public func clear() {
        entries.removeAll(keepingCapacity: true)
    }

    /// Concatenated plain-text representation of the current buffer, suitable
    /// for copy/share.
    public func exportText() -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return entries.map { entry in
            "[\(formatter.string(from: entry.date))] \(entry.level.rawValue.uppercased()): \(entry.message)"
        }.joined(separator: "\n")
    }
}

// MARK: - Global helpers

/// Thread-safe fire-and-forget logging usable from any actor or queue.
/// The entry is appended on the main actor to keep the observable store
/// single-writer.
public func tunerLog(_ message: String,
                     level: TunerLog.Level = .info) {
    let entry = TunerLog.Entry(level: level, message: message)
    Task { @MainActor in
        TunerLog.shared.append(entry)
    }
}
