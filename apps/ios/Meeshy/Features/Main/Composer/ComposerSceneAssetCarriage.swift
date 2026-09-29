import Foundation
import UIKit
import os
import MeeshySDK
import MeeshyUI

/// **Ce que la scène d'un post doit EMPORTER dans le brouillon durable** (#8521).
///
/// Le canal document ne téléverse que `localMedia`. Les médias visuels y
/// entrent par le pont `URL source → objet` ; le son posé sur la scène et le
/// sticker importé de la bibliothèque n'y entraient pas. Ils ne partaient donc
/// que si la pré-montée avait abouti — hors ligne, en échec ou sous son seuil,
/// le `file://` du son était annulé par le sanitizer et le sticker retombait
/// sur son emoji.
///
/// Un objet qui a déjà son `postMediaId` (pré-monté, ou emprunté au serveur)
/// n'est pas emporté : son fichier est déjà là-bas.
nonisolated enum ComposerSceneAssetCarriage {

    enum Source: Equatable {
        /// Un fichier local déjà écrit (le son).
        case file(URL)
        /// Une image tenue en mémoire par l'atelier (`loadedImages`), à écrire.
        case stickerBitmap
    }

    struct Pending: Equatable {
        let objectId: String
        let source: Source
    }

    static func pending(slides: [StorySlide], stickerBitmapIds: Set<String>) -> [Pending] {
        slides.flatMap { slide -> [Pending] in
            let sons = (slide.effects.audioPlayerObjects ?? []).compactMap { son -> Pending? in
                ComposerPreUploadSweep.pendingFile(postMediaId: son.postMediaId, mediaURL: son.mediaURL)
                    .map { Pending(objectId: son.id, source: .file($0)) }
            }
            let stickers = StoryStickerUpload
                .pendingUploadIds(stickers: slide.effects.stickerObjects ?? [],
                                  availableBitmapIds: stickerBitmapIds)
                .map { Pending(objectId: $0, source: .stickerBitmap) }
            return sons + stickers
        }
    }
}

/// **Les pièces que le brouillon emporte, et le pont vers leurs objets.**
struct ComposerCarriedSceneAssets {
    let media: [ComposerDocumentMedia]
    let objectIdBySource: [URL: String]

    static let empty = ComposerCarriedSceneAssets(media: [], objectIdBySource: [:])

    /// Écrit ce qui doit l'être et rend les pièces jointes. Le sticker part en
    /// GIF quand il est animé (#3956), en PNG sinon — le JPEG n'a pas d'alpha.
    /// Un sticker qu'on n'a pas pu écrire reste sur son emoji, comme sur le
    /// canal de l'atelier : une image d'appoint ne fait pas échouer le post.
    static func materialize(_ pending: [ComposerSceneAssetCarriage.Pending],
                            loadedImages: [String: UIImage],
                            stickerAnimations: [String: Data],
                            directory: URL = FileManager.default.temporaryDirectory) -> ComposerCarriedSceneAssets {
        let journal = os.Logger(subsystem: "me.meeshy.app", category: "media")
        var media: [ComposerDocumentMedia] = []
        var bridge: [URL: String] = [:]
        for item in pending {
            switch item.source {
            case .file(let url):
                media.append(ComposerDocumentMediaFactory.media(
                    url: url, declaredMimeType: MimeTypeResolver.mimeType(forURL: url)))
                bridge[url] = item.objectId
            case .stickerBitmap:
                guard let image = loadedImages[item.objectId],
                      let file = writeSticker(image, animatedData: stickerAnimations[item.objectId],
                                              objectId: item.objectId, directory: directory)
                else {
                    journal.error("carriage: sticker \(item.objectId, privacy: .public) non écrit — il reste sur son emoji")
                    continue
                }
                media.append(ComposerDocumentMediaFactory.media(url: file.url, declaredMimeType: file.mimeType))
                bridge[file.url] = item.objectId
            }
        }
        return ComposerCarriedSceneAssets(media: media, objectIdBySource: bridge)
    }

    private static func writeSticker(_ image: UIImage, animatedData: Data?, objectId: String,
                                     directory: URL) -> (url: URL, mimeType: String)? {
        let animated = animatedData.flatMap { bytes in
            AnimatedImageEligibility.container(bytes).map { (bytes: bytes, container: $0) }
        }
        let payload: (data: Data, mimeType: String, ext: String)
        if let animated {
            payload = (animated.bytes, animated.container.mimeType, animated.container.filenameExtension)
        } else if let png = image.pngData() {
            payload = (png, "image/png", "png")
        } else {
            return nil
        }
        let url = directory.appendingPathComponent("sticker_\(objectId).\(payload.ext)")
        guard (try? payload.data.write(to: url, options: .atomic)) != nil else { return nil }
        return (url, payload.mimeType)
    }
}
