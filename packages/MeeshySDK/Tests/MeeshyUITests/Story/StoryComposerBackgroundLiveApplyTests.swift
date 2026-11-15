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

    // F2 (#3885) — l'hôte app (composer POST) sème un fond par le point d'entrée
    // PUBLIC `applyBackground(hex:)`, avec un hex NU (la palette partagée).
    func test_applyBackground_hexNu_normaliseEtAtterritDansLaSlide() {
        let vm = StoryComposerViewModel()

        vm.applyBackground(hex: "1E90FF")

        XCTAssertEqual(vm.backgroundColor, "#1E90FF",
                       "Le point d'entrée public préfixe le `#` — l'hôte passe un hex nu.")
        XCTAssertEqual(vm.currentSlide.effects.background, "1E90FF",
                       "…et le `didSet` propage à la slide courante (format effects, sans '#').")
    }

    func test_applyBackground_hexDejaPrefixe_neDoublePasLeDieze() {
        let vm = StoryComposerViewModel()

        vm.applyBackground(hex: "#0A0A0A")

        XCTAssertEqual(vm.backgroundColor, "#0A0A0A",
                       "Un hex déjà préfixé n'est pas doublé.")
        XCTAssertEqual(vm.currentSlide.effects.background, "0A0A0A")
    }
}
