import Foundation
import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

extension FeedViewModel {
    func likePost(_ postId: String) async {
        guard !PendingPublicationMarker.isPending(postId: postId), let index = posts.firstIndex(where: { $0.id == postId }) else { return }

        // Snapshot pre-mutation state so both the synchronous enqueue-refusal
        // path and the async `.exhausted` observer roll back to the exact prior
        // state (the feed may mutate across the enqueue await).
        let wasLiked = posts[index].isLiked
        let priorLikes = posts[index].likes

        // Optimistic update — batch mutations to trigger a single objectWillChange
        var post = posts[index]
        post.isLiked.toggle()
        post.likes += post.isLiked ? 1 : -1
        posts[index] = post

        // T10b — route the like through the durable outbox (survives offline +
        // app kill, flushes on reconnect via T10) instead of a direct REST call
        // that was lost when offline. Mirrors PostDetailViewModel.likePost and
        // this VM's own toggleLikeComment; the dispatcher sends POST/DELETE
        // /posts/:id/like per `liked`.
        let liked = post.isLiked
        let cmid = ClientMutationId.generate()
        let payload = ToggleLikePostPayload(
            clientMutationId: cmid,
            postId: postId,
            liked: liked
        )
        // stores-09, #18939 — every copy of the post (detail key, bookmarks,
        // reels, its GRDB row), not just "main-feed" via debouncedCacheSave, and
        // in the order of the gestures: the write takes its rank HERE, before
        // any await, so a quick like then unlike can never land reversed.
        engagementWrites.like(postId: postId, isLiked: liked, likes: post.likes, persistence: feedPersistence)
        do {
            try await offlineQueue.enqueue(.toggleLikePost, payload: payload, conversationId: nil)
            debouncedCacheSave()
            // R7 — roll back the optimistic like if the outbox exhausts its
            // retry budget (server permanently rejects). Without this the toggle
            // stays stuck "liked" forever even though the server never accepted it.
            observeOutcome(cmid: cmid, rollback: { [weak self] in
                self?.restoreLike(postId: postId, isLiked: wasLiked, likes: priorLikes)
            }, toast: String(localized: "feed.like.error", defaultValue: "Impossible d'aimer la publication", bundle: .main))
        } catch {
            // Roll back optimistic state if the outbox refuses the row.
            restoreLike(postId: postId, isLiked: wasLiked, likes: priorLikes)
        }
        await engagementWrites.settled()
    }

    /// Pose en tête le post que l'on vient de publier — ou le REMPLACE si l'écho `post:created` l'a déjà
    /// inséré pendant l'attente de la réponse : deux cartes du même id se partageaient sinon l'état d'une seule.
    func insertPublished(_ feedPost: FeedPost) {
        if let existing = posts.firstIndex(where: { $0.id == feedPost.id }) {
            posts[existing] = feedPost
        } else {
            posts.insert(feedPost, at: 0)
        }
    }

    /// Restores a post's like state to a captured snapshot, re-resolving the
    /// index since the feed may have mutated during an `await`. Shared by the
    /// synchronous enqueue-refusal path and the async `.exhausted` observer.
    private func restoreLike(postId: String, isLiked: Bool, likes: Int) {
        guard let i = posts.firstIndex(where: { $0.id == postId }) else { return }
        var revert = posts[i]
        revert.isLiked = isLiked
        revert.likes = likes
        posts[i] = revert
        engagementWrites.like(postId: postId, isLiked: isLiked, likes: likes, persistence: feedPersistence)
        debouncedCacheSave()
    }

    /// Subscribes to the injected queue's `outcomeStream(for: cmid)` and runs
    /// `rollback` if the OutboxFlusher escalates the row to `.exhausted` (retry
    /// budget spent — the server permanently rejected it). `.applied` is a no-op
    /// (the optimistic state is already final).
    /// ⚠️ Le corps du Task ne capture PAS `self` : hors-ligne le stream peut ne
    /// jamais émettre, et un `guard let self` fort aurait retenu un VM fermé
    /// indéfiniment (un Task fantôme par like/post). Même forme que
    /// `PostDetailViewModel.observeOutcome`.
    func observeOutcome(
        cmid: String,
        rollback: @escaping @MainActor () -> Void,
        toast: String
    ) {
        OutboxOutcomeObserver.observe(queue: offlineQueue, cmid: cmid, rollback: rollback, toast: toast)
    }
}
