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

    func test_aPhotoTake_becomesAnImageSeed_withItsOriginalBytesOnDisk() async throws {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8)).image { contexte in
            UIColor.orange.setFill()
            contexte.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
        }
        let semee = await ComposerMediaSeeding.seed(forTake: .photo(image, data: nil))
        let graine = try XCTUnwrap(semee)
        guard case .image = graine.payload else { return XCTFail("une photo se sème en image") }
        let origine = try XCTUnwrap(graine.origin, "la publication a un fichier à téléverser")
        XCTAssertTrue(FileManager.default.fileExists(atPath: origine.fileURL.path))
        XCTAssertTrue(origine.mimeType.hasPrefix("image/"))
        try? FileManager.default.removeItem(at: origine.fileURL)
    }

    func test_aMissingVideoTake_seedsNothing_ratherThanAnEmptyScene() async {
        let absente = URL(fileURLWithPath: "/tmp/absente_\(UUID().uuidString).mov")
        let graine = await ComposerMediaSeeding.seed(forTake: .video(absente))
        XCTAssertNil(graine)
    }

    func test_aFullResolutionPhotoTake_isReducedForTheCanvas_butItsFileKeepsEveryPixel() async throws {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: CGSize(width: 1600, height: 2000), format: format).image { contexte in
            UIColor.blue.setFill()
            contexte.fill(CGRect(x: 0, y: 0, width: 1600, height: 2000))
        }
        let semee = await ComposerMediaSeeding.seed(forTake: .photo(image, data: nil))
        let graine = try XCTUnwrap(semee)
        guard case .image(let bitmap) = graine.payload else { return XCTFail("une photo se sème en image") }
        XCTAssertLessThanOrEqual(max(bitmap.size.width * bitmap.scale, bitmap.size.height * bitmap.scale), 1080,
                                 "le canvas reçoit un bitmap réduit, comme toute graine image")
        let origine = try XCTUnwrap(graine.origin)
        let fichier = try XCTUnwrap(UIImage(contentsOfFile: origine.fileURL.path))
        XCTAssertEqual(fichier.size.width * fichier.scale, 1600, "la publication emporte le fichier entier")
        try? FileManager.default.removeItem(at: origine.fileURL)
    }

    func test_theViewfinderAndTheStandaloneCamera_writeThePhotoThroughOneSite() throws {
        let ingestion = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/MeeshyComposerHost+Ingestion.swift")
        XCTAssertTrue(ingestion.contains("ComposerMediaSeeding.writeCapturedPhoto(image, original: originaux)"))
        XCTAssertFalse(ingestion.contains("ComposerCapturePayload.bytes("), "aucune seconde écriture de la photo")
    }

    // MARK: - L'entrée

    func test_theMeAvatarMenu_offersTheComposerThenTheCamera_onBothTrails() throws {
        var composerOuvert = false
        let entrees = StoryCameraFirstRule.createItems { composerOuvert = true }
        XCTAssertEqual(entrees.map(\.icon), ["plus.circle.fill", "camera.fill"])
        XCTAssertEqual(entrees.map(\.label), [StoryTrayCopy.addStory, ComposerCameraCopy.openCamera])

        entrees[0].action()
        XCTAssertTrue(composerOuvert, "« Ajouter une story » ouvre le composer, comme avant")

        let attendue = expectation(forNotification: .openStoryCamera, object: nil)
        entrees[1].action()
        wait(for: [attendue], timeout: 1)

        let trail = try ComposerCaptureTakesTests.code("Meeshy/Features/Stories/Views/StoryTrayView.swift")
        XCTAssertEqual(trail.components(separatedBy: "StoryCameraFirstRule.createItems").count - 1, 2,
                       "la grande trail et la trail épinglée")
    }

    // MARK: - Le câblage du cover unique

    func test_theStoryCover_presentsTheCameraFirst_andHandsTheTakeToTheSingleComposerMount() throws {
        let cover = try ComposerCaptureTakesTests.code("Meeshy/Features/Stories/Views/StoryTrayActions.swift")
        XCTAssertTrue(cover.contains("ComposerViewfinder(initialMode: .photo"), "la caméra autonome, le viseur partagé")
        XCTAssertTrue(cover.contains("await ComposerMediaSeeding.seed(forTake: prise)"),
                      "la graine se fabrique après le retrait du viseur, hors du geste")
        XCTAssertTrue(cover.contains("mediaSeed: takeSeed"), "la prise est la graine du composer")
        XCTAssertTrue(cover.contains("StoryCameraFirstRule.intent(carriesTake: takeSeed != nil)"))
        XCTAssertTrue(cover.contains(".onReceive(NotificationCenter.default.publisher(for: .openStoryCamera))"))
        XCTAssertEqual(cover.components(separatedBy: "MeeshyComposerHost(").count - 1, 1,
                       "un seul montage du meuble : la prise passe par lui")
    }
}
