import SwiftUI
import MeeshySDK
import MeeshyUI

// Les couches PROPRES à `iPadRootView`, dans l'ordre où elles se posent sur le
// `ZStack` racine. Chacune est un `ViewModifier` nominal : voir l'en-tête de
// `RootSharedLayers.swift` pour la raison (#5837). L'ancien `applyingSheets`
// était une fonction GÉNÉRIQUE `(some View) -> some View` : son type opaque se
// re-nichait intégralement dans celui de la racine — découper des fonctions ne
// découpe pas le type. Ici, l'iPad ne voit plus que des noms.

/// Environnement de la fenêtre iPad : la politique des liens in-app, les cinq
/// objets partagés, le chrome
/// social, le namespace de la transition zoom et le drapeau « un viewer de
/// story est présenté ».
struct iPadEnvironmentLayer: ViewModifier {
    let router: Router
    let storyViewModel: StoryViewModel
    let statusViewModel: StatusViewModel
    let conversationViewModel: ConversationListViewModel
    @ObservedObject var storyViewerCoordinator: StoryViewerCoordinator
    let storyZoomNamespace: Namespace.ID

    func body(content: Content) -> some View {
        content
            .modifier(MeeshyRouterInjection(router: router))
            .modifier(PublishesSceneNavigation(router: router, role: .main))
            .environmentObject(storyViewModel)
            .environmentObject(statusViewModel)
            .meeshyConversationList(conversationViewModel)
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
    }
}

/// « Mes stories », l'édition, la révélation du flux à la demande, les
/// rappels de route du `Router` et la tâche de démarrage.
struct iPadStoryAndLifecycleLayer: ViewModifier {
    @Binding var showMyStoriesFromProfile: Bool
    @Binding var myStoriesProfileFollowUp: DeferredSheetFollowUp<MyStoriesFollowUp>
    @Binding var editingStorySessionFromProfile: StoryEditSession?
    let storyViewModel: StoryViewModel
    let statusViewModel: StatusViewModel
    let conversationViewModel: ConversationListViewModel
    @ObservedObject var router: Router
    let storyViewerCoordinator: StoryViewerCoordinator
    let isConversationOpen: Bool
    let onRevealFeed: () -> Void
    let onAppear: () -> Void
    let onDisappear: () -> Void
    let onStart: @MainActor () async -> Void
    /// Le fil et la route ouverts, tels que l'iPhone les empilerait (`RootNavigationHandoff.stack`).
    let navigationStack: [Route]
    /// Reprend la pile laissée par la racine iPhone — appelé APRÈS `onAppear`, qui installe les callbacks du routeur.
    let onRestoreNavigation: ([Route]) -> Void
    /// Ce que la colonne droite montre — le titre de la fenêtre sous App Exposé et Stage Manager.
    let sceneTitle: String
    @Environment(\.rootNavigationHandoff) private var navigationHandoff

    func body(content: Content) -> some View {
        content
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
            // Accès rapide « Publier un post » : RÉVÉLER le flux, exactement ce
            // que `RootView` fait côté iPhone (`showFeed = true`) — c'est
            // `FeedView` qui ouvre ensuite le composeur, en ramassant la demande
            // à son apparition (`feedPostComposer`).
            //
            // Le flux iPad n'occupe la colonne gauche QUE si aucune conversation
            // n'est ouverte (`leftColumn`). Sans cette moitié, la demande levée
            // depuis la liste — qui n'est visible, elle, QUE conversation
            // ouverte — tombait sur une vue non montée : le bouton restait
            // inerte précisément dans le cas où on le voit.
            .adaptiveOnChange(of: router.pendingOpenFeedComposer) { _, pending in
                guard pending, isConversationOpen else { return }
                onRevealFeed()
            }
            .onAppear {
                onAppear()
                // La fenêtre vient de retrouver sa largeur : le fil ouvert en largeur compacte revient dans sa colonne.
                if navigationStack.isEmpty, let routes = navigationHandoff?.routes, !routes.isEmpty {
                    onRestoreNavigation(routes)
                }
            }
            .adaptiveOnChange(of: navigationStack) { _, stack in
                navigationHandoff?.record(stack)
            }
            // Parité `RootStoryDoorsLayer` : sans lui, la fenêtre iPad gardait le titre posé en largeur compacte,
            // et deux fenêtres Meeshy sous Stage Manager portaient le même.
            .adaptiveOnChange(of: sceneTitle, initial: true) { _, title in
                DeviceLayout.activeWindowScene?.title = String(format: String(localized: "root.scene_title_format", defaultValue: "Meeshy — %@", bundle: .main), title)
            }
            .onDisappear(perform: onDisappear)
            .task {
                await onStart()
                ConversationListVMOwner.endLaunch()
            }
    }
}

/// Les feuilles de l'iPad : fiches de profil, partage, nouvelle conversation,
/// aperçu de conversation ouvert depuis un toast.
///
/// Même parité que `RootView` : les deux hôtes présentent les deux fiches de
/// profil, sinon l'iPad ouvre une page vide là où l'iPhone ouvre la bonne.
struct iPadSheetsLayer: ViewModifier {
    @ObservedObject var router: Router
    let storyViewModel: StoryViewModel
    let statusViewModel: StatusViewModel
    let conversationViewModel: ConversationListViewModel
    let storyViewerCoordinator: StoryViewerCoordinator
    @Binding var showSharePicker: Bool
    @Binding var showNewConversation: Bool
    @Binding var notificationPreviewConversation: Conversation?
    let onOpenFullConversation: (Conversation) -> Void

    func body(content: Content) -> some View {
        content
            // La fiche d'un visiteur SANS COMPTE — son identité vit dans une
            // conversation, pas sur un profil.
            .sheet(item: $router.participantProfileTarget) { target in
                ParticipantProfileSheet(
                    conversationId: target.conversationId,
                    participantId: target.participantId
                )
            }
            .sheet(item: $router.deepLinkProfileUser) { user in
                UserProfileSheet(
                    user: user,
                    moodEmoji: statusViewModel.statusForUser(userId: user.userId ?? "")?.moodEmoji,
                    onMoodTap: statusViewModel.moodTapHandler(for: user.userId ?? ""),
                    presenceProvider: { PresenceManager.shared.knownPresenceState(for: $0) },
                    postsContent: { uid in
                        AnyView(ProfileUserPostsList(userId: uid, onOpenPost: { post in
                            router.deepLinkProfileUser = nil
                            router.push(.postDetail(post.id, post))
                        }, onOpenReel: { reel, reels in
                            // Parité RootView : un réel s'ouvre dans le lecteur, pas en détail plat.
                            ProfilePostsOpener.openReel(reel, in: reels) { router.deepLinkProfileUser = nil }
                        }))
                    },
                    onCall: { request in
                        router.deepLinkProfileUser = nil
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                            CallBackDialer.shared.dialFromProfile(request)
                        }
                    }
                )
                .presentationDetents([.large, .medium])
                .presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $showSharePicker) {
                if let shared = router.pendingShareContent {
                    // L'écran de partage unique (#10947) ne lit aucun objet
                    // d'environnement : tout lui est injecté.
                    ShareSheetView(
                        subject: shared,
                        actions: ShareSheetHostActions(onOpenConversation: { router.navigateToConversation($0) }),
                        onDismiss: {
                            router.pendingShareContent = nil
                        }
                    )
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
                    .closesForConversationOpening(.sheet, close: {
                        router.pendingShareContent = nil
                        showSharePicker = false
                    })
                }
            }
            .adaptiveOnChange(of: router.pendingShareContent != nil) { _, hasContent in
                if hasContent { showSharePicker = true }
            }
            // #10947 — un partage relayé par l'extension (sans session, ou vers
            // une conversation chiffrée) rouvre ICI l'écran de partage unique.
            .shareRelayPresenter(consumer: ShareRelayConsumer.shared, router: router)
            .modifier(NewConversationSheetHost(isPresented: $showNewConversation, statusViewModel: statusViewModel))
            // Aperçu de conversation (appui long / tirage sur un toast). La
            // feuille crée un environnement neuf : réinjecter ce que la
            // `ConversationView` réutilisée lit.
            .sheet(item: $notificationPreviewConversation) { conv in
                ConversationView(conversation: conv, previewMode: true, onOpenFullConversation: {
                    notificationPreviewConversation = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                        onOpenFullConversation(conv)
                    }
                })
                .modifier(MeeshyRouterInjection(router: router))
                .environmentObject(storyViewModel)
                .environmentObject(statusViewModel)
                .meeshyConversationList(conversationViewModel)
                .environmentObject(storyViewerCoordinator)
                .presentationDetents([.large, .medium])
                .presentationDragIndicator(.visible)
                .closesForConversationOpening(.sheet)
            }
    }
}

/// Les covers plein écran de l'iPad (viewers de story, composers, réels) et
/// le chrome global (pastille de synchronisation, présentation d'appel).
struct iPadCoversAndChromeLayer: ViewModifier {
    @ObservedObject var router: Router
    let storyViewModel: StoryViewModel
    let statusViewModel: StatusViewModel
    let conversationViewModel: ConversationListViewModel
    @ObservedObject var storyViewerCoordinator: StoryViewerCoordinator
    @ObservedObject var reelsPresenter: ReelsPresenter
    let storyZoomNamespace: Namespace.ID
    let activeConversationId: String?
    /// Le fil sous les yeux — `nil` quand une route du panneau le recouvre (`iPadRightColumn`).
    let visibleConversationId: String?
    /// La route ouverte dans le panneau de droite : un écran profond y cache la bannière du joueur (#9494).
    var rightPanelRoute: Route? = nil
    let onStoryReply: (ReplyContext) -> Void
    let onSyncPillTap: (OutboxUIItem.Source) -> Void
    let activeConversationIdForBanner: () -> String?
    let onMiniPlayerTap: () -> Void
    /// Rouvre un réel qui n'a pas pu se charger (« Réessayer » de `ReelOpenFailureView`).
    var onRetryReel: @MainActor (_ postId: String, _ commentId: String?, _ parentCommentId: String?) async -> Void = { _, _, _ in }

    func body(content: Content) -> some View {
        content
            .modifier(StoryReaderCover(
                request: $storyViewerCoordinator.pendingRequest,
                storyViewModel: storyViewModel,
                statusViewModel: statusViewModel,
                router: router,
                conversationList: conversationViewModel,
                presentationSource: "iPadRootView.fromConv",
                zoomNamespace: storyZoomNamespace,
                onReply: onStoryReply
            ))
            // La célébration d'un palier (#5809) — l'hôte est écrit une seule
            // fois et vit chez les deux racines à l'identique.
            .engagementReveal(router: router)
            .storyComposerCover(
                viewModel: storyViewModel,
                router: router,
                conversationListViewModel: conversationViewModel,
                statusViewModel: statusViewModel
            )
            .shareComposeCover(
                consumer: ShareComposeHandoffConsumer.shared,
                storyViewModel: storyViewModel
            )
            .fullScreenCover(item: $reelsPresenter.launch) { launch in
                GeometryReader { proxy in
                    // Parité RootView (#6508) : un réel qui n'a pas pu se charger montre SON échec. Monté sur une
                    // graine vide, le lecteur partait en démarrage à froid et jouait d'autres réels sans rapport.
                    if let failure = launch.failure, let postId = launch.startId {
                        ReelOpenFailureView(
                            failure: failure,
                            onRetry: {
                                await onRetryReel(postId, launch.commentId, launch.parentCommentId)
                            },
                            onClose: { reelsPresenter.dismiss() }
                        )
                    } else {
                    ReelsPlayerView(
                        seedPosts: launch.seedPosts,
                        startId: launch.startId,
                        commentTargetId: launch.commentId,
                        commentParentTargetId: launch.parentCommentId,
                        revealCompleted: true,
                        safeArea: proxy.safeAreaInsets,
                        onClose: { reelsPresenter.dismiss() },
                        onOpenProfile: { userId, username in
                            reelsPresenter.dismiss()
                            router.deepLinkProfileUser = ProfileSheetUser(userId: userId, username: username)
                        },
                        onOpenStory: { userId in
                            reelsPresenter.dismiss()
                            storyViewerCoordinator.present(StoryViewerRequest(
                                id: userId,
                                startAtFirstUnviewed: true,
                                singleGroup: true
                            ))
                        },
                        onOpenDetail: { postId in
                            reelsPresenter.dismiss()
                            router.push(.postDetail(postId))
                        },
                        authorHasStory: { userId in
                            storyViewModel.storyRingState(forUserId: userId) != .none
                        }
                    )
                    .ignoresSafeArea()
                    }
                }
                .modifier(MeeshyRouterInjection(router: router))
                .environmentObject(statusViewModel)
                .meeshyConversationList(conversationViewModel)
                .environmentObject(storyViewModel)
            }
            .overlay(alignment: .bottom) {
                ConnectionBanner(
                    conversationListViewModel: conversationViewModel,
                    isStoryViewerPresenting: storyViewerCoordinator.pendingRequest != nil,
                    onItemTap: onSyncPillTap,
                    activeConversationId: activeConversationIdForBanner
                )
                // Au-dessus du chrome bas, comme sur iPhone (#10840).
                .inSyncPillBand()
            }
            .modifier(CallPresentationLayer(
                miniPlayerOnTapBody: onMiniPlayerTap,
                miniPlayerCurrentConversationId: { visibleConversationId },
                // La BANNIÈRE DU JOUEUR (#9494), comme sur iPhone : la colonne des conversations reste là, mais un fil
                // ouvert a besoin de toute sa hauteur, et le lecteur de réels est plein cadre.
                playerBannerHosted: PlayerBannerPlacement.hostsOnTablet(
                    conversationIsOpen: activeConversationId != nil, panelRoute: rightPanelRoute,
                    reelsAreOpen: reelsPresenter.launch != nil),
                onPlayerBannerTap: { router.openGame(at: .progressionConcept($0.concept)) }
            ))
            // L'onboarding post-inscription (#7729) — le même hôte que sur
            // iPhone, au même rang : APRÈS la pastille et la présentation
            // d'appel, qu'un `.overlay` posé plus tôt laisserait flotter sur la
            // carte. Garde : `OnboardingAboveGlobalChromeGuardTests`.
            // Sur iPad, la conversation ou le panneau qu'un push a ouvert vit hors de `Router.path` (#7780).
            .onboardingHost(storyViewModel: storyViewModel, router: router,
                            tabletDestinationIsOpen: activeConversationId != nil || rightPanelRoute != nil)
            // « Validez votre compte » (#8239) : une FEUILLE, qui passe après
            // l'onboarding (`OnboardingPresenceSignal`).
            .activationInviteHost()
            // Un lien Meeshy touché dans l'app s'ouvre dans l'app (#7808) — posé
            // sur la couche la plus EXTÉRIEURE : une couverture présentée par un
            // modificateur hérite de l'environnement de SON point d'attache, et
            // le lecteur de story (couverture plein écran) rendait sinon à Safari
            // les liens de sa légende et de ses commentaires (#9075). Ici plutôt
            // que sur `iPadRootView.body` : plafond de profondeur (24).
            .inAppLinks(router: router)
            // La fenêtre de ce routeur, posée par la couche la plus EXTERNE :
            // feuilles et pleins écrans s'y déclarent, et une ouverture ne
            // referme que ceux de cette fenêtre (#10543).
            // La demande d'un lien d'appel : confirmée ici, dans la fenêtre principale.
            .callLinkConfirmationSheet()
            .environment(\.presentedSurfaceScope, router.surfaceScope)
    }
}
