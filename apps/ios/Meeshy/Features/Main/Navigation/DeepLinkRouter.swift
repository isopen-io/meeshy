import Foundation
import UIKit
import MeeshySDK

// MARK: - Deep Link Destination (used by RootView openURL handler)

enum DeepLinkDestination {
    case ownProfile
    case userProfile(username: String)
    case conversation(id: String)
    case magicLink(token: String)
    case share(text: String?, url: String?)
    case external(URL)
}

// MARK: - Deep Link Parser (static utility for URL parsing)

enum DeepLinkParser {

    private static let meeshyHosts: Set<String> = ["meeshy.me", "www.meeshy.me"]

    /// Parse any URL into a deep link destination.
    ///
    /// Handles:
    /// - `https://meeshy.me/me`          -> own profile
    /// - `https://meeshy.me/u/{username}` -> user profile
    /// - `https://meeshy.me/c/{id}`       -> conversation
    /// - `meeshy://me`                    -> own profile
    /// - `meeshy://u/{username}`          -> user profile
    /// - `meeshy://c/{id}`               -> conversation
    /// - `meeshy://share?text=...`        -> share text content
    /// - `meeshy://share?url=...`         -> share URL content
    /// - Everything else                  -> open externally
    static func parse(_ url: URL) -> DeepLinkDestination {
        if url.scheme == "meeshy" {
            return parseCustomScheme(url)
        }

        if let host = url.host?.lowercased(), meeshyHosts.contains(host) {
            return parseMeeshyWeb(url)
        }

        return .external(url)
    }

    /// Handle the parsed destination: navigate in-app or open Safari.
    static func open(_ url: URL, navigate: (DeepLinkDestination) -> Void) {
        let destination = parse(url)
        switch destination {
        case .external(let externalURL):
            UIApplication.shared.open(externalURL)
        default:
            navigate(destination)
        }
    }

    // MARK: - Private

    private static func parseCustomScheme(_ url: URL) -> DeepLinkDestination {
        // meeshy://me, meeshy://u/username, meeshy://c/id, meeshy://auth/magic-link?token=xxx
        let path = url.host ?? url.path
        let components = path.split(separator: "/").map(String.init)

        if path == "me" || components.first == "me" {
            return .ownProfile
        }

        // meeshy://share?text=...&url=...
        if path == "share" || components.first == "share" {
            return parseShareQuery(url)
        }

        // meeshy://auth/magic-link?token=xxx
        if path == "auth" || components.first == "auth" {
            let subPath = components.dropFirst()
            if subPath.first == "magic-link",
               let queryItems = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
               let token = queryItems.first(where: { $0.name == "token" })?.value {
                return .magicLink(token: token)
            }
        }

        if components.count >= 2 {
            switch components[0] {
            case "u": return .userProfile(username: components[1])
            case "c": return .conversation(id: components[1])
            default: break
            }
        }

        return .external(url)
    }

    private static func parseMeeshyWeb(_ url: URL) -> DeepLinkDestination {
        let components = url.pathComponents.filter { $0 != "/" }

        if components.first == "me" {
            return .ownProfile
        }

        // https://meeshy.me/share?text=...&url=...
        if components.first == "share" {
            return parseShareQuery(url)
        }

        // https://meeshy.me/auth/magic-link?token=xxx
        if components.count >= 2, components[0] == "auth", components[1] == "magic-link",
           let queryItems = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
           let token = queryItems.first(where: { $0.name == "token" })?.value {
            return .magicLink(token: token)
        }

        if components.count >= 2 {
            switch components[0] {
            case "u": return .userProfile(username: components[1])
            case "c": return .conversation(id: components[1])
            default: break
            }
        }

        // Unknown meeshy.me path (e.g. /l/TOKEN) -> open in Safari
        return .external(url)
    }

    // MARK: - Share Query Parser

    private static func parseShareQuery(_ url: URL) -> DeepLinkDestination {
        let queryItems = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems
        let text = queryItems?.first(where: { $0.name == "text" })?.value
        let urlString = queryItems?.first(where: { $0.name == "url" })?.value
        return .share(text: text, url: urlString)
    }
}

// MARK: - Deep Link (feat: used for pending deep link state)

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

// MARK: - Deep Link Router (ObservableObject for join/conversation deep links)

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
