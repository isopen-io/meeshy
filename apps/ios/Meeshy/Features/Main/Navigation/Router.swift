import SwiftUI
import MeeshySDK
import MeeshyUI

enum Route: Hashable {
    case conversation(Conversation)
    case settings
    case profile
    case newConversation
}

@MainActor
final class Router: ObservableObject {
    @Published var path = NavigationPath()
    @Published var deepLinkProfileUser: ProfileSheetUser?

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
        DeepLinkRouter.open(url) { [weak self] destination in
            guard let self else { return }
            switch destination {
            case .ownProfile:
                popToRoot()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                    self.push(.profile)
                }

            case .userProfile(let username):
                deepLinkProfileUser = ProfileSheetUser(username: username)

            case .conversation:
                // TODO: fetch conversation by ID and navigate
                break

            case .external:
                break // handled by DeepLinkRouter.open before calling this closure
            }
        }
    }
}
