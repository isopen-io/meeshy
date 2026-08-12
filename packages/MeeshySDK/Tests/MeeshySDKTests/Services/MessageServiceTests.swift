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
            id: id, clientMessageId: nil, conversationId: "conv123", senderId: "user1",
            content: "Hello", originalLanguage: "en",
            messageType: "text", messageSource: "user", isEdited: false,
            editedAt: nil,
            deletedAt: nil, replyToId: nil, storyReplyToId: nil, postReplyTo: nil,
            forwardedFromId: nil, forwardedFromConversationId: nil,
            pinnedAt: nil, pinnedBy: nil, isViewOnce: false, isBlurred: false,
            expiresAt: nil, isEncrypted: false, encryptionMode: nil,
            createdAt: Date(), updatedAt: nil,
            sender: APIMessageSender(id: "user1", username: "alice", displayName: "Alice", avatar: nil, type: nil, userId: "userId1", firstName: nil, lastName: nil, user: nil),
            attachments: nil, replyTo: nil, forwardedFrom: nil,
            forwardedFromConversation: nil, reactionSummary: nil,
            reactionCount: nil, currentUserReactions: nil,
            deliveredToAllAt: nil, readByAllAt: nil,
            deliveredCount: nil, readCount: nil, recipientCount: nil, effectFlags: nil, translations: nil,
            mentionedUsers: nil, callSummary: nil
        )
    }

    private func makeMessagesResponse(messages: [APIMessage]? = nil) -> MessagesAPIResponse {
        MessagesAPIResponse(
            success: true,
            data: messages ?? [makeMessage()],
            pagination: OffsetPagination(total: 1, hasMore: false, limit: 30, offset: 0),
            cursorPagination: nil,
            hasNewer: nil,
            meta: nil
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

    /// Bandwidth optimization (Niveau 1): when GRDB already holds the text
    /// translations for the messages we are about to fetch (warm-cache refresh),
    /// the caller passes `includeTranslations: false` to opt out of having the
    /// gateway return them. Verifies that the SDK forwards this to the URL as
    /// `?include_translations=false`. Default `true` preserves existing call
    /// sites that haven't been migrated yet.
    func testListForwardsIncludeTranslationsQueryParam() async throws {
        let expected = makeMessagesResponse()
        mock.stub("/conversations/\(convId)/messages", result: expected)

        _ = try await service.list(conversationId: convId, includeTranslations: false)

        let queryItems = try XCTUnwrap(mock.lastRequest?.queryItems)
        XCTAssertTrue(
            queryItems.contains(URLQueryItem(name: "include_translations", value: "false")),
            "list(includeTranslations: false) must pass include_translations=false; got \(queryItems)"
        )
    }

    func testListDefaultsIncludeTranslationsToTrue() async throws {
        let expected = makeMessagesResponse()
        mock.stub("/conversations/\(convId)/messages", result: expected)

        _ = try await service.list(conversationId: convId)

        let queryItems = try XCTUnwrap(mock.lastRequest?.queryItems)
        XCTAssertTrue(
            queryItems.contains(URLQueryItem(name: "include_translations", value: "true")),
            "list() default must include translations for cold-start callers; got \(queryItems)"
        )
    }

    // MARK: - languages (E3 — Prisme bandwidth filter, mirrors gateway A3)

    /// When the caller passes a non-empty Prisme language set, the SDK must
    /// forward it as `?languages=fr,en` so the gateway returns only those text
    /// + audio translations instead of every available language.
    func testListForwardsLanguagesQueryParam() async throws {
        mock.stub("/conversations/\(convId)/messages", result: makeMessagesResponse())

        _ = try await service.list(conversationId: convId, languages: ["fr", "en"])

        let queryItems = try XCTUnwrap(mock.lastRequest?.queryItems)
        XCTAssertTrue(
            queryItems.contains(URLQueryItem(name: "languages", value: "fr,en")),
            "list(languages:) must serialize the set as a comma list; got \(queryItems)"
        )
    }

    /// Default (nil) keeps the historical all-languages behaviour: no
    /// `languages` query item is emitted, so the gateway returns every
    /// translation exactly as before.
    func testListOmitsLanguagesWhenNil() async throws {
        mock.stub("/conversations/\(convId)/messages", result: makeMessagesResponse())

        _ = try await service.list(conversationId: convId)

        let queryItems = try XCTUnwrap(mock.lastRequest?.queryItems)
        XCTAssertFalse(
            queryItems.contains { $0.name == "languages" },
            "list() without languages must NOT emit a languages filter; got \(queryItems)"
        )
    }

    /// An empty array is treated the same as nil (defensive — never emit an
    /// empty `?languages=` that the gateway would read as "filter to nothing").
    func testListOmitsLanguagesWhenEmpty() async throws {
        mock.stub("/conversations/\(convId)/messages", result: makeMessagesResponse())

        _ = try await service.list(conversationId: convId, languages: [])

        let queryItems = try XCTUnwrap(mock.lastRequest?.queryItems)
        XCTAssertFalse(
            queryItems.contains { $0.name == "languages" },
            "list(languages: []) must NOT emit a languages filter; got \(queryItems)"
        )
    }

    /// The filter is plumbed through the cursor/watermark/around variants too,
    /// not just offset pagination — pagination of a filtered list must stay
    /// filtered.
    func testListAfterForwardsLanguagesQueryParam() async throws {
        mock.stub("/conversations/\(convId)/messages", result: makeMessagesResponse())

        _ = try await service.listAfter(
            conversationId: convId, after: Date(timeIntervalSince1970: 1_750_000_000.5),
            languages: ["es"]
        )

        let queryItems = try XCTUnwrap(mock.lastRequest?.queryItems)
        XCTAssertTrue(
            queryItems.contains(URLQueryItem(name: "languages", value: "es")),
            "listAfter(languages:) must forward the filter; got \(queryItems)"
        )
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

    // MARK: - listAfter

    func testListAfterCallsWithCorrectEndpoint() async throws {
        let expected = makeMessagesResponse()
        mock.stub("/conversations/\(convId)/messages", result: expected)

        let watermark = Date(timeIntervalSince1970: 1_750_000_000.5)
        let result = try await service.listAfter(conversationId: convId, after: watermark)

        XCTAssertEqual(result.data.count, 1)
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations/\(convId)/messages")
        XCTAssertEqual(mock.lastRequest?.method, "GET")

        let queryItems = try XCTUnwrap(mock.lastRequest?.queryItems)
        let afterItem = try XCTUnwrap(
            queryItems.first { $0.name == "after" },
            "listAfter must forward the forward watermark as an `after` query item; got \(queryItems)"
        )
        let afterValue = try XCTUnwrap(afterItem.value)
        // The watermark must keep its fractional seconds so a millisecond-precise
        // high-water mark survives the round trip (gateway compares strict `>`).
        XCTAssertTrue(afterValue.contains("."), "after watermark must carry fractional seconds; got \(afterValue)")

        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let parsed = try XCTUnwrap(parser.date(from: afterValue))
        XCTAssertEqual(parsed.timeIntervalSince1970, watermark.timeIntervalSince1970, accuracy: 0.001)
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
            id: "newMsg1", clientMessageId: nil, conversationId: convId, senderId: "user1",
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
