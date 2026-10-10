import XCTest
import AVFoundation
@testable import Meeshy

/// **Ce qui suit l'objectif quand il bascule** (#9464) : le zoom revient au
/// ×1 du nouvel objectif, la lumière d'une prise en cours passe de la torche
/// à l'écran (et retour), et l'avant ne double jamais le flash de l'écran.
@MainActor
final class ComposerCaptureSwitchFollowTests: XCTestCase {

    private func makeSUT(stage: ComposerSceneCameraStage = .armed,
                         position: AVCaptureDevice.Position = .back)
        -> (session: ComposerCaptureSession, camera: MockComposerCaptureCamera) {
        let camera = MockComposerCaptureCamera()
        camera.currentPosition = position
        let session = ComposerCaptureSession(stage: stage, mode: .photo, controls: camera)
        return (session, camera)
    }

    func test_flipCamera_whileSwitching_isRefused() {
        let (session, camera) = makeSUT()
        session.flipCamera()
        session.flipCamera()
        XCTAssertEqual(camera.switchCameraCallCount, 1, "le bouton se tait tant que la bascule n'est pas finie")
    }

    func test_flipCamera_whenDone_bringsTheZoomBackToOne_andForgetsTheAnchors() {
        let (session, camera) = makeSUT(stage: .recording)
        session.dragZoom(translationY: 0)
        session.dragZoom(translationY: -ComposerCaptureZoom.pointsPerDoubling)
        XCTAssertEqual(camera.zoomFactor, 2, accuracy: 0.01)
        session.flipCamera()
        camera.finishSwitch()
        XCTAssertEqual(camera.zoomRequests.last, 1, "le nouvel objectif s'ouvre à ×1 affiché")
        session.dragZoom(translationY: -2 * ComposerCaptureZoom.pointsPerDoubling)
        XCTAssertEqual(camera.zoomFactor, 1, accuracy: 0.01,
                       "le glissé repart du ×1 du nouvel objectif, sans sauter au cadrage de l'ancienne ancre")
    }

    func test_flipCamera_backToRearWhileRecording_relightsTheTorch() {
        let (session, camera) = makeSUT(stage: .recording, position: .front)
        session.flash = .on
        session.flipCamera()
        camera.finishSwitch()
        XCTAssertEqual(camera.torchRequests.last, .on, "la torche éclaire de nouveau la prise à l'arrière")
    }

    func test_flipCamera_toFrontWhileRecording_turnsTheTorchOff() {
        let (session, camera) = makeSUT(stage: .recording, position: .back)
        session.flash = .on
        session.flipCamera()
        camera.finishSwitch()
        XCTAssertEqual(camera.torchRequests.last, .off)
        XCTAssertTrue(session.screenIsTheFlash, "à l'avant, c'est l'écran qui éclaire")
    }

    func test_flipCamera_notRecording_leavesTheTorchAlone() {
        let (session, camera) = makeSUT(stage: .armed, position: .front)
        session.flash = .on
        session.flipCamera()
        camera.finishSwitch()
        XCTAssertTrue(camera.torchRequests.isEmpty)
    }

    func test_takePhoto_frontWithLitFloor_neverAsksTheCameraFlash() async {
        let (session, camera) = makeSUT(stage: .armed, position: .front)
        session.flash = .on
        session.takePhoto()
        let attente = expectation(description: "le déclenchement attend la montée de l'écran")
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64((ComposerFrontFlash.brightnessRamp + 0.2) * 1_000_000_000))
            attente.fulfill()
        }
        await fulfillment(of: [attente], timeout: 3)
        XCTAssertEqual(camera.photoFlashes, [.off], "l'écran est le flash : pas de double éclair")
    }

    func test_switchLight_rule() {
        XCTAssertEqual(ComposerCameraSwitchFollow.after(switchingTo: .back, flash: .on, stage: .recording),
                       ComposerCameraSwitchFollow(torch: .on, screen: .restore))
        XCTAssertEqual(ComposerCameraSwitchFollow.after(switchingTo: .front, flash: .on, stage: .recording),
                       ComposerCameraSwitchFollow(torch: .off, screen: .light))
        XCTAssertEqual(ComposerCameraSwitchFollow.after(switchingTo: .front, flash: .off, stage: .recording),
                       ComposerCameraSwitchFollow(torch: .off, screen: .restore))
        XCTAssertEqual(ComposerCameraSwitchFollow.after(switchingTo: .front, flash: .on, stage: .armed),
                       ComposerCameraSwitchFollow(torch: nil, screen: .untouched),
                       "hors prise, le sol blanc suit déjà l'objectif publié")
    }
}
