import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryInlineTextEditorTests: XCTestCase {

    private let geometry = CanvasGeometry(renderSize: CGSize(width: 390, height: 693))

    func test_apply_setsColorAlignmentAndText() {
        let text = StoryTextObject(id: "t1", text: "Bonjour",
                                   textColor: "FF0000", textAlign: "left")
        let editor = StoryInlineTextEditor()
        editor.apply(textObject: text, geometry: geometry, setText: true)

        XCTAssertEqual(editor.text, "Bonjour")
        XCTAssertEqual(editor.textAlignment, .left)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        editor.textColor?.getRed(&r, green: &g, blue: &b, alpha: &a)
        XCTAssertEqual(r, 1, accuracy: 0.02)
        XCTAssertEqual(g, 0, accuracy: 0.02)
    }

    func test_apply_setFalse_doesNotOverwriteText() {
        let editor = StoryInlineTextEditor()
        editor.text = "déjà tapé"
        let text = StoryTextObject(id: "t1", text: "valeur modèle")
        editor.apply(textObject: text, geometry: geometry, setText: false)
        XCTAssertEqual(editor.text, "déjà tapé")
    }

    func test_placeholder_visibleWhenEmpty_hiddenWhenTyped() {
        let editor = StoryInlineTextEditor()
        let text = StoryTextObject(id: "t1", text: "")
        editor.apply(textObject: text, geometry: geometry, setText: true)
        XCTAssertFalse(editor.isPlaceholderHidden)

        editor.text = "x"
        editor.updatePlaceholderVisibility()
        XCTAssertTrue(editor.isPlaceholderHidden)
    }

    func test_apply_withBorder_appliesStrokeAttributes() {
        let editor = StoryInlineTextEditor()
        let text = StoryTextObject(id: "t1", text: "Salut",
                                   borderColor: "FF0000", borderWidth: 4)
        editor.apply(textObject: text, geometry: geometry, setText: true)

        let attrs = editor.textStorage.attributes(at: 0, effectiveRange: nil)
        XCTAssertNotNil(attrs[.strokeColor], "le contour doit être appliqué au texte saisi")
        let stroke = (attrs[.strokeWidth] as? NSNumber)?.doubleValue ?? 0
        XCTAssertLessThan(stroke, 0, "strokeWidth négatif = remplir + contourer")
        XCTAssertNotNil(editor.typingAttributes[.strokeColor],
                        "la frappe à venir doit aussi être contourée")
    }

    func test_apply_withoutBorder_hasNoStroke() {
        let editor = StoryInlineTextEditor()
        let text = StoryTextObject(id: "t1", text: "Salut")
        editor.apply(textObject: text, geometry: geometry, setText: true)
        let attrs = editor.textStorage.attributes(at: 0, effectiveRange: nil)
        XCTAssertNil(attrs[.strokeColor], "sans bordure, aucun contour")
    }
}
