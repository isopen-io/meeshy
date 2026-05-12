import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Covers `StoryComposerCanvasView.slidesEqualForCanvas` — the gate that decides
/// whether SwiftUI's `updateUIView` pushes a new slide into the underlying
/// `StoryCanvasUIView` (which rebuilds CALayers via `slide.didSet`).
///
/// The previous implementation compared only element counts, which silently
/// skipped inline edits (color, position via slider, rotation, text content)
/// and broke composer reactivity. Each test below asserts that a single inline
/// edit yields `false` so the push actually fires.
@MainActor
final class StoryCanvasRepresentable_EqualityTests: XCTestCase {

    // MARK: - Helpers

    private func makeSlide(id: String = "slide-1",
                           text: StoryTextObject = StoryTextObject(id: "t1", text: "Hello"),
                           media: [StoryMediaObject]? = nil,
                           stickers: [StorySticker]? = nil,
                           duration: TimeInterval = 8) -> StorySlide {
        let effects = StoryEffects(stickerObjects: stickers,
                                   textObjects: [text],
                                   mediaObjects: media)
        return StorySlide(id: id, effects: effects, duration: duration)
    }

    private func makeText(id: String = "t1",
                          text: String = "Hello",
                          x: Double = 0.5,
                          y: Double = 0.5,
                          rotation: Double = 0,
                          textColor: String? = "FFFFFF") -> StoryTextObject {
        StoryTextObject(id: id, text: text, x: x, y: y, rotation: rotation, textColor: textColor)
    }

    // MARK: - Same content → equal

    func test_slidesEqual_sameContent_returnsTrue() {
        let a = makeSlide()
        let b = makeSlide()
        XCTAssertTrue(StoryComposerCanvasView.slidesEqualForCanvas(a, b))
    }

    func test_slidesEqual_differentSlideId_returnsFalse() {
        let a = makeSlide(id: "slide-1")
        let b = makeSlide(id: "slide-2")
        XCTAssertFalse(StoryComposerCanvasView.slidesEqualForCanvas(a, b))
    }

    // MARK: - Inline edits (the bug the previous heuristic missed)

    /// Editing the colour of a text object keeps element counts identical.
    /// The old guard returned `true` → canvas froze on the old color.
    func test_slidesEqual_differentColor_returnsFalse() {
        let a = makeSlide(text: makeText(textColor: "FFFFFF"))
        let b = makeSlide(text: makeText(textColor: "FF0000"))
        XCTAssertFalse(StoryComposerCanvasView.slidesEqualForCanvas(a, b))
    }

    /// Dragging position via slider keeps counts identical.
    /// The old guard returned `true` → canvas froze on the old position.
    func test_slidesEqual_differentPosition_returnsFalse() {
        let a = makeSlide(text: makeText(x: 0.5, y: 0.5))
        let b = makeSlide(text: makeText(x: 0.7, y: 0.3))
        XCTAssertFalse(StoryComposerCanvasView.slidesEqualForCanvas(a, b))
    }

    /// Rotation slider edit. Same failure mode as position.
    func test_slidesEqual_differentRotation_returnsFalse() {
        let a = makeSlide(text: makeText(rotation: 0))
        let b = makeSlide(text: makeText(rotation: 45))
        XCTAssertFalse(StoryComposerCanvasView.slidesEqualForCanvas(a, b))
    }

    /// Inline text edit.
    func test_slidesEqual_differentTextContent_returnsFalse() {
        let a = makeSlide(text: makeText(text: "Hello"))
        let b = makeSlide(text: makeText(text: "World"))
        XCTAssertFalse(StoryComposerCanvasView.slidesEqualForCanvas(a, b))
    }

    // MARK: - Count-changing edits (the old heuristic already caught these)

    func test_slidesEqual_addedSticker_returnsFalse() {
        let a = makeSlide(stickers: nil)
        let b = makeSlide(stickers: [StorySticker(id: "s1", emoji: "🎉")])
        XCTAssertFalse(StoryComposerCanvasView.slidesEqualForCanvas(a, b))
    }

    func test_slidesEqual_addedMedia_returnsFalse() {
        let media = StoryMediaObject(id: "m1", postMediaId: "pm-1", aspectRatio: 1.0)
        let a = makeSlide(media: nil)
        let b = makeSlide(media: [media])
        XCTAssertFalse(StoryComposerCanvasView.slidesEqualForCanvas(a, b))
    }

    // MARK: - Slide-level field edits

    /// Filter toggle on the slide effects (e.g. composer "Noir" toggle).
    /// The old heuristic returned `true` because text/media/sticker counts
    /// were unchanged → canvas missed the filter swap.
    func test_slidesEqual_differentEffectsFilter_returnsFalse() {
        var effectsA = StoryEffects(textObjects: [makeText()])
        var effectsB = StoryEffects(textObjects: [makeText()])
        effectsA.filter = nil
        effectsB.filter = "noir"
        let a = StorySlide(id: "slide-1", effects: effectsA)
        let b = StorySlide(id: "slide-1", effects: effectsB)
        XCTAssertFalse(StoryComposerCanvasView.slidesEqualForCanvas(a, b))
    }

    func test_slidesEqual_differentDuration_returnsFalse() {
        let a = makeSlide(duration: 8)
        let b = makeSlide(duration: 12)
        XCTAssertFalse(StoryComposerCanvasView.slidesEqualForCanvas(a, b))
    }
}
