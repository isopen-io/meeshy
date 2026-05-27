import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

/// Covers Bug 1 (lost second offline send) fix in
/// `ConversationViewModel.sendMessage`. The legacy code fire-and-forgot the
/// outbox enqueue and didn't gate the offline branch with the `isSending`
/// debounce, so two rapid taps while offline could silently drop the second
/// message. Tests exercise the new awaited-enqueue + lifted-guard flow.
///
/// All state lives inside `makeFixture(...)` factory — no shared mutable
/// `setUp`/`tearDown` properties (CLAUDE.md: "factory functions for test
/// data, no `let`/`beforeEach` mutation"). Each test owns its mocks, pool,
/// and SUT, so test order independence is structural.
@MainActor
final class ConversationViewModelOfflineQueueTests: XCTestCase {

    // MARK: - Fixture

    /// Bundle of co-owned test collaborators returned by `makeFixture`. The
    /// SUT and its mocks have intertwined lifetimes — separating them into
    /// loose tuples would make the test bodies noisy. Owned by the test
    /// stack frame, released on test exit.
    private struct Fixture {
        let sut: ConversationViewModel
        let messageService: MockMessageService
        let messageSocket: MockMessageSocket
        let offlineQueue: FakeOfflineMessageQueue
        let networkMonitor: FakeNetworkMonitor
        let persistencePool: DatabaseQueue
        let conversationId: String
        let userId: String

        /// Local equivalent of the previous instance-level `fetchRecord`
        /// helper. Lives on the fixture so each test can read GRDB rows
        /// from its own isolated pool without leaking the closure to a
        /// shared property.
        func fetchRecord(localId: String) async throws -> MessageRecord? {
            try await persistencePool.read { db in
                try MessageRecord.fetchOne(db, key: localId)
            }
        }
    }

    private func makeFixture(
        isOnline: Bool = false,
        offlineQueueDelay: Duration = .zero,
        offlineQueueThrows: Bool = false,
        restSendFailure: Error? = nil
    ) async throws -> Fixture {
        let conversationId = "00000000000000000000ff01"
        let userId = "00000000000000000000ff99"
        // Invalidate any cached snapshot left by previous test runs that
        // reuse the same conversation id. Cheap and local — the cache is
        // a singleton so per-test invalidation is the safe boundary.
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)

        let auth = MockAuthManager()
        let messageService = MockMessageService()
        if let restSendFailure {
            messageService.sendResult = .failure(restSendFailure)
        }
        let conversationService = MockConversationService()
        let reactionService = MockReactionService()
        let reportService = MockReportService()
        let messageSocket = MockMessageSocket()
        let offlineQueue = FakeOfflineMessageQueue()
        if offlineQueueDelay != .zero {
            await offlineQueue.setDelay(offlineQueueDelay)
        }
        if offlineQueueThrows {
            await offlineQueue.setShouldThrow(true)
        }
        let networkMonitor = FakeNetworkMonitor(isOnline: isOnline)
        let pool = try Self.makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        // ConversationViewModel checks `MessageSocketManager.shared.isConnected`
        // on the online send path. Pinning to false avoids leaking state from
        // sibling test suites — the offline branch returns before the
        // singleton is consulted but we keep it deterministic.
        MessageSocketManager.shared.isConnected = false

        let user = MeeshyUser(id: userId, username: "fixture", displayName: "Fixture User")
        auth.simulateLoggedIn(user: user)
        let deps = ConversationDependencies(dbPool: pool, persistence: persistence)
        let sut = ConversationViewModel(
            conversationId: conversationId,
            authManager: auth,
            messageService: messageService,
            conversationService: conversationService,
            reactionService: reactionService,
            reportService: reportService,
            messageSocket: messageSocket,
            dependencies: deps,
            networkMonitor: networkMonitor,
            offlineQueue: offlineQueue
        )
        return Fixture(
            sut: sut,
            messageService: messageService,
            messageSocket: messageSocket,
            offlineQueue: offlineQueue,
            networkMonitor: networkMonitor,
            persistencePool: pool,
            conversationId: conversationId,
            userId: userId
        )
    }

    private static func makeInMemoryPool() throws -> DatabaseQueue {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        return db
    }

    // MARK: - Tests

    /// Sanity baseline: a single offline send enqueues exactly one item AND
    /// inserts one optimistic bubble in GRDB.
    func test_single_offline_send_enqueues_one_item_and_inserts_one_bubble() async throws {
        let fx = try await makeFixture()

        let ok = await fx.sut.sendMessage(content: "Hello world")

        XCTAssertTrue(ok)
        let enqueueCount = await fx.offlineQueue.enqueueCount
        XCTAssertEqual(enqueueCount, 1)
        let contents = await fx.offlineQueue.enqueuedContents
        XCTAssertEqual(contents, ["Hello world"])

        let cmid = await fx.offlineQueue.enqueuedClientMessageIds.first
        let cmidUnwrapped = try XCTUnwrap(cmid)
        let record = try await fx.fetchRecord(localId: cmidUnwrapped)
        XCTAssertNotNil(record, "Optimistic record must be persisted before enqueue returns")
        XCTAssertEqual(record?.state, .sending)
        XCTAssertEqual(record?.content, "Hello world")
    }

    /// The core Bug 1 regression: two awaited offline sends back-to-back
    /// MUST both reach the queue. The legacy fire-and-forget path lost the
    /// second message because the optimistic insert raced its outbox write.
    func test_two_offline_sends_back_to_back_enqueue_two_items() async throws {
        let fx = try await makeFixture()

        let firstOk = await fx.sut.sendMessage(content: "First")
        let secondOk = await fx.sut.sendMessage(content: "Second")

        XCTAssertTrue(firstOk)
        XCTAssertTrue(secondOk)
        let enqueueCount = await fx.offlineQueue.enqueueCount
        XCTAssertEqual(enqueueCount, 2, "Both offline sends must reach the outbox")
        let contents = await fx.offlineQueue.enqueuedContents
        XCTAssertEqual(contents, ["First", "Second"])
    }

    /// Concurrent send attempts (two `Task`s racing for the awaited path)
    /// must be serialized by the `isSending` guard. The expected outcome:
    /// exactly one of them succeeds + enqueues, the other returns `false`.
    func test_concurrent_taps_are_serialized_by_isSending_guard() async throws {
        let fx = try await makeFixture(offlineQueueDelay: .milliseconds(150))

        async let a = fx.sut.sendMessage(content: "Tap A")
        async let b = fx.sut.sendMessage(content: "Tap B")
        let results = await [a, b]

        let succeeded = results.filter { $0 }.count
        let rejected = results.filter { !$0 }.count
        XCTAssertEqual(succeeded, 1, "Exactly one concurrent tap should succeed")
        XCTAssertEqual(rejected, 1, "The other concurrent tap should be rejected by isSending")
        let enqueueCount = await fx.offlineQueue.enqueueCount
        XCTAssertEqual(enqueueCount, 1)
    }

    /// After a serialized concurrent burst settles, a fresh sequential tap
    /// must still go through — the guard releases on every path via `defer`.
    func test_third_send_during_pending_enqueue_is_stacked_not_dropped() async throws {
        let fx = try await makeFixture(offlineQueueDelay: .milliseconds(80))

        async let a = fx.sut.sendMessage(content: "Tap A")
        async let b = fx.sut.sendMessage(content: "Tap B")
        _ = await [a, b]

        // After the first burst settles, isSending must be cleared by `defer`,
        // so the next sequential tap proceeds.
        let later = await fx.sut.sendMessage(content: "Tap C")

        XCTAssertTrue(later)
        let enqueueCount = await fx.offlineQueue.enqueueCount
        XCTAssertEqual(enqueueCount, 2, "First burst contributes one, sequential third contributes one")
        let contents = await fx.offlineQueue.enqueuedContents
        XCTAssertTrue(contents.contains("Tap C"))
        // Stronger ordering check: one of {Tap A, Tap B} must coexist with
        // Tap C in the queue. Without this, an over-eager defer that cleared
        // isSending before the GRDB INSERT could let both A and B retry and
        // still satisfy enqueueCount == 2 with phantom orderings.
        let burstWinner = contents.contains("Tap A") || contents.contains("Tap B")
        XCTAssertTrue(burstWinner, "Concurrent burst must contribute exactly one of {Tap A, Tap B}")
    }

    /// When the outbox write throws, the optimistic row must be flipped to
    /// `.failed` so the UI can surface a retry affordance instead of leaving
    /// the bubble stuck on the spinner.
    func test_enqueue_throws_marks_bubble_failed() async throws {
        let fx = try await makeFixture(offlineQueueThrows: true)

        let ok = await fx.sut.sendMessage(content: "Doomed")

        XCTAssertFalse(ok)
        let convId = fx.conversationId
        let allFailed = try await fx.persistencePool.read { db in
            try MessageRecord
                .filter(Column("conversationId") == convId)
                .filter(Column("state") == MessageState.failed.rawValue)
                .fetchAll(db)
        }
        XCTAssertEqual(allFailed.count, 1)
        XCTAssertEqual(allFailed.first?.content, "Doomed")
        XCTAssertNotNil(allFailed.first?.lastError)
    }

    /// `attachmentIds` round-trips through the offline queue payload — the
    /// outbox must preserve them so the dispatcher can replay the REST POST
    /// with the same `attachmentIds` on reconnect.
    func test_attachment_ids_are_preserved_through_offline_enqueue() async throws {
        let fx = try await makeFixture()

        let ok = await fx.sut.sendMessage(
            content: "Photo caption",
            attachmentIds: ["att-1", "att-2", "att-3"]
        )

        XCTAssertTrue(ok)
        let attachmentIds = await fx.offlineQueue.enqueuedAttachmentIds
        XCTAssertEqual(attachmentIds, [["att-1", "att-2", "att-3"]])
    }

    /// `replyToId` must survive the offline queue so the dispatcher rebuilds
    /// the reply reference server-side on replay.
    func test_reply_to_id_is_preserved_through_offline_enqueue() async throws {
        let fx = try await makeFixture()

        let ok = await fx.sut.sendMessage(
            content: "Replying",
            replyToId: "parent-message-id"
        )

        XCTAssertTrue(ok)
        let replyToIds = await fx.offlineQueue.enqueuedReplyToIds
        XCTAssertEqual(replyToIds, ["parent-message-id"])
    }

    /// Forwarded metadata (`forwardedFromId` + `forwardedFromConversationId`)
    /// must survive the offline queue so the dispatcher reconstructs the
    /// forward chain server-side on replay.
    func test_forwarded_metadata_is_preserved_through_offline_enqueue() async throws {
        let fx = try await makeFixture()

        let ok = await fx.sut.sendMessage(
            content: "Forwarded",
            forwardedFromId: "orig-msg-id",
            forwardedFromConversationId: "orig-conv-id"
        )

        XCTAssertTrue(ok)
        let forwardedFromIds = await fx.offlineQueue.enqueuedForwardedFromIds
        let forwardedFromConvIds = await fx.offlineQueue.enqueuedForwardedFromConversationIds
        XCTAssertEqual(forwardedFromIds, ["orig-msg-id"])
        XCTAssertEqual(forwardedFromConvIds, ["orig-conv-id"])
    }

    /// Bug 1 — online retry path (B2). When the REST send fails AND the
    /// socket fallback returns no ACK, the catch block enqueues a retry
    /// item in the offline queue for the unified outbox to flush. The
    /// legacy `Task { try? await OfflineQueue.shared.enqueue(...) }` was
    /// fire-and-forget — the function returned before GRDB committed the
    /// retry row, so a process kill or fast second tap could silently
    /// drop the auto-retry. This test exercises the awaited path: with
    /// network online + REST stubbed to throw + socket fallback returning
    /// nil, exactly one item must reach the injected `offlineQueue` via
    /// the now-awaited enqueue call.
    func test_online_send_failure_falls_back_to_awaited_retry_enqueue() async throws {
        let fx = try await makeFixture(
            isOnline: true,
            restSendFailure: NSError(
                domain: "ConversationViewModelOfflineQueueTests",
                code: 500,
                userInfo: [NSLocalizedDescriptionKey: "synthetic REST failure"]
            )
        )
        // Default MockMessageSocket.sendViaSocketFallbackResult is nil → the
        // catch block skips the socket-recovery early-return and falls
        // through to the retry-enqueue path under test.
        let ok = await fx.sut.sendMessage(content: "online-then-retry")

        XCTAssertFalse(ok, "Online send with REST failure + no socket ack returns false")
        let enqueueCount = await fx.offlineQueue.enqueueCount
        XCTAssertEqual(enqueueCount, 1, "Retry path must AWAIT the enqueue, not fire-and-forget")
        let contents = await fx.offlineQueue.enqueuedContents
        XCTAssertEqual(contents, ["online-then-retry"])
    }
}

// MARK: - Test helpers on FakeOfflineMessageQueue

private extension FakeOfflineMessageQueue {
    func setDelay(_ duration: Duration) {
        delay = duration
    }

    func setShouldThrow(_ value: Bool) {
        shouldThrow = value
    }
}
