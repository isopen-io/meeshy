import Foundation
import MeeshySDK

/// **Ce que la SCÈNE ajoute à une modification** (#15630) : les médias neufs
/// rattachés, leurs textes alternatifs et légendes (clés serveur), les
/// références déclarées. `nil` = la clé ne part pas.
struct PostEditAdditions {
    var mediaIds: [String]?
    var mentions: [PostMentionInput]?
    var mediaAlt: [String: String]?
    var mediaCaption: [String: String]?

    init(mediaIds: [String]? = nil, mentions: [PostMentionInput]? = nil,
         mediaAlt: [String: String]? = nil, mediaCaption: [String: String]? = nil) {
        self.mediaIds = mediaIds
        self.mentions = mentions
        self.mediaAlt = mediaAlt
        self.mediaCaption = mediaCaption
    }

    /// Le corps que le ViewModel a composé, complété de ce que la scène ajoute.
    func completing(_ corps: PostEditDraft) -> PostEditDraft {
        PostEditDraft(content: corps.content, visibility: corps.visibility, visibilityUserIds: corps.visibilityUserIds,
                      moodEmoji: corps.moodEmoji, originalLanguage: corps.originalLanguage, type: corps.type,
                      removeMediaIds: corps.removeMediaIds, storyEffects: corps.storyEffects,
                      mediaIds: mediaIds ?? corps.mediaIds, location: corps.location,
                      mentions: mentions ?? corps.mentions, allowSoundExtraction: corps.allowSoundExtraction,
                      mediaAlt: mediaAlt ?? corps.mediaAlt, mediaCaption: mediaCaption ?? corps.mediaCaption)
    }
}

/// **Les médias qu'une modification doit encore TÉLÉVERSER** (#15630).
///
/// Le brouillon du compositeur les tient par URL locale ; la création les
/// réaligne par INDEX (`PublishIntent.document`), et c'est cet index que
/// `PublicationMediaUploader` rend avec chaque id serveur. La modification
/// reprend la même forme pour rejoindre la même chaîne — téléversement,
/// adoption du canevas, textes par média — au lieu d'en écrire une seconde.
nonisolated struct PostEditPendingMedia: Equatable {
    let urls: [URL]
    let mimeTypes: [String]
    let objectIds: [String?]
    let alts: [String?]
    let captions: [String?]

    init?(draft: ComposerDocumentDraft) {
        guard !draft.localMedia.isEmpty else { return nil }
        urls = draft.localMedia.map(\.url)
        mimeTypes = draft.localMedia.map(\.mimeType)
        objectIds = draft.localMedia.map { draft.mediaObjectIds[$0.url] }
        alts = draft.localMedia.map { draft.mediaAlts[$0.url] }
        captions = draft.localMedia.map { draft.mediaCaptions[$0.url] }
    }
}

/// **Téléverser, puis rattacher** — ce que `updateStoryInBackground` fait pour
/// une story, sur la voie DOCUMENT d'un post ou d'un réel.
///
/// Les ids montés partent dans `mediaIds` ; le canevas ADOPTE ces ids et leurs
/// URL avant d'être assaini (même ordre qu'à la création : assainir d'abord
/// effacerait les URL que l'adoption remplace) ; les textes alternatifs et les
/// légendes passent aux clés serveur. Un seul échec de montée fait échouer
/// l'ensemble : une modification partielle rattacherait une scène qui désigne
/// un fichier absent.
enum PostEditMediaUpload {

    /// Le téléverseur de la création (`OutboxDispatcher.dispatchCreatePost`) :
    /// TUS, au nom de l'auteur, POUR un post — sans `uploadContext`, le gateway
    /// créerait un `MessageAttachment` que le post ne rattacherait jamais.
    @MainActor
    static func tusSend() -> PublicationMediaUploader.Send? {
        guard let base = URL(string: MeeshyConfig.shared.serverOrigin), let jeton = APIClient.shared.authToken else {
            return nil
        }
        let televerseur = TusUploadManager(baseURL: base)
        return { fichier, mime in
            try await televerseur.uploadFile(fileURL: fichier, mimeType: mime, credential: .bearer(jeton),
                                             uploadContext: "post")
        }
    }

    static func resolve(_ edit: EditPostDraft, pending: PostEditPendingMedia,
                        send: @escaping PublicationMediaUploader.Send) async throws -> EditPostDraft {
        let mimes = pending.mimeTypes
        let montes = try await PublicationMediaUploader.uploadAll(
            storedPaths: pending.urls.map(\.path),
            alreadyUploaded: [],
            declaredMimeType: { mimes.indices.contains($0) ? mimes[$0] : nil },
            hooks: PublicationMediaUploader.Hooks(throwIfCancelled: {}, recordUploaded: { _ in }),
            send: send
        )
        return attaching(montes, pending: pending, to: edit)
    }

    static func attaching(_ montes: PublicationMediaUploads, pending: PostEditPendingMedia,
                          to edit: EditPostDraft) -> EditPostDraft {
        let ids = Dictionary(uniqueKeysWithValues: zip(montes.sourceIndexes, montes.ids))
        let urls = Dictionary(uniqueKeysWithValues: zip(montes.sourceIndexes, montes.urls))
        let alts = serverKeyedTexts(pending.alts, idsBySourceIndex: ids)
        let legendes = serverKeyedTexts(pending.captions, idsBySourceIndex: ids)
        var rattache = edit
        rattache.additions.mediaIds = montes.ids
        rattache.storyEffects = CanvasMediaAdoption.adopting(edit.storyEffects, objectIdsBySourceIndex: pending.objectIds,
                                                             idsBySourceIndex: ids, urlsBySourceIndex: urls)?
            .sanitizedForServerPublish()
        rattache.additions.mediaAlt = alts.isEmpty ? nil : alts
        rattache.additions.mediaCaption = legendes.isEmpty ? nil : legendes
        rattache.known.formUnion([.mediaIds, .mediaAlt, .mediaCaption])
        return rattache
    }
}
