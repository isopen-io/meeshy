import XCTest
import CoreGraphics
@testable import Meeshy

/// `StatusBubbleOverlay` se pose dans un `GeometryReader` et est **clippée par
/// son conteneur**. Ses deux décisions de layout — largeur de la bulle et
/// bascule au-dessus / en-dessous de l'ancre — se prenaient pourtant sur
/// `UIScreen.main.bounds`, l'écran physique.
///
/// `.withStatusBubble()` est appliqué sur ~15 surfaces, dont plusieurs feuilles
/// (`FeedCommentsSheet`, `ConversationInfoSheet`, `ForwardPickerSheet`,
/// `SharePickerView`…). Une feuille — a fortiori une form sheet iPad, une
/// colonne de split view, un Slide Over ou une fenêtre Stage Manager — est bien
/// plus petite que l'écran : la bulle était dimensionnée et orientée d'après une
/// surface où elle n'est pas rendue.
///
/// Les deux décisions sont désormais des fonctions pures qui ne lisent que le
/// conteneur, ce qui les rend directement testables sans construire de vue.
@MainActor
final class StatusBubbleOverlayLayoutTests: XCTestCase {

    // MARK: - Largeur

    /// Plein écran iPhone : comportement inchangé — la bulle est plafonnée à
    /// 250 pt, comme avant. Le correctif ne doit rien déplacer dans le cas
    /// nominal.
    func test_bubbleWidth_onFullScreenPhone_staysAtTheCap() {
        XCTAssertEqual(StatusBubbleOverlay.bubbleWidth(containerWidth: 393), 250)
    }

    /// Le cœur du défaut. Sous 298 pt de conteneur, une bulle de 250 pt ne tient
    /// plus : `bubbleX` ne pince que le bord DROIT
    /// (`bounds.width - bubbleW / 2 - 16`), donc la largeur excédentaire ressort
    /// par le bord GAUCHE. À 260 pt de conteneur l'ancienne formule donnait
    /// 250 pt de bulle, centre pincé à 119, soit un bord gauche à **−6 pt** —
    /// hors conteneur. La largeur dérivée du conteneur tient par construction.
    func test_bubbleWidth_inNarrowContainer_fitsWithinIt() {
        let containerWidth: CGFloat = 260
        let width = StatusBubbleOverlay.bubbleWidth(containerWidth: containerWidth)

        XCTAssertEqual(width, 212)

        let clampedCenter = containerWidth - width / 2 - 16
        XCTAssertGreaterThanOrEqual(
            clampedCenter - width / 2, 0,
            "Le bord gauche de la bulle, une fois le centre pincé à droite, doit rester dans le conteneur."
        )
    }

    /// Un `GeometryReader` rapporte `.zero` au premier passage de layout. Une
    /// largeur négative fait crier SwiftUI (« Invalid frame dimension ») : le
    /// plancher à 0 rend ce passage transitoire simplement invisible.
    func test_bubbleWidth_onZeroSizedContainer_neverGoesNegative() {
        XCTAssertEqual(StatusBubbleOverlay.bubbleWidth(containerWidth: 0), 0)
        XCTAssertEqual(StatusBubbleOverlay.bubbleWidth(containerWidth: 30), 0)
    }

    // MARK: - Bascule verticale

    /// L'ancre est convertie dans l'espace du conteneur avant d'être utilisée
    /// partout ailleurs ; le seuil doit se mesurer dans ce même espace.
    func test_flipsAbove_comparesAnchorAgainstItsOwnContainer() {
        XCTAssertTrue(StatusBubbleOverlay.flipsAbove(anchorY: 380, containerHeight: 422))
        XCTAssertFalse(StatusBubbleOverlay.flipsAbove(anchorY: 40, containerHeight: 422))
    }

    /// Le scénario qui poussait la bulle contre le bord. Feuille au détent
    /// `.medium` sur un iPhone de 844 pt : le conteneur fait ~422 pt. Toute ancre
    /// entre 190 pt (45 % de la feuille) et 380 pt (45 % de l'écran) tombait dans
    /// la zone où l'ancien seuil disait « pose la bulle EN DESSOUS » alors que
    /// l'ancre est déjà dans la moitié basse de son conteneur.
    func test_flipsAbove_inMediumDetentSheet_choosesTheSideWithRoom() {
        let sheetHeight: CGFloat = 422
        let screenHeight: CGFloat = 844
        let anchorY: CGFloat = 350
        // Décalage du centre de la bulle par rapport à l'ancre (`anchor.y + dir * 52`).
        let bubbleOffset: CGFloat = 52

        XCTAssertFalse(
            anchorY > screenHeight * 0.45,
            "Référence de l'ancien comportement : mesurée sur l'écran, cette ancre était poussée vers le bas."
        )
        XCTAssertTrue(
            StatusBubbleOverlay.flipsAbove(anchorY: anchorY, containerHeight: sheetHeight),
            "Mesurée sur la feuille, l'ancre est dans sa moitié basse : la bulle doit basculer au-dessus."
        )

        // Le seul côté défendable est celui où il reste de la place. Pas besoin
        // de connaître la hauteur exacte de la bulle (elle épouse son contenu) :
        // il suffit de constater qu'un côté n'en offre presque aucune.
        let roomBelowCentre = sheetHeight - (anchorY + bubbleOffset)
        let roomAboveCentre = anchorY - bubbleOffset
        XCTAssertLessThan(roomBelowCentre, roomAboveCentre)
        XCTAssertLessThan(
            roomBelowCentre, 44,
            "Moins d'une cible tactile sous le centre de la bulle : tout contenu plus haut qu'une ligne est clippé."
        )
    }

    /// Plein écran, conteneur == écran : la décision est identique à l'ancienne.
    func test_flipsAbove_onFullScreenPhone_matchesPreviousBehaviour() {
        let screenHeight: CGFloat = 844
        for anchorY: CGFloat in [0, 100, 379, 381, 600, 844] {
            XCTAssertEqual(
                StatusBubbleOverlay.flipsAbove(anchorY: anchorY, containerHeight: screenHeight),
                anchorY > screenHeight * 0.45,
                "Sans inset, le correctif ne doit changer aucune décision (ancre \(anchorY))."
            )
        }
    }

    // MARK: - Verrou de source

    /// Empêche la réintroduction d'une mesure prise sur l'écran physique.
    func test_overlaySource_neverMeasuresThePhysicalScreen() throws {
        let source = try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .appendingPathComponent("Meeshy/Features/Main/Components/StatusBubbleOverlay.swift"),
            encoding: .utf8
        )
        let code = source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")

        XCTAssertFalse(
            code.contains("UIScreen.main"),
            "La bulle doit se dimensionner et s'orienter d'après son conteneur, pas d'après l'écran physique."
        )
    }
}
