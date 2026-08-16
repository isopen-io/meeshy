import XCTest
@testable import Meeshy

/// F-081 (WS-2) — `ScrollTimePillState` : pilote `ScrollTimePillLaw`/
/// `ScrollActivityEvent` (loi GELÉE, `Focal/Core/ScrollTimePillLaw.swift`,
/// M-044, amendement A4). Séquence d'événements → visibilité, critères
/// §7 « Chrono » du contrat Focal : invisible à l'ouverture, visible au
/// premier `.scrolled`, invisible EXACTEMENT `lingerMs` (900 ms) après le
/// dernier `.scrolled` — la constante vient de la loi, jamais recopiée ici.
@MainActor
final class ScrollTimePillStateTests: XCTestCase {

    // MARK: - Séquence d'événements → visibilité (critère §7 « Chrono »)

    func test_initialState_isNotVisible() {
        let state = ScrollTimePillState()
        XCTAssertFalse(state.isVisible)
        XCTAssertNil(state.label)
    }

    func test_scrolled_makesVisible() {
        let state = ScrollTimePillState()
        state.note(.scrolled(at: 0), label: "Mercredi · 17:42")
        XCTAssertTrue(state.isVisible)
        XCTAssertEqual(state.label, "Mercredi · 17:42")
    }

    func test_tick_justBeforeLingerBoundary_staysVisible() {
        let state = ScrollTimePillState()
        state.note(.scrolled(at: 0), label: "Mercredi · 17:42")

        state.note(.tick(at: ScrollTimePillLaw.lingerMs / 1000 - 0.001))

        XCTAssertTrue(state.isVisible)
    }

    func test_tick_atOrAfterLingerBoundary_becomesInvisible() {
        let state = ScrollTimePillState()
        state.note(.scrolled(at: 0), label: "Mercredi · 17:42")

        state.note(.tick(at: ScrollTimePillLaw.lingerMs / 1000 + 0.001))

        XCTAssertFalse(state.isVisible)
    }

    func test_scrolled_afterFadingOut_reArmsVisibility() {
        let state = ScrollTimePillState()
        let lingerSeconds = ScrollTimePillLaw.lingerMs / 1000
        state.note(.scrolled(at: 0), label: "Mercredi · 17:42")
        state.note(.tick(at: lingerSeconds + 1))
        XCTAssertFalse(state.isVisible)

        state.note(.scrolled(at: lingerSeconds + 1), label: "Jeudi · 08:03")

        XCTAssertTrue(state.isVisible)
        XCTAssertEqual(state.label, "Jeudi · 08:03")
    }

    func test_intermediateScroll_reArmsTimer() {
        let state = ScrollTimePillState()
        state.note(.scrolled(at: 0), label: "Mercredi · 17:42")
        // Réarmement à mi-fenêtre : le SUIVANT tick, positionné juste après
        // l'échéance de la PREMIÈRE fenêtre, doit rester visible — le
        // dernier `.scrolled` gagne.
        state.note(.scrolled(at: 0.5))

        state.note(.tick(at: 0.5 + ScrollTimePillLaw.lingerMs / 1000 - 0.001))

        XCTAssertTrue(state.isVisible)
    }

    // MARK: - Masquée quand le header est déplié (parité sticker de date)

    func test_headerExpanded_masksAnOtherwiseVisiblePill() {
        let state = ScrollTimePillState()
        state.note(.scrolled(at: 0), label: "Mercredi · 17:42")
        XCTAssertTrue(state.isVisible)

        state.isHeaderExpanded = true

        XCTAssertFalse(state.isVisible)
    }

    func test_headerCollapsedAgain_restoresVisibilityWithinLingerWindow() {
        let state = ScrollTimePillState()
        state.note(.scrolled(at: 0), label: "Mercredi · 17:42")
        state.isHeaderExpanded = true
        XCTAssertFalse(state.isVisible)

        state.isHeaderExpanded = false

        XCTAssertTrue(state.isVisible)
    }

    func test_headerExpanded_beforeAnyScroll_staysInvisible() {
        let state = ScrollTimePillState()
        state.isHeaderExpanded = true
        XCTAssertFalse(state.isVisible)
    }

    // MARK: - `.tick` ne modifie jamais le libellé

    func test_tick_doesNotChangeLabel() {
        let state = ScrollTimePillState()
        state.note(.scrolled(at: 0), label: "Mercredi · 17:42")

        state.note(.tick(at: 0.1), label: "Ignoré")

        XCTAssertEqual(state.label, "Mercredi · 17:42")
    }
}

/// F-081 (WS-2) — `ScrollTimePillLabelFormatter` : jour via `MessageDayLabel`,
/// heure via `TimeStringCache` — AUCUN `DateFormatter` neuf. `@MainActor` :
/// `MessageDayLabel` est implicitement isolé `@MainActor` dans la cible
/// `Meeshy` (`SWIFT_DEFAULT_ACTOR_ISOLATION`, `project.yml`).
@MainActor
final class ScrollTimePillLabelFormatterTests: XCTestCase {

    private func makeCalendar() -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    func test_label_combinesDayAndTime_separatedByMiddleDot() {
        let calendar = makeCalendar()
        let now = calendar.date(from: DateComponents(year: 2026, month: 8, day: 15, hour: 12))!
        let target = now // même jour → "Aujourd'hui"

        let label = ScrollTimePillLabelFormatter.label(
            for: target, now: now, calendar: calendar, locale: Locale(identifier: "fr_FR")
        )

        XCTAssertTrue(label.contains("·"))
        XCTAssertTrue(label.hasPrefix("Aujourd'hui"))
    }

    func test_label_usesInjectedRelativeLabels() {
        let calendar = makeCalendar()
        let now = calendar.date(from: DateComponents(year: 2026, month: 8, day: 15, hour: 12))!
        let yesterday = calendar.date(byAdding: .day, value: -1, to: now)!

        let label = ScrollTimePillLabelFormatter.label(
            for: yesterday, now: now, calendar: calendar, locale: Locale(identifier: "fr_FR"),
            today: "Aujourd'hui", yesterday: "Hier", dayBeforeYesterday: "Avant-hier"
        )

        XCTAssertTrue(label.hasPrefix("Hier"))
    }

    /// Reproduit le format `HH:mm` de `TimeStringCache` (heure LOCALE, pas
    /// UTC) — ce test n'assert PAS une heure fixe (dépend du fuseau
    /// d'exécution CI), seulement la forme `jour · HH:mm`.
    func test_label_timeSegment_matchesHHmmShape() {
        let calendar = makeCalendar()
        let now = calendar.date(from: DateComponents(year: 2026, month: 8, day: 15, hour: 12))!

        let label = ScrollTimePillLabelFormatter.label(
            for: now, now: now, calendar: calendar, locale: Locale(identifier: "fr_FR")
        )

        let timeSegment = label.components(separatedBy: "· ").last ?? ""
        XCTAssertEqual(timeSegment.count, 5, "attendu HH:mm, obtenu \(timeSegment)")
        XCTAssertEqual(timeSegment[timeSegment.index(timeSegment.startIndex, offsetBy: 2)], ":")
    }
}
