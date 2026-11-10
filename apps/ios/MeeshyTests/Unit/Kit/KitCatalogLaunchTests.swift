#if DEBUG
import XCTest
@testable import Meeshy
import MeeshyUI

final class KitCatalogLaunchTests: XCTestCase {

    func test_sansArgument_lecatalogueResteCache() {
        XCTAssertFalse(KitCatalogLaunch.isActive(in: ["Meeshy", "-MeeshyOnboardingPreview", "global"]))
    }

    func test_avecArgument_lecatalogueSOuvre() {
        XCTAssertTrue(KitCatalogLaunch.isActive(in: ["Meeshy", "-MeeshyKitCatalogue"]))
    }

    func test_laCleQuiSuit_ouvreLEntreeDemandee() {
        XCTAssertEqual(KitCatalogLaunch.requestedKey(in: ["Meeshy", "-MeeshyKitCatalogue", "K02"]), "K02")
    }

    func test_sansCle_laListeSOuvre() {
        XCTAssertNil(KitCatalogLaunch.requestedKey(in: ["Meeshy", "-MeeshyKitCatalogue"]))
    }

    func test_unAutreArgumentSuivant_neSeLitPasCommeUneCle() {
        XCTAssertNil(KitCatalogLaunch.requestedKey(in: ["Meeshy", "-MeeshyKitCatalogue", "-AppleLanguages", "(ar)"]))
    }

    func test_laCleLivreeDemandee_ouvreSonDetail() {
        let entries = [
            MeeshyKitCatalogEntry(key: "K01", name: "MeeshyGlassTone"),
            MeeshyKitCatalogEntry(key: "K02", name: "MeeshyGlassButton", states: [MeeshyKitCatalogState(id: "repos")]),
        ]
        XCTAssertEqual(KitCatalogLaunch.initialPath(in: ["Meeshy", "-MeeshyKitCatalogue", "k02"], entries: entries), ["K02"])
    }

    func test_uneCleNonLivreeOuAbsente_laisseLaListe() {
        let entries = [MeeshyKitCatalogEntry(key: "K01", name: "MeeshyGlassTone")]
        XCTAssertEqual(KitCatalogLaunch.initialPath(in: ["Meeshy", "-MeeshyKitCatalogue", "K01"], entries: entries), [])
        XCTAssertEqual(KitCatalogLaunch.initialPath(in: ["Meeshy", "-MeeshyKitCatalogue"], entries: entries), [])
    }

    func test_sansArgument_aucuneCle() {
        XCTAssertNil(KitCatalogLaunch.requestedKey(in: ["Meeshy", "K02"]))
    }
}
#endif
