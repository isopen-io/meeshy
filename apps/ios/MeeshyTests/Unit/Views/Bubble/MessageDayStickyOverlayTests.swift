import XCTest
import SwiftUI
import UIKit
import MeeshyUI
@testable import Meeshy

/// Tests de la pill sticky de jour — l'overlay flottant qui affiche
/// « Aujourd'hui / Hier / Lundi 9 mai » pendant le défilement actif de la
/// liste des messages, avec l'animation d'émergence/rétraction dans
/// l'îlot (2026-08-13 : réutilisation d'`IslandEmergingBanner`, jusque-là
/// jamais monté — voir `IslandGeometryTests` pour les invariants du morph).
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
        // scroll vient de s'arrêter, la pill est en train de se rétracter
        // dans l'îlot) — les deux flags ne sont pas couplés côté state,
        // c'est la vue qui les combine.
        state.isScrollingActive = false
        XCTAssertEqual(state.label, "Aujourd'hui")
        XCTAssertFalse(state.isScrollingActive)
    }

    // MARK: - Métriques de la pill posée

    /// Police fixe : le test porte sur la composition padding + texte, pas sur
    /// la taille que le Dynamic Type de la machine de test renverrait.
    private var probeFont: UIFont { .systemFont(ofSize: 12, weight: .semibold) }

    func test_settledSize_addsTheCapsulePaddingAroundTheText() {
        let label = "Aujourd'hui"
        let text = (label as NSString).size(withAttributes: [.font: probeFont])
        let size = MessageDayStickyMetrics.settledSize(for: label, font: probeFont)

        XCTAssertEqual(
            size.width,
            text.width.rounded(.up) + MessageDayStickyMetrics.horizontalPadding * 2,
            accuracy: 0.01
        )
        XCTAssertEqual(
            size.height,
            text.height.rounded(.up) + MessageDayStickyMetrics.verticalPadding * 2,
            accuracy: 0.01
        )
    }

    func test_settledSize_growsWithTheLabel() {
        // C'est cette taille qui devient le ratio d'échelle de naissance : si
        // elle ne suivait pas le libellé, une pastille longue naîtrait hors de
        // l'îlot alors qu'une courte y tomberait juste.
        let short = MessageDayStickyMetrics.settledSize(for: "Hier", font: probeFont)
        let long = MessageDayStickyMetrics.settledSize(for: "Mercredi 12 novembre", font: probeFont)
        XCTAssertGreaterThan(long.width, short.width)
        XCTAssertEqual(long.height, short.height, accuracy: 0.01, "Hauteur portée par la police, pas par le texte")
    }

    // MARK: - Palette : blanc sur noir DANS l'îlot, couleurs de base une fois posé

    private func rgba(_ color: Color) -> (CGFloat, CGFloat, CGFloat, CGFloat)? {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a) else { return nil }
        return (r, g, b, a)
    }

    private func assertSameColor(
        _ lhs: Color, _ rhs: Color, _ message: String, line: UInt = #line
    ) {
        guard let l = rgba(lhs), let r = rgba(rhs) else {
            return XCTFail("Couleur sans composantes RGB — \(message)", line: line)
        }
        XCTAssertEqual(l.0, r.0, accuracy: 0.01, message, line: line)
        XCTAssertEqual(l.1, r.1, accuracy: 0.01, message, line: line)
        XCTAssertEqual(l.2, r.2, accuracy: 0.01, message, line: line)
        XCTAssertEqual(l.3, r.3, accuracy: 0.01, message, line: line)
    }

    func test_textColor_isWhite_whileInsideTheIsland() {
        for isDark in [true, false] {
            assertSameColor(
                MessageDayStickyPalette.textColor(isDark: isDark, progress: 0),
                .white,
                "Dans l'îlot, l'information se lit en blanc sur le noir du matériel (isDark=\(isDark))"
            )
        }
    }

    func test_textColor_returnsToTheBaseChipColor_onceSettled() {
        // Règle produit : les couleurs de base des chips sont CONSERVÉES une
        // fois la pill posée — le blanc sur noir est réservé à l'intérieur de
        // l'îlot. Ce sont exactement les teintes du séparateur inline.
        assertSameColor(
            MessageDayStickyPalette.textColor(isDark: false, progress: 1),
            MeeshyColors.indigo700,
            "Pill posée en thème clair : texte indigo700, comme MessageDaySeparator"
        )
        assertSameColor(
            MessageDayStickyPalette.textColor(isDark: true, progress: 1),
            MeeshyColors.indigo200,
            "Pill posée en thème sombre : texte indigo200, comme MessageDaySeparator"
        )
    }

    func test_capsuleColor_isTheIndigoBaseSurface_notBlack() {
        // La capsule posée ne doit PLUS être noire : le noir n'appartient qu'à
        // l'îlot, et c'est `IslandEmergingBanner` qui l'applique comme voile
        // de naissance.
        assertSameColor(
            MessageDayStickyPalette.capsuleColor(isDark: false), MeeshyColors.indigo50,
            "Fond de pill clair"
        )
        assertSameColor(
            MessageDayStickyPalette.capsuleColor(isDark: true), MeeshyColors.indigo900,
            "Fond de pill sombre"
        )
    }

    func test_blend_isProgressiveBetweenTheTwoEnds() {
        let mid = MessageDayStickyPalette.blend(.black, .white, progress: 0.5)
        guard let c = rgba(mid) else { return XCTFail("Mélange sans composantes RGB") }
        XCTAssertEqual(c.0, 0.5, accuracy: 0.01)
        XCTAssertEqual(c.1, 0.5, accuracy: 0.01)
        XCTAssertEqual(c.2, 0.5, accuracy: 0.01)
    }

    func test_blend_clampsOutOfRangeProgress() {
        assertSameColor(
            MessageDayStickyPalette.blend(.black, .white, progress: -1), .black,
            "Progression négative bornée à la couleur de départ"
        )
        assertSameColor(
            MessageDayStickyPalette.blend(.black, .white, progress: 2), .white,
            "Progression au-delà de 1 bornée à la couleur d'arrivée"
        )
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

    func test_overlay_feedsTheBannerTheExactSettledSize() throws {
        let source = try overlaySource()
        XCTAssertTrue(
            source.contains("settledSize: MessageDayStickyMetrics.settledSize(for: label)"),
            "Le ratio d'échelle de naissance dérive de la taille posée : une " +
            "estimation figée fait naître la capsule à côté de l'îlot au lieu " +
            "de dedans."
        )
    }

    func test_overlay_forcesFreshIdentityPerLabel() throws {
        let source = try overlaySource()
        XCTAssertTrue(
            source.contains(".id(label)"),
            "Sans identité de vue distincte par label, SwiftUI mettrait le " +
            "texte à jour EN PLACE au changement de jour — aucune transition " +
            "ne rejouerait, la pill sortante ne rentrerait jamais dans " +
            "l'îlot avant que la nouvelle en ressorte."
        )
    }

    func test_placement_hasNoAdditionalOffset() throws {
        // IslandEmergingBanner garantit déjà `IslandGeometry.clearanceBelow`
        // d'air sous l'îlot — cumuler un offset ici repousserait la pill trop
        // loin de l'encoche.
        XCTAssertEqual(MessageDayStickyPlacement.topOffset, 0)
    }
}
