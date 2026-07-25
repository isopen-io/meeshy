import Foundation
import Combine
import UIKit
import MeeshySDK

// MARK: - Deep Link Destination (used by RootView openURL handler)

enum DeepLinkDestination {
    case ownProfile
    case userProfile(username: String)
    case conversation(id: String)
    /// Invitation / share link (`/join/<id>` or `/l/<id>`). The recipient
    /// resolves it server-side: anonymous → guest session, authenticated →
    /// idempotent `joinAuthenticated`. Kept distinct from `.conversation`
    /// because the identifier is a share-link token, not a conversationId.
    case joinLink(identifier: String)
    /// Tracked share link (`/l/<token>`). Resolved ASYNC via
    /// `GET /tracking-links/:token/resolve` → routed by `targetType`; a click is
    /// recorded so in-app opens are counted. Distinct from `.joinLink` so a reel
    /// share no longer hits the conversation-join flow (404).
    case trackedLink(token: String)
    /// Direct chat share link (`/chat/<id>`). Same resolution path as
    /// `.joinLink` — the gateway accepts either shape.
    case chatLink(identifier: String)
    case post(id: String)
    case magicLink(token: String)
    case share(text: String?, url: String?)
    case userLinks
    case postDetail(postId: String)
    case storyDetail(postId: String)
    case external(URL)
}

// MARK: - Deep Link Parser (static utility for URL parsing)

enum DeepLinkParser {

    private static let meeshyHosts: Set<String> = ["meeshy.me", "www.meeshy.me", "app.meeshy.me"]

    /// Segments accepted as the "post" keyword in any deep link shape. The
    /// short alias `p` mirrors the long form `post` so handwritten/dictated
    /// `meeshy://p/<id>` or `meeshy://feeds/p/<id>` URLs resolve to the
    /// same destination as the canonical `meeshy://post/<id>` /
    /// `meeshy://feeds/post/<id>` (and their web Universal Link siblings).
    private static let postSegments: Set<String> = ["post", "p"]

    /// `true` when `segment` is a valid alias for the "post" keyword
    /// (long-form `post` or short-form `p`). Single source of truth so
    /// `DeepLinkRouter` and the parser stay in lockstep — adding a new
    /// alias requires extending only `postSegments`.
    static func isPostSegment(_ segment: String) -> Bool {
        postSegments.contains(segment)
    }

    /// Segments accepted as the "story" keyword. Stories share the post
    /// identifier namespace (a story is a `Post` with `type: STORY` in the
    /// schema), so the deep link only needs to carry the postId — the
    /// dispatch side decides whether to surface the story viewer or fall
    /// back to PostDetailView when the story has expired / isn't in the
    /// local tray. Plural `stories` and short `s` accepted as aliases.
    private static let storySegments: Set<String> = ["story", "stories", "s"]

    /// `true` when `segment` is a valid alias for the "story" keyword.
    static func isStorySegment(_ segment: String) -> Bool {
        storySegments.contains(segment)
    }

    /// Segments accepted as the "user profile" keyword. Canonical `u` is
    /// claimed by AASA today; `users` (plural) is accepted for symmetry
    /// with the gateway REST surface (`/api/v1/users/...`) and to align
    /// with how third-party tools commonly write user URLs.
    private static let userSegments: Set<String> = ["u", "users"]

    /// `true` when `segment` is a valid alias for the user-profile keyword.
    static func isUserSegment(_ segment: String) -> Bool {
        userSegments.contains(segment)
    }

    /// Parse any URL into a deep link destination.
    ///
    /// Universal Links (https://meeshy.me/...):
    /// - `/me`                                   -> own profile
    /// - `/links`                                -> user links hub
    /// - `/u/{username}` or `/users/{username}`  -> user profile
    /// - `/c/{id}`                               -> conversation
    /// - `/feeds/post/{id}` or `/feeds/p/{id}`   -> post detail
    /// - `/post/{id}` or `/p/{id}`               -> post detail (short)
    /// - `/story/{id}`, `/stories/{id}`, `/s/{id}` -> story detail
    /// - `/share?text=...&url=...`               -> share content
    /// - `/auth/magic-link?token=...`            -> passwordless auth
    ///
    /// Custom scheme (meeshy://...):
    /// - `meeshy://me`, `meeshy://links`
    /// - `meeshy://u/{username}`, `meeshy://users/{username}`
    /// - `meeshy://c/{id}`
    /// - `meeshy://post/{id}`, `meeshy://p/{id}`
    /// - `meeshy://feeds/post/{id}`, `meeshy://feeds/p/{id}`
    /// - `meeshy://story/{id}`, `meeshy://stories/{id}`, `meeshy://s/{id}`
    /// - `meeshy://share?text=...&url=...`
    /// - `meeshy://auth/magic-link?token=...`
    ///
    /// Everything else -> `.external` (caller opens in Safari).
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
        case "u", "users":
            // meeshy://u/{username} (or meeshy://users/{username}).
            if components.count >= 2 { return .userProfile(username: components[1]) }
        case "join":
            // meeshy://join/{linkId} — conversation invitation share link.
            if components.count >= 2 { return .joinLink(identifier: components[1]) }
        case "l":
            // meeshy://l/{token} — tracked share link (post/reel/story/invitation).
            // Resolved async by targetType; NOT assumed to be a conversation join.
            if components.count >= 2 { return .trackedLink(token: components[1]) }
        case "chat":
            // meeshy://chat/{linkId} — direct chat share link (web fallback
            // redirect emits this from /chat/[id]).
            if components.count >= 2 { return .chatLink(identifier: components[1]) }
        case "c", "conversation":
            if components.count >= 2 { return .conversation(id: components[1]) }
        case "post", "p":
            // meeshy://post/{postId} (or meeshy://p/{postId}) — direct
            // shortcut to a post detail view.
            if components.count >= 2 { return .postDetail(postId: components[1]) }
        case "feeds":
            // meeshy://feeds/post/{postId} — mirror of the web Universal Link
            // path so the custom scheme accepts the same shape as the
            // production URL recipients see in clipboards / email previews.
            // `feeds/p/{postId}` is accepted as a short alias.
            if components.count >= 3, postSegments.contains(components[1]) {
                return .postDetail(postId: components[2])
            }
        case "story", "stories", "s":
            // meeshy://story/{postId} (or meeshy://stories/{postId} or
            // meeshy://s/{postId}) — matches the canonical share URL the
            // iOS app already mints (`https://meeshy.me/story/<postId>`).
            // Stories carry a `postId` because they live in the `Post`
            // table with `type: STORY`.
            if components.count >= 2 { return .storyDetail(postId: components[1]) }
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

        // https://meeshy.me/feeds/post/{postId} -> post detail.
        // Claimed as a Universal Link in apple-app-site-association so iOS
        // opens this directly inside the app whenever it's installed; the
        // Next.js rewrite serves the same path on the web for non-iOS
        // recipients (or when the app rejects the link).
        // The short alias `feeds/p/{postId}` resolves to the same destination
        // so any pasted shorthand still routes in-app.
        if components.count >= 3, components[0] == "feeds", postSegments.contains(components[1]) {
            return .postDetail(postId: components[2])
        }

        if components.count >= 2 {
            let head = components[0]
            // User profile — `u` (canonical) and `users` (plural alias).
            if userSegments.contains(head) {
                return .userProfile(username: components[1])
            }
            // Story — `story`, `stories`, `s`.
            if storySegments.contains(head) {
                return .storyDetail(postId: components[1])
            }
            // Post — short forms at root (`post/<id>`, `p/<id>`). The
            // canonical share URL stays `/feeds/post/<id>` (handled above)
            // but pasted/handwritten variants without the `feeds` prefix
            // are accepted so any sensible shape lands in the app.
            if postSegments.contains(head) {
                return .postDetail(postId: components[1])
            }
            switch head {
            case "c", "conversation": return .conversation(id: components[1])
            // Invitation / share links — `/join/<id>` (canonical) and
            // `/l/<id>` (legacy / tracking alias). Both are claimed as
            // Universal Links in apple-app-site-association and resolve to
            // the same authenticated/anonymous join flow. Recognising them
            // here is what lets `isMeeshyDeepLink` return `true` so
            // `AppDelegate.application(_:continue:)` claims the cold-launch
            // Universal Link instead of bouncing it to Safari.
            case "join": return .joinLink(identifier: components[1])
            // Tracked share link — `/l/<token>` (post/reel/story/invitation).
            // Resolved async by targetType (no longer assumed to be a join).
            case "l": return .trackedLink(token: components[1])
            // Direct chat share link — `/chat/<id>`.
            case "chat": return .chatLink(identifier: components[1])
            default: break
            }
        }

        // Unknown meeshy.me path (e.g. /settings) -> open in Safari
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
    /// `/l/<token>` — resolved async (TrackedLinkService) then re-routed by targetType.
    case trackedLink(token: String)
    case chatLink(identifier: String)
    case magicLink(token: String)
    case conversation(id: String)
    case postDetail(postId: String)
    case storyDetail(postId: String)
    case userProfile(username: String)
    case ownProfile
    case userLinks
}

// MARK: - Deep Link Router (ObservableObject for join/conversation deep links)

@MainActor
final class DeepLinkRouter: ObservableObject {
    static let shared = DeepLinkRouter()

    @Published var pendingDeepLink: DeepLink?

    init() {}

    // MARK: - Tracked link (`/l/<token>`) async resolution

    /// Resolves a `/l/<token>` link to its typed destination OFF the navigation
    /// path: records an in-app click (so app opens are counted like web opens),
    /// asks the gateway `/tracking-links/:token/resolve` for the target, then
    /// re-sets `pendingDeepLink` to the real destination. On failure/offline it
    /// falls back to the legacy join flow (token = linkId) so nothing regresses.
    func resolveTrackedLink(_ token: String, resolver: TrackedLinkResolving = TrackedLinkService.shared) {
        Task { @MainActor in
            await resolver.recordClick(token: token)
            let resolved = try? await resolver.resolve(token: token)
            self.pendingDeepLink = Self.trackedDestination(for: resolved, token: token)
        }
    }

    /// Maps a resolved tracked link to a `DeepLink`. Conversation invitations keep
    /// the legacy `.joinLink` flow (the token IS the linkId); POST/REEL/STATUS →
    /// `.postDetail`, STORY → `.storyDetail`, PROFILE → `.userProfile`. Unknown /
    /// expired / missing id → `.joinLink` fallback (backward compatible).
    static func trackedDestination(for resolved: ResolvedTrackedLink?, token: String) -> DeepLink {
        let kind = (resolved?.kind ?? "").lowercased()
        let type = (resolved?.targetType ?? "").uppercased()
        if kind == "conversation" || type == "CONVERSATION" {
            return .joinLink(identifier: token)
        }
        if let targetId = resolved?.targetId, resolved?.isActive != false {
            switch type {
            case "STORY": return .storyDetail(postId: targetId)
            case "PROFILE": return .userProfile(username: targetId)
            case "REEL", "POST", "STATUS": return .postDetail(postId: targetId)
            default: break
            }
        }
        return .joinLink(identifier: token)
    }

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

        let head = pathComponents[0]

        switch head {
        case "join":
            guard let identifier = nonEmptyIdentifier(at: 1, in: pathComponents) else { return false }
            pendingDeepLink = .joinLink(identifier: identifier)
            return true

        case "l":
            guard let token = nonEmptyIdentifier(at: 1, in: pathComponents) else { return false }
            resolveTrackedLink(token)
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

        case "me":
            // `/me` — own profile. Single-segment path, no identifier
            // needed. Dispatch pops to the conversation list root then
            // pushes the profile screen so the back-swipe takes the user
            // back to the home surface (not the previous nav stack).
            pendingDeepLink = .ownProfile
            return true

        case "links":
            // `/links` — own user links hub (tracking links, share links,
            // affiliate, etc.). Same surface as the in-app `Link` tap that
            // already routes to `.links` via Router.handleDeepLink.
            pendingDeepLink = .userLinks
            return true

        case "feeds":
            // `/feeds/post/{postId}` — Universal Link surface for the public
            // share URL minted by the gateway (`FRONTEND_URL/feeds/post/<id>`).
            // The recipient lands directly inside PostDetailView when the app
            // is installed; the same path is served by the Next.js rewrite
            // for non-iOS recipients. `/feeds/p/{postId}` is accepted as a
            // short alias so the handler stays in lockstep with the parser
            // (in-app Link taps on either shape both resolve in-app).
            guard pathComponents.count >= 3,
                  DeepLinkParser.isPostSegment(pathComponents[1]) else { return false }
            guard let postId = nonEmptyIdentifier(at: 2, in: pathComponents) else { return false }
            pendingDeepLink = .postDetail(postId: postId)
            return true

        default:
            // Multi-segment helpers — collapsed under `default` so we can
            // share the same `nonEmptyIdentifier(at: 1, ...)` validation
            // across every `/<keyword>/<id>` shape. Each branch checks the
            // helper set declared on `DeepLinkParser` so the parser
            // (in-app Link tap) and this router stay in lockstep — adding
            // a new alias requires extending only the set.

            if DeepLinkParser.isPostSegment(head) {
                // `/post/{postId}` or `/p/{postId}` at root — short form
                // accepted alongside the canonical `/feeds/post/<id>`.
                guard let postId = nonEmptyIdentifier(at: 1, in: pathComponents) else { return false }
                pendingDeepLink = .postDetail(postId: postId)
                return true
            }

            if DeepLinkParser.isStorySegment(head) {
                // `/story/{postId}`, `/stories/{postId}`, `/s/{postId}` —
                // dispatch prefers StoryViewer when the story is in the
                // local tray, with a PostDetailView fallback for expired /
                // unknown stories.
                guard let postId = nonEmptyIdentifier(at: 1, in: pathComponents) else { return false }
                pendingDeepLink = .storyDetail(postId: postId)
                return true
            }

            if DeepLinkParser.isUserSegment(head) {
                // `/u/{username}` or `/users/{username}` — opens the user
                // profile sheet over the conversation list.
                guard let username = nonEmptyIdentifier(at: 1, in: pathComponents) else { return false }
                pendingDeepLink = .userProfile(username: username)
                return true
            }

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

        case "l":
            guard let token = nonEmptyIdentifier(at: 0, in: pathComponents) else { return false }
            resolveTrackedLink(token)
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

        case "c", "conversation":
            // meeshy://c/{id} — short alias mirroring the Universal Link
            // `/c/<id>` shape (and `DeepLinkParser.parseCustomScheme`'s own
            // `case "c", "conversation":`) so a pasted/handwritten short
            // scheme URL doesn't silently no-op. Previously only
            // `"conversation"` was handled here, dropping `meeshy://c/<id>`
            // even though the parser already resolved it to `.conversation`.
            guard let conversationId = nonEmptyIdentifier(at: 0, in: pathComponents) else { return false }
            pendingDeepLink = .conversation(id: conversationId)
            return true

        case "me":
            // meeshy://me — single-host shortcut to own profile.
            pendingDeepLink = .ownProfile
            return true

        case "links":
            // meeshy://links — single-host shortcut to the user links hub.
            pendingDeepLink = .userLinks
            return true

        case "u", "users":
            // meeshy://u/{username} (or meeshy://users/{username}) — opens
            // the user profile sheet over the conversation list.
            guard let username = nonEmptyIdentifier(at: 0, in: pathComponents) else { return false }
            pendingDeepLink = .userProfile(username: username)
            return true

        case "post", "p":
            // meeshy://post/{postId} (or meeshy://p/{postId}) — direct
            // custom-scheme shortcut to the post detail view.
            guard let postId = nonEmptyIdentifier(at: 0, in: pathComponents) else { return false }
            pendingDeepLink = .postDetail(postId: postId)
            return true

        case "feeds":
            // meeshy://feeds/post/{postId} — mirror of the Universal Link
            // shape so any pasted form of the share URL works identically.
            // `feeds/p/{postId}` is accepted as a short alias.
            guard !pathComponents.isEmpty,
                  DeepLinkParser.isPostSegment(pathComponents[0]) else { return false }
            guard let postId = nonEmptyIdentifier(at: 1, in: pathComponents) else { return false }
            pendingDeepLink = .postDetail(postId: postId)
            return true

        case "story", "stories", "s":
            // meeshy://story/{postId} — direct custom-scheme shortcut to
            // the story viewer (or PostDetailView fallback). Plural alias
            // `meeshy://stories/{postId}` and short alias `meeshy://s/{id}`
            // accepted for symmetry with the web Universal Link surface.
            guard let postId = nonEmptyIdentifier(at: 0, in: pathComponents) else { return false }
            pendingDeepLink = .storyDetail(postId: postId)
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
