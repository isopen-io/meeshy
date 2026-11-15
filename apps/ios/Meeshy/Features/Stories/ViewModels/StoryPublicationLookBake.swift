import AVFoundation
import CoreImage
import Foundation
import MeeshySDK
import MeeshyUI
import os
import UIKit

// MARK: - La publication CUIT le look, et seulement elle (#13840)

/// **Le look d'un média est un réglage jusqu'à l'envoi ; à l'envoi, des octets.**
///
/// Tout lecteur déjà publié — web, Android, versions iOS d'avant — ne connaît
/// pas `StoryMediaObject.look` : le média part donc CUIT (les mêmes pixels que le
/// canvas, par le même peintre), et la charge part sans le réglage
/// (`StoryEffects.withoutMediaLooks`). Le brouillon, lui, garde l'original et
/// son réglage : rouvrir une publication échouée retrouve tout modifiable.
enum StoryPublicationLookBake {

    /// **Un média réglé repart cuit, même pré-monté** : sa pré-montée est
    /// l'ORIGINAL, et la publier montrerait un média sans son cadre. Une image
    /// de FOND part par l'image de slide (`slideImages`), cuite à part.
    static func needsUpload(_ media: StoryMediaObject) -> Bool {
        media.postMediaId.isEmpty || (paints(media) && !(media.isBackground && media.kind == .image))
    }

    static func paints(_ media: StoryMediaObject) -> Bool {
        ComposerMediaLookMapping.paints(media.look)
    }

    /// L'image cuite aux mêmes proportions, ou l'image telle quelle sans look.
    static func bakedImage(_ image: UIImage, look: StoryMediaLook?) async -> UIImage? {
        guard let look, ComposerMediaLookMapping.paints(look) else { return image }
        ComposerLookPainterAdapter.shared.refreshAuthor()
        return await Task.detached(priority: .userInitiated) { () -> UIImage? in
            Self.render(image, look: look)
        }.value
    }

    nonisolated private static func render(_ image: UIImage, look: StoryMediaLook) -> UIImage? {
        guard let source = StoryRenderingContext.orientedSource(of: image) else { return nil }
        let peinte = ComposerLookPainterAdapter.shared.paint(source, look: look, still: true)
        guard let rendu = ComposerLookGPU.context.createCGImage(peinte, from: source.extent) else { return nil }
        return UIImage(cgImage: rendu, scale: image.scale, orientation: .up)
    }

    /// La vidéo cuite dans un fichier temporaire, ou l'adresse d'origine sans look.
    static func bakedVideo(_ url: URL, media: StoryMediaObject) async -> URL? {
        await bakedVideo(url, look: media.look, aspect: media.measuredAspectRatio.map { CGFloat($0) })
    }

    /// Le cadre de la vidéo se peint dans ses proportions mesurées, à défaut celles de la scène.
    static func bakedVideo(_ url: URL, look: StoryMediaLook?, aspect: CGFloat?) async -> URL? {
        guard ComposerMediaLookMapping.paints(look) else { return url }
        ComposerLookPainterAdapter.shared.refreshAuthor()
        let rendu = await ComposerLookVideoExporter.export(url, look: ComposerMediaLookMapping.photoLook(look),
                                                           framing: ComposerMediaLookMapping.framing(look),
                                                           aspect: aspect ?? ComposerLookPainter.designAspect,
                                                           person: ComposerLookPainterAdapter.shared.author,
                                                           date: Date(), uses: .gallery)
        return rendu?.gallery
    }
}

// MARK: - Ce que la publication téléverse

extension StoryPublicationLookBake {

    /// L'image à téléverser et le fichier d'origine à réutiliser — aucun quand
    /// l'image est cuite (ses octets ne sont plus ceux du fichier). Une cuisson
    /// impossible publie l'original plutôt que rien.
    static func publishedImage(_ image: UIImage, media: StoryMediaObject) async -> (UIImage, URL?) {
        guard paints(media) else { return (image, StoryImageUploadEncoder.localFile(media.mediaURL)) }
        guard let cuite = await bakedImage(image, look: media.look) else {
            Logger.stories.error("publish.look.bake image failed id=\(media.id, privacy: .public)")
            return (image, StoryImageUploadEncoder.localFile(media.mediaURL))
        }
        return (cuite, nil)
    }

    static func publishedVideo(_ url: URL, media: StoryMediaObject) async -> URL {
        guard let cuite = await bakedVideo(url, media: media) else {
            Logger.stories.error("publish.look.bake video failed id=\(media.id, privacy: .public)")
            return url
        }
        return cuite
    }

    /// Le fond de slide, cuit par le look de son média de fond.
    static func publishedBackground(_ image: UIImage, effects: StoryEffects) async -> UIImage {
        guard let fond = effects.resolvedBackgroundMedia, fond.kind == .image, paints(fond) else { return image }
        return await bakedImage(image, look: fond.look) ?? image
    }
}

// MARK: - Le téléversement d'une image de story

extension StoryPublicationLookBake {

    /// **Une image de story part par le chemin commun** : encodée selon la
    /// politique de stockage, téléversée, puis ADOPTÉE par le cache sous son
    /// adresse serveur — la réconciliation de l'item publié trouve l'image sans
    /// la retélécharger. `adoptImage` déplace le fichier temporaire ; son
    /// effacement différé ne fait alors plus rien.
    static func uploadStoryImage(_ image: UIImage, file: URL?, uploader: TusUploadManager,
                                 token: String) async throws -> TusUploadResult {
        let thumbHash = image.toThumbHash()
        let encoded = try await StoryImageUploadEncoder.temporaryFile(
            for: image, file: file, policy: MediaContext.story.storedOutgoingImagePolicy())
        let tempURL = encoded.url
        defer { try? FileManager.default.removeItem(at: tempURL) }
        let result = try await uploader.uploadFile(
            fileURL: tempURL, mimeType: encoded.mimeType,
            credential: .bearer(token), uploadContext: "story", thumbHash: thumbHash)
        await CacheCoordinator.shared.images.adoptImage(localFile: tempURL, for: result.fileUrl)
        return result
    }
}
