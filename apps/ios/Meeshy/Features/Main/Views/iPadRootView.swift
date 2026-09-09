import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - iPad Root View (Two-Column Feed-First Layout)
//
// Layout contract:
//   Default state:   [Feed (left)]  [Conversation List (right)]
//   Conv opened:     [Conv List (left)]  [Conversation (right)]
//   Hub route:       [Feed (left)]  [Settings/Notifications/... (right)]
//
// The feed is always the most accessible view. Opening a conversation
// swaps the feed for the conversation list on the left, and shows
// the conversation on the right. A "Feed" button lets the user
// dismiss the open conversation and return to the default state.
//
// File split:
//   iPadRootView.swift              — struct, properties, body, columns, background
//   RootLayers/iPadRootViewLayers.swift — couches nominales (feuilles, covers, chrome) (#5837)
//   iPadRootView+Panels.swift       — iPadPanelDestination, iPadLeftColumnHeader, iPadDivider
//   iPadRootView+Overlays.swift     — offline banner, toasts, notification toasts
//   iPadRootView+Navigation.swift   — all navigation & notification handlers

struct iPadRootView: View {
    @StateObject var theme = ThemeManager.shared
    @StateObject var toastManager = FeedbackToastManager.shared
    @StateObject var storyViewModel = StoryViewModel()
    @StateObject var statusViewModel = StatusViewModel()
    // Possédé sans être observé (cf. ConversationListVMOwner, RootView.swift) :
    // évite le re-render de iPadRootView à chaque churn du VM (presence,
    // reloadFromCache). Exposé via la propriété calculée `conversationViewModel`,
    // consommée telle quelle par les extensions (+Sheets, +Navigation).
    @StateObject var conversationVMOwner = ConversationListVMOwner()
    var conversationViewModel: ConversationListViewModel { conversationVMOwner.viewModel }
    @StateObject var router = Router()
    /// Hoisted at the iPad root so deep-stack screens (e.g.
    /// `StoryNotificationTargetScreen` → `StoryActiveBridge`) can present
    /// the story viewer through `.environmentObject` injection without
    /// threading a binding through every parent view. Mirrors RootView's
    /// (iPhone) coordinator wiring; the cover is wired in
    /// `RootLayers/iPadRootViewLayers.swift` (`iPadCoversAndChromeLayer`).
    @StateObject var storyViewerCoordinator = StoryViewerCoordinator()
    /// Page « Mes stories » ouverte depuis la tuile Stories du profil —
    /// même hôte racine unique que RootView (cf. commentaire là-bas).
    @State private var showMyStoriesFromProfile = false
    @State private var myStoriesProfileFollowUp = DeferredSheetFollowUp<MyStoriesFollowUp>()
    @State private var editingStorySessionFromProfile: StoryEditSession?
    // CallManager n'est PLUS observé ici : la présentation d'appel passe par
    // `.modifier(CallPresentationLayer())` (partagé avec RootView) qui isole le
    // churn d'appel hors de `iPadRootView.body`. Cf. watchdog 0x8BADF00D.
    @ObservedObject var notificationManager = NotificationToastManager.shared
    /// Ne publie que `launch` — une ouverture/fermeture de lecteur de réels,
    /// pas un flux. L'observer ne rejoue donc pas le churn que `CallManager`
    /// imposait ici (cf. watchdog 0x8BADF00D juste au-dessus).
    @ObservedObject var reelsPresenter = ReelsPresenter.shared
    @EnvironmentObject var deepLinkRouter: DeepLinkRouter
    @Environment(\.colorScheme) var systemColorScheme

    @State var activeConversation: Conversation?
    @State var rightPanelRoute: Route?
    /// Mood à republier depuis la bulle (hôte racine) — composer pré-rempli.
    @State private var republishStatusEntry: StatusEntry?
    @State var showStoryViewerFromConv = false
    @State var selectedStoryUserIdFromConv: String?
    @State var showSharePicker = false
    @State var showNewConversation = false
    @State private var isScrollingDown = false
    @State private var feedIsVisible = true
    @State private var leftColumnRatio: CGFloat = 0.38

    /// Choix d'identité en attente sur un lien de partage — jumeau de
    /// `RootView`. Les deux vues partagent la RÉSOLUTION
    /// (`ShareLinkEntryResolver`) et ne gardent que leur présentation.
    @State var shareLinkChoice: ShareLinkIdentityChoice?

    /// Conversation surfaced by a long-press / pull-down on a notification toast
    /// — presented as a reusable `ConversationView` preview over the columns.
    @State var notificationPreviewConversation: Conversation?
    /// Swallows the toast Button's release tap that can fire right after the
    /// long-press / drag opened the preview (prevents double action).
    @State var suppressToastTap = false

    /// U1 inc.2 — namespace zoom tray→viewer (parité RootView iPhone).
    @Namespace var storyZoomNamespace

    /// C4b — rupture cliente, jumeau de `RootView`. Rév. 2 du plan, remarque
    /// G6 : l'iPad a sa racine PROPRE. Sans cette observation-là, un iPad prend
    /// des 426 bruts en pleine publication et ne voit JAMAIS l'écran de mise à
    /// jour — les deux racines ne partagent pas une ligne.
    @StateObject private var upgradeGate = UpgradeGateController()

    private var isConversationOpen: Bool {
        activeConversation != nil
    }

    var body: some View {
        ZStack {
            RootThemedBackground(theme: theme)

            GeometryReader { geometry in
                HStack(spacing: 0) {
                    leftColumn
                        .frame(width: geometry.size.width * leftColumnRatio)

                    iPadResizableHandle(ratio: $leftColumnRatio, screenWidth: geometry.size.width)

                    rightColumn
                        .frame(maxWidth: .infinity)
                }
            }

            overlays
        }
        // Chaque couche est un `ViewModifier` NOMINAL (#5837) : la chaîne de
        // modificateurs — dont l'ancien `applyingSheets`, une fonction GÉNÉRIQUE
        // dont le type se re-nichait ici — imbriquait 69 niveaux dans le type de
        // ce `body`, ~1145 Ko de pile de démangleur contre 1008 Ko sur
        // l'appareil. L'ORDRE des couches, et celui des modificateurs dans
        // chacune, sont ceux de la chaîne d'origine. Garde :
        // `ConversationViewBodyTypeDepthTests`.
        //
        // Hôte UNIQUE de la bulle de mood pour toute la fenêtre iPad : couvre
        // les DEUX colonnes dans un seul repère. Les colonnes sont des vues
        // SŒURS — un hôte par colonne rendait DEUX bulles (bug 2026-07-30). La
        // bulle se ferme dès que le panneau droit navigue.
        .modifier(RootStatusBubbleLayer(
            navigationToken: AnyHashable(rightPanelRoute),
            shareLinkChoice: $shareLinkChoice,
            republishStatusEntry: $republishStatusEntry,
            statusViewModel: statusViewModel,
            onContinueWithAccount: joinViaShareLink(identifier:),
            onJoinAnonymously: { deepLinkRouter.requestedGuestJoin = $0 }
        ))
        .modifier(iPadEnvironmentLayer(
            router: router,
            storyViewModel: storyViewModel,
            statusViewModel: statusViewModel,
            conversationViewModel: conversationViewModel,
            storyViewerCoordinator: storyViewerCoordinator,
            storyZoomNamespace: storyZoomNamespace
        ))
        .modifier(iPadStoryAndLifecycleLayer(
            showMyStoriesFromProfile: $showMyStoriesFromProfile,
            myStoriesProfileFollowUp: $myStoriesProfileFollowUp,
            editingStorySessionFromProfile: $editingStorySessionFromProfile,
            storyViewModel: storyViewModel,
            statusViewModel: statusViewModel,
            conversationViewModel: conversationViewModel,
            router: router,
            storyViewerCoordinator: storyViewerCoordinator,
            isConversationOpen: isConversationOpen,
            onRevealFeed: closePanels,
            onAppear: installRouterCallbacks,
            onDisappear: uninstallRouterCallbacks,
            onStart: startRootServices
        ))
        .modifier(RootIntentRoutingLayer(
            router: router,
            storyViewModel: storyViewModel,
            onNavigateToConversation: openConversation,
            onPushNotificationTap: handlePushNotificationTap,
            onNavigateToConversationId: { navigateToConversationById($0, highlightMessageId: $1) },
            isKnownConversation: { conversationId in
                conversationViewModel.conversations.contains { $0.id == conversationId }
            },
            onSendMessageToUser: handleSendMessageToUser,
            onPushNavigateToRoute: handlePushNavigateToRoute
        ))
        // `initial: true` covers the cold-launch race where a Universal Link
        // sets `pendingDeepLink` from AppDelegate.continue:userActivity: BEFORE
        // this view mounts. `consumePendingDeepLink` returns nil for the typical
        // cold-launch, so firing on the initial value is a free no-op.
        .adaptiveOnChange(of: deepLinkRouter.pendingDeepLink, initial: true) { _, newValue in
            handleDeepLink(newValue)
        }
        .modifier(iPadSheetsLayer(
            router: router,
            storyViewModel: storyViewModel,
            statusViewModel: statusViewModel,
            conversationViewModel: conversationViewModel,
            storyViewerCoordinator: storyViewerCoordinator,
            showSharePicker: $showSharePicker,
            showNewConversation: $showNewConversation,
            notificationPreviewConversation: $notificationPreviewConversation,
            onOpenFullConversation: openConversation
        ))
        .modifier(iPadCoversAndChromeLayer(
            router: router,
            storyViewModel: storyViewModel,
            statusViewModel: statusViewModel,
            conversationViewModel: conversationViewModel,
            storyViewerCoordinator: storyViewerCoordinator,
            reelsPresenter: reelsPresenter,
            storyZoomNamespace: storyZoomNamespace,
            showStoryViewerFromConv: $showStoryViewerFromConv,
            selectedStoryUserIdFromConv: selectedStoryUserIdFromConv,
            activeConversationId: activeConversation?.id,
            onStoryReply: handleStoryReply,
            onSyncPillTap: handleSyncPillTap,
            activeConversationIdForBanner: { activeConversation?.id ?? notificationPreviewConversation?.id },
            onMiniPlayerTap: {
                guard let convId = ConversationAudioCoordinator.shared
                    .activeContext?.conversationId else { return }
                navigateToConversationById(convId)
            }
        ))
        // C4b — la rupture, posée PAR-DESSUS les feuilles : elle les recouvre,
        // elle ne passe pas derrière. Binding CONSTANT — le contrôleur n'expose
        // aucun retour à `nil` et un `fullScreenCover` sur constante n'a aucun
        // geste de fermeture.
        .fullScreenCover(isPresented: .constant(upgradeGate.isBlocked)) {
            if let requirement = upgradeGate.requirement {
                UpgradeGateView(requirement: requirement)
            }
        }
    }

    // MARK: - Cycle de vie de la racine (monté par `iPadStoryAndLifecycleLayer`)

    private func installRouterCallbacks() {

        router.onRouteRequested = { route in
            if case .conversation(let conv) = route {
                openConversation(conv)
                return true
            }
            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                rightPanelRoute = route
            }
            return true
        }

        router.onPopRequested = {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                if rightPanelRoute != nil {
                    rightPanelRoute = nil
                } else if activeConversation != nil {
                    activeConversation = nil
                }
            }
        }
    }

    private func uninstallRouterCallbacks() {
        router.onRouteRequested = nil
        router.onPopRequested = nil
    }

    /// Le corps du `.task` de la racine : connexion socket, abonnements,
    /// exécuteur de publication, chargements parallèles — miroir de `RootView`.
    private func startRootServices() async {

        MessageSocketManager.shared.connect()
        statusViewModel.subscribeToSocketEvents()
        // Sans cet appel, le SDK reçoit bien `story:created` mais
        // personne n'est sink'é sur `socialSocket.storyCreated` → la
        // story n'arrive jamais dans `storyGroups`.
        storyViewModel.subscribeToSocketEvents()
        // Même raison, pour le feed : `FeedSocketHandler` est le SEUL
        // écrivain disque des posts, commentaires et réactions.
        // `arm()` est idempotent — jamais désarmé (miroir de RootView).
        DependencyContainer.shared.feedSocketHandler.arm()
        await ConversationSyncEngine.shared.startSocketRelay()

        Task.detached(priority: .background) {
            try? await Task.sleep(for: .seconds(5))
            await ConversationSyncEngine.shared.cleanupRetentionIfNeeded()
        }

        conversationViewModel.observeSync()

        #if DEBUG
        // Pré-résout à pile courte les métadonnées du 1er rendu de
        // ConversationView (classe de crashs stack-overflow du décodeur
        // Swift sur device Debug — cf. ConversationFirstRenderWarmup).
        ConversationFirstRenderWarmup.run()
        #endif

        // Réponse à un mood : résout/ouvre la DM avec l'auteur et amorce
        // le composer (voir RootView pour l'équivalent iPhone).
        StatusBubbleController.shared.onConfirmedReply = { entry in
            router.navigateToStoryReply(
                .status(statusId: entry.id, authorId: entry.userId,
                        authorName: entry.username, emoji: entry.moodEmoji,
                        content: entry.content, publishedAt: entry.createdAt),
                conversationListViewModel: conversationViewModel
            )
        }

        // Republication d'un mood depuis la bulle (hôte racine) —
        // même câblage que RootView.
        StatusBubbleController.shared.onRepublish = { entry in
            republishStatusEntry = entry
        }

        // Exécuteur de la file de publication des stories. `setExecutor`
        // enregistre AUSSI le `publishHandler` de la file, dans le même
        // appel : sans lui, `StoryPublishQueue.processNext` journalise
        // « No publish handler set, skipping process » et rend la main à
        // chaque passage. Une story publiée depuis un iPad restait donc
        // en file INDÉFINIMENT, sans jamais partir.
        //
        // Ce câblage n'existait que dans `RootView` (iPhone). Il doit
        // vivre dans les DEUX racines, et non dans `MeeshyApp` : le
        // handler doit être posé de façon atomique avec l'exécuteur,
        // sinon le drain se déclenche sur un exécutif nul et brûle le
        // budget de reprise (cf. StoryPublishService.setExecutor).
        StoryPublishService.shared.setExecutor(storyViewModel)

        // Parallélisés comme sur RootView (iPhone) : les 4 chargements
        // sont indépendants — en série, l'écran visible (conversations)
        // attendait derrière stories et statuses.
        // C4b — plancher de version lu au démarrage, best-effort et
        // silencieux (miroir de RootView).
        async let versionFloor: Void = upgradeGate.checkFloor()
        async let storiesLoad: Void = storyViewModel.loadStories()
        async let statusesLoad: Void = statusViewModel.loadStatuses()
        async let conversationsLoad: Void = conversationViewModel.loadConversations()
        async let unreadRefresh: Void = notificationManager.refreshUnreadCount()
        _ = await (storiesLoad, statusesLoad, conversationsLoad, unreadRefresh, versionFloor)
    }

    // MARK: - Left Column

    @ViewBuilder
    private var leftColumn: some View {
        if isConversationOpen {
            iPadConversationList(showFeedButton: true)
        } else {
            FeedView(conversationListViewModel: conversationViewModel)
        }
    }

    // MARK: - Right Column

    @ViewBuilder
    private var rightColumn: some View {
        if let conversation = activeConversation {
            ConversationView(
                conversation: conversation,
                replyContext: router.pendingReplyContext,
                // I-075 — override éphémère, jamais persistant : consommé ici
                // comme `pendingReplyContext` ci-dessus, jamais écrit en
                // préférence.
                forcedReadingMode: router.pendingForcedReadingMode
            )
            .id(conversation.id)
            .navigationBarHidden(true)
            .onAppear {
                router.pendingReplyContext = nil
                router.pendingForcedReadingMode = nil
            }
        } else if let route = rightPanelRoute {
            // Vue NOMINALE (#5837) : `NavigationStack` + toolbar + destination
            // entraient sinon dans le type de ce `body` — la branche la plus
            // profonde de la colonne droite.
            iPadRightPanel(
                route: route,
                rightPanelRoute: $rightPanelRoute,
                notificationManager: notificationManager,
                onOpenConversation: openConversation,
                onNotificationTap: handleNotificationTap
            )
        } else {
            iPadConversationList(showFeedButton: false)
        }
    }

    // MARK: - iPad Conversation List (shared between columns)

    @ViewBuilder
    private func iPadConversationList(showFeedButton: Bool) -> some View {
        let feedAction: (() -> Void)? = showFeedButton ? { closePanels() } : nil
        ConversationListView(
            isScrollingDown: $isScrollingDown,
            feedIsVisible: $feedIsVisible,
            onSelect: { conversation in openConversation(conversation) },
            onStoryViewRequest: { userId, _ in
                // Chemin coordinator (`fullScreenCover(item:)`) : la requête
                // porte son uid, contrairement au couple @State legacy
                // (`selectedStoryUserIdFromConv` + `isPresented`) dont la
                // course de commit présentait le viewer avec un uid vide —
                // l'écran « Story introuvable » du tray de la colonne conv.
                storyViewerCoordinator.present(
                    StoryViewerRequest(id: userId, startAtFirstUnviewed: true)
                )
            },
            onNewConversation: { showNewConversation = true },
            iPadNotificationCount: notificationManager.unreadCount,
            onNotificationsTap: { rightPanelRoute = .notifications },
            onSettingsTap: { rightPanelRoute = .settings },
            iPadFeedAction: feedAction,
            selectedConversationId: activeConversation?.id
        )
        .navigationBarHidden(true)
    }

}

