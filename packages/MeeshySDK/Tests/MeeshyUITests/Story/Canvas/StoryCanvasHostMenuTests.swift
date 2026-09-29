import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **L'hôte peut peindre lui-même le menu d'appui long** (#8717, directive
/// porteur 2026-09-29 : « le menu du longpress, sur n'importe quel objet, doit
/// être Liquid Glass »). Le canvas lui remet l'objet et le point du doigt,
/// normalisé sur la carte ; sans hôte câblé, le `UIMenu` reste.
@MainActor
final class StoryCanvasHostMenuTests: XCTestCase {

    func test_normalized_pointDansLaCarte_rendSaFraction() {
        let point = StoryCanvasUIView.normalized(CGPoint(x: 103, y: 549), in: CGSize(width: 412, height: 732))
        XCTAssertEqual(point.x, 0.25, accuracy: 0.0001)
        XCTAssertEqual(point.y, 0.75, accuracy: 0.0001)
    }

    func test_normalized_horsCarte_estBorne() {
        let point = StoryCanvasUIView.normalized(CGPoint(x: -40, y: 900), in: CGSize(width: 412, height: 732))
        XCTAssertEqual(point, CGPoint(x: 0, y: 1))
    }

    func test_normalized_carteSansTaille_rendLeCentre() {
        XCTAssertEqual(StoryCanvasUIView.normalized(CGPoint(x: 10, y: 10), in: .zero),
                       CGPoint(x: 0.5, y: 0.5))
    }

    func test_sansHoteCable_leMenuSystemeReste() {
        let media = StoryMediaObject(id: "m", kind: .image, aspectRatio: 1)
        let slide = StorySlide(id: "s", effects: StoryEffects(mediaObjects: [media]), duration: 6, order: 0)
        let vue = StoryCanvasUIView(slide: slide, mode: .edit)
        XCTAssertNil(vue.onItemMenuRequested, "par défaut, aucun hôte ne peint le menu")
        XCTAssertFalse(vue.contextMenu(for: "m", kind: .media).children.isEmpty)
    }

    // MARK: - Devenir le fond (#8716)

    func test_offered_premierPlanSansFond_proposeMettreEnFond() {
        let offertes = StoryCanvasContextAction.offered(isLocked: false, isBackground: false,
                                                        sharesPlaneWithAnother: false, hasEditor: true,
                                                        canBecomeBackground: true, sceneHasBackground: false)
        XCTAssertTrue(offertes.contains(.setAsBackground))
        XCTAssertFalse(offertes.contains(.replaceBackground))
        XCTAssertEqual(offertes.last, .delete, "la destruction reste la dernière")
    }

    func test_offered_premierPlanAvecFond_proposeRemplacerLeFond() {
        let offertes = StoryCanvasContextAction.offered(isLocked: false, isBackground: false,
                                                        sharesPlaneWithAnother: false, hasEditor: true,
                                                        canBecomeBackground: true, sceneHasBackground: true)
        XCTAssertTrue(offertes.contains(.replaceBackground))
        XCTAssertFalse(offertes.contains(.setAsBackground))
    }

    func test_offered_parDefaut_ferme() {
        let offertes = StoryCanvasContextAction.offered(isLocked: false, isBackground: false,
                                                        sharesPlaneWithAnother: false, hasEditor: true)
        XCTAssertFalse(offertes.contains(.setAsBackground))
        XCTAssertFalse(offertes.contains(.replaceBackground))
    }

    func test_offered_fondOuVerrou_nePeuventPasDevenirLeFond() {
        for (verrou, fond) in [(true, false), (false, true)] {
            let offertes = StoryCanvasContextAction.offered(isLocked: verrou, isBackground: fond,
                                                            sharesPlaneWithAnother: false, hasEditor: true,
                                                            canBecomeBackground: true, sceneHasBackground: true)
            XCTAssertFalse(offertes.contains(.replaceBackground))
        }
    }

    func test_devenirLeFond_estRemisALHote() {
        let media = StoryMediaObject(id: "m", kind: .image, aspectRatio: 1)
        let slide = StorySlide(id: "s", effects: StoryEffects(mediaObjects: [media]), duration: 6, order: 0)
        let vue = StoryCanvasUIView(slide: slide, mode: .edit)
        var recu: String?
        vue.onItemMadeBackground = { id, _ in recu = id }
        vue.performContextAction(.replaceBackground, on: "m", kind: .media)
        XCTAssertEqual(recu, "m")
    }
}
