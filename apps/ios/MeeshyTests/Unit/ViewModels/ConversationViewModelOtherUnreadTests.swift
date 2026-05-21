import XCTest
import Combine
import GRDB
@testable import Meeshy
import MeeshySDK

/// Exercises `ConversationViewModel.otherConversationsUnread` — the
/// cross-conversation unread count shown next to the back button.
/// Pattern: `totalAcrossAll − currentConversation.unreadCount`, clamped ≥ 0.
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

    override func tearDown() {
        MessageSocketManager.shared.isConnected = false
        mockAuthManager = nil
        mockMessageService = nil
        mockConversationService = nil
        mockReactionService = nil
        mockReportService = nil
        mockMessageSocket = nil
        mockSyncEngine = nil
        super.tearDown()
    }

    private func makeSUT(currentConversationUnread: Int = 0) -> ConversationViewModel {
        let user = MeeshyUser(id: testUserId, username: "test", displayName: "Test")
        mockAuthManager.simulateLoggedIn(user: user)
        let pool = try! makeInMemoryDBPool()
        let deps = ConversationDependencies(
            dbPool: pool,
            persistence: MessagePersistenceActor(dbWriter: pool)
        )
        return ConversationViewModel(
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
    }

    func test_otherConversationsUnread_initiallyZero() {
        let sut = makeSUT(currentConversationUnread: 5)

        XCTAssertEqual(sut.otherConversationsUnread, 0)
    }

    /// When the SDK publishes a total of 12 and the current conv has 5
    /// unread, the pill must show 12 − 5 = 7 (other conversations only).
    func test_otherConversationsUnread_excludesCurrentConversation() async {
        let sut = makeSUT(currentConversationUnread: 5)

        let exp = expectation(description: "otherConversationsUnread updated")
        var cancellables = Set<AnyCancellable>()
        sut.$otherConversationsUnread
            .dropFirst()
            .first()
            .sink { _ in exp.fulfill() }
            .store(in: &cancellables)

        mockSyncEngine.simulateTotalUnread(12)

        await fulfillment(of: [exp], timeout: 2.0)
        XCTAssertEqual(sut.otherConversationsUnread, 7)
    }

    /// `markAsRead` on the current conv may race ahead of the published
    /// total; the SDK may publish "12" while our local snapshot still has
    /// the current at "15" (over-eager). Clamp at 0, never negative.
    func test_otherConversationsUnread_clampsAtZero_whenCurrentExceedsTotal() async {
        let sut = makeSUT(currentConversationUnread: 15)

        let exp = expectation(description: "clamped")
        var cancellables = Set<AnyCancellable>()
        sut.$otherConversationsUnread
            .dropFirst()
            .first()
            .sink { _ in exp.fulfill() }
            .store(in: &cancellables)

        mockSyncEngine.simulateTotalUnread(12)

        await fulfillment(of: [exp], timeout: 2.0)
        XCTAssertEqual(sut.otherConversationsUnread, 0, "must clamp at 0, never negative")
    }

    /// Each new total from the SDK must propagate immediately to the VM.
    /// We assert the final published value rather than the full sequence:
    /// CombineLatest may coalesce emissions on the main runloop, and the
    /// @Published assignment of the init's seed-pass introduces one extra
    /// "noop" 0 emission that doesn't belong to the observed sequence.
    func test_otherConversationsUnread_updates_whenSyncEnginePublishes() async {
        let sut = makeSUT(currentConversationUnread: 2)
        // Drain the seed-pass emission first
        try? await Task.sleep(nanoseconds: 50_000_000)

        mockSyncEngine.simulateTotalUnread(10)
        try? await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertEqual(sut.otherConversationsUnread, 8)

        mockSyncEngine.simulateTotalUnread(5)
        try? await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertEqual(sut.otherConversationsUnread, 3)

        mockSyncEngine.simulateTotalUnread(2)
        try? await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertEqual(sut.otherConversationsUnread, 0)
    }

    private func makeInMemoryDBPool() throws -> DatabaseQueue {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        return db
    }
}
