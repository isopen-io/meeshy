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

    /// The post's comment thread — the same rules as the story's and the
    /// sheet's (`FeedCommentThread`, #13133).
    var commentThread: FeedCommentThread {
        get { FeedCommentThread(roots: comments, replies: repliesMap) }
        set {
            comments = newValue.roots
            repliesMap = newValue.replies
        }
    }

    /// PATCH du commentaire : remplacement optimiste EN PLACE (jamais
    /// d'insertion — même id), rollback complet si le serveur refuse.
    /// L'écho `comment:updated` reconfirme ensuite la ligne (idempotent).
    /// `originalLanguage` est la langue de la pastille du composer, DÉCLARÉE au
    /// serveur : sans elle, la passerelle la remet à null et la redétecte (#6600).
    /// Un refus `COMMENTS_DISABLED` (#16930) ferme la page au lieu d'une erreur.
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
            await bestEffort("postDetailViewModelCommentEdit.comments.savePreservingFreshness", category: .cache) { try await CacheCoordinator.shared.comments.savePreservingFreshness(comments, for: "post-\(post.id)") }
            if let parentId = edited.parentId, let replies = repliesMap[parentId] {
                await bestEffort("postDetailViewModelCommentEdit.comments.savePreservingFreshness.2", category: .cache) { try await CacheCoordinator.shared.comments.savePreservingFreshness(replies, for: "replies-\(parentId)") }
            }
        } catch {
            comments = snapshotComments
            repliesMap = snapshotReplies
            // #16930 — le fil a été fermé entre-temps : la page se ferme tout de
            // suite, comme après un envoi refusé, sans attendre `post:updated`.
            let closed = CommentsClosure.isRefusal(error)
            if closed { commentsRefusedLocally = true }
            FeedbackToastManager.shared.showError(closed ? CommentsClosedNotice.text :
                String(localized: "feed.comments.edit_error", defaultValue: "Erreur lors de la modification du commentaire", bundle: .main))
        }
    }

    /// Remplace la ligne éditée EN PLACE (racine ou réponse) — idempotent,
    /// partagé par l'optimiste local et l'écho socket `comment:updated`.
    func applyCommentUpdated(_ edited: FeedComment) {
        commentThread = commentThread.replacing(edited)
    }
}
