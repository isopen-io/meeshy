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
}
