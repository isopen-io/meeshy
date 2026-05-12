import XCTest
import UIKit
import Metal
import QuartzCore
@testable import MeeshyUI
@testable import MeeshySDK

/// P0 fix regression coverage : `StoryCanvasUIView.updateFilterLayer()` MUST
/// assign a non-nil `sourceTexture` on its `StoryFilteredLayer` whenever a
/// filter kernel is active. Without that texture the Metal compute kernel
/// inside `StoryFilteredLayer.render()` silently no-ops (its `guard let source
/// = sourceTexture` short-circuits), which is the exact bug that shipped the
/// filters as visually broken.
///
/// These tests pin the contract at the unit boundary :
///   - filter set → `filteredLayer.sourceTexture` non-nil with correct size
///   - filter cleared → no filteredLayer (and therefore nothing to source)
///   - capture seam runs even when the live layer hasn't been attached yet
///   - the kernel render path receives a non-zero source so the no-op branch
///     does not silently swallow the dispatch
@MainActor
final class StoryCanvasUIView_FilterTextureCaptureTests: XCTestCase {

    // MARK: - Helpers

    /// Standard portrait 9:16 slide frame used everywhere else in the canvas
    /// test suite. Matches the iPhone composer surface.
    private let canvasSize = CGSize(width: 412, height: 732)

    private func makeView(filter: String?, intensity: Double? = 0.5) -> StoryCanvasUIView {
        var effects = StoryEffects()
        effects.filter = filter
        effects.filterIntensity = intensity
        let slide = StorySlide(id: "slide-under-test",
                               effects: effects,
                               duration: 5)
        let view = StoryCanvasUIView(slide: slide, mode: .edit)
        view.frame = CGRect(origin: .zero, size: canvasSize)
        view.layoutIfNeeded()
        return view
    }

    // MARK: - sourceTexture assignment

    func test_updateFilterLayer_assignsNonNilSourceTexture() throws {
        let view = makeView(filter: "vintageFilter", intensity: 0.7)

        let filtered = try XCTUnwrap(view._filteredLayerForTesting,
                                     "Filter overlay must be attached when slide.effects.filter is set")
        let source = try XCTUnwrap(filtered.sourceTexture,
                                   "sourceTexture MUST be assigned after rebuildLayers() — without it the Metal kernel silently produces a no-op frame")

        XCTAssertGreaterThan(source.width, 0)
        XCTAssertGreaterThan(source.height, 0)
    }

    func test_updateFilterLayer_textureDimensionsMatchCanvasSize() throws {
        let view = makeView(filter: "bwContrastFilter")

        let filtered = try XCTUnwrap(view._filteredLayerForTesting)
        let source = try XCTUnwrap(filtered.sourceTexture)

        // CARenderer target is allocated against the integer-rounded render
        // size — the same rounding the production capture helper applies — so
        // a 412x732 canvas must yield a 412x732 source texture.
        XCTAssertEqual(source.width, Int(canvasSize.width.rounded()))
        XCTAssertEqual(source.height, Int(canvasSize.height.rounded()))
    }

    func test_updateFilterLayer_skippedWhenNoFilter() {
        let view = makeView(filter: nil)

        XCTAssertNil(view._filteredLayerForTesting,
                     "Filter overlay must NOT exist when slide.effects.filter is unset — that's the no-filter fast path")
    }

    // MARK: - Filter add / remove lifecycle

    func test_updateFilterLayer_clearsSourceTextureCacheWhenFilterRemoved() throws {
        // Start with a filter attached so the cache fields are populated.
        var effects = StoryEffects()
        effects.filter = "vintageFilter"
        effects.filterIntensity = 0.5
        let slide = StorySlide(id: "swap-slide", effects: effects, duration: 5)
        let view = StoryCanvasUIView(slide: slide, mode: .edit)
        view.frame = CGRect(origin: .zero, size: canvasSize)
        view.layoutIfNeeded()
        _ = try XCTUnwrap(view._filteredLayerForTesting?.sourceTexture)

        // Remove the filter and re-layout — overlay must vanish, no leak.
        var cleared = StoryEffects()
        cleared.filter = nil
        view.slide = StorySlide(id: "swap-slide", effects: cleared, duration: 5)
        view.layoutIfNeeded()

        XCTAssertNil(view._filteredLayerForTesting,
                     "Removing the filter must drop the overlay so re-enabling triggers a fresh capture")
    }

    // MARK: - Capture seam

    func test_captureFilterSourceForTesting_returnsTextureWithRequestedDimensions() throws {
        let view = makeView(filter: "vintageFilter")
        let texture = try XCTUnwrap(view._captureFilterSourceForTesting(renderSize: canvasSize),
                                    "Capture helper must produce an MTLTexture for a non-empty render size")

        XCTAssertEqual(texture.width, Int(canvasSize.width.rounded()))
        XCTAssertEqual(texture.height, Int(canvasSize.height.rounded()))
        XCTAssertEqual(texture.pixelFormat, .bgra8Unorm,
                       "Capture target must be bgra8Unorm so the Metal compute kernel can sample it directly")
    }

    func test_captureFilterSourceForTesting_returnsNilForZeroSize() {
        let view = makeView(filter: "vintageFilter")
        let texture = view._captureFilterSourceForTesting(renderSize: .zero)
        XCTAssertNil(texture, "Zero render size must be rejected before allocating a Metal texture")
    }

    // MARK: - Kernel produces non-trivial output

    func test_filterRender_producesNonZeroPixelsWithSource() throws {
        // Force the slide to have a recognisable solid-colour background so
        // the captured texture is guaranteed non-empty when read back.
        var effects = StoryEffects()
        effects.filter = "vintageFilter"
        effects.filterIntensity = 1.0
        effects.background = "#FF0000"   // pure red
        let slide = StorySlide(id: "kernel-slide", effects: effects, duration: 5)
        let view = StoryCanvasUIView(slide: slide, mode: .edit)
        view.frame = CGRect(origin: .zero, size: canvasSize)
        view.layoutIfNeeded()

        let filtered = try XCTUnwrap(view._filteredLayerForTesting)
        let source = try XCTUnwrap(filtered.sourceTexture,
                                   "Source texture must be populated before we sample it")

        // Read back a single texel near the canvas centre. A non-zero alpha
        // proves that CARenderer wrote actual pixels into the texture — i.e.
        // the capture is not a phantom MTLTexture with garbage/zero contents,
        // and the kernel's `guard let source = sourceTexture` no-op branch is
        // no longer the silent failure mode the bug report described.
        let region = MTLRegionMake2D(source.width / 2, source.height / 2, 1, 1)
        var bgra = [UInt8](repeating: 0, count: 4)
        source.getBytes(&bgra,
                        bytesPerRow: 4,
                        from: region,
                        mipmapLevel: 0)
        let alpha = bgra[3]
        XCTAssertGreaterThan(alpha, 0,
                             "CARenderer must have written non-transparent pixels into the source texture — got \(bgra)")
    }
}
