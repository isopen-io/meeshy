// packages/MeeshySDK/Tests/MeeshyUITests/Story/Repost/RepostPayloadTests.swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class RepostPayloadTests: XCTestCase {
    func test_extract_preservesAllItems() {
        let txt = StoryTextObject(id: "t1", text: "hi")
        let media = StoryMediaObject(id: "m1", postMediaId: "pm1", kind: .image, aspectRatio: 1.0,
                                     x: 0.5, y: 0.5)
        let sticker = StorySticker(id: "s1", emoji: "⭐", x: 0.5, y: 0.5)
        var effects = StoryEffects()
        effects.textObjects = [txt]
        effects.mediaObjects = [media]
        effects.stickerObjects = [sticker]
        let slide = StorySlide(id: "slide-1", content: nil, effects: effects)

        let payload = slide.extractRepostPayload(sourceStoryItemId: "story-X")
        XCTAssertEqual(payload.textObjects.count, 1)
        XCTAssertEqual(payload.mediaObjects.count, 1)
        XCTAssertEqual(payload.stickers.count, 1)
        XCTAssertEqual(payload.sourceCanvasSize, CanvasGeometry.designSize)
        XCTAssertEqual(payload.sourceSlideId, "slide-1")
        XCTAssertEqual(payload.sourceStoryItemId, "story-X")
    }

    /// Regression: a landscape-canvas slide's repost payload must carry the
    /// landscape source size, not the static portrait `CanvasGeometry.designSize`
    /// — otherwise `CanvasReprojector` rescales every reposted element assuming
    /// the wrong source shape (see StorySlide/StoryItem.extractRepostPayload).
    func test_extract_landscapeSlide_reportsLandscapeSourceCanvasSize() {
        var effects = StoryEffects()
        effects.canvasAspectRatio = StoryCanvasAspect.landscape.ratio
        let slide = StorySlide(id: "slide-landscape", content: nil, effects: effects)

        let payload = slide.extractRepostPayload(sourceStoryItemId: "story-Y")

        XCTAssertEqual(payload.sourceCanvasSize, CGSize(width: CanvasGeometry.designHeight,
                                                          height: CanvasGeometry.designWidth))
        XCTAssertNotEqual(payload.sourceCanvasSize, CanvasGeometry.designSize)
    }
}
