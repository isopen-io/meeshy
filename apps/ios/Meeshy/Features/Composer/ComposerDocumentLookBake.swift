import Foundation
import MeeshySDK
import os
import UIKit

// MARK: - Le canal DOCUMENT cuit le look, comme la story (#13840)

/// **Un post, un réel ou une publication à plusieurs scènes part par le
/// DOCUMENT** (`ComposerPublishChannel`), qui téléverse ses `localMedia` tels
/// quels. Sans cette étape, un média réglé partait en ORIGINAL, et son look au
/// fil : peint une seconde fois chez le lecteur iOS, jamais ailleurs.
///
/// La cuisson a lieu ici, au moment de publier et seulement là : le brouillon
/// remis garde l'original et son réglage, le document qui part porte les
/// octets cuits, les légendes, alternatives et adoptions du canvas suivent la
/// nouvelle adresse, et aucun look ne part.
enum ComposerDocumentLookBake {

    static func baked(_ draft: ComposerDocumentDraft) async -> ComposerDocumentDraft {
        guard let effets = draft.storyEffects else { return draft }
        let looks = effets.allMediaLooks.filter { ComposerMediaLookMapping.paints($0.value) }
        guard !looks.isEmpty else { return draft }
        var cuits: [URL: ComposerDocumentMedia] = [:]
        for piece in draft.localMedia {
            guard let id = draft.mediaObjectIds[piece.url], let look = looks[id] else { continue }
            let aspect = effets.mediaObjects?.first { $0.id == id }?.measuredAspectRatio.map { CGFloat($0) }
            if let cuit = await bake(piece, look: look, aspect: aspect) {
                cuits[piece.url] = cuit
            } else {
                Logger.stories.error("publish.look.bake document media failed id=\(id, privacy: .public)")
            }
        }
        return rewritten(draft, replacing: cuits)
    }

    private static func bake(_ piece: ComposerDocumentMedia, look: StoryMediaLook,
                             aspect: CGFloat?) async -> ComposerDocumentMedia? {
        if piece.mimeType.hasPrefix("video/") {
            guard let url = await StoryPublicationLookBake.bakedVideo(piece.url, look: look, aspect: aspect),
                  url != piece.url else { return nil }
            return ComposerDocumentMedia(url: url, mimeType: MimeTypeResolver.mimeType(forURL: url),
                                         durationMs: piece.durationMs)
        }
        guard piece.mimeType.hasPrefix("image/"), let image = UIImage(contentsOfFile: piece.url.path),
              let cuite = await StoryPublicationLookBake.bakedImage(image, look: look) else { return nil }
        let (octets, suffixe) = ComposerCapturePayload.bytes(original: nil, fallback: cuite)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("look-\(UUID().uuidString).\(suffixe)")
        guard let octets, (try? octets.write(to: url)) != nil else { return nil }
        return ComposerDocumentMedia(url: url, mimeType: ComposerCapturePayload.mime(for: suffixe), durationMs: nil)
    }

    /// **Le document qui part** : chaque pièce cuite prend la place de son
    /// original, les cartes indexées par adresse suivent, et aucun look ne part
    /// — un média dont la cuisson a échoué part en original plutôt que rien.
    static func rewritten(_ draft: ComposerDocumentDraft,
                          replacing cuits: [URL: ComposerDocumentMedia]) -> ComposerDocumentDraft {
        func suivre(_ carte: ComposerMediaCaptions) -> ComposerMediaCaptions {
            Dictionary(carte.map { (cuits[$0.key]?.url ?? $0.key, $0.value) }, uniquingKeysWith: { premier, _ in premier })
        }
        var effets = draft.storyEffects?.withoutMediaLooks
        let medias = effets?.mediaObjects
        effets?.mediaObjects = medias?.map { media in
            guard let adresse = media.mediaURL.flatMap(URL.init(string:)), let cuit = cuits[adresse] else { return media }
            var suivi = media
            suivi.mediaURL = cuit.url.absoluteString
            return suivi
        }
        return ComposerDocumentDraft(
            format: draft.format, text: draft.text, emoji: draft.emoji, visibility: draft.visibility,
            visibilityUserIds: draft.visibilityUserIds, mentions: draft.mentions, repostOfId: draft.repostOfId,
            audioUrl: draft.audioUrl, localMedia: draft.localMedia.map { cuits[$0.url] ?? $0 },
            location: draft.location, discoverabilityPrecision: draft.discoverabilityPrecision,
            originalLanguage: draft.originalLanguage, storyEffects: effets,
            mediaCaptions: suivre(draft.mediaCaptions), mediaAlts: suivre(draft.mediaAlts),
            mediaObjectIds: suivre(draft.mediaObjectIds), forcePlainPost: draft.forcePlainPost,
            mobileTranscription: draft.mobileTranscription, allowSoundExtraction: draft.allowSoundExtraction)
    }
}
