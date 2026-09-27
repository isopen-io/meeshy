import XCTest
import CoreGraphics
import MeeshyUI
@testable import Meeshy

/// **Le composeur du lecteur de story : sa place, son geste, son repli** (#8431,
/// directive porteur 2026-09-28).
///
/// Quatre moitiés d'une même directive :
///  1. le texte de la story se pose EXACTEMENT au-dessus du composeur ;
///  2. en commentaire, la plaque n'offre ni flamme ni vue unique ;
///  3. en rédaction, un ⌄ replie le bloc ;
///  4. le glissé bas SUR le composeur lui appartient et le replie, ne laissant
///     qu'un bouton à l'icône de commentaire.
final class StoryComposerFoldTests: XCTestCase {

    // MARK: - 1 · Placement du texte

    func test_captionBottom_touchesTheTopOfTheMeasuredComposer() {
        let inset = StoryCaptionPlacement.bottomInset(
            composerBlockHeight: 104, composerBottomPadding: 54,
            isComposerShown: true, fallback: 189)
        XCTAssertEqual(inset, 158, "Bord bas du texte = haut de la plaque : retrait bas + hauteur mesurée, sans écart.")
    }

    func test_captionBottom_followsTheComposerWhenItGrows() {
        let resting = StoryCaptionPlacement.bottomInset(
            composerBlockHeight: 104, composerBottomPadding: 54, isComposerShown: true, fallback: 189)
        let withKeyboard = StoryCaptionPlacement.bottomInset(
            composerBlockHeight: 104, composerBottomPadding: 336, isComposerShown: true, fallback: 189)
        XCTAssertGreaterThan(withKeyboard, resting)
        XCTAssertEqual(withKeyboard, 440)
    }

    func test_captionBottom_dropsOnTheFoldedButton() {
        let folded = StoryCaptionPlacement.bottomInset(
            composerBlockHeight: 44, composerBottomPadding: 54, isComposerShown: true, fallback: 189)
        XCTAssertEqual(folded, 98, "Replié, le texte descend juste au-dessus du bouton de réouverture.")
    }

    func test_captionBottom_withoutComposer_keepsItsHistoricPlace() {
        XCTAssertEqual(StoryCaptionPlacement.bottomInset(
            composerBlockHeight: nil, composerBottomPadding: 54, isComposerShown: true, fallback: 189), 189)
        XCTAssertEqual(StoryCaptionPlacement.bottomInset(
            composerBlockHeight: 0, composerBottomPadding: 54, isComposerShown: true, fallback: 189), 189)
    }

    func test_captionBottom_withHiddenChrome_reclaimsTheComposerBand() {
        XCTAssertEqual(StoryCaptionPlacement.bottomInset(
            composerBlockHeight: 104, composerBottomPadding: 54, isComposerShown: false, fallback: 189), 54)
    }

    // MARK: - 2 · Effets offerts en commentaire

    @MainActor
    func test_commentComposer_offersNeitherFlameNorViewOnce_butKeepsEffects() {
        let offersFlame = ComposerMode.comment.showEphemeral
        let hidesViewOnce = UniversalComposerBar.hidesViewOnce(mode: .comment, hideViewOnce: false)
        let offersCommentEffects = ComposerMode.comment.showPermanentEffects
        XCTAssertFalse(offersFlame, "Flamme (éphémère) : jamais sur un commentaire.")
        XCTAssertTrue(hidesViewOnce, "Vue unique : jamais sur un commentaire.")
        XCTAssertTrue(offersCommentEffects, "Les effets d'un commentaire restent offerts.")
    }

    @MainActor
    func test_messageComposer_stillOffersViewOnce_exceptInEdition() {
        let message = UniversalComposerBar.hidesViewOnce(mode: .message, hideViewOnce: false)
        let editing = UniversalComposerBar.hidesViewOnce(mode: .message, hideViewOnce: true)
        let noMode = UniversalComposerBar.hidesViewOnce(mode: nil, hideViewOnce: false)
        XCTAssertFalse(message)
        XCTAssertTrue(editing)
        XCTAssertFalse(noMode, "Sans mode (réponse à un média), la vue unique reste offerte (#7472).")
    }

    @MainActor
    func test_viewOnce_isAMessageProtectionOnly() {
        let offered = [ComposerMode.message, .post, .status, .story, .comment, .caption]
            .filter { $0.showViewOnce }
        XCTAssertEqual(offered, [.message])
    }

    func test_theStoryComposer_keepsTheBlurToggle() throws {
        let views = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views")
        let bar = try String(contentsOf: views.appendingPathComponent("StoryViewerView+CanvasComposerBar.swift"), encoding: .utf8)
        XCTAssertTrue(bar.contains("mode: .comment"))
        XCTAssertTrue(bar.contains("isBlurEnabled: $commentBlurEnabled"), "Le flou reste offert au commentaire de story.")
        XCTAssertFalse(bar.contains("hideBlur: true"))
    }

    // MARK: - 3 · Bouton ⌄ en rédaction

    func test_foldButton_existsOnlyWhileWriting() {
        XCTAssertTrue(StoryComposerFold.offersFoldButton(presentation: .expanded, isComposerEngaged: true))
        XCTAssertFalse(StoryComposerFold.offersFoldButton(presentation: .expanded, isComposerEngaged: false))
        XCTAssertFalse(StoryComposerFold.offersFoldButton(presentation: .folded, isComposerEngaged: true))
        XCTAssertEqual(StoryComposerFold.foldSymbol, "chevron.down")
    }

    // MARK: - 4 · Glissé bas sur le composeur

    func test_aVerticalSwipeOnTheComposer_belongsToTheComposer() {
        XCTAssertEqual(StoryComposerGesture.owner(translation: CGSize(width: 0, height: 20)), .composer)
        XCTAssertEqual(StoryComposerGesture.owner(translation: CGSize(width: 3, height: -20)), .composer)
    }

    func test_aHorizontalSwipeOrATremor_staysWithTheReader() {
        XCTAssertEqual(StoryComposerGesture.owner(translation: CGSize(width: 40, height: 10)), .story,
                       "On change encore de story depuis la bande basse.")
        XCTAssertEqual(StoryComposerGesture.owner(translation: CGSize(width: 0, height: 5)), .story,
                       "Le tremblement d'un tap ne revendique rien.")
    }

    func test_theComposerClaims_beforeTheReaderWakes() {
        XCTAssertLessThan(StoryComposerGesture.verticalClaimDistance, 15,
                          "Le lecteur s'éveille à 15 pt : revendiquer après, c'est laisser la story se refermer.")
    }

    func test_onlyADownwardSwipeFolds() {
        XCTAssertTrue(StoryComposerGesture.folds(translation: CGSize(width: 5, height: 60)))
        XCTAssertFalse(StoryComposerGesture.folds(translation: CGSize(width: 0, height: -60)))
        XCTAssertFalse(StoryComposerGesture.folds(translation: CGSize(width: 0, height: 20)))
        XCTAssertFalse(StoryComposerGesture.folds(translation: CGSize(width: 90, height: 60)))
    }

    func test_folded_leavesOnlyTheCommentIcon_andAReplyUnfolds() {
        XCTAssertEqual(StoryComposerFold.presentation(userFolded: true, isReplying: false), .folded)
        XCTAssertEqual(StoryComposerFold.presentation(userFolded: true, isReplying: true), .expanded,
                       "La bannière « Réponse à X » vit dans le composeur.")
        XCTAssertEqual(StoryComposerFold.presentation(userFolded: false, isReplying: false), .expanded)
        XCTAssertNotEqual(StoryComposerFold.unfoldSymbol, "chevron.up", "Pas de ⌃ : l'icône de commentaire.")
    }

    // MARK: - Site

    func test_theReaderYieldsToTheComposer_andTheLayerConsultsTheLaws() throws {
        let views = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views")
        let content = try String(contentsOf: views.appendingPathComponent("StoryViewerView+Content.swift"), encoding: .utf8)
        XCTAssertTrue(content.contains("!composerOwnsDrag"), "Le drag du lecteur doit céder au composeur.")
        let layer = try String(contentsOf: views.appendingPathComponent("StoryViewerView+CanvasComposerLayer.swift"), encoding: .utf8)
        XCTAssertTrue(layer.contains("StoryComposerGesture.owner("))
        XCTAssertTrue(layer.contains("StoryComposerGesture.folds("))
        XCTAssertTrue(layer.contains("StoryComposerFold.offersFoldButton("))
        let caption = try String(contentsOf: views.appendingPathComponent("StoryViewerView+CanvasCaption.swift"), encoding: .utf8)
        XCTAssertTrue(layer.contains("StoryCaptionPlacement.bottomInset("))
        XCTAssertEqual(caption.components(separatedBy: ".padding(.bottom, captionBottomInset(geometry: geometry))").count - 1, 2,
                       "La légende ET la transcription se posent sur le composeur.")
        XCTAssertFalse(caption.contains(".padding(.bottom, topInset + 130)"), "Le texte ne se pose plus à une hauteur arbitraire.")
    }
}
