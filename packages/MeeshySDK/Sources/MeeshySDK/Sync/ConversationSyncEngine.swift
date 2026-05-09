import Foundation
import Combine
import os

// MARK: - Protocol

public protocol ConversationSyncEngineProviding: AnyObject, Sendable {
    var conversationsDidChange: AnyPublisher<Void, Never> { get }
    var messagesDidChange: AnyPublisher<String, Never> { get }

    @discardableResult
    func fullSync() async -> Bool
    @discardableResult
    func syncSinceLastCheckpoint() async -> Bool
    func ensureMessages(for conversationId: String) async
    func fetchOlderMessages(for conversationId: String, before messageId: String) async
    func cleanupRetentionIfNeeded() async
    func startSocketRelay() async
    func stopSocketRelay() async
    func markConversationReadLocally(_ conversationId: String) async
    func updateConversationAfterSend(conversationId: String, messagePreview: String, messageAt: Date, senderName: String?) async
}

// MARK: - Implementation

public final class ConversationSyncEngine: ConversationSyncEngineProviding, @unchecked Sendable {
    public static let shared = ConversationSyncEngine()

    private static let logger = Logger(subsystem: "me.meeshy.sdk", category: "sync")

    // Internal subjects (send-capable)
    private let _conversationsDidChange = PassthroughSubject<Void, Never>()
    private let _messagesDidChange = PassthroughSubject<String, Never>()

    // Protocol-exposed publishers (read-only)
    public var conversationsDidChange: AnyPublisher<Void, Never> { _conversationsDidChange.eraseToAnyPublisher() }
    public var messagesDidChange: AnyPublisher<String, Never> { _messagesDidChange.eraseToAnyPublisher() }

    // State (protected by serial queue)
    private let stateQueue = DispatchQueue(label: "me.meeshy.sync-engine.state")
    private var _isSyncing = false
    private var isSyncing: Bool {
        get { stateQueue.sync { _isSyncing } }
        set { stateQueue.sync { _isSyncing = newValue } }
    }
    private var socketSubscriptions = Set<AnyCancellable>()

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
            firstPage = response.data.map { $0.toConversation(currentUserId: userId) }
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
                            let items = response.data.map { $0.toConversation(currentUserId: userId) }
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
                                let items = response.data.map { $0.toConversation(currentUserId: userId) }
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
        while hasMore {
            do {
                let response = try await Self.fetchPageWithRetry(via: service, offset: offset, limit: pageSize)
                let page = response.data.map { $0.toConversation(currentUserId: userId) }
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
                let backendHasMore = response.pagination?.hasMore
                if let backendHasMore {
                    hasMore = backendHasMore
                } else {
                    hasMore = response.data.count >= pageSize || response.data.count == firstPageReturnedCount
                }
                offset += response.data.count
                // Safety belt: if the server returned 0 items, abort —
                // otherwise we'd loop forever on a misconfigured endpoint.
                if response.data.isEmpty { hasMore = false }
            } catch {
                Self.logger.error("[SyncEngine] fullSync tail error: \(error.localizedDescription)")
                succeeded = false
                break
            }
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
            let deltaConversations = response.data.map { $0.toConversation(currentUserId: userId) }

            let existing = await cache.conversations.load(for: "list").value ?? []
            var merged = existing

            for delta in deltaConversations {
                if !delta.isActive {
                    merged.removeAll { $0.id == delta.id }
                    await cache.messages.invalidate(for: delta.id)
                } else if let idx = merged.firstIndex(where: { $0.id == delta.id }) {
                    merged[idx] = delta
                } else {
                    merged.append(delta)
                }
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

    // MARK: - Messages

    public func ensureMessages(for conversationId: String) async {
        let cached = await cache.messages.load(for: conversationId)
        switch cached {
        case .fresh:
            return
        case .stale, .expired, .empty:
            break
        }

        do {
            let response = try await messageService.list(
                conversationId: conversationId, offset: 0, limit: 30, includeReplies: true
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
            _messagesDidChange.send(conversationId)
        } catch {
            Self.logger.error("[SyncEngine] ensureMessages error: \(error.localizedDescription)")
        }
    }

    public func fetchOlderMessages(for conversationId: String, before messageId: String) async {
        do {
            let response = try await messageService.listBefore(
                conversationId: conversationId, before: messageId, limit: 30, includeReplies: true
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
        let convs = await cache.conversations.load(for: "list").value ?? []

        for conv in convs {
            let messages = await cache.messages.load(for: conv.id).value ?? []
            guard messages.count > 600 else { continue }

            let recentByDate = messages.filter { $0.createdAt > oneYearAgo }
            let recentByCount = Array(messages.suffix(600))

            let toKeep = recentByDate.count > recentByCount.count ? recentByDate : recentByCount

            if toKeep.count < messages.count {
                await cache.messages.save(toKeep, for: conv.id)
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
    }

    public func stopSocketRelay() async {
        socketSubscriptions.removeAll()
    }

    // MARK: - Socket Event Handlers

    private func handleNewMessage(_ apiMessage: APIMessage) async {
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
        let conversationExists = cachedList.value?.contains(where: { $0.id == msg.conversationId }) ?? false

        if conversationExists {
            await cache.conversations.update(for: "list") { conversations in
                var updated = conversations
                if let idx = updated.firstIndex(where: { $0.id == msg.conversationId }) {
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
                let userId = await currentUserId() ?? ""
                let domainConv = apiConv.toConversation(currentUserId: userId)
                await cache.conversations.update(for: "list") { conversations in
                    var updated = conversations
                    // Defensive dedup: a concurrent handleNewMessage
                    // for the same conversation could have raced ahead.
                    updated.removeAll { $0.id == domainConv.id }
                    updated.insert(domainConv, at: 0)
                    return updated
                }
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
    }

    private func handleDeletedMessage(_ event: MessageDeletedEvent) async {
        await cache.messages.upsertPatch(for: event.conversationId, itemId: event.messageId) { msg in
            msg.deletedAt = Date()
            msg.content = ""
        }
        _messagesDidChange.send(event.conversationId)
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
        await cache.conversations.update(for: "list") { conversations in
            var updated = conversations
            if let idx = updated.firstIndex(where: { $0.id == event.conversationId }) {
                updated[idx].unreadCount = event.unreadCount
            }
            return updated
        }
        _conversationsDidChange.send()
    }

    private func handleReadStatusUpdated(_ event: ReadStatusUpdateEvent) async {
        let userId = await currentUserId()

        // Update conversation unread count (userId is preferred, fallback to participantId)
        let eventUserId = event.userId ?? event.participantId
        if eventUserId == userId {
            await cache.conversations.update(for: "list") { conversations in
                var updated = conversations
                if let idx = updated.firstIndex(where: { $0.id == event.conversationId }) {
                    updated[idx].unreadCount = 0
                }
                return updated
            }
            _conversationsDidChange.send()
        }

        // Update delivery status of own messages in the message cache
        let summary = event.summary
        let newStatus: MeeshyMessage.DeliveryStatus = summary.readCount > 0 ? .read
            : summary.deliveredCount > 0 ? .delivered : .sent

        await cache.messages.update(for: event.conversationId) { messages in
            var updated = messages
            for i in updated.indices.reversed() {
                guard updated[i].isMe else { continue }
                let current = updated[i].deliveryStatus
                if current == .read { break }
                if newStatus.isBetterThan(current) {
                    updated[i].deliveryStatus = newStatus
                    updated[i].deliveredCount = summary.deliveredCount
                    updated[i].readCount = summary.readCount
                }
            }
            return updated
        }
        _messagesDidChange.send(event.conversationId)
    }

    // MARK: - Local-First Updates

    private func handleAttachmentStatusUpdated(_ event: AttachmentStatusUpdatedEvent) async {
        // Trigger message refresh so UI can re-render attachment status indicators
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
                updated[idx].unreadCount = 0
                let conv = updated.remove(at: idx)
                updated.insert(conv, at: 0)
            }
            return updated
        }
        _conversationsDidChange.send()
    }

    public func markConversationReadLocally(_ conversationId: String) async {
        await cache.conversations.update(for: "list") { conversations in
            var updated = conversations
            if let idx = updated.firstIndex(where: { $0.id == conversationId }) {
                updated[idx].unreadCount = 0
            }
            return updated
        }
        _conversationsDidChange.send()
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
        await cache.conversations.save(sorted, for: cacheKey)
    }
}
