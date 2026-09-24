import Foundation
import Combine
import UIKit
import MeeshySDK

// MARK: - Deep Link Destination (used by RootView openURL handler)

enum DeepLinkDestination: Equatable {
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
    /// Un réel NOMMÉ (`/reel/<id>`, `/reels?seed=<id>`, `meeshy://reel/<id>`) :
    /// il s'ouvre dans le lecteur de réels, comme depuis le fil (#7805).
    case reel(postId: String)
    /// Une communauté (`/communities/<id>`, `meeshy://community/<id>`) (#7811).
    case community(id: String)
    /// `meeshy://conversations/recent` — widget et App Shortcut (#7811).
    case recentConversation
    /// `meeshy://conversations/unread` — widgets « Non lus » (#7811).
    case unreadConversations
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
        if url.scheme?.lowercased() == "meeshy" {
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

    // meeshy://me -> host="me", path="" ; meeshy://u/atabeth -> host="u",
    // path="/atabeth". Le host est normalisé en minuscules : `meeshy://Join/X`
    // (majuscule posée par un clavier) route comme `meeshy://join/X`.
    private static func parseCustomScheme(_ url: URL) -> DeepLinkDestination {
        let host = (url.host ?? "").lowercased()
        let path = segments(of: url)
        let components = host.isEmpty ? path : [host] + path
        return destination(for: components, url: url, customScheme: true) ?? .external(url)
    }

    // Un chemin meeshy.me inconnu (ex. /settings) part dans Safari.
    private static func parseMeeshyWeb(_ url: URL) -> DeepLinkDestination {
        destination(for: segments(of: url), url: url, customScheme: false) ?? .external(url)
    }

    /// Segments de chemin sans vide ni `/` : `//join/X` et `/./join/X` ont la
    /// forme de `/join/X`.
    private static func segments(of url: URL) -> [String] {
        url.pathComponents.filter { !$0.isEmpty && $0 != "/" }
    }

    /// Le segment `index`, s'il nomme quelque chose. Un identifiant vide ou
    /// blanc (`/join/%20`, `/c//`) n'ouvre RIEN : il échouerait côté serveur en
    /// 404 opaque, et le refuser tôt laisse le système rendre le lien à Safari.
    private static func identifier(_ components: [String], _ index: Int) -> String? {
        guard components.indices.contains(index) else { return nil }
        let trimmed = components[index].trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    /// **La seule table des formes de lien Meeshy** (#7815), pour le web et le
    /// schéma `meeshy://`. Les surfaces propres aux widgets et aux App
    /// Shortcuts (`contact`, `quickreply`, `send`, `conversations`) ne sont
    /// lues que sous `meeshy://` — l'AASA ne les revendique pas sur le web.
    private static func destination(for components: [String], url: URL,
                                     customScheme: Bool) -> DeepLinkDestination? {
        guard let head = components.first else { return nil }
        let id = identifier(components, 1)
        switch head {
        case "me": return .ownProfile
        case "links": return .userLinks
        case "share": return parseShareQuery(url)
        case "auth":
            // `/auth/magic-link?token=…` ou `/auth/magic-link/<token>`.
            guard id == "magic-link",
                  let token = identifier(components, 2) ?? queryValue("token", in: url) else { return nil }
            return .magicLink(token: token)
        case "hashtag": return id.map { .hashtag(tag: $0) }
        // Invitation de conversation — `/join/<id>` (canonique).
        case "join": return id.map { .joinLink(identifier: $0) }
        // Lien de suivi — `/l/<token>` (post, réel, story, invitation), résolu
        // en asynchrone par `targetType`, jamais présumé être une jointure.
        case "l": return id.map { .trackedLink(token: $0) }
        // Lien de discussion partagé — `/chat/<id>`.
        case "chat": return id.map { .chatLink(identifier: $0) }
        case "c", "conversation": return id.map { .conversation(id: $0, draftText: nil) }
        // Réel — `/reel/<id>`, l'adresse que la passerelle grave dans chaque
        // partage de réel ; `/reels?seed=<id>`, la porte du Flux web (#7805).
        case "reel": return id.map { .reel(postId: $0) }
        case "reels": return reelsSeed(components: components, url: url).map { .reel(postId: $0) }
        // Communauté — `/communities/<id>` ; `/communities/new` est l'écran de
        // création du web, pas une communauté (#7811).
        case "community", "communities": return id.flatMap(communityIdentifier).map { .community(id: $0) }
        // `/feeds/post/<id>` — l'URL de partage canonique d'un post ;
        // `/feeds/p/<id>` en est l'alias court.
        case "feeds":
            guard let keyword = id, isPostSegment(keyword) else { return nil }
            return identifier(components, 2).map { .postDetail(postId: $0) }
        // Ligne du widget Favoris : l'identifiant est celui d'une CONVERSATION
        // (`WidgetDataManager.publishFavoriteContacts` écrit `conv.id`).
        case "contact" where customScheme: return id.map { .conversation(id: $0, draftText: nil) }
        // Widget Réponse rapide : le texte voyage dans la destination, pour être
        // DÉPOSÉ en brouillon — jamais envoyé sans confirmation.
        case "quickreply" where customScheme:
            return id.map { .conversation(id: $0, draftText: queryValue("text", in: url)) }
        // App Shortcut « Send Message » : `contactId` est un identifiant de
        // conversation (même clé App Group que le widget), `message` la dictée.
        case "send" where customScheme:
            return queryValue("contactId", in: url).map { .conversation(id: $0, draftText: queryValue("message", in: url)) }
        // Widgets « Non lus » / « Récentes » et App Shortcut (#7811).
        case "conversations" where customScheme: return id.flatMap(conversationListEntry)
        default: break
        }
        // Post (`post`, `p`), story (`story`, `stories`, `s`), profil (`u`, `users`).
        if isPostSegment(head) { return id.map { .postDetail(postId: $0) } }
        if isStorySegment(head) { return id.map { .storyDetail(postId: $0) } }
        if isUserSegment(head) { return id.map { .userProfile(username: $0) } }
        return nil
    }

    /// Un identifiant de communauté, jamais le segment réservé `new` (création).
    static func communityIdentifier(_ segment: String) -> String? {
        let id = segment.trimmingCharacters(in: .whitespacesAndNewlines)
        return id.isEmpty || id == "new" ? nil : id
    }

    /// `recent` / `unread` sous `meeshy://conversations/`.
    static func conversationListEntry(_ segment: String) -> DeepLinkDestination? {
        switch segment {
        case "recent": return .recentConversation
        case "unread": return .unreadConversations
        default: return nil
        }
    }

    /// `/reels?seed=<id>` — `nil` sans graine non vide : la liste nue des réels
    /// n'est pas une destination nommée.
    static func reelsSeed(components: [String], url: URL) -> String? {
        guard components == ["reels"],
              let seed = queryValue("seed", in: url)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !seed.isEmpty else { return nil }
        return seed
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
    /// Un réel nommé — ouvert par `ReelDoor` dans le lecteur de réels (#7805).
    case reel(postId: String)
    case community(id: String)
    case recentConversation
    case unreadConversations
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

    /// **Reçu sans compte, ce lien attend-il la connexion ?** (#7811)
    ///
    /// Un lien de CONTENU survit à la connexion : `pendingDeepLink` n'est pas
    /// consommé tant que la personne n'a pas de session, et la racine le reprend
    /// à son montage. L'écran de connexion le dit. Une invitation et un lien
    /// magique s'ouvrent SANS compte, un lien externe part dans Safari, et un
    /// lien non résolu n'a rien à promettre.
    var opensAfterSignIn: Bool {
        switch self {
        case .joinLink, .chatLink, .magicLink, .externalLink, .unresolvedTrackedLink:
            return false
        case .trackedLink, .conversation, .postDetail, .storyDetail, .reel, .community,
             .recentConversation, .unreadConversations, .userProfile, .ownProfile, .userLinks, .hashtag:
            return true
        }
    }
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
            case "REEL": return .reel(postId: targetId)
            case "POST", "STATUS": return .postDetail(postId: targetId)
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
        case .external(let target):
            // Seul le web s'ouvre. Un `javascript:` ou un schéma inconnu remonté
            // par un lien de suivi ne doit jamais être passé à `UIApplication`.
            guard let scheme = target.scheme?.lowercased(),
                  scheme == "http" || scheme == "https" else { return nil }
            return .externalLink(url: target)
        case let destination:
            return link(for: destination)
        }
    }

    /// **La seule traduction destination analysée → lien à ouvrir.** `nil` pour
    /// ce qui ne s'ouvre pas tel quel : un `/l/<token>` (il se résout d'abord —
    /// depuis une `originalUrl`, le re-résoudre ferait une boucle), un partage
    /// brut, un lien externe (chaque appelant décide s'il l'ouvre).
    static func link(for destination: DeepLinkDestination) -> DeepLink? {
        switch destination {
        case .storyDetail(let id):        return .storyDetail(postId: id)
        case .reel(let id):               return .reel(postId: id)
        case .community(let id):          return .community(id: id)
        case .recentConversation:         return .recentConversation
        case .unreadConversations:        return .unreadConversations
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
        case .trackedLink, .share, .external: return nil
        }
    }

    // MARK: - Lancement système (lien universel, schéma meeshy://)

    /// **Traduit, n'analyse pas** (#7815). L'analyse est celle de
    /// `DeepLinkParser.parse`, la même que le tap in-app : deux `switch` recopiés
    /// faisaient diverger les portes au premier format oublié dans l'un d'eux.
    /// Ne restent ici que les trois gestes propres au lancement système :
    /// résoudre un `/l/<token>`, déposer le brouillon d'un raccourci, et ne pas
    /// revendiquer ce qui n'est pas une destination (`/share`, le web externe).
    func handle(url: URL) -> Bool {
        switch DeepLinkParser.parse(url) {
        case .trackedLink(let token):
            resolveTrackedLink(token)
            return true
        case .conversation(let id, let draftText):
            stageDraft(draftText, for: id)
            pendingDeepLink = .conversation(id: id)
            return true
        case .share, .external:
            return false
        case let destination:
            guard let link = Self.link(for: destination) else { return false }
            pendingDeepLink = link
            return true
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
