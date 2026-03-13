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
                firstName: nil, lastName: nil, avatar: nil,
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
        let response = APIResponse(success: true, data: ["status": "ok"], error: nil)
        mock.stub("/conversations/conv1/mark-read", result: response)

        try await service.markRead(conversationId: "conv1")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations/conv1/mark-read")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - markUnread

    func testMarkUnreadCallsCorrectEndpoint() async throws {
        let response = APIResponse(success: true, data: ["status": "ok"], error: nil)
        mock.stub("/conversations/conv1/mark-unread", result: response)

        try await service.markUnread(conversationId: "conv1")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations/conv1/mark-unread")
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
}
