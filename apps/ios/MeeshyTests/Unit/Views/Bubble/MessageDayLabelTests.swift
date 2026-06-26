import XCTest
@testable import Meeshy

/// Tests de la logique pure de labellisation des séparateurs de jour de la
/// liste des messages. Le label s'affiche dans une pill flottante qui colle
/// au top du flux pendant le scroll.
///
/// Contrat (Prisme UX — convention WhatsApp/iMessage adaptée fr_FR) :
///   J0          → "Aujourd'hui"
///   J-1         → "Hier"
///   J-2         → "Avant-hier"
///   J-3 à J-6   → jour de semaine capitalisé ("Lundi", "Mardi", ...)
///   J-7 +      → "Lundi 9 mai" (même année) ou "Lundi 9 mai 2025"
///
/// Toutes les comparaisons se font sur la frontière minuit du calendrier
/// fourni — on ne compte pas des "24h" mais des bascules de date locale.
@MainActor
final class MessageDayLabelTests: XCTestCase {

    /// Calendrier fr_FR / Europe Paris, point d'ancrage commun aux cas.
    /// `now` = jeudi 2026-05-20 14:30 (heure de Paris).
    private func makeCalendar() -> Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.locale = Locale(identifier: "fr_FR")
        cal.timeZone = TimeZone(identifier: "Europe/Paris")!
        return cal
    }

    private func date(_ year: Int, _ month: Int, _ day: Int, _ hour: Int = 12, _ minute: Int = 0) -> Date {
        let cal = makeCalendar()
        return cal.date(from: DateComponents(year: year, month: month, day: day, hour: hour, minute: minute))!
    }

    private let locale = Locale(identifier: "fr_FR")

    // MARK: - Cas relatifs

    func test_label_today_returnsAujourdhui() {
        let now = date(2026, 5, 20, 14, 30)
        let target = date(2026, 5, 20, 9, 15)
        XCTAssertEqual(MessageDayLabel.label(for: target, now: now, calendar: makeCalendar(), locale: locale), "Aujourd'hui")
    }

    func test_label_yesterday_returnsHier() {
        let now = date(2026, 5, 20, 14, 30)
        let target = date(2026, 5, 19, 23, 59)
        XCTAssertEqual(MessageDayLabel.label(for: target, now: now, calendar: makeCalendar(), locale: locale), "Hier")
    }

    func test_label_dayBeforeYesterday_returnsAvantHier() {
        let now = date(2026, 5, 20, 14, 30)
        let target = date(2026, 5, 18, 0, 5)
        XCTAssertEqual(MessageDayLabel.label(for: target, now: now, calendar: makeCalendar(), locale: locale), "Avant-hier")
    }

    // MARK: - Jour de semaine (J-3 → J-6)

    func test_label_threeDaysAgo_returnsCapitalizedWeekday() {
        // 2026-05-20 jeudi → J-3 = lundi 2026-05-17
        let now = date(2026, 5, 20, 14, 30)
        let target = date(2026, 5, 17, 10, 0)
        XCTAssertEqual(MessageDayLabel.label(for: target, now: now, calendar: makeCalendar(), locale: locale), "Dimanche")
    }

    func test_label_sixDaysAgo_returnsCapitalizedWeekday() {
        // 2026-05-20 jeudi → J-6 = vendredi 2026-05-14
        let now = date(2026, 5, 20, 14, 30)
        let target = date(2026, 5, 14, 10, 0)
        XCTAssertEqual(MessageDayLabel.label(for: target, now: now, calendar: makeCalendar(), locale: locale), "Jeudi")
    }

    // MARK: - Date pleine au-delà de J-7

    func test_label_sevenDaysAgo_returnsWeekdayPlusDate_sameYear() {
        // 2026-05-20 jeudi → J-7 = jeudi 2026-05-13
        let now = date(2026, 5, 20, 14, 30)
        let target = date(2026, 5, 13, 10, 0)
        XCTAssertEqual(MessageDayLabel.label(for: target, now: now, calendar: makeCalendar(), locale: locale), "Mercredi 13 mai")
    }

    func test_label_oneMonthAgo_returnsWeekdayPlusDate_sameYear() {
        let now = date(2026, 5, 20, 14, 30)
        let target = date(2026, 4, 20, 10, 0)
        // 20 avril 2026 = lundi
        XCTAssertEqual(MessageDayLabel.label(for: target, now: now, calendar: makeCalendar(), locale: locale), "Lundi 20 avril")
    }

    func test_label_previousYear_returnsWeekdayPlusDatePlusYear() {
        let now = date(2026, 5, 20, 14, 30)
        let target = date(2025, 5, 19, 10, 0)
        // 19 mai 2025 = lundi
        XCTAssertEqual(MessageDayLabel.label(for: target, now: now, calendar: makeCalendar(), locale: locale), "Lundi 19 mai 2025")
    }

    // MARK: - Edges

    func test_label_acrossMidnight_yesterdayJustEnded() {
        // À 00:30, ce qui s'est passé à 23:59 hier est bien "Hier".
        let now = date(2026, 5, 20, 0, 30)
        let target = date(2026, 5, 19, 23, 59)
        XCTAssertEqual(MessageDayLabel.label(for: target, now: now, calendar: makeCalendar(), locale: locale), "Hier")
    }

    func test_label_futureDate_returnsAujourdhuiWhenSameDay() {
        // Garde-fou : un message au futur (clock drift) le même jour calendaire
        // reste "Aujourd'hui" — on ne renvoie pas de label négatif bizarre.
        let now = date(2026, 5, 20, 9, 0)
        let target = date(2026, 5, 20, 23, 30)
        XCTAssertEqual(MessageDayLabel.label(for: target, now: now, calendar: makeCalendar(), locale: locale), "Aujourd'hui")
    }

    // MARK: - i18n — strings injectables (suivent la langue d'interface app)

    func test_label_today_usesInjectedTodayString() {
        let now = date(2026, 5, 20, 14, 30)
        let target = date(2026, 5, 20, 9, 15)
        XCTAssertEqual(
            MessageDayLabel.label(
                for: target, now: now, calendar: makeCalendar(),
                locale: Locale(identifier: "en_US"),
                today: "Today", yesterday: "Yesterday", dayBeforeYesterday: "Day before yesterday"
            ),
            "Today"
        )
    }

    func test_label_yesterday_usesInjectedYesterdayString() {
        let now = date(2026, 5, 20, 14, 30)
        let target = date(2026, 5, 19, 9, 15)
        XCTAssertEqual(
            MessageDayLabel.label(
                for: target, now: now, calendar: makeCalendar(),
                locale: Locale(identifier: "en_US"),
                today: "Today", yesterday: "Yesterday", dayBeforeYesterday: "Day before yesterday"
            ),
            "Yesterday"
        )
    }

    func test_label_dayBeforeYesterday_usesInjectedDayBeforeYesterdayString() {
        let now = date(2026, 5, 20, 14, 30)
        let target = date(2026, 5, 18, 9, 15)
        XCTAssertEqual(
            MessageDayLabel.label(
                for: target, now: now, calendar: makeCalendar(),
                locale: Locale(identifier: "en_US"),
                today: "Today", yesterday: "Yesterday", dayBeforeYesterday: "Day before yesterday"
            ),
            "Day before yesterday"
        )
    }

    func test_label_weekday_followsInjectedLocale() {
        // Locale en_US → DateFormatter sort "Sunday" (la fonction capitalise la 1re lettre)
        let now = date(2026, 5, 20, 14, 30)
        let target = date(2026, 5, 17, 10, 0)
        XCTAssertEqual(
            MessageDayLabel.label(
                for: target, now: now, calendar: makeCalendar(),
                locale: Locale(identifier: "en_US")
            ),
            "Sunday"
        )
    }

    func test_label_fullDate_followsInjectedLocale() {
        // en_GB is used here rather than en_US: iOS 18.x DateFormatter applies
        // locale-preferred component ordering even with a fixed dateFormat string,
        // reordering "EEEE d MMMM" to "EEEE, MMMM d" for en_US (month-first).
        // British English keeps day-before-month order, matching the format template
        // and the fr_FR baseline ("Mercredi 13 mai"), while still exercising English
        // weekday/month names.
        let now = date(2026, 5, 20, 14, 30)
        let target = date(2026, 5, 13, 10, 0)
        XCTAssertEqual(
            MessageDayLabel.label(
                for: target, now: now, calendar: makeCalendar(),
                locale: Locale(identifier: "en_GB")
            ),
            "Wednesday 13 May"
        )
    }

    // MARK: - Mémoïsation des formatters (le cache ne doit pas fuir entre locales)

    func test_label_interleavedLocales_eachKeepsOwnFormatter() {
        // J-3 → branche weekday. Le cache de formatters est keyé par locale ;
        // un appel en_US ne doit jamais renvoyer le formatter fr_FR (ni l'inverse).
        let now = date(2026, 5, 20, 14, 30)
        let target = date(2026, 5, 17, 10, 0)
        let fr = MessageDayLabel.label(for: target, now: now, calendar: makeCalendar(), locale: Locale(identifier: "fr_FR"))
        let en = MessageDayLabel.label(for: target, now: now, calendar: makeCalendar(), locale: Locale(identifier: "en_US"))
        let frAgain = MessageDayLabel.label(for: target, now: now, calendar: makeCalendar(), locale: Locale(identifier: "fr_FR"))
        XCTAssertEqual(fr, "Dimanche")
        XCTAssertEqual(en, "Sunday")
        XCTAssertEqual(frAgain, "Dimanche")
    }

    func test_label_repeatedCalls_stableOutput_fullDate() {
        // J-7 → branche fullDate. Le formatter mémoïsé doit produire une sortie
        // identique à chaque appel (lecture seule, aucune mutation post-création).
        let now = date(2026, 5, 20, 14, 30)
        let target = date(2026, 5, 13, 10, 0)
        let first = MessageDayLabel.label(for: target, now: now, calendar: makeCalendar(), locale: locale)
        let second = MessageDayLabel.label(for: target, now: now, calendar: makeCalendar(), locale: locale)
        XCTAssertEqual(first, "Mercredi 13 mai")
        XCTAssertEqual(second, first)
    }
}
