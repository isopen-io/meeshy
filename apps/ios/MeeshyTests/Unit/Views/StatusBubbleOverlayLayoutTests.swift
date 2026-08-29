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

    private func overlaySource() throws -> String {
        try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .appendingPathComponent("Meeshy/Features/Main/Components/StatusBubbleOverlay.swift"),
            encoding: .utf8
        )
    }

    /// Empêche la réintroduction d'une mesure prise sur l'écran physique.
    func test_overlaySource_neverMeasuresThePhysicalScreen() throws {
        let source = try overlaySource()
        let code = source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")

        XCTAssertFalse(
            code.contains("UIScreen.main"),
            "La bulle doit se dimensionner et s'orienter d'après son conteneur, pas d'après l'écran physique."
        )
    }

    // MARK: - Pied de bulle (ancienneté + republier)

    /// L'ancienneté vivait auparavant en double : une fois dans la branche audio,
    /// une fois dans la branche texte. La ligne de pied unique doit l'afficher
    /// une seule fois, quelle que soit la branche de contenu.
    func test_bubbleContent_timeAgo_appearsExactlyOnce_notDuplicatedPerContentBranch() throws {
        let source = try overlaySource()
        let occurrences = source.components(separatedBy: "Text(status.timeAgo)").count - 1
        XCTAssertEqual(
            occurrences, 1,
            "status.timeAgo doit être affiché une seule fois, dans la ligne de pied — pas dupliqué " +
            "dans les branches audio et texte de bubbleContent."
        )
    }

    /// Le bouton Republier doit désormais partager la ligne de pied avec
    /// l'ancienneté (séparés par un point médian), pas former un bloc
    /// Divider + bouton pleine largeur autonome.
    ///
    /// **Ce test épinglait `Text("·")` — une GRAPHIE, pas l'intention** (leçon
    /// 272), et il est tombé au 251i quand le séparateur est devenu
    /// `MetaSeparator` : le pied de bulle était rigoureusement intact, seul le
    /// nom du jeton avait changé. Il épingle désormais l'ORDRE de la rangée —
    /// ancienneté, puis séparateur, puis l'action — ce qui survit à un
    /// renommage et tombe sur ce que le nom du test annonce : une rangée qui se
    /// disloque.
    func test_bubbleContent_republish_sitsInlineWithTimeAgo_viaMidDotSeparator() throws {
        let source = try overlaySource()
        let timeAgo = try XCTUnwrap(source.range(of: "Text(status.timeAgo)"),
                                    "l'ancienneté doit vivre dans le pied de bulle")
        let separator = try XCTUnwrap(source.range(of: "MetaSeparator(", range: timeAgo.upperBound ..< source.endIndex),
                                      "le pied doit porter un séparateur après l'ancienneté")
        let republish = try XCTUnwrap(source.range(of: "onRepublish?(status)", range: separator.upperBound ..< source.endIndex),
                                      "« Republier » doit suivre le séparateur sur la même ligne")

        let betweenTimeAgoAndAction = source[timeAgo.upperBound ..< republish.lowerBound]
        XCTAssertFalse(
            betweenTimeAgoAndAction.contains("Divider("),
            "Un Divider entre l'ancienneté et « Republier » remettrait le bouton sur son ancien "
            + "bloc pleine largeur : la rangée doit rester une seule ligne. Obtenu : "
            + "« \(betweenTimeAgoAndAction) »"
        )
    }

    /// Verrou de non-régression : l'ancien bouton pleine largeur (et son
    /// commentaire) ne doit pas être réintroduit à côté de la nouvelle ligne
    /// de pied — sinon Republier apparaîtrait deux fois.
    func test_bubbleContent_oldFullWidthRepublishRow_isGone() throws {
        let source = try overlaySource()
        XCTAssertFalse(
            source.contains("// Republish button (only for other users' statuses)"),
            "L'ancien commentaire du bouton Republier pleine largeur doit avoir disparu avec sa " +
            "restructuration en ligne de pied inline."
        )
    }
}
