import Foundation
import MeeshySDK

/// L'état d'ENGAGEMENT du fil (cœur, signet, repartage, partage), tenu par la
/// vue hôte en un seul `@State`.
///
/// `FeedPost` n'a pas d'`isBookmarked` / `isReposted` émis par le serveur pour
/// tous les chemins, et son `Equatable` est volontairement limité à l'id : le
/// parent suit donc LOCALEMENT ce que l'utilisateur vient de faire (bascule
/// optimiste, annulée sur échec) et ce que les sockets annoncent. Les règles
/// d'amorçage et de réconciliation vivent ici, purement, au lieu d'être
/// éparpillées dans les `.onReceive` de la vue.
struct FeedPostEngagementState {
    var likedIds: Set<String> = []
    var likeDelta: [String: Int] = [:]
    var heartInFlightIds: Set<String> = []

    var bookmarkedIds: Set<String> = []
    var bookmarkInFlightIds: Set<String> = []
    var bookmarkDelta: [String: Int] = [:]

    var repostedIds: Set<String> = []
    var repostInFlightIds: Set<String> = []
    var repostDelta: [String: Int] = [:]

    var shareInFlightIds: Set<String> = []
    var shareDelta: [String: Int] = [:]

    /// Seeds `likedIds` from a batch of posts using `post.isLiked` (which the SDK
    /// derives from `APIPost.currentUserReactions`/`isLikedByMe`).
    static func likedPostIds(in posts: [FeedPost]) -> Set<String> {
        Set(posts.compactMap { $0.isLiked ? $0.id : nil })
    }

    // MARK: - Compteurs et drapeaux servis à une carte

    func snapshot(for post: FeedPost) -> FeedPostEngagementSnapshot {
        FeedPostEngagementSnapshot(
            isLiked: likedIds.contains(post.id),
            displayLikeCount: max(0, post.likes + (likeDelta[post.id] ?? 0)),
            isHeartInFlight: heartInFlightIds.contains(post.id),
            isBookmarked: bookmarkedIds.contains(post.id),
            isBookmarkInFlight: bookmarkInFlightIds.contains(post.id),
            displayBookmarkCount: max(0, post.bookmarkCount + (bookmarkDelta[post.id] ?? 0)),
            isReposted: repostedIds.contains(post.id),
            isRepostInFlight: repostInFlightIds.contains(post.id),
            displayRepostCount: max(0, post.repostCount + (repostDelta[post.id] ?? 0)),
            isShareInFlight: shareInFlightIds.contains(post.id),
            displayShareCount: max(0, post.shareCount + (shareDelta[post.id] ?? 0))
        )
    }

    // MARK: - Amorçage

    /// Premier relevé du fil chargé. Preserves existing optimistic state: only
    /// seeds posts not yet tracked.
    mutating func seedFromLoadedPosts(_ posts: [FeedPost]) {
        let newLiked = Self.likedPostIds(in: posts)
        for id in newLiked where !likedIds.contains(id) && likeDelta[id] == nil {
            likedIds.insert(id)
        }
        // Seed bookmark/repost flags from the server-enriched fields
        // on each loaded post (PostFeedService now provides
        // isBookmarkedByMe + isRepostedByMe alongside isLikedByMe).
        // Preserves in-flight optimistic state.
        for post in posts {
            if post.isBookmarkedByMe && !bookmarkInFlightIds.contains(post.id) {
                bookmarkedIds.insert(post.id)
            }
            if post.isRepostedByMe && !repostInFlightIds.contains(post.id) {
                repostedIds.insert(post.id)
            }
        }
    }

    /// Hydrates `bookmarkedIds` from a bookmarks list. Preserves any optimistic
    /// state already in flight by only inserting new IDs.
    mutating func seedBookmarks(_ bookmarks: [FeedPost]) {
        for p in bookmarks where !bookmarkInFlightIds.contains(p.id) {
            bookmarkedIds.insert(p.id)
        }
    }

    /// Merge liked / bookmarked / reposted state when new pages arrive. Only
    /// seeds posts not yet tracked to avoid overwriting optimistic state from
    /// in-flight toggles.
    mutating func reconcile(with posts: [FeedPost]) {
        for post in posts where likeDelta[post.id] == nil && !heartInFlightIds.contains(post.id) {
            if post.isLiked {
                likedIds.insert(post.id)
            } else {
                likedIds.remove(post.id)
            }
        }
        for post in posts where bookmarkDelta[post.id] == nil && !bookmarkInFlightIds.contains(post.id) {
            if post.isBookmarkedByMe {
                bookmarkedIds.insert(post.id)
            }
        }
        for post in posts where repostDelta[post.id] == nil && !repostInFlightIds.contains(post.id) {
            if post.isRepostedByMe {
                repostedIds.insert(post.id)
            }
        }
    }

    // MARK: - Cœur

    mutating func rollbackHeart(postId: String, wasLiked: Bool) {
        if wasLiked {
            likedIds.insert(postId)
            likeDelta[postId, default: 0] += 1
        } else {
            likedIds.remove(postId)
            likeDelta[postId, default: 0] -= 1
        }
    }

    // MARK: - Réconciliation par socket

    mutating func applyReactionAdded(emoji: String, userId: String, postId: String, currentUserId: String?) {
        guard emoji == StoryViewerView.heartEmoji else { return }
        if userId == currentUserId {
            likedIds.insert(postId)
        } else {
            likeDelta[postId, default: 0] += 1
        }
    }

    mutating func applyReactionRemoved(emoji: String, userId: String, postId: String, currentUserId: String?) {
        guard emoji == StoryViewerView.heartEmoji else { return }
        if userId == currentUserId {
            likedIds.remove(postId)
        } else {
            likeDelta[postId, default: 0] -= 1
        }
    }

    /// Unification du like : le ❤️ arrive désormais comme `post:liked`/`post:unliked`
    /// (événement CANONIQUE absolu — le ViewModel pose `posts[i].likes = likeCount`).
    /// On réconcilie ici l'état OPTIMISTE local de la vue : le compteur absolu fait
    /// autorité → on purge le delta, et on confirme `isLiked` pour l'acteur.
    mutating func applyPostLiked(postId: String, userId: String, currentUserId: String?) {
        likeDelta[postId] = nil
        if userId == currentUserId {
            likedIds.insert(postId)
        }
    }

    mutating func applyPostUnliked(postId: String, userId: String, currentUserId: String?) {
        likeDelta[postId] = nil
        if userId == currentUserId {
            likedIds.remove(postId)
        }
    }

    /// Bookmark : même réconciliation canonique que le like. L'événement est
    /// PERSONNEL (emitToUser) → toujours pour l'utilisateur courant. Si le
    /// compteur est absent (vieux gateway), on garde le delta (dégradation
    /// gracieuse).
    mutating func applyPostBookmarked(postId: String, bookmarked: Bool, hasAbsoluteCount: Bool) {
        if hasAbsoluteCount {
            bookmarkDelta[postId] = nil
        }
        if bookmarked {
            bookmarkedIds.insert(postId)
        } else {
            bookmarkedIds.remove(postId)
        }
    }
}

/// Ce qu'UNE carte du fil lit de l'engagement : des valeurs, jamais l'état.
nonisolated struct FeedPostEngagementSnapshot: Equatable {
    let isLiked: Bool
    let displayLikeCount: Int
    let isHeartInFlight: Bool
    let isBookmarked: Bool
    let isBookmarkInFlight: Bool
    let displayBookmarkCount: Int
    let isReposted: Bool
    let isRepostInFlight: Bool
    let displayRepostCount: Int
    let isShareInFlight: Bool
    let displayShareCount: Int
}

/// Les requêtes (REST, cache) de l'engagement : aucune lecture d'état de vue.
enum FeedPostEngagementRequests {
    private static let bookmarksCacheKey = "bookmarks"

    /// Minimal decoder for the `liked` flag returned by both the like and
    /// unlike REST routes. Ignores `reactionSummary` (heterogeneous) and any
    /// other fields the gateway may add.
    private struct LikeRESTPayload: Decodable { let liked: Bool? }

    /// REST fallback for the heart toggle. Returns true on success so the
    /// caller can skip rolling back its optimistic update.
    static func postReactionViaREST(postId: String, like: Bool) async -> Bool {
        do {
            let _: APIResponse<LikeRESTPayload> = try await APIClient.shared.request(
                PostsEndpoint.byPostIdLike(postId: postId),
                method: like ? "POST" : "DELETE"
            )
            return true
        } catch { return false }
    }

    static func callBookmarkAPI(postId: String, bookmark: Bool) async -> Bool {
        do {
            let _: APIResponse<[String: Bool]> = try await APIClient.shared.request(
                PostsEndpoint.byPostIdBookmark(postId: postId),
                method: bookmark ? "POST" : "DELETE"
            )
            return true
        } catch {
            return false
        }
    }

    /// Cache-first, never hits the network. `nil` when the cache holds nothing
    /// usable (expired / empty).
    static func cachedBookmarks() async -> [FeedPost]? {
        let cached = await CacheCoordinator.shared.feed.load(for: bookmarksCacheKey)
        switch cached {
        case .fresh(let v, _), .stale(let v, _):
            return v
        case .expired, .empty:
            return nil
        }
    }

    /// Refreshes the shared "bookmarks" cache from the network. `nil` on
    /// offline / 5xx — bookmarks stay unseeded, no UX harm.
    static func refreshBookmarksCache() async -> [FeedPost]? {
        do {
            let resp = try await PostService.shared.getBookmarks(cursor: nil, limit: 50)
            let langs = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
            let posts = resp.data.map { $0.toFeedPost(preferredLanguages: langs) }
            try? await CacheCoordinator.shared.feed.save(posts, for: bookmarksCacheKey)
            return posts
        } catch { return nil }
    }

    /// Pre-populate the bookmarks cache optimistically so the Favoris tab shows
    /// the post the moment the user opens it. Returns the previous cache content
    /// (for rollback), or `nil` on the remove path.
    static func prepopulateBookmarkCache(
        postId: String, postSnapshot: FeedPost?, wasBookmarked: Bool
    ) async -> [FeedPost]? {
        if wasBookmarked { return nil } // remove path handles cache below
        guard let p = postSnapshot else { return [] }
        let key = bookmarksCacheKey
        let r = await CacheCoordinator.shared.feed.load(for: key)
        let current: [FeedPost]
        switch r {
        case .fresh(let v, _), .stale(let v, _): current = v
        case .expired, .empty: current = []
        }
        if !current.contains(where: { $0.id == postId }) {
            var updated = current
            updated.insert(p, at: 0)
            try? await CacheCoordinator.shared.feed.save(updated, for: key)
        }
        return current
    }

    static func restoreBookmarkCache(_ snapshot: [FeedPost]) async {
        try? await CacheCoordinator.shared.feed.save(snapshot, for: bookmarksCacheKey)
    }

    static func pruneBookmarkFromCache(postId: String) async {
        let key = bookmarksCacheKey
        let result = await CacheCoordinator.shared.feed.load(for: key)
        let current: [FeedPost]
        switch result {
        case .fresh(let v, _), .stale(let v, _): current = v
        case .expired, .empty: return
        }
        let updated = current.filter { $0.id != postId }
        try? await CacheCoordinator.shared.feed.save(updated, for: key)
    }
}
