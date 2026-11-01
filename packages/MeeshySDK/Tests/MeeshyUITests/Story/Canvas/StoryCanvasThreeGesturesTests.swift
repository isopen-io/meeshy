import XCTest
import UIKit
import UIKit.UIGestureRecognizerSubclass
@testable import MeeshyUI
@testable import MeeshySDK

/// **Toucher, toucher-déplacer, appui long : trois gestes, aucun chevauchement** (#14206).
///
/// Le menu peint par l'hôte partait de `configurationForMenuAtLocation`, que
/// `UIContextMenuInteraction` appelle dès que le doigt se pose, avant de savoir
/// s'il bougera : toucher puis déplacer un objet ouvrait le menu. Il part
/// désormais de l'appui long du canvas, qui échoue dès que le doigt dépasse la
/// tolérance et s'exclut du glissé.
@MainActor
final class StoryCanvasThreeGesturesTests: XCTestCase {

    private final class AppuiLong: UILongPressGestureRecognizer {
        var etat: UIGestureRecognizer.State = .began
        var point: CGPoint = .zero
        override var state: UIGestureRecognizer.State {
            get { etat }
            set { etat = newValue }
        }
        override func location(in view: UIView?) -> CGPoint { point }
    }

    private func canvas() -> StoryCanvasUIView {
        let texte = StoryTextObject(id: "t", text: "Bonjour Meeshy")
        let slide = StorySlide(id: "s", effects: StoryEffects(textObjects: [texte]), duration: 6, order: 0)
        let vue = StoryCanvasUIView(slide: slide, mode: .edit)
        vue.frame = CGRect(x: 0, y: 0, width: 360, height: 640)
        vue.layoutIfNeeded()
        return vue
    }

    private func centreDuTexte(_ vue: StoryCanvasUIView) -> CGPoint {
        let cadre = vue.accessibilityFrame(forId: "t")
        return CGPoint(x: cadre.midX, y: cadre.midY)
    }

    func test_toucherPose_neDemandeJamaisLeMenuALHote() {
        let vue = canvas()
        var demandes = 0
        vue.onItemMenuRequested = { _, _, _ in demandes += 1 }
        let configuration = vue.contextMenuInteraction(UIContextMenuInteraction(delegate: vue),
                                                       configurationForMenuAtLocation: centreDuTexte(vue))
        XCTAssertNil(configuration)
        XCTAssertEqual(demandes, 0, "un doigt qui se pose peut encore glisser : aucun menu avant l'appui long")
    }

    func test_appuiLongImmobile_surUnObjet_ouvreLeMenuUneFois() {
        let vue = canvas()
        var recus: [String] = []
        vue.onItemMenuRequested = { id, _, _ in recus.append(id) }
        let appui = AppuiLong()
        appui.point = centreDuTexte(vue)
        vue.handleBackgroundLongPress(appui)
        appui.etat = .changed
        vue.handleBackgroundLongPress(appui)
        appui.etat = .ended
        vue.handleBackgroundLongPress(appui)
        XCTAssertEqual(recus, ["t"])
    }

    func test_appuiLong_surUnObjet_nOuvreJamaisLeViseur() {
        let vue = canvas()
        var viseurs = 0
        vue.onBackgroundLongPressed = { viseurs += 1 }
        vue.onItemMenuRequested = { _, _, _ in }
        let appui = AppuiLong()
        appui.point = centreDuTexte(vue)
        vue.handleBackgroundLongPress(appui)
        XCTAssertEqual(viseurs, 0)
    }

    func test_appuiLong_pendantUnGlisse_neDemandeRien() {
        let vue = canvas()
        var demandes = 0
        vue.onItemMenuRequested = { _, _, _ in demandes += 1 }
        vue.manipulatedItemId = "t"
        let appui = AppuiLong()
        appui.point = centreDuTexte(vue)
        vue.handleBackgroundLongPress(appui)
        XCTAssertEqual(demandes, 0)
    }

    func test_appuiLong_toleranceDuDoigt_estLeSlopSysteme() {
        let vue = canvas()
        XCTAssertEqual(vue.backgroundLongPressRecognizer.allowableMovement, StoryCanvasUIView.longPressTolerance)
        XCTAssertEqual(StoryCanvasUIView.longPressTolerance, 10)
    }

    func test_glisseEtAppuiLong_sExcluent() {
        let vue = canvas()
        XCTAssertFalse(vue.gestureRecognizer(vue.panRecognizer,
                                             shouldRecognizeSimultaneouslyWith: vue.backgroundLongPressRecognizer))
        XCTAssertFalse(vue.gestureRecognizer(vue.backgroundLongPressRecognizer,
                                             shouldRecognizeSimultaneouslyWith: vue.panRecognizer))
    }

    func test_toucher_selectionneSansCadre() {
        let vue = canvas()
        vue.setSelectionMarker(id: "t")
        XCTAssertTrue(vue.selectionMarkerLayers.isEmpty, "la sélection change le rail, aucun cadre ne se peint")
        XCTAssertFalse(vue.editOverlayLayer.sublayers?.contains { $0 is CAShapeLayer } ?? false)
    }

    func test_selectionAvecBadgeDEnvoi_peintLeBadgeSeul() {
        let vue = canvas()
        vue.setSelectionMarker(id: "t", badge: "Envoi 40 %")
        XCTAssertEqual(vue.selectionMarkerLayers.count, 1)
        XCTAssertTrue(vue.selectionMarkerLayers.first is CATextLayer)
    }
}
