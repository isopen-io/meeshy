import Foundation
import WidgetKit

enum WidgetRefreshSchedule {
    static let conversationsInterval: TimeInterval = 1800
    static let favoritesInterval: TimeInterval = 3600

    static func timeline<E: TimelineEntry>(single entry: E, now: Date, interval: TimeInterval) -> Timeline<E> {
        Timeline(entries: [entry], policy: .after(now.addingTimeInterval(interval)))
    }
}
