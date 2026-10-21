import XCTest
import WidgetKit

final class WidgetRefreshScheduleTests: XCTestCase {

    private struct StubEntry: TimelineEntry {
        let date: Date
    }

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    func test_conversationsTimeline_holdsOneEntryAtNow_andReloadsThirtyMinutesLater() {
        let timeline = WidgetRefreshSchedule.timeline(
            single: StubEntry(date: now),
            now: now,
            interval: WidgetRefreshSchedule.conversationsInterval
        )

        XCTAssertEqual(timeline.entries.count, 1)
        XCTAssertEqual(timeline.entries.first?.date, now)
        XCTAssertEqual(timeline.policy, .after(now.addingTimeInterval(1800)))
    }

    func test_favoritesTimeline_keepsItsHourlyReload() {
        let timeline = WidgetRefreshSchedule.timeline(
            single: StubEntry(date: now),
            now: now,
            interval: WidgetRefreshSchedule.favoritesInterval
        )

        XCTAssertEqual(timeline.policy, .after(now.addingTimeInterval(3600)))
    }
}
