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
    public func fullSync() async -> Bool {
        guard !isSyncing else { return true }
        isSyncing = true
        defer { isSyncing = false }

        let pageSize = 100
        let userId = await currentUserId()

        // Fetch the first page to show something on screen as fast as
        // possible, then fan out to the remaining pages in parallel. On
        // 10k-conversation accounts the old sequential loop took 5-10s
        // before the list was populated; the first-page-first pattern
        // paints the visible rows in ~300ms and the rest arrives in the
        // background without blocking the UI.
        let firstPage: [MeeshyConversation]
        let totalCount: Int?
        do {
            let response = try await conversationService.list(offset: 0, limit: pageSize)
            firstPage = response.data.map { $0.toConversation(currentUserId: userId) }
            totalCount = response.pagination?.total
            await cache.conversations.save(firstPage, for: "list")
            _conversationsDidChange.send()
        } catch {
            Self.logger.error("[SyncEngine] fullSync first-page error: \(error.localizedDescription)")
            return false
        }

        // If the first page already returned everything, we're done.
        let knownTotal: Int? = totalCount ?? (firstPage.count < pageSize ? firstPage.count : nil)
        if let total = knownTotal, total <= firstPage.count {
            lastSyncTimestamp = Date().addingTimeInterval(-30)
            return true
        }

        // Upper bound on remaining pages. If the backend didn't return a
        // total count, we fall back to sequential paging from page 2 until
        // `hasMore` flips false.
        let remainingPages: [Int]
        if let total = knownTotal {
            let totalPages = (total + pageSize - 1) / pageSize
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
            let service = self.conversationService
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
                            let response = try await service.list(offset: pageIndex * pageSize, limit: pageSize)
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
                                let response = try await service.list(offset: pageIndex * pageSize, limit: pageSize)
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

            await cache.conversations.save(merged, for: "list")
            _conversationsDidChange.send()
        } else {
            // No known total count: fall back to sequential paging from page 2.
            var offset = firstPage.count
            var hasMore = firstPage.count >= pageSize
            while hasMore {
                do {
                    let response = try await conversationService.list(offset: offset, limit: pageSize)
                    let page = response.data.map { $0.toConversation(currentUserId: userId) }
                    let existingIds = Set(merged.map(\.id))
                    let newItems = page.filter { !existingIds.contains($0.id) }
                    merged.append(contentsOf: newItems)
                    await cache.conversations.save(merged, for: "list")
                    _conversationsDidChange.send()
                    hasMore = response.pagination?.hasMore ?? false
                    offset += page.count
                } catch {
                    Self.logger.error("[SyncEngine] fullSync tail error: \(error.localizedDescription)")
                    succeeded = false
                    break
                }
            }
        }

        if succeeded {
            lastSyncTimestamp = Date().addingTimeInterval(-30)
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

            await cache.conversations.save(merged, for: "list")
            _conversationsDidChange.send()

            lastSyncTimestamp = Date().addingTimeInterval(-30)
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
            if let mentionedUsers = response.meta?.mentionedUsers {
                UserDisplayNameCache.shared.trackFromMentionedUsers(mentionedUsers)
            }
            let freshMessages = response.data.map { $0.toMessage(currentUserId: userId) }
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
            let olderMessages = response.data.map { $0.toMessage(currentUserId: userId) }

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
        let isMe = apiMessage.senderId == userId
        let msg = apiMessage.toMessage(currentUserId: userId)
        await cache.messages.upsert(item: msg, for: msg.conversationId) { existing, new in
            existing.contains(where: { $0.id == new.id }) ? existing : existing + [new]
        }
        _messagesDidChange.send(msg.conversationId)

        // Preserve the existing author when the broadcast payload omits the
        // sender envelope (can happen for lightweight socket echoes). Falling
        // back to `nil` would otherwise wipe the preview author for the whole
        // list row until the next full sync.
        let resolvedSenderName = msg.senderName ?? msg.senderUsername
        await cache.conversations.update(for: "list") { conversations in
            var updated = conversations
            if let idx = updated.firstIndex(where: { $0.id == msg.conversationId }) {
                updated[idx].lastMessagePreview = msg.content
                updated[idx].lastMessageId = msg.id
                if let resolvedSenderName, !resolvedSenderName.isEmpty {
                    updated[idx].lastMessageSenderName = resolvedSenderName
                }
                updated[idx].lastMessageAt = msg.createdAt
                if !isMe {
                    updated[idx].unreadCount += 1
                }
                let conv = updated.remove(at: idx)
                updated.insert(conv, at: 0)
            }
            return updated
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
        let msg = apiMessage.toMessage(currentUserId: userId)
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
}
