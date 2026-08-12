// packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Animation/StoryOpeningTests.swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryOpeningTests: XCTestCase {
    func test_applyOpening_reveal_addsCircularMaskAnimation() {
        let layer = CALayer()
        layer.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        StoryRenderer.applyOpening(.reveal, rootLayer: layer, elapsed: 0)
        XCTAssertNotNil(layer.mask)
    }

    func test_applyOpening_fade_animatesOpacity() {
        let layer = CALayer()
        layer.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        StoryRenderer.applyOpening(.fade, rootLayer: layer, elapsed: 0)
        XCTAssertEqual(layer.animationKeys()?.contains(where: { $0 == "opening-fade" }), true)
    }

    func test_applyOpening_nilEffect_noop() {
        let layer = CALayer()
        StoryRenderer.applyOpening(nil, rootLayer: layer, elapsed: 0)
        XCTAssertNil(layer.mask)
    }

    func test_applyOpening_zoom_addsScaleAnimation() {
        let layer = CALayer()
        layer.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        StoryRenderer.applyOpening(.zoom, rootLayer: layer, elapsed: 0)
        XCTAssertEqual(layer.animationKeys()?.contains(where: { $0 == "opening-zoom" }), true)
    }

    func test_applyOpening_slide_addsTranslationAnimation() {
        let layer = CALayer()
        layer.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        StoryRenderer.applyOpening(.slide, rootLayer: layer, elapsed: 0)
        XCTAssertEqual(layer.animationKeys()?.contains(where: { $0 == "opening-slide" }), true)
    }
}
