import XCTest
@testable import MeeshySDK

final class MessageServiceTests: XCTestCase {
    private var mock: MockAPIClient!
    private var service: MessageService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = MessageService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - Helpers

    private let convId = "conv123"
    private let msgId = "msg456"

    private func makeMessage(id: String = "msg456") -> APIMessage {
        APIMessage(
            id: id, conversationId: "conv123", senderId: "user1",
            content: "Hello", originalLanguage: "en",
            messageType: "text", messageSource: "user", isEdited: false,
            isDeleted: false, replyToId: nil, storyReplyToId: nil,
            forwardedFromId: nil, forwardedFromConversationId: nil,
            pinnedAt: nil, pinnedBy: nil, isViewOnce: false, isBlurred: false,
            expiresAt: nil, isEncrypted: false, encryptionMode: nil,
            createdAt: Date(), updatedAt: nil,
            sender: APIMessageSender(id: "user1", username: "alice", displayName: "Alice", avatar: nil),
            attachments: nil, replyTo: nil, forwardedFrom: nil,
            forwardedFromConversation: nil, reactionSummary: nil,
            reactionCount: nil, currentUserReactions: nil,
            deliveredToAllAt: nil, readByAllAt: nil,
            deliveredCount: nil, readCount: nil, translations: nil
        )
    }

    private func makeMessagesResponse(messages: [APIMessage]? = nil) -> MessagesAPIResponse {
        MessagesAPIResponse(
            success: true,
            data: messages ?? [makeMessage()],
            pagination: OffsetPagination(total: 1, hasMore: false, limit: 30, offset: 0),
            cursorPagination: nil,
            hasNewer: nil
        )
    }

    // MARK: - list

    func testListReturnsMessages() async throws {
        let expected = makeMessagesResponse()
        mock.stub("/conversations/\(convId)/messages", result: expected)

        let result = try await service.list(conversationId: convId)

        XCTAssertEqual(result.data.count, 1)
        XCTAssertEqual(result.data[0].id, "msg456")
        XCTAssertTrue(result.success)
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations/\(convId)/messages")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    // MARK: - listBefore

    func testListBeforeCallsWithCorrectEndpoint() async throws {
        let expected = makeMessagesResponse()
        mock.stub("/conversations/\(convId)/messages", result: expected)

        let result = try await service.listBefore(conversationId: convId, before: "cursor_abc")

        XCTAssertEqual(result.data.count, 1)
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations/\(convId)/messages")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    // MARK: - listAround

    func testListAroundCallsWithCorrectEndpoint() async throws {
        let expected = makeMessagesResponse()
        mock.stub("/conversations/\(convId)/messages", result: expected)

        let result = try await service.listAround(conversationId: convId, around: "msg_center")

        XCTAssertEqual(result.data.count, 1)
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations/\(convId)/messages")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    // MARK: - send

    func testSendReturnsResponseData() async throws {
        let sendData = SendMessageResponseData(
            id: "newMsg1", conversationId: convId, senderId: "user1",
            content: "Hi there", messageType: "text", createdAt: Date()
        )
        let response = APIResponse(success: true, data: sendData, error: nil)
        mock.stub("/conversations/\(convId)/messages", result: response)

        let request = SendMessageRequest(content: "Hi there")
        let result = try await service.send(conversationId: convId, request: request)

        XCTAssertEqual(result.id, "newMsg1")
        XCTAssertEqual(result.content, "Hi there")
        XCTAssertEqual(result.conversationId, convId)
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations/\(convId)/messages")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - edit

    func testEditReturnsUpdatedMessage() async throws {
        let editedMsg = makeMessage(id: msgId)
        let response = APIResponse(success: true, data: editedMsg, error: nil)
        mock.stub("/messages/\(msgId)", result: response)

        let result = try await service.edit(messageId: msgId, content: "Updated text")

        XCTAssertEqual(result.id, msgId)
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/messages/\(msgId)")
        XCTAssertEqual(mock.lastRequest?.method, "PUT")
    }

    // MARK: - delete

    func testDeleteCallsCorrectEndpoint() async throws {
        let response = APIResponse(success: true, data: ["deleted": true], error: nil)
        mock.stub("/conversations/\(convId)/messages/\(msgId)", result: response)

        try await service.delete(conversationId: convId, messageId: msgId)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations/\(convId)/messages/\(msgId)")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    // MARK: - pin

    func testPinCallsCorrectEndpoint() async throws {
        let response = APIResponse(success: true, data: ["status": "pinned"], error: nil)
        mock.stub("/conversations/\(convId)/messages/\(msgId)/pin", result: response)

        try await service.pin(conversationId: convId, messageId: msgId)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations/\(convId)/messages/\(msgId)/pin")
        XCTAssertEqual(mock.lastRequest?.method, "PUT")
    }

    // MARK: - unpin

    func testUnpinCallsCorrectEndpoint() async throws {
        let response = APIResponse(success: true, data: ["unpinned": true], error: nil)
        mock.stub("/conversations/\(convId)/messages/\(msgId)/pin", result: response)

        try await service.unpin(conversationId: convId, messageId: msgId)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations/\(convId)/messages/\(msgId)/pin")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    // MARK: - consumeViewOnce

    func testConsumeViewOnceReturnsResponse() async throws {
        let consumeData = ConsumeViewOnceResponse(
            messageId: msgId, viewOnceCount: 1, maxViewOnceCount: 3, isFullyConsumed: false
        )
        let response = APIResponse(success: true, data: consumeData, error: nil)
        mock.stub("/conversations/\(convId)/messages/\(msgId)/consume", result: response)

        let result = try await service.consumeViewOnce(conversationId: convId, messageId: msgId)

        XCTAssertEqual(result.messageId, msgId)
        XCTAssertEqual(result.viewOnceCount, 1)
        XCTAssertEqual(result.maxViewOnceCount, 3)
        XCTAssertFalse(result.isFullyConsumed)
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations/\(convId)/messages/\(msgId)/consume")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - search

    func testSearchReturnsMessages() async throws {
        let expected = makeMessagesResponse()
        mock.stub("/conversations/\(convId)/messages/search", result: expected)

        let result = try await service.search(conversationId: convId, query: "hello")

        XCTAssertEqual(result.data.count, 1)
        XCTAssertTrue(result.success)
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations/\(convId)/messages/search")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    // MARK: - searchWithCursor

    func testSearchWithCursorCallsCorrectEndpoint() async throws {
        let expected = makeMessagesResponse()
        mock.stub("/conversations/\(convId)/messages/search", result: expected)

        let result = try await service.searchWithCursor(conversationId: convId, query: "hello", cursor: "next_abc")

        XCTAssertEqual(result.data.count, 1)
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations/\(convId)/messages/search")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    // MARK: - Error case

    func testSendThrowsOnNetworkError() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            let request = SendMessageRequest(content: "test")
            _ = try await service.send(conversationId: convId, request: request)
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .network(.noConnection) = error {
                // expected
            } else {
                XCTFail("Expected MeeshyError.network(.noConnection), got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }

        XCTAssertEqual(mock.requestCount, 1)
    }
}
