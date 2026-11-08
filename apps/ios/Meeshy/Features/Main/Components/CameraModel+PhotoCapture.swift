import AVFoundation
import UIKit
import MeeshySDK
import MeeshyUI

/// La prise photo du viseur : le déclencheur, sa disponibilité et les délégués d'AVFoundation.
extension CameraModel {

    func takePhoto(flash: AVCaptureDevice.FlashMode) {
        #if DEBUG
        if let fixture {
            guard !isSwitchingCamera else { return }
            noteShutterFired()
            deliverFixturePhoto(fixture)
            return
        }
        #endif
        // Même exception ObjC que l'enregistrement sans connexion active, donc
        // même prévention devant l'appel — un `do/catch` ne la rattraperait pas.
        let connection = photoOutput.connection(with: .video)
        guard !isSwitchingCamera, CameraRecordingReadiness.mayCapturePhoto(
            sessionIsRunning: session.isRunning,
            hasVideoConnection: connection != nil,
            connectionIsActive: connection?.isActive ?? false,
            connectionIsEnabled: connection?.isEnabled ?? false
        ) else { return }
        let settings = CameraPhotoTuning.settings(
            flash: flash, supportedFlashModes: photoOutput.supportedFlashModes,
            outputMaxPhotoDimensions: CameraPhotoDimensions(photoOutput.maxPhotoDimensions),
            formatMaxPhotoDimensions: photoOutput.sourceMaxPhotoDimensions)
        horizon.level(connection)
        isTakingPhoto = true
        photoOutput.capturePhoto(with: settings, delegate: self)
    }

    /// **La session peut-elle rendre une image ?** Les mêmes quatre faits que
    /// `takePhoto` exige — lus ici pour qu'un geste qui OUVRE la caméra et
    /// PREND dans le même mouvement attende qu'elle le puisse. Jamais
    /// pendant une bascule : l'entrée en place va être retirée.
    var isCaptureReady: Bool {
        #if DEBUG
        if fixture != nil { return !isSwitchingCamera }
        #endif
        let connection = photoOutput.connection(with: .video)
        return !isSwitchingCamera && CameraRecordingReadiness.mayCapturePhoto(
            sessionIsRunning: session.isRunning,
            hasVideoConnection: connection != nil,
            connectionIsActive: connection?.isActive ?? false,
            connectionIsEnabled: connection?.isEnabled ?? false)
    }

    /// Attend que la session soit prête, au plus `timeout`. `false` ⇒ elle ne
    /// l'a pas été (permission refusée, simulateur sans caméra, tâche annulée).
    func waitUntilCaptureReady(timeout: TimeInterval) async -> Bool {
        let limite = Date().addingTimeInterval(timeout)
        while !isCaptureReady {
            guard !Task.isCancelled, Date() < limite else { return false }
            guard await cancellableSleep(for: .milliseconds(50)) else { return false }
        }
        return !Task.isCancelled
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
        HapticFeedback.light()
    }

    /// AVFoundation n'a rendu aucune image : le déclencheur se libère, et le dit.
    func photoWasLost() {
        isTakingPhoto = false
        CameraTakeNotice.announceLostPhoto()
    }

    /// Le tic du cadre, et le délai toucher → obturateur, signpost et console.
    func noteShutterFired() {
        shutterCount += 1
        lastShutterDelay = shutterClock.report()
    }

    nonisolated func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        guard let original = photo.fileDataRepresentation() else {
            Task { @MainActor in self.photoWasLost() }
            return
        }
        let processed = photoProcessor.process(encoded: original, settings: .capture)
        let data = processed?.data ?? original
        guard let image = processed.map({ UIImage(cgImage: $0.image) }) ?? UIImage(data: original) else {
            Task { @MainActor in self.photoWasLost() }
            return
        }
        // Persist the processed encoded bytes AS-IS (HEIC/JPEG, EXIF kept):
        // `saveImage(_ data:)` decodes to a UIImage and loses the EXIF,
        // `saveImageFile` hands Photos the bytes untouched.
        // `PhotoLibraryManager` is deliberately non-@MainActor so its
        // `performChanges` block runs on Photos' own queue without the
        // executor-isolation SIGTRAP an inline save would hit.
        // L'original ne rejoint Photos que si le réglage le demande,
        // quelle que soit la zone de la prise : la prise reste dans la
        // session de toute façon.
        let nom = ComposerPhotoEncoding.fileName(for: data, id: UUID().uuidString)
        Task { @MainActor in
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
}
