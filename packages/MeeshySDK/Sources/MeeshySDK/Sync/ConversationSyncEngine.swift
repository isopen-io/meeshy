import Foundation
import Combine
import os

// MARK: - Protocol

public protocol ConversationSyncEngineProviding: AnyObject, Sendable {
    var conversationsDidChange: AnyPublisher<Void, Never> { get }
    var messagesDidChange: AnyPublisher<String, Never> { get }

    func fullSync() async
    func syncSinceLastCheckpoint() async
    func ensureMessages(for conversationId: String) async
    func fetchOlderMessages(for conversationId: String, before messageId: String) async
    func cleanupRetentionIfNeeded() async
    func startSocketRelay() async
    func stopSocketRelay() async
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

    public func fullSync() async {
        guard !isSyncing else { return }
        isSyncing = true
        defer { isSyncing = false }

        var allConversations: [MeeshyConversation] = []
        var offset = 0
        let pageSize = 100
        var hasMore = true

        while hasMore {
            do {
                let response = try await conversationService.list(offset: offset, limit: pageSize)
                let userId = await currentUserId()
                let page = response.data.map { $0.toConversation(currentUserId: userId) }

                let existingIds = Set(allConversations.map(\.id))
                let newItems = page.filter { !existingIds.contains($0.id) }
                allConversations.append(contentsOf: newItems)

                await cache.conversations.save(allConversations, for: "list")
                _conversationsDidChange.send()

                hasMore = response.pagination?.hasMore ?? false
                offset += page.count
            } catch {
                Self.logger.error("[SyncEngine] fullSync error: \(error.localizedDescription)")
                break
            }
        }

        lastSyncTimestamp = Date().addingTimeInterval(-30)
    }

    // MARK: - Delta Sync (foreground / reconnect)

    public func syncSinceLastCheckpoint() async {
        guard !isSyncing else { return }
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
        } catch {
            Self.logger.error("[SyncEngine] deltaSync error: \(error.localizedDescription)")
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
            let messages = response.data.map { $0.toMessage(currentUserId: userId) }
            await cache.messages.save(messages, for: conversationId)
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

            let existing = await cache.messages.load(for: conversationId).value ?? []
            let existingIds = Set(existing.map(\.id))
            let newOnly = olderMessages.filter { !existingIds.contains($0.id) }
            let merged = newOnly + existing

            await cache.messages.save(merged, for: conversationId)
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
        let msg = apiMessage.toMessage(currentUserId: userId)
        await cache.messages.upsert(item: msg, for: msg.conversationId) { existing, new in
            existing.contains(where: { $0.id == new.id }) ? existing : existing + [new]
        }
        _messagesDidChange.send(msg.conversationId)

        await cache.conversations.update(for: "list") { conversations in
            var updated = conversations
            if let idx = updated.firstIndex(where: { $0.id == msg.conversationId }) {
                updated[idx].lastMessagePreview = msg.content
                updated[idx].lastMessageId = msg.id
                updated[idx].lastMessageSenderName = msg.senderName
                updated[idx].lastMessageAt = msg.createdAt
                updated[idx].unreadCount += 1
                let conv = updated.remove(at: idx)
                updated.insert(conv, at: 0)
            }
            return updated
        }
        _conversationsDidChange.send()
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
        await cache.conversations.update(for: "list") { conversations in
            var updated = conversations
            if let idx = updated.firstIndex(where: { $0.id == event.conversationId }) {
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
