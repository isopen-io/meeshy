import XCTest
import AVFoundation
@testable import Meeshy

/// **Une seule machine d'état de capture, servie aux deux montages du viseur**
/// (#9134).
///
/// Le viseur EN SCÈNE (`MeeshyComposerHost+Viewfinder`) et le viseur servi
/// SEUL en plein écran (`ComposerViewfinder`, #9125) câblaient chacun la tenue,
/// le cadenas, le zoom au glissé, le flash d'écran, les segments et le `✓` :
/// deux écritures des mêmes lois, qui divergent au premier réglage. Elles
/// vivent désormais dans `ComposerCaptureSession` ; le chrome (nappe de gestes
/// + barre) et l'aperçu dans `ComposerCaptureViews`. L'hôte ne garde que ce
/// qui lui est propre — l'armement par la scène, `railPosesNextMedia`,
/// l'ingestion, le remplacement du fond.
@MainActor
final class ComposerCaptureSessionTests: XCTestCase {

    private static var racineApp: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy")
    }

    private func sitesAppelant(_ motif: String) -> [String] {
        guard let marcheur = FileManager.default.enumerator(at: Self.racineApp, includingPropertiesForKeys: nil) else {
            return []
        }
        return marcheur.compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" }
            .compactMap { url -> String? in
                guard let brut = try? String(contentsOf: url, encoding: .utf8) else { return nil }
                let code = AppSourceGuard.stripComments(brut).components(separatedBy: .whitespacesAndNewlines).joined()
                return code.contains(motif) ? url.lastPathComponent : nil
            }
            .sorted()
    }

    // MARK: - Un seul site de câblage

    func test_lesLoisDeLaPrise_sontCableesUneSeuleFois() {
        let lois = [
            "ComposerCaptureHold.release(",
            "ComposerCaptureHold.phase(translation:",
            "ComposerShutterGesture.lockProgress(translationX:",
            "ComposerCaptureSegments.droppingLast(",
            "CameraModel.mergeSegments(",
            "ComposerCaptureZoom.factor(",
            "ComposerCaptureZoom.stepped(",
            "ComposerCaptureZoom.pinched(",
            "ComposerCaptureZoom.pinchSpoilsGestures(",
            "ComposerScreenFlash.shared.light(",
        ]
        let montages = ["MeeshyComposerHost+Viewfinder.swift", "ComposerViewfinder.swift"]
        for loi in lois {
            let sites = sitesAppelant(loi)
            XCTAssertTrue(sites.contains("ComposerCaptureSession.swift"), "`\(loi)` n'est plus câblée par la machine")
            XCTAssertTrue(Set(sites).isDisjoint(with: montages),
                          "`\(loi)` est recâblée par un montage du viseur : \(sites)")
            XCTAssertTrue(Set(sites).isSubset(of: ["ComposerCaptureSession.swift", "ComposerSceneCameraBar.swift"]),
                          "`\(loi)` a un second site de câblage : \(sites) — seule la barre lit le cadenas de SON obturateur")
        }
    }

    func test_laBarreEtLAperçu_sontMontesParLesVuesPartagees() {
        XCTAssertEqual(sitesAppelant("ComposerSceneCameraBar("), ["ComposerCaptureViews.swift"])
        // + la caméra avant du moment photo du jeu (#9382), qui n'est pas un viseur du composer.
        XCTAssertEqual(Set(sitesAppelant("CameraPreviewLayer(session:")), ["ComposerCaptureViews.swift", "GamePhotoFlowView.swift"])
    }

    func test_lesDeuxMontages_serventLaMemeMachine() throws {
        for fichier in ["MeeshyComposerHost+Viewfinder.swift", "ComposerViewfinder.swift"] {
            XCTAssertTrue(sitesAppelant("ComposerCaptureChrome(").contains(fichier),
                          "\(fichier) doit monter le chrome partagé")
            XCTAssertTrue(sitesAppelant("ComposerCapturePreview(").contains(fichier),
                          "\(fichier) doit monter l'aperçu partagé")
        }
    }

    // MARK: - Ce que la machine fait

    private func segmentSurDisque() throws -> ComposerCaptureSegment {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("segment-\(UUID().uuidString).mov")
        try Data([0x00]).write(to: url)
        return ComposerCaptureSegment(url: url, duration: 1.5)
    }

    func test_dropLastSegment_withTwoSegments_removesTheLastFile() throws {
        let session = ComposerCaptureSession()
        let premier = try segmentSurDisque()
        let second = try segmentSurDisque()
        session.segments = [premier, second]

        session.dropLastSegment()

        XCTAssertEqual(session.segments.map(\.url), [premier.url])
        XCTAssertFalse(FileManager.default.fileExists(atPath: second.url.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: premier.url.path))
    }

    func test_disarm_withPendingSegments_removesTheirFilesAndResetsTheTake() throws {
        let session = ComposerCaptureSession()
        let segment = try segmentSurDisque()
        session.stage = .armed
        session.mode = .video
        session.segments = [segment]
        session.holdPhase = .locked
        session.lockProgress = 1

        session.disarm()

        XCTAssertEqual(session.stage, .off)
        XCTAssertNil(session.mode)
        XCTAssertTrue(session.segments.isEmpty)
        XCTAssertNil(session.holdPhase)
        XCTAssertEqual(session.lockProgress, 0)
        XCTAssertFalse(FileManager.default.fileExists(atPath: segment.url.path))
    }

    func test_closeTake_whenNotRecording_changesNothing() {
        let session = ComposerCaptureSession()
        session.stage = .armed
        session.holdPhase = .locked

        session.closeTake()

        XCTAssertEqual(session.stage, .armed)
        XCTAssertEqual(session.holdPhase, .locked)
    }

    func test_lockTake_onlyWhileRecording_switchesToTheLockedMode() {
        let session = ComposerCaptureSession()
        session.stage = .armed
        session.mode = .photo
        session.lockTake()
        XCTAssertEqual(session.mode, .photo)

        session.stage = .recording
        session.lockTake()
        XCTAssertEqual(session.mode, ComposerShutterGesture.mode(locked: true))
    }

    func test_endHold_withoutAHoldInProgress_takesNothing() {
        let session = ComposerCaptureSession()
        session.stage = .recording

        session.endHold()

        XCTAssertEqual(session.stage, .recording, "une levée sans début ne clôt aucune prise")
    }

    // MARK: - L'image reste à l'écran au déclenchement (#9328)

    func test_micro_dejaAutorise_entreDansLaSessionALOuverture() {
        XCTAssertTrue(CameraAudioArming.armsAtSetup(microphone: .authorized, otherAudioPlaying: false),
                      "brancher le micro sur la session lancée la reconfigure et noircit l'aperçu au déclenchement")
    }

    func test_micro_jamaisDemande_attendQueLeSonServe() {
        XCTAssertFalse(CameraAudioArming.armsAtSetup(microphone: .notDetermined, otherAudioPlaying: false),
                       "aucun prompt micro à l'ouverture d'un viseur photo")
        XCTAssertFalse(CameraAudioArming.armsAtSetup(microphone: .denied, otherAudioPlaying: false))
        XCTAssertFalse(CameraAudioArming.armsAtSetup(microphone: .restricted, otherAudioPlaying: false))
    }

    func test_micro_uneMusiqueJoue_ouvrirLeViseurNeLaCoupePas() {
        XCTAssertFalse(CameraAudioArming.armsAtSetup(microphone: .authorized, otherAudioPlaying: true),
                       "le micro bascule la session audio : il attend la prise, comme l'appareil photo")
    }

    func test_laConfigurationInitiale_brancheLeMicroAvantDeLancerLaSession() throws {
        let camera = try String(contentsOf: Self.racineApp.appendingPathComponent(
            "Features/Main/Components/CameraModel.swift"), encoding: .utf8)
        let debut = try XCTUnwrap(camera.range(of: "private func setupSession()"))
        let fin = try XCTUnwrap(camera.range(of: "session.commitConfiguration()", range: debut.upperBound..<camera.endIndex))
        let configuration = String(camera[debut.upperBound..<fin.lowerBound])
        XCTAssertTrue(configuration.contains("CameraAudioArming.armsAtSetup("),
                      "le micro autorisé entre dans la MÊME configuration que l'objectif")
    }
}
