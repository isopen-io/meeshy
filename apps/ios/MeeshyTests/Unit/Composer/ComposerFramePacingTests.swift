import XCTest
import CoreImage
@testable import Meeshy

/// **Un passage par image, rien quand rien ne change** (#9349, spec § 5).
@MainActor
final class ComposerFramePacingTests: XCTestCase {

    func test_shouldDraw_firstFrame_isDrawn() {
        XCTAssertTrue(ComposerFramePacer(fps: 30).shouldDraw(now: 10, last: nil))
    }

    func test_shouldDraw_fasterThanTheBudget_isDropped() {
        let cadence = ComposerFramePacer(fps: 15)
        XCTAssertFalse(cadence.shouldDraw(now: 10.033, last: 10), "30 i/s offerts, 15 permis : une sur deux")
        XCTAssertTrue(cadence.shouldDraw(now: 10.066, last: 10))
    }

    func test_shouldDraw_zeroFPS_neverDraws() {
        XCTAssertFalse(ComposerFramePacer(fps: 0).shouldDraw(now: 10, last: nil))
    }

    func test_paintsWithMetal_onlyWithALook_andNeverInCriticalState() {
        let nominal = ComposerThermalBudget.budget(for: .nominal)
        let critique = ComposerThermalBudget.budget(for: .critical)
        XCTAssertFalse(ComposerCaptureSurfaceRule.paintsWithMetal(look: ComposerPhotoLook(), budget: nominal, fixture: false),
                       "sans effet : la couche système seule, aucun rendu")
        XCTAssertTrue(ComposerCaptureSurfaceRule.paintsWithMetal(look: ComposerPhotoLook(filter: .warm), budget: nominal, fixture: false))
        XCTAssertFalse(ComposerCaptureSurfaceRule.paintsWithMetal(look: ComposerPhotoLook(filter: .warm), budget: critique, fixture: false))
        XCTAssertTrue(ComposerCaptureSurfaceRule.showsThermalNotice(look: ComposerPhotoLook(filter: .warm), budget: critique))
        XCTAssertFalse(ComposerCaptureSurfaceRule.showsThermalNotice(look: ComposerPhotoLook(), budget: critique))
    }

    func test_feed_announcesEachFrameToItsHandler() {
        let flux = ComposerCameraFeed()
        let annonce = expectation(description: "trame annoncée")
        flux.setFrameHandler({ annonce.fulfill() }, for: ObjectIdentifier(self))
        flux.isActive = true
        flux.announceForTesting()
        wait(for: [annonce], timeout: 1)
    }

    func test_feed_servesThePreviewAndTheStrip_removingOneKeepsTheOther() {
        let flux = ComposerCameraFeed()
        let apercu = NSObject(), bande = NSObject()
        let pourLApercu = expectation(description: "l'aperçu est prévenu")
        let pourLaBande = expectation(description: "la bande est prévenue")
        pourLaBande.expectedFulfillmentCount = 2
        flux.setFrameHandler({ pourLApercu.fulfill() }, for: ObjectIdentifier(apercu))
        flux.setFrameHandler({ pourLaBande.fulfill() }, for: ObjectIdentifier(bande))
        flux.isActive = true
        flux.announceForTesting()
        flux.setFrameHandler(nil, for: ObjectIdentifier(apercu))
        flux.announceForTesting()
        wait(for: [pourLApercu, pourLaBande], timeout: 1)
    }

    func test_preview_neverStacksTheSystemLayerUnderMetal() throws {
        let apercu = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(apercu.contains("mirrorsFrames: !session.paintsWithMetal"),
                      "avec effet, la couche système est détachée : un passage par image, jamais deux")
        let surface = try Self.code("Meeshy/Features/Main/Composer/ComposerLiveLookSurface.swift")
        XCTAssertTrue(surface.contains("view.enableSetNeedsDisplay = true"), "la vue ne dessine qu'à l'arrivée d'une trame")
        XCTAssertTrue(surface.contains("view.isPaused = true"))
        XCTAssertFalse(surface.contains("CIContext("), "un seul CIContext, partagé")
    }

    private static func code(_ relative: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent(relative), encoding: .utf8))
    }
}
