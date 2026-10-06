import Foundation
import MeeshySDK

/// Ce que la capture enregistre en galerie : le RENDU (le brut y part déjà,
/// à la prise, par `CameraModel`), en OCTETS encodés qui portent l'EXIF de la prise.
nonisolated protocol ComposerGalleryProviding: AnyObject, Sendable {
    @concurrent func saveImage(_ data: Data) async -> Bool
    @concurrent func saveVideo(at url: URL) async -> Bool
}

/// **La galerie de la capture** (#9351, spec § 3.4) — l'album Meeshy, octets tels
/// quels (`saveImageFile` : aucun aller-retour par `UIImage`), et un refus qui se dit.
nonisolated final class ComposerGallery: ComposerGalleryProviding, @unchecked Sendable {
    static let shared = ComposerGallery()

    nonisolated deinit {}

    @concurrent
    func saveImage(_ data: Data) async -> Bool {
        let nom = ComposerPhotoEncoding.fileName(for: data, id: UUID().uuidString)
        let enregistre = await PhotoLibraryManager.shared.saveImageFile(data, fileName: nom)
        if !enregistre { await CameraModel.reportPhotoLibraryRefusal() }
        return enregistre
    }

    @concurrent
    func saveVideo(at url: URL) async -> Bool {
        let enregistre = await PhotoLibraryManager.shared.saveVideo(at: url)
        if !enregistre { await CameraModel.reportPhotoLibraryRefusal() }
        return enregistre
    }
}
