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

    func test_scene_lot2Scenes_openASession() {
        XCTAssertEqual(VitrineLaunch.scene(in: ["Meeshy", "-MeeshyVitrine", "amour"]), .amour)
        XCTAssertEqual(VitrineLaunch.scene(in: ["Meeshy", "-MeeshyVitrine", "groupe"]), .groupe)
        XCTAssertEqual(VitrineLaunch.scene(in: ["Meeshy", "-MeeshyVitrine", "imagine"]), .imagine)
        XCTAssertTrue([VitrineScene.amour, .groupe, .imagine].allSatisfy(\.ouvreUneSession))
    }

    func test_dossierMedias_livesInTheVitrineFolder() {
        XCTAssertEqual(VitrineLaunch.dossierMedias.lastPathComponent, "medias")
        XCTAssertEqual(VitrineLaunch.dossierMedias.deletingLastPathComponent().standardizedFileURL, VitrineLaunch.dossier.standardizedFileURL)
    }
}
