import SwiftUI
import TunerCore

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// Scrollable list of recent log entries from `TunerLog.shared`.
/// Newest entries appear on top; the buffer is capped by the store so older
/// entries fall off automatically.
public struct DebugLogView: View {
    @Bindable private var log = TunerLog.shared

    public init() {}

    public var body: some View {
        ZStack {
            TuningColors.background.ignoresSafeArea()

            if log.entries.isEmpty {
                emptyState
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(log.entries.reversed()) { entry in
                            row(entry)
                            Rectangle()
                                .fill(TuningColors.hairline)
                                .frame(height: 1)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
            }
        }
        .navigationTitle("Debug logs")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button {
                    copyLogs()
                } label: {
                    Label("Copy", systemImage: "doc.on.doc")
                }
                .disabled(log.entries.isEmpty)

                Button(role: .destructive) {
                    log.clear()
                } label: {
                    Label("Clear", systemImage: "trash")
                }
                .disabled(log.entries.isEmpty)
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "ladybug")
                .font(.system(size: 32, weight: .light))
                .foregroundStyle(TuningColors.primary.opacity(0.5))
            Text("No log entries yet")
                .font(.system(.body, design: .rounded))
                .foregroundStyle(TuningColors.textBody)
            Text("Logs are capped at \(log.capacity) entries.")
                .font(.footnote)
                .foregroundStyle(TuningColors.textFaint)
        }
        .padding(24)
    }

    @ViewBuilder
    private func row(_ entry: TunerLog.Entry) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: entry.level.symbol)
                .font(.footnote)
                .foregroundStyle(color(for: entry.level))
                .frame(width: 16)
                .padding(.top, 2)

            VStack(alignment: .leading, spacing: 2) {
                Text(entry.message)
                    .font(.system(.footnote, design: .monospaced))
                    .foregroundStyle(TuningColors.textBody)
                    .textSelection(.enabled)
                Text(Self.timestampFormatter.string(from: entry.date))
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(TuningColors.textFaint)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 8)
    }

    private func color(for level: TunerLog.Level) -> Color {
        switch level {
        case .debug:   return TuningColors.textFaint
        case .info:    return TuningColors.textMuted
        case .warning: return TuningColors.primary
        case .error:   return .red
        }
    }

    private func copyLogs() {
        let text = log.exportText()
        #if canImport(UIKit)
        UIPasteboard.general.string = text
        #elseif canImport(AppKit)
        let pb = NSPasteboard.general
        pb.clearContents()
        pb.setString(text, forType: .string)
        #endif
    }

    private static let timestampFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss.SSS"
        return f
    }()
}
