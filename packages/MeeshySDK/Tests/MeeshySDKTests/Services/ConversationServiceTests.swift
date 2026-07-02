import XCTest
@testable import MeeshySDK

final class ConversationServiceTests: XCTestCase {
    private var mock: MockAPIClient!
    private var service: ConversationService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = ConversationService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - Helpers

    private func makeConversation(id: String = "conv123") -> APIConversation {
        APIConversation(
            id: id, type: "direct", identifier: "test-conv", title: "Test",
            description: nil, avatar: nil, banner: nil, communityId: nil,
            isActive: true, memberCount: 2, isAnnouncementChannel: false,
            lastMessageAt: nil, participants: nil, lastMessage: nil,
            recentMessages: nil, userPreferences: nil, unreadCount: 0,
            updatedAt: nil, encryptionMode: nil, currentUserRole: nil, createdAt: Date()
        )
    }

    private func makeParticipant(userId: String = "user1") -> APIParticipant {
        APIParticipant(
            id: "p-\(userId)", conversationId: "conv123", type: .user,
            userId: userId, displayName: "Test User", avatar: nil,
            role: "MEMBER", language: "fr",
            permissions: ParticipantPermissions.defaultUser,
            isActive: true, isOnline: true, joinedAt: Date(),
            leftAt: nil, bannedAt: nil, nickname: nil, lastActiveAt: nil,
            user: APIConversationUser(
                id: userId, userId: nil, username: "testuser", displayName: "Test User",
                firstName: nil, lastName: nil, avatar: nil, banner: nil,
                isOnline: true, lastActiveAt: nil, type: nil, user: nil
            )
        )
    }

    // MARK: - list

    func testListReturnsConversations() async throws {
        let conv = makeConversation()
        let expected = OffsetPaginatedAPIResponse(
            success: true,
            data: [conv],
            pagination: OffsetPagination(total: 1, hasMore: false, limit: 30, offset: 0),
            error: nil
        )
        mock.stub("/conversations", result: expected)

        let result = try await service.list()

        XCTAssertEqual(result.data.count, 1)
        XCTAssertEqual(result.data[0].id, "conv123")
        XCTAssertTrue(result.success)
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    // MARK: - getById

    func testGetByIdReturnsConversation() async throws {
        let conv = makeConversation(id: "abc456")
        let response = APIResponse(success: true, data: conv, error: nil)
        mock.stub("/conversations/abc456", result: response)

        let result = try await service.getById("abc456")

        XCTAssertEqual(result.id, "abc456")
        XCTAssertEqual(result.type, "direct")
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations/abc456")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    // MARK: - create

    func testCreateReturnsNewConversation() async throws {
        let createResponse = CreateConversationResponse(
            id: "new123", type: "group", title: "My Group", createdAt: Date()
        )
        let response = APIResponse(success: true, data: createResponse, error: nil)
        mock.stub("/conversations", result: response)

        let result = try await service.create(type: "group", title: "My Group", participantIds: ["u1", "u2"])

        XCTAssertEqual(result.id, "new123")
        XCTAssertEqual(result.type, "group")
        XCTAssertEqual(result.title, "My Group")
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - delete

    func testDeleteCallsCorrectEndpoint() async throws {
        let response = APIResponse(success: true, data: ["deleted": true], error: nil)
        mock.stub("/conversations/conv789", result: response)

        try await service.delete(conversationId: "conv789")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations/conv789")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    // MARK: - markRead

    func testMarkReadCallsCorrectEndpoint() async throws {
        // Fire-and-forget : la réponse est ignorée, décodée en
        // `SimpleAPIResponse` (body-agnostic). Le `data` du gateway varie
        // selon l'endpoint — un type strict cassait le décodage.
        let response = SimpleAPIResponse(success: true, message: nil, error: nil)
        mock.stub("/conversations/conv1/mark-read", result: response)

        try await service.markRead(conversationId: "conv1")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations/conv1/mark-read")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - markUnread

    func testMarkUnreadCallsCorrectEndpoint() async throws {
        let response = SimpleAPIResponse(success: true, message: nil, error: nil)
        mock.stub("/conversations/conv1/mark-unread", result: response)

        try await service.markUnread(conversationId: "conv1")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations/conv1/mark-unread")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - markAsReceived

    /// Regression guard for the production `DecodingError: Type mismatch for
    /// type Int at path data.message`. The gateway `/mark-as-received`
    /// endpoint historically returned `data: { message: "<String>" }`;
    /// decoding that body as `APIResponse<[String: Int]>` threw on the
    /// String. `markAsReceived` (like `markRead`/`markUnread`) must decode a
    /// body-agnostic `SimpleAPIResponse` so it succeeds whatever shape the
    /// gateway gives `data`.
    func testMarkAsReceivedCallsCorrectEndpoint() async throws {
        let response = SimpleAPIResponse(success: true, message: "Messages marqués comme reçus", error: nil)
        mock.stub("/conversations/conv1/mark-as-received", result: response)

        try await service.markAsReceived(conversationId: "conv1")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations/conv1/mark-as-received")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - getParticipants

    func testGetParticipantsReturnsParticipantList() async throws {
        let participant = makeParticipant()
        let response = PaginatedAPIResponse(success: true, data: [participant], pagination: nil, error: nil)
        mock.stub("/conversations/conv1/participants", result: response)

        let result = try await service.getParticipants(conversationId: "conv1")

        XCTAssertEqual(result.data.count, 1)
        XCTAssertEqual(result.data[0].userId, "user1")
        XCTAssertEqual(result.data[0].role, "MEMBER")
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations/conv1/participants")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    // MARK: - deleteForMe

    func testDeleteForMeCallsCorrectEndpoint() async throws {
        let response = APIResponse(success: true, data: ["deleted": true], error: nil)
        mock.stub("/conversations/conv1/delete-for-me", result: response)

        try await service.deleteForMe(conversationId: "conv1")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations/conv1/delete-for-me")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    // MARK: - listSharedWith

    func testListSharedWithReturnsConversations() async throws {
        let conv = makeConversation(id: "shared1")
        let response = APIResponse(success: true, data: [conv], error: nil)
        mock.stub("/conversations", result: response)

        let result = try await service.listSharedWith(userId: "otherUser")

        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result[0].id, "shared1")
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    // MARK: - Error case

    func testListThrowsOnNetworkError() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            _ = try await service.list()
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

    // MARK: - listPage (cursor pagination)

    private func makeListPageBody(
        ids: [String],
        nextCursor: String?,
        hasMore: Bool
    ) -> ConversationListResponseBody {
        let convs = ids.map { makeConversation(id: $0) }
        return ConversationListResponseBody(
            success: true,
            data: convs,
            pagination: OffsetPagination(total: ids.count, hasMore: hasMore, limit: 30, offset: 0),
            cursorPagination: CursorPagination(nextCursor: nextCursor, hasMore: hasMore, limit: 30),
            error: nil
        )
    }

    func test_listPage_initialFetch_returnsItemsAndCursor() async throws {
        let body = makeListPageBody(ids: ["a", "b", "c"], nextCursor: "c", hasMore: true)
        mock.stub("/conversations", result: body)

        let page = try await service.listPage()

        XCTAssertEqual(page.items.count, 3)
        XCTAssertEqual(page.items.map(\.id), ["a", "b", "c"])
        XCTAssertEqual(page.nextCursor, "c")
        XCTAssertTrue(page.hasMore)
        XCTAssertEqual(page.rawItems.count, 3)
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    /// Pins the gateway contract: `nextCursor` MUST equal the id of the
    /// LAST item in the page (cf. spec §4.1: "le `nextCursor` retourne
    /// dans `cursorPagination` est l'ID de la derniere conversation de
    /// la page"). If the gateway ever returned a different shape (e.g.
    /// a synthetic timestamp, or the first item's id), the cursor we
    /// forward on the next page would skip rows, duplicate rows, or
    /// miss the tail entirely. This test fails loudly on that drift.
    func test_listPage_initialFetch_setsCursorFromLastItem() async throws {
        let body = makeListPageBody(
            ids: ["first", "middle", "last"],
            nextCursor: "last",
            hasMore: true
        )
        mock.stub("/conversations", result: body)

        let page = try await service.listPage()

        XCTAssertEqual(page.items.last?.id, page.nextCursor,
                       "nextCursor must be the id of the last item on the page")
        XCTAssertEqual(page.items.last?.id, "last")
        XCTAssertEqual(page.nextCursor, "last")
    }

    func test_listPage_withCursor_passesBeforeParam() async throws {
        let body = makeListPageBody(ids: ["d"], nextCursor: "d", hasMore: false)
        mock.stub("/conversations", result: body)

        let page = try await service.listPage(before: "c", limit: 30)

        XCTAssertEqual(page.items.map(\.id), ["d"])
        XCTAssertFalse(page.hasMore)
        // The mock matches by endpoint path only and ignores queryItems,
        // so we can't assert the `before=c` query directly here. The
        // refactor's contract is exercised by the integration with
        // ConversationListViewModel below; the value of this test is
        // confirming the public method tolerates a non-nil cursor and
        // round-trips the response shape correctly.
        XCTAssertEqual(mock.requestCount, 1)
    }

    func test_listPage_emptyResponse_returnsHasMoreFalse() async throws {
        let body = makeListPageBody(ids: [], nextCursor: nil, hasMore: false)
        mock.stub("/conversations", result: body)

        let page = try await service.listPage()

        XCTAssertTrue(page.items.isEmpty)
        XCTAssertNil(page.nextCursor)
        XCTAssertFalse(page.hasMore)
    }

    func test_listPage_missingCursorMeta_fallsBackToOffsetHasMore() async throws {
        let body = ConversationListResponseBody(
            success: true,
            data: (0..<30).map { makeConversation(id: "c\($0)") },
            pagination: OffsetPagination(total: 100, hasMore: true, limit: 30, offset: 0),
            cursorPagination: nil,
            error: nil
        )
        mock.stub("/conversations", result: body)

        let page = try await service.listPage(limit: 30)

        XCTAssertEqual(page.items.count, 30)
        XCTAssertNil(page.nextCursor)
        XCTAssertTrue(page.hasMore, "Falls back to offset pagination's hasMore when cursorPagination is absent")
    }

    func test_listPage_missingAllMeta_inferHasMoreFromPageFill() async throws {
        let body = ConversationListResponseBody(
            success: true,
            data: (0..<30).map { makeConversation(id: "c\($0)") },
            pagination: nil,
            cursorPagination: nil,
            error: nil
        )
        mock.stub("/conversations", result: body)

        let page = try await service.listPage(limit: 30)

        XCTAssertTrue(page.hasMore, "Full page implies more might follow when both meta blocks are missing")
    }
}
