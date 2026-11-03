import Foundation
import MeeshySDK

// MARK: - Publications encore dans la file (#10321)
extension FeedViewModel {

    /// **« Annuler l'envoi » sur une carte encore en file** (#10321) — la carte
    /// part tout de suite, l'action est celle de la pastille et du détail
    /// (`PendingPublicationCancel`). Si rien n'a pu être arrêté (déjà partie,
    /// base en échec), la carte revient à sa place ; le serveur fait foi.
    func withdrawPendingPublication(_ cmid: String) async {
        let removedIndex = posts.firstIndex(where: { $0.id == cmid })
        let removedPost = removedIndex.map { posts[$0] }
        removeOptimisticPost(id: cmid)
        guard !(await PendingPublicationCancel.run(cmid, queue: offlineQueue, feedCache: feedCache)),
              let removedPost, let removedIndex else { return }
        posts = OptimisticRollback.restoring(removedPost, at: removedIndex, into: posts)
    }

    /// Returns the last POST/REEL that got stuck offline (unsent for more than
    /// `offlineStuckThreshold`) so the feed composer can pre-fill it as a draft
    /// — only when that composer can restore it (`FeedDraftRecovery`).
    func recoverUnsentPost() async -> RecoveredOfflinePost? {
        let draft = await offlineQueue.recoverLastUnsentPost(
            matchingTypes: ["POST", "REEL"],
            olderThan: Self.offlineStuckThreshold
        )
        return draft.flatMap { FeedDraftRecovery.isProposable($0) ? $0 : nil }
    }

    /// Supersedes a recovered post/reel when the user re-sends it from the
    /// composer, so the resend replaces the stuck row (and reclaims its
    /// pending-media files) instead of duplicating it on reconnect.
    ///
    /// Also drops the orphaned optimistic feed post keyed by this cmid: an
    /// offline post/reel was inserted optimistically (id == cmid) when first
    /// queued, and its `.createPost` row is what we're now deleting — without
    /// this the optimistic card would linger in the feed forever (its row gone,
    /// so it can never reconcile). The resend inserts a fresh optimistic card
    /// under a new cmid.
    func supersedeRecoveredPost(clientMutationId: String) async {
        removeOptimisticPost(id: clientMutationId)
        await offlineQueue.cancelCreatePost(clientMutationId: clientMutationId)
    }

    /// Removes an optimistic post by id (re-resolving the index since the feed
    /// may mutate across an `await`). Rolls back a queued create the outbox
    /// refused or exhausted.
    /// Retire le commentaire optimiste `cmid` du post — et lui seul : les commentaires reçus pendant
    /// l'attente restent. Le compteur suit la ligne retirée.
    func withdrawOptimisticComment(_ cmid: String, fromPost postId: String) {
        guard let i = posts.firstIndex(where: { $0.id == postId }) else { return }
        let result = OptimisticRollback.withdrawing(cmid, from: posts[i].comments)
        posts[i].comments = result.items
        posts[i].commentCount = OptimisticRollback.decremented(posts[i].commentCount, removed: result.removed)
    }

    func removeOptimisticPost(id: String) {
        guard let i = posts.firstIndex(where: { $0.id == id }) else { return }
        posts.remove(at: i)
        debouncedCacheSave()
    }
}
