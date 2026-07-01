import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

// MARK: - Extracted from RootView.swift

// MARK: - Themed Action Button
struct ThemedActionButton: View {
    let icon: String
    let color: String
    let label: String
    let hint: String
    var badge: Int = 0
    var size: CGFloat = 46
    let action: () -> Void

    @State private var isPressed = false
    @State private var isGlowing = false
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userForcedReduceMotion
    private var reduceMotion: Bool { systemReduceMotion || userForcedReduceMotion }

    private var iconSize: CGFloat { round(size * 0.39) }

    var body: some View {
        Button(action: {
            HapticFeedback.light()
            withAnimation(.spring(response: 0.15, dampingFraction: 0.5)) { isPressed = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                withAnimation(.spring(response: 0.25, dampingFraction: 0.5)) { isPressed = false }
            }
            action()
        }) {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: color), Color(hex: color).opacity(0.7)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: size, height: size)
                    .shadow(
                        color: Color(hex: color).opacity(isGlowing ? 0.65 : 0.45),
                        radius: isGlowing ? 14 : 10,
                        y: 4
                    )

                Image(systemName: icon)
                    .font(.system(size: iconSize, weight: .semibold))
                    .foregroundColor(.white)
                    .scaleEffect(isPressed ? 1.2 : 1.0)
                    .rotationEffect(.degrees(isPressed ? -8 : 0))

                if badge > 0 {
                    Text("\(min(badge, 99))")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(Color(hex: color))
                        .frame(width: 16, height: 16)
                        .background(Circle().fill(Color.white))
                        .offset(x: size * 0.33, y: -size * 0.33)
                        .pulse(intensity: 0.08)
                }
            }
            .scaleEffect(isPressed ? 0.82 : 1)
        }
        .accessibilityLabel(label ?? "")
        .accessibilityHint(hint ?? "")
        .onAppear {
            // Reduce Motion: keep the static base shadow, no breathing glow.
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true)) {
                isGlowing = true
            }
        }
        .onDisappear {
            withTransaction(Transaction(animation: nil)) {
                isGlowing = false
            }
        }
    }
}

// MARK: - Themed Feed Overlay
struct ThemedFeedOverlay: View {
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    @StateObject private var viewModel = FeedViewModel()
    /// Élit le réel le plus centré dans le viewport et pilote sa lecture muette
    /// (source UNIQUE de "quel réel joue"). Call-aware via son init par défaut.
    /// Identique au chemin iPad (`FeedView.feedScrollView`).
    @StateObject private var reelAutoplay = ReelFeedAutoplayCoordinator()
    @EnvironmentObject var router: Router
    @EnvironmentObject var storyViewModel: StoryViewModel
    @EnvironmentObject var statusViewModel: StatusViewModel
    @EnvironmentObject var conversationListViewModel: ConversationListViewModel
    /// Présentation unifiée du story viewer (`.fullScreenCover(item:)` au root).
    /// Remplace l'ancien cover local `(isPresented:)` + `selectedStoryUserId`
    /// séparé, dont la capture périmée d'uid provoquait l'écran noir « introuvable ».
    @EnvironmentObject var storyViewerCoordinator: StoryViewerCoordinator
    @State private var composerText = ""
    @FocusState private var isComposerFocused: Bool
    @State private var showStatusComposer = false
    @State private var showFullComposer = false
    @State private var pendingAttachmentType: String?
    @State private var quoteOriginalPost: FeedPost?
    /// Negative scroll offset of the feed (0 at rest, more negative scrolling
    /// up) — drives the collapsing header and the reveal of the compact story
    /// trail integrated in the header's accessory slot. Mirrors `FeedView`.
    @State private var headerScrollOffset: CGFloat = 0

    // Post reaction state — socket-driven, mirrors FeedView pattern.
    @State private var postLikedIds: Set<String> = []
    @State private var postLikeDelta: [String: Int] = [:]
    @State private var postHeartInFlightIds: Set<String> = []
    @State private var postBookmarkedIds: Set<String> = []
    @State private var postBookmarkInFlightIds: Set<String> = []
    @State private var postBookmarkDelta: [String: Int] = [:]
    @State private var postRepostedIds: Set<String> = []
    @State private var postRepostInFlightIds: Set<String> = []
    @State private var postRepostDelta: [String: Int] = [:]
    @State private var postShareInFlightIds: Set<String> = []
    @State private var postShareDelta: [String: Int] = [:]
    @State private var shareableLink: ShareableLink?
    @State private var editingPost: FeedPost?

    private struct LikeRESTPayload: Decodable { let liked: Bool? }
    private struct BookmarkRESTPayload: Decodable { let bookmarked: Bool? }
    private struct SharePayload: Decodable {
        let shared: Bool?
        let shareCount: Int?
        let shortUrl: String?
        let token: String?
    }

    @MainActor
    private func togglePostHeart(post: FeedPost) {
        let postId = post.id
        Task {
            guard !postHeartInFlightIds.contains(postId) else { return }
            postHeartInFlightIds.insert(postId)
            defer { Task { @MainActor in postHeartInFlightIds.remove(postId) } }
            let wasLiked = postLikedIds.contains(postId)
            if wasLiked {
                postLikedIds.remove(postId)
                postLikeDelta[postId, default: 0] -= 1
            } else {
                postLikedIds.insert(postId)
                postLikeDelta[postId, default: 0] += 1
            }
            do {
                try await withTaskTimeout(seconds: TaskTimeoutDefaults.socialReaction) {
                    if wasLiked {
                        _ = try await SocialSocketManager.shared.removePostReaction(
                            postId: postId, emoji: StoryViewerView.heartEmoji
                        )
                    } else {
                        _ = try await SocialSocketManager.shared.addPostReaction(
                            postId: postId, emoji: StoryViewerView.heartEmoji
                        )
                    }
                }
            } catch {
                // REST fallback: only rollback if REST also fails.
                let ok = await postLikeViaREST(postId: postId, like: !wasLiked)
                if !ok {
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

    private func postLikeViaREST(postId: String, like: Bool) async -> Bool {
        do {
            let _: APIResponse<LikeRESTPayload> = try await APIClient.shared.request(
                endpoint: "/posts/\(postId)/like",
                method: like ? "POST" : "DELETE"
            )
            return true
        } catch { return false }
    }

    /// Hydrates `postBookmarkedIds` from the shared "bookmarks" cache so the
    /// filled icon shows up correctly on first render — symmetric with the
    /// FeedView helper. Cache-first; on empty/expired triggers a background
    /// refresh so the next mount is hydrated.
    private func hydrateBookmarkSeeding() async {
        let cached = await CacheCoordinator.shared.feed.load(for: "bookmarks")
        let bookmarks: [FeedPost]
        switch cached {
        case .fresh(let v, _), .stale(let v, _):
            bookmarks = v
        case .expired, .empty:
            Task(priority: .utility) {
                do {
                    let resp = try await PostService.shared.getBookmarks(cursor: nil, limit: 50)
                    let langs = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
                    let posts = resp.data.map { $0.toFeedPost(preferredLanguages: langs) }
                    try? await CacheCoordinator.shared.feed.save(posts, for: "bookmarks")
                    await MainActor.run {
                        for p in posts where !postBookmarkInFlightIds.contains(p.id) {
                            postBookmarkedIds.insert(p.id)
                        }
                    }
                } catch {
                    Logger.network.error("bookmarks refresh failed: \(error.localizedDescription)")
                }
            }
            return
        }
        for p in bookmarks where !postBookmarkInFlightIds.contains(p.id) {
            postBookmarkedIds.insert(p.id)
        }
    }

    @MainActor
    private func togglePostBookmark(postId: String) {
        guard !postBookmarkInFlightIds.contains(postId) else { return }
        let wasBookmarked = postBookmarkedIds.contains(postId)
        if wasBookmarked {
            postBookmarkedIds.remove(postId)
            postBookmarkDelta[postId, default: 0] -= 1
        } else {
            postBookmarkedIds.insert(postId)
            postBookmarkDelta[postId, default: 0] += 1
        }
        postBookmarkInFlightIds.insert(postId)
        Task {
            defer { Task { @MainActor in postBookmarkInFlightIds.remove(postId) } }
            // Capture inside the Task to avoid a race where a `post:updated`
            // socket mutates viewModel.posts between tap and cache save.
            let postSnapshot = await MainActor.run { viewModel.posts.first(where: { $0.id == postId }) }
            // Pre-populate the bookmarks cache so the Favoris tab reflects
            // the add instantly. Mirror the pre-fix FeedViewModel logic.
            let snapshotCache: [FeedPost]? = await {
                if wasBookmarked { return nil }
                guard let p = postSnapshot else { return [] }
                let key = "bookmarks"
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
            }()

            let ok: Bool = await {
                do {
                    let _: APIResponse<BookmarkRESTPayload> = try await APIClient.shared.request(
                        endpoint: "/posts/\(postId)/bookmark",
                        method: wasBookmarked ? "DELETE" : "POST"
                    )
                    return true
                } catch { return false }
            }()
            if !ok {
                if wasBookmarked {
                    postBookmarkedIds.insert(postId)
                    postBookmarkDelta[postId, default: 0] += 1
                } else {
                    postBookmarkedIds.remove(postId)
                    postBookmarkDelta[postId, default: 0] -= 1
                    if let snap = snapshotCache {
                        try? await CacheCoordinator.shared.feed.save(snap, for: "bookmarks")
                    }
                }
                FeedbackToastManager.shared.showError(String(localized: "Erreur lors de l'enregistrement", defaultValue: "Erreur lors de l'enregistrement"))
            } else {
                if wasBookmarked {
                    await pruneBookmarkFromCache(postId: postId)
                }
                FeedbackToastManager.shared.showSuccess(wasBookmarked
                    ? String(localized: "Retire des favoris", defaultValue: "Retire des favoris")
                    : String(localized: "Ajoute aux favoris", defaultValue: "Ajoute aux favoris"))
            }
        }
    }

    private func pruneBookmarkFromCache(postId: String) async {
        let key = "bookmarks"
        let result = await CacheCoordinator.shared.feed.load(for: key)
        let current: [FeedPost]
        switch result {
        case .fresh(let v, _), .stale(let v, _): current = v
        case .expired, .empty: return
        }
        let updated = current.filter { $0.id != postId }
        try? await CacheCoordinator.shared.feed.save(updated, for: key)
    }

    @MainActor
    private func togglePostRepost(postId: String) {
        guard !postRepostInFlightIds.contains(postId) else { return }
        postRepostedIds.insert(postId)
        postRepostDelta[postId, default: 0] += 1
        postRepostInFlightIds.insert(postId)
        Task {
            defer { Task { @MainActor in postRepostInFlightIds.remove(postId) } }
            do {
                _ = try await PostService.shared.repost(
                    postId: postId,
                    targetType: nil,
                    content: nil,
                    isQuote: false
                )
                FeedbackToastManager.shared.showSuccess(String(localized: "Repartage", defaultValue: "Repartage"))
            } catch {
                postRepostedIds.remove(postId)
                postRepostDelta[postId, default: 0] -= 1
                FeedbackToastManager.shared.showError(String(localized: "Erreur lors du repost", defaultValue: "Erreur lors du repost"))
            }
        }
    }

    @MainActor
    private func sharePostWithLink(postId: String) {
        guard !postShareInFlightIds.contains(postId) else { return }
        postShareInFlightIds.insert(postId)
        postShareDelta[postId, default: 0] += 1
        Task {
            defer { Task { @MainActor in postShareInFlightIds.remove(postId) } }
            if let shortUrl = await viewModel.sharePost(postId, generateLink: true),
               let url = URL(string: shortUrl) {
                shareableLink = ShareableLink(url: url)
            } else if let raw = ShareableLink.fallback(forPostId: postId) {
                shareableLink = raw
            } else {
                postShareDelta[postId, default: 0] -= 1
            }
        }
    }

    // MARK: - Feed header (mirror de « Meeshy Chats »)

    /// Header épinglé en haut du feed, même traitement visuel que le header
    /// « Meeshy Chats » (`ConversationListHeaderOverlay`) : titre dégradé indigo +
    /// action glass à droite. Ici l'action lance la vue des Réels (`presentFresh`).
    private var feedHeader: some View {
        CollapsibleHeader(
            title: "Meeshy Feed",
            scrollOffset: headerScrollOffset,
            showBackButton: false,
            titleColor: theme.textPrimary,
            backArrowColor: MeeshyColors.indigo500,
            backgroundColor: theme.backgroundPrimary,
            titleView: {
                Text("Meeshy Feed")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundStyle(
                        LinearGradient(colors: [MeeshyColors.indigo500, MeeshyColors.indigo700], startPoint: .leading, endPoint: .trailing)
                    )
            },
            trailing: {
                Button {
                    HapticFeedback.medium()
                    ReelsPresenter.shared.presentFresh()
                } label: {
                    Image(systemName: "play.rectangle.on.rectangle.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(MeeshyColors.indigo500)
                        .frame(width: 40, height: 40)
                        .adaptiveGlass(in: Circle(), interactive: true)
                }
                .accessibilityLabel(String(localized: "feed.header.reels", defaultValue: "Lancer les Réels", bundle: .main))
            },
            // Compact story trail integrated inside the header (accessory slot,
            // below the title/actions bar) — reveals as the full Story Tray
            // scrolls up under the header. Mirrors `FeedView` and the chats list.
            accessory: {
                AnyView(
                    // Lancement unifié via StoryViewerCoordinator (chemin unique trail).
                    PinnedStoryTrailBand(
                        viewModel: storyViewModel,
                        scrollOffset: headerScrollOffset
                    )
                )
            }
        )
    }

    // MARK: - Reel card (full-frame)

    /// Carte Réel plein-cadre. Réutilise EXACTEMENT les handlers optimistes de
    /// la carte standard (toggle cœur/repartage/signet/partage) + le même bloc
    /// d'ouverture viewer (`ReelsPresenter.present`). Le tap média fait d'abord le
    /// handoff (clear + pause du moteur feed) avant de présenter. Identique au
    /// chemin iPad (`FeedView.reelFeedCardView`).
    private func reelFeedCardView(for post: FeedPost) -> some View {
        ReelFeedCardContainer(
            coordinator: reelAutoplay,
            post: post,
            isDark: isDark,
            isLiked: postLikedIds.contains(post.id),
            displayLikeCount: max(0, post.likes + (postLikeDelta[post.id] ?? 0)),
            isBookmarked: postBookmarkedIds.contains(post.id),
            displayBookmarkCount: max(0, post.bookmarkCount + (postBookmarkDelta[post.id] ?? 0)),
            isReposted: postRepostedIds.contains(post.id),
            displayRepostCount: max(0, post.repostCount + (postRepostDelta[post.id] ?? 0)),
            displayShareCount: max(0, post.shareCount + (postShareDelta[post.id] ?? 0)),
            onTapMedia: {
                // Handoff : le viewer prend la session via son propre usage de
                // SharedAVPlayerManager ; on stoppe d'abord la lecture muette du
                // feed pour éviter un conflit de moteur.
                reelAutoplay.clear()
                SharedAVPlayerManager.shared.pause()
                HapticFeedback.medium()
                withAnimation(.spring(response: 0.45, dampingFraction: 0.82)) {
                    ReelsPresenter.shared.present(posts: viewModel.posts, startId: post.id)
                }
                Task { try? await PostService.shared.viewPost(postId: post.id, duration: nil) }
            },
            onTapGlyph: {
                // Le logo Réel ouvre la page détail du poste (thread complet),
                // distinct du tap média qui présente le viewer immersif.
                router.push(.postDetail(post.id, post))
                Task { try? await PostService.shared.viewPost(postId: post.id, duration: nil) }
            },
            onLike: { _ in togglePostHeart(post: post) },
            onComment: { _ in
                // Les commentaires d'un réel vivent dans le viewer plein écran :
                // même handoff que le tap média.
                reelAutoplay.clear()
                SharedAVPlayerManager.shared.pause()
                HapticFeedback.medium()
                withAnimation(.spring(response: 0.45, dampingFraction: 0.82)) {
                    ReelsPresenter.shared.present(posts: viewModel.posts, startId: post.id)
                }
                Task { try? await PostService.shared.viewPost(postId: post.id, duration: nil) }
            },
            onRepost: { postId in togglePostRepost(postId: postId) },
            onBookmark: { postId in togglePostBookmark(postId: postId) },
            onShare: { postId in sharePostWithLink(postId: postId) },
            onTapAuthor: { authorId in
                NotificationCenter.default.post(
                    name: Notification.Name("openProfileSheet"),
                    object: ["userId": authorId, "username": post.authorUsername ?? post.author]
                )
            }
        )
        // Marge latérale plus serrée que les posts standards (`FeedPostCard` = 16)
        // → la carte Réel est un peu plus large sur iPhone, tout en gardant une
        // séparation nette des bords.
        .padding(.horizontal, 12)
    }

    // MARK: - Standard post card

    private func standardFeedPostCardView(for post: FeedPost) -> FeedPostCard {
        FeedPostCard(
            post: post,
            isLiked: postLikedIds.contains(post.id),
            displayLikeCount: max(0, post.likes + (postLikeDelta[post.id] ?? 0)),
            isHeartInFlight: postHeartInFlightIds.contains(post.id),
            isBookmarked: postBookmarkedIds.contains(post.id),
            isBookmarkInFlight: postBookmarkInFlightIds.contains(post.id),
            displayRepostCount: max(0, post.repostCount + (postRepostDelta[post.id] ?? 0)),
            displayBookmarkCount: max(0, post.bookmarkCount + (postBookmarkDelta[post.id] ?? 0)),
            displayShareCount: max(0, post.shareCount + (postShareDelta[post.id] ?? 0)),
            isReposted: postRepostedIds.contains(post.id),
            isRepostInFlight: postRepostInFlightIds.contains(post.id),
            isShareInFlight: postShareInFlightIds.contains(post.id),
            onLike: { _ in
                togglePostHeart(post: post)
            },
            onRepost: { postId in
                togglePostRepost(postId: postId)
            },
            onQuote: { postId in
                quoteOriginalPost = viewModel.posts.first(where: { $0.id == postId })
            },
            onShare: { postId in
                sharePostWithLink(postId: postId)
            },
            onBookmark: { postId in
                togglePostBookmark(postId: postId)
            },
            onSendComment: { postId, content, parentId in
                Task { await viewModel.sendComment(postId: postId, content: content, parentId: parentId) }
            },
            onTapPost: { post in
                router.push(.postDetail(post.id, post))
            },
            onTapRepost: { repostId in
                router.push(.postDetail(repostId))
            },
            onDelete: post.authorId == AuthManager.shared.currentUser?.id ? { postId in
                Task { await viewModel.deletePost(postId) }
            } : nil,
            onReport: post.authorId != AuthManager.shared.currentUser?.id ? { postId in
                Task { await viewModel.reportPost(postId) }
            } : nil,
            onEdit: post.authorId == AuthManager.shared.currentUser?.id ? { post in
                editingPost = post
            } : nil,
            authorMoodEmoji: statusViewModel.statusForUser(userId: post.authorId)?.moodEmoji,
            onAuthorMoodTap: statusViewModel.moodTapHandler(for: post.authorId),
            moodLookup: { userId in
                (emoji: statusViewModel.statusForUser(userId: userId)?.moodEmoji,
                 tapHandler: statusViewModel.moodTapHandler(for: userId))
            },
            authorStoryRing: storyViewModel.storyRingState(forUserId: post.authorId),
            onViewAuthorStory: {
                // Contexte « personne précise » → singleGroup, via le coordinator unique.
                storyViewerCoordinator.present(
                    StoryViewerRequest(id: post.authorId, startAtFirstUnviewed: true, singleGroup: true)
                )
            }
        )
    }

    var body: some View {
        ZStack {
            // Background
            ZStack {
                theme.backgroundGradient

                Circle()
                    .fill(MeeshyColors.indigo400.opacity(isDark ? 0.1 : 0.06))
                    .frame(width: 300, height: 300)
                    .blur(radius: 80)
                    .offset(x: -80, y: -100)
                    .floating(range: 20, duration: 5.0)

                Circle()
                    .fill(MeeshyColors.error.opacity(isDark ? 0.1 : 0.06))
                    .frame(width: 250, height: 250)
                    .blur(radius: 70)
                    .offset(x: 100, y: 200)
                    .floating(range: 18, duration: 6.0)
            }
            .ignoresSafeArea()

            // GeometryReader extérieur : fournit les bornes globales du viewport au
            // coordinator d'autoplay. Les cartes réel publient leur frame (.global)
            // via `reportReelFrame` ; `onPreferenceChange` les agrège et élit le réel
            // centré (iOS 16-compatible). Identique à `FeedView.feedScrollView`.
            GeometryReader { viewportProxy in
                let viewportFrame = viewportProxy.frame(in: .global)
                // Branded pull-to-refresh + scroll-offset tracking (drives the
                // collapsing header and the compact story-trail reveal). The
                // `topPadding` reserves the header height so the full Story Tray
                // glides up under the header on scroll. Mirrors `FeedView`.
                MeeshyRefreshableScroll(
                    onRefresh: {
                        await viewModel.refresh()
                        await storyViewModel.loadStories()
                        await statusViewModel.loadStatuses()
                    },
                    coordinateSpaceName: "feedScroll",
                    onScrollOffsetChange: { offset in
                        headerScrollOffset = offset
                    },
                    topPadding: CollapsibleHeaderMetrics.expandedHeight
                ) {
                LazyVStack(spacing: 14) {
                    // Story Tray — lancement unifié via StoryViewerCoordinator
                    // (même chemin que la liste de conversations), pas de cover local.
                    StoryTrayView(viewModel: storyViewModel, onAddStatus: {
                        showStatusComposer = true
                    })

                    // Composer placeholder — tap to open full composer
                    Button {
                        showFullComposer = true
                        HapticFeedback.light()
                    } label: {
                        HStack(spacing: 12) {
                            MeeshyAvatar(
                                name: getUserDisplayName(AuthManager.shared.currentUser, fallback: "M"),
                                context: .feedComposer
                            )

                            Text(String(localized: "composer.placeholder.share", defaultValue: "Share something…", bundle: .main))
                                .font(.footnote)
                                .foregroundColor(theme.textMuted)

                            Spacer()

                            Image(systemName: "photo.on.rectangle.angled")
                                .font(.system(size: 16))
                                .foregroundColor(MeeshyColors.indigo400)
                        }
                        .padding(12)
                        .background(
                            RoundedRectangle(cornerRadius: 16)
                                .fill(theme.inputBackground)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 16)
                                        .stroke(theme.inputBorder, lineWidth: 1)
                                )
                        )
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 16)

                    // Feed posts with infinite scroll. Les Réels (`type == REEL`)
                    // rendent plein-cadre via `reelFeedCardView` ; les autres via
                    // la carte standard. Même routage que le chemin iPad
                    // (`FeedView.feedPostCardView`).
                    ForEach(Array(viewModel.posts.enumerated()), id: \.element.id) { index, post in
                        Group {
                            if post.isReel {
                                reelFeedCardView(for: post)
                            } else {
                                standardFeedPostCardView(for: post)
                                    .equatable()
                            }
                        }
                        .staggeredAppear(index: index, baseDelay: 0.06)
                        .onAppear {
                            Task { await viewModel.loadMoreIfNeeded(currentPost: post) }
                            viewModel.prefetchComments(post.id)
                        }
                    }

                    // Loading indicator
                    if viewModel.isLoadingMore {
                        ProgressView()
                            .tint(MeeshyColors.brandPrimary)
                            .padding()
                    }
                }
                .padding(.bottom, 100)
                }
                .onPreferenceChange(ReelVisibilityPreferenceKey.self) { frames in
                    reelAutoplay.update(
                        frames: frames,
                        viewportMinY: viewportFrame.minY,
                        viewportMaxY: viewportFrame.maxY
                    )
                }
            }
        }
        .overlay(alignment: .top) {
            // Header « Meeshy Feed » épinglé : le `MeeshyRefreshableScroll`
            // réserve `CollapsibleHeaderMetrics.expandedHeight` en tête (topPadding)
            // pour que le contenu glisse dessous au scroll et que la trail compacte
            // se révèle dans le slot accessory.
            feedHeader
        }
        .task {
            if viewModel.posts.isEmpty {
                await viewModel.loadFeed()
            }
            let newLiked = FeedView.computePostLikedIds(from: viewModel.posts)
            for id in newLiked where !postLikedIds.contains(id) && postLikeDelta[id] == nil {
                postLikedIds.insert(id)
            }
            // Seed bookmark/repost from server-enriched fields.
            for post in viewModel.posts {
                if post.isBookmarkedByMe && !postBookmarkInFlightIds.contains(post.id) {
                    postBookmarkedIds.insert(post.id)
                }
                if post.isRepostedByMe && !postRepostInFlightIds.contains(post.id) {
                    postRepostedIds.insert(post.id)
                }
            }
            await hydrateBookmarkSeeding()
            viewModel.subscribeToSocketEvents()
            await storyViewModel.loadStories()
            await statusViewModel.loadStatuses()
        }
        .adaptiveOnChange(of: viewModel.posts) { _, newPosts in
            for post in newPosts where postLikeDelta[post.id] == nil && !postHeartInFlightIds.contains(post.id) {
                if post.isLiked {
                    postLikedIds.insert(post.id)
                } else {
                    postLikedIds.remove(post.id)
                }
            }
            for post in newPosts where postBookmarkDelta[post.id] == nil && !postBookmarkInFlightIds.contains(post.id) {
                if post.isBookmarkedByMe {
                    postBookmarkedIds.insert(post.id)
                }
            }
            for post in newPosts where postRepostDelta[post.id] == nil && !postRepostInFlightIds.contains(post.id) {
                if post.isRepostedByMe {
                    postRepostedIds.insert(post.id)
                }
            }
        }
        .onReceive(SocialSocketManager.shared.postReactionAdded.receive(on: DispatchQueue.main)) { event in
            let heart = StoryViewerView.heartEmoji
            guard event.emoji == heart else { return }
            let currentUserId = AuthManager.shared.currentUser?.id
            if event.userId == currentUserId {
                postLikedIds.insert(event.postId)
            } else {
                postLikeDelta[event.postId, default: 0] += 1
            }
        }
        .onReceive(SocialSocketManager.shared.postReactionRemoved.receive(on: DispatchQueue.main)) { event in
            let heart = StoryViewerView.heartEmoji
            guard event.emoji == heart else { return }
            let currentUserId = AuthManager.shared.currentUser?.id
            if event.userId == currentUserId {
                postLikedIds.remove(event.postId)
            } else {
                postLikeDelta[event.postId, default: 0] -= 1
            }
        }
        .onDisappear {
            viewModel.unsubscribeFromSocketEvents()
        }
        .sheet(item: $shareableLink) { link in
            // Same TrackingLink share sheet as FeedView — every external
            // touchpoint funnels through `meeshy.me/l/<token>`.
            ShareSheet(activityItems: [link.url])
        }
        .sheet(item: $editingPost) { post in
            EditPostSheet(
                originalContent: post.content,
                originalLanguage: post.originalLanguage,
                originalType: post.type,
                canBeReel: post.hasMedia,
                media: post.media.map { EditablePostMedia($0) },
                isRepost: post.repost != nil,
                onSave: { draft in
                    await viewModel.updatePost(post.id, content: draft.content, language: draft.language, type: draft.type, removeMediaIds: draft.removeMediaIds.isEmpty ? nil : draft.removeMediaIds)
                },
                onDismiss: { editingPost = nil }
            )
        }
        // Story viewer : présentation unifiée via StoryViewerCoordinator au root
        // (`.fullScreenCover(item:)`). L'ancien cover local `(isPresented:)` +
        // `selectedStoryUserId` séparé est supprimé (capture périmée d'uid → écran noir).
        .sheet(isPresented: $showStatusComposer) {
            StatusComposerView(viewModel: statusViewModel)
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
        .fullScreenCover(isPresented: $showFullComposer) {
            FeedComposerSheet(
                viewModel: viewModel,
                initialText: composerText,
                pendingAttachmentType: pendingAttachmentType,
                onDismiss: {
                    showFullComposer = false
                    pendingAttachmentType = nil
                    composerText = ""
                }
            )
        }
        .fullScreenCover(item: $quoteOriginalPost) { quoted in
            FeedComposerSheet(
                viewModel: viewModel,
                initialText: "",
                pendingAttachmentType: nil,
                quotePost: quoted,
                onDismiss: {
                    quoteOriginalPost = nil
                }
            )
        }
    }
}
