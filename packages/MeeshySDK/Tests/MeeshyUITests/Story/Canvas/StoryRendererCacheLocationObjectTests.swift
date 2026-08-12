import XCTest
import UIKit
import CoreMedia
@testable import MeeshyUI
@testable import MeeshySDK

/// Défaut relevé en revue T18 : le brief demande explicitement d'ajouter
/// `locationObjects` au `contentHash` du cache canvas (`editContentHash`),
/// faute de quoi une pastille de lieu éditée en mode `.edit` reste figée avec
/// son ancien `place` sur la layer mise en cache. `StoryLocationObject`
/// conforme maintenant à `RenderableItem` (timing nil, hors timeline) et
/// entre dans `collectItems` / `editContentHash` comme les autres items.
///
/// `place` (lat/long/name) n'est PAS capturé par le `ItemSignature` de base
/// (qui ne connaît que `x`/`y` normalisés, pas la géolocalisation) — c'est
/// exactement le champ que seul `contentHash` peut couvrir, donc le test qui
/// discrimine la présence du fix est un changement de `place` à `x`/`y`
/// inchangés.
@MainActor
final class StoryRendererCacheLocationObjectTests: XCTestCase {

    private let geometry = CanvasGeometry(renderSize: CGSize(width: 393, height: 699))

    private func slide(_ mutate: (inout StoryLocationObject) -> Void) -> StorySlide {
        var obj = StoryLocationObject(
            id: "loc-1",
            place: SharedPlace(latitude: 48.8566, longitude: 2.3522, name: "Tour Eiffel"))
        mutate(&obj)
        var s = StorySlide(id: "s1")
        s.locationObjects = [obj]
        return s
    }

    @discardableResult
    private func render(_ s: StorySlide, into cache: StoryRendererCache) -> CALayer? {
        cache.invalidateIfNeeded(slideId: s.id, languages: [], mode: .edit,
                                 renderSize: geometry.renderSize)
        let out = StoryRenderer.render(slide: s, into: geometry, at: .zero, mode: .edit,
                                       languages: [], resolver: nil, imageCache: nil,
                                       cache: cache, backdropProvider: nil,
                                       suppressDrawingOverlay: false)
        return out.sublayers?.first { $0.name == "loc-1" }
    }

    /// Le cas de la repro exacte du reviewer : le lieu change (nom/coordonnées),
    /// la position écran (x/y) ne bouge pas. Seul `contentHash` peut détecter ça.
    func test_aPlaceChangeMissesTheCache() {
        let cache = StoryRendererCache()
        let first = render(slide { $0.place = SharedPlace(latitude: 48.8566, longitude: 2.3522, name: "Tour Eiffel") },
                           into: cache)
        XCTAssertNotNil(first, "la pastille de lieu doit produire une layer — sinon ce test ne prouve rien")
        let hitsAfterFirst = cache.cacheHitCount

        let second = render(slide { $0.place = SharedPlace(latitude: 40.6892, longitude: -74.0445, name: "Statue de la Liberté") },
                            into: cache)
        XCTAssertNotNil(second)

        XCTAssertEqual(cache.cacheHitCount, hitsAfterFirst,
                       "changer le lieu affiché ne doit jamais servir la calque en cache")
    }

    /// Contrôle négatif : une slide identique DOIT toucher le cache, sinon on
    /// aurait « corrigé » le bug en désactivant le cache pour les pastilles.
    func test_anIdenticalLocationSlideStillHitsTheCache() {
        let cache = StoryRendererCache()
        let place = SharedPlace(latitude: 48.8566, longitude: 2.3522, name: "Tour Eiffel")
        render(slide { $0.place = place }, into: cache)
        let hitsAfterFirst = cache.cacheHitCount

        render(slide { $0.place = place }, into: cache)

        XCTAssertEqual(cache.cacheHitCount, hitsAfterFirst + 1,
                       "une pastille de lieu inchangée doit réutiliser sa calque")
    }

    /// Le contrôle négatif ci-dessus ne vaut que si l'APPELANT de production
    /// conserve la calque : `StoryCanvasUIView.rebuildLayers()` termine par
    /// `prune(keepIds:)`, et un ensemble construit sans les pastilles évince la
    /// calque à CHAQUE tick — mesure de texte + SF Symbol + `UIGraphicsImageRenderer`
    /// re-exécutés jusqu'à 120 Hz en `.edit`.
    func test_theLiveCanvasKeepsTheLocationLayerAcrossTicks() {
        var slide = StorySlide(id: "s1")
        slide.locationObjects = [
            StoryLocationObject(id: "loc-1",
                                place: SharedPlace(latitude: 48.8566, longitude: 2.3522,
                                                   name: "Tour Eiffel"))
        ]
        let canvas = StoryCanvasUIView(slide: slide, mode: .edit)
        canvas.frame = CGRect(x: 0, y: 0, width: 393, height: 699)

        canvas.rebuildLayers()
        let hitsAfterFirst = canvas.rendererCache.cacheHitCount
        canvas.rebuildLayers()

        XCTAssertEqual(canvas.rendererCache.cacheHitCount, hitsAfterFirst + 1,
                       "prune(keepIds:) évince la pastille : chaque tick redessine le badge à neuf")
    }

    /// Une mutation de position/rotation invalide déjà le cache via
    /// `ItemSignature.position`/`rotation` de base — vérifié ici pour
    /// confirmer que la pastille traverse bien `collectItems` (préalable au
    /// contentHash : sans ça, aucune layer nommée "loc-1" n'existe jamais).
    func test_aPositionChangeMissesTheCache() {
        let cache = StoryRendererCache()
        render(slide { $0.x = 0.2; $0.y = 0.3 }, into: cache)
        let missesAfterFirst = cache.cacheMissCount

        render(slide { $0.x = 0.6; $0.y = 0.9 }, into: cache)

        XCTAssertEqual(cache.cacheMissCount, missesAfterFirst + 1,
                       "un déplacement de la pastille de lieu doit invalider le cache canvas")
    }
}
