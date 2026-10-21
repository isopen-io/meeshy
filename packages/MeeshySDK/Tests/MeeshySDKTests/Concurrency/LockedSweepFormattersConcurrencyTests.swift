import XCTest
@testable import MeeshySDK

private func calendar(offsetHours: Int) -> Calendar {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: offsetHours * 3_600) ?? .gmt
    return calendar
}

final class LockedSweepFormattersConcurrencyTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_790_000_000)
    private let past = Date(timeIntervalSince1970: 1_790_000_000 - 40 * 86_400)

    func test_notificationFormat_concurrentAlternatingTimeZones_eachCallUsesItsOwnZone() async {
        let zones = [calendar(offsetHours: 0), calendar(offsetHours: 5)]
        let now = now
        let past = past
        let expected = zones.map { NotificationDateFormatter.string(for: past, now: now, calendar: $0) }
        XCTAssertNotEqual(expected[0], expected[1])

        let results = await withTaskGroup(of: (Int, String).self, returning: [(Int, String)].self) { group in
            for index in 0..<600 {
                group.addTask {
                    (index % 2, NotificationDateFormatter.string(for: past, now: now, calendar: zones[index % 2]))
                }
            }
            return await group.reduce(into: []) { $0.append($1) }
        }

        XCTAssertTrue(results.allSatisfy { $0.1 == expected[$0.0] })
    }

    func test_relativeFormat_concurrentAlternatingTimeZones_eachCallUsesItsOwnZone() async {
        let zones = [calendar(offsetHours: 0), calendar(offsetHours: 5)]
        let now = now
        let past = past
        let expected = zones.map { RelativeTimeFormatter.lastSeenString(for: past, now: now, calendar: $0) }
        XCTAssertNotEqual(expected[0], expected[1])

        let results = await withTaskGroup(of: (Int, String).self, returning: [(Int, String)].self) { group in
            for index in 0..<600 {
                group.addTask {
                    (index % 2, RelativeTimeFormatter.lastSeenString(for: past, now: now, calendar: zones[index % 2]))
                }
            }
            return await group.reduce(into: []) { $0.append($1) }
        }

        XCTAssertTrue(results.allSatisfy { $0.1 == expected[$0.0] })
    }

    func test_timeStringCache_concurrentFormat_matchesSequentialReference() async {
        let dates = (0..<24).map { Date(timeIntervalSince1970: 1_790_000_000 + Double($0) * 3_600) }
        let expected = dates.map { TimeStringCache.shared.format($0) }

        let results = await withTaskGroup(of: (Int, String).self, returning: [(Int, String)].self) { group in
            for index in 0..<600 {
                group.addTask { (index % dates.count, TimeStringCache.shared.format(dates[index % dates.count])) }
            }
            return await group.reduce(into: []) { $0.append($1) }
        }

        XCTAssertTrue(results.allSatisfy { $0.1 == expected[$0.0] })
    }
}
