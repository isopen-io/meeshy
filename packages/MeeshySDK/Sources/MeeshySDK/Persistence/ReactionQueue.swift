import Foundation
import Combine
import GRDB
import os

// MARK: - Reaction Action

/// Direction of a reaction mutation enqueued for delivery to the gateway.
/// Top-level type so it can be referenced from `ReactionOutboxPayload` (the
/// JSON-encoded payload persisted into `OutboxRecord.payload`) without forcing
/// callers to spell out `ReactionQueueItem.Action`.
public enum ReactionAction: String, Codable, Sendable {
    case add
    case remove
}

// MARK: - Reaction Queue Item

/// Domain-level descriptor of a queued reaction mutation. Mirrors the public
/// API of the legacy `ReactionQueue` (pre-Phase-4) so existing call sites keep
/// compiling — `messageId / emoji / action / conversationId / id / createdAt`
/// remain available, and a new `clientMessageId` field exposes the stable
/// end-to-end identifier persisted in the outbox row.
public struct ReactionQueueItem: Codable, Identifiable, Sendable {
    /// Backwards-compatible alias of the new top-level ``ReactionAction``.
    public typealias Action = ReactionAction

    public let id: String
    public let messageId: String
    public let emoji: String
    public let action: ReactionAction
    public let conversationId: String
    /// Stable end-to-end identifier (`cid_<uuid v4 lowercase>`) used to coalesce
    /// in-queue records that target the same logical reaction toggle (an `add`
    /// followed by a `remove` on the same `(messageId, emoji)`) and to dedup
    /// against the gateway. Generated lazily by ``ClientMessageId/generate()``
    /// when the caller does not supply one.
    public let clientMessageId: String
    public let createdAt: Date
    /// Number of retry passes that have already been attempted for this item
    /// (purely informational — the outbox is the source of truth for retries).
    public let retryCount: Int
    public let lastRetryAt: Date?

    public init(
        messageId: String,
        emoji: String,
        action: ReactionAction,
        conversationId: String,
        clientMessageId: String? = nil,
        retryCount: Int = 0,
        lastRetryAt: Date? = nil
    ) {
        self.id = UUID().uuidString
        self.messageId = messageId
        self.emoji = emoji
        self.action = action
        self.conversationId = conversationId
        self.clientMessageId = clientMessageId ?? ClientMessageId.generate()
        self.createdAt = Date()
        self.retryCount = retryCount
        self.lastRetryAt = lastRetryAt
    }

    /// Decoder-friendly init that accepts a pre-existing `id` and `createdAt`,
    /// used when re-hydrating from a `ReactionOutboxPayload` at retry time.
    public init(
        id: String,
        messageId: String,
        emoji: String,
        action: ReactionAction,
        conversationId: String,
        clientMessageId: String,
        createdAt: Date,
        retryCount: Int = 0,
        lastRetryAt: Date? = nil
    ) {
        self.id = id
        self.messageId = messageId
        self.emoji = emoji
        self.action = action
        self.conversationId = conversationId
        self.clientMessageId = clientMessageId
        self.createdAt = createdAt
        self.retryCount = retryCount
        self.lastRetryAt = lastRetryAt
    }
}

// MARK: - Reaction Outbox Payload

/// JSON-encoded payload written into `OutboxRecord.payload` for every
/// `kind == .sendReaction` row. Re-hydrated at retry time to rebuild the
/// `ReactionQueueItem` handed to the application-supplied retry handler.
public struct ReactionOutboxPayload: Codable, Sendable {
    public let messageId: String
    public let emoji: String
    public let action: ReactionAction
    public let conversationId: String
    public let clientMessageId: String

    public init(
        messageId: String,
        emoji: String,
        action: ReactionAction,
        conversationId: String,
        clientMessageId: String
    ) {
        self.messageId = messageId
        self.emoji = emoji
        self.action = action
        self.conversationId = conversationId
        self.clientMessageId = clientMessageId
    }
}

// MARK: - Reaction Retry Payloads

/// Emitted when a queued reaction mutation finally reaches the server after a
/// reconnect. Lets active ViewModels cross off any "pending" indicator without
/// racing a socket broadcast.
public struct ReactionQueueSuccess: Sendable {
    public let messageId: String
    public let emoji: String
    public let action: ReactionAction
    public let conversationId: String
    public let clientMessageId: String

    public init(
        messageId: String,
        emoji: String,
        action: ReactionAction,
        conversationId: String,
        clientMessageId: String
    ) {
        self.messageId = messageId
        self.emoji = emoji
        self.action = action
        self.conversationId = conversationId
        self.clientMessageId = clientMessageId
    }
}

/// Emitted when a queued reaction mutation collapses (conflicting state:
/// tried to add what already exists, tried to remove what isn't there, or
/// message was deleted). Consumers revert the optimistic row.
public struct ReactionQueueFailure: Sendable {
    public let messageId: String
    public let emoji: String
    public let action: ReactionAction
    public let conversationId: String
    public let clientMessageId: String

    public init(
        messageId: String,
        emoji: String,
        action: ReactionAction,
        conversationId: String,
        clientMessageId: String
    ) {
        self.messageId = messageId
        self.emoji = emoji
        self.action = action
        self.conversationId = conversationId
        self.clientMessageId = clientMessageId
    }
}

/// Emitted when a queued reaction mutation is dropped during enqueue-time
/// coalescing — e.g. an `add` followed by a `remove` on the same
/// `(messageId, emoji)` cancels both records, so neither will reach the
/// server. ViewModels can use this to clear any "pending" hint they had
/// surfaced for the original optimistic action.
public struct ReactionQueueDropped: Sendable {
    public let messageId: String
    public let emoji: String
    public let action: ReactionAction
    public let conversationId: String
    public let clientMessageId: String

    public init(
        messageId: String,
        emoji: String,
        action: ReactionAction,
        conversationId: String,
        clientMessageId: String
    ) {
        self.messageId = messageId
        self.emoji = emoji
        self.action = action
        self.conversationId = conversationId
        self.clientMessageId = clientMessageId
    }
}

// MARK: - Errors

public enum ReactionQueueError: Error, Sendable {
    /// `configure(pool:)` was never called — the queue has no SQLite outbox to
    /// persist into. Callers must wire a pool at boot before any `enqueue`.
    case poolNotConfigured
    /// A required encode/decode step failed. The wrapped error is the
    /// underlying `EncodingError` / `DecodingError`.
    case payloadCodingFailed(underlying: Error)
    /// The GRDB write transaction itself failed.
    case writeFailed(underlying: Error)
}

// MARK: - Reaction Queue

/// FIFO queue for reaction add/remove operations so they survive offline
/// moments and app restarts. Reactions must remain locally consistent even
/// when the user taps hearts and then locks the phone — the optimistic UI
/// stays in place and the server learns about it on reconnect.
///
/// Phase 4 refactor: the actor no longer maintains a separate JSON file in
/// `Documents/meeshy_cache/reaction_queue.json`. Reaction mutations are now
/// persisted as `OutboxRecord` rows with `kind == .sendReaction` and a
/// JSON-encoded ``ReactionOutboxPayload`` body, sharing the same SQLite outbox
/// as `OfflineQueue`. The legacy file is removed on first boot via
/// ``ReactionQueue/deleteLegacyFile()``.
///
/// Coalescing rules (applied transactionally inside `enqueue`):
/// - `(none)` + `add`/`remove` → INSERT
/// - `add` already pending + `remove` → DELETE existing (round-trip avoided)
/// - `remove` already pending + `add` → DELETE existing (round-trip avoided)
/// - same action already pending → DELETE the new record (idempotent dedup)
///
/// Pairs with `ConversationViewModel.toggleReaction` which applies the
/// reaction optimistically and enqueues the remote mutation, subscribing to
/// the `retrySucceeded` / `retryExhausted` / `retryDropped` publishers to
/// reconcile when the network eventually lands.
public actor ReactionQueue {
    public static let shared = ReactionQueue()

    public nonisolated let retrySucceeded = SendablePassthrough<ReactionQueueSuccess>()
    public nonisolated let retryExhausted = SendablePassthrough<ReactionQueueFailure>()
    public nonisolated let retryDropped = SendablePassthrough<ReactionQueueDropped>()

    private static let legacyFileName = "reaction_queue.json"

    private var isRetrying = false
    private var cancellables = Set<AnyCancellable>()
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "reactionqueue")
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

    /// Called when retrying a queued reaction. Return `.succeeded` on HTTP 2xx
    /// or when the server replied with a benign conflict (already reacted /
    /// already removed) — both are terminal states that should drain the item.
    /// Return `.dropped` for permanent rejection (404/410 message gone), or
    /// `.transient` to keep the item for the next reconnect cycle.
    public var onRetry: ((ReactionQueueItem) async -> RetryOutcome)?

    public enum RetryOutcome: Sendable {
        /// Server accepted the mutation. Drain the item.
        case succeeded
        /// Server rejected the mutation permanently (404, 410, 409 conflict
        /// with server state). Drain and emit `retryExhausted`.
        case dropped
        /// Transient failure. Keep the item.
        case transient
    }

    public func setRetry(_ handler: @escaping @Sendable (ReactionQueueItem) async -> RetryOutcome) {
        onRetry = handler
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

    /// Persists `item` as an `OutboxRecord` of kind `.sendReaction`, applying
    /// the coalescing state machine described in the type-level doc. The
    /// SELECT-existing read and the INSERT/DELETE write happen in the same
    /// GRDB transaction, so there is no race between detection and merge.
    ///
    /// Throws ``ReactionQueueError/poolNotConfigured`` if `configure(pool:)`
    /// was never called, ``ReactionQueueError/payloadCodingFailed(underlying:)``
    /// if encoding fails, and ``ReactionQueueError/writeFailed(underlying:)``
    /// if the underlying transaction throws.
    public func enqueue(_ item: ReactionQueueItem) async throws {
        guard let pool = outboxPool else {
            logger.error("enqueue called before configure(pool:) — refusing to drop the reaction silently")
            throw ReactionQueueError.poolNotConfigured
        }

        let outboxId = "rxq_\(item.id)"
        let payloadStruct = ReactionOutboxPayload(
            messageId: item.messageId,
            emoji: item.emoji,
            action: item.action,
            conversationId: item.conversationId,
            clientMessageId: item.clientMessageId
        )

        let payloadData: Data
        do {
            payloadData = try encoder.encode(payloadStruct)
        } catch {
            logger.error("Failed to encode ReactionOutboxPayload: \(error.localizedDescription, privacy: .public)")
            throw ReactionQueueError.payloadCodingFailed(underlying: error)
        }

        let conversationId = item.conversationId
        let messageId = item.messageId
        let emoji = item.emoji
        let action = item.action
        let clientMessageId = item.clientMessageId
        let createdAt = item.createdAt
        let dec = decoder
        let log = logger

        // Drop reasons emitted after the transaction commits. Inside the
        // closure we cannot emit Combine values without re-entering the actor;
        // we collect the snapshot and fire it post-commit.
        enum CoalesceOutcome: Sendable {
            case inserted
            case droppedNew(matched: ReactionOutboxPayload)
            case cancelledBoth(matched: ReactionOutboxPayload)
        }

        let outcome: CoalesceOutcome
        do {
            outcome = try await pool.write { db in
                // Find any pending sendReaction record on the same conversation
                // that matches `(messageId, emoji)`. The composite index
                // `idx_outbox_conv_client_status (conversationId, clientMessageId,
                // status)` accelerates the conversation+status filter; the
                // (messageId, emoji) match still requires decoding payload, but
                // pending reaction queues are typically tiny so this stays fast.
                let candidates = try OutboxRecord
                    .filter(Column("conversationId") == conversationId)
                    .filter(Column("kind") == OutboxKind.sendReaction.rawValue)
                    .filter(Column("status") == OutboxStatus.pending.rawValue)
                    .order(Column("createdAt").asc)
                    .fetchAll(db)

                let match: (record: OutboxRecord, payload: ReactionOutboxPayload)? = candidates.lazy
                    .compactMap { record -> (OutboxRecord, ReactionOutboxPayload)? in
                        guard let decoded = try? dec.decode(ReactionOutboxPayload.self, from: record.payload),
                              decoded.messageId == messageId,
                              decoded.emoji == emoji
                        else { return nil }
                        return (record, decoded)
                    }
                    .first

                if let match {
                    if match.payload.action == action {
                        // Idempotent re-enqueue (same direction). Drop the new
                        // record, keep the existing one untouched.
                        log.info("Reaction \(action.rawValue, privacy: .public) \(emoji, privacy: .public) on \(messageId, privacy: .public) already pending — deduped")
                        return .droppedNew(matched: match.payload)
                    } else {
                        // Opposite directions cancel. Delete the existing
                        // pending record so neither hits the server.
                        _ = try OutboxRecord.deleteOne(db, key: match.record.id)
                        log.info("Reaction toggle cancelled in queue: \(match.payload.action.rawValue, privacy: .public) + \(action.rawValue, privacy: .public) on \(emoji, privacy: .public)/\(messageId, privacy: .public)")
                        return .cancelledBoth(matched: match.payload)
                    }
                }

                try OutboxRecord(
                    id: outboxId,
                    kind: .sendReaction,
                    conversationId: conversationId,
                    messageLocalId: clientMessageId,
                    clientMessageId: clientMessageId,
                    payload: payloadData,
                    status: .pending,
                    createdAt: createdAt
                ).insert(db)
                return .inserted
            }
        } catch let error as ReactionQueueError {
            throw error
        } catch {
            logger.error("Outbox write failed for reaction: \(error.localizedDescription, privacy: .public)")
            throw ReactionQueueError.writeFailed(underlying: error)
        }

        switch outcome {
        case .inserted:
            logger.info("Enqueued reaction \(action.rawValue, privacy: .public) \(emoji, privacy: .public) for message \(messageId, privacy: .public)")
        case .droppedNew(let matched):
            // Surface the duplicate as a drop so optimistic UI can reconcile
            // (e.g. if the caller had already painted a "pending" badge for
            // this very tap, the existing pending record will resolve it).
            retryDropped.send(ReactionQueueDropped(
                messageId: messageId,
                emoji: emoji,
                action: action,
                conversationId: conversationId,
                clientMessageId: clientMessageId
            ))
            _ = matched
        case .cancelledBoth(let matched):
            // Both the existing pending record and the new mutation are gone:
            // emit a drop for each side so callers can revert optimistic
            // visuals. The existing record is keyed off `matched`, the new one
            // off the freshly built payload.
            retryDropped.send(ReactionQueueDropped(
                messageId: matched.messageId,
                emoji: matched.emoji,
                action: matched.action,
                conversationId: matched.conversationId,
                clientMessageId: matched.clientMessageId
            ))
            retryDropped.send(ReactionQueueDropped(
                messageId: messageId,
                emoji: emoji,
                action: action,
                conversationId: conversationId,
                clientMessageId: clientMessageId
            ))
        }
    }

    public var pendingItems: [ReactionQueueItem] {
        get async {
            guard let pool = outboxPool else { return [] }
            do {
                return try await pool.read { [decoder] db in
                    let records = try OutboxRecord
                        .filter(Column("kind") == OutboxKind.sendReaction.rawValue)
                        .filter(Column("status") == OutboxStatus.pending.rawValue)
                        .order(Column("createdAt").asc)
                        .fetchAll(db)
                    return records.compactMap { record -> ReactionQueueItem? in
                        guard let payload = try? decoder.decode(ReactionOutboxPayload.self, from: record.payload) else {
                            return nil
                        }
                        return ReactionQueueItem(
                            id: record.id,
                            messageId: payload.messageId,
                            emoji: payload.emoji,
                            action: payload.action,
                            conversationId: payload.conversationId,
                            clientMessageId: payload.clientMessageId,
                            createdAt: record.createdAt,
                            retryCount: record.attempts,
                            lastRetryAt: record.attempts > 0 ? record.updatedAt : nil
                        )
                    }
                }
            } catch {
                logger.error("pendingItems read failed: \(error.localizedDescription, privacy: .public)")
                return []
            }
        }
    }

    public var count: Int {
        get async { await pendingItems.count }
    }

    public var isEmpty: Bool {
        get async { await pendingItems.isEmpty }
    }

    // MARK: - Boot Recovery

    /// Boot-time crash recovery: any reaction record left in `.inflight` from a
    /// previous process is reset to `.pending` so the flusher will pick it
    /// back up. Mirror of `OfflineQueue.bootRecovery` scoped to
    /// `kind == .sendReaction`.
    @discardableResult
    public func bootRecovery() async throws -> Int {
        guard let pool = outboxPool else { throw ReactionQueueError.poolNotConfigured }
        let log = logger
        let count: Int
        do {
            count = try await pool.write { db in
                let inflight = try OutboxRecord
                    .filter(Column("kind") == OutboxKind.sendReaction.rawValue)
                    .filter(Column("status") == OutboxStatus.inflight.rawValue)
                    .fetchAll(db)
                for record in inflight {
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
                }
                return inflight.count
            }
        } catch {
            throw ReactionQueueError.writeFailed(underlying: error)
        }
        if count > 0 {
            log.info("Reaction queue boot recovery: reset \(count, privacy: .public) inflight records")
        }
        return count
    }

    // MARK: - Retry Logic

    public func retryAll() async {
        guard !isRetrying else { return }
        guard let pool = outboxPool else {
            logger.warning("retryAll called before configure(pool:) — skipping")
            return
        }
        guard let retry = onRetry else {
            logger.warning("No retry handler set, skipping retry")
            return
        }

        let pending = await pendingItems
        guard !pending.isEmpty else { return }

        isRetrying = true
        var successfulSnapshots: [ReactionQueueSuccess] = []
        var droppedSnapshots: [ReactionQueueFailure] = []
        var drained: [String] = []

        for item in pending {
            switch await retry(item) {
            case .succeeded:
                successfulSnapshots.append(ReactionQueueSuccess(
                    messageId: item.messageId,
                    emoji: item.emoji,
                    action: item.action,
                    conversationId: item.conversationId,
                    clientMessageId: item.clientMessageId
                ))
                drained.append(item.id)
            case .dropped:
                droppedSnapshots.append(ReactionQueueFailure(
                    messageId: item.messageId,
                    emoji: item.emoji,
                    action: item.action,
                    conversationId: item.conversationId,
                    clientMessageId: item.clientMessageId
                ))
                drained.append(item.id)
            case .transient:
                continue
            }
        }

        if !drained.isEmpty {
            let drainedIds = drained
            do {
                try await pool.write { db in
                    for id in drainedIds {
                        // Records are inserted with the `rxq_` prefix at
                        // line 308 (`let outboxId = "rxq_\(item.id)"`); the
                        // delete must use the same key form, otherwise the
                        // GRDB row stays around and the reaction replays
                        // forever on every reconnect.
                        _ = try OutboxRecord.deleteOne(db, key: "rxq_\(id)")
                    }
                }
            } catch {
                logger.error("Failed to delete drained reaction records: \(error.localizedDescription, privacy: .public)")
            }
        }

        isRetrying = false

        for payload in successfulSnapshots { retrySucceeded.send(payload) }
        for payload in droppedSnapshots { retryExhausted.send(payload) }

        if !successfulSnapshots.isEmpty || !droppedSnapshots.isEmpty {
            let remaining = pending.count - drained.count
            logger.info("Reaction queue drained: \(successfulSnapshots.count, privacy: .public) ok, \(droppedSnapshots.count, privacy: .public) dropped, \(remaining, privacy: .public) remaining")
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
                    try? await Task.sleep(nanoseconds: 2_000_000_000)
                    await self.retryAll()
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Clear

    /// Drains every pending reaction record from the outbox. Used by tests and
    /// by the global `clearAll` flow when the user signs out.
    public func clearAll() async throws {
        guard let pool = outboxPool else { throw ReactionQueueError.poolNotConfigured }
        do {
            try await pool.write { db in
                _ = try OutboxRecord
                    .filter(Column("kind") == OutboxKind.sendReaction.rawValue)
                    .deleteAll(db)
            }
        } catch {
            throw ReactionQueueError.writeFailed(underlying: error)
        }
    }

    // MARK: - Legacy JSON File Deletion

    /// Deletes the legacy JSON persistence file at
    /// `Documents/meeshy_cache/reaction_queue.json`. Called once on first boot
    /// after migration to the outbox pipeline so the abandoned file does not
    /// linger in the user's container.
    public static func deleteLegacyFile() {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let url = documents.appendingPathComponent("meeshy_cache/\(legacyFileName)")
        try? FileManager.default.removeItem(at: url)
    }
}
