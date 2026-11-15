import XCTest
import MeeshySDK
@testable import Meeshy

/// **LE CACHE DU FIL NE DOIT PAS FAIRE BASCULER LA ROUTE** (#6893).
///
/// `GRDBCacheStore<String, FeedPost>` (Codable) exécute, à chaque lecture du
/// fil, un aller-retour `FeedPost` → JSON → `FeedPost`, qui traverse
/// `StoryEffects.encode`/`init(from:)`. Avant ce lot, un fond de scène
/// référencé par `payload.mediaId` (forme servie par la passerelle, jamais
/// écrite par le composer iOS) disparaissait à ce passage — `coversEveryVisual`
/// refusait alors la route scène pour un post qui, juste avant le passage par
/// le cache, l'obtenait très bien.
///
/// Ce témoin compare EXACTEMENT ce que ces autres témoins comparent déjà
/// (`SocialFullscreenRouteTests`) — mais AVANT et APRÈS le même aller-retour
/// que `GRDBCacheStore` fait subir à chaque lecture.
final class SocialFullscreenRouteCacheRoundTripTests: XCTestCase {

    private func chargeRecetteC() -> Data {
        Data("""
        {"v": 3, "scenes": [
          {"id": "s1", "objects": [
            {"id": "bg1", "kind": "media", "anchor": {"t": "free", "x": 0.5, "y": 0.5},
             "plane": "bg", "z": 0, "transform": {"scale": 1, "rotation": 0, "opacity": 1},
             "payload": {"mediaId": "6aaa972c3fd1f8a72d0e38e6"}},
            {"id": "t1", "kind": "text", "anchor": {"t": "free", "x": 0.5, "y": 0.5},
             "plane": "fg", "z": 1, "transform": {"scale": 1, "rotation": 0, "opacity": 1},
             "locale": "fr", "payload": {"text": "C1 pano"}}
          ]},
          {"id": "s2", "objects": [
            {"id": "bg2", "kind": "media", "anchor": {"t": "free", "x": 0.5, "y": 0.5},
             "plane": "bg", "z": 0, "transform": {"scale": 1, "rotation": 0, "opacity": 1},
             "payload": {"mediaId": "6aaa972d3fd1f8a72d0e38e7"}},
            {"id": "t2", "kind": "text", "anchor": {"t": "free", "x": 0.5, "y": 0.5},
             "plane": "fg", "z": 1, "transform": {"scale": 1, "rotation": 0, "opacity": 1},
             "locale": "fr", "payload": {"text": "C2 portrait"}}
          ]},
          {"id": "s3", "objects": [
            {"id": "bg3", "kind": "media", "anchor": {"t": "free", "x": 0.5, "y": 0.5},
             "plane": "bg", "z": 0, "transform": {"scale": 1, "rotation": 0, "opacity": 1},
             "payload": {"mediaId": "6aaa972d3fd1f8a72d0e38e8"}},
            {"id": "t3", "kind": "text", "anchor": {"t": "free", "x": 0.5, "y": 0.5},
             "plane": "fg", "z": 1, "transform": {"scale": 1, "rotation": 0, "opacity": 1},
             "locale": "fr", "payload": {"text": "C3 paysage"}}
          ]}
        ]}
        """.utf8)
    }

    /// `RECETTE C` : trois visuels déclarés au post, un canvas de trois scènes
    /// qui les porte chacune — le cas nominal de `coversEveryVisual`.
    ///
    /// **Décodé par `StoryEffects.init(from:)`, jamais construit à la main**
    /// (revue tour 2, 2026-09-17) : ce décodeur, sur un document `v >= 3`, pose
    /// TOUJOURS `self = StoryEffects(rendering: document, sceneIndex: 0)` avant
    /// `canvasV3 = document` — les deux ENSEMBLE, jamais l'un sans l'autre. Une
    /// construction manuelle qui pose `canvasV3` sur un `StoryEffects()` vierge
    /// produit un état qu'AUCUN décodage réel ne produit (le runtime ignore le
    /// document qu'il est censé représenter) — `CanvasV3(migrating:keeping:)`
    /// reconstruit alors la scène 0 depuis un runtime VIDE et la perd, un défaut
    /// du montage du témoin, pas du pont qu'il prétend éprouver.
    private func recetteC() throws -> FeedPost {
        let effects = try JSONDecoder().decode(StoryEffects.self, from: chargeRecetteC())
        var post = FeedPost(id: "recette-c", author: "demo", authorId: "demo-id",
                            content: "", timestamp: Date())
        post.storyEffects = effects
        post.media = [.image(), .image(), .image()]
        return post
    }

    /// Le passage par la couche `Codable` — EXACTEMENT ce que
    /// `GRDBCacheStore<String, FeedPost>` fait à chaque lecture du fil.
    private func aTraverseLeCache(_ post: FeedPost) throws -> FeedPost {
        try JSONDecoder().decode(FeedPost.self, from: JSONEncoder().encode(post))
    }

    func test_avantLeCache_laRouteEstLaSCENE() throws {
        XCTAssertNotNil(SocialFullscreenRoute.scene(of: try recetteC()),
                        "trois scènes, trois visuels déclarés : la scène couvre tout")
    }

    /// **Le témoin qui rougissait avant le correctif** : le même post, ayant
    /// simplement traversé le cache une fois, doit ouvrir la MÊME route.
    func test_apresUnPassageParLeCache_laRouteResteLaSCENE() throws {
        let apresCache = try aTraverseLeCache(try recetteC())
        XCTAssertNotNil(SocialFullscreenRoute.scene(of: apresCache),
                        "le cache ne doit jamais faire perdre à un post sa route scène")
        XCTAssertEqual(SocialFullscreenRoute.scene(of: apresCache)?.scenes.count, 3,
                       "les trois scènes doivent survivre au passage par le cache")
    }

    /// Deux lectures successives du fil (démarrage à froid puis rafraîchissement
    /// réseau, ou deux ouvertures du même écran) ne doivent pas dégrader
    /// davantage la route.
    func test_deuxPassagesSuccessifsParLeCache_laRouteResteLaSCENE() throws {
        let deuxiemePassage = try aTraverseLeCache(try aTraverseLeCache(try recetteC()))
        XCTAssertNotNil(SocialFullscreenRoute.scene(of: deuxiemePassage),
                        "un second passage par le cache ne doit rien perdre de plus")
    }
}
