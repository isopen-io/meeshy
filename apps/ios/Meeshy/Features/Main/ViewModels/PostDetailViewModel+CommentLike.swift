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
        var resolvedCount = count
        if let myId = AuthManager.shared.currentUser?.id {
            if reactorUserIds.contains(myId) {
                commentLikedIds.insert(commentId)
            } else if actorUserId == myId {
                // L'événement décrit MA propre action : agrégat autoritatif.
                commentLikedIds.remove(commentId)
            } else if commentLikedIds.contains(commentId) {
                // Agrégat d'un TIERS pendant que MON like est encore en vol :
                // il ne me connaît pas — préserver le cœur, compter le mien
                // par-dessus (l'écho de mon propre like reconfirmera).
                resolvedCount = count + 1
            }
        }
        commentLikeDelta[commentId] = nil
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
        guard !commentHeartInFlightIds.contains(commentId) else { return }
        commentHeartInFlightIds.insert(commentId)
        defer { commentHeartInFlightIds.remove(commentId) }

        let wasLiked = commentLikedIds.contains(commentId)
        if wasLiked {
            commentLikedIds.remove(commentId)
            commentLikeDelta[commentId, default: 0] -= 1
        } else {
            commentLikedIds.insert(commentId)
            commentLikeDelta[commentId, default: 0] += 1
        }

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
            if !restOK {
                if wasLiked {
                    commentLikedIds.insert(commentId)
                    commentLikeDelta[commentId, default: 0] += 1
                } else {
                    commentLikedIds.remove(commentId)
                    commentLikeDelta[commentId, default: 0] -= 1
                }
            }
        }
    }
}
