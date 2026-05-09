import Foundation
import Combine
import GRDB
import os

// MARK: - Offline Queue Item

public struct OfflineQueueItem: Codable, Identifiable, Sendable {
    public let id: String
    /// Stable end-to-end identifier (`cid_<uuid v4 lowercase>`) used to dedup
    /// the message on the server (see `MessagingService.handleMessage`
    /// catch-P2002 pattern in the gateway) and to coalesce in-queue actions
    /// targeting the same logical message (edit-after-send, delete-after-edit,
    /// etc.). Replaces the legacy `temp_/offline_/retry_*` prefixed local ids.
    public let clientMessageId: String
    /// Backwards-compatible alias surfaced as `tempId` to existing consumers
    /// (Combine subscribers, optimistic UI, persisted message cache rows).
    /// Now identical to `clientMessageId` — the legacy local-id prefix scheme
    /// has been removed end-to-end as of Phase 4.
    public var tempId: String { clientMessageId }
    public let conversationId: String
    public let content: String
    public let originalLanguage: String?
    public let replyToId: String?
    public let forwardedFromId: String?
    public let forwardedFromConversationId: String?
    public let attachmentIds: [String]?
    /// Local filesystem path to a pending audio file kept under
    /// `Documents/pending-audio/<clientMessageId>.m4a` while the message
    /// waits for upload. `nil` for non-audio messages. The pattern is
    /// write-ahead: `OutboxRecord` is inserted FIRST (status `.pending`
    /// referencing this path), then the audio bytes are copied to disk.
    /// Boot recovery (`OfflineQueue.bootRecovery`) detects records whose
    /// referenced file is missing and marks them `.failed`.
    public let localAudioPath: String?
    public let createdAt: Date

    public init(
        conversationId: String,
        content: String,
        clientMessageId: String? = nil,
        originalLanguage: String? = nil,
        replyToId: String? = nil,
        forwardedFromId: String? = nil,
        forwardedFromConversationId: String? = nil,
        attachmentIds: [String]? = nil,
        localAudioPath: String? = nil
    ) {
        self.id = UUID().uuidString
        self.clientMessageId = clientMessageId ?? ClientMessageId.generate()
        self.conversationId = conversationId
        self.content = content
        self.originalLanguage = originalLanguage
        self.replyToId = replyToId
        self.forwardedFromId = forwardedFromId
        self.forwardedFromConversationId = forwardedFromConversationId
        self.attachmentIds = attachmentIds
        self.localAudioPath = localAudioPath
        self.createdAt = Date()
    }

    /// Decoder-friendly init that accepts a pre-existing `id` and `createdAt`,
    /// used when re-hydrating from `OutboxRecord.payload` at boot or retry time.
    public init(
        id: String,
        clientMessageId: String,
        conversationId: String,
        content: String,
        originalLanguage: String?,
        replyToId: String?,
        forwardedFromId: String?,
        forwardedFromConversationId: String?,
        attachmentIds: [String]?,
        localAudioPath: String?,
        createdAt: Date
    ) {
        self.id = id
        self.clientMessageId = clientMessageId
        self.conversationId = conversationId
        self.content = content
        self.originalLanguage = originalLanguage
        self.replyToId = replyToId
        self.forwardedFromId = forwardedFromId
        self.forwardedFromConversationId = forwardedFromConversationId
        self.attachmentIds = attachmentIds
        self.localAudioPath = localAudioPath
        self.createdAt = createdAt
    }
}

// MARK: - Edit / Delete Payloads

/// Payload encoded into `OutboxRecord.payload` for an `editMessage` queue entry.
public struct OfflineEditPayload: Codable, Sendable {
    public let messageId: String
    public let clientMessageId: String
    public let content: String
    public let conversationId: String

    public init(messageId: String, clientMessageId: String, content: String, conversationId: String) {
        self.messageId = messageId
        self.clientMessageId = clientMessageId
        self.content = content
        self.conversationId = conversationId
    }
}

/// Payload encoded into `OutboxRecord.payload` for a `deleteMessage` queue entry.
public struct OfflineDeletePayload: Codable, Sendable {
    public let messageId: String
    public let clientMessageId: String
    public let conversationId: String

    public init(messageId: String, clientMessageId: String, conversationId: String) {
        self.messageId = messageId
        self.clientMessageId = clientMessageId
        self.conversationId = conversationId
    }
}

// MARK: - Retry Success Payload

/// Emitted when an offline-queued message successfully reaches the server after
/// reconnection. Downstream ViewModels map the optimistic `clientMessageId`
/// to the authoritative `serverId` so the incoming `message:new` socket event
/// reconciles instead of duplicating.
public struct OfflineRetrySuccess: Sendable {
    public let clientMessageId: String
    public let serverId: String
    public let conversationId: String
    /// Backwards-compatible alias kept for existing call sites that reference
    /// `tempId`. Always equal to `clientMessageId` post-Phase-4.
    public var tempId: String { clientMessageId }

    public init(clientMessageId: String, serverId: String, conversationId: String) {
        self.clientMessageId = clientMessageId
        self.serverId = serverId
        self.conversationId = conversationId
    }
}

// MARK: - Errors

public enum OfflineQueueError: Error, Sendable {
    /// `configure(pool:)` was never called — the queue has no SQLite outbox to
    /// persist into. Callers must wire a pool at boot before any `enqueue`.
    case poolNotConfigured
    /// A required encode/decode step failed. The wrapped error is the
    /// underlying `EncodingError` / `DecodingError`.
    case payloadCodingFailed(underlying: Error)
    /// The GRDB write transaction itself failed.
    case writeFailed(underlying: Error)
}

// MARK: - Offline Queue

public actor OfflineQueue {
    public static let shared = OfflineQueue()

    public nonisolated let retrySucceeded = SendablePassthrough<OfflineRetrySuccess>()

    private static let maxQueueSize = 100

    /// Subdirectory under `Documents/` that holds pending audio files referenced
    /// by `OfflineQueueItem.localAudioPath`. Created lazily.
    public static let pendingAudioDirectoryName = "pending-audio"

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

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    /// Called when retrying a queued message via the in-memory path. Returns
    /// the server-assigned message id on success so the queue can emit a
    /// `retrySucceeded` event that lets active ViewModels reconcile the
    /// optimistic `clientMessageId` with the authoritative `serverId` before
    /// the socket `message:new` broadcast arrives.
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
    /// `OutboxRecord` to the SQLite outbox table, applying the coalescing
    /// state machine described in `docs/superpowers/specs/2026-05-08-…§6.3`.
    ///
    /// Both the SELECT-existing read and the INSERT/UPDATE/DELETE write happen
    /// in the same GRDB transaction — there is no race window between
    /// detection of an existing pending record for `clientMessageId` and the
    /// merge/replace decision.
    ///
    /// Throws `OfflineQueueError.poolNotConfigured` if `configure(pool:)` was
    /// never called, `payloadCodingFailed` if encoding the item fails, and
    /// `writeFailed` if the underlying transaction throws.
    public func enqueue(_ item: OfflineQueueItem) async throws {
        guard let pool = outboxPool else {
            logger.error("enqueue called before configure(pool:) — refusing to drop the message silently")
            throw OfflineQueueError.poolNotConfigured
        }

        let payload: Data
        do {
            payload = try encoder.encode(item)
        } catch {
            logger.error("Failed to encode OfflineQueueItem: \(error.localizedDescription, privacy: .public)")
            throw OfflineQueueError.payloadCodingFailed(underlying: error)
        }

        let outboxId = "ofq_\(item.id)"
        let conversationId = item.conversationId
        let clientMessageId = item.clientMessageId
        let createdAt = item.createdAt

        do {
            try await pool.write { db in
                let existing = try OutboxRecord
                    .filter(Column("conversationId") == conversationId)
                    .filter(Column("clientMessageId") == clientMessageId)
                    .filter(Column("status") == OutboxStatus.pending.rawValue)
                    .order(Column("createdAt").desc)
                    .fetchOne(db)

                switch (existing?.kind, OutboxKind.sendMessage) {
                case (.none, _):
                    // No existing pending record — straight insert.
                    try OutboxRecord(
                        id: outboxId,
                        kind: .sendMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: payload,
                        status: .pending,
                        createdAt: createdAt
                    ).insert(db)

                case (.deleteMessage?, _):
                    // sendMessage after a pending delete on the same id — the
                    // user re-typed something for an already-deleted local
                    // message. Drop the new send (cannot resurrect a deleted
                    // optimistic) but log so this surfaces in instrumentation.
                    Logger(subsystem: "com.meeshy.sdk", category: "offlinequeue")
                        .warning("sendMessage after deleteMessage on \(clientMessageId, privacy: .public), dropping")

                case (.sendMessage?, _):
                    // Same sendMessage already pending (idempotent re-enqueue,
                    // e.g. retry path). Refresh the payload + timestamps so
                    // attachmentIds and audio path stay current without
                    // creating a duplicate record.
                    try db.execute(sql: """
                        UPDATE outbox
                        SET payload = ?, updatedAt = ?, lastError = NULL
                        WHERE id = ?
                        """, arguments: [payload, Date(), existing!.id])

                case (.editMessage?, _), (.sendReaction?, _):
                    // A pending edit/reaction precedes a fresh send for the
                    // same id — INSERT the send but log the unusual sequence.
                    Logger(subsystem: "com.meeshy.sdk", category: "offlinequeue")
                        .warning("sendMessage for \(clientMessageId, privacy: .public) follows a pending \(String(describing: existing?.kind), privacy: .public) — inserting alongside")
                    try OutboxRecord(
                        id: outboxId,
                        kind: .sendMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: payload,
                        status: .pending,
                        createdAt: createdAt
                    ).insert(db)
                }
            }
        } catch let error as OfflineQueueError {
            throw error
        } catch {
            logger.error("Outbox write failed: \(error.localizedDescription, privacy: .public)")
            throw OfflineQueueError.writeFailed(underlying: error)
        }

        if items.count >= Self.maxQueueSize {
            items.removeFirst()
        }
        items.append(item)
        logger.info("Enqueued offline message for conversation \(item.conversationId, privacy: .public), queue size: \(self.items.count)")
    }

    // MARK: - Audio offline (write-ahead 2-step)

    public enum EnqueueAudioError: Error, Sendable {
        /// `pool.write` of the outbox record itself threw. The audio file was
        /// not yet copied — the caller can safely surface the error and let
        /// the user retry without leaving a phantom on disk.
        case outboxWriteFailed(underlying: Error)
        /// `FileManager.copyItem` failed after the outbox record was inserted.
        /// We marked the record `.failed` to prevent the flusher from retrying
        /// against a missing file. The caller should also roll back any
        /// optimistic UI it inserted.
        case audioCopyFailed(underlying: Error)
        /// `configure(pool:)` was never called.
        case poolNotConfigured
    }

    /// Result of an `enqueueAudio` call. The relative `localAudioPath` is
    /// returned so the caller can update its optimistic UI to reference the
    /// stable persisted path (under `Documents/pending-audio/`) instead of
    /// the volatile `tmp/recording_*.m4a` URL that `sourceAudioURL` pointed at.
    public struct EnqueueAudioResult: Sendable {
        public let outboxId: String
        public let localAudioPath: String
    }

    /// Phase 4 §6.3 audio offline write-ahead. Atomicity between the SQLite
    /// outbox row and the on-disk audio file is impossible (two persistence
    /// systems), so we do it in two ordered phases :
    ///
    /// 1. Phase A — INSERT `OutboxRecord` referencing
    ///    `Documents/pending-audio/<clientMessageId>.m4a`. The record is
    ///    `.pending` and the file does NOT exist yet.
    /// 2. Phase B — `FileManager.copyItem` the source audio into that
    ///    pending path. On failure we UPDATE the outbox row to `.failed`
    ///    so the flusher does not retry against a missing file.
    /// 3. Phase C — best-effort delete the original `tmp/` source.
    ///
    /// Crash recovery between Phase A and Phase B is handled by
    /// `bootRecovery()` which sweeps `.pending` records whose
    /// `localAudioPath` does not exist on disk and marks them `.failed`.
    /// The `clientMessageId` end-to-end dedup contract guarantees that an
    /// audio that actually reached the server before the crash will not
    /// produce a duplicate when the flusher replays whatever survived.
    @discardableResult
    public func enqueueAudio(
        sourceAudioURL: URL,
        conversationId: String,
        content: String?,
        clientMessageId: String,
        originalLanguage: String? = nil,
        replyToId: String? = nil,
        forwardedFromId: String? = nil,
        forwardedFromConversationId: String? = nil
    ) async throws -> EnqueueAudioResult {
        guard let pool = outboxPool else { throw EnqueueAudioError.poolNotConfigured }

        let relativePath = try Self.pendingAudioRelativePath(for: clientMessageId)
        let absolutePath = Self.absoluteAudioPath(forStored: relativePath)
        let outboxId = "ofq_\(UUID().uuidString)"
        let now = Date()

        let item = OfflineQueueItem(
            id: UUID().uuidString,
            clientMessageId: clientMessageId,
            conversationId: conversationId,
            content: content ?? "",
            originalLanguage: originalLanguage,
            replyToId: replyToId,
            forwardedFromId: forwardedFromId,
            forwardedFromConversationId: forwardedFromConversationId,
            attachmentIds: nil,
            localAudioPath: relativePath,
            createdAt: now
        )

        let payload: Data
        do {
            payload = try encoder.encode(item)
        } catch {
            throw EnqueueAudioError.outboxWriteFailed(underlying: error)
        }

        // Phase A — INSERT outbox row first. If this throws, the file is
        // still untouched on disk and the caller can retry.
        do {
            try await pool.write { db in
                try OutboxRecord(
                    id: outboxId,
                    kind: .sendMessage,
                    conversationId: conversationId,
                    messageLocalId: clientMessageId,
                    clientMessageId: clientMessageId,
                    payload: payload,
                    status: .pending,
                    createdAt: now
                ).insert(db)
            }
        } catch {
            throw EnqueueAudioError.outboxWriteFailed(underlying: error)
        }

        // Phase B — copy the audio into the pending directory. On failure,
        // mark the row `.failed` so the flusher does not retry against a
        // missing file. We must NOT throw before that update lands.
        do {
            let dst = URL(fileURLWithPath: absolutePath)
            if FileManager.default.fileExists(atPath: absolutePath) {
                try FileManager.default.removeItem(at: dst)
            }
            try FileManager.default.copyItem(at: sourceAudioURL, to: dst)
        } catch {
            do {
                try await pool.write { db in
                    try db.execute(sql: """
                        UPDATE outbox
                        SET status = ?, lastError = ?, updatedAt = ?
                        WHERE id = ?
                        """, arguments: [
                            OutboxStatus.failed.rawValue,
                            "Audio copy failed: \(error.localizedDescription)",
                            Date(),
                            outboxId
                        ])
                }
            } catch {
                logger.error("Failed to mark audio outbox row .failed after copy error: \(error.localizedDescription, privacy: .public)")
            }
            throw EnqueueAudioError.audioCopyFailed(underlying: error)
        }

        // Phase C — best-effort cleanup of the original tmp file. A failure
        // here is benign: the file lives in `tmp/` and the OS will reclaim
        // it on its own schedule.
        try? FileManager.default.removeItem(at: sourceAudioURL)

        // Mirror the new item into the in-memory queue so the hot retry
        // path picks it up on the next reconnect without re-reading the
        // outbox.
        if items.count >= Self.maxQueueSize {
            items.removeFirst()
        }
        items.append(item)
        logger.info("Enqueued audio for conversation \(conversationId, privacy: .public), path \(relativePath, privacy: .public)")

        return EnqueueAudioResult(outboxId: outboxId, localAudioPath: relativePath)
    }

    /// Persists an `editMessage` request, applying the coalescing rules from
    /// spec §6.3 (merge into a pending sendMessage, merge into a pending edit,
    /// drop after a pending delete).
    public func enqueueEdit(_ payload: OfflineEditPayload) async throws {
        guard let pool = outboxPool else { throw OfflineQueueError.poolNotConfigured }
        let encoded: Data
        do {
            encoded = try encoder.encode(payload)
        } catch {
            throw OfflineQueueError.payloadCodingFailed(underlying: error)
        }
        let recordId = "ofqe_\(UUID().uuidString)"
        let now = Date()
        let conversationId = payload.conversationId
        let clientMessageId = payload.clientMessageId
        let log = logger
        let dec = decoder
        let enc = encoder
        do {
            try await pool.write { db in
                let existing = try OutboxRecord
                    .filter(Column("conversationId") == conversationId)
                    .filter(Column("clientMessageId") == clientMessageId)
                    .filter(Column("status") == OutboxStatus.pending.rawValue)
                    .order(Column("createdAt").desc)
                    .fetchOne(db)

                switch existing?.kind {
                case .none:
                    try OutboxRecord(
                        id: recordId,
                        kind: .editMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: encoded,
                        status: .pending,
                        createdAt: now
                    ).insert(db)

                case .sendMessage:
                    // Merge edit into pending send: rewrite the send's content.
                    guard let send = existing,
                          let item = try? dec.decode(OfflineQueueItem.self, from: send.payload) else {
                        log.error("Cannot merge edit — corrupt sendMessage payload, dropping edit")
                        return
                    }
                    let merged = OfflineQueueItem(
                        id: item.id,
                        clientMessageId: item.clientMessageId,
                        conversationId: item.conversationId,
                        content: payload.content,
                        originalLanguage: item.originalLanguage,
                        replyToId: item.replyToId,
                        forwardedFromId: item.forwardedFromId,
                        forwardedFromConversationId: item.forwardedFromConversationId,
                        attachmentIds: item.attachmentIds,
                        localAudioPath: item.localAudioPath,
                        createdAt: item.createdAt
                    )
                    let mergedPayload = (try? enc.encode(merged)) ?? send.payload
                    try db.execute(sql: """
                        UPDATE outbox
                        SET payload = ?, updatedAt = ?, lastError = NULL
                        WHERE id = ?
                        """, arguments: [mergedPayload, now, send.id])

                case .editMessage:
                    // Latest edit wins — replace payload.
                    try db.execute(sql: """
                        UPDATE outbox
                        SET payload = ?, updatedAt = ?, lastError = NULL
                        WHERE id = ?
                        """, arguments: [encoded, now, existing!.id])

                case .deleteMessage:
                    // Edit-after-delete is impossible; drop with a warning.
                    log.warning("editMessage after deleteMessage on \(clientMessageId, privacy: .public), dropping")

                case .sendReaction:
                    // Edit alongside a pending reaction is fine — INSERT.
                    try OutboxRecord(
                        id: recordId,
                        kind: .editMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: encoded,
                        status: .pending,
                        createdAt: now
                    ).insert(db)
                }
            }
        } catch {
            throw OfflineQueueError.writeFailed(underlying: error)
        }
    }

    /// Persists a `deleteMessage` request. If a pending `sendMessage` or
    /// `editMessage` exists for the same `clientMessageId`, the local record
    /// is removed (no server roundtrip needed) per spec §6.3.
    public func enqueueDelete(_ payload: OfflineDeletePayload) async throws {
        guard let pool = outboxPool else { throw OfflineQueueError.poolNotConfigured }
        let encoded: Data
        do {
            encoded = try encoder.encode(payload)
        } catch {
            throw OfflineQueueError.payloadCodingFailed(underlying: error)
        }
        let recordId = "ofqd_\(UUID().uuidString)"
        let now = Date()
        let conversationId = payload.conversationId
        let clientMessageId = payload.clientMessageId
        do {
            try await pool.write { db in
                let existing = try OutboxRecord
                    .filter(Column("conversationId") == conversationId)
                    .filter(Column("clientMessageId") == clientMessageId)
                    .filter(Column("status") == OutboxStatus.pending.rawValue)
                    .order(Column("createdAt").desc)
                    .fetchOne(db)

                switch existing?.kind {
                case .none:
                    try OutboxRecord(
                        id: recordId,
                        kind: .deleteMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: encoded,
                        status: .pending,
                        createdAt: now
                    ).insert(db)

                case .sendMessage:
                    // Send + delete on the same pending id = no-op locally.
                    _ = try OutboxRecord.deleteOne(db, key: existing!.id)

                case .editMessage:
                    // Pending edit becomes irrelevant; replace with a delete.
                    _ = try OutboxRecord.deleteOne(db, key: existing!.id)
                    try OutboxRecord(
                        id: recordId,
                        kind: .deleteMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: encoded,
                        status: .pending,
                        createdAt: now
                    ).insert(db)

                case .deleteMessage:
                    // Already pending — idempotent, refresh timestamp only.
                    try db.execute(sql: """
                        UPDATE outbox SET updatedAt = ? WHERE id = ?
                        """, arguments: [now, existing!.id])

                case .sendReaction:
                    // Delete alongside a pending reaction — INSERT.
                    try OutboxRecord(
                        id: recordId,
                        kind: .deleteMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: encoded,
                        status: .pending,
                        createdAt: now
                    ).insert(db)
                }
            }
        } catch {
            throw OfflineQueueError.writeFailed(underlying: error)
        }

        // Mirror the GRDB transaction in the in-memory queue used by the hot
        // retry path: a delete that collapsed a pending sendMessage must not
        // leave a phantom item in `items`, otherwise `retryAll()` will replay
        // a logically-deleted message until the next app restart. The gateway
        // dedup catches the duplicate but the optimistic row would flicker.
        items.removeAll { $0.clientMessageId == clientMessageId }
    }

    public func dequeue(_ itemId: String) async {
        let outboxId = "ofq_\(itemId)"
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

    public var pendingItems: [OfflineQueueItem] {
        items
    }

    public var count: Int {
        items.count
    }

    public var isEmpty: Bool {
        items.isEmpty
    }

    // MARK: - Boot Recovery

    /// Boot-time crash recovery: any record left in `.inflight` from a previous
    /// process — the app crashed mid-dispatch — is reset to `.pending` so the
    /// flusher will pick it back up. Idempotent dedup on the gateway
    /// (`MessagingService.handleMessage` catch-P2002, see Phase 4 §6.2)
    /// guarantees that a message which actually reached the server before the
    /// crash will not produce a duplicate at replay time.
    ///
    /// Audio sweep: any `.pending` record whose `OfflineQueueItem.localAudioPath`
    /// no longer exists on disk (e.g. crash between Phase A INSERT and Phase B
    /// file copy) is marked `.failed` since the underlying audio bytes are
    /// gone and the record can never succeed.
    @discardableResult
    public func bootRecovery() async throws -> BootRecoveryReport {
        guard let pool = outboxPool else { throw OfflineQueueError.poolNotConfigured }
        let dec = decoder
        let log = logger
        var report = BootRecoveryReport()
        do {
            report = try await pool.write { db in
                var local = BootRecoveryReport()
                let inflight = try OutboxRecord
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
                    local.inflightReset += 1
                }

                // Audio missing-file sweep.
                let pendingSends = try OutboxRecord
                    .filter(Column("status") == OutboxStatus.pending.rawValue)
                    .filter(Column("kind") == OutboxKind.sendMessage.rawValue)
                    .fetchAll(db)
                let fm = FileManager.default
                for record in pendingSends {
                    guard let item = try? dec.decode(OfflineQueueItem.self, from: record.payload),
                          let path = item.localAudioPath, !path.isEmpty else { continue }
                    let absolute = Self.absoluteAudioPath(forStored: path)
                    if !fm.fileExists(atPath: absolute) {
                        try db.execute(sql: """
                            UPDATE outbox
                            SET status = ?, lastError = ?, updatedAt = ?
                            WHERE id = ?
                            """, arguments: [
                                OutboxStatus.failed.rawValue,
                                "Audio file missing after crash",
                                Date(),
                                record.id
                            ])
                        log.warning("Audio file missing for OutboxRecord \(record.id, privacy: .public), marked .failed")
                        local.audioOrphanFailed += 1
                    }
                }
                return local
            }
        } catch {
            throw OfflineQueueError.writeFailed(underlying: error)
        }
        if report.inflightReset > 0 || report.audioOrphanFailed > 0 {
            logger.info("Boot recovery: reset \(report.inflightReset) inflight, marked \(report.audioOrphanFailed) audio orphans failed")
        }
        return report
    }

    public struct BootRecoveryReport: Sendable, Equatable {
        public var inflightReset: Int = 0
        public var audioOrphanFailed: Int = 0
        public init() {}
    }

    // MARK: - Audio File Helpers

    /// Returns the absolute on-disk path for a pending audio file given the
    /// stored relative path persisted in `OfflineQueueItem.localAudioPath`.
    /// Stored paths are relative to `Documents/` so they survive container
    /// directory churn between OS upgrades.
    public static func absoluteAudioPath(forStored relativePath: String) -> String {
        if relativePath.hasPrefix("/") { return relativePath }
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return documents.appendingPathComponent(relativePath).path
    }

    /// Builds the canonical relative path under `Documents/pending-audio/`
    /// for a given `clientMessageId`. Creates the parent directory if needed.
    public static func pendingAudioRelativePath(for clientMessageId: String) throws -> String {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dir = documents.appendingPathComponent(pendingAudioDirectoryName, isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return "\(pendingAudioDirectoryName)/\(clientMessageId).m4a"
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
                    clientMessageId: item.clientMessageId,
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
                do {
                    try await pool.write { db in
                        _ = try OutboxRecord.deleteOne(db, key: outboxId)
                    }
                } catch {
                    logger.error("Failed to delete outbox record \(outboxId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                }
            }
        }

        isRetrying = false

        // Clean the optimistic rows out of the persisted message cache so an
        // inactive ConversationViewModel (loaded later) doesn't show a ghost
        // optimistic row alongside the authoritative server message that
        // arrives via the socket `message:new` broadcast.
        for payload in successPayloads {
            await CacheCoordinator.shared.messages.mergeUpdate(for: payload.conversationId) { cached in
                cached.filter { $0.id != payload.clientMessageId }
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

    // MARK: - Clear

    public func clearAll() async {
        let ids = items.map { $0.id }
        items.removeAll()
        guard let pool = outboxPool else { return }
        do {
            try await pool.write { db in
                for id in ids {
                    _ = try OutboxRecord.deleteOne(db, key: "ofq_\(id)")
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
                    let outboxId = "ofq_\(item.id)"
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
                        attempts: 0,
                        lastError: nil,
                        createdAt: item.createdAt,
                        updatedAt: Date(),
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
