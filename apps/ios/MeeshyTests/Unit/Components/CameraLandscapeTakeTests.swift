import AVFoundation
import ImageIO
import MeeshySDK
import UIKit
import UniformTypeIdentifiers
import XCTest
@testable import Meeshy

/// **Une prise tenue en paysage reste en paysage, du déclenchement à l'enregistrement** (#16506).
@MainActor
final class CameraLandscapeTakeTests: XCTestCase {

    private static let paysage = CGSize(width: 4032, height: 3024)
    private static let portrait = CGSize(width: 3024, height: 4032)
    private static let viseur: CGFloat = 9.0 / 16.0

    private static let racine = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()

    private func source(_ chemin: String) throws -> String {
        AppSourceGuard.stripComments(try String(contentsOf: Self.racine.appendingPathComponent(chemin), encoding: .utf8))
    }

    private static func photo(_ taille: CGSize) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: taille, format: format).image { contexte in
            UIColor.red.setFill()
            contexte.fill(CGRect(origin: .zero, size: taille))
        }
    }

    // MARK: - L'horizon, position par position

    func test_angle_forEachHold_matchesTheDeviceTable() {
        let table: [(UIDeviceOrientation, CGFloat?, AVCaptureVideoOrientation?)] = [
            (.portrait, 90, .portrait),
            (.landscapeLeft, 0, .landscapeRight),
            (.landscapeRight, 180, .landscapeLeft),
            (.portraitUpsideDown, 270, .portraitUpsideDown),
            (.faceUp, nil, nil),
            (.faceDown, nil, nil),
            (.unknown, nil, nil),
        ]
        for (tenue, angle, orientation) in table {
            XCTAssertEqual(ComposerCaptureHorizonRule.angle(for: tenue), angle, "\(tenue.rawValue)")
            guard let angle else { continue }
            XCTAssertEqual(ComposerCaptureHorizonRule.videoOrientation(for: angle), orientation, "\(tenue.rawValue)")
        }
    }

    func test_heldAngle_afterALandscapeHold_survivesAFlatDevice() {
        let tenu = ComposerCaptureHorizonRule.heldAngle(.landscapeLeft, last: 90)
        XCTAssertEqual(tenu, 0)
        XCTAssertEqual(ComposerCaptureHorizonRule.heldAngle(.faceUp, last: tenu), 0,
                       "à plat, l'angle reste celui de la dernière TENUE, pas celui de la dernière prise")
        XCTAssertEqual(ComposerCaptureHorizonRule.heldAngle(.unknown, last: tenu), 0)
    }

    func test_horizon_beforeIOS17_followsEveryHold_notOnlyTheShots() throws {
        let code = try source("Meeshy/Features/Main/Components/ComposerCaptureMirrorRule.swift")
        XCTAssertTrue(code.contains("UIDevice.orientationDidChangeNotification"),
                      "lue à la seule prise, la tenue à plat rend l'angle de la prise d'avant")
        XCTAssertTrue(code.contains("endGeneratingDeviceOrientationNotifications"))
    }

    // MARK: - La vidéo

    func test_startSegment_levelsTheMovieConnection_beforeRecording() throws {
        let code = try source("Meeshy/Features/Main/Components/CameraModel.swift")
        let debut = try XCTUnwrap(code.range(of: "private func startSegment()"))
        let depart = try XCTUnwrap(code.range(of: "videoOutput.startRecording", range: debut.upperBound..<code.endIndex))
        XCTAssertTrue(code[debut.upperBound..<depart.lowerBound].contains("horizon.level(videoOutput.connection(with: .video))"),
                      "la connexion vidéo reste debout : une vidéo tenue en paysage s'écrit couchée")
    }

    func test_segments_heldInLandscape_keepALandscapeCanvas() {
        let plage = CMTimeRange(start: .zero, duration: CMTime(value: 1, timescale: 1))
        let segment = CameraSegmentPlacement(timeRange: plage, natural: CGSize(width: 1920, height: 1080), transform: .identity)
        XCTAssertEqual(CameraSegmentOrientation.upright(segment), CGSize(width: 1920, height: 1080))
    }

    // MARK: - Les proportions de la prise

    func test_aspect_ofALandscapeTake_turnsTheViewfinder() {
        XCTAssertEqual(ComposerTakeAspect.aspect(canvas: Self.viseur, take: Self.paysage), 16.0 / 9.0, accuracy: 0.0001)
    }

    func test_aspect_ofAPortraitTake_keepsTheViewfinder() {
        XCTAssertEqual(ComposerTakeAspect.aspect(canvas: Self.viseur, take: Self.portrait), Self.viseur)
    }

    func test_aspect_ofASquareTake_keepsTheViewfinder() {
        XCTAssertEqual(ComposerTakeAspect.aspect(canvas: Self.viseur, take: CGSize(width: 900, height: 900)), Self.viseur)
    }

    func test_aspect_appliedTwice_turnsOnlyOnce() {
        let une = ComposerTakeAspect.aspect(canvas: Self.viseur, take: Self.paysage)
        XCTAssertEqual(ComposerTakeAspect.aspect(canvas: une, take: Self.paysage), une)
    }

    func test_canvas_ofALandscapeTake_staysLandscape_atFullWidth() {
        let aspect = ComposerTakeAspect.aspect(canvas: Self.viseur, take: Self.paysage)
        let toile = ComposerLookPainter.canvas(for: Self.paysage, aspect: aspect)
        XCTAssertEqual(toile.width, Self.paysage.width, "aucun zoom : toute la largeur tenue reste")
        XCTAssertGreaterThan(toile.width, toile.height)
    }

    func test_beginEditing_aLandscapePhoto_opensALandscapeFrame() throws {
        let session = ComposerCaptureSession(stage: .armed)
        session.canvasAspect = Self.viseur
        session.beginEditing(photo: Self.photo(CGSize(width: 400, height: 300)))
        XCTAssertEqual(try XCTUnwrap(session.editAspect), 16.0 / 9.0, accuracy: 0.0001)
    }

    func test_beginEditing_aPortraitPhoto_keepsTheViewfinderFrame() throws {
        let session = ComposerCaptureSession(stage: .armed)
        session.canvasAspect = Self.viseur
        session.beginEditing(photo: Self.photo(CGSize(width: 300, height: 400)))
        XCTAssertEqual(try XCTUnwrap(session.editAspect), Self.viseur, accuracy: 0.0001)
    }

    func test_beginEditing_aLandscapeVideo_opensALandscapeFrame() async throws {
        let session = ComposerCaptureSession(stage: .armed, loopPlayerFactory: { _ in
            MockComposerLoopPlayer(duration: 6, hasAudio: false, uprightSize: CGSize(width: 1920, height: 1080))
        })
        session.canvasAspect = Self.viseur
        await session.beginEditing(video: FileManager.default.temporaryDirectory.appendingPathComponent("paysage.mov"))
        XCTAssertEqual(try XCTUnwrap(session.editAspect), 16.0 / 9.0, accuracy: 0.0001)
    }

    func test_gallerySave_turnsTheAspectToTheTake() throws {
        let code = try source("Meeshy/Features/Composer/ComposerCaptureSession+Takes.swift")
        XCTAssertTrue(code.contains("ComposerTakeAspect.aspect(canvas: canvasAspect, take: image.size)"),
                      "la galerie recadrait une photo paysage dans le portrait du viseur")
        XCTAssertTrue(code.contains("ComposerTakeAspect.aspect(canvas: proportions, video: url)"))
    }

    func test_renderedBytes_ofALandscapeTake_stayLandscape() async throws {
        let prise = try XCTUnwrap(Self.photo(CGSize(width: 400, height: 300)).jpegData(compressionQuality: 0.9))
        let aspect = ComposerTakeAspect.aspect(canvas: Self.viseur, take: CGSize(width: 400, height: 300))
        let octets = await ComposerCaptureSession.renderedPhotoBytes(
            prise, fallback: nil, look: ComposerPhotoLook(), aspect: aspect,
            person: CallFramePerson(id: "self", name: "Moi", handle: "moi", isSelf: true), date: Date(),
            scenes: MockComposerLookSceneProvider())
        let sortie = try XCTUnwrap(octets.flatMap { UIImage(data: $0) })
        XCTAssertEqual(sortie.size.width, 400, accuracy: 2, "toute la largeur tenue part, aux dimensions paires près")
        XCTAssertGreaterThan(sortie.size.width, sortie.size.height)
    }

    // MARK: - La scène 9:16

    func test_sceneFit_ofALandscapeTake_showsItWhole() {
        XCTAssertEqual(ComposerTakeAspect.sceneFit(take: Self.paysage), StoryBackgroundFraming.fit)
    }

    func test_sceneFit_ofAPortraitTake_leavesTheScene() {
        XCTAssertNil(ComposerTakeAspect.sceneFit(take: Self.portrait))
    }

    func test_poseSceneCapture_appliesTheFitOfTheTake() throws {
        let code = try source("Meeshy/Features/Composer/MeeshyComposerHost+Viewfinder.swift")
        XCTAssertTrue(code.contains("ComposerTakeAspect.sceneFit(of: result)"),
                      "posée remplie, une prise paysage perd ses côtés à l'entrée de la scène")
    }

    // MARK: - Ce que le viseur montrait

    func test_takePhoto_touchesNeitherLensNorZoom() throws {
        let code = try source("Meeshy/Features/Main/Components/CameraModel.swift")
        let debut = try XCTUnwrap(code.range(of: "func takePhoto("))
        let fin = try XCTUnwrap(code.range(of: "photoOutput.capturePhoto", range: debut.upperBound..<code.endIndex))
        let corps = code[debut.upperBound..<fin.lowerBound]
        XCTAssertFalse(corps.contains("videoZoomFactor"))
        XCTAssertFalse(corps.contains("installVideoInput"))
    }
}
