import SwiftUI
import Combine
import os
import MeeshySDK
import MeeshyUI

// MARK: - Profile User Posts ViewModel
//
// Cache-first listing, optimistic engagement, real-time sync and impression batching
// for `ProfileUserPostsList` (see that file for the product contract).

@MainActor
final class ProfileUserPostsViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published private(set) var posts: [FeedPost] = [] { didSet { refreshDerivedState() } }
    /// Chargement INITIAL uniquement (plein écran). La page suivante vit dans
    /// `isLoadingMore` — un seul flag pour les deux forçait la vue à afficher
    /// des sémantiques opposées (plein écran vs pied de liste).
    @Published var isLoading = false
    @Published var isLoadingMore = false
    @Published var hasMore = true { didSet { refreshDerivedState() } }
    /// État de pagination consommé par le pied de liste : `.exhausted` rend la
    /// zone « plus de contenu » (on a atteint le tout premier contenu publié).
    @Published private(set) var paginationState: PaginationState = .idle

    /// Number of posts actually rendered. Grows via the infinite-scroll sentinel
    /// so the nested LazyVStack never builds the whole cached list at once.
    @Published private(set) var renderWindow = ProfileUserPostsViewModel.initialRenderWindow {
        didSet { refreshDerivedState() }
    }

    /// Filtre piloté par les tuiles du bandeau (Postes/Réels ; re-tap = tout).
    /// Changer de filtre REMET la fenêtre de rendu à sa taille initiale : sans
    /// ça, passer de « tout » (fenêtre étendue à 40 cartes) à « Réels » faisait
    /// construire d'un coup tous les réels connus dans le LazyVStack imbriqué —
    /// exactement le pic de travail synchrone que la fenêtre existe pour éviter.
    @Published var filter: ProfilePostsFilter = .all {
        didSet {
            guard oldValue != filter else { return }
            renderWindow = Self.initialRenderWindow
            refreshDerivedState()
        }
    }
    /// Stats backend du profil (compteurs de contenu exacts) — `nil` tant que
    /// `GET /users/:id/stats` n'a pas répondu.
    @Published private(set) var userStats: UserStats? { didSet { refreshDerivedState() } }

    /// Optimistic engagement overrides keyed by postId (nil = use server flag).
    @Published var likedOverrides: [String: Bool] = [:]
    @Published var bookmarkedOverrides: [String: Bool] = [:]
    @Published var repostedOverrides: [String: Bool] = [:]
    /// Optimistic share-count delta keyed by postId (share is append-only).
    @Published var shareDelta: [String: Int] = [:]

    static let initialRenderWindow = 5
    static let renderStep = 5

    private let userId: String
    private let cacheKey: String
    private var nextCursor: String?
    private let postService: PostServiceProviding
    private let userService: UserServiceProviding
    private let languageProvider: LanguageProviding
    private let socialSocket: SocialSocketProviding
    private let currentUserIdProvider: @MainActor () -> String?

    /// Une révélation/pagination est déjà programmée : sans cette garde, les
    /// trois dernières cartes de la fenêtre déclenchaient chacune leur `Task`
    /// au même frame et la fenêtre bondissait de 3 × `renderStep` d'un coup.
    private var isRevealScheduled = false
    /// Reposts déjà comptabilisés — `post:reposted` ne porte qu'un delta (pas
    /// de total absolu comme `post:liked`), une re-livraison ferait dériver le
    /// compteur.
    private var appliedRepostIds = Set<String>()

    /// Groupement, persistance et flush (sortie d'écran / arrière-plan /
    /// relance) portés par `ImpressionBatcher`.
    private lazy var impressions = ImpressionBatcher(source: "profile", surface: .profile, postService: postService)

    private var cancellables = Set<AnyCancellable>()

    init(
        userId: String,
        postService: PostServiceProviding = PostService.shared,
        userService: UserServiceProviding = UserService.shared,
        languageProvider: LanguageProviding = AuthManagerLanguageProvider(),
        socialSocket: SocialSocketProviding = SocialSocketManager.shared,
        currentUserIdProvider: @MainActor @escaping () -> String? = { AuthManager.shared.currentUser?.id }
    ) {
        self.userId = userId
        self.cacheKey = "user:\(userId)"
        self.postService = postService
        self.userService = userService
        self.languageProvider = languageProvider
        self.socialSocket = socialSocket
        self.currentUserIdProvider = currentUserIdProvider
        subscribeToSocketUpdates()
    }

    private var preferredLanguages: [String] { languageProvider.preferredLanguages }

    // MARK: - Derived render state
    //
    // MÉMOÏSÉ, pas calculé à la volée : `filteredPosts` copie jusqu'à 100
    // `FeedPost` (chacun portant médias, commentaires, traductions) et
    // `visiblePosts` était relu à CHAQUE évaluation de body ET à chaque
    // `onAppear` de carte (via `loadMoreIfNeeded`) — soit une poignée de
    // balayages complets de la liste par cran de défilement. Les trois vues
    // dérivées sont désormais recalculées UNE fois, quand leurs entrées
    // (`posts`, `filter`, `renderWindow`, `hasMore`, `userStats`) changent.

    /// Liste après application du filtre des tuiles. La fenêtre de rendu
    /// s'applique APRÈS le filtre — appliquée avant, un profil à 90 % de réels
    /// afficherait une liste vide en mode « Postes ».
    @Published private(set) var filteredPosts: [FeedPost] = []
    @Published private(set) var visiblePosts: [FeedPost] = []
    @Published private(set) var reels: [FeedPost] = []
    /// Compteurs du bandeau : totaux backend exacts quand `GET /users/:id/stats`
    /// les fournit (phase 2), sinon dérivés des postes chargés (phase 1).
    @Published private(set) var postsCounts = ProfilePostsCounts(posts: 0, reels: 0, stories: 0, isApproximate: true)

    var hasMoreToRender: Bool { renderWindow < filteredPosts.count }

    private func refreshDerivedState() {
        let filtered: [FeedPost]
        switch filter {
        case .all: filtered = posts
        case .posts: filtered = posts.filter { !$0.isReel && !$0.isStory }
        case .reels: filtered = posts.filter(\.isReel)
        }
        filteredPosts = filtered
        visiblePosts = filtered.count > renderWindow ? Array(filtered.prefix(renderWindow)) : filtered
        reels = filter == .reels ? filtered : posts.filter(\.isReel)
        postsCounts = .merging(derived: .compute(from: posts, hasMore: hasMore), stats: userStats)
    }

    // MARK: - Derived engagement state

    func isLiked(_ post: FeedPost) -> Bool { likedOverrides[post.id] ?? post.isLiked }
    func isReposted(_ post: FeedPost) -> Bool { repostedOverrides[post.id] ?? post.isRepostedByMe }
    func isBookmarked(_ post: FeedPost) -> Bool { bookmarkedOverrides[post.id] ?? post.isBookmarkedByMe }

    func likeCount(_ post: FeedPost) -> Int { adjusted(post.likes, post.isLiked, likedOverrides[post.id]) }
    func repostCount(_ post: FeedPost) -> Int { adjusted(post.repostCount, post.isRepostedByMe, repostedOverrides[post.id]) }
    func bookmarkCount(_ post: FeedPost) -> Int { adjusted(post.bookmarkCount, post.isBookmarkedByMe, bookmarkedOverrides[post.id]) }
    func shareCount(_ post: FeedPost) -> Int { max(0, post.shareCount + (shareDelta[post.id] ?? 0)) }

    /// Server base count adjusted by the optimistic override: +1 when the user
    /// just participated, -1 when they just un-participated, unchanged otherwise.
    private func adjusted(_ base: Int, _ serverFlag: Bool, _ override: Bool?) -> Int {
        guard let override, override != serverFlag else { return base }
        return max(0, base + (override ? 1 : -1))
    }

    // MARK: - Loading (cache-first, SWR)

    func loadInitial() async {
        guard posts.isEmpty, !isLoading else { return }

        // Compteurs exacts du bandeau (fire-and-forget, silencieux — le
        // bandeau retombe sur les valeurs dérivées si la requête échoue).
        Task { [weak self] in await self?.loadStatsCounts() }

        // Restaure le curseur persisté AVANT de servir la page cachée (ordre
        // imposé — cf. ConversationListViewModel) : sans lui, un cache `.fresh`
        // laissait `nextCursor` à nil pour toute la vie de la vue et la
        // pagination se coinçait définitivement à la frontière du cache.
        var cursorRestored = false
        if let cursor = await CacheCoordinator.shared.feed.loadCursor(for: cacheKey) {
            nextCursor = cursor.nextCursor
            hasMore = cursor.hasMore
            if !cursor.hasMore { paginationState = .exhausted }
            cursorRestored = true
        }

        let cached = await CacheCoordinator.shared.feed.load(for: cacheKey)
        switch cached {
        case .fresh(let data, _):
            posts = data
            // `touch` re-fraîchit la fenêtre SWR à chaque visite : ne le faire
            // QUE si un curseur a été restauré — sinon un profil rouvert
            // régulièrement ne repassait JAMAIS par le réseau et le blocage de
            // pagination devenait permanent (le seul recours était l'expiration
            // à 7 jours).
            if cursorRestored {
                await CacheCoordinator.shared.feed.touch(for: cacheKey)
            }
            return
        case .stale(let data, _):
            posts = data
            Task { [weak self] in await self?.fetchFromNetwork() }
            return
        case .expired, .empty:
            break
        }

        isLoading = true
        defer { isLoading = false }
        _ = await fetchFromNetwork()
    }

    /// Charge les stats backend du profil pour les compteurs exacts du bandeau
    /// (dont le compteur de stories, structurellement 0 côté dérivé).
    private func loadStatsCounts() async {
        guard userStats == nil else { return }
        userStats = try? await userService.getUserStats(userId: userId)
    }

    /// Prefetch anticipé par carte : déclenche la révélation/chargement dès
    /// qu'une carte à ≤3 de la fin de la fenêtre rendue apparaît — le contenu
    /// suivant charge AVANT que l'utilisateur n'atteigne le bas, et le
    /// déclencheur se ré-arme tout seul (contrairement à la sentinelle
    /// one-shot, qui mourait dès que la fenêtre ne bougeait plus).
    func loadMoreIfNeeded(currentPost post: FeedPost) {
        guard let index = visiblePosts.firstIndex(where: { $0.id == post.id }) else { return }
        guard index >= visiblePosts.count - 3 else { return }
        scheduleReveal()
    }

    /// Point d'entrée unique et COALESCÉ des déclencheurs de révélation (les
    /// `onAppear` des dernières cartes et la sentinelle de bas de liste). Le
    /// drapeau est posé de façon synchrone, donc les déclencheurs d'un même
    /// frame se fondent en une seule progression de la fenêtre.
    func scheduleReveal() {
        guard !isRevealScheduled else { return }
        isRevealScheduled = true
        Task { [weak self] in
            await self?.revealOrLoadMore()
            self?.isRevealScheduled = false
        }
    }

    /// Sentinel handler: reveal more already-cached cards first (cheap), then
    /// fetch the next network page once the cache is fully rendered.
    func revealOrLoadMore() async {
        if hasMoreToRender {
            renderWindow = min(posts.count, renderWindow + Self.renderStep)
        } else if hasMore {
            await loadMore()
            // Grow the window to include the freshly fetched page — otherwise
            // the rendered prefix is unchanged, the bottom sentinel never moves,
            // its onAppear never re-fires, and pagination dead-ends at the cache
            // boundary.
            renderWindow = min(posts.count, renderWindow + Self.renderStep)
        }
    }

    func loadMore() async {
        // Pas de garde `nextCursor != nil` — même correctif que
        // `FeedViewModel.loadMoreIfNeeded` et `BookmarksViewModel` : un cache
        // `.fresh` ne produit jamais de curseur, et `cursor: nil` signifie
        // « page 1 », exactement ce qu'il faut pour récupérer un vrai curseur.
        // `hasMore` seul est une garde sûre (posé avec le curseur par
        // `fetchFromNetwork`).
        guard hasMore, !isLoading, !isLoadingMore else { return }
        isLoadingMore = true
        paginationState = .loadingMore
        defer { isLoadingMore = false }
        let countBefore = posts.count
        let succeeded = await fetchFromNetwork()
        // Garde zéro-progrès : une page entièrement dupliquée (curseur qui ne
        // progresse pas) laisserait `hasMore == true` avec une liste inchangée
        // → boucle réseau infinie sur le déclencheur auto-ré-armé. On déclare
        // la pagination épuisée plutôt que de marteler le gateway.
        if succeeded, hasMore, posts.count == countBefore, countBefore > 0 {
            hasMore = false
            paginationState = .exhausted
            await CacheCoordinator.shared.feed.saveCursor(nextCursor: nil, hasMore: false, for: cacheKey)
        }
    }

    @discardableResult
    private func fetchFromNetwork() async -> Bool {
        do {
            let response = try await postService.getUserPosts(userId: userId, cursor: nextCursor, limit: 20)
            let preferred = preferredLanguages
            let payload = response.data
            // Decode off the main actor — toFeedPost decodes media / comments /
            // translations (heavy). Both [APIPost] and [FeedPost] are Sendable.
            let fetched = await Task.detached(priority: .userInitiated) {
                payload.map { $0.toFeedPost(preferredLanguages: preferred) }
            }.value

            if nextCursor == nil, posts.isEmpty {
                posts = fetched
            } else if nextCursor == nil {
                // Recovery « page 1 » par-dessus une liste cachée : FUSIONNER,
                // jamais remplacer — un remplacement faisait rétrécir 100
                // cartes en 20 sous le doigt de l'utilisateur (et
                // `renderWindow > posts.count` cassait `visiblePosts`). La page
                // serveur (newest-first) prime ; la queue cachée plus ancienne
                // est conservée derrière.
                let fetchedIds = Set(fetched.map(\.id))
                let olderTail = posts.filter { !fetchedIds.contains($0.id) }
                posts = fetched + olderTail
            } else {
                let existing = Set(posts.map(\.id))
                posts.append(contentsOf: fetched.filter { !existing.contains($0.id) })
            }
            nextCursor = response.pagination?.nextCursor
            // Défaut sûr quand le bloc pagination est strippé de la réponse :
            // un curseur présent vaut « il y a une suite » (forme ReelsViewModel)
            // — `?? false` figeait la pagination définitivement sans recours.
            hasMore = response.pagination?.hasMore ?? (response.pagination?.nextCursor != nil)
            paginationState = hasMore ? .idle : .exhausted

            // Drop any override / share delta whose value now matches server
            // truth, and prune entries for posts no longer present.
            let ids = Set(posts.map(\.id))
            likedOverrides = likedOverrides.filter { ids.contains($0.key) }
            bookmarkedOverrides = bookmarkedOverrides.filter { ids.contains($0.key) }
            repostedOverrides = repostedOverrides.filter { ids.contains($0.key) }
            shareDelta = shareDelta.filter { ids.contains($0.key) }
            for post in posts {
                if likedOverrides[post.id] == post.isLiked { likedOverrides[post.id] = nil }
                if bookmarkedOverrides[post.id] == post.isBookmarkedByMe { bookmarkedOverrides[post.id] = nil }
                if repostedOverrides[post.id] == post.isRepostedByMe { repostedOverrides[post.id] = nil }
            }

            // The live VM keeps the full paginated list in memory; the cache is
            // bounded to the NEWEST 100. GRDBCacheStore.save keeps `suffix(100)`
            // (oldest, posts are newest-first) so we persist `prefix(100)` to
            // avoid trimming the newest posts on cold start.
            try? await CacheCoordinator.shared.feed.save(Array(posts.prefix(100)), for: cacheKey)
            // Persisté À CÔTÉ de la page (même clé) : la prochaine instance du
            // VM reprend au curseur profond au lieu de se coincer sur un cache
            // `.fresh` sans curseur.
            await CacheCoordinator.shared.feed.saveCursor(nextCursor: nextCursor, hasMore: hasMore, for: cacheKey)
            return true
        } catch {
            // Échec réseau : `hasMore`/`nextCursor` restent intacts (retenter la
            // même page), le déclencheur par carte se ré-arme au prochain scroll.
            paginationState = .error(String(localized: "profile.posts.loadError", defaultValue: "Erreur lors du chargement des publications", bundle: .main))
            FeedbackToastManager.shared.showError(String(localized: "profile.posts.loadError", defaultValue: "Erreur lors du chargement des publications", bundle: .main))
            return false
        }
    }

    func refresh() async {
        nextCursor = nil
        hasMore = true
        paginationState = .idle
        renderWindow = Self.initialRenderWindow
        await CacheCoordinator.shared.feed.invalidate(for: cacheKey)
        await fetchFromNetwork()
    }

    // MARK: - Engagement actions (optimistic, crash-free)

    func toggleLike(_ postId: String) async {
        guard let post = posts.first(where: { $0.id == postId }) else { return }
        let current = isLiked(post)
        likedOverrides[postId] = !current
        do {
            if current {
                try await postService.unlike(postId: postId)
            } else {
                try await postService.like(postId: postId)
            }
        } catch {
            likedOverrides[postId] = current
            FeedbackToastManager.shared.showError(String(localized: "profile.posts.likeError", defaultValue: "Erreur", bundle: .main))
        }
    }

    func toggleBookmark(_ postId: String) async {
        guard let post = posts.first(where: { $0.id == postId }) else { return }
        let current = isBookmarked(post)
        bookmarkedOverrides[postId] = !current
        do {
            if current {
                try await postService.removeBookmark(postId: postId)
            } else {
                try await postService.bookmark(postId: postId)
            }
        } catch {
            bookmarkedOverrides[postId] = current
            FeedbackToastManager.shared.showError(String(localized: "profile.posts.bookmarkError", defaultValue: "Erreur", bundle: .main))
        }
    }

    /// Reposts are append-only on the backend — the optimistic flip only
    /// persists if the server confirmed the create (mirrors FeedView).
    func toggleRepost(_ postId: String) async {
        guard let post = posts.first(where: { $0.id == postId }), !isReposted(post) else { return }
        repostedOverrides[postId] = true
        do {
            // `visibility: nil` = héritage de l'original. Un repost simple
            // depuis le profil n'offre aucun sélecteur d'audience.
            let cible = RepostTargeting.target(
                cardId: postId, cardType: post.type,
                repostOfId: post.repost?.id, originalRepostOfId: post.repost?.originalRepostOfId
            )
            try await RepostPublisher(postService: postService).publish(
                .simple(postId: cible.postId, targetType: cible.targetType, visibility: nil)
            )
            FeedbackToastManager.shared.showSuccess(String(localized: "profile.posts.repost.success", defaultValue: "Repartagé", bundle: .main))
        } catch {
            repostedOverrides[postId] = nil
            FeedbackToastManager.shared.showError(String(localized: "profile.posts.repostError", defaultValue: "Erreur lors du repost", bundle: .main))
        }
    }

    // `sendComment` retiré (2026-07-24) : aucun call site. Les commentaires de
    // cette liste passent par le viewer/détail hôte (PostDetailViewModel), pas
    // par un composer inline ici — la méthode était du code mort trompeur.

    func report(_ postId: String) async {
        do {
            try await ReportService.shared.reportPost(postId: postId, reportType: "inappropriate", reason: nil)
            FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.reported", defaultValue: "Publication signalée", bundle: .main))
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "feed.post.reportError", defaultValue: "Erreur lors du signalement", bundle: .main))
        }
    }

    // MARK: - Options « … » (parité avec FeedViewModel — menu de la carte poste/réel)

    func deletePost(_ postId: String) async {
        guard let index = posts.firstIndex(where: { $0.id == postId }) else { return }
        let removed = posts.remove(at: index)
        do {
            try await postService.delete(postId: postId)
            // Le cache vit sous PLUSIEURS clés (`user:<id>`, main-feed, la clé
            // détail, bookmarks) : sans cette purge, la carte supprimée
            // ressortait à la réouverture du profil, servie cache-first.
            await CacheCoordinator.shared.feed.removeEverywhere(itemId: postId)
            FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.deleted", defaultValue: "Publication supprimée", bundle: .main))
        } catch {
            // Défaire CE retrait (`OptimisticRollback`) : un post supprimé par
            // socket ou une page chargée pendant l'attente survivaient mal à
            // l'instantané.
            posts = OptimisticRollback.restoring(removed, at: index, into: posts)
            FeedbackToastManager.shared.showError(String(localized: "feed.post.deleteError", defaultValue: "Erreur lors de la suppression", bundle: .main))
        }
    }

    func pinPost(_ postId: String) async {
        do {
            try await postService.pinPost(postId: postId)
            FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.pinned", defaultValue: "Publication épinglée", bundle: .main))
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "feed.post.pinError", defaultValue: "Erreur lors de l'épinglage", bundle: .main))
        }
    }

    func updatePost(
        _ postId: String,
        content: String,
        language: String? = nil,
        type: String? = nil,
        removeMediaIds: [String]? = nil,
        location: PostLocationUpdate? = nil,
        visibility: String? = nil,
        visibilityUserIds: [String]? = nil,
        known: Set<PostEditField> = EditPostDraft.documentFields, storyEffects: StoryEffects? = nil
    ) async {
        guard let idx = posts.firstIndex(where: { $0.id == postId }) else { return }
        let snapshot = posts[idx]
        var optimistic = snapshot
        optimistic.content = content
        optimistic.translatedContent = nil
        optimistic.translations = nil
        switch location {
        case .set(let place): optimistic.location = place
        case .remove: optimistic.location = nil
        case nil: break
        }
        if let visibility {
            optimistic.visibility = visibility
            optimistic.visibilityUserIds = visibilityUserIds
        }
        posts[idx] = optimistic
        do {
            // Le corps ne se construit plus ici : `known` dit ce que la
            // surface a su RENDRE, `PostEditPayload.build` en tire le PUT. Un
            // champ non déclaré est OMIS, et le serveur préserve le sien.
            let updated = try await postService.update(postId: postId, known: known, draft: PostEditDraft(
                content: content, visibility: visibility, visibilityUserIds: visibilityUserIds,
                originalLanguage: language, type: type, removeMediaIds: removeMediaIds, storyEffects: storyEffects,
                location: location
            ))
            if let newIdx = posts.firstIndex(where: { $0.id == postId }) {
                let edited = updated.toFeedPost(preferredLanguages: languageProvider.preferredLanguages)
                posts[newIdx] = edited
                // `post:updated` n'est pas réconcilié côté cache (contrairement
                // aux likes/commentaires) : sans ce patch, la réouverture du
                // profil ressert l'ANCIEN texte depuis le cache. Fraîcheur
                // préservée — c'est une mutation locale, pas un fetch.
                await CacheCoordinator.shared.feed.patchEverywhere(itemId: postId) { $0 = edited }
            }
            FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.edited", defaultValue: "Publication modifiée", bundle: .main))
        } catch {
            if let rollbackIdx = posts.firstIndex(where: { $0.id == postId }) {
                posts[rollbackIdx] = snapshot
            }
            FeedbackToastManager.shared.showError(String(localized: "feed.post.editError", defaultValue: "Erreur lors de la modification", bundle: .main))
        }
    }

    // MARK: - On-demand translation (mirrors FeedViewModel)

    /// Requests a translation for `postId` into `language`. The computed
    /// translation is delivered asynchronously via the social socket and patched
    /// into `posts` by `subscribeToSocketUpdates` (so the flag lights up).
    func requestTranslation(postId: String, language: String) async {
        do {
            try await postService.requestTranslation(postId: postId, targetLanguage: language)
        } catch {
            // On failure the flag simply stays "untranslated" — no toast (the
            // tap is exploratory, not a committed user action).
        }
    }

    // MARK: - Real-time sync (parité FeedViewModel, périmètre listing profil)
    //
    // Sans ces sinks, le listing du profil était un instantané mort : un like
    // reçu, un commentaire posté depuis la feuille de commentaires hoistée, une
    // suppression ou une édition faite ailleurs ne touchaient JAMAIS les cartes
    // — seul l'optimisme local bougeait, et le compteur serveur restait figé sur
    // la valeur du fetch. Le CACHE, lui, était déjà réconcilié
    // (`CacheCoordinator.subscribeToPostEngagement`) : l'écart ne portait que
    // sur l'exemplaire EN MÉMOIRE, donc il se voyait tant que la vue restait
    // ouverte et disparaissait à la réouverture — la signature exacte d'un
    // « compteur qui ne se synchronise pas ».

    private func subscribeToSocketUpdates() {
        // Idempotent — garantit que le socket social est monté quand la feuille
        // de profil est ouverte hors du feed.
        socialSocket.connect()
        // Les événements post/commentaire sont diffusés vers la feed room du
        // viewer (cf. `SocialEventsHandler.broadcastToFeedRooms`) : sans ce
        // join, un profil ouvert depuis une conversation ou la recherche ne
        // recevait AUCUNE mise à jour. Join idempotent, et JAMAIS quitté ici —
        // `feed:unsubscribe` appartient au feed, le quitter depuis le profil
        // couperait le temps réel de l'écran d'accueil.
        socialSocket.subscribeFeed()

        socialSocket.postLiked
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                self?.applyLike(postId: data.postId, actorId: data.userId,
                                likeCount: data.likeCount, liked: true)
            }
            .store(in: &cancellables)

        socialSocket.postUnliked
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                self?.applyLike(postId: data.postId, actorId: data.userId,
                                likeCount: data.likeCount, liked: false)
            }
            .store(in: &cancellables)

        socialSocket.commentAdded
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                self?.applyCommentCount(postId: data.postId, count: data.commentCount)
            }
            .store(in: &cancellables)

        socialSocket.commentDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                self?.applyCommentCount(postId: data.postId, count: data.commentCount)
            }
            .store(in: &cancellables)

        socialSocket.postBookmarked
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId })
                else { return }
                self.posts[index].isBookmarkedByMe = data.bookmarked
                if let count = data.bookmarkCount { self.posts[index].bookmarkCount = count }
                self.bookmarkedOverrides[data.postId] = nil
            }
            .store(in: &cancellables)

        socialSocket.postReposted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in self?.applyRepost(data) }
            .store(in: &cancellables)

        socialSocket.postDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] postId in self?.posts.removeAll { $0.id == postId } }
            .store(in: &cancellables)

        socialSocket.postUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] apiPost in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == apiPost.id })
                else { return }
                var merged = apiPost.toFeedPost(preferredLanguages: self.preferredLanguages)
                // L'état personnel n'est pas porté par un broadcast destiné à
                // toute l'audience — le reprendre de l'exemplaire local évite
                // que l'édition d'un poste éteigne le cœur de son lecteur.
                merged.isLiked = self.posts[index].isLiked
                merged.isBookmarkedByMe = self.posts[index].isBookmarkedByMe
                merged.isRepostedByMe = self.posts[index].isRepostedByMe
                self.posts[index] = merged
            }
            .store(in: &cancellables)

        socialSocket.postTranslationUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] (data: SocketPostTranslationUpdatedData) in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
                var post = self.posts[index]
                var translations = post.translations ?? [:]
                translations[data.language] = PostTranslation(
                    text: data.translation.text,
                    translationModel: data.translation.translationModel,
                    confidenceScore: data.translation.confidenceScore
                )
                post.translations = translations
                // #6531 — troisième site du même défaut (FeedViewModel,
                // PostDetailViewModel) : re-résoudre par la descente unique du
                // Prisme (`FeedPost.resolved`) plutôt que figer la première
                // traduction dont la langue figurait n'importe où dans le Prisme.
                self.posts[index] = post.resolved(preferredLanguages: self.preferredLanguages)
            }
            .store(in: &cancellables)
    }

    /// `post:liked` / `post:unliked` portent le total ABSOLU : il devient la
    /// base. L'override optimiste est levé dès que l'écho de NOTRE propre
    /// action arrive — le garder ferait dériver l'affichage de ±1, `adjusted()`
    /// l'appliquant par-dessus un total qui inclut déjà ce like.
    private func applyLike(postId: String, actorId: String, likeCount: Int, liked: Bool) {
        guard let index = posts.firstIndex(where: { $0.id == postId }) else { return }
        posts[index].likes = likeCount
        guard actorId == currentUserIdProvider() else { return }
        posts[index].isLiked = liked
        likedOverrides[postId] = nil
    }

    private func applyCommentCount(postId: String, count: Int) {
        guard let index = posts.firstIndex(where: { $0.id == postId }) else { return }
        posts[index].commentCount = count
    }

    /// `post:reposted` ne porte PAS de total absolu (contrairement aux likes) —
    /// d'où l'incrément gardé par `appliedRepostIds`. Le repost lui-même est un
    /// poste de son auteur : il rejoint la tête du listing quand c'est le profil
    /// consulté.
    private func applyRepost(_ data: SocketPostRepostedData) {
        guard appliedRepostIds.insert(data.repost.id).inserted else { return }
        if let index = posts.firstIndex(where: { $0.id == data.originalPostId }) {
            posts[index].repostCount += 1
            if data.repost.author.id == currentUserIdProvider() {
                posts[index].isRepostedByMe = true
                repostedOverrides[data.originalPostId] = nil
            }
        }
        // Le compteur ci-dessus vaut pour TOUT repost — c'est celui de
        // l'original. La GRILLE, elle, ne sert que ce que sa lecture REST sert
        // (`getUserPosts` : `[POST, REEL]`) : une story repostee arrivait par
        // `post:reposted`, non type, et s'y inserait alors qu'elle vit dans le
        // tray.
        guard !data.repost.belongsToStoryTray,
              data.repost.author.id == userId,
              !posts.contains(where: { $0.id == data.repost.id }) else { return }
        posts.insert(data.repost.toFeedPost(preferredLanguages: preferredLanguages), at: 0)
    }

    /// Optimistic share-count bump — the gateway always increments shareCount on
    /// `POST /posts/:id/share` regardless of mint success, so we mirror it.
    func bumpShare(_ postId: String) {
        shareDelta[postId, default: 0] += 1
    }

    // MARK: - Impressions (batched, source "profile")

    func trackImpression(_ postId: String) {
        impressions.record(postId)
    }

    /// La file où une carte de la liste situe son apparition (#10501).
    var listedImpressions: ReachImpressionRecording { impressions }

    /// À appeler quand la liste disparaît : sans ce flush, le lot en cours de
    /// groupement est perdu.
    func flushImpressions() async {
        await impressions.flushNow()
    }
}
