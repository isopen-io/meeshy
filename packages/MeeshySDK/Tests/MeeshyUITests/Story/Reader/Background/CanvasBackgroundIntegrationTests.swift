// packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Background/CanvasBackgroundIntegrationTests.swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class CanvasBackgroundIntegrationTests: XCTestCase {
    func test_canvas_inPlayMode_showsSolidColorBackgroundFromEffects() {
        // StoryEffects.background holds the hex color string
        var effects = StoryEffects()
        effects.background = "#FF0000"  // red hex
        let slide = StorySlide(id: "s", effects: effects)
        let view = StoryCanvasUIView(slide: slide, mode: .play)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        view.layoutIfNeeded()

        let bgLayer = findBackgroundLayer(in: view.layer)
        XCTAssertNotNil(bgLayer)
        XCTAssertEqual(bgLayer?.backgroundColor, UIColor.red.cgColor)
    }

    private func findBackgroundLayer(in root: CALayer) -> StoryBackgroundLayer? {
        if let bg = root as? StoryBackgroundLayer { return bg }
        for sub in (root.sublayers ?? []) {
            if let found = findBackgroundLayer(in: sub) { return found }
        }
        return nil
    }
}
