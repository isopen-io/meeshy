import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

/// Tests for ConversationViewModel lazy-computed index caches.
///
/// Verifies that `cachedLastReceivedIndex` and `cachedLastSentIndex` memoize
/// correctly, return nil when no matching message exists, and reset when
/// `messages` changes structurally.
@MainActor
final class ConversationViewModelCacheTests: XCTestCase {

    private let conversationId = "000000000000000000000001"
    private let myUserId = "000000000000000000000099"
    private let otherUserId = "000000000000000000000002"

    // MARK: - Factory

    private func makeSUT() -> ConversationViewModel {
        let authManager = MockAuthManager()
        let currentUser = MeeshyUser(id: myUserId, username: "me", displayName: "Me")
        authManager.simulateLoggedIn(user: currentUser)

        let pool = try! makeInMemoryPool()
        let sut = ConversationViewModel(
            conversationId: conversationId,
            unreadCount: 0,
            isDirect: false,
            participantUserId: nil,
            anonymousSession: nil,
            authManager: authManager,
            messageService: MockMessageService(),
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(
                dbPool: pool,
                persistence: MessagePersistenceActor(dbWriter: pool)
            )
        )
        sut.start()
        return sut
    }

    private func makeInMemoryPool() throws -> DatabaseQueue {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        return db
    }

    private func makeMessage(
        id: String,
        isMe: Bool,
        createdAt: Date = Date()
    ) -> Message {
        Message(
            id: id,
            conversationId: conversationId,
            senderId: isMe ? myUserId : otherUserId,
            content: "msg",
            createdAt: createdAt,
            updatedAt: createdAt,
            isMe: isMe
        )
    }

    // MARK: - cachedLastReceivedIndex (messages from others)

    func test_cachedLastReceivedIndex_emptyMessages_returnsNil() {
        let sut = makeSUT()
        sut.messages = []
        XCTAssertNil(sut.cachedLastReceivedIndex)
    }

    func test_cachedLastReceivedIndex_allMine_returnsNil() {
        let sut = makeSUT()
        sut.messages = [
            makeMessage(id: "m1", isMe: true),
            makeMessage(id: "m2", isMe: true),
        ]
        XCTAssertNil(sut.cachedLastReceivedIndex,
            "All-my-messages list has no received messages, index must be nil")
    }

    func test_cachedLastReceivedIndex_mixedMessages_returnsLastOthersIndex() {
        let sut = makeSUT()
        sut.messages = [
            makeMessage(id: "m1", isMe: false), // index 0
            makeMessage(id: "m2", isMe: true),  // index 1
            makeMessage(id: "m3", isMe: false), // index 2 — last received
            makeMessage(id: "m4", isMe: true),  // index 3
        ]
        XCTAssertEqual(sut.cachedLastReceivedIndex, 2,
            "Last received message is at index 2")
    }

    func test_cachedLastReceivedIndex_memoizedOnSecondCall() {
        let sut = makeSUT()
        sut.messages = [
            makeMessage(id: "m1", isMe: false),
            makeMessage(id: "m2", isMe: true),
        ]
        let first = sut.cachedLastReceivedIndex
        let second = sut.cachedLastReceivedIndex
        XCTAssertEqual(first, second,
            "Cache must return the same value on repeated calls without messages changing")
    }

    func test_cachedLastReceivedIndex_resetAfterMessagesChange() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "m1", isMe: false)] // index 0
        XCTAssertEqual(sut.cachedLastReceivedIndex, 0)

        // Prepend a new received message — last received is now index 1
        sut.messages = [
            makeMessage(id: "m0", isMe: false), // index 0
            makeMessage(id: "m1", isMe: false), // index 1 — new last received
        ]
        XCTAssertEqual(sut.cachedLastReceivedIndex, 1,
            "Cache must recompute after messages array changes")
    }

    func test_cachedLastReceivedIndex_clearedWhenMessagesBecomesEmpty() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "m1", isMe: false)]
        XCTAssertEqual(sut.cachedLastReceivedIndex, 0)

        sut.messages = []
        XCTAssertNil(sut.cachedLastReceivedIndex,
            "Cache must return nil after messages is cleared")
    }

    // MARK: - cachedLastSentIndex (my messages)

    func test_cachedLastSentIndex_emptyMessages_returnsNil() {
        let sut = makeSUT()
        sut.messages = []
        XCTAssertNil(sut.cachedLastSentIndex)
    }

    func test_cachedLastSentIndex_allOthers_returnsNil() {
        let sut = makeSUT()
        sut.messages = [
            makeMessage(id: "m1", isMe: false),
            makeMessage(id: "m2", isMe: false),
        ]
        XCTAssertNil(sut.cachedLastSentIndex,
            "All-others list has no sent messages, index must be nil")
    }

    func test_cachedLastSentIndex_mixedMessages_returnsLastMineIndex() {
        let sut = makeSUT()
        sut.messages = [
            makeMessage(id: "m1", isMe: true),  // index 0
            makeMessage(id: "m2", isMe: false), // index 1
            makeMessage(id: "m3", isMe: true),  // index 2 — last sent
            makeMessage(id: "m4", isMe: false), // index 3
        ]
        XCTAssertEqual(sut.cachedLastSentIndex, 2,
            "Last sent message is at index 2")
    }

    func test_cachedLastSentIndex_memoizedOnSecondCall() {
        let sut = makeSUT()
        sut.messages = [
            makeMessage(id: "m1", isMe: true),
            makeMessage(id: "m2", isMe: false),
        ]
        let first = sut.cachedLastSentIndex
        let second = sut.cachedLastSentIndex
        XCTAssertEqual(first, second,
            "Cache must return the same value on repeated calls without messages changing")
    }

    func test_cachedLastSentIndex_resetAfterMessagesChange() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "m1", isMe: true)] // index 0
        XCTAssertEqual(sut.cachedLastSentIndex, 0)

        // Append a new sent message — last sent is now index 1
        sut.messages = [
            makeMessage(id: "m1", isMe: true), // index 0
            makeMessage(id: "m2", isMe: true), // index 1 — new last sent
        ]
        XCTAssertEqual(sut.cachedLastSentIndex, 1,
            "Cache must recompute after messages array changes")
    }

    // MARK: - lastReceivedMessageId / lastSentMessageId convenience

    func test_lastReceivedMessageId_noReceivedMessages_returnsNil() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "m1", isMe: true)]
        XCTAssertNil(sut.lastReceivedMessageId)
    }

    func test_lastReceivedMessageId_returnsIdOfLastReceivedMessage() {
        let sut = makeSUT()
        sut.messages = [
            makeMessage(id: "m1", isMe: false),
            makeMessage(id: "m2", isMe: true),
            makeMessage(id: "m3", isMe: false),
        ]
        XCTAssertEqual(sut.lastReceivedMessageId, "m3")
    }

    func test_lastSentMessageId_noSentMessages_returnsNil() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "m1", isMe: false)]
        XCTAssertNil(sut.lastSentMessageId)
    }

    func test_lastSentMessageId_returnsIdOfLastSentMessage() {
        let sut = makeSUT()
        sut.messages = [
            makeMessage(id: "m1", isMe: true),
            makeMessage(id: "m2", isMe: false),
            makeMessage(id: "m3", isMe: true),
        ]
        XCTAssertEqual(sut.lastSentMessageId, "m3")
    }

    // MARK: - Cache independence

    func test_receivedAndSentCaches_areIndependent() {
        let sut = makeSUT()
        sut.messages = [
            makeMessage(id: "r1", isMe: false), // index 0
            makeMessage(id: "s1", isMe: true),  // index 1
            makeMessage(id: "r2", isMe: false), // index 2
            makeMessage(id: "s2", isMe: true),  // index 3
        ]
        XCTAssertEqual(sut.cachedLastReceivedIndex, 2, "Last received at index 2")
        XCTAssertEqual(sut.cachedLastSentIndex, 3, "Last sent at index 3")
        XCTAssertEqual(sut.lastReceivedMessageId, "r2")
        XCTAssertEqual(sut.lastSentMessageId, "s2")
    }
}
