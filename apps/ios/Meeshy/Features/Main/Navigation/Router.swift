import SwiftUI
import MeeshySDK

enum Route: Hashable {
    case conversation(Conversation)
    case settings
    case profile
    case newConversation
    case notifications
    case userStats
    case affiliate
    case dataExport
}

@MainActor
final class Router: ObservableObject {
    @Published var path = NavigationPath()

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
}
