import XCTest
import AVFoundation
@testable import Meeshy

/// **La mise au point vise là où le doigt est tombé, et ne ment pas** (#9464) :
/// le point se convertit selon l'image RÉELLEMENT affichée (remplie, ou posée
/// dans la case d'un cadre par la vue Metal), en miroir à l'avant ; un objectif
/// qui ne règle rien ne montre ni anneau ni vibration.
@MainActor
final class ComposerCaptureFocusGeometryTests: XCTestCase {

    private let ecran = CGSize(width: 270, height: 480)

    // MARK: - Point de vue → point d'intérêt

    func test_devicePoint_fill_centerIsTheSensorCenter() {
        let image = ComposerCaptureFocusGeometry.filled(source: CGSize(width: 1080, height: 1920),
                                                        into: CGRect(origin: .zero, size: ecran))
        let point = ComposerCaptureFocusGeometry.devicePoint(viewPoint: CGPoint(x: 135, y: 240),
                                                             imageRect: image, mirrored: false)
        XCTAssertEqual(point?.x ?? -1, 0.5, accuracy: 0.001)
        XCTAssertEqual(point?.y ?? -1, 0.5, accuracy: 0.001)
    }

    func test_devicePoint_back_topLeftOfThePortraitImage_isTheSensorsBottomLeft() {
        let image = CGRect(origin: .zero, size: ecran)
        let point = ComposerCaptureFocusGeometry.devicePoint(viewPoint: .zero, imageRect: image, mirrored: false)
        XCTAssertEqual(point, CGPoint(x: 0, y: 1), "le capteur est couché : le haut de l'image est son bord gauche")
    }

    func test_devicePoint_front_isMirrored() {
        let image = CGRect(origin: .zero, size: ecran)
        let point = ComposerCaptureFocusGeometry.devicePoint(viewPoint: .zero, imageRect: image, mirrored: true)
        XCTAssertEqual(point, CGPoint(x: 0, y: 0), "l'aperçu de l'avant est en miroir : sa gauche est la droite du capteur")
    }

    func test_filled_widerSource_isCroppedOnTheSides() {
        let image = ComposerCaptureFocusGeometry.filled(source: CGSize(width: 1920, height: 1920),
                                                        into: CGRect(origin: .zero, size: ecran))
        XCTAssertEqual(image.height, 480, accuracy: 0.001)
        XCTAssertEqual(image.width, 480, accuracy: 0.001)
        XCTAssertEqual(image.midX, 135, accuracy: 0.001)
    }

    func test_fittedSlot_aFrameHole_isWhereTheImageLives() {
        let trou = CGRect(x: 108, y: 192, width: 864, height: 960)
        let ou = ComposerCaptureFocusGeometry.slotInView(trou, canvas: ComposerLookPainter.designCanvas, view: ecran)
        XCTAssertEqual(ou.minX, 27, accuracy: 0.001)
        XCTAssertEqual(ou.width, 216, accuracy: 0.001)
        let image = ComposerCaptureFocusGeometry.filled(source: CGSize(width: 1080, height: 1920), into: ou)
        XCTAssertNil(ComposerCaptureFocusGeometry.devicePoint(viewPoint: CGPoint(x: 5, y: 5), imageRect: image.intersection(ou),
                                                              mirrored: false),
                     "un toucher sur le cadre, hors de la case, ne vise rien")
        let centre = ComposerCaptureFocusGeometry.devicePoint(viewPoint: CGPoint(x: ou.midX, y: ou.midY),
                                                              imageRect: image, mirrored: false)
        XCTAssertEqual(centre?.x ?? -1, 0.5, accuracy: 0.001)
    }

    // MARK: - La mise au point honnête

    func test_aims_onlyWhenSomethingIsSet() {
        let avant = ComposerCaptureFocus.Capabilities(
            focusPointOfInterest: false, autoFocus: false, continuousAutoFocus: true,
            exposurePointOfInterest: true, autoExpose: true, continuousAutoExposure: true)
        XCTAssertTrue(ComposerCaptureFocus.aims(ComposerCaptureFocus.focusing(at: .zero, avant)),
                      "l'avant règle l'exposition : l'anneau paraît")
        XCTAssertFalse(ComposerCaptureFocus.aims(ComposerCaptureFocus.focusing(at: .zero, .none)))
    }

    func test_focusing_whileFilming_isSmooth() {
        let plan = ComposerCaptureFocus.focusing(at: .zero, .none, smooth: true)
        XCTAssertTrue(plan.smoothFocus)
        XCTAssertFalse(ComposerCaptureFocus.focusing(at: .zero, .none).smoothFocus)
    }

    private func makeSUT(stage: ComposerSceneCameraStage) -> (ComposerCaptureSession, MockComposerCaptureCamera) {
        let camera = MockComposerCaptureCamera()
        return (ComposerCaptureSession(stage: stage, mode: .photo, controls: camera), camera)
    }

    func test_focus_lensThatSetsNothing_reportsNoFocus() {
        let (session, camera) = makeSUT(stage: .armed)
        camera.focusResult = false
        XCTAssertFalse(session.focus(atPreviewPoint: CGPoint(x: 100, y: 100), previewSize: ecran),
                       "ni anneau ni vibration pour une mise au point qui n'a pas eu lieu")
        XCTAssertEqual(camera.focusRequests.count, 1)
    }

    func test_focus_whileRecording_asksASmoothFocus() {
        let (session, camera) = makeSUT(stage: .recording)
        XCTAssertTrue(session.focus(atPreviewPoint: CGPoint(x: 100, y: 100), previewSize: ecran))
        XCTAssertEqual(camera.focusRequests.last?.smooth, true)
    }

    func test_focus_frontCamera_aimsTheMirroredPoint() {
        let (session, camera) = makeSUT(stage: .armed)
        camera.currentPosition = .front
        session.focus(atPreviewPoint: .zero, previewSize: ecran)
        XCTAssertEqual(camera.focusRequests.last?.point, CGPoint(x: 0, y: 0))
    }

    func test_camera_resetsTheBiasAtEachInput_andFocusesSmoothlyWhenAsked() throws {
        let camera = try Self.code("Meeshy/Features/Main/Components/CameraModel.swift")
        XCTAssertTrue(camera.contains("setExposureTargetBias(0"))
        XCTAssertTrue(camera.contains("isSmoothAutoFocusEnabled"))
        XCTAssertTrue(camera.contains("subjectAreaDidChangeNotification"), "la scène qui change rend le continu")
    }

    private static func code(_ relative: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent(relative), encoding: .utf8))
    }
}
