import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Retour user 2026-07-11 : « le background tool doit changer le fond EN
/// DIRECT ». Le tap palette posait `viewModel.backgroundColor` mais rien ne
/// l'écrivait dans `currentSlide.effects.background` avant le prochain sync
/// (publish/autosave) — le canvas ne re-rendait pas.
@MainActor
final class StoryComposerBackgroundLiveApplyTests: XCTestCase {

    func test_backgroundColor_plainHex_appliesToCurrentSlideImmediately() {
        let vm = StoryComposerViewModel()

        vm.backgroundColor = "#FF00AA"

        XCTAssertEqual(vm.currentSlide.effects.background, "FF00AA",
                       "Le fond doit atterrir dans la slide (sans '#', format effects) dès la sélection")
    }

    func test_backgroundColor_gradient_appliesSerializedValue() {
        let vm = StoryComposerViewModel()

        vm.backgroundColor = "gradient:112233:445566"

        XCTAssertEqual(vm.currentSlide.effects.background, "gradient:112233:445566")
    }

    func test_backgroundColor_sameValue_noSlideChurn() {
        let vm = StoryComposerViewModel()
        vm.backgroundColor = "#FF00AA"
        let before = vm.currentSlide.effects.background

        vm.backgroundColor = "#FF00AA"

        XCTAssertEqual(vm.currentSlide.effects.background, before,
                       "Re-sélectionner la même couleur ne doit pas dirty la slide")
    }
}
