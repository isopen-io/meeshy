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
}
