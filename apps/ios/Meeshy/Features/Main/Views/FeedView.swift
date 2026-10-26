import SwiftUI
import Combine
import os
import MeeshySDK
import MeeshyUI


// MARK: - Feed View
struct FeedView: View {
    /// **La dernière dépendance qui manquait au MEUBLE** (2026-09-06).
    ///
    /// `DocumentComposerDoor` en a besoin, et l'arbre iPad l'avait déjà sous
    /// la main (`iPadRootView.conversationViewModel`) — il ne descendait
    /// simplement pas jusqu'ici. C'est tout ce qui séparait le fil iPad du
    /// composer que le fil iPhone emploie depuis T3.1.
    let conversationListViewModel: ConversationListViewModel

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
    // Présentation unifiée du viewer de story (même coordinator que la story tray
    // et que `ThemedFeedOverlay` côté iPhone). Injecté par `iPadRootView`.
    @EnvironmentObject private var storyViewerCoordinator: StoryViewerCoordinator
    @StateObject var viewModel = FeedViewModel()
    /// Source UNIQUE de « quel réel joue ». `@State` et NON `@StateObject` (#7010) :
    /// ce body n'en lit rien, et l'abonnement re-diffait tout `FeedView` au scroll.
    @State private var reelAutoplay = ReelFeedAutoplayCoordinator()
    @State var showComposer = false
    @State var composerText = ""
    @State var postVisibility: String = "PUBLIC"
    /// Audience nommée de la publication en cours (EXCEPT/ONLY). Vide tant que
    /// l'auteur reste sur une visibilité qui n'en demande pas.
    @State  var postVisibilityUserIds: [String] = []

    /// A QUALIFYING composition (video || audio || >= 2 images —
    /// `ReelComposition.qualifiesAsReel`) defaults to a REEL; the author can
    /// force a plain POST via the composer's Réel⇄Post toggle. A non-qualifying
    /// composition (single image, documents) is ALWAYS a POST — the toggle
    /// hides and `defaultType` ignores this flag.
    @State var composerForcePlainPost = false
    @State private var showAudioComposer = false
    /// Offset de défilement relayé au header SANS invalider ce body :
    /// `@State` retient la référence sans s'y abonner, et seul le
    /// `ScrollOffsetReader` monté autour du header se re-rend à chaque tick.
    /// Même montage que `ConversationListView` et `ContactsHubView`.
    /// L'ancien `CGFloat` d'état ré-exécutait ce body ENTIER — 1 449 lignes,
    /// toutes les cartes du fil et leurs closures — à la cadence de
    /// l'affichage (#6226).
    @State private var scrollRelay = ScrollOffsetRelay()
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
    // Optimistic bookmark / repost / share states: FeedPost has no server-issued
    // flag for every path so the parent View tracks them locally — toggled on tap,
    // cleared on API failure. Les règles d'amorçage/réconciliation : `FeedPostEngagementState`.
    @State private var engagement = FeedPostEngagementState()

    // Impression tracking — une impression par APPARITION à l'écran. Le
    // groupement, la persistance et le flush (sortie d'écran / arrière-plan /
    // relance) sont portés par `ImpressionBatcher`.
    @StateObject private var impressions = ImpressionBatcher(source: "feed", surface: .feed)

    // Attachment states
    @State var pendingAttachments: [MessageAttachment] = []
    /// `clientMutationId` of a post/reel recovered from the offline queue and
    /// pre-filled as a draft when the composer opened onto a stuck unsent post.
    /// The re-send supersedes this row so it replaces the stuck one (no duplicate
    /// on reconnect). `nil` when the compose is fresh.
    @State var recoveredPostCmid: String?

    // (#6226) `audioRecorder` retiré : déclaré ici, il n'était LU nulle part
    // dans `FeedView*` — un abonnement à vingt hertz et une instance
    // d'enregistreur vivante pour personne.
    @State private var quoteTargetPost: FeedPost?

    // MARK: - Post Heart Seeding (Prisme Linguistique — reaction state)

    /// Seeds the liked ids from a batch of posts using `post.isLiked` (which the SDK
    /// derives from `APIPost.currentUserReactions`/`isLikedByMe`). Called on initial
    /// load and when new pages arrive. Existing optimistic state is preserved: a post
    /// already liked due to an in-flight toggle is not overwritten.
    static func computePostLikedIds(from posts: [FeedPost]) -> Set<String> {
        FeedPostEngagementState.likedPostIds(in: posts)
    }

    // MARK: - Post Bookmark Seeding

    /// Hydrates the bookmarked ids from the shared "bookmarks" cache so the
    /// filled icon shows up correctly on first render for posts the user has
    /// already bookmarked. Cache-first, never hits the network — the actual
    /// bookmarks list is refreshed by `BookmarksViewModel` when the user
    /// opens the Favoris tab. Preserves any optimistic state already in
    /// flight by only inserting new IDs.
    private func hydrateBookmarkSeeding() async {
        guard let bookmarks = await FeedPostEngagementRequests.cachedBookmarks() else {
            // Fire-and-forget a background refresh so the next render is
            // hydrated correctly without blocking the current mount.
            Task(priority: .utility) {
                if let posts = await FeedPostEngagementRequests.refreshBookmarksCache() {
                    engagement.seedBookmarks(posts)
                }
            }
            return
        }
        engagement.seedBookmarks(bookmarks)
    }

    // MARK: - Post Heart Toggle (socket-driven)

    @MainActor
    private func togglePostHeart(post: FeedPost) {
        let postId = post.id
        Task {
            guard !engagement.heartInFlightIds.contains(postId) else { return }
            engagement.heartInFlightIds.insert(postId)
            defer {
                Task { @MainActor in
                    engagement.heartInFlightIds.remove(postId)
                }
            }
            let wasLiked = engagement.likedIds.contains(postId)
            // Optimistic update
            if wasLiked {
                engagement.likedIds.remove(postId)
                engagement.likeDelta[postId, default: 0] -= 1
            } else {
                engagement.likedIds.insert(postId)
                engagement.likeDelta[postId, default: 0] += 1
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
            } catch where DailyGestureLimit.from(error) != nil { // #9571 : terminale, ni REST ni file
                engagement.rollbackHeart(postId: postId, wasLiked: wasLiked)
                DailyGestureLimitNotice.surface(error)
            } catch {
                // REST fallback when the socket fails (noSocket, timeout,
                // gateway hiccup). Mirrors the SocialSocketManager call but
                // hits the persisted `POST/DELETE /posts/:id/like` route.
                let restOK = await FeedPostEngagementRequests.postReactionViaREST(postId: postId, like: !wasLiked)
                if !restOK {
                    // Both the live socket call and the REST fallback failed —
                    // most commonly because the device is offline. Durably
                    // enqueue the toggle (existing `.toggleLikePost` outbox
                    // kind, same one `FeedViewModel.likePost` already uses)
                    // instead of silently rolling back and losing the like —
                    // the OutboxDispatcher replays it on reconnect and the
                    // canonical `post:liked`/`post:unliked` broadcast handled
                    // above reconciles the liked ids/delta once it lands.
                    let cmid = ClientMutationId.generate()
                    do {
                        let payload = ToggleLikePostPayload(
                            clientMutationId: cmid,
                            postId: postId,
                            liked: !wasLiked
                        )
                        try await OfflineQueue.shared.enqueue(.toggleLikePost, payload: payload, conversationId: nil)

                        // Roll back the optimistic toggle if the outbox exhausts
                        // its retry budget (server permanently rejects). Mirrors
                        // `FeedViewModel.likePost`'s `observeOutcome` — without
                        // this, a permanently-failing like/unlike stays stuck in
                        // the UI forever: no `post:liked`/`post:unliked` broadcast
                        // will ever arrive for a mutation the outbox gave up on,
                        // and the feed re-seed explicitly skips posts with a live
                        // like delta.
                        observePostLikeOutcome(cmid: cmid, postId: postId, wasLiked: wasLiked)
                    } catch {
                        // The outbox itself refused the row (pool not
                        // configured, encoding failure) — only now is rolling
                        // back the optimistic UI honest.
                        engagement.rollbackHeart(postId: postId, wasLiked: wasLiked)
                    }
                }
            }
        }
    }

    /// Subscribes to `OfflineQueue.shared.outcomeStream(for: cmid)` and rolls
    /// the optimistic like/unlike back to its pre-toggle state if the row is
    /// escalated to `.exhausted` (retry budget spent — the server permanently
    /// rejected it). `.applied` is a no-op: the optimistic state is already
    /// final. Same rollback arithmetic as the synchronous enqueue-refusal
    /// catch above, since both restore the identical pre-toggle snapshot.
    private func observePostLikeOutcome(cmid: String, postId: String, wasLiked: Bool) {
        Task { @MainActor in
            let stream = await OfflineQueue.shared.outcomeStream(for: cmid)
            for await event in stream {
                if case .exhausted = event {
                    engagement.rollbackHeart(postId: postId, wasLiked: wasLiked)
                    FeedbackToastManager.shared.showError(DailyGestureLimitNotice.exhaustedText(clientMutationId: cmid)
                        ?? String(localized: "feed.like.error", defaultValue: "Impossible d'aimer la publication", bundle: .main)
                    )
                }
            }
        }
    }

    // MARK: - Bookmark / Repost / Share toggles (optimistic, ViewModel-backed)

    @MainActor
    private func togglePostBookmark(postId: String) {
        guard !engagement.bookmarkInFlightIds.contains(postId) else { return }
        let wasBookmarked = engagement.bookmarkedIds.contains(postId)
        // Optimistic flip — UI changes instantly, network confirms after.
        if wasBookmarked {
            engagement.bookmarkedIds.remove(postId)
            engagement.bookmarkDelta[postId, default: 0] -= 1
        } else {
            engagement.bookmarkedIds.insert(postId)
            engagement.bookmarkDelta[postId, default: 0] += 1
        }
        engagement.bookmarkInFlightIds.insert(postId)
        Task {
            defer {
                Task { @MainActor in
                    engagement.bookmarkInFlightIds.remove(postId)
                }
            }
            // Capture the post snapshot INSIDE the Task on the MainActor —
            // outside-capture would freeze a value that a `post:updated`
            // socket event might invalidate between the tap and the cache
            // save (race window ~100ms).
            let postSnapshot = viewModel.posts.first(where: { $0.id == postId })
            // Pre-populate the bookmarks cache optimistically so the Favoris
            // tab shows the post the moment the user opens it. Mirror the
            // pre-fix behaviour from FeedViewModel.bookmarkPost.
            let snapshotCache = await FeedPostEngagementRequests.prepopulateBookmarkCache(
                postId: postId, postSnapshot: postSnapshot, wasBookmarked: wasBookmarked
            )

            let success = await FeedPostEngagementRequests.callBookmarkAPI(postId: postId, bookmark: !wasBookmarked)
            if success {
                if wasBookmarked {
                    await FeedPostEngagementRequests.pruneBookmarkFromCache(postId: postId)
                    FeedbackToastManager.shared.showSuccess(String(localized: "post.bookmark.removed", defaultValue: "Retiré des favoris", bundle: .main))
                } else {
                    FeedbackToastManager.shared.showSuccess(String(localized: "post.bookmark.added", defaultValue: "Ajouté aux favoris", bundle: .main))
                }
            } else {
                // Rollback both the UI flip and the cache pre-population.
                if wasBookmarked {
                    engagement.bookmarkedIds.insert(postId)
                    engagement.bookmarkDelta[postId, default: 0] += 1
                } else {
                    engagement.bookmarkedIds.remove(postId)
                    engagement.bookmarkDelta[postId, default: 0] -= 1
                    if let snap = snapshotCache {
                        await FeedPostEngagementRequests.restoreBookmarkCache(snap)
                    }
                }
                FeedbackToastManager.shared.showError(String(localized: "post.bookmark.error", defaultValue: "Erreur lors de l'enregistrement", bundle: .main))
            }
        }
    }

    @MainActor
    private func togglePostRepost(postId: String) {
        guard !engagement.repostInFlightIds.contains(postId) else { return }
        // Reposts are append-only on the backend — the optimistic state
        // only persists if the server confirmed the create. Bypass the
        // ViewModel call because it swallows errors via Toast and leaves
        // no signal we can rollback against.
        engagement.repostedIds.insert(postId)
        engagement.repostDelta[postId, default: 0] += 1
        engagement.repostInFlightIds.insert(postId)
        // L'instantané se prend AVANT d'ouvrir le `Task`, donc dans le tour de
        // boucle du tap : cette fonction est déjà `@MainActor`, mais un `Task`
        // ne s'exécute pas au tap — il s'ENFILE. Lire la carte à l'intérieur
        // laissait au socket un tour de boucle pour la retirer de
        // `viewModel.posts` ; `cardType` rendait alors `nil`, le gateway
        // repliait sur `POST` (`?? PostType.POST`) et une story repartagée
        // devenait un post permanent. Le `Task` reçoit une cible déjà
        // résolue : il n'a plus de lecture à faire.
        let carte = viewModel.posts.first(where: { $0.id == postId })
        let cible = RepostTargeting.target(
            cardId: postId, cardType: carte?.type,
            repostOfId: carte?.repost?.id,
            originalRepostOfId: carte?.repost?.originalRepostOfId
        )
        Task {
            defer {
                Task { @MainActor in
                    engagement.repostInFlightIds.remove(postId)
                }
            }
            do {
                try await RepostPublisher.shared.publish(
                    .simple(postId: cible.postId, targetType: cible.targetType, visibility: nil)
                )
                FeedbackToastManager.shared.showSuccess(String(localized: "post.repost.label", defaultValue: "Repartage"))
            } catch {
                engagement.repostedIds.remove(postId)
                engagement.repostDelta[postId, default: 0] -= 1
                FeedbackToastManager.shared.showError(String(localized: "feed.repost.error", defaultValue: "Erreur lors du repost"))
            }
        }
    }

    @MainActor
    private func sharePostWithLink(postId: String) {
        guard !engagement.shareInFlightIds.contains(postId) else { return }
        engagement.shareInFlightIds.insert(postId)
        Task {
            defer {
                Task { @MainActor in
                    engagement.shareInFlightIds.remove(postId)
                }
            }
            if let shortUrl = await viewModel.sharePost(postId, generateLink: true),
               let url = URL(string: shortUrl) {
                // Bump AFTER the confirmed REST success — `sharePost` only
                // returns non-nil once the gateway actually recorded the
                // share (and incremented `shareCount`). Bumping beforehand
                // left the counter permanently inflated whenever the REST
                // call failed, because the raw-URL fallback below almost
                // always succeeds and the old "undo" branch never ran.
                engagement.shareDelta[postId, default: 0] += 1
                shareableLink = ShareableLink(url: url, fileSource: viewModel.posts.first(where: { $0.id == postId }).map(ShareFileSource.post))
            } else if let raw = ShareableLink.fallback(forPostId: postId, fileSource: viewModel.posts.first(where: { $0.id == postId }).map(ShareFileSource.post)) {
                // `sharePost` already surfaced an error toast; the gateway
                // never recorded this share, so no counter bump — the user
                // can still forward the raw (untracked) post link.
                shareableLink = raw
            }
        }
    }

    /// Ce que les cartes du fil déclenchent chez l'hôte (l'état optimiste et les
    /// présentations restent ici).
    private var postRowActions: FeedPostRowActions {
        FeedPostRowActions(
            onHeart: { post in togglePostHeart(post: post) },
            onRepost: { postId in togglePostRepost(postId: postId) },
            onBookmark: { postId in togglePostBookmark(postId: postId) },
            onShare: { postId in sharePostWithLink(postId: postId) },
            onQuote: { postId in
                quoteTargetPost = viewModel.posts.first(where: { $0.id == postId })
            },
            onEdit: { post in editingPost = post },
            onOpenReelComments: { post in reelCommentsPost = post },
            onAuthorMoodTap: { userId, point in statusViewModel.moodTapHandler(for: userId)?(point) },
            moodLookup: { userId in
                (emoji: statusViewModel.statusForUser(userId: userId)?.moodEmoji,
                 tapHandler: statusViewModel.moodTapHandler(for: userId))
            },
            onViewAuthorStory: { authorId in
                storyViewerCoordinator.present(
                    StoryViewerRequest(id: authorId, startAtFirstUnviewed: true, singleGroup: true)
                )
            }
        )
    }

    private var posts: [FeedPost] { viewModel.posts }

    /// Fingerprint of the like/bookmark/repost "by me" flags across the loaded
    /// feed, used ONLY to drive the re-seeding `adaptiveOnChange` below.
    /// `FeedPost: Equatable` is intentionally id-only, so observing
    /// `viewModel.posts` there skipped re-seeding whenever a refresh returned the
    /// SAME ids with DIFFERENT flags; this fingerprint changes whenever any flag does.
    private var feedFlagsFingerprint: [String] {
        viewModel.posts.map { "\($0.id)|\($0.isLiked)|\($0.isBookmarkedByMe)|\($0.isRepostedByMe)" }
    }

    /// #4621 — le pluriel appartient au CATALOGUE, pas à un ternaire Swift.
    ///
    /// Le code choisissait entre deux clés selon `count > 1` : une règle
    /// française plaquée sur les sept langues. L'arabe a SIX catégories de
    /// pluriel, et aucune n'était atteignable ainsi ; le russe ou le polonais,
    /// si l'app s'y ouvre un jour, en ont quatre. Une seule clé, avec ses
    /// `variations.plural`, laisse chaque langue appliquer LA SIENNE.
    private var newPostsBannerText: String {
        String(
            localized: "feed.new-posts.count",
            defaultValue: "\(viewModel.newPostsCount) nouveaux posts",
            bundle: .main
        )
    }

    var body: some View {
        postActionPresentations(feedBody)
    }

    private var feedBody: some View {
        ZStack {
            FeedAmbientBackdrop()

            feedScrollView

            // Header shown on iPhone AND iPad: the scroll content already
            // reserves `CollapsibleHeaderMetrics.expandedHeight` of top padding,
            // so on iPad it simply fills the space that was previously left empty.
            VStack(spacing: 0) {
                // Compact story trail that TAKES THE TITLE'S PLACE in the bar —
                // reveals as the full-size trail scrolls up under it, so a
                // scrolled feed shows the trail instead of « Meeshy Feed ».
                // Seul ce reader se re-rend au fil du défilement — cette
                // racine écrit `scrollRelay.offset` sans s'y abonner.
                ScrollOffsetReader(relay: scrollRelay) { offset in
                    CollapsibleHeader(
                        title: "Meeshy Feed",
                        scrollOffset: offset,
                        showBackButton: false,
                        titleColor: theme.textPrimary,
                        backArrowColor: MeeshyColors.indigo500,
                        backgroundColor: theme.backgroundPrimary,
                        // Deux lectures du même feed dans le slot trailing : les
                        // Réels et « À proximité ». La carte des posts d'hier vit
                        // désormais dans cette dernière (mode Discover, staff).
                        trailing: { feedHeaderActions },
                        titleAccessory: {
                            AnyView(
                                // Lancement unifié via StoryViewerCoordinator (cf.
                                // PinnedStoryTrailBand.presentStory) — même chemin que la trail des chats.
                                PinnedStoryTrailBand(
                                    viewModel: storyViewModel,
                                    scrollOffset: offset
                                )
                            )
                        }
                    )
                    // L'offset du feed change à chaque frame défilée puis se tait :
                    // c'est le seul signal de mouvement dont dispose un
                    // `ScrollView` SwiftUI avant iOS 17.
                    .scrollMotionActive(offset: offset)
                }
                Spacer()
            }

        }
        // **Le fil iPad monte le MEUBLE** (directive porteur 2026-09-06 : iPad et
        // iOS utilisent le même composer). L'ancien composer écrit à la main
        // (`composerOverlay`, RETIRÉ le 2026-09-06) publiait `storyEffects: nil` :
        // des publications d'une autre nature que l'iPhone (#5322). L'origine est
        // la MÊME que celle du fil iPhone (`.feedComposer`) — une origine « iPad »
        // aurait fabriqué une seconde vérité à tenir d'accord avec la première.
        .feedPostComposer(
            isPresented: $showComposer, router: router, viewModel: viewModel,
            storyViewModel: storyViewModel, statusViewModel: statusViewModel,
            conversationListViewModel: conversationListViewModel
        )
    }

    /// Actions du header, dans l'ordre de lecture : les Réels, puis « À
    /// proximité ». Les deux ouvrent une autre LECTURE du même feed — elles
    /// vont ensemble ; le chemin iPhone (`ThemedFeedOverlay.feedHeaderActions`)
    /// porte la même paire. La carte des posts du feed (bouton `map`,
    /// 2026-08-13) a fusionné dans « À proximité » le 2026-08-26 — mode
    /// Discover, réservé au staff de la plateforme.
    private var feedHeaderActions: some View {
        HStack(spacing: MeeshySpacing.sm) {
            reelsButton
            nearbyButton
        }
        // La marge droite vient du header (`CollapsibleHeaderMetrics.trailingActionsInset`),
        // pas d'un padding local : posée ici, elle divergeait de celle de la
        // liste de conversations, qui n'en avait aucune.
        // Loi commune `ScrollMotion` : une vue en mouvement ne montre pas ses
        // boutons d'action. Le titre et la trail épinglée restent lisibles,
        // les deux entrées de lecture s'effacent le temps du défilement.
        .hiddenWhileScrolling()
    }

    private var reelsButton: some View {
        Button {
            HapticFeedback.medium()
            ReelsPresenter.shared.presentFresh()
        } label: {
            Image(systemName: "play.rectangle.on.rectangle.fill")
                .font(.system(size: MeeshyIconSize.md, weight: .semibold))
                .foregroundColor(MeeshyColors.indigo500)
                .frame(width: 36, height: 36)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        // Les réels dans leur propre fenêtre (iPad) : le fil des publications reste dans la fenêtre principale.
        .contextMenu {
            if DetachedWindowOpener.shared.isAvailable {
                Button {
                    DetachedWindowOpener.shared.open(.reels(startId: nil))
                } label: {
                    Label(
                        String(localized: "window.detach.reels", defaultValue: "Ouvrir les réels dans une nouvelle fenêtre", bundle: .main),
                        systemImage: "macwindow.badge.plus"
                    )
                }
            }
        }
        .accessibilityLabel(String(localized: "feed.header.reels", defaultValue: "Lancer les Réels", bundle: .main))
        .accessibilityIdentifier("feed.header.reels")
    }

    /// Troisième entrée du header : la découverte par PROXIMITÉ. Distincte de
    /// la carte des posts juste à sa gauche, et il faut le dire — celle-ci
    /// montre les posts DU FEED qui portent un lieu, celle-là interroge le
    /// serveur pour tout ce qui est découvrable AUTOUR, feed ou pas.
    private var nearbyButton: some View {
        Button {
            HapticFeedback.light()
            router.push(.nearbyDiscovery())
        } label: {
            Image(systemName: "dot.radiowaves.left.and.right")
                .font(.system(size: MeeshyIconSize.md, weight: .semibold))
                .foregroundColor(MeeshyColors.indigo500)
                .frame(width: 36, height: 36)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "feed.nearby.open", defaultValue: "Publications à proximité", bundle: .main))
        .accessibilityHint(String(localized: "feed.nearby.open.hint", defaultValue: "Ouvre la carte des publications trouvables autour de vous", bundle: .main))
        .accessibilityIdentifier("feed.header.nearby")
    }

    // MARK: - Composer Placeholder
    private func openComposer() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            showComposer = true
        }
        HapticFeedback.light()
    }

    private func openAudioComposer() {
        showAudioComposer = true
        HapticFeedback.light()
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
            MeeshyRefreshableScroll(
                onRefresh: {
                    async let feedRefresh: Void = viewModel.refresh()
                    async let storyRefresh: Void = storyViewModel.loadStories(forceNetwork: true)
                    _ = await (feedRefresh, storyRefresh)
                },
                coordinateSpaceName: "feedScroll",
                onScrollOffsetChange: { offset in
                    scrollRelay.relayFeedOffset(offset)
                },
                topPadding: CollapsibleHeaderMetrics.expandedHeight
            ) {
                LazyVStack(spacing: MeeshySpacing.lg) {
                    Color.clear.frame(height: 0).id("feed-top")

                    // Story tray — same component used by the conversation list
                    // and the iPhone feed so stories load identically here. Le tap
                    // ouvre le viewer via StoryViewerCoordinator (chemin unique),
                    // exactement comme la liste de conversations.
                    //
                    // Absent sur iPad : les deux colonnes sont visibles EN MÊME
                    // TEMPS et la liste de conversations porte déjà ce même tray.
                    // L'afficher ici le montrait DEUX FOIS côte à côte, avec les
                    // mêmes avatars — la seconde occurrence n'apprend rien et
                    // repousse le fil vers le bas. `sizeClass == .regular` est le
                    // discriminant qui monte `iPadRootView` (cf. AdaptiveRootView),
                    // donc le tray de la colonne droite est là par construction.
                    // Les stories restent chargées : les anneaux d'auteur des
                    // cartes en dépendent.
                    if sizeClass != .regular {
                        StoryTrayView(viewModel: storyViewModel)
                    }

                    // Composer placeholder
                    FeedComposerPlaceholder(onCompose: openComposer, onRecordAudio: openAudioComposer)
                        .padding(.bottom, MeeshySpacing.sm)

                    // Error state
                    if let error = viewModel.error {
                        VStack(spacing: MeeshySpacing.md) {
                            Image(systemName: "exclamationmark.triangle")
                                .font(.largeTitle)
                                .foregroundStyle(.secondary)
                                .accessibilityHidden(true)
                            Text(String(localized: "feed.load.error", defaultValue: "Impossible de charger le fil"))
                                .font(.headline)
                            Text(error)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Button(String(localized: "common.retry", defaultValue: "Réessayer")) {
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
                            String(localized: "feed.empty.title", defaultValue: "Aucune publication"),
                            systemImage: "text.bubble",
                            description: Text(String(localized: "feed.empty.subtitle", defaultValue: "Les publications de vos contacts apparaîtront ici"))
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
                        FeedPostRow(
                            post: post,
                            viewModel: viewModel,
                            reelAutoplay: reelAutoplay,
                            engagement: engagement.snapshot(for: post),
                            authorStoryRing: storyViewModel.storyRingState(forUserId: post.authorId),
                            authorMoodEmoji: statusViewModel.statusForUser(userId: post.authorId)?.moodEmoji,
                            actions: postRowActions
                        )
                            .equatable()
                            .onAppear {
                                Task { await viewModel.loadMoreIfNeeded(currentPost: post) }
                                viewModel.prefetchMediaForPost(post.id)
                                viewModel.prefetchComments(post.id)
                            }
                            .countsListedImpression(of: post.id, isVideo: post.isReel, in: impressions) { posts.firstIndex { $0.id == post.id } }
                    }

                    // La page suivante arrive : des cartes fantômes, jamais un indicateur sur du fond nu (#6987)
                    if viewModel.isLoadingMore {
                        SkeletonFeedList(count: 2)
                            .transition(.opacity)
                    }
                }
                .padding(.top, MeeshySpacing.md)
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
                        HStack(spacing: MeeshySpacing.sm) {
                            Image(systemName: "arrow.up")
                                .font(.caption.weight(.bold))

                            Text(newPostsBannerText)
                                .font(.subheadline.weight(.semibold))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, MeeshySpacing.xl)
                        .padding(.vertical, MeeshySpacing.smPlus)
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
                viewModel.setupPersistence(
                    store: store,
                    socketHandler: deps.feedSocketHandler,
                    persistence: deps.feedPersistence
                )
                store.startObserving()
                await store.loadInitial()
            }

            if viewModel.posts.isEmpty {
                await viewModel.loadFeed()
            }
            // Seed liked / bookmark / repost state from the loaded posts (SDK-derived
            // `isLiked`, server-enriched `isBookmarkedByMe` / `isRepostedByMe`).
            // Preserves existing optimistic state: only seeds posts not yet tracked.
            engagement.seedFromLoadedPosts(viewModel.posts)
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
        .adaptiveOnChange(of: feedFlagsFingerprint) { _, _ in
            engagement.reconcile(with: viewModel.posts)
        }
        .onReceive(SocialSocketManager.shared.postReactionAdded.receive(on: DispatchQueue.main)) { event in
            engagement.applyReactionAdded(
                emoji: event.emoji, userId: event.userId, postId: event.postId,
                currentUserId: AuthManager.shared.currentUser?.id
            )
        }
        .onReceive(SocialSocketManager.shared.postReactionRemoved.receive(on: DispatchQueue.main)) { event in
            engagement.applyReactionRemoved(
                emoji: event.emoji, userId: event.userId, postId: event.postId,
                currentUserId: AuthManager.shared.currentUser?.id
            )
        }
        // Unification du like : `post:liked`/`post:unliked` (événement CANONIQUE
        // absolu) purge le delta optimiste et confirme `isLiked` pour l'acteur.
        // Le chemin `post:reaction-*` ci-dessus reste pour les emojis NON-❤️.
        .onReceive(SocialSocketManager.shared.postLiked.receive(on: DispatchQueue.main)) { event in
            engagement.applyPostLiked(
                postId: event.postId, userId: event.userId,
                currentUserId: AuthManager.shared.currentUser?.id
            )
        }
        .onReceive(SocialSocketManager.shared.postUnliked.receive(on: DispatchQueue.main)) { event in
            engagement.applyPostUnliked(
                postId: event.postId, userId: event.userId,
                currentUserId: AuthManager.shared.currentUser?.id
            )
        }
        // Bookmark : même réconciliation canonique que le like (événement PERSONNEL).
        .onReceive(SocialSocketManager.shared.postBookmarked.receive(on: DispatchQueue.main)) { payload in
            engagement.applyPostBookmarked(
                postId: payload.postId, bookmarked: payload.bookmarked,
                hasAbsoluteCount: payload.bookmarkCount != nil
            )
        }
        .onDisappear {
            viewModel.unsubscribeFromSocketEvents()
            viewModel.feedStore?.stopObserving()
            // Flush, PAS cancel : annuler ici jetait le lot en cours de
            // groupement à chaque sortie du feed.
            Task { await impressions.flushNow() }
        }
        .sheet(isPresented: $showAudioComposer) {
            AudioPostComposerView(
                onPublish: { audioURL, mimeType, durationMs, transcription in
                    showAudioComposer = false
                    Task {
                        // La langue n'est plus passée ici : elle est celle de la
                        // transcription, et `PublishIntent` l'en tire. Ce site
                        // passait déjà `transcription?.language` — le paramètre
                        // n'était qu'une porte ouverte sur la divergence du
                        // jumeau de la feuille, qui empruntait la langue du
                        // sélecteur de TEXTE quand la transcription manquait.
                        await publishAudioPost(audioURL: audioURL, mimeType: mimeType, durationMs: durationMs, transcription: transcription)
                    }
                },
                onPublishBorrowed: { sound, _ in
                    showAudioComposer = false
                    Task { await publishBorrowedSoundPost(sound) }
                }
            )
        }
        // Story viewer présentation : unifiée via StoryViewerCoordinator au
        // niveau root (`.fullScreenCover(item:)`). L'ancien cover local
        // `(isPresented:)` + `selectedStoryUserId` séparé provoquait une capture
        // périmée de l'uid (écran noir « story introuvable »). Supprimé.
    }


    // MARK: - Post Action Presentations
    //
    // Partage, commentaires de réel, édition et citation sont déclenchés depuis
    // les CARTES du feed — jamais depuis le composer. Ces présentations vivaient
    // pourtant sur l'overlay inline iPad, monté sous `if showComposer` :
    // composer fermé, la vue portant le `.sheet` n'existait pas, donc
    // « Partager » et « Citer » ne produisaient rien. Pire, l'item restait armé
    // et bloquait les présentations suivantes du feed jusqu'au redémarrage.
    // Elles sont désormais ancrées au `body`, monté en permanence — et c'est cet
    // ancrage qui a permis de retirer l'overlay (2026-09-06) sans rien emporter.
    private func postActionPresentations(_ content: some View) -> some View {
        content
            .sheet(item: $shareableLink) { link in
                // System share sheet — paste/AirDrop/Messages/etc. all receive the
                // `meeshy.me/l/<token>` URL so every external touchpoint funnels
                // through the user's TrackingLink for attribution.
                ShareSheet(activityItems: link.activityItems)
            }
            .sheet(item: $reelCommentsPost) { post in
                // Même feuille de commentaires que les cartes post (`FeedPostCard`) —
                // ouverte directement depuis le bouton commentaire d'un réel du feed.
                CommentsSheetView(post: post, accentColor: post.authorColor)
            }
            .postEditCover(item: $editingPost) { post in
                EditPostSheet(
                    originalContent: post.content,
                    originalLanguage: post.originalLanguage,
                    originalType: post.type,
                    media: post.media.map { EditablePostMedia($0) }, originalStoryEffects: post.storyEffects,
                    originalLocation: post.location,
                    originalVisibility: post.visibility,
                    originalVisibilityUserIds: post.visibilityUserIds ?? [],
                    isRepost: post.repost != nil,
                    onSave: { draft in
                        await viewModel.updatePost(post.id, content: draft.content, language: draft.language, type: draft.type, removeMediaIds: draft.removeMediaIds.isEmpty ? nil : draft.removeMediaIds, location: draft.location, visibility: draft.visibility, visibilityUserIds: draft.visibilityUserIds, known: draft.known, storyEffects: draft.storyEffects)
                    },
                    onDismiss: { editingPost = nil }
                )
            }
            // **La CITATION revient à `FeedComposerSheet`** — même raison, même
            // jour, que sur iPhone (`RootViewComponents`) : `DocumentComposerDoor`
            // REFUSE un repost tant que la levée 7.5 (un écrivain durable du
            // repost) n'existe pas, et l'auteur recevait « publication
            // impossible » au lieu de sa citation. La migration reste la cible.
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
}

// See FeedPostCard.swift, FeedPostCard+Media.swift
// See FeedCommentsSheet.swift (CommentsSheetView, CommentRowView)
