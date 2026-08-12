import Foundation
import Testing
@testable import MeeshySDK

/// Format « intelligent » des sous-titres de notification (décision produit
/// 2026-06-23) : relatif récent → « hier HH:mm » → date absolue + heure.
/// Calendrier UTC injecté pour des frontières de jour déterministes.
struct NotificationDateFormatterTests {
    private func utc() -> Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }

    @Test func underOneMinute_isNow() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        #expect(NotificationDateFormatter.string(for: now.addingTimeInterval(-20), now: now, calendar: utc()) == "à l’instant")
    }

    @Test func minutes_areRelative() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        #expect(NotificationDateFormatter.string(for: now.addingTimeInterval(-6 * 60), now: now, calendar: utc()) == "il y a 6 min")
    }

    @Test func sameDayHours_areRelative() {
        let cal = utc()
        let now = cal.date(from: DateComponents(year: 2026, month: 6, day: 23, hour: 18))!
        let date = cal.date(from: DateComponents(year: 2026, month: 6, day: 23, hour: 15))!
        #expect(NotificationDateFormatter.string(for: date, now: now, calendar: cal) == "il y a 3 h")
    }

    @Test func yesterday_showsHierWithTime() {
        let cal = utc()
        let now = cal.date(from: DateComponents(year: 2026, month: 6, day: 23, hour: 9))!
        let date = cal.date(from: DateComponents(year: 2026, month: 6, day: 22, hour: 14, minute: 30))!
        let result = NotificationDateFormatter.string(for: date, now: now, calendar: cal)
        #expect(result.hasPrefix("hier "))
        #expect(result.contains("14") && result.contains("30"))
    }

    @Test func older_showsAbsoluteDateWithTime() {
        let cal = utc()
        let now = cal.date(from: DateComponents(year: 2026, month: 6, day: 23, hour: 9))!
        let date = cal.date(from: DateComponents(year: 2026, month: 5, day: 1, hour: 14, minute: 30))!
        let result = NotificationDateFormatter.string(for: date, now: now, calendar: cal)
        #expect(result.contains("2026"))
        #expect(result.contains("14") && result.contains("30"))
    }
}
