import SwiftUI
import Combine
import os
import MeeshySDK
import MeeshyUI

// Components extracted to RootViewComponents.swift:
// ThemedActionButton, ThemedFeedOverlay

/// Identifiable wrapper so the fullScreenCover receives the userId directly in
/// its content closure, avoiding the SwiftUI race where isPresented flips true
/// before the sibling @State (userId) has propagated through the view graph.
///
/// `initialAction` (Phase F) carries an optional one-shot side-effect for the
/// presented `StoryViewerView`: when set, the viewer auto-opens either the
/// comments overlay or the viewers/reactions sheet on first appear. Defaults
/// to `nil` so every existing call site (tray taps, deep link, notification
/// reaction tap) preserves the legacy "open viewer normally" behaviour.
struct StoryViewerRequest: Identifiable, Equatable {
    let id: String
    var initialAction: StoryViewerInitialAction? = nil
    /// Quand `true`, le viewer s'ouvre sur la première story non vue du groupe
    /// (entrées « toucher le profil / l'avatar / le tray »). Les deep links /
    /// notifications ciblant un contenu précis gardent `false`.
    var startAtFirstUnviewed: Bool = false
    /// `true` pour les entrées « personne précise » (profil, bulle, avatar
    /// de post, ma story) : le viewer ne montre que le groupe de cet
    /// utilisateur. Les contextes « flux » (tray, liste) gardent `false`.
    var singleGroup: Bool = false
    /// R4 inc.2 — id exact du post story quand le producteur le connaît
    /// (notification, deep link). Permet au container un fetch unitaire
    /// léger si le tray ignore le groupe. `nil` = comportement historique.
    var postId: String? = nil
    /// Commentaire ciblé par une notification (story_new_comment,
    /// story_thread_reply…) : l'overlay commentaires scrolle dessus au lieu
    /// du dernier commentaire. `nil` = comportement historique.
    var targetCommentId: String? = nil
    /// Parent du commentaire ciblé (réponse en thread) — repli de scroll
    /// quand la réponse elle-même n'est pas (encore) dans la liste.
    var targetParentCommentId: String? = nil
    /// Slide d'entrée quand le point d'appel la connaît (citation d'une
    /// réponse à une story). Ignorée si `postId` la résout, ou si
    /// `startAtFirstUnviewed` l'emporte.
    var initialStoryIndex: Int = 0
}

struct RootView: View {
    @ObservedObject private var storyViewModel: StoryViewModel
    @ObservedObject private var statusViewModel: StatusViewModel
    // Possédé sans être observé (cf. ConversationListVMOwner) : évite que le churn
    // du VM (presence, reloadFromCache) ne re-render RootView à l'idle. Exposé via
    // la propriété calculée `conversationViewModel` ci-dessous — les 12 usages
    // (injections + closures) restent inchangés.
    private let conversationVMOwner: ConversationListVMOwner
    private var conversationViewModel: ConversationListViewModel { conversationVMOwner.viewModel }
    @StateObject private var router = Router()
    // CallManager n'est PLUS observé ici : sa présentation (cover + overlays) est
    // portée par `.modifier(CallPresentationLayer())`, qui isole le churn d'appel
    // (callDuration 1 Hz + stats qualité) hors de `RootView.body`. Cf. watchdog
    // 0x8BADF00D. RootView ne se ré-évalue donc plus à chaque tick d'appel.
    @ObservedObject private var notifications: RootNotificationSource  // #7010 — le compteur SEUL est observé ; cf. RootNotificationSource.
    @EnvironmentObject private var deepLinkRouter: DeepLinkRouter
    @Environment(\.accessibilityReduceMotion) private var reduceMotionEnabled
    @State private var showFeed = false
    @State private var feedWasVisibleBeforeNav = false
    @State private var showMenu = false
    /// Drives the immersive reels overlay. A long-press on the feed button (or a
    /// tap on a reel card in the feed) sets `reelsPresenter.launch`.
    @ObservedObject private var reelsPresenter = ReelsPresenter.shared
    /// Liquid "water wave" reveal of the reels overlay. `reelsRevealProgress`
    /// drives the `LiquidRevealShape` mask 0→1 (open) / 1→0 (close) from the
    /// feed button's on-screen position. `reelsRevealCompleted` gates the first
    /// reel's playback (flips true 0.2s BEFORE the disc is full so the reel is
    /// already running when revealed). `reelsRevealMasked` keeps the mask on ONLY
    /// while the disc is animating — once full screen it drops to `false` so the
    /// `AVPlayerViewController` surface renders live video (a persistent SwiftUI
    /// `.mask()` over an AVPlayer layer freezes it on the poster). `reelsRevealClosing`
    /// routes the reverse wave before `reelsPresenter.dismiss()`.
    @State private var reelsRevealProgress: Double = 0
    @State private var reelsRevealCompleted = false
    @State private var reelsRevealMasked = false
    @State private var reelsRevealClosing = false
    /// Hoisted out of `@State` (Phase H) so deep-stack screens such as
    /// `StoryNotificationTargetScreen` can present the viewer through
    /// `.environmentObject` injection without threading a binding through
    /// every parent view. The coordinator's `pendingRequest` mirrors the
    /// legacy `Identifiable?` contract expected by `.fullScreenCover(item:)`.
    @StateObject private var storyViewerCoordinator = StoryViewerCoordinator()
    /// Page « Mes stories » (en cours + passées) ouverte depuis la tuile
    /// Stories du bandeau de stats du profil. Hébergée ICI (racine, toujours
    /// montée) : la feuille de profil peut être présentée depuis n'importe
    /// quel écran (feed, recherche, détail de post, viewer) — un listener dans
    /// StoryTrayView n'existait que là où un tray était monté.
    @State private var showMyStoriesFromProfile = false
    @State private var myStoriesProfileFollowUp = DeferredSheetFollowUp<MyStoriesFollowUp>()
    @State private var editingStorySessionFromProfile: StoryEditSession?

    /// U1 — namespace de la transition zoom tray→viewer (iOS 18+). Injecté
    /// dans l'environnement pour que la bulle du tray (source) et le cover
    /// (destination) partagent la même identité visuelle. iOS 16-17 : les
    /// helpers `zoomTransition*` sont no-op, comportement historique intact.
    @Namespace private var storyZoomNamespace

    /// Conversation surfaced by a long-press / pull-down on an in-app
    /// notification toast — presented as a reusable `ConversationView` preview
    /// (last messages + simple composer) over the current page.
    @State private var notificationPreviewConversation: Conversation?
    /// Mood à republier depuis la bulle (hôte racine) — présente le composer
    /// de statut pré-rempli. Anciennement dans ConversationListView, mort.
    @State private var republishStatusEntry: StatusEntry?
    /// Suppresses the toast `Button`'s tap action that can fire on release right
    /// after a long-press / drag opened the preview, preventing a double action
    /// (preview sheet + underlying navigation).
    @State private var suppressToastTap = false

    // Positions des boutons flottants (#9679) — lues par `FloatingButtonGeometry`.
    @AppStorage("feedButtonPosition") private var feedButtonPosition: String = FloatingButtonGeometry.defaultFeedStorage
    @AppStorage("menuButtonPosition") private var menuButtonPosition: String = FloatingButtonGeometry.defaultMenuStorage
    /// La géométrie mesurée par le conteneur des boutons : l'échelle du menu et
    /// l'ancre des réels lisent la même.
    @State private var floatingGeometry: FloatingButtonGeometry?
    /// L'onboarding recouvre le chrome ; les boutons flottants, posés au-dessus
    /// du chrome, s'effacent tant qu'il est là.
    @ObservedObject private var onboardingPresence = OnboardingPresenceSignal.shared

    // Scroll visibility state (passed from ConversationListView)
    @State private var isScrollingDown = false

    // Share sheet state (triggered by deep link)
    @State private var showSharePicker = false

    // New conversation sheet
    @State private var showNewConversation = false

    /// Choix d'identité en attente sur un lien de partage. `nil` = pas de
    /// question posée.
    @State private var shareLinkChoice: ShareLinkIdentityChoice?

    /// C4b — rupture cliente. Deux entrées (le 426 vécu, le plancher lu au
    /// démarrage), une porte qui ne se referme pas. `iPadRootView` porte le
    /// jumeau : l'iPad a sa racine PROPRE et n'hérite rien d'ici.
    @ObservedObject private var upgradeGate: UpgradeGateController

    init(scope: RootScopeModels) {
        _storyViewModel = ObservedObject(wrappedValue: scope.story)
        _statusViewModel = ObservedObject(wrappedValue: scope.status)
        conversationVMOwner = scope.conversations
        _notifications = ObservedObject(wrappedValue: scope.notifications)
        _upgradeGate = ObservedObject(wrappedValue: scope.upgradeGate)
    }

    var body: some View {
        ZStack {
            // 1. Dynamic Background
            RootThemedBackground(theme: ThemeManager.shared)

            // 2. Main content -- NavigationStack
            NavigationStack(path: $router.path) {
                CoveredFreeze(isCovered: reelsCoverScreen) { ConversationListView(
                    isScrollingDown: $isScrollingDown,
                    feedIsVisible: $showFeed,
                    onSelect: { conversation in
                        router.push(.conversation(conversation))
                    },
                    onStoryViewRequest: { userId, _ in
                        Logger.messages.info("[RootView] onStoryViewRequest userId=\(userId, privacy: .public) isEmpty=\(userId.isEmpty)")
                        guard !userId.isEmpty else { return }
                        // Tap sur l'avatar/le tray → première story non vue.
                        storyViewerCoordinator.present(StoryViewerRequest(id: userId, startAtFirstUnviewed: true))
                    },
                    onNewConversation: { showNewConversation = true }
                ) }
                .equatable()
                .navigationBarHidden(true)
                // Les 27 écrans vivent dans `RootRouteDestination` (#5837) : le
                // `switch` entrait sinon, avec la chaîne de chaque cas, dans le
                // type concret de ce `body`.
                .navigationDestination(for: Route.self) { route in
                    RootRouteDestination(
                        route: route,
                        router: router,
                        notificationManager: notifications.manager,
                        onNotificationTap: handleNotificationTap
                    )
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.clear)
            .opacity(reelsCoverScreen ? 0 : 1)

            // 3. Feed overlay
            if showFeed {
                ThemedFeedOverlay()
                    .opacity(reelsCoverScreen ? 0 : 1)
                    .transition(
                        .asymmetric(
                            insertion: .move(edge: .bottom)
                                .combined(with: .opacity),
                            removal: .move(edge: .bottom)
                                .combined(with: .scale(scale: 0.95))
                                .combined(with: .opacity)
                        )
                    )
                    .zIndex(50)
            }

            // 3b. Reels overlay — full-screen immersive pager. Born as a liquid
            // disc at the feed button's exact on-screen position, the wavy edge
            // expands until it covers the screen (`LiquidRevealShape`). The real
            // first reel is masked from the small-disc state onward; its video
            // stays on the poster (PAUSED) until `reelsRevealCompleted` fires at
            // full screen. Close runs the reverse wave back toward the button.
            if let launch = reelsPresenter.launch {
                ReelsRevealContainer(
                    revealProgress: reelsRevealProgress,
                    applyMask: reelsRevealMasked,
                    feedButtonPositionRaw: feedButtonPosition,
                    floatingGeometry: floatingGeometry,
                    reduceMotion: reduceMotionEnabled,
                    content: { safeArea in
                        if let failure = launch.failure, let postId = launch.startId {
                            ReelOpenFailureView(
                                failure: failure,
                                onRetry: {
                                    await notificationNavigator.revealReelFromNotification(postId: postId, commentId: launch.commentId,
                                                                     parentCommentId: launch.parentCommentId)
                                },
                                onClose: { closeReels() }
                            )
                        } else {
                            ReelsPlayerView(
                                seedPosts: launch.seedPosts,
                                startId: launch.startId,
                                commentTargetId: launch.commentId,
                                commentParentTargetId: launch.parentCommentId,
                                revealCompleted: reelsRevealCompleted,
                                safeArea: safeArea,
                                onClose: { closeReels() },
                                onOpenProfile: { userId, username in
                                    router.deepLinkProfileUser = ProfileSheetUser(userId: userId, username: username)
                                },
                                onOpenStory: { userId in
                                    storyViewerCoordinator.present(StoryViewerRequest(
                                        id: userId,
                                        startAtFirstUnviewed: true,
                                        singleGroup: true
                                    ))
                                },
                                onOpenDetail: { postId in
                                    // Ferme le lecteur immersif avant de pousser le détail —
                                    // sinon la page se pousse SOUS l'overlay (zIndex 60) et
                                    // reste invisible tant que l'utilisateur ne ferme pas.
                                    closeReels()
                                    router.push(.postDetail(postId))
                                },
                                authorHasStory: { userId in
                                    storyViewModel.storyRingState(forUserId: userId) != .none
                                }
                            )
                        }
                    }
                )
                .id(launch.id)
                .zIndex(60)
                .onAppear { openReels() }
            }

            // 4-6. Les boutons flottants et leur menu vivent AU-DESSUS du chrome
            // (`floatingChrome`, posé après `RootChromeLayer`) — plus ici.

            // 7. Offline state — surfaced as a discreet inline chip inside
            // `ConnectionBanner` (the safe-area inset at the top of every
            // NavigationStack content view). The legacy full-width red
            // `OfflineBanner` was retired 2026-05-27 — the offline state
            // is just one of {.syncing, .offline, .disconnected} that the
            // small ConnectionBanner pill rotates through.
            pendingSettingsBannerOverlay

            // 8. Toast overlay — handled at MeeshyApp level to avoid duplicates

            // 9. Notification toast overlay (socket real-time)
            RootNotificationToastOverlay(
                notificationManager: notifications.manager,
                suppressToastTap: suppressToastTap,
                onTap: handleSocketNotificationTap,
                onPreview: openNotificationPreview(for:)
            )
        }
        // Chaque couche est un `ViewModifier` NOMINAL (#5837) : la chaîne de 46
        // modificateurs imbriquait 66 niveaux dans le type de ce `body`, ~1095 Ko
        // de pile de démangleur contre 1008 Ko sur l'appareil — l'app crashait
        // au lancement. L'ORDRE des couches, et celui des modificateurs dans
        // chacune, sont ceux de la chaîne d'origine : une feuille présentée sous
        // un `environmentObject` ne voit pas le même environnement qu'au-dessus.
        // Garde : `ConversationViewBodyTypeDepthTests`.
        .modifier(RootStatusBubbleLayer(
            navigationToken: AnyHashable(router.path),
            shareLinkChoice: $shareLinkChoice,
            republishStatusEntry: $republishStatusEntry,
            statusViewModel: statusViewModel,
            onContinueWithAccount: joinViaShareLink(identifier:),
            onJoinAnonymously: { deepLinkRouter.requestedGuestJoin = $0 }
        ))
        .modifier(RootEnvironmentLayer(
            router: router,
            storyViewModel: storyViewModel,
            statusViewModel: statusViewModel,
            conversationViewModel: conversationViewModel,
            storyViewerCoordinator: storyViewerCoordinator,
            storyZoomNamespace: storyZoomNamespace,
            notificationPreviewConversation: $notificationPreviewConversation,
            onOpenFullConversation: { router.navigateToConversation($0) }
        ))
        .modifier(RootStoryDoorsLayer(
            showMyStoriesFromProfile: $showMyStoriesFromProfile,
            myStoriesProfileFollowUp: $myStoriesProfileFollowUp,
            editingStorySessionFromProfile: $editingStorySessionFromProfile,
            storyViewModel: storyViewModel,
            statusViewModel: statusViewModel,
            conversationViewModel: conversationViewModel,
            router: router,
            storyViewerCoordinator: storyViewerCoordinator,
            storyZoomNamespace: storyZoomNamespace,
            onStart: startRootServices
        ))
        .modifier(RootChromeLayer(
            reelsPresenter: reelsPresenter,
            conversationViewModel: conversationViewModel,
            storyViewModel: storyViewModel,
            storyViewerCoordinator: storyViewerCoordinator,
            router: router,
            activeConversationId: { router.currentConversationId ?? notificationPreviewConversation?.id },
            onSyncPillTap: handleSyncPillTap,
            onMiniPlayerTap: {
                guard let target = MiniPlayerTapPolicy.target(
                    context: ConversationAudioCoordinator.shared.activeContext) else { return }
                navigateToConversationById(target.conversationId, highlightMessageId: target.highlightMessageId)
            },
            showFeed: showFeed,
            showMenu: showMenu
        ))
        // Les boutons flottants passent AU-DESSUS de tout le chrome (#9679) :
        // la bannière du joueur, la pastille de synchronisation, le mini-lecteur
        // et la bannière d'appel. Montés dans la pile du contenu, ils passaient
        // SOUS la bannière : posé à 96 pt, le Flux devenait invisible et
        // insaisissable, et le restait après relance. Seul l'onboarding, qui doit
        // recouvrir le chrome, les masque.
        .overlay { floatingChrome }
        .modifier(RootIntentRoutingLayer(
            router: router,
            storyViewModel: storyViewModel,
            onNavigateToConversation: { router.navigateToConversation($0) },
            onPushNotificationTap: handlePushNotificationTap,
            onNavigateToConversationId: { navigateToConversationById($0, highlightMessageId: $1) },
            isKnownConversation: { conversationId in
                conversationViewModel.conversations.contains { $0.id == conversationId }
            },
            onSendMessageToUser: handleSendMessageToUser,
            onPushNavigateToRoute: handlePushNavigateToRoute
        ))
        .modifier(RootSheetsLayer(
            router: router,
            statusViewModel: statusViewModel,
            conversationViewModel: conversationViewModel,
            showSharePicker: $showSharePicker,
            showNewConversation: $showNewConversation,
            showFeed: $showFeed,
            feedWasVisibleBeforeNav: $feedWasVisibleBeforeNav,
            deepLinkRouter: deepLinkRouter,
            upgradeGate: upgradeGate,
            onDeepLink: handleDeepLink
        ))
        .inAppLinks(router: router)
    }

    // MARK: - Démarrage de la racine

    /// Le corps du `.task` de la racine, monté par `RootStoryDoorsLayer` :
    /// connexion socket, abonnements, exécuteur de publication, chargements
    /// parallèles. Écrit ICI parce que la racine possède tout ce qu'il touche.
    private func startRootServices() async {
        // Connect Socket.IO early so the backend knows we're online
        MessageSocketManager.shared.connect()
        statusViewModel.subscribeToSocketEvents()
        // Sans cet appel, le SDK reçoit bien `story:created` /
        // `story:updated` / `story:deleted` mais personne n'est sink'é
        // sur les publishers de SocialSocketManager → les stories des
        // amis n'arrivent jamais dans `storyGroups` en temps réel.
        storyViewModel.subscribeToSocketEvents()
        // Même raison, pour le feed : `FeedSocketHandler` est le SEUL
        // écrivain disque de post:created/updated/reposted, des
        // commentaires et des réactions. Armé par `FeedView` et désarmé à
        // sa disparition, il ratait tout ce qui arrivait ailleurs dans
        // l'app. `arm()` est idempotent — jamais désarmé.
        await RealtimeRelays.arm()

        // Deferred cleanup
        Task.detached(priority: .background) {
            try? await Task.sleep(for: .seconds(5))
            await ConversationSyncEngine.shared.cleanupRetentionIfNeeded()
        }

        // Observe sync events for conversation list
        conversationViewModel.observeSync()

        #if DEBUG
        // Pré-résout à pile courte les métadonnées du 1er rendu de
        // ConversationView (classe de crashs stack-overflow du décodeur
        // Swift sur device Debug — cf. ConversationFirstRenderWarmup).
        ConversationFirstRenderWarmup.run()
        #endif

        // Réponse à un mood (confirmée via pop-up, ou immédiate en DM) :
        // résout/ouvre la DM avec l'auteur et amorce le composer.
        StatusBubbleController.shared.onConfirmedReply = { entry in
            router.navigateToStoryReply(
                .status(statusId: entry.id, authorId: entry.userId,
                        authorName: entry.username, emoji: entry.moodEmoji,
                        content: entry.content, publishedAt: entry.createdAt),
                conversationList: conversationViewModel
            )
        }

        // Republication d'un mood : câblé ICI (hôte racine de la bulle)
        // — l'ancien branchement vivait dans un overlay mort de
        // ConversationListView, le bouton « Republier » n'agissait donc
        // jamais depuis la bulle du modifier.
        StatusBubbleController.shared.onRepublish = { entry in
            republishStatusEntry = entry
        }

        // Pilier 22 V3 wiring — register the StoryViewModel as the
        // queue's upload executor. setExecutor also registers the
        // queue's publish handler in the same call, so the M5 auto-
        // drain that fires next has a guaranteed-non-nil executor to
        // delegate to. Calling configure() at app boot (in MeeshyApp)
        // intentionally only sets up listeners — the handler is
        // registered HERE, atomic with the executor assignment, to
        // avoid the boot race that would burn retry budget on a
        // guaranteed-fail call.
        StoryPublishService.shared.setExecutor(storyViewModel)

        // C4b — plancher de version lu au démarrage. Best-effort et
        // SILENCIEUX : sans lui, un binaire périmé qui ne fait que LIRE ne
        // rencontre jamais de 426 et se croit à jour indéfiniment.
        // Parallélisé comme les autres : il ne doit rien retenir.
        async let versionFloor: Void = upgradeGate.checkFloor()
        async let storiesLoad: Void = storyViewModel.loadStories()
        async let statusesLoad: Void = statusViewModel.loadStatuses()
        async let conversationsLoad: Void = ConversationListVMOwner.loadAtLaunch(conversationViewModel)
        async let unreadRefresh: Void = notifications.manager.refreshUnreadCount()
        _ = await (storiesLoad, statusesLoad, conversationsLoad, unreadRefresh, versionFloor)
    }

    // MARK: - Intentions reçues par la racine (via `RootIntentRoutingLayer`)

    private func handleSendMessageToUser(_ notification: Notification) {
        guard let targetUserId = notification.object as? String else { return }
        if let existingConv = conversationViewModel.conversations.first(where: {
            $0.type == .direct && $0.participantUserId == targetUserId
        }) {
            router.navigateToConversation(existingConv)
            return
        }
        Task {
            do {
                let response = try await ConversationService.shared.create(
                    type: "direct",
                    participantIds: [targetUserId]
                )
                let currentUserId = AuthManager.shared.currentUser?.id ?? ""
                let apiConv = try await ConversationService.shared.getById(response.id)
                let conv = apiConv.toConversation(currentUserId: currentUserId)
                router.navigateToConversation(conv)
            } catch {
                FeedbackToastManager.shared.showError(String(localized: "root.create_conversation.error", defaultValue: "Impossible de créer la conversation", bundle: .main))
            }
        }
    }

    private func handlePushNavigateToRoute(_ notification: Notification) {
        guard let routeName = notification.object as? String else { return }
        if routeName.hasPrefix("postDetail:") {
            let postId = String(routeName.dropFirst("postDetail:".count))
            router.push(.postDetail(postId))
        } else if routeName.hasPrefix("storyDetail:") {
            let postId = String(routeName.dropFirst("storyDetail:".count))
            if let groupIdx = storyViewModel.groupIndex(forStoryId: postId) {
                storyViewerCoordinator.present(StoryViewerRequest(
                    id: storyViewModel.storyGroups[groupIdx].id,
                    postId: postId
                ))
            } else {
                router.push(.postDetail(postId))
            }
        } else {
            switch routeName {
            case "userStats": router.push(.userStats)
            case "progression": router.push(.progression)
            case "affiliate": router.push(.affiliate)
            default: break
            }
        }
    }

    // MARK: - Sync Pill Tap

    /// Tap handler wired into the `ConnectionBanner` → `SyncPill` chain.
    /// Routes each `OutboxUIItem.Source` to the appropriate destination
    /// using the local `router` + cached `conversations` list. Logs and
    /// no-ops when the source can't be resolved (e.g. a conversation
    /// that hasn't been hydrated into the cache yet).
    private func handleSyncPillTap(_ source: OutboxUIItem.Source) {
        switch source {
        case .conversation(let id, let messageId):
            guard let conv = conversationViewModel.conversations.first(where: { $0.id == id }) else {
                Logger.messages.info("syncPill tap: conversation \(id, privacy: .public) not in cache, skipping")
                return
            }
        // #4027 — l'entrée mène à sa CIBLE EXACTE. Le surlignage est posé
            // AVANT la navigation et SCOPÉ à la conversation visée : sans le
            // scope, une ancre survivrait à une ouverture différente et ferait
            // sauter un autre fil sur un id qui n'est pas le sien.
            // `ConversationView` le consomme (scroll + flash) puis le remet à
            // `nil` — même chemin que le tap d'une notification, d'un résultat
            // de recherche ou d'un message étoilé, à un seul exemplaire.
            if let messageId {
                router.pendingHighlightMessageId = messageId
                router.pendingHighlightConversationId = id
            }
            router.push(.conversation(conv))
        case .post(let id):
            router.push(.postDetail(id, nil, showComments: false))
        case .story:
            // V1 no-op — opening a story requires a StoryIntent +
            // StoryNotificationContext that the inline pill does not
            // carry. The status row is enough acknowledgement.
            Logger.messages.info("syncPill tap: story open not yet supported")
        case .unknown:
            break
        }
    }

    // MARK: - Deep Link Handling

    private func handleDeepLink(_ deepLink: DeepLink?) {
        guard let deepLink = deepLinkRouter.consumePendingDeepLink() else { return }
        // Story, réel, composer ou feuille en cours : refermés d'ABORD, comme
        // pour un tap de notification (#10543). Seules les conversations le
        // faisaient ; un lien vers un post, un tag, une communauté ou un profil
        // s'ouvrait SOUS la couverture, et le tap semblait sans effet.
        router.clearPresentedSurfaces { _ in showDeepLink(deepLink) }
    }

    private func showDeepLink(_ deepLink: DeepLink) {
        switch deepLink {
        case .callRequest(let conversationId, let isVideo):
            // Le lien d'appel ne compose pas : il DEMANDE (feuille de
            // confirmation). Mise à jour forcée et barrière d'âge passent avant.
            let upgradeGate = self.upgradeGate
            let gatesOpen: @MainActor () -> Bool = {
                !upgradeGate.isBlocked && !AgeGateController.shared.isShowing
            }
            Task { @MainActor in
                await CallLinkConfirmationController.shared.request(
                    conversationId: conversationId, isVideo: isVideo, gatesOpen: gatesOpen)
            }
        case .trackedLink(let token):
            // `/l/<token>` resolved async by targetType (re-sets pendingDeepLink).
            deepLinkRouter.resolveTrackedLink(token)
        case .joinLink(let identifier), .chatLink(let identifier):
            // RootView ne se monte qu'authentifié — la branche SANS compte est
            // tenue par `MeeshyApp.handleGuestDeepLink`. Ici, la personne A un
            // compte, et c'est précisément là qu'un choix lui revient : entrer
            // à visage découvert, ou sous pseudonyme. On rejoignait
            // silencieusement avec le compte, engageant nom, photo et
            // historique dans un groupe parfois inconnu, sans rien demander —
            // et une jointure ne se défait pas d'un geste.
            resolveShareLinkEntry(identifier: identifier)

        case .conversation(let id):
            // Validate the conversation exists BEFORE navigating. Pushing a
            // placeholder Conversation for an id that the server doesn't
            // know lands the user on an empty screen with no recovery —
            // worse, returning to that screen via an external link re-fires
            // the deep link and recreates the empty view, looking like an
            // infinite loop to the user.
            navigateToConversationById(id)

        case .postDetail(let postId):
            // PostDetailView lazy-loads the post itself, so we can push
            // immediately with `initialPost: nil`. The route case already
            // exists for in-app feed taps; the deep link just reuses it.
            router.push(.postDetail(postId))

        case .reel(let postId):
            // Un réel nommé : même porte que sa notification (#7805).
            notificationNavigator.openReelFromNotification(postId: postId)

        case .storyDetail(let postId):
            // La porte partagée avec l'iPad et le lien tapé dans l'app : le
            // `postId` voyage, une story absente du tray est chargée, le détail
            // du post n'est que le repli d'une story morte (#4903, #7807).
            Task { @MainActor in
                await StoryDoor(tray: storyViewModel, viewer: storyViewerCoordinator)
                    .open(postId: postId) { router.push(.postDetail(postId)) }
            }

        case .userProfile(let username):
            // Opens the profile sheet over the conversation list (same
            // surface as in-app `Link` taps via Router.handleDeepLink and
            // as notification-driven profile navigation). La fabrique
            // `from(idOrUsername:)` distingue un ObjectId d'un pseudo : un
            // `/l/<token>` de type PROFILE porte un userId, jamais un handle,
            // et le passer comme `username` interrogeait le serveur avec un
            // pseudo qui n'existe pas.
            router.deepLinkProfileUser = ProfileSheetUser.from(idOrUsername: username)

        case .ownProfile:
            // Pop to the conversation list root first so back-swipe from
            // the profile screen lands on the home surface — not whatever
            // happened to be on top of the nav stack at cold launch.
            router.popToRoot()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                router.push(.profile)
            }

        case .userLinks:
            router.popToRoot()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                router.push(.links)
            }

        case .hashtag(let tag):
            router.push(.hashtagResults(tag: tag))

        case .community(let id):
            router.push(.communityDetail(id))

        case .recentConversation, .unreadConversations:
            // Widgets et App Shortcut (#7811) : élections de `ConversationListEntry`.
            router.popToRoot()
            if deepLink == .unreadConversations {
                conversationViewModel.selectedFilters = ConversationListEntry.unreadFilters
            } else if let id = ConversationListEntry.recentConversationId(in: conversationViewModel.conversations) {
                navigateToConversationById(id)
            }

        case .externalLink(let url):
            // `/l/<token>` de cible EXTERNAL (façade d'une URL postée dans un
            // message) : la destination vit sur le web. Elle s'ouvre — elle ne
            // « rejoint » rien.
            UIApplication.shared.open(url)

        case .game(let link): // Saison ou semaine de ligue (#9947) : la page du Jeu, posée sur Progression et la fiche.
            router.openGame(at: GameNavigationMap.entry(for: link))
        case .packShop(let domain, let pack): router.openPackShop(domain: domain, pack: pack) // La vitrine filtrée (#10632).

        case .unresolvedTrackedLink:
            // Le serveur ne connaît pas ce token, ou on n'a pas pu le joindre.
            // On le DIT. L'ancien repli poussait le token dans la voie jointure,
            // qui répondait 404 et affichait « Lien introuvable » — un message
            // faux pour un lien parfaitement valide mais hors ligne.
            FeedbackToastManager.shared.showError(
                String(localized: "deepLink.tracked.unresolved",
                       defaultValue: "Ce lien n'a pas pu être ouvert",
                       bundle: .main)
            )

        case .magicLink, .emailVerificationLink:
            break
        }
    }

    /// Lien de partage tapé alors qu'un compte est présent : QUI entre ?
    ///
    /// La décision est une règle PURE du SDK (`ShareLinkEntryPolicy`) et la
    /// collecte des faits vit dans `ShareLinkEntryResolver`, partagé avec
    /// `iPadRootView` — les deux vues portaient déjà chacune leur copie du
    /// raccourci qu'on remplace ici, et en garder deux les ferait diverger.
    /// Cette méthode ne fait qu'EXÉCUTER l'intention.
    private func resolveShareLinkEntry(identifier: String) {
        Task {
            let known = Set(conversationViewModel.conversations.map(\.id))
            guard let resolution = await ShareLinkEntryResolver.resolve(
                identifier: identifier,
                isAuthenticated: true,
                knownConversationIds: known
            ) else {
                // Résolution impossible : on retombe sur le comportement d'avant
                // plutôt que sur un cul-de-sac. Un lien qui n'ouvre rien est
                // pire qu'un lien qui ne propose pas le choix.
                joinViaShareLink(identifier: identifier)
                return
            }

            if let landing = resolution.landing(identifier: identifier) {
                shareLinkChoice = landing
                return
            }
            guard case .openConversation(let conversationId) = resolution.intent else {
                joinViaShareLink(identifier: identifier)
                return
            }
            navigateToConversationById(conversationId)
        }
    }

    private func joinViaShareLink(identifier: String) {
        Task {
            do {
                let response = try await ShareLinkService.shared.joinAuthenticated(linkId: identifier)
                navigateToConversationById(response.conversationId)
            } catch let error as MeeshyError {
                let message: String
                switch error {
                case .server(404, _):
                    message = String(localized: "link.error.not-found", defaultValue: "Lien introuvable")
                case .server(410, let msg):
                    message = msg.isEmpty
                        ? String(localized: "link.error.inactive", defaultValue: "Ce lien n'est plus actif")
                        : msg
                case .forbidden(let reason, _):
                    message = reason ?? String(localized: "link.error.forbidden", defaultValue: "Accès refusé à cette conversation")
                default:
                    message = error.errorDescription ?? String(localized: "link.error.open", defaultValue: "Impossible d'ouvrir le lien")
                }
                FeedbackToastManager.shared.showError(message)
            } catch {
                FeedbackToastManager.shared.showError(
                    String(localized: "link.error.open", defaultValue: "Impossible d'ouvrir le lien")
                )
            }
        }
    }

    // MARK: - Unified Notification Navigation

    private func handleNotificationTap(_ notification: APINotification) {
        notificationNavigator.navigateFromNotification(NotificationNavContext(from: notification))
    }

    private func handleSocketNotificationTap(_ event: SocketNotificationEvent) {
        notificationNavigator.navigateFromNotification(NotificationNavContext(from: event))
    }

    /// Long-press / pull-down on a notification toast: open the conversation as
    /// a preview overlay (reuses `ConversationView` with `previewMode`) instead
    /// of navigating away. Resolves the conversation cache-first (in-memory →
    /// GRDB → network), falling back to normal navigation when it isn't a
    /// conversation notification or can't be resolved.
    private func openNotificationPreview(for event: SocketNotificationEvent) {
        guard let conversationId = event.conversationId, !conversationId.isEmpty else {
            handleSocketNotificationTap(event)
            return
        }
        // Swallow the release tap that the toast Button may emit right after the
        // long-press / drag, then re-arm shortly after.
        suppressToastTap = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { suppressToastTap = false }
        HapticFeedback.medium()
        notifications.manager.dismissToast()

        // Fast path: in-memory conversation list.
        if let existing = conversationViewModel.conversations.first(where: { $0.id == conversationId }) {
            notificationPreviewConversation = existing
            return
        }

        // @MainActor Task: every suspension resumes on the main actor, so the
        // @State mutations and `AuthManager.shared.currentUser` access are
        // isolation-correct without per-call `MainActor.run` wrappers.
        Task { @MainActor in
            // Cache-first: GRDB conversations list.
            let cachedList = await CacheCoordinator.shared.conversations.load(for: "list")
            let cachedConversations: [MeeshyConversation]? = {
                switch cachedList {
                case .fresh(let list, _), .stale(let list, _): return list
                case .expired, .empty: return nil
                }
            }()
            if let cached = cachedConversations?.first(where: { $0.id == conversationId }) {
                notificationPreviewConversation = cached
                return
            }

            // Network fallback.
            let currentUserId = AuthManager.shared.currentUser?.id ?? ""
            if let apiConv = try? await ConversationService.shared.getById(conversationId) {
                notificationPreviewConversation = apiConv.toConversation(currentUserId: currentUserId)
            } else {
                // Could not resolve — fall back to normal navigation.
                handleSocketNotificationTap(event)
            }
        }
    }

    func handlePushNotificationTap(_ payload: NotificationPayload) {
        notificationNavigator.navigateFromNotification(NotificationNavContext(from: payload))
    }

    // MARK: - Portes de navigation

    /// Collaborateurs sans état, reconstruits à la demande : ils ne portent que
    /// le routeur et la LECTURE de la liste vivante (`RootConversationOpener`,
    /// `RootNotificationNavigator`).
    private var conversationOpener: RootConversationOpener {
        let list = conversationViewModel
        return RootConversationOpener(router: router, knownConversations: { list.conversations })
    }

    private var notificationNavigator: RootNotificationNavigator {
        RootNotificationNavigator(router: router, conversationOpener: conversationOpener)
    }

    private func navigateToConversationById(_ conversationId: String, highlightMessageId: String? = nil) {
        conversationOpener.navigateToConversationById(conversationId, highlightMessageId: highlightMessageId)
    }

    // MARK: - Pending Settings Banner
    /// Surfaces the count of user-settings changes still queued in
    /// `SettingsActionQueue` (typed offline, replayed on reconnect). Self-
    /// hides when the queue drains. Shown only when the device is online so
    /// it does not stack with `OfflineBanner`.
    private var pendingSettingsBannerOverlay: some View { RootPendingBanners() }

    // MARK: - Themed Background

    // MARK: - Reels Liquid Reveal Orchestration

    /// Opens the reels overlay: animate the wavy disc 0→1 from the feed button.
    /// Two timers fire off the animation: playback starts 0.2s BEFORE the disc is
    /// full (so the reel is already running when revealed), and the mask drops at
    /// full screen (so the live `AVPlayer` surface renders instead of staying
    /// frozen under a persistent `.mask()`). Reduce Motion uses a quick cross-fade.
    private func openReels() {
        reelsRevealCompleted = false
        reelsRevealClosing = false
        reelsRevealMasked = true
        reelsRevealProgress = 0
        let duration: Double = reduceMotionEnabled ? 0.18 : 0.35
        withAnimation(.easeOut(duration: duration)) {
            reelsRevealProgress = 1
        }
        // Wait for the reveal to FINISH before the first reel plays. Starting
        // earlier played UNDER the (poster-freezing) `.mask()`: those frames were
        // invisible, then dropping the mask snapped the surface to an already-
        // advanced frame — the launch flash. Now, at the animation's end, drop the
        // mask FIRST (the poster / frame 0 shows), THEN start playback from frame 0
        // over the poster that stays underneath (`ReelVideoView` keeps `ReelPoster`
        // behind the surface) → seamless, no flash and no black gap.
        Task {
            try? await Task.sleep(for: .seconds(duration))
            guard reelsPresenter.launch != nil, !reelsRevealClosing else { return }
            reelsRevealMasked = false
            reelsRevealCompleted = true
        }
    }

    private var reelsCoverScreen: Bool {
        ReelsCover.isCovered(hasLaunch: reelsPresenter.launch != nil, revealCompleted: reelsRevealCompleted)
    }

    /// Closes the reels overlay with the reverse wave: pause the reel, re-apply
    /// the mask, shrink the disc back toward the feed button (1→0), THEN dismiss.
    /// Reduce Motion cross-fades.
    private func closeReels() {
        guard !reelsRevealClosing else { return }
        reelsRevealClosing = true
        reelsRevealCompleted = false
        reelsRevealMasked = true
        SharedAVPlayerManager.shared.pause()
        // Couper aussi tout réel-AUDIO en cours : il est piloté par le moteur
        // externe `@StateObject` de la page (pas par `SharedAVPlayerManager`), et
        // ni `AudioPlayerView.onDisappear` (early-return pour moteur externe) ni
        // `ReelPageView.onChange(isActive)` (la page reste active à la fermeture)
        // ne le stoppent. `stopAllAudio()` coupe les players audio/externes en
        // laissant le moteur vidéo (repris par la surface de fond du feed).
        PlaybackCoordinator.shared.stopAllAudio()
        HapticFeedback.light()
        let duration: Double = reduceMotionEnabled ? 0.18 : 0.3
        withAnimation(.easeIn(duration: duration)) {
            reelsRevealProgress = 0
        }
        Task {
            try? await Task.sleep(for: .seconds(duration))
            reelsPresenter.dismiss()
            reelsRevealClosing = false
        }
    }

    // MARK: - Floating chrome (boutons + menu), au-dessus du chrome global

    @ViewBuilder
    private var floatingChrome: some View {
        if !router.isDeepRoute && reelsPresenter.launch == nil && !onboardingPresence.isPresented {
            RootFloatingChrome(
                showFeed: $showFeed,
                showMenu: $showMenu,
                feedButtonPosition: $feedButtonPosition,
                menuButtonPosition: $menuButtonPosition,
                floatingGeometry: $floatingGeometry,
                unreadCount: notifications.unreadCount,
                onPush: { router.push($0) }
            )
        }
    }
}

// MARK: - Notification Names

/// R-j (réserve tracée Porte V1, `tasks/lentille-workshop-execution.md` §8,
/// notes REV-3 de la ligne V3) : re-preuve — QUATRE sites répétaient le
/// littéral `"openMyStories"` sans domicile partagé : deux ÉCOUTEURS
/// (`RootView.swift`, `iPadRootView.swift`, tous deux "racines" — la porte
/// canonique décrite par `ScrollPillStateTests.test_selfEntryRouting_reusesTheExistingDoors`)
/// et deux ÉMETTEURS (`ConversationListView.swift` — rail « moi » ;
/// `ProfileUserPostsList.swift` — tuile Stories du profil). `RootView` est le
/// domicile retenu : c'est l'une des deux racines qui OBSERVENT ce nom (même
/// patron que `Router.meeshyNavigateToConversation`, dont le domicile est le
/// consommateur canonique, pas un émetteur) — les trois autres sites
/// l'importent, aucun ne recopie plus la chaîne.
extension Notification.Name {
    static let openMyStories = Notification.Name("openMyStories")
}