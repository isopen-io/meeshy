import Foundation
import GRDB

public protocol OutboxDispatching: Sendable {
    func dispatch(_ record: OutboxRecord) async throws
}

/// Helper that hydrates a `ReactionContext` from a `.sendReaction` outbox
/// row. Used by both `OutboxFlusher` (terminal failure → `retryExhausted`)
/// and `OutboxDispatcher` (permanent reject → `retryExhausted`). Returns
/// `nil` if the record is not a reaction or the payload fails to decode —
/// callers fall back to a `kind`-only exhausted event in that case.
@inline(__always)
internal func reactionContext(for record: OutboxRecord) -> OfflineRetrySuccess.ReactionContext? {
    guard record.kind == .sendReaction else { return nil }
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    guard let payload = try? decoder.decode(ReactionOutboxPayload.self, from: record.payload) else {
        return nil
    }
    return OfflineRetrySuccess.ReactionContext(
        messageId: payload.messageId,
        emoji: payload.emoji,
        action: payload.action
    )
}

/// A7+A8 — best-effort cleanup of local files referenced by an outbox
/// payload. Called when a record terminates (either `.applied` because the
/// server adopted the file via canonical URL, OR `.exhausted` because we
/// gave up retrying). Without this sweep, `Documents/pending-audio/` would
/// accumulate orphan `.m4a` files indefinitely for messages that never made
/// it to the server.
///
/// Currently covers `sendMessage` payloads (the one kind that carries a
/// `localAudioPath`). Other kinds either don't reference local files, or
/// their files (TUS upload checkpoints) are managed by their own GC path.
@inline(__always)
internal func cleanupLocalFiles(for record: OutboxRecord) {
    guard record.kind == .sendMessage else { return }
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    guard let item = try? decoder.decode(OfflineQueueItem.self, from: record.payload),
          let relativePath = item.localAudioPath, !relativePath.isEmpty else {
        return
    }
    let absolutePath = OfflineQueue.absoluteAudioPath(forStored: relativePath)
    // Silent: it's normal for the file to already be gone (cancelled send,
    // adoption already moved it, another sweep ran first). The whole point
    // is to plug the leak, not to gate on file existence.
    try? FileManager.default.removeItem(atPath: absolutePath)
}

/// Drains the `outbox` table FIFO, dispatching each pending item via the
/// supplied `OutboxDispatching`. Failures schedule an exponential backoff
/// retry; after `maxAttempts` failures the item is marked `.exhausted`.
public actor OutboxFlusher {

    private let pool: any DatabaseWriter
    private let dispatcher: any OutboxDispatching
    private let maxAttempts: Int
    private let baseBackoff: TimeInterval
    private let maxBackoff: TimeInterval
    private let onOutcome: (@Sendable (OutboxOutcome) -> Void)?

    public init(
        pool: any DatabaseWriter,
        dispatcher: any OutboxDispatching,
        maxAttempts: Int = 5,
        baseBackoff: TimeInterval = 2,
        maxBackoff: TimeInterval = 30,
        onOutcome: (@Sendable (OutboxOutcome) -> Void)? = nil
    ) {
        self.pool = pool
        self.dispatcher = dispatcher
        self.maxAttempts = maxAttempts
        self.baseBackoff = baseBackoff
        self.maxBackoff = maxBackoff
        self.onOutcome = onOutcome
    }

    /// Draine les records `.pending` dont le `nextAttemptAt` est échu.
    ///
    /// Retourne le `nextAttemptAt` le plus proche parmi les records encore
    /// `.pending` mais différés dans le futur (échec récent → backoff), ou
    /// `nil` si rien n'est différé. Le planificateur de re-flush s'en sert
    /// pour rejouer le flush à l'échéance plutôt que d'attendre un évènement
    /// de cycle de vie de l'app (boot / premier plan / enqueue / BGTask).
    @discardableResult
    public func flush() async -> Date? {
        let now = Date()
        let pending: [OutboxRecord] = (try? await pool.read { db in
            try OutboxRecord
                .filter(Column("status") == OutboxStatus.pending.rawValue)
                .filter(Column("nextAttemptAt") <= now)
                .order(Column("createdAt").asc)
                .limit(50)
                .fetchAll(db)
        }) ?? []

        for record in pending {
            await processRecord(record)
        }

        let earliestDeferred: OutboxRecord? = (try? await pool.read { db in
            try OutboxRecord
                .filter(Column("status") == OutboxStatus.pending.rawValue)
                .filter(Column("nextAttemptAt") > Date())
                .order(Column("nextAttemptAt").asc)
                .fetchOne(db)
        }) ?? nil
        return earliestDeferred?.nextAttemptAt
    }

    private func processRecord(_ record: OutboxRecord) async {
        var current = record
        current.status = .inflight
        current.updatedAt = Date()
        let inflightSnapshot = current
        try? await pool.write { db in
            try inflightSnapshot.update(db)
        }

        do {
            try await dispatcher.dispatch(current)
            let idToDelete = current.id
            try? await pool.write { db in
                try OutboxRecord.deleteOne(db, key: idToDelete)
            }
            // A7+A8 — drop any local file the payload referenced. On the
            // happy path, MessagePersistenceActor.adoptSDKLevel already
            // moved the file into the typed media cache (cf. DiskCacheStore
            // .adopt's moveItem), so this is a defensive no-op for the
            // applied path. Real value is on `.exhausted` below.
            cleanupLocalFiles(for: current)
            onOutcome?(.applied(cmid: current.clientMessageId))
        } catch {
            current.attempts += 1
            current.lastError = String(describing: error)
            current.updatedAt = Date()

            if current.attempts >= maxAttempts {
                current.status = .exhausted
            } else {
                current.status = .pending
                let backoff = min(maxBackoff, baseBackoff * pow(2.0, Double(current.attempts - 1)))
                let jitter = Double.random(in: 0...0.5)
                current.nextAttemptAt = Date().addingTimeInterval(backoff + jitter)
            }

            let failedSnapshot = current
            try? await pool.write { db in
                try failedSnapshot.update(db)
            }

            // Wave 1 Task 3.6 + Phase 4 prereq — emit BOTH the outcome
            // callback (Phase 4 cmid→outcome correlation channel for one-shot
            // subscribers) AND the unified `retryExhausted` Combine signal
            // (Tier C — for active ViewModels reconciling optimistic rows).
            // The two are complementary: `onOutcome` is the cmid bridge,
            // `OfflineQueue.retryExhausted` carries the typed kind+reaction
            // context. Lives in the flusher because it owns the attempt-count
            // bookkeeping. `reactionContext(for:)` decodes the payload
            // best-effort and falls back to `nil` for non-reaction kinds or
            // corrupt rows.
            if current.status == .exhausted {
                // A7+A8 — terminal failure: the local payload file (e.g.,
                // pending-audio/.m4a) would otherwise leak forever. Best-
                // effort delete before emitting the exhausted outcome.
                cleanupLocalFiles(for: current)
                onOutcome?(.exhausted(cmid: current.clientMessageId))
                OfflineQueue.shared.emitRetryExhausted(OfflineRetryExhausted(
                    kind: current.kind,
                    clientMessageId: current.clientMessageId,
                    conversationId: current.conversationId,
                    reaction: reactionContext(for: current),
                    lastError: current.lastError
                ))
            }
        }
    }
}
