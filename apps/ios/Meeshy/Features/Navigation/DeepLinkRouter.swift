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
    /// `/auth/verify-email?token=…&email=…` — le lien de l'e-mail « code +
    /// lien » : il vérifie l'adresse et ouvre la session.
    case emailVerificationLink(token: String, email: String)
    /// `/reset-password?via=email#token=…` — le lien de « Mot de passe
    /// oublié ». Pas un lieu de l'app : il présente « Nouveau mot de
    /// passe », connecté ou non, et rien n'attend la connexion.
    case passwordResetLink(token: String)
    case share(text: String?, url: String?)
    case userLinks
    case postDetail(postId: String)
    case storyDetail(postId: String)
    /// Un réel NOMMÉ (`/reel/<id>`, `/reels?seed=<id>`, `meeshy://reel/<id>`) :
    /// il s'ouvre dans le lecteur de réels, comme depuis le fil.
    case reel(postId: String)
    /// Une communauté (`/communities/<id>`, `meeshy://community/<id>`).
    case community(id: String)
    /// `meeshy://conversations/recent` — widget et App Shortcut.
    case recentConversation
    /// `meeshy://conversations/unread` — widgets « Non lus ».
    case unreadConversations
    case hashtag(tag: String)
    /// Lien d'invitation — `/signup/affiliate/<code>` (le lien que la
    /// passerelle grave) ou `/signup?ref=<code>` : un CODE à mémoriser jusqu'à
    /// l'inscription, pas un lieu de l'app.
    case referral(code: String)
    case call(conversationId: String, isVideo: Bool)
    /// Une saison ou une semaine de ligue — `/me/progression/saison/{n}`, `/me/progression/ligue/{lundi}`.
    case game(GameLink)
    /// `meeshy://settings/packs?domaine=<domaine>` : la vitrine unique, filtrée.
    /// `pack=<slug>` met CE pack en avant dans la vitrine — même paramètre que le web.
    case packShop(domain: PackDomain?, pack: String? = nil)
    case external(URL)
}

// MARK: - Deep Link Parser (static utility for URL parsing)

enum DeepLinkParser {

    private static let meeshyHosts: Set<String> = ["meeshy.me", "www.meeshy.me", "app.meeshy.me"]

    /// Un hôte Meeshy : ceux de la production, plus l'hôte web de
    /// l'environnement SÉLECTIONNÉ (`staging.meeshy.me` sur staging) — la
    /// recette voit ce que la production verra. Égalité EXACTE : un
    /// hôte qui ne fait que commencer ou finir comme celui-ci reste étranger.
    static func isMeeshyHost(_ host: String, environmentWebOrigin: String) -> Bool {
        let host = host.lowercased()
        if meeshyHosts.contains(host) { return true }
        guard let environmentHost = URL(string: environmentWebOrigin)?.host?.lowercased() else { return false }
        return host == environmentHost || host == "www.\(environmentHost)"
    }

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

    /// Un lien d'e-mail porte son secret dans le FRAGMENT
    /// (`…?via=email#token=…&email=…`) : le navigateur ne l'envoie jamais au
    /// serveur, aucun journal d'accès ne le garde. Le fragment prime ; la
    /// requête reste lue pour les e-mails partis avant, jusqu'à leur expiration.
    static func linkSecret(_ name: String, in url: URL) -> String? {
        let raw = url.fragment.flatMap { fragment -> String? in
            var carrier = URLComponents()
            carrier.percentEncodedQuery = fragment
            return carrier.queryItems?.first(where: { $0.name == name })?.value
        }
        let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines)
        return (trimmed?.isEmpty == false) ? trimmed : queryValue(name, in: url)
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
    /// - `/auth/magic-link?token=...`            -> passwordless auth (https ONLY)
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
    ///
    /// Never under `meeshy://`: a link that CONNECTS
    /// (magic-link, verify-email) or resets a password. Any page or app opens
    /// that scheme, and would hand the app a third party's token.
    ///
    /// Everything else -> `.external` (caller opens in Safari).
    static func parse(_ url: URL, environmentWebOrigin: String = MeeshyConfig.shared.webOrigin) -> DeepLinkDestination {
        if url.scheme?.lowercased() == "meeshy" {
            return parseCustomScheme(url)
        }

        if let host = url.host, isMeeshyHost(host, environmentWebOrigin: environmentWebOrigin) {
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

    // Un chemin meeshy.me inconnu (ex. /settings) part dans Safari. Un chemin
    // de lien à jeton d'e-mail ne se lit QUE sur sa forme exacte :
    // toute variante part, elle aussi, dans Safari.
    private static func parseMeeshyWeb(_ url: URL) -> DeepLinkDestination {
        if EmailLinkSecret.carriesSecret(url) {
            return emailLink(url) ?? .external(url)
        }
        return destination(for: segments(of: url), url: url, customScheme: false) ?? .external(url)
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

    /// `/auth/magic-link?token=…` ou `/auth/magic-link/<token>` ;
    /// `/auth/verify-email?token=…&email=…` ; `/reset-password` et
    /// `/auth/reset-password` ; les alias `/auth/email-link/…`
    /// — et le secret dans le fragment (`?via=email#token=…`).
    /// La forme se juge par `EmailLinkSecret.exactForm` ; un jeton ou
    /// une adresse vide n'ouvre rien.
    ///
    /// Jamais par `meeshy://` : n'importe quelle page ou app ouvre ce
    /// schéma, et y présenterait le jeton d'un TIERS. Seul le lien universel
    /// https, que l'AASA réserve à notre domaine, porte un lien d'e-mail.
    private static func emailLink(_ url: URL) -> DeepLinkDestination? {
        switch EmailLinkSecret.exactForm(url) {
        case .magicLink(let pathToken)?:
            return (pathToken ?? linkSecret("token", in: url)).map { .magicLink(token: $0) }
        case .verifyEmail?:
            guard let token = linkSecret("token", in: url),
                  let email = linkSecret("email", in: url) else { return nil }
            return .emailVerificationLink(token: token, email: email)
        case .resetPassword?:
            return linkSecret("token", in: url).map { .passwordResetLink(token: $0) }
        case nil:
            return nil
        }
    }

    /// **La seule table des formes de lien Meeshy**, pour le web et le
    /// schéma `meeshy://`. Les surfaces propres aux widgets et aux App
    /// Shortcuts (`contact`, `quickreply`, `send`, `conversations`) ne sont
    /// lues que sous `meeshy://` — l'AASA ne les revendique pas sur le web.
    private static func destination(for components: [String], url: URL,
                                     customScheme: Bool) -> DeepLinkDestination? {
        guard let head = components.first else { return nil }
        let id = identifier(components, 1)
        switch head {
        // `/me/progression/saison|ligue[/…]` est le Jeu ; le reste de `/me` reste le profil.
        case "me": return GameLinkParser.link(from: components).map { .game($0) } ?? .ownProfile
        case "links": return .userLinks
        case "share": return parseShareQuery(url)
        // Les liens d'e-mail ne passent pas par cette table (`emailLink`).
        case "signup": return referralCode(components: components, url: url).map { .referral(code: $0) }
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
        // partage de réel ; `/reels?seed=<id>`, la porte du Flux web.
        case "reel": return id.map { .reel(postId: $0) }
        case "reels": return reelsSeed(components: components, url: url).map { .reel(postId: $0) }
        // Communauté — `/communities/<id>` ; `/communities/new` est l'écran de
        // création du web, pas une communauté.
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
        // Widgets « Non lus » / « Récentes » et App Shortcut.
        case "conversations" where customScheme: return id.flatMap(conversationListEntry)
        // La vitrine unique, filtrée par domaine.
        case "settings" where customScheme && components.count == 2 && components[1] == "packs":
            return .packShop(domain: PackDomain(queryValue: queryValue("domaine", in: url)),
                             pack: PackFocusSlug.normalized(queryValue("pack", in: url)))
        case "call" where customScheme && components.count == 1:
            return queryValue("contactId", in: url).map { .call(conversationId: $0, isVideo: queryValue("type", in: url) == "video") }
        default: break
        }
        // Post (`post`, `p`), story (`story`, `stories`, `s`), profil (`u`, `users`).
        if isPostSegment(head) { return id.map { .postDetail(postId: $0) } }
        if isStorySegment(head) { return id.map { .storyDetail(postId: $0) } }
        if isUserSegment(head) { return id.map { .userProfile(username: $0) } }
        return nil
    }

    /// Les clés d'adresse qui portent un code d'invitation, dans l'ordre du web
    /// (`REFERRAL_SEARCH_KEYS`, `apps/web/src/lib/view/referral-code.ts`).
    static let referralQueryKeys = ["ref", "parrain", "affiliate"]

    /// Le code d'un lien d'invitation : `/signup/affiliate/<code>`, ou
    /// `/signup?ref=<code>`. `nil` sans code bien formé (`ReferralCode`).
    static func referralCode(components: [String], url: URL) -> String? {
        switch components.count {
        case 3 where components[1] == "affiliate":
            return ReferralCode.normalized(components[2])
        case 1:
            let raw = referralQueryKeys.lazy.compactMap { queryValue($0, in: url) }.first
            return raw.flatMap(ReferralCode.normalized)
        default:
            return nil
        }
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
    case emailVerificationLink(token: String, email: String)
    case conversation(id: String)
    case postDetail(postId: String)
    case storyDetail(postId: String)
    /// Un réel nommé — ouvert par `ReelDoor` dans le lecteur de réels.
    case reel(postId: String)
    case community(id: String)
    case recentConversation
    case unreadConversations
    case userProfile(username: String)
    case ownProfile
    case userLinks
    case hashtag(tag: String)
    /// Une saison ou une semaine de ligue, ouverte par `Router.openGame(at:)`.
    case game(GameLink)
    /// La vitrine unique des packs, filtrée par domaine.
    case packShop(domain: PackDomain?, pack: String? = nil)
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
    /// `meeshy://call?contactId=…&type=…` : une DEMANDE d'appel, que la racine
    /// présente en confirmation. Le lien ne compose jamais lui-même.
    case callRequest(conversationId: String, isVideo: Bool)

    /// **Reçu sans compte, ce lien attend-il la connexion ?**
    ///
    /// Un lien de CONTENU survit à la connexion : `pendingDeepLink` n'est pas
    /// consommé tant que la personne n'a pas de session, et la racine le reprend
    /// à son montage. L'écran de connexion le dit. Une invitation et un lien
    /// magique s'ouvrent SANS compte, un lien externe part dans Safari, et un
    /// lien non résolu n'a rien à promettre.
    var opensAfterSignIn: Bool {
        switch self {
        case .joinLink, .chatLink, .magicLink, .emailVerificationLink, .externalLink, .unresolvedTrackedLink, .callRequest:
            return false
        case .trackedLink, .conversation, .postDetail, .storyDetail, .reel, .community,
             .recentConversation, .unreadConversations, .userProfile, .ownProfile, .userLinks, .hashtag, .game, .packShop:
            return true
        }
    }
}

/// Une destination ET le `/l/<jeton>` qui l'a produite.
struct TrackedLinkOrigin: Equatable {
    let token: String
    let link: DeepLink
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

    /// « Entrer dans World Wide » choisi sur l'écran de connexion.
    ///
    /// L'entrée SERVIE par `GET /world` voyage avec le choix : la session
    /// invitée (portée par `MeeshyApp`) s'ouvre sur la clé qu'elle nomme, sans
    /// relire le réseau ni écrire d'identifiant en dur.
    @Published var requestedWorldEntry: WorldEntry?

    /// Le `/l/<jeton>` d'où vient la destination en attente. La
    /// résolution remplace le jeton par sa cible typée ; sans cette trace, un
    /// visiteur sans compte ne pourrait plus apprendre QUI lui a partagé le
    /// contenu. Il ne vaut que pour la destination qu'il a produite : un lien
    /// ouvert ensuite, autrement, ne le reprend pas.
    private(set) var trackedLinkOrigin: TrackedLinkOrigin?

    /// Le jeton (`via`) du lien suivi qui a produit `link`, ou `nil` quand
    /// `link` n'en vient pas.
    func via(for link: DeepLink) -> String? {
        guard let origin = trackedLinkOrigin, origin.link == link else { return nil }
        return origin.token
    }

    /// L'écran de compte que la page d'invitation a demandé, SANS compte :
    /// « Se connecter » ou « Créer un compte ». `LoginView` le
    /// consomme — l'inscription s'y ouvre par sa propre feuille.
    @Published var requestedAccountEntry: InviteLandingChoice?

    /// Le lien sur lequel la personne a choisi de se connecter ou de créer un
    /// compte. Il est REJOUÉ une fois le compte présent : la même page
    /// d'invitation revient, cette fois avec « Rejoindre avec mon compte ».
    /// Sans lui, se connecter depuis une invitation la faisait oublier.
    private(set) var shareLinkAwaitingAccount: String?

    func requestAccount(_ entry: InviteLandingChoice, forShareLink identifier: String) {
        shareLinkAwaitingAccount = identifier
        requestedAccountEntry = entry
    }

    /// À l'arrivée du compte : le lien en attente redevient une destination.
    func replayShareLinkAwaitingAccount() {
        guard let identifier = shareLinkAwaitingAccount else { return }
        shareLinkAwaitingAccount = nil
        pendingDeepLink = .chatLink(identifier: identifier)
    }

    /// Brouillons par conversation. Injecté pour que le dépôt du texte d'un
    /// raccourci (widget « Réponse rapide », App Shortcut « Send Message »)
    /// soit observable en test sans toucher aux `UserDefaults` du simulateur.
    private let drafts: DraftStore
    /// Le code d'invitation mémorisé jusqu'à l'inscription.
    private let referrals: PendingReferralStoreProviding
    private let isAuthenticated: @MainActor () -> Bool
    private let hasResolvedSession: @MainActor () -> Bool
    /// La porte qui amène un contenu en détail le MARQUE de son
    /// entrée : lien de suivi, lien `?via=`, lien venu d'ailleurs, ou rien.
    private let entries: DetailOpenSourceProviding
    /// « Nouveau mot de passe », présenté à la racine de l'app.
    private let passwordReset: PasswordResetLinkPresenter

    init(
        drafts: DraftStore = .shared,
        referrals: PendingReferralStoreProviding = PendingReferralStore.shared,
        isAuthenticated: @escaping @MainActor () -> Bool = { AuthManager.shared.isAuthenticated },
        hasResolvedSession: @escaping @MainActor () -> Bool = { AuthManager.shared.hasResolvedStoredSession },
        entries: DetailOpenSourceProviding = DetailOpenSources.shared,
        passwordReset: PasswordResetLinkPresenter = .shared
    ) {
        self.entries = entries
        self.passwordReset = passwordReset
        self.drafts = drafts
        self.referrals = referrals
        self.isAuthenticated = isAuthenticated
        self.hasResolvedSession = hasResolvedSession
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
            // Un lien court d'INVITATION : son adresse d'origine est un
            // `/signup/affiliate/<code>`, qui n'est pas une destination mais un
            // code à retenir — exactement ce que fait le lien direct. Sans cette
            // voie, il tomberait dans « Ce lien n'a pas pu être ouvert ».
            if let code = Self.trackedReferralCode(for: resolved) {
                self.trackedLinkOrigin = nil
                _ = self.captureReferral(code)
                return
            }
            let destination = Self.trackedDestination(for: resolved, token: token)
            if let contentId = Self.contentId(of: destination) {
                self.entries.mark(contentId, entry: .trackingLink)
            }
            self.trackedLinkOrigin = TrackedLinkOrigin(token: token, link: destination)
            self.pendingDeepLink = destination
        }
    }

    /// Le code d'invitation qu'un lien de suivi transporte, quand son adresse
    /// d'origine est un lien d'invitation Meeshy (`/signup/affiliate/<code>`,
    /// `/signup?ref=<code>`). `nil` pour tout autre lien. Une cible typée
    /// (story, réel, post, profil, conversation) prime : elle n'est jamais une
    /// invitation, quelle que soit son adresse.
    static func trackedReferralCode(for resolved: ResolvedTrackedLink?) -> String? {
        guard let resolved else { return nil }
        let kind = (resolved.kind ?? "").lowercased()
        let type = (resolved.targetType ?? "").uppercased()
        guard kind != "conversation", type != "CONVERSATION" else { return nil }
        if let targetId = resolved.targetId, !targetId.isEmpty,
           ["STORY", "PROFILE", "REEL", "POST", "STATUS"].contains(type) { return nil }
        guard let url = resolved.originalUrl.flatMap(URL.init(string:)),
              case .referral(let code) = DeepLinkParser.parse(url) else { return nil }
        return code
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
    ///
    /// Jamais un lien qui CONNECTE ou réinitialise : la cible d'un lien
    /// suivi est choisie par son créateur, qui y mettrait son propre jeton.
    static func destination(forOriginalURL url: URL) -> DeepLink? {
        switch DeepLinkParser.parse(url) {
        case .magicLink, .emailVerificationLink, .passwordResetLink:
            return nil
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
        case .game(let link):             return .game(link)
        case .packShop(let domain, let pack): return .packShop(domain: domain, pack: pack)
        case .joinLink(let identifier):   return .joinLink(identifier: identifier)
        case .chatLink(let identifier):   return .chatLink(identifier: identifier)
        case .magicLink(let token):       return .magicLink(token: token)
        case .emailVerificationLink(let token, let email): return .emailVerificationLink(token: token, email: email)
        case .trackedLink, .share, .referral, .call, .passwordResetLink, .external: return nil
        }
    }

    // MARK: - Lancement système (lien universel, schéma meeshy://)

    /// **Traduit, n'analyse pas.** L'analyse est celle de
    /// `DeepLinkParser.parse`, la même que le tap in-app : deux `switch` recopiés
    /// feraient diverger les portes au premier format oublié dans l'un d'eux.
    /// Ne restent ici que les trois gestes propres au lancement système :
    /// résoudre un `/l/<token>`, déposer le brouillon d'un raccourci, et ne pas
    /// revendiquer ce qui n'est pas une destination (`/share`, le web externe).
    func handle(url: URL) -> Bool {
        let parsed = DeepLinkParser.parse(url)
        if case .trackedLink = parsed {} else { trackedLinkOrigin = nil }
        switch parsed {
        case .trackedLink(let token):
            resolveTrackedLink(token)
            return true
        case .conversation(let id, let draftText):
            stageDraft(draftText, for: id)
            pendingDeepLink = .conversation(id: id)
            return true
        case .referral(let code):
            return captureReferral(code)
        case .call(let conversationId, let isVideo):
            // Le lien ne compose JAMAIS : il dépose une demande que la racine
            // (fenêtre principale, session ouverte) présente en confirmation.
            // Sans session, il ouvre l'app sur la connexion et ne garde rien.
            if CallDialReadinessSnapshot.mayQueueDial(
                sessionResolved: hasResolvedSession(),
                authenticated: isAuthenticated()
            ) {
                pendingDeepLink = .callRequest(conversationId: conversationId, isVideo: isVideo)
            }
            return true
        case .passwordResetLink(let token):
            passwordReset.present(token: token)
            return true
        case .share, .external:
            return false
        case let destination:
            guard let link = Self.link(for: destination) else { return false }
            if let contentId = Self.contentId(of: link) {
                entries.mark(contentId, entry: Self.entry(forLaunchURL: url))
            }
            pendingDeepLink = link
            return true
        }
    }

    /// Le contenu qu'un lien amène sur un écran détail (post, story, réel).
    static func contentId(of link: DeepLink) -> String? {
        switch link {
        case .postDetail(let id), .storyDetail(let id), .reel(let id): return id
        default: return nil
        }
    }

    /// L'entrée d'un contenu ouvert par le système : un lien de partage
    /// Meeshy porte `?via=` ; un lien web sans marque vient d'ailleurs ; le
    /// schéma `meeshy://` (widget, raccourci) n'a pas de référent.
    static func entry(forLaunchURL url: URL) -> ContentEntry {
        if DeepLinkParser.queryValue("via", in: url) != nil { return .sharedLink }
        let scheme = url.scheme?.lowercased()
        return scheme == "https" || scheme == "http" ? .external : .direct
    }

    /// Sans compte, l'invitation MÉMORISE son code et ouvre l'inscription, qui
    /// le fera voyager (`affiliateToken`). Un compte déjà connecté ne se
    /// rattache à personne : rien ne change, et le lien n'est pas revendiqué.
    private func captureReferral(_ code: String) -> Bool {
        guard !isAuthenticated() else { return false }
        referrals.remember(code)
        requestedAccountEntry = .signUp
        return true
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

    /// L'écran de connexion est affiché : une demande d'appel en attente est
    /// oubliée — se connecter ne relance rien.
    func discardPendingCallRequest() {
        if case .callRequest = pendingDeepLink { pendingDeepLink = nil }
    }

    @discardableResult
    func consumePendingDeepLink() -> DeepLink? {
        let link = pendingDeepLink
        pendingDeepLink = nil
        return link
    }
}
