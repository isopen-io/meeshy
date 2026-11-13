import AVFoundation
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
        let file = AppSourceGuard.stripComments(try Self.code("Meeshy/Features/Main/Components/ComposerCaptureSessionQueue.swift"))
        XCTAssertEqual(file.components(separatedBy: "connexion.isEnabled = enabled").count - 1, 1,
                       "un seul site écrit la connexion : la file de la session")
        let garde = try XCTUnwrap(code.range(of: "sync.needsWrite(enabled: enabled, epoch: epoch) else { return }"))
        let envoi = try XCTUnwrap(code.range(of: "queue.enableConnection(of: layer, enabled)"))
        XCTAssertLessThan(garde.lowerBound, envoi.lowerBound, "l'écriture suit la garde, et part sur la file (#17041)")
        XCTAssertTrue(code.contains("holder.applyConnection(to: view.previewLayer, enabled: mirrorsFrames, epoch: connectionEpoch)"))
        let apercu = try Self.code("Meeshy/Features/Composer/ComposerCaptureViews.swift")
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
        XCTAssertEqual(proprietaire.components(separatedBy: "previewWanted: ").count - 1, 2)
        let apercu = try Self.code("Meeshy/Features/Composer/ComposerCaptureViews.swift")
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
        // Le retrait vit dans la `deinit`, par la boîte de démontage (#17282).
        XCTAssertTrue(modele.contains("observers.session.forEach { NotificationCenter.default.removeObserver($0) }"),
                      "un modèle libéré retire son guet de la session")
    }

    // MARK: - 3. La prise basculée attend sa nouvelle connexion

    func test_segmentResumeWait_isBrief_butLongerThanAFrame() {
        XCTAssertGreaterThan(ComposerCameraSwitchRule.segmentResumeWait, ComposerCameraSwitchRule.frameWait)
        XCTAssertLessThanOrEqual(ComposerCameraSwitchRule.segmentResumeWait, 1, "la prise ne reste pas suspendue")
    }

    func test_resumeAfterSwitch_waitsForTheConnection_beforeReopeningTheSegment() throws {
        let modele = AppSourceGuard.stripComments(try Self.code("Meeshy/Features/Main/Components/CameraModel+Video.swift"))
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

// MARK: - 4. La couche d'aperçu se rattache depuis la file de la session (#17041)

/// **Rattacher l'aperçu ne bloque plus le fil principal** (#17041, HangTracer de
/// l'iPhone du porteur). Affecter `AVCaptureVideoPreviewLayer.session`, ou écrire
/// `isEnabled` sur sa connexion, VALIDE une configuration de la session : le fil
/// qui le fait attend que la file de capture ait fini ce qu'elle fait — 9,03 s
/// (`applyConnection` → `_commitConfigurationAndSkipWait:`) et 1,12 s
/// (`makeUIView` → `setSession:` → `_addVideoPreviewLayer:`) mesurés. Ces deux
/// gestes passent désormais par la file de la session, dans l'ordre de ses
/// configurations ; le fil principal n'attend rien.
@MainActor
final class CameraPreviewSessionBindingTests: XCTestCase {

    /// Une file qui RETIENT ce qu'on lui confie : le témoin voit ce qui serait
    /// parti en ligne, sur le fil appelant, avant que la file ne tourne.
    private final class HeldQueue: CameraSessionPerforming, @unchecked Sendable {
        private let lock = NSLock()
        private var pending: [() -> Void] = []
        private var dispatched = 0

        var dispatchCount: Int {
            lock.lock()
            defer { lock.unlock() }
            return dispatched
        }

        func attach(_ layer: AVCaptureVideoPreviewLayer, to session: AVCaptureSession?) {
            hold { layer.session = session }
        }

        func enableConnection(of layer: AVCaptureVideoPreviewLayer, _ enabled: Bool) {
            hold { layer.connection?.isEnabled = enabled }
        }

        func flush() {
            lock.lock()
            let travaux = pending
            pending = []
            lock.unlock()
            travaux.forEach { $0() }
        }

        private func hold(_ work: @escaping () -> Void) {
            lock.lock()
            pending.append(work)
            dispatched += 1
            lock.unlock()
        }
    }

    /// La vraie file : ce qu'elle rattache, elle le rattache — après son tour.
    func test_sessionQueue_attachesAndDetaches_inItsOwnOrder() {
        let file = ComposerCaptureSessionQueue()
        let couche = AVCaptureVideoPreviewLayer()
        let session = AVCaptureSession()
        file.attach(couche, to: session)
        file.drain()
        XCTAssertTrue(couche.session === session)
        file.attach(couche, to: nil)
        file.drain()
        XCTAssertNil(couche.session)
    }

    func test_bind_leavesTheLayerAlone_untilTheSessionQueueRuns() {
        let couche = AVCaptureVideoPreviewLayer()
        let session = AVCaptureSession()
        let file = HeldQueue()
        let memoire = CameraPreviewConnectionHolder()

        memoire.bind(couche, to: session, on: file)

        XCTAssertNil(couche.session, "le fil appelant ne touche pas la session : c'est lui qui gelait 9 s")
        file.flush()
        XCTAssertTrue(couche.session === session, "la file de la session pose le rattachement")
    }

    func test_bind_sameSession_dispatchesOnce() {
        let couche = AVCaptureVideoPreviewLayer()
        let session = AVCaptureSession()
        let file = HeldQueue()
        let memoire = CameraPreviewConnectionHolder()

        for _ in 0..<4 { memoire.bind(couche, to: session, on: file) }

        XCTAssertEqual(file.dispatchCount, 1, "chaque passe SwiftUI ne relance pas une configuration")
    }

    func test_bind_newSession_rebindsAndForgetsTheAppliedConnection() {
        let couche = AVCaptureVideoPreviewLayer()
        let file = HeldQueue()
        let memoire = CameraPreviewConnectionHolder()
        memoire.bind(couche, to: AVCaptureSession(), on: file)
        memoire.applyConnection(to: couche, enabled: false, epoch: 1)
        let avant = file.dispatchCount

        let neuve = AVCaptureSession()
        memoire.bind(couche, to: neuve, on: file)
        memoire.applyConnection(to: couche, enabled: false, epoch: 1)

        XCTAssertEqual(file.dispatchCount, avant + 2, "la session neuve se rattache, et sa connexion se règle")
        file.flush()
        XCTAssertTrue(couche.session === neuve)
    }

    func test_applyConnection_goesThroughTheSessionQueue_onlyWhenItChanges() {
        let couche = AVCaptureVideoPreviewLayer()
        let file = HeldQueue()
        let memoire = CameraPreviewConnectionHolder()
        memoire.bind(couche, to: AVCaptureSession(), on: file)

        memoire.applyConnection(to: couche, enabled: true, epoch: 0)
        memoire.applyConnection(to: couche, enabled: true, epoch: 0)
        memoire.applyConnection(to: couche, enabled: false, epoch: 0)

        XCTAssertEqual(file.dispatchCount, 3, "le rattachement, puis deux changements de vœu — aucune passe vide")
    }

    func test_applyConnection_beforeAnyBinding_touchesNothing() {
        let memoire = CameraPreviewConnectionHolder()
        memoire.applyConnection(to: AVCaptureVideoPreviewLayer(), enabled: true, epoch: 0)
        XCTAssertNil(memoire.sync.appliedEnabled, "sans file, rien ne s'écrit — et rien n'est retenu comme écrit")
    }

    func test_unbind_detachesOnTheSessionQueue() {
        let couche = AVCaptureVideoPreviewLayer()
        let session = AVCaptureSession()
        let file = HeldQueue()
        let memoire = CameraPreviewConnectionHolder()
        memoire.bind(couche, to: session, on: file)
        file.flush()

        memoire.unbind(couche)

        XCTAssertTrue(couche.session === session, "fermer le viseur ne valide rien sur le fil principal")
        file.flush()
        XCTAssertNil(couche.session)
    }

    // MARK: Gardes de source — aucun site ne repasse par le fil principal

    func test_previewLayer_neverAssignsTheSessionOnTheMainThread() throws {
        let code = AppSourceGuard.stripComments(try Self.code("Meeshy/Features/Main/Components/CameraPreviewLayer.swift"))
        XCTAssertFalse(code.contains(".session = "), "la couche ne s'affecte pas sa session ici : la file le fait")
        XCTAssertFalse(code.contains("connection?.isEnabled = "), "ni sa connexion")
        XCTAssertTrue(code.contains("queue.attach(layer, to: session)"))
        XCTAssertTrue(code.contains("queue.enableConnection(of: layer, enabled)"))
        XCTAssertTrue(code.contains("static func dismantleUIView"), "fermer le viseur détache sur la file, lui aussi")
        let file = AppSourceGuard.stripComments(try Self.code("Meeshy/Features/Main/Components/ComposerCaptureSessionQueue.swift"))
        let envoi = try XCTUnwrap(file.range(of: "queue.async {\n            CATransaction.begin()"),
                                  "hors du fil principal, la couche change dans une transaction explicite, validée sur place")
        let ecriture = try XCTUnwrap(file.range(of: "couche.value.session = cible.value"))
        XCTAssertLessThan(envoi.lowerBound, ecriture.lowerBound, "l'affectation vit DANS le bloc confié à la file")
    }

    func test_everyPreviewHost_handsItsSessionQueue() throws {
        let composer = try Self.code("Meeshy/Features/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(composer.contains("sessionQueue: session.camera.sessionQueue"))
        let jeu = try Self.code("Meeshy/Features/Game/Photo/GamePhotoFlowView.swift")
        XCTAssertTrue(jeu.contains("sessionQueue: session.camera.sessionQueue"))
    }

    func test_noPreviewLayer_isBornAttachedToItsSession() throws {
        for chemin in ["Meeshy/Features/Settings/Views/EncryptedDevices/QRCodeCameraView.swift",
                       "Meeshy/Features/Main/Components/CameraPreviewLayer.swift"] {
            let code = AppSourceGuard.stripComments(try Self.code(chemin))
            XCTAssertFalse(code.contains("AVCaptureVideoPreviewLayer(session:"),
                           "\(chemin) : `init(session:)` valide une configuration sur le fil qui crée la couche")
        }
        let qr = AppSourceGuard.stripComments(try Self.code("Meeshy/Features/Settings/Views/EncryptedDevices/QRCodeCameraView.swift"))
        XCTAssertTrue(qr.contains("scanner.attach("), "le lecteur de QR rattache sa couche sur SA file")
    }

    func test_gamePhotoCamera_configuresAndRunsOnItsSessionQueue() throws {
        let code = AppSourceGuard.stripComments(try Self.code("Meeshy/Features/Game/Photo/GamePhotoCamera.swift"))
        let file = try XCTUnwrap(code.range(of: "await sessionQueue.run"), "la configuration attend la file, pas le fil principal")
        let debut = try XCTUnwrap(code.range(of: "session.beginConfiguration()"))
        XCTAssertLessThan(file.lowerBound, debut.lowerBound)
        XCTAssertFalse(code.contains("Task.detached"), "lancement et arrêt suivent la MÊME file que la configuration")
        XCTAssertTrue(code.contains("sessionQueue.setRunning(true, session)"))
        XCTAssertTrue(code.contains("sessionQueue.setRunning(false, session)"))
    }

    private static func code(_ relative: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        return try String(contentsOf: racine.appendingPathComponent(relative), encoding: .utf8)
    }
}
