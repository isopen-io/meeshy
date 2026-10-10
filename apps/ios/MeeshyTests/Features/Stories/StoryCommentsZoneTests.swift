import XCTest
import CoreGraphics
@testable import Meeshy

/// **La zone de commentaires d'une story suit le composeur** (#9893, porteur
/// 2026-10-10).
///
/// Quatre états, une loi : composeur absent (sa propre story), replié en
/// bulle, visible, visible avec le clavier. Plus le composeur prend de place,
/// plus la liste monte ; clavier ouvert, elle occupe tout l'espace libre
/// au-dessus du composeur et du clavier.
final class StoryCommentsZoneTests: XCTestCase {

    // iPhone 16 Pro Max : fenêtre de 956 pt, zone sûre basse de 34 pt, en-tête
    // (barres + auteur) réservé jusqu'à 159 pt.
    private static func metrics(composerHeight: CGFloat? = 92,
                                keyboardHeight: CGFloat = 0) -> StoryCommentsZone.Metrics {
        StoryCommentsZone.Metrics(windowHeight: 956, safeBottom: 34, topReserved: 159,
                                  composerHeight: composerHeight, keyboardHeight: keyboardHeight)
    }

    private static func frame(_ state: StoryCommentsZone.ComposerState,
                              composerHeight: CGFloat? = 92,
                              keyboardHeight: CGFloat = 0) -> StoryCommentsZone.Frame {
        StoryCommentsZone.frame(for: state,
                                metrics: metrics(composerHeight: composerHeight, keyboardHeight: keyboardHeight))
    }

    // MARK: - L'état se lit sur le composeur et le clavier

    func test_state_withoutComposer_isAbsent() {
        XCTAssertEqual(StoryCommentsZone.state(hasComposer: false, isShown: true,
                                               presentation: .expanded, keyboardHeight: 0), .absent)
        XCTAssertEqual(StoryCommentsZone.state(hasComposer: true, isShown: false,
                                               presentation: .expanded, keyboardHeight: 0), .absent,
                       "Chrome caché : le composeur a glissé hors de l'écran, il ne réserve plus rien.")
    }

    func test_state_followsTheFoldAndTheKeyboard() {
        XCTAssertEqual(StoryCommentsZone.state(hasComposer: true, isShown: true,
                                               presentation: .folded, keyboardHeight: 0), .folded)
        XCTAssertEqual(StoryCommentsZone.state(hasComposer: true, isShown: true,
                                               presentation: .expanded, keyboardHeight: 0), .expanded)
        XCTAssertEqual(StoryCommentsZone.state(hasComposer: true, isShown: true,
                                               presentation: .expanded, keyboardHeight: 336), .typing)
    }

    /// Le chevron replie AVANT que le clavier ait fini de descendre : replié
    /// prime, la bulle suit le clavier qui descend.
    func test_state_folded_winsOverAKeyboardStillGoingDown() {
        XCTAssertEqual(StoryCommentsZone.state(hasComposer: true, isShown: true,
                                               presentation: .folded, keyboardHeight: 200), .folded)
    }

    // MARK: - 1 · Composeur visible ⇒ la zone monte et grandit

    func test_expanded_risesAboveTheFoldedBubble_andTakesMoreRoom() {
        let folded = Self.frame(.folded, composerHeight: 44)
        let expanded = Self.frame(.expanded, composerHeight: 92)
        XCTAssertGreaterThan(expanded.topEdge, folded.topEdge, "Le haut de la liste monte quand le composeur paraît.")
        XCTAssertGreaterThan(expanded.maxHeight, folded.maxHeight, "La liste prend plus de place à l'écran.")
    }

    func test_folded_sitsAboveTheBubble_absentOnTheBottomPadding() {
        let absent = Self.frame(.absent, composerHeight: nil)
        let folded = Self.frame(.folded, composerHeight: 44)
        XCTAssertEqual(absent.bottomInset, 54, "Sans composeur : zone sûre + respiration.")
        XCTAssertEqual(folded.bottomInset, 54 + 44 + StoryCommentsZone.bubbleGap,
                       "Replié : la liste s'arrête au-dessus de la bulle, elle ne la recouvre pas.")
        XCTAssertGreaterThanOrEqual(folded.topEdge, absent.topEdge)
    }

    /// La liste « émerge » du milieu de la plaque (spec 2026-05-28) : elle
    /// s'arrête à mi-hauteur de la plaque MESURÉE, plus sur une constante.
    func test_expanded_endsAtTheMiddleOfTheMeasuredPlate() {
        XCTAssertEqual(Self.frame(.expanded, composerHeight: 92).bottomInset, 54 + 46)
        XCTAssertEqual(Self.frame(.expanded, composerHeight: 142).bottomInset, 54 + 71,
                       "La bannière « Réponse à X » grandit la plaque : la liste monte d'autant.")
    }

    // MARK: - 2 · Clavier ouvert ⇒ elle monte encore et occupe l'espace libre

    func test_typing_risesAgain_andFillsTheFreeSpaceAboveComposerAndKeyboard() {
        let expanded = Self.frame(.expanded)
        let typing = Self.frame(.typing, keyboardHeight: 336)
        XCTAssertEqual(typing.bottomInset, 336 + 46, "Posée sur le clavier, à mi-plaque.")
        XCTAssertEqual(typing.topEdge, 956 - 159, "Elle remplit tout l'espace jusqu'à l'en-tête.")
        XCTAssertGreaterThan(typing.topEdge, expanded.topEdge)
    }

    func test_typing_followsTheKeyboardHeight_frameByFrame() {
        let low = Self.frame(.typing, keyboardHeight: 120)
        let high = Self.frame(.typing, keyboardHeight: 336)
        XCTAssertGreaterThan(high.bottomInset, low.bottomInset)
        XCTAssertEqual(high.bottomInset - low.bottomInset, 216, "Le bas suit le clavier point pour point : aucun saut.")
        XCTAssertEqual(high.topEdge, low.topEdge, "Le haut reste sous l'en-tête.")
    }

    /// Le chevron replie pendant que le clavier descend : la liste reste
    /// au-dessus de la bulle, qui descend avec lui.
    func test_folded_withAKeyboardGoingDown_staysAboveTheBubble() {
        let frame = Self.frame(.folded, composerHeight: 44, keyboardHeight: 200)
        XCTAssertEqual(frame.bottomInset, 200 + 44 + StoryCommentsZone.bubbleGap)
    }

    // MARK: - L'ordre des quatre états

    func test_theTopEdge_risesWithEachState() {
        let tops = [
            Self.frame(.absent, composerHeight: nil).topEdge,
            Self.frame(.folded, composerHeight: 44).topEdge,
            Self.frame(.expanded, composerHeight: 92).topEdge,
            Self.frame(.typing, composerHeight: 92, keyboardHeight: 336).topEdge,
        ]
        XCTAssertEqual(tops, tops.sorted(), "absent ≤ replié ≤ visible ≤ visible + clavier")
        XCTAssertLessThan(tops[1], tops[2])
        XCTAssertLessThan(tops[2], tops[3])
    }

    /// Petit écran (SE) : la fraction se borne à l'espace libre, la liste ne
    /// passe jamais sous l'en-tête, et l'ordre tient toujours.
    func test_onASmallWindow_theListNeverReachesUnderTheHeader() {
        let small = StoryCommentsZone.Metrics(windowHeight: 667, safeBottom: 0, topReserved: 120,
                                              composerHeight: 142, keyboardHeight: 0)
        let expanded = StoryCommentsZone.frame(for: .expanded, metrics: small)
        XCTAssertLessThanOrEqual(expanded.topEdge, 667 - 120)
        var withKeyboard = small
        withKeyboard.keyboardHeight = 600
        let typing = StoryCommentsZone.frame(for: .typing, metrics: withKeyboard)
        XCTAssertEqual(typing.maxHeight, 0, "Plus de place : une hauteur nulle, jamais négative.")
    }

    func test_aMissingMeasure_fallsBackOnTheUsualSizes() {
        XCTAssertEqual(Self.frame(.expanded, composerHeight: nil).bottomInset,
                       54 + StoryCommentsZone.fallbackPlateHeight / 2)
        XCTAssertEqual(Self.frame(.folded, composerHeight: nil).bottomInset,
                       54 + StoryCommentsZone.fallbackBubbleHeight + StoryCommentsZone.bubbleGap)
    }

    // MARK: - 3 · Le chevron replie, la bulle rouvre sans clavier

    func test_theChevron_closesTheKeyboard_andFoldsTheComposer() {
        let tap = StoryComposerFold.chevronTapped
        XCTAssertTrue(tap.userFolded)
        XCTAssertTrue(tap.resignsKeyboard, "Le clavier ouvert se ferme du même toucher.")
        XCTAssertFalse(tap.focusesField)
        XCTAssertEqual(StoryComposerFold.presentation(userFolded: tap.userFolded, isReplying: false), .folded)
    }

    func test_theBubble_reopensTheComposer_withoutTheKeyboard() {
        let tap = StoryComposerFold.bubbleTapped
        XCTAssertFalse(tap.userFolded)
        XCTAssertFalse(tap.focusesField, "La bulle rouvre le composeur, pas le clavier.")
        XCTAssertFalse(tap.resignsKeyboard)
        XCTAssertEqual(StoryComposerFold.presentation(userFolded: tap.userFolded, isReplying: false), .expanded)
    }

    /// Chaque toucher déplace la zone : replier la fait redescendre, rouvrir
    /// la fait remonter.
    func test_eachTap_movesTheZone() {
        let typing = Self.frame(.typing, keyboardHeight: 336)
        let folded = Self.frame(.folded, composerHeight: 44)
        let reopened = Self.frame(.expanded, composerHeight: 92)
        XCTAssertLessThan(folded.topEdge, typing.topEdge)
        XCTAssertGreaterThan(reopened.topEdge, folded.topEdge)
    }

    /// Toujours visible : le chevron ne dépend que du dépliage, ni du clavier
    /// ni du contenu du champ.
    func test_theChevron_isOfferedWheneverTheComposerIsExpanded() {
        XCTAssertTrue(StoryComposerFold.offersFoldButton(presentation: .expanded))
        XCTAssertFalse(StoryComposerFold.offersFoldButton(presentation: .folded))
    }

    // MARK: - Site

    /// Le lecteur pose la question à la loi, et la liste ne réserve plus de
    /// constante (92 / 142 pt) ni de fraction à elle.
    func test_theOverlayAndTheCard_consultTheLaw() throws {
        let views = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views")
        let layer = AppSourceGuard.stripComments(try String(
            contentsOf: views.appendingPathComponent("StoryViewerView+CanvasComposerLayer.swift"), encoding: .utf8))
        XCTAssertTrue(layer.contains("StoryCommentsZone.state("))
        XCTAssertTrue(layer.contains("StoryCommentsZone.frame("))
        XCTAssertTrue(layer.contains("StoryComposerFold.chevronTapped"))
        XCTAssertTrue(layer.contains("StoryComposerFold.bubbleTapped"))

        let content = AppSourceGuard.stripComments(try String(
            contentsOf: views.appendingPathComponent("StoryViewerView+Content.swift"), encoding: .utf8))
        XCTAssertFalse(content.contains("composerSpaceReservation"), "plus de réserve constante")
        XCTAssertFalse(content.contains("window * 0.42"), "plus de fraction propre à la liste")
        XCTAssertTrue(content.contains(".frame(maxHeight: zone.maxHeight)"))
        XCTAssertTrue(content.contains(".padding(.bottom, zone.bottomInset)"))
    }
}
