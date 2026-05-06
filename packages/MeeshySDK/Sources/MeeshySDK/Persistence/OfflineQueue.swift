import Foundation
import Combine
import GRDB
import os

// MARK: - Offline Queue Item

public struct OfflineQueueItem: Codable, Identifiable, Sendable {
    public let id: String
    /// Optimistic message id shown in the UI while the item waits in queue.
    /// Used by ``OfflineQueue/retrySucceeded`` so active ViewModels can
    /// reconcile the optimistic row with the server-assigned message id
    /// before the `message:new` socket broadcast arrives.
    public let tempId: String
    public let conversationId: String
    public let content: String
    public let replyToId: String?
    public let forwardedFromId: String?
    public let forwardedFromConversationId: String?
    public let attachmentIds: [String]?
    public let createdAt: Date

    public init(
        conversationId: String,
        content: String,
        replyToId: String? = nil,
        forwardedFromId: String? = nil,
        forwardedFromConversationId: String? = nil,
        attachmentIds: [String]? = nil,
        tempId: String? = nil
    ) {
        let queueId = UUID().uuidString
        self.id = queueId
        self.tempId = tempId ?? "offline_\(queueId)"
        self.conversationId = conversationId
        self.content = content
        self.replyToId = replyToId
        self.forwardedFromId = forwardedFromId
        self.forwardedFromConversationId = forwardedFromConversationId
        self.attachmentIds = attachmentIds
        self.createdAt = Date()
    }
}

// MARK: - Retry Success Payload

/// Emitted when an offline-queued message successfully reaches the server after
/// reconnection. Downstream ViewModels map the optimistic `tempId`
/// (`"offline_<queueItem.id>"`) to the authoritative `serverId` so the
/// incoming `message:new` socket event reconciles instead of duplicating.
public struct OfflineRetrySuccess: Sendable {
    public let tempId: String
    public let serverId: String
    public let conversationId: String

    public init(tempId: String, serverId: String, conversationId: String) {
        self.tempId = tempId
        self.serverId = serverId
        self.conversationId = conversationId
    }
}

// MARK: - Offline Queue

public actor OfflineQueue {
    public static let shared = OfflineQueue()

    public nonisolated let retrySucceeded = SendablePassthrough<OfflineRetrySuccess>()

    private static let maxQueueSize = 100

    // Legacy file names — kept only for deletion on first boot.
    private static let legacyFileName = "offline_queue.json"

    private var items: [OfflineQueueItem] = []
    private var isRetrying = false
    private var cancellables = Set<AnyCancellable>()
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "offlinequeue")
    /// Outbox pool — injected at boot via `configure(pool:)`. Nil until wired.
    private var outboxPool: (any DatabaseWriter)?

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    /// Called when retrying a queued message via the in-memory path. Returns
    /// the server-assigned message id on success so the queue can emit a
    /// `retrySucceeded` event that lets active ViewModels reconcile the
    /// optimistic `tempId` with the authoritative `serverId` before the socket
    /// `message:new` broadcast arrives.
    public var onRetrySend: ((OfflineQueueItem) async -> String?)?

    public func setRetrySend(_ handler: @escaping @Sendable (OfflineQueueItem) async -> String?) {
        onRetrySend = handler
    }

    /// Wires the outbox pool used for SQLite persistence.
    /// Must be called once at boot before any `enqueue` calls.
    public func configure(pool: any DatabaseWriter) {
        outboxPool = pool
    }

    private init() {
        Task { await self.observeConnection() }
    }

    // MARK: - Queue Operations

    /// Enqueues `item` into the in-memory mirror and writes a corresponding
    /// `OutboxRecord` to the SQLite outbox table. The outbox write is the
    /// authoritative persistence store; the in-memory array is a fast read
    /// cache that is consistent with it.
    public func enqueue(_ item: OfflineQueueItem) async {
        if items.count >= Self.maxQueueSize {
            items.removeFirst()
        }
        items.append(item)
        await writeToOutbox(item)
        logger.info("Enqueued offline message for conversation \(item.conversationId), queue size: \(self.items.count)")
    }

    public func dequeue(_ itemId: String) async {
        let outboxId = "ofq_\(itemId)"
        items.removeAll { $0.id == itemId }
        guard let pool = outboxPool else { return }
        try? await pool.write { db in
            try OutboxRecord.deleteOne(db, key: outboxId)
        }
    }

    public var pendingItems: [OfflineQueueItem] {
        items
    }

    public var count: Int {
        items.count
    }

    public var isEmpty: Bool {
        items.isEmpty
    }

    // MARK: - Retry Logic

    public func retryAll() async {
        guard !isRetrying, !items.isEmpty else { return }
        guard let retrySend = onRetrySend else {
            logger.warning("No retry handler set, skipping retry")
            return
        }

        isRetrying = true
        logger.info("Retrying \(self.items.count) queued messages")

        var successIds: [String] = []
        var successPayloads: [OfflineRetrySuccess] = []

        for (index, item) in items.enumerated() {
            if index > 0 {
                let jitter = UInt64(Double.random(in: 100...500) * 1_000_000)
                try? await Task.sleep(nanoseconds: jitter)
            }
            if let serverId = await retrySend(item) {
                successIds.append(item.id)
                successPayloads.append(OfflineRetrySuccess(
                    tempId: item.tempId,
                    serverId: serverId,
                    conversationId: item.conversationId
                ))
            } else {
                break
            }
        }

        let pool = outboxPool
        for id in successIds {
            items.removeAll { $0.id == id }
            if let pool {
                let outboxId = "ofq_\(id)"
                try? await pool.write { db in try OutboxRecord.deleteOne(db, key: outboxId) }
            }
        }

        isRetrying = false

        // Clean the optimistic rows out of the persisted message cache so an
        // inactive ConversationViewModel (loaded later) doesn't show a ghost
        // `offline_<uuid>` row alongside the authoritative server message
        // that arrives via the socket `message:new` broadcast.
        for payload in successPayloads {
            await CacheCoordinator.shared.messages.mergeUpdate(for: payload.conversationId) { cached in
                cached.filter { $0.id != payload.tempId }
            }
            retrySucceeded.send(payload)
        }

        if !successIds.isEmpty {
            logger.info("Successfully retried \(successIds.count) messages, \(self.items.count) remaining")
        }
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
                    // Small delay to let the connection stabilize
                    try? await Task.sleep(nanoseconds: 2_000_000_000)
                    await self.retryAll()
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Outbox Write

    private func writeToOutbox(_ item: OfflineQueueItem) async {
        guard let pool = outboxPool else { return }
        let outboxId = "ofq_\(item.id)"
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
                attempts: 0,
                lastError: nil,
                createdAt: item.createdAt,
                updatedAt: Date(),
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
                try OutboxRecord.deleteOne(db, key: "ofq_\(id)")
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
                let outboxId = "ofq_\(item.id)"
                guard try OutboxRecord.fetchOne(db, key: outboxId) == nil else { continue }
                let payload = (try? enc.encode(item)) ?? Data()
                try OutboxRecord(
                    id: outboxId,
                    kind: .sendMessage,
                    conversationId: item.conversationId,
                    messageLocalId: item.tempId,
                    payload: payload,
                    status: .pending,
                    attempts: 0,
                    lastError: nil,
                    createdAt: item.createdAt,
                    updatedAt: Date(),
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
