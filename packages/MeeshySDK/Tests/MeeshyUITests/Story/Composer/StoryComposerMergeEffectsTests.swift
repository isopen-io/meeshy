import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// E2 — `buildEffects()` rebuilt `StoryEffects` from scratch and had to
/// re-emit every authoritative field of `currentEffects` by hand. Each field
/// forgotten was silently wiped on every slide sync (this bug class hit
/// `voiceAttachmentId`, `filter` and `drawingStrokes` before, and was hitting
/// `timelineDuration` + `clipTransitions` — lost on EVERY publish/persist).
///
/// The fix inverts the default: `mergeEffects(current:canvas:)` starts from a
/// full copy of `current` and only overwrites the canvas-authored fields, so
/// an unmapped field can never be lost again. These tests pin that contract.
@MainActor
final class StoryComposerMergeEffectsTests: XCTestCase {

    private func makeTimelineAuthoredEffects() -> StoryEffects {
        var effects = StoryEffects()
        effects.timelineDuration = 12.5
        effects.clipTransitions = [
            StoryClipTransition(fromClipId: "clip-a", toClipId: "clip-b",
                                kind: .dissolve, duration: 0.5)
        ]
        return effects
    }

    // MARK: - The E2 regression: timeline-authored fields survive a sync

    func test_mergeEffects_preservesTimelineDurationAndClipTransitions() {
        let current = makeTimelineAuthoredEffects()

        let merged = StoryComposerView.mergeEffects(current: current, canvas: .init())

        XCTAssertEqual(merged.timelineDuration, 12.5,
                       "The authoritative per-slide timeline duration must survive buildEffects")
        XCTAssertEqual(merged.clipTransitions?.count, 1,
                       "Inter-clip transitions must survive buildEffects")
        XCTAssertEqual(merged.clipTransitions?.first?.fromClipId, "clip-a")
    }

    // MARK: - Copy-through default: unmapped fields can never be lost

    func test_mergeEffects_preservesAuthoritativeCurrentFields() {
        var current = StoryEffects()
        current.filter = "vintage"
        current.filterIntensity = 0.7
        current.voiceAttachmentId = "voice-1"
        current.textObjects = [StoryTextObject(id: "t1", text: "hello")]
        current.thumbHash = "hash123"

        let merged = StoryComposerView.mergeEffects(current: current, canvas: .init())

        XCTAssertEqual(merged.filter, "vintage")
        XCTAssertEqual(merged.filterIntensity, 0.7)
        XCTAssertEqual(merged.voiceAttachmentId, "voice-1")
        XCTAssertEqual(merged.textObjects.count, 1)
        XCTAssertEqual(merged.thumbHash, "hash123")
    }

    // MARK: - Canvas-authored fields overwrite current

    func test_mergeEffects_canvasFieldsOverwriteCurrent() {
        var current = StoryEffects()
        current.background = "OLD"
        current.opening = .fade
        current.backgroundAudioId = "old-audio"

        var canvas = StoryComposerView.CanvasAuthoredState()
        canvas.backgroundHex = "NEW"
        canvas.opening = .zoom
        canvas.backgroundAudioId = "new-audio"
        canvas.audioVolume = 0.4

        let merged = StoryComposerView.mergeEffects(current: current, canvas: canvas)

        XCTAssertEqual(merged.background, "NEW")
        XCTAssertEqual(merged.opening, .zoom)
        XCTAssertEqual(merged.backgroundAudioId, "new-audio")
        XCTAssertEqual(merged.backgroundAudioVolume, 0.4)
    }

    func test_mergeEffects_clearedCanvasFieldsClearCurrent() {
        var current = StoryEffects()
        current.background = "OLD"
        current.backgroundAudioId = "old-audio"
        current.backgroundAudioVolume = 0.8
        current.stickerObjects = [
            StorySticker(id: "s1", emoji: "🎉", x: 0.5, y: 0.5, scale: 1, rotation: 0)
        ]

        let merged = StoryComposerView.mergeEffects(current: current, canvas: .init())

        XCTAssertNil(merged.background, "A canvas with no bg colour clears the legacy background hex")
        XCTAssertNil(merged.backgroundAudioId, "Removing the bg audio in the panel clears it on sync")
        XCTAssertNil(merged.backgroundAudioVolume)
        XCTAssertNil(merged.stickerObjects, "Deleted stickers must not resurrect from current")
    }

    // MARK: - slideDuration stays nil by design (centralised duration 2026-05-28)

    func test_mergeEffects_slideDurationAlwaysNil() {
        var current = StoryEffects()
        current.slideDuration = 12

        let merged = StoryComposerView.mergeEffects(current: current, canvas: .init())

        XCTAssertNil(merged.slideDuration,
                     "Legacy slideDuration must never be re-persisted (computedTotalDuration is the source)")
    }
}
