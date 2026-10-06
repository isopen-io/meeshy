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
        let url = try XCTUnwrap(await ComposerCaptureFixture.movie())
        let asset = AVURLAsset(url: url)
        let duree = try await asset.load(.duration).seconds
        XCTAssertEqual(duree, 3, accuracy: 0.2)
        let piste = try XCTUnwrap(try await asset.loadTracks(withMediaType: .video).first)
        let taille = try await piste.load(.naturalSize)
        XCTAssertEqual(taille, CGSize(width: 1080, height: 1920))
    }

    func test_runsFixture_isFalseWithoutTheLaunchArgument() {
        XCTAssertFalse(CameraModel().runsFixture, "les témoins ne sont jamais lancés avec -MeeshyCaptureFixture")
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
