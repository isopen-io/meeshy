import Foundation
import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// `LanguageProviding` and `AuthManagerLanguageProvider` were extracted to
// `Features/Main/Services/LanguageProviding.swift` so PostDetailViewModel /
// BookmarksViewModel can depend on them without importing FeedViewModel.

/// Le magasin de cache du fil, réduit aux quatre opérations que le ViewModel
/// lui demande. Couture d'injection (règle iOS : toute dépendance entre par
/// l'init, `.shared` par défaut) — elle permet à un test de RETENIR une
/// sauvegarde et de prouver que `loadFeed` l'attend, ce qu'aucun test contre
/// `CacheCoordinator.shared` ne pouvait faire de façon déterministe.
protocol FeedCacheStoring: Sendable {
    func load(for key: String) async -> CacheResult<[FeedPost]>
    func save(_ items: [FeedPost], for key: String) async throws
    func savePreservingFreshness(_ items: [FeedPost], for key: String) async throws
    func patchEverywhere(itemId: String, mutate: @Sendable (inout FeedPost) -> Void) async
}

extension GRDBCacheStore: FeedCacheStoring where Key == String, Value == FeedPost {}

/// Le magasin partagé, atteint par saut d'acteur à chaque appel : la valeur
/// par défaut d'un init `@MainActor` ne peut pas lire
/// `CacheCoordinator.shared.feed` (propriété d'un acteur d'un autre module)
/// sans `await`. Ce relais le fait au moment de chaque opération.
struct SharedFeedCache: FeedCacheStoring {
    func load(for key: String) async -> CacheResult<[FeedPost]> {
        await CacheCoordinator.shared.feed.load(for: key)
    }

    func save(_ items: [FeedPost], for key: String) async throws {
        try await CacheCoordinator.shared.feed.save(items, for: key)
    }

    func savePreservingFreshness(_ items: [FeedPost], for key: String) async throws {
        try await CacheCoordinator.shared.feed.savePreservingFreshness(items, for: key)
    }

    func patchEverywhere(itemId: String, mutate: @Sendable (inout FeedPost) -> Void) async {
        await CacheCoordinator.shared.feed.patchEverywhere(itemId: itemId, mutate: mutate)
    }
}

@MainActor
class FeedViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published var posts: [FeedPost] = []
    @Published var isLoading = false
    @Published var isLoadingMore = false
    @Published var hasMore = true
    @Published var hasLoaded = false
    @Published var error: String?

    /// Number of new posts received via Socket.IO while the user is scrolled down.
    /// Reset to 0 when the user taps the "New posts" banner or pulls to refresh.
    @Published var newPostsCount: Int = 0
    @Published var publishError: String?
    @Published var publishSuccess: Bool = false

    private var nextCursor: String?
    private let api: APIClientProviding
    private let offlineQueue: OfflineQueueing
    private let feedCache: any FeedCacheStoring
    private let limit = 20
    private var cancellables = Set<AnyCancellable>()
    /// Subscriptions owned by `subscribeToSocketEvents()` only — kept
    /// separate from the general `cancellables` set so the
    /// `cancellables.isEmpty` guard isn't tripped by init-time
    /// subscriptions like `observePreferredLanguageChanges()`. The
    /// `unsubscribeFromSocketEvents()` removes only this set so the
    /// language-change observer keeps living across socket re-subscribes.
    private var socketCancellables = Set<AnyCancellable>()
    private let socialSocket: SocialSocketProviding
    private let postService: PostServiceProviding
    private let languageProvider: LanguageProviding
    private var cacheSaveTask: Task<Void, Never>?
    private var isFeedLoadInProgress = false
    /// rts-01 — distingue le PREMIER armement de `subscribeToSocketEvents()`
    /// (la vue appelle déjà `loadFeed()` dans son `.task` si `posts.isEmpty`,
    /// pas de fetch redondant) d'un RÉ-armement après
    /// `unsubscribeFromSocketEvents()` (room quittée ET sinks désarmés hors
    /// écran — sans refetch explicite, rien ne rattrape le trou).
    private var hasSubscribedOnce = false
    /// Tracks postIds whose comments are currently being prefetched, to coalesce
    /// duplicate calls triggered by repeated cell .onAppear events.
    private var prefetchingComments: Set<String> = []

    // MARK: - Persistence Layer

    private(set) var feedStore: FeedStore?
    private(set) var feedSocketHandler: FeedSocketHandler?
    private var feedPersistence: FeedPersistenceActor?

    init(
        api: APIClientProviding = APIClient.shared,
        socialSocket: SocialSocketProviding = SocialSocketManager.shared,
        postService: PostServiceProviding = PostService.shared,
        languageProvider: LanguageProviding = AuthManagerLanguageProvider(),
        offlineQueue: OfflineQueueing = OfflineQueue.shared,
        feedCache: any FeedCacheStoring = SharedFeedCache()
    ) {
        self.api = api
        self.socialSocket = socialSocket
        self.postService = postService
        self.languageProvider = languageProvider
        self.offlineQueue = offlineQueue
        self.feedCache = feedCache
        observePreferredLanguageChanges()
    }

    /// B2 (Prisme Linguistique) — when the viewer's preferred-content
    /// languages change mid-session (Settings edit), re-resolve every
    /// already-mapped FeedPost. The `translations` dict stored on each
    /// post is enough; no network re-fetch is needed.
    ///
    /// Observed on `AuthManager.shared.currentUserPublisher` (the canonical
    /// source-of-truth — `LanguageProviding` is reactive too but exposes
    /// no publisher). Distinct duplicate filter avoids spurious work on
    /// unrelated `currentUser` mutations (e.g. avatar change).
    private func observePreferredLanguageChanges() {
        AuthManager.shared.currentUserPublisher
            .removeDuplicates { old, new in
                old?.systemLanguage == new?.systemLanguage
                && old?.regionalLanguage == new?.regionalLanguage
                && old?.customDestinationLanguage == new?.customDestinationLanguage
            }
            .dropFirst()
            .sink { [weak self] _ in
                guard let self else { return }
                let langs = self.preferredLanguages
                self.posts = self.posts.map { $0.resolved(preferredLanguages: langs) }
            }
            .store(in: &cancellables)
    }

    /// Wire persistence store and socket handler for GRDB-backed feed.
    /// Call once after init when the dependency container is available.
    func setupPersistence(store: FeedStore, socketHandler: FeedSocketHandler, persistence: FeedPersistenceActor) {
        self.feedStore = store
        self.feedSocketHandler = socketHandler
        self.feedPersistence = persistence
        socketHandler.arm()
    }

    private var preferredLanguages: [String] {
        languageProvider.preferredLanguages
    }

    // MARK: - Initial Load

    /// Loads the feed cache-first. Pass `forceRefresh: true` (pull-to-refresh) to
    /// bypass the cache read entirely and always fetch from the network — the
    /// fetch's write-back save then overwrites the cache with fresh data.
    func loadFeed(forceRefresh: Bool = false) async {
        guard !isFeedLoadInProgress else { return }
        isFeedLoadInProgress = true
        defer { isFeedLoadInProgress = false }
        // Yield so concurrent tasks see the in-progress flag before any
        // fast (e.g. cache or synchronous mock) path resets it.
        await Task.yield()
        error = nil

        if !forceRefresh {
            let cacheResult = await feedCache.load(for: "main-feed")

            switch cacheResult {
            case .fresh(let cachedPosts, _):
                posts = cachedPosts
                hasLoaded = true
                prefetchMedia(around: 0)
                return

            case .stale(let cachedPosts, _):
                posts = cachedPosts
                hasLoaded = true
                prefetchMedia(around: 0)
                Task {
                    await fetchFeedFromNetwork(showLoading: false)
                }
                return

            case .expired, .empty:
                break
            }
        }

        await fetchFeedFromNetwork(showLoading: posts.isEmpty)
    }

    private func fetchFeedFromNetwork(showLoading: Bool) async {
        if showLoading {
            isLoading = true
        }

        do {
            let response: PaginatedAPIResponse<[APIPost]> = try await api.paginatedRequest(
                PostsEndpoint.feed,
                cursor: nil,
                limit: limit
            )

            if response.success {
                // Map the API payload off the main actor — `toFeedPost` decodes
                // each post's media / comments / translations, real CPU for a
                // full feed page (FeedViewModel is @MainActor + SE-0461). Both
                // `[APIPost]` in and `[FeedPost]` out are Sendable, clean hop.
                let preferred = self.preferredLanguages
                let payload = response.data
                let fetched = await Task.detached(priority: .userInitiated) {
                    payload.map { $0.toFeedPost(preferredLanguages: preferred) }
                }.value
                // Protective merge — same class of fix as MessageStore.publish:
                // a `.stale` cache load kicks off this background refresh, and a
                // socket `post:created` / `post:reposted` can insert a post at
                // index 0 WHILE the fetch is in flight. A straight `posts =
                // fetched` would erase that just-arrived post (it flashes in,
                // then vanishes). Preserve only real-time posts strictly newer
                // than the server head so server-side deletions within the
                // fetched range still take effect.
                posts = Self.mergePreservingRealtimeHead(fetched: fetched, existing: posts)
                // grdb-03 (volet mémoire) — réappliquer les likes encore en
                // attente d'outbox par-dessus le snapshot serveur périmé.
                if let persistence = feedPersistence {
                    let pendingLikes = await persistence.pendingLikeFlags()
                    if !pendingLikes.isEmpty {
                        posts = Self.reapplyPendingLikes(posts: posts, pendingLikes: pendingLikes)
                    }
                }
                nextCursor = response.pagination?.nextCursor
                hasMore = response.pagination?.hasMore ?? false
                prefetchMedia(around: 0)

                // Attendue EN LIGNE, après la publication de `posts` (l'UI est déjà
                // servie) — plus de `Task.detached` jamais attendu : une réponse
                // lente ne peut plus écraser une plus récente dans le cache, et
                // « main-feed » est écrit quand `loadFeed` rend la main. Le test
                // `…doesNotReturnBeforeTheFetchedPageIsPersisted` en est le témoin ;
                // la CI du 2026-08-26 en était le symptôme (cache pollué entre tests).
                try? await feedCache.save(fetched, for: "main-feed")

                // Persist to GRDB alongside cache
                if let persistence = feedPersistence {
                    let apiPosts = response.data
                    Task.detached(priority: .utility) {
                        let records = apiPosts.compactMap { PostRecord(from: $0) }
                        try? await persistence.insertPosts(records)
                    }
                }
            } else {
                if posts.isEmpty {
                    error = response.error ?? String(localized: "feed.load.error", defaultValue: "Impossible de charger le fil")
                }
            }
        } catch let apiError as APIError {
            if posts.isEmpty {
                error = apiError.localizedDescription
            }
        } catch {
            if posts.isEmpty {
                self.error = error.localizedDescription
            }
        }

        isLoading = false
        hasLoaded = true
    }

    /// Merges a freshly-fetched feed page with the in-memory list, preserving
    /// real-time posts (socket `post:created` / `post:reposted`, inserted at
    /// index 0) that arrived DURING a background refresh. Only posts strictly
    /// newer than the newest fetched post AND absent from the fetched set are
    /// preserved, so server-side deletions inside the fetched range still
    /// apply. Pure + static so it is unit-testable without a live ViewModel.
    /// grdb-03 — réapplique les likes encore PENDING en outbox par-dessus un
    /// snapshot serveur périmé (le cœur ne se dé-remplit pas sous les yeux de
    /// l'utilisateur ; le compteur suit, jamais négatif). Pure, testable.
    static func reapplyPendingLikes(posts: [FeedPost], pendingLikes: [String: Bool]) -> [FeedPost] {
        posts.map { post in
            guard let liked = pendingLikes[post.id], post.isLiked != liked else { return post }
            var patched = post
            patched.isLiked = liked
            patched.likes = max(0, post.likes + (liked ? 1 : -1))
            return patched
        }
    }

    static func mergePreservingRealtimeHead(fetched: [FeedPost], existing: [FeedPost]) -> [FeedPost] {
        guard let newestFetched = fetched.first else { return fetched }
        let fetchedIds = Set(fetched.map(\.id))
        let realtimeHead = existing.filter {
            $0.timestamp > newestFetched.timestamp && !fetchedIds.contains($0.id)
        }
        return realtimeHead.isEmpty ? fetched : realtimeHead + fetched
    }

    // MARK: - Load More (Infinite Scroll)

    func loadMoreIfNeeded(currentPost: FeedPost) async {
        // Trigger when we're 5 posts from the end
        guard let index = posts.firstIndex(where: { $0.id == currentPost.id }) else { return }
        let threshold = posts.count - 5

        // NOTE: no `nextCursor != nil` guard here on purpose. A session that
        // started from a `.fresh` cache hit (loadFeed) never touches the
        // network, so `nextCursor` stays at its initial `nil` forever while
        // `hasMore` stays at its initial `true` — requiring a non-nil cursor
        // permanently stalled infinite scroll for the whole session. `hasMore`
        // alone is a safe gate: it's always set together with `nextCursor`
        // by every real network response below, so `hasMore == true` with a
        // `nil` cursor can only mean "no real fetch has happened yet" — and
        // `cursor: nil` is exactly how `loadFeed` already requests page 1.
        guard index >= threshold,
              hasMore,
              !isLoadingMore else { return }

        isLoadingMore = true

        do {
            let response: PaginatedAPIResponse<[APIPost]> = try await api.paginatedRequest(
                PostsEndpoint.feed,
                cursor: nextCursor,
                limit: limit
            )

            if response.success {
                // Map off the main actor (see loadFeed) — toFeedPost decode is CPU-bound.
                let preferred = self.preferredLanguages
                let payload = response.data
                let newPosts = await Task.detached(priority: .userInitiated) {
                    payload.map { $0.toFeedPost(preferredLanguages: preferred) }
                }.value
                // Deduplicate
                let existingIds = Set(posts.map(\.id))
                let uniqueNew = newPosts.filter { !existingIds.contains($0.id) }
                posts.append(contentsOf: uniqueNew)

                nextCursor = response.pagination?.nextCursor
                hasMore = response.pagination?.hasMore ?? false

                prefetchMedia(around: posts.count - uniqueNew.count)

                // Persist to GRDB
                if let persistence = feedPersistence {
                    let apiPosts = response.data
                    Task.detached(priority: .utility) {
                        let records = apiPosts.compactMap { PostRecord(from: $0) }
                        try? await persistence.insertPosts(records)
                    }
                }
            }
        } catch {
            // stores-05 (option A — lecteur GRDB activé) : pagination offline.
            // Relire la suite du feed depuis feed_posts locale au lieu
            // d'échouer en silence — le mapping PostRecord→FeedPost partage la
            // résolution Prisme du chemin réseau ; dédup par id, l'ordre
            // createdAt desc du store prolonge la timeline affichée.
            if let feedStore {
                if feedStore.posts.isEmpty { await feedStore.loadInitial() }
                _ = await feedStore.loadOlder()
                let preferred = preferredLanguages
                let mapped = feedStore.posts.map { $0.toFeedPost(preferredLanguages: preferred) }
                let existingIds = Set(posts.map(\.id))
                posts.append(contentsOf: mapped.filter { !existingIds.contains($0.id) })
            }
        }

        isLoadingMore = false
    }

    // MARK: - Pull to Refresh

    func refresh() async {
        nextCursor = nil
        hasMore = true
        newPostsCount = 0
        await loadFeed(forceRefresh: true)
    }

    // MARK: - Comments Prefetch

    /// Pre-loads comments for a visible post into the cache so that opening the post
    /// detail does not require a network round-trip. Cache-first: skips the network
    /// call when the cache is already fresh. Coalesced: concurrent calls for the
    /// same `postId` are no-ops while a prefetch is in flight.
    func prefetchComments(_ postId: String) {
        guard !prefetchingComments.contains(postId) else { return }
        prefetchingComments.insert(postId)

        Task(priority: .utility) { [weak self] in
            guard let self else { return }
            defer { self.prefetchingComments.remove(postId) }

            let cacheKey = "post-\(postId)"
            let cached = await CacheCoordinator.shared.comments.load(for: cacheKey)
            if case .fresh = cached { return }

            do {
                let response = try await self.postService.getComments(postId: postId, cursor: nil, limit: 20)
                let langs = self.preferredLanguages
                let payload = response.data
                let comments = await Task.detached(priority: .utility) {
                    payload.map { c -> FeedComment in
                        let translatedContent = PostDetailViewModel.resolveCommentTranslation(
                            translations: c.translations,
                            originalLanguage: c.originalLanguage,
                            preferredLanguages: langs
                        )
                        return FeedComment(
                            id: c.id, author: c.author.name, authorId: c.author.id,
                            authorAvatarURL: c.author.avatar,
                            content: c.content, timestamp: c.createdAt,
                            likes: c.likeCount ?? 0, replies: c.replyCount ?? 0,
                            parentId: c.parentId,
                            originalLanguage: c.originalLanguage, translatedContent: translatedContent,
                            currentUserReactions: c.currentUserReactions,
                            media: (c.media ?? []).map { $0.toFeedMedia() },
                            location: c.location
                        )
                    }
                }.value
                try? await CacheCoordinator.shared.comments.save(comments, for: cacheKey)
            } catch {
                // Silent fail on prefetch — user-triggered open will retry the network.
            }
        }
    }

    // MARK: - New Posts Banner

    /// Call this when the user taps the "New posts" banner to scroll to top
    /// and reset the counter.
    func acknowledgeNewPosts() {
        newPostsCount = 0
    }

    // MARK: - Interactions

    func likePost(_ postId: String) async {
        guard let index = posts.firstIndex(where: { $0.id == postId }) else { return }

        // Snapshot pre-mutation state so both the synchronous enqueue-refusal
        // path and the async `.exhausted` observer roll back to the exact prior
        // state (the feed may mutate across the enqueue await).
        let wasLiked = posts[index].isLiked
        let priorLikes = posts[index].likes

        // Optimistic update — batch mutations to trigger a single objectWillChange
        var post = posts[index]
        post.isLiked.toggle()
        post.likes += post.isLiked ? 1 : -1
        posts[index] = post

        // T10b — route the like through the durable outbox (survives offline +
        // app kill, flushes on reconnect via T10) instead of a direct REST call
        // that was lost when offline. Mirrors PostDetailViewModel.likePost and
        // this VM's own toggleLikeComment; the dispatcher sends POST/DELETE
        // /posts/:id/like per `liked`.
        let liked = posts[index].isLiked
        let cmid = ClientMutationId.generate()
        let payload = ToggleLikePostPayload(
            clientMutationId: cmid,
            postId: postId,
            liked: liked
        )
        do {
            try await offlineQueue.enqueue(.toggleLikePost, payload: payload, conversationId: nil)
            debouncedCacheSave()

            // stores-09 — patch every cache key holding this post (detail key,
            // bookmarks…), not just "main-feed" via debouncedCacheSave.
            let newLikes = posts[index].likes
            Task.detached(priority: .utility) { [feedCache = self.feedCache] in
                await feedCache.patchEverywhere(itemId: postId) {
                    $0.isLiked = liked
                    $0.likes = newLikes
                }
            }

            // Sync optimistic like state to GRDB so the feed cache matches.
            if let persistence = feedPersistence {
                let count = posts[index].likes
                Task.detached(priority: .utility) {
                    try? await persistence.updateLikeCount(postId: postId, count: count, isLikedByMe: liked)
                }
            }

            // R7 — roll back the optimistic like if the outbox exhausts its
            // retry budget (server permanently rejects). Without this the toggle
            // stays stuck "liked" forever even though the server never accepted it.
            observeOutcome(cmid: cmid, rollback: { [weak self] in
                self?.restoreLike(postId: postId, isLiked: wasLiked, likes: priorLikes)
            }, toast: String(localized: "feed.like.error", defaultValue: "Impossible d'aimer la publication", bundle: .main))
        } catch {
            // Roll back optimistic state if the outbox refuses the row.
            restoreLike(postId: postId, isLiked: wasLiked, likes: priorLikes)
        }
    }

    /// Restores a post's like state to a captured snapshot, re-resolving the
    /// index since the feed may have mutated during an `await`. Shared by the
    /// synchronous enqueue-refusal path and the async `.exhausted` observer.
    private func restoreLike(postId: String, isLiked: Bool, likes: Int) {
        guard let i = posts.firstIndex(where: { $0.id == postId }) else { return }
        var revert = posts[i]
        revert.isLiked = isLiked
        revert.likes = likes
        posts[i] = revert
        Task.detached(priority: .utility) { [feedCache = self.feedCache] in
            await feedCache.patchEverywhere(itemId: postId) {
                $0.isLiked = isLiked
                $0.likes = likes
            }
        }
        debouncedCacheSave()
    }

    /// Subscribes to the injected queue's `outcomeStream(for: cmid)` and runs
    /// `rollback` if the OutboxFlusher escalates the row to `.exhausted` (retry
    /// budget spent — the server permanently rejected it). `.applied` is a no-op
    /// (the optimistic state is already final).
    /// ⚠️ Le corps du Task ne capture PAS `self` : hors-ligne le stream peut ne
    /// jamais émettre, et un `guard let self` fort aurait retenu un VM fermé
    /// indéfiniment (un Task fantôme par like/post). Même forme que
    /// `UserProfileViewModel.observeOutcome`.
    private func observeOutcome(
        cmid: String,
        rollback: @escaping @MainActor () -> Void,
        toast: String
    ) {
        let queue = offlineQueue
        Task { @MainActor in
            let stream = await queue.outcomeStream(for: cmid)
            for await event in stream {
                if case .exhausted = event {
                    rollback()
                    FeedbackToastManager.shared.showError(toast)
                }
            }
        }
    }

    func bookmarkPost(_ postId: String) async {
        guard let post = posts.first(where: { $0.id == postId }) else { return }

        // Optimistic: insert into the local "bookmarks" cache so opening the
        // Favoris tab shows the post immediately. Mirror BookmarksViewModel's
        // snapshot/rollback pattern on failure.
        //
        // SWR: an in-cache list (fresh or stale) is the rollback target; an
        // expired/empty cache means there is nothing to roll back to and we
        // simply seed the bookmarks list with this post. The bookmarks list
        // itself is revalidated by `BookmarksViewModel` when the user opens
        // the Favoris tab, so we do NOT trigger a remote refresh here.
        let bookmarksKey = "bookmarks"
        let result = await feedCache.load(for: bookmarksKey)
        let cachedBookmarks: [FeedPost]
        switch result {
        case .fresh(let v, _), .stale(let v, _):
            cachedBookmarks = v
        case .expired, .empty:
            cachedBookmarks = []
        }
        let snapshot = cachedBookmarks
        if !cachedBookmarks.contains(where: { $0.id == postId }) {
            var updated = cachedBookmarks
            updated.insert(post, at: 0)
            try? await feedCache.savePreservingFreshness(updated, for: bookmarksKey)
        }
        FeedbackToastManager.shared.showSuccess(String(localized: "feed.bookmark.success", defaultValue: "Ajouté aux favoris", bundle: .main))

        do {
            let _: APIResponse<[String: Bool]> = try await api.request(
                PostsEndpoint.byPostIdBookmark(postId: postId),
                method: "POST"
            )
        } catch {
            // Rollback the optimistic cache insertion.
            try? await feedCache.savePreservingFreshness(snapshot, for: bookmarksKey)
            FeedbackToastManager.shared.showError(String(localized: "feed.bookmark.error", defaultValue: "Impossible d'enregistrer le favori", bundle: .main))
        }
    }

    /// `mobileTranscription` a été RETIRÉ de cette signature : plus aucun site
    /// de production ne le passait depuis que les deux jumeaux vocaux publient
    /// par `publish(_:)`. Un paramètre que personne ne remplit est du code mort
    /// testé vert — et, ici, la porte par laquelle un troisième chemin vocal
    /// pouvait renaître EN DEHORS de `PublishIntent`, sans faire rougir la
    /// garde qui compte les appelants de la fabrique.
    ///
    /// - Parameter mentions: les personnes que l'auteur a nommées SANS les
    ///   écrire — note sous le contenu, métadonnée silencieuse. `nil` quand il
    ///   n'en a déclaré aucune : le serveur relit alors les `@handle` du texte
    ///   lui-même, et déclarer `[]` lui ferait entendre un effacement.
    /// - Parameter discoverabilityPrecision: le SECOND opt-in de position
    ///   (spec du 2026-08-02 §2), indépendant du badge gouverné par
    ///   `location`. `nil` — le défaut — laisse le contenu non trouvable ;
    ///   aucun appelant ne doit poser une valeur que l'utilisateur n'a pas
    ///   choisie. Il voyage sur les DEUX branches ci-dessous : la file durable
    ///   emporte le cas nominal (un post texte + lieu), le chemin direct celui
    ///   d'une position SEULE, sans texte.
    func createPost(content: String? = nil, type: String = "POST", visibility: String = "PUBLIC", visibilityUserIds: [String]? = nil, mediaIds: [String]? = nil, audioUrl: String? = nil, audioDuration: Int? = nil, originalLanguage: String? = nil, location: SharedPlace? = nil, mentions: [PostMentionInput]? = nil, discoverabilityPrecision: DiscoverabilityPrecision? = nil) async {
        publishError = nil
        publishSuccess = false

        // U1 ST3 — a text-only POST routes through the durable outbox so it
        // survives offline + app kill (the direct postService.create below was
        // silently lost when offline). Media / audio posts stay on the direct
        // path for now (their assets are not yet durably queued — U1b).
        //
        // NE PAS réécrire ici que « seul type == "POST" peut être réconcilié » :
        // `core.ts` ne bifurque qu'entre STORY, STATUS et TOUT LE RESTE, et un
        // RÉEL passe par la même branche `else` qu'un POST — son cmid EST
        // échoué, et `postCreated` réconcilie par cmid SEUL, sans regarder le
        // type. La phrase énonçait plus étroit que le code, et un vocal enfilé
        // en `"REEL"` en dépend directement.
        let hasMedia = !(mediaIds?.isEmpty ?? true)
        // Task 17 — `CreatePostPayload` porte désormais `location` : un post
        // texte + position peut passer par la file durable comme n'importe
        // quel autre post texte, sa position survivant au flush.
        let isDurableTextOnly = type == "POST"
            && !hasMedia
            && audioUrl == nil
        if isDurableTextOnly,
           let text = content,
           !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            await enqueueDurableTextPost(content: text, visibility: visibility, visibilityUserIds: visibilityUserIds, originalLanguage: originalLanguage, location: location, mentions: mentions, discoverabilityPrecision: discoverabilityPrecision, storyEffects: nil, type: PostType.post.rawValue)
            return
        }

        do {
            let apiPost = try await postService.create(
                content: content,
                type: type,
                visibility: visibility,
                visibilityUserIds: visibilityUserIds,
                moodEmoji: nil,
                mediaIds: mediaIds,
                audioUrl: audioUrl,
                audioDuration: audioDuration,
                originalLanguage: originalLanguage,
                mobileTranscription: nil,
                repostOfId: nil,
                location: location,
                mentions: mentions,
                allowSoundExtraction: nil,
                mediaAlt: nil,
                // Le composer de FIL ne collecte pas encore de textes par
                // média — il n'a pas d'inspecteur média (#4045). `nil` dit
                // « je n'en parle pas », jamais « efface ».
                mediaCaption: nil,
                discoverabilityPrecision: discoverabilityPrecision
            )
            let feedPost = apiPost.toFeedPost(preferredLanguages: preferredLanguages)
            posts.insert(feedPost, at: 0)
            debouncedCacheSave()
            publishSuccess = true

            // Persist to GRDB
            if let persistence = feedPersistence, let record = PostRecord(from: apiPost) {
                Task.detached(priority: .utility) {
                    try? await persistence.insertPost(record)
                }
            }
        } catch {
            publishError = error.localizedDescription
        }
    }

    /// Publie un post/réel dont l'audio est un son EMPRUNTÉ à la bibliothèque.
    ///
    /// Aucun média à uploader : la piste `soundId` du blob `storyEffects` porte
    /// tout — le serveur enregistre un usage (`SoundUsage`) au lieu de capturer,
    /// et la règle de composition REEL compte la durée du son (miroir gateway).
    /// Passe par `APIClient` directement : `PostServiceProviding.create` ne
    /// transporte pas de `storyEffects`, et élargir le protocole pour un seul
    /// appel imposerait le champ à tous ses mocks.
    ///
    /// - Parameter mentions: les personnes que le composer nommait déjà quand
    ///   l'auteur a choisi un son emprunté plutôt que d'enregistrer — troisième
    ///   chemin audio, oublié la première fois que les deux autres l'ont gagné.
    func createBorrowedSoundPost(type: String, visibility: String = "PUBLIC", storyEffects: StoryEffects, mentions: [PostMentionInput]? = nil) async {
        publishError = nil
        publishSuccess = false
        do {
            let request = CreatePostRequest(
                type: type,
                visibility: visibility,
                storyEffects: storyEffects.sanitizedForServerPublish(),
                mentions: mentions
            )
            let response: APIResponse<APIPost> = try await api.request(
                PostsEndpoint.root,
                method: "POST",
                body: try JSONEncoder().encode(request)
            )
            let apiPost = response.data
            let feedPost = apiPost.toFeedPost(preferredLanguages: preferredLanguages)
            posts.insert(feedPost, at: 0)
            debouncedCacheSave()
            publishSuccess = true

            if let persistence = feedPersistence, let record = PostRecord(from: apiPost) {
                Task.detached(priority: .utility) {
                    try? await persistence.insertPost(record)
                }
            }
        } catch {
            publishError = error.localizedDescription
        }
    }

    /// U1 ST3 — inserts an optimistic post keyed by a fresh cmid and enqueues a
    /// durable `.createPost` row. The post appears instantly; the OutboxFlusher
    /// dispatches it (POST /posts with `X-Client-Mutation-Id`) and the gateway
    /// echoes the cmid on `post:created`, where FeedViewModel reconciles the
    /// optimistic post in place (cmid -> server id). Rolls back if the outbox
    /// refuses the row synchronously, or later exhausts its retry budget.
    /// **Le canvas passe AUSSI par ici** (#4756) : une scène faite d'un fond de
    /// couleur et d'objets texte n'a AUCUN fichier local, donc `publish(_:)`
    /// l'aiguille ici. Voir `PublishIntent.storyEffects`.
    private func enqueueDurableTextPost(content: String, visibility: String, visibilityUserIds: [String]? = nil, originalLanguage: String?, location: SharedPlace? = nil, mentions: [PostMentionInput]? = nil, discoverabilityPrecision: DiscoverabilityPrecision? = nil, storyEffects: StoryEffects?, type: String) async {
        let cmid = ClientMutationId.generate()
        let currentUser = AuthManager.shared.currentUser
        var optimistic = FeedPost(
            id: cmid,
            author: currentUser?.displayName ?? currentUser?.username ?? "",
            authorId: currentUser?.id ?? "",
            authorUsername: currentUser?.username,
            authorAvatarURL: currentUser?.avatar,
            type: "POST",
            content: content,
            timestamp: Date(),
            originalLanguage: originalLanguage
        )
        optimistic.location = location
        // La scène dès la carte optimiste (#4756) — `var`, posée après l'`init`.
        optimistic.storyEffects = storyEffects
        posts.insert(optimistic, at: 0)
        debouncedCacheSave()

        let payload = CreatePostPayload(
            clientMutationId: cmid,
            content: content,
            attachmentIds: [],
            visibility: visibility,
            originalLanguage: originalLanguage,
            // Sans lui, la charge persistée n'a AUCUN type et le gateway
            // applique son défaut `POST` (#5197). Il précède
            // `visibilityUserIds` : l'ordre suit la DÉCLARATION de
            // `CreatePostPayload.init`, que Swift n'autorise pas à réordonner.
            type: type,
            visibilityUserIds: visibilityUserIds,
            location: location,
            // `nil` et non `[]` quand rien n'est déclaré : le payload persisté
            // porte un VERDICT, et « je n'en parle pas » n'est pas « efface ».
            mentions: (mentions?.isEmpty ?? true) ? nil : mentions,
            // Le consentement de découvrabilité survit au flush pour la même
            // raison que `location` : sans lui ici, cocher « trouvable à
            // proximité » sur un post TEXTE — le cas nominal, qui n'emprunte
            // que cette file — n'aurait aucun effet, et rien ne le dirait.
            discoverabilityPrecision: discoverabilityPrecision,
            storyEffects: storyEffects
        )
        do {
            try await offlineQueue.enqueue(.createPost, payload: payload, conversationId: nil)
            publishSuccess = true
            observeOutcome(cmid: cmid, rollback: { [weak self] in
                self?.removeOptimisticPost(id: cmid)
            }, toast: String(localized: "feed.post.publish.error", defaultValue: "Erreur lors de la publication", bundle: .main))
        } catch {
            removeOptimisticPost(id: cmid)
            publishError = error.localizedDescription
        }
    }

    /// A post/reel is "stuck offline" (recoverable as a composer draft) once it
    /// has been unsent for longer than this — the "pas envoyé dans la minute →
    /// offline" rule shared by every composer. `nonisolated` so it can be read
    /// from any isolation (matches `SyncPillViewModel.staleInflightThreshold`).
    nonisolated static let offlineStuckThreshold: TimeInterval = 60

    /// Returns the last POST/REEL that got stuck offline (unsent for more than
    /// `offlineStuckThreshold`) so the feed composer can pre-fill it as a draft.
    ///
    /// **Une ligne dont un média est de l'AUDIO n'est jamais proposée, et c'est
    /// une garde de CONTENU, pas une préférence d'ergonomie.**
    ///
    /// Le composer du feed ne sait pas rouvrir un enregistrement : sa
    /// restauration ne traite que l'image et la vidéo
    /// (`FeedView+Attachments.restoreRecoveredMedia`). Offrir la ligne quand
    /// même produisait une chaîne complète de DESTRUCTION — brouillon
    /// « restauré » VIDE (un vocal n'a pas de texte), `recoveredPostCmid` posé
    /// malgré tout, puis, à la publication suivante quelle qu'elle soit,
    /// `supersedeRecoveredPost` → `cancelCreatePost`, qui efface le fichier
    /// relocalisé ET la ligne. L'enregistrement n'a alors JAMAIS été vu par son
    /// auteur, et rien ne le lui dit.
    ///
    /// Le trou n'existait pas avant que les deux jumeaux audio entrent dans
    /// cette file : `case .audio: break` y était juste, et son commentaire
    /// (« audio offline posts aren't queued through this composer path yet »)
    /// était vrai. Un lot qui fait CONVERGER une chaîne doit énumérer les
    /// CONSOMMATEURS de la ligne qu'il vient de créer, pas seulement les
    /// producteurs.
    ///
    /// Prix assumé : tant qu'un vocal est bloqué en file, aucun brouillon plus
    /// ancien n'est proposé. Une affordance de reprise retardée n'est pas
    /// comparable à un enregistrement détruit.
    func recoverUnsentPost() async -> RecoveredOfflinePost? {
        let draft = await offlineQueue.recoverLastUnsentPost(
            matchingTypes: ["POST", "REEL"],
            olderThan: Self.offlineStuckThreshold
        )
        guard let draft else { return nil }
        let porteUneVoix = draft.localMediaURLs.contains { url in
            AttachmentKind(mimeType: MimeTypeResolver.mimeType(forURL: url)) == .audio
        }
        return porteUneVoix ? nil : draft
    }

    /// Supersedes a recovered post/reel when the user re-sends it from the
    /// composer, so the resend replaces the stuck row (and reclaims its
    /// pending-media files) instead of duplicating it on reconnect.
    ///
    /// Also drops the orphaned optimistic feed post keyed by this cmid: an
    /// offline post/reel was inserted optimistically (id == cmid) when first
    /// queued, and its `.createPost` row is what we're now deleting — without
    /// this the optimistic card would linger in the feed forever (its row gone,
    /// so it can never reconcile). The resend inserts a fresh optimistic card
    /// under a new cmid.
    func supersedeRecoveredPost(clientMutationId: String) async {
        removeOptimisticPost(id: clientMutationId)
        await offlineQueue.cancelCreatePost(clientMutationId: clientMutationId)
    }

    /// Removes an optimistic post by id (re-resolving the index since the feed
    /// may mutate across an `await`). Rolls back a queued create the outbox
    /// refused or exhausted.
    private func removeOptimisticPost(id: String) {
        guard let i = posts.firstIndex(where: { $0.id == id }) else { return }
        posts.remove(at: i)
        debouncedCacheSave()
    }

    /// U1b — durably publishes an OFFLINE media post. Inserts an optimistic post
    /// keyed by a fresh cmid (rendering the picked files as a local-URL preview)
    /// and routes the media through `enqueuePostMedia` (relocate + write-ahead
    /// `.createPost`). The OutboxFlusher uploads the files via TUS on reconnect
    /// and creates the post; the gateway echoes the cmid on `post:created`, where
    /// the reconcile (U1 ST2) swaps the optimistic post for the server one (no
    /// duplicate). Rolls back on synchronous enqueue refusal or `.exhausted`.
    /// Falls back to the text-only path when there are no media URLs.
    ///
    /// `type` mirrors the online media path (`ReelComposition.defaultType`): a
    /// video / multi-image post created offline is enqueued as a `REEL` so it
    /// lands on the reels surface once the OutboxFlusher uploads it — reusing the
    /// exact post durability machinery, only the server-side `type` differs.
    ///
    /// `location` widens the call surface so both `FeedView+Attachments.swift`
    /// call sites can pass `pendingPlace` — Task 17 a donné à `CreatePostPayload`
    /// / `enqueuePostMedia` un champ `location`, donc un média posté hors-ligne
    /// avec une position attachée la conserve désormais jusqu'au flush.
    ///
    /// `discoverabilityPrecision` fait le même trajet, et devait le faire :
    /// sans lui, la position d'un REEL hors ligne survivait au flush pendant
    /// que le consentement, lui, se perdait entre le composer et la file.
    func createOfflineMediaPost(
        localMediaURLs: [URL],
        content: String?,
        visibility: String = "PUBLIC",
        visibilityUserIds: [String]? = nil,
        originalLanguage: String? = nil,
        type: String = "POST",
        location: SharedPlace? = nil,
        mentions: [PostMentionInput]? = nil,
        discoverabilityPrecision: DiscoverabilityPrecision? = nil,
        /// SANS défaut, délibérément : un média VISUEL n'a pas de voix, et il
        /// le DIT en toutes lettres. Un défaut ici ferait disparaître la
        /// transcription d'un site d'appel sans casser la moindre compilation
        /// — le mécanisme exact par lequel la branche hors ligne de
        /// `StatusViewModel.setStatus` avait perdu la source et la voix d'un
        /// mood pendant que sa jumelle en ligne les passait.
        mobileTranscription: MobileTranscriptionPayload?,
        /// Le canvas (#4756), sans défaut — même raison qu'au-dessus.
        storyEffects: StoryEffects?,
        /// Les légendes par fichier (#4756), alignées par index sur `localMediaURLs`.
        mediaCaptions: [String?]?
    ) async {
        publishError = nil
        publishSuccess = false
        guard !localMediaURLs.isEmpty else {
            await enqueueDurableTextPost(
                content: content ?? "",
                visibility: visibility,
                // Le repli perdait la liste NOMMÉE d'une audience
                // `ONLY`/`EXCEPT` — `visibilityUserIds` porte un défaut `nil`
                // chez le destinataire, et un défaut fait disparaître un champ
                // d'un site d'appel sans casser la moindre compilation. Le
                // gateway refuse alors la charge (`CreatePostSchema.refine`),
                // le rejet est PERMANENT, et le post est perdu.
                visibilityUserIds: visibilityUserIds,
                originalLanguage: originalLanguage,
                location: location,
                mentions: mentions,
                discoverabilityPrecision: discoverabilityPrecision,
                // Le repli sans média porte la scène (#4756).
                storyEffects: storyEffects,
                // …et son TYPE (#5197) : sans lui, un réel ou une story
                // composés d'une scène sans fichier local partaient en POST.
                type: type
            )
            return
        }

        await enqueueDurableMediaPost(
            clientMutationId: ClientMutationId.generate(),
            localMediaURLs: localMediaURLs,
            // Ce chemin n'a AUCUN MIME sous la main — il le DIT plutôt que de
            // laisser un défaut le dire pour lui. Le dispatcher retombe alors
            // sur l'extension, ce qui suffit pour des médias VISUELS (toutes
            // leurs extensions sont dans la table) et ne suffisait pas pour une
            // voix importée depuis Fichiers.
            localMediaMimeTypes: nil,
            content: content,
            visibility: visibility,
            visibilityUserIds: visibilityUserIds,
            originalLanguage: originalLanguage,
            type: type,
            location: location,
            mentions: mentions,
            discoverabilityPrecision: discoverabilityPrecision,
            mobileTranscription: mobileTranscription,
            storyEffects: storyEffects,
            mediaCaptions: mediaCaptions
        )
    }

    /// **Le geste « je publie ce que j'ai produit ».**
    ///
    /// Un `PublishIntent` est une matière composée UNE fois, à un endroit
    /// nommé : ce publieur ne la recompose pas, il la transporte. C'est tout
    /// l'objet du lot — deux points d'entrée d'un même geste (un enregistrement
    /// vocal) le composaient chacun à leur façon et divergeaient sur trois
    /// points à la fois, dont la DESTRUCTION du fichier de l'utilisateur.
    ///
    /// **Aucune condition réseau ici, et c'est une décision.** Un enregistrement
    /// local part par la file durable EN LIGNE COMME HORS LIGNE. Ce qu'on y perd
    /// est mesuré et nul (aucun des deux jumeaux n'écrivait `uploadProgress`) ;
    /// ce qu'on y gagne, c'est un post optimiste immédiat qui survit à un kill.
    /// Y remettre une condition ferait renaître deux comportements, et la
    /// branche la moins empruntée serait — comme hier — celle qui détruit. Une
    /// garde de source le retient.
    ///
    /// Le jeton de l'intention est repris tel quel : c'est LUI qui clé le post
    /// optimiste, et c'est par lui que l'écho du gateway le remplacera au flush.
    func publish(_ intent: PublishIntent) async {
        publishError = nil
        publishSuccess = false
        await enqueueDurableMediaPost(
            clientMutationId: intent.clientMutationId,
            localMediaURLs: intent.localMediaURLs,
            localMediaMimeTypes: intent.localMediaMimeTypes,
            content: intent.content,
            visibility: intent.visibility,
            visibilityUserIds: intent.visibilityUserIds,
            originalLanguage: intent.originalLanguage,
            type: intent.type,
            location: intent.location,
            mentions: intent.mentions,
            discoverabilityPrecision: intent.discoverabilityPrecision,
            mobileTranscription: intent.mobileTranscription,
            storyEffects: intent.storyEffects,
            mediaCaptions: intent.mediaCaptions
        )
    }

    /// Le cœur PARTAGÉ des deux entrées ci-dessus — insertion optimiste +
    /// enfilage durable. Il prend le jeton en paramètre plutôt que de le
    /// fabriquer : `publish(_:)` doit reprendre celui de l'intention, sans quoi
    /// le post optimiste serait clé par un identifiant que rien n'échoue, et le
    /// vocal apparaîtrait EN DOUBLE au flush.
    private func enqueueDurableMediaPost(
        clientMutationId cmid: String,
        localMediaURLs: [URL],
        localMediaMimeTypes: [String]?,
        content: String?,
        visibility: String,
        visibilityUserIds: [String]?,
        originalLanguage: String?,
        type: String,
        location: SharedPlace?,
        mentions: [PostMentionInput]?,
        discoverabilityPrecision: DiscoverabilityPrecision?,
        mobileTranscription: MobileTranscriptionPayload?,
        storyEffects: StoryEffects?,
        mediaCaptions: [String?]?
    ) async {
        let currentUser = AuthManager.shared.currentUser
        var optimistic = FeedPost(
            id: cmid,
            author: currentUser?.displayName ?? currentUser?.username ?? "",
            authorId: currentUser?.id ?? "",
            authorUsername: currentUser?.username,
            authorAvatarURL: currentUser?.avatar,
            type: type,
            content: content ?? "",
            timestamp: Date(),
            media: localMediaURLs.enumerated().map { index, url in
                Self.optimisticFeedMedia(
                    forLocalURL: url,
                    declaredMimeType: localMediaMimeTypes.flatMap {
                        $0.indices.contains(index) ? $0[index] : nil
                    }
                )
            },
            originalLanguage: originalLanguage
        )
        optimistic.storyEffects = storyEffects   // la scène, #4756
        posts.insert(optimistic, at: 0)
        debouncedCacheSave()

        do {
            _ = try await offlineQueue.enqueuePostMedia(
                sourceMediaURLs: localMediaURLs,
                // Le MIME que l'expéditeur a DÉCLARÉ, et non celui que
                // l'extension laissera deviner : les deux divergent dès qu'un
                // conteneur audio sort de la table, et le gateway perd alors la
                // nature audio du fichier.
                sourceMediaMimeTypes: localMediaMimeTypes,
                clientMutationId: cmid,
                content: content,
                visibility: visibility,
                visibilityUserIds: visibilityUserIds,
                originalLanguage: originalLanguage,
                type: type,
                location: location,
                mentions: (mentions?.isEmpty ?? true) ? nil : mentions,
                // Voyage avec `location`, et pour la même raison : un REEL
                // composé hors ligne emportait sa position mais jamais son
                // consentement, donc le gateway laissait `geoPoint` nul et la
                // case cochée par l'utilisateur n'avait aucun effet.
                discoverabilityPrecision: discoverabilityPrecision,
                // Ce qui QUALIFIE un enregistrement vocal : sans lui, le
                // serveur re-transcrit et jette en silence le texte que
                // l'auteur a relu avant d'envoyer.
                mobileTranscription: mobileTranscription,
                storyEffects: storyEffects,
                // Les légendes voyagent par l'INDEX du fichier (#4756) : l'id
                // serveur n'existera qu'à l'upload, et le dispatcher fait
                // seul la traduction.
                mediaCaptions: mediaCaptions
            )
            publishSuccess = true
            observeOutcome(cmid: cmid, rollback: { [weak self] in
                self?.removeOptimisticPost(id: cmid)
            }, toast: String(localized: "feed.post.publish.error", defaultValue: "Erreur lors de la publication", bundle: .main))
        } catch {
            removeOptimisticPost(id: cmid)
            publishError = error.localizedDescription
        }
    }

    /// Builds the optimistic `FeedMedia` for a not-yet-uploaded local file,
    /// deriving the type from its DECLARED mime — and only from its extension
    /// when nothing was declared. The `file://` URL is replaced by the server
    /// media URL on reconcile.
    ///
    /// La distinction n'est pas cosmétique : un vocal importé en `.caf` se
    /// re-dérivait en `application/octet-stream`, donc `AttachmentKind` le
    /// classait autrement qu'audio et la carte optimiste s'affichait comme une
    /// IMAGE — un lecteur absent là où l'auteur venait d'enregistrer sa voix.
    private static func optimisticFeedMedia(
        forLocalURL url: URL, declaredMimeType: String?
    ) -> FeedMedia {
        let mime = declaredMimeType ?? MimeTypeResolver.mimeType(forExtension: url.pathExtension)
        let type: FeedMediaType
        switch AttachmentKind(mimeType: mime) {
        case .video: type = .video
        case .audio: type = .audio
        default: type = .image
        }
        return FeedMedia(type: type, url: url.absoluteString)
    }

    func sendComment(postId: String, content: String, parentId: String? = nil, effectFlags: Int? = nil) async {
        guard let index = posts.firstIndex(where: { $0.id == postId }) else { return }
        // T10c — optimistic insert + durable outbox enqueue (survives offline +
        // app kill, flushes on reconnect via T10) instead of the direct
        // postService call that silently lost the comment offline. The real
        // server comment reconciles via `comment:added` / a feed refresh.
        // Mirrors PostDetailViewModel.sendComment.
        let cmid = ClientMutationId.generate()
        let snapshot = posts[index].comments
        let snapshotCount = posts[index].commentCount
        let currentUser = AuthManager.shared.currentUser
        let optimistic = FeedComment(
            id: cmid,
            author: currentUser?.displayName ?? currentUser?.username ?? "",
            authorId: currentUser?.id ?? "",
            authorAvatarURL: currentUser?.avatar,
            content: content,
            timestamp: Date(),
            likes: 0, replies: 0,
            parentId: parentId,
            effectFlags: effectFlags ?? 0
        )
        posts[index].comments.insert(optimistic, at: 0)
        posts[index].commentCount += 1

        let payload = CreateCommentPayload(
            clientMutationId: cmid,
            postId: postId,
            parentCommentId: parentId,
            content: content
        )
        do {
            try await offlineQueue.enqueue(.createComment, payload: payload, conversationId: postId)

            // R7 — roll back the optimistic comment if the outbox exhausts its
            // retry budget (server permanently rejects). The synchronous catch
            // below only covers an enqueue refusal; without this observer a
            // permanently-failing comment stays in the feed forever.
            observeOutcome(cmid: cmid, rollback: { [weak self] in
                guard let self, let i = self.posts.firstIndex(where: { $0.id == postId }) else { return }
                self.posts[i].comments = snapshot
                self.posts[i].commentCount = snapshotCount
            }, toast: String(localized: "feed.comment.sendError", defaultValue: "Impossible d'envoyer le commentaire", bundle: .main))
        } catch {
            // Roll back the optimistic comment if the outbox refuses the row
            // (re-resolve the index — the feed may have mutated during the await).
            if let i = posts.firstIndex(where: { $0.id == postId }) {
                posts[i].comments = snapshot
                posts[i].commentCount = snapshotCount
            }
            FeedbackToastManager.shared.showError(String(localized: "feed.comment.sendError", defaultValue: "Impossible d'envoyer le commentaire", bundle: .main))
        }
    }

    /// L'ÉCRIVAIN UNIQUE de la republication (lot 7, tâche 7.5), construit sur
    /// les dépendances DÉJÀ injectées de ce modèle : un double de test continue
    /// donc d'observer l'envoi, et la branche hors ligne écrit dans la même
    /// file que les autres gestes de ce modèle.
    private var repostPublisher: RepostPublisher {
        RepostPublisher(postService: postService, offlineQueue: offlineQueue)
    }

    func repostPost(_ postId: String, content: String? = nil, isQuote: Bool = false) async {
        do {
            // La RÉFÉRENCE remonte à la racine, le FORMAT reste celui de la
            // carte : reposter depuis le fil le repost-de-story de quelqu'un
            // doit donner un post dans son fil, jamais une story dans son tray.
            let cible = RepostTargeting.target(
                cardId: postId,
                cardType: posts.first(where: { $0.id == postId })?.type,
                repostOfId: posts.first(where: { $0.id == postId })?.repost?.id,
                originalRepostOfId: posts.first(where: { $0.id == postId })?.repost?.originalRepostOfId
            )
            // Le feed ne propose pas de sélecteur d'audience : on hérite de
            // l'original (`visibility: nil`). La règle « un commentaire blanc
            // n'est pas une citation » vit dans `RepostIntent.quoted`, avec les
            // trois autres sites qui l'écrivaient chacun de leur côté.
            let intention: RepostIntent = isQuote
                ? RepostIntent.quoted(postId: cible.postId, targetType: cible.targetType,
                                      comment: content, visibility: nil)
                : RepostIntent.simple(postId: cible.postId, targetType: cible.targetType,
                                      visibility: nil)
            try await repostPublisher.publish(intention)
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "feed.repost.error", defaultValue: "Erreur lors du repost", bundle: .main))
        }
    }

    // `resolveRepostTargetId(_:)` a vécu ici sans site d'appel. La règle qu'elle
    // portait — re-partager un PARTAGE doit référencer la RACINE, jamais le
    // partage intermédiaire — est bien appliquée, mais par `ComposerIntent`
    // (`let reference = originalRepostOfId ?? repostOfId ?? cardId`), que ce
    // fichier alimente déjà en lui passant `originalRepostOfId` directement.
    // Le retrait ne relâche donc aucun invariant : il retire la SECONDE
    // implémentation d'une règle qui n'en veut qu'une.

    /// Server-side payload returned by `POST /posts/:postId/share`. The
    /// counter fields are always present; `shortUrl` + `token` are only
    /// populated when the caller asked the gateway to mint a TrackingLink
    /// for the share (so the user gets an attributable `meeshy.me/l/…`
    /// URL to paste into any external share sheet).
    struct PostSharePayload: Decodable {
        let shared: Bool
        let shareCount: Int
        let shortUrl: String?
        let token: String?
    }

    /// Records a share on `postId`. When `generateLink` is `true` the
    /// gateway mints a `TrackingLink` owned by the current user and returns
    /// the absolute short URL — returned here so the caller can immediately
    /// hand it off to a `UIActivityViewController` / `ShareLink`.
    @discardableResult
    func sharePost(_ postId: String, platform: String? = nil, generateLink: Bool = false) async -> String? {
        var body: [String: Any] = [:]
        if let platform { body["platform"] = platform }
        if generateLink { body["generateLink"] = true }

        do {
            let bodyData = try JSONSerialization.data(withJSONObject: body)
            let response: APIResponse<PostSharePayload> = try await api.request(
                PostsEndpoint.byPostIdShare(postId: postId),
                method: "POST",
                body: bodyData
            )
            return response.data.shortUrl
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "feed.share.error", defaultValue: "Impossible de partager la publication", bundle: .main))
            return nil
        }
    }

    func deletePost(_ postId: String) async {
        let snapshot = posts
        posts.removeAll { $0.id == postId }

        do {
            try await postService.delete(postId: postId)
            debouncedCacheSave()

            // Remove from GRDB
            if let persistence = feedPersistence {
                Task.detached(priority: .utility) {
                    try? await persistence.deletePost(id: postId)
                }
            }

            FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.deleted", defaultValue: "Publication supprimée", bundle: .main))
        } catch {
            posts = snapshot
            FeedbackToastManager.shared.showError(String(localized: "feed.post.deleteError", defaultValue: "Erreur lors de la suppression", bundle: .main))
        }
    }

    func reportPost(_ postId: String) async {
        do {
            try await ReportService.shared.reportPost(postId: postId, reportType: "inappropriate", reason: nil)
            FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.reported", defaultValue: "Publication signalée", bundle: .main))
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "feed.post.reportError", defaultValue: "Erreur lors du signalement", bundle: .main))
        }
    }

    /// Updates the body content of an authored post. Optimistic UX:
    /// the new text is written into `posts[idx]` immediately, translations
    /// are cleared (the gateway re-translates in background and pushes
    /// `post:updated` via socket). Rolls back the snapshot on API failure.
    /// No-op if the post isn't found in the current feed.
    func updatePost(
        _ postId: String,
        content: String,
        language: String? = nil,
        type: String? = nil,
        removeMediaIds: [String]? = nil,
        location: PostLocationUpdate? = nil,
        visibility: String? = nil,
        visibilityUserIds: [String]? = nil,
        known: Set<PostEditField> = EditPostDraft.documentFields
    ) async {
        guard let idx = posts.firstIndex(where: { $0.id == postId }) else { return }
        let snapshot = posts[idx]
        // Apply optimistic mutation: new content + clear translations so the
        // bubble re-renders with the new source text immediately. A language
        // change re-runs translation server-side, so the stale map is dropped.
        var optimistic = snapshot
        optimistic.content = content
        optimistic.translatedContent = nil
        optimistic.translations = nil
        switch location {
        case .set(let place): optimistic.location = place
        case .remove: optimistic.location = nil
        case nil: break
        }
        // L'audience bouge tout de suite, comme le texte : sans cela le badge
        // de visibilité garde l'ancienne valeur jusqu'au prochain
        // rafraîchissement et l'auteur croit son resserrement perdu.
        if let visibility {
            optimistic.visibility = visibility
            optimistic.visibilityUserIds = visibilityUserIds
        }
        posts[idx] = optimistic
        debouncedCacheSave()
        do {
            // Le corps ne se construit plus ici : `known` dit ce que la
            // surface a su RENDRE, `PostEditPayload.build` en tire le PUT. Un
            // champ non déclaré est OMIS, et le serveur préserve le sien.
            let updated = try await postService.update(postId: postId, known: known, draft: PostEditDraft(
                content: content, visibility: visibility, visibilityUserIds: visibilityUserIds,
                originalLanguage: language, type: type, removeMediaIds: removeMediaIds,
                location: location
            ))
            // Re-hydrate from the server response so the gateway-authoritative
            // fields (updatedAt, isEdited, sanitized content, …) replace the
            // optimistic in-memory copy. Preserves the resolved translation
            // for the user's preferred language chain.
            if let newIdx = posts.firstIndex(where: { $0.id == postId }) {
                posts[newIdx] = updated.toFeedPost(preferredLanguages: preferredLanguages)
                debouncedCacheSave()
            }
            FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.edited", defaultValue: "Publication modifiée", bundle: .main))
        } catch {
            // Rollback the optimistic snapshot.
            if let rollbackIdx = posts.firstIndex(where: { $0.id == postId }) {
                posts[rollbackIdx] = snapshot
                debouncedCacheSave()
            }
            FeedbackToastManager.shared.showError(String(localized: "feed.post.editError", defaultValue: "Erreur lors de la modification", bundle: .main))
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

    // MARK: - Translation

    func setTranslationOverride(postId: String, language: String) {
        guard let index = posts.firstIndex(where: { $0.id == postId }),
              let translation = posts[index].translations?[language] else { return }
        posts[index].translatedContent = translation.text
    }

    /// Re-resolves the post's displayed language back to the Prisme default
    /// (undoes a manual flag-tap override). Previously did an exact-key
    /// dictionary lookup on `userLanguage` alone — case-sensitive AND only
    /// ever consulting the FIRST preferred language, so a francophone with
    /// `["de", "fr"]` preferred languages (or any uppercase-cased locale
    /// string) lost their translation even though "fr" matched further down
    /// the chain. `resolved(preferredLanguages:)` walks the FULL chain
    /// case-insensitively, matching the same algorithm used everywhere else
    /// in the Prisme (never `translations.first`).
    func clearTranslationOverride(postId: String) {
        guard let index = posts.firstIndex(where: { $0.id == postId }) else { return }
        posts[index] = posts[index].resolved(preferredLanguages: preferredLanguages)
    }

    func requestTranslation(postId: String, targetLanguage: String) async {
        do {
            try await postService.requestTranslation(postId: postId, targetLanguage: targetLanguage)
        } catch {
            // Translation will arrive via socket event
        }
    }

    // MARK: - Socket.IO Real-Time Updates

    func subscribeToSocketEvents() {
        guard socketCancellables.isEmpty else { return }
        let isRearm = hasSubscribedOnce
        hasSubscribedOnce = true
        socialSocket.connect()
        // stores-02 — connect() est un no-op si le socket est déjà connecté :
        // le handler .connect (seul émetteur de feed:subscribe) ne rejoue pas,
        // et la room feed quittée par unsubscribeFromSocketEvents() n'était
        // jamais rejointe. Émission idempotente (rejoindre une room déjà
        // jointe = no-op) ; socket pas encore prêt → l'emit est perdu mais
        // rejoué par le handler .connect.
        socialSocket.subscribeFeed()
        if isRearm {
            // rts-01 — même chemin que le sink didReconnect ci-dessous, pour
            // l'aller-retour d'écran SANS coupure réseau (didReconnect ne
            // couvre que le flap) : gardé par isFeedLoadInProgress, silencieux
            // (showLoading: posts.isEmpty), et mergePreservingRealtimeHead
            // protège les posts insérés par un sink pendant le vol.
            Task { await self.loadFeed(forceRefresh: true) }
        }

        // --- didReconnect → backfill du feed ---
        // Apres un flap reseau, le gateway a oublie nos rooms et des posts ont pu
        // etre crees pendant la coupure. Un refresh (forceRefresh) recharge la tete
        // du feed ; mergePreservingRealtimeHead conserve les posts inseres en temps
        // reel. Miroir de ConversationSyncEngine sur messageSocket.didReconnect.
        socialSocket.didReconnect
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in
                guard let self else { return }
                Task { await self.loadFeed(forceRefresh: true) }
            }
            .store(in: &socketCancellables)

        // --- post:created ---
        socialSocket.postCreated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                guard let self else { return }
                let feedPost = payload.post.toFeedPost(preferredLanguages: preferredLanguages)
                // U1 — reconcile an offline-created optimistic post: it was
                // inserted with the cmid as its id (U1 ST3), so the server echo
                // (carrying that cmid) replaces it in place — swapping cmid →
                // server id — instead of inserting a duplicate. Preserve local-
                // only state (isLiked) across the swap, like postUpdated.
                if let cmid = payload.clientMutationId,
                   let idx = self.posts.firstIndex(where: { $0.id == cmid }) {
                    var merged = feedPost
                    merged.isLiked = self.posts[idx].isLiked
                    self.posts[idx] = merged
                    self.debouncedCacheSave()
                    return
                }
                if !self.posts.contains(where: { $0.id == feedPost.id }) {
                    self.posts.insert(feedPost, at: 0)
                    self.newPostsCount += 1
                    self.debouncedCacheSave()
                }
            }
            .store(in: &socketCancellables)

        // --- post:updated ---
        socialSocket.postUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] apiPost in
                guard let self else { return }
                let updatedFeedPost = apiPost.toFeedPost(preferredLanguages: preferredLanguages)
                if let index = self.posts.firstIndex(where: { $0.id == updatedFeedPost.id }) {
                    // Preserve local-only state (isLiked) across the update
                    var merged = updatedFeedPost
                    merged.isLiked = self.posts[index].isLiked
                    self.posts[index] = merged
                    self.debouncedCacheSave()
                }
            }
            .store(in: &socketCancellables)

        // --- post:deleted ---
        socialSocket.postDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] postId in
                self?.posts.removeAll { $0.id == postId }
                self?.debouncedCacheSave()
            }
            .store(in: &socketCancellables)

        // --- post:liked --- (compteur ABSOLU, source unique du like de post)
        socialSocket.postLiked
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
                self.posts[index].likes = data.likeCount
                // Persister `isLiked` pour l'acteur → le cache reste correct au cold
                // start (le seeding `postLikedIds` relit `post.isLiked`).
                if data.userId == AuthManager.shared.currentUser?.id {
                    self.posts[index].isLiked = true
                }
                self.debouncedCacheSave()
            }
            .store(in: &socketCancellables)

        // --- post:unliked ---
        socialSocket.postUnliked
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
                self.posts[index].likes = data.likeCount
                if data.userId == AuthManager.shared.currentUser?.id {
                    self.posts[index].isLiked = false
                }
                self.debouncedCacheSave()
            }
            .store(in: &socketCancellables)

        // --- post:bookmarked ---
        // Le favori est PERSONNEL : le gateway n'émet `post:bookmarked` que vers la
        // feed room du viewer (toutes ses sessions/vues, dont le reel viewer). On
        // réconcilie `isBookmarkedByMe` sur le post → le re-seed du reel viewer
        // depuis `FeedViewModel.posts` porte le bon état (favori persistant).
        socialSocket.postBookmarked
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                guard let self else { return }
                if let index = self.posts.firstIndex(where: { $0.id == payload.postId }) {
                    self.posts[index].isBookmarkedByMe = payload.bookmarked
                    // Absolute count (when the gateway provides it) is authoritative
                    // → the feed reconciles the displayed count live, no reload.
                    if let count = payload.bookmarkCount {
                        self.posts[index].bookmarkCount = count
                    }
                }
                self.debouncedCacheSave()
            }
            .store(in: &socketCancellables)

        // --- post:reposted ---
        socialSocket.postReposted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self else { return }
                // `post:reposted` n'est pas type : une story repostee y arrivait
                // et entrait dans le fil, alors qu'elle vit dans le tray.
                // `getFeed` ne sert que `[POST, REEL]` — meme partage ici.
                guard !data.repost.belongsToStoryTray else { return }
                let repostFeedPost = data.repost.toFeedPost(preferredLanguages: self.preferredLanguages)
                if !self.posts.contains(where: { $0.id == repostFeedPost.id }) {
                    self.posts.insert(repostFeedPost, at: 0)
                    self.newPostsCount += 1
                    self.debouncedCacheSave()
                }
            }
            .store(in: &socketCancellables)

        // --- comment:added ---
        socialSocket.commentAdded
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
                // Prisme + effects parity with the REST comment mapping
                // (`toFeedPost`/`loadComments`): a comment arriving in real
                // time while the feed is open used to render as a blank row
                // for a media/effect comment (effectFlags dropped) and
                // always in its original language (no resolveCommentTranslation),
                // and lost the "liked by me" heart on a comment that already
                // carried reactions when it landed (currentUserReactions dropped).
                let translatedContent = PostDetailViewModel.resolveCommentTranslation(
                    translations: data.comment.translations,
                    originalLanguage: data.comment.originalLanguage,
                    preferredLanguages: self.preferredLanguages
                )
                let feedComment = FeedComment(
                    id: data.comment.id, author: data.comment.author.name,
                    authorId: data.comment.author.id,
                    authorAvatarURL: data.comment.author.avatar,
                    content: data.comment.content, timestamp: data.comment.createdAt,
                    likes: data.comment.likeCount ?? 0, replies: data.comment.replyCount ?? 0,
                    parentId: data.comment.parentId,
                    effectFlags: data.comment.effectFlags ?? 0,
                    originalLanguage: data.comment.originalLanguage,
                    translatedContent: translatedContent,
                    currentUserReactions: data.comment.currentUserReactions,
                    location: data.comment.location
                )
                // Écho de NOTRE propre envoi : la ligne optimiste a été insérée
                // sous l'id local `cmid` (sendComment) — la remplacer en place,
                // sinon l'écho (id serveur ≠ cmid) passait la dédup par id et
                // insérait un doublon visible jusqu'au prochain refresh.
                if let cmid = data.clientMutationId,
                   let optimisticIdx = self.posts[index].comments.firstIndex(where: { $0.id == cmid }) {
                    self.posts[index].comments[optimisticIdx] = feedComment
                } else if !self.posts[index].comments.contains(where: { $0.id == feedComment.id }) {
                    self.posts[index].comments.insert(feedComment, at: 0)
                }
                self.posts[index].commentCount = data.commentCount
                self.debouncedCacheSave()
            }
            .store(in: &socketCancellables)

        // --- comment:deleted ---
        socialSocket.commentDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
                self.posts[index].commentCount = data.commentCount
                self.debouncedCacheSave()
            }
            .store(in: &socketCancellables)

        // --- post:translation-updated ---
        socialSocket.postTranslationUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] (data: SocketPostTranslationUpdatedData) in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
                let translation = PostTranslation(
                    text: data.translation.text,
                    translationModel: data.translation.translationModel,
                    confidenceScore: data.translation.confidenceScore
                )
                let langs = self.preferredLanguages
                let language = data.language
                // Batch mutations into a single array assignment
                var post = self.posts[index]
                Self.applyPostTranslation(translation, language: language,
                                          preferredLanguages: langs, to: &post)
                self.posts[index] = post
                // Un post vit sous PLUSIEURS clés (main-feed, sa clé détail,
                // bookmarks, pager reels) : `debouncedCacheSave` ne réécrit que
                // « main-feed », donc la traduction n'existait que là et
                // repartait de zéro dès qu'une autre surface servait le post.
                let postId = data.postId
                Task.detached(priority: .utility) { [feedCache = self.feedCache] in
                    await feedCache.patchEverywhere(itemId: postId) {
                        Self.applyPostTranslation(translation, language: language,
                                                  preferredLanguages: langs, to: &$0)
                    }
                }
                self.debouncedCacheSave()
            }
            .store(in: &socketCancellables)

        // --- comment:translation-updated ---
        socialSocket.commentTranslationUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] (data: SocketCommentTranslationUpdatedData) in
                guard let self, let postIndex = self.posts.firstIndex(where: { $0.id == data.postId })
                else { return }
                let langs = self.preferredLanguages
                let language = data.language
                let commentId = data.commentId
                let text = data.translation.text
                var post = self.posts[postIndex]
                let changed = Self.applyCommentTranslation(
                    text, commentId: commentId, language: language,
                    preferredLanguages: langs, to: &post
                )
                guard changed else { return }
                self.posts[postIndex] = post
                let postId = data.postId
                Task.detached(priority: .utility) { [feedCache = self.feedCache] in
                    await feedCache.patchEverywhere(itemId: postId) {
                        _ = Self.applyCommentTranslation(
                            text, commentId: commentId, language: language,
                            preferredLanguages: langs, to: &$0
                        )
                    }
                }
                self.debouncedCacheSave()
            }
            .store(in: &socketCancellables)
    }

    /// Règle unique de pose d'une traduction de post — appliquée à l'exemplaire
    /// en mémoire ET à chaque exemplaire en cache. `translatedContent` n'est
    /// posé que si la langue est préférée et qu'aucune traduction n'est déjà
    /// affichée (une traduction plus prioritaire ne doit pas être écrasée).
    nonisolated static func applyPostTranslation(
        _ translation: PostTranslation,
        language: String,
        preferredLanguages: [String],
        to post: inout FeedPost
    ) {
        var translations = post.translations ?? [:]
        translations[language] = translation
        post.translations = translations
        guard post.translatedContent == nil,
              preferredLanguages.contains(where: { $0.caseInsensitiveCompare(language) == .orderedSame })
        else { return }
        post.translatedContent = translation.text
    }

    /// Idem pour un commentaire. Retourne `false` quand rien ne change — le
    /// sink s'en sert pour ne pas réécrire le cache pour rien.
    nonisolated static func applyCommentTranslation(
        _ text: String,
        commentId: String,
        language: String,
        preferredLanguages: [String],
        to post: inout FeedPost
    ) -> Bool {
        guard preferredLanguages.contains(where: { $0.caseInsensitiveCompare(language) == .orderedSame }),
              let index = post.comments.firstIndex(where: { $0.id == commentId }),
              post.comments[index].translatedContent == nil
        else { return false }
        post.comments[index].translatedContent = text
        return true
    }

    /// Coupe les sinks d'UI du feed. Le pont de persistance GRDB
    /// (`FeedSocketHandler`) N'EST PAS désarmé ici : il est armé une fois pour
    /// toutes au niveau app (`RootView`), parce que la persistance disque ne
    /// doit dépendre d'aucun écran monté.
    func unsubscribeFromSocketEvents() {
        socketCancellables.removeAll()
        socialSocket.unsubscribeFeed()
    }

    // MARK: - Media Prefetch

    private var prefetchTask: Task<Void, Never>?
    private var prefetchDebounceTask: Task<Void, Never>?
    private var lastPrefetchIndex: Int = -1

    /// Debounced entry point from scroll — avoids task thrashing during fast scroll.
    func prefetchMediaForPost(_ postId: String) {
        guard let index = posts.firstIndex(where: { $0.id == postId }) else { return }
        guard abs(index - lastPrefetchIndex) >= 2 else { return }
        lastPrefetchIndex = index
        prefetchDebounceTask?.cancel()
        prefetchDebounceTask = Task {
            try? await Task.sleep(for: .milliseconds(150))
            guard !Task.isCancelled else { return }
            prefetchMedia(around: index)
        }
    }

    /// Décision PURE : ce média de post doit-il être PRÉCHARGÉ, la politique
    /// d'auto-téléchargement étant déjà résolue ? Miroir de
    /// `BubbleCarouselView.shouldPrefetchAttachment`, avec l'axe que le feed
    /// ajoute : une vidéo n'est pas UN chemin mais DEUX.
    ///
    /// - vidéo AVEC vignette : la branche ne tire qu'une image distante → `prefs.image` ;
    /// - vidéo SANS vignette : `StoryMediaLoader.videoThumbnail` décode la
    ///   première frame du MP4 **distant** (moov + premier GOP) — ce sont des
    ///   octets VIDÉO, donc `prefs.video` (`.wifiOnly` par défaut), sans quoi un
    ///   bon cellulaire tirerait de la vidéo sous couvert de « vignette ».
    /// - document : jamais préchargé (branche `default` du routage ci-dessous).
    nonisolated static func shouldPrefetchFeedMedia(
        kind: FeedMediaType,
        hasThumbnail: Bool,
        allowImage: Bool,
        allowVideo: Bool,
        allowAudio: Bool
    ) -> Bool {
        switch kind {
        case .image: return allowImage
        case .video: return hasThumbnail ? allowImage : allowVideo
        case .audio: return allowAudio
        case .document: return false
        }
    }

    /// Prefetch media for posts in the visible window + next 5.
    func prefetchMedia(around index: Int) {
        prefetchTask?.cancel()
        let slice = Array(posts[max(0, index - 2)..<min(posts.count, index + 7)])
        prefetchTask = Task(priority: .utility) {
            guard !slice.isEmpty else { return }

            // Respecte la politique d'auto-téléchargement — miroir de
            // `ConversationMediaHandler.prefetchRecentMedia`. Sans elle, la
            // fenêtre de 9 posts tirait le fichier AUDIO ENTIER de chaque post
            // jamais joué, et l'image pleine taille, en cellulaire contraint.
            // Résolus UNE fois ici : la garde thermique du preroll consulte déjà
            // l'appareil, il manquait le RÉSEAU.
            let condition = NetworkConditionMonitor.shared.condition
            let prefs = MediaDownloadPreferencesStore.shared.preferences
            let allowImage = MediaDownloadPolicyEngine.shouldAutoDownload(kind: .image, condition: condition, prefs: prefs)
            let allowVideo = MediaDownloadPolicyEngine.shouldAutoDownload(kind: .video, condition: condition, prefs: prefs)
            let allowAudio = MediaDownloadPolicyEngine.shouldAutoDownload(kind: .audio, condition: condition, prefs: prefs)

            let imageStore = await CacheCoordinator.shared.images
            let thumbStore = await CacheCoordinator.shared.thumbnails

            // Parallel prefetch: images/thumbnails in TaskGroup, video preroll separate
            await withTaskGroup(of: Void.self) { group in
                for post in slice {
                    for media in post.media {
                        guard !Task.isCancelled else { return }
                        guard FeedViewModel.shouldPrefetchFeedMedia(
                            kind: media.type,
                            hasThumbnail: media.thumbnailUrl.flatMap { MeeshyConfig.resolveMediaURL($0) } != nil,
                            allowImage: allowImage,
                            allowVideo: allowVideo,
                            allowAudio: allowAudio
                        ) else { continue }

                        switch media.type {
                        case .image:
                            if let thumbUrl = media.thumbnailUrl,
                               let resolved = MeeshyConfig.resolveMediaURL(thumbUrl)?.absoluteString {
                                group.addTask { _ = await imageStore.image(for: resolved) }
                            }
                            if let url = media.url,
                               let resolved = MeeshyConfig.resolveMediaURL(url)?.absoluteString {
                                group.addTask { _ = await imageStore.image(for: resolved) }
                            }

                        case .video:
                            if let thumbUrl = media.thumbnailUrl,
                               let resolved = MeeshyConfig.resolveMediaURL(thumbUrl)?.absoluteString {
                                group.addTask { _ = await imageStore.image(for: resolved) }
                            } else if let url = media.url, let resolved = MeeshyConfig.resolveMediaURL(url) {
                                let thumbKey = "thumb:\(resolved.absoluteString)"
                                if thumbStore.cachedData(for: thumbKey) == nil {
                                    group.addTask { _ = await StoryMediaLoader.shared.videoThumbnail(url: resolved) }
                                }
                            }

                        case .audio:
                            if let url = media.url,
                               let resolved = MeeshyConfig.resolveMediaURL(url)?.absoluteString {
                                group.addTask { _ = try? await CacheCoordinator.shared.audio.data(for: resolved) }
                            }

                        default:
                            break
                        }
                    }
                }
            }

            // Video preroll: separate from main group — non-blocking, fire-and-forget.
            // Suspended while the device is critically hot (SOTA thermal back-off,
            // WWDC19 #422) so fast scrolling stops spawning new decode sessions until
            // it cools down. `allowVideo` : le preroll charge le MP4 lui-même,
            // c'est la branche la plus coûteuse de tout le prefetch.
            if allowVideo,
               MediaThermalPolicy.shouldPrefetchVideo(thermalState: ProcessInfo.processInfo.thermalState),
               let firstVideo = slice.flatMap(\.media).first(where: { $0.type == .video }),
               let url = firstVideo.url, let resolved = MeeshyConfig.resolveMediaURL(url) {
                Task(priority: .utility) {
                    await StoryMediaLoader.shared.preloadAndCachePlayer(url: resolved)
                }
            }
        }
    }

    private func debouncedCacheSave() {
        cacheSaveTask?.cancel()
        let snapshot = posts
        cacheSaveTask = Task {
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            // cache-03 étape A — GRDBCacheStore.save() trimme par suffix(max)
            // (garde les items les PLUS ANCIENS) alors que `posts` est
            // newest-first : sans ce prefix(100), au-delà de 100 posts
            // accumulés le cold start sert la tranche la plus vieille en
            // .fresh. Miroir de ProfileUserPostsList.
            try? await feedCache.savePreservingFreshness(Array(snapshot.prefix(100)), for: "main-feed")
        }
    }
}

