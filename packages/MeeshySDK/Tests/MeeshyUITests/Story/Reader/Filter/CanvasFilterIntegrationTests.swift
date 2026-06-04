import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class CanvasFilterIntegrationTests: XCTestCase {

    // Since the 2026-06-03 pivot the story filter is BAKED into the background
    // bitmap by `StoryBackgroundLayer` (no overlay). `StoryCanvasUIView` simply
    // forwards `slide.effects.filter` / `filterIntensity` into the background
    // layer's `configure(...)`. These tests pin that wiring: the background
    // layer's `activeFilter` must reflect the slide's effect for all eight
    // filters, clear when unset, and update on change.

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

    func test_canvas_bakesEveryStoryFilter_intoBackgroundLayer() {
        for filter in StoryFilter.allCases {
            let view = makeView(filter: filter, intensity: 0.7)
            XCTAssertEqual(view.backgroundLayer.activeFilter, filter,
                           "Filter \(filter.rawValue) must be forwarded to the background layer")
            XCTAssertEqual(view.backgroundLayer.activeFilterIntensity, 0.7, accuracy: 1e-3)
        }
    }

    func test_canvas_clearsBackgroundFilter_whenUnset() {
        let view = makeView(filter: nil)
        XCTAssertNil(view.backgroundLayer.activeFilter)
    }

    func test_canvas_updatesBackgroundFilter_whenChanged() {
        let view = makeView(filter: .vintage)
        XCTAssertEqual(view.backgroundLayer.activeFilter, .vintage)

        var changed = StoryEffects()
        changed.filter = StoryFilter.bw.rawValue
        view.slide = StorySlide(id: "s", effects: changed)
        view.layoutIfNeeded()

        XCTAssertEqual(view.backgroundLayer.activeFilter, .bw)
    }
}
