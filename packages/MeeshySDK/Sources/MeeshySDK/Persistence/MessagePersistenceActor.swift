import Foundation
import os
import GRDB

public actor MessagePersistenceActor {
    let dbWriter: any DatabaseWriter

    private let writeStream: AsyncStream<WriteOperation>
    private let writeContinuation: AsyncStream<WriteOperation>.Continuation
    private var processorTask: Task<Void, Never>?

    /// `+EditDelete.swift` — suppressions, modifications, réactions arrivées avant leur message.
    var pendingRowEvents = PendingRowEventBuffer()

    /// The authenticated user's id. The on-device DB has no userId column and
    /// the aggregated reaction payload only flags WHICH emojis the current user
    /// reacted with (`currentUserReactions`), not the reactor's id — so the
    /// actor must know who "the current user" is to tag their reconstructed
    /// reaction with the right owner. Set by the app at auth time (see
    /// `DependencyContainer`); `nil` until then (cold-start reactions simply
    /// carry no ownership until the next refresh, never the wrong owner).
    private(set) var currentUserId: String?

    enum WriteOperation: Sendable {
        case reconcileBatch([IncomingMessageData])
        /// Buffered ingestion of fully-decoded `APIMessage` payloads. Routes
        /// through `upsertFromAPIMessages` — the same path REST uses — so
        /// attachments, reactions, reply/forward refs, encryption flags and
        /// mentions are all persisted. The 6-field `IncomingMessageData` path
        /// below drops every one of them (a media-only or encrypted message
        /// ingested that way renders as an empty bubble — Sprint 2 RC2.2).
        case upsertAPIMessages([APIMessage], preferredLanguages: [String])
        /// #7433 — un `read-status:updated` posé sur la SEULE ligne qu'il
        /// décrit (`MessagePersistenceActor+ReadStatusReceipt.swift`).
        case readStatusSummary(conversationId: String, summary: ReadStatusSummary, currentUserId: String)
    }

    public init(dbWriter: any DatabaseWriter, currentUserId: String? = nil) {
        self.dbWriter = dbWriter
        self.currentUserId = currentUserId
        let (stream, continuation) = AsyncStream.makeStream(of: WriteOperation.self)
        self.writeStream = stream
        self.writeContinuation = continuation
        self.processorTask = nil
    }

    /// Update the authenticated user's id (login / account switch / logout=nil).
    /// Used to tag the current user's own reactions during REST ingestion so the
    /// "I reacted" highlight survives a cache reload.
    public func setCurrentUserId(_ userId: String?) {
        currentUserId = userId
    }

    // MARK: - Buffered Writes

    public func bufferIncoming(_ messages: [IncomingMessageData]) {
        // Notification is posted by the worker AFTER the GRDB write completes
        // (see `start()`). Posting here would race the async write — observers
        // would refresh against an empty database and never see the new row.
        writeContinuation.yield(.reconcileBatch(messages))
    }

    /// Buffered ingestion of fully-decoded `APIMessage` payloads — the socket
    /// `message:new` path. Routes through `upsertFromAPIMessages` (the REST
    /// path) on the serial write stream, so attachments, reactions, reply /
    /// forward refs, encryption flags and mentions all land in GRDB. The
    /// upsert reconciles an optimistic row by `clientMessageId`, server id or
    /// `PendingIdRecord`, so a same-user echo never duplicates a pending send.
    /// The refresh notification is posted by `upsertFromAPIMessages` itself.
    public func bufferIncomingAPIMessages(_ messages: [APIMessage], preferredLanguages: [String]) {
        writeContinuation.yield(.upsertAPIMessages(messages, preferredLanguages: preferredLanguages))
    }

    /// Ordonné avec les autres écritures du flux : un accusé qui suit de près
    /// l'ack d'envoi trouve la ligne déjà réconciliée sous son id serveur.
    public func bufferReadStatusSummary(conversationId: String, summary: ReadStatusSummary, currentUserId: String) {
        // Notification is posted by the worker AFTER the GRDB write completes
        // (see `start()`).
        writeContinuation.yield(.readStatusSummary(conversationId: conversationId, summary: summary, currentUserId: currentUserId))
    }

    /// Reconciles a batch for the fire-and-forget stream worker: a write
    /// failure means the batch is NOT persisted and no observer will ever be
    /// refreshed for it, so it must leave a trace rather than vanish.
    private func reconcileBatchSyncOrLog(_ messages: [IncomingMessageData]) -> Set<String> {
        do {
            return try dbWriter.write { db in try IncomingBatchReconciler.reconcile(messages, in: db) }
        } catch {
            Logger.messages.error(
                "reconcileBatchSync dropped \(messages.count, privacy: .public) message(s), no refresh posted: \(error.localizedDescription, privacy: .public)"
            )
            return []
        }
    }

    // MARK: - Session quiesce (P1 Q3 — logout)

    /// Purge atomique de toute la table outbox au logout. La table outbox
    /// **n'a pas de colonne userId** (cf. `MessageDatabaseMigrations.swift`
    /// migration "outbox") — il est donc impossible de filtrer par user.
    /// Approche safe-by-construction : drop tous les rows. Décision Q3
    /// actée dans le design doc UserSession (2026-05-26). Sans ça, un
    /// message enqueued offline par user A serait envoyé sous l'identité
    /// du user B après un logout+login rapide sur le même device.
    /// Câblée depuis `DependencyContainer.wireOutboxLogoutHook`.
    public func clearOutbox() async throws {
        try await dbWriter.write { db in
            try db.execute(sql: "DELETE FROM outbox")
        }
    }

    /// Full purge of every on-device message table at logout. The persistence
    /// DB has **no userId column** on any table (cf. `MessageDatabaseMigrations`)
    /// and the file is shared across accounts, so the only safe-by-construction
    /// boundary is to drop everything. Without this, the authoritative
    /// `messages` table (received + optimistic bodies, read first by
    /// `MessageStore.loadInitialSnapshot`) would render user A's content to
    /// user B after a logout+login on the same device — the cache `msg`
    /// namespace purged by `CacheCoordinator.reset()` is a SEPARATE store.
    /// Atomic single transaction; child tables carry no FK constraints so order
    /// is irrelevant. Supersedes `clearOutbox()` on the logout path. Wired from
    /// `DependencyContainer.wireOutboxLogoutHook`.
    public func clearAllMessagesForLogout() async throws {
        try await dbWriter.write { db in
            try db.execute(sql: "DELETE FROM message_translations")
            try db.execute(sql: "DELETE FROM message_transcriptions")
            try db.execute(sql: "DELETE FROM message_audio_translations")
            try db.execute(sql: "DELETE FROM local_attachments")
            try db.execute(sql: "DELETE FROM pending_ids")
            try db.execute(sql: "DELETE FROM messages")
            try db.execute(sql: "DELETE FROM outbox")
            try db.execute(sql: "DELETE FROM send_attempts")
        }
    }

    /// startup-03 — compte des lignes outbox encore éligibles à l'envoi
    /// (.pending/.inflight). Lu par `DependencyContainer.wireOutboxLogoutHook`
    /// AVANT `clearAllMessagesForLogout()` pour signaler à l'utilisateur la
    /// perte de travail quand la purge suit une invalidation de session
    /// serveur (jamais sur un logout volontaire).
    public func pendingOutboxCount() async throws -> Int {
        try await dbWriter.read { db in
            try OutboxRecord
                .filter([OutboxStatus.pending.rawValue, OutboxStatus.inflight.rawValue].contains(Column("status")))
                .fetchCount(db)
        }
    }

    /// Retention window (days) for terminal `.exhausted` outbox rows. They are
    /// kept briefly so the user can still see / manually retry a permanently
    /// failed mutation, then GC'd — a row that hit `maxAttempts` is otherwise
    /// only ever deleted at logout, so without this the outbox grows without
    /// bound across sessions (T14).
    public static let exhaustedRetentionDays = 7

    /// Delete `.exhausted` outbox rows older than `days`, returning how many
    /// were removed. Runs once at boot (see `start()`); cheap + idempotent.
    /// Bounded retention rather than delete-on-exhaust so a recent permanent
    /// failure stays visible/retriable for a week before it is reclaimed.
    @discardableResult
    public func purgeExhaustedOlderThan(days: Int = exhaustedRetentionDays) async throws -> Int {
        let cutoff = Date().addingTimeInterval(-TimeInterval(days) * 86_400)
        return try await dbWriter.write { db in
            try OutboxRecord
                .filter(Column("status") == OutboxStatus.exhausted.rawValue)
                .filter(Column("createdAt") < cutoff)
                .deleteAll(db)
        }
    }

    /// Call after init to start the background write processor.
    public func start() {
        guard processorTask == nil else { return }
        // T14 — one-shot GC of stale terminal (`.exhausted`) outbox rows so the
        // table can't grow without bound across sessions. Fire-and-forget: a
        // failure here is non-fatal and retried next boot.
        Task { [weak self] in
            do {
                try await self?.purgeExhaustedOlderThan()
                // Les pièces de commentaire dont la ligne vient de partir (ou
                // n'existe plus) quittent le disque avec elle (#9743).
                if let self {
                    await OfflineQueue.sweepOrphanCommentMedia(ownerId: await self.currentUserId, reader: self.dbWriter)
                }
            } catch {
                Logger.messages.error("Outbox GC skipped this boot, stale terminal rows kept: \(error.localizedDescription, privacy: .public)")
            }
        }
        processorTask = Task { [weak self, writeStream] in
            for await op in writeStream {
                guard let self else { break }
                switch op {
                case .reconcileBatch(let messages):
                    guard !messages.isEmpty else { continue }
                    // Post the refresh AFTER the write completes — buffer
                    // callers used to post the notification immediately on
                    // enqueue, but the worker that does the actual GRDB write
                    // runs async on this stream, so MessageStore observers
                    // fired against an empty database and silently dropped
                    // the new row. Scoped to the conversations whose rows
                    // actually changed: a re-delivered identical payload must
                    // not trigger the MessageStore → applySnapshot cascade.
                    let changed = await self.reconcileBatchSyncOrLog(messages)
                    if !changed.isEmpty {
                        postMessageStoreRefresh(conversationIds: changed)
                    }
                    await self.replayPendingRowEvents(for: messages.map(\.id))
                case .upsertAPIMessages(let messages, let preferredLanguages):
                    guard !messages.isEmpty else { continue }
                    // `upsertFromAPIMessages` posts its own refresh, scoped to
                    // the conversations with real row changes — do NOT re-post
                    // here or observers refresh twice.
                    do {
                        try await self.upsertFromAPIMessages(messages, preferredLanguages: preferredLanguages)
                        await self.replayPendingRowEvents(for: messages.map(\.id))
                    } catch {
                        Logger.messages.error("upsertFromAPIMessages dropped \(messages.count, privacy: .public) message(s): \(error.localizedDescription, privacy: .public)")
                    }
                case .readStatusSummary(let convId, let summary, let currentUserId):
                    do {
                        if try await self.applyReadStatusSummarySync(
                            conversationId: convId, summary: summary, currentUserId: currentUserId
                        ) {
                            postMessageStoreRefresh(conversationIds: [convId])
                        }
                    } catch {
                        Logger.messages.error("applyReadStatusSummarySync failed for conv=\(convId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                    }
                }
            }
        }
    }

    deinit {
        writeContinuation.finish()
        processorTask?.cancel()
    }
}
