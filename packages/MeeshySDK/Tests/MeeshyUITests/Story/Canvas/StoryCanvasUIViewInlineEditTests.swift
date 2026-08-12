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

    // MARK: - Ombrage pendant l'édition (spec 2026-08-01)

    func test_beginInlineTextEdit_showsTheScrim() {
        let canvas = makeCanvas()
        XCTAssertEqual(canvas.inlineEditScrimLayer.opacity, 0,
                       "Au repos, aucun ombrage sur le canvas")

        canvas.beginInlineTextEdit(textId: "t1")

        XCTAssertEqual(canvas.inlineEditScrimLayer.opacity, 1,
                       "L'édition assombrit le reste du canvas")
        XCTAssertFalse(canvas.inlineEditScrimLayer.isHidden)
    }

    func test_endInlineTextEdit_hidesTheScrim() {
        let canvas = makeCanvas()
        canvas.beginInlineTextEdit(textId: "t1")
        canvas.endInlineTextEdit()

        XCTAssertEqual(canvas.inlineEditScrimLayer.opacity, 0,
                       "Sortir de l'édition rend le canvas à sa luminosité réelle")
    }

    /// L'ombrage doit couvrir tout ce que le canvas peint — donc être au-dessus
    /// de `rootLayer` — tout en restant SOUS les glyphes éditables, peints par
    /// le champ. Le champ étant une sous-VUE, sa calque est ajoutée en dernier.
    func test_scrim_sitsAboveRootLayer_andBelowTheEditor() throws {
        let canvas = makeCanvas()
        canvas.beginInlineTextEdit(textId: "t1")

        let sublayers = try XCTUnwrap(canvas.layer.sublayers)
        let rootIndex = try XCTUnwrap(sublayers.firstIndex(of: canvas.rootLayer))
        let scrimIndex = try XCTUnwrap(sublayers.firstIndex(of: canvas.inlineEditScrimLayer))
        let editorLayer = try XCTUnwrap(canvas.inlineEditor?.layer)
        let editorIndex = try XCTUnwrap(sublayers.firstIndex(of: editorLayer))

        XCTAssertLessThan(rootIndex, scrimIndex, "L'ombrage couvre tout le rendu du canvas")
        XCTAssertLessThan(scrimIndex, editorIndex, "Les glyphes édités restent nets")
    }

    func test_scrim_coversTheWholeCanvas() {
        let canvas = makeCanvas()
        canvas.beginInlineTextEdit(textId: "t1")
        XCTAssertEqual(canvas.inlineEditScrimLayer.frame, canvas.bounds)
    }

    func test_rebuildDuringEditing_keepsTheScrimVisible() {
        let canvas = makeCanvas()
        canvas.beginInlineTextEdit(textId: "t1")

        var slide = canvas.slide
        slide.effects.textObjects[0].text = "Salut!"
        canvas.slide = slide

        XCTAssertEqual(canvas.inlineEditScrimLayer.opacity, 1,
                       "Une reconstruction des calques ne doit pas effacer l'ombrage")
    }

    // MARK: - Fenêtre de défilement du fond

    /// Le fond du texte (bulle, glass, losange) est peint par la calque, dont
    /// les sous-calques sont dimensionnés dans `configure()`. Un texte plus haut
    /// que la zone garderait un fond sortant de l'écran sous une fenêtre de
    /// texte bornée — d'où le masque, qui aligne le fond sur cette fenêtre.
    func test_longTextDuringEditing_masksTheLayerToTheEditingWindow() throws {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 900))
        let canvas = makeCanvas()
        window.addSubview(canvas)
        window.isHidden = false
        canvas.inlineEditCeilingGlobalY = 120
        canvas.inlineEditFloorGlobalY = 520

        var slide = canvas.slide
        slide.effects.textObjects[0].text = Array(repeating: "Une ligne", count: 40)
            .joined(separator: "\n")
        canvas.slide = slide
        canvas.beginInlineTextEdit(textId: "t1")

        let layer = try XCTUnwrap(textLayer(canvas, id: "t1"))
        let zone = try XCTUnwrap(canvas.inlineEditZone)
        let mask = try XCTUnwrap(layer.mask)

        XCTAssertLessThanOrEqual(mask.bounds.height, zone.height + 0.5,
                                 "Le fond visible ne dépasse pas la fenêtre d'édition")
        _ = window
    }

    func test_endInlineTextEdit_removesTheLayerMask() throws {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 900))
        let canvas = makeCanvas()
        window.addSubview(canvas)
        window.isHidden = false
        canvas.inlineEditCeilingGlobalY = 120
        canvas.inlineEditFloorGlobalY = 520

        canvas.beginInlineTextEdit(textId: "t1")
        canvas.endInlineTextEdit()

        XCTAssertNil(textLayer(canvas, id: "t1")?.mask,
                     "Hors édition, la calque retrouve son rendu intégral")
        _ = window
    }
}
