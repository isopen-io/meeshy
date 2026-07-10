import Foundation
import GRDB
import os

private let outboxFlusherLog = Logger(subsystem: "me.meeshy.sdk", category: "outbox-flusher")

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
/// Covers `sendMessage` payloads carrying either a scalar `localAudioPath`
/// (single-track rows) or an array `localAudioPaths` (multi-track rows).
/// Both fields are swept; the now-empty per-message subdirectory is removed
/// as a best-effort final step. Other payload kinds either don't reference
/// local files, or their files (TUS upload checkpoints) are managed by
/// their own GC path.
@inline(__always)
internal func cleanupLocalFiles(for record: OutboxRecord) {
    guard record.kind == .sendMessage else { return }
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    guard let item = try? decoder.decode(OfflineQueueItem.self, from: record.payload) else { return }
    // S7b — sweep audio (pending-audio/) AND visual media (pending-media/)
    // paths; both relocate bytes under Documents/ and would leak if a
    // terminated row didn't clean them. `absoluteAudioPath` is a generic
    // Documents-relative resolver, so it resolves both correctly.
    let relativePaths: [String] = (
        [item.localAudioPath].compactMap { $0 }
        + (item.localAudioPaths ?? [])
        + (item.localMediaPaths ?? [])
    ).filter { !$0.isEmpty }
    guard !relativePaths.isEmpty else { return }
    var parentDirs = Set<String>()
    for rel in relativePaths {
        let abs = OfflineQueue.absoluteAudioPath(forStored: rel)
        // Silent: it's normal for the file to already be gone (cancelled send,
        // adoption already moved it, another sweep ran first). The whole point
        // is to plug the leak, not to gate on file existence.
        try? FileManager.default.removeItem(atPath: abs)
        parentDirs.insert((abs as NSString).deletingLastPathComponent)
    }
    // Best-effort: remove the now-empty per-message subdir (pending-audio/<cid>/).
    for dir in parentDirs {
        if let contents = try? FileManager.default.contentsOfDirectory(atPath: dir), contents.isEmpty {
            try? FileManager.default.removeItem(atPath: dir)
        }
    }
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
    /// BW1 — optional gate so the flusher can short-circuit when the device
    /// is offline. Without it, a long airplane-mode session burns through
    /// every pending row's `maxAttempts` retries inside the URLSession
    /// timeout window — battery + (when service returns) noisy logs. The
    /// `Sendable` closure form lets call-sites inject the live `Network
    /// ConditionMonitor.shared.isOnline` getter from MainActor without the
    /// SDK Persistence layer importing UIKit/SwiftUI.
    private let isNetworkReachable: @Sendable () async -> Bool

    public init(
        pool: any DatabaseWriter,
        dispatcher: any OutboxDispatching,
        maxAttempts: Int = 5,
        baseBackoff: TimeInterval = 2,
        maxBackoff: TimeInterval = 30,
        onOutcome: (@Sendable (OutboxOutcome) -> Void)? = nil,
        isNetworkReachable: @escaping @Sendable () async -> Bool = { true }
    ) {
        self.pool = pool
        self.dispatcher = dispatcher
        self.maxAttempts = maxAttempts
        self.baseBackoff = baseBackoff
        self.maxBackoff = maxBackoff
        self.onOutcome = onOutcome
        self.isNetworkReachable = isNetworkReachable
    }

    /// Draine les records `.pending` dont le `nextAttemptAt` est échu.
    ///
    /// BW1 — Si `isNetworkReachable()` retourne `false`, le flush
    /// court-circuite (aucun fetch GRDB, aucun dispatch). Cela évite de
    /// brûler les `maxAttempts` retries en mode avion / 1G saturé, qui
    /// se mangent toute la batterie pendant le timeout URLSession (60s
    /// par défaut). Le re-flush est déclenché automatiquement par
    /// `OutboxRetryScheduler` au retour réseau (transition online).
    ///
    /// Retourne le `nextAttemptAt` le plus proche parmi les records encore
    /// `.pending` mais différés dans le futur (échec récent → backoff), ou
    /// `nil` si rien n'est différé. Le planificateur de re-flush s'en sert
    /// pour rejouer le flush à l'échéance plutôt que d'attendre un évènement
    /// de cycle de vie de l'app (boot / premier plan / enqueue / BGTask).
    @discardableResult
    public func flush() async -> Date? {
        // BW1 — bandwidth gate. Re-arm later via the same earliestDeferred
        // path; the OutboxRetryScheduler also re-fires on NWPath transitions
        // so the round-trip is bounded.
        guard await isNetworkReachable() else { return nil }

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

    /// S1 — atomically claim a pending row for dispatch. Flips pending→inflight
    /// ONLY while the row is still pending; returns false when another flusher
    /// already claimed it (the conditional UPDATE matched 0 rows). Because GRDB
    /// serializes writes, two concurrent flushers reduce to two sequential
    /// claims and exactly one wins — closing the double-dispatch race the old
    /// unconditional `update(db)` left open (multiple lifecycle triggers each
    /// build their own OutboxFlusher over the shared pool, so actor isolation
    /// alone did not serialize them).
    func claimPending(_ record: OutboxRecord) async -> Bool {
        let now = Date()
        return (try? await pool.write { db -> Bool in
            try OutboxRecord
                .filter(Column("id") == record.id)
                .filter(Column("status") == OutboxStatus.pending.rawValue)
                .updateAll(
                    db,
                    Column("status").set(to: OutboxStatus.inflight.rawValue),
                    Column("updatedAt").set(to: now)
                ) == 1
        }) ?? false
    }

    /// `MeeshyError.auth(...)` (typically a 401 mapped to `.sessionExpired`) is a
    /// transitory auth failure, NOT a permanent dispatch error. It must not consume
    /// the retry budget — otherwise a brief session expiry permanently exhausts every
    /// queued row before the app gets a chance to refresh the token.
    private static func isSessionExpiry(_ error: Error) -> Bool {
        if case MeeshyError.auth = error { return true }
        return false
    }

    private func processRecord(_ record: OutboxRecord) async {
        // S1 — claim atomically; skip dispatch if another flusher beat us to it.
        guard await claimPending(record) else { return }
        var current = record
        current.status = .inflight
        current.updatedAt = Date()

        do {
            try await dispatcher.dispatch(current)
            let idToDelete = current.id
            do {
                try await pool.write { db in
                    _ = try OutboxRecord.deleteOne(db, key: idToDelete)
                }
            } catch {
                outboxFlusherLog.error("Post-dispatch outbox delete failed for \(idToDelete, privacy: .public): \(error.localizedDescription, privacy: .public) — record may re-dispatch")
            }
            // A7+A8 — drop any local file the payload referenced. On the
            // happy path, MessagePersistenceActor.adoptSDKLevel already
            // moved the file into the typed media cache (cf. DiskCacheStore
            // .adopt's moveItem), so this is a defensive no-op for the
            // applied path. Real value is on `.exhausted` below.
            cleanupLocalFiles(for: current)
            onOutcome?(.applied(cmid: current.clientMessageId))
        } catch {
            // 401 / session-expiry is TRANSITORY — the app's auth flow refreshes the
            // token (AuthManager.checkExistingSession on resume/reconnect). Treating it
            // like a normal failure burns the retry budget and PERMANENTLY exhausts
            // queued user actions (messages, reactions, read receipts) on a brief
            // expiry — observed in prod: a whole outbox marked `.exhausted` with
            // `auth(sessionExpired)`. Defer WITHOUT consuming the budget so the row
            // survives until re-auth, then flushes on the next scheduled attempt.
            if Self.isSessionExpiry(error) {
                current.lastError = String(describing: error)
                current.status = .pending
                current.updatedAt = Date()
                current.nextAttemptAt = Date().addingTimeInterval(maxBackoff)
                let deferredSnapshot = current
                try? await pool.write { db in
                    try deferredSnapshot.update(db)
                }
                return
            }

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
