import Foundation
import Combine
import UIKit
import MeeshySDK

// MARK: - Deep Link Destination (used by RootView openURL handler)

enum DeepLinkDestination {
    case ownProfile
    case userProfile(username: String)
    /// `draftText` porte le brouillon des surfaces widget / App Shortcut
    /// (`meeshy://quickreply/{id}?text=…`, `meeshy://send?contactId=…&message=…`).
    /// Le consommateur (`Router.handleConversationDeepLink`) le DÉPOSE dans
    /// `DraftStore` avant navigation — il n'est jamais envoyé sans confirmation.
    /// `nil` pour toutes les autres formes de lien conversation.
    case conversation(id: String, draftText: String?)
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
    case hashtag(tag: String)
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

    /// Value of a query item, trimmed, or `nil` when absent/blank.
    ///
    /// Shared by the parser and `DeepLinkRouter` so the two read the SAME
    /// query key the same way — the widget and App Shortcut surfaces carry
    /// their payload in the query string, not in the path.
    static func queryValue(_ name: String, in url: URL) -> String? {
        let raw = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?
            .first(where: { $0.name == name })?
            .value
        let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines)
        return (trimmed?.isEmpty == false) ? trimmed : nil
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
    /// - `meeshy://contact/{conversationId}`            (widget Favoris)
    /// - `meeshy://quickreply/{conversationId}?text=…`  (widget Réponse rapide)
    /// - `meeshy://send?contactId=…&message=…`          (App Shortcut Siri)
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
        case "hashtag":
            // meeshy://hashtag/{tag}.
            if components.count >= 2, !components[1].isEmpty { return .hashtag(tag: components[1]) }
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
            if components.count >= 2 { return .conversation(id: components[1], draftText: nil) }
        case "contact":
            // meeshy://contact/{id} — ligne du widget Favoris. L'identifiant
            // est celui d'une CONVERSATION, pas d'un utilisateur :
            // `WidgetDataManager.publishFavoriteContacts` écrit `conv.id` dans
            // `FavoriteContact.id`. Le nom du host décrit ce que la ligne
            // MONTRE, pas ce qu'elle porte.
            if components.count >= 2 { return .conversation(id: components[1], draftText: nil) }
        case "quickreply":
            // meeshy://quickreply/{conversationId}?text=… — boutons du widget
            // Réponse rapide. Le texte voyage DANS la destination pour que la
            // voie in-app (`Router.handleConversationDeepLink`) le dépose en
            // brouillon comme la voie système (`DeepLinkRouter.handleCustomScheme`)
            // le fait déjà — sans lui, le tap in-app ouvrait la conversation vide.
            if components.count >= 2 {
                return .conversation(id: components[1], draftText: queryValue("text", in: url))
            }
        case "send":
            // meeshy://send?contactId=…&message=… — App Shortcut « Send
            // Message ». `ContactEntity.id` provient de la même clé App Group
            // `favorite_contacts` que le widget : c'est donc, là aussi, un
            // identifiant de conversation. `message` est le brouillon dicté à
            // Siri — déposé, jamais envoyé sans confirmation.
            if let conversationId = queryValue("contactId", in: url) {
                return .conversation(id: conversationId, draftText: queryValue("message", in: url))
            }
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
            // Hashtag results — `hashtag/{tag}`.
            if head == "hashtag", !components[1].isEmpty {
                return .hashtag(tag: components[1])
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
            case "c", "conversation": return .conversation(id: components[1], draftText: nil)
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
    case hashtag(tag: String)
    /// `/l/<token>` dont la cible vit sur le web : lien EXTERNAL, ou type de
    /// cible que ce client ne connaît pas encore. Le consommateur l'OUVRE
    /// (Safari) — il ne la rejoint pas.
    case externalLink(url: URL)
    /// `/l/<token>` que le serveur ne sait pas résoudre (404), ou qu'on n'a pas
    /// pu joindre. Le consommateur en fait un message.
    ///
    /// Cette voie remplace un repli vers `.joinLink(identifier: token)` : le
    /// token d'un `/l/` est un `TrackingLink.token` de six caractères, jamais un
    /// `ConversationShareLink.linkId`. Le pousser dans la voie jointure appelait
    /// `GET /anonymous/link/<token>`, qui répond 404 PAR CONSTRUCTION — et
    /// affichait « Lien introuvable » pour chaque lien externe, chaque lien
    /// désactivé, et chaque story de plus de 24 h (son expiration désactive ses
    /// liens de suivi, cf. `deactivatePostTrackingLinks` côté gateway).
    case unresolvedTrackedLink(token: String)
}

// MARK: - Deep Link Router (ObservableObject for join/conversation deep links)

@MainActor
final class DeepLinkRouter: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    static let shared = DeepLinkRouter()

    @Published var pendingDeepLink: DeepLink?

    /// Lien de partage sur lequel la personne a choisi d'entrer SANS COMPTE,
    /// alors qu'un compte est disponible sur l'appareil.
    ///
    /// Ce canal existe parce que les deux moitiés de la décision ne vivent pas
    /// au même endroit : le choix se prend dans `RootView` (qui seule connaît
    /// la liste des conversations, donc l'appartenance), et la session invitée
    /// est portée par `MeeshyApp` (`activeGuestSession`), au-dessus.
    ///
    /// Distinct de `pendingDeepLink` à dessein : celui-ci décrit une DESTINATION
    /// à résoudre, celui-là une IDENTITÉ déjà choisie. Les confondre ferait
    /// reprendre la résolution à zéro et reposerait la question.
    @Published var requestedGuestJoin: String?

    /// Brouillons par conversation. Injecté pour que le dépôt du texte d'un
    /// raccourci (widget « Réponse rapide », App Shortcut « Send Message »)
    /// soit observable en test sans toucher aux `UserDefaults` du simulateur.
    private let drafts: DraftStore

    init(drafts: DraftStore = .shared) {
        self.drafts = drafts
    }

    // MARK: - Tracked link (`/l/<token>`) async resolution

    /// Resolves a `/l/<token>` link to its typed destination OFF the navigation
    /// path: records an in-app click (so app opens are counted like web opens),
    /// asks the gateway `/tracking-links/:token/resolve` for the target, then
    /// re-sets `pendingDeepLink` to the real destination. On failure/offline it
    /// falls back to the legacy join flow (token = linkId) so nothing regresses.
    func resolveTrackedLink(_ token: String, resolver: TrackedLinkResolving = TrackedLinkService.shared) {
        Task { @MainActor in
            // Le comptage du clic part À CÔTÉ de la résolution, jamais devant
            // elle. Enchaînés, la navigation payait DEUX allers-retours : sur un
            // lancement à froid depuis un Universal Link, l'écran restait nu
            // pendant les deux. Le comptage ne décide de rien — son propre
            // contrat le dit (« best-effort, fire-and-forget ») — et rien
            // n'attend son issue.
            Task { await resolver.recordClick(token: token) }
            let resolved = try? await resolver.resolve(token: token)
            self.pendingDeepLink = Self.trackedDestination(for: resolved, token: token)
        }
    }

    /// Maps a resolved tracked link to a `DeepLink`.
    ///
    /// Ordre de lecture : l'invitation de conversation d'abord (le token EST
    /// alors le `linkId`, seul cas où la voie jointure est la bonne), puis la
    /// cible typée, puis l'`originalUrl` reparsée, puis l'aveu d'échec.
    ///
    /// `isActive == false` n'écarte PAS la cible typée : une story expirée
    /// désactive ses liens de suivi, et son écran de destination porte déjà
    /// l'état « Story indisponible ». Refuser d'ouvrir aurait remplacé une
    /// explication par un cul-de-sac.
    static func trackedDestination(for resolved: ResolvedTrackedLink?, token: String) -> DeepLink {
        guard let resolved else { return .unresolvedTrackedLink(token: token) }

        let kind = (resolved.kind ?? "").lowercased()
        let type = (resolved.targetType ?? "").uppercased()
        if kind == "conversation" || type == "CONVERSATION" {
            return .joinLink(identifier: token)
        }

        if let targetId = resolved.targetId, !targetId.isEmpty {
            switch type {
            case "STORY": return .storyDetail(postId: targetId)
            // `targetId` est un ObjectId d'utilisateur, pas un pseudo — la
            // fabrique du SDK distingue les deux et laisse l'écran résoudre.
            case "PROFILE": return .userProfile(username: targetId)
            case "REEL", "POST", "STATUS": return .postDetail(postId: targetId)
            default: break
            }
        }

        // `originalUrl` porte la vérité quand le type manque, est vide, ou n'est
        // pas connu de CE client (une version antérieure à un nouveau type de
        // cible). Le gateway l'écrit systématiquement : `https://meeshy.me/story/<id>`,
        // `https://meeshy.me/reel/<id>`, ou l'URL brute d'un lien externe.
        if let url = resolved.originalUrl.flatMap(URL.init(string:)) {
            return destination(forOriginalURL: url) ?? .unresolvedTrackedLink(token: token)
        }

        return .unresolvedTrackedLink(token: token)
    }

    /// Reparse l'`originalUrl` d'un lien de suivi avec le MÊME analyseur que les
    /// Universal Links, pour qu'une URL Meeshy atterrisse in-app plutôt que dans
    /// Safari. `nil` quand l'URL n'ouvre rien (schéma non web, forme vide).
    static func destination(forOriginalURL url: URL) -> DeepLink? {
        switch DeepLinkParser.parse(url) {
        case .storyDetail(let id):        return .storyDetail(postId: id)
        case .postDetail(let id):         return .postDetail(postId: id)
        case .post(let id):               return .postDetail(postId: id)
        case .conversation(let id, _):    return .conversation(id: id)
        case .userProfile(let username):  return .userProfile(username: username)
        case .ownProfile:                 return .ownProfile
        case .userLinks:                  return .userLinks
        case .hashtag(let tag):           return .hashtag(tag: tag)
        case .joinLink(let identifier):   return .joinLink(identifier: identifier)
        case .chatLink(let identifier):   return .chatLink(identifier: identifier)
        case .magicLink(let token):       return .magicLink(token: token)
        case .external(let target):
            // Seul le web s'ouvre. Un `javascript:` ou un schéma inconnu remonté
            // par un lien de suivi ne doit jamais être passé à `UIApplication`.
            guard let scheme = target.scheme?.lowercased(),
                  scheme == "http" || scheme == "https" else { return nil }
            return .externalLink(url: target)
        // `/l/<token>` imbriqué, partage brut : rien à ouvrir depuis une
        // `originalUrl`, et re-résoudre ferait une boucle.
        case .trackedLink, .share:        return nil
        }
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

        case "hashtag":
            guard let tag = nonEmptyIdentifier(at: 1, in: pathComponents) else { return false }
            pendingDeepLink = .hashtag(tag: tag)
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

        case "contact":
            // meeshy://contact/{id} — ligne du widget Favoris. L'identifiant
            // porté est celui d'une CONVERSATION (cf. `DeepLinkParser`), donc
            // la destination est la même que `meeshy://c/{id}`.
            guard let conversationId = nonEmptyIdentifier(at: 0, in: pathComponents) else { return false }
            pendingDeepLink = .conversation(id: conversationId)
            return true

        case "quickreply":
            // meeshy://quickreply/{conversationId}?text=… — les quatre boutons
            // du widget Réponse rapide. Le texte n'est pas ENVOYÉ : il est
            // déposé en brouillon et le composer s'ouvre pré-rempli. Envoyer
            // sans confirmation ferait d'un tap accidenté sur l'écran d'accueil
            // un message irrattrapable.
            guard let conversationId = nonEmptyIdentifier(at: 0, in: pathComponents) else { return false }
            stageDraft(DeepLinkParser.queryValue("text", in: url), for: conversationId)
            pendingDeepLink = .conversation(id: conversationId)
            return true

        case "send":
            // meeshy://send?contactId=…&message=… — App Shortcut « Send
            // Message » (Siri / Spotlight / Raccourcis). Même dépôt de
            // brouillon que la réponse rapide, même refus d'envoyer sans
            // confirmation : Siri a pu mal transcrire la dictée.
            guard let conversationId = DeepLinkParser.queryValue("contactId", in: url) else { return false }
            stageDraft(DeepLinkParser.queryValue("message", in: url), for: conversationId)
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

    /// Dépose le texte d'un raccourci dans le brouillon de la conversation.
    /// `ConversationView` le relit à l'ouverture (`DraftStore.load` quand le
    /// champ de saisie est vide) : aucune nouvelle voie de pré-remplissage
    /// n'est introduite, c'est le mécanisme existant qui sert.
    ///
    /// La sémantique (jamais écraser un brouillon utilisateur) vit dans
    /// `DraftStore.stageShortcutDraft` — partagée avec la voie in-app
    /// (`Router.handleConversationDeepLink`) pour que les deux entrées
    /// déposent EXACTEMENT pareil.
    private func stageDraft(_ text: String?, for conversationId: String) {
        drafts.stageShortcutDraft(text, for: conversationId)
    }

    // MARK: - Consume

    @discardableResult
    func consumePendingDeepLink() -> DeepLink? {
        let link = pendingDeepLink
        pendingDeepLink = nil
        return link
    }
}
