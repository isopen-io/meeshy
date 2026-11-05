import XCTest
@testable import MeeshySDK

/// #15158 — les collections « par Meeshy » de la boutique, embarquées par le catalogue iOS : un pack fixe et un
/// pack animé de contours, de fonds et de cadres de bannière, ni installés d'office ni payants, nommés en sept langues.
final class MeeshyCollectionsCatalogTests: XCTestCase {

    private static let languages = ["fr", "en", "es", "pt", "de", "it", "ar"]

    /// #16270, #16271 — les offres de Noël et du Nouvel An se posent APRÈS les collections Meeshy.
    private static let seasonal: Set<String> = [
        "noel-bannieres", "noel-contours-fixes", "noel-cadres-fixes",
        "nouvel-an-contours", "nouvel-an-contours-vifs", "nouvel-an-images", "nouvel-an-images-vives",
        "nouvel-an-cadres", "nouvel-an-cadres-vifs", "nouvel-an-fonds", "nouvel-an-fonds-vifs",
    ]

    func test_ringCatalog_endsWithTheTwoMeeshyCollections_fixedThenAnimated_withinAModestReach() throws {
        let packs = AvatarRingCatalog.shared.packs.filter { !Self.seasonal.contains($0.slug) }
        XCTAssertEqual(packs.suffix(2).map(\.slug), ["meeshy-signature", "meeshy-vivants"])
        let signature = try XCTUnwrap(packs.first { $0.slug == "meeshy-signature" })
        let vivants = try XCTUnwrap(packs.first { $0.slug == "meeshy-vivants" })
        XCTAssertFalse(signature.installedByDefault)
        XCTAssertFalse(vivants.installedByDefault)
        XCTAssertEqual(signature.rings.count, 6)
        XCTAssertEqual(vivants.rings.count, 6)
        for ring in signature.rings {
            XCTAssertNil(ring.decor, ring.key)
            XCTAssertNil(ring.lottie, ring.key)
            XCTAssertTrue(ring.motion.isEmpty, ring.key)
        }
        for ring in vivants.rings {
            let decor = try XCTUnwrap(ring.decor, ring.key)
            XCTAssertLessThanOrEqual(decor.reach, 1.25, ring.key)
            XCTAssertTrue(decor.back != nil || decor.front != nil, ring.key)
        }
        for language in Self.languages {
            XCTAssertNotNil(AvatarRingCatalog.shared.packName("meeshy-vivants", language: language), language)
            for ring in signature.rings + vivants.rings {
                XCTAssertNotNil(AvatarRingCatalog.shared.ringName(ring.key, language: language), "\(ring.key) \(language)")
            }
        }
    }

    func test_wallpaperCatalog_endsWithTheTwoMeeshyCollections_andEachAnimatedOneCarriesItsFilm() throws {
        let packs = AppearanceCatalog.shared.wallpaperPacks.filter { !Self.seasonal.contains($0.slug) }
        XCTAssertEqual(packs.suffix(2).map(\.slug), ["meeshy-fonds", "meeshy-fonds-vivants"])
        let fixed = try XCTUnwrap(packs.first { $0.slug == "meeshy-fonds" })
        let animated = try XCTUnwrap(packs.first { $0.slug == "meeshy-fonds-vivants" })
        XCTAssertEqual(fixed.designs.count, 6)
        XCTAssertEqual(animated.designs.count, 4)
        XCTAssertTrue(fixed.designs.allSatisfy { $0.lottie == nil })
        XCTAssertTrue(animated.designs.allSatisfy { $0.lottie != nil })
        XCTAssertFalse(AppearanceCatalog.shared.defaultWallpapers.contains { $0.pack.slug.hasPrefix("meeshy-") })
        for language in Self.languages {
            XCTAssertNotNil(AppearanceCatalog.shared.packName("meeshy-fonds-vivants", language: language), language)
            for design in fixed.designs + animated.designs {
                XCTAssertNotNil(AppearanceCatalog.shared.designName(design.key, language: language), "\(design.key) \(language)")
            }
        }
    }

    func test_frameCatalog_endsWithTheTwoMeeshyCollections_andOnlyTheAnimatedOneDeclaresMotion() throws {
        let packs = BannerFrameCatalog.shared.framePacks.filter { !Self.seasonal.contains($0.slug) }
        XCTAssertEqual(packs.suffix(2).map(\.slug), ["meeshy-bordures", "meeshy-bordures-vivantes"])
        let fixed = try XCTUnwrap(packs.first { $0.slug == "meeshy-bordures" })
        let animated = try XCTUnwrap(packs.first { $0.slug == "meeshy-bordures-vivantes" })
        XCTAssertEqual(fixed.frames.count, 6)
        XCTAssertEqual(animated.frames.count, 4)
        XCTAssertTrue(fixed.frames.allSatisfy { $0.motion.isEmpty })
        XCTAssertTrue(animated.frames.allSatisfy { $0.motion.count >= 2 })
        for language in Self.languages {
            XCTAssertNotNil(BannerFrameCatalog.shared.packName("meeshy-bordures", language: language), language)
            for frame in fixed.frames + animated.frames {
                XCTAssertNotNil(BannerFrameCatalog.shared.frameName(frame.key, language: language), "\(frame.key) \(language)")
            }
        }
    }
}
