import XCTest
import AVFoundation
@testable import Meeshy

#if DEBUG
/// **La caméra de recette** (#9351) : le simulateur n'a pas d'objectif ; la
/// recette photographie quand même la capture, la bande et l'édition.
@MainActor
final class ComposerCaptureFixtureTests: XCTestCase {

    func test_isActive_onlyWithTheLaunchArgument() {
        XCTAssertFalse(ComposerCaptureFixture.isActive(arguments: []))
        #if targetEnvironment(simulator)
        XCTAssertTrue(ComposerCaptureFixture.isActive(arguments: ["-MeeshyCaptureFixture"]))
        #else
        XCTAssertFalse(ComposerCaptureFixture.isActive(arguments: ["-MeeshyCaptureFixture"]),
                       "jamais sur un appareil réel")
        #endif
    }

    func test_sensorBuffer_isLyingDown_andTheFeedStandsItUp() throws {
        let tampon = try XCTUnwrap(ComposerCaptureFixture.sensorBuffer(phase: 0))
        XCTAssertEqual(CVPixelBufferGetWidth(tampon), 1440)
        XCTAssertEqual(CVPixelBufferGetHeight(tampon), 1080)
        let flux = ComposerCameraFeed()
        flux.isActive = true
        flux.inject(tampon)
        let debout = try XCTUnwrap(flux.latestImage())
        XCTAssertEqual(debout.extent.width, 1080)
        XCTAssertEqual(debout.extent.height, 1440)
    }

    func test_inject_onAnIdleFeed_keepsNothing() throws {
        let tampon = try XCTUnwrap(ComposerCaptureFixture.sensorBuffer(phase: 0.5))
        let flux = ComposerCameraFeed()
        flux.inject(tampon)
        XCTAssertNil(flux.latestImage(), "sans peintre, la trame de recette retourne au pool comme une vraie")
    }

    func test_photo_isTheUprightScene() throws {
        let photo = try XCTUnwrap(ComposerCaptureFixture.photo())
        XCTAssertEqual(photo.size.width * photo.scale, 1080)
        XCTAssertEqual(photo.size.height * photo.scale, 1440)
    }

    func test_movie_isThreeSecondsUprightNineSixteen() async throws {
        let movieURL = await ComposerCaptureFixture.movie()
        let url = try XCTUnwrap(movieURL)
        let asset = AVURLAsset(url: url)
        let duree = try await asset.load(.duration).seconds
        XCTAssertEqual(duree, 3, accuracy: 0.2)
        let pistes = try await asset.loadTracks(withMediaType: .video)
        let piste = try XCTUnwrap(pistes.first)
        let taille = try await piste.load(.naturalSize)
        XCTAssertEqual(taille, CGSize(width: 1080, height: 1920))
    }

    func test_runsFixture_isFalseWithoutTheLaunchArgument() {
        XCTAssertFalse(CameraModel().runsFixture, "les témoins ne sont jamais lancés avec -MeeshyCaptureFixture")
    }

    func test_switchCamera_duringAFixtureTake_settlesAndKeepsFilming() async {
        let camera = CameraModel(fixture: ComposerCaptureFixtureDriver())
        camera.startRecording()
        XCTAssertTrue(camera.isRecordingVideo)
        let suivie = expectation(description: "la bascule rend l'objectif en place")
        camera.switchCamera { _ in suivie.fulfill() }
        XCTAssertTrue(camera.isSwitchingCamera, "la couverture de la bascule se montre")
        await fulfillment(of: [suivie], timeout: 1)
        let prete = await camera.waitUntilCaptureReady(timeout: 2)
        XCTAssertTrue(prete, "la bascule retombe : la caméra de recette reste utilisable")
        XCTAssertFalse(camera.isSwitchingCamera)
        XCTAssertTrue(camera.isRecordingVideo, "la prise continue à travers la bascule")
        camera.stop()
    }

    func test_fixtureCode_neverShipsInRelease() throws {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let fichier = try String(contentsOf: racine.appendingPathComponent(
            "Meeshy/Features/Main/Components/CameraModel+Fixture.swift"), encoding: .utf8)
        XCTAssertTrue(fichier.hasPrefix("#if DEBUG"))
        XCTAssertTrue(fichier.trimmingCharacters(in: .whitespacesAndNewlines).hasSuffix("#endif"))
    }
}
#endif
