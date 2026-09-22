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

    // MARK: - Lecture partielle (#7350, I-2)

    private func unreadFromOthers(count: Int) -> [Message] {
        let start = Date(timeIntervalSince1970: 1_700_000_000)
        return (0..<count).map { index in
            let createdAt = start.addingTimeInterval(TimeInterval(index))
            return Message(
                id: String(format: "%024x", index + 1),
                conversationId: testConversationId,
                senderId: "000000000000000000000055",
                content: "m\(index)",
                createdAt: createdAt,
                updatedAt: createdAt
            )
        }
    }

    /// Le critère de #7350 : 99 non-lus, 5 affichés ⇒ 94 confiés au moteur,
    /// qui les redonnera à la ligne à la fermeture — jamais le 0 de l'ouverture.
    func test_markAsRead_fiveOfNinetyNineSeen_leavesNinetyFourToRestore() {
        let sut = makeSUT(currentConversationUnread: 99)
        let window = unreadFromOthers(count: 99)
        sut.messages = window

        sut.markAsRead(messageIds: window.prefix(5).map(\.id))

        XCTAssertEqual(mockSyncEngine.noteUnreadRemainingCalls.last?.conversationId, testConversationId)
        XCTAssertEqual(mockSyncEngine.noteUnreadRemainingCalls.last?.remaining, 94)
    }

    /// Les lots s'ADDITIONNENT : le préfixe contigu se mesure sur tout ce qui a
    /// été vu depuis l'ouverture, pas sur le seul dernier lot.
    func test_markAsRead_successiveBatches_accumulateTheSeenPrefix() {
        let sut = makeSUT(currentConversationUnread: 99)
        let window = unreadFromOthers(count: 99)
        sut.messages = window

        sut.markAsRead(messageIds: window.prefix(5).map(\.id))
        sut.markAsRead(messageIds: window.dropFirst(5).prefix(5).map(\.id))

        XCTAssertEqual(mockSyncEngine.noteUnreadRemainingCalls.last?.remaining, 89)
    }

    /// Rattraper le présent déplace le curseur serveur jusqu'au message
    /// rattrapé, même en ayant sauté le milieu du fil. Un message arrivé
    /// ENSUITE sans être vu laisse 1 non-lu — pas le compte mesuré depuis la
    /// frontière d'OUVERTURE, que le serveur a déjà passée.
    func test_markAsRead_afterCatchingUp_anUnseenNewMessageLeavesOne() {
        let sut = makeSUT(currentConversationUnread: 99)
        let history = unreadFromOthers(count: 100)
        sut.messages = Array(history.prefix(99))
        sut.markAsRead(messageIds: history.prefix(5).map(\.id) + [history[98].id])

        sut.messages = history
        sut.markAsRead(messageIds: [history[50].id])

        XCTAssertEqual(mockSyncEngine.noteUnreadRemainingCalls.last?.remaining, 1)
    }

    /// Ouvrir l'écran ne marque RIEN lu : ni frontière posée au moteur, ni
    /// reste noté tant que rien n'a été affiché.
    func test_start_marksNothingRead() async {
        _ = makeSUT(currentConversationUnread: 99)
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(mockSyncEngine.markConversationReadLocallyCallCount, 0)
        XCTAssertTrue(mockSyncEngine.noteUnreadRemainingCalls.isEmpty)
    }

    private func makeInMemoryDBPool() throws -> DatabaseQueue {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        return db
    }
}
