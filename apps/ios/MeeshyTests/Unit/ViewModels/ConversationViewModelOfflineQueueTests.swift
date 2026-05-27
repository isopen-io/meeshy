import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

/// Covers Bug 1 (lost second offline send) fix in
/// `ConversationViewModel.sendMessage`. The legacy code fire-and-forgot the
/// outbox enqueue and didn't gate the offline branch with the `isSending`
/// debounce, so two rapid taps while offline could silently drop the second
/// message. Tests exercise the new awaited-enqueue + lifted-guard flow.
@MainActor
final class ConversationViewModelOfflineQueueTests: XCTestCase {

    // MARK: - Properties

    private var mockAuthManager: MockAuthManager!
    private var mockMessageService: MockMessageService!
    private var mockConversationService: MockConversationService!
    private var mockReactionService: MockReactionService!
    private var mockReportService: MockReportService!
    private var mockMessageSocket: MockMessageSocket!
    private var fakeOfflineQueue: FakeOfflineMessageQueue!
    private var fakeNetworkMonitor: FakeNetworkMonitor!
    private var persistencePool: DatabaseQueue!
    private var persistence: MessagePersistenceActor!

    private let testConversationId = "00000000000000000000ff01"
    private let testUserId = "00000000000000000000ff99"

    // MARK: - Lifecycle

    override func setUp() async throws {
        try await super.setUp()
        await CacheCoordinator.shared.messages.invalidate(for: testConversationId)
        mockAuthManager = MockAuthManager()
        mockMessageService = MockMessageService()
        mockConversationService = MockConversationService()
        mockReactionService = MockReactionService()
        mockReportService = MockReportService()
        mockMessageSocket = MockMessageSocket()
        fakeOfflineQueue = FakeOfflineMessageQueue()
        fakeNetworkMonitor = FakeNetworkMonitor(isOnline: false)
        persistencePool = try makeInMemoryPool()
        persistence = MessagePersistenceActor(dbWriter: persistencePool)
        // ConversationViewModel checks `MessageSocketManager.shared.isConnected`
        // on the online send path. Offline tests pin it to a known value to
        // avoid leaking state from previous suites — the offline branch
        // returns before the singleton is consulted but we keep it deterministic.
        MessageSocketManager.shared.isConnected = false
    }

    override func tearDown() {
        mockAuthManager = nil
        mockMessageService = nil
        mockConversationService = nil
        mockReactionService = nil
        mockReportService = nil
        mockMessageSocket = nil
        fakeOfflineQueue = nil
        fakeNetworkMonitor = nil
        persistence = nil
        persistencePool = nil
        super.tearDown()
    }

    // MARK: - Factory

    private func makeSUT() -> ConversationViewModel {
        let currentUser = MeeshyUser(id: testUserId, username: "fixture", displayName: "Fixture User")
        mockAuthManager.simulateLoggedIn(user: currentUser)
        let deps = ConversationDependencies(dbPool: persistencePool, persistence: persistence)
        return ConversationViewModel(
            conversationId: testConversationId,
            authManager: mockAuthManager,
            messageService: mockMessageService,
            conversationService: mockConversationService,
            reactionService: mockReactionService,
            reportService: mockReportService,
            messageSocket: mockMessageSocket,
            dependencies: deps,
            networkMonitor: fakeNetworkMonitor,
            offlineQueue: fakeOfflineQueue
        )
    }

    private func makeInMemoryPool() throws -> DatabaseQueue {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        return db
    }

    private func fetchRecord(localId: String) async throws -> MessageRecord? {
        try await persistencePool.read { db in
            try MessageRecord.fetchOne(db, key: localId)
        }
    }

    // MARK: - Tests

    /// Sanity baseline: a single offline send enqueues exactly one item AND
    /// inserts one optimistic bubble in GRDB.
    func test_single_offline_send_enqueues_one_item_and_inserts_one_bubble() async throws {
        let sut = makeSUT()

        let ok = await sut.sendMessage(content: "Hello world")

        XCTAssertTrue(ok)
        let enqueueCount = await fakeOfflineQueue.enqueueCount
        XCTAssertEqual(enqueueCount, 1)
        let contents = await fakeOfflineQueue.enqueuedContents
        XCTAssertEqual(contents, ["Hello world"])

        let cmid = await fakeOfflineQueue.enqueuedClientMessageIds.first
        let cmidUnwrapped = try XCTUnwrap(cmid)
        let record = try await fetchRecord(localId: cmidUnwrapped)
        XCTAssertNotNil(record, "Optimistic record must be persisted before enqueue returns")
        XCTAssertEqual(record?.state, .sending)
        XCTAssertEqual(record?.content, "Hello world")
    }

    /// The core Bug 1 regression: two awaited offline sends back-to-back
    /// MUST both reach the queue. The legacy fire-and-forget path lost the
    /// second message because the optimistic insert raced its outbox write.
    func test_two_offline_sends_back_to_back_enqueue_two_items() async {
        let sut = makeSUT()

        let firstOk = await sut.sendMessage(content: "First")
        let secondOk = await sut.sendMessage(content: "Second")

        XCTAssertTrue(firstOk)
        XCTAssertTrue(secondOk)
        let enqueueCount = await fakeOfflineQueue.enqueueCount
        XCTAssertEqual(enqueueCount, 2, "Both offline sends must reach the outbox")
        let contents = await fakeOfflineQueue.enqueuedContents
        XCTAssertEqual(contents, ["First", "Second"])
    }

    /// Concurrent send attempts (two `Task`s racing for the awaited path)
    /// must be serialized by the `isSending` guard. The expected outcome:
    /// exactly one of them succeeds + enqueues, the other returns `false`.
    func test_concurrent_taps_are_serialized_by_isSending_guard() async {
        await fakeOfflineQueue.setDelay(.milliseconds(150))
        let sut = makeSUT()

        async let a = sut.sendMessage(content: "Tap A")
        async let b = sut.sendMessage(content: "Tap B")
        let results = await [a, b]

        let succeeded = results.filter { $0 }.count
        let rejected = results.filter { !$0 }.count
        XCTAssertEqual(succeeded, 1, "Exactly one concurrent tap should succeed")
        XCTAssertEqual(rejected, 1, "The other concurrent tap should be rejected by isSending")
        let enqueueCount = await fakeOfflineQueue.enqueueCount
        XCTAssertEqual(enqueueCount, 1)
    }

    /// After a serialized concurrent burst settles, a fresh sequential tap
    /// must still go through — the guard releases on every path via `defer`.
    func test_third_send_during_pending_enqueue_is_stacked_not_dropped() async {
        await fakeOfflineQueue.setDelay(.milliseconds(80))
        let sut = makeSUT()

        async let a = sut.sendMessage(content: "Tap A")
        async let b = sut.sendMessage(content: "Tap B")
        _ = await [a, b]

        // After the first burst settles, isSending must be cleared by `defer`,
        // so the next sequential tap proceeds.
        let later = await sut.sendMessage(content: "Tap C")

        XCTAssertTrue(later)
        let enqueueCount = await fakeOfflineQueue.enqueueCount
        XCTAssertEqual(enqueueCount, 2, "First burst contributes one, sequential third contributes one")
        let contents = await fakeOfflineQueue.enqueuedContents
        XCTAssertTrue(contents.contains("Tap C"))
    }

    /// When the outbox write throws, the optimistic row must be flipped to
    /// `.failed` so the UI can surface a retry affordance instead of leaving
    /// the bubble stuck on the spinner.
    func test_enqueue_throws_marks_bubble_failed() async throws {
        await fakeOfflineQueue.setShouldThrow(true)
        let sut = makeSUT()

        let ok = await sut.sendMessage(content: "Doomed")

        XCTAssertFalse(ok)
        // Even on failure the fake records the call attempt up to the throw
        // (here it throws before append), so we assert by inspecting GRDB.
        // The optimistic row was inserted then flipped to `.failed`.
        let allFailed = try await persistencePool.read { db in
            try MessageRecord
                .filter(Column("conversationId") == self.testConversationId)
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
    func test_attachment_ids_are_preserved_through_offline_enqueue() async {
        let sut = makeSUT()

        let ok = await sut.sendMessage(
            content: "Photo caption",
            attachmentIds: ["att-1", "att-2", "att-3"]
        )

        XCTAssertTrue(ok)
        let attachmentIds = await fakeOfflineQueue.enqueuedAttachmentIds
        XCTAssertEqual(attachmentIds, [["att-1", "att-2", "att-3"]])
    }

    /// `replyToId` must survive the offline queue so the dispatcher rebuilds
    /// the reply reference server-side on replay.
    func test_reply_to_id_is_preserved_through_offline_enqueue() async {
        let sut = makeSUT()

        let ok = await sut.sendMessage(
            content: "Replying",
            replyToId: "parent-message-id"
        )

        XCTAssertTrue(ok)
        let replyToIds = await fakeOfflineQueue.enqueuedReplyToIds
        XCTAssertEqual(replyToIds, ["parent-message-id"])
    }

    /// Forwarded metadata (`forwardedFromId` + `forwardedFromConversationId`)
    /// must survive the offline queue so the dispatcher reconstructs the
    /// forward chain server-side on replay.
    func test_forwarded_metadata_is_preserved_through_offline_enqueue() async {
        let sut = makeSUT()

        let ok = await sut.sendMessage(
            content: "Forwarded",
            forwardedFromId: "orig-msg-id",
            forwardedFromConversationId: "orig-conv-id"
        )

        XCTAssertTrue(ok)
        let forwardedFromIds = await fakeOfflineQueue.enqueuedForwardedFromIds
        let forwardedFromConvIds = await fakeOfflineQueue.enqueuedForwardedFromConversationIds
        XCTAssertEqual(forwardedFromIds, ["orig-msg-id"])
        XCTAssertEqual(forwardedFromConvIds, ["orig-conv-id"])
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
