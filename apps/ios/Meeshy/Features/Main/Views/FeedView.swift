import SwiftUI
import PhotosUI
import CoreLocation
import Combine
import os
import MeeshySDK
import MeeshyUI


// MARK: - ShareableLink

/// Identifiable wrapper around the freshly-minted post/story share URL so
/// SwiftUI's `.sheet(item:)` can drive presentation directly. `URL` doesn't
/// conform to `Identifiable`; wrapping is the lightest fix without leaking
/// state booleans across the view tree.
struct ShareableLink: Identifiable {
    let id = UUID()
    let url: URL

    /// Public web origin posts/stories live on. Hardcoded to the production
    /// host because an external share must always resolve from a third-party
    /// network — a staging URL would dead-end for the recipient.
    static let webBaseURL = "https://meeshy.me"

    /// Raw post detail URL used as a graceful fallback when the gateway can't
    /// mint a TrackingLink (offline, rate-limited, etc.). The recipient still
    /// lands on the post; only the attribution analytics are skipped.
    /// Mirrors the `originalUrl` the gateway uses when minting the link.
    static func fallback(forPostId postId: String) -> ShareableLink? {
        URL(string: "\(webBaseURL)/feeds/post/\(postId)").map { ShareableLink(url: $0) }
    }
}

// MARK: - Feed View
struct FeedView: View {
    private static let logger = Logger(subsystem: "me.meeshy.app", category: "feed")
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.horizontalSizeClass) private var sizeClass
    @EnvironmentObject private var router: Router
    @EnvironmentObject private var statusViewModel: StatusViewModel
    // Stories in the iPad feed: the tray reads the shared StoryViewModel (loaded
    // by `iPadRootView`). FeedView is iPad-only, so these objects are always
    // injected by `iPadRootView`'s environment.
    @EnvironmentObject private var storyViewModel: StoryViewModel
    @EnvironmentObject private var conversationListViewModel: ConversationListViewModel
    // Présentation unifiée du viewer de story (même coordinator que la story tray
    // et que `ThemedFeedOverlay` côté iPhone). Injecté par `iPadRootView`.
    @EnvironmentObject private var storyViewerCoordinator: StoryViewerCoordinator
    @StateObject var viewModel = FeedViewModel()
    /// Élit le réel le plus centré dans le viewport et pilote sa lecture muette
    /// (source UNIQUE de "quel réel joue"). Call-aware via son init par défaut.
    @StateObject private var reelAutoplay = ReelFeedAutoplayCoordinator()
    /// When true, use the UIKit-backed FeedListView for high-performance scrolling.
    /// Set to false to keep the existing SwiftUI ScrollView path.
    @State private var useUIKitList = false
    @State private var searchText = ""
    @State var showComposer = false
    @FocusState var isComposerFocused: Bool
    @State private var composerBounce: Bool = false
    @State var composerText = ""
    @State private var expandedComments: Set<String> = []
    @State var postVisibility: String = "PUBLIC"
    /// Media posts default to a REEL; the author can force a plain POST via the
    /// composer's Réel⇄Post toggle, keeping it out of the reels surface.
    @State var composerForcePlainPost = false
    @State private var showAudioComposer = false
    @State var composerLanguage: String = DefaultComposerLanguage.resolve()
    @State var showComposerLanguagePicker = false
    @State private var headerScrollOffset: CGFloat = 0
    /// Holds the freshly-minted `meeshy.me/l/<token>` URL when the user taps
    /// the share button on a post — the `.sheet` further down presents the
    /// system share UI as soon as this is non-nil and clears it on dismiss.
    @State private var shareableLink: ShareableLink?
    @State private var editingPost: FeedPost?
    /// Réel dont les commentaires sont présentés en feuille depuis le feed. Le
    /// bouton « commentaire » d'une carte réel ouvre la `CommentsSheetView`
    /// DIRECTEMENT (parité avec les cartes post du feed) au lieu de pousser le
    /// viewer plein écran — l'utilisateur commente sans quitter le fil.
    @State private var reelCommentsPost: FeedPost?

    // Post reaction state — hoisted to parent so socket events update all cards without
    // mutating FeedPost values (pure socket-driven path, mirrors FeedCommentsSheet pattern).
    // Feed list does NOT join individual post rooms (too many rooms for a scrolling list).
    // Room join only happens in PostDetailView for the single focused post.
    @State private var postLikedIds: Set<String> = []
    @State private var postLikeDelta: [String: Int] = [:]
    @State private var postHeartInFlightIds: Set<String> = []
    // Optimistic bookmark / repost / share states. FeedPost has no
    // server-issued `isBookmarked`/`isReposted` so the parent View tracks
    // them locally — toggled on tap, cleared on API failure.
    @State private var postBookmarkedIds: Set<String> = []
    @State private var postBookmarkInFlightIds: Set<String> = []
    @State private var postBookmarkDelta: [String: Int] = [:]
    @State private var postRepostedIds: Set<String> = []
    @State private var postRepostInFlightIds: Set<String> = []
    @State private var postRepostDelta: [String: Int] = [:]
    @State private var postShareInFlightIds: Set<String> = []
    @State private var postShareDelta: [String: Int] = [:]

    // Impression tracking
    @State private var pendingImpressionIds = Set<String>()
    @State private var recordedImpressionIds = Set<String>()
    @State private var impressionFlushTask: Task<Void, Never>?

    // Attachment states
    @State var pendingAttachments: [MessageAttachment] = []
    @State var pendingMediaFiles: [String: URL] = [:]
    @State var pendingThumbnails: [String: UIImage] = [:]
    @State var pendingAudioURL: URL?
    /// `clientMutationId` of a post/reel recovered from the offline queue and
    /// pre-filled as a draft when the composer opened onto a stuck unsent post.
    /// The re-send supersedes this row so it replaces the stuck one (no duplicate
    /// on reconnect). `nil` when the compose is fresh.
    @State var recoveredPostCmid: String?

    /// In-flight preparations rendered as loading tiles in the attachments
    /// row. Each entry is promoted to `pendingAttachments` once it reaches
    /// `.ready`. Source-of-truth pipeline:
    /// `AttachmentPreparationService` (apps/ios/.../Services).
    @State var preparingAttachments: [PreparingAttachment] = []
    @State var showPhotoPicker = false
    @State var selectedPhotoItems: [PhotosPickerItem] = []
    @State var showCamera = false
    @State var showFilePicker = false
    @State var showLocationPicker = false
    @State var isUploading = false
    @State var uploadProgress: UploadQueueProgress?
    @State var isLoadingMedia = false
    @StateObject var audioRecorder = AudioRecorderManager()
    @State private var pendingAttachmentType: String?
    @State var showEmojiPicker = false
    @State private var quoteTargetPost: FeedPost?

    var composerHasContent: Bool {
        !composerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !pendingAttachments.isEmpty
    }

    // MARK: - Post Heart Seeding (Prisme Linguistique — reaction state)

    /// Seeds `postLikedIds` from a batch of posts using `post.isLiked` (which the SDK
    /// derives from `APIPost.currentUserReactions`/`isLikedByMe`). Called on initial
    /// load and when new pages arrive. Existing optimistic state is preserved: a post
    /// already in `postLikedIds` due to an in-flight toggle is not overwritten.
    static func computePostLikedIds(from posts: [FeedPost]) -> Set<String> {
        Set(posts.compactMap { $0.isLiked ? $0.id : nil })
    }

    // MARK: - Post Bookmark Seeding

    /// Hydrates `postBookmarkedIds` from the shared "bookmarks" cache so the
    /// filled icon shows up correctly on first render for posts the user has
    /// already bookmarked. Cache-first, never hits the network — the actual
    /// bookmarks list is refreshed by `BookmarksViewModel` when the user
    /// opens the Favoris tab. Preserves any optimistic state already in
    /// flight by only inserting new IDs.
    private func hydrateBookmarkSeeding() async {
        let cached = await CacheCoordinator.shared.feed.load(for: "bookmarks")
        let bookmarks: [FeedPost]
        switch cached {
        case .fresh(let v, _), .stale(let v, _):
            bookmarks = v
        case .expired, .empty:
            // Fire-and-forget a background refresh so the next render is
            // hydrated correctly without blocking the current mount.
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
                } catch { /* offline / 5xx — bookmarks stay unseeded, no UX harm */ }
            }
            return
        }
        for p in bookmarks where !postBookmarkInFlightIds.contains(p.id) {
            postBookmarkedIds.insert(p.id)
        }
    }

    // MARK: - Post Heart Toggle (socket-driven)

    @MainActor
    private func togglePostHeart(post: FeedPost) {
        let postId = post.id
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
                // A6 — hard timeout so the heart-in-flight set never leaks
                // if SocialSocketManager hangs (no server reply, dead
                // socket, etc.). Budget owned by TaskTimeoutDefaults.
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
                // REST fallback when the socket fails (noSocket, timeout,
                // gateway hiccup). Mirrors the SocialSocketManager call but
                // hits the persisted `POST/DELETE /posts/:id/like` route.
                // Only roll the optimistic update back if the REST call
                // also fails — that keeps the heart visible whenever the
                // server actually recorded the toggle.
                let restOK = await postReactionViaREST(postId: postId, like: !wasLiked)
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

    /// Minimal decoder for the `liked` flag returned by both the like and
    /// unlike REST routes. Ignores `reactionSummary` (heterogeneous) and any
    /// other fields the gateway may add.
    private struct LikeRESTPayload: Decodable { let liked: Bool? }

    /// REST fallback for the heart toggle. Returns true on success so the
    /// caller can skip rolling back its optimistic update.
    private func postReactionViaREST(postId: String, like: Bool) async -> Bool {
        do {
            let _: APIResponse<LikeRESTPayload> = try await APIClient.shared.request(
                endpoint: "/posts/\(postId)/like",
                method: like ? "POST" : "DELETE"
            )
            return true
        } catch {
            return false
        }
    }

    // MARK: - Bookmark / Repost / Share toggles (optimistic, ViewModel-backed)

    @MainActor
    private func togglePostBookmark(postId: String) {
        guard !postBookmarkInFlightIds.contains(postId) else { return }
        let wasBookmarked = postBookmarkedIds.contains(postId)
        // Optimistic flip — UI changes instantly, network confirms after.
        if wasBookmarked {
            postBookmarkedIds.remove(postId)
            postBookmarkDelta[postId, default: 0] -= 1
        } else {
            postBookmarkedIds.insert(postId)
            postBookmarkDelta[postId, default: 0] += 1
        }
        postBookmarkInFlightIds.insert(postId)
        Task {
            defer {
                Task { @MainActor in
                    postBookmarkInFlightIds.remove(postId)
                }
            }
            // Capture the post snapshot INSIDE the Task on the MainActor —
            // outside-capture would freeze a value that a `post:updated`
            // socket event might invalidate between the tap and the cache
            // save (race window ~100ms).
            let postSnapshot = await MainActor.run { viewModel.posts.first(where: { $0.id == postId }) }
            // Pre-populate the bookmarks cache optimistically so the Favoris
            // tab shows the post the moment the user opens it. Mirror the
            // pre-fix behaviour from FeedViewModel.bookmarkPost.
            let snapshotCache: [FeedPost]? = await {
                if wasBookmarked { return nil } // remove path handles cache below
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

            let success = await callBookmarkAPI(postId: postId, bookmark: !wasBookmarked)
            if success {
                if wasBookmarked {
                    await pruneBookmarkFromCache(postId: postId)
                    FeedbackToastManager.shared.showSuccess(String(localized: "Retire des favoris", defaultValue: "Retire des favoris"))
                } else {
                    FeedbackToastManager.shared.showSuccess(String(localized: "Ajoute aux favoris", defaultValue: "Ajoute aux favoris"))
                }
            } else {
                // Rollback both the UI flip and the cache pre-population.
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
            }
        }
    }

    private func callBookmarkAPI(postId: String, bookmark: Bool) async -> Bool {
        do {
            let _: APIResponse<[String: Bool]> = try await APIClient.shared.request(
                endpoint: "/posts/\(postId)/bookmark",
                method: bookmark ? "POST" : "DELETE"
            )
            return true
        } catch {
            return false
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
        // Reposts are append-only on the backend — the optimistic state
        // only persists if the server confirmed the create. Bypass the
        // ViewModel call because it swallows errors via Toast and leaves
        // no signal we can rollback against.
        postRepostedIds.insert(postId)
        postRepostDelta[postId, default: 0] += 1
        postRepostInFlightIds.insert(postId)
        Task {
            defer {
                Task { @MainActor in
                    postRepostInFlightIds.remove(postId)
                }
            }
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
        // Optimistic share counter bump — the gateway always increments
        // shareCount on POST /posts/:id/share regardless of mint success,
        // so we mirror that even when we fall back to the raw URL.
        postShareDelta[postId, default: 0] += 1
        Task {
            defer {
                Task { @MainActor in
                    postShareInFlightIds.remove(postId)
                }
            }
            if let shortUrl = await viewModel.sharePost(postId, generateLink: true),
               let url = URL(string: shortUrl) {
                shareableLink = ShareableLink(url: url)
            } else if let raw = ShareableLink.fallback(forPostId: postId) {
                shareableLink = raw
            } else {
                // Both REST and fallback failed → undo the optimistic bump.
                postShareDelta[postId, default: 0] -= 1
            }
        }
    }

    private var composerLanguageDisplayName: String {
        let name = Locale.current.localizedString(forLanguageCode: composerLanguage) ?? composerLanguage
        return name.prefix(1).uppercased() + name.dropFirst()
    }

    private var posts: [FeedPost] { viewModel.posts }

    private var newPostsBannerText: String {
        let count = viewModel.newPostsCount
        let label = count > 1
            ? String(localized: "nouveaux posts", defaultValue: "nouveaux posts")
            : String(localized: "nouveau post", defaultValue: "nouveau post")
        return "\(count) \(label)"
    }

    var body: some View {
        ZStack {
            // Themed background
            theme.backgroundGradient.ignoresSafeArea()

            // Ambient orbs
            ForEach(0..<theme.ambientOrbs.count, id: \.self) { i in
                let orb = theme.ambientOrbs[i]
                Circle()
                    .fill(Color(hex: orb.color).opacity(orb.opacity))
                    .frame(width: orb.size, height: orb.size)
                    .blur(radius: orb.size / 3)
                    .offset(x: orb.offset.x, y: orb.offset.y)
            }

            if useUIKitList, let store = viewModel.feedStore {
                FeedListView(store: store)
            } else {
                feedScrollView
            }

            // Header shown on iPhone AND iPad: the scroll content already
            // reserves `CollapsibleHeaderMetrics.expandedHeight` of top padding,
            // so on iPad it simply fills the space that was previously left empty.
            VStack(spacing: 0) {
                // Compact story trail integrated inside the header (accessory
                // slot) — reveals as the full-size trail scrolls up under it.
                CollapsibleHeader(
                    title: "Meeshy Feed",
                    scrollOffset: headerScrollOffset,
                    showBackButton: false,
                    titleColor: theme.textPrimary,
                    backArrowColor: MeeshyColors.indigo500,
                    backgroundColor: theme.backgroundPrimary,
                    accessory: {
                        AnyView(
                            // Lancement unifié via StoryViewerCoordinator (cf.
                            // PinnedStoryTrailBand.presentStory) — même chemin que la trail des chats.
                            PinnedStoryTrailBand(
                                viewModel: storyViewModel,
                                scrollOffset: headerScrollOffset
                            )
                        )
                    }
                )
                Spacer()
            }

            // Full-screen composer overlay
            if showComposer {
                composerOverlay
                    // Draft recovery: when the composer opens onto an empty
                    // compose, pre-fill the last post/reel that got stuck offline.
                    .task { await recoverStuckPostDraftIfNeeded() }
            }
        }
    }

    // MARK: - Composer Placeholder
    private var composerPlaceholder: some View {
        HStack(spacing: 12) {
            // Avatar
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [MeeshyColors.error, MeeshyColors.indigo300],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 40, height: 40)

                Text("M")
                    .font(.headline.weight(.bold))
                    .foregroundColor(.white)
            }
            .accessibilityHidden(true)

            // Text input placeholder
            Button(action: {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showComposer = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        isComposerFocused = true
                    }
                }
                HapticFeedback.light()
            }) {
                HStack {
                    Text(String(localized: "Partager quelque chose avec le monde...", defaultValue: "Partager quelque chose avec le monde..."))
                        .font(.subheadline)
                        .foregroundColor(theme.textMuted)
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 20)
                        .fill(theme.inputBackground)
                        .overlay(
                            RoundedRectangle(cornerRadius: 20)
                                .stroke(theme.inputBorder, lineWidth: 1)
                        )
                )
            }
            .buttonStyle(PlainButtonStyle())
            .accessibilityLabel(String(localized: "a11y.feed.compose.open", defaultValue: "Partager quelque chose", bundle: .main))
            .accessibilityHint(String(localized: "a11y.feed.compose.open.hint", defaultValue: "Ouvre l'éditeur de publication", bundle: .main))

            // Add content button (+)
            Menu {
                Button {
                    pendingAttachmentType = "photo"
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showComposer = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                            showPhotoPicker = true
                        }
                    }
                    HapticFeedback.light()
                } label: {
                    Label(
                        String(localized: "Photo ou video", defaultValue: "Photo ou vid\u{00E9}o"),
                        systemImage: "photo.fill"
                    )
                }

                Button {
                    pendingAttachmentType = "camera"
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showComposer = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                            showCamera = true
                        }
                    }
                    HapticFeedback.light()
                } label: {
                    Label(
                        String(localized: "Appareil photo", defaultValue: "Appareil photo"),
                        systemImage: "camera.fill"
                    )
                }

                Button {
                    showAudioComposer = true
                    HapticFeedback.light()
                } label: {
                    Label(
                        String(localized: "Enregistrement audio", defaultValue: "Enregistrement audio"),
                        systemImage: "mic.fill"
                    )
                }

                Button {
                    pendingAttachmentType = "file"
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showComposer = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                            showFilePicker = true
                        }
                    }
                    HapticFeedback.light()
                } label: {
                    Label(
                        String(localized: "Fichier", defaultValue: "Fichier"),
                        systemImage: "doc.fill"
                    )
                }

                Button {
                    pendingAttachmentType = "location"
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showComposer = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                            showLocationPicker = true
                        }
                    }
                    HapticFeedback.light()
                } label: {
                    Label(
                        String(localized: "Position", defaultValue: "Position"),
                        systemImage: "location.fill"
                    )
                }
            } label: {
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [MeeshyColors.indigo300, MeeshyColors.info],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 40, height: 40)
                        .shadow(color: MeeshyColors.indigo300.opacity(0.4), radius: 8, y: 4)

                    Image(systemName: "plus")
                        // Doctrine 86i : glyphe du FAB dans un cercle de dimension fixe 40×40 → figé
                        // (l'icône ne doit pas déborder du bouton flottant). Bouton déjà labellisé.
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(.white)
                }
            }
            .accessibilityLabel(String(localized: "Ajouter du contenu", defaultValue: "Ajouter du contenu"))
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(theme.surfaceGradient(tint: MeeshyColors.brandPrimaryHex))
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(theme.border(tint: MeeshyColors.brandPrimaryHex, intensity: 0.25), lineWidth: 1)
                )
        )
        .padding(.horizontal, 16)
    }

    // MARK: - Feed Post Card
    @ViewBuilder
    private func feedPostCardView(for post: FeedPost) -> some View {
        // On iPad/Mac (regular width) the feed lives in a narrow column where a
        // full-bleed reel card looks crude, so reels render as the standard
        // compact card there (author header + bounded media + action bar) for
        // parity with the iPhone feed. iPhone keeps the immersive full-frame card.
        if post.isReel && sizeClass != .regular {
            reelFeedCardView(for: post)
        } else {
            standardFeedPostCardView(for: post)
        }
    }

    /// Carte Réel plein-cadre. Réutilise EXACTEMENT les handlers optimistes de
    /// `standardFeedPostCardView` (toggle cœur/repartage/signet/partage) + le
    /// même bloc d'ouverture viewer (`ReelsPresenter.present`). Le tap média
    /// fait d'abord le handoff (clear + pause du moteur feed) avant de présenter.
    private func reelFeedCardView(for post: FeedPost) -> some View {
        // `ReelFeedCardContainer` observe le coordinator et calcule `isActive` en
        // interne : le body de FeedView ne dépend donc pas d'`activeReelId` (I1).
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
                // Le bouton commentaire d'un réel ouvre la feuille de commentaires
                // DIRECTEMENT (parité avec les cartes post du feed) — l'utilisateur
                // commente sans basculer dans le viewer plein écran. La lecture
                // muette du feed continue derrière la feuille (translucide).
                HapticFeedback.medium()
                reelCommentsPost = post
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
        // Marge latérale volontairement plus serrée que les posts standards
        // (`FeedPostCard` = 16) → la carte Réel est un peu plus large, tout en
        // gardant une séparation nette des bords et des boutons flottants.
        .padding(.horizontal, 12)
        // Pas de `.equatable()` ici : le conteneur observe le coordinator (non
        // Equatable). Le court-circuit Equatable vit à l'intérieur, sur `ReelFeedCard`.
    }

    private func standardFeedPostCardView(for post: FeedPost) -> some View {
        let isOwnPost = post.authorId == AuthManager.shared.currentUser?.id
        return FeedPostCard(
            post: post,
            isCommentsExpanded: expandedComments.contains(post.id),
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
            onToggleComments: {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    if expandedComments.contains(post.id) {
                        expandedComments.remove(post.id)
                    } else {
                        expandedComments.insert(post.id)
                    }
                }
                HapticFeedback.light()
            },
            onLike: { _ in
                togglePostHeart(post: post)
            },
            onRepost: { postId in
                togglePostRepost(postId: postId)
            },
            onQuote: { postId in
                quoteTargetPost = viewModel.posts.first(where: { $0.id == postId })
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
            onSelectLanguage: { postId, language in
                viewModel.setTranslationOverride(postId: postId, language: language)
            },
            onTapPost: { post in
                if post.isReel {
                    // Reels open straight into the immersive full-screen pager,
                    // seeded with the feed's reels, never the detail page.
                    HapticFeedback.medium()
                    withAnimation(.spring(response: 0.45, dampingFraction: 0.82)) {
                        ReelsPresenter.shared.present(
                            posts: viewModel.posts,
                            startId: post.id
                        )
                    }
                    Task { try? await PostService.shared.viewPost(postId: post.id, duration: nil) }
                } else {
                    router.push(.postDetail(post.id, post))
                    Task { try? await PostService.shared.viewPost(postId: post.id, duration: nil) }
                }
            },
            onTapRepost: { repostId in
                router.push(.postDetail(repostId))
            },
            onDelete: isOwnPost ? { postId in
                Task { await viewModel.deletePost(postId) }
            } : nil,
            onReport: !isOwnPost ? { postId in
                Task { await viewModel.reportPost(postId) }
            } : nil,
            onPin: isOwnPost ? { postId in
                Task { await viewModel.pinPost(postId) }
            } : nil,
            onEdit: isOwnPost ? { post in
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
                // Parité iPhone (`ThemedFeedOverlay`) : toucher l'avatar d'un auteur
                // qui a une story ouvre SA story via le coordinator unique. Sans ce
                // câblage, l'anneau de story et le tap étaient inertes sur iPad.
                storyViewerCoordinator.present(
                    StoryViewerRequest(id: post.authorId, startAtFirstUnviewed: true, singleGroup: true)
                )
            },
            // RF2: a POST that reposts a REEL renders inside FeedPostCard (not the
            // immersive reel card) — hand it the shared autoplay coordinator so the
            // embedded reel plays muted/inline, elected against the native reels.
            reelAutoplay: reelAutoplay
        )
        .equatable()
    }

    // MARK: - Feed Scroll View
    private var feedScrollView: some View {
        // GeometryReader extérieur : fournit les bornes globales du viewport au
        // coordinator d'autoplay. Les cartes réel publient leur frame (.global)
        // via `reportReelFrame` ; `onPreferenceChange` les agrège et élit le réel
        // centré. iOS 16-compatible (pas d'API scroll iOS 17).
        GeometryReader { viewportProxy in
            let viewportFrame = viewportProxy.frame(in: .global)
            scrollContent
                .onPreferenceChange(ReelVisibilityPreferenceKey.self) { frames in
                    reelAutoplay.update(
                        frames: frames,
                        viewportMinY: viewportFrame.minY,
                        viewportMaxY: viewportFrame.maxY
                    )
                }
        }
    }

    private var scrollContent: some View {
        ScrollViewReader { scrollProxy in
            // Wrapper Meeshy : `.refreshable` natif iOS + indicator brand
            // anime (logo dashes + degrade indigo). Meme experience que la
            // liste de conversations — UX coherente cross-screen.
            MeeshyRefreshableScroll(
                onRefresh: {
                    await viewModel.refresh()
                },
                coordinateSpaceName: "feedScroll",
                onScrollOffsetChange: { offset in
                    headerScrollOffset = offset
                },
                topPadding: CollapsibleHeaderMetrics.expandedHeight
            ) {
                LazyVStack(spacing: 16) {
                    // Anchor pour le banner "nouveaux posts" → scroll vers
                    // le haut. L'id est attache a un Color.clear de hauteur 0
                    // au sommet du contenu.
                    Color.clear.frame(height: 0).id("feed-top")

                    // Story tray — same component used by the conversation list
                    // and the iPhone feed so stories load identically here. Le tap
                    // ouvre le viewer via StoryViewerCoordinator (chemin unique),
                    // exactement comme la liste de conversations.
                    StoryTrayView(viewModel: storyViewModel)

                    // Composer placeholder
                    composerPlaceholder
                        .padding(.bottom, 8)

                    // Connection status banner (banner manages its own socket observation)
                    ConnectionBanner()

                    // Error state
                    if let error = viewModel.error {
                        VStack(spacing: 12) {
                            Image(systemName: "exclamationmark.triangle")
                                .font(.largeTitle)
                                .foregroundStyle(.secondary)
                                .accessibilityHidden(true)
                            Text(String(localized: "Impossible de charger le fil", defaultValue: "Impossible de charger le fil"))
                                .font(.headline)
                            Text(error)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Button(String(localized: "Reessayer", defaultValue: "Reessayer")) {
                                Task { await viewModel.loadFeed() }
                            }
                            .buttonStyle(.bordered)
                        }
                        .accessibilityElement(children: .combine)
                        .padding()
                    }

                    // Empty state when no posts and no error
                    if viewModel.hasLoaded && viewModel.posts.isEmpty && !viewModel.isLoading && viewModel.error == nil {
                        AdaptiveContentUnavailableView(
                            String(localized: "Aucune publication", defaultValue: "Aucune publication"),
                            systemImage: "text.bubble",
                            description: Text(String(localized: "Les publications de vos contacts apparaitront ici", defaultValue: "Les publications de vos contacts apparaitront ici"))
                        )
                    }

                    // Cold-start skeleton list: only when no cached posts
                    // AND a load is in flight. Mirrors the height of the
                    // real cards so the surrounding layout never jumps
                    // when the first batch arrives.
                    if SkeletonVisibilityResolver.shouldShowSkeleton(
                        isLoading: viewModel.isLoading,
                        hasCachedData: !viewModel.posts.isEmpty
                    ) {
                        SkeletonFeedList()
                            .transition(.opacity)
                    }

                    // Posts with infinite scroll
                    ForEach(posts) { post in
                        feedPostCardView(for: post)
                            .onAppear {
                                Task { await viewModel.loadMoreIfNeeded(currentPost: post) }
                                viewModel.prefetchMediaForPost(post.id)
                                viewModel.prefetchComments(post.id)
                                trackImpression(postId: post.id)
                            }
                    }

                    // Loading more indicator
                    if viewModel.isLoadingMore {
                        ProgressView()
                            .tint(MeeshyColors.indigo300)
                            .padding()
                    }
                }
                .padding(.top, 12)
                .padding(.bottom, 100)
            }
            .overlay(alignment: .top) {
                // "New posts" banner
                if viewModel.newPostsCount > 0 {
                    Button {
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                            scrollProxy.scrollTo("feed-top", anchor: .top)
                        }
                        viewModel.acknowledgeNewPosts()
                        HapticFeedback.light()
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "arrow.up")
                                .font(.caption.weight(.bold))

                            Text(newPostsBannerText)
                                .font(.subheadline.weight(.semibold))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(
                            Capsule()
                                .fill(
                                    LinearGradient(
                                        colors: [MeeshyColors.indigo300, MeeshyColors.info],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                )
                                .shadow(color: MeeshyColors.indigo300.opacity(0.5), radius: 12, y: 4)
                        )
                    }
                    .buttonStyle(PlainButtonStyle())
                    .accessibilityLabel(String(format: String(localized: "a11y.feed.new_posts.label", defaultValue: "%d nouveaux posts", bundle: .main), viewModel.newPostsCount))
                    .accessibilityHint(String(localized: "a11y.feed.new_posts.hint", defaultValue: "Remonte en haut du fil pour les voir", bundle: .main))
                    .padding(.top, 120)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .animation(.spring(response: 0.4, dampingFraction: 0.75), value: viewModel.newPostsCount)
                }
            }
        }
        .task {
            // Wire persistence layer on first appearance
            if viewModel.feedStore == nil {
                let deps = DependencyContainer.shared
                let store = FeedStore(persistence: deps.feedPersistence)
                let socketHandler = FeedSocketHandler(persistence: deps.feedPersistence)
                viewModel.setupPersistence(store: store, socketHandler: socketHandler, persistence: deps.feedPersistence)
                store.startObserving(dbPool: deps.dbPool)
                await store.loadInitial()
            }

            if viewModel.posts.isEmpty {
                await viewModel.loadFeed()
            }
            // Seed liked state from loaded posts (uses post.isLiked which is derived
            // from APIPost.currentUserReactions / isLikedByMe by the SDK).
            // Preserves existing optimistic state: only seeds posts not yet tracked.
            let newLiked = FeedView.computePostLikedIds(from: viewModel.posts)
            for id in newLiked where !postLikedIds.contains(id) && postLikeDelta[id] == nil {
                postLikedIds.insert(id)
            }
            // Seed bookmark/repost flags from the server-enriched fields
            // on each loaded post (PostFeedService now provides
            // isBookmarkedByMe + isRepostedByMe alongside isLikedByMe).
            // Preserves in-flight optimistic state.
            for post in viewModel.posts {
                if post.isBookmarkedByMe && !postBookmarkInFlightIds.contains(post.id) {
                    postBookmarkedIds.insert(post.id)
                }
                if post.isRepostedByMe && !postRepostInFlightIds.contains(post.id) {
                    postRepostedIds.insert(post.id)
                }
            }
            // Defensive fallback for backends that haven't been upgraded yet
            // — pull bookmark IDs from the local cache so the filled icon
            // still appears for older sessions or when the server payload
            // is stale.
            await hydrateBookmarkSeeding()
            viewModel.subscribeToSocketEvents()
            // Load stories for the tray (same call as the conversation list /
            // iPhone feed). Cheap no-op when already loaded by iPadRootView.
            await storyViewModel.loadStories()
        }
        .adaptiveOnChange(of: viewModel.posts) { _, newPosts in
            // Merge liked / bookmarked / reposted state when new pages
            // arrive. Only seed posts not yet tracked to avoid overwriting
            // optimistic state from in-flight toggles.
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
        // Unification du like : le ❤️ arrive désormais comme `post:liked`/`post:unliked`
        // (événement CANONIQUE absolu — le ViewModel pose `posts[i].likes = likeCount`).
        // On réconcilie ici l'état OPTIMISTE local de la vue : le compteur absolu fait
        // autorité → on purge le delta, et on confirme `isLiked` pour l'acteur. Source
        // unique pour les 3 vues (feed, détail, reel). Le chemin `post:reaction-*` ci-
        // dessus reste pour les emojis NON-❤️ (réactions riches).
        .onReceive(SocialSocketManager.shared.postLiked.receive(on: DispatchQueue.main)) { event in
            postLikeDelta[event.postId] = nil
            if event.userId == AuthManager.shared.currentUser?.id {
                postLikedIds.insert(event.postId)
            }
        }
        .onReceive(SocialSocketManager.shared.postUnliked.receive(on: DispatchQueue.main)) { event in
            postLikeDelta[event.postId] = nil
            if event.userId == AuthManager.shared.currentUser?.id {
                postLikedIds.remove(event.postId)
            }
        }
        // Bookmark : même réconciliation canonique que le like. L'événement est
        // PERSONNEL (emitToUser) → toujours pour l'utilisateur courant. Le
        // ViewModel a posé le `bookmarkCount` absolu sur le post ; on purge ici
        // le delta optimiste local pour que `bookmarkCount + delta` retombe sur
        // le compteur autoritaire (sans reload). Si le compteur est absent
        // (vieux gateway), on garde le delta (dégradation gracieuse).
        .onReceive(SocialSocketManager.shared.postBookmarked.receive(on: DispatchQueue.main)) { payload in
            if payload.bookmarkCount != nil {
                postBookmarkDelta[payload.postId] = nil
            }
            if payload.bookmarked {
                postBookmarkedIds.insert(payload.postId)
            } else {
                postBookmarkedIds.remove(payload.postId)
            }
        }
        .onDisappear {
            viewModel.unsubscribeFromSocketEvents()
            viewModel.feedStore?.stopObserving()
            impressionFlushTask?.cancel()
            impressionFlushTask = nil
        }
        .sheet(isPresented: $showAudioComposer) {
            AudioPostComposerView { audioURL, mimeType, transcription in
                showAudioComposer = false
                Task {
                    await publishAudioPost(audioURL: audioURL, mimeType: mimeType, transcription: transcription, originalLanguage: transcription?.language)
                }
            }
        }
        // Story viewer présentation : unifiée via StoryViewerCoordinator au
        // niveau root (`.fullScreenCover(item:)`). L'ancien cover local
        // `(isPresented:)` + `selectedStoryUserId` séparé provoquait une capture
        // périmée de l'uid (écran noir « story introuvable »). Supprimé.
        .sheet(isPresented: $showComposerLanguagePicker) {
            AudioLanguagePickerView(
                selectedLocale: Binding(
                    get: { Locale(identifier: composerLanguage) },
                    set: { newLocale in
                        let langCode = newLocale.language.languageCode?.identifier ?? newLocale.identifier
                        composerLanguage = langCode
                    }
                )
            )
        }
    }

    // MARK: - Composer Overlay
    private var composerOverlay: some View {
        ZStack {
            // Backdrop
            Color.black.opacity(0.6)
                .ignoresSafeArea()
                .onTapGesture {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showComposer = false
                        isComposerFocused = false
                        recoveredPostCmid = nil
                    }
                }

            // Composer card
            VStack(spacing: 0) {
                // Header
                HStack {
                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            showComposer = false
                            isComposerFocused = false
                            composerText = ""
                            recoveredPostCmid = nil
                        }
                    } label: {
                        Text(String(localized: "Annuler", defaultValue: "Annuler"))
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(theme.textSecondary)
                    }
                    .accessibilityLabel(String(localized: "a11y.feed.compose.cancel", defaultValue: "Annuler", bundle: .main))
                    .accessibilityHint(String(localized: "a11y.feed.compose.cancel.hint", defaultValue: "Ferme l'éditeur sans publier", bundle: .main))

                    Spacer()

                    Text(String(localized: "Nouveau post", defaultValue: "Nouveau post"))
                        .font(.headline.weight(.bold))
                        .foregroundColor(theme.textPrimary)
                        .accessibilityAddTraits(.isHeader)

                    Spacer()

                    Button {
                        publishPostWithAttachments()
                    } label: {
                        if isUploading {
                            ProgressView()
                                .tint(MeeshyColors.indigo300)
                                .scaleEffect(0.8)
                        } else {
                            Text(String(localized: "Publier", defaultValue: "Publier"))
                                .font(.subheadline.weight(.bold))
                                .foregroundColor(composerHasContent ? MeeshyColors.indigo300 : theme.textMuted)
                        }
                    }
                    .disabled(!composerHasContent || isUploading)
                    .accessibilityLabel(String(localized: "a11y.feed.compose.publish", defaultValue: "Publier", bundle: .main))
                    .accessibilityHint(String(localized: "a11y.feed.compose.publish.hint", defaultValue: "Publie votre message dans le fil", bundle: .main))
                    .accessibilityValue(
                        isUploading
                            ? String(localized: "a11y.feed.compose.publish.uploading", defaultValue: "Envoi en cours", bundle: .main)
                            : (composerHasContent
                                ? ""
                                : String(localized: "a11y.feed.compose.publish.disabled", defaultValue: "Indisponible, ajoutez du contenu", bundle: .main))
                    )
                }
                .padding(16)
                .background(theme.backgroundSecondary)

                Divider().background(theme.inputBorder)

                // User row
                HStack(spacing: 12) {
                    MeeshyAvatar(
                        name: getUserDisplayName(AuthManager.shared.currentUser, fallback: "M"),
                        context: .feedComposer,
                        avatarURL: AuthManager.shared.currentUser?.avatar
                    )
                    .accessibilityHidden(true)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(getUserDisplayName(AuthManager.shared.currentUser, fallback: String(localized: "feed.composer.me", defaultValue: "Moi", bundle: .main)))
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(theme.textPrimary)

                        Menu {
                            Button { postVisibility = "PUBLIC" } label: {
                                Label(String(localized: "Public", defaultValue: "Public"), systemImage: "globe")
                            }
                            Button { postVisibility = "FRIENDS" } label: {
                                Label(String(localized: "Amis", defaultValue: "Amis"), systemImage: "person.2")
                            }
                            Button { postVisibility = "PRIVATE" } label: {
                                Label(String(localized: "Prive", defaultValue: "Priv\u{00E9}"), systemImage: "lock")
                            }
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: postVisibility == "PUBLIC" ? "globe" : postVisibility == "FRIENDS" ? "person.2" : "lock")
                                    .font(.caption2)
                                Text(postVisibility == "PUBLIC" ? String(localized: "Public", defaultValue: "Public") : postVisibility == "FRIENDS" ? String(localized: "Amis", defaultValue: "Amis") : String(localized: "Prive", defaultValue: "Priv\u{00E9}"))
                                    .font(.caption)
                            }
                            .foregroundColor(theme.textMuted)
                        }
                    }

                    // Réel ⇄ Post toggle — media posts default to a reel; the
                    // author can force a plain post to keep it out of reels.
                    if !pendingAttachments.isEmpty || pendingAudioURL != nil {
                        Button {
                            composerForcePlainPost.toggle()
                            HapticFeedback.light()
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: composerForcePlainPost ? "doc.text" : "play.rectangle.on.rectangle.fill")
                                    .font(.caption2)
                                Text(composerForcePlainPost
                                    ? String(localized: "feed.composer.type.post", defaultValue: "Post", bundle: .main)
                                    : String(localized: "feed.composer.type.reel", defaultValue: "Réel", bundle: .main))
                                    .font(.caption)
                            }
                            .foregroundColor(composerForcePlainPost ? theme.textMuted : MeeshyColors.indigo300)
                        }
                        .padding(.leading, 12)
                        .accessibilityHint(String(localized: "feed.composer.type.hint", defaultValue: "Bascule entre réel et post", bundle: .main))
                    }

                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)

                // Text editor
                ZStack(alignment: .topLeading) {
                    if composerText.isEmpty {
                        Text(String(localized: "Qu'avez-vous en tete ?", defaultValue: "Qu'avez-vous en t\u{00EA}te ?"))
                            .font(.body)
                            .foregroundColor(theme.textMuted)
                            .padding(.horizontal, 16)
                            .padding(.top, 12)
                    }

                    TextEditor(text: $composerText)
                        .focused($isComposerFocused)
                        .scrollContentBackground(.hidden)
                        .foregroundColor(theme.textPrimary)
                        .font(.body)
                        .frame(minHeight: 120)
                        .padding(.horizontal, 12)
                        .padding(.top, 4)
                }
                .scaleEffect(composerBounce ? 1.01 : 1.0)
                .adaptiveOnChange(of: isComposerFocused) { _, newValue in
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.55)) {
                        composerBounce = newValue
                    }
                }

                // Pending attachments preview
                if !pendingAttachments.isEmpty || !preparingAttachments.isEmpty || isLoadingMedia {
                    feedPendingAttachmentsRow
                }

                // Upload progress
                if isUploading, let progress = uploadProgress {
                    UploadProgressBar(progress: progress, accentColor: MeeshyColors.brandPrimaryHex)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 4)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                Spacer(minLength: 0)

                // Toolbar
                // Doctrine 82i : les 6 glyphes d'action du composer ci-dessous (photo/caméra/
                // emoji/fichier/position/audio, 20pt) sont figés — rangée horizontale contrainte
                // (HStack spacing 16 + Spacer) qui déborderait si les icônes scalaient en XXXL.
                // Chaque bouton porte déjà son `.accessibilityLabel` → VoiceOver reste complet.
                HStack(spacing: 16) {
                    Button { showPhotoPicker = true; HapticFeedback.light() } label: {
                        Image(systemName: "photo.fill")
                            .font(.system(size: 20))
                            .foregroundColor(MeeshyColors.brandPrimary)
                    }
                    .accessibilityLabel(String(localized: "Ajouter une photo", defaultValue: "Ajouter une photo"))
                    Button { showCamera = true; HapticFeedback.light() } label: {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 20))
                            .foregroundColor(MeeshyColors.error)
                    }
                    .accessibilityLabel(String(localized: "Prendre une photo", defaultValue: "Prendre une photo"))
                    Button { showEmojiPicker = true; HapticFeedback.light() } label: {
                        Image(systemName: "face.smiling.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color(hex: "F8B500"))
                    }
                    .accessibilityLabel(String(localized: "Ajouter un emoji", defaultValue: "Ajouter un emoji"))
                    Button { showFilePicker = true; HapticFeedback.light() } label: {
                        Image(systemName: "doc.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color(hex: "9B59B6"))
                    }
                    .accessibilityLabel(String(localized: "Joindre un fichier", defaultValue: "Joindre un fichier"))
                    Button { showLocationPicker = true; HapticFeedback.light() } label: {
                        Image(systemName: "location.fill")
                            .font(.system(size: 20))
                            .foregroundColor(MeeshyColors.success)
                    }
                    .accessibilityLabel(String(localized: "Partager la position", defaultValue: "Partager la position"))
                    Button { showAudioComposer = true; HapticFeedback.light() } label: {
                        Image(systemName: "mic.fill")
                            .font(.system(size: 20))
                            .foregroundColor(MeeshyColors.errorStrong)
                    }
                    .accessibilityLabel(String(localized: "Enregistrer un audio", defaultValue: "Enregistrer un audio"))

                    Spacer()

                    Button {
                        showComposerLanguagePicker = true
                        HapticFeedback.light()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "globe")
                                .font(.footnote)
                            Text(composerLanguageDisplayName)
                                .font(.footnote.weight(.semibold))
                        }
                        .foregroundColor(MeeshyColors.indigo500)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(
                            Capsule()
                                .fill(MeeshyColors.indigo100.opacity(isDark ? 0.15 : 1))
                                .overlay(
                                    Capsule()
                                        .stroke(MeeshyColors.indigo300.opacity(0.3), lineWidth: 1)
                                )
                        )
                    }
                    .accessibilityLabel(String(localized: "Langue du post", defaultValue: "Langue du post"))
                }
                .padding(16)
                .background(theme.backgroundSecondary)
            }
            .background(theme.backgroundPrimary)
            .clipShape(RoundedRectangle(cornerRadius: 24))
            .overlay(
                RoundedRectangle(cornerRadius: 24)
                    .stroke(theme.border(tint: MeeshyColors.brandPrimaryHex, intensity: 0.3), lineWidth: 1)
            )
            .padding(.horizontal, 16)
            .padding(.vertical, 80)
            .shadow(color: MeeshyColors.indigo300.opacity(0.2), radius: 30, y: 20)
        }
        .transition(.opacity.combined(with: .scale(scale: 0.95)))
        .zIndex(200)
        .photosPicker(isPresented: $showPhotoPicker, selection: $selectedPhotoItems, maxSelectionCount: 10, matching: .any(of: [.images, .videos]))
        .fileImporter(isPresented: $showFilePicker, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            handleFeedFileImport(result)
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraView { result in
                switch result {
                case .photo(let image):
                    handleFeedCameraCapture(image)
                case .video(let url):
                    handleFeedCameraVideo(url)
                }
            }
            .ignoresSafeArea()
        }
        .sheet(isPresented: $showLocationPicker) {
            LocationPickerView(accentColor: MeeshyColors.brandPrimaryHex) { coordinate, address in
                handleFeedLocationSelection(coordinate: coordinate, address: address)
            }
        }
        .sheet(isPresented: $showEmojiPicker) {
            EmojiPickerSheet(quickReactions: ["😀", "❤️", "🔥", "👍", "😂", "🎉"]) { emoji in
                composerText += emoji
                showEmojiPicker = false
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $shareableLink) { link in
            // System share sheet — paste/AirDrop/Messages/etc. all receive the
            // `meeshy.me/l/<token>` URL so every external touchpoint funnels
            // through the user's TrackingLink for attribution.
            ShareSheet(activityItems: [link.url])
        }
        .sheet(item: $reelCommentsPost) { post in
            // Même feuille de commentaires que les cartes post (`FeedPostCard`) —
            // ouverte directement depuis le bouton commentaire d'un réel du feed.
            CommentsSheetView(post: post, accentColor: post.authorColor)
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
        .adaptiveOnChange(of: selectedPhotoItems) { _, items in
            handleFeedPhotoSelection(items)
        }
        .fullScreenCover(item: $quoteTargetPost) { quoted in
            FeedComposerSheet(
                viewModel: viewModel,
                initialText: "",
                pendingAttachmentType: nil,
                quotePost: quoted,
                onDismiss: {
                    quoteTargetPost = nil
                }
            )
        }
    }
    // MARK: - Impression Tracking

    private func trackImpression(postId: String) {
        guard !recordedImpressionIds.contains(postId) else { return }
        pendingImpressionIds.insert(postId)
        scheduleImpressionFlush()
    }

    private func scheduleImpressionFlush() {
        // Debounce via a cancellable Task, NOT Timer.scheduledTimer: a default-mode
        // run-loop timer does not fire while the feed ScrollView is in tracking
        // mode, and it was re-armed on every card `onAppear` — so feed-appearance
        // impressions never flushed (impressionCount only ever moved on Detail
        // opens, tracking postOpenCount 1:1). Task.sleep fires regardless of
        // run-loop mode. Mirrors ProfileUserPostsList.scheduleImpressionFlush.
        impressionFlushTask?.cancel()
        impressionFlushTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            guard !Task.isCancelled else { return }
            let batch = Array(pendingImpressionIds)
            guard !batch.isEmpty else { return }
            pendingImpressionIds.subtract(batch)
            do {
                try await PostService.shared.recordImpressions(postIds: batch)
                // Mark recorded ONLY on success so a failed flush leaves the ids
                // eligible to re-enqueue when the card next appears.
                recordedImpressionIds.formUnion(batch)
            } catch {
                FeedView.logger.debug("impression flush failed (will retry): \(error.localizedDescription)")
            }
        }
    }
}

// See FeedPostCard.swift, FeedPostCard+Media.swift
// See FeedCommentsSheet.swift (CommentsSheetView, CommentRowView, FeedCard)
