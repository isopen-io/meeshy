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
}

// MARK: - Offline Queue

public actor OfflineQueue {
    public static let shared = OfflineQueue()

    public nonisolated let retrySucceeded = SendablePassthrough<OfflineRetrySuccess>()

    private static let maxQueueSize = 100
    private static let queueFileName = "offline_queue.json"

    private var items: [OfflineQueueItem] = []
    private var isRetrying = false
    private var cancellables = Set<AnyCancellable>()
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "offlinequeue")

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    /// Called when retrying a queued message. Returns the server-assigned
    /// message id on success so the queue can emit a `retrySucceeded` event
    /// that lets active ViewModels reconcile the optimistic `tempId` with the
    /// authoritative `serverId` before the socket `message:new` broadcast
    /// arrives.
    public var onRetrySend: ((OfflineQueueItem) async -> String?)?

    public func setRetrySend(_ handler: @escaping @Sendable (OfflineQueueItem) async -> String?) {
        onRetrySend = handler
    }

    private init() {
        items = Self.loadItemsFromDisk()
        Task { await self.observeConnection() }
    }

    // MARK: - Queue Operations

    public func enqueue(_ item: OfflineQueueItem) {
        if items.count >= Self.maxQueueSize {
            items.removeFirst()
        }
        items.append(item)
        saveToDisk()
        logger.info("Enqueued offline message for conversation \(item.conversationId), queue size: \(self.items.count)")
    }

    public func dequeue(_ itemId: String) {
        items.removeAll { $0.id == itemId }
        saveToDisk()
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

        for id in successIds {
            items.removeAll { $0.id == id }
        }

        saveToDisk()
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

    // MARK: - Disk Persistence

    private var queueFileURL: URL {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let cacheDir = documents.appendingPathComponent("meeshy_cache", isDirectory: true)
        if !FileManager.default.fileExists(atPath: cacheDir.path) {
            try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
        }
        return cacheDir.appendingPathComponent(Self.queueFileName)
    }

    private func saveToDisk() {
        do {
            let data = try encoder.encode(items)
            try data.write(to: queueFileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        } catch {
            logger.error("Failed to save offline queue: \(error.localizedDescription)")
        }
    }

    private static func loadItemsFromDisk() -> [OfflineQueueItem] {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let cacheDir = documents.appendingPathComponent("meeshy_cache", isDirectory: true)
        let url = cacheDir.appendingPathComponent(queueFileName)
        guard FileManager.default.fileExists(atPath: url.path) else { return [] }

        do {
            let data = try Data(contentsOf: url)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode([OfflineQueueItem].self, from: data)
        } catch {
            return []
        }
    }

    // MARK: - Clear

    public func clearAll() {
        items.removeAll()
        saveToDisk()
    }

    // MARK: - Outbox Migration

    /// Migrates pending items from this JSON-file-backed queue into the unified
    /// `outbox` SQLite table. Idempotent — items already migrated (matching id)
    /// are skipped. Safe to call on every app launch.
    public func migrateToOutbox(pool: any DatabaseWriter) async {
        let snapshot = items
        guard !snapshot.isEmpty else { return }

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601

        try? await pool.write { db in
            for item in snapshot {
                let outboxId = "ofq_\(item.id)"
                guard try OutboxRecord.fetchOne(db, key: outboxId) == nil else { continue }
                let payload = (try? encoder.encode(item)) ?? Data()
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
}
