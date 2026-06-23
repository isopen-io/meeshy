import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

enum Route: Hashable {
    case conversation(Conversation)
    case settings
    case profile
    case contacts
    case peopleDiscovery(DiscoveryTab = .discover)
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
    case postDetail(String, FeedPost? = nil, showComments: Bool = false)
    case bookmarks
    case starredMessages
    case friendRequests
    case editProfile
    /// Phase G — destination for story-related notifications. The screen
    /// resolves the underlying story (cache-first, network-revalidate) and
    /// dispatches to the active-story bridge or the expired empty state.
    /// `intent` decides which surface (.comments / .reactions) the user
    /// should land on; `context` carries the snapshot needed to render the
    /// expired state (actor, trigger, occurredAt) without a fresh fetch.
    case storyNotificationTarget(
        storyId: String,
        intent: StoryIntent,
        context: StoryNotificationContext
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
            return "Parametres"
        case .profile:
            return "Profil"
        case .contacts:
            return "Contacts"
        case .peopleDiscovery:
            return "Decouvrir"
        case .communityList:
            return "Communautes"
        case .communityDetail:
            return "Communaute"
        case .communityCreate:
            return "Nouvelle communaute"
        case .communitySettings:
            return "Parametres communaute"
        case .communityMembers:
            return "Membres"
        case .communityInvite:
            return "Inviter"
        case .notifications:
            return "Notifications"
        case .userStats:
            return "Statistiques"
        case .links:
            return "Liens"
        case .affiliate:
            return "Affiliation"
        case .trackingLinks:
            return "Liens de suivi"
        case .shareLinks:
            return "Liens de partage"
        case .communityLinks:
            return "Liens communaute"
        case .dataExport:
            return "Export de donnees"
        case .postDetail(_, let post, _):
            return post?.author ?? "Publication"
        case .bookmarks:
            return "Signets"
        case .starredMessages:
            return "Messages favoris"
        case .friendRequests:
            return "Demandes d'amis"
        case .editProfile:
            return "Modifier le profil"
        case .storyNotificationTarget:
            return "Story"
        }
    }
}

@MainActor
final class Router: ObservableObject {
    @Published var path: [Route] = [] {
        didSet {
            AnalyticsManager.shared.trackRoute(path.last)
        }
    }
    @Published var deepLinkProfileUser: ProfileSheetUser?
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
        currentRoute?.displayTitle ?? "Conversations"
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

    func navigateToConversation(_ conversation: Conversation, highlightMessageId: String? = nil) {
        pendingHighlightMessageId = highlightMessageId

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

    // MARK: - Deep Link Handling

    func handleDeepLink(_ url: URL) {
        DeepLinkParser.open(url) { [weak self] destination in
            guard let self else { return }
            switch destination {
            case .ownProfile:
                popToRoot()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                    self.push(.profile)
                }

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

            case .conversation(let id):
                Task { [weak self] in
                    await self?.handleConversationDeepLink(id)
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
                popToRoot()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                    self.push(.links)
                }

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

            case .external:
                break
            }
        }
    }

    // MARK: - Conversation Deep Link

    private func handleConversationDeepLink(_ conversationId: String) async {
        do {
            let currentUserId = AuthManager.shared.currentUser?.id ?? ""
            let apiConversation = try await ConversationService.shared.getById(conversationId)
            let conversation = apiConversation.toConversation(currentUserId: currentUserId)
            navigateToConversation(conversation)
            Self.logger.info("Deep link navigated to conversation \(conversationId)")
        } catch {
            Self.logger.error("Failed to load conversation for deep link: \(error.localizedDescription)")
            FeedbackToastManager.shared.showError("Impossible d'ouvrir la conversation")
        }
    }

    // MARK: - Magic Link Validation

    private func handleMagicLinkToken(_ token: String) async {
        await AuthManager.shared.validateMagicLink(token: token)

        if AuthManager.shared.isAuthenticated {
            FeedbackToastManager.shared.showSuccess(String(localized: "magicLink.success", defaultValue: "Login successful!", bundle: .main))
            Self.logger.info("Magic link validated successfully")
        } else {
            FeedbackToastManager.shared.showError(AuthManager.shared.errorMessage ?? String(localized: "magicLink.error.invalidLink", defaultValue: "Invalid or expired link", bundle: .main))
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
