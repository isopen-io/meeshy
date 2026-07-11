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
