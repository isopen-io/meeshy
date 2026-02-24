import Foundation
import UIKit

// MARK: - Deep Link Destination

enum DeepLinkDestination {
    case ownProfile
    case userProfile(username: String)
    case conversation(id: String)
    case external(URL)
}

// MARK: - Deep Link Router

enum DeepLinkRouter {

    private static let meeshyHosts: Set<String> = ["meeshy.me", "www.meeshy.me"]

    /// Parse any URL into a deep link destination.
    ///
    /// Handles:
    /// - `https://meeshy.me/me`          → own profile
    /// - `https://meeshy.me/u/{username}` → user profile
    /// - `https://meeshy.me/c/{id}`       → conversation
    /// - `meeshy://me`                    → own profile
    /// - `meeshy://u/{username}`          → user profile
    /// - `meeshy://c/{id}`               → conversation
    /// - Everything else                  → open externally
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
        // meeshy://me, meeshy://u/username, meeshy://c/id
        let path = url.host ?? url.path
        let components = path.split(separator: "/").map(String.init)

        if path == "me" || components.first == "me" {
            return .ownProfile
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

        if components.count >= 2 {
            switch components[0] {
            case "u": return .userProfile(username: components[1])
            case "c": return .conversation(id: components[1])
            default: break
            }
        }

        // Unknown meeshy.me path (e.g. /l/TOKEN) → open in Safari
        return .external(url)
    }
}
