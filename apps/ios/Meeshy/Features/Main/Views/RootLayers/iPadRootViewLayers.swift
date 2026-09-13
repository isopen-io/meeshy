import SwiftUI
import MeeshySDK
import MeeshyUI

// Les couches PROPRES à `iPadRootView`, dans l'ordre où elles se posent sur le
// `ZStack` racine. Chacune est un `ViewModifier` nominal : voir l'en-tête de
// `RootSharedLayers.swift` pour la raison (#5837). L'ancien `applyingSheets`
// était une fonction GÉNÉRIQUE `(some View) -> some View` : son type opaque se
// re-nichait intégralement dans celui de la racine — découper des fonctions ne
// découpe pas le type. Ici, l'iPad ne voit plus que des noms.

/// Environnement de la fenêtre iPad : les cinq objets partagés, le chrome
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
    let onStart: () async -> Void

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
            .onAppear(perform: onAppear)
            .onDisappear(perform: onDisappear)
            .task { await onStart() }
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
                        }))
                    }
                )
                .presentationDetents([.large, .medium])
                .presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $showSharePicker) {
                if let shared = router.pendingShareContent {
                    // Les feuilles n'héritent pas des EnvironmentObjects du
                    // parent : réinjecter le trio que `SharePickerView` déclare.
                    SharePickerView(
                        sharedContent: shared,
                        onDismiss: {
                            router.pendingShareContent = nil
                        }
                    )
                    .environmentObject(conversationViewModel)
                    .environmentObject(router)
                    .environmentObject(statusViewModel)
                    .presentationDetents([.medium, .large])
                }
            }
            .adaptiveOnChange(of: router.pendingShareContent != nil) { _, hasContent in
                if hasContent { showSharePicker = true }
            }
            .sheet(isPresented: $showNewConversation) {
                NewConversationView()
                    .environmentObject(statusViewModel)
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
            }
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
                .environmentObject(router)
                .environmentObject(storyViewModel)
                .environmentObject(statusViewModel)
                .environmentObject(conversationViewModel)
                .environmentObject(storyViewerCoordinator)
                .presentationDetents([.large, .medium])
                .presentationDragIndicator(.visible)
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
    @Binding var showStoryViewerFromConv: Bool
    let selectedStoryUserIdFromConv: String?
    let activeConversationId: String?
    let onStoryReply: (ReplyContext) -> Void
    let onSyncPillTap: (OutboxUIItem.Source) -> Void
    let activeConversationIdForBanner: () -> String?
    let onMiniPlayerTap: () -> Void

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: $showStoryViewerFromConv) {
                StoryViewerContainer(
                    viewModel: storyViewModel,
                    userId: selectedStoryUserIdFromConv,
                    isPresented: $showStoryViewerFromConv,
                    onReplyToStory: { replyContext in
                        showStoryViewerFromConv = false
                        onStoryReply(replyContext)
                    },
                    startAtFirstUnviewed: true,
                    presentationSource: "iPadRootView.conv"
                )
                .environmentObject(router)
                .environmentObject(statusViewModel)
                .environmentObject(conversationViewModel)
                .environment(\.isStoryViewerPresenting, true)
                .zoomTransitionDestination(sourceID: selectedStoryUserIdFromConv ?? "", in: storyZoomNamespace)
            }
            .fullScreenCover(item: $storyViewerCoordinator.pendingRequest) { request in
                StoryViewerContainer(
                    viewModel: storyViewModel,
                    userId: request.id,
                    isPresented: Binding(
                        get: { storyViewerCoordinator.pendingRequest != nil },
                        set: { if !$0 { storyViewerCoordinator.dismiss() } }
                    ),
                    onReplyToStory: { replyContext in
                        storyViewerCoordinator.dismiss()
                        onStoryReply(replyContext)
                    },
                    singleGroup: request.singleGroup,
                    postId: request.postId,
                    startAtFirstUnviewed: request.startAtFirstUnviewed,
                    presentationSource: "iPadRootView.fromConv",
                    initialAction: request.initialAction
                )
                .zoomTransitionDestination(sourceID: request.id, in: storyZoomNamespace)
                .environmentObject(router)
                .environmentObject(statusViewModel)
                .environmentObject(conversationViewModel)
                .environment(\.isStoryViewerPresenting, true)
            }
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
                .environmentObject(router)
                .environmentObject(statusViewModel)
                .environmentObject(conversationViewModel)
                .environmentObject(storyViewModel)
            }
            .overlay(alignment: .top) {
                ConnectionBanner(
                    conversationListViewModel: conversationViewModel,
                    isStoryViewerPresenting: storyViewerCoordinator.pendingRequest != nil,
                    onItemTap: onSyncPillTap,
                    activeConversationId: activeConversationIdForBanner
                )
                .padding(.top, activeConversationId != nil ? 0 : MeeshySpacing.sm)
            }
            .modifier(CallPresentationLayer(
                miniPlayerOnTapBody: onMiniPlayerTap,
                miniPlayerCurrentConversationId: { activeConversationId }
            ))
    }
}
