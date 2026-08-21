import XCTest
@testable import Meeshy

/// Horodatage du message EN FOCUS (directive user 2026-08-21) : « Aujourd'hui
/// 12:45 », « Hier 18:45 », « Mardi 23:40 » dans la semaine, « Sam. 3 oct. »
/// au-delà, avec l'année si ce n'est pas l'année en cours.
final class FocalFocusTimestampTests: XCTestCase {

    private var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        c.locale = Locale(identifier: "fr_FR")
        return c
    }
    private let locale = Locale(identifier: "fr_FR")

    /// Vendredi 21 août 2026, 15:00 UTC.
    private var now: Date { date(2026, 8, 21, 15, 0) }

    private func date(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 12, _ min: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: y, month: m, day: d, hour: h, minute: min))!
    }

    private func label(_ sentAt: Date, time: String = "12:45") -> String {
        FocalFocusTimestamp.label(sentAt: sentAt, timeString: time, now: now, calendar: calendar, locale: locale)
    }

    func test_today_isTodayWordPlusTime() {
        XCTAssertEqual(label(date(2026, 8, 21, 9, 30)), "Aujourd'hui 12:45")
    }

    func test_yesterday_isYesterdayWordPlusTime() {
        XCTAssertEqual(label(date(2026, 8, 20, 18, 45), time: "18:45"), "Hier 18:45")
    }

    func test_dayBeforeYesterday_keepsTheAppsDayPillConvention() {
        XCTAssertEqual(label(date(2026, 8, 19)), "Avant-hier 12:45")
    }

    func test_withinTheWeek_isTheWeekdayNamePlusTime() {
        // Mardi 18 août 2026, 23:40 UTC — 3 jours avant le vendredi 21. Le nom
        // du jour est formaté dans le fuseau du CALENDRIER (UTC) : « Mardi »
        // partout, pas « Mercredi » sur une machine à Paris (01:40 le 19).
        XCTAssertEqual(label(date(2026, 8, 18, 23, 40), time: "23:40"), "Mardi 23:40")
        // Samedi 15 août — 6 jours : encore le nom du jour.
        XCTAssertEqual(label(date(2026, 8, 15)), "Samedi 12:45")
    }

    func test_beyondTheWeek_isTheAbbreviatedDate_withoutTheCurrentYear() {
        // Vendredi 14 août 2026 — 7 jours : date abrégée, année en cours omise.
        XCTAssertEqual(label(date(2026, 8, 14, 14, 41), time: "14:41"), "Ven. 14 août · 14:41")
    }

    func test_previousYear_addsTheYear() {
        // Vendredi 3 octobre 2025.
        XCTAssertEqual(label(date(2025, 10, 3, 14, 41), time: "14:41"), "Ven. 3 oct. 2025 · 14:41")
    }

    func test_localizedWords_areInjected_neverHardcodedByTheCaller() {
        let en = FocalFocusTimestamp.label(
            sentAt: date(2026, 8, 21), timeString: "12:45", now: now, calendar: calendar, locale: Locale(identifier: "en_US"),
            today: "Today", yesterday: "Yesterday", dayBeforeYesterday: "2 days ago"
        )
        XCTAssertEqual(en, "Today 12:45")
    }

    /// La rangée passe les mots du catalogue (`date.*`), jamais du français en dur.
    func test_focalRow_feedsTheCatalogWords_toTheRule() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            .components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
        XCTAssertTrue(code.contains("FocalFocusTimestamp.label( sentAt: sentAt, timeString: content.meta.timeString,"))
        for key in ["date.today", "date.yesterday", "date.dayBeforeYesterday"] {
            XCTAssertTrue(code.contains("String(localized: \"\(key)\""), "mot du catalogue attendu : \(key)")
        }
    }

    // MARK: - La LISTE : même loi, joint « à » (directive 2026-08-21)

    private func listLabel(_ sentAt: Date, time: String) -> String {
        FocalFocusTimestamp.listLabel(
            sentAt: sentAt, timeString: time, now: now, calendar: calendar, locale: locale,
            today: "Aujourd'hui", yesterday: "Hier", dayBeforeYesterday: "Avant-hier", atWord: "à"
        )
    }

    func test_listLabel_joinsWithTheAtWord_onEveryBranch() {
        XCTAssertEqual(listLabel(date(2026, 8, 21, 5, 49), time: "5:49"), "Aujourd'hui à 5:49")
        XCTAssertEqual(listLabel(date(2026, 8, 20, 22, 12), time: "22:12"), "Hier à 22:12")
        XCTAssertEqual(listLabel(date(2026, 8, 18, 23, 50), time: "23:50"), "Mardi à 23:50")
        // Au-delà d'une semaine : la date ET l'heure, jointes par « à » (plus de « · »).
        XCTAssertEqual(listLabel(date(2025, 10, 3, 14, 41), time: "14:41"), "Ven. 3 oct. 2025 à 14:41")
    }

    func test_threadLabel_keepsItsSpaceJoiner_theListJoinerIsOptIn() {
        XCTAssertEqual(label(date(2026, 8, 21, 9, 30)), "Aujourd'hui 12:45")
    }
}
