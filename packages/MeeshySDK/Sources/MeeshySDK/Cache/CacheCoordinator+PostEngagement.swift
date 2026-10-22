import Foundation
import Combine

extension CacheCoordinator {
    // MARK: - Post engagement write-through

    /// Un post est indexé sous PLUSIEURS clés du store `feed` (`main-feed`, la
    /// clé du pager de réels, `<postId>` pour l'écran de détail, `bookmarks`).
    /// Chaque ViewModel ne tenait à jour que sa propre collection en mémoire :
    /// le compteur de likes divergeait donc d'un écran à l'autre, et l'écran de
    /// détail — qui ne s'abonne pas aux likes — ne voyait jamais rien.
    ///
    /// `post:liked` / `post:unliked` portent un `likeCount` ABSOLU, calculé par
    /// le gateway depuis la table `PostReaction`. Le cache est donc la
    /// projection du serveur, jamais une somme de deltas locaux : deux surfaces
    /// ne peuvent plus dériver l'une de l'autre.
    func subscribeToPostEngagement() {
        socialSocket.postLiked
            .sink { [weak self] data in
                guard let self else { return }
                Task {
                    await self.applyPostLike(
                        postId: data.postId, likeCount: data.likeCount,
                        actorId: data.userId, liked: true
                    )
                }
            }
            .store(in: &cancellables)

        socialSocket.postUnliked
            .sink { [weak self] data in
                guard let self else { return }
                Task {
                    await self.applyPostLike(
                        postId: data.postId, likeCount: data.likeCount,
                        actorId: data.userId, liked: false
                    )
                }
            }
            .store(in: &cancellables)

        socialSocket.commentAdded
            .sink { [weak self] data in
                guard let self else { return }
                Task {
                    await self.feed.patchEverywhere(itemId: data.postId) {
                        $0.commentCount = data.commentCount
                    }
                }
            }
            .store(in: &cancellables)

        socialSocket.commentDeleted
            .sink { [weak self] data in
                guard let self else { return }
                Task {
                    await self.feed.patchEverywhere(itemId: data.postId) {
                        $0.commentCount = data.commentCount
                    }
                }
            }
            .store(in: &cancellables)

        // `post:bookmarked` n'est émis QUE vers le bookmarker (événement
        // personnel côté gateway) : pas de filtre d'acteur nécessaire.
        socialSocket.postBookmarked
            .sink { [weak self] data in
                guard let self else { return }
                Task {
                    await self.feed.patchEverywhere(itemId: data.postId) {
                        $0.isBookmarkedByMe = data.bookmarked
                        if let count = data.bookmarkCount { $0.bookmarkCount = count }
                    }
                }
            }
            .store(in: &cancellables)

        socialSocket.postDeleted
            .sink { [weak self] postId in
                guard let self else { return }
                Task { await self.feed.removeEverywhere(itemId: postId) }
            }
            .store(in: &cancellables)
    }

    /// `isLiked` n'est réécrit que si l'acteur EST l'utilisateur courant : le
    /// like d'un tiers monte le compteur sans allumer le cœur.
    private func applyPostLike(postId: String, likeCount: Int, actorId: String, liked: Bool) async {
        let isCurrentUser = !currentUserId.isEmpty && actorId == currentUserId
        await feed.patchEverywhere(itemId: postId) { post in
            post.likes = likeCount
            if isCurrentUser { post.isLiked = liked }
        }
    }
}
