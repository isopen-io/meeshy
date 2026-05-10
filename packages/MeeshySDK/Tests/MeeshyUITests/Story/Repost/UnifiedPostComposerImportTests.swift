// packages/MeeshySDK/Tests/MeeshyUITests/Story/Repost/UnifiedPostComposerImportTests.swift
import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class UnifiedPostComposerImportTests: XCTestCase {
    func test_importFromStory_addsAllItems() {
        let payload = RepostPayload(
            textObjects: [StoryTextObject(id: "t1", text: "hi", x: 0.5, y: 0.5)],
            mediaObjects: [StoryMediaObject(id: "m1", postMediaId: "pm", kind: .image,
                                            aspectRatio: 1.0, x: 0.5, y: 0.5)],
            stickers: [StorySticker(id: "s1", emoji: "⭐", x: 0.5, y: 0.5)],
            drawingData: nil,
            audioPlayerObjects: [],
            sourceCanvasSize: CGSize(width: 1080, height: 1920),
            sourceSlideId: "slide-1",
            sourceStoryItemId: "story-X"
        )
        let composer = TestableUnifiedPostComposer()
        composer.importFromStory(payload)
        XCTAssertEqual(composer.importedTextCount, 1)
        XCTAssertEqual(composer.importedMediaCount, 1)
        XCTAssertEqual(composer.importedStickerCount, 1)
    }

    func test_importFromStory_clamping_setsBannerCount() {
        let payload = RepostPayload(
            textObjects: [StoryTextObject(id: "t1", text: "hi", x: 0.5, y: 0.95)],
            mediaObjects: [],
            stickers: [],
            drawingData: nil,
            audioPlayerObjects: [],
            sourceCanvasSize: CGSize(width: 1080, height: 1920),
            sourceSlideId: "slide-1",
            sourceStoryItemId: nil
        )
        let composer = TestableUnifiedPostComposer()
        composer.targetCanvasSize = CGSize(width: 1080, height: 1080)
        composer.importFromStory(payload)
        XCTAssertGreaterThanOrEqual(composer.bannerWarnings.count, 1)
    }
}

// Testable shim — the real composer view is a SwiftUI struct so we
// extract the import logic to a testable helper.
@MainActor
final class TestableUnifiedPostComposer {
    var targetCanvasSize: CGSize = CGSize(width: 1080, height: 1080)
    var importedTextCount = 0
    var importedMediaCount = 0
    var importedStickerCount = 0
    var bannerWarnings: [CanvasReprojector.ReprojectionWarning] = []

    func importFromStory(_ payload: RepostPayload) {
        let p = CanvasReprojector(from: payload.sourceCanvasSize, to: targetCanvasSize)
        for t in payload.textObjects {
            let r = p.reproject(text: t)
            importedTextCount += 1
            if let w = r.warning { bannerWarnings.append(w) }
        }
        for m in payload.mediaObjects {
            let r = p.reproject(media: m)
            importedMediaCount += 1
            if let w = r.warning { bannerWarnings.append(w) }
        }
        for s in payload.stickers {
            let r = p.reproject(sticker: s)
            importedStickerCount += 1
            if let w = r.warning { bannerWarnings.append(w) }
        }
    }
}
