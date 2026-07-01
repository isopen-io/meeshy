import Foundation
import Testing
@testable import MeeshySDK

struct RelativeTimeFormatterTests {
    // Deterministic UTC calendar so day boundaries ("hier", day deltas) and the
    // absolute fallback are stable regardless of the test machine's time zone.
    private func utc() -> Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }

    private func at(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 12, _ min: Int = 0, cal: Calendar) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: d, hour: h, minute: min))!
    }

    // MARK: - Short

    @Test func short_underThirtySeconds_isJustNow() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        #expect(RelativeTimeFormatter.shortString(for: now.addingTimeInterval(-20), now: now) == "maintenant")
    }

    @Test func short_seconds() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        #expect(RelativeTimeFormatter.shortString(for: now.addingTimeInterval(-45), now: now) == "45s")
    }

    @Test func short_minutes() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        #expect(RelativeTimeFormatter.shortString(for: now.addingTimeInterval(-5 * 60), now: now) == "5 min")
    }

    @Test func short_hours() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        #expect(RelativeTimeFormatter.shortString(for: now.addingTimeInterval(-2 * 3_600), now: now) == "2h")
    }

    @Test func short_days() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        #expect(RelativeTimeFormatter.shortString(for: now.addingTimeInterval(-3 * 86_400), now: now) == "3j")
    }

    @Test func short_weeks() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        #expect(RelativeTimeFormatter.shortString(for: now.addingTimeInterval(-10 * 86_400), now: now) == "1sem")
        #expect(RelativeTimeFormatter.shortString(for: now.addingTimeInterval(-21 * 86_400), now: now) == "3sem")
    }

    @Test func short_months() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        #expect(RelativeTimeFormatter.shortString(for: now.addingTimeInterval(-45 * 86_400), now: now) == "1mois")
        #expect(RelativeTimeFormatter.shortString(for: now.addingTimeInterval(-75 * 86_400), now: now) == "2mois")
    }

    // MARK: - Long

    @Test func long_underThirtySeconds_isJustNow() {
        let cal = utc()
        let now = at(2026, 6, 13, cal: cal)
        #expect(RelativeTimeFormatter.longString(for: now.addingTimeInterval(-20), now: now, calendar: cal) == "maintenant")
    }

    @Test func long_seconds() {
        let cal = utc()
        let now = at(2026, 6, 13, cal: cal)
        #expect(RelativeTimeFormatter.longString(for: now.addingTimeInterval(-45), now: now, calendar: cal) == "il y a 45s")
    }

    @Test func long_minutes() {
        let cal = utc()
        let now = at(2026, 6, 13, cal: cal)
        #expect(RelativeTimeFormatter.longString(for: now.addingTimeInterval(-5 * 60), now: now, calendar: cal) == "il y a 5 min")
    }

    @Test func long_sameDay_hours() {
        let cal = utc()
        let now = at(2026, 6, 13, 12, cal: cal)
        let earlier = at(2026, 6, 13, 9, cal: cal)
        #expect(RelativeTimeFormatter.longString(for: earlier, now: now, calendar: cal) == "il y a 3h")
    }

    @Test func long_yesterday_acrossMidnight() {
        let cal = utc()
        let now = at(2026, 6, 13, 9, cal: cal)
        let yesterdayEvening = at(2026, 6, 12, 20, cal: cal)
        #expect(RelativeTimeFormatter.longString(for: yesterdayEvening, now: now, calendar: cal) == "hier")
    }

    @Test func long_daysThisWeek() {
        let cal = utc()
        let now = at(2026, 6, 13, cal: cal)
        let threeDaysAgo = at(2026, 6, 10, cal: cal)
        #expect(RelativeTimeFormatter.longString(for: threeDaysAgo, now: now, calendar: cal) == "il y a 3j")
    }

    @Test func long_weeks() {
        let cal = utc()
        let now = at(2026, 6, 13, cal: cal)
        #expect(RelativeTimeFormatter.longString(for: at(2026, 5, 28, cal: cal), now: now, calendar: cal) == "il y a 2sem")
    }

    @Test func long_months() {
        let cal = utc()
        let now = at(2026, 6, 13, cal: cal)
        #expect(RelativeTimeFormatter.longString(for: at(2026, 4, 5, cal: cal), now: now, calendar: cal) == "il y a 2mois")
    }

    @Test func long_absolute_sameYear_omitsYear() {
        let cal = utc()
        let now = at(2026, 6, 13, cal: cal)
        let old = at(2026, 1, 4, cal: cal)
        let result = RelativeTimeFormatter.longString(for: old, now: now, calendar: cal)
        #expect(!result.contains("2026"))
        #expect(result.contains("4"))
    }

    @Test func long_absolute_differentYear_includesYear() {
        let cal = utc()
        let now = at(2026, 6, 13, cal: cal)
        let old = at(2024, 11, 4, cal: cal)
        #expect(RelativeTimeFormatter.longString(for: old, now: now, calendar: cal).contains("2024"))
    }

    // MARK: - Future / clock-drift guard (never crashes, treated as "just now")

    @Test func futureDate_isJustNow() {
        let cal = utc()
        let now = at(2026, 6, 13, cal: cal)
        let future = now.addingTimeInterval(120)
        #expect(RelativeTimeFormatter.shortString(for: future, now: now) == "maintenant")
        #expect(RelativeTimeFormatter.longString(for: future, now: now, calendar: cal) == "maintenant")
    }

    // MARK: - Last seen (profile presence label)

    @Test func lastSeen_underOneMinute_isOnline() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        #expect(RelativeTimeFormatter.lastSeenString(for: now.addingTimeInterval(-30), now: now) == "En ligne")
    }

    @Test func lastSeen_futureIsOnline() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        #expect(RelativeTimeFormatter.lastSeenString(for: now.addingTimeInterval(120), now: now) == "En ligne")
    }

    @Test func lastSeen_minutes() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        #expect(RelativeTimeFormatter.lastSeenString(for: now.addingTimeInterval(-5 * 60), now: now) == "Vu il y a 5 min")
    }

    @Test func lastSeen_hoursSameDay() {
        let cal = utc()
        let now = at(2026, 6, 13, 12, 0, cal: cal)
        let earlier = at(2026, 6, 13, 9, 0, cal: cal)
        #expect(RelativeTimeFormatter.lastSeenString(for: earlier, now: now, calendar: cal) == "Vu il y a 3h")
    }

    @Test func lastSeen_yesterday_carriesClock() {
        let cal = utc()
        let now = at(2026, 6, 13, 12, 0, cal: cal)
        let yesterday = at(2026, 6, 12, 9, 30, cal: cal)
        #expect(RelativeTimeFormatter.lastSeenString(for: yesterday, now: now, calendar: cal).hasPrefix("Vu hier à "))
    }

    @Test func lastSeen_beforeYesterday_carriesClock() {
        let cal = utc()
        let now = at(2026, 6, 13, 12, 0, cal: cal)
        let before = at(2026, 6, 11, 9, 30, cal: cal)
        #expect(RelativeTimeFormatter.lastSeenString(for: before, now: now, calendar: cal).hasPrefix("Vu avant-hier à "))
    }

    @Test func lastSeen_olderDate_carriesDateAndClock() {
        let cal = utc()
        let now = at(2026, 6, 13, 12, 0, cal: cal)
        let old = at(2026, 6, 1, 9, 30, cal: cal)
        let result = RelativeTimeFormatter.lastSeenString(for: old, now: now, calendar: cal)
        #expect(result.hasPrefix("Vu le "))
        #expect(result.contains(" à "))
    }
}
