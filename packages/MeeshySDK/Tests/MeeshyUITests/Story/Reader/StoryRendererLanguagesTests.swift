import XCTest
import CoreMedia
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryRendererLanguagesTests: XCTestCase {

    func test_render_inPlayMode_appliesPreferredLanguagesToText() {
        let textObj = StoryTextObject(id: "t1", text: "Hello",
                                      translations: ["fr": "Bonjour"])
        let effects = StoryEffects(textObjects: [textObj])
        let slide = StorySlide(id: "s", effects: effects)
        let geom = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))

        let layer = StoryRenderer.render(slide: slide, into: geom, at: .zero,
                                         mode: .play, languages: ["fr"])
        let textLayer = layer.findFirst(named: "t1") as? StoryTextLayer
        XCTAssertNotNil(textLayer)
        let displayed = (textLayer?.string as? NSAttributedString)?.string
            ?? textLayer?.string as? String
        XCTAssertEqual(displayed, "Bonjour")
    }

    func test_render_inEditMode_ignoresLanguages() {
        let textObj = StoryTextObject(id: "t1", text: "Hello",
                                      translations: ["fr": "Bonjour"])
        let effects = StoryEffects(textObjects: [textObj])
        let slide = StorySlide(id: "s", effects: effects)
        let geom = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))

        let layer = StoryRenderer.render(slide: slide, into: geom, at: .zero,
                                         mode: .edit, languages: ["fr"])
        let textLayer = layer.findFirst(named: "t1") as? StoryTextLayer
        XCTAssertNotNil(textLayer)
        let displayed = (textLayer?.string as? NSAttributedString)?.string
            ?? textLayer?.string as? String
        XCTAssertEqual(displayed, "Hello")  // raw source in edit mode
    }
}

extension CALayer {
    func findFirst(named targetName: String) -> CALayer? {
        if self.name == targetName { return self }
        for sub in (sublayers ?? []) {
            if let found = sub.findFirst(named: targetName) { return found }
        }
        return nil
    }
}
