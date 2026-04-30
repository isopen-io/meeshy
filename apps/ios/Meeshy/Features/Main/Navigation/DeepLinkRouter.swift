import Foundation
import Combine
import UIKit
import MeeshySDK

// MARK: - Deep Link Destination (used by RootView openURL handler)

enum DeepLinkDestination {
    case ownProfile
    case userProfile(username: String)
    case conversation(id: String)
    case magicLink(token: String)
    case share(text: String?, url: String?)
    case userLinks
    case external(URL)
}

// MARK: - Deep Link Parser (static utility for URL parsing)

enum DeepLinkParser {

    private static let meeshyHosts: Set<String> = ["meeshy.me", "www.meeshy.me", "app.meeshy.me"]

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
            Task { @MainActor in UIApplication.shared.open(externalURL) }
        default:
            navigate(destination)
        }
    }

    /// `true` when the URL is a Meeshy route the app knows how to handle.
    /// Used by `AppDelegate.application(_:continue:)` to decide whether to
    /// claim a Universal Link (return `true`) or let iOS fall back to
    /// Safari (return `false`). A `.external` parse result means the URL
    /// is not for us — never claim it.
    static func isMeeshyDeepLink(_ url: URL) -> Bool {
        if case .external = parse(url) {
            return false
        }
        return true
    }

    // MARK: - Private

    private static func parseCustomScheme(_ url: URL) -> DeepLinkDestination {
        // meeshy://me -> host="me", path=""
        // meeshy://u/atabeth -> host="u", path="/atabeth"
        // meeshy://auth/magic-link?token=xxx -> host="auth", path="/magic-link"
        let host = url.host ?? ""
        let pathSegments = url.pathComponents.filter { $0 != "/" }
        let components = host.isEmpty ? pathSegments : [host] + pathSegments

        guard let first = components.first else { return .external(url) }

        switch first {
        case "me":
            return .ownProfile
        case "links":
            return .userLinks
        case "share":
            return parseShareQuery(url)
        case "auth":
            if components.count >= 2, components[1] == "magic-link",
               let queryItems = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
               let token = queryItems.first(where: { $0.name == "token" })?.value {
                return .magicLink(token: token)
            }
        case "u":
            if components.count >= 2 { return .userProfile(username: components[1]) }
        case "c":
            if components.count >= 2 { return .conversation(id: components[1]) }
        default:
            break
        }

        return .external(url)
    }

    private static func parseMeeshyWeb(_ url: URL) -> DeepLinkDestination {
        let components = url.pathComponents.filter { $0 != "/" }

        if components.first == "me" {
            return .ownProfile
        }

        if components.first == "links" {
            return .userLinks
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
    case chatLink(identifier: String)
    case magicLink(token: String)
    case conversation(id: String)
}

// MARK: - Deep Link Router (ObservableObject for join/conversation deep links)

@MainActor
final class DeepLinkRouter: ObservableObject {
    static let shared = DeepLinkRouter()

    @Published var pendingDeepLink: DeepLink?

    init() {}

    // MARK: - Universal Link Handling

    func handle(url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }

        let meeshyHosts = ["meeshy.me", "www.meeshy.me", "app.meeshy.me"]
        guard meeshyHosts.contains(host) else { return handleCustomScheme(url: url) }

        // Filter out empty path segments so that `//join/X` or `/./join/X`
        // collapse to the same shape as `/join/X`. The previous filter
        // only stripped literal "/" entries, leaving empty strings from
        // double-slashes in place and shifting `pathComponents[1]` to
        // an empty identifier.
        let pathComponents = url.pathComponents.filter { !$0.isEmpty && $0 != "/" }

        guard !pathComponents.isEmpty else { return false }

        switch pathComponents[0] {
        case "join", "l":
            guard let identifier = nonEmptyIdentifier(at: 1, in: pathComponents) else { return false }
            pendingDeepLink = .joinLink(identifier: identifier)
            return true

        case "chat":
            guard let identifier = nonEmptyIdentifier(at: 1, in: pathComponents) else { return false }
            pendingDeepLink = .chatLink(identifier: identifier)
            return true

        case "auth":
            guard pathComponents.count >= 3, pathComponents[1] == "magic-link" else { return false }
            guard let token = nonEmptyIdentifier(at: 2, in: pathComponents) else { return false }
            pendingDeepLink = .magicLink(token: token)
            return true

        case "c", "conversation":
            guard let conversationId = nonEmptyIdentifier(at: 1, in: pathComponents) else { return false }
            pendingDeepLink = .conversation(id: conversationId)
            return true

        default:
            return false
        }
    }

    /// Return the path component at `index` only if it is a non-empty,
    /// non-whitespace string. Used to keep the `pendingDeepLink` from
    /// being populated with `""` or `" "` for malformed URLs like
    /// `/join/%20` or `/c//`, both of which would later fail server-side
    /// with an opaque 404 — we'd rather refuse them up front so the
    /// caller (AppDelegate / .onOpenURL) can fall back appropriately.
    private func nonEmptyIdentifier(at index: Int, in components: [String]) -> String? {
        guard components.indices.contains(index) else { return nil }
        let trimmed = components[index].trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    // MARK: - Custom URL Scheme (meeshy://)

    private func handleCustomScheme(url: URL) -> Bool {
        guard url.scheme?.lowercased() == "meeshy" else { return false }

        // Lowercase the host so `meeshy://Join/X` (autocorrect-capitalised
        // by some keyboards) routes the same as `meeshy://join/X`.
        let host = (url.host ?? "").lowercased()
        // Same empty-segment cleanup as the Universal Link branch above.
        let pathComponents = url.pathComponents.filter { !$0.isEmpty && $0 != "/" }

        switch host {
        case "join":
            guard let identifier = nonEmptyIdentifier(at: 0, in: pathComponents) else { return false }
            pendingDeepLink = .joinLink(identifier: identifier)
            return true

        case "chat":
            guard let identifier = nonEmptyIdentifier(at: 0, in: pathComponents) else { return false }
            pendingDeepLink = .chatLink(identifier: identifier)
            return true

        case "auth":
            guard !pathComponents.isEmpty, pathComponents[0] == "magic-link" else { return false }
            let rawToken = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "token" })?.value
            guard let token = rawToken?.trimmingCharacters(in: .whitespacesAndNewlines), !token.isEmpty else {
                return false
            }
            pendingDeepLink = .magicLink(token: token)
            return true

        case "conversation":
            guard let conversationId = nonEmptyIdentifier(at: 0, in: pathComponents) else { return false }
            pendingDeepLink = .conversation(id: conversationId)
            return true

        default:
            return false
        }
    }

    // MARK: - Consume

    @discardableResult
    func consumePendingDeepLink() -> DeepLink? {
        let link = pendingDeepLink
        pendingDeepLink = nil
        return link
    }
}
