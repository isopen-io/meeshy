import Foundation
import MeeshySDK

// MARK: - media:caption-translation-updated (#6280)
extension FeedViewModel {
    /// **Une traduction de LÉGENDE de média reçue par socket** (#6280).
    ///
    /// DISTINCTE de `postTranslationUpdated` (traduit `Post.content`) : ceci
    /// traduit `PostMedia.caption`, sur un média du post OU d'un de ses
    /// commentaires (`data.commentId` tranche). Toujours FUSIONNÉE dans la carte
    /// des traductions du média — la résolution par le Prisme se fait à
    /// l'AFFICHAGE (`FeedMedia.resolvedCaption`), jamais ici : contrairement à
    /// `translatedContent`, il n'y a pas de champ « déjà affiché » à protéger
    /// d'une réécriture.
    ///
    /// Hors de `FeedViewModel.swift`, dette héritée de taille : #6535 y avait
    /// posé ces lignes, ce que le cliquet `FileSizeBudgetGuardTests` interdit
    /// (#6560).
    func receiveMediaCaptionTranslation(_ data: SocketMediaCaptionTranslationUpdatedData) {
        guard let postIndex = posts.firstIndex(where: { $0.id == data.postId }) else { return }
        let mediaId = data.mediaId
        let commentId = data.commentId
        let language = data.language
        let text = data.translation.text
        var post = posts[postIndex]
        let changed = Self.applyMediaCaptionTranslation(
            text, mediaId: mediaId, commentId: commentId, language: language, to: &post
        )
        guard changed else { return }
        posts[postIndex] = post
        let postId = data.postId
        Task.detached(priority: .utility) { [feedCache] in
            await feedCache.patchEverywhere(itemId: postId) {
                _ = Self.applyMediaCaptionTranslation(
                    text, mediaId: mediaId, commentId: commentId, language: language, to: &$0
                )
            }
        }
        debouncedCacheSave()
    }

    /// Règle unique de pose d'une traduction de LÉGENDE de média (#6280) — le
    /// média peut appartenir directement au post ou à l'un de ses commentaires
    /// (`commentId` tranche). Retourne `false` quand le média visé n'existe pas
    /// dans cet exemplaire — le sink s'en sert pour ne pas réécrire le cache
    /// pour rien, même patron que `applyCommentTranslation`.
    nonisolated static func applyMediaCaptionTranslation(
        _ text: String,
        mediaId: String,
        commentId: String?,
        language: String,
        to post: inout FeedPost
    ) -> Bool {
        if let commentId, let commentIndex = post.comments.firstIndex(where: { $0.id == commentId }) {
            guard let mediaIndex = post.comments[commentIndex].media.firstIndex(where: { $0.id == mediaId })
            else { return false }
            var translations = post.comments[commentIndex].media[mediaIndex].captionTranslations ?? [:]
            translations[language] = text
            post.comments[commentIndex].media[mediaIndex].captionTranslations = translations
            return true
        }
        guard let mediaIndex = post.media.firstIndex(where: { $0.id == mediaId }) else { return false }
        var translations = post.media[mediaIndex].captionTranslations ?? [:]
        translations[language] = text
        post.media[mediaIndex].captionTranslations = translations
        return true
    }
}
