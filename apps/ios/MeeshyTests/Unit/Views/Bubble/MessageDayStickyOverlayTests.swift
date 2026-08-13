import XCTest
@testable import Meeshy

/// Tests de la pill sticky de jour — l'overlay flottant qui affiche
/// « Aujourd'hui / Hier / Lundi 9 mai » pendant le défilement actif de la
/// liste des messages, avec l'animation d'émergence/rétraction dans
/// l'encoche (2026-08-13 : réutilisation d'`IslandEmergingBanner`, jusque-là
/// jamais monté — voir `CallViewAccessibilityTests`/`CallQualityIndicatorsUITests`
/// pour les invariants de sa transition).
@MainActor
final class MessageDayStickyOverlayTests: XCTestCase {

    // MARK: - MessageDayStickyState (comportement, pas de rendu)

    func test_state_defaults_toNoLabelAndNotScrolling() {
        let state = MessageDayStickyState()
        XCTAssertNil(state.label)
        XCTAssertFalse(state.isScrollingActive)
    }

    func test_state_labelAndScrollingActive_areIndependentlySettable() {
        let state = MessageDayStickyState()
        state.label = "Aujourd'hui"
        state.isScrollingActive = true
        XCTAssertEqual(state.label, "Aujourd'hui")
        XCTAssertTrue(state.isScrollingActive)

        // Un label présent sans défilement actif est un état valide (le
        // scroll vient de s'arrêter, la pill est en train de se rétracter
        // dans l'encoche) — les deux flags ne sont pas couplés côté state,
        // c'est la vue qui les combine (`label != nil && isScrollingActive`).
        state.isScrollingActive = false
        XCTAssertEqual(state.label, "Aujourd'hui")
        XCTAssertFalse(state.isScrollingActive)
    }

    // MARK: - Source inspection — câblage de l'overlay

    private func overlaySource() throws -> String {
        try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()   // Bubble/
                .deletingLastPathComponent()   // Views/
                .deletingLastPathComponent()   // Unit/
                .deletingLastPathComponent()   // MeeshyTests/
                .deletingLastPathComponent()   // ios/
                .appendingPathComponent("Meeshy/Features/Main/Views/Bubble/MessageDayStickyOverlay.swift"),
            encoding: .utf8
        )
    }

    func test_overlay_onlyShowsWhileLabelPresentAndScrollingActive() throws {
        let source = try overlaySource()
        XCTAssertTrue(
            source.contains("if let label = state.label, state.isScrollingActive"),
            "La pill ne doit s'afficher que si un label existe ET que le " +
            "défilement est actif — c'est ce qui garantit l'exclusion " +
            "mutuelle avec le header flottant (`ConversationView.hidesFloatingHeaderForScroll`)."
        )
    }

    func test_overlay_reusesIslandEmergingBanner_withBlackTint() throws {
        let source = try overlaySource()
        XCTAssertTrue(
            source.contains("IslandEmergingBanner(tint: .black, reduceMotion: reduceMotion)"),
            "La pill doit réutiliser IslandEmergingBanner (déjà éprouvé par " +
            "la bannière d'appel) plutôt que réimplémenter le morph — teinte " +
            "noire pour matcher la couleur native de l'encoche (texte blanc " +
            "dessus, MessageDayStickyLabel)."
        )
    }

    func test_overlay_forcesFreshIdentityPerLabel() throws {
        let source = try overlaySource()
        XCTAssertTrue(
            source.contains(".id(label)"),
            "Sans identité de vue distincte par label, SwiftUI mettrait le " +
            "texte à jour EN PLACE au changement de jour — aucune transition " +
            "ne rejouerait, la pill sortante ne noircirait jamais dans " +
            "l'encoche avant que la nouvelle en ressorte."
        )
    }

    func test_placement_hasNoAdditionalOffset() throws {
        // IslandEmergingBanner porte déjà 8pt d'air sous l'îlot en interne
        // (`finalTopPadding`) — cumuler un offset ici repousserait la pill
        // trop loin de l'encoche.
        XCTAssertEqual(MessageDayStickyPlacement.topOffset, 0)
    }
}
