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

    func test_slideWithBackgroundEffect_hasContent() {
        var slide = StorySlide()
        var effects = StoryEffects()
        effects.background = "FF0000"
        slide.effects = effects
        XCTAssertTrue(hasContent(slides: [slide]))
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
}
