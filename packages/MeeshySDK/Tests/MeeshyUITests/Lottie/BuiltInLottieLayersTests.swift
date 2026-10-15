import XCTest
import CryptoKit
import MeeshySDK
@testable import MeeshyUI

/// #10638 — les trois couches animées intégrées au catalogue (posées par le lot web) :
/// le catalogue iOS les référence, et leurs fichiers se lisent avec le moteur partagé.
@MainActor
final class BuiltInLottieLayersTests: XCTestCase {

    private var shippedFolder: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("shared/design/appearance/lottie")
    }

    private func refs() throws -> [PackAssetRef] {
        let wallpaper = try XCTUnwrap(AppearanceCatalog.shared.wallpaper(pack: "animes", design: "brume-vivante")?.lottie)
        let banner = try XCTUnwrap(AppearanceCatalog.shared.bannerPacks.first { $0.slug == "bannieres-animees" }?.designs.first { $0.key == "aurore-vive" }?.lottie)
        let ring = try XCTUnwrap(AvatarRingCatalog.shared.ring(pack: "contours-animes", item: "halo-or")?.lottie)
        return [wallpaper, banner, ring]
    }

    func test_theCatalogCarriesTheThreeAnimatedLayers() throws {
        XCTAssertEqual(try refs().count, 3)
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
