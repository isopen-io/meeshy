import Foundation
import Combine
import os

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
    func updateConversationAfterSend(conversationId: String, messagePreview: String, messageAt: Date, senderName: String?) async

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

    init(
        cache: CacheCoordinator = .shared,
        conversationService: ConversationServiceProviding = ConversationService.shared,
        messageService: MessageServiceProviding = MessageService.shared,
        messageSocket: MessageSocketProviding = MessageSocketManager.shared,
        socialSocket: SocialSocketProviding = SocialSocketManager.shared,
        api: APIClientProviding = APIClient.shared
    ) {
        self.cache = cache
        self.conversationService = conversationService
        self.messageService = messageService
        self.messageSocket = messageSocket
        self.socialSocket = socialSocket
        self.api = api
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

    public func fullSync() async -> Bool {
        guard !isSyncing else { return true }
        isSyncing = true
        defer { isSyncing = false }

        let pageSize = 100
        let userId = await currentUserId()
        let service = self.conversationService

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
            await saveSorted(firstPage, to: "list")
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
            lastSyncTimestamp = Date()
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

            await saveSorted(merged, to: "list")
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
                    await saveSorted(merged, to: "list")
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
            lastSyncTimestamp = Date()
        }
        return succeeded
    }

    // MARK: - Delta Sync (foreground / reconnect)

    @discardableResult
    public func syncSinceLastCheckpoint() async -> Bool {
        guard !isSyncing else { return true }
        // Throttle bursts: when several signals (socket reconnect,
        // foreground return, cache-stale revalidate) fire within the
        // same window, only the first one hits the network. Returning
        // `true` is intentional — from the caller's perspective the
        // delta is "fresh enough" since a recent one just landed.
        let now = Date()
        if now.timeIntervalSince(lastDeltaSyncAt) < deltaSyncCooldown {
            return true
        }
        lastDeltaSyncAt = now
        isSyncing = true
        defer { isSyncing = false }

        do {
            let since = lastSyncTimestamp
            let sinceStr = ISO8601DateFormatter().string(from: since)
            let queryItems = [
                URLQueryItem(name: "limit", value: "500"),
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
            let (merged, removedIds) = Self.mergeDeltaConversations(existing: existing, deltas: deltaConversations)
            for removedId in removedIds {
                await cache.messages.invalidate(for: removedId)
            }

            await saveSorted(merged, to: "list")
            await SearchIndex.shared.indexConversations(deltaConversations.filter { $0.isActive })
            _conversationsDidChange.send()

            lastSyncTimestamp = Date()
            return true
        } catch {
            Self.logger.error("[SyncEngine] deltaSync error: \(error.localizedDescription)")
            return false
        }
    }

    /// Merge a batch of delta conversations into `existing` by id. Active deltas
    /// upsert (replace-or-insert); inactive deltas remove. Returns the merged
    /// list plus every inactive delta id (so the caller can invalidate their
    /// message caches, exactly as the previous per-delta loop did). The merged
    /// order is intentionally unspecified — callers re-sort via `saveSorted`.
    /// O(existing + deltas) instead of O(deltas × existing).
    static func mergeDeltaConversations(
        existing: [MeeshyConversation],
        deltas: [MeeshyConversation]
    ) -> (merged: [MeeshyConversation], removedIds: [String]) {
        var byId = Dictionary(existing.map { ($0.id, $0) }, uniquingKeysWith: { _, new in new })
        var removedIds: [String] = []
        for delta in deltas {
            if delta.isActive {
                byId[delta.id] = delta
            } else {
                byId.removeValue(forKey: delta.id)
                removedIds.append(delta.id)
            }
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
                            updated[idx].closedAt = ISO8601DateFormatter().date(from: event.closedAt)
                            updated[idx].closedBy = event.closedBy
                        }
                        return updated
                    }
                    self._conversationsDidChange.send()
                }
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
    }

    // MARK: - Socket Event Handlers

    private func handleNewMessage(_ apiMessage: APIMessage) async {
        Self.logger.info("[SyncEngine] handleNewMessage id=\(apiMessage.id, privacy: .public) conv=\(apiMessage.conversationId, privacy: .public)")
        if let mentionedUsers = apiMessage.mentionedUsers {
            UserDisplayNameCache.shared.trackFromMentionedUsers(mentionedUsers)
        }
        let userId = await currentUserId()
        let username = await currentUsername()
        let isMe = apiMessage.senderId == userId
        let msg = apiMessage.toMessage(currentUserId: userId, currentUsername: username)
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

        // Preserve the existing author when the broadcast payload omits the
        // sender envelope (can happen for lightweight socket echoes). Falling
        // back to `nil` would otherwise wipe the preview author for the whole
        // list row until the next full sync.
        let resolvedSenderName = msg.senderName ?? msg.senderUsername

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
                    updated[idx].lastMessagePreview = msg.content
                    updated[idx].lastMessageId = msg.id
                    if let resolvedSenderName, !resolvedSenderName.isEmpty {
                        updated[idx].lastMessageSenderName = resolvedSenderName
                    }
                    updated[idx].lastMessageAt = msg.createdAt
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

        // Auto mark-as-received for messages from other users
        if !isMe {
            Task {
                try? await ConversationService.shared.markAsReceived(conversationId: msg.conversationId)
            }
        }
    }

    private func handleEditedMessage(_ apiMessage: APIMessage) async {
        let userId = await currentUserId()
        let username = await currentUsername()
        let msg = apiMessage.toMessage(currentUserId: userId, currentUsername: username)
        await cache.messages.upsertPatch(for: msg.conversationId, itemId: msg.id) { existing in
            existing = msg
        }
        _messagesDidChange.send(msg.conversationId)
        // If the edited message is the conversation's last message, the list-row
        // preview still shows the pre-edit text — refresh it in place.
        await refreshLastMessagePreviewIfEdited(
            conversationId: msg.conversationId, messageId: msg.id, newContent: msg.content)
    }

    private func handleDeletedMessage(_ event: MessageDeletedEvent) async {
        await cache.messages.upsertPatch(for: event.conversationId, itemId: event.messageId) { msg in
            msg.deletedAt = Date()
            msg.content = ""
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
    private func refreshLastMessagePreviewIfEdited(
        conversationId: String, messageId: String, newContent: String
    ) async {
        let list = await cache.conversations.load(for: "list").snapshot() ?? []
        guard list.first(where: { $0.id == conversationId })?.lastMessageId == messageId else { return }
        await cache.conversations.update(for: "list") { conversations in
            var updated = conversations
            if let idx = updated.firstIndex(where: { $0.id == conversationId }) {
                updated[idx].lastMessagePreview = newContent
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
                    updated[idx].lastMessagePreview = newLast.content
                    updated[idx].lastMessageId = newLast.id
                    if let name = newLast.senderName ?? newLast.senderUsername, !name.isEmpty {
                        updated[idx].lastMessageSenderName = name
                    }
                    updated[idx].lastMessageAt = newLast.createdAt
                } else {
                    // The deleted message was the conversation's ONLY message — there
                    // is no survivor to surface. Clear the stale preview so the list
                    // row stops showing the deleted message's text (displayed ≠ real).
                    updated[idx].lastMessagePreview = ""
                    updated[idx].lastMessageId = nil
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
        await cache.messages.upsertPatch(for: convId, itemId: event.messageId) { msg in
            let reaction = MeeshyReaction(
                messageId: event.messageId,
                participantId: event.participantId,
                emoji: event.emoji
            )
            if !msg.reactions.contains(where: { $0.emoji == reaction.emoji && $0.participantId == reaction.participantId }) {
                msg.reactions.append(reaction)
            }
        }
        _messagesDidChange.send(convId)
    }

    private func handleReactionRemoved(_ event: ReactionUpdateEvent) async {
        guard let convId = event.conversationId else { return }
        await cache.messages.upsertPatch(for: convId, itemId: event.messageId) { msg in
            msg.reactions.removeAll { $0.emoji == event.emoji && $0.participantId == event.participantId }
        }
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

    public func updateConversationAfterSend(conversationId: String, messagePreview: String, messageAt: Date, senderName: String?) async {
        await cache.conversations.update(for: "list") { conversations in
            var updated = conversations
            if let idx = updated.firstIndex(where: { $0.id == conversationId }) {
                updated[idx].lastMessagePreview = messagePreview
                updated[idx].lastMessageAt = messageAt
                // Propagate the author so the conversation list renders
                // "You: <preview>" in groups immediately — previously this
                // field kept the prior sender until the socket broadcast
                // echoed back, producing a confusing "Alice: <your msg>"
                // for a second or two after every send.
                if let senderName, !senderName.isEmpty {
                    updated[idx].lastMessageSenderName = senderName
                }
                updated[idx].userState.unreadCount = 0
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

    /// Persist a conversation list pre-sorted by `lastMessageAt` DESC. Centralising
    /// the sort here keeps the cache invariant consistent across every save site
    /// (full sync, delta sync, parallel pages, sequential tail) so any cold-start
    /// cache hit can be rendered without a second pass through the ViewModel's
    /// grouping pipeline. Backend pagination is not guaranteed to be timestamp-
    /// sorted (interleaved deltas, parallel page merges, server-side tweaks),
    /// so the engine must enforce the order rather than trust the network.
    private func saveSorted(_ items: [MeeshyConversation], to cacheKey: String) async {
        let sorted = items.sorted { $0.lastMessageAt > $1.lastMessageAt }
        do {
            try await cache.conversations.save(sorted, for: cacheKey)
        } catch {
            Logger.cache.error("ConversationSyncEngine saveSorted failed for \(cacheKey, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
        if cacheKey == "list" {
            await recomputeTotalUnread()
        }
    }

    /// Reads the authoritative cache for the conversation list, sums the
    /// `unreadCount` of every entry (clamped to ≥ 0 to defend against bogus
    /// negative values), and publishes the result. The currently-open
    /// conversation is excluded — cross-conversation surfaces (back-button
    /// pill, side menus) count OTHER conversations only. Cheap: one cache
    /// read + a linear reduce; runs only when a mutation likely changed
    /// the total.
    private func recomputeTotalUnread() async {
        let cached = await cache.conversations.load(for: "list").snapshot() ?? []
        let openId = currentlyOpenConversationId
        let total = cached.reduce(0) { acc, conv in
            guard conv.id != openId else { return acc }
            return acc + max(0, conv.userState.unreadCount)
        }
        _totalConversationsUnread.send(total)
    }

    // MARK: - Currently-open conversation

    public func setCurrentlyOpenConversation(_ conversationId: String?) {
        currentlyOpenConversationId = conversationId
        guard let id = conversationId else {
            // Restoring pass-through: recompute the aggregator so the
            // previously-excluded conversation is now counted.
            Task { await self.recomputeTotalUnread() }
            return
        }
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
                }
                return updated
            }
            self._conversationsDidChange.send()
            await self.recomputeTotalUnread()
        }
    }
}
