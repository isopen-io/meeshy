import XCTest
import UIKit
import MeeshySDK
@testable import MeeshyUI
@testable import Meeshy

/// **La caméra hors du composer arme, prend, puis remet sa prise au composer**
/// (#17109, vues A8–A10 hors du composer).
@MainActor
final class ComposerCameraFirstEntryTests: XCTestCase {

    // MARK: - L'intention de la prise remise

    func test_theTakeIntent_opensSeededOnTheScene_asAStory_withThePostOffered() {
        let intention = ComposerIntent.cameraTake
        let profil = ComposerProfile.profile(for: intention.origin)
        XCTAssertEqual(profil.opensWith, .mediaSeeded, "la prise est déjà posée : la porte s'ouvre semée")
        XCTAssertEqual(intention.openingFormat(compositionQualifiesAsReel: false), .story,
                       "partie du tray des stories, la prise atterrit en story")
        XCTAssertTrue(profil.offeredFormats.contains(.post), "le format reste un champ : le post est offert")
        XCTAssertTrue(profil.allowsCapture, "la caméra reste une porte du rail")
    }

    func test_withoutATake_theTrayDoorStaysAsBefore() {
        XCTAssertEqual(StoryCameraFirstRule.intent(carriesTake: false), ComposerIntent(origin: .storyTray))
        XCTAssertEqual(StoryCameraFirstRule.intent(carriesTake: true), .cameraTake)
    }

    func test_theCamera_neverOpensOverTheComposer_norTwice() {
        XCTAssertTrue(StoryCameraFirstRule.opens(composerShown: false, cameraShown: false))
        XCTAssertFalse(StoryCameraFirstRule.opens(composerShown: true, cameraShown: false))
        XCTAssertFalse(StoryCameraFirstRule.opens(composerShown: false, cameraShown: true))
    }

    // MARK: - La prise devient le fond

    func test_aPhotoTake_becomesAnImageSeed_withItsOriginalBytesOnDisk() throws {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8)).image { contexte in
            UIColor.orange.setFill()
            contexte.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
        }
        let graine = try XCTUnwrap(ComposerMediaSeeding.seed(forTake: .photo(image, data: nil)))
        guard case .image = graine.payload else { return XCTFail("une photo se sème en image") }
        let origine = try XCTUnwrap(graine.origin, "la publication a un fichier à téléverser")
        XCTAssertTrue(FileManager.default.fileExists(atPath: origine.fileURL.path))
        XCTAssertTrue(origine.mimeType.hasPrefix("image/"))
        try? FileManager.default.removeItem(at: origine.fileURL)
    }

    func test_aMissingVideoTake_seedsNothing_ratherThanAnEmptyScene() {
        let absente = URL(fileURLWithPath: "/tmp/absente_\(UUID().uuidString).mov")
        XCTAssertNil(ComposerMediaSeeding.seed(forTake: .video(absente)))
    }

    // MARK: - Le câblage du cover unique

    func test_theStoryCover_presentsTheCameraFirst_andHandsTheTakeToTheSingleComposerMount() throws {
        let cover = try ComposerCaptureTakesTests.code("Meeshy/Features/Stories/Views/StoryTrayActions.swift")
        XCTAssertTrue(cover.contains("ComposerViewfinder(initialMode: .photo"), "la caméra autonome, le viseur partagé")
        XCTAssertTrue(cover.contains("ComposerMediaSeeding.seed(forTake: prise)"))
        XCTAssertTrue(cover.contains("mediaSeed: takeSeed"), "la prise est la graine du composer")
        XCTAssertTrue(cover.contains("StoryCameraFirstRule.intent(carriesTake: takeSeed != nil)"))
        XCTAssertTrue(cover.contains(".onReceive(NotificationCenter.default.publisher(for: .openStoryCamera))"))
        XCTAssertEqual(cover.components(separatedBy: "MeeshyComposerHost(").count - 1, 1,
                       "un seul montage du meuble : la prise passe par lui")
    }
}
