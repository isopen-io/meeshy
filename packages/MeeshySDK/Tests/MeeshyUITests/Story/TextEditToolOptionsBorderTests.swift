import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class TextEditToolOptionsBorderTests: XCTestCase {

    func test_initializeBorderDefaultsIfNeutral_neutralState_setsWhiteAnd4pt() {
        var obj = StoryTextObject(text: "Hello")
        obj.borderColor = nil
        obj.borderWidth = nil

        TextEditToolOptions.initializeBorderDefaultsIfNeutral(on: &obj)

        XCTAssertEqual(obj.borderColor, "FFFFFF")
        XCTAssertEqual(obj.borderWidth, 4)
    }

    func test_initializeBorderDefaultsIfNeutral_withExistingValues_keepsThem() {
        var obj = StoryTextObject(text: "Hi", borderColor: "FF0000", borderWidth: 8)

        TextEditToolOptions.initializeBorderDefaultsIfNeutral(on: &obj)

        XCTAssertEqual(obj.borderColor, "FF0000")
        XCTAssertEqual(obj.borderWidth, 8)
    }

    func test_initializeBorderDefaultsIfNeutral_partiallySet_keepsValues() {
        // Si le user a déjà choisi une couleur mais pas de width, on ne touche pas.
        // (Ce cas ne devrait pas survenir en pratique : le slider pose toujours
        // les deux ensemble. Mais on garde le comportement défensif.)
        var obj = StoryTextObject(text: "Hi", borderColor: "00FF00", borderWidth: nil)

        TextEditToolOptions.initializeBorderDefaultsIfNeutral(on: &obj)

        XCTAssertEqual(obj.borderColor, "00FF00", "borderColor existant doit être préservé")
        XCTAssertNil(obj.borderWidth, "borderWidth doit rester nil — le user a explicitement laissé sans width")
    }

    func test_sliderAtZero_keepsBorderColorForLaterRebump() {
        // Mirror du comportement attendu : le slider à 0 NE doit PAS nullifier
        // borderColor — l'utilisateur garde son choix de couleur pour quand il
        // remonte le slider.
        var obj = StoryTextObject(text: "X", borderColor: "FFFFFF", borderWidth: 0)

        // Simule un re-tap sur le tool border : on N'écrase PAS (les deux sont set)
        TextEditToolOptions.initializeBorderDefaultsIfNeutral(on: &obj)

        XCTAssertEqual(obj.borderColor, "FFFFFF", "Color preserved at slider=0")
        XCTAssertEqual(obj.borderWidth, 0, "Width stays at 0 — no auto-rebump")
    }
}
