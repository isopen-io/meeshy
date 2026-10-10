import XCTest
@testable import Meeshy

/// #8696 — la symétrie de l'image caméra en appel : UNE fonction décide, pour
/// chaque caméra et chaque rôle (aperçu chez soi, flux envoyé, capture).
@MainActor
final class CallCameraMirrorTests: XCTestCase {

    // MARK: - La règle

    func test_isMirrored_frontLocalPreview_returnsTrue() {
        XCTAssertTrue(CallCameraMirror.isMirrored(facing: .front, role: .localPreview))
    }

    func test_isMirrored_frontSentStream_returnsFalse() {
        XCTAssertFalse(CallCameraMirror.isMirrored(facing: .front, role: .sent), "Le texte doit rester lisible chez l'autre")
    }

    func test_isMirrored_frontCapture_returnsFalse() {
        XCTAssertFalse(CallCameraMirror.isMirrored(facing: .front, role: .capture), "Une capture montre ce que l'autre voit")
    }

    func test_isMirrored_backCamera_neverMirrors() {
        [CallVideoRole.localPreview, .sent, .capture].forEach { role in
            XCTAssertFalse(CallCameraMirror.isMirrored(facing: .back, role: role))
        }
    }

    func test_isMirrored_externalOrUnknownCamera_neverMirrors() {
        XCTAssertFalse(CallCameraMirror.isMirrored(facing: .external, role: .localPreview))
        XCTAssertFalse(CallCameraMirror.isMirrored(facing: .unspecified, role: .localPreview))
    }

    // MARK: - La caméra que montrent les trames

    func test_displayedFacing_liveCameraKnown_winsOverIntent() {
        XCTAssertEqual(CallCameraMirror.displayedFacing(live: .front, intendedFront: false), .front,
                       "Pendant la bascule, les trames viennent encore de l'ancienne caméra : pas d'image inversée transitoire")
    }

    func test_displayedFacing_noLiveCamera_followsIntent() {
        XCTAssertEqual(CallCameraMirror.displayedFacing(live: nil, intendedFront: true), .front)
        XCTAssertEqual(CallCameraMirror.displayedFacing(live: nil, intendedFront: false), .back)
    }

    func test_localPreviewMirror_switchFrontToBack_flipsOnlyOnceTheBackCameraRuns() {
        let beforeConfirmation = CallCameraMirror.isMirrored(
            facing: CallCameraMirror.displayedFacing(live: .front, intendedFront: false), role: .localPreview)
        let afterConfirmation = CallCameraMirror.isMirrored(
            facing: CallCameraMirror.displayedFacing(live: .back, intendedFront: false), role: .localPreview)
        XCTAssertTrue(beforeConfirmation)
        XCTAssertFalse(afterConfirmation)
    }

    // MARK: - La caméra confirmée par la capture

    func test_confirm_startedCapture_publishesFacing() {
        let live = CallLiveCamera()
        live.confirm(.back)
        XCTAssertEqual(live.facing, .back)
    }

    func test_reset_endedCall_forgetsFacing() {
        let live = CallLiveCamera()
        live.confirm(.front)
        live.reset()
        XCTAssertNil(live.facing)
    }

    // MARK: - Tous les sites consomment la règle

    private func appSource(_ relative: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main").appendingPathComponent(relative)
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    func test_callViews_neverMirrorFromTheIntentFlagDirectly() throws {
        let sites = [
            "Views/CallView.swift",
            "Views/CallView+Connected.swift",
            "Views/CallView+Panels.swift",
            "Views/GroupCallStageView.swift",
        ]
        try sites.forEach { site in
            let code = try appSource(site)
            XCTAssertFalse(code.contains("mirror: callManager.isUsingFrontCamera"), "\(site) : passer par CallCameraMirror")
            XCTAssertFalse(code.contains("&& callManager.isUsingFrontCamera"), "\(site) : passer par CallCameraMirror")
            XCTAssertFalse(code.contains("isMirrored: callManager.isUsingFrontCamera"), "\(site) : passer par CallCameraMirror")
        }
    }

    func test_captureSubjects_useTheCaptureRole() throws {
        let code = try appSource("Views/CallView+Panels.swift")
        XCTAssertTrue(code.contains("role: .capture"), "Les captures d'appel demandent la règle avec le rôle capture")
    }

    func test_liveCamera_isConfirmedWhereTheCaptureStarts() throws {
        let code = try appSource("Services/WebRTC/P2PWebRTCClient+Camera.swift")
        XCTAssertTrue(code.contains("CallLiveCamera.shared.confirm("))
        XCTAssertTrue(code.contains("CallLiveCamera.shared.reset()"))
    }
}
