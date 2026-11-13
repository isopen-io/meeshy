import AVFoundation
import UIKit
import os
import MeeshySDK
import MeeshyUI

/// La prise photo du viseur : le déclencheur, sa disponibilité et les délégués d'AVFoundation.
extension CameraModel {

    /// **L'obturateur part sur la file de la session** (#17433). Lire les connexions et les
    /// réglages de la sortie depuis le fil principal l'attachait à la file : une
    /// reconfiguration en cours (bascule, micro qui entre) le figeait le temps de la valider.
    /// Seul l'angle de l'horizon se lit ici ; la garde est REPOSÉE sur la file, devant l'appel,
    /// car l'état a pu changer entre le toucher et son passage.
    func takePhoto(flash: AVCaptureDevice.FlashMode) {
        #if DEBUG
        if let fixture {
            guard !isSwitchingCamera else { return }
            noteShutterFired()
            deliverFixturePhoto(fixture)
            return
        }
        #endif
        guard !isSwitchingCamera, !isTakingPhoto else { return }
        isTakingPhoto = true
        let angle = horizon.captureAngle
        sessionQueue.perform { [weak self] in
            guard let self else { return }
            let sortie = self.photoOutput
            // Même exception ObjC que l'enregistrement sans connexion active, donc
            // même prévention devant l'appel — un `do/catch` ne la rattraperait pas.
            let connection = sortie.connection(with: .video)
            guard CameraRecordingReadiness.mayCapturePhoto(
                sessionIsRunning: self.session.isRunning,
                hasVideoConnection: connection != nil,
                connectionIsActive: connection?.isActive ?? false,
                connectionIsEnabled: connection?.isEnabled ?? false
            ), let connection else {
                Task { @MainActor in self.photoWasRefused() }
                return
            }
            let settings = CameraPhotoTuning.settings(
                flash: flash, supportedFlashModes: sortie.supportedFlashModes,
                outputMaxPhotoDimensions: CameraPhotoDimensions(sortie.maxPhotoDimensions),
                formatMaxPhotoDimensions: sortie.sourceMaxPhotoDimensions)
            ComposerCaptureHorizon.apply(angle, to: connection)
            self.photoOutput.capturePhoto(with: settings, delegate: self)
        }
    }

    /// **Ce que la session peut faire maintenant**, lu sur ses faits réels (#17433).
    var captureAvailability: CameraCaptureAvailability {
        #if DEBUG
        if fixture != nil { return isSwitchingCamera ? .switching : .ready }
        #endif
        let connection = photoOutput.connection(with: .video)
        return CameraCaptureAvailability.resolve(CameraCaptureAvailability.Facts(
            wantsToRun: sessionQueue.wantsToRun,
            isRunning: session.isRunning,
            isInterrupted: session.isInterrupted,
            interruptionReason: interruptionReason,
            isSwitching: isSwitchingCamera,
            hasPhotoConnection: connection != nil,
            photoConnectionIsActive: connection?.isActive ?? false,
            photoConnectionIsEnabled: connection?.isEnabled ?? false))
    }

    /// **La session peut-elle rendre une image ?** Pour qu'un geste qui OUVRE la caméra et
    /// PREND dans le même mouvement attende qu'elle le puisse. Jamais pendant une bascule.
    var isCaptureReady: Bool { captureAvailability == .ready }

    /// Attend que la session soit prête. `timeout` borne l'attente d'une session déjà en
    /// régime ; une session qui démarre, bascule ou se remet d'une interruption réparable a
    /// le budget de `CameraCaptureWait` (#17433). `false` ⇒ elle ne l'a pas été (viseur
    /// fermé, permission refusée, simulateur sans caméra, tâche annulée).
    func waitUntilCaptureReady(timeout: TimeInterval) async -> Bool {
        let debut = Date()
        while true {
            let etat = captureAvailability
            let ecoule = Date().timeIntervalSince(debut)
            switch CameraCaptureWait.decide(etat, elapsed: ecoule, settledBudget: timeout) {
            case .shoot: return !Task.isCancelled
            case .giveUp:
                Logger.media.error("capture not ready after \(Int(ecoule * 1000), privacy: .public) ms: \(String(describing: etat), privacy: .public)")
                return false
            case .wait:
                guard !Task.isCancelled, await cancellableSleep(for: .milliseconds(50)) else { return false }
            }
        }
    }
}

// MARK: - Photo Delegate

extension CameraModel: AVCapturePhotoCaptureDelegate {
    /// **L'obturateur part** : le retour visuel suit cet instant, pas la photo
    /// traitée qui arrive ensuite (#16482).
    nonisolated func photoOutput(_ output: AVCapturePhotoOutput, willCapturePhotoFor resolvedSettings: AVCaptureResolvedPhotoSettings) {
        DispatchQueue.main.async { MainActor.assumeIsolated { self.noteShutterFired() } }
    }

    /// **Le toucher est entendu** : le bouton se contracte et une haptique
    /// LÉGÈRE répond au doigt, avant l'attente de l'objectif.
    func noteShutterPress() {
        shutterPresses += 1
        shutterClock.start()
    }

    /// La file a trouvé la session hors d'état d'écrire : le déclencheur se libère, et le dit.
    func photoWasRefused() {
        guard isTakingPhoto else { return }
        isTakingPhoto = false
        ComposerCaptureReadiness.announceNotReady()
    }

    /// AVFoundation n'a rendu aucune image : le déclencheur se libère, et le dit. Une prise
    /// dont le viseur s'est fermé entre-temps (`stop()`) ne dit plus rien.
    func photoWasLost() {
        guard isTakingPhoto else { return }
        isTakingPhoto = false
        CameraTakeNotice.announceLostPhoto()
    }

    /// Le tic du cadre, et le délai toucher → obturateur, signpost et console.
    func noteShutterFired() {
        shutterCount += 1
        lastShutterDelay = shutterClock.report()
    }

    /// Le traitement (décodage, redressement, amélioration) part sur sa propre file (#17433) :
    /// fait dans le délégué, il retenait la file d'AVFoundation, et la prise suivante avec.
    nonisolated func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        guard let original = photo.fileDataRepresentation() else {
            Task { @MainActor in self.photoWasLost() }
            return
        }
        CameraModel.photoProcessing.async { [self] in self.deliverProcessed(original) }
    }

    nonisolated private func deliverProcessed(_ original: Data) {
        let processed = photoProcessor.process(encoded: original, settings: .capture)
        let data = processed?.data ?? original
        guard let image = processed.map({ UIImage(cgImage: $0.image) }) ?? UIImage(data: original) else {
            Task { @MainActor in self.photoWasLost() }
            return
        }
        // Les octets traités partent TELS QUELS (HEIC/JPEG, EXIF gardé) : `saveImageFile` les
        // remet à Photos intacts. L'original ne rejoint Photos que si le réglage le demande.
        let nom = ComposerPhotoEncoding.fileName(for: data, id: UUID().uuidString)
        Task { @MainActor in
            // Un viseur fermé pendant le traitement (`stop()`) ne reçoit plus rien.
            guard self.isTakingPhoto else { return }
            self.isTakingPhoto = false
            self.capturedPhoto = image
            // Les octets TRAITÉS, publiés à côté de l'image : ils portent
            // l'EXIF de la prise, qu'une `UIImage` ne rend pas.
            self.capturedPhotoData = data
            self.librarySave = self.savesOriginal()
                ? Task { await CameraModel.saveToPhotoLibrary { await PhotoLibraryManager.shared.saveImageFile(data, fileName: nom) } }
                : nil
            self.capturedPhotoId = UUID().uuidString
        }
    }

    /// La file du traitement des photos : une prise à la fois, hors de la file d'AVFoundation.
    nonisolated static let photoProcessing = DispatchQueue(label: "me.meeshy.camera.photo-processing", qos: .userInitiated)
}
