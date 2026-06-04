import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryTextLayerBorderTests: XCTestCase {

    func test_strokeAttributes_borderWidthZero_skipsStrokeEntirely() {
        var obj = StoryTextObject(text: "Hello")
        obj.borderColor = "FFFFFF"
        obj.borderWidth = 0

        let attrs = StoryTextLayer.strokeAttributes(for: obj, designFontSize: 32)
        XCTAssertNil(attrs[.strokeColor])
        XCTAssertNil(attrs[.strokeWidth])
    }

    func test_strokeAttributes_borderWidthNil_skipsStroke() {
        var obj = StoryTextObject(text: "Hello")
        obj.borderColor = "FFFFFF"
        obj.borderWidth = nil

        let attrs = StoryTextLayer.strokeAttributes(for: obj, designFontSize: 32)
        XCTAssertNil(attrs[.strokeColor])
        XCTAssertNil(attrs[.strokeWidth])
    }

    func test_strokeAttributes_borderColorNil_skipsStroke() {
        var obj = StoryTextObject(text: "Hello")
        obj.borderColor = nil
        obj.borderWidth = 4

        let attrs = StoryTextLayer.strokeAttributes(for: obj, designFontSize: 32)
        XCTAssertNil(attrs[.strokeColor])
        XCTAssertNil(attrs[.strokeWidth])
    }

    func test_strokeAttributes_borderWidth4_appliesStroke() {
        var obj = StoryTextObject(text: "Hi")
        obj.borderColor = "FF0000"
        obj.borderWidth = 4

        let attrs = StoryTextLayer.strokeAttributes(for: obj, designFontSize: 32)
        XCTAssertNotNil(attrs[.strokeColor])
        XCTAssertNotNil(attrs[.strokeWidth])
        if let width = attrs[.strokeWidth] as? CGFloat {
            // strokeWidth = -(4 / 32) * 100 = -12.5
            XCTAssertEqual(width, -12.5, accuracy: 0.01)
        } else {
            XCTFail("strokeWidth should be a CGFloat")
        }
    }

    func test_strokeAttributes_invalidHexColor_skipsStroke() {
        var obj = StoryTextObject(text: "X")
        obj.borderColor = "INVALID"
        obj.borderWidth = 4

        let attrs = StoryTextLayer.strokeAttributes(for: obj, designFontSize: 32)
        XCTAssertNil(attrs[.strokeColor])
        XCTAssertNil(attrs[.strokeWidth])
    }
}
