import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Profile User Posts List
//
// Rich posts list injected into `UserProfileSheet`'s Postes tab. It mirrors the
// main feed (`FeedView`) so a user's profile renders posts AND reels with the
// exact same cards, cache and engagement:
//   - `FeedPostCard` for posts, `ReelFeedCard` for reels (`post.isReel`).
//   - `CacheCoordinator.shared.feed` keyed `"user:<id>"` (same store as the feed)
//     for cache-first display (Instant App, stale-while-revalidate).
//   - Optimistic like / repost / bookmark / share via `PostService` (with
//     rollback), and comment send via `addComment` — every action is wired and
//     crash-free. (Unlike the feed, comments here are best-effort: no durable
//     offline outbox — a failed send surfaces a toast rather than queuing.)
//   - Impression batching (source `"profile"`) for every card that appears, and a
//     `viewPost` call when a post is opened or its text expanded ("voir plus").
//   - Reels open the immersive viewer (host wires `onOpenReel`); posts open detail
//     (`onOpenPost`).
//
// This is app-side product orchestration (cache → network cascade, FeedPost
// mapping, optimistic flags, viewer hand-off), not an SDK atom — per SDK purity.
//
// LATENCY: the list is injected INSIDE `UserProfileSheet`'s outer ScrollView, so
// its `LazyVStack` is nested in another lazy container and loses laziness — it
// would build EVERY cached card (up to 100) synchronously on first paint and
// freeze the UI. We therefore render a growing WINDOW (`visiblePosts`) that
// starts small and extends via the infinite-scroll sentinel, bounding the
// synchronous work to a handful of cards per frame.
struct ProfileUserPostsList: View {
    let userId: String
    /// Opens a standard post (host pushes the full PostDetail).
    var onOpenPost: ((FeedPost) -> Void)? = nil
    /// Opens a reel in the immersive viewer. Param = tapped reel + the user's
    /// reels (seed). When `nil`, reels fall back to `onOpenPost` (detail).
    var onOpenReel: ((_ reel: FeedPost, _ reels: [FeedPost]) -> Void)? = nil

    @StateObject private var viewModel: ProfileUserPostsViewModel
    @State private var shareableLink: ShareableLink?
    private var theme: ThemeManager { ThemeManager.shared }
    private var isDark: Bool { theme.mode.isDark }

    init(
        userId: String,
        onOpenPost: ((FeedPost) -> Void)? = nil,
        onOpenReel: ((_ reel: FeedPost, _ reels: [FeedPost]) -> Void)? = nil
    ) {
        self.userId = userId
        self.onOpenPost = onOpenPost
        self.onOpenReel = onOpenReel
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
                ForEach(viewModel.visiblePosts) { post in
                    card(for: post)
                        .onAppear { viewModel.trackImpression(post.id) }
                }

                if viewModel.hasMoreToRender || viewModel.hasMore {
                    // Infinite-scroll sentinel — reveals more cached cards first
                    // (cheap), then fetches the next network page when the cache
                    // is exhausted. Works inside the parent LazyVStack.
                    Color.clear
                        .frame(height: 1)
                        .onAppear {
                            Task { await viewModel.revealOrLoadMore() }
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
        .sheet(item: $shareableLink) { link in
            ShareSheet(activityItems: [link.url])
                .presentationDetents([.medium, .large])
        }
    }

    // MARK: - Card routing (reel vs post)

    @ViewBuilder
    private func card(for post: FeedPost) -> some View {
        if post.isReel {
            reelCard(post)
        } else {
            postCard(post)
        }
    }

    private func reelCard(_ post: FeedPost) -> some View {
        ReelFeedCard(
            post: post,
            // No autoplay coordinator in the profile list — the card shows its
            // poster (PAUSED); tapping the media opens the immersive viewer where
            // playback actually happens.
            isActive: false,
            isDark: isDark,
            isLiked: viewModel.isLiked(post),
            displayLikeCount: viewModel.likeCount(post),
            isBookmarked: viewModel.isBookmarked(post),
            displayBookmarkCount: viewModel.bookmarkCount(post),
            isReposted: viewModel.isReposted(post),
            displayRepostCount: viewModel.repostCount(post),
            displayShareCount: viewModel.shareCount(post),
            onTapMedia: { openReel(post) },
            onTapGlyph: { openPost(post) },
            onLike: { id in Task { await viewModel.toggleLike(id) } },
            onComment: { _ in openReel(post) },
            onRepost: { id in Task { await viewModel.toggleRepost(id) } },
            onBookmark: { id in Task { await viewModel.toggleBookmark(id) } },
            onShare: { id in Task { await share(id) } },
            // We are already inside this user's profile sheet — tapping the
            // (reposted) author is a no-op here to avoid stacking sheets.
            onTapAuthor: { _ in }
        )
        .equatable()
        .padding(.horizontal, 12)
    }

    private func postCard(_ post: FeedPost) -> some View {
        FeedPostCard(
            post: post,
            isLiked: viewModel.isLiked(post),
            displayLikeCount: viewModel.likeCount(post),
            isBookmarked: viewModel.isBookmarked(post),
            displayRepostCount: viewModel.repostCount(post),
            displayBookmarkCount: viewModel.bookmarkCount(post),
            displayShareCount: viewModel.shareCount(post),
            isReposted: viewModel.isReposted(post),
            onLike: { id in Task { await viewModel.toggleLike(id) } },
            onRepost: { id in Task { await viewModel.toggleRepost(id) } },
            onQuote: { _ in openPost(post) },
            onShare: { id in Task { await share(id) } },
            onBookmark: { id in Task { await viewModel.toggleBookmark(id) } },
            onSendComment: { postId, content, parentId in
                Task { await viewModel.sendComment(postId: postId, content: content, parentId: parentId) }
            },
            onSelectLanguage: { postId, language in
                // Tap on a flag whose translation isn't loaded yet → request it.
                // The result arrives via the social socket and patches the card.
                Task { await viewModel.requestTranslation(postId: postId, language: language) }
            },
            onTapPost: { tapped in openPost(tapped) },
            onTapRepost: { _ in openPost(post) },
            onSeeMore: {
                // "Voir plus" expands the text inline AND counts a post view —
                // throttled to once per hour per user+post (shared with open).
                recordView(post.id)
            },
            onReport: { id in
                Task { await viewModel.report(id) }
            }
        )
        .equatable()
    }

    // MARK: - Open / view tracking

    private func openPost(_ post: FeedPost) {
        recordView(post.id)
        onOpenPost?(post)
    }

    private func openReel(_ post: FeedPost) {
        recordView(post.id)
        if let onOpenReel {
            onOpenReel(post, viewModel.reels)
        } else {
            onOpenPost?(post)
        }
    }

    /// Counts ONE post view (open or "voir plus") through the persistent 1-hour
    /// per-(user, post) throttle: the local guard is checked and written BEFORE
    /// anything reaches the backend, so reopening or tapping "voir plus" again
    /// within the hour sends nothing — even across app launches.
    private func recordView(_ postId: String) {
        guard PostViewThrottle.shared.shouldRecordView(postId: postId) else { return }
        Task { try? await PostService.shared.viewPost(postId: postId, duration: nil) }
    }

    // MARK: - Share

    private func share(_ postId: String) async {
        // `try?` → nil when the request never reached the gateway (offline,
        // rate-limit). Only bump the optimistic share count when it succeeded —
        // the gateway increments shareCount on any request that lands, but a
        // transport failure records nothing, so bumping then would be wrong.
        let result = try? await PostService.shared.share(postId: postId, platform: "system", generateLink: true)
        if result != nil { viewModel.bumpShare(postId) }
        // Always surface a shareable URL (tracked when minted, canonical web URL
        // otherwise) so the user is never stuck with nothing to share.
        let resolved = result?.shortUrl ?? "\(ShareableLink.webBaseURL)/feeds/post/\(postId)"
        guard let url = URL(string: resolved) else { return }
        shareableLink = ShareableLink(url: url)
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "square.text.square")
                .font(MeeshyFont.relative(44))
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

// MARK: - Profile posts opener (shared host-side navigation)
//
// Centralizes how a host (any sheet presenting `ProfileUserPostsList`) opens a
// tapped post or reel: dismiss the profile sheet first, then navigate at the
// root. Reels present the immersive overlay — which lives behind the sheet, so
// it must come up AFTER the dismiss settles (hence the small delay). Posts push
// the detail route via RootView's existing `pushNavigateToRoute` listener, so
// hosts without a `Router` in scope (audio fullscreen, comments sheet) work too.
@MainActor
enum ProfilePostsOpener {
    static func openReel(_ reel: FeedPost, in reels: [FeedPost], dismiss: @escaping () -> Void) {
        dismiss()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            HapticFeedback.medium()
            ReelsPresenter.shared.present(posts: reels, startId: reel.id)
        }
    }

    static func openPost(_ post: FeedPost, dismiss: @escaping () -> Void) {
        dismiss()
        NotificationCenter.default.post(
            name: Notification.Name("pushNavigateToRoute"),
            object: "postDetail:\(post.id)"
        )
    }
}

// MARK: - Post View Throttle (persistent, per user+post, 1 hour)
//
// Product rule (app-side, not an SDK atom): a post "view" — opening the post OR
// tapping "voir plus" — is counted at most ONCE per hour per signed-in user per
// post, even across reopens and app launches. The local guard is persisted to
// UserDefaults and checked/written BEFORE anything is sent to the backend, so
// the network increment only happens when the throttle actually allows it.
@MainActor
final class PostViewThrottle {
    static let shared = PostViewThrottle()

    private let defaults: UserDefaults
    private let storageKey = "meeshy.postViewThrottle.v1"
    private let ttl: TimeInterval = 3600
    /// key = "<userId>:<postId>" → last recorded view (epoch seconds).
    private var timestamps: [String: Date]

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let raw = defaults.dictionary(forKey: storageKey) as? [String: TimeInterval] {
            timestamps = raw.mapValues { Date(timeIntervalSince1970: $0) }
        } else {
            timestamps = [:]
        }
    }

    private func key(for postId: String) -> String {
        let uid = AuthManager.shared.currentUser?.id ?? "anon"
        return "\(uid):\(postId)"
    }

    /// Returns `true` (and records "now", persisted) when no view has been
    /// counted for this user+post within the last hour; returns `false` (skip
    /// the increment + network call) otherwise.
    func shouldRecordView(postId: String) -> Bool {
        let k = key(for: postId)
        let now = Date()
        if let last = timestamps[k], now.timeIntervalSince(last) < ttl {
            return false
        }
        timestamps[k] = now
        persist()
        return true
    }

    private func persist() {
        // Prune expired entries opportunistically so the store stays bounded.
        let cutoff = Date().addingTimeInterval(-ttl)
        timestamps = timestamps.filter { $0.value >= cutoff }
        defaults.set(timestamps.mapValues { $0.timeIntervalSince1970 }, forKey: storageKey)
    }
}

@MainActor
final class ProfileUserPostsViewModel: ObservableObject {
    @Published private(set) var posts: [FeedPost] = []
    @Published var isLoading = false
    @Published var hasMore = true
    /// Number of posts actually rendered. Grows via the infinite-scroll sentinel
    /// so the nested LazyVStack never builds the whole cached list at once.
    @Published private(set) var renderWindow = ProfileUserPostsViewModel.initialRenderWindow

    /// Optimistic engagement overrides keyed by postId (nil = use server flag).
    @Published var likedOverrides: [String: Bool] = [:]
    @Published var bookmarkedOverrides: [String: Bool] = [:]
    @Published var repostedOverrides: [String: Bool] = [:]
    /// Optimistic share-count delta keyed by postId (share is append-only).
    @Published var shareDelta: [String: Int] = [:]

    static let initialRenderWindow = 5
    static let renderStep = 5

    private let userId: String
    private let cacheKey: String
    private var nextCursor: String?
    private let postService: PostServiceProviding
    private let languageProvider: LanguageProviding

    // Impression batching — mirrors FeedView (dedup per session, 3s flush).
    private var pendingImpressionIds: Set<String> = []
    private var recordedImpressionIds: Set<String> = []
    private var impressionTask: Task<Void, Never>?

    private var cancellables = Set<AnyCancellable>()

    init(
        userId: String,
        postService: PostServiceProviding = PostService.shared,
        languageProvider: LanguageProviding = AuthManagerLanguageProvider()
    ) {
        self.userId = userId
        self.cacheKey = "user:\(userId)"
        self.postService = postService
        self.languageProvider = languageProvider
        subscribeToTranslationUpdates()
    }

    private var preferredLanguages: [String] { languageProvider.preferredLanguages }

    // MARK: - Derived render state

    var visiblePosts: [FeedPost] { Array(posts.prefix(renderWindow)) }
    var hasMoreToRender: Bool { renderWindow < posts.count }
    var reels: [FeedPost] { posts.filter(\.isReel) }

    // MARK: - Derived engagement state

    func isLiked(_ post: FeedPost) -> Bool { likedOverrides[post.id] ?? post.isLiked }
    func isReposted(_ post: FeedPost) -> Bool { repostedOverrides[post.id] ?? post.isRepostedByMe }
    func isBookmarked(_ post: FeedPost) -> Bool { bookmarkedOverrides[post.id] ?? post.isBookmarkedByMe }

    func likeCount(_ post: FeedPost) -> Int { adjusted(post.likes, post.isLiked, likedOverrides[post.id]) }
    func repostCount(_ post: FeedPost) -> Int { adjusted(post.repostCount, post.isRepostedByMe, repostedOverrides[post.id]) }
    func bookmarkCount(_ post: FeedPost) -> Int { adjusted(post.bookmarkCount, post.isBookmarkedByMe, bookmarkedOverrides[post.id]) }
    func shareCount(_ post: FeedPost) -> Int { max(0, post.shareCount + (shareDelta[post.id] ?? 0)) }

    /// Server base count adjusted by the optimistic override: +1 when the user
    /// just participated, -1 when they just un-participated, unchanged otherwise.
    private func adjusted(_ base: Int, _ serverFlag: Bool, _ override: Bool?) -> Int {
        guard let override, override != serverFlag else { return base }
        return max(0, base + (override ? 1 : -1))
    }

    // MARK: - Loading (cache-first, SWR)

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

    /// Sentinel handler: reveal more already-cached cards first (cheap), then
    /// fetch the next network page once the cache is fully rendered.
    func revealOrLoadMore() async {
        if hasMoreToRender {
            renderWindow = min(posts.count, renderWindow + Self.renderStep)
        } else if hasMore {
            await loadMore()
            // Grow the window to include the freshly fetched page — otherwise
            // the rendered prefix is unchanged, the bottom sentinel never moves,
            // its onAppear never re-fires, and pagination dead-ends at the cache
            // boundary.
            renderWindow = min(posts.count, renderWindow + Self.renderStep)
        }
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

            // Drop any override / share delta whose value now matches server
            // truth, and prune entries for posts no longer present.
            let ids = Set(posts.map(\.id))
            likedOverrides = likedOverrides.filter { ids.contains($0.key) }
            bookmarkedOverrides = bookmarkedOverrides.filter { ids.contains($0.key) }
            repostedOverrides = repostedOverrides.filter { ids.contains($0.key) }
            shareDelta = shareDelta.filter { ids.contains($0.key) }
            for post in posts {
                if likedOverrides[post.id] == post.isLiked { likedOverrides[post.id] = nil }
                if bookmarkedOverrides[post.id] == post.isBookmarkedByMe { bookmarkedOverrides[post.id] = nil }
                if repostedOverrides[post.id] == post.isRepostedByMe { repostedOverrides[post.id] = nil }
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
        renderWindow = Self.initialRenderWindow
        await CacheCoordinator.shared.feed.invalidate(for: cacheKey)
        await fetchFromNetwork()
    }

    // MARK: - Engagement actions (optimistic, crash-free)

    func toggleLike(_ postId: String) async {
        guard let post = posts.first(where: { $0.id == postId }) else { return }
        let current = isLiked(post)
        likedOverrides[postId] = !current
        do {
            if current {
                try await postService.unlike(postId: postId)
            } else {
                try await postService.like(postId: postId)
            }
        } catch {
            likedOverrides[postId] = current
            FeedbackToastManager.shared.showError(String(localized: "profile.posts.likeError", defaultValue: "Erreur", bundle: .main))
        }
    }

    func toggleBookmark(_ postId: String) async {
        guard let post = posts.first(where: { $0.id == postId }) else { return }
        let current = isBookmarked(post)
        bookmarkedOverrides[postId] = !current
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

    /// Reposts are append-only on the backend — the optimistic flip only
    /// persists if the server confirmed the create (mirrors FeedView).
    func toggleRepost(_ postId: String) async {
        guard let post = posts.first(where: { $0.id == postId }), !isReposted(post) else { return }
        repostedOverrides[postId] = true
        do {
            _ = try await postService.repost(postId: postId, targetType: nil, content: nil, isQuote: false)
            FeedbackToastManager.shared.showSuccess(String(localized: "profile.posts.repost.success", defaultValue: "Repartagé", bundle: .main))
        } catch {
            repostedOverrides[postId] = nil
            FeedbackToastManager.shared.showError(String(localized: "profile.posts.repostError", defaultValue: "Erreur lors du repost", bundle: .main))
        }
    }

    func sendComment(postId: String, content: String, parentId: String?) async {
        do {
            _ = try await postService.addComment(postId: postId, content: content, parentId: parentId, effectFlags: nil)
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "profile.posts.commentError", defaultValue: "Erreur lors de l'envoi du commentaire", bundle: .main))
        }
    }

    func report(_ postId: String) async {
        try? await ReportService.shared.reportPost(postId: postId, reportType: "inappropriate", reason: nil)
        FeedbackToastManager.shared.showSuccess(String(localized: "profile.posts.report.success", defaultValue: "Signalement envoyé", bundle: .main))
    }

    // MARK: - On-demand translation (mirrors FeedViewModel)

    /// Requests a translation for `postId` into `language`. The computed
    /// translation is delivered asynchronously via the social socket and patched
    /// into `posts` by `subscribeToTranslationUpdates` (so the flag lights up).
    func requestTranslation(postId: String, language: String) async {
        do {
            try await postService.requestTranslation(postId: postId, targetLanguage: language)
        } catch {
            // On failure the flag simply stays "untranslated" — no toast (the
            // tap is exploratory, not a committed user action).
        }
    }

    private func subscribeToTranslationUpdates() {
        // Idempotent — ensures the social socket is up so `post:translation-updated`
        // actually arrives when the profile sheet is opened outside the feed.
        SocialSocketManager.shared.connect()
        SocialSocketManager.shared.postTranslationUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] (data: SocketPostTranslationUpdatedData) in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
                var post = self.posts[index]
                var translations = post.translations ?? [:]
                translations[data.language] = PostTranslation(
                    text: data.translation.text,
                    translationModel: data.translation.translationModel,
                    confidenceScore: data.translation.confidenceScore
                )
                post.translations = translations
                if self.preferredLanguages.contains(where: { $0.caseInsensitiveCompare(data.language) == .orderedSame }),
                   post.translatedContent == nil {
                    post.translatedContent = data.translation.text
                }
                self.posts[index] = post
            }
            .store(in: &cancellables)
    }

    /// Optimistic share-count bump — the gateway always increments shareCount on
    /// `POST /posts/:id/share` regardless of mint success, so we mirror it.
    func bumpShare(_ postId: String) {
        shareDelta[postId, default: 0] += 1
    }

    // MARK: - Impressions (batched, source "profile")

    func trackImpression(_ postId: String) {
        guard !recordedImpressionIds.contains(postId) else { return }
        pendingImpressionIds.insert(postId)
        scheduleImpressionFlush()
    }

    private func scheduleImpressionFlush() {
        impressionTask?.cancel()
        impressionTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(3))
            guard !Task.isCancelled else { return }
            await self?.flushImpressions()
        }
    }

    private func flushImpressions() async {
        let batch = Array(pendingImpressionIds)
        guard !batch.isEmpty else { return }
        pendingImpressionIds.subtract(batch)
        do {
            try await postService.recordImpressions(postIds: batch, source: "profile")
            // Mark recorded ONLY on success so a failed flush leaves the ids
            // eligible to re-enqueue when the card next appears.
            recordedImpressionIds.formUnion(batch)
        } catch {}
    }
}
