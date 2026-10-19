import Foundation
import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

extension FeedViewModel {
    // MARK: - Initial Load

    /// Loads the feed cache-first. Pass `forceRefresh: true` (pull-to-refresh) to
    /// bypass the cache read entirely and always fetch from the network — the
    /// fetch's write-back save then overwrites the cache with fresh data.
    func loadFeed(forceRefresh: Bool = false) async {
        await loadFeed(forceRefresh: forceRefresh, keepingLoadedPages: false)
    }

    /// La relecture SILENCIEUSE de la tête (retour sur l'écran, reconnexion du
    /// socket) garde les pages déjà chargées derrière la page 1 relue, et leur
    /// curseur. Elle remplaçait la liste : revenir sur le fil après trois pages
    /// rendait 20 posts, la carte lue disparaissait, le défilement sautait.
    /// Seul « tirer pour rafraîchir » repart d'une liste courte.
    func refreshHeadKeepingLoadedPages() async {
        await loadFeed(forceRefresh: true, keepingLoadedPages: true)
    }

    private func loadFeed(forceRefresh: Bool, keepingLoadedPages: Bool) async {
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

        await fetchFeedFromNetwork(showLoading: posts.isEmpty, keepingLoadedPages: keepingLoadedPages)
    }

    private func fetchFeedFromNetwork(showLoading: Bool, keepingLoadedPages: Bool = false) async {
        if showLoading {
            isLoading = true
        }
        if !keepingLoadedPages {
            feedGeneration &+= 1
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
                let head = Self.mergePreservingRealtimeHead(fetched: fetched, existing: posts)
                let merged = keepingLoadedPages
                    ? Self.mergePreservingLoadedPages(fetched: fetched, existing: posts)
                    : head
                // Des pages déjà chargées restent derrière la tête relue : leur
                // curseur reste le bon, celui de la page 1 les redemanderait.
                let keepsLoadedTail = merged.count > head.count
                posts = merged
                // grdb-03 (volet mémoire) — réappliquer les likes encore en
                // attente d'outbox par-dessus le snapshot serveur périmé.
                if let persistence = feedPersistence {
                    let pendingLikes = await persistence.pendingLikeFlags()
                    if !pendingLikes.isEmpty {
                        posts = Self.reapplyPendingLikes(posts: posts, pendingLikes: pendingLikes)
                    }
                }
                if !keepsLoadedTail {
                    nextCursor = response.pagination?.nextCursor
                    hasMore = response.pagination?.hasMore ?? false
                }
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

    /// La tête relue, plus les pages déjà chargées PLUS ANCIENNES que la page
    /// relue : la relecture silencieuse ne tronque plus la liste. Les posts
    /// supprimés dans la plage relue disparaissent toujours.
    static func mergePreservingLoadedPages(fetched: [FeedPost], existing: [FeedPost]) -> [FeedPost] {
        let head = mergePreservingRealtimeHead(fetched: fetched, existing: existing)
        guard let oldestFetched = fetched.last else { return head }
        let headIds = Set(head.map(\.id))
        let loadedTail = existing.filter {
            $0.timestamp < oldestFetched.timestamp && !headIds.contains($0.id)
        }
        return loadedTail.isEmpty ? head : head + loadedTail
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
        let generation = feedGeneration

        do {
            let response: PaginatedAPIResponse<[APIPost]> = try await api.paginatedRequest(
                PostsEndpoint.feed,
                cursor: nextCursor,
                limit: limit
            )

            // La liste est repartie de la page 1 pendant le vol : cette page
            // suivait une liste qui n'existe plus.
            guard generation == feedGeneration else {
                isLoadingMore = false
                return
            }

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
            if let feedStore, generation == feedGeneration {
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
                    payload.map { FeedComment(api: $0, preferredLanguages: langs) }
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
}
