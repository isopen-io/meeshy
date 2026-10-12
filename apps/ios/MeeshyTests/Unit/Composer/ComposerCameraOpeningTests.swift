import XCTest
@testable import Meeshy

/// **La caméra du composer s'arme vite et montre d'emblée les cadres, « Aucun »
/// choisi** (#10307, directive porteur 2026-10-12).
@MainActor
final class ComposerCameraOpeningTests: XCTestCase {

    // MARK: - Les cadres d'emblée, « Aucun » choisi

    func test_arm_opensTheFramesBand() {
        let session = ComposerCaptureSession()
        session.arm(mode: .photo)
        XCTAssertEqual(session.openFamily, .frames, "la bande des cadres est là dès l'ouverture")
        session.disarm()
    }

    func test_arm_afterAPreviousLook_choosesNoFrame() throws {
        let session = ComposerCaptureSession()
        let cadre = try XCTUnwrap(ComposerLookStripRule.items(.frames).lazy.compactMap { item -> ComposerPhotoFrame? in
            guard case .frame(let cadre) = item, cadre != ComposerPhotoFrame.none else { return nil }
            return cadre
        }.first)
        session.look = ComposerPhotoLook(filter: .warm, frame: cadre)
        session.arm(mode: .photo)
        XCTAssertEqual(session.look.frame, ComposerPhotoFrame.none, "« Aucun cadre » est choisi par défaut")
        XCTAssertEqual(ComposerLookStripRule.chosenIndex(in: ComposerLookStripRule.items(.frames), look: session.look), 0,
                       "la case choisie est « Aucun », en tête de bande")
        session.disarm()
    }

    func test_openingLook_isUntouched() {
        XCTAssertTrue(ComposerCaptureSession.openingLook.isUntouched)
        XCTAssertEqual(ComposerCaptureSession.openingFamily, .frames)
    }

    // MARK: - La session préparée avant d'être montrée

    func test_host_prewarmsTheCamera_whenTheFormatFilms() throws {
        let hote = try Self.code("Meeshy/Features/Main/Composer/MeeshyComposerHost.swift")
        XCTAssertTrue(hote.contains("if filme { sceneCapture.prewarm() }"))
        let capture = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureSession.swift")
        XCTAssertTrue(capture.contains("camera.prewarm()"))
    }

    func test_prewarm_neverPrompts_andTheSessionIsConfiguredOnce() throws {
        let modele = AppSourceGuard.stripComments(try Self.code("Meeshy/Features/Main/Components/CameraModel.swift"))
        let debut = try XCTUnwrap(modele.range(of: "func prewarm()"))
        let fin = try XCTUnwrap(modele.range(of: "private func setupSession()", range: debut.upperBound..<modele.endIndex))
        let prechauffe = String(modele[debut.upperBound..<fin.lowerBound])
        XCTAssertTrue(prechauffe.contains("AVCaptureDevice.authorizationStatus(for: .video) == .authorized"),
                      "préparer ne demande jamais l'accès")
        XCTAssertFalse(prechauffe.contains("setRunning"), "préparer ne lance pas : aucun voyant caméra")
        let preparation = try XCTUnwrap(modele.range(of: "private func prepareSession()"))
        let garde = try XCTUnwrap(modele.range(of: "guard !sessionIsPrepared else { return }",
                                               range: preparation.upperBound..<modele.endIndex))
        let configuration = try XCTUnwrap(modele.range(of: "self.session.beginConfiguration()",
                                                       range: preparation.upperBound..<modele.endIndex))
        XCTAssertLessThan(garde.lowerBound, configuration.lowerBound, "un ré-armement ne reconfigure rien")
        XCTAssertTrue(modele.contains("if self.session.sessionPreset != .high"), "le préréglage n'est posé qu'une fois")
    }

    // MARK: - Le premier flux, mesuré

    func test_firstFrameClock_reportsTheDelayOnce() {
        let horloge = ComposerCameraFirstFrameClock()
        horloge.start(prewarmed: true, at: 10)
        XCTAssertEqual(horloge.report(at: 10.25), 250)
        XCTAssertNil(horloge.report(at: 10.3), "les trames suivantes ne se mesurent pas")
    }

    func test_firstFrameClock_withoutArming_reportsNothing() {
        XCTAssertNil(ComposerCameraFirstFrameClock().report(at: 1))
    }

    private static func code(_ relative: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(relative)
        return try String(contentsOf: url, encoding: .utf8)
    }
}
