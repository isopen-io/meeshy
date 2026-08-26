// packages/MeeshySDK/Tests/MeeshyUITests/Story/Export/StoryAVCompositorOpeningParityTests.swift
import XCTest
import QuartzCore
@testable import MeeshyUI
@testable import MeeshySDK

/// Sampling instants of the opening window, all DERIVED from
/// `StoryRenderer.slideTransitionDuration` — never literals. Same rationale as
/// `ClosingFixture`: that constant has already moved (0.5 → 1.2) and every
/// literal chosen for the previous window turned red while describing a
/// behaviour that had not changed.
///
/// `nonisolated` by construction (a file-scope enum of constants) so it can be
/// read from the `@MainActor` test case without a hop.
private enum OpeningFixture {
    static let window = StoryRenderer.slideTransitionDuration
    static let midWindow = window / 2
    static let midProgress = 0.5
    static let viewport = CGRect(x: 0, y: 0, width: 1080, height: 1920)
    /// Full horizontal travel of the `.slide` opening on this viewport.
    static let travel = viewport.width * StoryRenderer.slideTransitionTravelFraction
    /// Zoom scale half-way through the window.
    static let midScale = 1 + (StoryRenderer.zoomTransitionScale - 1) * CGFloat(1 - midProgress)
}

/// The exported MP4 must show, at instant `t`, the SAME opening frame the live
/// canvas shows at `t`.
///
/// It did not: `applyStaticOpening` handled `.fade` and `.reveal`, then
/// `case .zoom, .slide: break`. An author picking one of the two most visible
/// effects saw it everywhere in the app and got a video with no transition at
/// all — no error, no signal, just the effect missing.
///
/// The compositor cannot reuse `StoryRenderer.applyOpening` as is:
/// `layer.render(in:)` runs no animation engine, so the model-layer state has
/// to be posed frame by frame. What both surfaces now share is the CURVE —
/// `StoryRenderer.openingSublayerTransform` — which the live animation runs
/// between its two ends and the export samples at every playhead. Parity is
/// therefore pinned on values (departure at the SDK constant, arrival at
/// identity, linear in between), never on the presence of a call.
@MainActor
final class StoryAVCompositorOpeningParityTests: XCTestCase {

    private func makeLayer() -> CALayer {
        let layer = CALayer()
        layer.frame = OpeningFixture.viewport
        return layer
    }

    // MARK: - openingSublayerTransform (pure math — the ONE curve)

    func test_openingSublayerTransform_zoomAtProgressZero_startsAtTheSdkScale() {
        let transform = StoryRenderer.openingSublayerTransform(
            .zoom, progress: 0, canvasWidth: OpeningFixture.viewport.width)

        XCTAssertEqual(transform.m11, StoryRenderer.zoomTransitionScale, accuracy: 1e-6)
        XCTAssertEqual(transform.m22, StoryRenderer.zoomTransitionScale, accuracy: 1e-6)
        XCTAssertEqual(transform.m41, 0, accuracy: 1e-6, "A zoom never translates.")
    }

    func test_openingSublayerTransform_zoomAtProgressOne_settlesAtIdentity() {
        let transform = StoryRenderer.openingSublayerTransform(
            .zoom, progress: 1, canvasWidth: OpeningFixture.viewport.width)

        XCTAssertTrue(CATransform3DIsIdentity(transform))
    }

    func test_openingSublayerTransform_slideAtProgressZero_translatesByTheFullTravelHorizontally() {
        let transform = StoryRenderer.openingSublayerTransform(
            .slide, progress: 0, canvasWidth: OpeningFixture.viewport.width)

        XCTAssertEqual(transform.m41, OpeningFixture.travel, accuracy: 1e-6,
                       "The slide enters from the leading edge: +travel, a fraction of the width.")
        XCTAssertEqual(transform.m42, 0, accuracy: 1e-6, "The SDK slide is horizontal.")
        XCTAssertEqual(transform.m11, 1, accuracy: 1e-6, "A slide never scales.")
    }

    func test_openingSublayerTransform_slideAtProgressOne_settlesAtIdentity() {
        let transform = StoryRenderer.openingSublayerTransform(
            .slide, progress: 1, canvasWidth: OpeningFixture.viewport.width)

        XCTAssertTrue(CATransform3DIsIdentity(transform))
    }

    func test_openingSublayerTransform_progressOutOfRange_isClampedToTheWindow() {
        let width = OpeningFixture.viewport.width
        let before = StoryRenderer.openingSublayerTransform(.zoom, progress: -1, canvasWidth: width)
        let start = StoryRenderer.openingSublayerTransform(.zoom, progress: 0, canvasWidth: width)
        let after = StoryRenderer.openingSublayerTransform(.slide, progress: 2, canvasWidth: width)

        XCTAssertTrue(CATransform3DEqualToTransform(before, start))
        XCTAssertTrue(CATransform3DIsIdentity(after))
    }

    func test_openingSublayerTransform_fadeAndReveal_areIdentity() {
        let width = OpeningFixture.viewport.width

        XCTAssertTrue(CATransform3DIsIdentity(
            StoryRenderer.openingSublayerTransform(.fade, progress: 0, canvasWidth: width)))
        XCTAssertTrue(CATransform3DIsIdentity(
            StoryRenderer.openingSublayerTransform(.reveal, progress: 0, canvasWidth: width)))
    }

    // MARK: - applyStaticOpening — the export samples that curve, frame by frame

    /// At the first instant the export departs from the SDK scale — the very
    /// value `applyOpening` poses as `fromValue`.
    func test_applyStaticOpening_zoomAtStart_scalesFromTheSdkScale() {
        let layer = makeLayer()

        StoryAVCompositor.applyStaticOpening(.zoom, rootLayer: layer, elapsed: 0)

        XCTAssertEqual(layer.sublayerTransform.m11, StoryRenderer.zoomTransitionScale, accuracy: 1e-6)
        XCTAssertEqual(layer.sublayerTransform.m22, StoryRenderer.zoomTransitionScale, accuracy: 1e-6)
    }

    /// …and it ZOOMS OUT: half-way through the window the scale is half-way
    /// to identity. The inverse would grow the picture instead of settling it.
    func test_applyStaticOpening_zoomMidWindow_isHalfwayToIdentity() {
        let layer = makeLayer()

        StoryAVCompositor.applyStaticOpening(.zoom, rootLayer: layer,
                                             elapsed: OpeningFixture.midWindow)

        XCTAssertEqual(layer.sublayerTransform.m11, OpeningFixture.midScale, accuracy: 1e-6)
        XCTAssertLessThan(layer.sublayerTransform.m11, StoryRenderer.zoomTransitionScale)
        XCTAssertGreaterThan(layer.sublayerTransform.m11, 1)
    }

    /// The glide is HORIZONTAL and worth the SDK fraction of the width — not a
    /// vertical offset, not a value in points.
    func test_applyStaticOpening_slideAtStart_translatesByTheFullTravelHorizontally() {
        let layer = makeLayer()

        StoryAVCompositor.applyStaticOpening(.slide, rootLayer: layer, elapsed: 0)

        XCTAssertEqual(layer.sublayerTransform.m41, OpeningFixture.travel, accuracy: 1e-6)
        XCTAssertEqual(layer.sublayerTransform.m42, 0, accuracy: 1e-6, "The SDK slide is horizontal.")
    }

    func test_applyStaticOpening_slideMidWindow_isHalfwayHome() {
        let layer = makeLayer()

        StoryAVCompositor.applyStaticOpening(.slide, rootLayer: layer,
                                             elapsed: OpeningFixture.midWindow)

        let expected = OpeningFixture.travel * CGFloat(1 - OpeningFixture.midProgress)
        XCTAssertEqual(layer.sublayerTransform.m41, expected, accuracy: 1e-6)
    }

    /// The window is the SDK's, and it is half-open: at its very end the
    /// opening is over and the frame is left as rendered — the same gate
    /// `applyOpening` applies (`elapsed < slideTransitionDuration`). A layer
    /// deliberately dirtied beforehand proves the function WRITES nothing.
    func test_applyStaticOpening_atTheWindowEnd_leavesTheLayerUntouched() {
        let layer = makeLayer()
        layer.opacity = 0.25
        layer.sublayerTransform = CATransform3DMakeScale(3, 3, 1)

        StoryAVCompositor.applyStaticOpening(.zoom, rootLayer: layer,
                                             elapsed: OpeningFixture.window)
        StoryAVCompositor.applyStaticOpening(.slide, rootLayer: layer,
                                             elapsed: OpeningFixture.window)
        StoryAVCompositor.applyStaticOpening(.fade, rootLayer: layer,
                                             elapsed: OpeningFixture.window)

        XCTAssertEqual(layer.opacity, 0.25, accuracy: 1e-6)
        XCTAssertEqual(layer.sublayerTransform.m11, 3, accuracy: 1e-6)
        XCTAssertNil(layer.mask)
    }

    func test_applyStaticOpening_nilEffect_leavesTheLayerUntouched() {
        let layer = makeLayer()
        layer.opacity = 0.25
        layer.sublayerTransform = CATransform3DMakeScale(3, 3, 1)

        StoryAVCompositor.applyStaticOpening(nil, rootLayer: layer, elapsed: 0)

        XCTAssertEqual(layer.opacity, 0.25, accuracy: 1e-6)
        XCTAssertEqual(layer.sublayerTransform.m11, 3, accuracy: 1e-6)
        XCTAssertNil(layer.mask)
    }

    // MARK: - Non-regression on the two effects that were already baked

    func test_applyStaticOpening_fade_stillRampsOpacity() {
        let layer = makeLayer()

        StoryAVCompositor.applyStaticOpening(.fade, rootLayer: layer, elapsed: 0)
        XCTAssertEqual(layer.opacity, 0, accuracy: 1e-6)

        StoryAVCompositor.applyStaticOpening(.fade, rootLayer: layer,
                                             elapsed: OpeningFixture.midWindow)
        XCTAssertEqual(layer.opacity, Float(OpeningFixture.midProgress), accuracy: 1e-6)
    }

    func test_applyStaticOpening_reveal_stillMasksWithAGrowingCircle() throws {
        let layer = makeLayer()

        StoryAVCompositor.applyStaticOpening(.reveal, rootLayer: layer, elapsed: 0)
        let start = try XCTUnwrap(layer.mask as? CAShapeLayer).path?.boundingBox.width ?? -1

        StoryAVCompositor.applyStaticOpening(.reveal, rootLayer: layer,
                                             elapsed: OpeningFixture.midWindow)
        let mid = try XCTUnwrap(layer.mask as? CAShapeLayer).path?.boundingBox.width ?? -1

        let maxRadius = hypot(OpeningFixture.viewport.width, OpeningFixture.viewport.height) / 2
        XCTAssertEqual(mid, maxRadius * CGFloat(OpeningFixture.midProgress) * 2, accuracy: 0.5)
        XCTAssertLessThan(start, mid, "The circle must open.")
    }

    /// Baking the transform for `.zoom` / `.slide` must not leak into the two
    /// effects that never touch it.
    func test_applyStaticOpening_fadeAndReveal_leaveSublayerTransformIdentity() {
        let faded = makeLayer()
        StoryAVCompositor.applyStaticOpening(.fade, rootLayer: faded,
                                             elapsed: OpeningFixture.midWindow)
        XCTAssertTrue(CATransform3DIsIdentity(faded.sublayerTransform))

        let revealed = makeLayer()
        StoryAVCompositor.applyStaticOpening(.reveal, rootLayer: revealed,
                                             elapsed: OpeningFixture.midWindow)
        XCTAssertTrue(CATransform3DIsIdentity(revealed.sublayerTransform))
    }

    // MARK: - Live ↔ export: the animation runs between the ends the export bakes

    /// `applyOpening`'s `fromValue` IS the frame the export bakes at `t = 0`,
    /// and its `toValue` is identity — the two ends of the same curve. A
    /// constant edited on one side cannot drift from the other.
    func test_applyOpening_zoom_animatesFromTheFrameTheExportBakesAtZero() throws {
        let live = makeLayer()
        StoryRenderer.applyOpening(.zoom, rootLayer: live, elapsed: 0)
        let animation = try XCTUnwrap(
            live.animation(forKey: StoryRenderer.openingZoomAnimationKey) as? CABasicAnimation)
        let from = try XCTUnwrap(animation.fromValue as? NSValue).caTransform3DValue
        let to = try XCTUnwrap(animation.toValue as? NSValue).caTransform3DValue

        let exported = makeLayer()
        StoryAVCompositor.applyStaticOpening(.zoom, rootLayer: exported, elapsed: 0)

        XCTAssertTrue(CATransform3DEqualToTransform(from, exported.sublayerTransform))
        XCTAssertTrue(CATransform3DIsIdentity(to))
    }

    func test_applyOpening_slide_animatesFromTheFrameTheExportBakesAtZero() throws {
        let live = makeLayer()
        StoryRenderer.applyOpening(.slide, rootLayer: live, elapsed: 0)
        let animation = try XCTUnwrap(
            live.animation(forKey: StoryRenderer.openingSlideAnimationKey) as? CABasicAnimation)
        let from = try XCTUnwrap(animation.fromValue as? NSValue).caTransform3DValue
        let to = try XCTUnwrap(animation.toValue as? NSValue).caTransform3DValue

        let exported = makeLayer()
        StoryAVCompositor.applyStaticOpening(.slide, rootLayer: exported, elapsed: 0)

        XCTAssertTrue(CATransform3DEqualToTransform(from, exported.sublayerTransform))
        XCTAssertTrue(CATransform3DIsIdentity(to))
    }
}
