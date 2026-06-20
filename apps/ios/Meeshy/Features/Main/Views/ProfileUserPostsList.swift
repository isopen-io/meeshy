import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Profile User Posts List
//
// Rich posts list injected into `UserProfileSheet`'s Postes tab (Phase E).
// Reuses `FeedPostCard` for rendering, the SDK `APIPost.toFeedPost`
// conversion, and `CacheCoordinator.shared.feed` keyed `"user:<id>"` for
// cache-first display (Instant App). Engagement: optimistic like / bookmark
// via `PostService`; tap a card → `onOpenPost` (the host opens the full
// PostDetail where every engagement action already works).
//
// This is app-side product orchestration (cache → network cascade, FeedPost
// mapping, optimistic flags), not an SDK atom — per SDK purity rules.
struct ProfileUserPostsList: View {
    let userId: String
    var onOpenPost: ((FeedPost) -> Void)? = nil

    @StateObject private var viewModel: ProfileUserPostsViewModel
    private var theme: ThemeManager { ThemeManager.shared }

    init(userId: String, onOpenPost: ((FeedPost) -> Void)? = nil) {
        self.userId = userId
        self.onOpenPost = onOpenPost
        _viewModel = StateObject(wrappedValue: ProfileUserPostsViewModel(userId: userId))
    }

    // NOTE: This view is injected as content INSIDE `UserProfileSheet`'s outer
    // ScrollView. It MUST NOT wrap its content in its own ScrollView — a vertical
    // ScrollView nested in a vertical ScrollView breaks both the scroll gesture
    // and the parent's scrollOffset (the collapsible header would never collapse
    // on the Posts tab). The content flows directly in the parent's single
    // scroll container. Pull-to-refresh is intentionally dropped here (the outer
    // ScrollView owns scrolling); SWR + the visit revalidate covers freshness.
    var body: some View {
        LazyVStack(spacing: 12) {
            if viewModel.posts.isEmpty {
                if viewModel.isLoading {
                    ProgressView()
                        .padding(.top, 40)
                } else {
                    emptyState
                }
            } else {
                ForEach(viewModel.posts) { post in
                    FeedPostCard(
                        post: post,
                        isLiked: viewModel.likedOverrides[post.id],
                        displayLikeCount: viewModel.displayLikeCount(for: post),
                        isBookmarked: viewModel.isBookmarked(post),
                        onLike: { postId in
                            Task { await viewModel.toggleLike(postId) }
                        },
                        onBookmark: { postId in
                            Task { await viewModel.toggleBookmark(postId) }
                        },
                        onTapPost: { tapped in
                            onOpenPost?(tapped)
                        },
                        onReport: { postId in
                            Task {
                                try? await ReportService.shared.reportPost(postId: postId, reportType: "inappropriate", reason: nil)
                                FeedbackToastManager.shared.showSuccess(String(localized: "profile.posts.report.success", defaultValue: "Signalement envoye", bundle: .main))
                            }
                        }
                    )
                    .equatable()
                }

                if viewModel.hasMore {
                    // Infinite-scroll sentinel — works inside the parent LazyVStack.
                    Color.clear
                        .frame(height: 1)
                        .onAppear {
                            Task { await viewModel.loadMore() }
                        }
                    if viewModel.isLoading {
                        ProgressView().padding()
                    }
                }
            }
        }
        .padding(.top, 8)
        .padding(.bottom, 24)
        .task { await viewModel.loadInitial() }
        // FeedPostCard ends its body with `.withStatusBubble()`, which reads
        // `@EnvironmentObject StatusBubbleController`. That object is injected at
        // the RootView/iPadRootView level but does NOT reliably propagate across
        // the `.sheet` boundary into UserProfileSheet — so without this the Postes
        // tab crashes with `EnvironmentObject.error()` (SIGTRAP) the moment a card
        // lays out. Re-injecting the shared singleton here is idempotent and adds
        // no new re-render dependency (FeedPostCard already observes it).
        .environmentObject(StatusBubbleController.shared)
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "square.text.square")
                .font(.system(size: 44))
                .foregroundColor(theme.textMuted)
                .accessibilityHidden(true)
            Text(String(localized: "profile.posts.empty", defaultValue: "Aucune publication", bundle: .main))
                .font(.body.weight(.semibold))
                .foregroundColor(theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }
}

@MainActor
final class ProfileUserPostsViewModel: ObservableObject {
    @Published var posts: [FeedPost] = []
    @Published var isLoading = false
    @Published var hasMore = true
    /// Optimistic like state keyed by postId (nil = use post.isLiked).
    @Published var likedOverrides: [String: Bool] = [:]
    /// Optimistic bookmark state keyed by postId (nil = use post.isBookmarkedByMe).
    @Published var bookmarkedOverrides: [String: Bool] = [:]

    private let userId: String
    private let cacheKey: String
    private var nextCursor: String?
    private let postService: PostServiceProviding
    private let languageProvider: LanguageProviding

    init(
        userId: String,
        postService: PostServiceProviding = PostService.shared,
        languageProvider: LanguageProviding = AuthManagerLanguageProvider()
    ) {
        self.userId = userId
        self.cacheKey = "user:\(userId)"
        self.postService = postService
        self.languageProvider = languageProvider
    }

    private var preferredLanguages: [String] { languageProvider.preferredLanguages }

    func isBookmarked(_ post: FeedPost) -> Bool {
        // Optimistic override wins while in flight; otherwise fall back to the
        // server-enriched flag so a server-bookmarked post renders correctly on
        // first paint AND an optimistic un-bookmark still wins until refresh.
        bookmarkedOverrides[post.id] ?? post.isBookmarkedByMe
    }

    func displayLikeCount(for post: FeedPost) -> Int? {
        guard let liked = likedOverrides[post.id] else { return nil }
        // No override needed when the optimistic value equals server truth —
        // let the card render `post.likes` / `post.isLiked` directly.
        if liked == post.isLiked { return nil }
        let base = post.likes - (post.isLiked ? 1 : 0)
        return base + (liked ? 1 : 0)
    }

    func loadInitial() async {
        guard posts.isEmpty, !isLoading else { return }

        let cached = await CacheCoordinator.shared.feed.load(for: cacheKey)
        switch cached {
        case .fresh(let data, _):
            posts = data
            await CacheCoordinator.shared.feed.touch(for: cacheKey)
            return
        case .stale(let data, _):
            posts = data
            await CacheCoordinator.shared.feed.touch(for: cacheKey)
            Task { [weak self] in await self?.fetchFromNetwork() }
            return
        case .expired, .empty:
            break
        }

        isLoading = true
        defer { isLoading = false }
        await fetchFromNetwork()
    }

    func loadMore() async {
        guard hasMore, !isLoading, nextCursor != nil else { return }
        isLoading = true
        defer { isLoading = false }
        await fetchFromNetwork()
    }

    private func fetchFromNetwork() async {
        do {
            let response = try await postService.getUserPosts(userId: userId, cursor: nextCursor, limit: 20)
            let preferred = preferredLanguages
            let payload = response.data
            // Decode off the main actor — toFeedPost decodes media / comments /
            // translations (heavy). Both [APIPost] and [FeedPost] are Sendable.
            let fetched = await Task.detached(priority: .userInitiated) {
                payload.map { $0.toFeedPost(preferredLanguages: preferred) }
            }.value

            if nextCursor == nil {
                posts = fetched
            } else {
                let existing = Set(posts.map(\.id))
                posts.append(contentsOf: fetched.filter { !existing.contains($0.id) })
            }
            nextCursor = response.pagination?.nextCursor
            hasMore = response.pagination?.hasMore ?? false

            // Prune optimistic overrides for posts no longer present, and drop
            // any override whose value now matches server truth (so the next
            // refresh reads `post.isLiked` / `post.isBookmarkedByMe` directly).
            let ids = Set(posts.map(\.id))
            likedOverrides = likedOverrides.filter { ids.contains($0.key) }
            bookmarkedOverrides = bookmarkedOverrides.filter { ids.contains($0.key) }
            for post in posts {
                if likedOverrides[post.id] == post.isLiked { likedOverrides[post.id] = nil }
                if bookmarkedOverrides[post.id] == post.isBookmarkedByMe { bookmarkedOverrides[post.id] = nil }
            }

            // The live VM keeps the full paginated list in memory; the cache is
            // bounded to the NEWEST 100. GRDBCacheStore.save keeps `suffix(100)`
            // (oldest, posts are newest-first) so we persist `prefix(100)` to
            // avoid trimming the newest posts on cold start.
            try? await CacheCoordinator.shared.feed.save(Array(posts.prefix(100)), for: cacheKey)
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "profile.posts.loadError", defaultValue: "Erreur lors du chargement des publications", bundle: .main))
        }
    }

    func refresh() async {
        nextCursor = nil
        hasMore = true
        await CacheCoordinator.shared.feed.invalidate(for: cacheKey)
        await fetchFromNetwork()
    }

    func toggleLike(_ postId: String) async {
        guard let post = posts.first(where: { $0.id == postId }) else { return }
        let current = likedOverrides[postId] ?? post.isLiked
        let next = !current
        likedOverrides[postId] = next
        do {
            try await postService.like(postId: postId)
        } catch {
            likedOverrides[postId] = current
            FeedbackToastManager.shared.showError(String(localized: "profile.posts.likeError", defaultValue: "Erreur", bundle: .main))
        }
    }

    func toggleBookmark(_ postId: String) async {
        guard let post = posts.first(where: { $0.id == postId }) else { return }
        let current = bookmarkedOverrides[postId] ?? post.isBookmarkedByMe
        let next = !current
        bookmarkedOverrides[postId] = next
        do {
            if current {
                try await postService.removeBookmark(postId: postId)
            } else {
                try await postService.bookmark(postId: postId)
            }
        } catch {
            bookmarkedOverrides[postId] = current
            FeedbackToastManager.shared.showError(String(localized: "profile.posts.bookmarkError", defaultValue: "Erreur", bundle: .main))
        }
    }
}
