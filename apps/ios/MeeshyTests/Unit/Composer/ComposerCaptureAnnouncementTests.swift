import XCTest
import AVFoundation
@testable import Meeshy

/// **Le viseur dit à VoiceOver ce que l'image montre** (CAM-12) : objectif,
/// cran de zoom, photo prise, vidéo démarrée et arrêtée.
@MainActor
final class ComposerCaptureAnnouncementTests: XCTestCase {

    private let crans: [CGFloat] = [0.5, 1, 2]

    // MARK: - L'objectif

    func test_lens_avant_annonceObjectifAvant() {
        XCTAssertEqual(ComposerCaptureAnnouncement.lens(.front), .lens(front: true))
    }

    func test_lens_arriere_annonceObjectifArriere() {
        XCTAssertEqual(ComposerCaptureAnnouncement.lens(.back), .lens(front: false))
    }

    func test_lens_indetermine_seTait() {
        XCTAssertNil(ComposerCaptureAnnouncement.lens(.unspecified))
    }

    // MARK: - Le zoom

    func test_zoom_cranAtteint_annonceLeCran() {
        XCTAssertEqual(ComposerCaptureAnnouncement.zoom(from: 1, to: 2, presets: crans, switchingLens: false),
                       .zoom(2))
    }

    func test_zoom_pincementEntreDeuxCrans_seTait() {
        XCTAssertNil(ComposerCaptureAnnouncement.zoom(from: 1.2, to: 1.6, presets: crans, switchingLens: false))
    }

    func test_zoom_resteSurLeMemeCran_seTait() {
        XCTAssertNil(ComposerCaptureAnnouncement.zoom(from: 2, to: 2.004, presets: crans, switchingLens: false))
    }

    func test_zoom_pendantLaBascule_laisseParlerLObjectif() {
        XCTAssertNil(ComposerCaptureAnnouncement.zoom(from: 2, to: 1, presets: crans, switchingLens: true))
    }

    func test_zoom_presDuCran_annonceLeCranExact() {
        XCTAssertEqual(ComposerCaptureAnnouncement.zoom(from: 1.4, to: 0.505, presets: crans, switchingLens: false),
                       .zoom(0.5))
    }

    // MARK: - La vidéo

    func test_recording_armeVersEnregistrement_annonceLeDemarrage() {
        XCTAssertEqual(ComposerCaptureAnnouncement.recording(from: .armed, to: .recording), .recordingStarted)
    }

    func test_recording_enregistrementVersArme_annonceLArret() {
        XCTAssertEqual(ComposerCaptureAnnouncement.recording(from: .recording, to: .armed), .recordingStopped)
    }

    func test_recording_enregistrementVersEteint_annonceLArret() {
        XCTAssertEqual(ComposerCaptureAnnouncement.recording(from: .recording, to: .off), .recordingStopped)
    }

    func test_recording_armementDuViseur_seTait() {
        XCTAssertNil(ComposerCaptureAnnouncement.recording(from: .off, to: .armed))
    }

    // MARK: - Les textes

    func test_text_chaqueAnnonce_aUnTexteNonVide() {
        let annonces: [ComposerCaptureAnnouncement] = [
            .lens(front: true), .lens(front: false), .zoom(2), .photoTaken, .recordingStarted, .recordingStopped
        ]
        annonces.forEach { XCTAssertFalse($0.text.isEmpty, "\($0)") }
    }

    func test_text_objectifsAvantEtArriere_seDistinguent() {
        XCTAssertNotEqual(ComposerCaptureAnnouncement.lens(front: true).text,
                          ComposerCaptureAnnouncement.lens(front: false).text)
    }

    func test_text_zoom_nommeLeCran() {
        XCTAssertTrue(ComposerCaptureAnnouncement.zoom(2).text.hasSuffix(ComposerSceneCameraCopy.zoomPresetValue(2)))
    }
}
