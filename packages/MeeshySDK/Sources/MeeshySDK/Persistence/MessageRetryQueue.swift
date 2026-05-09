import Foundation
import Combine
import GRDB
import os

// MARK: - Retry Queue Item

public struct RetryQueueItem: Codable, Identifiable, Sendable {
    /// Internal identifier of the in-memory queue row. Distinct from
    /// `clientMessageId` so the actor can track multiple lifecycles of the
    /// same logical message (e.g. user retries after exhaustion). Outbox
    /// rows are namespaced as `mrq_<id>` to keep them disjoint from the
    /// `ofq_*` namespace owned by ``OfflineQueue``.
    public let id: String
    /// Stable end-to-end identifier (`cid_<uuid v4 lowercase>`) used for
    /// idempotent dedup with the gateway (see Phase 4 spec §6.2) and to
    /// correlate the optimistic UI row with the authoritative server message
    /// when ``MessageRetryQueue/retrySucceeded`` fires. Replaces the legacy
    /// `retry_*` prefixed local id scheme entirely.
    public let clientMessageId: String
    /// Backwards-compatible alias kept for existing call sites (Combine
    /// subscribers, optimistic UI). Always equal to `clientMessageId`
    /// post-Phase-4 — the legacy `retry_<uuid>` namespace no longer exists.
    public var tempId: String { clientMessageId }
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
        clientMessageId: String? = nil
    ) {
        self.id = UUID().uuidString
        self.clientMessageId = clientMessageId ?? ClientMessageId.generate()
        self.conversationId = conversationId
        self.content = content
        self.originalLanguage = originalLanguage
        self.replyToId = replyToId
        self.attachmentIds = attachmentIds
        self.createdAt = Date()
        self.retryCount = 0
        self.lastRetryAt = nil
    }

    /// Decoder-friendly init that accepts a pre-existing `id`, `clientMessageId`
    /// and `createdAt`, used when re-hydrating from `OutboxRecord.payload`
    /// at boot or retry time (see ``MessageRetryQueue/bootRecovery()``).
    public init(
        id: String,
        clientMessageId: String,
        conversationId: String,
        content: String,
        originalLanguage: String,
        replyToId: String?,
        attachmentIds: [String]?,
        createdAt: Date,
        retryCount: Int = 0,
        lastRetryAt: Date? = nil
    ) {
        self.id = id
        self.clientMessageId = clientMessageId
        self.conversationId = conversationId
        self.content = content
        self.originalLanguage = originalLanguage
        self.replyToId = replyToId
        self.attachmentIds = attachmentIds
        self.createdAt = createdAt
        self.retryCount = retryCount
        self.lastRetryAt = lastRetryAt
    }
}

// MARK: - Retry Success Payload

/// Emitted when a transient-failure retry finally reaches the server. The
/// optimistic `clientMessageId` and the authoritative `serverId` let active
/// ViewModels reconcile in-memory state before the socket `message:new`
/// broadcast arrives, preventing duplicates and messages stuck in `.sending`.
public struct RetryQueueSuccess: Sendable {
    public let clientMessageId: String
    public let serverId: String
    public let conversationId: String
    /// Backwards-compatible alias for existing call sites that consume
    /// `tempId`. Always equal to `clientMessageId` post-Phase-4.
    public var tempId: String { clientMessageId }

    public init(clientMessageId: String, serverId: String, conversationId: String) {
        self.clientMessageId = clientMessageId
        self.serverId = serverId
        self.conversationId = conversationId
    }
}

/// Emitted when an item is permanently dropped after exhausting its retry
/// budget. Lets ViewModels flip their optimistic row to `.failed` and show a
/// "tap to retry" affordance instead of leaving it stuck in `.sending`.
public struct RetryQueueFailure: Sendable {
    public let clientMessageId: String
    public let conversationId: String
    /// Backwards-compatible alias for existing call sites that consume
    /// `tempId`. Always equal to `clientMessageId` post-Phase-4.
    public var tempId: String { clientMessageId }

    public init(clientMessageId: String, conversationId: String) {
        self.clientMessageId = clientMessageId
        self.conversationId = conversationId
    }
}

// MARK: - Errors

public enum MessageRetryQueueError: Error, Sendable {
    /// `configure(pool:)` was never called — the queue has no SQLite outbox to
    /// persist into. Callers must wire a pool at boot before any `enqueue`.
    case poolNotConfigured
    /// A required encode/decode step failed. The wrapped error is the
    /// underlying `EncodingError` / `DecodingError`.
    case payloadCodingFailed(underlying: Error)
    /// The GRDB write transaction itself failed.
    case writeFailed(underlying: Error)
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

    /// Namespace prefix for outbox rows owned by this queue. Keeps `mrq_*`
    /// disjoint from `ofq_*` (OfflineQueue), `ofqe_*` (offline edits) and
    /// `ofqd_*` (offline deletes) so boot recovery can target the right set.
    private static let outboxIdPrefix = "mrq_"

    // Legacy file name — kept only for deletion on first boot.
    private static let legacyFileName = "message_retry_queue.json"

    private var items: [RetryQueueItem] = []
    private var isRetrying = false
    private var retryTask: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "messageretryqueue")
    /// Outbox pool — injected at boot via `configure(pool:)`. Nil until wired.
    private var outboxPool: (any DatabaseWriter)?

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
    ///
    /// Coalescing : if a pending `mrq_*` record already exists for the same
    /// `clientMessageId` in the same conversation, the existing record is
    /// updated (payload + `updatedAt` refreshed, `lastError` cleared) instead
    /// of inserting a duplicate. Cross-kind coalescing (sendMessage vs
    /// editMessage/deleteMessage) is handled by ``OfflineQueue``, not here —
    /// this queue only owns `sendMessage`.
    ///
    /// Throws ``MessageRetryQueueError/poolNotConfigured`` if `configure(pool:)`
    /// was never called, ``MessageRetryQueueError/payloadCodingFailed`` if
    /// encoding the item fails, and ``MessageRetryQueueError/writeFailed`` if
    /// the underlying transaction throws.
    public func enqueue(_ item: RetryQueueItem) async throws {
        if items.count >= Self.maxQueueSize {
            items.removeFirst()
        }
        // Replace any existing in-memory row for the same clientMessageId so
        // the actor mirror stays consistent with the deduplicated outbox.
        items.removeAll { $0.clientMessageId == item.clientMessageId }
        items.append(item)

        try await writeToOutbox(item)
        logger.info("Enqueued message for retry: \(item.conversationId, privacy: .public), queue size: \(self.items.count)")
        startRetryLoop()
    }

    public func dequeue(_ itemId: String) async {
        let outboxId = Self.outboxIdPrefix + itemId
        items.removeAll { $0.id == itemId }
        guard let pool = outboxPool else { return }
        do {
            try await pool.write { db in
                _ = try OutboxRecord.deleteOne(db, key: outboxId)
            }
        } catch {
            logger.error("dequeue failed: \(error.localizedDescription, privacy: .public)")
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
                    clientMessageId: items[i].clientMessageId,
                    conversationId: items[i].conversationId
                ))
                continue
            }

            if let serverId = await retrySend(items[i]) {
                toRemove.append(items[i].id)
                successPayloads.append(RetryQueueSuccess(
                    clientMessageId: items[i].clientMessageId,
                    serverId: serverId,
                    conversationId: items[i].conversationId
                ))
                logger.info("Retry succeeded for message \(self.items[i].id, privacy: .public)")
            } else {
                items[i].retryCount += 1
                items[i].lastRetryAt = Date()
                updated = true
                logger.info("Retry \(self.items[i].retryCount)/\(Self.maxRetries) failed for message \(self.items[i].id, privacy: .public)")
                if items[i].retryCount >= Self.maxRetries {
                    exhaustedPayloads.append(RetryQueueFailure(
                        clientMessageId: items[i].clientMessageId,
                        conversationId: items[i].conversationId
                    ))
                }
            }
        }

        let pool = outboxPool
        for id in toRemove {
            items.removeAll { $0.id == id }
            if let pool {
                let outboxId = Self.outboxIdPrefix + id
                do {
                    try await pool.write { db in _ = try OutboxRecord.deleteOne(db, key: outboxId) }
                } catch {
                    logger.error("Failed to delete outbox record \(outboxId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                }
            }
        }

        if updated, let pool {
            // Persist updated retry counts back to the outbox.
            let updatedItems = items.filter { $0.retryCount > 0 }
            for item in updatedItems {
                let outboxId = Self.outboxIdPrefix + item.id
                let updatedItem = item
                do {
                    try await pool.write { db in
                        if var record = try OutboxRecord.fetchOne(db, key: outboxId) {
                            record.attempts = updatedItem.retryCount
                            record.updatedAt = updatedItem.lastRetryAt ?? Date()
                            try record.update(db)
                        }
                    }
                } catch {
                    logger.error("Failed to update outbox attempts for \(outboxId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                }
            }
        }

        isRetrying = false

        // Remove optimistic rows from the persisted cache so an inactive
        // ConversationViewModel doesn't show a ghost optimistic row next to
        // the authoritative server message that arrives via `message:new`.
        for payload in successPayloads {
            await CacheCoordinator.shared.messages.mergeUpdate(for: payload.conversationId) { cached in
                cached.filter { $0.id != payload.clientMessageId }
            }
            retrySucceeded.send(payload)
        }
        for payload in exhaustedPayloads { retryExhausted.send(payload) }
    }

    public func retryAllNow() async {
        await retryPending()
    }

    // MARK: - Boot Recovery

    /// Boot-time crash recovery: any `mrq_*` record left in `.inflight` from a
    /// previous process — the app crashed mid-dispatch — is reset to
    /// `.pending` so the flusher will pick it back up. Idempotent dedup on the
    /// gateway (`MessagingService.handleMessage` catch-P2002, see Phase 4 §6.2)
    /// guarantees that a message which actually reached the server before the
    /// crash will not produce a duplicate at replay time.
    ///
    /// Returns the number of inflight records reset, for observability and
    /// telemetry. Throws ``MessageRetryQueueError/poolNotConfigured`` if
    /// `configure(pool:)` was never called.
    @discardableResult
    public func bootRecovery() async throws -> Int {
        guard let pool = outboxPool else { throw MessageRetryQueueError.poolNotConfigured }
        let prefix = Self.outboxIdPrefix
        do {
            let resetCount = try await pool.write { db -> Int in
                let inflight = try OutboxRecord
                    .filter(Column("status") == OutboxStatus.inflight.rawValue)
                    .filter(Column("kind") == OutboxKind.sendMessage.rawValue)
                    .fetchAll(db)
                var count = 0
                for record in inflight {
                    guard record.id.hasPrefix(prefix) else { continue }
                    try db.execute(sql: """
                        UPDATE outbox
                        SET status = ?, lastError = ?, updatedAt = ?
                        WHERE id = ?
                        """, arguments: [
                            OutboxStatus.pending.rawValue,
                            "Reset on boot after presumed crash",
                            Date(),
                            record.id
                        ])
                    count += 1
                }
                return count
            }
            if resetCount > 0 {
                logger.info("Boot recovery: reset \(resetCount) inflight mrq_* records to pending")
            }
            return resetCount
        } catch {
            throw MessageRetryQueueError.writeFailed(underlying: error)
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
            let outboxId = Self.outboxIdPrefix + item.id
            do {
                try await pool.write { db in _ = try OutboxRecord.deleteOne(db, key: outboxId) }
            } catch {
                logger.error("Failed to purge expired outbox record \(outboxId, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    // MARK: - Outbox Write

    /// Persists `item` into the SQLite outbox. Coalesces idempotent
    /// re-enqueues of the same `clientMessageId` by refreshing the existing
    /// record's payload + `updatedAt` instead of inserting a duplicate. Both
    /// the SELECT-existing read and the INSERT/UPDATE happen in a single GRDB
    /// transaction — there is no race window between detection and write.
    private func writeToOutbox(_ item: RetryQueueItem) async throws {
        guard let pool = outboxPool else {
            logger.error("writeToOutbox called before configure(pool:) — refusing to drop the message silently")
            throw MessageRetryQueueError.poolNotConfigured
        }

        let payload: Data
        do {
            payload = try encoder.encode(item)
        } catch {
            logger.error("Failed to encode RetryQueueItem: \(error.localizedDescription, privacy: .public)")
            throw MessageRetryQueueError.payloadCodingFailed(underlying: error)
        }

        let outboxId = Self.outboxIdPrefix + item.id
        let conversationId = item.conversationId
        let clientMessageId = item.clientMessageId
        let createdAt = item.createdAt
        let attempts = item.retryCount
        let updatedAt = item.lastRetryAt ?? item.createdAt

        do {
            try await pool.write { db in
                let existing = try OutboxRecord
                    .filter(Column("conversationId") == conversationId)
                    .filter(Column("clientMessageId") == clientMessageId)
                    .filter(Column("kind") == OutboxKind.sendMessage.rawValue)
                    .filter(Column("status") == OutboxStatus.pending.rawValue)
                    .order(Column("createdAt").desc)
                    .fetchOne(db)

                if let existing {
                    // Idempotent re-enqueue (same clientMessageId already
                    // pending). Refresh payload + timestamps + clear the last
                    // error so attachmentIds and retry counters stay current
                    // without creating a duplicate row.
                    try db.execute(sql: """
                        UPDATE outbox
                        SET payload = ?, attempts = ?, updatedAt = ?, lastError = NULL
                        WHERE id = ?
                        """, arguments: [payload, attempts, Date(), existing.id])
                } else {
                    try OutboxRecord(
                        id: outboxId,
                        kind: .sendMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: payload,
                        status: .pending,
                        attempts: attempts,
                        lastError: nil,
                        createdAt: createdAt,
                        updatedAt: updatedAt,
                        nextAttemptAt: Date()
                    ).insert(db)
                }
            }
        } catch {
            logger.error("Outbox write failed: \(error.localizedDescription, privacy: .public)")
            throw MessageRetryQueueError.writeFailed(underlying: error)
        }
    }

    // MARK: - Clear

    public func clearAll() async {
        let ids = items.map { $0.id }
        items.removeAll()
        guard let pool = outboxPool else { return }
        do {
            try await pool.write { db in
                for id in ids {
                    _ = try OutboxRecord.deleteOne(db, key: Self.outboxIdPrefix + id)
                }
            }
        } catch {
            logger.error("clearAll failed: \(error.localizedDescription, privacy: .public)")
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
        do {
            try await pool.write { db in
                for item in snapshot {
                    let outboxId = Self.outboxIdPrefix + item.id
                    guard try OutboxRecord.fetchOne(db, key: outboxId) == nil else { continue }
                    let payload = (try? enc.encode(item)) ?? Data()
                    try OutboxRecord(
                        id: outboxId,
                        kind: .sendMessage,
                        conversationId: item.conversationId,
                        messageLocalId: item.clientMessageId,
                        clientMessageId: item.clientMessageId,
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
        } catch {
            logger.error("migrateToOutbox failed: \(error.localizedDescription, privacy: .public)")
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
