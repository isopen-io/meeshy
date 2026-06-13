import Foundation
import MeeshySDK
import MeeshyUI

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
    private var heartInFlight: Set<String> = []
    private var bookmarkInFlight: Set<String> = []

    private var nextCursor: String?
    private var hasMore = true
    private var isFetching = false
    private let service: PostServiceProviding

    init(service: PostServiceProviding = PostService.shared) {
        self.service = service
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
    /// instantly (cache-first), then fetches a fresh page only when the seed is
    /// empty (long-press launch with no feed context).
    func seed(posts: [FeedPost], startId: String?) {
        let seeded = FeedPost.reels(from: posts)
        if !seeded.isEmpty {
            reels = seeded
            absorbServerFlags(seeded)
            currentId = startId.flatMap { id in seeded.contains { $0.id == id } ? id : nil } ?? seeded.first?.id
            hasLoadedOnce = true
        }
        if reels.isEmpty {
            Task { await fetch(reset: true) }
        }
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
            if currentId == nil { currentId = reels.first?.id }
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

    // MARK: - Interactions (optimistic)

    func toggleLike(_ post: FeedPost) {
        let id = post.id
        guard !heartInFlight.contains(id) else { return }
        heartInFlight.insert(id)
        let wasLiked = likedIds.contains(id)
        applyLike(id: id, liked: !wasLiked)
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
        HapticFeedback.light()
        Task { try? await service.share(postId: post.id) }
    }

    func recordView(_ id: String) {
        Task { try? await service.viewPost(postId: id, duration: nil) }
    }
}
