import Foundation
import MeeshySDK

// MARK: - Comment Like (optimistic, socket-reaction driven)

/// Le cœur d'un commentaire (réconciliation par agrégat absolu + bascule
/// optimiste avec rollback), hors de `PostDetailViewModel.swift`.
extension PostDetailViewModel {

    /// Réconciliation par l'agrégat ABSOLU d'un événement cœur de commentaire :
    /// pose `likes = count` sur la ligne (top-level ou réponse), purge le delta
    /// optimiste, et dérive « mon cœur » de `reactorUserIds` (la liste des
    /// User.id ayant réagi — PAS `hasCurrentUser`, qui est calculé côté gateway
    /// relativement à l'ACTEUR de l'événement, donc faux pour les destinataires
    /// d'un broadcast). L'affichage `likes + delta` converge vers la vérité
    /// serveur sans jamais compter double.
    func applyCommentReactionAggregate(commentId: String, count: Int, reactorUserIds: [String], actorUserId: String) {
        let resolvedCount = commentHearts.reconcile(commentId: commentId, count: count, reactorUserIds: reactorUserIds,
                                                    actorUserId: actorUserId, myUserId: AuthManager.shared.currentUser?.id)
        if let idx = comments.firstIndex(where: { $0.id == commentId }) {
            comments[idx].likes = resolvedCount
            return
        }
        for (key, var replies) in repliesMap {
            if let idx = replies.firstIndex(where: { $0.id == commentId }) {
                replies[idx].likes = resolvedCount
                repliesMap[key] = replies
                return
            }
        }
    }

    /// Like/unlike d'un commentaire — optimistic + réaction socket cœur + rollback.
    /// Miroir exact de `CommentsSheetView.toggleCommentLike` pour que le like de
    /// commentaire dans le détail de post se comporte comme dans la sheet.
    func toggleCommentLike(_ commentId: String, postId: String) async {
        guard let wasLiked = commentHearts.begin(commentId) else { return }

        do {
            try await withTaskTimeout(seconds: TaskTimeoutDefaults.socialReaction) {
                if wasLiked {
                    _ = try await SocialSocketManager.shared.removeCommentReaction(
                        commentId: commentId, postId: postId, emoji: StoryViewerView.heartEmoji
                    )
                } else {
                    _ = try await SocialSocketManager.shared.addCommentReaction(
                        commentId: commentId, postId: postId, emoji: StoryViewerView.heartEmoji
                    )
                }
            }
        } catch {
            // Fallback REST quand le socket échoue (le endpoint écrit la même table
            // CommentReaction, idempotent + likeCount synchronisé). Mutuellement exclusif
            // avec le socket → pas de double-écriture. Rollback uniquement si REST échoue aussi.
            let restOK: Bool
            do {
                if wasLiked {
                    try await postService.unlikeComment(postId: postId, commentId: commentId)
                } else {
                    try await postService.likeComment(postId: postId, commentId: commentId)
                }
                restOK = true
            } catch {
                restOK = false
            }
            commentHearts.settle(commentId, wasLiked: wasLiked, delivered: restOK)
            return
        }
        commentHearts.settle(commentId, wasLiked: wasLiked, delivered: true)
    }
}
