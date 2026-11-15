import XCTest
import MeeshySDK
@testable import Meeshy

/// **La case « Aucun » de la bande de cadres prend HORS CADRE** (décision
/// porteur 2026-10-12, #10284) : retouche, prise gardée dans l'app par défaut ;
/// Réglages › Médias « enregistrer l'original » prime toujours. Un vrai cadre,
/// lui, part en galerie puis en retouche.
@MainActor
final class ComposerNoFrameCellTests: XCTestCase {

    private static func realFrame() throws -> ComposerPhotoFrame {
        try XCTUnwrap(ComposerLookStripRule.items(.frames).lazy.compactMap { item -> ComposerPhotoFrame? in
            guard case .frame(let cadre) = item, cadre != ComposerPhotoFrame.none else { return nil }
            return cadre
        }.first)
    }

    // MARK: - La table des gestes

    func test_chosenCell_onNoFrame_shootsOutsideTheFrame() {
        let aucun = ComposerCaptureGestureContext(frameChosen: false)
        XCTAssertEqual(ComposerCaptureGesture.action(zone: .chosenThumbnail, gesture: .tap, context: aucun), .photoToEdit)
        XCTAssertEqual(ComposerCaptureGesture.action(zone: .chosenThumbnail, gesture: .longPress, context: aucun), .filmSegment)
    }

    func test_chosenCell_onARealFrame_shootsToTheGallery() {
        let cadre = ComposerCaptureGestureContext(frameChosen: true)
        XCTAssertEqual(ComposerCaptureGesture.action(zone: .chosenThumbnail, gesture: .tap, context: cadre), .photoToGallery)
        XCTAssertEqual(ComposerCaptureGesture.action(zone: .chosenThumbnail, gesture: .longPress, context: cadre), .filmToGallery)
    }

    func test_session_noFrameEvenWithAFilter_isOutsideTheFrame() {
        let session = ComposerCaptureSession(stage: .armed)
        session.look = ComposerPhotoLook(filter: .warm, frame: .none, effect: .angel)
        XCTAssertEqual(session.frameIntent, .edit, "la case « Aucun » prend hors cadre, filtre ou effet posé")
        XCTAssertFalse(session.gestureContext.frameChosen)
    }

    func test_session_realFrame_isTheFrameZone() throws {
        let session = ComposerCaptureSession(stage: .armed)
        session.look = ComposerPhotoLook(frame: try Self.realFrame())
        XCTAssertEqual(session.frameIntent, .gallery)
        XCTAssertTrue(session.gestureContext.frameChosen)
    }

    // MARK: - La loi : où part la prise

    func test_noFrame_byDefault_staysInTheAppOnly() {
        let destination = CaptureSaveLaw.destination(for: .outside)
        XCTAssertFalse(destination.gallery)
        XCTAssertTrue(destination.keptInApp)
    }

    func test_noFrame_withSaveOriginalSetting_goesToPhotos() {
        XCTAssertTrue(CaptureSaveLaw.destination(for: .outside, savesOriginal: true).gallery,
                      "le réglage « enregistrer l'original » prime toujours")
    }

    func test_realFrame_goesToTheGallery() {
        XCTAssertTrue(CaptureSaveLaw.destination(for: .frame).gallery)
    }
}
