import XCTest
import UIKit
import CoreMedia
@testable import MeeshyUI
@testable import MeeshySDK

/// Le cache de calques en mode `.edit` doit invalider l'entrée d'un texte dès
/// qu'UN de ses champs de rendu change — pas seulement sa chaîne. Sinon le
/// canvas sert une calque périmée et l'utilisateur voit l'ancienne couleur
/// alors que la bulle affiche déjà la nouvelle.
///
/// La clé de cache est un hash du JSON trié de l'élément. `Data.hash(into:)`
/// de Foundation n'échantillonne qu'un PRÉFIXE BORNÉ (~80 octets) plus le
/// `count` : tout champ trié tardivement — `textColor` tombe vers l'octet 135,
/// et deux couleurs hex ont la même longueur — devenait donc invisible à la
/// clé. `fontSize` (octet ~50) passait, `textColor` non : c'est exactement la
/// répartition observée avant correction.
///
/// Ces tests couvrent les deux côtés de cette frontière, pour qu'un futur
/// champ ajouté loin dans l'ordre alphabétique ne repasse pas au travers.
@MainActor
final class StoryRendererCacheTextStyleTests: XCTestCase {

    private let geometry = CanvasGeometry(renderSize: CGSize(width: 393, height: 699))

    private func slide(_ mutate: (inout StoryTextObject) -> Void) -> StorySlide {
        var obj = StoryTextObject(id: "t1", text: "Bonjour")
        mutate(&obj)
        var effects = StoryEffects()
        effects.textObjects = [obj]
        var s = StorySlide(id: "s1")
        s.effects = effects
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
        return out.sublayers?.first { $0.name == "t1" }
    }

    /// Le cas de la repro : seule la couleur change.
    func test_aColourChangeMissesTheCache() {
        let cache = StoryRendererCache()
        render(slide { $0.textColor = "08D9D6" }, into: cache)
        let hitsAfterFirst = cache.cacheHitCount

        render(slide { $0.textColor = "F8B500" }, into: cache)

        XCTAssertEqual(cache.cacheHitCount, hitsAfterFirst,
                       "un changement de couleur ne doit JAMAIS servir la calque en cache")
    }

    /// Contrôle négatif : une slide identique DOIT toucher le cache, sinon on
    /// aurait « corrigé » le bug en désactivant le cache.
    func test_anIdenticalSlideStillHitsTheCache() {
        let cache = StoryRendererCache()
        render(slide { $0.textColor = "08D9D6" }, into: cache)
        let hitsAfterFirst = cache.cacheHitCount

        render(slide { $0.textColor = "08D9D6" }, into: cache)

        XCTAssertEqual(cache.cacheHitCount, hitsAfterFirst + 1,
                       "une slide inchangée doit réutiliser sa calque")
    }

    func test_aFontSizeChangeMissesTheCache() {
        let cache = StoryRendererCache()
        render(slide { $0.fontSize = 60 }, into: cache)
        let hitsAfterFirst = cache.cacheHitCount

        render(slide { $0.fontSize = 120 }, into: cache)

        XCTAssertEqual(cache.cacheHitCount, hitsAfterFirst)
    }

    func test_aFrameBorderChangeMissesTheCache() {
        let cache = StoryRendererCache()
        render(slide { $0.frameBorderWidth = nil }, into: cache)
        let hitsAfterFirst = cache.cacheHitCount

        render(slide { $0.frameBorderWidth = 4; $0.frameBorderColor = "FFFFFF" }, into: cache)

        XCTAssertEqual(cache.cacheHitCount, hitsAfterFirst)
    }

    /// `textStyle` et `zIndex` sont triés APRÈS `textColor` : s'ils passent,
    /// c'est que la clé couvre bien tout le contenu et plus seulement un
    /// préfixe.
    func test_aLateSortedFieldChangeAlsoMissesTheCache() {
        let cache = StoryRendererCache()
        render(slide { $0.textStyle = StoryTextStyle.bold.rawValue }, into: cache)
        let hitsAfterFirst = cache.cacheHitCount

        render(slide { $0.textStyle = StoryTextStyle.neon.rawValue }, into: cache)

        XCTAssertEqual(cache.cacheHitCount, hitsAfterFirst,
                       "un champ trié tard ne doit pas échapper à la clé de cache")
    }

    /// Le cœur du défaut, isolé du stack story : deux charges utiles de MÊME
    /// longueur qui ne diffèrent qu'au-delà du préfixe échantillonné.
    func test_theContentKeyCoversBytesBeyondTheSampledPrefix() {
        let filler = String(repeating: "a", count: 120)
        let a = Data((filler + "ROUGE").utf8)
        let b = Data((filler + "VERTE").utf8)

        XCTAssertEqual(a.count, b.count, "prérequis : même longueur")
        XCTAssertNotEqual(a, b, "prérequis : contenus distincts")
        XCTAssertNotEqual(StoryRenderer.contentKey(for: a),
                          StoryRenderer.contentKey(for: b),
                          "la clé doit dépendre de TOUS les octets")
    }
}
