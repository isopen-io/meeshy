import XCTest
import AVFoundation
import CoreVideo
@testable import Meeshy

/// **La bascule avant ↔ arrière ne montre jamais de noir** (#9464) : la
/// dernière trame reste, floutée, le temps que le nouvel objectif serve ; une
/// trame se redresse selon l'objectif qui l'a PRISE ; le bouton se tait
/// pendant la bascule.
@MainActor
final class ComposerCameraSwitchCoverTests: XCTestCase {

    private func makeBuffer() throws -> CVPixelBuffer {
        var buffer: CVPixelBuffer?
        let statut = CVPixelBufferCreate(kCFAllocatorDefault, 8, 4, kCVPixelFormatType_32BGRA, nil, &buffer)
        guard statut == kCVReturnSuccess, let buffer else { throw XCTSkip("CVPixelBufferCreate indisponible") }
        return buffer
    }

    func test_ingest_frameTakenByTheFrontCamera_isOrientedForTheFront_evenBeforeThePositionIsPublished() throws {
        let feed = ComposerCameraFeed()
        feed.isActive = true
        feed.setPosition(.back)
        feed.ingest(try makeBuffer(), position: .front)
        XCTAssertEqual(feed.latestFramePosition, .front,
                       "une trame de l'avant ne se redresse jamais comme une trame de l'arrière")
    }

    func test_heldFrame_isKeptWithoutALook_andOnlyOnce() throws {
        let feed = ComposerCameraFeed()
        feed.isActive = false
        feed.requestHold()
        feed.ingest(try makeBuffer(), position: .back)
        XCTAssertNotNil(feed.takeHeldFrame(), "la dernière trame de l'ancien objectif couvre la bascule")
        feed.ingest(try makeBuffer(), position: .back)
        XCTAssertNil(feed.takeHeldFrame(), "hors bascule, rien n'est retenu sans look")
        XCTAssertNil(feed.latestImage())
    }

    func test_switchRule_coverHoldsAboutAFifthOfASecond_andLocksTheButton() {
        XCTAssertEqual(ComposerCameraSwitchRule.coverHold, 0.2, accuracy: 0.05)
        XCTAssertFalse(ComposerCameraSwitchRule.mayFlip(isSwitching: true))
        XCTAssertTrue(ComposerCameraSwitchRule.mayFlip(isSwitching: false))
    }

    // MARK: - #9778 : la couverture ne retarde plus la bascule

    func test_coverFrame_takesTheFrameAlreadyHeld_withoutWaitingForTheNextOne() {
        let retenue = CIImage(color: .gray).cropped(to: CGRect(x: 0, y: 0, width: 8, height: 8))
        var attentes = 0
        let trame = ComposerCameraSwitchRule.coverFrame(latest: retenue) { attentes += 1; return nil }
        XCTAssertNotNil(trame)
        XCTAssertEqual(attentes, 0, "une trame déjà retenue couvre la bascule : aucune attente de la suivante")
        _ = ComposerCameraSwitchRule.coverFrame(latest: nil) { attentes += 1; return retenue }
        XCTAssertEqual(attentes, 1, "sans trame retenue, on attend la prochaine — au plus frameWait")
    }

    func test_zoomReassert_onlyWhenTheCommitResetTheZoom() {
        XCTAssertFalse(ComposerCameraSwitchRule.needsZoomReassert(current: 2, target: 2))
        XCTAssertFalse(ComposerCameraSwitchRule.needsZoomReassert(current: 2.0004, target: 2))
        XCTAssertTrue(ComposerCameraSwitchRule.needsZoomReassert(current: 1, target: 2),
                      "la validation a remis l'objectif virtuel sur l'ultra grand-angle")
    }

    func test_switchReport_keepsTheTotalAndNamesEachPhase() {
        let phases = ComposerCameraSwitchPhases(queue: 0, frame: 3, commit: 280, settle: 0, main: 16)
        XCTAssertEqual(ComposerCameraSwitchTiming.report(to: .back, total: 299, phases: phases),
                       "camera switch to back: 299 ms (queue 0 · frame 3 · commit 280 · settle 0 · main 16)")
        XCTAssertTrue(ComposerCameraSwitchTiming.report(to: .front, total: 300, phases: phases)
            .hasPrefix("camera switch to front: 300 ms"), "la ligne relevée à la recette garde sa forme")
    }

    func test_theCameraModel_paintsTheCoverBesideTheSwap_neverBeforeIt() throws {
        let modele = try Self.code("Meeshy/Features/Main/Components/CameraModel.swift")
        XCTAssertTrue(modele.contains("ComposerCameraSwitchRule.coverFrame(latest: self.liveFeed.latestImage())"))
        XCTAssertFalse(modele.contains(".flatMap(ComposerCameraSwitchRule.cover(from:))"),
                       "le flou ne se peint plus sur la file de la session, devant la bascule")
        XCTAssertTrue(modele.contains("self.switchGeneration == generation"),
                      "une couverture peinte après la fin de sa bascule ne se pose pas")
        XCTAssertTrue(modele.contains("ComposerCameraSwitchTiming.report("))
    }

    func test_cover_isBlurredAndKeepsTheFrameProportions() throws {
        let trame = CIImage(color: .gray).cropped(to: CGRect(x: 0, y: 0, width: 1080, height: 1920))
        let couverture = try XCTUnwrap(ComposerCameraSwitchRule.cover(from: trame))
        XCTAssertLessThanOrEqual(couverture.width, ComposerCameraSwitchRule.coverWidth)
        XCTAssertEqual(Double(couverture.height) / Double(couverture.width), 1920.0 / 1080.0, accuracy: 0.02)
    }

    func test_viewfinder_showsTheCover_andTheBarLocksTheFlip() throws {
        let vues = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(vues.contains("session.camera.switchCover"), "la couverture se pose sur la couche système ET sur Metal")
        let barre = try Self.code("Meeshy/Features/Main/Composer/ComposerSceneCameraBar.swift")
        XCTAssertTrue(barre.contains(".disabled(flipping)"))
        let chrome = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("flipping: session.barCapture.flipping"))
        let session = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureSession.swift")
        XCTAssertTrue(session.contains("flipping: camera.isSwitchingCamera"))
    }

    private static func code(_ relative: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent(relative), encoding: .utf8))
    }
}
