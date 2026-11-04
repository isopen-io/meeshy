import XCTest
import CryptoKit
import MeeshySDK
@testable import MeeshyUI

/// #10638 — les couches animées intégrées au catalogue (posées par le lot web), et les six
/// de #13950 : le catalogue iOS les référence, et leurs fichiers se lisent avec le moteur partagé.
@MainActor
final class BuiltInLottieLayersTests: XCTestCase {

    private var shippedFolder: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("shared/design/appearance/lottie")
    }

    private func refs() throws -> [PackAssetRef] {
        let wallpapers = try ["brume-vivante", "bulles-legeres", "pluie-de-petales"].map { key in
            try XCTUnwrap(AppearanceCatalog.shared.wallpaper(pack: "animes", design: key)?.lottie, key)
        }
        let banners = try ["aurore-vive", "maree", "braises"].map { key in
            try XCTUnwrap(AppearanceCatalog.shared.bannerPacks.first { $0.slug == "bannieres-animees" }?.designs.first { $0.key == key }?.lottie, key)
        }
        let rings = try ["halo-or", "prisme-vivant", "onde"].map { key in
            try XCTUnwrap(AvatarRingCatalog.shared.ring(pack: "contours-animes", item: key)?.lottie, key)
        }
        return wallpapers + banners + rings
    }

    func test_theCatalogCarriesTheNineAnimatedLayers() throws {
        let refs = try refs()
        XCTAssertEqual(refs.count, 9)
        XCTAssertEqual(Set(refs.map(\.src)).count, 9)
    }

    func test_eachShippedFile_isTheOneItsReferenceEngages_andTheSharedEngineReadsIt() throws {
        try XCTSkipUnless(FileManager.default.fileExists(atPath: shippedFolder.path), "les fichiers servis ne sont pas lisibles depuis cet hôte de test")
        for ref in try refs() {
            let data = try Data(contentsOf: shippedFolder.appendingPathComponent(ref.src))
            XCTAssertEqual(data.count, ref.bytes, ref.src)
            XCTAssertEqual(SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined(), ref.sha256, ref.src)
            let film = try XCTUnwrap(LottieLayerSource.film(data: data), "\(ref.src) doit se lire")
            XCTAssertGreaterThan(film.duration, 0)
        }
    }

    /// #13960 — les deux films de chaque cadre illustré, vitrine et familles culturelles (derrière et au-dessus de l'avatar)
    /// sont servis, à l'octet de leur référence, et le moteur partagé les lit.
    func test_eachIllustratedFrame_shipsItsBackAndFrontFilms_andTheSharedEngineReadsThem() throws {
        try XCTSkipUnless(FileManager.default.fileExists(atPath: shippedFolder.path), "les fichiers servis ne sont pas lisibles depuis cet hôte de test")
        let packs = AvatarRingCatalog.shared.packs.filter { $0.slug.hasPrefix("cadres-") }
        XCTAssertEqual(packs.first?.slug, "cadres-illustres")
        let films = packs.flatMap { $0.rings.flatMap { [$0.decor?.back, $0.decor?.front].compactMap { $0 } } }
        XCTAssertEqual(films.count, 72)
        for ref in films {
            let data = try Data(contentsOf: shippedFolder.appendingPathComponent(ref.src))
            XCTAssertEqual(data.count, ref.bytes, ref.src)
            XCTAssertLessThan(data.count, 60 * 1024, ref.src)
            XCTAssertEqual(SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined(), ref.sha256, ref.src)
            let film = try XCTUnwrap(LottieLayerSource.film(data: data), "\(ref.src) doit se lire")
            XCTAssertGreaterThan(film.duration, 0)
        }
    }

    /// #15158 — les films des collections Meeshy (contours vivants, fonds vivants) sont servis à l'octet de leur
    /// référence, sous 60 Ko, et le moteur partagé les lit.
    func test_eachMeeshyCollectionFilm_isServedAtItsReference_andTheSharedEngineReadsIt() throws {
        try XCTSkipUnless(FileManager.default.fileExists(atPath: shippedFolder.path), "les fichiers servis ne sont pas lisibles depuis cet hôte de test")
        let rings = try XCTUnwrap(AvatarRingCatalog.shared.packs.first { $0.slug == "meeshy-vivants" }).rings
        let wallpapers = try XCTUnwrap(AppearanceCatalog.shared.wallpaperPacks.first { $0.slug == "meeshy-fonds-vivants" }).designs
        let films = rings.flatMap { [$0.decor?.back, $0.decor?.front].compactMap { $0 } } + wallpapers.compactMap(\.lottie)
        XCTAssertEqual(films.count, 13)
        for ref in films {
            let data = try Data(contentsOf: shippedFolder.appendingPathComponent(ref.src))
            XCTAssertEqual(data.count, ref.bytes, ref.src)
            XCTAssertLessThan(data.count, 60 * 1024, ref.src)
            XCTAssertEqual(SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined(), ref.sha256, ref.src)
            let film = try XCTUnwrap(LottieLayerSource.film(data: data), "\(ref.src) doit se lire")
            XCTAssertGreaterThan(film.duration, 0)
        }
    }

    /// #15553 — TOUT film que le catalogue référence (contours animés et illustrés, Noël, collections Meeshy, fonds et
    /// bannières animés) se lit avec le moteur partagé : un seul film illisible s'effacerait sans bruit sur iOS.
    func test_everyFilmTheCatalogReferences_isReadByTheSharedEngine() throws {
        try XCTSkipUnless(FileManager.default.fileExists(atPath: shippedFolder.path), "les fichiers servis ne sont pas lisibles depuis cet hôte de test")
        let rings = AvatarRingCatalog.shared.packs.flatMap { $0.rings.flatMap { [$0.lottie, $0.decor?.back, $0.decor?.front].compactMap { $0 } } }
        let designs = (AppearanceCatalog.shared.wallpaperPacks + AppearanceCatalog.shared.bannerPacks).flatMap { $0.designs.compactMap(\.lottie) }
        let films = Dictionary((rings + designs).map { ($0.sha256, $0) }, uniquingKeysWith: { first, _ in first }).values
        XCTAssertGreaterThanOrEqual(films.count, 106)
        for ref in films {
            let data = try Data(contentsOf: shippedFolder.appendingPathComponent(ref.src))
            XCTAssertEqual(data.count, ref.bytes, ref.src)
            XCTAssertNotNil(LottieLayerSource.film(data: data), "\(ref.src) doit se lire")
        }
    }
}
