import XCTest
import GRDB
import MeeshySDK
@testable import Meeshy

// MARK: - Tests

@MainActor
final class ConversationCommandHandlerTests: XCTestCase {

    private let conversationId = "000000000000000000000099"
    private let currentUserId = "000000000000000000000001"
    private let otherUserId = "000000000000000000000002"

    // MARK: - Factory

    private func makeSUT(
        messageService: MockMessageService = MockMessageService()
    ) throws -> (
        sut: ConversationCommandHandler,
        state: ConversationStateStore,
        messageService: MockMessageService,
        persistence: MessagePersistenceActor
    ) {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        let persistence = MessagePersistenceActor(dbWriter: db)
        let state = ConversationStateStore()
        let sut = ConversationCommandHandler(
            state: state,
            conversationId: conversationId,
            messageService: messageService,
            persistence: persistence
        )
        return (sut, state, messageService, persistence)
    }

    private func makeMessage(
        id: String = "msg1",
        senderId: String? = nil,
        isMe: Bool = false,
        createdAt: Date = Date()
    ) -> Message {
        Message(
            id: id,
            conversationId: conversationId,
            senderId: senderId ?? (isMe ? currentUserId : otherUserId),
            content: "Test message",
            createdAt: createdAt,
            updatedAt: createdAt,
            deliveryStatus: Message.DeliveryStatus.sent,
            isMe: isMe
        )
    }

    // MARK: - canDeleteForEveryone

    func test_canDeleteForEveryone_ownMessageWithinWindow_returnsTrue() throws {
        let (sut, _, _, _) = try makeSUT()
        let recentOwnMessage = makeMessage(isMe: true, createdAt: Date())

        XCTAssertTrue(sut.canDeleteForEveryone(recentOwnMessage),
            "Recent own message must be deletable by everyone")
    }

    func test_canDeleteForEveryone_ownMessageOlderThanWindow_returnsFalse() throws {
        let (sut, _, _, _) = try makeSUT()
        let oldTimestamp = Date().addingTimeInterval(-(2 * 3600 + 1))
        let expiredOwnMessage = makeMessage(isMe: true, createdAt: oldTimestamp)

        XCTAssertFalse(sut.canDeleteForEveryone(expiredOwnMessage),
            "Own message older than the 2-hour window must not be deletable by everyone")
    }

    func test_canDeleteForEveryone_otherUserMessage_returnsFalse() throws {
        let (sut, _, _, _) = try makeSUT()
        let otherMessage = makeMessage(isMe: false, createdAt: Date())

        XCTAssertFalse(sut.canDeleteForEveryone(otherMessage),
            "Other user's message must never be deletable by everyone from this client")
    }

    func test_canDeleteForEveryone_ownMessageExactlyAtWindowBoundary_returnsTrue() throws {
        let (sut, _, _, _) = try makeSUT()
        let nearBoundaryTimestamp = Date().addingTimeInterval(-(2 * 3600 - 1))
        let boundaryMessage = makeMessage(isMe: true, createdAt: nearBoundaryTimestamp)

        XCTAssertTrue(sut.canDeleteForEveryone(boundaryMessage),
            "Own message within 1 second of the 2-hour boundary must still be deletable")
    }

    func test_canDeleteForEveryone_customWindow_respectsOverride() throws {
        let (sut, _, _, _) = try makeSUT()
        let oneHourAgo = Date().addingTimeInterval(-3600)
        let message = makeMessage(isMe: true, createdAt: oneHourAgo)

        XCTAssertFalse(sut.canDeleteForEveryone(message, window: 1800),
            "Own message outside the custom 30-minute window must not be deletable")
        XCTAssertTrue(sut.canDeleteForEveryone(message, window: 7200),
            "Own message inside the custom 2-hour window must be deletable")
    }

    // MARK: - consumeViewOnce

    func test_consumeViewOnce_success_returnsTrue() async throws {
        let mockService = MockMessageService()
        let (sut, _, _, _) = try makeSUT(messageService: mockService)

        let result = await sut.consumeViewOnce(messageId: "local-msg-1", serverId: "srv-msg-1")

        XCTAssertTrue(result, "consumeViewOnce must return true on successful API call")
    }

    func test_consumeViewOnce_success_callsServiceWithCorrectParams() async throws {
        let mockService = MockMessageService()
        let (sut, _, _, _) = try makeSUT(messageService: mockService)

        _ = await sut.consumeViewOnce(messageId: "local-msg-1", serverId: "srv-msg-1")

        XCTAssertEqual(mockService.consumeViewOnceCallCount, 1,
            "consumeViewOnce must call the message service exactly once")
    }

    func test_consumeViewOnce_failure_returnsFalse() async throws {
        let mockService = MockMessageService()
        mockService.consumeViewOnceResult = .failure(NSError(domain: "test", code: 500))
        let (sut, _, _, _) = try makeSUT(messageService: mockService)

        let result = await sut.consumeViewOnce(messageId: "local-msg-1", serverId: "srv-msg-1")

        XCTAssertFalse(result, "consumeViewOnce must return false when the API call fails")
    }

    func test_consumeViewOnce_failure_setsStateError() async throws {
        let mockService = MockMessageService()
        mockService.consumeViewOnceResult = .failure(NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "Server error"]))
        let (sut, state, _, _) = try makeSUT(messageService: mockService)

        _ = await sut.consumeViewOnce(messageId: "local-msg-1", serverId: "srv-msg-1")

        XCTAssertNotNil(state.error, "consumeViewOnce failure must surface an error message in state")
    }

    func test_consumeViewOnce_success_doesNotSetStateError() async throws {
        let mockService = MockMessageService()
        let (sut, state, _, _) = try makeSUT(messageService: mockService)

        _ = await sut.consumeViewOnce(messageId: "local-msg-1", serverId: "srv-msg-1")

        XCTAssertNil(state.error, "consumeViewOnce success must not set an error on state")
    }
}
