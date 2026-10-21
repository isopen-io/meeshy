import XCTest
@testable import Meeshy

/// **Basculer avant ↔ arrière ne fige plus le flux** (#10308, directive porteur
/// 2026-10-12 : « la caméra selfie bogue et se fige »).
///
/// Deux causes, un témoin chacune :
/// 1. la couche d'aperçu relisait et réécrivait sa connexion à CHAQUE passe
///    SwiftUI — celles que la bascule déclenche elle-même (`isSwitchingCamera`,
///    la couverture) comprises —, depuis le fil principal, pendant que la file
///    de la session la reconfigurait : l'écran attendait la fin de la
///    reconfiguration, et chaque écriture sur une session en marche en
///    relançait une ;
/// 2. une session arrêtée par AVFoundation (erreur d'exécution, interruption)
///    ne repartait jamais : plus une trame, l'aperçu figé sur la dernière.
@MainActor
final class ComposerCameraSwitchFreezeTests: XCTestCase {

    // MARK: - 1. La connexion ne se touche qu'à son changement

    func test_needsWrite_firstPass_writesTheConnection() {
        var sync = CameraPreviewConnectionSync()
        XCTAssertTrue(sync.needsWrite(enabled: true, epoch: 0))
    }

    func test_needsWrite_passesTriggeredByTheSwitch_touchNothing() {
        var sync = CameraPreviewConnectionSync()
        _ = sync.needsWrite(enabled: false, epoch: 1)
        for _ in 0..<5 {
            XCTAssertFalse(sync.needsWrite(enabled: false, epoch: 1),
                           "une passe sans changement ne touche pas la connexion pendant la reconfiguration")
        }
    }

    func test_needsWrite_afterTheNewInputIsPosed_writesOnce() {
        var sync = CameraPreviewConnectionSync()
        _ = sync.needsWrite(enabled: false, epoch: 1)
        XCTAssertTrue(sync.needsWrite(enabled: false, epoch: 2), "la bascule a refait la connexion : on la règle")
        XCTAssertFalse(sync.needsWrite(enabled: false, epoch: 2))
    }

    func test_needsWrite_whenTheMetalSurfaceTakesOver_writesOnce() {
        var sync = CameraPreviewConnectionSync()
        _ = sync.needsWrite(enabled: true, epoch: 1)
        XCTAssertTrue(sync.needsWrite(enabled: false, epoch: 1))
        XCTAssertFalse(sync.needsWrite(enabled: false, epoch: 1))
    }

    func test_previewLayer_touchesItsConnectionOnlyBehindTheSync() throws {
        let code = AppSourceGuard.stripComments(try Self.code("Meeshy/Features/Main/Components/CameraPreviewLayer.swift"))
        XCTAssertEqual(code.components(separatedBy: "previewLayer.connection?.isEnabled").count - 1, 1,
                       "un seul site écrit la connexion")
        let garde = try XCTUnwrap(code.range(of: "guard sync.sync.needsWrite(enabled: mirrorsFrames, epoch: connectionEpoch)"))
        let ecriture = try XCTUnwrap(code.range(of: "previewLayer.connection?.isEnabled"))
        XCTAssertLessThan(garde.lowerBound, ecriture.lowerBound, "l'écriture suit la garde")
        let apercu = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(apercu.contains("connectionEpoch: session.camera.inputEpoch"))
        let modele = try Self.code("Meeshy/Features/Main/Components/CameraModel.swift")
        XCTAssertEqual(modele.components(separatedBy: "self.inputEpoch += 1").count - 1, 2,
                       "le montage et chaque bascule publient leur entrée, après la validation")
    }

    func test_previewMirroring_defaultsToShowingTheSystemLayer_andKeepsTheWish() {
        let voeu = ComposerPreviewMirroring()
        XCTAssertTrue(voeu.isWanted)
        voeu.isWanted = false
        XCTAssertFalse(voeu.isWanted)
    }

    func test_switch_alignsThePreviewConnection_insideItsTransaction() throws {
        let modele = AppSourceGuard.stripComments(try Self.code("Meeshy/Features/Main/Components/CameraInputInstaller.swift"))
        let debut = try XCTUnwrap(modele.range(of: "ComposerCameraInputSwap.swap(in: session"))
        let validee = try XCTUnwrap(modele.range(of: "let validee = CACurrentMediaTime()", range: debut.upperBound..<modele.endIndex))
        XCTAssertTrue(modele[debut.upperBound..<validee.lowerBound]
                        .contains("ComposerPreviewMirroring.align(session.connections, wanted: previewWanted)"),
                      "la connexion neuve de la couche prend son état AVANT la validation — jamais une écriture de plus après")
        let proprietaire = AppSourceGuard.stripComments(try Self.code("Meeshy/Features/Main/Components/CameraModel.swift"))
        XCTAssertEqual(proprietaire.components(separatedBy: "previewWanted: self.previewMirroring.isWanted").count - 1, 2)
        let apercu = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(apercu.contains("session.camera.previewMirroring.isWanted = montre"))
    }

    // MARK: - 2. Une session arrêtée par le système repart

    private final class Running: ComposerCaptureRunning, @unchecked Sendable {
        private let lock = NSLock()
        private var running = false
        private var count = 0

        var isRunning: Bool {
            get { lock.lock(); defer { lock.unlock() }; return running }
            set { lock.lock(); running = newValue; lock.unlock() }
        }
        var starts: Int {
            lock.lock(); defer { lock.unlock() }
            return count
        }
        func startRunning() {
            lock.lock(); running = true; count += 1; lock.unlock()
        }
        func stopRunning() {
            lock.lock(); running = false; lock.unlock()
        }
    }

    func test_resumeIfWanted_afterARuntimeErrorWhileArmed_restartsTheSession() {
        let file = ComposerCaptureSessionQueue()
        let session = Running()
        file.setRunning(true, session)
        file.drain()
        session.isRunning = false
        file.resumeIfWanted(session)
        file.drain()
        XCTAssertEqual(session.starts, 2)
        XCTAssertTrue(session.isRunning)
    }

    func test_resumeIfWanted_afterDisarm_staysStopped() {
        let file = ComposerCaptureSessionQueue()
        let session = Running()
        file.setRunning(true, session)
        file.setRunning(false, session)
        file.resumeIfWanted(session)
        file.drain()
        XCTAssertFalse(session.isRunning, "un viseur fermé ne se rallume pas")
    }

    func test_resumeIfWanted_whileRunning_doesNotRestart() {
        let file = ComposerCaptureSessionQueue()
        let session = Running()
        file.setRunning(true, session)
        file.resumeIfWanted(session)
        file.drain()
        XCTAssertEqual(session.starts, 1)
    }

    func test_cameraModel_watchesRuntimeErrorAndInterruptions_andResumes() throws {
        let code = AppSourceGuard.stripComments(try Self.code("Meeshy/Features/Main/Components/CameraModel+Recovery.swift"))
        for avis in ["runtimeErrorNotification", "wasInterruptedNotification", "interruptionEndedNotification"] {
            XCTAssertTrue(code.contains("AVCaptureSession.\(avis)"), "\(avis) est guetté")
        }
        XCTAssertTrue(code.contains("sessionQueue.resumeIfWanted(session)"))
        let modele = AppSourceGuard.stripComments(try Self.code("Meeshy/Features/Main/Components/CameraModel.swift"))
        XCTAssertTrue(modele.contains("observeSessionHealth()"), "le guet s'arme avec la session")
        XCTAssertTrue(modele.contains("sessionObservers.forEach { NotificationCenter.default.removeObserver($0) }"))
    }

    // MARK: - 3. La prise basculée attend sa nouvelle connexion

    func test_segmentResumeWait_isBrief_butLongerThanAFrame() {
        XCTAssertGreaterThan(ComposerCameraSwitchRule.segmentResumeWait, ComposerCameraSwitchRule.frameWait)
        XCTAssertLessThanOrEqual(ComposerCameraSwitchRule.segmentResumeWait, 1, "la prise ne reste pas suspendue")
    }

    func test_resumeAfterSwitch_waitsForTheConnection_beforeReopeningTheSegment() throws {
        let modele = AppSourceGuard.stripComments(try Self.code("Meeshy/Features/Main/Components/CameraModel.swift"))
        let debut = try XCTUnwrap(modele.range(of: "private func resumeRecordingAfterSwitch()"))
        let fin = try XCTUnwrap(modele.range(of: "private func reopenSegmentAfterSwitch()",
                                             range: debut.upperBound..<modele.endIndex))
        let reprise = String(modele[debut.upperBound..<fin.lowerBound])
        XCTAssertTrue(reprise.contains("ComposerCameraSwitchRule.segmentResumeWait"))
        XCTAssertTrue(reprise.contains("!self.videoRecordingIsPossible"), "elle attend que la connexion puisse écrire")
        XCTAssertTrue(reprise.contains("!self.pendingStopRequested"), "un arrêt demandé n'attend pas")
        XCTAssertFalse(reprise.contains("isSwitchingCameraDuringRecording = false"),
                       "l'arrêt demandé pendant l'attente reste en file")
    }

    private static func code(_ relative: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(relative)
        return try String(contentsOf: url, encoding: .utf8)
    }
}
