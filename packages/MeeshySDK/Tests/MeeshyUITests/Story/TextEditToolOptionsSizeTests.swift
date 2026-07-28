import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class TextEditToolOptionsSizeTests: XCTestCase {

    func test_displayedSize_multipliesFontSizeByScale() {
        var obj = StoryTextObject(text: "Hi")
        obj.fontSize = 40
        obj.scale = 1.5

        XCTAssertEqual(TextEditToolOptions.displayedSize(for: obj), 60, accuracy: 0.0001)
    }

    func test_displayedSize_withDefaultScale_equalsRawFontSize() {
        var obj = StoryTextObject(text: "Hi")
        obj.fontSize = 40
        obj.scale = 1.0

        XCTAssertEqual(TextEditToolOptions.displayedSize(for: obj), 40, accuracy: 0.0001)
    }

    func test_applyingSliderValue_setsFontSizeAndResetsScale() {
        var obj = StoryTextObject(text: "Hi")
        obj.fontSize = 40
        obj.scale = 2.0 // leftover from a prior pinch

        TextEditToolOptions.applyingSliderValue(90, to: &obj)

        XCTAssertEqual(obj.fontSize, 90, accuracy: 0.0001)
        XCTAssertEqual(
            obj.scale, 1.0, accuracy: 0.0001,
            "A manual slider drag must clear any leftover pinch scale so it never compounds with the new value."
        )
    }

    // MARK: - Curseur de graisse

    func test_weightSlider_readsTheCurrentWeightAsARank() {
        var obj = StoryTextObject(id: "t1", text: "X")
        obj.fontWeight = StoryTextWeight.bold.rawValue
        XCTAssertEqual(TextEditToolOptions.weightSliderValue(for: obj), 3)

        obj.fontWeight = StoryTextWeight.thin.rawValue
        XCTAssertEqual(TextEditToolOptions.weightSliderValue(for: obj), 0)
    }

    /// Aucune graisse posée ⇒ le curseur part de « normal », la même valeur
    /// que celle lue partout ailleurs. Sans ce repli il démarrerait à « fin »
    /// et le premier drag épaissirait un texte que l'auteur n'a pas touché.
    func test_weightSlider_whenUnset_readsNormal() {
        let obj = StoryTextObject(id: "t1", text: "X")
        XCTAssertEqual(TextEditToolOptions.weightSliderValue(for: obj), 1)
    }

    func test_weightSlider_writesTheMatchingWeight() {
        var obj = StoryTextObject(id: "t1", text: "X")
        TextEditToolOptions.applyingWeightSliderValue(2, to: &obj)
        XCTAssertEqual(obj.parsedFontWeight, .semibold)
    }

    func test_weightSlider_clampsOutOfRangeRanks() {
        var obj = StoryTextObject(id: "t1", text: "X")
        TextEditToolOptions.applyingWeightSliderValue(-4, to: &obj)
        XCTAssertEqual(obj.parsedFontWeight, .thin)
        TextEditToolOptions.applyingWeightSliderValue(99, to: &obj)
        XCTAssertEqual(obj.parsedFontWeight, .bold)
    }
}
