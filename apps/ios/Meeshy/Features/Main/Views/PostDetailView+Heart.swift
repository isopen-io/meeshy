import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le cœur du détail d'un post** — bascule optimiste par le socket, repli
/// REST, et réception temps réel des réactions de la salle du post. Extrait
/// de `PostDetailView.swift` (#10956).
extension PostDetailView {

    // MARK: - Post Heart Toggle (socket-driven, post detail)

    @MainActor
    // `internal` : `sendDetailReaction` vit dans `PostDetailView+Reactions`
    // et retombe sur le cœur quand l'émoji choisi EST le cœur. Un `private`
    // de portée fichier le lui interdirait — même piège que `viewModel`,
    // documenté dans `apps/ios/CLAUDE.md`.
    func toggleDetailPostHeart() {
        Task {
            guard !postHeartInFlightIds.contains(postId) else { return }
            postHeartInFlightIds.insert(postId)
            defer {
                Task { @MainActor in
                    postHeartInFlightIds.remove(postId)
                }
            }
            let wasLiked = postLikedIds.contains(postId)
            // Optimistic update
            if wasLiked {
                postLikedIds.remove(postId)
                postLikeDelta[postId, default: 0] -= 1
            } else {
                postLikedIds.insert(postId)
                postLikeDelta[postId, default: 0] += 1
            }
            do {
                if wasLiked {
                    _ = try await SocialSocketManager.shared.removePostReaction(
                        postId: postId, emoji: StoryViewerView.heartEmoji
                    )
                } else {
                    _ = try await SocialSocketManager.shared.addPostReaction(
                        postId: postId, emoji: StoryViewerView.heartEmoji
                    )
                }
            } catch {
                // REST fallback when socket fails (noSocket / timeout). Only
                // rollback the optimistic flip when REST also fails — keeps
                // the heart visible whenever the server actually persisted.
                let restOK = await postLikeViaREST(like: !wasLiked)
                if !restOK {
                    if wasLiked {
                        postLikedIds.insert(postId)
                        postLikeDelta[postId, default: 0] += 1
                    } else {
                        postLikedIds.remove(postId)
                        postLikeDelta[postId, default: 0] -= 1
                    }
                }
            }
        }
    }

    private struct LikeRESTPayload: Decodable { let liked: Bool? }

    private func postLikeViaREST(like: Bool) async -> Bool {
        do {
            let _: APIResponse<LikeRESTPayload> = try await APIClient.shared.request(
                PostsEndpoint.byPostIdLike(postId: postId),
                method: like ? "POST" : "DELETE"
            )
            return true
        } catch { DailyGestureLimitNotice.surface(error); return false }
    }

    /// La réception temps réel du cœur : la salle du post diffuse les
    /// réactions et le compteur absolu des autres lecteurs.
    func heartLiveSync(_ content: some View) -> some View {
        content
            .adaptiveOnChange(of: viewModel.post) { _, updatedPost in
                // Re-seed when post loads from network (stale → fresh). Preserve
                // optimistic state: only update if no in-flight toggle is active.
                guard let updatedPost, !postHeartInFlightIds.contains(postId) else { return }
                if updatedPost.isLiked {
                    postLikedIds.insert(postId)
                } else {
                    postLikedIds.remove(postId)
                }
            }
            .onReceive(SocialSocketManager.shared.postReactionAdded.receive(on: DispatchQueue.main)) { event in
                let heart = StoryViewerView.heartEmoji
                guard event.emoji == heart, event.postId == postId else { return }
                let currentUserId = AuthManager.shared.currentUser?.id
                if event.userId == currentUserId {
                    postLikedIds.insert(postId)
                } else {
                    postLikeDelta[postId, default: 0] += 1
                }
            }
            .onReceive(SocialSocketManager.shared.postReactionRemoved.receive(on: DispatchQueue.main)) { event in
                let heart = StoryViewerView.heartEmoji
                guard event.emoji == heart, event.postId == postId else { return }
                let currentUserId = AuthManager.shared.currentUser?.id
                if event.userId == currentUserId {
                    postLikedIds.remove(postId)
                } else {
                    postLikeDelta[postId, default: 0] -= 1
                }
            }
            // Unification du like : le ❤️ arrive désormais comme `post:liked`/`post:unliked`
            // (compteur ABSOLU). On pose la base autoritative sur le post chargé, on purge le
            // delta optimiste et on confirme `isLiked` pour l'acteur — aligné avec le feed et
            // le reel viewer. Le détail rejoint déjà `ROOMS.post`, donc reçoit l'événement.
            .onReceive(SocialSocketManager.shared.postLiked.receive(on: DispatchQueue.main)) { event in
                guard event.postId == postId else { return }
                viewModel.post?.likes = event.likeCount
                postLikeDelta[postId] = nil
                if event.userId == AuthManager.shared.currentUser?.id {
                    postLikedIds.insert(postId)
                }
            }
            .onReceive(SocialSocketManager.shared.postUnliked.receive(on: DispatchQueue.main)) { event in
                guard event.postId == postId else { return }
                viewModel.post?.likes = event.likeCount
                postLikeDelta[postId] = nil
                if event.userId == AuthManager.shared.currentUser?.id {
                    postLikedIds.remove(postId)
                }
            }
    }
}
