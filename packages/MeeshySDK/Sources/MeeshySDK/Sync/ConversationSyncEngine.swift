import Foundation
import Combine
import os

// MARK: - Realtime message mutations

/// A real-time mutation of an already-persisted message, expressed without any
/// storage vocabulary so the engine stays agnostic of the host app's store.
/// The host maps each case onto its canonical table (GRDB `messages`).
///
/// Every case is idempotent by construction on the receiving side: the same
/// broadcast may reach both this relay and the open conversation's own socket
/// handler, and replaying it must not double-count a reaction or resurrect a
/// stale edit.
public enum RealtimeMessageMutation: Sendable, Equatable {
    case edited(messageId: String, content: String, editedAt: Date)
    /// `message:edited` porteur d'un résumé d'appel : la transition live →
    /// terminal (« en cours » → « Appel · 04:32 »). Distincte de `.edited`
    /// parce qu'un avis d'appel ne doit JAMAIS porter le drapeau « modifié ».
    case callNoticeUpdated(messageId: String, content: String, callSummaryJson: Data?, serverUpdatedAt: Date)
    case deleted(messageId: String, deletedAt: Date)
    case reactionAdded(messageId: String, reactionId: String, emoji: String, participantId: String?, maxCount: Int?)
    case reactionRemoved(messageId: String, emoji: String, participantId: String?)
    case consumed(messageId: String, viewOnceCount: Int)
}

// MARK: - Protocol

public protocol ConversationSyncEngineProviding: AnyObject, Sendable {
    var conversationsDidChange: AnyPublisher<Void, Never> { get }
    var messagesDidChange: AnyPublisher<String, Never> { get }

    /// Sum of `unreadCount` across every cached conversation. CurrentValue-
    /// based: emits the current value on subscribe and again on every
    /// mutation. Consumers must NOT reduce the list themselves.
    var totalConversationsUnread: AnyPublisher<Int, Never> { get }

    /// Synchronous snapshot of the aggregate. Always ≥ 0.
    var totalConversationsUnreadValue: Int { get }

    @discardableResult
    func fullSync() async -> Bool
    @discardableResult
    func syncSinceLastCheckpoint() async -> Bool
    /// Ensure the conversation's recent messages are in cache.
    ///
    /// `force == false` respects the cache freshness TTL (a `.fresh` cache
    /// short-circuits — used by background prefetch where we have no signal
    /// that anything changed). `force == true` bypasses the TTL and always
    /// hits the network: a push notification is authoritative evidence that
    /// a new message exists, so the freshness clock is the wrong heuristic —
    /// we KNOW the cache is behind regardless of how recently it was loaded.
    func ensureMessages(for conversationId: String, force: Bool) async
    func fetchOlderMessages(for conversationId: String, before messageId: String) async
    func cleanupRetentionIfNeeded() async
    func startSocketRelay() async
    func stopSocketRelay() async
    func markConversationReadLocally(_ conversationId: String) async
    /// Efface la frontière de lecture locale (geste « marquer comme non lu »).
    func markConversationUnreadLocally(_ conversationId: String) async
    func updateConversationAfterSend(_ facet: LastMessageFacet, conversationId: String) async

    /// Declare which conversation is currently visible to the user.
    /// While set, the engine will:
    ///   1. Force the open conversation's `unreadCount` to 0 on every
    ///      `conversation:unread-updated` event (the user IS reading it,
    ///      so any non-zero value is a visual lie).
    ///   2. Exclude the open conversation from `totalConversationsUnread`
    ///      so cross-conversation surfaces (back-button pill, side menus)
    ///      count OTHER conversations only.
    ///   3. Reset the open conversation's `unreadCount` to 0 immediately
    ///      on entry, defending against stale snapshots that pushed an
    ///      inflated count (e.g. 75) into the cache before we knew the
    ///      user was looking at it.
    /// Pass `nil` (on view disappear) to restore pass-through behaviour.
    func setCurrentlyOpenConversation(_ conversationId: String?)

    /// The conversation currently forced to unread=0 and excluded from the
    /// cross-conversation aggregate, or `nil`. Read in
    /// `ConversationViewModel.deinit` so the gate is relinquished ONLY when it
    /// still points at this conversation — order-safe across a fast A→B switch
    /// where `deinit(A)` may run after `start(B)` set the gate to B.
    var currentlyOpenConversationId: String? { get }
}

public extension ConversationSyncEngineProviding {
    /// TTL-respecting convenience (`force: false`). Used where there is no
    /// external signal that the cache is stale — e.g. background prefetch.
    func ensureMessages(for conversationId: String) async {
        await ensureMessages(for: conversationId, force: false)
    }
}

// MARK: - Implementation

public final class ConversationSyncEngine: ConversationSyncEngineProviding, @unchecked Sendable {
    public static let shared = ConversationSyncEngine()

    private static let logger = Logger(subsystem: "me.meeshy.sdk", category: "sync")

    // Internal subjects (send-capable)
    private let _conversationsDidChange = PassthroughSubject<Void, Never>()
    private let _messagesDidChange = PassthroughSubject<String, Never>()

    /// Cross-conversation aggregator of `unreadCount`. Rebuilt from the
    /// authoritative cache on every mutation that may change the total —
    /// `conversation:unread-updated`, `conversation:read-status-updated`,
    /// and after each successful sync that overwrites the list. UI surfaces
    /// (back-button pill, side menus) subscribe here instead of reducing
    /// the list themselves so the math lives in one place.
    private let _totalConversationsUnread = CurrentValueSubject<Int, Never>(0)

    // Protocol-exposed publishers (read-only)
    public var conversationsDidChange: AnyPublisher<Void, Never> { _conversationsDidChange.eraseToAnyPublisher() }
    public var messagesDidChange: AnyPublisher<String, Never> { _messagesDidChange.eraseToAnyPublisher() }

    /// Publisher of the total unread count across all cached conversations.
    /// Emits the current value on subscribe (CurrentValueSubject semantics),
    /// then a new value each time the cache mutates.
    public var totalConversationsUnread: AnyPublisher<Int, Never> { _totalConversationsUnread.eraseToAnyPublisher() }

    /// Synchronous snapshot of the current aggregated total. Always
    /// ≥ 0 — negative `unreadCount` values from the backend are clamped.
    public var totalConversationsUnreadValue: Int { _totalConversationsUnread.value }

    // State (protected by serial queue)
    private let stateQueue = DispatchQueue(label: "me.meeshy.sync-engine.state")
    private var _isSyncing = false
    private var isSyncing: Bool {
        get { stateQueue.sync { _isSyncing } }
        set { stateQueue.sync { _isSyncing = newValue } }
    }
    /// Currently-visible conversation. While non-nil the engine forces this
    /// conversation's `unreadCount` to 0 on every server broadcast and
    /// excludes it from the cross-conversation aggregator.
    private var _currentlyOpenConversationId: String?
    /// Public for the `ConversationSyncEngineProviding` read requirement (used by
    /// `ConversationViewModel.deinit` for the order-safe, identity-conditional
    /// gate release). `setCurrentlyOpenConversation(_:)` remains the canonical
    /// mutation entry point.
    public var currentlyOpenConversationId: String? {
        get { stateQueue.sync { _currentlyOpenConversationId } }
        set { stateQueue.sync { _currentlyOpenConversationId = newValue } }
    }
    /// Miroir SYNCHRONE du `unreadCount` de chaque conversation en cache,
    /// rafraîchi par `recomputeTotalUnread`. Il n'introduit pas une seconde
    /// vérité : c'est une projection du cache, jamais écrite ailleurs — mais
    /// il permet de republier l'agrégat SANS attendre un aller-retour cache,
    /// ce dont dépend l'absence de scintillement à l'ouverture (cf.
    /// `publishTotalUnread`).
    private var _unreadByConversation: [String: Int] = [:]
    private var socketSubscriptions = Set<AnyCancellable>()

    /// Optional hook the host app installs to persist raw `APIMessage`
    /// payloads into its on-device message store (GRDB). The engine itself
    /// only maintains the CacheCoordinator surfaces (conversation list,
    /// previews, unread counts) — but the per-conversation timeline the app
    /// renders is read from GRDB, so without this hook a message that
    /// arrives while its conversation is closed (socket broadcast, push
    /// notification refresh) updates the list preview yet is missing from
    /// the open conversation until the next REST revalidation completes.
    /// Invoked from `handleNewMessage`, `ensureMessages` and
    /// `fetchOlderMessages` with the exact decoded payloads.
    private var _apiMessagePersistor: (@Sendable ([APIMessage]) async -> Void)?
    public var apiMessagePersistor: (@Sendable ([APIMessage]) async -> Void)? {
        get { stateQueue.sync { _apiMessagePersistor } }
        set { stateQueue.sync { _apiMessagePersistor = newValue } }
    }

    /// Sibling of `apiMessagePersistor` for the mutations that carry no
    /// `APIMessage` payload: edit, delete, reaction add/remove and view-once
    /// consumption. Those four broadcasts only ever reached `cache.messages`
    /// (a namespace the conversation screen does not render) — the canonical
    /// GRDB table was refreshed by the REST refetch on reopen alone, so
    /// offline the timeline still showed the pre-edit text, the deleted
    /// bubble and the missing reaction. Installed by the host app, which owns
    /// the store; `nil` in tests that only exercise the cache surfaces.
    private var _realtimeMessagePersistor: (@Sendable (RealtimeMessageMutation) async -> Void)?
    public var realtimeMessagePersistor: (@Sendable (RealtimeMessageMutation) async -> Void)? {
        get { stateQueue.sync { _realtimeMessagePersistor } }
        set { stateQueue.sync { _realtimeMessagePersistor = newValue } }
    }

    /// Accusés de RÉCEPTION en attente, par conversation.
    ///
    /// `POST /conversations/{id}/mark-as-received` ne porte AUCUN `messageId` :
    /// son corps est vide, donc dix messages d'une même rafale produisaient dix
    /// requêtes strictement identiques. Ce n'est pas qu'une question d'octets —
    /// la route partage avec `mark-read` un quota de 30 requêtes/minute, qu'une
    /// conversation animée épuise à elle seule, faisant rejeter des accusés de
    /// LECTURE que rien ne rejouera. Une rafale devient donc un envoi unique par
    /// conversation et par fenêtre ; le curseur de livraison étant monotone,
    /// fusionner des requêtes identiques ne perd rien.
    ///
    /// Une entrée présente EST la fenêtre ouverte de cette conversation.
    private var _markAsReceivedTasks: [String: Task<Void, Never>] = [:]
    private let markAsReceivedWindow: TimeInterval

    // Cooldown between successive delta syncs. The gateway delta endpoint
    // is cheap (~10-50 ms) but a chatty socket that flaps reconnect every
    // 200 ms used to spam `/conversations?updatedSince=...` once per flap
    // — multiplied by N listeners (we historically had two for the same
    // `didReconnect` signal). Cooldown is a small wall-clock window: if
    // a delta sync just ran, skip until the window elapses. Cold-start
    // `fullSync` is unaffected because it runs through the `isSyncing`
    // path, not this guard.
    private var _lastDeltaSyncAt: Date = .distantPast
    private var lastDeltaSyncAt: Date {
        get { stateQueue.sync { _lastDeltaSyncAt } }
        set { stateQueue.sync { _lastDeltaSyncAt = newValue } }
    }
    private let deltaSyncCooldown: TimeInterval = 3

    // Dependencies
    private let cache: CacheCoordinator
    private let conversationService: ConversationServiceProviding
    private let messageService: MessageServiceProviding
    private let messageSocket: MessageSocketProviding
    private let socialSocket: SocialSocketProviding
    private let api: APIClientProviding

    // Persisted sync timestamp
    private let syncTimestampKey = "me.meeshy.lastSyncTimestamp"
    private var lastSyncTimestamp: Date {
        get { UserDefaults.standard.object(forKey: syncTimestampKey) as? Date ?? .distantPast }
        set { UserDefaults.standard.set(newValue, forKey: syncTimestampKey) }
    }

    private let cleanupDateKey = "me.meeshy.lastCleanupDate"
    private var lastCleanupDate: Date? {
        get { UserDefaults.standard.object(forKey: cleanupDateKey) as? Date }
        set { UserDefaults.standard.set(newValue, forKey: cleanupDateKey) }
    }

    // P7-10 — checkpoint de la dernière réconciliation COMPLÈTE (fullSync).
    // Le delta `?updatedSince=` est upsert-only : une conversation
    // HARD-supprimée côté serveur n'y apparaît jamais (contrairement aux
    // `isActive:false` que mergeDeltaConversations retire) → sans
    // réconciliation périodique, un `conversation:deleted` raté (offline)
    // laisse une ligne fantôme inouvrable à vie — le cache reste
    // perpétuellement fresh/stale via les deltas, donc le fullSync de
    // cold-start ne court jamais (observé E2E 2026-07-02 : « Test Conv »
    // épinglée, absente du serveur, tuée uniquement par pull-to-refresh).
    private let fullReconcileKey = "me.meeshy.lastFullReconcileAt"
    private var lastFullReconcileAt: Date? {
        get { UserDefaults.standard.object(forKey: fullReconcileKey) as? Date }
        set { UserDefaults.standard.set(newValue, forKey: fullReconcileKey) }
    }
    /// Borne « données jamais rapatriées inutilement » : au plus UN full
    /// refetch par fenêtre. 24 h par défaut ; injectable pour les tests.
    private let fullReconcileInterval: TimeInterval

    private var isFullReconcileDue: Bool {
        Date().timeIntervalSince(lastFullReconcileAt ?? .distantPast) >= fullReconcileInterval
    }

    init(
        cache: CacheCoordinator = .shared,
        conversationService: ConversationServiceProviding = ConversationService.shared,
        messageService: MessageServiceProviding = MessageService.shared,
        messageSocket: MessageSocketProviding = MessageSocketManager.shared,
        socialSocket: SocialSocketProviding = SocialSocketManager.shared,
        api: APIClientProviding = APIClient.shared,
        fullReconcileInterval: TimeInterval = 86_400,
        markAsReceivedWindow: TimeInterval = 1.0
    ) {
        self.cache = cache
        self.conversationService = conversationService
        self.messageService = messageService
        self.messageSocket = messageSocket
        self.socialSocket = socialSocket
        self.api = api
        self.fullReconcileInterval = fullReconcileInterval
        self.markAsReceivedWindow = markAsReceivedWindow
    }

    // MARK: - Sync Checkpoints (logout / re-auth reset)

    /// sync-04 — efface les trois checkpoints UserDefaults pour que le compte
    /// suivant (ou une ré-authentification du même compte, dont le cache est
    /// purgé par ailleurs) reparte de `.distantPast` au lieu d'hériter du
    /// watermark de la session sortante — sinon un delta déclenché avant le
    /// premier fullSync réussi persiste une liste PARTIELLE comme fraîche.
    /// `lastDeltaSyncAt` est remis aussi pour que le tout premier delta ne
    /// soit pas avalé par le cooldown en mémoire.
    public func resetSyncCheckpoints() {
        UserDefaults.standard.removeObject(forKey: syncTimestampKey)
        UserDefaults.standard.removeObject(forKey: cleanupDateKey)
        UserDefaults.standard.removeObject(forKey: fullReconcileKey)
        lastDeltaSyncAt = .distantPast
    }

    // MARK: - Full Sync (cold start)

    /// Run a full sync and return whether it completed successfully.
    ///
    /// Historically this method swallowed every error and left the caller
    /// unable to tell if the cache was populated or still empty. That
    /// produced the "blank conversation list forever" bug on cold start
    /// when REST was unreachable or the token had expired: the VM would
    /// flip `isLoading = false`, the view would fall through to the
    /// empty-state placeholder, and there was no retry surface. Callers
    /// should now inspect the return value and surface an error UI when
    /// it's `false`.
    @discardableResult
    /// Fetches a single conversations page, retrying transient errors up to
    /// 2 times with exponential backoff (1s, 2s). Lifted out of `fullSync()`
    /// so it can be called from inside `withTaskGroup` closures without
    /// triggering Swift 6 isolation-boundary warnings on `@Sendable` local
    /// functions. Previously a single network blip silently dropped an
    /// entire page — `succeeded` flipped false and the user landed on a
    /// partial list with no recovery path.
    private static func fetchPageWithRetry(
        via service: ConversationServiceProviding,
        offset: Int,
        limit: Int
    ) async throws -> OffsetPaginatedAPIResponse<[APIConversation]> {
        var lastError: Error?
        for attempt in 0..<3 {
            do {
                return try await service.list(offset: offset, limit: limit)
            } catch {
                lastError = error
                if attempt < 2 {
                    let backoff = UInt64(1_000_000_000 * (1 << attempt))
                    try? await Task.sleep(nanoseconds: backoff)
                }
            }
        }
        throw lastError ?? URLError(.unknown)
    }

    /// Map an API conversation page off the main actor. The engine is
    /// `@unchecked Sendable` (not an actor) and SE-0461 runs its nonisolated
    /// async methods on the caller's actor — here the @MainActor list VM — so a
    /// plain `.map { $0.toConversation }` would decode every conversation
    /// (last message, preferences, participants) on the main thread during the
    /// background sync. `[APIConversation]` and `[MeeshyConversation]` are both
    /// Sendable and `toConversation` is a nonisolated pure function.
    private static func mapConversationsOffMain(
        _ apiConversations: [APIConversation],
        userId: String
    ) async -> [MeeshyConversation] {
        await Task.detached(priority: .userInitiated) {
            apiConversations.map { $0.toConversation(currentUserId: userId) }
        }.value
    }

    @discardableResult
    public func fullSync() async -> Bool {
        guard !isSyncing else { return true }
        isSyncing = true
        defer { isSyncing = false }

        let pageSize = 100
        let userId = await currentUserId()
        let service = self.conversationService
        // Figée AVANT la première écriture : `saveSorted(firstPage)` remplace le
        // cache par la seule page 1, et sans cette baseline les pages suivantes
        // n'auraient plus d'homologue local où retrouver leur frontière de lecture.
        let baseline = await cache.conversations.load(for: "list").snapshot() ?? []

        // Fetch the first page to show something on screen as fast as
        // possible, then fan out to the remaining pages in parallel. On
        // 10k-conversation accounts the old sequential loop took 5-10s
        // before the list was populated; the first-page-first pattern
        // paints the visible rows in ~300ms and the rest arrives in the
        // background without blocking the UI.
        let firstPage: [MeeshyConversation]
        let totalCount: Int?
        let firstPageReturnedCount: Int
        do {
            let response = try await Self.fetchPageWithRetry(via: service, offset: 0, limit: pageSize)
            firstPage = (await Self.mapConversationsOffMain(response.data, userId: userId))
            firstPageReturnedCount = response.data.count
            totalCount = response.pagination?.total
            await saveSorted(firstPage, to: "list", baseline: baseline)
            await SearchIndex.shared.indexConversations(firstPage)
            _conversationsDidChange.send()
        } catch {
            Self.logger.error("[SyncEngine] fullSync first-page error: \(error.localizedDescription)")
            return false
        }

        // If the first page already returned everything, we're done.
        // Heuristic: when the backend gave us a total, trust it; else
        // assume "fewer than requested" means the tail (matches REST
        // pagination convention).
        if let total = totalCount, total <= firstPage.count {
            // Server time, not the device clock (R15b) — authoritative full fetch.
            lastSyncTimestamp = SyncWatermark.fromFullSync(receivedUpdatedAt: firstPage.map(\.updatedAt), fallback: lastSyncTimestamp)
            lastFullReconcileAt = Date()
            return true
        }
        if totalCount == nil && firstPageReturnedCount < pageSize {
            // Fewer items returned than asked for AND no total advertised:
            // the gateway either capped our `limit` (e.g. asked for 100,
            // got 50) OR the user truly has only this many. Defer to the
            // sequential tail loop below — it will probe one more page
            // and stop on `hasMore=false`. This avoids the legacy bug
            // where `firstPage.count >= pageSize` (50 >= 100 = false)
            // forced an early return on accounts with 50–99 conversations.
        }

        // Upper bound on remaining pages. If the backend didn't return a
        // total count, we fall back to sequential paging from page 2 until
        // `hasMore` flips false.
        let remainingPages: [Int]
        if let total = totalCount {
            // Use the *actual* page size delivered by the server (which
            // may be lower than the requested `pageSize` due to its own
            // cap), so subsequent offsets align with real page boundaries
            // rather than our optimistic stride.
            let stride = max(firstPageReturnedCount, 1)
            let totalPages = (total + stride - 1) / stride
            // Each page index `i` maps to offset `i * stride`. We start
            // from page 1 because page 0 is `firstPage`.
            remainingPages = Array(1..<totalPages)
        } else {
            remainingPages = []
        }

        var merged = firstPage
        var succeeded = true

        if !remainingPages.isEmpty {
            // Fan-out: fetch all remaining pages concurrently with a bounded
            // parallelism (4) so we don't hammer the backend on huge
            // accounts. Pages are sorted by offset before merging.
            let stride = max(firstPageReturnedCount, 1)
            let pages: [(Int, [MeeshyConversation])] = await withTaskGroup(
                of: (Int, [MeeshyConversation]?).self,
                returning: [(Int, [MeeshyConversation])].self
            ) { group in
                let maxParallel = 4
                var launched = 0
                var collected: [(Int, [MeeshyConversation])] = []

                while launched < maxParallel && launched < remainingPages.count {
                    let pageIndex = remainingPages[launched]
                    group.addTask {
                        do {
                            let response = try await Self.fetchPageWithRetry(via: service, offset: pageIndex * stride, limit: pageSize)
                            let items = (await Self.mapConversationsOffMain(response.data, userId: userId))
                            return (pageIndex, items)
                        } catch {
                            return (pageIndex, nil)
                        }
                    }
                    launched += 1
                }

                while let result = await group.next() {
                    if let items = result.1 {
                        collected.append((result.0, items))
                    }
                    if launched < remainingPages.count {
                        let pageIndex = remainingPages[launched]
                        group.addTask {
                            do {
                                let response = try await Self.fetchPageWithRetry(via: service, offset: pageIndex * stride, limit: pageSize)
                                let items = (await Self.mapConversationsOffMain(response.data, userId: userId))
                                return (pageIndex, items)
                            } catch {
                                return (pageIndex, nil)
                            }
                        }
                        launched += 1
                    }
                }
                return collected.sorted { $0.0 < $1.0 }
            }

            if pages.count < remainingPages.count {
                succeeded = false
            }

            var uniqueById = Set(merged.map(\.id))
            for (_, page) in pages {
                for item in page where !uniqueById.contains(item.id) {
                    uniqueById.insert(item.id)
                    merged.append(item)
                }
            }

            // Targeted re-fetch of pages the fan-out dropped, BEFORE persisting,
            // so an interior gap (a middle page that failed while later pages
            // succeeded) is filled instead of silently swallowed — the
            // sequential tail starts at `merged.count` and would skip a hole
            // below that count, leaving the cached list permanently incomplete.
            let fetchedIndices = Set(pages.map(\.0))
            let droppedIndices = remainingPages.filter { !fetchedIndices.contains($0) }
            if !droppedIndices.isEmpty {
                var recoveredAll = true
                for pageIndex in droppedIndices {
                    do {
                        let response = try await Self.fetchPageWithRetry(via: service, offset: pageIndex * stride, limit: pageSize)
                        let items = (await Self.mapConversationsOffMain(response.data, userId: userId))
                        for item in items where !uniqueById.contains(item.id) {
                            uniqueById.insert(item.id)
                            merged.append(item)
                        }
                    } catch {
                        recoveredAll = false
                    }
                }
                // Only stay failed if a targeted re-fetch still couldn't recover
                // the page — a transient fan-out failure that the re-fetch fixed
                // must NOT leave the list flagged incomplete.
                succeeded = recoveredAll
            }

            await saveSorted(merged, to: "list", baseline: baseline)
            await SearchIndex.shared.indexConversations(merged)
            _conversationsDidChange.send()
        }

        // Sequential tail: keep fetching until the server says "no more"
        // OR we get an empty page. Runs in TWO cases:
        //   1. We had no `totalCount` — primary fallback path.
        //   2. We had a `totalCount` but the parallel fan-out missed
        //      some pages (race conditions, optimistic stride, server
        //      added conversations mid-sync). This catches them so the
        //      list is provably complete.
        var offset = merged.count
        var hasMore = totalCount == nil
            ? firstPageReturnedCount > 0
            : (offset < (totalCount ?? 0))
        // Hard ceiling on tail iterations as a last-resort safety belt.
        // The progress guards below should always trip first; this keeps
        // a misbehaving gateway from spamming the network indefinitely
        // even if those guards were ever bypassed by a future refactor.
        var tailIterations = 0
        let maxTailIterations = 50
        while hasMore && tailIterations < maxTailIterations {
            tailIterations += 1
            do {
                let response = try await Self.fetchPageWithRetry(via: service, offset: offset, limit: pageSize)
                let page = (await Self.mapConversationsOffMain(response.data, userId: userId))
                let existingIds = Set(merged.map(\.id))
                let newItems = page.filter { !existingIds.contains($0.id) }
                merged.append(contentsOf: newItems)
                if !newItems.isEmpty {
                    await saveSorted(merged, to: "list", baseline: baseline)
                    await SearchIndex.shared.indexConversations(newItems)
                    _conversationsDidChange.send()
                }
                // Trust the backend's `hasMore` if present; otherwise
                // assume "full page = more might follow" so we keep
                // probing instead of stopping at a backend-capped page.
                //
                // We removed the older `data.count == firstPageReturnedCount`
                // heuristic because it created an infinite loop when the
                // gateway consistently returned the same page size (offset
                // was stagnating but the heuristic kept claiming "more
                // might follow"). The `newItems.isEmpty` guard below is the
                // correct stop signal: zero new ids = zero progress.
                let backendHasMore = response.pagination?.hasMore
                if let backendHasMore {
                    hasMore = backendHasMore
                } else {
                    hasMore = response.data.count >= pageSize
                }
                offset += response.data.count
                // Progress guards. STOP when:
                //   - the server returned an empty page (canonical EOF), or
                //   - the page contained ZERO new ids (offset stagnation —
                //     the gateway is replaying the same window). Without
                //     this we hammered `/conversations` forever on a
                //     misconfigured pagination response.
                if response.data.isEmpty || newItems.isEmpty {
                    hasMore = false
                }
            } catch {
                Self.logger.error("[SyncEngine] fullSync tail error: \(error.localizedDescription)")
                succeeded = false
                break
            }
        }
        if tailIterations >= maxTailIterations {
            Self.logger.error("[SyncEngine] fullSync tail aborted after \(maxTailIterations) iterations — pagination likely stuck (offset=\(offset), merged=\(merged.count))")
        }

        if succeeded {
            // Server time, not the device clock (R15b) — authoritative full fetch.
            lastSyncTimestamp = SyncWatermark.fromFullSync(receivedUpdatedAt: merged.map(\.updatedAt), fallback: lastSyncTimestamp)
            lastFullReconcileAt = Date()
        }
        return succeeded
    }

    // MARK: - Delta Sync (foreground / reconnect)

    /// Ce qu'une page delta prouve, au-delà d'avoir abouti.
    private struct DeltaOutcome: Sendable {
        let succeeded: Bool
        /// La fenêtre `updatedSince` contenait plus de lignes que la page n'en
        /// a rendues — donc ce delta ne prouve PAS qu'il a tout vu.
        let mayHaveMore: Bool

        /// Delta abouti sans reste — également l'issue des exécutions SAUTÉES
        /// (sync en cours, anti-rafale) : rien n'a été lu, donc rien n'est
        /// incomplet, et le curseur n'a pas bougé.
        static let complete = DeltaOutcome(succeeded: true, mayHaveMore: false)
        static let failed = DeltaOutcome(succeeded: false, mayHaveMore: false)
    }

    /// Plafond serveur de `GET /conversations` (`Math.min(limit, 100)` dans
    /// `routes/conversations/core.ts`) — jumeau de `DELTA_PAGE_LIMIT`
    /// (`apps/web/hooks/queries/use-conversations-delta-sync.ts`).
    ///
    /// Le demander explicitement plutôt que `500` ne change RIEN au nombre de
    /// lignes rendues ; ça rend la troncature lisible, et ça rend utilisable le
    /// repli `data.count >= deltaPageLimit` du jour où la réponse n'annonce pas
    /// sa pagination — sous `limit=500`, ce repli n'aurait jamais pu déclencher.
    static let deltaPageLimit = 100

    /// JUMEAU WEB — `apps/web/hooks/queries/use-conversations-delta-sync.ts` +
    /// `apps/web/lib/conversations/delta-sync.ts` portent la même règle sur le
    /// cache React Query : même endpoint (`GET /conversations?updatedSince=`),
    /// même upsert par id, même retrait sur `isActive == false`, même repli sur
    /// la vérité serveur quand le delta ne prouve plus sa complétude. Toute
    /// évolution de la règle touche les DEUX plateformes.
    ///
    /// TRONCATURE : `GET /conversations` plafonne à 100
    /// (`Math.min(limit, 100)`, `routes/conversations/core.ts`). Une fenêtre
    /// ayant touché plus de 100 conversations rend donc une page tronquée.
    ///
    /// La route trie DÉSORMAIS une page delta par `updatedAt` croissant (elle
    /// triait par `lastMessageAt` décroissant, sans rapport avec le filtre) :
    /// les lignes coupées sont exactement celles d'`updatedAt` supérieur à la
    /// dernière rendue, donc `lastSyncTimestamp` — avancé au max des `updatedAt`
    /// reçus — pointe dessus au lieu de les enjamber. La troncature est une
    /// pagination, plus une perte.
    ///
    /// RÉSIDU que l'ordre ne rattrape pas : plus de 100 conversations portant la
    /// MÊME milliseconde d'`updatedAt` (écriture en masse) débordent d'une page
    /// que la borne stricte `gt` ne peut pas reprendre. Une page dont le serveur
    /// annonce du reste (`pagination.hasMore`, autoritaire sur une page delta —
    /// voir `deltaSyncCore`) est donc traitée comme une preuve d'INCOMPLÉTUDE,
    /// jamais comme un delta de confiance, et escalade vers `fullSync` —
    /// exactement comme le web escalade vers la relecture complète.
    ///
    /// DIVERGENCE ASSUMÉE avec le web sur le curseur, parce que sa nature
    /// diffère : le web le RECALCULE depuis son cache à chaque exécution, iOS le
    /// PERSISTE. Un curseur persisté avancé sur une page tronquée survivrait à
    /// une escalade échouée et enjamberait les lignes coupées à vie ; iOS ne
    /// l'avance donc pas tant que la page ne prouve pas sa complétude
    /// (`SyncWatermark.advancedAfterDeltaPage`).
    @discardableResult
    public func syncSinceLastCheckpoint() async -> Bool {
        let outcome = await deltaSyncCore()
        // Réconciliation complète, chaînée APRÈS le delta (hors du garde
        // `isSyncing` que le corps tient). Deux raisons de la déclencher, une
        // seule action — fullSync remplace la liste par la vérité serveur :
        //
        // - page laissant du RESTE ⇒ le delta ne PROUVE plus qu'il a tout vu, et
        //   son curseur est resté en arrière pour que la fenêtre reste
        //   rejouable. L'escalade est la seule voie pour combler le reste ET la
        //   seule qui fera repartir le curseur (`SyncWatermark.fromFullSync`) ;
        // - fenêtre de 24 h échue ⇒ purge des fantômes hard-supprimés, que le
        //   delta upsert-only ne peut pas voir. Bornée à 1× par
        //   `fullReconcileInterval` — le delta reste le chemin nominal bon
        //   marché.
        //
        // Seulement sur delta RÉUSSI : offline/panne, on garde le cache intact
        // (local-first) et on retentera au prochain delta.
        if outcome.succeeded && (outcome.mayHaveMore || isFullReconcileDue) {
            await fullSync()
        }
        return outcome.succeeded
    }

    /// PORTÉE DE `reconcileUnread` CÔTÉ WEB — voir le jumeau nommé sur
    /// `syncSinceLastCheckpoint` ci-dessus pour la règle de fusion elle-même.
    ///
    /// `mergeConversationDelta` (`apps/web/lib/conversations/delta-sync.ts`) ne
    /// porte que la RÈGLE 1 de `reconcileUnread` — conversation ouverte ⇒ 0.
    /// La règle 2 (« lecture locale postérieure au dernier message serveur »)
    /// n'a pas de transposition sûre : elle s'appuie sur `userState.lastReadAt`,
    /// frontière LOCALE que le modèle web ne porte pas, et c'est le fait que
    /// `markAsUnread` EFFACE cette frontière qui laisse le compteur serveur
    /// reprendre la main. Une transposition basée sur `unreadCount` +
    /// `lastMessageAt` n'a pas cet interrupteur : elle rendrait un
    /// « marquer comme non lu » cross-device définitivement invisible sur le
    /// web. Fermer l'écart demande de faire voyager la frontière de lecture
    /// jusqu'au modèle web — chantier de contrat, pas garde de fusion.
    private func deltaSyncCore() async -> DeltaOutcome {
        guard !isSyncing else { return .complete }
        // Throttle bursts: when several signals (socket reconnect,
        // foreground return, cache-stale revalidate) fire within the
        // same window, only the first one hits the network. Returning
        // `.complete` is intentional — from the caller's perspective the
        // delta is "fresh enough" since a recent one just landed.
        let now = Date()
        if now.timeIntervalSince(lastDeltaSyncAt) < deltaSyncCooldown {
            return .complete
        }
        lastDeltaSyncAt = now
        isSyncing = true
        defer { isSyncing = false }

        do {
            let since = lastSyncTimestamp
            let sinceStr = since.formatted(.iso8601.time(includingFractionalSeconds: true))
            let queryItems = [
                URLQueryItem(name: "limit", value: String(Self.deltaPageLimit)),
                URLQueryItem(name: "offset", value: "0"),
                URLQueryItem(name: "updatedSince", value: sinceStr)
            ]

            let response: OffsetPaginatedAPIResponse<[APIConversation]> = try await api.request(
                endpoint: "/conversations",
                method: "GET",
                body: nil,
                queryItems: queryItems
            )

            let userId = await currentUserId()
            let deltaConversations = (await Self.mapConversationsOffMain(response.data, userId: userId))

            let existing = await cache.conversations.load(for: "list").snapshot() ?? []

            // O(existing + deltas) merge by id, instead of an O(deltas × convs)
            // firstIndex / removeAll scan per delta — measurable on a foreground
            // reconnect with hundreds of conversations. The merge order is
            // irrelevant: `saveSorted` below re-sorts the result deterministically.
            let (merged, removedIds) = Self.mergeDeltaConversations(
                existing: existing,
                deltas: deltaConversations,
                tombstoneIds: response.meta?.deletedConversationIds ?? []
            )
            let removedSet = Set(removedIds)
            for removedId in removedIds {
                await cache.messages.invalidate(for: removedId)
                // Une conversation sortie de la vue doit aussi cesser d'être
                // TROUVABLE : l'index FTS local est une projection, et rien ne
                // le purgeait — la ligne y survivait au retrait de la liste, et
                // la recherche rendait un id qui ne résout plus.
                await SearchIndex.shared.removeConversation(id: removedId)
            }

            await saveSorted(merged, to: "list", baseline: existing)
            // `removedSet` filtre ici aussi, et pas seulement par symétrie : une
            // conversation SERVIE par la page puis déclarée partie par les
            // tombstones du même lot est active dans `deltaConversations`. La
            // ré-indexer après l'avoir retirée la ressusciterait dans l'index,
            // seule — retirée de la liste, toujours trouvable.
            await SearchIndex.shared.indexConversations(
                deltaConversations.filter { $0.isActive && !removedSet.contains($0.id) }
            )
            _conversationsDidChange.send()

            // Advance the delta cursor to the newest SERVER `updatedAt` seen, not
            // the device clock (R15b) — a device ahead of the server used to push
            // `updatedSince` past real updates in `[serverNow, deviceNow]` and drop
            // them. Never regresses; an empty delta keeps the prior cursor.
            //
            // Et une page qui a laissé du RESTE ne le fait pas avancer du tout :
            // elle n'a pas prouvé qu'elle rendait toute la fenêtre, qui reste
            // donc ouverte pour l'escalade que `syncSinceLastCheckpoint`
            // enchaîne — ou pour le prochain delta si cette escalade échoue. La
            // fusion ci-dessus est conservée dans les deux cas : ce qu'on a reçu
            // est vrai, c'est seulement la COUVERTURE qui n'est pas prouvée.
            //
            // `hasMore` est AUTORITAIRE ici, et pas l'heuristique « la page est
            // pleine » : une page delta part toujours d'`offset=0`, ce qui fait
            // compter au serveur toutes les lignes de la MÊME clause
            // `updatedAt > since` (`prisma.conversation.count({ where:
            // whereClause })`, `routes/conversations/core.ts`) — `hasMore` y vaut
            // `N < total`. Une fenêtre de très exactement 100 conversations ne
            // déclenche donc AUCUNE escalade, là où `count >= limit` en aurait
            // imposé une pour rien. Repli sur l'heuristique si le bloc pagination
            // manque : conservateur, on suppose qu'il en reste.
            let pageMayHaveMore = response.pagination?.hasMore ?? (response.data.count >= Self.deltaPageLimit)

            // Les tombstones ont leur PROPRE plafond (500 par stream côté
            // gateway) et, contrairement à la page, aucun curseur de reprise :
            // il n'existe pas de « page suivante » de disparitions à demander.
            // Leur troncature est donc, elle aussi, une preuve d'incomplétude —
            // et elle se règle par le MÊME geste, l'escalade vers `fullSync`,
            // dont le remplacement de la liste purge les fantômes restants.
            //
            // La replier dans `mayHaveMore` retient aussi le curseur, et c'est
            // voulu : seul un `since` qui reste en place redemandera les
            // disparitions coupées si l'escalade échoue (offline, panne). Un
            // curseur avancé les rendrait irréclamables — la borne serveur des
            // tombstones est `> since`, exactement comme celle de la page.
            let tombstonesTruncated = response.meta?.deletedConversationIdsTruncated ?? false
            let mayHaveMore = pageMayHaveMore || tombstonesTruncated
            lastSyncTimestamp = SyncWatermark.advancedAfterDeltaPage(
                previous: lastSyncTimestamp,
                receivedUpdatedAt: deltaConversations.map(\.updatedAt),
                pageMayHaveMore: mayHaveMore
            )
            return DeltaOutcome(succeeded: true, mayHaveMore: mayHaveMore)
        } catch {
            Self.logger.error("[SyncEngine] deltaSync error: \(error.localizedDescription)")
            return .failed
        }
    }

    /// Merge a batch of delta conversations into `existing` by id. Active deltas
    /// upsert (replace-or-insert); inactive deltas remove. Returns the merged
    /// list plus every inactive delta id (so the caller can invalidate their
    /// message caches, exactly as the previous per-delta loop did). The merged
    /// order is intentionally unspecified — callers re-sort via `saveSorted`.
    /// O(existing + deltas) instead of O(deltas × existing).
    ///
    /// `tombstoneIds` (`meta.deletedConversationIds`) est le TROISIÈME canal, et
    /// le seul par lequel une SORTIE de vue parvient au client : `deltas` ne
    /// porte que des lignes servies, et la clause serveur exclut précisément une
    /// conversation fermée, quittée, bannie ou supprimée-pour-moi depuis un
    /// autre appareil. Un `isActive: false` ne suffisait donc pas — il ne décrit
    /// que les sorties que la page peut encore SERVIR.
    ///
    /// Les tombstones s'appliquent APRÈS les upserts, jamais avant : quand les
    /// deux flux du même lot se contredisent (la page a servi une ligne encore
    /// visible à la lecture, le stream des sorties la déclare partie), la SORTIE
    /// est le fait le plus spécifique. La garder affichée rendrait la purge
    /// inatteignable jusqu'à la réconciliation complète (24 h).
    static func mergeDeltaConversations(
        existing: [MeeshyConversation],
        deltas: [MeeshyConversation],
        tombstoneIds: [String] = []
    ) -> (merged: [MeeshyConversation], removedIds: [String]) {
        var byId = Dictionary(existing.map { ($0.id, $0) }, uniquingKeysWith: { _, new in new })
        var removedIds: [String] = []
        // `removedIds` pilote une invalidation par id chez l'appelant : un même
        // retrait annoncé par les DEUX canaux ne doit la déclencher qu'une fois.
        var alreadyRemoved = Set<String>()
        for delta in deltas {
            if delta.isActive {
                byId[delta.id] = delta
            } else {
                byId.removeValue(forKey: delta.id)
                if alreadyRemoved.insert(delta.id).inserted { removedIds.append(delta.id) }
            }
        }
        // Un id inconnu de la liste est rapporté quand même — même règle que
        // pour un delta inactif inconnu : la liste et le cache des messages sont
        // deux magasins DISTINCTS, et une conversation absente de l'une peut
        // très bien laisser un fil dans l'autre. (Divergence assumée avec le
        // web, dont le cache dérivé est indexé par la même clé que la liste.)
        for tombstoneId in tombstoneIds {
            byId.removeValue(forKey: tombstoneId)
            if alreadyRemoved.insert(tombstoneId).inserted { removedIds.append(tombstoneId) }
        }
        return (Array(byId.values), removedIds)
    }

    // MARK: - Messages

    public func ensureMessages(for conversationId: String, force: Bool) async {
        if !force {
            let cached = await cache.messages.load(for: conversationId)
            switch cached {
            case .fresh:
                return
            case .stale, .expired, .empty:
                break
            }
        }

        do {
            let response = try await messageService.list(
                conversationId: conversationId, offset: 0, limit: 30, includeReplies: true, includeTranslations: true, languages: nil
            )
            let userId = await currentUserId()
            let username = await currentUsername()
            if let mentionedUsers = response.meta?.mentionedUsers {
                UserDisplayNameCache.shared.trackFromMentionedUsers(mentionedUsers)
            }
            let freshMessages = response.data.map { $0.toMessage(currentUserId: userId, currentUsername: username) }
            // Atomic merge: keep any messages that arrived via socket between the
            // REST request and this write, so they are never silently overwritten.
            await cache.messages.mergeUpdate(for: conversationId) { existing in
                let freshIds = Set(freshMessages.map(\.id))
                let fromCacheOnly = existing.filter { !freshIds.contains($0.id) }
                return (freshMessages + fromCacheOnly).sorted { $0.createdAt < $1.createdAt }
            }
            // Mirror the fetched window into the app's on-device message store
            // so the conversation timeline (GRDB-backed) is already current
            // when the user opens it — the push-notification handler routes
            // through here with `force: true` precisely for that purpose.
            await apiMessagePersistor?(response.data)
            _messagesDidChange.send(conversationId)
        } catch {
            Self.logger.error("[SyncEngine] ensureMessages error: \(error.localizedDescription)")
        }
    }

    public func fetchOlderMessages(for conversationId: String, before messageId: String) async {
        do {
            let response = try await messageService.listBefore(
                conversationId: conversationId, before: messageId, limit: 30, includeReplies: true, includeTranslations: true, languages: nil
            )
            let userId = await currentUserId()
            let username = await currentUsername()
            let olderMessages = response.data.map { $0.toMessage(currentUserId: userId, currentUsername: username) }

            // Atomic merge: prepend older messages without overwriting any
            // messages that arrived via socket between the REST fetch and now.
            await cache.messages.mergeUpdate(for: conversationId) { existing in
                let existingIds = Set(existing.map(\.id))
                let newOnly = olderMessages.filter { !existingIds.contains($0.id) }
                return newOnly + existing
            }
            await apiMessagePersistor?(response.data)
            _messagesDidChange.send(conversationId)
        } catch {
            Self.logger.error("[SyncEngine] fetchOlderMessages error: \(error.localizedDescription)")
        }
    }

    // MARK: - Retention Cleanup

    public func cleanupRetentionIfNeeded() async {
        if let lastCleanup = lastCleanupDate,
           Date().timeIntervalSince(lastCleanup) < 86400 {
            return
        }

        let oneYearAgo = Calendar.current.date(byAdding: .year, value: -1, to: Date()) ?? Date()
        let convs = await cache.conversations.load(for: "list").snapshot() ?? []

        for conv in convs {
            let messages = await cache.messages.load(for: conv.id).snapshot() ?? []
            guard messages.count > 600 else { continue }

            let recentByDate = messages.filter { $0.createdAt > oneYearAgo }
            let recentByCount = Array(messages.suffix(600))

            let toKeep = recentByDate.count > recentByCount.count ? recentByDate : recentByCount

            if toKeep.count < messages.count {
                do {
                    try await cache.messages.save(toKeep, for: conv.id)
                } catch {
                    Logger.cache.error("ConversationSyncEngine cleanup save failed for \(conv.id, privacy: .public): \(error.localizedDescription, privacy: .public)")
                }
            }
        }

        lastCleanupDate = Date()
    }

    // MARK: - Socket Relay

    public func startSocketRelay() async {
        socketSubscriptions.removeAll()

        // Message events
        messageSocket.messageReceived
            .sink { [weak self] apiMessage in
                guard let self else { return }
                Task { await self.handleNewMessage(apiMessage) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.messageEdited
            .sink { [weak self] apiMessage in
                guard let self else { return }
                Task { await self.handleEditedMessage(apiMessage) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.messageDeleted
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleDeletedMessage(event) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.reactionAdded
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleReactionAdded(event) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.reactionRemoved
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleReactionRemoved(event) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.reactionSynced
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleReactionSynced(event) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.unreadUpdated
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleUnreadUpdated(event) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.readStatusUpdated
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleReadStatusUpdated(event) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.translationReceived
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.cache.cacheTranslation(event) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.transcriptionReady
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.cache.cacheTranscription(event) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.audioTranslationReady
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.cache.cacheAudioTranslation(event) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.audioTranslationProgressive
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.cache.cacheAudioTranslation(event) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.audioTranslationCompleted
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.cache.cacheAudioTranslation(event) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.conversationJoined
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.cache.participants.invalidate(for: event.conversationId) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.conversationLeft
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.cache.participants.invalidate(for: event.conversationId) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.participantRoleUpdated
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.cache.participants.invalidate(for: event.conversationId) }
            }
            .store(in: &socketSubscriptions)

        // Attachment status updated (listened, watched, viewed, downloaded)
        messageSocket.attachmentStatusUpdated
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleAttachmentStatusUpdated(event) }
            }
            .store(in: &socketSubscriptions)

        // Attachment content updated (Whisper transcription, NLLB+TTS audio translation)
        messageSocket.attachmentUpdated
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleAttachmentUpdated(event) }
            }
            .store(in: &socketSubscriptions)

        // Conversation closed
        messageSocket.conversationClosed
            .sink { [weak self] event in
                guard let self else { return }
                Task {
                    await self.cache.conversations.update(for: "list") { conversations in
                        var updated = conversations
                        if let idx = updated.firstIndex(where: { $0.id == event.conversationId }) {
                            updated[idx].closedAt = (try? Date(event.closedAt, strategy: .iso8601.time(includingFractionalSeconds: true)))
                                ?? (try? Date(event.closedAt, strategy: .iso8601))
                            updated[idx].closedBy = event.closedBy
                        }
                        return updated
                    }
                    self._conversationsDidChange.send()
                }
            }
            .store(in: &socketSubscriptions)

        // Conversation metadata updated (title, avatar, description, …).
        // `ConversationStoreSocketBridge` routes the same broadcast to the RAM
        // store; this relay is what makes it survive a cold start.
        messageSocket.conversationUpdated
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleConversationUpdated(event) }
            }
            .store(in: &socketSubscriptions)

        // Profil public d'un CONTACT (nom, avatar, bannière). Même raison que
        // le relais ci-dessus : sans lui, la ligne redevient périmée au
        // prochain démarrage à froid, le temps que le REST réponde.
        messageSocket.userUpdated
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleUserUpdated(event) }
            }
            .store(in: &socketSubscriptions)

        // Conversation deleted server-side — drop the row (and its messages)
        // from the persisted cache, not only from the RAM store.
        messageSocket.conversationDeleted
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleConversationDeleted(event) }
            }
            .store(in: &socketSubscriptions)

        // Conversation RESTAURÉE sur un autre appareil (#4389) — la remettre
        // dans le cache PERSISTÉ, pas seulement dans le store RAM. Sans ce
        // relais, la restauration ne survivait pas au prochain démarrage à
        // froid : le cache disque continuait de servir une liste d'où la
        // conversation avait été retirée, exactement le défaut symétrique que
        // le doc-comment de la descendante nomme au-dessus.
        messageSocket.conversationRestored
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleConversationRestored(event) }
            }
            .store(in: &socketSubscriptions)

        // `message:consumed` (vue unique consommée) reçu conversation FERMÉE :
        // sans ce relais, seule la conversation ouverte marquait le message
        // consommé — le rouvrir hors-ligne réaffichait un média déjà brûlé.
        messageSocket.messageConsumed
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleMessageConsumed(event) }
            }
            .store(in: &socketSubscriptions)

        // Reconnect -> delta sync
        messageSocket.didReconnect
            .sink { [weak self] in
                guard let self else { return }
                Task { await self.syncSinceLastCheckpoint() }
            }
            .store(in: &socketSubscriptions)

        // Initial recompute so cold-start (cache already hydrated from disk
        // before any socket event arrives) publishes the correct aggregate
        // to subscribers. Without this, `totalConversationsUnreadValue`
        // stays at 0 until the first `unread-updated` event lands.
        await recomputeTotalUnread()
    }

    public func stopSocketRelay() async {
        socketSubscriptions.removeAll()
        // Les fenêtres d'accusé de réception ne survivent pas au relais : sur un
        // changement de compte, un envoi encore en attente partirait sous la
        // session SUIVANTE.
        let pending: [Task<Void, Never>] = stateQueue.sync {
            let tasks = Array(_markAsReceivedTasks.values)
            _markAsReceivedTasks.removeAll()
            return tasks
        }
        pending.forEach { $0.cancel() }
    }

    // MARK: - Socket Event Handlers

    private func handleNewMessage(_ apiMessage: APIMessage) async {
        Self.logger.info("[SyncEngine] handleNewMessage id=\(apiMessage.id, privacy: .public) conv=\(apiMessage.conversationId, privacy: .public)")
        if let mentionedUsers = apiMessage.mentionedUsers {
            UserDisplayNameCache.shared.trackFromMentionedUsers(mentionedUsers)
        }
        let userId = await currentUserId()
        let username = await currentUsername()
        let displayName = await currentUserDisplayName()
        let isMe = apiMessage.senderId == userId
        let msg = apiMessage.toMessage(
            currentUserId: userId, currentUsername: username, currentUserDisplayName: displayName)
        await cache.messages.upsert(item: msg, for: msg.conversationId) { existing, new in
            existing.contains(where: { $0.id == new.id }) ? existing : existing + [new]
        }
        // Persist into the app's GRDB message store too — this is the ONLY
        // global `message:new` sink, so without it a broadcast for a CLOSED
        // conversation updates the list preview but never reaches the
        // timeline the conversation screen renders. The upsert reconciles by
        // clientMessageId/serverId, so the open conversation's own handler
        // buffering the same payload stays idempotent — and an own-echo
        // arriving after the user navigated away still flips its optimistic
        // `.sending` row to `.sent` instead of leaving the clock forever.
        await apiMessagePersistor?([apiMessage])
        _messagesDidChange.send(msg.conversationId)

        // Facette COMPLÈTE du nouveau dernier message. Les onze champs
        // `lastMessage*` décrivent un seul message : n'en écrire que trois
        // laissait la ligne mélanger le texte du nouveau message avec la pièce
        // jointe, l'expiration et le drapeau « vue unique » de l'ANCIEN — un
        // texte tout neuf résumé « Vue unique » parce que la photo précédente
        // l'était. Cf. `LastMessageFacet`.
        //
        // Changement assumé : quand un écho socket allégé omet l'enveloppe
        // expéditeur, l'auteur devient `nil` au lieu de conserver le précédent.
        // Garder l'ancien collait le nom d'Alice sous le message de Bob — la
        // ligne était FAUSSE, pas incomplète, et rien ne la corrigeait. Ne pas
        // « restaurer » ce repli.
        let facet = LastMessageFacet(
            message: msg,
            preview: msg.content,
            translations: Self.previewTranslations(
                from: apiMessage,
                viewerLanguages: await currentPreferredLanguages()
            )
        )

        // Snapshot the cached list to decide whether the conversation
        // already exists. The `update` mutate closure is sync +
        // nonisolated, so we can't fetch from inside it — branch here.
        let cachedList = await cache.conversations.load(for: "list")
        let conversationExists = cachedList.snapshot()?.contains(where: { $0.id == msg.conversationId }) ?? false

        if conversationExists {
            await cache.conversations.update(for: "list") { conversations in
                var updated = conversations
                if let idx = updated.firstIndex(where: { $0.id == msg.conversationId }) {
                    // Monotone guard: a REST send racing the socket broadcast
                    // (or any other out-of-order `message:new`) must not
                    // regress the row to older content/position once a
                    // newer message has already been applied.
                    guard msg.createdAt > updated[idx].lastMessageAt else { return updated }
                    updated[idx].applyLastMessage(facet)
                    let conv = updated.remove(at: idx)
                    updated.insert(conv, at: 0)
                }
                return updated
            }
        } else {
            // First time this device sees the conversation (brand-new
            // DM, group invite the user just got added to, or a record
            // missed by `fullSync()`'s parallel page fetches). Pull the
            // full conversation row from the API and prepend it so the
            // list surfaces the new chat in real time instead of
            // waiting for the next manual refresh.
            do {
                let apiConv = try await ConversationService.shared.getById(msg.conversationId)
                let userId = await currentUserId()
                let domainConv = apiConv.toConversation(currentUserId: userId)
                await cache.conversations.update(for: "list") { conversations in
                    var updated = conversations
                    // Defensive dedup: a concurrent handleNewMessage
                    // for the same conversation could have raced ahead.
                    updated.removeAll { $0.id == domainConv.id }
                    updated.insert(domainConv, at: 0)
                    return updated
                }
                // The freshly-fetched conversation may carry an `unreadCount`
                // > 0 (group the user was added to, missed during fullSync).
                // Recompute now so the back-button pill is correct before
                // the next `conversation:unread-updated` arrives.
                await recomputeTotalUnread()
            } catch {
                Self.logger.error("[SyncEngine] Failed to fetch missing conversation \(msg.conversationId): \(error.localizedDescription)")
            }
        }
        _conversationsDidChange.send()

        // Auto mark-as-received for messages from other users — coalescé par
        // conversation (voir `_markAsReceivedTasks`).
        if !isMe {
            scheduleMarkAsReceived(for: msg.conversationId)
        }
    }

    /// Ouvre (ou rejoint) la fenêtre de coalescence d'une conversation. Le
    /// PREMIER message de la rafale arme l'envoi ; les suivants tombent sur une
    /// fenêtre déjà ouverte et ne coûtent rien.
    private func scheduleMarkAsReceived(for conversationId: String) {
        let window = markAsReceivedWindow
        // La table des tâches EST la fenêtre : une entrée présente signifie
        // « déjà armée ». Un jeu d'ids en attente à côté d'elle se
        // désynchroniserait — la tâche s'y retirant elle-même, une seconde
        // rafale pourrait réarmer avant que la première ne se soit enregistrée,
        // et `stopSocketRelay` n'aurait plus que la tâche MORTE à annuler.
        stateQueue.sync {
            guard _markAsReceivedTasks[conversationId] == nil else { return }
            _markAsReceivedTasks[conversationId] = Task { [weak self] in
                try? await Task.sleep(nanoseconds: UInt64(window * 1_000_000_000))
                guard let self else { return }
                // La fenêtre se ferme AVANT l'envoi : un message arrivant
                // pendant l'aller-retour ouvre la fenêtre SUIVANTE au lieu
                // d'être avalé.
                self.stateQueue.sync { _ = self._markAsReceivedTasks.removeValue(forKey: conversationId) }
                guard !Task.isCancelled else { return }
                do {
                    try await self.conversationService.markAsReceived(conversationId: conversationId)
                } catch {
                    Self.logger.error("[SyncEngine] markAsReceived failed for \(conversationId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                }
            }
        }
    }

    private func handleEditedMessage(_ apiMessage: APIMessage) async {
        let userId = await currentUserId()
        let username = await currentUsername()
        let displayName = await currentUserDisplayName()
        let msg = apiMessage.toMessage(
            currentUserId: userId, currentUsername: username, currentUserDisplayName: displayName)
        await cache.messages.upsertPatch(for: msg.conversationId, itemId: msg.id) { existing in
            existing = msg
        }
        await realtimeMessagePersistor?(Self.mutation(for: apiMessage, content: msg.content))
        _messagesDidChange.send(msg.conversationId)
        // If the edited message is the conversation's last message, the list-row
        // preview still shows the pre-edit text — refresh it in place.
        await refreshLastMessagePreviewIfEdited(
            conversationId: msg.conversationId, messageId: msg.id, newContent: msg.content)
    }

    private func handleDeletedMessage(_ event: MessageDeletedEvent) async {
        let callId = await cache.messages.load(for: event.conversationId).snapshot()?
            .first(where: { $0.id == event.messageId })?.callSummary?.callId

        let deletedAt = Date()
        await cache.messages.upsertPatch(for: event.conversationId, itemId: event.messageId) { msg in
            msg.deletedAt = deletedAt
            msg.content = ""
        }
        await realtimeMessagePersistor?(.deleted(messageId: event.messageId, deletedAt: deletedAt))
        if let callId {
            await CallTranscriptStore.shared.invalidate(for: callId)
        }
        _messagesDidChange.send(event.conversationId)
        // If the deleted message was the conversation's last message, the list-row
        // preview still shows the (now-deleted) text — recompute it from the most
        // recent surviving message, mirroring the gateway's `deletedAt: null` REST list.
        await recomputeLastMessagePreviewAfterDeletion(
            conversationId: event.conversationId, deletedMessageId: event.messageId)
    }

    /// Updates a conversation row's `lastMessagePreview` when the edited message
    /// is that row's `lastMessageId`. No-op otherwise (editing an older message
    /// leaves the preview untouched). Fires `_conversationsDidChange` only when a
    /// row actually changed.
    ///
    /// Une édition garde le MÊME message : l'auteur, les pièces jointes et les
    /// drapeaux éphémères restent vrais, et ce chemin n'y touche pas. Seule la
    /// carte du Prisme devient fausse — elle traduit le texte remplacé — et
    /// c'est celle que le résolveur préfère.
    private func refreshLastMessagePreviewIfEdited(
        conversationId: String, messageId: String, newContent: String
    ) async {
        let list = await cache.conversations.load(for: "list").snapshot() ?? []
        guard list.first(where: { $0.id == conversationId })?.lastMessageId == messageId else { return }
        await cache.conversations.update(for: "list") { conversations in
            var updated = conversations
            if let idx = updated.firstIndex(where: { $0.id == conversationId }) {
                updated[idx].lastMessagePreview = newContent.meeshyPreviewTruncated
                // La carte du Prisme traduisait le texte D'AVANT. Le résolveur
                // (`resolvedLastMessagePreview`) la PRÉFÈRE à l'aperçu brut :
                // la garder ici réécrivait le texte visible… pour personne, le
                // lecteur servi par une traduction continuant de lire la phrase
                // pré-édition. Le serveur fait le même geste dans la même
                // écriture — `routes/messages.ts` remet `Message.translations`
                // à `null` avec le nouveau contenu, et `emitConversationPreview
                // Update` l'annonce par `.replaced([:])`.
                //
                // `lastMessageOriginalLanguage` reste : le message n'a pas
                // changé d'identité, et sans carte le résolveur ne le consulte
                // plus. Le prochain `conversation:updated` reposera les deux.
                updated[idx].lastMessageTranslations = nil
            }
            return updated
        }
        _conversationsDidChange.send()
    }

    /// Recomputes a conversation row's last-message fields when the deleted
    /// message was that row's `lastMessageId`, picking the most recent surviving
    /// (non-deleted) message from the messages cache. If the cache holds no
    /// replacement (older messages never loaded), the row is left untouched — the
    /// next REST list refresh (which filters `deletedAt: null`) corrects it —
    /// rather than wrongly clearing a preview that should show an earlier message.
    private func recomputeLastMessagePreviewAfterDeletion(
        conversationId: String, deletedMessageId: String
    ) async {
        let list = await cache.conversations.load(for: "list").snapshot() ?? []
        guard list.first(where: { $0.id == conversationId })?.lastMessageId == deletedMessageId else { return }
        let messages = await cache.messages.load(for: conversationId).snapshot() ?? []
        let newLast = Self.mostRecentSurvivor(in: messages, excluding: deletedMessageId)
        await cache.conversations.update(for: "list") { conversations in
            var updated = conversations
            if let idx = updated.firstIndex(where: { $0.id == conversationId }) {
                if let newLast {
                    // Le survivant est ici TOUT ENTIER : la facette s'écrit donc
                    // en bloc, plutôt que quatre champs à la main. Les sept
                    // autres décrivaient encore le message SUPPRIMÉ — sa
                    // vignette, son « Vue unique », son expiration, sa carte de
                    // traductions (que le résolveur PRÉFÈRE à l'aperçu, donc la
                    // ligne rendait le texte traduit du disparu). Même défaut
                    // que celui du chemin reçu, découvert localement.
                    updated[idx].applyLastMessage(LastMessageFacet(
                        message: newLast,
                        preview: newLast.content
                    ))
                } else {
                    // The deleted message was the conversation's ONLY message — there
                    // is no survivor to surface. Clear the stale preview so the list
                    // row stops showing the deleted message's text (displayed ≠ real).
                    //
                    // Même geste que celui qu'applique `ConversationStore.merging`
                    // quand le SERVEUR annonce « plus aucun message visible »
                    // (`LastMessageIdentity.replaced(nil)`) : c'est le même fait,
                    // découvert localement au lieu d'être reçu. Le vidage à la main
                    // qui vivait ici ne touchait que le texte et l'id, laissant la
                    // pastille de pièce jointe, l'épingle de position et le libellé
                    // « Message expiré » décrire le message supprimé.
                    updated[idx].clearLastMessage()
                }
            }
            return updated
        }
        _conversationsDidChange.send()
    }

    /// The most recent non-deleted message in a conversation, excluding the one
    /// just deleted — i.e. the message that should become the list-row preview
    /// after a deletion. `nil` when every message is gone. Pure + testable.
    nonisolated static func mostRecentSurvivor(
        in messages: [MeeshyMessage],
        excluding deletedMessageId: String
    ) -> MeeshyMessage? {
        messages
            .filter { $0.deletedAt == nil && $0.id != deletedMessageId }
            .max(by: { $0.createdAt < $1.createdAt })
    }

    private func handleReactionAdded(_ event: ReactionUpdateEvent) async {
        guard let convId = event.conversationId else { return }
        let reaction = MeeshyReaction(
            messageId: event.messageId,
            participantId: event.participantId,
            emoji: event.emoji
        )
        await cache.messages.upsertPatch(for: convId, itemId: event.messageId) { msg in
            if !msg.reactions.contains(where: { $0.emoji == reaction.emoji && $0.participantId == reaction.participantId }) {
                msg.reactions.append(reaction)
            }
        }
        await realtimeMessagePersistor?(.reactionAdded(
            messageId: event.messageId,
            reactionId: reaction.id,
            emoji: event.emoji,
            participantId: event.participantId,
            maxCount: event.aggregation?.count
        ))
        _messagesDidChange.send(convId)
    }

    private func handleReactionRemoved(_ event: ReactionUpdateEvent) async {
        guard let convId = event.conversationId else { return }
        await cache.messages.upsertPatch(for: convId, itemId: event.messageId) { msg in
            msg.reactions.removeAll { $0.emoji == event.emoji && $0.participantId == event.participantId }
        }
        await realtimeMessagePersistor?(.reactionRemoved(
            messageId: event.messageId,
            emoji: event.emoji,
            participantId: event.participantId
        ))
        _messagesDidChange.send(convId)
    }

    private func handleReactionSynced(_ event: ReactionSyncEvent) async {
        let messageId = event.messageId
        let reactions = event.reactions
        let keys = await cache.messages.loadedKeys()
        for key in keys {
            await cache.messages.update(for: key) { existing in
                existing.map { msg in
                    guard msg.id == messageId else { return msg }
                    var updated = msg
                    updated.reactions = reactions.flatMap { agg in
                        let pids = agg.participantIds ?? []
                        return (0..<agg.count).map { index in
                            let pid: String? = index < pids.count ? pids[index] : nil
                            return MeeshyReaction(
                                messageId: messageId,
                                participantId: pid,
                                emoji: agg.emoji
                            )
                        }
                    }
                    return updated
                }
            }
        }
    }

    private func handleUnreadUpdated(_ event: UnreadUpdateEvent) async {
        // Gate the server-provided value on whether the user is currently
        // viewing this conversation. The gateway broadcasts the same
        // `unreadCount` to every recipient regardless of presence; the
        // client overrides it to 0 for the open conversation because the
        // user IS reading it. This avoids the "11 → 75 then back to 0"
        // visual flicker when a stale server count momentarily lands.
        let effectiveUnread = (event.conversationId == currentlyOpenConversationId)
            ? 0
            : event.unreadCount
        await cache.conversations.update(for: "list") { conversations in
            var updated = conversations
            if let idx = updated.firstIndex(where: { $0.id == event.conversationId }) {
                updated[idx].userState.unreadCount = effectiveUnread
                // G-124 — le pont ✦ voyage sur CE même événement (G-123,
                // `ConversationUnreadUpdatedEventData.bridge`).
                //
                // Cycle 63 : on ÉCRIT sur ce qu'annonce le serveur, plus sur la
                // valeur d'un optionnel. `event.bridge` valait `nil` aussi bien
                // quand le serveur disait « il n'y a pas de pont » que quand il
                // ne disait rien du tout, et cette ligne recopiait les deux —
                // si bien que tout émetteur qui ne calculait pas le pont en
                // ordonnait l'effacement. C'est ce qui retirait le pont de
                // TOUTES les lignes du lecteur à chaque reconnexion.
                //
                // `.notComputed` ne touche à rien : un silence ne détruit pas.
                switch event.announcement {
                case .notComputed:
                    break
                case .cleared:
                    updated[idx].bridge = nil
                case .bridge(let bridge):
                    updated[idx].bridge = bridge
                }
            }
            return updated
        }
        _conversationsDidChange.send()
        await recomputeTotalUnread()
    }

    private func handleReadStatusUpdated(_ event: ReadStatusUpdateEvent) async {
        let userId = await currentUserId()

        // Update conversation unread count (userId is preferred, fallback to participantId)
        let eventUserId = event.userId ?? event.participantId

        // CRITICAL: only zero unreadCount on a true 'read' event. The gateway
        // also emits this event with type=='received' when the delivery cursor
        // advances (e.g. our own AppDelegate.willPresent → PushDeliveryReceiptService.ack
        // → POST /mark-as-received). A 'received' event means "the message
        // reached this device" — NOT "the user opened the conversation".
        // Wiping unreadCount on 'received' caused the badge flicker the user
        // saw: handleUnreadUpdated bumps it to 1 when the message lands, then
        // a 'received' read-status:updated arrives moments later and wipes
        // it to 0 even though the conversation is still unread.
        if eventUserId == userId && event.type == "read" {
            let authoritative = event.unreadCount ?? 0
            await cache.conversations.update(for: "list") { conversations in
                var updated = conversations
                if let idx = updated.firstIndex(where: { $0.id == event.conversationId }) {
                    updated[idx].userState.unreadCount = authoritative
                }
                return updated
            }
            _conversationsDidChange.send()
            await recomputeTotalUnread()
        }

        // Update delivery status of own messages in the message cache.
        // WhatsApp-style all-or-nothing: the double-gray "delivered" / indigo
        // "read" indicator must represent EVERY recipient, never a single member
        // of a group. `summary.totalMembers` is the active recipient count
        // (sender excluded); a 0 denominator falls back to legacy "any > 0" so
        // 1:1 keeps working.
        let summary = event.summary
        let newStatus = DeliveryStatusResolver.fromCounts(
            deliveredCount: summary.deliveredCount,
            readCount: summary.readCount,
            recipientCount: summary.totalMembers
        )

        await cache.messages.update(for: event.conversationId) { messages in
            Self.applyReadReceipt(
                to: messages,
                newStatus: newStatus,
                deliveredCount: summary.deliveredCount,
                readCount: summary.readCount,
                frontier: event.updatedAt
            )
        }
        _messagesDidChange.send(event.conversationId)
    }

    /// Applies a read/deliver-status update to the sender's own messages, gated
    /// by the read frontier `frontier` (the event's `updatedAt`). A message
    /// created AFTER the recipient's read/deliver moment cannot have been
    /// read/delivered yet, so it must NOT advance to `.read`/`.delivered` —
    /// otherwise a message sent right after the peer read would falsely render
    /// the double-check / "Lu". Iterates newest-first: messages beyond the
    /// frontier are skipped, the monotonic guard only advances a status that is
    /// genuinely better, and once an already-`.read` message is reached every
    /// older one is read too. Pure + testable.
    nonisolated static func applyReadReceipt(
        to messages: [MeeshyMessage],
        newStatus: MeeshyMessage.DeliveryStatus,
        deliveredCount: Int,
        readCount: Int,
        frontier: Date
    ) -> [MeeshyMessage] {
        var updated = messages
        for i in updated.indices.reversed() {
            guard updated[i].isMe else { continue }
            if updated[i].createdAt > frontier { continue }
            let current = updated[i].deliveryStatus
            if current == .read { break }
            if newStatus.isBetterThan(current) {
                updated[i].deliveryStatus = newStatus
                updated[i].deliveredCount = deliveredCount
                updated[i].readCount = readCount
            }
        }
        return updated
    }

    /// Classe un `message:edited` : un message porteur d'un résumé d'appel
    /// décrit la fin de l'appel, pas une édition utilisateur. Le confondre avec
    /// `.edited` poserait « modifié » sur un avis d'appel et écraserait le
    /// résumé — même distinction que `ConversationSocketHandler` applique déjà
    /// sur la conversation ouverte. Pure + testable.
    nonisolated static func mutation(
        for apiMessage: APIMessage, content: String
    ) -> RealtimeMessageMutation {
        guard let callSummary = apiMessage.callSummary else {
            // L'horloge SERVEUR, jamais celle de l'appareil : `markEdited`
            // compare cet instant au précédent pour rejeter les échos
            // désordonnés, ce qui n'a de sens qu'entre horloges comparables.
            return .edited(
                messageId: apiMessage.id,
                content: content,
                editedAt: apiMessage.editedAt ?? Date()
            )
        }
        return .callNoticeUpdated(
            messageId: apiMessage.id,
            content: content,
            callSummaryJson: try? JSONEncoder().encode(callSummary),
            serverUpdatedAt: apiMessage.updatedAt ?? apiMessage.editedAt ?? Date()
        )
    }

    // MARK: - Conversation lifecycle (persisted)

    /// `conversation:updated` relayed into the PERSISTED list. The RAM
    /// `ConversationStore` already applied it (via `ConversationStoreSocketBridge`)
    /// but nothing wrote it to disk: a rename received while the list screen was
    /// gone came back to its old title on the next cold start.
    ///
    /// The merge runs INSIDE the cache mutation closure so a concurrent
    /// `userState` write (read receipt, pin) can't be clobbered by a row rebuilt
    /// from a pre-read snapshot. The pre-read exists only to skip the write —
    /// and the `_conversationsDidChange` fan-out — when nothing changed.
    private func handleConversationUpdated(_ event: ConversationUpdatedEvent) async {
        let storeEvent = ConversationStoreSocketBridge.mapConversationUpdated(event)
        let list = await cache.conversations.load(for: "list").snapshot() ?? []
        guard Self.applyingConversationUpdate(storeEvent, to: list) != nil else { return }
        await cache.conversations.update(for: "list") { conversations in
            Self.applyingConversationUpdate(storeEvent, to: conversations) ?? conversations
        }
        _conversationsDidChange.send()
    }

    /// Apply a `conversation:updated` payload to a cached list, returning `nil`
    /// when the event changes nothing. Delegates the per-row rule to
    /// `ConversationStore.merging` so the persisted list and the RAM store can
    /// never disagree. Re-sorts only when `lastMessageAt` moved — the cache
    /// invariant is "sorted by `lastMessageAt` DESC" (cf. `saveSorted`), and
    /// `sorted(by:)` is not stable, so re-sorting on a metadata-only change
    /// would shuffle rows sharing a timestamp for nothing.
    nonisolated static func applyingConversationUpdate(
        _ event: ConversationUpdatedStoreEvent,
        to conversations: [MeeshyConversation]
    ) -> [MeeshyConversation]? {
        guard let index = conversations.firstIndex(where: { $0.id == event.conversationId }),
              let merged = ConversationStore.merging(conversations[index], with: event)
        else { return nil }
        var updated = conversations
        updated[index] = merged
        guard merged.lastMessageAt != conversations[index].lastMessageAt else { return updated }
        return updated.sorted { $0.lastMessageAt > $1.lastMessageAt }
    }

    /// `user:updated` relayed into the PERSISTED list. Le store RAM l'applique
    /// déjà via `ConversationStoreSocketBridge` ; sans ce relais, un contact
    /// renommé pendant que l'écran de liste était fermé retrouvait son ancien
    /// nom au prochain démarrage à froid.
    ///
    /// Même découpage que `handleConversationUpdated` : la fusion tourne DANS
    /// la fermeture de mutation pour ne pas écraser une écriture `userState`
    /// concurrente, et la pré-lecture ne sert qu'à éviter l'écriture — et le
    /// fan-out `_conversationsDidChange` — quand rien ne change.
    private func handleUserUpdated(_ event: UserUpdatedEvent) async {
        let list = await cache.conversations.load(for: "list").snapshot() ?? []
        guard Self.applyingUserUpdate(event, to: list) != nil else { return }
        await cache.conversations.update(for: "list") { conversations in
            Self.applyingUserUpdate(event, to: conversations) ?? conversations
        }
        _conversationsDidChange.send()
    }

    /// Apply a `user:updated` payload to a cached list, returning `nil` when it
    /// changes nothing. Delegates the per-row rule to
    /// `ConversationStore.merging(_:withUserUpdate:)` — même raison que son
    /// jumeau ci-dessus : la liste persistée et le store RAM ne peuvent pas
    /// diverger sur ce que l'événement VEUT DIRE.
    ///
    /// Aucun tri : une identité de contact ne touche jamais `lastMessageAt`, et
    /// `sorted(by:)` n'étant pas stable, re-trier brasserait pour rien les
    /// lignes qui partagent un horodatage.
    nonisolated static func applyingUserUpdate(
        _ event: UserUpdatedEvent,
        to conversations: [MeeshyConversation]
    ) -> [MeeshyConversation]? {
        var updated = conversations
        var changed = false
        for index in updated.indices {
            guard let merged = ConversationStore.merging(updated[index], withUserUpdate: event) else { continue }
            updated[index] = merged
            changed = true
        }
        return changed ? updated : nil
    }

    /// `conversation:deleted` relayed into the PERSISTED list. Without it the
    /// row survived on disk and the next cold start resurrected a conversation
    /// the server no longer knows — inopenable, and only killed by a manual
    /// pull-to-refresh. Its message cache goes with it, mirroring the removal
    /// path of `deltaSyncCore`.
    private func handleConversationDeleted(_ event: ConversationDeletedSocketEvent) async {
        let list = await cache.conversations.load(for: "list").snapshot() ?? []
        guard list.contains(where: { $0.id == event.conversationId }) else { return }
        await cache.conversations.update(for: "list") { conversations in
            conversations.filter { $0.id != event.conversationId }
        }
        await cache.messages.invalidate(for: event.conversationId)
        _conversationsDidChange.send()
        await recomputeTotalUnread()
    }

    /// `conversation:restored` — la jumelle MONTANTE (#4389).
    ///
    /// La ligne revient dans le cache persisté par une lecture BORNÉE
    /// (`GET /conversations/:id`), jamais par un rechargement de liste : c'est
    /// la même règle que côté RAM et que côté web. Une lecture qui échoue ne
    /// fabrique rien — la liste reste telle quelle, et la prochaine synchro
    /// rattrapera.
    ///
    /// Idempotent : si la ligne est déjà présente (une autre voie l'a
    /// ramenée), elle est remplacée par la version fraîche plutôt que
    /// dupliquée.
    private func handleConversationRestored(_ event: ConversationRestoredSocketEvent) async {
        // `conversationService` est déjà une couture de ce moteur — pas de
        // dépendance neuve, et le double des tests la contrôle déjà.
        // `event.userId` EST le restaurateur : l'événement ne part que sur SA
        // room personnelle, donc le recevoir signifie que c'est nous, comme
        // pour la descendante juste au-dessus qui ne gate pas davantage.
        guard let api = try? await conversationService.getById(event.conversationId) else { return }
        let restored = api.toConversation(currentUserId: event.userId)
        await cache.conversations.update(for: "list") { conversations in
            conversations.filter { $0.id != restored.id } + [restored]
        }
        _conversationsDidChange.send()
        await recomputeTotalUnread()
    }

    /// `message:consumed` for a CLOSED conversation. `ConversationSocketHandler`
    /// covers the open one; without this relay a view-once media burnt on
    /// another device stayed viewable here until the next REST refetch.
    private func handleMessageConsumed(_ event: MessageConsumedEvent) async {
        await realtimeMessagePersistor?(.consumed(
            messageId: event.messageId,
            viewOnceCount: event.viewOnceCount
        ))
        _messagesDidChange.send(event.conversationId)
    }

    // MARK: - Local-First Updates

    private func handleAttachmentStatusUpdated(_ event: AttachmentStatusUpdatedEvent) async {
        // Trigger message refresh so UI can re-render attachment status indicators
        _messagesDidChange.send(event.conversationId)
    }

    /// Patches the enriched attachment fields (Whisper transcription, NLLB+TTS audio
    /// translations) into the cached `MeeshyMessage` for conversations that are not
    /// currently open. The open-conversation path is handled by `ConversationSocketHandler`
    /// which also updates the GRDB store and in-memory ViewModel dictionaries; this
    /// handler ensures the `CacheCoordinator` message cache stays consistent for every
    /// conversation, preventing stale previews after the user closes and reopens a chat.
    private func handleAttachmentUpdated(_ event: AttachmentUpdatedEvent) async {
        await cache.messages.upsertPatch(for: event.conversationId, itemId: event.messageId) { msg in
            guard let idx = msg.attachments.firstIndex(where: { $0.id == event.attachment.id }) else { return }
            let api = event.attachment
            if let t = api.transcription {
                msg.attachments[idx].transcription = MeeshyMessageAttachment.EmbeddedTranscription(
                    text: t.resolvedText,
                    language: t.language ?? "und",
                    confidence: t.confidence,
                    durationMs: t.durationMs,
                    speakerCount: t.speakerCount,
                    segments: t.segments?.map { s in
                        MeeshyMessageAttachment.EmbeddedTranscription.TranscriptionSegmentData(
                            text: s.text,
                            startTime: s.startTime,
                            endTime: s.endTime,
                            speakerId: s.speakerId
                        )
                    }
                )
            }
            if let translations = api.translations {
                let mapped = translations.compactMapValues { t -> MeeshyMessageAttachment.EmbeddedAudioTranslation? in
                    guard let url = t.url else { return nil }
                    return MeeshyMessageAttachment.EmbeddedAudioTranslation(
                        url: url,
                        transcription: t.transcription,
                        durationMs: t.durationMs,
                        format: t.format,
                        cloned: t.cloned,
                        quality: t.quality,
                        voiceModelId: t.voiceModelId,
                        ttsModel: t.ttsModel,
                        segments: t.segments?.map { s in
                            MeeshyMessageAttachment.EmbeddedTranscription.TranscriptionSegmentData(
                                text: s.text,
                                startTime: s.startTime,
                                endTime: s.endTime,
                                speakerId: s.speakerId
                            )
                        }
                    )
                }
                if !mapped.isEmpty {
                    msg.attachments[idx].audioTranslations = mapped
                }
            }
        }
        _messagesDidChange.send(event.conversationId)
    }

    /// `[langue: contenu]` du message, prêt pour le Prisme de la ligne de liste.
    /// Les codes sont minusculés — `resolvedLastMessagePreview` résout en
    /// minuscules et une clé « FR » ne serait jamais trouvée.
    ///
    /// **Jumeau socket de `buildLastMessagePreviewTranslations`** (gateway,
    /// `routes/conversations/utils/last-message-preview.ts`), qui sert la MÊME
    /// carte par REST. Les deux chemins alimentent une seule ligne de liste :
    /// toute exclusion présente d'un côté et absente de l'autre fait dépendre
    /// le texte affiché du transport qui l'a apporté. Les quatre exclusions et
    /// le plafond sont donc repris ici tels quels.
    ///
    /// 1. **Hors prisme du lecteur** — le résolveur n'affiche qu'UNE valeur ;
    ///    garder les N langues de la conversation n'alourdit que le cache.
    /// 2. **Langue d'origine** — elle EST déjà `lastMessagePreview`. La facette
    ///    socket transporte `lastMessageOriginalLanguage`, donc le résolveur
    ///    sert toujours l'original à SON rang (règle #3 du Prisme) sans avoir
    ///    besoin de la clé.
    /// 3. **Traduction chiffrée** — `translatedContent` est alors un
    ///    cryptogramme et la clé de déchiffrement ne transite pas par ce
    ///    chemin : la poser afficherait du base64 dans la liste, là où le même
    ///    message servi par REST retombe correctement sur l'original. C'est la
    ///    seule des quatre qui change le texte affiché.
    /// 4. **Texte inexploitable** — une entrée vide ou blanche ne décrit aucun
    ///    aperçu.
    ///
    /// Rend `nil` — jamais `[:]` — quand il ne reste rien, l'état que le
    /// résolveur distingue pour retomber sur l'original.
    static func previewTranslations(
        from apiMessage: APIMessage,
        viewerLanguages: [String]
    ) -> [String: String]? {
        guard let translations = apiMessage.translations, !translations.isEmpty else { return nil }
        let wanted = viewerLanguages.filter { !$0.isEmpty }.map { $0.lowercased() }
        guard !wanted.isEmpty else { return nil }
        let original = apiMessage.originalLanguage?.lowercased()

        var out: [String: String] = [:]
        for target in wanted {
            if let original, target == original { continue }
            if out[target] != nil { continue }
            // `last(where:)` conserve la règle « la dernière entrée gagne » du
            // `uniquingKeysWith` d'origine, pour un payload qui répéterait une
            // langue.
            guard let match = translations.last(where: { $0.targetLanguage.lowercased() == target })
            else { continue }
            guard match.isEncrypted != true else { continue }
            let text = match.translatedContent
            guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
            out[target] = text.meeshyPreviewTruncated
        }

        return out.isEmpty ? nil : out
    }

    /// Applique la facette du message qu'on vient d'envoyer, AVANT tout écho
    /// serveur. La ligne montre donc immédiatement l'auteur, la pièce jointe et
    /// les effets du message réellement envoyé — et non ceux du précédent.
    public func updateConversationAfterSend(_ facet: LastMessageFacet, conversationId: String) async {
        await cache.conversations.update(for: "list") { conversations in
            var updated = conversations
            if let idx = updated.firstIndex(where: { $0.id == conversationId }) {
                updated[idx].applyLastMessage(facet)
                updated[idx].userState.unreadCount = 0
                // Envoyer, c'est avoir lu : la frontière avance au-delà du
                // message qu'on vient de poser, sinon `reconcileUnread` la
                // trouverait périmée face au nouveau `lastMessageAt`.
                updated[idx].userState.lastReadAt = Date()
                let conv = updated.remove(at: idx)
                updated.insert(conv, at: 0)
            }
            return updated
        }
        _conversationsDidChange.send()
        await recomputeTotalUnread()
    }

    public func markConversationReadLocally(_ conversationId: String) async {
        await cache.conversations.update(for: "list") { conversations in
            var updated = conversations
            if let idx = updated.firstIndex(where: { $0.id == conversationId }) {
                updated[idx].userState.unreadCount = 0
                // Frontière de lecture locale — lue par `reconcileUnread` pour
                // qu'un instantané serveur en retard sur l'accusé de lecture
                // (outbox encore pleine, hors-ligne, 429) ne rallume pas la
                // pastille.
                updated[idx].userState.lastReadAt = Date()
            }
            return updated
        }
        _conversationsDidChange.send()
        await recomputeTotalUnread()
    }

    /// Symétrique de `markConversationReadLocally` : « marquer comme non lu »
    /// EFFACE la frontière de lecture, sinon `reconcileUnread` ramènerait le
    /// compteur à 0 au prochain instantané et le geste serait sans effet.
    public func markConversationUnreadLocally(_ conversationId: String) async {
        await cache.conversations.update(for: "list") { conversations in
            var updated = conversations
            if let idx = updated.firstIndex(where: { $0.id == conversationId }) {
                updated[idx].userState.lastReadAt = nil
                if updated[idx].userState.unreadCount == 0 {
                    // Le serveur reste autoritatif sur le compte exact ; on pose
                    // localement ≥ 1 pour que la pastille apparaisse tout de suite.
                    updated[idx].userState.unreadCount = 1
                }
            }
            return updated
        }
        _conversationsDidChange.send()
        await recomputeTotalUnread()
    }

    // MARK: - Helpers

    private func currentUserId() async -> String {
        await MainActor.run { AuthManager.shared.currentUser?.id ?? "" }
    }

    private func currentUsername() async -> String? {
        await MainActor.run { AuthManager.shared.currentUser?.username }
    }

    private func currentUserDisplayName() async -> String? {
        await MainActor.run { AuthManager.shared.currentUser?.displayName }
    }

    /// Prisme ORDONNÉ du lecteur, seule autorité iOS sur cet ordre
    /// (`systemLanguage` > `regionalLanguage` > `customDestinationLanguage` >
    /// `deviceLocale`). Jamais réimplémenté localement. Vide sans session : la
    /// carte d'aperçu est alors `nil` et la ligne rend l'original — même
    /// comportement que le chemin REST pour un participant anonyme.
    private func currentPreferredLanguages() async -> [String] {
        await MainActor.run { AuthManager.shared.currentUser?.preferredContentLanguages ?? [] }
    }

    /// Persist a conversation list pre-sorted by `lastMessageAt` DESC. Centralising
    /// the sort here keeps the cache invariant consistent across every save site
    /// (full sync, delta sync, parallel pages, sequential tail) so any cold-start
    /// cache hit can be rendered without a second pass through the ViewModel's
    /// grouping pipeline. Backend pagination is not guaranteed to be timestamp-
    /// sorted (interleaved deltas, parallel page merges, server-side tweaks),
    /// so the engine must enforce the order rather than trust the network.
    /// - Parameter baseline: instantané cache pris AVANT le début de la sync.
    ///   Indispensable pour `fullSync`, qui persiste sa première page avant
    ///   d'avoir les suivantes : sans baseline figée, la deuxième écriture
    ///   confronterait les pages 2+ à un cache réduit à la page 1, et leurs
    ///   frontières de lecture — introuvables — seraient silencieusement
    ///   perdues. `nil` relit le cache (appelants à écriture unique).
    private func saveSorted(
        _ items: [MeeshyConversation],
        to cacheKey: String,
        baseline: [MeeshyConversation]? = nil
    ) async {
        // Chokepoint UNIQUE de toute écriture liste dérivée du serveur (fullSync
        // ×3, deltaSync ×1) : on y réconcilie le non-lu AVANT de persister, sinon
        // un instantané serveur en retard sur un `markAsRead` encore dans
        // l'outbox rallume la pastille (« ça part puis ça revient »).
        let reconciled: [MeeshyConversation]
        if cacheKey == "list" {
            let existing: [MeeshyConversation]
            if let baseline {
                existing = baseline
            } else {
                existing = await cache.conversations.load(for: cacheKey).snapshot() ?? []
            }
            reconciled = Self.reconcileUnread(
                incoming: items,
                existing: existing,
                openConversationId: currentlyOpenConversationId
            )
        } else {
            reconciled = items
        }
        let sorted = reconciled.sorted { $0.lastMessageAt > $1.lastMessageAt }
        do {
            try await cache.conversations.save(sorted, for: cacheKey)
        } catch {
            Logger.cache.error("ConversationSyncEngine saveSorted failed for \(cacheKey, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
        if cacheKey == "list" {
            await recomputeTotalUnread()
        }
    }

    // MARK: - Réconciliation du non-lu

    /// Réconcilie un instantané serveur avec la frontière de lecture LOCALE.
    ///
    /// Le gateway ne renvoie jamais `lastReadAt` (`APIConversation.toConversation`
    /// ne le mappe pas) : ce champ est donc une frontière purement locale, posée
    /// par `markConversationReadLocally` et par l'entrée dans une conversation,
    /// et qui survit au round-trip GRDB. Deux règles, dans cet ordre :
    ///
    /// 1. **Conversation ouverte** → 0. L'utilisateur la REGARDE ; tout compteur
    ///    non nul est un mensonge visuel. Même gate que `handleUnreadUpdated`,
    ///    qui l'appliquait déjà aux broadcasts socket mais pas aux syncs REST.
    /// 2. **Lecture locale postérieure au dernier message connu du serveur** → 0.
    ///    Le compteur serveur est en retard (accusé de lecture encore dans
    ///    l'outbox, hors-ligne, 429…). Dès qu'un message VRAIMENT plus récent
    ///    arrive, `lastMessageAt` repasse devant la frontière et le compteur
    ///    serveur reprend la main — la règle se répare donc toute seule et ne
    ///    peut pas masquer durablement un vrai non-lu.
    ///
    /// La frontière locale est toujours préservée (le serveur ne la porte pas),
    /// ce qui laisse `markAsUnread` — qui l'efface — survivre au prochain sync.
    ///
    /// Règle UNIQUE du non-lu local : `ConversationStore.hydrateMetadata`
    /// applique CETTE fonction, et non une variante à lui. Le store RAM et le
    /// cache disque ne peuvent donc pas diverger sur ce qu'« ouverte » ou
    /// « déjà lue » veut dire — c'était la source du va-et-vient 0 ↔ 99 :
    /// le cache réconcilié disait 0, le store republiait 99, et la ligne
    /// affichait celui des deux qui avait émis en dernier.
    public nonisolated static func reconcileUnread(
        incoming: MeeshyConversation,
        local: MeeshyConversation?,
        openConversationId: String?,
        now: Date = Date()
    ) -> MeeshyConversation {
        var result = incoming
        // La frontière ne voyage que localement : la reprendre du cache est la
        // seule façon qu'elle traverse l'écrasement par l'instantané serveur.
        //
        // MAX et non `local ?? incoming` : sur le chemin serveur, `incoming` ne
        // porte jamais de frontière et les deux formes coïncident ; sur le
        // chemin store (`hydrateMetadata`, où `incoming` EST le cache, qui en
        // porte une) la forme `??` ferait RECULER une frontière que le cache
        // vient d'avancer. Une frontière de lecture est monotone partout
        // ailleurs (`applyReadReceipt`) — elle doit l'être ici aussi.
        result.userState.lastReadAt = [
            local?.userState.lastReadAt, incoming.userState.lastReadAt
        ].compactMap { $0 }.max()

        if incoming.id == openConversationId {
            result.userState.unreadCount = 0
            result.userState.lastReadAt = max(result.userState.lastReadAt ?? .distantPast, now)
            return result
        }

        if let frontier = result.userState.lastReadAt, frontier >= incoming.lastMessageAt {
            result.userState.unreadCount = 0
        }
        return result
    }

    /// Variante par lot — applique la règle ci-dessus à chaque ligne entrante en
    /// la confrontant à son homologue en cache.
    public nonisolated static func reconcileUnread(
        incoming: [MeeshyConversation],
        existing: [MeeshyConversation],
        openConversationId: String?,
        now: Date = Date()
    ) -> [MeeshyConversation] {
        guard !incoming.isEmpty else { return incoming }
        let localById = Dictionary(existing.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return incoming.map {
            reconcileUnread(
                incoming: $0,
                local: localById[$0.id],
                openConversationId: openConversationId,
                now: now
            )
        }
    }

    /// Reads the authoritative cache for the conversation list, refreshes the
    /// synchronous per-conversation mirror, and republishes the aggregate.
    /// Cheap: one cache read + a linear reduce; runs only when a mutation
    /// likely changed the total.
    private func recomputeTotalUnread() async {
        let cached = await cache.conversations.load(for: "list").snapshot() ?? []
        let mirror = Dictionary(
            cached.map { ($0.id, $0.userState.unreadCount) },
            uniquingKeysWith: { first, _ in first }
        )
        stateQueue.sync { _unreadByConversation = mirror }
        publishTotalUnread()
    }

    /// Sums the mirror, excluding the currently-open conversation — les
    /// surfaces inter-conversations (pastille du bouton retour, menus
    /// latéraux) ne comptent QUE les autres. Clamp ≥ 0 contre un compteur
    /// serveur aberrant.
    ///
    /// SYNCHRONE, et c'est tout l'intérêt : `setCurrentlyOpenConversation`
    /// pose le gate puis republie ICI, dans le même tour de boucle, AVANT le
    /// `Task` qui va écrire le cache. Sans ce miroir, l'agrégat restait à sa
    /// valeur d'AVANT l'ouverture (un `CurrentValueSubject` rejoue sa dernière
    /// valeur à l'abonnement) et `ConversationViewModel.start()`, qui s'abonne
    /// juste après, recevait le total INCLUANT la conversation qu'on vient
    /// d'ouvrir : la pastille affichait « 99 » puis retombait — le glitch.
    private func publishTotalUnread() {
        let (mirror, openId) = stateQueue.sync { (_unreadByConversation, _currentlyOpenConversationId) }
        let total = mirror.reduce(0) { acc, entry in
            guard entry.key != openId else { return acc }
            return acc + max(0, entry.value)
        }
        _totalConversationsUnread.send(total)
    }

    // MARK: - Currently-open conversation

    public func setCurrentlyOpenConversation(_ conversationId: String?) {
        currentlyOpenConversationId = conversationId
        // SYNCHRONE, avant tout `Task` : l'agrégat doit avoir exclu (ou
        // ré-inclus) cette conversation AVANT que l'écran qui vient de
        // s'ouvrir s'abonne. Un `CurrentValueSubject` rejoue sa dernière
        // valeur à l'abonnement — publier depuis le `Task` ci-dessous laissait
        // donc le premier rendu afficher le total d'AVANT l'ouverture.
        publishTotalUnread()
        guard let id = conversationId else {
            // Restoring pass-through: recompute from the cache so the
            // previously-excluded conversation is counted with a fresh value.
            Task { await self.recomputeTotalUnread() }
            return
        }
        // `unreadCount` local à zéro dans le miroir : la ligne est lue dès
        // l'ouverture, et l'agrégat ne doit pas la recompter à la fermeture
        // sur la foi d'une valeur d'avant.
        stateQueue.sync { _unreadByConversation[id] = 0 }
        // On entry, defensively zero the unread count of the open
        // conversation. The cache may carry an inflated value left over
        // from a stale `conversation:unread-updated` broadcast or from a
        // REST refresh that ran against the buggy server fallback.
        Task {
            // Re-check the conversation is STILL the open one before applying the
            // defensive zero. A rapid open→close
            // (setCurrentlyOpenConversation("x") then (nil)) could otherwise let
            // this deferred zero-write land after — and clobber — a fresh
            // `conversation:unread-updated` that legitimately arrived once the
            // conversation was no longer open. Guarding here keeps the
            // pass-through restore correct (see ConversationSyncEngineTests
            // .test_setCurrentlyOpenConversation_nil_restoresNormalPassThrough).
            guard self.currentlyOpenConversationId == id else {
                await self.recomputeTotalUnread()
                return
            }
            await self.cache.conversations.update(for: "list") { conversations in
                var updated = conversations
                if let idx = updated.firstIndex(where: { $0.id == id }) {
                    updated[idx].userState.unreadCount = 0
                    // Frontière de lecture : sans elle, le prochain instantané
                    // serveur (delta au retour en avant-plan, reconnexion socket)
                    // ré-injecterait le compteur d'AVANT l'ouverture.
                    updated[idx].userState.lastReadAt = Date()
                }
                return updated
            }
            self._conversationsDidChange.send()
            await self.recomputeTotalUnread()
        }
    }
}
