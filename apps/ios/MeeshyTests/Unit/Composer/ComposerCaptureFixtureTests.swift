import XCTest
import AVFoundation
import CoreImage
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
        let ciel = pixel(debout, x: 0, fromTop: 0)
        XCTAssertGreaterThan(ciel.red, ciel.blue, "en haut à gauche, le ciel chaud : l'image n'est pas retournée")
        let sol = pixel(debout, x: 0, fromTop: 1439)
        XCTAssertGreaterThan(sol.blue, sol.red, "en bas, le bleu")
        XCTAssertGreaterThan(pixel(debout, x: 800, fromTop: 459).green, 0.85, "le soleil à droite : rien n'est en miroir")
        XCTAssertLessThan(pixel(debout, x: 280, fromTop: 459).green, 0.8)
        XCTAssertLessThan(pixel(debout, x: 540, fromTop: 1019).red, 0.25, "la silhouette en bas, au centre")
    }

    func test_driver_paintsOnlyWhenSomeoneReadsTheFrames() async throws {
        let flux = ComposerCameraFeed()
        let pilote = ComposerCaptureFixtureDriver()
        pilote.start(feeding: flux)
        try await Task.sleep(nanoseconds: 300_000_000)
        XCTAssertEqual(pilote.paintedFrames, 0, "aucun lecteur, aucun rendu")
        flux.isActive = true
        let trame = expectation(description: "une trame de recette arrive")
        trame.assertForOverFulfill = false
        flux.setFrameHandler({ _ in trame.fulfill() }, for: ObjectIdentifier(self))
        await fulfillment(of: [trame], timeout: 2)
        flux.setFrameHandler(nil, for: ObjectIdentifier(self))
        pilote.stop()
        XCTAssertGreaterThan(pilote.paintedFrames, 0)
        XCTAssertNotNil(flux.latestImage())
    }

    func test_driver_keepsTickingWhileTheStripScrolls() throws {
        let code = try String(contentsOf: Self.racine.appendingPathComponent(
            "Meeshy/Features/Main/Components/CameraModel+Fixture.swift"), encoding: .utf8)
        XCTAssertTrue(code.contains("RunLoop.main.add(minuteur, forMode: .common)"),
                      "en mode .default, le minuteur se tait pendant le défilement")
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
        try? FileManager.default.removeItem(at: FileManager.default.temporaryDirectory
            .appendingPathComponent("capture-fixture.mov"))
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
        let fichier = try String(contentsOf: Self.racine.appendingPathComponent(
            "Meeshy/Features/Main/Components/CameraModel+Fixture.swift"), encoding: .utf8)
        XCTAssertTrue(fichier.hasPrefix("#if DEBUG"))
        XCTAssertTrue(fichier.trimmingCharacters(in: .whitespacesAndNewlines).hasSuffix("#endif"))
    }

    // MARK: - Outils

    private static let racine = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()

    private func pixel(_ image: CIImage, x: CGFloat, fromTop: CGFloat) -> (red: Double, green: Double, blue: Double) {
        var octets = [UInt8](repeating: 0, count: 4)
        let point = CGRect(x: image.extent.minX + x, y: image.extent.maxY - 1 - fromTop, width: 1, height: 1)
        CIContext().render(image, toBitmap: &octets, rowBytes: 4, bounds: point, format: .RGBA8,
                           colorSpace: CGColorSpace(name: CGColorSpace.sRGB))
        return (Double(octets[0]) / 255, Double(octets[1]) / 255, Double(octets[2]) / 255)
    }
}
#endif
