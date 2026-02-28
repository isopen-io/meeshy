import SwiftUI
import MeeshySDK
import MeeshyUI
import os

enum Route: Hashable {
    case conversation(Conversation)
    case settings
    case profile
    case newConversation
    case communityList
    case communityDetail(String)
    case communityCreate
    case communitySettings(Community)
    case communityMembers(String)
    case communityInvite(String)
    case notifications
    case userStats
    case affiliate
    case trackingLinks
    case shareLinks
    case communityLinks
    case dataExport
}

@MainActor
final class Router: ObservableObject {
    @Published var path = NavigationPath()
    @Published var deepLinkProfileUser: ProfileSheetUser?
    @Published var pendingShareContent: SharedContentType? = nil

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "router")

    var isInConversation: Bool { !path.isEmpty }

    func push(_ route: Route) {
        path.append(route)
    }

    func pop() {
        guard !path.isEmpty else { return }
        path.removeLast()
    }

    func popToRoot() {
        path = NavigationPath()
    }

    func navigateToConversation(_ conversation: Conversation) {
        popToRoot()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            self.path.append(Route.conversation(conversation))
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

            case .external:
                break // handled by DeepLinkRouter.open before calling this closure
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
