// packages/MeeshySDK/Tests/MeeshyUITests/Story/Repost/CanvasReprojectorTests.swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class CanvasReprojectorTests: XCTestCase {
    func test_centeredItem_remainsCentered_after_9_16_to_1_1() {
        let projector = CanvasReprojector(from: CGSize(width: 1080, height: 1920),
                                          to: CGSize(width: 1080, height: 1080))
        let txt = StoryTextObject(id: "t", text: "x", x: 0.5, y: 0.5)
        let result = projector.reproject(text: txt)
        XCTAssertEqual(result.value.x, 0.5, accuracy: 1e-6)
        XCTAssertEqual(result.value.y, 0.5, accuracy: 1e-6)
        XCTAssertNil(result.warning)
    }

    func test_bottomItem_isClamped_after_9_16_to_1_1() {
        let projector = CanvasReprojector(from: CGSize(width: 1080, height: 1920),
                                          to: CGSize(width: 1080, height: 1080))
        let txt = StoryTextObject(id: "t", text: "x", x: 0.5, y: 0.95)
        let result = projector.reproject(text: txt)
        if case .clamped = result.warning {
            // Expected: clamped warning fired
        } else {
            XCTFail("Expected .clamped warning")
        }
        // y was clamped into [0,1] range
        XCTAssertGreaterThanOrEqual(result.value.y, 0)
        XCTAssertLessThanOrEqual(result.value.y, 1)
    }

    func test_aspectRatio_isPreserved_onMedia() {
        let projector = CanvasReprojector(from: CGSize(width: 1080, height: 1920),
                                          to: CGSize(width: 1080, height: 1080))
        var media = StoryMediaObject(id: "m", postMediaId: "pm", kind: .image, aspectRatio: 1.5,
                                     x: 0.5, y: 0.5)
        media.aspectRatio = 1.5
        let result = projector.reproject(media: media)
        XCTAssertEqual(result.value.aspectRatio, 1.5)
    }

    func test_rotation_isPreserved() {
        let projector = CanvasReprojector(from: CGSize(width: 1080, height: 1920),
                                          to: CGSize(width: 1080, height: 1080))
        var sticker = StorySticker(id: "s", emoji: "⭐", x: 0.5, y: 0.5)
        sticker.rotation = 45
        let result = projector.reproject(sticker: sticker)
        XCTAssertEqual(result.value.rotation, 45)
    }
}
