import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **Le marqueur de sélection et le menu d'appui long** (#13839, L5).
///
/// Le cadre blanc est parti (#14206) : `StoryCanvasThreeGesturesTests` en porte
/// le témoin. Reste ici ce qui ne laisse rien à l'écran et le menu qui n'est
/// jamais la fin d'un glissé.
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
