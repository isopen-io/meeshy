import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class CanvasFilterIntegrationTests: XCTestCase {

    // NB: `effects.filter` stores the **`StoryFilter` rawValue** ("vintage", "bw", …)
    // — that's what the filter grid persists (`applyFilter(filter.rawValue)`). It is
    // NOT the Metal kernel function name ("vintageFilter"). These tests therefore use
    // the production vocabulary; an earlier version used "vintageFilter" and so never
    // exercised the real path, masking the namespace mismatch that left filters dead
    // on the canvas/viewer (fix 2026-06-01).
    func test_canvas_addsFilteredLayer_whenEffectsFilterSet() {
        var effects = StoryEffects()
        effects.filter = StoryFilter.vintage.rawValue   // "vintage"
        effects.filterIntensity = 0.7
        let slide = StorySlide(id: "s", effects: effects)
        let view = StoryCanvasUIView(slide: slide, mode: .play)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        view.layoutIfNeeded()

        let filtered = findFilteredLayer(in: view.layer)
        XCTAssertNotNil(filtered)
        XCTAssertEqual(filtered?.kind, .vintage)
        XCTAssertEqual(filtered?.intensity ?? 0, 0.7, accuracy: 1e-3)
    }

    func test_canvas_addsBwContrastLayer_whenFilterIsBw() {
        var effects = StoryEffects()
        effects.filter = StoryFilter.bw.rawValue   // "bw" → bwContrast kernel
        let slide = StorySlide(id: "s", effects: effects)
        let view = StoryCanvasUIView(slide: slide, mode: .play)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        view.layoutIfNeeded()

        let filtered = findFilteredLayer(in: view.layer)
        XCTAssertNotNil(filtered)
        XCTAssertEqual(filtered?.kind, .bwContrast)
    }

    func test_canvas_noFilteredLayer_forKernellessFilter() {
        // warm/cool/dramatic/vivid/fade/chrome have no bundled Metal kernel yet, so
        // the canvas must add no filter layer (rather than crash or pick a wrong kernel).
        var effects = StoryEffects()
        effects.filter = StoryFilter.warm.rawValue
        let slide = StorySlide(id: "s", effects: effects)
        let view = StoryCanvasUIView(slide: slide, mode: .play)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        view.layoutIfNeeded()

        XCTAssertNil(findFilteredLayer(in: view.layer))
    }

    func test_canvas_removesFilteredLayer_whenEffectsFilterCleared() {
        var effects = StoryEffects()
        effects.filter = StoryFilter.vintage.rawValue
        let slide = StorySlide(id: "s", effects: effects)
        let view = StoryCanvasUIView(slide: slide, mode: .play)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        view.layoutIfNeeded()

        var clearedEffects = StoryEffects()
        clearedEffects.filter = nil
        view.slide = StorySlide(id: "s", effects: clearedEffects)
        view.layoutIfNeeded()

        let filtered = findFilteredLayer(in: view.layer)
        XCTAssertNil(filtered)
    }

    // MARK: - Helpers

    private func findFilteredLayer(in root: CALayer) -> StoryFilteredLayer? {
        if let f = root as? StoryFilteredLayer { return f }
        for sub in (root.sublayers ?? []) {
            if let found = findFilteredLayer(in: sub) { return found }
        }
        return nil
    }
}
