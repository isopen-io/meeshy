import SwiftUI
import MeeshySDK
import MeeshyUI

/// Où en est la navigation, tenu AU-DESSUS des deux racines.
///
/// `AdaptiveRootView` démonte une racine et monte l'autre dès que la classe de taille bascule : une fenêtre d'iPad
/// glissée en Slide Over ou réduite au tiers de l'écran, puis rendue à sa largeur. Chaque racine possède son
/// `Router` et son état ; sans ce relais, la bascule ramenait à l'accueil la personne qui lisait un fil.
///
/// Chaque racine y RECOPIE sa navigation à chaque changement, et la relit à son montage. La recopie est continue
/// plutôt que faite au démontage : SwiftUI ne garantit pas que la racine sortante disparaisse avant que l'entrante
/// n'apparaisse.
@MainActor
final class RootNavigationHandoff {
    // Même garde que `Router` : une deinit synthétisée isolée plante au démontage hors d'une tâche (iOS 26.1).
    nonisolated deinit {}

    private(set) var routes: [Route] = []

    func record(_ routes: [Route]) { self.routes = routes }

    // MARK: Le composer de story démonté avec sa racine

    /// Le brouillon d'un composer DÉMONTÉ sans sortie demandée (`.storyComposerTornDown`) : la racine qui
    /// le portait part, son `StoryViewModel` et sa couverture avec. La racine suivante le rouvre dessus.
    private(set) var tornDownComposerDraftId: String?
    /// La racine actuellement montée — seule elle peut rouvrir le composer : un rappel de la racine sortante
    /// qui tournerait encore le consommerait dans une hiérarchie morte.
    private var mountedRoot: UUID?

    func rootAppeared(_ root: UUID) { mountedRoot = root }

    func rootDisappeared(_ root: UUID) {
        if mountedRoot == root { mountedRoot = nil }
    }

    func noteComposerTornDown(draftId: String) { tornDownComposerDraftId = draftId }

    /// Le composer est de nouveau à l'écran (retour d'une de ses feuilles plein écran) : l'annonce ne vaut plus.
    func composerAppeared() { tornDownComposerDraftId = nil }

    /// Le brouillon à rouvrir, une fois — pour la racine montée qui ne présente pas déjà le composer.
    func takeComposerToReopen(presentingComposer: Bool, root: UUID) -> String? {
        guard !presentingComposer, mountedRoot == root, let draftId = tornDownComposerDraftId else { return nil }
        tornDownComposerDraftId = nil
        return draftId
    }

    /// La pile que l'iPhone reçoit de l'iPad : le fil, puis la route qui le recouvre (`iPadRightColumn`).
    nonisolated static func stack(conversation: Conversation?, panelRoute: Route?) -> [Route] {
        (conversation.map { [Route.conversation($0)] } ?? []) + (panelRoute.map { [$0] } ?? [])
    }

    /// Ce que l'iPad reçoit de la pile de l'iPhone.
    struct TabletPlacement: Equatable {
        /// Le dernier fil de la pile : l'iPad n'en tient qu'un.
        var conversation: Conversation?
        /// Les routes empilées APRÈS ce fil, dans l'ordre — celles d'avant sont sous lui, et l'iPad n'a pas de
        /// dessous.
        var panelRoutes: [Route]
    }

    nonisolated static func tabletPlacement(of routes: [Route]) -> TabletPlacement {
        var conversation: Conversation?
        var panelRoutes: [Route] = []
        for route in routes {
            if case .conversation(let opened) = route {
                conversation = opened
                panelRoutes = []
            } else {
                panelRoutes.append(route)
            }
        }
        return TabletPlacement(conversation: conversation, panelRoutes: panelRoutes)
    }
}

private struct RootNavigationHandoffKey: EnvironmentKey {
    static let defaultValue: RootNavigationHandoff? = nil
}

extension EnvironmentValues {
    /// `nil` hors de `AdaptiveRootView` (aperçus, tests) : une racine montée seule n'a personne à qui passer le relais.
    var rootNavigationHandoff: RootNavigationHandoff? {
        get { self[RootNavigationHandoffKey.self] }
        set { self[RootNavigationHandoffKey.self] = newValue }
    }
}

struct AdaptiveRootView: View {
    @State private var navigationHandoff = RootNavigationHandoff()
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        RootScopeSwitch(
            makeScope: { RootScopeModels() },
            compact: { RootView(scope: $0) },
            regular: { iPadRootView(scope: $0) }
        )
        .environment(\.rootNavigationHandoff, navigationHandoff)
        // Le composer de story démonté avec sa racine (compact ↔ regular) : son brouillon est tenu ICI, au-dessus
        // des deux racines, jusqu'à ce que la suivante le rouvre (`RootIntentRoutingLayer`).
        .onReceive(NotificationCenter.default.publisher(for: .storyComposerTornDown)) { note in
            if let draftId = note.object as? String { navigationHandoff.noteComposerTornDown(draftId: draftId) }
        }
        .onReceive(NotificationCenter.default.publisher(for: .storyComposerAppeared)) { _ in
            navigationHandoff.composerAppeared()
        }
        // Force-init the shared `ConversationAudioCoordinator` on root mount.
        // Without this, the engine is built lazily on the first audio tap,
        // which means the `@Published var isPlaying` published edge that
        // gates the background lifecycle never reaches its subscriber until
        // a message audio actually starts. Pre-mounting keeps the rest of
        // the app — including the background lifecycle bridge — in sync.
        //
        // Phase 8: also activate the MPNowPlayingInfoCenter +
        // MPRemoteCommandCenter bridge so lock screen, control center,
        // AirPods and CarPlay can surface metadata + controls.
        .task {
            // La porte des fenêtres détachées (conversation, réels) : `openWindow` ne se lit que dans une vue.
            let open = openWindow
            DetachedWindowOpener.shared.openAction = { content in
                open(id: DetachedWindowOpener.sceneId, value: content)
            }
            let coord = ConversationAudioCoordinator.shared
            coord.activateNowPlayingBridge()
            // #9783 — le même lecteur alimente l'îlot dynamique.
            VoicePlaybackLiveActivityCoordinator.shared.bind(coord)
        }
        // B4 — The mini-player overlay used to live HERE but the tap-body
        // handler had no access to the `Router` (instantiated inside
        // `RootView` / `iPadRootView`, scopes below this one). The overlay
        // is now mounted in those views directly so the tap routes to the
        // active conversation. Keeping this comment as the canonical
        // landing pad for the next dev wondering "why isn't the mini-player
        // here too?".
    }
}

// MARK: - Fenêtres de Meeshy sur iPad (2026-10-14)
//
// UNE fenêtre principale, et des fenêtres DÉTACHÉES à côté : une conversation donnée — on écrit à la personne ou
// au groupe pendant qu'une autre conversation est ouverte dans la fenêtre principale —, ou le fil de réels pendant
// que le fil des publications reste dans la fenêtre principale (décision du porteur).
//
// La fenêtre principale est UNIQUE : chaque copie montait sa propre racine, son routeur et sa tâche de démarrage,
// mais confiait ses fermetures et ses intentions à des singletons partagés — l'exécuteur des stories mourait avec
// la fenêtre fermée, l'écran d'appel restait attaché à une scène disparue, une même intention s'exécutait deux
// fois (audit multi-fenêtre du 2026-10-14). Une seconde copie ouverte par le système montre donc
// `SecondaryMainWindowView` et renvoie vers la première. Une fenêtre détachée, elle, ne monte AUCUNE racine : un
// routeur et des modèles à elle, sans tâche de démarrage, sans récepteur d'intention.

/// Ce qu'une fenêtre détachée montre. `Codable` : iPadOS restaure la fenêtre à la relance.
enum DetachedWindowContent: Hashable, Codable {
    case conversation(id: String)
    case reels(startId: String?)
}

/// La porte des fenêtres détachées. `openWindow` ne se lit que dans une vue : la racine adaptative la pose ici,
/// pour les menus qui n'en ont pas.
@MainActor
final class DetachedWindowOpener {
    nonisolated deinit {}
    static let shared = DetachedWindowOpener()
    static let sceneId = "meeshy.detached"

    var openAction: ((DetachedWindowContent) -> Void)?

    /// Vrai sur un appareil qui sait afficher plusieurs fenêtres (iPad) et une fois la porte posée.
    var isAvailable: Bool { openAction != nil && UIApplication.shared.supportsMultipleScenes }

    func open(_ content: DetachedWindowContent) { openAction?(content) }
}

extension DetachedWindowOpener {
    /// L'activité d'une conversation glissée hors de la liste : déposée au bord de l'écran, iPadOS en fait une
    /// fenêtre détachée (`NSUserActivityTypes`, Info.plist).
    nonisolated static let conversationActivityType = "me.meeshy.app.detached-conversation"
    /// Ce que la scène détachée revendique (`handlesExternalEvents(matching:)`) — jamais la fenêtre principale.
    nonisolated static let activityIdentifier = "meeshy-detached-conversation"
}

extension Notification.Name {
    /// La session de glisser d'une conversation s'est terminée — déposée ou annulée.
    static let conversationDragDidEnd = Notification.Name("meeshy.conversationDragDidEnd")
}

/// Ce qu'une ligne de conversation glissée transporte : son id — qu'un en-tête de catégorie reçoit — et, sur iPad,
/// l'activité qui en fait une fenêtre détachée au bord de l'écran.
///
/// Sa libération ANNONCE la fin de la session : le système relâche les objets glissés quand la session se termine,
/// qu'ils aient été déposés ou non. SwiftUI ne signale pas l'annulation d'un `.onDrag` — c'est ce signal qui permet
/// de redéplier les catégories quand on lâche ailleurs que sur une catégorie.
nonisolated final class ConversationDragItemProvider: NSItemProvider, @unchecked Sendable {
    /// Le jeton de CETTE session : la fin annoncée porte le sien, et la liste ignore celle d'un glisser précédent
    /// que le système aurait relâché en retard.
    let token = UUID()

    /// Marque PRIVÉE d'un glisser de rangée de conversation : une cible qui accepte du texte (le composer) la refuse —
    /// sur iPad la liste et le composer sont côte à côte, et un glisser un peu trop long y déposait l'identifiant brut.
    static let markerType = "me.meeshy.conversation-row"

    init(conversationId: String, title: String, opensWindow: Bool) {
        super.init()
        registerDataRepresentation(forTypeIdentifier: Self.markerType, visibility: .ownProcess) { completion in
            completion(Data(conversationId.utf8), nil)
            return nil
        }
        registerObject(conversationId as NSString, visibility: .all)
        if opensWindow {
            let activity = NSUserActivity(activityType: DetachedWindowOpener.conversationActivityType)
            activity.title = title
            activity.userInfo = ["conversationId": conversationId]
            activity.targetContentIdentifier = DetachedWindowOpener.activityIdentifier
            registerObject(activity, visibility: .all)
        }
    }

    deinit {
        let ended = token as NSUUID
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: .conversationDragDidEnd, object: ended)
        }
    }
}

/// Qui tient la fenêtre principale. La première scène qui se présente la prend ; si elle se déconnecte, la
/// suivante encore attachée la reprend.
@MainActor
final class MainWindowRegistry: ObservableObject {
    nonisolated deinit {}
    static let shared = MainWindowRegistry()

    @Published private(set) var primary: ObjectIdentifier?
    private weak var primaryScene: UIWindowScene?
    private let candidates = NSHashTable<UIWindowScene>.weakObjects()
    private var observer: NSObjectProtocol?

    private init() {
        observer = NotificationCenter.default.addObserver(
            forName: UIScene.didDisconnectNotification, object: nil, queue: .main
        ) { [weak self] note in
            let gone = (note.object as? UIWindowScene).map(ObjectIdentifier.init)
            MainActor.assumeIsolated { self?.sceneDidDisconnect(gone) }
        }
    }

    func offer(_ scene: UIWindowScene) {
        candidates.add(scene)
        if primaryScene == nil || primaryScene?.activationState == .unattached {
            promote(scene)
        }
    }

    func isPrimary(_ scene: UIWindowScene) -> Bool { primary == ObjectIdentifier(scene) }

    var primarySession: UISceneSession? { primaryScene?.session }

    /// La scène de la fenêtre principale — celle où se montrent toujours les appels.
    var primaryWindowScene: UIWindowScene? { primaryScene }

    /// La navigation d'une notification touchée se fait dans la fenêtre PRINCIPALE : si une fenêtre détachée est
    /// devant (hors Stage Manager, la principale est alors en arrière-plan), la principale revient d'abord — sinon le
    /// toucher ouvrait sa cible dans une fenêtre invisible, et rien ne semblait se passer.
    func bringPrimaryForwardIfHidden() {
        // Une seule fenêtre (iPhone, iPad sans fenêtre détachée) : le système l'active déjà pour le toucher.
        guard DeviceLayout.hasSeveralScenes,
              let scene = primaryScene, Self.needsActivation(scene.activationState) else { return }
        UIApplication.shared.requestSceneSessionActivation(scene.session, userActivity: nil, options: nil)
    }

    nonisolated static func needsActivation(_ state: UIScene.ActivationState) -> Bool {
        state != .foregroundActive
    }

    private func sceneDidDisconnect(_ gone: ObjectIdentifier?) {
        guard let gone, gone == primary else { return }
        primaryScene = nil
        primary = nil
        if let next = candidates.allObjects.first(where: {
            ObjectIdentifier($0) != gone && $0.activationState != .unattached
        }) {
            promote(next)
        }
    }

    private func promote(_ scene: UIWindowScene) {
        primaryScene = scene
        primary = ObjectIdentifier(scene)
    }
}

/// Lit la scène de la fenêtre où la vue est posée.
struct WindowSceneReader: UIViewRepresentable {
    let onScene: (UIWindowScene) -> Void

    func makeUIView(context: Context) -> ProbeView {
        let view = ProbeView()
        view.onScene = onScene
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ uiView: ProbeView, context: Context) {
        uiView.onScene = onScene
    }

    final class ProbeView: UIView {
        // Même garde que `Router` : une deinit synthétisée isolée plante au démontage hors d'une tâche (iOS 26.1).
        nonisolated deinit {}
        var onScene: ((UIWindowScene) -> Void)?
        override func didMoveToWindow() {
            super.didMoveToWindow()
            // Appelé pendant que SwiftUI insère la vue : publier ici modifierait un état en pleine mise à jour.
            DispatchQueue.main.async { [weak self] in
                guard let self, let scene = self.window?.windowScene else { return }
                self.onScene?(scene)
            }
        }
    }
}

/// N'ouvre la fenêtre principale que dans la scène qui la tient.
struct MainWindowGate<Content: View>: View {
    @ObservedObject private var registry = MainWindowRegistry.shared
    @State private var scene: UIWindowScene?
    @ViewBuilder let content: () -> Content

    var body: some View {
        ZStack {
            if let scene, registry.isPrimary(scene) {
                content()
                    // La fenêtre principale prend les liens et les activités : sans cette préférence, iPadOS
                    // pouvait ouvrir une nouvelle scène pour un lien, qui l'aurait perdu.
                    .handlesExternalEvents(preferring: ["*"], allowing: ["*"])
            } else if let scene {
                SecondaryMainWindowView(scene: scene)
            }
        }
        .background(WindowSceneReader { found in
            guard scene !== found else { return }
            scene = found
            registry.offer(found)
        })
    }
}

/// Une seconde fenêtre principale ouverte par le système : elle renvoie vers la première, et passe ses liens.
struct SecondaryMainWindowView: View {
    let scene: UIWindowScene

    var body: some View {
        VStack(spacing: MeeshySpacing.md) {
            Image(systemName: "macwindow.on.rectangle")
                .font(MeeshyFont.relative(MeeshyFont.largeTitleSize, weight: .regular))
                .foregroundColor(MeeshyColors.indigo500)
            Text(String(localized: "window.main.already_open.title", defaultValue: "Meeshy est déjà ouvert", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold))
            Text(String(localized: "window.main.already_open.body", defaultValue: "La fenêtre principale est ouverte ailleurs. Une conversation ou les réels peuvent, eux, avoir leur propre fenêtre.", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .regular))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 420)
            Button {
                if let primary = MainWindowRegistry.shared.primarySession {
                    UIApplication.shared.requestSceneSessionActivation(primary, userActivity: nil, options: nil)
                }
                UIApplication.shared.requestSceneSessionDestruction(scene.session, options: nil)
            } label: {
                Text(String(localized: "window.main.already_open.action", defaultValue: "Aller à la fenêtre principale", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.vertical, MeeshySpacing.sm)
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(MeeshySpacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(RootThemedBackground(theme: ThemeManager.shared))
        // Un lien arrivé ici rejoint la file que la fenêtre principale consomme.
        .onOpenURL { url in _ = DeepLinkRouter.shared.handle(url: url) }
    }
}

/// Une fenêtre détachée : une conversation, ou le fil de réels. Ses propres routeur et modèles, aucune tâche de
/// démarrage — la fenêtre principale tient sockets, synchronisation et files.
struct DetachedWindowView: View {
    let content: DetachedWindowContent?

    @EnvironmentObject private var authManager: AuthManager
    @StateObject private var router = Router()
    @StateObject private var storyViewModel = StoryViewModel()
    @StateObject private var statusViewModel = StatusViewModel()
    @StateObject private var conversationVMOwner = ConversationListVMOwner()
    @StateObject private var storyViewerCoordinator = StoryViewerCoordinator()
    @StateObject private var notifications = RootNotificationSource()
    /// Même barrière que les racines : un 426 ou un plancher de version bloque
    /// AUSSI la fenêtre détachée.
    @StateObject private var upgradeGate = UpgradeGateController()
    @State private var scene: UIWindowScene?
    @State private var conversation: Conversation?
    @State private var conversationUnavailable = false
    /// La conversation d'une fenêtre née d'un glisser au bord de l'écran : elle arrive par activité, pas par valeur.
    @State private var draggedContent: DetachedWindowContent?
    /// Ce que la valeur de scène ne restaure pas : l'id de la conversation déposée au bord. Sans lui, la fenêtre
    /// revenait vide à la relance.
    @SceneStorage("meeshy.detached.conversationId") private var storedConversationId: String?
    /// Le compte qui a ouvert la fenêtre. Une conversation ou un fil de réels appartient à UN compte : après un
    /// changement de compte, la fenêtre ne doit rien montrer au suivant — elle se ferme.
    @SceneStorage("meeshy.detached.ownerUserId") private var ownerUserId: String?
    @ObservedObject private var mainWindows = MainWindowRegistry.shared

    var body: some View {
        ZStack {
            RootThemedBackground(theme: ThemeManager.shared)
            if !authManager.isAuthenticated {
                note(String(localized: "window.detached.signed_out", defaultValue: "Connectez-vous dans la fenêtre principale de Meeshy.", bundle: .main))
            } else if !DetachedWindowOwnership.shows(owner: ownerUserId, current: authManager.currentUser?.id) {
                // Un autre compte est actif : rien de l'ancien ne se peint, pas même une image — la fenêtre se ferme.
                ProgressView()
            } else {
                switch content ?? draggedContent {
                case .conversation(let id)?:
                    conversationWindow(id)
                case .reels(let startId)?:
                    reelsWindow(startId)
                case nil:
                    // L'activité d'un glisser arrive juste après la création de la scène.
                    ProgressView()
                }
            }
        }
        .background(WindowSceneReader { scene = $0 })
        .onContinueUserActivity(DetachedWindowOpener.conversationActivityType) { activity in
            if let id = activity.userInfo?["conversationId"] as? String, !id.isEmpty {
                draggedContent = .conversation(id: id)
                storedConversationId = id
            }
        }
        .onAppear {
            if content == nil, draggedContent == nil, let id = storedConversationId, !id.isEmpty {
                draggedContent = .conversation(id: id)
            }
        }
        .task(id: authManager.currentUser?.id) {
            switch DetachedWindowOwnership.verdict(owner: ownerUserId, current: authManager.currentUser?.id) {
            case .adopt(let userId):
                ownerUserId = userId
            case .close:
                conversation = nil
                closeWindow()
            case .keep, .waitForSignIn:
                break
            }
        }
        // 6. La fenêtre principale tient sockets et synchronisation : fermée (par l'utilisateur ou par le système),
        // la fenêtre détachée propose de la rouvrir plutôt que de rester muette.
        .overlay(alignment: .top) { reopenMainWindowBanner }
        // Les liens vont à la fenêtre principale ; seule une conversation glissée au bord vient ici.
        .handlesExternalEvents(preferring: [DetachedWindowOpener.activityIdentifier],
                               allowing: [DetachedWindowOpener.activityIdentifier])
        .modifier(MeeshyRouterInjection(router: router))
        .modifier(PublishesSceneNavigation(router: router, role: .detached))
        .modifier(PublishesSceneAction(keyPath: \.meeshyCloseWindow, perform: closeWindow))
        .modifier(PublishesSceneAction(keyPath: \.meeshySearch, perform: { router.pendingOpenSearch = true }))
        .environmentObject(storyViewModel)
        .environmentObject(statusViewModel)
        .meeshyConversationList(conversationVMOwner.viewModel)
        .environmentObject(storyViewerCoordinator)
        .meeshySocialChrome(status: statusViewModel, story: storyViewModel, storyViewer: storyViewerCoordinator)
        .sheet(item: $router.deepLinkProfileUser) { user in
            UserProfileSheet(
                user: user,
                moodEmoji: statusViewModel.statusForUser(userId: user.userId ?? "")?.moodEmoji,
                onMoodTap: statusViewModel.moodTapHandler(for: user.userId ?? ""),
                presenceProvider: { PresenceManager.shared.knownPresenceState(for: $0) }
            )
            .modifier(MeeshyRouterInjection(router: router))
            .environmentObject(statusViewModel)
            .meeshyConversationList(conversationVMOwner.viewModel)
        }
        .modifier(StoryReaderCover(
            request: $storyViewerCoordinator.pendingRequest,
            storyViewModel: storyViewModel,
            statusViewModel: statusViewModel,
            router: router,
            conversationList: conversationVMOwner.viewModel,
            presentationSource: "DetachedWindow",
            onReply: { replyContext in
                router.navigateToStoryReply(replyContext, conversationList: conversationVMOwner.viewModel)
            }
        ))
        .fullScreenCover(isPresented: .constant(upgradeGate.isBlocked)) {
            if let requirement = upgradeGate.requirement {
                UpgradeGateView(requirement: requirement)
            }
        }
        .onAppear {
            // Le retour du premier écran ferme la fenêtre : il n'y a rien dessous.
            router.onPopRequested = { closeWindow() }
        }
        .onDisappear { router.onPopRequested = nil }
        // La portée de CETTE fenêtre, posée le plus à l'extérieur comme dans les
        // racines (#10543) : sans elle ses feuilles s'inscrivaient « de toute
        // fenêtre », et la principale les refermait en ouvrant une conversation.
        .environment(\.presentedSurfaceScope, router.surfaceScope)
    }

    // MARK: - Bandeau

    @ViewBuilder
    private var reopenMainWindowBanner: some View {
        if mainWindows.primary == nil, authManager.isAuthenticated {
            Button {
                UIApplication.shared.requestSceneSessionActivation(nil, userActivity: nil, options: nil)
            } label: {
                Label(String(localized: "window.detached.open_main", defaultValue: "Ouvrir la fenêtre principale", bundle: .main),
                      systemImage: "macwindow")
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .padding(.horizontal, MeeshySpacing.md)
                    .padding(.vertical, MeeshySpacing.sm)
            }
            .buttonStyle(.borderedProminent)
            .padding(.top, MeeshySpacing.sm)
        }
    }

    // MARK: - Conversation

    private func conversationWindow(_ id: String) -> some View {
        NavigationStack(path: $router.path) {
            Group {
                if let conversation {
                    ConversationView(
                        conversation: conversation,
                        replyContext: router.pendingReplyContext,
                        forcedReadingMode: router.pendingForcedReadingMode,
                        landsOnMessage: router.landsOnMessage(in: conversation.id)
                    )
                    .reportsConversationViewing(conversation.id)
                    .id(conversation.id)
                } else if conversationUnavailable {
                    note(String(localized: "window.detached.unavailable", defaultValue: "Cette conversation n'a pas pu être ouverte.", bundle: .main))
                } else {
                    ProgressView()
                }
            }
            .navigationBarHidden(true)
            .navigationDestination(for: Route.self) { route in
                RootRouteDestination(route: route, router: router,
                                     notificationManager: notifications.manager, onNotificationTap: { _ in })
            }
        }
        .task(id: id) {
            conversation = await DetachedConversationResolver.resolve(id)
            conversationUnavailable = conversation == nil
            if let conversation { scene?.title = conversation.name }
        }
    }

    // MARK: - Réels

    private func reelsWindow(_ startId: String?) -> some View {
        NavigationStack(path: $router.path) {
            GeometryReader { proxy in
                ReelsPlayerView(
                    seedPosts: [],
                    startId: startId,
                    commentTargetId: nil,
                    commentParentTargetId: nil,
                    revealCompleted: true,
                    safeArea: proxy.safeAreaInsets,
                    onClose: { closeWindow() },
                    onOpenProfile: { userId, username in
                        router.deepLinkProfileUser = ProfileSheetUser(userId: userId, username: username)
                    },
                    onOpenStory: { userId in
                        storyViewerCoordinator.present(StoryViewerRequest(
                            id: userId, startAtFirstUnviewed: true, singleGroup: true))
                    },
                    onOpenDetail: { postId in router.push(.postDetail(postId)) },
                    authorHasStory: { userId in storyViewModel.storyRingState(forUserId: userId) != .none }
                )
                .ignoresSafeArea()
            }
            .navigationBarHidden(true)
            .navigationDestination(for: Route.self) { route in
                RootRouteDestination(route: route, router: router,
                                     notificationManager: notifications.manager, onNotificationTap: { _ in })
            }
        }
        .adaptiveOnChange(of: scene.map(ObjectIdentifier.init), initial: true) { _, _ in
            scene?.title = String(localized: "window.detached.reels_title", defaultValue: "Réels", bundle: .main)
        }
        .task {
            // Les anneaux de story des auteurs de réels.
            await storyViewModel.loadStories()
        }
    }

    // MARK: -

    private func note(_ text: String) -> some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .regular))
            .foregroundColor(.secondary)
            .multilineTextAlignment(.center)
            .padding(MeeshySpacing.xl)
    }

    private func closeWindow() {
        guard let session = scene?.session else { return }
        // La fenêtre principale revient d'abord : hors Stage Manager elle était passée en arrière-plan, et
        // fermer seule la fenêtre détachée renvoyait à l'écran d'accueil (recette iPad du 2026-10-14).
        if let primary = MainWindowRegistry.shared.primarySession {
            UIApplication.shared.requestSceneSessionActivation(primary, userActivity: nil, options: nil)
        }
        UIApplication.shared.requestSceneSessionDestruction(session, options: nil)
    }
}

/// À qui appartient une fenêtre détachée. Pendant un changement de compte, la session sort puis revient sous un
/// AUTRE compte : la conversation (ou le fil de réels) gardée par la fenêtre est celle du compte quitté, et la
/// repeindre la montrerait au suivant — titre, avatar, dernier message — en rejoignant sa room sous le nouveau
/// jeton.
enum DetachedWindowOwnership: Equatable {
    /// Aucun compte actif : la fenêtre attend (la note « Connectez-vous » s'affiche).
    case waitForSignIn
    /// Première ouverture : la fenêtre appartient désormais à ce compte.
    case adopt(String)
    /// Le compte propriétaire est actif.
    case keep
    /// Un autre compte est actif : la fenêtre se ferme.
    case close

    static func verdict(owner: String?, current: String?) -> DetachedWindowOwnership {
        guard let current, !current.isEmpty else { return .waitForSignIn }
        guard let owner, !owner.isEmpty else { return .adopt(current) }
        return owner == current ? .keep : .close
    }

    /// Le contenu ne se rend que pour son propriétaire (ou une fenêtre qui n'en a pas encore).
    static func shows(owner: String?, current: String?) -> Bool {
        switch verdict(owner: owner, current: current) {
        case .adopt, .keep: return true
        case .close, .waitForSignIn: return false
        }
    }
}

/// La conversation d'une fenêtre détachée : le cache d'abord — elle s'ouvre hors ligne —, le réseau ensuite.
enum DetachedConversationResolver {
    @MainActor
    static func resolve(_ id: String) async -> Conversation? {
        let cached = await CacheCoordinator.shared.conversations.load(for: "list")
        switch cached {
        case .fresh(let list, _), .stale(let list, _):
            if let hit = list.first(where: { $0.id == id }) { return hit }
        case .expired, .empty:
            break
        }
        guard let api = try? await ConversationService.shared.getById(id) else { return nil }
        return api.toConversation(currentUserId: AuthManager.shared.currentUser?.id ?? "")
    }
}
