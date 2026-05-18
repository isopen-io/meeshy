import XCTest
@testable import MeeshySDK

final class MentionServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: MentionService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = MentionService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - suggestions

    func test_suggestions_callsCorrectEndpoint() async throws {
        let suggestions = [
            MentionSuggestion(id: "u1", username: "alice", displayName: "Alice", avatar: nil, badge: nil, inConversation: true, isFriend: true)
        ]
        let response = APIResponse<[MentionSuggestion]>(success: true, data: suggestions, error: nil)
        mock.stub("/mentions/suggestions", result: response)

        _ = try await service.suggestions(conversationId: "conv1", query: "ali")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/mentions/suggestions")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    func test_suggestions_returnsParsedResults() async throws {
        let suggestions = [
            MentionSuggestion(id: "u1", username: "alice", displayName: "Alice W", avatar: "avatar.jpg", badge: "gold", inConversation: true, isFriend: false),
            MentionSuggestion(id: "u2", username: "bob", displayName: nil, avatar: nil, badge: nil, inConversation: false, isFriend: true)
        ]
        let response = APIResponse<[MentionSuggestion]>(success: true, data: suggestions, error: nil)
        mock.stub("/mentions/suggestions", result: response)

        let result = try await service.suggestions(conversationId: "conv1", query: "a")

        XCTAssertEqual(result.count, 2)
        XCTAssertEqual(result[0].id, "u1")
        XCTAssertEqual(result[0].username, "alice")
        XCTAssertEqual(result[0].displayName, "Alice W")
        XCTAssertEqual(result[0].badge, "gold")
        XCTAssertEqual(result[1].id, "u2")
        XCTAssertNil(result[1].displayName)
    }

    func test_suggestions_emptyQuery_stillCallsEndpoint() async throws {
        let response = APIResponse<[MentionSuggestion]>(success: true, data: [], error: nil)
        mock.stub("/mentions/suggestions", result: response)

        let result = try await service.suggestions(conversationId: "conv1", query: "")

        XCTAssertTrue(result.isEmpty)
        XCTAssertEqual(mock.requestCount, 1)
    }

    func test_suggestions_emptyResults_returnsEmptyArray() async throws {
        let response = APIResponse<[MentionSuggestion]>(success: true, data: [], error: nil)
        mock.stub("/mentions/suggestions", result: response)

        let result = try await service.suggestions(conversationId: "conv1", query: "zzz")

        XCTAssertTrue(result.isEmpty)
    }

    func test_suggestions_networkError_propagates() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            _ = try await service.suggestions(conversationId: "conv1", query: "a")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .network(.noConnection) = error {} else {
                XCTFail("Expected network noConnection, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }

    func test_suggestions_serverError_propagates() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 500, message: "Internal Server Error")

        do {
            _ = try await service.suggestions(conversationId: "conv1", query: "a")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(let code, _) = error {
                XCTAssertEqual(code, 500)
            } else {
                XCTFail("Expected server error, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }

    // MARK: - Unified contextId/contextType API

    func test_suggestions_contextTypeConversation_callsCorrectEndpoint() async throws {
        let response = APIResponse<[MentionSuggestion]>(success: true, data: [], error: nil)
        mock.stub("/mentions/suggestions", result: response)

        _ = try await service.suggestions(contextId: "conv1", contextType: .conversation, query: "ali")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/mentions/suggestions")
        let items = mock.lastRequest?.queryItems ?? []
        let contextIdItem = items.first(where: { $0.name == "contextId" })
        let contextTypeItem = items.first(where: { $0.name == "contextType" })
        XCTAssertEqual(contextIdItem?.value, "conv1")
        XCTAssertEqual(contextTypeItem?.value, "conversation")
    }

    func test_suggestions_contextTypePost_sendsPostContextType() async throws {
        let suggestions = [
            MentionSuggestion(id: "u1", username: "alice", displayName: "Alice", avatar: nil, badge: "conversation", inConversation: true, isFriend: false)
        ]
        let response = APIResponse<[MentionSuggestion]>(success: true, data: suggestions, error: nil)
        mock.stub("/mentions/suggestions", result: response)

        let result = try await service.suggestions(contextId: "post-id-123", contextType: .post, query: "alice")

        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result[0].username, "alice")
        let items = mock.lastRequest?.queryItems ?? []
        let contextTypeItem = items.first(where: { $0.name == "contextType" })
        XCTAssertEqual(contextTypeItem?.value, "post")
    }

    func test_suggestions_emptyQuery_doesNotSendQueryParam() async throws {
        let response = APIResponse<[MentionSuggestion]>(success: true, data: [], error: nil)
        mock.stub("/mentions/suggestions", result: response)

        _ = try await service.suggestions(contextId: "post-id-123", contextType: .post, query: "")

        let items = mock.lastRequest?.queryItems ?? []
        XCTAssertNil(items.first(where: { $0.name == "query" }))
    }

    func test_suggestions_withQuery_sendsQueryParam() async throws {
        let response = APIResponse<[MentionSuggestion]>(success: true, data: [], error: nil)
        mock.stub("/mentions/suggestions", result: response)

        _ = try await service.suggestions(contextId: "post-id-123", contextType: .post, query: "ali")

        let items = mock.lastRequest?.queryItems ?? []
        let queryItem = items.first(where: { $0.name == "query" })
        XCTAssertEqual(queryItem?.value, "ali")
    }

    func test_suggestions_deprecatedMethod_delegatesToUnified() async throws {
        let response = APIResponse<[MentionSuggestion]>(success: true, data: [], error: nil)
        mock.stub("/mentions/suggestions", result: response)

        _ = try await service.suggestions(conversationId: "conv-123", query: "bob")

        let items = mock.lastRequest?.queryItems ?? []
        // The deprecated method now sends contextId + contextType=conversation
        let contextIdItem = items.first(where: { $0.name == "contextId" })
        let contextTypeItem = items.first(where: { $0.name == "contextType" })
        XCTAssertEqual(contextIdItem?.value, "conv-123")
        XCTAssertEqual(contextTypeItem?.value, "conversation")
    }
}
