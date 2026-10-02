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
            isComposerShown: true)
        XCTAssertEqual(inset, 158, "Bord bas du texte = haut de la plaque : retrait bas + hauteur mesurée, sans écart.")
    }

    func test_captionBottom_followsTheComposerWhenItGrows() {
        let resting = StoryCaptionPlacement.bottomInset(
            composerBlockHeight: 104, composerBottomPadding: 54, isComposerShown: true)
        let withKeyboard = StoryCaptionPlacement.bottomInset(
            composerBlockHeight: 104, composerBottomPadding: 336, isComposerShown: true)
        XCTAssertGreaterThan(withKeyboard, resting)
        XCTAssertEqual(withKeyboard, 440)
    }

    func test_captionBottom_dropsOnTheFoldedButton() {
        let folded = StoryCaptionPlacement.bottomInset(
            composerBlockHeight: 44, composerBottomPadding: 54, isComposerShown: true)
        XCTAssertEqual(folded, 98, "Replié, le texte descend juste au-dessus du bouton de réouverture.")
    }

    /// #9072 — sur SA story il n'y a pas de composeur : le texte se pose au
    /// ras du bas (zone sûre + respiration), plus à `topInset + 130`.
    func test_captionBottom_withoutComposer_restsOnTheBottomPadding() {
        XCTAssertEqual(StoryCaptionPlacement.bottomInset(
            composerBlockHeight: nil, composerBottomPadding: 54, isComposerShown: true), 54)
        XCTAssertEqual(StoryCaptionPlacement.bottomInset(
            composerBlockHeight: 0, composerBottomPadding: 54, isComposerShown: true), 54)
    }

    func test_captionBottom_withoutComposerAndHiddenChrome_staysOnTheBottomPadding() {
        XCTAssertEqual(StoryCaptionPlacement.bottomInset(
            composerBlockHeight: nil, composerBottomPadding: 54, isComposerShown: false), 54)
    }

    func test_captionBottom_withHiddenChrome_reclaimsTheComposerBand() {
        XCTAssertEqual(StoryCaptionPlacement.bottomInset(
            composerBlockHeight: 104, composerBottomPadding: 54, isComposerShown: false), 54)
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

    // MARK: - 3 · Bouton ⌄ visible d'emblée (#9122)

    /// Le ⌄ n'existait qu'en RÉDACTION : au repos, rien ne disait que la barre
    /// se repliait. Il est désormais visible PAR DÉFAUT, tant qu'elle est
    /// dépliée.
    func test_foldButton_isVisibleByDefault_whileExpanded() {
        XCTAssertTrue(StoryComposerFold.offersFoldButton(presentation: .expanded))
        XCTAssertFalse(StoryComposerFold.offersFoldButton(presentation: .folded))
        XCTAssertEqual(StoryComposerFold.foldSymbol, "chevron.down")
    }

    /// **Tout espace commentaire se replie** (#9122) : les commentaires du fil
    /// et ceux du détail d'un post montent la même loi, par le même modificateur.
    func test_everyCommentSpace_foldsToACommentIcon() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let views = root.appendingPathComponent("Meeshy/Features/Main/Views")
        let sheet = try String(contentsOf: views.appendingPathComponent("FeedCommentsSheet.swift"), encoding: .utf8)
        let detail = try String(contentsOf: views.appendingPathComponent("PostDetailView.swift"), encoding: .utf8)
        XCTAssertTrue(sheet.contains("commentComposer.foldableComment(isReplying: replyingTo != nil)"))
        XCTAssertTrue(detail.contains("composer.foldableComment(isReplying: viewModel.replyingTo != nil)"))
        let bar = try String(contentsOf: root.appendingPathComponent(
            "Meeshy/Features/Main/Components/UniversalComposerBar+Toolbar.swift"), encoding: .utf8)
        XCTAssertTrue(bar.contains("offersFold: resolvedFoldControl != nil"), "La barre lit aussi le repli confié par l'environnement.")
    }

    /// **Le ⌄ vit DANS la plaque de verre, angle intérieur haut-droit** (#8642,
    /// porteur 2026-09-29). Il flottait au-dessus de la plaque, hors du verre :
    /// la barre le reçoit désormais et le pose au bout de sa rangée d'outils —
    /// la bande `trailing`, qui ne défile jamais (#7997).
    func test_foldButton_livesInsideTheGlassPlate() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let views = root.appendingPathComponent("Meeshy/Features/Main/Views")
        let components = root.appendingPathComponent("Meeshy/Features/Main/Components")

        let layer = AppSourceGuard.stripComments(try String(
            contentsOf: views.appendingPathComponent("StoryViewerView+CanvasComposerLayer.swift"), encoding: .utf8))
        XCTAssertFalse(layer.contains("composerFoldButton"),
                       "plus aucun ⌄ ne flotte au-dessus de la plaque")
        XCTAssertTrue(layer.contains("foldControl: composerFoldControl"),
                      "le lecteur remet le repli à la barre")
        XCTAssertTrue(layer.contains("StoryComposerFold.offersFoldButton("), "sous la même loi")

        let bar = try String(contentsOf: views.appendingPathComponent("StoryViewerView+CanvasComposerBar.swift"), encoding: .utf8)
        XCTAssertTrue(bar.contains("foldControl: foldControl"))

        let toolbar = AppSourceGuard.stripComments(try String(
            contentsOf: components.appendingPathComponent("UniversalComposerBar+Toolbar.swift"), encoding: .utf8))
        let trailing = try XCTUnwrap(toolbar.range(of: "} trailing: {"))
        let bande = toolbar[trailing.upperBound...].prefix(900)
        XCTAssertTrue(bande.contains("resolvedFoldControl"),
                      "le ⌄ est au bout de la rangée d'outils, dans le verre")
        XCTAssertTrue(toolbar.contains("Image(systemName: fold.symbol)"), "le glyphe est celui que l'hôte déclare")
        XCTAssertTrue(layer.contains("symbol: StoryComposerFold.foldSymbol"))
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
        XCTAssertFalse(layer.contains("topInset + 130"), "Sans composeur, le texte ne flotte plus à une hauteur tirée du HAUT de l'écran (#9072).")
        XCTAssertEqual(caption.components(separatedBy: ".padding(.bottom, captionBottomInset(geometry: geometry))").count - 1, 2,
                       "La légende ET la transcription se posent sur le composeur.")
        XCTAssertFalse(caption.contains(".padding(.bottom, topInset + 130)"), "Le texte ne se pose plus à une hauteur arbitraire.")
    }
}
