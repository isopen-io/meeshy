import Foundation
import Combine
import GRDB
import os

// MARK: - Retry Queue Item

public struct RetryQueueItem: Codable, Identifiable, Sendable {
    public let id: String
    /// Optimistic message id shown in the UI while the send is being retried.
    /// Used by ``MessageRetryQueue/retrySucceeded`` and
    /// ``MessageRetryQueue/retryExhausted`` so active ViewModels can reconcile
    /// the optimistic row with the server-assigned id (success) or flip it to
    /// `.failed` (exhausted).
    public let tempId: String
    public let conversationId: String
    public let content: String
    public let originalLanguage: String
    public let replyToId: String?
    public let attachmentIds: [String]?
    public let createdAt: Date
    public var retryCount: Int
    public var lastRetryAt: Date?

    public init(
        conversationId: String,
        content: String,
        originalLanguage: String = "fr",
        replyToId: String? = nil,
        attachmentIds: [String]? = nil,
        tempId: String? = nil
    ) {
        let queueId = UUID().uuidString
        self.id = queueId
        self.tempId = tempId ?? "retry_\(queueId)"
        self.conversationId = conversationId
        self.content = content
        self.originalLanguage = originalLanguage
        self.replyToId = replyToId
        self.attachmentIds = attachmentIds
        self.createdAt = Date()
        self.retryCount = 0
        self.lastRetryAt = nil
    }
}

// MARK: - Retry Success Payload

/// Emitted when a transient-failure retry finally reaches the server. The
/// optimistic `tempId` (`"retry_<item.id>"`) and the authoritative `serverId`
/// let active ViewModels reconcile in-memory state before the socket
/// `message:new` broadcast arrives, preventing duplicates and messages stuck
/// in `.sending`.
public struct RetryQueueSuccess: Sendable {
    public let tempId: String
    public let serverId: String
    public let conversationId: String

    public init(tempId: String, serverId: String, conversationId: String) {
        self.tempId = tempId
        self.serverId = serverId
        self.conversationId = conversationId
    }
}

/// Emitted when an item is permanently dropped after exhausting its retry
/// budget. Lets ViewModels flip their optimistic row to `.failed` and show a
/// "tap to retry" affordance instead of leaving it stuck in `.sending`.
public struct RetryQueueFailure: Sendable {
    public let tempId: String
    public let conversationId: String
}

// MARK: - Message Retry Queue

public actor MessageRetryQueue {
    public static let shared = MessageRetryQueue()

    public nonisolated let retrySucceeded = SendablePassthrough<RetryQueueSuccess>()
    public nonisolated let retryExhausted = SendablePassthrough<RetryQueueFailure>()

    private static let maxRetries = 5
    private static let baseRetryInterval: TimeInterval = 2
    private static let maxRetryInterval: TimeInterval = 30
    private static let maxQueueSize = 100
    private static let maxAgeSeconds: TimeInterval = 7 * 24 * 3600 // 7 days

    // Legacy file name — kept only for deletion on first boot.
    private static let legacyFileName = "message_retry_queue.json"

    private var items: [RetryQueueItem] = []
    private var isRetrying = false
    private var retryTask: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "messageretry")
    /// Outbox pool — injected at boot via `configure(pool:)`. Nil until wired.
    private var outboxPool: (any DatabaseWriter)?

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    public var onRetrySend: ((RetryQueueItem) async -> String?)?

    public func setRetrySend(_ handler: @escaping @Sendable (RetryQueueItem) async -> String?) {
        onRetrySend = handler
    }

    /// Wires the outbox pool used for SQLite persistence.
    /// Must be called once at boot before any `enqueue` calls.
    public func configure(pool: any DatabaseWriter) {
        outboxPool = pool
    }

    private init() {
        Task {
            await purgeExpired()
            await observeConnection()
        }
    }

    // MARK: - Queue Operations

    /// Enqueues `item` into the in-memory mirror and writes a corresponding
    /// `OutboxRecord` to the SQLite outbox table. The outbox write is the
    /// authoritative persistence store; the in-memory array is a fast read
    /// cache that is consistent with it.
    public func enqueue(_ item: RetryQueueItem) async {
        if items.count >= Self.maxQueueSize {
            items.removeFirst()
        }
        items.append(item)
        await writeToOutbox(item)
        logger.info("Enqueued message for retry: \(item.conversationId), queue size: \(self.items.count)")
        startRetryLoop()
    }

    public func dequeue(_ itemId: String) async {
        let outboxId = "mrq_\(itemId)"
        items.removeAll { $0.id == itemId }
        guard let pool = outboxPool else { return }
        try? await pool.write { db in
            try OutboxRecord.deleteOne(db, key: outboxId)
        }
    }

    public var pendingItems: [RetryQueueItem] {
        items
    }

    public var count: Int {
        items.count
    }

    // MARK: - Retry Loop

    private static func retryDelay(attempt: Int) -> TimeInterval {
        let exponential = baseRetryInterval * pow(2.0, Double(min(attempt, 6)))
        let jitter = Double.random(in: 0...1)
        return min(exponential + jitter, maxRetryInterval)
    }

    private func startRetryLoop() {
        guard retryTask == nil else { return }
        retryTask = Task { [weak self] in
            defer {
                Task { [weak self] in await self?.clearRetryTask() }
            }
            var attempt = 0
            while !Task.isCancelled {
                let delay = Self.retryDelay(attempt: attempt)
                try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                guard let self, !Task.isCancelled else { return }
                let beforeCount = await self.items.count
                await self.retryPending()
                let remaining = await self.pendingRetryableCount
                if remaining == 0 { return }
                attempt = beforeCount == remaining ? attempt + 1 : 0
            }
        }
    }

    private func clearRetryTask() {
        retryTask = nil
    }

    private var pendingRetryableCount: Int {
        items.filter { $0.retryCount < Self.maxRetries }.count
    }

    private func retryPending() async {
        guard !isRetrying, !items.isEmpty else { return }
        guard let retrySend = onRetrySend else { return }

        isRetrying = true
        var toRemove: [String] = []
        var updated = false
        var successPayloads: [RetryQueueSuccess] = []
        var exhaustedPayloads: [RetryQueueFailure] = []

        for i in items.indices {
            if items[i].retryCount >= Self.maxRetries {
                // Exhausted: drop and notify so the UI can surface a failure state.
                toRemove.append(items[i].id)
                exhaustedPayloads.append(RetryQueueFailure(
                    tempId: items[i].tempId,
                    conversationId: items[i].conversationId
                ))
                continue
            }

            if let serverId = await retrySend(items[i]) {
                toRemove.append(items[i].id)
                successPayloads.append(RetryQueueSuccess(
                    tempId: items[i].tempId,
                    serverId: serverId,
                    conversationId: items[i].conversationId
                ))
                logger.info("Retry succeeded for message \(self.items[i].id)")
            } else {
                items[i].retryCount += 1
                items[i].lastRetryAt = Date()
                updated = true
                logger.info("Retry \(self.items[i].retryCount)/\(Self.maxRetries) failed for message \(self.items[i].id)")
                if items[i].retryCount >= Self.maxRetries {
                    exhaustedPayloads.append(RetryQueueFailure(
                        tempId: items[i].tempId,
                        conversationId: items[i].conversationId
                    ))
                }
            }
        }

        let pool = outboxPool
        for id in toRemove {
            items.removeAll { $0.id == id }
            if let pool {
                let outboxId = "mrq_\(id)"
                try? await pool.write { db in try OutboxRecord.deleteOne(db, key: outboxId) }
            }
        }

        if updated, let pool {
            // Persist updated retry counts back to the outbox.
            let updatedItems = items.filter { $0.retryCount > 0 }
            for item in updatedItems {
                let outboxId = "mrq_\(item.id)"
                let updatedItem = item
                try? await pool.write { db in
                    if var record = try OutboxRecord.fetchOne(db, key: outboxId) {
                        record.attempts = updatedItem.retryCount
                        record.updatedAt = updatedItem.lastRetryAt ?? Date()
                        try record.update(db)
                    }
                }
            }
        }

        isRetrying = false

        // Remove optimistic rows from the persisted cache so an inactive
        // ConversationViewModel doesn't show a ghost `retry_<uuid>` row next
        // to the authoritative server message that arrives via `message:new`.
        for payload in successPayloads {
            await CacheCoordinator.shared.messages.mergeUpdate(for: payload.conversationId) { cached in
                cached.filter { $0.id != payload.tempId }
            }
            retrySucceeded.send(payload)
        }
        for payload in exhaustedPayloads { retryExhausted.send(payload) }
    }

    public func retryAllNow() async {
        await retryPending()
    }

    // MARK: - Connection Observer

    private func observeConnection() {
        MessageSocketManager.shared.$isConnected
            .removeDuplicates()
            .dropFirst()
            .filter { $0 }
            .receive(on: DispatchQueue.global(qos: .utility))
            .sink { [weak self] _ in
                guard let self else { return }
                Task {
                    try? await Task.sleep(nanoseconds: 3_000_000_000)
                    await self.retryPending()
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Purge Expired

    private func purgeExpired() async {
        let cutoff = Date().addingTimeInterval(-Self.maxAgeSeconds)
        let expired = items.filter { $0.createdAt < cutoff }
        guard !expired.isEmpty else { return }
        items.removeAll { $0.createdAt < cutoff }
        guard let pool = outboxPool else { return }
        for item in expired {
            let outboxId = "mrq_\(item.id)"
            try? await pool.write { db in try OutboxRecord.deleteOne(db, key: outboxId) }
        }
    }

    // MARK: - Outbox Write

    private func writeToOutbox(_ item: RetryQueueItem) async {
        guard let pool = outboxPool else { return }
        let outboxId = "mrq_\(item.id)"
        let enc = encoder
        let payload = (try? enc.encode(item)) ?? Data()
        try? await pool.write { db in
            guard try OutboxRecord.fetchOne(db, key: outboxId) == nil else { return }
            try OutboxRecord(
                id: outboxId,
                kind: .sendMessage,
                conversationId: item.conversationId,
                messageLocalId: item.tempId,
                payload: payload,
                status: .pending,
                attempts: item.retryCount,
                lastError: nil,
                createdAt: item.createdAt,
                updatedAt: item.lastRetryAt ?? item.createdAt,
                nextAttemptAt: Date()
            ).insert(db)
        }
    }

    // MARK: - Clear

    public func clearAll() async {
        let ids = items.map { $0.id }
        items.removeAll()
        guard let pool = outboxPool else { return }
        try? await pool.write { db in
            for id in ids {
                try OutboxRecord.deleteOne(db, key: "mrq_\(id)")
            }
        }
    }

    // MARK: - Outbox Migration (utility / testing)

    /// Copies pending in-memory items into an arbitrary `pool`. Idempotent —
    /// items already present (matched by prefixed id) are silently skipped.
    ///
    /// In production the outbox is already populated by `enqueue`. This method
    /// exists as a utility for migration testing and for legacy one-time boot
    /// migrations from old JSON files via `MigrateLegacyQueues`.
    public func migrateToOutbox(pool: any DatabaseWriter) async {
        let snapshot = items
        guard !snapshot.isEmpty else { return }

        let enc = encoder
        try? await pool.write { db in
            for item in snapshot {
                let outboxId = "mrq_\(item.id)"
                guard try OutboxRecord.fetchOne(db, key: outboxId) == nil else { continue }
                let payload = (try? enc.encode(item)) ?? Data()
                try OutboxRecord(
                    id: outboxId,
                    kind: .sendMessage,
                    conversationId: item.conversationId,
                    messageLocalId: item.tempId,
                    payload: payload,
                    status: .pending,
                    attempts: item.retryCount,
                    lastError: nil,
                    createdAt: item.createdAt,
                    updatedAt: item.lastRetryAt ?? item.createdAt,
                    nextAttemptAt: Date()
                ).insert(db)
            }
        }
    }

    // MARK: - Legacy JSON File Deletion

    /// Deletes the legacy JSON persistence file from disk.
    /// Called once on first boot after migration to the outbox pipeline.
    public static func deleteLegacyFile() {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let url = documents.appendingPathComponent("meeshy_cache/\(legacyFileName)")
        try? FileManager.default.removeItem(at: url)
    }
}
