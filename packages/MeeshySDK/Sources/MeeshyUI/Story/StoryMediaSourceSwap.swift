import Foundation
import UIKit
import MeeshySDK

/// **Remplacer la SOURCE d'un média posé, à sa place** (#12590) — la retouche unique rend
/// un fichier neuf pour une image ou une vidéo déjà sur la scène ; ce fichier prend la
/// place de l'ancien sans que l'objet bouge.
///
/// Le composer tient un média dans plusieurs livres du module (le modèle de la slide, les
/// bitmaps, les URL de vidéo, les rapports d'aspect, le z-order) que seul le module sait
/// tenir d'accord : l'app ne peut pas les écrire (`registerLoadedImage`, `setMediaURL`…
/// sont internes), et cette porte publique évite de les ouvrir tous.
///
/// Ce qui reste : le plan (un fond reste le fond), la position, l'échelle, la rotation,
/// l'ancre, le z, la fenêtre de temps, le volume, le muet, le filtre et les réglages. Ce qui
/// repart de zéro : `crop`, `sourceStart`, `sourceEnd` (ils visaient l'ancienne géométrie),
/// la vignette hachée et la durée native. L'objet reçoit un NOUVEL identifiant : l'ancien
/// bitmap part en réserve d'annulation, et « Annuler » rend l'original.
@MainActor
public enum StoryMediaSourceSwap {

    public enum Source {
        case image(UIImage, fileURL: URL)
        case video(URL, thumbnail: UIImage?, aspectRatio: Double?, duration: Float?)
    }

    /// Le remplacement est-il possible ? `false` pour un identifiant inconnu, ou une source qui
    /// ne porte pas le genre de l'objet — l'appelant le sait AVANT de toucher à ses propres livres.
    public static func canSwap(_ objectId: String, to source: Source, in viewModel: StoryComposerViewModel) -> Bool {
        guard let (slideIndex, mediaIndex) = locate(objectId, in: viewModel.slides) else { return false }
        return accepts(source, replacing: viewModel.slides[slideIndex].effects.mediaObjects?[mediaIndex].mediaType)
    }

    /// - Returns: l'identifiant du média remplaçant, `nil` (sans rien modifier) si
    ///   `objectId` ne désigne aucun média de la scène, ou si la source ne porte pas le
    ///   genre de l'objet (une image ne remplace pas une vidéo).
    @discardableResult
    public static func swap(_ objectId: String, to source: Source, as newId: String = UUID().uuidString,
                            in viewModel: StoryComposerViewModel) -> String? {
        guard newId != objectId, canSwap(objectId, to: source, in: viewModel),
              let (slideIndex, mediaIndex) = locate(objectId, in: viewModel.slides)
        else { return nil }
        var effects = viewModel.slides[slideIndex].effects
        guard var objects = effects.mediaObjects else { return nil }
        objects[mediaIndex] = replacing(objects[mediaIndex], newId: newId, source: source)
        effects.mediaObjects = objects
        viewModel.slides[slideIndex].effects = effects
        carry(from: objectId, to: newId, source: source, slideId: viewModel.slides[slideIndex].id, in: viewModel)
        return newId
    }

    private static func locate(_ id: String, in slides: [StorySlide]) -> (slide: Int, media: Int)? {
        for (slideIndex, slide) in slides.enumerated() {
            if let mediaIndex = slide.effects.mediaObjects?.firstIndex(where: { $0.id == id }) {
                return (slideIndex, mediaIndex)
            }
        }
        return nil
    }

    private static func accepts(_ source: Source, replacing mediaType: String?) -> Bool {
        switch source {
        case .image: return mediaType == StoryMediaKind.image.rawValue
        case .video: return mediaType == StoryMediaKind.video.rawValue
        }
    }

    private static func replacing(_ old: StoryMediaObject, newId: String, source: Source) -> StoryMediaObject {
        var media = old
        media.id = newId
        media.postMediaId = ""
        media.crop = nil
        media.sourceStart = nil
        media.sourceEnd = nil
        media.thumbHash = nil
        switch source {
        case .image(let image, let fileURL):
            media.mediaURL = fileURL.absoluteString
            if image.size.width > 0, image.size.height > 0 {
                media.aspectRatio = Double(image.size.width / image.size.height)
            }
            media.intrinsicDuration = nil
        case .video(let url, _, let aspectRatio, let duration):
            media.mediaURL = url.absoluteString
            if let aspectRatio, aspectRatio.isFinite, aspectRatio > 0 { media.aspectRatio = aspectRatio }
            media.intrinsicDuration = duration.map(Double.init)
        }
        return media
    }

    /// Les livres du module qui désignent le média par son identifiant : l'ancien part en
    /// réserve (l'annulation le rend), le nouveau prend la même place.
    private static func carry(from old: String, to new: String, source: Source, slideId: String,
                              in viewModel: StoryComposerViewModel) {
        if let image = viewModel.loadedImages.removeValue(forKey: old) { viewModel.retiredImages[old] = image }
        if let url = viewModel.loadedVideoURLs.removeValue(forKey: old) { viewModel.retiredVideoURLs[old] = url }
        viewModel.mediaAspectRatios.removeValue(forKey: old)
        if let z = viewModel.zIndexMap.removeValue(forKey: old) { viewModel.zIndexMap[new] = z }
        if viewModel.selectedElementId == old { viewModel.selectedElementId = new }
        switch source {
        case .image(let image, let fileURL):
            viewModel.carriedContentSources.insert(fileURL)
            viewModel.registerLoadedImage(image, for: new)
        case .video(let url, let thumbnail, let aspectRatio, _):
            viewModel.carriedContentSources.insert(url)
            viewModel.loadedVideoURLs[new] = url
            viewModel.registerLoadedImage(thumbnail, for: new)
            if let aspectRatio, aspectRatio.isFinite, aspectRatio > 0 {
                viewModel.mediaAspectRatios[new] = CGFloat(aspectRatio)
            }
            viewModel.measureVideo(objectId: new, fileURL: url, slideId: slideId)
        }
    }
}
