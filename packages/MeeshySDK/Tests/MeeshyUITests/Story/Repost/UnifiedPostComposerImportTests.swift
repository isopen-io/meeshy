// packages/MeeshySDK/Tests/MeeshyUITests/Story/Repost/UnifiedPostComposerImportTests.swift
import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class UnifiedPostComposerImportTests: XCTestCase {

    // MARK: - Testable shim (algorithm-level)

    func test_importFromStory_shim_countsAllItems() {
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

    func test_importFromStory_shim_clamping_setsBannerCount() {
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

    // MARK: - Real composer (returns RepostImportResult)

    func test_realComposer_importFromStory_returnsAllReprojectedItems() {
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
        let composer = UnifiedPostComposer(
            onPublish: { _, _, _, _, _ in },
            onDismiss: { }
        )
        let result = composer.importFromStory(payload, targetSize: CGSize(width: 1080, height: 1080))
        XCTAssertEqual(result.texts.count, 1)
        XCTAssertEqual(result.media.count, 1)
        XCTAssertEqual(result.stickers.count, 1)
        XCTAssertEqual(result.audios.count, 0)
        XCTAssertNil(result.drawingData)
        XCTAssertEqual(result.warnings.count, 0)
        XCTAssertFalse(result.hasClampedItems)
        XCTAssertEqual(result.targetSize, CGSize(width: 1080, height: 1080))
    }

    func test_realComposer_importFromStory_emitsWarnings_whenItemsClamped() {
        // Bottom-y item in 9:16 reprojected to 1:1 → projected to y > 1 → clamped + warning.
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
        let composer = UnifiedPostComposer(
            onPublish: { _, _, _, _, _ in },
            onDismiss: { }
        )
        let result = composer.importFromStory(payload, targetSize: CGSize(width: 1080, height: 1080))
        XCTAssertTrue(result.hasClampedItems)
        XCTAssertGreaterThanOrEqual(result.warnings.count, 1)
        // y was clamped into [0,1]
        XCTAssertGreaterThanOrEqual(result.texts.first?.y ?? -1, 0)
        XCTAssertLessThanOrEqual(result.texts.first?.y ?? 2, 1)
    }

    func test_realComposer_importFromStory_preservesAudio_asIdentity() {
        let audio = StoryAudioPlayerObject(
            id: "a1",
            postMediaId: "track-1",
            volume: 1.0,
            startTime: 0
        )
        let payload = RepostPayload(
            textObjects: [],
            mediaObjects: [],
            stickers: [],
            drawingData: nil,
            audioPlayerObjects: [audio],
            sourceCanvasSize: CGSize(width: 1080, height: 1920),
            sourceSlideId: "slide-1",
            sourceStoryItemId: nil
        )
        let composer = UnifiedPostComposer(
            onPublish: { _, _, _, _, _ in },
            onDismiss: { }
        )
        let result = composer.importFromStory(payload, targetSize: CGSize(width: 1080, height: 1080))
        XCTAssertEqual(result.audios.count, 1)
        XCTAssertEqual(result.audios.first?.id, "a1")
        XCTAssertEqual(result.warnings.count, 0)
    }

    // MARK: - StoryItem.extractRepostPayload

    func test_storyItem_extractRepostPayload_pullsAllItemsFromStoryEffects() {
        var effects = StoryEffects()
        effects.textObjects = [StoryTextObject(id: "t1", text: "hi", x: 0.5, y: 0.5)]
        effects.mediaObjects = [StoryMediaObject(id: "m1", postMediaId: "pm",
                                                  kind: .image, aspectRatio: 1.0,
                                                  x: 0.5, y: 0.5)]
        effects.stickerObjects = [StorySticker(id: "s1", emoji: "🎉", x: 0.5, y: 0.5)]
        let item = StoryItem(id: "story-99", content: nil, media: [],
                             storyEffects: effects, createdAt: Date())
        let payload = item.extractRepostPayload()
        XCTAssertEqual(payload.textObjects.count, 1)
        XCTAssertEqual(payload.mediaObjects.count, 1)
        XCTAssertEqual(payload.stickers.count, 1)
        XCTAssertEqual(payload.sourceSlideId, "story-99")
        XCTAssertEqual(payload.sourceStoryItemId, "story-99")
        XCTAssertEqual(payload.sourceCanvasSize, CanvasGeometry.designSize)
    }

    /// Regression: a landscape-canvas StoryItem's repost payload must carry the
    /// landscape source size, not the static portrait `CanvasGeometry.designSize`
    /// — mirrors the StorySlide coverage in RepostPayloadTests.
    func test_storyItem_extractRepostPayload_landscapeCanvas_reportsLandscapeSourceCanvasSize() {
        var effects = StoryEffects()
        effects.canvasAspectRatio = StoryCanvasAspect.landscape.ratio
        let item = StoryItem(id: "story-landscape", content: nil, media: [],
                             storyEffects: effects, createdAt: Date())
        let payload = item.extractRepostPayload()
        XCTAssertEqual(payload.sourceCanvasSize, CGSize(width: CanvasGeometry.designHeight,
                                                          height: CanvasGeometry.designWidth))
        XCTAssertNotEqual(payload.sourceCanvasSize, CanvasGeometry.designSize)
    }
}

// MARK: - Testable shim
//
// The real composer view is a SwiftUI struct whose body cannot be evaluated in
// isolation here. This shim mirrors the algorithm-level logic of `importFromStory`
// so we keep the algorithm under test even when the composer's body wiring
// (onAppear → autoImportFromRepostSource → onStoryImported) is exercised by
// smoke tests on simulator rather than unit tests.
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
