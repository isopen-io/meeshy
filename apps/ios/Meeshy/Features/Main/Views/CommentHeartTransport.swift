import Foundation
import MeeshySDK

/// Le transport du cœur d'un commentaire : réaction socket ❤️ (source unique),
/// repli REST quand le socket échoue. Ne touche à aucun état de la feuille :
/// elle applique l'optimiste avant l'appel et annule si rien n'a été livré.
enum CommentHeartTransport {

    /// `true` quand le cœur est persisté (socket, ou repli REST) ; `false`
    /// quand les deux chemins ont échoué — l'appelant annule alors son optimiste.
    static func deliver(wasLiked: Bool, commentId: String, postId: String) async -> Bool {
        do {
            // A6 — hard timeout: protects against a hung SocialSocketManager
            // leaving the heart button locked forever (commentId stuck in
            // heartInFlightIds because defer only fires on Task completion).
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
            return true
        } catch {
            // Fallback REST quand le socket échoue (timeout / déconnexion). Le endpoint
            // REST écrit la MÊME table `CommentReaction` (idempotent, likeCount synchronisé)
            // → le like persiste. Mutuellement exclusif avec le socket (déclenché SEULEMENT
            // dans ce catch) : ce n'est PAS la double-écriture retirée. Miroir de
            // `FeedView.togglePostHeart` (post). Rollback uniquement si le REST échoue aussi.
            do {
                if wasLiked {
                    try await PostService.shared.unlikeComment(postId: postId, commentId: commentId)
                } else {
                    try await PostService.shared.likeComment(postId: postId, commentId: commentId)
                }
                return true
            } catch {
                return false
            }
        }
    }
}
