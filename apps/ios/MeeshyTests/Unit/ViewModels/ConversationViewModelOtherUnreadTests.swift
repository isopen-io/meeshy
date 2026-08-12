import XCTest
import Combine
import GRDB
@testable import Meeshy
import MeeshySDK

/// Exercises `ConversationViewModel.otherConversationsUnread` — the
/// cross-conversation unread count shown next to the back button.
///
/// Contract: `ConversationSyncEngine.totalConversationsUnread` ALREADY excludes
/// the currently-open conversation. The VM calls `setCurrentlyOpenConversation`
/// on init, and the engine then zeroes + excludes that conversation from the
/// aggregate (proven by
/// `ConversationSyncEngineTests.test_setCurrentlyOpenConversation_excludesOpenConvFromAggregator`).
/// So the published total IS "other conversations only" — the VM MUST mirror it
/// directly. Subtracting the current conversation's own unread again would
/// double-count and under-shoot the pill (e.g. 0 while other conversations still
/// have unread). `max(0, …)` is purely a defensive clamp.
@MainActor
final class ConversationViewModelOtherUnreadTests: XCTestCase {

    private var mockAuthManager: MockAuthManager!
    private var mockMessageService: MockMessageService!
    private var mockConversationService: MockConversationService!
    private var mockReactionService: MockReactionService!
    private var mockReportService: MockReportService!
    private var mockMessageSocket: MockMessageSocket!
    private var mockSyncEngine: MockConversationSyncEngine!
    private let testConversationId = "000000000000000000000099"
    private let testUserId = "000000000000000000000077"

    override func setUp() async throws {
        try await super.setUp()
        mockAuthManager = MockAuthManager()
        mockMessageService = MockMessageService()
        mockConversationService = MockConversationService()
        mockReactionService = MockReactionService()
        mockReportService = MockReportService()
        mockMessageSocket = MockMessageSocket()
        mockSyncEngine = MockConversationSyncEngine()
        MessageSocketManager.shared.isConnected = true
    }

    override func tearDown() async throws {
        MessageSocketManager.shared.isConnected = false
        mockAuthManager = nil
        mockMessageService = nil
        mockConversationService = nil
        mockReactionService = nil
        mockReportService = nil
        mockMessageSocket = nil
        mockSyncEngine = nil
        try await super.tearDown()
    }

    private func makeSUT(currentConversationUnread: Int = 0) -> ConversationViewModel {
        let user = MeeshyUser(id: testUserId, username: "test", displayName: "Test")
        mockAuthManager.simulateLoggedIn(user: user)
        let pool = try! makeInMemoryDBPool()
        let deps = ConversationDependencies(
            dbPool: pool,
            persistence: MessagePersistenceActor(dbWriter: pool)
        )
        let sut = ConversationViewModel(
            conversationId: testConversationId,
            unreadCount: currentConversationUnread,
            authManager: mockAuthManager,
            messageService: mockMessageService,
            conversationService: mockConversationService,
            reactionService: mockReactionService,
            reportService: mockReportService,
            syncEngine: mockSyncEngine,
            messageSocket: mockMessageSocket,
            dependencies: deps
        )
        // The cross-conversation unread subscription now lives in `start()`
        // (deferred out of `init` to stop the eager-reconstruction storm).
        sut.start()
        return sut
    }

    func test_otherConversationsUnread_initiallyZero() {
        let sut = makeSUT(currentConversationUnread: 5)

        XCTAssertEqual(sut.otherConversationsUnread, 0)
    }

    /// The engine aggregate already excludes the open conversation, so when it
    /// publishes 7 the pill must show 7 — mirrored directly, NOT reduced again.
    func test_otherConversationsUnread_mirrorsEngineAggregate() async {
        let sut = makeSUT(currentConversationUnread: 5)

        let exp = expectation(description: "otherConversationsUnread updated")
        var cancellables = Set<AnyCancellable>()
        sut.$otherConversationsUnread
            .dropFirst()
            .first()
            .sink { _ in exp.fulfill() }
            .store(in: &cancellables)

        mockSyncEngine.simulateTotalUnread(7)

        await fulfillment(of: [exp], timeout: 2.0)
        XCTAssertEqual(sut.otherConversationsUnread, 7)
    }

    /// Regression guard for the double-subtraction bug: the open conversation's
    /// own unread count MUST NOT influence the pill, because the engine has
    /// already excluded it. With current=5 and the engine publishing 7, the pill
    /// must show 7 — not 7 − 5 = 2 (the old, wrong formula that under-shot the
    /// count while the open conversation still had unread messages).
    func test_otherConversationsUnread_independentOfCurrentConversationUnread() async {
        let sut = makeSUT(currentConversationUnread: 5)

        let exp = expectation(description: "otherConversationsUnread updated")
        var cancellables = Set<AnyCancellable>()
        sut.$otherConversationsUnread
            .dropFirst()
            .first()
            .sink { _ in exp.fulfill() }
            .store(in: &cancellables)

        mockSyncEngine.simulateTotalUnread(7)

        await fulfillment(of: [exp], timeout: 2.0)
        XCTAssertEqual(sut.otherConversationsUnread, 7,
            "the open conversation's local unread must not be subtracted again — the engine already excluded it")
    }

    /// Defensive clamp: the engine clamps its own aggregate ≥ 0, but the VM
    /// applies `max(0, …)` so a hypothetical negative emission never surfaces a
    /// negative badge.
    func test_otherConversationsUnread_clampsNegativeAtZero() async {
        let sut = makeSUT(currentConversationUnread: 0)

        let exp = expectation(description: "clamped")
        var cancellables = Set<AnyCancellable>()
        sut.$otherConversationsUnread
            .dropFirst()
            .first()
            .sink { _ in exp.fulfill() }
            .store(in: &cancellables)

        mockSyncEngine.simulateTotalUnread(-3)

        await fulfillment(of: [exp], timeout: 2.0)
        XCTAssertEqual(sut.otherConversationsUnread, 0, "must clamp at 0, never negative")
    }

    /// Each new aggregate from the engine must propagate immediately and
    /// verbatim to the pill (the engine already excludes the open conversation).
    func test_otherConversationsUnread_updates_whenSyncEnginePublishes() async {
        let sut = makeSUT(currentConversationUnread: 2)
        // Drain the seed-pass emission first
        try? await Task.sleep(nanoseconds: 50_000_000)

        mockSyncEngine.simulateTotalUnread(10)
        try? await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertEqual(sut.otherConversationsUnread, 10)

        mockSyncEngine.simulateTotalUnread(5)
        try? await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertEqual(sut.otherConversationsUnread, 5)

        mockSyncEngine.simulateTotalUnread(0)
        try? await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertEqual(sut.otherConversationsUnread, 0)
    }

    private func makeInMemoryDBPool() throws -> DatabaseQueue {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        return db
    }
}
