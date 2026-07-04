import XCTest
import GRDB
@testable import MeeshySDK

final class OutboxFlusherTests: XCTestCase {

    func test_flush_processesPendingItems_inFifoOrder() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        let now = Date()
        try await pool.write { db in
            try OutboxRecord(
                id: "1", kind: .sendMessage, conversationId: "c1",
                clientMessageId: "cid_1",
                payload: Data(), status: .pending, attempts: 0, lastError: nil,
                createdAt: now, updatedAt: now, nextAttemptAt: now
            ).insert(db)
            try OutboxRecord(
                id: "2", kind: .sendMessage, conversationId: "c1",
                clientMessageId: "cid_2",
                payload: Data(), status: .pending, attempts: 0, lastError: nil,
                createdAt: now.addingTimeInterval(0.1), updatedAt: now, nextAttemptAt: now
            ).insert(db)
        }

        let dispatcher = MockOutboxDispatcher()
        let flusher = OutboxFlusher(pool: pool, dispatcher: dispatcher)

        await flusher.flush()

        let processed = await dispatcher.processedIds
        XCTAssertEqual(processed, ["1", "2"])

        let remaining = try await pool.read { db in
            try OutboxRecord.filter(Column("status") == OutboxStatus.pending.rawValue).fetchCount(db)
        }
        XCTAssertEqual(remaining, 0)
    }

    func test_flush_failure_marksAttempts_andSchedulesBackoff() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        let now = Date()
        try await pool.write { db in
            try OutboxRecord(
                id: "x", kind: .sendMessage, conversationId: "c1",
                clientMessageId: "cid_x",
                payload: Data(), status: .pending, attempts: 0, lastError: nil,
                createdAt: now, updatedAt: now, nextAttemptAt: now
            ).insert(db)
        }

        let flusher = OutboxFlusher(pool: pool, dispatcher: MockOutboxDispatcher(shouldFail: true))
        let nextRetry = await flusher.flush()

        let after = try await pool.read { db in
            try OutboxRecord.fetchOne(db, key: "x")!
        }
        XCTAssertEqual(after.attempts, 1)
        XCTAssertEqual(after.status, .pending)
        XCTAssertGreaterThan(after.nextAttemptAt, now,
            "Failed item must be rescheduled after a backoff delay")
        XCTAssertEqual(nextRetry, after.nextAttemptAt,
            "flush() must report the earliest deferred retry so OutboxRetryScheduler can re-arm")
    }

    func test_flush_permanentServerRejection_deadLettersImmediately_withoutBurningBudget() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        let now = Date()
        try await pool.write { db in
            try OutboxRecord(
                id: "poison", kind: .sendMessage, conversationId: "c1",
                clientMessageId: "cid_poison",
                payload: Data(), status: .pending, attempts: 0, lastError: nil,
                createdAt: now, updatedAt: now, nextAttemptAt: now
            ).insert(db)
        }

        // 413 Payload Too Large — a permanent rejection that will NEVER succeed
        // on retry. It must dead-letter on the FIRST attempt, not burn all 5
        // attempts + exponential backoff before the user sees "failed".
        let flusher = OutboxFlusher(pool: pool, dispatcher: MockOutboxDispatcher(failure: MeeshyError.server(statusCode: 413, message: "too large")))
        await flusher.flush()

        let after = try await pool.read { db in
            try OutboxRecord.fetchOne(db, key: "poison")!
        }
        XCTAssertEqual(after.status, .exhausted, "a permanent 4xx must dead-letter immediately")
        XCTAssertEqual(after.attempts, 1, "it must not burn the whole retry budget on an un-retryable error")
    }

    func test_flush_corruptPayloadRejection_deadLettersImmediately_withoutBurningBudget() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        let now = Date()
        try await pool.write { db in
            try OutboxRecord(
                id: "corrupt", kind: .markAsRead, conversationId: "c1",
                clientMessageId: "cid_corrupt",
                payload: Data(), status: .pending, attempts: 0, lastError: nil,
                createdAt: now, updatedAt: now, nextAttemptAt: now
            ).insert(db)
        }

        // R-OB1-suivi — `OutboxDispatcher.decodePayload` (app) throws
        // `MeeshyError.server(statusCode: 400, _)` for a corrupt local row.
        // It must classify identically to a genuine server 4xx: dead-letter
        // on the FIRST attempt rather than burn the whole retry budget on a
        // row that can never decode successfully.
        let flusher = OutboxFlusher(pool: pool, dispatcher: MockOutboxDispatcher(failure: MeeshyError.server(statusCode: 400, message: "corrupt payload")))
        await flusher.flush()

        let after = try await pool.read { db in
            try OutboxRecord.fetchOne(db, key: "corrupt")!
        }
        XCTAssertEqual(after.status, .exhausted, "a corrupt payload must dead-letter immediately")
        XCTAssertEqual(after.attempts, 1, "it must not burn the whole retry budget on an un-decodable row")
    }

    func test_flush_retryableServerError_stillConsumesBudget_notDeadLettered() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        let now = Date()
        try await pool.write { db in
            try OutboxRecord(
                id: "recoverable", kind: .sendMessage, conversationId: "c1",
                clientMessageId: "cid_recoverable",
                payload: Data(), status: .pending, attempts: 0, lastError: nil,
                createdAt: now, updatedAt: now, nextAttemptAt: now
            ).insert(db)
        }

        // 500 may recover — the classifier must stay CONSERVATIVE and keep it
        // pending for retry rather than dead-lettering a transient server error.
        let flusher = OutboxFlusher(pool: pool, dispatcher: MockOutboxDispatcher(failure: MeeshyError.server(statusCode: 500, message: "boom")))
        await flusher.flush()

        let after = try await pool.read { db in
            try OutboxRecord.fetchOne(db, key: "recoverable")!
        }
        XCTAssertEqual(after.status, .pending, "a 5xx may recover — must remain pending for retry")
        XCTAssertEqual(after.attempts, 1, "a retryable error consumes exactly one attempt")
    }

    func test_flush_sessionExpiry_doesNotConsumeRetryBudget_norExhaust() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        let now = Date()
        // Already failed 4× — one NORMAL failure away from `.exhausted`.
        try await pool.write { db in
            try OutboxRecord(
                id: "auth", kind: .sendReaction, conversationId: "c1",
                clientMessageId: "cid_auth",
                payload: Data(), status: .pending, attempts: 4, lastError: nil,
                createdAt: now, updatedAt: now, nextAttemptAt: now
            ).insert(db)
        }

        let flusher = OutboxFlusher(pool: pool, dispatcher: MockOutboxDispatcher(authFailure: true))
        await flusher.flush()

        let after = try await pool.read { db in
            try OutboxRecord.fetchOne(db, key: "auth")!
        }
        // A transitory 401 must NOT exhaust the row nor burn the retry budget,
        // otherwise a brief session expiry permanently drops queued user actions
        // (the prod incident: a whole outbox `.exhausted` with auth(sessionExpired)).
        XCTAssertEqual(after.status, .pending,
            "Session expiry must leave the row pending (not exhausted)")
        XCTAssertEqual(after.attempts, 4,
            "Session expiry must NOT consume the retry budget")
        XCTAssertGreaterThan(after.nextAttemptAt, now,
            "Row must be deferred for a later retry once the session is refreshed")
    }

    func test_flush_networkTransportError_doesNotConsumeRetryBudget_norExhaust() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        let now = Date()
        // Already failed 4× — one NORMAL failure away from `.exhausted`.
        try await pool.write { db in
            try OutboxRecord(
                id: "net", kind: .sendMessage, conversationId: "c1",
                clientMessageId: "cid_net",
                payload: Data(), status: .pending, attempts: 4, lastError: nil,
                createdAt: now, updatedAt: now, nextAttemptAt: now
            ).insert(db)
        }

        // Ce que APIClient jette pour un gateway mort réseau-up (connection
        // refused → MeeshyError.network(.serverUnreachable)).
        let flusher = OutboxFlusher(
            pool: pool,
            dispatcher: MockOutboxDispatcher(failure: MeeshyError.network(.serverUnreachable))
        )
        await flusher.flush()

        let after = try await pool.read { db in
            try OutboxRecord.fetchOne(db, key: "net")!
        }
        // P7-7 : une panne gateway est un échec de TRANSPORT, pas applicatif.
        // Observé E2E 2026-07-02 : ~2 min d'outage (connection refused =
        // échec instantané) consommaient les 5 attempts → `.exhausted` →
        // Retry MANUEL par message au lieu du flush FIFO auto au reconnect.
        XCTAssertEqual(after.status, .pending,
            "A gateway outage must leave the row pending (not exhausted)")
        XCTAssertEqual(after.attempts, 4,
            "A transport failure must NOT consume the retry budget")
        XCTAssertGreaterThan(after.nextAttemptAt, now,
            "Row must be deferred so the scheduler retries after the outage")
    }

    func test_flush_rawTransportURLError_doesNotConsumeRetryBudget() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        let now = Date()
        try await pool.write { db in
            try OutboxRecord(
                id: "tus", kind: .sendMessage, conversationId: "c1",
                clientMessageId: "cid_tus",
                payload: Data(), status: .pending, attempts: 4, lastError: nil,
                createdAt: now, updatedAt: now, nextAttemptAt: now
            ).insert(db)
        }

        // Le chemin TUS (upload media) rethrow les URLError transport BRUTS
        // (non normalisés par APIClient).
        let flusher = OutboxFlusher(
            pool: pool,
            dispatcher: MockOutboxDispatcher(failure: URLError(.cannotConnectToHost))
        )
        await flusher.flush()

        let after = try await pool.read { db in
            try OutboxRecord.fetchOne(db, key: "tus")!
        }
        XCTAssertEqual(after.status, .pending)
        XCTAssertEqual(after.attempts, 4)
    }

    func test_flush_nonTransportURLError_stillConsumesRetryBudget() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        let now = Date()
        try await pool.write { db in
            try OutboxRecord(
                id: "bad", kind: .sendMessage, conversationId: "c1",
                clientMessageId: "cid_bad",
                payload: Data(), status: .pending, attempts: 0, lastError: nil,
                createdAt: now, updatedAt: now, nextAttemptAt: now
            ).insert(db)
        }

        // `.badServerResponse` (TUS synthétique) est APPLICATIF, pas une
        // panne de transport : il doit continuer à consommer le budget,
        // sinon une erreur permanente resterait pending à jamais.
        let flusher = OutboxFlusher(
            pool: pool,
            dispatcher: MockOutboxDispatcher(failure: URLError(.badServerResponse))
        )
        await flusher.flush()

        let after = try await pool.read { db in
            try OutboxRecord.fetchOne(db, key: "bad")!
        }
        XCTAssertEqual(after.attempts, 1,
            "An application-level URLError must keep consuming the budget")
    }

    func test_flush_marksExhausted_after5Attempts() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        let now = Date()
        try await pool.write { db in
            try OutboxRecord(
                id: "x", kind: .sendMessage, conversationId: "c1",
                clientMessageId: "cid_x",
                payload: Data(), status: .pending, attempts: 4, lastError: nil,
                createdAt: now, updatedAt: now, nextAttemptAt: now
            ).insert(db)
        }

        let flusher = OutboxFlusher(pool: pool, dispatcher: MockOutboxDispatcher(shouldFail: true))
        await flusher.flush()

        let after = try await pool.read { db in
            try OutboxRecord.fetchOne(db, key: "x")!
        }
        XCTAssertEqual(after.status, .exhausted,
            "After maxAttempts (5) failed dispatches, the item must be marked exhausted")
    }

    // MARK: - A7+A8 — local file cleanup on terminal outcomes

    /// When a `.sendMessage` outbox row terminates (applied OR exhausted),
    /// the local audio file referenced via `OfflineQueueItem.localAudioPath`
    /// must be removed from disk. Otherwise `Documents/pending-audio/`
    /// accumulates orphan `.m4a` indefinitely (cf. audit A7/A8).
    func test_flush_exhausted_cleansLocalAudioFile() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        // Create a real fixture file under Documents/pending-audio/
        let fixturePath = try OfflineQueue.pendingAudioRelativePath(for: "cid_cleanup")
        let absolutePath = OfflineQueue.absoluteAudioPath(forStored: fixturePath)
        FileManager.default.createFile(atPath: absolutePath, contents: Data("audio".utf8))
        XCTAssertTrue(FileManager.default.fileExists(atPath: absolutePath))

        // Encode a payload that references this file
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let item = OfflineQueueItem(
            id: "qid_cleanup",
            clientMessageId: "cid_cleanup",
            conversationId: "c1",
            content: "hi",
            originalLanguage: "en",
            replyToId: nil,
            forwardedFromId: nil,
            forwardedFromConversationId: nil,
            attachmentIds: nil,
            localAudioPath: fixturePath,
            createdAt: Date()
        )
        let payload = try encoder.encode(item)

        try await pool.write { db in
            try OutboxRecord(
                id: "x", kind: .sendMessage, conversationId: "c1",
                clientMessageId: "cid_cleanup",
                payload: payload,
                status: .pending, attempts: 4, lastError: nil,
                createdAt: Date(), updatedAt: Date(), nextAttemptAt: Date()
            ).insert(db)
        }

        let flusher = OutboxFlusher(
            pool: pool,
            dispatcher: MockOutboxDispatcher(shouldFail: true)
        )
        await flusher.flush()

        // Verify the row went exhausted AND the file is gone
        let after = try await pool.read { db in
            try OutboxRecord.fetchOne(db, key: "x")!
        }
        XCTAssertEqual(after.status, .exhausted)
        XCTAssertFalse(
            FileManager.default.fileExists(atPath: absolutePath),
            "Local audio file must be removed when outbox terminates as .exhausted"
        )
    }

    /// On the happy path the SDK adoption already moved the file into the
    /// typed media cache, so the cleanup must be a no-op (and not crash on
    /// a missing file). Pins idempotency.
    func test_flush_applied_doesNotCrashOnMissingLocalFile() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let item = OfflineQueueItem(
            id: "qid_applied",
            clientMessageId: "cid_applied",
            conversationId: "c1",
            content: "hi",
            originalLanguage: "en",
            replyToId: nil,
            forwardedFromId: nil,
            forwardedFromConversationId: nil,
            attachmentIds: nil,
            localAudioPath: "pending-audio/does-not-exist.m4a",
            createdAt: Date()
        )
        let payload = try encoder.encode(item)

        try await pool.write { db in
            try OutboxRecord(
                id: "x", kind: .sendMessage, conversationId: "c1",
                clientMessageId: "cid_applied",
                payload: payload,
                status: .pending, attempts: 0, lastError: nil,
                createdAt: Date(), updatedAt: Date(), nextAttemptAt: Date()
            ).insert(db)
        }

        let flusher = OutboxFlusher(pool: pool, dispatcher: MockOutboxDispatcher())
        await flusher.flush()

        // Row was deleted (.applied path), no crash.
        let count = try await pool.read { db in
            try OutboxRecord.fetchCount(db)
        }
        XCTAssertEqual(count, 0)
    }

    // MARK: - S1 — atomic claim against concurrent flushers

    /// The core protection: a second claim of an already-claimed (inflight) row
    /// is rejected. Because GRDB serializes writes, two CONCURRENT flushers
    /// reduce to two SEQUENTIAL claims at the DB layer, so this sequential test
    /// faithfully models the race — exactly one flusher may dispatch a row.
    func test_claimPending_rejectsSecondClaim_ofAlreadyClaimedRow() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        let now = Date()
        try await pool.write { db in
            try OutboxRecord(
                id: "1", kind: .sendMessage, conversationId: "c1",
                clientMessageId: "cid_1", payload: Data(), status: .pending, attempts: 0,
                lastError: nil, createdAt: now, updatedAt: now, nextAttemptAt: now
            ).insert(db)
        }
        let flusher = OutboxFlusher(pool: pool, dispatcher: MockOutboxDispatcher())
        let row = try await pool.read { db in try OutboxRecord.fetchOne(db, key: "1")! }

        let first = await flusher.claimPending(row)
        let second = await flusher.claimPending(row)

        XCTAssertTrue(first, "the first flusher must claim the pending row")
        XCTAssertFalse(second, "a second flusher must be rejected — the row is already inflight (no double-dispatch)")
        let status = try await pool.read { db in try OutboxRecord.fetchOne(db, key: "1")!.status }
        XCTAssertEqual(status, .inflight)
    }

    /// End-to-end: two flushers sharing the pool flush concurrently; the shared
    /// row must be dispatched exactly once (with the atomic claim, deterministic
    /// regardless of interleaving).
    func test_concurrentFlushers_dispatchSharedRowExactlyOnce() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        let now = Date()
        try await pool.write { db in
            try OutboxRecord(
                id: "1", kind: .sendMessage, conversationId: "c1",
                clientMessageId: "cid_1", payload: Data(), status: .pending, attempts: 0,
                lastError: nil, createdAt: now, updatedAt: now, nextAttemptAt: now
            ).insert(db)
        }
        let dispatcher = MockOutboxDispatcher()
        let a = OutboxFlusher(pool: pool, dispatcher: dispatcher)
        let b = OutboxFlusher(pool: pool, dispatcher: dispatcher)

        async let ra: Void = { _ = await a.flush() }()
        async let rb: Void = { _ = await b.flush() }()
        _ = await (ra, rb)

        let processed = await dispatcher.processedIds
        XCTAssertEqual(processed.filter { $0 == "1" }.count, 1,
            "two concurrent flushers must not double-dispatch the same row")
    }

    private func makeFreshPool() throws -> DatabaseQueue {
        return try DatabaseQueue()
    }

    /// H (bannière « Synchronisation… » bloquée) — une row `.inflight` orpheline
    /// (claim dont le dispatch n'a jamais conclu : crash, Task annulée) reste
    /// comptée par `pendingCount` mais n'est JAMAIS reprise par `flush()` qui
    /// ne SELECT que les `.pending`. `bootRecovery` ne tourne qu'au boot et au
    /// retour foreground : en session longue, la bannière reste allumée à vie.
    /// Le flush doit réclamer les `.inflight` périmées (visibility timeout).
    func test_flush_reclaimsStaleInflightOrphan_andDispatchesIt() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        let now = Date()
        let staleClaim = now.addingTimeInterval(-OutboxFlusher.staleInflightReclaimSeconds - 60)
        try await pool.write { db in
            try OutboxRecord(
                id: "orphan", kind: .sendMessage, conversationId: "c1",
                clientMessageId: "cid_orphan", payload: Data(), status: .inflight,
                attempts: 1, lastError: nil,
                createdAt: staleClaim, updatedAt: staleClaim, nextAttemptAt: staleClaim
            ).insert(db)
        }
        let dispatcher = MockOutboxDispatcher()
        let flusher = OutboxFlusher(pool: pool, dispatcher: dispatcher)

        await flusher.flush()

        let processed = await dispatcher.processedIds
        XCTAssertEqual(processed, ["orphan"],
                       "une .inflight orpheline au-delà du timeout doit être réclamée et dispatchée")
        let remaining = try await pool.read { db in
            try OutboxRecord.filter(Column("id") == "orphan").fetchCount(db)
        }
        XCTAssertEqual(remaining, 0, "dispatch réussi → row supprimée → la bannière s'éteint")
    }

    func test_flush_leavesFreshInflightAlone_noDoubleDispatchOfActiveClaim() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        let now = Date()
        try await pool.write { db in
            try OutboxRecord(
                id: "active", kind: .sendMessage, conversationId: "c1",
                clientMessageId: "cid_active", payload: Data(), status: .inflight,
                attempts: 0, lastError: nil,
                createdAt: now, updatedAt: now, nextAttemptAt: now
            ).insert(db)
        }
        let dispatcher = MockOutboxDispatcher()
        let flusher = OutboxFlusher(pool: pool, dispatcher: dispatcher)

        await flusher.flush()

        let processed = await dispatcher.processedIds
        XCTAssertTrue(processed.isEmpty,
                      "un claim FRAIS appartient à son dispatcher en cours — jamais de reclaim précoce")
        let status = try await pool.read { db in try OutboxRecord.fetchOne(db, key: "active")!.status }
        XCTAssertEqual(status, .inflight)
    }
}

actor MockOutboxDispatcher: OutboxDispatching {
    private var _processedIds: [String] = []
    let shouldFail: Bool
    let authFailure: Bool
    let failure: Error?

    init(shouldFail: Bool = false, authFailure: Bool = false, failure: Error? = nil) {
        self.shouldFail = shouldFail
        self.authFailure = authFailure
        self.failure = failure
    }

    var processedIds: [String] { _processedIds }

    func dispatch(_ record: OutboxRecord) async throws {
        _processedIds.append(record.id)
        if let failure {
            throw failure
        }
        if authFailure {
            throw MeeshyError.auth(.sessionExpired)
        }
        if shouldFail {
            throw NSError(domain: "test", code: -1)
        }
    }

}
