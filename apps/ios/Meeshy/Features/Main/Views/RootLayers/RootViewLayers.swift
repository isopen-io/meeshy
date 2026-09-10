import SwiftUI
import MeeshySDK
import MeeshyUI

// Les couches PROPRES à `RootView` (fenêtre iPhone), dans l'ordre où elles se
// posent sur le `ZStack` racine. Chacune est un `ViewModifier` nominal : voir
// l'en-tête de `RootSharedLayers.swift` pour la raison (#5837). Ce qu'une
// couche ne possède pas, elle le reçoit — jamais de singleton nommé Meeshy
// lu « parce que c'est plus court », les fermetures de la racine restent le
// seul lieu qui écrit son état.

/// Environnement de la fenêtre : les cinq objets partagés, le chrome social,
/// le namespace de la transition zoom, l'aperçu de conversation ouvert depuis
/// un toast, et le drapeau « un viewer de story est présenté ».
struct RootEnvironmentLayer: ViewModifier {
    let router: Router
    let storyViewModel: StoryViewModel
    let statusViewModel: StatusViewModel
    let conversationViewModel: ConversationListViewModel
    @ObservedObject var storyViewerCoordinator: StoryViewerCoordinator
    let storyZoomNamespace: Namespace.ID
    @Binding var notificationPreviewConversation: Conversation?
    let onOpenFullConversation: (Conversation) -> Void

    func body(content: Content) -> some View {
        content
            .environmentObject(router)
            .environmentObject(storyViewModel)
            .environmentObject(statusViewModel)
            .environmentObject(conversationViewModel)
            .environmentObject(storyViewerCoordinator)
            // Humeur / anneau de story par EnvironmentValues : les feuilles (dont la
            // feuille de commentaires) en héritent, contrairement aux
            // EnvironmentObject ci-dessus. Cf. SocialChromeEnvironment.swift.
            .meeshySocialChrome(status: statusViewModel, story: storyViewModel, storyViewer: storyViewerCoordinator)
            .environment(\.zoomTransitionNamespace, storyZoomNamespace)
            // In-app notification preview: long-press / pull-down on a toast opens
            // the conversation (last messages + simple composer) over the current
            // page. A sheet creates a fresh environment, so the objects the reused
            // `ConversationView` reads must be re-injected here.
            .sheet(item: $notificationPreviewConversation) { conv in
                ConversationView(conversation: conv, previewMode: true, onOpenFullConversation: {
                    // Leave the preview and open the real conversation with a
                    // navigation push so going back returns to the originating
                    // screen. Dismiss first, then push to avoid a present/dismiss
                    // race.
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
            // Propagate story viewer presentation state down to chrome (sync
            // pill, etc.) so they can skip rendering while a `fullScreenCover`
            // story is on top. Read by `ConnectionBanner` via
            // `@Environment(\.isStoryViewerPresenting)`. Cf. bug 2026-05-27.
            .environment(\.isStoryViewerPresenting, storyViewerCoordinator.pendingRequest != nil)
    }
}

/// Les portes de story et le cycle de vie de la racine : « Mes stories »,
/// l'édition, le viewer, les composers de création et de partage, le titre de
/// scène, et la tâche de démarrage.
struct RootStoryDoorsLayer: ViewModifier {
    @Binding var showMyStoriesFromProfile: Bool
    @Binding var myStoriesProfileFollowUp: DeferredSheetFollowUp<MyStoriesFollowUp>
    @Binding var editingStorySessionFromProfile: StoryEditSession?
    let storyViewModel: StoryViewModel
    let statusViewModel: StatusViewModel
    let conversationViewModel: ConversationListViewModel
    @ObservedObject var router: Router
    @ObservedObject var storyViewerCoordinator: StoryViewerCoordinator
    let storyZoomNamespace: Namespace.ID
    /// Le corps de `.task` de la racine — connexion socket, abonnements,
    /// chargements parallèles. Il reste ÉCRIT dans `RootView`, qui possède
    /// tout ce qu'il touche.
    let onStart: () async -> Void

    func body(content: Content) -> some View {
        content
            // Tuile « Stories » du profil → page « Mes stories » (en cours et
            // passées). Hôte UNIQUE de ce listener : la racine est montée quelle
            // que soit la provenance de la feuille de profil.
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
            // Le titre de scène est ce qu'iPadOS affiche sous la fenêtre en App
            // Exposé / Stage Manager. `connectedScenes.first` le posait sur une
            // scène arbitraire : avec deux fenêtres Meeshy, la fenêtre au premier
            // plan gardait le titre de l'autre. `activeWindowScene` cible celle
            // que l'utilisateur regarde.
            .adaptiveOnChange(of: router.sceneTitle) { _, title in
                DeviceLayout.activeWindowScene?.title = String(format: String(localized: "root.scene_title_format", defaultValue: "Meeshy — %@", bundle: .main), title)
            }
            .onAppear {
                DeviceLayout.activeWindowScene?.title = String(localized: "root.scene_title_default", defaultValue: "Meeshy — Conversations", bundle: .main)
            }
            .task { await onStart() }
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
                        router.navigateToStoryReply(replyContext, conversationListViewModel: conversationViewModel)
                    },
                    singleGroup: request.singleGroup,
                    postId: request.postId,
                    startAtFirstUnviewed: request.startAtFirstUnviewed,
                    presentationSource: "RootView.fromConv",
                    initialAction: request.initialAction,
                    targetCommentId: request.targetCommentId,
                    targetParentCommentId: request.targetParentCommentId
                )
                // Re-inject the trio that StoryViewerView declares as
                // @EnvironmentObject (so it can re-inject them onto its inner
                // SharePickerView sheet). fullScreenCover does not inherit
                // EnvironmentObjects automatically.
                .environmentObject(router)
                .environmentObject(statusViewModel)
                .environmentObject(conversationViewModel)
                // Re-inject le flag isStoryViewerPresenting — fullScreenCover
                // n'hérite pas non plus des `Environment` values du parent,
                // donc le `StoryViewerContainer.ConnectionBanner` interne au
                // cover ne pouvait pas se cacher sans ça. Bug sync pill
                // chevauche header 2026-05-27.
                .environment(\.isStoryViewerPresenting, true)
                // U1 — transition zoom depuis la bulle du tray (iOS 18+, no-op
                // sinon). sourceID = userId du groupe : si la story s'ouvre
                // depuis un point d'entrée sans bulle enregistrée (notification,
                // deep link), iOS retombe sur la transition cover standard.
                .zoomTransitionDestination(sourceID: request.id, in: storyZoomNamespace)
            }
            // La célébration d'un palier (#5809), posée en UNE ligne : l'hôte est
            // écrit une seule fois et vit chez sa jumelle iPad à l'identique.
            .engagementReveal(router: router)
            // Composer de CRÉATION — monté ici, au niveau racine, comme le viewer
            // juste au-dessus. Il vivait dans `StoryTrayView`, instanciée par la
            // liste de conversations ET par la feuille de feed qui la recouvre sans
            // la démonter : deux trays vivantes observaient le même
            // `showStoryComposer` et présentaient le même cover en double. Détail
            // dans `StoryComposerCover`.
            .storyComposerCover(
                viewModel: storyViewModel,
                router: router,
                conversationListViewModel: conversationViewModel,
                statusViewModel: statusViewModel
            )
            // **Vue `2a` — l'entrée externe** (#5056). Montée à la racine, comme le
            // composer de création juste au-dessus, et pour la MÊME raison : deux
            // hôtes vivants présenteraient le cover en double sur la même fiche.
            // La fiche vient du conteneur App Group, déposée par l'extension de
            // partage ; `ShareComposeHandoffConsumer` la balaie à chaque réveil.
            .shareComposeCover(
                consumer: ShareComposeHandoffConsumer.shared,
                storyViewModel: storyViewModel
            )
    }
}

/// Le chrome global : la pastille de synchronisation, la présentation d'appel
/// et les deux animations de la racine.
struct RootChromeLayer: ViewModifier {
    @ObservedObject var reelsPresenter: ReelsPresenter
    let conversationViewModel: ConversationListViewModel
    @ObservedObject var storyViewerCoordinator: StoryViewerCoordinator
    @ObservedObject var router: Router
    let activeConversationId: () -> String?
    let onSyncPillTap: (OutboxUIItem.Source) -> Void
    let onMiniPlayerTap: () -> Void
    let showFeed: Bool
    let showMenu: Bool

    /// Marge haute de la pastille hors conversation. Fonction pure — c'est la
    /// DÉCISION qui se teste, pas le rendu (#5944).
    ///
    /// `currentRoute == nil` désigne la racine (liste de conversations ou
    /// flux, tous deux montés avec leur propre `CollapsibleHeader` — « Meeshy
    /// Chats » ou « Meeshy Feed »), qui réclame donc le même dégagement
    /// qu'une route poussée qui en déclare un. Une route qui n'en déclare
    /// aucun garde l'assise minimale.
    static func syncPillTopPadding(currentRoute: Route?) -> CGFloat {
        guard let currentRoute else {
            return CollapsibleHeaderMetrics.expandedHeight + MeeshySpacing.sm
        }
        guard let headerHeight = currentRoute.collapsibleHeaderHeight else {
            return MeeshySpacing.sm
        }
        return headerHeight + MeeshySpacing.sm
    }

    func body(content: Content) -> some View {
        content
            // Point de montage unique du SyncPill (indicateur de frappe global +
            // statut connexion + file d'attente hors-ligne), voir
            // docs/superpowers/specs/2026-08-11-global-chrome-banner-stacking-design.md.
            // Chaîné ICI, AVANT .modifier(CallPresentationLayer()), pour que le
            // composite (contenu + SyncPill) soit comprimé comme un bloc sous la
            // bannière d'appel (VStack de compression de frame, §B2 de la spec —
            // l'ordre inverse ferait chevaucher les deux bannières).
            // conversationListViewModel/isStoryViewerPresenting passés
            // explicitement, jamais via @EnvironmentObject/@Environment dans ce
            // .overlay (§B1 de la spec — crash documenté 4× dans ce repo).
            // Masqué pendant le lecteur de réels immersif (frère de ZStack, pas
            // un fullScreenCover — contrairement au story viewer déjà gated via
            // isStoryViewerPresenting, il n'avait aucune garde équivalente).
            .overlay(alignment: .top) {
                if reelsPresenter.launch == nil {
                    ConnectionBanner(
                        conversationListViewModel: conversationViewModel,
                        isStoryViewerPresenting: storyViewerCoordinator.pendingRequest != nil,
                        onItemTap: onSyncPillTap,
                        activeConversationId: activeConversationId
                    )
                    // La remontée sous la Dynamic Island est RÉSERVÉE à la
                    // conversation (#4066). En conversation, la pastille se pose
                    // SOUS le chrome flottant (#5941) : `liftedTopPadding(base: 72)`
                    // rendait toujours 0 — `topLift` vaut 88, la soustraction est
                    // négative, la borne la ramène à zéro — et la bannière
                    // recouvrait les boutons Appeler / Rechercher / Mode de lecture.
                    // Hors conversation, ce qui décide n'est pas un booléen mais
                    // ce que l'hôte courant DÉCLARE — `syncPillTopPadding` (#5944).
                    .padding(.top, router.currentConversationId != nil
                        ? ConnectionBanner.conversationTopPadding
                        : Self.syncPillTopPadding(currentRoute: router.currentRoute))
                }
            }
            // Présentation d'appel (cover plein écran + PiP + pastille + bulle +
            // bannière call-waiting) : le tick `callDuration` 1 Hz et les stats
            // qualité WebRTC n'invalident que `CallPresentationLayer`, jamais la
            // racine (cause du watchdog 0x8BADF00D en arrière-plan pendant un
            // appel). Le mini-lecteur audio y est hoisté (2026-08-13, même point
            // de montage que la bannière d'appel) ; son tap route par
            // `navigateToConversationById`, le chemin des deep links et des push.
            .modifier(CallPresentationLayer(
                miniPlayerOnTapBody: onMiniPlayerTap,
                // Hide the bar whenever the user is already inside the
                // conversation playing the audio — the in-place audio bubble
                // owns the controls there.
                miniPlayerCurrentConversationId: { router.currentConversationId }
            ))
            .animation(.spring(response: 0.4, dampingFraction: 0.85), value: showFeed)
            .animation(.spring(), value: showMenu)
    }
}

/// Les feuilles de profil et de partage, la nouvelle conversation, les
/// réactions au chemin de navigation, le deep link et la porte de rupture.
struct RootSheetsLayer: ViewModifier {
    @ObservedObject var router: Router
    let statusViewModel: StatusViewModel
    let conversationViewModel: ConversationListViewModel
    @Binding var showSharePicker: Bool
    @Binding var showNewConversation: Bool
    @Binding var showFeed: Bool
    @Binding var feedWasVisibleBeforeNav: Bool
    @ObservedObject var deepLinkRouter: DeepLinkRouter
    @ObservedObject var upgradeGate: UpgradeGateController
    let onDeepLink: (DeepLink?) -> Void

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
                            ProfilePostsOpener.openReel(reel, in: reels) { router.deepLinkProfileUser = nil }
                        }))
                    }
                )
                .presentationDetents([.large, .medium])
                .presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $showSharePicker) {
                if let shared = router.pendingShareContent {
                    // SwiftUI sheets create a separate presentation hierarchy and do
                    // NOT inherit EnvironmentObjects from the parent view automatically.
                    // Re-inject the trio that SharePickerView declares as
                    // @EnvironmentObject (conversationListViewModel, router,
                    // statusViewModel), otherwise tapping share crashes with
                    // "EnvironmentObject error → SharePickerView.<missing>".
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
                if hasContent {
                    showSharePicker = true
                }
            }
            .sheet(isPresented: $showNewConversation) {
                NewConversationView()
                    .environmentObject(statusViewModel)
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
            }
            .adaptiveOnChange(of: router.path) { _, newPath in
                if !newPath.isEmpty && showFeed {
                    feedWasVisibleBeforeNav = true
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showFeed = false
                    }
                } else if newPath.isEmpty && feedWasVisibleBeforeNav {
                    feedWasVisibleBeforeNav = false
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showFeed = true
                    }
                }
            }
            // Accès rapide « Publier un post » (liste de conversations, tableau de
            // bord — 2026-08-21) : le flux se montre, et `ThemedFeedOverlay`
            // consomme le drapeau en ouvrant son composeur.
            .adaptiveOnChange(of: router.pendingOpenFeedComposer) { _, pending in
                guard pending, !showFeed else { return }
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showFeed = true
                }
            }
            // `initial: true` covers the cold-launch race where a Universal
            // Link sets `pendingDeepLink` from AppDelegate.continue:userActivity:
            // BEFORE this view mounts. Without it, a plain `.onChange` only fires
            // on subsequent transitions and the user lands on the home screen
            // with the deep link silently discarded. `consumePendingDeepLink`
            // returns nil for the typical cold-launch (no pending link), so
            // firing on the initial value is a free no-op when there's nothing
            // to process.
            .adaptiveOnChange(of: deepLinkRouter.pendingDeepLink, initial: true) { _, newValue in
                onDeepLink(newValue)
            }
            // C4b — la rupture. Posée EN DERNIER dans la chaîne, donc la plus
            // extérieure : elle doit recouvrir les feuilles et les covers déjà
            // montés, pas passer derrière eux.
            //
            // Le binding est CONSTANT, et c'est le point : `UpgradeGateController`
            // n'expose aucun moyen de repasser à `nil`, et un `fullScreenCover`
            // piloté par une constante n'a aucun geste de fermeture. La porte est
            // une rupture, pas un avertissement.
            .fullScreenCover(isPresented: .constant(upgradeGate.isBlocked)) {
                if let requirement = upgradeGate.requirement {
                    UpgradeGateView(requirement: requirement)
                }
            }
    }
}
