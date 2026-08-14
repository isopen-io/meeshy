import XCTest
import SwiftUI
@testable import Meeshy

/// Tests de la pill sticky de jour — l'overlay flottant qui affiche
/// « Aujourd'hui / Hier / Lundi 9 mai » en haut de la liste des messages.
///
/// 2026-08-14 (soir) — retour à la gestion d'AVANT le 13/08 au soir : la pill
/// suit le message du haut et RESTE posée à l'arrêt, sous le header, séparée
/// de lui par la géométrie (`MessageDayStickyPlacement.topOffset`). La
/// parenthèse « exclusion mutuelle » (pill visible seulement pendant le
/// défilement, header effacé en retour) est close : c'est désormais la loi
/// commune `ScrollMotion` qui efface les seuls BOUTONS D'ACTION du header
/// pendant le mouvement.
@MainActor
final class MessageDayStickyOverlayTests: XCTestCase {

    // MARK: - MessageDayStickyState (comportement, pas de rendu)

    func test_state_defaults_toNoLabelLightThemeAndCollapsedHeader() {
        let state = MessageDayStickyState()
        XCTAssertNil(state.label)
        XCTAssertFalse(state.isDark)
        XCTAssertFalse(state.isHeaderExpanded)
    }

    func test_state_labelSurvivesTheEndOfScrolling() {
        let state = MessageDayStickyState()
        state.label = "Aujourd'hui"
        XCTAssertEqual(state.label, "Aujourd'hui")

        // Le défilement n'entre plus dans l'état de la pill : rien de ce que
        // fait le doigt ne doit la faire disparaître. Seul le contrôleur, en
        // changeant de message de tête, réécrit le label.
        state.isDark = true
        XCTAssertEqual(state.label, "Aujourd'hui")
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

    func test_overlay_showsTheDayWheneverALabelExists() throws {
        let source = try overlaySource()
        XCTAssertFalse(
            source.contains("isScrollingActive"),
            "La pill ne doit plus dépendre du défilement actif : elle suit le " +
            "message du haut et reste posée à l'arrêt (retour user 2026-08-14, " +
            "gestion d'avant le 13/08 au soir)."
        )
        XCTAssertTrue(
            source.contains("MessageDaySeparator(label: label, isDark: state.isDark)"),
            "La pill sticky rend le MÊME séparateur que les tuiles de jour du " +
            "flux — une seule écriture de « Aujourd'hui / Hier / Lundi 9 mai »."
        )
    }

    func test_overlay_hidesWhileTheHeaderIsExpanded() throws {
        let source = try overlaySource()
        XCTAssertTrue(
            source.contains("!state.isHeaderExpanded"),
            "Déplier le header (tap avatar / icône de conversation) est une " +
            "demande explicite de voir les détails de la conversation : le " +
            "header descend alors dans la bande de la pill, qui doit se retirer."
        )
    }

    func test_placement_startsBelowTheFloatingHeaderRow() {
        // 60 = padding haut du header (8) + rangée de contrôles (~44) + marge
        // (8). C'est la GÉOMÉTRIE qui sépare la pill du header, pas une
        // exclusion mutuelle : les deux sont visibles en même temps, chacun
        // dans sa bande.
        XCTAssertEqual(MessageDayStickyPlacement.topOffset, 60)
    }
}
