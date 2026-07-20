// packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Animation/StoryClosingTests.swift
import XCTest
import CoreMedia
import QuartzCore
@testable import MeeshyUI
@testable import MeeshySDK

/// C2/C3 — the `effects.closing` transition serialized by the timeline editor
/// must play at the END of the slide, driven by the playhead (no autonomous
/// CAAnimation): each tick re-derives the exit state from `elapsed` vs the
/// slide's total duration, mirroring how fades and keyframes are snapshotted.
@MainActor
final class StoryClosingTests: XCTestCase {

    private func makeLayer() -> CALayer {
        let layer = CALayer()
        layer.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        return layer
    }

    // MARK: closingProgress (pure math)

    func test_closingProgress_beforeWindow_returnsZero() {
        XCTAssertEqual(StoryRenderer.closingProgress(totalDuration: 6.0, at: 3.0), 0, accuracy: 1e-9)
        XCTAssertEqual(StoryRenderer.closingProgress(totalDuration: 6.0, at: 5.5), 0, accuracy: 1e-9)
    }

    func test_closingProgress_midWindow_returnsLinearRamp() {
        XCTAssertEqual(StoryRenderer.closingProgress(totalDuration: 6.0, at: 5.75), 0.5, accuracy: 1e-9)
    }

    func test_closingProgress_atOrPastEnd_clampsToOne() {
        XCTAssertEqual(StoryRenderer.closingProgress(totalDuration: 6.0, at: 6.0), 1.0, accuracy: 1e-9)
        XCTAssertEqual(StoryRenderer.closingProgress(totalDuration: 6.0, at: 7.0), 1.0, accuracy: 1e-9)
    }

    func test_closingProgress_degenerateDuration_returnsZero() {
        XCTAssertEqual(StoryRenderer.closingProgress(totalDuration: 0, at: 1.0), 0, accuracy: 1e-9)
        XCTAssertEqual(StoryRenderer.closingProgress(totalDuration: .infinity, at: 1.0), 0, accuracy: 1e-9)
    }

    // MARK: applyClosing (playhead-driven snapshot)

    func test_applyClosing_fadeMidWindow_dimsRootLayerOpacity() {
        let layer = makeLayer()
        StoryRenderer.applyClosing(.fade, rootLayer: layer, elapsed: 5.75, totalDuration: 6.0)
        XCTAssertEqual(layer.opacity, 0.5, accuracy: 0.001)
    }

    func test_applyClosing_fadeBeforeWindow_restoresFullOpacity() {
        let layer = makeLayer()
        StoryRenderer.applyClosing(.fade, rootLayer: layer, elapsed: 5.75, totalDuration: 6.0)
        StoryRenderer.applyClosing(.fade, rootLayer: layer, elapsed: 2.0, totalDuration: 6.0)
        XCTAssertEqual(layer.opacity, 1.0, accuracy: 0.001)
    }

    func test_applyClosing_zoomMidWindow_scalesSublayerTransformUp() {
        let layer = makeLayer()
        StoryRenderer.applyClosing(.zoom, rootLayer: layer, elapsed: 5.75, totalDuration: 6.0)
        XCTAssertEqual(layer.sublayerTransform.m11, 1.04, accuracy: 0.001)
    }

    func test_applyClosing_zoomBeforeWindow_restoresIdentityTransform() {
        let layer = makeLayer()
        StoryRenderer.applyClosing(.zoom, rootLayer: layer, elapsed: 5.75, totalDuration: 6.0)
        StoryRenderer.applyClosing(.zoom, rootLayer: layer, elapsed: 2.0, totalDuration: 6.0)
        XCTAssertTrue(CATransform3DIsIdentity(layer.sublayerTransform))
    }

    func test_applyClosing_slideMidWindow_translatesSublayersHorizontally() {
        let layer = makeLayer()
        StoryRenderer.applyClosing(.slide, rootLayer: layer, elapsed: 5.75, totalDuration: 6.0)
        // 412 × 0.08 × 0.5 = 16.48, exiting toward the leading edge.
        XCTAssertEqual(layer.sublayerTransform.m41, -16.48, accuracy: 0.01)
    }

    func test_applyClosing_revealMidWindow_installsShrinkingCircularMask() {
        let layer = makeLayer()
        StoryRenderer.applyClosing(.reveal, rootLayer: layer, elapsed: 5.75, totalDuration: 6.0)
        let mask = layer.mask as? CAShapeLayer
        XCTAssertNotNil(mask?.path)
        let maxRadius = hypot(layer.bounds.width, layer.bounds.height) / 2
        let expectedDiameter = maxRadius * 0.5 * 2
        XCTAssertEqual(mask?.path?.boundingBox.width ?? -1, expectedDiameter, accuracy: 0.5)
    }

    func test_applyClosing_revealBeforeWindow_removesClosingMask() {
        let layer = makeLayer()
        StoryRenderer.applyClosing(.reveal, rootLayer: layer, elapsed: 5.75, totalDuration: 6.0)
        StoryRenderer.applyClosing(.reveal, rootLayer: layer, elapsed: 2.0, totalDuration: 6.0)
        XCTAssertNil(layer.mask)
    }

    func test_applyClosing_revealBeforeWindow_preservesForeignMask() {
        let layer = makeLayer()
        let openingMask = CAShapeLayer()
        layer.mask = openingMask
        StoryRenderer.applyClosing(.reveal, rootLayer: layer, elapsed: 2.0, totalDuration: 6.0)
        XCTAssertTrue(layer.mask === openingMask)
    }

    func test_applyClosing_nilEffect_noop() {
        let layer = makeLayer()
        StoryRenderer.applyClosing(nil, rootLayer: layer, elapsed: 5.75, totalDuration: 6.0)
        XCTAssertEqual(layer.opacity, 1.0, accuracy: 0.001)
        XCTAssertTrue(CATransform3DIsIdentity(layer.sublayerTransform))
    }

    func test_resetClosing_afterExitFrame_restoresNeutralRootState() {
        let layer = makeLayer()
        StoryRenderer.applyClosing(.fade, rootLayer: layer, elapsed: 6.0, totalDuration: 6.0)
        StoryRenderer.applyClosing(.reveal, rootLayer: layer, elapsed: 6.0, totalDuration: 6.0)
        StoryRenderer.resetClosing(rootLayer: layer)
        XCTAssertEqual(layer.opacity, 1.0, accuracy: 0.001)
        XCTAssertTrue(CATransform3DIsIdentity(layer.sublayerTransform))
        XCTAssertNil(layer.mask)
    }

    // MARK: Canvas trigger (playhead-driven, via the tick seam)

    private func makeClosingSlide(_ closing: StoryTransitionEffect,
                                  durationSeconds: Double = 1.0) -> StorySlide {
        var effects = StoryEffects(textObjects: [StoryTextObject(id: "t1", text: "X")],
                                   timelineDuration: durationSeconds)
        effects.closing = closing
        return StorySlide(id: "s-closing", effects: effects, duration: durationSeconds)
    }

    func test_simulateTickAt_fadeClosingInsideWindow_dimsCanvasRootLayer() {
        let view = StoryCanvasUIView(slide: makeClosingSlide(.fade), mode: .play)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        view.simulateTickAt(seconds: 0.75)
        XCTAssertEqual(view.rootLayer.opacity, 0.5, accuracy: 0.01,
                       "The playhead-driven tick must apply the closing fade in the last 0.5s of the slide")
    }

    func test_setMode_playAfterClosingFade_restoresRootLayerOpacity() {
        let view = StoryCanvasUIView(slide: makeClosingSlide(.fade), mode: .play)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        view.simulateTickAt(seconds: 1.0)
        view.setMode(.play, time: .zero)
        XCTAssertEqual(view.rootLayer.opacity, 1.0, accuracy: 0.001,
                       "Replaying (or reusing the canvas for the next slide) must not inherit the exit frame")
    }
}
