// packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Animation/StoryClosingTests.swift
import XCTest
import CoreMedia
import QuartzCore
@testable import MeeshyUI
@testable import MeeshySDK

/// Sampling instants for the closing window, all DERIVED from
/// `StoryRenderer.slideTransitionDuration` — never written as literals.
///
/// That constant has already moved twice (0.5 → 1.2), and the last move
/// silently invalidated every literal chosen for the previous window: the
/// witnesses below turned red on `main` while describing behaviour that had
/// not changed. Expressed as `totalDuration − window`, `− window / 2`, … they
/// stay about the SHAPE of the ramp (zero before, linear inside, clamped
/// after) instead of about one particular duration.
///
/// `nonisolated` by construction (a file-scope enum of `Double` constants) so
/// it can serve as a default argument inside the `@MainActor` test case.
private enum ClosingFixture {
    /// The closing window, straight from the SSOT.
    static let window = StoryRenderer.slideTransitionDuration
    /// A slide long enough that the closing window is its last fifth — so the
    /// window opens strictly after the slide starts, whatever `window` becomes.
    static let totalDuration = window * 5
    /// Instant the ramp starts. `closingProgress` gates on `elapsed > start`,
    /// so this exact instant still yields 0.
    static let closingStart = totalDuration - window
    /// Well before the window: progress 0, neutral state restored.
    static let beforeClosing = closingStart / 2
    /// Half-way through the window ⇒ progress `midProgress`.
    static let midClosing = closingStart + window / 2
    static let midProgress = 0.5
}

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
        XCTAssertEqual(StoryRenderer.closingProgress(totalDuration: ClosingFixture.totalDuration,
                                                    at: ClosingFixture.beforeClosing),
                       0, accuracy: 1e-9)
        XCTAssertEqual(StoryRenderer.closingProgress(totalDuration: ClosingFixture.totalDuration,
                                                    at: ClosingFixture.closingStart),
                       0, accuracy: 1e-9)
    }

    func test_closingProgress_midWindow_returnsLinearRamp() {
        XCTAssertEqual(StoryRenderer.closingProgress(totalDuration: ClosingFixture.totalDuration,
                                                    at: ClosingFixture.midClosing),
                       ClosingFixture.midProgress, accuracy: 1e-9)
    }

    func test_closingProgress_atOrPastEnd_clampsToOne() {
        XCTAssertEqual(StoryRenderer.closingProgress(totalDuration: ClosingFixture.totalDuration,
                                                    at: ClosingFixture.totalDuration),
                       1.0, accuracy: 1e-9)
        XCTAssertEqual(StoryRenderer.closingProgress(totalDuration: ClosingFixture.totalDuration,
                                                    at: ClosingFixture.totalDuration + ClosingFixture.window),
                       1.0, accuracy: 1e-9)
    }

    func test_closingProgress_degenerateDuration_returnsZero() {
        XCTAssertEqual(StoryRenderer.closingProgress(totalDuration: 0, at: 1.0), 0, accuracy: 1e-9)
        XCTAssertEqual(StoryRenderer.closingProgress(totalDuration: .infinity, at: 1.0), 0, accuracy: 1e-9)
    }

    // MARK: applyClosing (playhead-driven snapshot)

    func test_applyClosing_fadeMidWindow_dimsRootLayerOpacity() {
        let layer = makeLayer()
        StoryRenderer.applyClosing(.fade, rootLayer: layer,
                                   elapsed: ClosingFixture.midClosing,
                                   totalDuration: ClosingFixture.totalDuration)
        XCTAssertEqual(layer.opacity, Float(1 - ClosingFixture.midProgress), accuracy: 0.001)
    }

    func test_applyClosing_fadeBeforeWindow_restoresFullOpacity() {
        let layer = makeLayer()
        StoryRenderer.applyClosing(.fade, rootLayer: layer,
                                   elapsed: ClosingFixture.midClosing,
                                   totalDuration: ClosingFixture.totalDuration)
        StoryRenderer.applyClosing(.fade, rootLayer: layer,
                                   elapsed: ClosingFixture.beforeClosing,
                                   totalDuration: ClosingFixture.totalDuration)
        XCTAssertEqual(layer.opacity, 1.0, accuracy: 0.001)
    }

    func test_applyClosing_zoomMidWindow_scalesSublayerTransformUp() {
        let layer = makeLayer()
        StoryRenderer.applyClosing(.zoom, rootLayer: layer,
                                   elapsed: ClosingFixture.midClosing,
                                   totalDuration: ClosingFixture.totalDuration)
        let expectedScale = 1 + (StoryRenderer.zoomTransitionScale - 1)
            * CGFloat(ClosingFixture.midProgress)
        XCTAssertEqual(layer.sublayerTransform.m11, expectedScale, accuracy: 0.001)
    }

    func test_applyClosing_zoomBeforeWindow_restoresIdentityTransform() {
        let layer = makeLayer()
        StoryRenderer.applyClosing(.zoom, rootLayer: layer,
                                   elapsed: ClosingFixture.midClosing,
                                   totalDuration: ClosingFixture.totalDuration)
        StoryRenderer.applyClosing(.zoom, rootLayer: layer,
                                   elapsed: ClosingFixture.beforeClosing,
                                   totalDuration: ClosingFixture.totalDuration)
        XCTAssertTrue(CATransform3DIsIdentity(layer.sublayerTransform))
    }

    func test_applyClosing_slideMidWindow_translatesSublayersHorizontally() {
        let layer = makeLayer()
        StoryRenderer.applyClosing(.slide, rootLayer: layer,
                                   elapsed: ClosingFixture.midClosing,
                                   totalDuration: ClosingFixture.totalDuration)
        // Half the full travel (8% of the canvas width), toward the leading edge.
        let expectedOffset = -layer.bounds.width
            * StoryRenderer.slideTransitionTravelFraction
            * CGFloat(ClosingFixture.midProgress)
        XCTAssertEqual(layer.sublayerTransform.m41, expectedOffset, accuracy: 0.01)
    }

    func test_applyClosing_revealMidWindow_installsShrinkingCircularMask() {
        let layer = makeLayer()
        StoryRenderer.applyClosing(.reveal, rootLayer: layer,
                                   elapsed: ClosingFixture.midClosing,
                                   totalDuration: ClosingFixture.totalDuration)
        let mask = layer.mask as? CAShapeLayer
        XCTAssertNotNil(mask?.path)
        let maxRadius = hypot(layer.bounds.width, layer.bounds.height) / 2
        let expectedDiameter = maxRadius * CGFloat(1 - ClosingFixture.midProgress) * 2
        XCTAssertEqual(mask?.path?.boundingBox.width ?? -1, expectedDiameter, accuracy: 0.5)
    }

    func test_applyClosing_revealBeforeWindow_removesClosingMask() {
        let layer = makeLayer()
        StoryRenderer.applyClosing(.reveal, rootLayer: layer,
                                   elapsed: ClosingFixture.midClosing,
                                   totalDuration: ClosingFixture.totalDuration)
        StoryRenderer.applyClosing(.reveal, rootLayer: layer,
                                   elapsed: ClosingFixture.beforeClosing,
                                   totalDuration: ClosingFixture.totalDuration)
        XCTAssertNil(layer.mask)
    }

    func test_applyClosing_revealBeforeWindow_preservesForeignMask() {
        let layer = makeLayer()
        let openingMask = CAShapeLayer()
        layer.mask = openingMask
        StoryRenderer.applyClosing(.reveal, rootLayer: layer,
                                   elapsed: ClosingFixture.beforeClosing,
                                   totalDuration: ClosingFixture.totalDuration)
        XCTAssertTrue(layer.mask === openingMask)
    }

    func test_applyClosing_nilEffect_noop() {
        let layer = makeLayer()
        StoryRenderer.applyClosing(nil, rootLayer: layer,
                                   elapsed: ClosingFixture.midClosing,
                                   totalDuration: ClosingFixture.totalDuration)
        XCTAssertEqual(layer.opacity, 1.0, accuracy: 0.001)
        XCTAssertTrue(CATransform3DIsIdentity(layer.sublayerTransform))
    }

    func test_resetClosing_afterExitFrame_restoresNeutralRootState() {
        let layer = makeLayer()
        StoryRenderer.applyClosing(.fade, rootLayer: layer,
                                   elapsed: ClosingFixture.totalDuration,
                                   totalDuration: ClosingFixture.totalDuration)
        StoryRenderer.applyClosing(.reveal, rootLayer: layer,
                                   elapsed: ClosingFixture.totalDuration,
                                   totalDuration: ClosingFixture.totalDuration)
        StoryRenderer.resetClosing(rootLayer: layer)
        XCTAssertEqual(layer.opacity, 1.0, accuracy: 0.001)
        XCTAssertTrue(CATransform3DIsIdentity(layer.sublayerTransform))
        XCTAssertNil(layer.mask)
    }

    // MARK: Canvas trigger (playhead-driven, via the tick seam)

    private func makeClosingSlide(_ closing: StoryTransitionEffect,
                                  durationSeconds: Double = ClosingFixture.totalDuration) -> StorySlide {
        var effects = StoryEffects(textObjects: [StoryTextObject(id: "t1", text: "X")],
                                   timelineDuration: durationSeconds)
        effects.closing = closing
        return StorySlide(id: "s-closing", effects: effects, duration: durationSeconds)
    }

    func test_simulateTickAt_fadeClosingInsideWindow_dimsCanvasRootLayer() {
        let view = StoryCanvasUIView(slide: makeClosingSlide(.fade), mode: .play)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        view.simulateTickAt(seconds: ClosingFixture.midClosing)
        XCTAssertEqual(view.rootLayer.opacity, Float(1 - ClosingFixture.midProgress), accuracy: 0.01,
                       "The playhead-driven tick must apply the closing fade over the slide's last \(ClosingFixture.window)s")
    }

    func test_setMode_playAfterClosingFade_restoresRootLayerOpacity() {
        let view = StoryCanvasUIView(slide: makeClosingSlide(.fade), mode: .play)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        view.simulateTickAt(seconds: ClosingFixture.totalDuration)
        view.setMode(.play, time: .zero)
        XCTAssertEqual(view.rootLayer.opacity, 1.0, accuracy: 0.001,
                       "Replaying (or reusing the canvas for the next slide) must not inherit the exit frame")
    }
}
