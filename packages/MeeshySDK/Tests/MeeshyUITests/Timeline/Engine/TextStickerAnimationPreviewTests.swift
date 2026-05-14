// packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/TextStickerAnimationPreviewTests.swift
//
// Covers P3 Wave 3 — text & sticker animations must be visible in the
// Timeline live preview (not only in the final export). The fix is a
// snapshot-at-currentTime opacity envelope computed by
// `StoryRenderer.fadeOpacity` and applied inside `StoryRenderer.renderItem`
// during `.play` mode, matching the AVFoundation opacity ramps that
// `VideoCompositor.layerInstructionConfig` produces for video clips.
//
// We test the pure function (entry / loop / exit windows + no-anim
// regression) plus one integration check that the rendered text-layer
// actually receives the opacity at the playhead.

import XCTest
import CoreMedia
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class TextStickerAnimationPreviewTests: XCTestCase {

    // MARK: - Text — entry / steady / exit

    func test_textAnimation_entry_appliedAtCurrentTime() {
        // 1s fade-in starting at t=0, slide duration 5s. Halfway through the
        // fade-in window (t=0.5) the opacity should be ~0.5.
        let text = StoryTextObject(
            id: "t1", text: "hi",
            startTime: 0, duration: 5,
            fadeIn: 1.0, fadeOut: nil
        )
        let opacity = StoryRenderer.fadeOpacity(item: text, at: 0.5)
        XCTAssertNotNil(opacity)
        XCTAssertEqual(opacity ?? 0, 0.5, accuracy: 1e-4)
    }

    func test_textAnimation_loop_appliedDuringActiveWindow() {
        // "Loop" here means the steady visible window between fade-in and
        // fade-out. With a 1s fadeIn, 1s fadeOut, and 5s duration, the
        // steady window is [1, 4]. Anywhere inside that window the snapshot
        // opacity must read as fully visible (1.0). This is the regression
        // guard against accidentally clamping the steady window to a
        // non-1.0 value.
        let text = StoryTextObject(
            id: "t1", text: "hi",
            startTime: 0, duration: 5,
            fadeIn: 1.0, fadeOut: 1.0
        )
        for t in [1.0, 2.5, 3.9] {
            let opacity = StoryRenderer.fadeOpacity(item: text, at: t)
            XCTAssertEqual(opacity ?? -1, 1.0, accuracy: 1e-4,
                           "steady window must be fully opaque at t=\(t)")
        }
    }

    func test_textAnimation_exit_appliedAtCurrentTime() {
        // 1s fade-out ending at t=5. Halfway through the fade-out window
        // (t=4.5) the opacity should be ~0.5.
        let text = StoryTextObject(
            id: "t1", text: "hi",
            startTime: 0, duration: 5,
            fadeIn: nil, fadeOut: 1.0
        )
        let opacity = StoryRenderer.fadeOpacity(item: text, at: 4.5)
        XCTAssertNotNil(opacity)
        XCTAssertEqual(opacity ?? 0, 0.5, accuracy: 1e-4)
    }

    // MARK: - Sticker — same envelope semantics

    func test_stickerAnimation_entry_appliedAtCurrentTime() {
        let sticker = StorySticker(
            id: "s1", emoji: "*",
            startTime: 0, duration: 5,
            fadeIn: 2.0, fadeOut: nil
        )
        let opacity = StoryRenderer.fadeOpacity(item: sticker, at: 1.0)
        XCTAssertEqual(opacity ?? 0, 0.5, accuracy: 1e-4)
    }

    func test_stickerAnimation_loop_appliedDuringActiveWindow() {
        let sticker = StorySticker(
            id: "s1", emoji: "*",
            startTime: 0, duration: 5,
            fadeIn: 1.0, fadeOut: 1.0
        )
        let opacity = StoryRenderer.fadeOpacity(item: sticker, at: 2.5)
        XCTAssertEqual(opacity ?? -1, 1.0, accuracy: 1e-4)
    }

    func test_stickerAnimation_exit_appliedAtCurrentTime() {
        let sticker = StorySticker(
            id: "s1", emoji: "*",
            startTime: 0, duration: 5,
            fadeIn: nil, fadeOut: 2.0
        )
        let opacity = StoryRenderer.fadeOpacity(item: sticker, at: 4.0)
        XCTAssertEqual(opacity ?? 0, 0.5, accuracy: 1e-4)
    }

    // MARK: - Regression — no animation → no opacity override

    func test_noAnimation_staticRender() {
        // Item with no fadeIn / fadeOut returns nil — caller preserves the
        // CALayer default opacity of 1.0 and never writes the property.
        let text = StoryTextObject(
            id: "t1", text: "hi",
            startTime: 0, duration: 5,
            fadeIn: nil, fadeOut: nil
        )
        XCTAssertNil(StoryRenderer.fadeOpacity(item: text, at: 2.5))

        let sticker = StorySticker(
            id: "s1", emoji: "*",
            startTime: 0, duration: 5,
            fadeIn: nil, fadeOut: nil
        )
        XCTAssertNil(StoryRenderer.fadeOpacity(item: sticker, at: 2.5))
    }

    // MARK: - Integration — rendered text layer carries snapshot opacity

    func test_render_inPlayMode_appliesFadeOpacityToTextLayer() {
        // Text with a 1s fade-in starting at t=0. At t=0.25 the snapshot
        // opacity is 0.25 and must be visible on the produced CALayer.
        // The Timeline preview path drives `StoryRenderer.render` in `.play`
        // mode with the playhead — this asserts the snapshot is wired in.
        let text = StoryTextObject(
            id: "t1", text: "hi",
            startTime: 0, duration: 5,
            fadeIn: 1.0, fadeOut: nil
        )
        let effects = StoryEffects(textObjects: [text])
        let slide = StorySlide(id: "s", effects: effects)
        let geom = CanvasGeometry(renderSize: CGSize(width: 1080, height: 1920))

        let root = StoryRenderer.render(
            slide: slide, into: geom,
            at: CMTime(seconds: 0.25, preferredTimescale: 600_000),
            mode: .play, languages: []
        )
        let textLayer = root.findFirst(named: "t1")
        XCTAssertNotNil(textLayer)
        XCTAssertEqual(Double(textLayer?.opacity ?? 0), 0.25, accuracy: 1e-3)
    }

    func test_render_inEditMode_skipsFadeOpacity() {
        // Edit mode never gates by playhead — items render fully opaque so
        // the author can manipulate them. This is the regression guard for
        // the composer canvas (we must not bleed fade snapshots into edit).
        let text = StoryTextObject(
            id: "t1", text: "hi",
            startTime: 0, duration: 5,
            fadeIn: 1.0, fadeOut: nil
        )
        let effects = StoryEffects(textObjects: [text])
        let slide = StorySlide(id: "s", effects: effects)
        let geom = CanvasGeometry(renderSize: CGSize(width: 1080, height: 1920))

        let root = StoryRenderer.render(
            slide: slide, into: geom,
            at: CMTime(seconds: 0.25, preferredTimescale: 600_000),
            mode: .edit, languages: []
        )
        let textLayer = root.findFirst(named: "t1")
        XCTAssertNotNil(textLayer)
        XCTAssertEqual(textLayer?.opacity ?? 0, 1.0, accuracy: 1e-4)
    }

    // MARK: - Keyframe opacity wins over fade envelope

    func test_textAnimation_keyframeOpacity_overridesFadeEnvelope() {
        // When the author has explicit opacity keyframes, those win over the
        // fade envelope (fades are the default envelope, keyframes are
        // explicit authoring). Here keyframes pin opacity to 0.8 at every
        // time we sample; the fadeIn 1s envelope would otherwise yield 0.5
        // at t=0.5.
        let kfs: [StoryKeyframe] = [
            StoryKeyframe(time: 0, opacity: 0.8),
            StoryKeyframe(time: 1.0, opacity: 0.8),
        ]
        let text = StoryTextObject(
            id: "t1", text: "hi",
            startTime: 0, duration: 5,
            fadeIn: 1.0, fadeOut: nil,
            keyframes: kfs
        )
        let effects = StoryEffects(textObjects: [text])
        let slide = StorySlide(id: "s", effects: effects)
        let geom = CanvasGeometry(renderSize: CGSize(width: 1080, height: 1920))

        let root = StoryRenderer.render(
            slide: slide, into: geom,
            at: CMTime(seconds: 0.5, preferredTimescale: 600_000),
            mode: .play, languages: []
        )
        let textLayer = root.findFirst(named: "t1")
        XCTAssertNotNil(textLayer)
        XCTAssertEqual(Double(textLayer?.opacity ?? 0), 0.8, accuracy: 1e-3)
    }
}

// MARK: - Test helpers
//
// `CALayer.findFirst(named:)` is already defined in
// `StoryRendererLanguagesTests.swift` (same test target — `MeeshyUITests`),
// so we reuse it via target-level visibility. No duplicate definition here
// to avoid `redefinition` errors at link time.
