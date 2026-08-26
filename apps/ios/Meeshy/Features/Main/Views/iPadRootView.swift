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
//   iPadRootView+Sheets.swift       — sheet & fullScreenCover modifiers
//   iPadRootView+Panels.swift       — rightPanelContent, iPadLeftColumnHeader, iPadDivider
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
    /// `iPadRootView+Sheets.swift`.
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
        applyingSheets(
            ZStack {
                themedBackground

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
            // Hôte UNIQUE de la bulle de mood pour toute la fenêtre iPad :
            // couvre les DEUX colonnes dans un seul repère. Les colonnes sont
            // des vues SŒURS — un hôte par colonne rendait DEUX bulles,
            // chacune convertissant l'ancre globale dans son propre repère
            // (bug 2026-07-30). Les sheets gardent leur propre pose.
            .withStatusBubble()
            // Popover contextuel : fermé dès que le panneau droit navigue.
            .adaptiveOnChange(of: rightPanelRoute) { _, _ in
                if StatusBubbleController.shared.currentEntry != nil {
                    StatusBubbleController.shared.dismiss()
                }
            }
            .sheet(item: $shareLinkChoice) { choice in
                ShareLinkIdentitySheet(
                    choice: choice,
                    accountDisplayName: AuthManager.shared.currentUser?.displayName
                        ?? AuthManager.shared.currentUser?.username
                        ?? String(localized: "shareLink.identity.account.fallback", defaultValue: "mon compte"),
                    accountUsername: AuthManager.shared.currentUser?.username,
                    onContinueWithAccount: { joinViaShareLink(identifier: choice.identifier) },
                    onJoinAnonymously: { deepLinkRouter.requestedGuestJoin = choice.identifier }
                )
            }
            // Lot 4.7 — même câblage que `RootView`, et il doit le rester : deux
            // racines de fenêtre qui republieraient différemment seraient deux
            // produits. La porte PORTE son format ; le meuble lit `repostOfId`
            // depuis elle, la graine ne le double pas.
            //
            // Mêmes DEUX moitiés livrées qu'en fenêtre iPhone depuis le
            // 2026-08-25 : le MIROIR repart en `STATUS`, et l'ANCRAGE en post
            // atteint un écran — le plateau est monté par le `body` du meuble
            // sous `ComposerFormatFanPlacement`, et la porte du mood aiguille
            // sur le format. Même dette résiduelle, aussi : ce site ne sème pas
            // `visibility:`, faute que `APIPost.toStatusEntry()` la transmette.
            // Voir le commentaire jumeau de `RootView` et la garde
            // `ComposerDocumentSurfaceTests`
            // `.test_leRepostDUnMood_offreLAncrage_ET_unEcranLePeint`.
            .sheet(item: $republishStatusEntry) { entry in
                MoodComposerDoor(
                    intent: ComposerIntent(origin: .repost(ofPostId: entry.id, sourceFormat: .status)),
                    seed: ComposerMoodSeed(
                        emoji: entry.moodEmoji,
                        text: entry.content,
                        viaUsername: entry.username,
                        audioUrl: entry.audioUrl
                    ),
                    viewModel: statusViewModel
                )
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
            .environmentObject(router)
            .environmentObject(storyViewModel)
            .environmentObject(statusViewModel)
            .environmentObject(conversationViewModel)
            .environmentObject(storyViewerCoordinator)
            // Humeur / anneau de story par EnvironmentValues : les feuilles (dont
            // la feuille de commentaires) en héritent, contrairement aux
            // EnvironmentObject ci-dessus. Cf. SocialChromeEnvironment.swift.
            .meeshySocialChrome(status: statusViewModel, story: storyViewModel, storyViewer: storyViewerCoordinator)
            .environment(\.zoomTransitionNamespace, storyZoomNamespace)
            // Propagate story viewer presentation state — same role as
            // RootView (cf. ConnectionBanner sync pill chevauchement fix
            // 2026-05-27).
            .environment(\.isStoryViewerPresenting, storyViewerCoordinator.pendingRequest != nil)
            // Tuile « Stories » du profil → page « Mes stories » (hôte racine
            // unique du listener — même câblage que RootView).
            .myStoriesSheet(
                isPresented: $showMyStoriesFromProfile,
                followUp: $myStoriesProfileFollowUp,
                viewModel: storyViewModel,
                userId: AuthManager.shared.currentUser?.id ?? "",
                statusViewModel: statusViewModel,
                router: router,
                conversationListViewModel: conversationViewModel,
                perform: { action in
                    switch action {
                    case .openViewer(let postId):
                        storyViewerCoordinator.present(StoryViewerRequest(
                            id: AuthManager.shared.currentUser?.id ?? "",
                            singleGroup: true, postId: postId))
                    case .createStory:
                        storyViewModel.showStoryComposer = true
                    case .editStory(let story):
                        editingStorySessionFromProfile = StoryEditSession(
                            story: story,
                            composer: StoryComposerViewModel(editing: story))
                    case .resumeDraft(let draftId):
                        storyViewModel.openComposer(resumingDraftId: draftId)
                    }
                }
            )
            .storyEditComposerCover(session: $editingStorySessionFromProfile, viewModel: storyViewModel)
            .onReceive(NotificationCenter.default.publisher(for: .openMyStories)) { _ in
                showMyStoriesFromProfile = true
            }
            .onAppear {
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
            .onDisappear {
                router.onRouteRequested = nil
                router.onPopRequested = nil
            }
            .task {
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
            .onReceive(NotificationCenter.default.publisher(for: .navigateToConversation)) { notification in
                if let conversation = notification.object as? Conversation {
                    openConversation(conversation)
                }
            }
            // Drive push-tap navigation straight off the published intent
            // (replayed to late subscribers) rather than a NotificationCenter
            // post that a cold launch could drop before this view mounts.
            // Clearing AFTER navigation makes this the single consumption point.
            .onReceive(PushNotificationManager.shared.$pendingNotificationPayload) { payload in
                guard let payload, AuthManager.shared.isAuthenticated else { return }
                handlePushNotificationTap(payload)
                PushNotificationManager.shared.clearPendingNotification()
            }
            // Navigation par id demandée par une vue sans accès aux helpers de
            // résolution (StarredMessagesView) — highlight scopé déjà parké.
            .onReceive(NotificationCenter.default.publisher(for: .meeshyNavigateToConversation)) { notification in
                guard let conversationId = notification.object as? String, !conversationId.isEmpty else { return }
                navigateToConversationById(conversationId, highlightMessageId: router.pendingHighlightMessageId)
            }
            // Tap sur la carte Now Playing (l'app est simplement ré-ouverte) →
            // ramène vers la conversation et le message audio en cours de lecture.
            .nowPlayingReturnNavigation(router: router) { conversationId in
                conversationViewModel.conversations.contains { $0.id == conversationId }
            }
            .onReceive(NotificationCenter.default.publisher(for: Notification.Name("sendMessageToUser"))) { notification in
                handleSendMessageToUser(notification)
            }
            .onReceive(NotificationCenter.default.publisher(for: Notification.Name("openProfileSheet"))) { notification in
                guard let info = notification.object as? [String: String],
                      let userId = info["userId"] else { return }
                let username = info["username"] ?? userId
                router.deepLinkProfileUser = ProfileSheetUser(userId: userId, username: username)
            }
            .onReceive(NotificationCenter.default.publisher(for: Notification.Name("pushNavigateToRoute"))) { notification in
                handlePushNavigateToRoute(notification)
            }
            // `StoryExpiredContent` posts `.openStoryComposer` from the
            // notification flow when the underlying story is gone. Routing
            // the composer through `StoryViewModel.showStoryComposer`
            // reuses `StoryTrayView`'s existing `.fullScreenCover`, so the
            // CTA animates in cleanly without stacking covers. Mirrors
            // RootView (iPhone).
            .onReceive(NotificationCenter.default.publisher(for: .openStoryComposer)) { _ in
                storyViewModel.showStoryComposer = true
            }
            .onOpenURL { url in
                // Only the share intent flows through Router here — every
                // other destination (joinLink/chatLink/conversation/magicLink)
                // is already routed via MeeshyApp's `.onOpenURL` →
                // DeepLinkRouter → pendingDeepLink → handleDeepLink. Letting
                // Router.handleDeepLink process those a second time
                // double-fires the API call and races the navigation with
                // the pendingDeepLink path.
                if case .share = DeepLinkParser.parse(url) {
                    router.handleDeepLink(url)
                }
            }
            // `initial: true` covers the cold-launch race where a Universal
            // Link sets `pendingDeepLink` from AppDelegate.continue:userActivity:
            // BEFORE this view mounts. Without it, a plain `.onChange` only
            // fires on subsequent transitions and the user lands on the home
            // screen with the deep link silently discarded. consumePendingDeepLink
            // returns nil for the typical cold-launch (no pending link), so
            // firing on the initial value is a free no-op when nothing
            // is queued.
            .adaptiveOnChange(of: deepLinkRouter.pendingDeepLink, initial: true) { _, newValue in
                handleDeepLink(newValue)
            }
        )
        // C4b — la rupture, posée PAR-DESSUS `applyingSheets` : elle recouvre
        // les feuilles de l'iPad, elle ne passe pas derrière. Binding CONSTANT
        // — le contrôleur n'expose aucun retour à `nil` et un `fullScreenCover`
        // sur constante n'a aucun geste de fermeture.
        .fullScreenCover(isPresented: .constant(upgradeGate.isBlocked)) {
            if let requirement = upgradeGate.requirement {
                UpgradeGateView(requirement: requirement)
            }
        }
    }

    // MARK: - Left Column

    @ViewBuilder
    private var leftColumn: some View {
        if isConversationOpen {
            iPadConversationList(showFeedButton: true)
        } else {
            FeedView()
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
            // `NavigationStack` OBLIGATOIRE : sans lui, tout `NavigationLink`
            // interne à un écran du panneau est inerte (lignes de
            // TrackingLinksView / ShareLinksView / CommunityLinksView vers leur
            // vue de détail — mortes sur iPad jusqu'au 2026-07-29). `.id(route)`
            // vide la pile locale quand on change de route, sinon la vue de
            // détail poussée survivrait au changement d'écran racine.
            NavigationStack {
                rightPanelContent(for: route)
                    // Filet de sécurité pour les écrans qui délèguent leur
                    // chrome à la barre système (Messages favoris, membres
                    // d'une communauté…) : racine du panneau, ils n'ont ni
                    // bouton retour propre ni geste de retour, donc aucune
                    // sortie. Les écrans à en-tête maison posent
                    // `.navigationBarHidden(true)` et ne voient jamais ce
                    // bouton — pas de doublon.
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button {
                                HapticFeedback.light()
                                rightPanelRoute = nil
                            } label: {
                                Image(systemName: "chevron.backward")
                            }
                            .accessibilityLabel(String(localized: "root.ipad.close_panel", defaultValue: "Fermer", bundle: .main))
                        }
                    }
            }
            .id(route)
            // Rend `dismiss()` opérant pour les écrans racine du panneau : ils
            // ne sont ni poussés ni présentés, leur bouton retour n'avait donc
            // aucun effet. Cf. `PanelBackAction`.
            .environment(\.meeshyPanelDismiss, { rightPanelRoute = nil })
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

    // MARK: - Themed Background

    private var themedBackground: some View {
        ZStack {
            theme.backgroundGradient
            ForEach(Array(theme.ambientOrbs.enumerated()), id: \.offset) { _, orb in
                Circle()
                    .fill(Color(hex: orb.color).opacity(orb.opacity))
                    .frame(width: orb.size, height: orb.size)
                    .blur(radius: orb.size * 0.25)
                    .offset(x: orb.offset.x, y: orb.offset.y)
            }
        }
        .drawingGroup()
        .ignoresSafeArea()
    }
}

