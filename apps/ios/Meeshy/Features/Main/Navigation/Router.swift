import SwiftUI
import Combine
import CoreLocation
import MeeshySDK
import MeeshyUI
import os

/// Une coordonnée transportable par une `Route`.
///
/// `CLLocationCoordinate2D` n'est ni `Hashable` ni `Equatable` : glissée telle
/// quelle dans une case d'énumération, elle ferait perdre à `Route` sa
/// conformance et TOUTE la pile de navigation cesserait de compiler. Ce
/// porteur existe pour ça, et pour rien d'autre — il ne transforme aucune
/// valeur.
///
/// Aucun arrondi ici non plus : un point touché sur un post doit rouvrir la
/// carte EXACTEMENT là où l'utilisateur a tapé.
struct RouteCoordinate: Hashable {
    let latitude: Double
    let longitude: Double

    init(latitude: Double, longitude: Double) {
        self.latitude = latitude
        self.longitude = longitude
    }

    init(_ coordinate: CLLocationCoordinate2D) {
        self.init(latitude: coordinate.latitude, longitude: coordinate.longitude)
    }

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}

enum Route: Hashable {
    case conversation(Conversation)
    case settings
    case profile
    /// People hub. The associated value picks the tab it opens on — the
    /// floating menu ladder lands on `.calls` (call journal), deep links and
    /// the iPad panel keep the directory default.
    case contacts(PeopleTab = PeopleTab.contacts)
    case peopleDiscovery(DiscoveryTab = .discover)
    /// Découverte de publications par PROXIMITÉ (spec du 2026-08-02 §4) —
    /// carte de densité, carte à pins, liste.
    ///
    /// `initialCoordinate` est le point de départ quand l'écran est ouvert
    /// depuis un lieu DÉJÀ visible (« Voir près d'ici » sur un badge de
    /// position). Il est indépendant de l'opt-in de découvrabilité : c'est un
    /// raccourci de navigation vers une coordonnée publique, pas une
    /// autorisation. `nil` = l'écran part de la position de l'appareil.
    ///
    /// Conséquence testée : avec une coordonnée fournie, l'écran ne demande
    /// JAMAIS l'autorisation de localisation — il fonctionne permission
    /// refusée.
    case nearbyDiscovery(initialCoordinate: RouteCoordinate? = nil)
    case communityList
    case communityDetail(String)
    case communityCreate
    case communitySettings(Community)
    case communityMembers(String)
    case communityInvite(String)
    case notifications
    case userStats
    case links
    case affiliate
    case trackingLinks
    case shareLinks
    case communityLinks
    case dataExport
    case postDetail(String, FeedPost? = nil, showComments: Bool = false, commentId: String? = nil, parentCommentId: String? = nil)
    case hashtagResults(tag: String)
    case bookmarks
    case starredMessages
    case friendRequests
    /// Phase G — destination for story-related notifications. The screen
    /// resolves the underlying story (cache-first, network-revalidate) and
    /// dispatches to the active-story bridge or the expired empty state.
    /// `intent` decides which surface (.comments / .reactions) the user
    /// should land on; `context` carries the snapshot needed to render the
    /// expired state (actor, trigger, occurredAt) without a fresh fetch.
    case storyNotificationTarget(
        storyId: String,
        intent: StoryIntent,
        context: StoryNotificationContext,
        commentId: String?,
        parentCommentId: String?
    )
}

extension Route {
    var isHub: Bool {
        switch self {
        case .profile, .settings, .communityList, .contacts, .peopleDiscovery, .links, .notifications:
            return true
        default:
            return false
        }
    }

    var displayTitle: String {
        switch self {
        case .conversation(let conv):
            return conv.name
        case .settings:
            return String(localized: "route.title.settings", defaultValue: "Paramètres", bundle: .main)
        case .profile:
            return String(localized: "route.title.profile", defaultValue: "Profil", bundle: .main)
        case .contacts(let tab):
            return tab.title
        case .peopleDiscovery:
            return String(localized: "route.title.discover", defaultValue: "Découvrir", bundle: .main)
        case .nearbyDiscovery:
            return String(localized: "route.title.nearby", defaultValue: "À proximité", bundle: .main)
        case .communityList:
            return String(localized: "route.title.communities", defaultValue: "Communautés", bundle: .main)
        case .communityDetail:
            return String(localized: "route.title.community", defaultValue: "Communauté", bundle: .main)
        case .communityCreate:
            return String(localized: "route.title.community_create", defaultValue: "Nouvelle communauté", bundle: .main)
        case .communitySettings:
            return String(localized: "route.title.community_settings", defaultValue: "Paramètres de la communauté", bundle: .main)
        case .communityMembers:
            return String(localized: "route.title.members", defaultValue: "Membres", bundle: .main)
        case .communityInvite:
            return String(localized: "route.title.invite", defaultValue: "Inviter", bundle: .main)
        case .notifications:
            return String(localized: "route.title.notifications", defaultValue: "Notifications", bundle: .main)
        case .userStats:
            return String(localized: "route.title.stats", defaultValue: "Statistiques", bundle: .main)
        case .links:
            return String(localized: "route.title.links", defaultValue: "Liens", bundle: .main)
        case .affiliate:
            return String(localized: "route.title.affiliate", defaultValue: "Affiliation", bundle: .main)
        case .trackingLinks:
            return String(localized: "route.title.tracking_links", defaultValue: "Liens de suivi", bundle: .main)
        case .shareLinks:
            return String(localized: "route.title.share_links", defaultValue: "Liens de partage", bundle: .main)
        case .communityLinks:
            return String(localized: "route.title.community_links", defaultValue: "Liens de communauté", bundle: .main)
        case .dataExport:
            return String(localized: "route.title.data_export", defaultValue: "Export de données", bundle: .main)
        case .postDetail(_, let post, _, _, _):
            return post?.author ?? String(localized: "route.title.post", defaultValue: "Publication", bundle: .main)
        case .hashtagResults(let tag):
            return "#\(tag)"
        case .bookmarks:
            return String(localized: "route.title.bookmarks", defaultValue: "Signets", bundle: .main)
        case .starredMessages:
            return String(localized: "route.title.starred", defaultValue: "Messages favoris", bundle: .main)
        case .friendRequests:
            return String(localized: "route.title.friend_requests", defaultValue: "Demandes d'amis", bundle: .main)
        case .storyNotificationTarget:
            return String(localized: "route.title.story", defaultValue: "Story", bundle: .main)
        }
    }
}

@MainActor
final class Router: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published var path: [Route] = [] {
        didSet {
            AnalyticsManager.shared.trackRoute(path.last)
        }
    }
    @Published var deepLinkProfileUser: ProfileSheetUser?

    /// La fiche d'un participant SANS COMPTE, à ouvrir.
    ///
    /// Séparée de `deepLinkProfileUser` parce que ce n'est pas la même chose :
    /// celle-là présente un COMPTE (bio, bannière, voix, langues) et se demande
    /// par `User.id`. Un visiteur entré par lien n'a rien de tout cela — son
    /// identité vit dans UNE conversation et se demande par le couple
    /// `(conversationId, participantId)`. Les faire transiter par le même canal
    /// obligeait à donner un `userId` à qui n'en a pas.
    @Published var participantProfileTarget: ParticipantProfileTarget?

    @Published var pendingShareContent: SharedContentType? = nil

    /// Reply context awaiting consumption by the next ConversationView that
    /// appears (on tap of a story's reply button). Cleared when the conversation
    /// view applies it. Lives on Router so any view can set it (StoryViewerContainer
    /// is presented from multiple parents — RootView, iPadRootView, ConversationView,
    /// FeedOverlay) without each parent maintaining its own copy.
    @Published var pendingReplyContext: ReplyContext? {
        didSet { if pendingReplyContext != nil { replyContextVersion &+= 1 } }
    }

    /// Incrémenté à chaque pose d'un `pendingReplyContext`. Permet à une
    /// `ConversationView` DÉJÀ visible (réponse à un mood affiché dans sa propre
    /// barre directe) d'appliquer le contexte sans dépendre d'un `onAppear` qui
    /// ne se redéclenche pas quand on « navigue » vers la conversation courante.
    @Published var replyContextVersion: Int = 0

    /// iPad two-column mode: when set, route requests are forwarded here
    /// instead of being pushed onto the NavigationStack path.
    var onRouteRequested: ((Route) -> Bool)?

    /// iPad two-column mode: called when pop/popToRoot is requested.
    var onPopRequested: (() -> Void)?

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "router")

    var currentRoute: Route? { path.last }

    /// Conversation id at the top of the navigation stack, if the active
    /// route is `.conversation(...)`. Used by the floating mini audio
    /// player to hide itself when the user is already inside the
    /// conversation that's driving playback. Returns `nil` for any other
    /// route — settings, profile, communities, etc. — so the bar stays
    /// visible there. Does not cross iPad two-column boundaries: on iPad
    /// the active conversation is owned by `iPadRootView.activeConversation`
    /// instead of `Router.path`.
    var currentConversationId: String? {
        if case let .conversation(conv) = path.last {
            return conv.id
        }
        return nil
    }

    var sceneTitle: String {
        currentRoute?.displayTitle ?? String(localized: "route.title.conversations", defaultValue: "Conversations", bundle: .main)
    }

    var isHubRoute: Bool {
        currentRoute?.isHub ?? true
    }

    var isDeepRoute: Bool {
        !path.isEmpty && !isHubRoute
    }

    func push(_ route: Route) {
        if currentRoute == route { return }

        // iPad intercept: if the callback handles the route, skip NavigationStack push
        if let onRouteRequested, onRouteRequested(route) {
            return
        }

        if route.isHub, let idx = path.lastIndex(where: { $0 == route }) {
            path.removeSubrange((idx + 1)...)
            return
        }

        path.append(route)
    }

    func pop() {
        if path.isEmpty {
            onPopRequested?()
            return
        }
        path.removeLast()
    }

    func popToRoot() {
        if path.isEmpty {
            onPopRequested?()
            return
        }
        path.removeAll()
    }

    @Published var pendingHighlightMessageId: String?

    /// Conversation à laquelle `pendingHighlightMessageId` s'applique. Sans ce
    /// scoping, un highlight posé pour la conversation A pouvait être consommé
    /// par la prochaine conversation B ouverte (scroll/fetch vers un message
    /// étranger). `nil` = non scopé (compat entrées legacy).
    @Published var pendingHighlightConversationId: String?

    /// Quand true, la prochaine `ConversationView` ouverte active directement sa
    /// vue recherche (bouton Recherche de l'aperçu long-press). Consommé + remis
    /// à false par `ConversationView` à l'ouverture.
    @Published var pendingOpenSearch: Bool = false

    /// Demande d'ouverture du COMPOSEUR de post du flux depuis ailleurs (accès
    /// rapides de la liste de conversations, tableau de bord — 2026-08-21) :
    /// `RootView` montre le flux, `ThemedFeedOverlay` ouvre son composeur et
    /// consomme le drapeau. Même patron que `pendingOpenSearch`.
    @Published var pendingOpenFeedComposer: Bool = false

    /// I-075 — override ÉPHÉMÈRE, JAMAIS persistant, posé par l'item « Focal
    /// (bêta) » du menu d'appui long de la liste (gardé par
    /// `BetaFeaturesPreference.isEnabled`, préférence utilisateur — défaut OFF
    /// depuis le 2026-08-22 ; ex-drapeau caché `focalDevPreview`).
    /// Consommé + remis à `nil` par le site d'appel de
    /// `ConversationView(forcedReadingMode:)` à l'ouverture — MÊME patron que
    /// `pendingReplyContext`/`pendingOpenSearch` ci-dessus : une propriété
    /// `Router` en mémoire, JAMAIS `UserDefaults`, JAMAIS la préférence
    /// collante (`ReadingModePreferenceStore`). Allumer `reading_modes`
    /// globalement laisserait le mode AUTO de l'orchestrateur re-décider la
    /// vue de TOUTES LES AUTRES conversations — ce que ce chantier interdit
    /// explicitement (§0 workshop, design imposé point 1). Type
    /// `ReadingModeOrchestrator.ConversationReadingMode` — le type RENDU, pas
    /// `ReadingModePreference` (les mots du menu) : cette propriété force une
    /// DÉCISION, elle n'exprime pas un choix utilisateur mémorisable.
    @Published var pendingForcedReadingMode: ReadingModeOrchestrator.ConversationReadingMode?

    func navigateToConversation(_ conversation: Conversation, highlightMessageId: String? = nil) {
        pendingHighlightMessageId = highlightMessageId
        pendingHighlightConversationId = highlightMessageId == nil ? nil : conversation.id

        // iPad deux colonnes : les routes sont forwardees via `onRouteRequested`
        // (pas de NavigationStack `path`) — comportement inchange.
        if onRouteRequested != nil {
            popToRoot()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                self.push(.conversation(conversation))
            }
            return
        }

        // iPhone : remplace la pile en UNE seule mutation de `path`.
        // L'ancien `popToRoot()` + `push()` differe de 0.05s produisait deux
        // mutations rapprochees → "NavigationRequestObserver tried to update
        // multiple times per frame". `NavigationStack(path:)` recoit
        // desormais une transition atomique.
        path = [.conversation(conversation)]
    }

    /// Replaces the whole nav stack with a single route. On iPhone this is ONE
    /// `path` mutation (no `popToRoot()` + delayed `push()`, which fired two
    /// mutations in quick succession → "NavigationRequestObserver tried to update
    /// multiple times per frame", #16). iPad two-column forwards via the callback,
    /// unchanged. Also lands on the target directly instead of flashing root.
    func replaceStack(with route: Route) {
        if onRouteRequested != nil {
            popToRoot()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                self.push(route)
            }
            return
        }
        path = [route]
    }

    // MARK: - Deep Link Handling

    func handleDeepLink(_ url: URL) {
        DeepLinkParser.open(url) { [weak self] destination in
            guard let self else { return }
            switch destination {
            case .ownProfile:
                replaceStack(with: .profile)

            case .userProfile(let username):
                deepLinkProfileUser = ProfileSheetUser(username: username)

            case .trackedLink(let token):
                // `/l/<token>` resolved async by targetType (records the click).
                DeepLinkRouter.shared.resolveTrackedLink(token)

            case .joinLink(let identifier):
                // In-app taps of an invitation share link. Funnel them through
                // the shared `DeepLinkRouter` pending pipeline so they land on
                // the exact same authenticated join flow as cold-launch
                // Universal Links (RootView/iPadRootView `handleDeepLink` →
                // `joinViaShareLink`). This keeps the join resolution + error
                // handling in a single place rather than duplicating the
                // `ShareLinkService.joinAuthenticated` call here.
                DeepLinkRouter.shared.pendingDeepLink = .joinLink(identifier: identifier)

            case .chatLink(let identifier):
                DeepLinkRouter.shared.pendingDeepLink = .chatLink(identifier: identifier)

            case .conversation(let id, let draftText):
                Task { [weak self] in
                    await self?.handleConversationDeepLink(id, draftText: draftText)
                }

            case .magicLink(let token):
                Self.logger.info("Deep link magic link received")
                Task { [weak self] in
                    await self?.handleMagicLinkToken(token)
                }

            case .share(let text, let urlString):
                Self.logger.info("Deep link share received")
                handleShareDeepLink(text: text, urlString: urlString)

            case .userLinks:
                replaceStack(with: .links)

            case .post(let postId), .postDetail(let postId):
                // `.post` is the legacy short-form (e.g. `meeshy://post/<id>`
                // / `meeshy://p/<id>`) and `.postDetail` is the canonical
                // long-form added with the /feeds/post/:postId rollout —
                // both land on the same PostDetailView surface, so route
                // them through a single arm.
                push(.postDetail(postId))

            case .storyDetail(let postId):
                // In-app `Link` taps land here. Unlike the cold-launch path
                // (RootView.handleDeepLink) we don't have access to the
                // local story tray from this scope, so we route to
                // PostDetailView — the universal fallback that renders any
                // post including stories. The viewer-preferred path stays
                // reserved for cold launch / push notification dispatch.
                push(.postDetail(postId))

            case .hashtag(let tag):
                push(.hashtagResults(tag: tag))

            case .external:
                break
            }
        }
    }

    // MARK: - Conversation Deep Link

    /// Ouvre une conversation via deep link et dépose un brouillon si fourni.
    ///
    /// Voie IN-APP : appelée par le handler `openURL` (RootView/iPadRootView)
    /// quand un tap `Link` résout en `.conversation(id, draftText)` via
    /// `DeepLinkParser.parse`. La voie système (cold launch / widget tap) passe
    /// par `DeepLinkRouter.handle` qui dépose le même brouillon de son côté.
    ///
    /// Les surfaces widget / App Shortcut qui pré-remplissent le composer
    /// portent leur texte en query param (`quickreply?text=…`, `send?message=…`) ;
    /// il est déposé dans `DraftStore` AVANT la navigation pour que
    /// `ConversationView` le trouve à l'ouverture. Le dépôt précède aussi le
    /// fetch réseau : si celui-ci échoue, le texte dicté n'est pas perdu — il
    /// attend dans le brouillon la prochaine ouverture manuelle.
    ///
    /// - Parameter conversationId: ID de conversation (MongoDB ObjectId)
    /// - Parameter draftText: Texte optionnel à déposer en brouillon (jamais envoyé)
    private func handleConversationDeepLink(_ conversationId: String, draftText: String? = nil) async {
        if let draftText, !draftText.isEmpty {
            DraftStore.shared.stageShortcutDraft(draftText, for: conversationId)
            Self.logger.info("Deep link staged draft text for conversation \(conversationId)")
        }
        do {
            let currentUserId = AuthManager.shared.currentUser?.id ?? ""
            let apiConversation = try await ConversationService.shared.getById(conversationId)
            let conversation = apiConversation.toConversation(currentUserId: currentUserId)
            navigateToConversation(conversation)
            Self.logger.info("Deep link navigated to conversation \(conversationId)")
        } catch {
            Self.logger.error("Failed to load conversation for deep link: \(error.localizedDescription)")
            FeedbackToastManager.shared.showError(String(localized: "deeplink.conversation.error", defaultValue: "Impossible d'ouvrir la conversation", bundle: .main))
        }
    }

    // MARK: - Magic Link Validation

    private func handleMagicLinkToken(_ token: String) async {
        // P0 — this path only runs while `RootView`/`iPadRootView` are
        // mounted, i.e. while ALREADY authenticated (as a possibly DIFFERENT
        // account — e.g. a magic-link URL rendered as an in-app tappable
        // `Link` and routed here via the `openURL` environment override).
        // Applying a new session on top of the current one without a full
        // teardown would leak account A's caches, sockets, and E2EE session
        // keys into account B's session. See `MeeshyApp.validateMagicLinkToken`
        // for the mirrored fix on the cold/warm system-URL path.
        if AuthManager.shared.isAuthenticated {
            await AuthManager.shared.logout()
        }
        await AuthManager.shared.validateMagicLink(token: token)

        if AuthManager.shared.isAuthenticated {
            FeedbackToastManager.shared.showSuccess(String(localized: "magicLink.success", defaultValue: "Connexion réussie !", bundle: .main))
            Self.logger.info("Magic link validated successfully")
        } else {
            FeedbackToastManager.shared.showError(AuthManager.shared.errorMessage ?? String(localized: "magicLink.error.invalidLink", defaultValue: "Lien invalide ou expiré", bundle: .main))
            Self.logger.error("Magic link validation failed")
        }
    }

    // MARK: - Share Deep Link

    private func handleShareDeepLink(text: String?, urlString: String?) {
        popToRoot()

        if let urlString, let url = URL(string: urlString) {
            pendingShareContent = .url(url)
        } else if let text, !text.isEmpty {
            pendingShareContent = .text(text)
        } else {
            Self.logger.error("Share deep link received with no content")
        }
    }
}

extension Notification.Name {
    /// Demande de navigation vers une conversation par id, émise par des vues
    /// qui n'ont pas accès aux helpers de résolution des root views (ex :
    /// StarredMessagesView). `object` = conversationId (String). Observée par
    /// RootView (iPhone) et iPadRootView — sans observateur, le tap étoilé
    /// était un no-op silencieux.
    static let meeshyNavigateToConversation = Notification.Name("navigateToConversationById")
}
