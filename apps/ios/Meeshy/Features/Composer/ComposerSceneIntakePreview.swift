import UIKit
import ImageIO
import Photos
import PhotosUI
import SwiftUI

/// **Ce que montre l'espace réservé d'un média qui entre** (#13906).
///
/// Une photo montre sa vignette dès qu'elle est lisible sur l'appareil, avant
/// la fin de la préparation ; une vidéo et un sticker gardent la forme neutre —
/// la règle d'Android (`IncomingMediaPlaceholder`). La vignette vient de la
/// photothèque quand l'accès est accordé (immédiate, sans réseau), sinon du
/// fichier copié, réduite sans décoder l'image entière.
nonisolated enum ComposerSceneIntakePreview {

    /// Le plus grand côté d'une vignette, en pixels : de quoi couvrir la carte
    /// sans garder en mémoire une photo de douze mégapixels.
    static let maxPixel: CGFloat = 600

    static func showsThumbnail(kind: ComposerSceneIntake.Kind, isVideo: Bool) -> Bool {
        kind == .media && !isVideo
    }

    /// Dès le choix : la vignette que la photothèque tient déjà.
    @MainActor
    static func request(_ item: PhotosPickerItem?, for id: UUID, into intake: Binding<ComposerSceneIntake?>) {
        guard let item, let identifiant = item.itemIdentifier,
              showsThumbnail(kind: .media, isVideo: ComposerPhotoLibraryStaging.isVideo(item)) else { return }
        Task { @MainActor in
            guard let image = await libraryThumbnail(localIdentifier: identifiant) else { return }
            intake.wrappedValue = intake.wrappedValue?.showing(image, for: id)
        }
    }

    /// Sans accès à la photothèque : la vignette du fichier copié, réduite hors
    /// du fil principal — inutile quand la photothèque l'a déjà donnée.
    @MainActor
    static func request(staged url: URL, of item: PhotosPickerItem, for id: UUID,
                        into intake: Binding<ComposerSceneIntake?>) {
        guard intake.wrappedValue?.thumbnail == nil,
              showsThumbnail(kind: .media, isVideo: ComposerPhotoLibraryStaging.isVideo(item)) else { return }
        Task { @MainActor in
            let image = await Task.detached(priority: .userInitiated) { thumbnail(at: url) }.value
            guard let image else { return }
            intake.wrappedValue = intake.wrappedValue?.showing(image, for: id)
        }
    }

    /// La vignette d'une photo déjà copiée sur l'appareil.
    static func thumbnail(at url: URL, maxPixel: CGFloat = maxPixel) -> UIImage? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        return UIImage(cgImage: image)
    }

    /// La vignette tenue par la photothèque — `nil` sans accès (aucune demande
    /// d'autorisation n'est faite ici) ou pour une photo restée dans iCloud.
    static func libraryThumbnail(localIdentifier: String, maxPixel: CGFloat = maxPixel) async -> UIImage? {
        let acces = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard acces == .authorized || acces == .limited,
              let asset = PHAsset.fetchAssets(withLocalIdentifiers: [localIdentifier], options: nil).firstObject
        else { return nil }
        let options = PHImageRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .fast
        options.isNetworkAccessAllowed = false
        return await withCheckedContinuation { suite in
            PHImageManager.default().requestImage(for: asset,
                                                  targetSize: CGSize(width: maxPixel, height: maxPixel),
                                                  contentMode: .aspectFill, options: options) { image, _ in
                suite.resume(returning: image)
            }
        }
    }
}
