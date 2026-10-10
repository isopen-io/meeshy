import XCTest
import AVFoundation
@testable import Meeshy

/// **Ce qu'on voit avant la prise est ce qu'on a après** (#9464) : la photo et
/// la vidéo de l'objectif avant sortent EN MIROIR, comme l'aperçu, et debout.
@MainActor
final class ComposerCaptureMirrorRuleTests: XCTestCase {

    func test_mirrors_frontPhotoAndMovie_likeThePreview() {
        XCTAssertTrue(ComposerCaptureMirrorRule.mirrors(.photo, position: .front))
        XCTAssertTrue(ComposerCaptureMirrorRule.mirrors(.movie, position: .front))
    }

    func test_mirrors_backNever() {
        XCTAssertFalse(ComposerCaptureMirrorRule.mirrors(.photo, position: .back))
        XCTAssertFalse(ComposerCaptureMirrorRule.mirrors(.movie, position: .back))
    }

    func test_mirrors_framesStayRaw_theirOrientationMirrorsThemAtDisplay() {
        XCTAssertFalse(ComposerCaptureMirrorRule.mirrors(.frames, position: .front),
                       "la trame est redressée EN MIROIR par `ComposerLiveLookRule.orientation` — la miroiter deux fois l'endroiterait")
        XCTAssertEqual(ComposerLiveLookRule.orientation(for: .front), .leftMirrored)
    }

    func test_rotatesToPortrait_photoAndMovie() {
        XCTAssertTrue(ComposerCaptureMirrorRule.rotatesToPortrait(.photo))
        XCTAssertTrue(ComposerCaptureMirrorRule.rotatesToPortrait(.movie))
        XCTAssertEqual(ComposerCaptureMirrorRule.portraitAngle, 90)
    }

    func test_camera_orientsEveryConnection_atEachInput() throws {
        let camera = try Self.code("Meeshy/Features/Main/Components/CameraModel.swift")
        XCTAssertTrue(camera.contains("ComposerCaptureMirrorRule.mirrors("))
        XCTAssertTrue(camera.contains("automaticallyAdjustsVideoMirroring = false"))
        XCTAssertTrue(camera.contains("videoRotationAngle = ComposerCaptureMirrorRule.portraitAngle"))
    }

    private static func code(_ relative: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent(relative), encoding: .utf8))
    }
}
