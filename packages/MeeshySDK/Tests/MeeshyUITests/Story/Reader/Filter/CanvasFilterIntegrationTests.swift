import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class CanvasFilterIntegrationTests: XCTestCase {

    // NB: `effects.filter` stores the **`StoryFilter` rawValue** ("vintage", "bw", …)
    // — that's what the filter grid persists (`applyFilter(filter.rawValue)`).
    //
    // Since 2026-06-03 ALL eight filters render on the canvas via CoreImage
    // (`StoryFilterProcessor`) instead of only the two that shipped a Metal kernel.
    // The overlay is a plain `CALayer` whose `contents` is the filtered full-canvas
    // snapshot, so every effect both renders AND covers the whole story.

    private let canvasSize = CGSize(width: 412, height: 732)

    private func makeView(filter: StoryFilter?, intensity: Double? = nil) -> StoryCanvasUIView {
        var effects = StoryEffects()
        effects.filter = filter?.rawValue
        effects.filterIntensity = intensity
        let slide = StorySlide(id: "s", effects: effects)
        let view = StoryCanvasUIView(slide: slide, mode: .play)
        view.frame = CGRect(origin: .zero, size: canvasSize)
        view.layoutIfNeeded()
        return view
    }

    /// Every `StoryFilter` (including warm/cool/dramatic/vivid/fade/chrome which
    /// had no Metal kernel) must attach a filter overlay that spans the whole
    /// canvas — the regression was that six of eight rendered nothing and the two
    /// that did only covered the top-left quadrant.
    func test_canvas_addsFullCanvasOverlay_forEveryStoryFilter() {
        for filter in StoryFilter.allCases {
            let view = makeView(filter: filter, intensity: 0.7)
            let overlay = view._filteredLayerForTesting
            XCTAssertNotNil(overlay, "Filter \(filter.rawValue) must attach a filter overlay layer")
            XCTAssertEqual(overlay?.frame, CGRect(origin: .zero, size: canvasSize),
                           "Filter overlay for \(filter.rawValue) must cover the full canvas")
        }
    }

    func test_canvas_noFilteredLayer_whenFilterUnset() {
        let view = makeView(filter: nil)
        XCTAssertNil(view._filteredLayerForTesting)
    }

    func test_canvas_removesFilteredLayer_whenEffectsFilterCleared() {
        let view = makeView(filter: .vintage)
        XCTAssertNotNil(view._filteredLayerForTesting)

        var clearedEffects = StoryEffects()
        clearedEffects.filter = nil
        view.slide = StorySlide(id: "s", effects: clearedEffects)
        view.layoutIfNeeded()

        XCTAssertNil(view._filteredLayerForTesting)
    }
}
