import Foundation
import Combine
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
/// the cursor for the affinity thread, the currently-visible reel, and the
/// optimistic like / bookmark state.
///
/// The pager opens instantly from whatever reels the feed already loaded
/// (cache-first seed), then pages the **affinity discovery thread** via
/// `getReels(seedReelId:)` — the dedicated `/posts/feed/reels` endpoint that
/// ranks reels by affinity to the entry reel (`seedReelId`), excludes the
/// viewer's own reels, and carries `isBookmarkedByMe`. A fresh launch (no entry
/// reel) pages the seedless « Pour toi » thread.
@MainActor
final class ReelsViewModel: ObservableObject {
    @Published private(set) var reels: [FeedPost] = []
    /// Réel actuellement visible. Le `didSet` gère l'appartenance à la post room
    /// (`ROOMS.post`) du réel actif : on quitte l'ancienne, on rejoint la nouvelle.
    /// C'est ce qui rend le like du reel viewer cohérent en TEMPS RÉEL avec le feed
    /// et le détail (le gateway émet `post:liked` vers la post room — unification).
    @Published var currentId: String? {
        didSet {
            guard oldValue != currentId else { return }
            if let old = oldValue { SocialSocketManager.shared.leavePostRoom(postId: old) }
            if let new = currentId { SocialSocketManager.shared.joinPostRoom(postId: new) }
        }
    }
    @Published private(set) var isLoadingMore = false
    @Published private(set) var hasLoadedOnce = false

    @Published private(set) var likedIds: Set<String> = []
    @Published private(set) var bookmarkedIds: Set<String> = []

    private var likeDelta: [String: Int] = [:]
    /// Optimistic bookmark-count bump per post id — same role as `likeDelta`.
    /// Purged when the canonical absolute count arrives on `post:bookmarked`.
    private var bookmarkDelta: [String: Int] = [:]
    /// Optimistic comment-count bump per post id (applied on top of the server
    /// count) so the reel's comment counter rises the instant a comment is sent.
    @Published private var commentDelta: [String: Int] = [:]
    private var heartInFlight: Set<String> = []
    private var bookmarkInFlight: Set<String> = []
    /// Reels whose impression (reach) has already been recorded this session —
    /// one impression per reel per session, mirroring the main feed's
    /// `recordedImpressionIds`. The reel's TOTAL view (`postOpenCount`) is
    /// counted separately by the engagement pipeline (full-screen dwell).
    private var impressionRecordedIds: Set<String> = []

    private var nextCursor: String?
    private var hasMore = true
    private var isFetching = false
    /// Le réel d'entrée (réel touché dans le feed) qui sème le thread d'affinité.
    /// `nil` pour un lancement « fresh » (long-press) → thread « Pour toi ».
    private var seedReelId: String?
    private var coldStartTask: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()
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
        subscribeToLikeEvents()
        subscribeToBookmarkEvents()
    }

    /// S'abonne à l'événement CANONIQUE absolu `post:liked`/`post:unliked` (le ❤️
    /// du reel viewer y passe désormais, comme le feed et le détail). Le compteur
    /// `likeCount` fait autorité : on pose la base, on purge le delta optimiste et
    /// on confirme `isLiked` pour l'acteur.
    private func subscribeToLikeEvents() {
        SocialSocketManager.shared.postLiked
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.applyServerLike($0.postId, likeCount: $0.likeCount, userId: $0.userId, liked: true) }
            .store(in: &cancellables)
        SocialSocketManager.shared.postUnliked
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.applyServerLike($0.postId, likeCount: $0.likeCount, userId: $0.userId, liked: false) }
            .store(in: &cancellables)
    }

    private func applyServerLike(_ postId: String, likeCount: Int, userId: String, liked: Bool) {
        guard let index = reels.firstIndex(where: { $0.id == postId }) else { return }
        reels[index].likes = likeCount
        likeDelta[postId] = nil
        guard userId == AuthManager.shared.currentUser?.id else { return }
        reels[index].isLiked = liked
        if liked { likedIds.insert(postId) } else { likedIds.remove(postId) }
    }

    /// S'abonne à `post:bookmarked`. Le favori est PERSONNEL : le gateway n'émet
    /// l'événement que vers la feed room de l'utilisateur (`emitToUser`), donc tout
    /// événement reçu est notre propre action (depuis n'importe quelle session/vue).
    /// On réconcilie l'état local — idempotent avec l'optimistic update du toggle —
    /// ET le flag sur le modèle, pour que la persistance survive à la fermeture/réouverture.
    private func subscribeToBookmarkEvents() {
        SocialSocketManager.shared.postBookmarked
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.applyServerBookmark($0.postId, bookmarked: $0.bookmarked, bookmarkCount: $0.bookmarkCount) }
            .store(in: &cancellables)
    }

    /// Canonical reconciliation mirroring `applyServerLike` : the absolute
    /// `bookmarkCount` (when provided by the gateway) makes authority, so we set
    /// the model count and purge the optimistic delta. The icon is confirmed via
    /// `bookmarkedIds`. A nil count (older gateway) only reconciles the icon.
    private func applyServerBookmark(_ postId: String, bookmarked: Bool, bookmarkCount: Int?) {
        if bookmarked { bookmarkedIds.insert(postId) } else { bookmarkedIds.remove(postId) }
        if let index = reels.firstIndex(where: { $0.id == postId }) {
            reels[index].isBookmarkedByMe = bookmarked
            if let count = bookmarkCount {
                reels[index].bookmarkCount = count
                bookmarkDelta[postId] = nil
            }
        }
    }

    /// À appeler quand le viewer se ferme : quitte la post room du réel actif.
    func leaveActivePostRoom() {
        if let id = currentId { SocialSocketManager.shared.leavePostRoom(postId: id) }
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
        // The entry reel seeds the affinity thread for all subsequent paging.
        seedReelId = startId
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
            // Thread d'affinité dédié (exclut le seed + les réels du viewer, porte
            // `isBookmarkedByMe`). `FeedPost.reels` reste un garde-fou : la réponse
            // est déjà `type: REEL`, on filtre par sécurité.
            let response = try await service.getReels(seedReelId: seedReelId, cursor: reset ? nil : nextCursor, limit: 20)
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

    /// Bookmark count including the optimistic delta from a just-toggled bookmark
    /// (reconciled to the absolute server count on `post:bookmarked`).
    func bookmarkCount(_ post: FeedPost) -> Int {
        max(0, post.bookmarkCount + (bookmarkDelta[post.id] ?? 0))
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
                // Socket PRIMAIRE (réaction ❤️) — NORMALISE le reels sur le feed et le
                // détail (qui écrivaient déjà via socket). Le serveur émet l'événement
                // canonique `post:liked` → `applyServerLike` réconcilie base + delta.
                // Timeout dur : protège contre un SocialSocketManager bloqué (heartInFlight
                // resterait verrouillé). Miroir de `FeedView.togglePostHeart`.
                try await withTaskTimeout(seconds: TaskTimeoutDefaults.socialReaction) {
                    if wasLiked {
                        _ = try await SocialSocketManager.shared.removePostReaction(
                            postId: id, emoji: StoryViewerView.heartEmoji
                        )
                    } else {
                        _ = try await SocialSocketManager.shared.addPostReaction(
                            postId: id, emoji: StoryViewerView.heartEmoji
                        )
                    }
                }
            } catch {
                // Fallback REST (mutuellement exclusif avec le socket : déclenché SEULEMENT
                // si le socket échoue). Rollback de l'optimistic UNIQUEMENT si le REST
                // échoue aussi — sinon le like est persisté côté serveur.
                let restOK: Bool
                do {
                    if wasLiked { try await service.unlike(postId: id) }
                    else { try await service.like(postId: id) }
                    restOK = true
                } catch {
                    restOK = false
                }
                if !restOK { applyLike(id: id, liked: wasLiked) }
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
        if wasBookmarked {
            bookmarkedIds.remove(id)
            bookmarkDelta[id] = (bookmarkDelta[id] ?? 0) - 1
        } else {
            bookmarkedIds.insert(id)
            bookmarkDelta[id] = (bookmarkDelta[id] ?? 0) + 1
            EngagementTracker.shared.recordAction(.bookmarked, surface: .reels)
        }
        HapticFeedback.light()
        Task {
            do {
                if wasBookmarked { try await service.removeBookmark(postId: id) }
                else { try await service.bookmark(postId: id) }
            } catch {
                // Rollback both the icon and the optimistic count.
                if wasBookmarked {
                    bookmarkedIds.insert(id)
                    bookmarkDelta[id] = (bookmarkDelta[id] ?? 0) + 1
                } else {
                    bookmarkedIds.remove(id)
                    bookmarkDelta[id] = (bookmarkDelta[id] ?? 0) - 1
                }
            }
            bookmarkInFlight.remove(id)
        }
    }

    /// Records a share on `post` and mints a **deduplicated** tracking link —
    /// aligned with the feed's `sharePost(_:generateLink:)`. Returns the absolute
    /// `meeshy.me/l/<token>` short URL so the caller can present the system share
    /// sheet, or `nil` on failure (the caller falls back to the raw post URL).
    ///
    /// Replaces the old plain `share(postId:)` path, which incremented the server
    /// `shareCount` on EVERY tap with no dedup — re-taps inflated the counter even
    /// though nothing new was shared (a reel showed 23 shares for 4 unique views).
    /// The `generateLink: true` path upserts one link per (post, sharer): the
    /// counter rises at most once per sharer, exactly like the feed.
    func shareLink(for post: FeedPost) async -> String? {
        EngagementTracker.shared.recordAction(.shared, surface: .reels)
        do {
            let result = try await service.share(postId: post.id, platform: "system", generateLink: true)
            return result.shortUrl
        } catch {
            return nil
        }
    }

    func recordView(_ id: String) {
        // Unique view (viewCount, deduped server-side) — saved, not displayed.
        Task { try? await service.viewPost(postId: id, duration: nil) }
        // Impression (reach) — the reel appeared on screen. Once per reel per
        // session. `source: "feed"` bumps impressionCount only (the reel's total
        // view comes from the engagement pipeline, not from this appearance).
        if impressionRecordedIds.insert(id).inserted {
            Task { try? await service.recordImpression(postId: id, source: "feed") }
        }
    }
}
