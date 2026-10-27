import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le chargement des commentaires de la feuille du fil, hors du god object.**
///
/// Le fil racine et les fils de réponses passent par le view model partagé
/// (`CommentThreadViewModel`, #13133) ; la feuille ne fait qu'y semer ses cœurs.
extension CommentsSheetView {

    /// The feed embeds only the top 3 comments of a post (gateway
    /// `postIncludes.ts` `take: 3`): when the server-known total says more
    /// exist, the full first page loads cache-first through the shared thread
    /// (merged over an optimistic send or a socket echo that landed first).
    func loadFullCommentsIfNeeded() async {
        guard post.commentCount > post.comments.count else { return }
        await seedingThread().loadRoots(serverTotal: post.commentCount)
    }

    // MARK: - Thread Management

    func toggleThread(_ commentId: String) async {
        await seedingThread().toggleThread(commentId)
    }

    private func loadReplies(commentId: String) async {
        await seedingThread().loadReplies(commentId: commentId)
    }

    func loadMoreReplies(commentId: String) async {
        await seedingThread().loadMoreReplies(commentId: commentId)
    }

    /// Chasse paginée bornée d'une RÉPONSE notifiée hors de la première page
    /// de son fil.
    func loadRepliesUntilPresent(_ replyId: String, in commentId: String) async -> Bool {
        await seedingThread().loadRepliesUntilPresent(replyId, in: commentId)
    }

    /// Le fil, avec le semis des cœurs des lignes qui arrivent.
    func seedingThread() -> CommentThreadViewModel {
        thread.onRepliesLoaded = likedIdsSeeder
        thread.onRootsLoaded = likedIdsSeeder
        return thread
    }
}
