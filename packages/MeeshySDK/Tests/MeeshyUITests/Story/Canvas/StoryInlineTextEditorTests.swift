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

    // MARK: - sizeToFitTextContent

    func test_sizeToFitTextContent_emptyText_growsToPlaceholderWidth() {
        let editor = StoryInlineTextEditor()
        let text = StoryTextObject(id: "t1", text: "", fontSize: 96)
        editor.apply(textObject: text, geometry: geometry, setText: true)
        // Bounds initiaux (avant fit) sont à .zero — la calque ne les a pas
        // encore posées. On part de la même situation que `position(_:over:)`
        // sur une calque empty (bounds quasi-nulles).
        editor.bounds = .zero
        editor.sizeToFitTextContent(maxWidth: 350)

        // Régression : placeholder doit avoir assez d'espace pour s'afficher.
        // L'invite "Exprimez-vous…" en font 96 design (rendu ~36 pt) fait
        // typiquement ~200+ pt de large. On asserte qu'on a au moins 50 pt
        // pour échapper au cas dégénéré ~6 pt qui produisait le clip.
        XCTAssertGreaterThan(editor.bounds.width, 50)
        XCTAssertGreaterThan(editor.bounds.height, 10)
    }

    func test_sizeToFitTextContent_nonEmptyText_growsToTextSize() {
        let editor = StoryInlineTextEditor()
        let text = StoryTextObject(id: "t1", text: "Hello world", fontSize: 96)
        editor.apply(textObject: text, geometry: geometry, setText: true)
        editor.bounds = .zero
        editor.sizeToFitTextContent(maxWidth: 350)

        XCTAssertGreaterThan(editor.bounds.width, 50)
    }

    func test_sizeToFitTextContent_clampsToMaxWidth() {
        let editor = StoryInlineTextEditor()
        let text = StoryTextObject(id: "t1",
                                   text: "Un texte très très très très très long pour forcer le wrap",
                                   fontSize: 96)
        editor.apply(textObject: text, geometry: geometry, setText: true)
        editor.sizeToFitTextContent(maxWidth: 200)

        XCTAssertLessThanOrEqual(editor.bounds.width, 200)
    }

    func test_sizeToFitTextContent_preservesCenter() {
        let editor = StoryInlineTextEditor()
        let text = StoryTextObject(id: "t1", text: "abc", fontSize: 96)
        editor.apply(textObject: text, geometry: geometry, setText: true)
        editor.center = CGPoint(x: 195, y: 346)
        editor.sizeToFitTextContent(maxWidth: 350)

        // La croissance doit être symétrique autour du centre.
        XCTAssertEqual(editor.center.x, 195, accuracy: 0.5)
        XCTAssertEqual(editor.center.y, 346, accuracy: 0.5)
    }

    // MARK: - Placeholder contrast

    func test_placeholderTint_lightText_returnsLightPlaceholder() {
        let editor = StoryInlineTextEditor()
        let text = StoryTextObject(id: "t1", text: "", textColor: "FFFFFF")
        editor.apply(textObject: text, geometry: geometry, setText: true)

        // Texte blanc → background sombre attendu → placeholder doit rester
        // clair pour rester lisible (luminance > 0.5 → tint blanc translucide).
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        editor.subviews.compactMap { $0 as? UILabel }.first?
            .textColor?.getRed(&r, green: &g, blue: &b, alpha: &a)
        XCTAssertGreaterThan(r + g + b, 2.0, "tint doit être proche du blanc")
        XCTAssertGreaterThan(a, 0.5, "alpha bumpé ≥ 0.55 pour rester lisible")
    }

    func test_placeholderTint_darkText_returnsDarkPlaceholder() {
        let editor = StoryInlineTextEditor()
        let text = StoryTextObject(id: "t1", text: "", textColor: "111111")
        editor.apply(textObject: text, geometry: geometry, setText: true)

        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        editor.subviews.compactMap { $0 as? UILabel }.first?
            .textColor?.getRed(&r, green: &g, blue: &b, alpha: &a)
        XCTAssertLessThan(r + g + b, 1.0, "tint doit être proche du noir")
        XCTAssertGreaterThan(a, 0.4)
    }

    // MARK: - Rendu live des curseurs du panneau Police

    /// Le champ d'édition en place peint les glyphes pendant la frappe : c'est
    /// LUI qui doit refléter taille et graisse, pas seulement le calque en
    /// dessous. Rien dans le système de types ne garantit cette propriété.
    func test_theInlineEditorReflectsAWeightChangeWithoutRetyping() {
        let editor = StoryInlineTextEditor()
        var text = StoryTextObject(id: "t1", text: "Bonjour")

        text.fontWeight = StoryTextWeight.thin.rawValue
        editor.apply(textObject: text, geometry: geometry, setText: true)
        let thin = editor.font

        text.fontWeight = StoryTextWeight.bold.rawValue
        editor.apply(textObject: text, geometry: geometry, setText: false)

        XCTAssertNotEqual(editor.font, thin, "le champ doit re-résoudre sa police")
    }

    func test_theInlineEditorReflectsASizeChangeWithoutRetyping() {
        let editor = StoryInlineTextEditor()
        var text = StoryTextObject(id: "t1", text: "Bonjour")

        text.fontSize = 40
        editor.apply(textObject: text, geometry: geometry, setText: true)
        let small = editor.font?.pointSize ?? 0

        text.fontSize = 120
        editor.apply(textObject: text, geometry: geometry, setText: false)

        XCTAssertGreaterThan(editor.font?.pointSize ?? 0, small)
    }

    /// Le curseur de taille écrit `fontSize` ET remet `scale` à 1 : le champ
    /// lit le PRODUIT des deux, donc un `scale` résiduel gonflerait le rendu
    /// au-delà de la valeur affichée par le curseur.
    func test_theInlineEditorReadsTheProductOfSizeAndScale() {
        let editor = StoryInlineTextEditor()
        var text = StoryTextObject(id: "t1", text: "Bonjour")
        text.fontSize = 50
        text.scale = 2

        editor.apply(textObject: text, geometry: geometry, setText: true)
        let doubled = editor.font?.pointSize ?? 0

        TextEditToolOptions.applyingSliderValue(50, to: &text)
        editor.apply(textObject: text, geometry: geometry, setText: false)

        XCTAssertEqual(text.scale, 1)
        XCTAssertLessThan(editor.font?.pointSize ?? 0, doubled)
    }
}
