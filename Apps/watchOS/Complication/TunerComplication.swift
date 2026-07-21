import WidgetKit
import SwiftUI

/// WidgetKit complication (ClockKit was deprecated in watchOS 9). A single
/// static entry is sufficient — the tuner's value is "launch me"; there is
/// nothing to update on a timeline.
struct TunerComplicationEntry: TimelineEntry {
    let date: Date
}

struct TunerComplicationProvider: TimelineProvider {
    func placeholder(in context: Context) -> TunerComplicationEntry {
        TunerComplicationEntry(date: .now)
    }

    func getSnapshot(in context: Context,
                     completion: @escaping (TunerComplicationEntry) -> Void) {
        completion(TunerComplicationEntry(date: .now))
    }

    func getTimeline(in context: Context,
                     completion: @escaping (Timeline<TunerComplicationEntry>) -> Void) {
        completion(Timeline(entries: [TunerComplicationEntry(date: .now)], policy: .never))
    }
}

struct TunerComplicationView: View {
    let entry: TunerComplicationEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "tuningfork")
                    .font(.title3)
            }
        case .accessoryInline:
            Label("Tuner", systemImage: "tuningfork")
        case .accessoryRectangular:
            HStack {
                Image(systemName: "tuningfork")
                    .font(.title2)
                VStack(alignment: .leading) {
                    Text("Tuner").font(.headline)
                    Text("Tap to tune").font(.caption).foregroundStyle(.secondary)
                }
            }
        default:
            Image(systemName: "tuningfork")
        }
    }
}

@main
struct TunerComplication: Widget {
    let kind: String = "TunerComplication"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TunerComplicationProvider()) { entry in
            TunerComplicationView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Tuner")
        .description("Quick-launch the chromatic tuner.")
        .supportedFamilies([.accessoryCircular, .accessoryInline, .accessoryRectangular])
    }
}
