#if DEBUG
import XCTest
@testable import Meeshy

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

    func test_sansArgument_aucuneCle() {
        XCTAssertNil(KitCatalogLaunch.requestedKey(in: ["Meeshy", "K02"]))
    }
}
#endif
