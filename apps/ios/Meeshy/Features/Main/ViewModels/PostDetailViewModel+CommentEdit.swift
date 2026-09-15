import Foundation
import MeeshySDK

// MARK: - Édition de commentaire (auteur)

/// **L'édition d'un commentaire par son auteur, hors de `PostDetailViewModel.swift`.**
///
/// L'hôte est hors budget (directive : 1000–1200 lignes) et la règle est
/// explicite — *ajouter à un fichier déjà hors budget est interdit, on extrait
/// d'abord*. Ce qui vit ici est une responsabilité entière : la mutation
/// optimiste et l'application de la ligne éditée, que l'écho socket
/// `comment:updated` partage.
extension PostDetailViewModel {

    /// PATCH du commentaire : remplacement optimiste EN PLACE (jamais
    /// d'insertion — même id), rollback complet si le serveur refuse.
    /// L'écho `comment:updated` reconfirme ensuite la ligne (idempotent).
    /// `originalLanguage` est la langue de la pastille du composer, DÉCLARÉE au
    /// serveur : sans elle, la passerelle la remet à null et la redétecte (#6600).
    func updateComment(_ target: FeedComment, content: String, effectFlags: Int, originalLanguage: String?) async {
        guard let post else { return }
        let edited = target.withEditedContent(content, effectFlags: effectFlags)
        let snapshotComments = comments
        let snapshotReplies = repliesMap
        applyCommentUpdated(edited)
        do {
            _ = try await postService.updateComment(
                postId: post.id, commentId: target.id, content: content, effectFlags: effectFlags,
                originalLanguage: originalLanguage
            )
            try? await CacheCoordinator.shared.comments.savePreservingFreshness(comments, for: "post-\(post.id)")
            if let parentId = edited.parentId, let replies = repliesMap[parentId] {
                try? await CacheCoordinator.shared.comments.savePreservingFreshness(replies, for: "replies-\(parentId)")
            }
        } catch {
            comments = snapshotComments
            repliesMap = snapshotReplies
            FeedbackToastManager.shared.showError(
                String(localized: "feed.comments.edit_error", defaultValue: "Erreur lors de la modification du commentaire", bundle: .main))
        }
    }

    /// Remplace la ligne éditée EN PLACE (racine ou réponse) — idempotent,
    /// partagé par l'optimiste local et l'écho socket `comment:updated`.
    func applyCommentUpdated(_ edited: FeedComment) {
        if let parentId = edited.parentId, var existing = repliesMap[parentId],
           let idx = existing.firstIndex(where: { $0.id == edited.id }) {
            existing[idx] = edited
            repliesMap[parentId] = existing
            return
        }
        if let idx = comments.firstIndex(where: { $0.id == edited.id }) {
            comments[idx] = edited
        }
    }
}
