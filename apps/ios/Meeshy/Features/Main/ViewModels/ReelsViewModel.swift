import Foundation
import MeeshySDK
import MeeshyUI

// MARK: - Feed Cache Seam

/// Reads the persisted feed so the reel pager can cold-start instantly and stay
/// populated offline. App-side (not SDK): it reaches into the named Meeshy
/// `CacheCoordinator.feed` store and encodes the product rule "open reels from
/// whatever feed page is cached". `.fresh`/`.stale` yield their snapshot;
/// `.expired`/`.empty` yield an empty list.
protocol ReelFeedCacheReading: Sendable {
    func cachedFeed(forKey key: String) async -> [FeedPost]
}

struct CacheCoordinatorReelFeedCache: ReelFeedCacheReading {
    func cachedFeed(forKey key: String) async -> [FeedPost] {
        switch await CacheCoordinator.shared.feed.load(for: key) {
        case .fresh(let posts, _), .stale(let posts, _):
            return posts
        case .expired, .empty:
            return []
        }
    }
}

/// Drives the immersive reel pager: holds the ordered list of reel posts,
/// the cursor for chronological pagination, the currently-visible reel, and the
/// optimistic like / bookmark state.
///
/// Reels are derived from the same `/posts/feed` contract as the feed (no
/// dedicated endpoint): the view model pages through the feed and keeps only
/// the posts `FeedPost.isReel` classifies as reels. When the server later sorts
/// the feed by attention/watch-time, the reel pager benefits automatically — the
/// pagination contract is unchanged.
@MainActor
final class ReelsViewModel: ObservableObject {
    @Published private(set) var reels: [FeedPost] = []
    @Published var currentId: String?
    @Published private(set) var isLoadingMore = false
    @Published private(set) var hasLoadedOnce = false

    @Published private(set) var likedIds: Set<String> = []
    @Published private(set) var bookmarkedIds: Set<String> = []

    private var likeDelta: [String: Int] = [:]
    /// Optimistic comment-count bump per post id (applied on top of the server
    /// count) so the reel's comment counter rises the instant a comment is sent.
    @Published private var commentDelta: [String: Int] = [:]
    private var heartInFlight: Set<String> = []
    private var bookmarkInFlight: Set<String> = []

    private var nextCursor: String?
    private var hasMore = true
    private var isFetching = false
    private var coldStartTask: Task<Void, Never>?
    private let service: PostServiceProviding
    private let cache: ReelFeedCacheReading

    /// Same key `FeedViewModel` writes the main feed under — the reel pager
    /// reuses that cache so a cold-start launch shares the feed's offline data.
    private static let feedCacheKey = "main-feed"

    init(
        service: PostServiceProviding = PostService.shared,
        cache: ReelFeedCacheReading = CacheCoordinatorReelFeedCache()
    ) {
        self.service = service
        self.cache = cache
    }

    var currentIndex: Int? {
        guard let currentId else { return nil }
        return reels.firstIndex { $0.id == currentId }
    }

    var currentReel: FeedPost? {
        guard let currentIndex else { return reels.first }
        return reels[currentIndex]
    }

    // MARK: - Loading

    /// Seeds the pager from posts already loaded in the feed so it opens
    /// instantly (cache-first), then cold-starts only when the seed is empty
    /// (long-press launch with no feed context).
    func seed(posts: [FeedPost], startId: String?) {
        let seeded = FeedPost.reels(from: posts)
        if !seeded.isEmpty {
            apply(reels: seeded, startId: startId)
        }
        if reels.isEmpty {
            coldStartTask = Task { [weak self] in await self?.coldStart(startId: startId) }
        }
    }

    /// Awaits the in-flight cold-start (cache seed + network revalidation). Used
    /// by tests to observe the terminal state deterministically; a no-op when no
    /// cold-start was launched (the pager was seeded from feed context).
    func awaitColdStart() async {
        await coldStartTask?.value
    }

    /// Cold-start launch (long-press feed button with no on-screen feed context).
    /// Hydrates cache-first from the persisted feed so the pager opens instantly
    /// and works offline, then revalidates from the network. A network failure
    /// leaves the cached reels in place instead of dropping to an empty screen.
    private func coldStart(startId: String?) async {
        let cached = FeedPost.reels(from: await cache.cachedFeed(forKey: Self.feedCacheKey))
        if !cached.isEmpty, reels.isEmpty {
            apply(reels: cached, startId: startId)
        }
        await fetch(reset: true)
    }

    private func apply(reels newReels: [FeedPost], startId: String?) {
        reels = newReels
        absorbServerFlags(newReels)
        currentId = startId.flatMap { id in newReels.contains { $0.id == id } ? id : nil } ?? newReels.first?.id
        hasLoadedOnce = true
    }

    func loadMoreIfNeeded(currentReel: FeedPost) async {
        guard let index = reels.firstIndex(where: { $0.id == currentReel.id }) else { return }
        if index >= reels.count - 3 {
            await fetch(reset: false)
        }
    }

    private func fetch(reset: Bool) async {
        guard !isFetching, reset || hasMore else { return }
        isFetching = true
        if !reset { isLoadingMore = true }
        defer {
            isFetching = false
            isLoadingMore = false
            hasLoadedOnce = true
        }
        do {
            let preferred = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
            let response = try await service.getFeed(cursor: reset ? nil : nextCursor, limit: 20)
            let mapped = response.data.map { $0.toFeedPost(preferredLanguages: preferred) }
            let newReels = FeedPost.reels(from: mapped)
            if reset {
                reels = newReels
            } else {
                let existing = Set(reels.map(\.id))
                reels.append(contentsOf: newReels.filter { !existing.contains($0.id) })
            }
            absorbServerFlags(newReels)
            nextCursor = response.pagination?.nextCursor
            hasMore = response.pagination?.hasMore ?? (nextCursor != nil)
            // A reset replaces the list, so a `currentId` seeded from the cache
            // may now point at a reel the fresh feed dropped — fall back to the
            // first reel in that case (and on first load when it was nil).
            if currentId == nil || !reels.contains(where: { $0.id == currentId }) {
                currentId = reels.first?.id
            }
        } catch {
            hasMore = false
        }
    }

    private func absorbServerFlags(_ posts: [FeedPost]) {
        for post in posts {
            if post.isLiked { likedIds.insert(post.id) }
            if post.isBookmarkedByMe { bookmarkedIds.insert(post.id) }
        }
    }

    // MARK: - Derived display state

    func isLiked(_ id: String) -> Bool { likedIds.contains(id) }
    func isBookmarked(_ id: String) -> Bool { bookmarkedIds.contains(id) }

    func likeCount(_ post: FeedPost) -> Int {
        max(0, post.likes + (likeDelta[post.id] ?? 0))
    }

    /// Comment count including the optimistic bump from a just-sent comment.
    func commentCount(_ post: FeedPost) -> Int {
        max(0, post.commentCount + (commentDelta[post.id] ?? 0))
    }

    /// Called when the comment sheet confirms a comment was sent for `postId` —
    /// bumps the reel's comment counter immediately (the rail reads `commentCount`).
    func didSendComment(postId: String) {
        commentDelta[postId, default: 0] += 1
        EngagementTracker.shared.recordAction(.commented, surface: .reels)
    }

    // MARK: - Interactions (optimistic)

    func toggleLike(_ post: FeedPost) {
        let id = post.id
        guard !heartInFlight.contains(id) else { return }
        heartInFlight.insert(id)
        let wasLiked = likedIds.contains(id)
        applyLike(id: id, liked: !wasLiked)
        if !wasLiked { EngagementTracker.shared.recordAction(.reacted, surface: .reels) }
        HapticFeedback.light()
        Task {
            do {
                if wasLiked { try await service.unlike(postId: id) }
                else { try await service.like(postId: id) }
            } catch {
                applyLike(id: id, liked: wasLiked)
            }
            heartInFlight.remove(id)
        }
    }

    private func applyLike(id: String, liked: Bool) {
        if liked {
            guard !likedIds.contains(id) else { return }
            likedIds.insert(id)
            likeDelta[id] = (likeDelta[id] ?? 0) + 1
        } else {
            guard likedIds.contains(id) else { return }
            likedIds.remove(id)
            likeDelta[id] = (likeDelta[id] ?? 0) - 1
        }
    }

    func toggleBookmark(_ post: FeedPost) {
        let id = post.id
        guard !bookmarkInFlight.contains(id) else { return }
        bookmarkInFlight.insert(id)
        let wasBookmarked = bookmarkedIds.contains(id)
        if wasBookmarked { bookmarkedIds.remove(id) } else { bookmarkedIds.insert(id) }
        if !wasBookmarked { EngagementTracker.shared.recordAction(.bookmarked, surface: .reels) }
        HapticFeedback.light()
        Task {
            do {
                if wasBookmarked { try await service.removeBookmark(postId: id) }
                else { try await service.bookmark(postId: id) }
            } catch {
                if wasBookmarked { bookmarkedIds.insert(id) } else { bookmarkedIds.remove(id) }
            }
            bookmarkInFlight.remove(id)
        }
    }

    func share(_ post: FeedPost) {
        EngagementTracker.shared.recordAction(.shared, surface: .reels)
        HapticFeedback.light()
        Task { try? await service.share(postId: post.id) }
    }

    func recordView(_ id: String) {
        Task { try? await service.viewPost(postId: id, duration: nil) }
    }
}
