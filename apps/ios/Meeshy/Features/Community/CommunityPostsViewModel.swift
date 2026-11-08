import Foundation
import Combine
import MeeshySDK

typealias CommunityPostsCache = any MutableCacheStore<String, FeedPost> & Sendable

/// Ce que l'onglet « Publications » dit quand il n'a rien à montrer.
/// `loading` n'existe que sur un cache vide : une liste déjà peinte ne
/// repasse jamais sous un indicateur.
enum CommunityPostsPhase: Equatable, Sendable {
    case idle
    case loading
    case loaded
    case failed
    case offline
}

/// **Les publications d'une communauté, dans son détail** (#16878).
///
/// L'onglet était un état vide FIXE : il ne lisait rien. Il lit désormais
/// `GET /posts/community/:id` (`PostService.getCommunityPosts`), que la
/// passerelle ne sert qu'à qui peut lire la communauté (#6379) — c'est la
/// même lecture que le web (`scope=community`).
///
/// Cache d'abord : la page en cache se peint aussitôt et se revalide en
/// silence ; la page reçue la REMPLACE (une publication retirée ailleurs
/// disparaît). Les gestes de la carte sont ceux du fil, optimistes, défaits à
/// l'échec par identifiant.
@MainActor
final class CommunityPostsViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au
    // démontage hors d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    static func cacheKey(communityId: String) -> String { "community:\(communityId)" }

    let communityId: String
    @Published private(set) var posts: [FeedPost] = []
    @Published private(set) var phase: CommunityPostsPhase = .idle
    @Published private(set) var hasMore = false
    @Published private(set) var isLoadingMore = false
    @Published private(set) var bookmarkInFlightIds: Set<String> = []

    /// La file des impressions de CE listing (#10483).
    let impressions: ReachImpressionRecording

    private let service: PostServiceProviding
    private let languageProvider: LanguageProviding
    private let cacheProvider: @MainActor () async -> CommunityPostsCache?
    private let reposter: ListedPostReposter
    private let bookmarker: PostBookmarkWriter
    private let sharer: ListedPostSharer
    private var nextCursor: String?
    /// Chaque première page ouvre une génération : une page suivante qui
    /// revient après ne se colle plus à la nouvelle liste.
    private var generation = 0
    private var isFetchingFirstPage = false

    init(
        communityId: String,
        service: PostServiceProviding = PostService.shared,
        languageProvider: LanguageProviding = AuthManagerLanguageProvider(),
        cacheProvider: @escaping @MainActor () async -> CommunityPostsCache? = { CacheCoordinator.shared.feed },
        impressions: ReachImpressionRecording? = nil,
        reposter: ListedPostReposter? = nil,
        bookmarker: PostBookmarkWriter? = nil
    ) {
        self.communityId = communityId
        self.service = service
        self.languageProvider = languageProvider
        self.cacheProvider = cacheProvider
        self.reposter = reposter ?? ListedPostReposter(publisher: RepostPublisher(postService: service))
        self.bookmarker = bookmarker ?? PostBookmarkWriter()
        self.sharer = ListedPostSharer(service: service)
        self.impressions = impressions ?? ImpressionBatcher(source: "feed", surface: .community, postService: service)
    }

    private var cacheKey: String { Self.cacheKey(communityId: communityId) }

    // MARK: - Lecture

    /// Peint le cache s'il en a, puis revalide (sauf cache frais).
    func load() async {
        if posts.isEmpty, let cache = await cacheProvider() {
            switch await cache.load(for: cacheKey) {
            case .fresh(let cached, _):
                posts = cached
                phase = .loaded
                return
            case .stale(let cached, _):
                posts = cached
                phase = .loaded
            case .expired:
                // Le disque au-delà du TTL vaut mieux qu'un écran vide hors
                // ligne : il se peint, et la page du réseau le remplace.
                if let last = await cache.loadIgnoringExpiry(for: cacheKey) {
                    posts = last.items
                    phase = .loaded
                }
            case .empty:
                break
            }
        }
        await fetchFirstPage()
    }

    /// Tirer pour rafraîchir, ou « Réessayer » : la liste ne se vide pas avant
    /// que le réseau ait répondu.
    func refresh() async {
        await fetchFirstPage()
    }

    func loadMore() async {
        guard hasMore, !isLoadingMore, !isFetchingFirstPage, let cursor = nextCursor else { return }
        let current = generation
        isLoadingMore = true
        defer { if current == generation { isLoadingMore = false } }
        do {
            let response = try await service.getCommunityPosts(communityId: communityId, cursor: cursor, limit: 20)
            guard current == generation else { return }
            let shown = Set(posts.map(\.id))
            let fresh = await converted(response.data).filter { !shown.contains($0.id) }
            guard current == generation else { return }
            posts.append(contentsOf: fresh)
            nextCursor = response.pagination?.nextCursor
            hasMore = response.pagination?.hasMore ?? false
        } catch {
            // Une page perdue n'est pas la fin de la liste : le prochain
            // défilement la redemande.
        }
    }

    private func fetchFirstPage() async {
        guard !isFetchingFirstPage else { return }
        generation += 1
        let current = generation
        isFetchingFirstPage = true
        defer { isFetchingFirstPage = false }
        if posts.isEmpty { phase = .loading }
        do {
            let response = try await service.getCommunityPosts(communityId: communityId, cursor: nil, limit: 20)
            let page = await converted(response.data)
            guard current == generation else { return }
            posts = page
            nextCursor = response.pagination?.nextCursor
            hasMore = response.pagination?.hasMore ?? false
            phase = .loaded
            await persist()
        } catch {
            guard current == generation, posts.isEmpty else { return }
            phase = ConversationMediaHubViewModel.isOffline(error) ? .offline : .failed
        }
    }

    /// Décodage hors du fil principal : `toFeedPost` résout médias, citations
    /// et traduction servie (Prisme), comme le fil.
    private func converted(_ payload: [APIPost]) async -> [FeedPost] {
        let preferred = languageProvider.preferredLanguages
        return await Task.detached(priority: .userInitiated) {
            payload.map { $0.toFeedPost(preferredLanguages: preferred) }
        }.value
    }

    /// Le SEUL site qui écrit cet onglet dans le cache.
    private func persist() async {
        guard let cache = await cacheProvider() else { return }
        let snapshot = Array(posts.prefix(100))
        let key = cacheKey
        await bestEffort("communityPostsViewModel.feed.save", category: .cache) {
            try await cache.save(snapshot, for: key)
        }
    }

    // MARK: - Impressions

    func position(of postId: String) -> Int? {
        posts.firstIndex { $0.id == postId }
    }

    func flushImpressions() async {
        await impressions.flushNow()
    }

    // MARK: - Gestes de la carte

    func toggleLike(_ postId: String) async {
        guard let index = posts.firstIndex(where: { $0.id == postId }) else { return }
        let snapshot = posts[index]
        let outcome = PostLikeMutation.toggled(isLiked: snapshot.isLiked, likes: snapshot.likes)
        posts[index].isLiked = outcome.isLiked
        posts[index].likes = outcome.likes
        do {
            if outcome.isLiked {
                try await service.like(postId: postId)
            } else {
                try await service.unlike(postId: postId)
            }
            await persist()
        } catch {
            if let current = posts.firstIndex(where: { $0.id == postId }) {
                posts[current] = snapshot
            }
            FeedbackToastManager.shared.showError(String(localized: "feed.like.error", defaultValue: "Impossible d'aimer la publication", bundle: .main))
        }
    }

    func toggleRepost(_ postId: String) async {
        guard let index = posts.firstIndex(where: { $0.id == postId }),
              let reposted = PostRepostMutation.reposted(posts[index]) else { return }
        let shown = posts[index]
        posts[index] = reposted
        if await reposter.repost(shown) {
            await persist()
            return
        }
        guard let current = posts.firstIndex(where: { $0.id == postId }) else { return }
        posts[current] = PostRepostMutation.withdrawn(posts[current])
    }

    func toggleBookmark(_ postId: String) async {
        guard !bookmarkInFlightIds.contains(postId),
              let index = posts.firstIndex(where: { $0.id == postId }) else { return }
        let wanted = !posts[index].isBookmarkedByMe
        posts[index] = PostBookmarkMutation.setting(posts[index], bookmarked: wanted)
        bookmarkInFlightIds.insert(postId)
        defer { bookmarkInFlightIds.remove(postId) }
        await bookmarker.write(bookmarked: wanted, postId: postId, post: posts[index], onRejected: { [weak self] in
            guard let self, let current = posts.firstIndex(where: { $0.id == postId }) else { return }
            posts[current] = PostBookmarkMutation.setting(posts[current], bookmarked: !wanted)
        })
    }

    func isBookmarkInFlight(_ postId: String) -> Bool {
        bookmarkInFlightIds.contains(postId)
    }

    /// Le lien à présenter pour « Partager » ; le compteur ne bouge que si la
    /// passerelle a enregistré le partage.
    func shareLink(for postId: String) async -> ShareableLink? {
        guard let post = posts.first(where: { $0.id == postId }) else { return nil }
        let outcome = await sharer.share(post)
        if outcome.recorded, let index = posts.firstIndex(where: { $0.id == postId }) {
            posts[index].shareCount += 1
        }
        return outcome.link
    }
}
