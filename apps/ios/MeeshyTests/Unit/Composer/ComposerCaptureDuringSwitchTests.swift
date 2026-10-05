import XCTest
import AVFoundation
@testable import Meeshy

/// **Aucune prise ne part PENDANT une bascule d'objectif** (#9464, revue I1) :
/// l'ancienne entrée est retirée sous elle. Le toucher et l'appui long
/// attendent la fin de la bascule ; l'obturateur pressé pendant elle ne fait
/// rien — ni prise, ni vibration, ni changement de mode.
@MainActor
final class ComposerCaptureDuringSwitchTests: XCTestCase {

    private func makeSUT() -> (ComposerCaptureSession, MockComposerCaptureCamera) {
        let camera = MockComposerCaptureCamera()
        return (ComposerCaptureSession(stage: .armed, mode: .video, controls: camera), camera)
    }

    private func pause(_ seconds: Double) async {
        let attente = expectation(description: "pause")
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            attente.fulfill()
        }
        await fulfillment(of: [attente], timeout: seconds + 2)
    }

    func test_takePhoto_whileSwitching_isRefusedWithoutSideEffects() {
        let (session, camera) = makeSUT()
        session.flipCamera()
        session.takePhoto()
        XCTAssertTrue(camera.photoFlashes.isEmpty)
        XCTAssertEqual(session.mode, .video, "une prise refusée ne change pas le mode annoncé")
    }

    func test_startFilming_whileSwitching_isRefused() {
        let (session, camera) = makeSUT()
        session.flipCamera()
        session.startFilming()
        XCTAssertEqual(session.stage, .armed, "le viseur ne prétend pas filmer sur une entrée qui s'en va")
        XCTAssertTrue(camera.torchRequests.isEmpty)
    }

    func test_photographWhenReady_whileSwitching_waitsThenShoots() async {
        let (session, camera) = makeSUT()
        session.flipCamera()
        session.photographWhenReady()
        await pause(0.15)
        XCTAssertTrue(camera.photoFlashes.isEmpty, "la photo attend la fin de la bascule")
        camera.finishSwitch()
        await pause(0.15)
        XCTAssertEqual(camera.photoFlashes.count, 1, "puis elle part, sur le nouvel objectif")
    }

    func test_cameraModel_isNotReadyWhileSwitching() throws {
        let camera = try Self.code("Meeshy/Features/Main/Components/CameraModel.swift")
        XCTAssertTrue(camera.contains("!isSwitchingCamera && CameraRecordingReadiness.mayCapturePhoto("))
    }

    // MARK: - I2 : le lissage tient pendant toute la prise

    func test_continuous_whileFilming_staysSmooth() {
        let complet = ComposerCaptureFocus.Capabilities(
            focusPointOfInterest: true, autoFocus: true, continuousAutoFocus: true,
            exposurePointOfInterest: true, autoExpose: true, continuousAutoExposure: true)
        XCTAssertTrue(ComposerCaptureFocus.continuous(complet, smooth: true).smoothFocus,
                      "la scène qui change pendant une prise ne remet pas la netteté à pomper")
        XCTAssertFalse(ComposerCaptureFocus.continuous(complet).smoothFocus)
    }

    func test_cameraModel_smoothsTheWholeTake() throws {
        let camera = try Self.code("Meeshy/Features/Main/Components/CameraModel.swift")
        XCTAssertTrue(camera.contains("ComposerCaptureFocus.continuous(Self.focusCapabilities(of: device), smooth: isRecordingVideo)"),
                      "le retour au continu garde le lissage d'une prise")
        XCTAssertTrue(camera.contains("setSmoothFocus(true)"), "la prise (et chaque segment) pose le lissage")
        XCTAssertTrue(camera.contains("setSmoothFocus(false)"), "la fin de la prise le retire")
    }

    // MARK: - I3 : l'entrée remise en place est réorientée

    func test_orientedPosition_followsTheInputThatIsInPlace() {
        XCTAssertEqual(ComposerCameraInputSwap.orientedPosition(after: .swapped, new: .front, old: .back), .front)
        XCTAssertEqual(ComposerCameraInputSwap.orientedPosition(after: .kept, new: .front, old: .back), .back,
                       "une entrée retirée puis remise recrée ses connexions : elle se réoriente")
        XCTAssertNil(ComposerCameraInputSwap.orientedPosition(after: .none, new: .front, old: nil))
    }

    private static func code(_ relative: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent(relative), encoding: .utf8))
    }
}
