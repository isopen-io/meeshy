import XCTest
import MeeshySDK
@testable import MeeshyUI

/// **« Tout effacer » rend la scène NEUTRE** (#13839, défaut 28b de l'audit) :
/// la remise à zéro tirait une teinte pastel au hasard et la posait sur la
/// slide neuve — une scène rose au lieu de la scène noire de l'ouverture.
@MainActor
final class StoryComposerViewModelResetTests: XCTestCase {

    func test_reset_afterAChosenColor_leavesTheNewSlideWithoutBackground() {
        let composer = StoryComposerViewModel()
        composer.applyBackground(hex: "FF2E63")
        XCTAssertEqual(composer.currentSlide.effects.background, "FF2E63")

        composer.reset()

        XCTAssertNil(composer.currentSlide.effects.background,
                     "La scène effacée retrouve le fond neutre de l'ouverture, jamais une teinte tirée au sort.")
    }

    func test_reset_onAFreshComposer_matchesTheOpeningScene() {
        let ouverture = StoryComposerViewModel()
        let effacee = StoryComposerViewModel()
        effacee.reset()
        XCTAssertEqual(effacee.currentSlide.effects.background, ouverture.currentSlide.effects.background)
    }
}
