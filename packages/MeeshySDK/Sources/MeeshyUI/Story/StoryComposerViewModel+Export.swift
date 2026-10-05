import UIKit
import os
import MeeshySDK

// MARK: - StoryComposerViewModel + Export MP4

extension StoryComposerViewModel {

    /// Builds the slide handed to `StoryExporter.export` : timeline committée
    /// (si chargée pour cette slide), `mediaURL` des vidéos résolus en
    /// fichiers locaux de session, et fond image composer (stocké hors modèle
    /// dans `slideImages`) injecté en media object éphémère. La slide
    /// retournée est une COPIE de travail — rien n'est persisté ni publié.
    public func exportableCurrentSlide() -> StorySlide {
        if timelineLoadedSlideId == currentSlide.id {
            commitTimelineToCurrentSlide()
        }
        var slide = currentSlide
        var medias = slide.effects.mediaObjects ?? []

        for index in medias.indices {
            guard medias[index].kind == .video else { continue }
            if let url = resolveMediaURL(elementId: medias[index].id,
                                         postMediaId: medias[index].postMediaId,
                                         kind: .video) {
                medias[index].mediaURL = url.absoluteString
            }
        }

        if !medias.contains(where: { $0.isBackground }),
           let bgImage = slideImages[slide.id],
           let bgURL = Self.writeExportBackgroundImage(bgImage, slideId: slide.id) {
            let aspect = bgImage.size.height > 0
                ? Double(bgImage.size.width / bgImage.size.height)
                : 1.0
            medias.insert(StoryMediaObject(
                id: "_export_bg_image_\(slide.id)",
                postMediaId: "_export_bg_image_\(slide.id)",
                mediaURL: bgURL.absoluteString,
                mediaType: StoryMediaKind.image.rawValue,
                aspectRatio: aspect,
                volume: 0,
                isBackground: true,
                startTime: 0,
                duration: Double(slide.effects.slideDuration ?? Float(slide.duration))
            ), at: 0)
        }

        slide.effects.mediaObjects = medias
        return slide
    }

    /// **Ce que la scène tient en mémoire et que la slide ne porte pas** (#8599)
    /// — l'unique construction des entrées du moteur pour les DEUX chemins
    /// d'export du composer (`⋯` → Enregistrer / Partager, et la timeline).
    ///
    /// - `images` : les bitmaps de `loadedImages` que la slide RÉFÉRENCE —
    ///   médias (retouches comprises) et stickers collés, sous les clés que
    ///   lisent les couches. Un bitmap d'une autre slide ne voyage pas.
    /// - `stickerImageSources` : les stickers adossés à un `PostMedia` dont le
    ///   fichier a été adopté localement (`adoptedLocalMedia`).
    /// - `audioURLs` : les fichiers de session des sons, que la `mediaURL`
    ///   d'un son pas encore téléversé ne sait pas adresser.
    /// - `animations` : les octets des stickers ANIMÉS collés (#8610), sans
    ///   lesquels un GIF sortait figé sur sa première image.
    public func exportInputs(for slide: StorySlide) -> StoryExportInputs {
        let medias = slide.effects.mediaObjects ?? []
        let stickers = slide.effects.stickerObjects ?? []
        let referenced = Set(medias.flatMap { [$0.id, $0.postMediaId] }
            + stickers.flatMap(StoryStickerLayer.bitmapCacheKeys(for:)))
        let images = loadedImages.filter { referenced.contains($0.key) }
        let animations = loadedStickerAnimations.filter { referenced.contains($0.key) }
        let stickerSources = stickers.reduce(into: [String: String]()) { sources, sticker in
            guard !sticker.postMediaId.isEmpty,
                  let local = adoptedLocalMedia[sticker.postMediaId] else { return }
            sources[sticker.postMediaId] = local.absoluteString
        }
        let audioURLs = (slide.effects.audioPlayerObjects ?? []).reduce(into: [String: URL]()) { urls, audio in
            guard let url = resolveMediaURL(elementId: audio.id,
                                            postMediaId: audio.postMediaId,
                                            kind: .audio) else { return }
            urls[audio.id] = url
        }
        return StoryExportInputs(stickerImageSources: stickerSources,
                                 images: images,
                                 audioURLs: audioURLs,
                                 animations: animations)
    }

    /// Écrit le fond image composer en JPEG temporaire pour que le pipeline
    /// d'export (qui résout par `mediaURL` file://) puisse le peindre.
    /// Fichier stable par slide — un ré-export écrase la version précédente.
    static func writeExportBackgroundImage(_ image: UIImage, slideId: String) -> URL? {
        guard let data = image.jpegData(compressionQuality: 0.92) else { return nil }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-export-bg-\(slideId).jpg")
        do {
            try data.write(to: url)
            return url
        } catch {
            Logger.cache.error("[StoryComposerVM] Écriture bg export échouée: \(error.localizedDescription)")
            return nil
        }
    }
}
