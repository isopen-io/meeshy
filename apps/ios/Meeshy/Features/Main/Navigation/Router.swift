import SwiftUI
import MeeshySDK
import MeeshyUI
import os

enum Route: Hashable {
    case conversation(Conversation)
    case settings
    case profile
    case contacts(ContactsTab = .contacts)
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
    case friendRequests
    case editProfile
}

extension Route {
    var isHub: Bool {
        switch self {
        case .profile, .settings, .communityList, .contacts, .links, .notifications:
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
        case .friendRequests:
            return "Demandes d'amis"
        case .editProfile:
            return "Modifier le profil"
        }
    }
}

@MainActor
final class Router: ObservableObject {
    @Published var path: [Route] = []
    @Published var deepLinkProfileUser: ProfileSheetUser?
    @Published var pendingShareContent: SharedContentType? = nil

    /// iPad two-column mode: when set, route requests are forwarded here
    /// instead of being pushed onto the NavigationStack path.
    var onRouteRequested: ((Route) -> Bool)?

    /// iPad two-column mode: called when pop/popToRoot is requested.
    var onPopRequested: (() -> Void)?

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "router")

    var currentRoute: Route? { path.last }

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

    func navigateToConversation(_ conversation: Conversation) {
        popToRoot()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            self.push(.conversation(conversation))
        }
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
            ToastManager.shared.showError("Impossible d'ouvrir la conversation")
        }
    }

    // MARK: - Magic Link Validation

    private func handleMagicLinkToken(_ token: String) async {
        await AuthManager.shared.validateMagicLink(token: token)

        if AuthManager.shared.isAuthenticated {
            ToastManager.shared.showSuccess("Connexion reussie !")
            Self.logger.info("Magic link validated successfully")
        } else {
            ToastManager.shared.showError(AuthManager.shared.errorMessage ?? "Lien invalide ou expire")
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
