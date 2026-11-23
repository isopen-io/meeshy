import Foundation
import MeeshySDK

/// Ce que la carte d'un lien de contenu a appris (#19332).
nonisolated enum ContentCardResolution: Equatable, Sendable {
    /// Le contenu, tel que CE lecteur a le droit de le lire.
    case card(ContentCard)
    /// Supprimé, expiré, hors audience ou inconnu (404, 403) — indistinguables,
    /// et c'est voulu. Le type, quand le lien l'annonçait, choisit l'icône.
    case unavailable(PostType?)
    /// Un lien suivi qui ne désigne pas un contenu : le comportement existant
    /// du lien s'applique, inchangé.
    case notContent
    /// Réseau ou serveur : rien n'est appris.
    case failed
}

/// La carte d'un lien de contenu, servie CACHE D'ABORD (#19332).
///
/// La lecture du cache est SYNCHRONE : une bulle qui défile rend une carte déjà
/// vue dès sa première image, sans squelette ni saut de hauteur.
@MainActor
protocol ContentCardStoreProviding: AnyObject {
    /// Ce que l'appareil sait déjà — jamais d'appel réseau.
    func cached(_ target: ContentLinkTarget) -> CacheResult<ContentCardResolution>
    /// Relit la carte (le jeton d'abord, s'il le faut) et la met en mémoire.
    func refresh(_ target: ContentLinkTarget) async -> ContentCardResolution
}

/// La mémoire des cartes de contenu : par lecteur, puis par post — fraîche une
/// minute, périmée jusqu'à un jour, comme la carte de conversation. Un jeton
/// résolu se mémorise aussi : il ne change jamais de cible. Un post que l'app
/// tient déjà (stories, post ouvert par une notification) amorce la carte.
///
/// Les clés portent le LECTEUR : la carte résolue sous l'audience d'un compte
/// ne se sert jamais à un autre compte du même appareil.
@MainActor
final class ContentCardStore: ContentCardStoreProviding {
    nonisolated deinit {}

    static let shared = ContentCardStore()

    /// Une carte vue il y a moins d'une minute ne se relit pas.
    static let freshInterval: TimeInterval = 60
    /// Au-delà d'un jour, une carte ne s'affiche plus sans être relue.
    static let staleInterval: TimeInterval = 24 * 60 * 60
    /// La mémoire est bornée : au-delà, la plus ancienne entrée s'en va.
    static let capacity = 200

    private struct Entry {
        let resolution: ContentCardResolution
        let storedAt: Date
    }

    private enum TokenVerdict {
        case content(ContentPathTarget)
        case notContent
    }

    private let posts: PostServiceProviding
    private let stories: StoryServiceProviding
    private let links: TrackedLinkResolving
    private let languages: LanguageProviding
    private let viewerId: @MainActor () -> String?
    private let now: @Sendable () -> Date
    private var entries: [String: Entry] = [:]
    private var tokens: [String: TokenVerdict] = [:]

    init(
        posts: PostServiceProviding = PostService.shared,
        stories: StoryServiceProviding = StoryService.shared,
        links: TrackedLinkResolving = TrackedLinkService.shared,
        languages: LanguageProviding = AuthManagerLanguageProvider(),
        viewerId: @escaping @MainActor () -> String? = { AuthManager.shared.currentUser?.id },
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.posts = posts
        self.stories = stories
        self.links = links
        self.languages = languages
        self.viewerId = viewerId
        self.now = now
    }

    // MARK: - Cache

    func cached(_ target: ContentLinkTarget) -> CacheResult<ContentCardResolution> {
        switch target {
        case .content(let path):
            return cached(path)
        case .tracked(let token):
            switch tokens[key(token)] {
            case .content(let path)?: return cached(path)
            case .notContent?: return .fresh(.notContent, age: 0)
            case nil: return .empty
            }
        }
    }

    private func cached(_ path: ContentPathTarget) -> CacheResult<ContentCardResolution> {
        guard let entry = entries[key(path.postId)] else { return seeded(path) }
        let age = now().timeIntervalSince(entry.storedAt)
        if age < Self.freshInterval { return .fresh(entry.resolution, age: age) }
        // Un « indisponible » ne se sert jamais périmé : le contenu a pu revenir.
        guard case .card = entry.resolution, age < Self.staleInterval else { return .expired }
        return .stale(entry.resolution, age: age)
    }

    /// Un post déjà tenu par l'app se montre avant toute lecture — périmé,
    /// donc relu en silence.
    private func seeded(_ path: ContentPathTarget) -> CacheResult<ContentCardResolution> {
        guard let post = stories.cachedPost(id: path.postId) else { return .empty }
        return .stale(.card(card(of: post, announced: path.type)), age: Self.freshInterval)
    }

    // MARK: - Lecture

    func refresh(_ target: ContentLinkTarget) async -> ContentCardResolution {
        switch target {
        case .content(let path):
            return await refresh(path)
        case .tracked(let token):
            switch await verdict(for: token) {
            case .content(let path)?: return await refresh(path)
            case .notContent?: return .notContent
            case nil: return .failed
            }
        }
    }

    private func refresh(_ path: ContentPathTarget) async -> ContentCardResolution {
        let postKey = key(path.postId)
        do {
            let post = try await posts.getPost(postId: path.postId)
            return store(.card(card(of: post, announced: path.type)), at: postKey)
        } catch {
            guard ContentFetchFailure.classify(error).isAbsence else { return .failed }
            return store(.unavailable(path.type), at: postKey)
        }
    }

    /// `nil` : la résolution n'a rien appris (réseau). Un jeton inconnu du
    /// serveur n'est pas un contenu.
    private func verdict(for token: String) async -> TokenVerdict? {
        let tokenKey = key(token)
        if let known = tokens[tokenKey] { return known }
        do {
            let resolved = try await links.resolve(token: token)
            let verdict = ContentLinkTarget.trackedContent(of: resolved).map(TokenVerdict.content) ?? .notContent
            remember(verdict, at: tokenKey)
            return verdict
        } catch {
            return ContentFetchFailure.classify(error).isAbsence ? .notContent : nil
        }
    }

    private func card(of post: APIPost, announced: PostType?) -> ContentCard {
        ContentCard(post: post, preferredLanguages: languages.preferredLanguages, announcedKind: announced)
    }

    // MARK: - Mémoire

    private func key(_ identifier: String) -> String {
        "\(viewerId() ?? "")|\(identifier)"
    }

    private func store(_ resolution: ContentCardResolution, at key: String) -> ContentCardResolution {
        entries[key] = Entry(resolution: resolution, storedAt: now())
        if entries.count > Self.capacity, let oldest = entries.min(by: { $0.value.storedAt < $1.value.storedAt })?.key {
            entries.removeValue(forKey: oldest)
        }
        return resolution
    }

    private func remember(_ verdict: TokenVerdict, at key: String) {
        tokens[key] = verdict
        if tokens.count > Self.capacity, let evicted = tokens.keys.first(where: { $0 != key }) {
            tokens.removeValue(forKey: evicted)
        }
    }
}
