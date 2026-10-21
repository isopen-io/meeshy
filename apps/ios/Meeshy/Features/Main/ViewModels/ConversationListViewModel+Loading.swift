import Foundation
import SwiftUI
import Combine
import os
import MeeshySDK

extension ConversationListViewModel {

    // MARK: - Load Categories
    //
    // Cache-first per the architecture bible (Pattern I1). Without this the
    // grouping pipeline (CombineLatest4 line 230) fires immediately after
    // setConversations and groups every row into the "Other" bucket because
    // `userCategories = []` at that point — then 100-300ms later the API
    // response arrives, userCategories repopulates, the grouping re-runs,
    // and the user sees the section headers flash in. With cache-first the
    // categories are populated synchronously on cold start (sub-100ms via
    // the GRDB actor hop) and the grouping has the right buckets from the
    // very first frame.

    func loadCategories() async {
        if let cached = await preferenceService.loadCachedCategories() {
            // Paint synchronously for the cold-start frame (no grouping flash),
            // then seed the category store as the SoT. Its publisher
            // (`observeCategoryStore`) drives every subsequent update —
            // expand/collapse via `setExpanded`, and cross-device category
            // events via `applyRemote`.
            applyCategories(cached)
            await categoryStore.hydrateFromSnapshot(cached)
        }
        // Background revalidate so the next session picks up server-truth
        // changes (new category created on web, color renamed, etc.). The
        // store publisher repaints `userCategories`; errors are non-fatal —
        // we keep whatever snapshot we already painted.
        do {
            let fresh = try await preferenceService.revalidateCategories()
            await categoryStore.hydrateFromSnapshot(fresh)
        } catch {
            // Network blip or unauthorized: cached value (if any) stays.
        }
    }

    /// Convert + sort the API model into the section model the grouping
    /// pipeline consumes. Idempotent — calling with the same input twice
    /// produces the same `userCategories` array.
    func applyCategories(_ categories: [ConversationCategory]) {
        userCategories = categories.map { cat in
            ConversationSection(
                id: cat.id,
                name: cat.name,
                icon: cat.icon ?? "folder.fill",
                color: cat.color?.replacingOccurrences(of: "#", with: "") ?? "45B7D1",
                isExpanded: cat.isExpanded ?? true,
                order: cat.order ?? 0
            )
        }.sorted { $0.order < $1.order }
    }

    // MARK: - Load Conversations


    func performLoadConversations() async {
        Logger.messages.debug("[ConversationListVM] loadConversations called")

        // Defensive: a re-entrant load (e.g. post-logout/login) should
        // not race a still-running persist from a previous session's
        // loadMore. Cancellation is cheap when there's nothing to cancel.
        cancelPendingPersist()

        async let categoriesTask: () = loadCategories()

        // Restore the persisted cursor BEFORE the cache load so that a
        // subsequent loadMore (e.g. user scrolls right after launch)
        // resumes from the deepest tail reached in the previous session
        // rather than refetching page 1.
        if let cursor = await CacheCoordinator.shared.conversations.loadCursor(for: "list") {
            nextCursor = cursor.nextCursor
            hasMore = cursor.hasMore
            paginationState = cursor.hasMore ? .idle : .exhausted
        }

        let cached = await CacheCoordinator.shared.conversations.load(for: "list")
        switch cached {
        case .fresh(let data, _), .stale(let data, _):
            // Frais ou périmé, le cache peint et le delta revalide (#7631) : un
            // cache de moins de 5 min ignore la réaction ou l'appel survenus app fermée.
            setConversations(data)
            loadFailed = false
            if case .fresh = cached { loadState = .cachedFresh } else { loadState = .cachedStale }
            lastFetchedAt = Date()
            Task { [weak self] in
                await self?.syncEngine.syncSinceLastCheckpoint()
                self?.loadState = .loaded
            }
        case .expired:
            // `load()` intentionally returns a data-less `.expired` once an
            // entry crosses the policy's expiry threshold — it signals
            // "don't trust this, go resync" — but the payload still EXISTS
            // on disk. Recover it and paint it immediately: a resync that
            // then fails offline must never leave the screen emptier than
            // what's actually on disk (Offline Graceful Degradation).
            // `syncAndReconcileList` below overwrites it with fresh data on
            // success, same as any other cold path.
            let recovered = await CacheCoordinator.shared.conversations.loadIgnoringExpiry(for: "list")
            let hadRecoveredData = !(recovered?.items.isEmpty ?? true)
            if hadRecoveredData, let recovered {
                setConversations(recovered.items)
                isLoading = false
                loadFailed = false
                loadState = .offline
            } else {
                isLoading = true
                loadFailed = false
                loadState = .loading
            }
            await syncAndReconcileList(hadRecoveredData: hadRecoveredData)
        case .empty:
            isLoading = true
            loadFailed = false
            loadState = .loading
            await syncAndReconcileList(hadRecoveredData: false)
        }

        // Précharger en arrière-plan
        prefetchRecentStories()
        prefetchTopConversationMessages()

        await categoriesTask
    }

    /// Shared `fullSync()` + reconcile tail for the `.expired`/`.empty`
    /// cold-cache branches of `performLoadConversations`. `hadRecoveredData`
    /// tells us whether the `.expired` branch already painted a disk
    /// snapshot before this ran — if the sync then fails, we keep showing
    /// that snapshot (`.offline`) instead of regressing to the empty-screen
    /// `.error` state. `fullSync()`'s own `succeeded` flag (not "is the
    /// cache non-nil afterwards") is the authoritative success signal —
    /// the cache can be non-empty even on failure once `.expired` recovery
    /// is in play.
    private func syncAndReconcileList(hadRecoveredData: Bool) async {
        let succeeded = await syncEngine.fullSync()
        if succeeded {
            // The sync engine just wrote the canonical list to cache on
            // success; `snapshot()` is the explicit-intent read for that.
            let reloaded = await CacheCoordinator.shared.conversations.load(for: "list")
            if let data = reloaded.snapshot() {
                setConversations(data)
                // Full sync just completed: snapshot is authoritative, so
                // reconcile overrides anything the coordinator tracked from
                // earlier socket events.
                NotificationCoordinator.shared.reconcileConversationUnreads(data)
            }
            loadFailed = false
            loadState = .loaded
        } else {
            // Sync failed (offline/network error). If `.expired` already
            // painted a disk snapshot above, keep showing it instead of the
            // confusing "no conversations" empty state.
            loadFailed = !hadRecoveredData
            loadState = hadRecoveredData ? .offline : .error("Sync failed")
        }
        lastFetchedAt = Date()
        isLoading = false
    }

    // MARK: - Force Refresh (pull-to-refresh)
    // Recharge les conversations depuis l'API puis continue en arrière-plan

    func forceRefresh() async {
        isLoading = true
        loadFailed = false
        loadState = .loading
        let succeeded = await syncEngine.fullSync()
        // Fetch-then-replace: THIS ViewModel only repaints `conversations`
        // from the reloaded cache when `fullSync()` reports success — the
        // in-memory list a failed refresh is currently showing is never
        // touched. This used to call `invalidateCache()` BEFORE the fetch,
        // wiping L1+L2 unconditionally — an offline/failed refresh then
        // left the cache empty with nothing to replace it (a
        // pull-to-refresh that failed emptied the whole app, violating
        // Offline Graceful Degradation). `succeeded` — not "is the cache
        // non-nil afterwards" — is the authoritative signal for what this
        // ViewModel shows.
        //
        // Caveat: `fullSync()`'s own on-disk write
        // (`ConversationSyncEngine.saveSorted`) is not perfectly
        // all-or-nothing on multi-page accounts — its parallel fan-out can
        // persist a partial merge to the "list" cache key before a later
        // tail-loop page fails and the overall call still returns `false`.
        // That's a pre-existing SDK-level gap (out of scope here, not
        // introduced by this fix) and does NOT affect the guarantee this
        // ViewModel relies on above, since we only ever trust the reload
        // when `succeeded == true`.
        if succeeded {
            let reloaded = await CacheCoordinator.shared.conversations.load(for: "list")
            if let data = reloaded.snapshot() {
                setConversations(data)
                // User-triggered full sync: snapshot is authoritative, reconcile counts.
                NotificationCoordinator.shared.reconcileConversationUnreads(data)
            }
            loadFailed = false
            loadState = .loaded
        } else {
            loadFailed = true
            loadState = .error("Refresh failed")
        }
        lastFetchedAt = Date()
        isLoading = false
        prefetchRecentStories()
    }

    // MARK: - Refresh

    func refresh() async {
        await syncEngine.syncSinceLastCheckpoint()
        await reloadFromCache()
    }

    // MARK: - Load More (cursor-based infinite scroll)
    //
    // Cache strategy: Option 1 (blob save) per spec §4.3 recommendation —
    // the entire merged list is persisted as a single JSON blob via
    // `CacheCoordinator.shared.conversations.savePreservingFreshness(snapshot, for: "list")`.
    // Row-per-conversation (Option 2: one `cache_entries` row per id with
    // partial reads via `LIMIT/OFFSET`) is deferred to a future migration
    // if user counts grow beyond ~500 cached conversations. Today's blob
    // approach round-trips a few KB of JSON per save which is well within
    // budget for the realistic upper bound, and keeps the cache surface
    // identical to every other GRDBCacheStore consumer.

    /// Fetch the next page of conversations using the gateway's
    /// cursor-paginated endpoint. Cursor-based pagination removes two
    /// classes of bugs from the previous offset-based code path:
    ///   (a) duplicate or skipped rows when a new message arrived
    ///       between two pages (offset shifts in the underlying sort);
    ///   (b) the artificial `autoLoadCap = 1000` ceiling that stranded
    ///       users on accounts above the cap.
    /// Caller is responsible for triggering this on scroll-near-end;
    /// concurrent calls are coalesced via the `.loadingMore` guard.
    func loadMore() async {
        // Refuse re-entry while a request is in flight, and refuse to
        // ask the gateway when we already know there's nothing more.
        // The `isLoading` check keeps cold-start full-syncs from
        // racing the first paginated fetch.
        guard hasMore, paginationState != .loadingMore, !isLoading else { return }

        paginationState = .loadingMore

        // Le curseur RÉELLEMENT envoyé, hissé hors du `do` pour que le journal
        // d'échec nomme la valeur qui a échoué. Il disait `nextCursor`, qui
        // vaut `nil` sur le chemin du repli — donc « cursor=nil » alors qu'un
        // curseur partait bel et bien (#6857). Un diagnostic qui désigne une
        // AUTRE variable que celle de la requête envoie chercher ailleurs.
        var envoye: String?

        do {
            let userId = currentUserId
            // Curseur de secours quand aucun `nextCursor` n'est connu (full
            // sync partiel, curseur jamais persisté) : la conversation
            // chargée la plus ancienne par `lastMessageAt` — même sémantique
            // que le curseur gateway (`before` pagine par lastMessageAt
            // strictement plus ancien). Sans lui, on refetcherait la page 1
            // déjà affichée et le zero-progress guard ci-dessous forcerait
            // `.exhausted`, bloquant l'infinite scroll sur les comptes dont
            // le full sync s'est arrêté en cours de route.
            // #6857 — un repli que le CLIENT fabrique doit ressembler à ce
            // que la passerelle sert. `conv-hydrate`, fixture de témoin gravée
            // dans le cache disque, partait sinon en `before=` et faisait
            // rendre 500 à la route, définitivement.
            let previousCursor = ConversationListPaginationCursor.resolve(
                nextCursor: nextCursor,
                oldestLocalId: conversations.min(by: { $0.lastMessageAt < $1.lastMessageAt })?.id)
            envoye = previousCursor
            let knownIds = Set(conversations.map(\.id))
            let page = try await conversationService.listPage(
                before: previousCursor,
                limit: pageLimit,
                currentUserId: userId
            )
            // Hydrate presence so the next render shows accurate online
            // dots without waiting for the socket to backfill. We pass
            // the raw API payload (which still has the per-participant
            // isOnline flags) because the domain model strips them.
            PresenceManager.shared.seed(from: page.rawItems, currentUserId: userId)
            appendConversations(page.items)

            // Loop guard 1 : zero-progress detection. If the gateway
            // returned items but ALL of them were already known locally,
            // or if the cursor did not advance, we are looping. This
            // happened in May 2026 when `fast-json-stringify` stripped
            // `cursorPagination` from the response (schema didn't
            // declare it), so `page.nextCursor` came back nil despite
            // the server having more rows — the sentinel kept refiring
            // `loadMore`, every page request returned the same first 30
            // rows, and the user saw a runaway burst of GET /conversations
            // until the socket-driven render eventually unblocked things.
            let newIds = Set(page.items.map(\.id)).subtracting(knownIds)
            let cursorAdvanced = page.nextCursor != nil && page.nextCursor != previousCursor
            let madeProgress = !newIds.isEmpty && cursorAdvanced
            if !madeProgress, !page.items.isEmpty {
                Logger.messages.error("[ConversationListVM] loadMore zero-progress (cursor=\(previousCursor ?? "<aucun>") → \(page.nextCursor ?? "nil"), newIds=\(newIds.count)) — forcing exhausted to break loop")
                nextCursor = page.nextCursor
                hasMore = false
                paginationState = .exhausted
                // PERSIST the exhausted state. Without this, every
                // `reloadFromCache()` triggered by a socket event
                // (`syncEngine.conversationsDidChange` fires on each
                // message/preference update) reads the cached cursor
                // back as `hasMore=true`, flips `paginationState = .idle`,
                // and the pagination footer sentinel re-fires `loadMore`.
                // That re-loop was visible as 3-4 consecutive
                // `forcing exhausted` lines in the May 2026 device log
                // even though the in-memory guard was working correctly.
                let exhaustedSnapshot = conversations
                Task {
                    await CacheCoordinator.shared.conversations.saveCursor(
                        nextCursor: nil,
                        hasMore: false,
                        for: "list"
                    )
                    await bestEffort("conversationListViewModelLoading.conversations.save", category: .cache) { try await CacheCoordinator.shared.conversations.save(exhaustedSnapshot, for: "list") }
                }
                return
            }

            nextCursor = page.nextCursor
            hasMore = page.hasMore
            paginationState = page.hasMore ? .idle : .exhausted

            // Persist the merged list AND the cursor so the next cold
            // start serves the user the deepest scroll position they
            // reached AND resumes pagination from the same tail —
            // without the cursor we'd refetch page 1 on the first
            // post-restart loadMore (spec AC §4.8.3). `setConversations`
            // already re-sorted the array, so we save what's actually
            // displayed.
            persistLoadedPage()
        } catch {
            // Transient errors (network blip, rate limit) keep
            // `hasMore = true` so the next scroll attempt can retry.
            // We surface the error in the published state so the view
            // can show a discreet retry prompt at the tail.
            Logger.messages.error("[ConversationListVM] loadMore error cursor=\(envoye ?? "<aucun>"): \(error.localizedDescription)")
            paginationState = .error(error.localizedDescription)
        }
    }

    // MARK: - Pull to Refresh

    /// Reset cursor + hasMore and refetch from the top. The view should
    /// route the SwiftUI `.refreshable` action here so that pulling
    /// down both clears the pagination cursor (otherwise the next
    /// `loadMore` would page from the old tail) and triggers the
    /// usual cache-first reload.
    ///
    /// Pull-to-refresh invalide AUSSI les caches transverses utilisés
    /// par la home : préférences utilisateur/conversation, catégories
    /// et tags personnalisés, profils (mood, last seen) et assets
    /// visuels (avatars + bannières) — mais SEULEMENT une fois le fetch
    /// réussi. Fetch-then-replace : une tentative de pull offline/échouée
    /// ne doit jamais vider un cache qu'elle ne peut pas repeupler
    /// (Offline Graceful Degradation). Sur succès, la listing est
    /// repeuplée par `forceRefresh()` lui-même ; les autres stores se
    /// rehydratent paresseusement à la prochaine lecture, cache-first.
    func pullToRefresh() async {
        // Cancel any in-flight persist BEFORE we reset the cursor.
        // Otherwise an orphaned `loadMore` save scheduled moments before
        // the pull could re-write the old blob on disk after the fetch
        // below replaces it.
        cancelPendingPersist()
        nextCursor = nil
        hasMore = true
        paginationState = .idle
        // Fetch FIRST: `forceRefresh()` only overwrites the conversations
        // cache key on success (fetch-then-replace, see its own doc
        // comment). Only once we KNOW the refresh actually reached the
        // network do we invalidate the cross-surface caches below — an
        // offline/failed pull must leave every cache exactly as it found
        // it, never emptier.
        await forceRefresh()
        guard !loadFailed else { return }
        await invalidatePullRefreshScope()
    }

    /// Périmètre d'invalidation déclenché par le pull-to-refresh sur la
    /// home, UNE FOIS `forceRefresh()` revenu avec succès (voir
    /// `pullToRefresh()`). Sépare l'orchestration de cache du fetch reseau
    /// qui précède, pour que les tests unitaires puissent vérifier la
    /// liste exacte des stores touchés.
    ///
    /// Couvre 9 caches transverses pour la home (hors listing, repeuplée
    /// par `forceRefresh()` — voir paragraphe ci-dessous) :
    /// - Stories (re-fetché actif par StoryViewModel.loadStories forceNetwork)
    /// - Messages cached par conversation (l'ouverture d'une conv après
    ///   refresh re-fetchera depuis le serveur)
    /// - Préférences user/conversation, catégories, tags
    /// - Profils (mood, presence, last seen)
    /// - Caches mémoire de traduction/transcription : re-traduction
    ///   garantie après refresh (utile si modèle NLLB côté serveur a
    ///   été mis à jour ou si l'utilisateur a changé sa langue préférée)
    ///
    /// La listing elle-même (`conversations`) N'EST PLUS invalidée ici —
    /// `forceRefresh()` vient de la repeupler avec la réponse fraîche
    /// (fetch-then-replace) ; la ré-invalider juste après aurait détruit
    /// ce que le fetch réussi vient d'écrire.
    ///
    /// Stores intentionnellement laissés intacts (autres écrans ou
    /// coût bande passante prohibitif) : feed, comments, stats,
    /// notifications, friends, friendRequests, blockedUsers, userSearch,
    /// timeline, affiliateTokens, shareLinks, trackingLinks, communityLinks.
    ///
    /// Les stores MÉDIA (images, thumbnails, audio, video) ne sont JAMAIS
    /// invalidés ici : exigence local-first « téléchargé une fois = jamais
    /// re-téléchargé tant que l'app est installée ». Les URLs médias sont
    /// immuables côté gateway (max-age=1 an) — si un avatar change, son URL
    /// change, donc invalider les octets ne rafraîchit rien de plus que le
    /// refetch des métadonnées ci-dessus. (Audit 2026-07-10 : chaque pull
    /// re-téléchargeait l'intégralité des avatars/covers, ~3 Mo minimum.)
    private func invalidatePullRefreshScope() async {
        // Messages cached par conversation. Les previews dans la listing
        // viennent de l'API (forceRefresh), mais l'historique cached est
        // re-fetché à l'ouverture de la conv pour avoir le dernier état.
        await CacheCoordinator.shared.messages.invalidateAll()
        // Participants / membres des conversations (groupes, communautés)
        await CacheCoordinator.shared.participants.invalidateAll()
        // Stories : redondant avec StoryViewModel.loadStories(forceNetwork:)
        // qui écrase via .save, mais explicite garantit que si le fetch
        // échoue le cache stale ne persiste pas.
        await CacheCoordinator.shared.stories.invalidateAll()
        // Préférences (re-fetch lazy au prochain accès paramètres conv)
        await CacheCoordinator.shared.conversationPreferences.invalidateAll()
        await CacheCoordinator.shared.userPreferences.invalidateAll()
        // Filtrage métadonnées (catégories + tags)
        await CacheCoordinator.shared.categories.invalidateAll()
        await CacheCoordinator.shared.userTags.invalidateAll()
        // Profils (mood, presence cachée, dernière vue)
        await CacheCoordinator.shared.profiles.invalidateAll()
        // Caches in-memory de traduction/transcription/audio + DB. Force
        // une retraduction si le serveur a publié de nouvelles versions
        // ou si l'utilisateur a changé sa langue préférée entre temps.
        await CacheCoordinator.shared.invalidateTranslationCaches()
    }

    // MARK: - Persist Category Expansion

    func persistCategoryExpansion(id: String, isExpanded: Bool) {
        // Route through the category store: optimistic update + persist via the
        // unified `/me/preferences/categories/{id}` PATCH, and the publisher
        // reflects the new `isExpanded` into `userCategories` (cross-surface).
        Task { [categoryStore] in
            _ = try? await categoryStore.setExpanded(id, expanded: isExpanded)
        }
    }
}
