import XCTest
import SwiftUI
@testable import Meeshy

/// Tests de la pill sticky de jour — l'overlay flottant qui affiche
/// « Aujourd'hui / Hier / Lundi 9 mai » pendant le défilement actif de la
/// liste des messages.
///
/// L'animation d'émergence/rétraction dans l'îlot a été retirée le 2026-08-14
/// (simplification de `MessageDayStickyOverlay`), et avec elle
/// `MessageDayStickyMetrics` / `MessageDayStickyPalette`, qui n'existaient que
/// pour la piloter. Les témoins qui les exerçaient sont partis avec — ils
/// décrivaient un programme qu'on ne livre plus. `MessageDayStickyPlacement`,
/// lui, RESTE : `MessageListViewController` en dépend, et sa disparition dans
/// la même passe est ce qui a cassé la compilation d'iOS sur `main`.
@MainActor
final class MessageDayStickyOverlayTests: XCTestCase {

    // MARK: - MessageDayStickyState (comportement, pas de rendu)

    func test_state_defaults_toNoLabelNotScrollingAndCollapsedHeader() {
        let state = MessageDayStickyState()
        XCTAssertNil(state.label)
        XCTAssertFalse(state.isScrollingActive)
        XCTAssertFalse(state.isHeaderExpanded)
    }

    func test_state_labelAndScrollingActive_areIndependentlySettable() {
        let state = MessageDayStickyState()
        state.label = "Aujourd'hui"
        state.isScrollingActive = true
        XCTAssertEqual(state.label, "Aujourd'hui")
        XCTAssertTrue(state.isScrollingActive)

        // Un label présent sans défilement actif est un état valide (le
        // scroll vient de s'arrêter, la pill est en train de disparaître en
        // fondu) — les deux flags ne sont pas couplés côté state, c'est la vue
        // qui les combine.
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

    func test_overlay_hidesWhileTheHeaderIsExpanded() throws {
        let source = try overlaySource()
        XCTAssertTrue(
            source.contains("state.isScrollingActive && !state.isHeaderExpanded"),
            "Déplier le header (tap avatar / icône de conversation) est une " +
            "demande explicite de voir les détails de la conversation : la " +
            "pill doit se retirer entièrement tant qu'il est ouvert, même " +
            "pendant un défilement."
        )
    }

    func test_overlay_forcesFreshIdentityPerLabel() throws {
        let source = try overlaySource()
        XCTAssertTrue(
            source.contains(".id(label)"),
            "Sans identité de vue distincte par label, SwiftUI mettrait le " +
            "texte à jour EN PLACE au changement de jour : la `.transition" +
            "(.opacity)` ne rejouerait jamais et le libellé changerait d'un " +
            "coup, sans fondu."
        )
    }

    func test_placement_hasNoAdditionalOffset() throws {
        // L'overlay porte lui-même sa marge haute (`.padding(.top, 8)`) :
        // cumuler un offset ici la doublerait et repousserait la pill loin de
        // l'encoche. La contrainte reste EXPRIMÉE via cette constante plutôt
        // qu'écrite `0` en dur dans `MessageListViewController` — c'est ce qui
        // donne un endroit où lire les deux moitiés de la marge ensemble.
        XCTAssertEqual(MessageDayStickyPlacement.topOffset, 0)
    }
}
