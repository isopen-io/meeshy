import XCTest
@testable import Meeshy

final class VitrineLaunchTests: XCTestCase {
    func test_scene_withKnownArgument_returnsTheScene() {
        XCTAssertEqual(VitrineLaunch.scene(in: ["Meeshy", "-MeeshyVitrine", "global"]), .global)
        XCTAssertEqual(VitrineLaunch.scene(in: ["Meeshy", "-MeeshyVitrine", "lien"]), .lien)
    }

    func test_scene_withMissingOrUnknownValue_returnsNil() {
        XCTAssertNil(VitrineLaunch.scene(in: ["Meeshy"]))
        XCTAssertNil(VitrineLaunch.scene(in: ["Meeshy", "-MeeshyVitrine"]))
        XCTAssertNil(VitrineLaunch.scene(in: ["Meeshy", "-MeeshyVitrine", "inconnue"]))
    }

    func test_ouvreUneSession_lienShowsAGuestWithoutAccount() {
        XCTAssertTrue(VitrineScene.global.ouvreUneSession)
        XCTAssertTrue(VitrineScene.progression.ouvreUneSession)
        XCTAssertFalse(VitrineScene.lien.ouvreUneSession)
    }
}
