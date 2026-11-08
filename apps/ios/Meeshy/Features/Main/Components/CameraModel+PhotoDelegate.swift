import UIKit
import AVFoundation
import MeeshySDK

// MARK: - Photo Delegate

extension CameraModel: AVCapturePhotoCaptureDelegate {
    /// **L'obturateur part** : le retour visuel suit cet instant, pas la photo
    /// traitée qui arrive ensuite (#16482).
    nonisolated func photoOutput(_ output: AVCapturePhotoOutput, willCapturePhotoFor resolvedSettings: AVCaptureResolvedPhotoSettings) {
        DispatchQueue.main.async { MainActor.assumeIsolated { self.noteShutterFired() } }
    }

    /// AVFoundation n'a rendu aucune image : le déclencheur se libère, et le dit.
    func photoWasLost() {
        isTakingPhoto = false
        CameraTakeNotice.announceLostPhoto()
    }

    nonisolated func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        guard let original = photo.fileDataRepresentation() else {
            Task { @MainActor in self.photoWasLost() }
            return
        }
        let processor: any PhotoCaptureProcessorProviding = photoProcessor
        let processed = processor.process(encoded: original, settings: .capture)
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
