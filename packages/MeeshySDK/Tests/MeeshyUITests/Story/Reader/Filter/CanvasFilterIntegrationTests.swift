import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class CanvasFilterIntegrationTests: XCTestCase {

    func test_canvas_addsFilteredLayer_whenEffectsFilterSet() {
        var effects = StoryEffects()
        effects.filter = "vintageFilter"
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

    func test_canvas_removesFilteredLayer_whenEffectsFilterCleared() {
        var effects = StoryEffects()
        effects.filter = "vintageFilter"
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
