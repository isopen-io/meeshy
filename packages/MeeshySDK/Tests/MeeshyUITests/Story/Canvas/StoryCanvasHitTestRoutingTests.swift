import XCTest
import QuartzCore
@testable import MeeshyUI
@testable import MeeshySDK

/// Bug user 2026-07-11 : chip Foreground actif, drag d'un média foreground →
/// c'est le FOND qui bouge. Deux causes conjuguées :
/// 1. `CALayer.hitTest` natif ignore les zPosition et se fait avaler par les
///    overlays pleine-toile NON NOMMÉS (la layer de dessin, zPosition 9999) —
///    plus aucun item n'était touchable dès qu'un dessin existait.
/// 2. Le mode `.foreground` retombait sur le bg quand le hit ratait — le fond
///    ne doit être manipulable QUE via le chip Background (règle produit).
@MainActor
final class StoryCanvasHitTestRoutingTests: XCTestCase {

    private func makeCanvas() -> StoryCanvasUIView {
        var text = StoryTextObject(id: "t1", text: "Salut", x: 0.5, y: 0.5)
        text.fontSize = 96
        var bg = StoryMediaObject(id: "bg1", postMediaId: "bg1", kind: .image, aspectRatio: 1)
        bg.isBackground = true
        var slide = StorySlide(id: "s")
        slide.effects.textObjects = [text]
        slide.effects.mediaObjects = [bg]
        let canvas = StoryCanvasUIView(slide: slide, mode: .edit)
        canvas.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        // L'init ne déclenche pas `slide.didSet` — construire les layers
        // explicitement comme le ferait le premier layoutSubviews.
        canvas.rebuildLayers()
        return canvas
    }

    func test_hitTestItem_underUnnamedFullCanvasOverlay_stillFindsNamedItem() {
        let canvas = makeCanvas()
        // Simule la layer de DESSIN : pleine toile, zPosition 9999, sans nom.
        let drawing = CALayer()
        drawing.frame = CGRect(origin: .zero, size: canvas.bounds.size)
        drawing.zPosition = 9999
        canvas.itemsContainer.addSublayer(drawing)

        let center = CGPoint(x: canvas.bounds.midX, y: canvas.bounds.midY)
        XCTAssertEqual(canvas.hitTestItem(at: center), "t1",
                       "L'overlay de dessin non nommé ne doit pas avaler le hit-test des items")
    }

    func test_resolveManipulationTarget_foregroundMiss_doesNotFallBackToBackground() {
        let canvas = makeCanvas()

        // Coin du canvas : aucun item foreground sous le doigt.
        let corner = CGPoint(x: 3, y: 3)
        XCTAssertNil(canvas.resolveManipulationTarget(at: corner),
                     "En couche Foreground, rater un item ne doit PAS manipuler le fond — le fond n'est mouvable que via le chip Background")
    }

    func test_resolveManipulationTarget_backgroundLayer_stillTargetsBackground() {
        let canvas = makeCanvas()
        canvas.currentManipulationLayer = .background

        XCTAssertEqual(canvas.resolveManipulationTarget(at: CGPoint(x: 3, y: 3)), "bg1",
                       "Le chip Background reste le chemin de manipulation du fond")
    }
}
