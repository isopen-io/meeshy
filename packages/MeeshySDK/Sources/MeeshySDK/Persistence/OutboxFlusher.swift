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

    public func flush() async {
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
