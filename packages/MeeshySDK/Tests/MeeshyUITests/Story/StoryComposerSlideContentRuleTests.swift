import XCTest
import MeeshySDK
@testable import MeeshyUI

/// S5 — variante SLIDE-scoped de la règle « porte du contenu ».
///
/// `composerHasContent` scanne TOUTES les slides : il répond « le composer
/// a-t-il quelque chose à publier ». La page blanche d'auteur pose une autre
/// question — « la slide que je REGARDE est-elle vierge » — et les deux
/// divergent dès la 2ᵉ slide. Une seule primitive (`slideHasContent`) porte
/// les deux : la liste des champs de contenu ne peut plus dériver entre elles.
final class StoryComposerSlideContentRuleTests: XCTestCase {

    private func slideHasContent(
        _ slide: StorySlide,
        hasSlideImage: Bool = false,
        stickers: Bool = false,
        drawingData: Bool = false,
        drawingStrokes: Bool = false
    ) -> Bool {
        StoryComposerView.slideHasContent(
            slide,
            hasSlideImage: hasSlideImage,
            hasStickerObjects: stickers,
            hasDrawingData: drawingData,
            hasDrawingStrokes: drawingStrokes
        )
    }

    func test_slideHasContent_freshSlide_returnsFalse() {
        XCTAssertFalse(slideHasContent(StorySlide()))
    }

    func test_slideHasContent_autoPastelBackgroundOnly_returnsFalse() {
        // Le fond pastel est posé d'office à l'`onAppear` du canvas : le compter
        // rendrait TOUTE slide non vierge dès le premier frame.
        var slide = StorySlide()
        slide.effects.background = "#FFD9E8"
        XCTAssertFalse(slideHasContent(slide))
    }

    func test_slideHasContent_withText_returnsTrue() {
        var slide = StorySlide()
        slide.content = "Bonjour"
        XCTAssertTrue(slideHasContent(slide))
    }

    func test_slideHasContent_withAttachedImage_returnsTrue() {
        XCTAssertTrue(slideHasContent(StorySlide(), hasSlideImage: true))
    }

    // MARK: - Le texte VIDE n'est pas du contenu

    private func slide(withTextObjects texts: [String]) -> StorySlide {
        var slide = StorySlide()
        slide.effects.textObjects = texts.map { StoryTextObject(text: $0) }
        return slide
    }

    /// Le tap sur la page blanche appelle `addText()`, qui pose IMMÉDIATEMENT
    /// un `StoryTextObject` au texte vide pour que l'éditeur ait une cible.
    /// Compter cette coquille comme du contenu rendait la slide « remplie »
    /// avant la première frappe — et ouvrait l'autosave sur le slot unique de
    /// `StoryDraftStore`, qui contenait peut-être le brouillon de la veille.
    /// Seule l'intention RÉELLE compte (même arbitrage que le fond auto en S2).
    func test_slideHasContent_emptyTextObjectOnly_returnsFalse() {
        XCTAssertFalse(slideHasContent(slide(withTextObjects: [""])))
    }

    /// Même trim que `exitTextEditingMode`, qui supprime le fantôme à la
    /// sortie : les deux règles doivent voir la même chose, sinon la fenêtre
    /// entre la saisie d'un espace et la sortie de l'éditeur redevient ouverte.
    func test_slideHasContent_whitespaceOnlyTextObject_returnsFalse() {
        XCTAssertFalse(slideHasContent(slide(withTextObjects: ["   \n\t "])))
    }

    func test_slideHasContent_textObjectCarryingRealText_returnsTrue() {
        XCTAssertTrue(slideHasContent(slide(withTextObjects: ["Bonjour"])))
    }

    func test_slideHasContent_oneRealTextAmongEmptyOnes_returnsTrue() {
        XCTAssertTrue(slideHasContent(slide(withTextObjects: ["", "Bonjour", "  "])))
    }

    /// `composerHasContent` est la SEULE source de vérité de l'alerte de sortie
    /// (`handleDismiss`), du gate d'autosave (`mayOverwriteStoredDraft`), de la
    /// bande de slides du header (`shouldShowFloatingSlideStrip`, l'affordance
    /// qui accompagne Publier) et de la purge des brouillons fantômes. Un texte
    /// vide ne doit en armer AUCUN.
    func test_composerHasContent_slidesCarryingOnlyEmptyTexts_returnsFalse() {
        XCTAssertFalse(
            StoryComposerView.composerHasContent(
                slides: [slide(withTextObjects: [""]), slide(withTextObjects: ["  "])],
                slideImageIds: [],
                hasStickerObjects: false,
                hasDrawingData: false,
                hasDrawingStrokes: false
            ),
            "Rien n'a été saisi : ni alerte de sortie, ni bande de slides, ni brouillon écrit."
        )
    }

    func test_slideHasContent_withGlobalStrokes_returnsTrue() {
        XCTAssertTrue(slideHasContent(StorySlide(), drawingStrokes: true))
    }

    /// Le cœur de la correction : la 2ᵉ slide fraîche derrière une 1ʳᵉ remplie
    /// est une page blanche, alors que `composerHasContent` reste vrai.
    func test_freshSecondSlide_isBlankWhileTheComposerStillHasContent() {
        var first = StorySlide()
        first.content = "Slide 1"
        let second = StorySlide()

        XCTAssertTrue(
            StoryComposerView.composerHasContent(
                slides: [first, second],
                slideImageIds: [],
                hasStickerObjects: false,
                hasDrawingData: false,
                hasDrawingStrokes: false
            ),
            "Le composer a bien de quoi publier."
        )
        XCTAssertFalse(
            slideHasContent(second),
            "…mais la slide REGARDÉE est vierge : même apparence qu'à l'ouverture, donc mêmes amorces."
        )
    }
}
