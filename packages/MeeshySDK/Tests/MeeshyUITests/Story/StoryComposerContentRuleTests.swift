import XCTest
import MeeshySDK
@testable import MeeshyUI

/// Règle pure « le composer story porte du contenu » — partagée par l'alerte
/// de sortie (handleDismiss) et l'auto-save D1 au passage en background.
/// Un faux positif re-sauverait des composers vides à chaque background ;
/// un faux négatif perdrait le travail de l'utilisateur au kill.
final class StoryComposerContentRuleTests: XCTestCase {

    private func hasContent(
        slides: [StorySlide] = [StorySlide()],
        slideImageIds: Set<String> = [],
        stickers: Bool = false,
        drawingData: Bool = false,
        drawingStrokes: Bool = false
    ) -> Bool {
        StoryComposerView.composerHasContent(
            slides: slides,
            slideImageIds: slideImageIds,
            hasStickerObjects: stickers,
            hasDrawingData: drawingData,
            hasDrawingStrokes: drawingStrokes
        )
    }

    func test_emptyComposer_hasNoContent() {
        XCTAssertFalse(hasContent())
    }

    func test_noSlides_hasNoContent() {
        XCTAssertFalse(hasContent(slides: []))
    }

    func test_slideWithText_hasContent() {
        var slide = StorySlide()
        slide.content = "Bonjour"
        XCTAssertTrue(hasContent(slides: [slide]))
    }

    func test_slideWithAttachedImage_hasContent() {
        let slide = StorySlide()
        XCTAssertTrue(hasContent(slides: [slide], slideImageIds: [slide.id]))
    }

    func test_imageForAnotherSlide_doesNotCount() {
        let slide = StorySlide()
        XCTAssertFalse(hasContent(slides: [slide], slideImageIds: ["other-slide"]))
    }

    /// Un fond seul — auto-appliqué à l'ouverture ou choisi explicitement dans
    /// le panneau Fond — n'a de valeur narrative que combiné à un autre
    /// élément (texte, média, dessin, sticker, lieu). Aucun leader SOTA ne
    /// permet de publier un rectangle coloré vide (décision arbitrage S2).
    func test_slideWithBackgroundAlone_hasNoContent() {
        var slide = StorySlide()
        var effects = StoryEffects()
        effects.background = "FF0000"
        slide.effects = effects
        XCTAssertFalse(hasContent(slides: [slide]))
    }

    /// Le fond ne masque pas un contenu réel coexistant sur le même slide.
    func test_slideWithBackgroundAndText_stillHasContent() {
        var slide = StorySlide()
        var effects = StoryEffects()
        effects.background = "FF0000"
        slide.content = "Bonjour"
        slide.effects = effects
        XCTAssertTrue(hasContent(slides: [slide]))
    }

    /// Un sticker posé sur un slide AUTRE que celui affiché doit être détecté
    /// — le paramètre global `stickers` ne couvre que le slide courant, donc
    /// il reste `false` ici pour isoler le scan per-slide.
    func test_stickerOnNonCurrentSlide_hasContent() {
        var otherSlide = StorySlide()
        otherSlide.effects.stickerObjects = [StorySticker(emoji: "🎉")]
        XCTAssertTrue(hasContent(slides: [StorySlide(), otherSlide], stickers: false))
    }

    /// Dessin legacy (`drawingData`) posé directement sur un slide, hors du
    /// paramètre global `drawingData` (isolé à `false` pour prouver que la
    /// branche per-slide, pas le filet de sécurité, détecte le contenu).
    func test_legacyDrawingDataOnSlide_hasContent() {
        var slide = StorySlide()
        slide.effects.drawingData = Data([0x01, 0x02])
        XCTAssertTrue(hasContent(slides: [slide], drawingData: false))
    }

    func test_slideWithTextObject_hasContent() {
        var slide = StorySlide()
        var effects = StoryEffects()
        effects.textObjects = [StoryTextObject(text: "Hello")]
        slide.effects = effects
        XCTAssertTrue(hasContent(slides: [slide]))
    }

    func test_stickersAlone_haveContent() {
        XCTAssertTrue(hasContent(stickers: true))
    }

    func test_drawingDataAlone_hasContent() {
        XCTAssertTrue(hasContent(drawingData: true))
    }

    func test_drawingStrokesAlone_haveContent() {
        XCTAssertTrue(hasContent(drawingStrokes: true))
    }

    func test_secondSlideWithContent_isEnough() {
        var second = StorySlide()
        second.content = "Slide 2"
        XCTAssertTrue(hasContent(slides: [StorySlide(), second]))
    }

    func test_slideWithLocationObject_hasContent() {
        var slide = StorySlide()
        var effects = StoryEffects()
        effects.locationObjects = [
            StoryLocationObject(place: SharedPlace(latitude: 48.8566, longitude: 2.3522))
        ]
        slide.effects = effects
        XCTAssertTrue(hasContent(slides: [slide]))
    }
}
