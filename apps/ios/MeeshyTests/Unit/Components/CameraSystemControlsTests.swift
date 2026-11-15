import XCTest
@testable import Meeshy

/// **Le bouton Camera Control règle le zoom et l'exposition du viseur** (OPUS-9).
@MainActor
final class CameraSystemControlsTests: XCTestCase {

    func test_controls_zoomExposureThenAmbiance_whenTheButtonExists() {
        XCTAssertEqual(CameraSystemControlsRule.controls(supportsControls: true), [.zoom, .exposure, .ambiance])
    }

    func test_controls_none_withoutTheButton() {
        XCTAssertEqual(CameraSystemControlsRule.controls(supportsControls: false), [])
    }

    func test_fitting_keepsTheFirstOnes_underTheSessionCeiling() {
        XCTAssertEqual(CameraSystemControlsRule.fitting([.zoom, .exposure], maxControls: 1), [.zoom])
        XCTAssertEqual(CameraSystemControlsRule.fitting([.zoom, .exposure], maxControls: 0), [])
        XCTAssertEqual(CameraSystemControlsRule.fitting([.zoom, .exposure], maxControls: -1), [])
        XCTAssertEqual(CameraSystemControlsRule.fitting([.zoom, .exposure], maxControls: 6), [.zoom, .exposure])
    }

    func test_camera_installsTheControls_atEachLens() throws {
        let camera = try Self.code("Meeshy/Features/Main/Components/CameraModel.swift")
        XCTAssertEqual(camera.components(separatedBy: "photoPlan: { self.adoptLens($0) }").count - 1, 2,
                       "la préparation ET la bascule d'objectif posent les curseurs")
        XCTAssertTrue(camera.contains("CameraSystemControlsHost.install(in: session, for: device, ambiance: ambianceLink)"))
    }

    func test_session_connectsTheAmbiancePicker_andFollowsTheBand() throws {
        let bande = try Self.code("Meeshy/Features/Composer/ComposerLookStrip.swift")
        XCTAssertTrue(bande.contains(".modifier(ComposerCameraAmbianceFollow(session: session))"),
                      "la bande relie le bouton au look et le fait suivre")
    }

    private static func code(_ relative: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent(relative), encoding: .utf8))
    }
}
