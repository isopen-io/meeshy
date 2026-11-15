import XCTest
import UIKit
@testable import MeeshyUI

/// **Les vignettes de scène vivent dans un cache BORNÉ** (#6922).
///
/// La rangée des scènes peignait chaque tuile de 44 pt avec le bitmap ENTIER de
/// sa scène. Le cache rend une vignette à la taille de la tuile, la garde tant
/// que la mémoire le permet, et ne retient JAMAIS l'image source : c'est la
/// composition qui la possède, pas la vignette.
@MainActor
final class SceneThumbnailCacheTests: XCTestCase {

    func test_cache_estBorne() {
        let cache = SceneThumbnailCache()
        XCTAssertGreaterThan(cache.countLimit, 0, "un nombre d'entrées plafonné")
        XCTAssertGreaterThan(cache.totalCostLimit, 0, "un poids en octets plafonné")
        XCTAssertLessThanOrEqual(cache.totalCostLimit, 32 * 1024 * 1024)
    }

    func test_thumbnail_reduitAuPlafond_etGardeLeRatio() {
        let cache = SceneThumbnailCache()
        let source = SceneImageDownsamplingTests.makeImage(width: 1600, height: 400)
        let vignette = cache.thumbnail(for: source, maxPixelSize: 528)
        XCTAssertEqual(SceneImageDownsamplingTests.pixelSize(vignette), CGSize(width: 528, height: 132))
    }

    func test_thumbnail_memeSourceMemeTaille_rendLaMemeInstance() {
        let cache = SceneThumbnailCache()
        let source = SceneImageDownsamplingTests.makeImage(width: 1600, height: 900)
        let premiere = cache.thumbnail(for: source, maxPixelSize: 300)
        XCTAssertTrue(cache.thumbnail(for: source, maxPixelSize: 300) === premiere,
                      "la seconde tuile ne redessine rien")
    }

    func test_thumbnail_autreSource_autreVignette() {
        let cache = SceneThumbnailCache()
        let a = SceneImageDownsamplingTests.makeImage(width: 1600, height: 900)
        let b = SceneImageDownsamplingTests.makeImage(width: 1600, height: 900)
        XCTAssertFalse(cache.thumbnail(for: a, maxPixelSize: 300) === cache.thumbnail(for: b, maxPixelSize: 300))
    }

    func test_thumbnail_neRetientPasLaSource() {
        let cache = SceneThumbnailCache()
        weak var faible: UIImage?
        autoreleasepool {
            let source = SceneImageDownsamplingTests.makeImage(width: 1600, height: 900)
            faible = source
            _ = cache.thumbnail(for: source, maxPixelSize: 300)
        }
        XCTAssertNil(faible, "la vignette ne prolonge jamais la vie du bitmap de la composition")
    }

    func test_removeAll_videLeCache() {
        let cache = SceneThumbnailCache()
        let source = SceneImageDownsamplingTests.makeImage(width: 1600, height: 900)
        let premiere = cache.thumbnail(for: source, maxPixelSize: 300)
        cache.removeAll()
        XCTAssertFalse(cache.thumbnail(for: source, maxPixelSize: 300) === premiere)
    }
}
