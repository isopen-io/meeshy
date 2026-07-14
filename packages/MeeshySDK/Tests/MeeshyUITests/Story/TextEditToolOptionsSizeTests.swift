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
}
