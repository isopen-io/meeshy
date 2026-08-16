import XCTest
@testable import Meeshy

/// F-081 (WS-2) — `ScrollTimePillState` : pilote `ScrollTimePillLaw`/
/// `ScrollActivityEvent` (loi GELÉE, `Focal/Core/ScrollTimePillLaw.swift`,
/// M-044, amendement A4). Séquence d'événements → visibilité, critères
/// §7 « Chrono » du contrat Focal : invisible à l'ouverture, visible au
/// premier `.scrolled`, invisible EXACTEMENT `lingerMs` (900 ms) après le
/// dernier `.scrolled` — la constante vient de la loi, jamais recopiée ici.
///
/// **UNITÉS — MILLISECONDES, de bout en bout.** La loi gelée
/// (`ScrollTimePillLaw`, miroir exact de
/// `packages/shared/utils/scroll-activity.ts`) compare `at - lastScrolledAt`
/// à `lingerMs = 900` : ses horodatages sont des MILLISECONDES, jamais des
/// secondes. Les deux peaux de production injectent bien des millisecondes
/// (`MessageListViewController.nowMs()` = `timeIntervalSince1970 * 1000` ;
/// `SectionScrollPillHost.timestamp()` idem) et `ScrollTimePillState` ne
/// convertit rien — il passe l'horodatage tel quel à la loi. Ces tests
/// DOIVENT donc tiquer en millisecondes eux aussi : toute division par
/// 1 000 ici (« bornes en secondes vs `lingerMs` documenté en
/// millisecondes ») rendrait la fenêtre 1 000 fois plus large et ferait
/// passer au vert des scénarios d'effacement qui n'effacent rien.
/// `test_lingerBoundary_isMeasuredInMilliseconds` monte la garde.
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

        state.note(.tick(at: ScrollTimePillLaw.lingerMs - 1))

        XCTAssertTrue(state.isVisible)
    }

    func test_tick_atOrAfterLingerBoundary_becomesInvisible() {
        let state = ScrollTimePillState()
        state.note(.scrolled(at: 0), label: "Mercredi · 17:42")

        state.note(.tick(at: ScrollTimePillLaw.lingerMs + 1))

        XCTAssertFalse(state.isVisible)
    }

    /// TÉMOIN d'unités — les TROIS points autour de la borne, à ±1 ms.
    ///
    /// La borne elle-même appartient à la fenêtre INVISIBLE (fenêtre
    /// semi-ouverte `[t₀, t₀ + lingerMs)` — loi gelée). Ce test échoue sur
    /// TOUTE confusion secondes/millisecondes future : réintroduire un
    /// `/ 1000` quelque part sur la chaîne rendrait `lingerMs` et
    /// `lingerMs + 1` visibles (0,9 s et 0,901 s sont tous deux < 900 ms),
    /// et les deux dernières assertions mordraient immédiatement.
    func test_lingerBoundary_isMeasuredInMilliseconds() {
        func visibility(tickAt instant: Double) -> Bool {
            let state = ScrollTimePillState()
            state.note(.scrolled(at: 0), label: "Mercredi · 17:42")
            state.note(.tick(at: instant))
            return state.isVisible
        }

        XCTAssertTrue(
            visibility(tickAt: ScrollTimePillLaw.lingerMs - 1),
            "1 ms AVANT la borne : encore dans la fenêtre"
        )
        XCTAssertFalse(
            visibility(tickAt: ScrollTimePillLaw.lingerMs),
            "SUR la borne : déjà invisible (fenêtre semi-ouverte). Visible ici ⇒ les ms ont été traitées comme des secondes"
        )
        XCTAssertFalse(
            visibility(tickAt: ScrollTimePillLaw.lingerMs + 1),
            "1 ms APRÈS la borne : invisible. Visible ici ⇒ les ms ont été traitées comme des secondes"
        )
    }

    func test_scrolled_afterFadingOut_reArmsVisibility() {
        let state = ScrollTimePillState()
        // Une seconde PLEINE après la borne — en millisecondes, comme la loi.
        let wellAfterBoundary = ScrollTimePillLaw.lingerMs + 1000
        state.note(.scrolled(at: 0), label: "Mercredi · 17:42")
        state.note(.tick(at: wellAfterBoundary))
        XCTAssertFalse(state.isVisible)

        state.note(.scrolled(at: wellAfterBoundary), label: "Jeudi · 08:03")

        XCTAssertTrue(state.isVisible)
        XCTAssertEqual(state.label, "Jeudi · 08:03")
    }

    func test_intermediateScroll_reArmsTimer() {
        let state = ScrollTimePillState()
        state.note(.scrolled(at: 0), label: "Mercredi · 17:42")
        // Réarmement à mi-fenêtre (500 ms) : le SUIVANT tick, positionné
        // juste après l'échéance de la PREMIÈRE fenêtre, doit rester visible
        // — le dernier `.scrolled` gagne.
        state.note(.scrolled(at: 500))

        state.note(.tick(at: 500 + ScrollTimePillLaw.lingerMs - 1))

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

        state.note(.tick(at: 100), label: "Ignoré")

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
