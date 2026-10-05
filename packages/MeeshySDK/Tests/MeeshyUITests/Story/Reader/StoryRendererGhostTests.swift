import XCTest
import CoreMedia
@testable import MeeshyUI
@testable import MeeshySDK

/// **Le fantôme de la frise** (#8370, lot 6 — maquette `Main.dc.html` : hors de
/// sa fenêtre, un objet est caché en lecture et à .25 à l'arrêt).
@MainActor
final class StoryRendererGhostTests: XCTestCase {

    private func slide() -> StorySlide {
        var texte = StoryTextObject(id: "t1", text: "Bonjour")
        texte.startTime = 3
        texte.duration = 2
        return StorySlide(id: "s", effects: StoryEffects(textObjects: [texte]))
    }

    private let geom = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))

    private func at(_ seconds: Double) -> CMTime { CMTime(seconds: seconds, preferredTimescale: 600) }

    func test_sansFantome_unObjetHorsFenetreNExistePas() {
        let layer = StoryRenderer.render(slide: slide(), into: geom, at: at(1), mode: .play)
        XCTAssertNil(layer.findFirst(named: "t1"), "Le lecteur et l'export ne montrent rien hors fenêtre.")
    }

    func test_avecFantome_unObjetHorsFenetreSeVoitA25() {
        let layer = StoryRenderer.render(slide: slide(), into: geom, at: at(1), mode: .play,
                                         outOfWindowGhostOpacity: 0.25)
        XCTAssertEqual(layer.findFirst(named: "t1")?.opacity ?? -1, 0.25, accuracy: 0.001)
    }

    func test_dansSaFenetre_leFantomeNeTouchePasLObjet() {
        let layer = StoryRenderer.render(slide: slide(), into: geom, at: at(4), mode: .play,
                                         outOfWindowGhostOpacity: 0.25)
        XCTAssertEqual(layer.findFirst(named: "t1")?.opacity ?? -1, 1, accuracy: 0.001)
    }

    /// Le cache RÉUTILISE la couche d'un tick à l'autre : revenue dans sa
    /// fenêtre, elle ne doit pas garder l'opacité du fantôme.
    func test_uneCoucheReutilisee_quiRentreDansSaFenetre_perdSonFantome() {
        let cache = StoryRendererCache()
        _ = StoryRenderer.render(slide: slide(), into: geom, at: at(1), mode: .play,
                                 cache: cache, outOfWindowGhostOpacity: 0.25)
        let layer = StoryRenderer.render(slide: slide(), into: geom, at: at(4), mode: .play,
                                         cache: cache, outOfWindowGhostOpacity: 0.25)
        XCTAssertEqual(layer.findFirst(named: "t1")?.opacity ?? -1, 1, accuracy: 0.001)
    }
}
