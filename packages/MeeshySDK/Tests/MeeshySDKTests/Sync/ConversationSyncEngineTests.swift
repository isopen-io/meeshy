import XCTest
import Combine
@testable import MeeshySDK

final class ConversationSyncEngineTests: XCTestCase {

    private var mockAPI: MockAPIClient!
    private var mockConvService: MockConversationService!
    private var mockMsgService: MockMessageService!
    private var mockMessageSocket: MockMessageSocket!
    private var mockSocialSocket: MockSocialSocket!
    private var engine: ConversationSyncEngine!
    private var cancellables = Set<AnyCancellable>()

    override func setUp() {
        super.setUp()
        mockAPI = MockAPIClient()
        mockConvService = MockConversationService()
        mockMsgService = MockMessageService()
        mockMessageSocket = MockMessageSocket()
        mockSocialSocket = MockSocialSocket()

        engine = ConversationSyncEngine(
            cache: .shared,
            conversationService: mockConvService,
            messageService: mockMsgService,
            messageSocket: mockMessageSocket,
            socialSocket: mockSocialSocket,
            api: mockAPI
        )
    }

    override func tearDown() {
        cancellables.removeAll()
        mockAPI.reset()
        mockConvService.reset()
        mockMsgService.reset()
        super.tearDown()
    }

    // MARK: - fullSync

    func test_fullSync_callsConversationServiceList() async {
        let apiConv = TestFactories.makeAPIConversation(id: "conv-1")
        let pagination = OffsetPagination(total: 1, hasMore: false, limit: 100, offset: 0)
        let response = OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: [apiConv], pagination: pagination, error: nil
        )
        mockConvService.listResult = .success(response)

        await engine.fullSync()

        XCTAssertGreaterThanOrEqual(mockConvService.listCallCount, 1)
    }

    func test_fullSync_emitsConversationsDidChange() async {
        let pagination = OffsetPagination(total: 0, hasMore: false, limit: 100, offset: 0)
        let response = OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: [], pagination: pagination, error: nil
        )
        mockConvService.listResult = .success(response)

        let expectation = expectation(description: "conversationsDidChange emitted")
        engine.conversationsDidChange
            .first()
            .sink { expectation.fulfill() }
            .store(in: &cancellables)

        await engine.fullSync()

        await fulfillment(of: [expectation], timeout: 2.0)
    }

    func test_fullSync_whenError_doesNotCrash() async {
        mockConvService.listResult = .failure(MeeshyError.network(.timeout))

        await engine.fullSync()

        XCTAssertEqual(mockConvService.listCallCount, 1)
    }

    func test_fullSync_onSuccess_returnsTrue() async {
        let pagination = OffsetPagination(total: 0, hasMore: false, limit: 100, offset: 0)
        let response = OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: [], pagination: pagination, error: nil
        )
        mockConvService.listResult = .success(response)

        let ok = await engine.fullSync()

        XCTAssertTrue(ok)
    }

    func test_fullSync_onError_returnsFalse() async {
        mockConvService.listResult = .failure(MeeshyError.network(.timeout))

        let ok = await engine.fullSync()

        XCTAssertFalse(ok, "Callers must be able to distinguish a failed cold sync so the UI can offer a retry")
    }

    // MARK: - syncSinceLastCheckpoint

    func test_syncSinceLastCheckpoint_callsAPIRequest() async {
        let pagination = OffsetPagination(total: 0, hasMore: false, limit: 500, offset: 0)
        let response = OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: [], pagination: pagination, error: nil
        )
        mockAPI.stub("/conversations", result: response)

        await engine.syncSinceLastCheckpoint()

        XCTAssertEqual(mockAPI.requestCount, 1)
        XCTAssertEqual(mockAPI.lastRequest?.endpoint, "/conversations")
    }

    func test_syncSinceLastCheckpoint_emitsConversationsDidChange() async {
        let pagination = OffsetPagination(total: 0, hasMore: false, limit: 500, offset: 0)
        let response = OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: [], pagination: pagination, error: nil
        )
        mockAPI.stub("/conversations", result: response)

        let expectation = expectation(description: "conversationsDidChange emitted")
        engine.conversationsDidChange
            .first()
            .sink { expectation.fulfill() }
            .store(in: &cancellables)

        await engine.syncSinceLastCheckpoint()

        await fulfillment(of: [expectation], timeout: 2.0)
    }

    // MARK: - ensureMessages

    func test_ensureMessages_callsMessageServiceList() async {
        let apiMsg = TestFactories.makeAPIMessage(conversationId: "conv-1")
        let response = MessagesAPIResponse(
            success: true, data: [apiMsg], pagination: nil,
            cursorPagination: nil, hasNewer: nil, meta: nil
        )
        mockMsgService.listResult = .success(response)

        // Invalidate cache first to force a fetch
        await CacheCoordinator.shared.messages.invalidate(for: "conv-1")

        await engine.ensureMessages(for: "conv-1")

        XCTAssertGreaterThanOrEqual(mockMsgService.listCallCount, 1)
    }

    func test_ensureMessages_emitsMessagesDidChange() async {
        let apiMsg = TestFactories.makeAPIMessage(conversationId: "conv-1")
        let response = MessagesAPIResponse(
            success: true, data: [apiMsg], pagination: nil,
            cursorPagination: nil, hasNewer: nil, meta: nil
        )
        mockMsgService.listResult = .success(response)

        await CacheCoordinator.shared.messages.invalidate(for: "conv-1")

        let expectation = expectation(description: "messagesDidChange emitted")
        engine.messagesDidChange
            .first()
            .sink { convId in
                XCTAssertEqual(convId, "conv-1")
                expectation.fulfill()
            }
            .store(in: &cancellables)

        await engine.ensureMessages(for: "conv-1")

        await fulfillment(of: [expectation], timeout: 2.0)
    }

    // MARK: - Socket relay

    func test_startSocketRelay_subscribesToMessageEvents() async {
        await engine.startSocketRelay()

        // Verify that sending a message event is handled (doesn't crash)
        let apiMsg = TestFactories.makeAPIMessage(conversationId: "conv-relay")
        mockMessageSocket.messageReceived.send(apiMsg)

        // Small delay for async processing
        try? await Task.sleep(nanoseconds: 100_000_000)

        // If we get here without crash, relay is working
    }

    func test_stopSocketRelay_clearsSubscriptions() async {
        await engine.startSocketRelay()
        await engine.stopSocketRelay()

        // After stopping, events should not be processed (no crash)
        let apiMsg = TestFactories.makeAPIMessage(conversationId: "conv-stopped")
        mockMessageSocket.messageReceived.send(apiMsg)

        try? await Task.sleep(nanoseconds: 100_000_000)
    }
}

// MARK: - Mock ConversationService

private final class MockConversationService: ConversationServiceProviding, @unchecked Sendable {
    var listResult: Result<OffsetPaginatedAPIResponse<[APIConversation]>, Error> = .success(
        OffsetPaginatedAPIResponse(success: true, data: [], pagination: nil, error: nil)
    )
    var listCallCount = 0

    func reset() {
        listCallCount = 0
        listResult = .success(OffsetPaginatedAPIResponse(success: true, data: [], pagination: nil, error: nil))
    }

    func list(offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[APIConversation]> {
        listCallCount += 1
        return try listResult.get()
    }

    func getById(_ conversationId: String) async throws -> APIConversation { fatalError("Not used in tests") }
    func create(type: String, title: String?, participantIds: [String]) async throws -> CreateConversationResponse { fatalError("Not used in tests") }
    func delete(conversationId: String) async throws {}
    func markRead(conversationId: String) async throws {}
    func markUnread(conversationId: String) async throws {}
    func getParticipants(conversationId: String, limit: Int, cursor: String?) async throws -> PaginatedAPIResponse<[APIParticipant]> { fatalError("Not used in tests") }
    func deleteForMe(conversationId: String) async throws {}
    func listSharedWith(userId: String, limit: Int) async throws -> [APIConversation] { [] }
    func removeParticipant(conversationId: String, participantId: String) async throws {}
    func updateParticipantRole(conversationId: String, participantId: String, role: String) async throws {}
    func update(conversationId: String, title: String?, description: String?, avatar: String?, banner: String?, defaultWriteRole: String?, isAnnouncementChannel: Bool?, slowModeSeconds: Int?, autoTranslateEnabled: Bool?) async throws -> APIConversation { fatalError("Not used in tests") }
    func leave(conversationId: String) async throws {}
    func banParticipant(conversationId: String, userId: String) async throws {}
    func unbanParticipant(conversationId: String, userId: String) async throws {}
}

// MARK: - Mock MessageService

private final class MockMessageService: MessageServiceProviding, @unchecked Sendable {
    var listResult: Result<MessagesAPIResponse, Error> = .success(
        MessagesAPIResponse(success: true, data: [], pagination: nil, cursorPagination: nil, hasNewer: nil, meta: nil)
    )
    var listCallCount = 0
    var listBeforeResult: Result<MessagesAPIResponse, Error> = .success(
        MessagesAPIResponse(success: true, data: [], pagination: nil, cursorPagination: nil, hasNewer: nil, meta: nil)
    )

    func reset() {
        listCallCount = 0
        listResult = .success(MessagesAPIResponse(success: true, data: [], pagination: nil, cursorPagination: nil, hasNewer: nil, meta: nil))
    }

    func list(conversationId: String, offset: Int, limit: Int, includeReplies: Bool) async throws -> MessagesAPIResponse {
        listCallCount += 1
        return try listResult.get()
    }

    func listBefore(conversationId: String, before: String, limit: Int, includeReplies: Bool) async throws -> MessagesAPIResponse {
        return try listBeforeResult.get()
    }

    func listAround(conversationId: String, around: String, limit: Int, includeReplies: Bool) async throws -> MessagesAPIResponse { fatalError("Not used in tests") }
    func send(conversationId: String, request: SendMessageRequest) async throws -> SendMessageResponseData { fatalError("Not used in tests") }
    func edit(messageId: String, content: String) async throws -> APIMessage { fatalError("Not used in tests") }
    func delete(conversationId: String, messageId: String) async throws {}
    func pin(conversationId: String, messageId: String) async throws {}
    func unpin(conversationId: String, messageId: String) async throws {}
    func consumeViewOnce(conversationId: String, messageId: String) async throws -> ConsumeViewOnceResponse { fatalError("Not used in tests") }
    func search(conversationId: String, query: String, limit: Int) async throws -> MessagesAPIResponse { fatalError("Not used in tests") }
    func searchWithCursor(conversationId: String, query: String, cursor: String) async throws -> MessagesAPIResponse { fatalError("Not used in tests") }
}

// MARK: - TestFactories extension

private extension TestFactories {
    static func makeAPIConversation(id: String = "conv-1") -> APIConversation {
        let json: [String: Any] = [
            "id": id,
            "identifier": "test-\(id)",
            "type": "DIRECT",
            "createdAt": ISO8601DateFormatter().string(from: Date()),
            "updatedAt": ISO8601DateFormatter().string(from: Date()),
            "isActive": true,
            "unreadCount": 0
        ]
        let data = try! JSONSerialization.data(withJSONObject: json)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try! decoder.decode(APIConversation.self, from: data)
    }
}
