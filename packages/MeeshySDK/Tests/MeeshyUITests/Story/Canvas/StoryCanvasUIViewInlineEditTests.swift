import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryCanvasUIViewInlineEditTests: XCTestCase {

    private func makeCanvas() -> StoryCanvasUIView {
        let text = StoryTextObject(id: "t1", text: "Salut", x: 0.5, y: 0.5)
        let slide = StorySlide(id: "s1", effects: StoryEffects(textObjects: [text]))
        let canvas = StoryCanvasUIView(slide: slide, mode: .edit)
        canvas.frame = CGRect(x: 0, y: 0, width: 390, height: 693)
        canvas.layoutIfNeeded()
        return canvas
    }

    private func textLayer(_ canvas: StoryCanvasUIView, id: String) -> StoryTextLayer? {
        canvas.layer.sublayers?
            .flatMap { $0.sublayers ?? [] }
            .flatMap { $0.sublayers ?? [] }
            .compactMap { $0 as? StoryTextLayer }
            .first { $0.name == id }
    }

    func test_beginInlineTextEdit_suppressesGlyphs_andTracksId() {
        let canvas = makeCanvas()
        canvas.beginInlineTextEdit(textId: "t1")
        XCTAssertEqual(canvas.inlineEditingTextId, "t1")
        XCTAssertEqual(textLayer(canvas, id: "t1")?.glyphsHidden, true)
    }

    func test_endInlineTextEdit_restoresGlyphs() {
        let canvas = makeCanvas()
        canvas.beginInlineTextEdit(textId: "t1")
        canvas.endInlineTextEdit()
        XCTAssertNil(canvas.inlineEditingTextId)
        XCTAssertEqual(textLayer(canvas, id: "t1")?.glyphsHidden, false)
    }

    func test_rebuildDuringEditing_keepsGlyphsSuppressed() {
        let canvas = makeCanvas()
        canvas.beginInlineTextEdit(textId: "t1")
        // Une mutation de slide déclenche rebuildLayers() via slide.didSet.
        var slide = canvas.slide
        slide.effects.textObjects[0].text = "Salut!"
        canvas.slide = slide
        XCTAssertEqual(textLayer(canvas, id: "t1")?.glyphsHidden, true)
    }
}
