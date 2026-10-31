import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **La sélection se VOIT, sur la scène, et nulle part ailleurs** (#13839, L5).
///
/// La maquette du 2026-10-30 dessine l'élément sélectionné dans un cadre
/// pointillé blanc de 2 pt, décalé de 3 pt, aux bornes réelles de son calque —
/// rotation et échelle comprises. Le cadre est un chrome d'ÉDITION : il vit dans
/// `editOverlayLayer`, jamais parmi les objets (qui sont ce que l'export, la
/// vignette et le lecteur reconstruisent).
@MainActor
final class StoryCanvasSelectionFrameTests: XCTestCase {

    private func canvas(texts: [StoryTextObject] = [StoryTextObject(id: "t", text: "Bonjour Meeshy")])
    -> StoryCanvasUIView {
        let slide = StorySlide(id: "s", effects: StoryEffects(textObjects: texts), duration: 6, order: 0)
        let vue = StoryCanvasUIView(slide: slide, mode: .edit)
        vue.frame = CGRect(x: 0, y: 0, width: 360, height: 640)
        vue.layoutIfNeeded()
        return vue
    }

    // MARK: - La géométrie

    func test_selectionFramePath_unrotatedLayer_outlinesBoundsThreePointsOut() {
        let chemin = StorySelectionFrame.path(bounds: CGRect(x: 0, y: 0, width: 100, height: 50),
                                                position: CGPoint(x: 200, y: 300),
                                                anchorPoint: CGPoint(x: 0.5, y: 0.5),
                                                transform: .identity,
                                                offset: 3)
        let boite = chemin.boundingBoxOfPath
        XCTAssertEqual(boite.minX, 147, accuracy: 0.01)
        XCTAssertEqual(boite.minY, 272, accuracy: 0.01)
        XCTAssertEqual(boite.width, 106, accuracy: 0.01)
        XCTAssertEqual(boite.height, 56, accuracy: 0.01)
    }

    func test_selectionFramePath_rotatedLayer_followsTheRotation() {
        let chemin = StorySelectionFrame.path(bounds: CGRect(x: 0, y: 0, width: 100, height: 50),
                                                position: CGPoint(x: 200, y: 300),
                                                anchorPoint: CGPoint(x: 0.5, y: 0.5),
                                                transform: CGAffineTransform(rotationAngle: .pi / 2),
                                                offset: 3)
        let boite = chemin.boundingBoxOfPath
        XCTAssertEqual(boite.width, 56, accuracy: 0.01, "un quart de tour échange les côtés du cadre")
        XCTAssertEqual(boite.height, 106, accuracy: 0.01)
        XCTAssertEqual(boite.midX, 200, accuracy: 0.01)
        XCTAssertEqual(boite.midY, 300, accuracy: 0.01)
    }

    func test_selectionFramePath_scaledLayer_keepsTheOffsetInScreenPoints() {
        let chemin = StorySelectionFrame.path(bounds: CGRect(x: 0, y: 0, width: 100, height: 50),
                                                position: CGPoint(x: 200, y: 300),
                                                anchorPoint: CGPoint(x: 0.5, y: 0.5),
                                                transform: CGAffineTransform(scaleX: 2, y: 2),
                                                offset: 3)
        let boite = chemin.boundingBoxOfPath
        XCTAssertEqual(boite.width, 206, accuracy: 0.01, "le décalage reste de 3 pt à l'écran, quelle que soit l'échelle")
        XCTAssertEqual(boite.height, 106, accuracy: 0.01)
    }

    // MARK: - Le calque

    func test_setSelectionMarker_selectedText_paintsDashedWhiteTwoPointFrameInTheEditOverlay() throws {
        let vue = canvas()
        vue.setSelectionMarker(id: "t")
        let cadre = try XCTUnwrap(vue.selectionMarkerLayers.compactMap { $0 as? CAShapeLayer }.first,
                                  "le cadre doit être un tracé, pas une bordure de boîte")
        XCTAssertEqual(cadre.lineWidth, 2)
        XCTAssertEqual(cadre.lineDashPattern?.isEmpty, false, "le cadre est POINTILLÉ")
        XCTAssertEqual(cadre.strokeColor, UIColor.white.cgColor)
        XCTAssertNil(cadre.fillColor)
        XCTAssertTrue(cadre.superlayer === vue.editOverlayLayer, "chrome d'édition, hors des objets")
        XCTAssertFalse(vue.itemsContainer.sublayers?.contains(cadre) ?? false)
    }

    func test_setSelectionMarker_selectedText_drawsNoCornerHandles() {
        let vue = canvas()
        vue.setSelectionMarker(id: "t")
        XCTAssertEqual(vue.selectionMarkerLayers.count, 1, "un seul cadre, ni poignées ni badge sans libellé")
    }

    func test_setSelectionMarker_nil_leavesNothingOnScreen() {
        let vue = canvas()
        vue.setSelectionMarker(id: "t")
        vue.setSelectionMarker(id: nil)
        XCTAssertTrue(vue.selectionMarkerLayers.isEmpty)
        XCTAssertFalse(vue.editOverlayLayer.sublayers?.contains { $0 is CAShapeLayer } ?? false)
    }

    // MARK: - Le menu contextuel n'est pas la fin d'un glissé

    func test_contextMenuGate_duringManipulation_refuses() {
        XCTAssertFalse(StoryCanvasContextMenuGate.admits(isManipulating: true, lastManipulationEnd: nil,
                                                         now: Date()))
    }

    func test_contextMenuGate_rightAfterASlowDrag_refuses() {
        let fin = Date()
        XCTAssertFalse(StoryCanvasContextMenuGate.admits(isManipulating: false, lastManipulationEnd: fin,
                                                         now: fin.addingTimeInterval(0.2)))
    }

    func test_contextMenuGate_stillPressWithoutDrag_admits() {
        let fin = Date()
        XCTAssertTrue(StoryCanvasContextMenuGate.admits(isManipulating: false, lastManipulationEnd: nil, now: fin))
        XCTAssertTrue(StoryCanvasContextMenuGate.admits(isManipulating: false, lastManipulationEnd: fin,
                                                        now: fin.addingTimeInterval(2)))
    }

    func test_contextMenu_whileAnItemIsDragged_asksTheHostForNothing() {
        let vue = canvas()
        var demandes = 0
        vue.onItemMenuRequested = { _, _, _ in demandes += 1 }
        vue.manipulatedItemId = "t"
        let centre = vue.accessibilityFrame(forId: "t")
        _ = vue.contextMenuInteraction(UIContextMenuInteraction(delegate: vue),
                                       configurationForMenuAtLocation: CGPoint(x: centre.midX, y: centre.midY))
        XCTAssertEqual(demandes, 0, "un glissé en cours n'ouvre pas le menu")
    }

    // MARK: - Le résumé VoiceOver compte le dessin

    func test_editAccessibilityElements_withDrawing_summaryCountsTheDrawing() throws {
        var effets = StoryEffects(textObjects: [StoryTextObject(id: "t", text: "Bonjour")])
        effets.drawingStrokes = [StoryDrawingStroke(points: [StoryDrawingStrokePoint(x: 100, y: 100),
                                                             StoryDrawingStrokePoint(x: 400, y: 400)],
                                                    colorHex: "FFFFFF", width: 8)]
        let vue = StoryCanvasUIView(slide: StorySlide(id: "s", effects: effets, duration: 6, order: 0), mode: .edit)
        vue.frame = CGRect(x: 0, y: 0, width: 360, height: 640)
        let resume = try XCTUnwrap(vue.editAccessibilityElements().first?.accessibilityLabel)
        XCTAssertTrue(resume.contains(vue.drawingAccessibilityWord), "le dessin fait partie de la scène : \(resume)")
        XCTAssertTrue(resume.contains("2"), "deux objets : le texte et le dessin — \(resume)")
    }
}
