import UIKit
import MeeshySDK
import Photos
import PhotosUI
import SwiftUI

/// **Ce que montre l'espace réservé d'un média qui entre** (#13906).
///
/// Une photo ou une vidéo montre sa vignette dès qu'elle est lisible sur
/// l'appareil, avant la fin de la préparation ; un sticker garde la forme
/// neutre. La vidéo, l'ajout le plus long, est celle qui a le plus besoin de
/// montrer ce qui arrive. La vignette vient de la photothèque quand l'accès est
/// accordé (immédiate, sans réseau, l'affiche d'une vidéo comprise), sinon du
/// fichier copié : réduite sans décoder l'image entière pour une photo, sa
/// première image pour une vidéo.
nonisolated enum ComposerSceneIntakePreview {

    /// Le plus grand côté d'une vignette, en pixels : de quoi couvrir la carte
    /// sans garder en mémoire une photo de douze mégapixels.
    static let maxPixel: CGFloat = 600

    static func showsThumbnail(kind: ComposerSceneIntake.Kind) -> Bool {
        kind == .media
    }

    /// Dès le choix : la vignette que la photothèque tient déjà.
    @MainActor
    static func request(_ item: PhotosPickerItem?, for id: UUID, into intake: Binding<ComposerSceneIntake?>) {
        guard let item, let identifiant = item.itemIdentifier else { return }
        Task { @MainActor in
            guard let image = await libraryThumbnail(localIdentifier: identifiant) else { return }
            intake.wrappedValue = intake.wrappedValue?.showing(image, for: id)
        }
    }

    /// Sans accès à la photothèque : la vignette du fichier copié, réduite hors
    /// du fil principal — inutile quand la photothèque l'a déjà donnée.
    @MainActor
    static func request(staged url: URL, for id: UUID, into intake: Binding<ComposerSceneIntake?>) {
        guard intake.wrappedValue?.thumbnail == nil else { return }
        Task { @MainActor in
            guard let image = await thumbnail(at: url) else { return }
            intake.wrappedValue = intake.wrappedValue?.showing(image, for: id)
        }
    }

    /// La vignette d'un média déjà copié sur l'appareil, hors du fil principal :
    /// une photo réduite, sinon la première image d'une vidéo.
    @concurrent
    static func thumbnail(at url: URL, maxPixel: CGFloat = maxPixel) async -> UIImage? {
        if let photo = ImageDownsampler.thumbnail(fileURL: url, maxPixelSize: maxPixel, decodeImmediately: true) {
            return UIImage(cgImage: photo)
        }
        return await VideoThumbnailGenerator.shared.image(
            for: .firstFrame(of: url, maxDimension: maxPixel, cachesResult: false))
    }

    /// La vignette tenue par la photothèque — l'affiche d'une vidéo comprise —,
    /// `nil` sans accès (aucune demande d'autorisation n'est faite ici) ou pour
    /// un média resté dans iCloud.
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
