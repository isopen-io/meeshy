import XCTest
import Combine
import GRDB
@testable import MeeshySDK

/// Wave 1 Task 3.6 — verifies the three new unified signals (`retrySucceeded`
/// extended with `kind`, `retryExhausted`, `retryDropped`) plus the new
/// `enqueueReaction` coalescing state machine on `OfflineQueue`.
///
/// These tests lock the API contract before consumers (ConversationViewModel,
/// OutboxDispatcher) are migrated off the legacy `MessageRetryQueue` /
/// `ReactionQueue` Combine publishers.
final class OutboxUnifiedSignalsTests: XCTestCase {

    private var cancellables: Set<AnyCancellable> = []

    override func setUp() async throws {
        cancellables.removeAll()
        await OfflineQueue.shared.clearAll()
    }

    override func tearDown() async throws {
        cancellables.removeAll()
        await OfflineQueue.shared.clearAll()
    }

    // MARK: - retryExhausted signal (Phase A.1)

    /// When `OutboxFlusher` exhausts a `.sendMessage` record at maxAttempts,
    /// the unified `OfflineQueue.shared.retryExhausted` signal fires with the
    /// matching `kind`, `clientMessageId`, and `conversationId`.
    func test_retryExhausted_emitsForSendMessage_whenFlusherExhaustsRow() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)

        let cid = "cid_exhaust_send_\(UUID().uuidString)"
        let now = Date()
        try await pool.write { db in
            try OutboxRecord(
                id: "ofq_test_exhaust_send",
                kind: .sendMessage,
                conversationId: "c1",
                messageLocalId: cid,
                clientMessageId: cid,
                payload: Data(),
                status: .pending,
                attempts: 4, // one shy of the default maxAttempts=5
                lastError: "previous-failure",
                createdAt: now,
                updatedAt: now,
                nextAttemptAt: now
            ).insert(db)
        }

        let expectation = expectation(description: "retryExhausted fires")
        var received: OfflineRetryExhausted?
        OfflineQueue.shared.retryExhausted
            .sink { payload in
                if payload.clientMessageId == cid {
                    received = payload
                    expectation.fulfill()
                }
            }
            .store(in: &cancellables)

        let flusher = OutboxFlusher(pool: pool, dispatcher: AlwaysFailDispatcher())
        await flusher.flush()

        await fulfillment(of: [expectation], timeout: 2)

        XCTAssertEqual(received?.kind, .sendMessage)
        XCTAssertEqual(received?.clientMessageId, cid)
        XCTAssertEqual(received?.conversationId, "c1")
        XCTAssertNil(received?.reaction, "Non-reaction kinds must leave the reaction context nil")
    }

    /// When `OutboxFlusher` exhausts a `.sendReaction` record, the unified
    /// signal carries the typed `ReactionContext` so reaction-specific
    /// subscribers can roll back optimistic UI without re-decoding the row.
    func test_retryExhausted_emitsForSendReaction_withReactionContext() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)

        let cid = "cid_exhaust_react_\(UUID().uuidString)"
        let payload = ReactionOutboxPayload(
            messageId: "msg-1",
            emoji: "❤️",
            action: .add,
            conversationId: "c2",
            clientMessageId: cid
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let payloadData = try encoder.encode(payload)
        let now = Date()
        try await pool.write { db in
            try OutboxRecord(
                id: "rxq_test_exhaust_react",
                kind: .sendReaction,
                conversationId: "c2",
                messageLocalId: cid,
                clientMessageId: cid,
                payload: payloadData,
                status: .pending,
                attempts: 4,
                lastError: nil,
                createdAt: now,
                updatedAt: now,
                nextAttemptAt: now
            ).insert(db)
        }

        let expectation = expectation(description: "retryExhausted fires for reaction")
        var received: OfflineRetryExhausted?
        OfflineQueue.shared.retryExhausted
            .sink { event in
                if event.clientMessageId == cid {
                    received = event
                    expectation.fulfill()
                }
            }
            .store(in: &cancellables)

        let flusher = OutboxFlusher(pool: pool, dispatcher: AlwaysFailDispatcher())
        await flusher.flush()

        await fulfillment(of: [expectation], timeout: 2)

        XCTAssertEqual(received?.kind, .sendReaction)
        XCTAssertEqual(received?.reaction?.messageId, "msg-1")
        XCTAssertEqual(received?.reaction?.emoji, "❤️")
        XCTAssertEqual(received?.reaction?.action, .add)
    }

    // MARK: - enqueueReaction coalescing (Phase A.2)

    func test_enqueueReaction_writesSendReactionRow_whenNoPendingExists() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)

        try await OfflineQueue.shared.enqueueReaction(
            messageId: "m-1", emoji: "👍", action: .add, conversationId: "c-1"
        )

        let pending = await OfflineQueue.shared.pendingReactions
        XCTAssertEqual(pending.count, 1)
        XCTAssertEqual(pending.first?.messageId, "m-1")
        XCTAssertEqual(pending.first?.emoji, "👍")
        XCTAssertEqual(pending.first?.action, .add)

        let rows = try await pool.read { db in
            try OutboxRecord
                .filter(Column("kind") == OutboxKind.sendReaction.rawValue)
                .fetchAll(db)
        }
        XCTAssertEqual(rows.count, 1)
        XCTAssertTrue(rows.first?.id.hasPrefix("rxq_") ?? false,
            "Reaction rows MUST keep the rxq_* prefix so legacy in-flight rows continue draining")
    }

    /// Idempotent re-enqueue: a duplicate `add` on the same (messageId, emoji)
    /// keeps the existing pending row and emits `retryDropped` so the UI can
    /// reconcile the duplicate optimistic action.
    func test_enqueueReaction_droppedNew_whenSameActionAlreadyPending() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)

        try await OfflineQueue.shared.enqueueReaction(
            messageId: "m-1", emoji: "❤️", action: .add, conversationId: "c-1"
        )

        let expectation = expectation(description: "retryDropped fires")
        var received: OfflineRetryDropped?
        OfflineQueue.shared.retryDropped
            .sink { event in
                received = event
                expectation.fulfill()
            }
            .store(in: &cancellables)

        try await OfflineQueue.shared.enqueueReaction(
            messageId: "m-1", emoji: "❤️", action: .add, conversationId: "c-1"
        )

        await fulfillment(of: [expectation], timeout: 1)

        XCTAssertEqual(received?.kind, .sendReaction)
        XCTAssertEqual(received?.reaction?.action, .add)

        let pending = await OfflineQueue.shared.pendingReactions
        XCTAssertEqual(pending.count, 1, "Duplicate enqueue must NOT insert a second row")
    }

    /// Opposite directions cancel: an `add` followed by a `remove` for the
    /// same (messageId, emoji) deletes the existing pending row and emits
    /// `retryDropped` twice (once for each cancelled side).
    func test_enqueueReaction_cancelledBoth_whenOppositeActionAlreadyPending() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)

        try await OfflineQueue.shared.enqueueReaction(
            messageId: "m-2", emoji: "🔥", action: .add, conversationId: "c-1"
        )

        let expectation = expectation(description: "retryDropped fires twice (cancelledBoth)")
        expectation.expectedFulfillmentCount = 2
        var receivedEvents: [OfflineRetryDropped] = []
        OfflineQueue.shared.retryDropped
            .sink { event in
                receivedEvents.append(event)
                expectation.fulfill()
            }
            .store(in: &cancellables)

        try await OfflineQueue.shared.enqueueReaction(
            messageId: "m-2", emoji: "🔥", action: .remove, conversationId: "c-1"
        )

        await fulfillment(of: [expectation], timeout: 1)

        let pending = await OfflineQueue.shared.pendingReactions
        XCTAssertEqual(pending.count, 0, "Add+remove on the same (msg,emoji) must cancel BOTH")

        XCTAssertEqual(receivedEvents.count, 2)
        // One of the two emitted events references the original add, the
        // other the cancelling remove — order is implementation-defined but
        // both must appear.
        let actions = Set(receivedEvents.map { $0.reaction?.action })
        XCTAssertEqual(actions, Set<ReactionAction>([.add, .remove]))
    }

    // MARK: - mutationEnqueued (outbox-04)

    /// Une mutation sociale enfilée EN LIGNE doit réveiller le flusher tout
    /// de suite — sans ce signal la row reste .pending jusqu'au prochain
    /// événement de cycle de vie incident (reconnect, boot, foreground).
    func test_enqueueKindPayload_emitsMutationEnqueued() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)

        let exp = expectation(description: "mutationEnqueued fires")
        OfflineQueue.shared.mutationEnqueued
            .sink { exp.fulfill() }
            .store(in: &cancellables)

        _ = try await OfflineQueue.shared.enqueue(
            .toggleLikePost,
            payload: ToggleLikePostPayload(
                clientMutationId: ClientMutationId.generate(), postId: "post-1", liked: true
            ),
            conversationId: "post-1"
        )

        await fulfillment(of: [exp], timeout: 2)
    }

    func test_enqueueMedia_emitsMutationEnqueued() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("media_\(UUID().uuidString).jpg")
        try Data(repeating: 0xCD, count: 16).write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }

        let exp = expectation(description: "mutationEnqueued fires")
        OfflineQueue.shared.mutationEnqueued
            .sink { exp.fulfill() }
            .store(in: &cancellables)

        _ = try await OfflineQueue.shared.enqueueMedia(
            sourceMediaURLs: [url], kinds: ["image"], conversationId: "conv-1",
            content: nil, clientMessageId: "cid_media_\(UUID().uuidString)"
        )

        await fulfillment(of: [exp], timeout: 2)
    }

    func test_enqueueReaction_insertedOutcome_emitsMutationEnqueued() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)

        let exp = expectation(description: "mutationEnqueued fires")
        OfflineQueue.shared.mutationEnqueued
            .sink { exp.fulfill() }
            .store(in: &cancellables)

        try await OfflineQueue.shared.enqueueReaction(
            messageId: "m-emit", emoji: "👍", action: .add, conversationId: "c-1"
        )

        await fulfillment(of: [exp], timeout: 2)
    }

    /// Un no-op de dédup (.droppedNew) ne crée aucune row : réveiller le
    /// flusher pour rien serait du bruit — verrou de la décision .inserted-only.
    func test_enqueueReaction_droppedNew_doesNotEmitMutationEnqueued() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)
        try await OfflineQueue.shared.enqueueReaction(
            messageId: "m-dup", emoji: "❤️", action: .add, conversationId: "c-1"
        )

        var fired = false
        OfflineQueue.shared.mutationEnqueued
            .sink { fired = true }
            .store(in: &cancellables)

        try await OfflineQueue.shared.enqueueReaction(
            messageId: "m-dup", emoji: "❤️", action: .add, conversationId: "c-1"
        )
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertFalse(fired, "un no-op de dédup ne doit pas réveiller le flusher")
    }

    /// Un échec d'enqueue (copie audio impossible) n'écrit aucune row .pending
    /// nouvelle à flusher — verrou du placement de l'emit après la Phase B.
    func test_enqueueAudios_copyFailure_doesNotEmitMutationEnqueued() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)
        let badSource = FileManager.default.temporaryDirectory
            .appendingPathComponent("does_not_exist_\(UUID().uuidString).m4a")

        var fired = false
        OfflineQueue.shared.mutationEnqueued
            .sink { fired = true }
            .store(in: &cancellables)

        do {
            _ = try await OfflineQueue.shared.enqueueAudios(
                sourceAudioURLs: [badSource], conversationId: "conv-1",
                content: nil, clientMessageId: "cid_fail_\(UUID().uuidString)", originalLanguage: "fr"
            )
            XCTFail("enqueueAudios must throw when the source copy fails")
        } catch {
            // expected EnqueueAudioError.audioCopyFailed
        }
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertFalse(fired, "un enqueue qui échoue ne doit pas réveiller le flusher")
    }

    // MARK: - Helpers

    private func makeFreshPool() throws -> DatabaseQueue {
        return try DatabaseQueue()
    }
}

// MARK: - Always-fail dispatcher

/// Always throws so `OutboxFlusher` increments the attempt counter without
/// touching the real network layer. Used to drive the exhausted path.
private actor AlwaysFailDispatcher: OutboxDispatching {
    func dispatch(_ record: OutboxRecord) async throws {
        throw NSError(domain: "test-always-fail", code: -1)
    }
}
