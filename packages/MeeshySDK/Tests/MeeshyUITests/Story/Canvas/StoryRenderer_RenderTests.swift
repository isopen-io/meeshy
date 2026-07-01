import XCTest
import CoreMedia
import QuartzCore
import UIKit
import PencilKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Covers two `StoryRenderer.render` regressions:
///   1. `shouldRender` Reduce Motion code-path cleanup (#16) — both motion modes
///      MUST produce the same visibility decisions today (sharp on/off cut),
///      and the consolidated branch MUST keep that contract.
///   2. `contentsScale` parameterization for export (#17) — the live path keeps
///      `UIScreen.main.scale` as the default, while export call-sites pass
///      `1.0` so the export resolution stays 1:1 with the design pixel grid.
///
/// Tests are `@MainActor` because `StoryRenderer.render` is `@MainActor`-isolated
/// (CALayer subclasses it instantiates touch `UIScreen.main` at configure time).
@MainActor
final class StoryRenderer_RenderTests: XCTestCase {

    // MARK: - Fixtures

    /// Builds a slide with one always-visible text and one timed text that
    /// is visible on `[startTime, startTime + duration)`. The visibility
    /// window lets us assert `shouldRender` decisions via the public output.
    private func makeSlideWithTimedAndStaticText(startTime: Double,
                                                 duration: Double) -> StorySlide {
        let staticText = StoryTextObject(id: "static",
                                         text: "STATIC")
        let timedText = StoryTextObject(id: "timed",
                                        text: "TIMED",
                                        startTime: startTime,
                                        duration: duration)
        let effects = StoryEffects(textObjects: [staticText, timedText])
        return StorySlide(id: "test-slide", effects: effects)
    }

    private func makeGeometry(width: CGFloat = 412, height: CGFloat = 732) -> CanvasGeometry {
        CanvasGeometry(renderSize: CGSize(width: width, height: height))
    }

    /// Counts the number of item sublayers attached directly to the root.
    /// Excludes the optional PKDrawing overlay (zPosition 9999) so the
    /// visibility-window assertions don't need to account for it.
    private func itemSublayerCount(_ root: CALayer) -> Int {
        return (root.sublayers ?? []).filter { $0.zPosition != 9999 }.count
    }

    // MARK: - Bug A (#16) — Reduce Motion code-path cleanup

    /// In `.play` mode, an item is rendered when `t` is inside its visibility
    /// window. The consolidated branch must produce the same answer regardless
    /// of Reduce Motion: today, both branches collapsed to a sharp on/off cut,
    /// so the behavioural contract is "render iff start <= t < end".
    func test_shouldRender_normalMotion_correctBounds() {
        let slide = makeSlideWithTimedAndStaticText(startTime: 1.0, duration: 2.0)
        let geometry = makeGeometry()

        // t = 0.5 → outside [1.0, 3.0) — only the static text renders.
        let before = StoryRenderer.render(slide: slide,
                                          into: geometry,
                                          at: CMTime(seconds: 0.5, preferredTimescale: 600),
                                          mode: .play)
        XCTAssertEqual(itemSublayerCount(before), 1,
                       "Only static text must render before timed window")

        // t = 2.0 → inside [1.0, 3.0) — both render.
        let during = StoryRenderer.render(slide: slide,
                                          into: geometry,
                                          at: CMTime(seconds: 2.0, preferredTimescale: 600),
                                          mode: .play)
        XCTAssertEqual(itemSublayerCount(during), 2,
                       "Both texts must render inside the timed window")

        // t = 3.0 → at end (exclusive) — only the static text renders.
        let after = StoryRenderer.render(slide: slide,
                                         into: geometry,
                                         at: CMTime(seconds: 3.0, preferredTimescale: 600),
                                         mode: .play)
        XCTAssertEqual(itemSublayerCount(after), 1,
                       "Timed text must drop out at end boundary (exclusive)")
    }

    /// Mirror of `test_shouldRender_normalMotion_correctBounds` documenting
    /// that the Reduce-Motion branch was removed (it was byte-identical to
    /// the default branch). We can't toggle `UIAccessibility.isReduceMotionEnabled`
    /// from a unit test (it's a system setting), but the contract is now "same
    /// answer in all motion settings", so the same assertions hold here.
    func test_shouldRender_reduceMotion_correctBounds() {
        let slide = makeSlideWithTimedAndStaticText(startTime: 0.5, duration: 1.0)
        let geometry = makeGeometry()

        let before = StoryRenderer.render(slide: slide,
                                          into: geometry,
                                          at: CMTime(seconds: 0.25, preferredTimescale: 600),
                                          mode: .play)
        XCTAssertEqual(itemSublayerCount(before), 1)

        let during = StoryRenderer.render(slide: slide,
                                          into: geometry,
                                          at: CMTime(seconds: 1.0, preferredTimescale: 600),
                                          mode: .play)
        XCTAssertEqual(itemSublayerCount(during), 2)

        let after = StoryRenderer.render(slide: slide,
                                         into: geometry,
                                         at: CMTime(seconds: 1.5, preferredTimescale: 600),
                                         mode: .play)
        XCTAssertEqual(itemSublayerCount(after), 1)
    }

    // MARK: - Bug B (#17) — contentsScale parameter

    /// Default path: callers that omit `contentsScale` MUST get the device
    /// screen scale on the root layer (preserves live composer/viewer
    /// fidelity on Retina/Pro displays).
    func test_render_defaultScale_usesUIScreenMain() {
        let slide = makeSlideWithTimedAndStaticText(startTime: 0, duration: 5)
        let geometry = makeGeometry()

        let root = StoryRenderer.render(slide: slide,
                                        into: geometry,
                                        at: .zero,
                                        mode: .edit)

        XCTAssertEqual(root.contentsScale, UIScreen.main.scale,
                       "Default contentsScale must match UIScreen.main.scale")
    }

    /// Export path: explicit `contentsScale: 1.0` MUST land on the root layer
    /// so the rendered output is 1:1 with the design pixel grid instead of
    /// being upsampled to 3× on a 3× device.
    func test_render_explicitScale1_setsContentsScale1() {
        let slide = makeSlideWithTimedAndStaticText(startTime: 0, duration: 5)
        let geometry = makeGeometry()

        let root = StoryRenderer.render(slide: slide,
                                        into: geometry,
                                        at: .zero,
                                        mode: .edit,
                                        contentsScale: 1.0)

        XCTAssertEqual(root.contentsScale, 1.0,
                       "Explicit contentsScale: 1.0 must land on root layer")
    }

    /// Drawing-overlay path: when `slide.effects.drawingData` is set, the
    /// `PKDrawing.image(scale:)` call inside `render` MUST receive the same
    /// `contentsScale` the caller passed. We assert via the overlay layer's
    /// `contentsScale` because that field mirrors the rasterization scale.
    func test_render_drawingPath_appliesGivenScale() {
        // Empty PKDrawing — the codec accepts it and yields a transparent
        // image, which is enough to assert the overlay layer is created and
        // carries the requested contentsScale.
        let drawingData = PKDrawing().dataRepresentation()
        let effects = StoryEffects(drawingData: drawingData)
        let slide = StorySlide(id: "test-slide", effects: effects)
        let geometry = makeGeometry()

        let root = StoryRenderer.render(slide: slide,
                                        into: geometry,
                                        at: .zero,
                                        mode: .edit,
                                        contentsScale: 1.0)

        // The drawing overlay is the topmost sublayer (zPosition 9999).
        let drawingLayer = (root.sublayers ?? []).first { $0.zPosition == 9999 }
        XCTAssertNotNil(drawingLayer,
                        "Drawing overlay layer must be added when drawingData is present")
        XCTAssertEqual(drawingLayer?.contentsScale, 1.0,
                       "Drawing overlay must carry the caller-supplied contentsScale")
    }

    // MARK: - renderBackground legacy routing (WS5.4 fix a)

    /// A legacy slide carries its background only through `StorySlide.mediaURL`
    /// (no `mediaObjects`). `renderBackground` MUST route that URL through the
    /// `postMediaId` field so `StoryBackgroundLayer.configure` resolves it
    /// directly via `directURLIfAny` (file:// / http(s)://) — the same path the
    /// isBackground image branch uses for composer file URLs.
    ///
    /// Regression this locks: the branch historically passed `slide.id`, a
    /// non-media key the resolver (keyed by `FeedMedia.id`) never matched, so
    /// the legacy background rendered blank/black.
    func test_renderBackground_legacyMediaURL_routesDirectURLNotSlideID() {
        let url = "https://cdn.meeshy.me/story/legacy-bg.jpg"
        let slide = StorySlide(id: "slide-1", mediaURL: url, effects: StoryEffects())

        let kind = StoryRenderer.renderBackground(slide: slide, languages: [])

        guard case let .image(postMediaId, _) = kind else {
            return XCTFail("Legacy mediaURL background must resolve to .image, got \(kind)")
        }
        XCTAssertEqual(postMediaId, url,
                       "Legacy background must route the direct URL so directURLIfAny can resolve it")
        XCTAssertNotEqual(postMediaId, slide.id,
                          "Regression guard: slide.id is a non-media key the resolver never matches")
    }

    /// Guard the fallback ordering: with neither `mediaObjects`, `mediaURL`, nor
    /// an `effects.background` hex, the background is the opaque black solid — the
    /// legacy-URL fix must not shadow this terminal case.
    func test_renderBackground_noMediaNoHex_fallsBackToSolidBlack() {
        let slide = StorySlide(id: "slide-empty", effects: StoryEffects())

        let kind = StoryRenderer.renderBackground(slide: slide, languages: [])

        guard case let .solidColor(color) = kind else {
            return XCTFail("Empty background must resolve to .solidColor, got \(kind)")
        }
        XCTAssertEqual(color, .black,
                       "Empty background terminal fallback must stay opaque black")
    }
}
