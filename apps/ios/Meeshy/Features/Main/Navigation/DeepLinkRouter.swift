import Foundation
import MeeshySDK

enum DeepLink: Equatable {
    case joinLink(identifier: String)
    case magicLink(token: String)
    case conversation(id: String)

    static func == (lhs: DeepLink, rhs: DeepLink) -> Bool {
        switch (lhs, rhs) {
        case (.joinLink(let a), .joinLink(let b)): return a == b
        case (.magicLink(let a), .magicLink(let b)): return a == b
        case (.conversation(let a), .conversation(let b)): return a == b
        default: return false
        }
    }
}

@MainActor
final class DeepLinkRouter: ObservableObject {
    static let shared = DeepLinkRouter()

    @Published var pendingDeepLink: DeepLink?

    private init() {}

    // MARK: - Universal Link Handling

    func handle(url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }

        let meeshyHosts = ["meeshy.me", "www.meeshy.me", "app.meeshy.me"]
        guard meeshyHosts.contains(host) else { return handleCustomScheme(url: url) }

        let pathComponents = url.pathComponents.filter { $0 != "/" }

        guard !pathComponents.isEmpty else { return false }

        switch pathComponents[0] {
        case "join", "l":
            guard pathComponents.count >= 2 else { return false }
            let identifier = pathComponents[1]
            pendingDeepLink = .joinLink(identifier: identifier)
            return true

        case "auth":
            guard pathComponents.count >= 3, pathComponents[1] == "magic-link" else { return false }
            let token = pathComponents[2]
            pendingDeepLink = .magicLink(token: token)
            return true

        case "c", "conversation":
            guard pathComponents.count >= 2 else { return false }
            let conversationId = pathComponents[1]
            pendingDeepLink = .conversation(id: conversationId)
            return true

        default:
            return false
        }
    }

    // MARK: - Custom URL Scheme (meeshy://)

    private func handleCustomScheme(url: URL) -> Bool {
        guard url.scheme == "meeshy" else { return false }

        let host = url.host ?? ""
        let pathComponents = url.pathComponents.filter { $0 != "/" }

        switch host {
        case "join":
            guard !pathComponents.isEmpty else { return false }
            pendingDeepLink = .joinLink(identifier: pathComponents[0])
            return true

        case "auth":
            guard pathComponents.count >= 1 else { return false }
            if pathComponents[0] == "magic-link" {
                let token = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                    .queryItems?.first(where: { $0.name == "token" })?.value
                if let token {
                    pendingDeepLink = .magicLink(token: token)
                    return true
                }
            }
            return false

        case "conversation":
            guard !pathComponents.isEmpty else { return false }
            pendingDeepLink = .conversation(id: pathComponents[0])
            return true

        default:
            return false
        }
    }

    // MARK: - Consume

    func consumePendingDeepLink() -> DeepLink? {
        let link = pendingDeepLink
        pendingDeepLink = nil
        return link
    }
}
