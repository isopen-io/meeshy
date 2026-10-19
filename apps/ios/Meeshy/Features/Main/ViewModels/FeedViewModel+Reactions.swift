import Foundation
import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

extension FeedViewModel {
    func likePost(_ postId: String) async {
        guard let index = posts.firstIndex(where: { $0.id == postId }) else { return }

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
        let liked = posts[index].isLiked
        let cmid = ClientMutationId.generate()
        let payload = ToggleLikePostPayload(
            clientMutationId: cmid,
            postId: postId,
            liked: liked
        )
        do {
            try await offlineQueue.enqueue(.toggleLikePost, payload: payload, conversationId: nil)
            debouncedCacheSave()

            // stores-09 — patch every cache key holding this post (detail key,
            // bookmarks…), not just "main-feed" via debouncedCacheSave.
            // `post`, pas `posts[index]` : le fil a pu changer pendant l'attente, et l'indice désigner un
            // autre post — ou plus aucun.
            let newLikes = post.likes
            Task.detached(priority: .utility) { [feedCache = self.feedCache] in
                await feedCache.patchEverywhere(itemId: postId) {
                    $0.isLiked = liked
                    $0.likes = newLikes
                }
            }

            // Sync optimistic like state to GRDB so the feed cache matches.
            if let persistence = feedPersistence {
                let count = newLikes
                Task.detached(priority: .utility) {
                    try? await persistence.updateLikeCount(postId: postId, count: count, isLikedByMe: liked)
                }
            }

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
        Task.detached(priority: .utility) { [feedCache = self.feedCache] in
            await feedCache.patchEverywhere(itemId: postId) {
                $0.isLiked = isLiked
                $0.likes = likes
            }
        }
        debouncedCacheSave()
    }

    /// Subscribes to the injected queue's `outcomeStream(for: cmid)` and runs
    /// `rollback` if the OutboxFlusher escalates the row to `.exhausted` (retry
    /// budget spent — the server permanently rejected it). `.applied` is a no-op
    /// (the optimistic state is already final).
    /// ⚠️ Le corps du Task ne capture PAS `self` : hors-ligne le stream peut ne
    /// jamais émettre, et un `guard let self` fort aurait retenu un VM fermé
    /// indéfiniment (un Task fantôme par like/post). Même forme que
    /// `UserProfileViewModel.observeOutcome`.
    func observeOutcome(
        cmid: String,
        rollback: @escaping @MainActor () -> Void,
        toast: String
    ) {
        let queue = offlineQueue
        Task { @MainActor in
            let stream = await queue.outcomeStream(for: cmid)
            for await event in stream {
                if case .exhausted = event {
                    rollback()
                    FeedbackToastManager.shared.showError(DailyGestureLimitNotice.exhaustedText(clientMutationId: cmid) ?? toast)
                }
            }
        }
    }

    func bookmarkPost(_ postId: String) async {
        guard let post = posts.first(where: { $0.id == postId }) else { return }

        // Optimistic: insert into the local "bookmarks" cache so opening the
        // Favoris tab shows the post immediately. Mirror BookmarksViewModel's
        // snapshot/rollback pattern on failure.
        //
        // SWR: an in-cache list (fresh or stale) is the rollback target; an
        // expired/empty cache means there is nothing to roll back to and we
        // simply seed the bookmarks list with this post. The bookmarks list
        // itself is revalidated by `BookmarksViewModel` when the user opens
        // the Favoris tab, so we do NOT trigger a remote refresh here.
        let bookmarksKey = "bookmarks"
        let result = await feedCache.load(for: bookmarksKey)
        let cachedBookmarks: [FeedPost]
        switch result {
        case .fresh(let v, _), .stale(let v, _):
            cachedBookmarks = v
        case .expired, .empty:
            cachedBookmarks = []
        }
        let snapshot = cachedBookmarks
        if !cachedBookmarks.contains(where: { $0.id == postId }) {
            var updated = cachedBookmarks
            updated.insert(post, at: 0)
            try? await feedCache.savePreservingFreshness(updated, for: bookmarksKey)
        }
        FeedbackToastManager.shared.showSuccess(String(localized: "feed.bookmark.success", defaultValue: "Ajouté aux favoris", bundle: .main))

        do {
            let _: APIResponse<[String: Bool]> = try await api.request(
                PostsEndpoint.byPostIdBookmark(postId: postId),
                method: "POST"
            )
        } catch {
            // Rollback the optimistic cache insertion.
            try? await feedCache.savePreservingFreshness(snapshot, for: bookmarksKey)
            FeedbackToastManager.shared.showError(String(localized: "feed.bookmark.error", defaultValue: "Impossible d'enregistrer le favori", bundle: .main))
        }
    }
}
