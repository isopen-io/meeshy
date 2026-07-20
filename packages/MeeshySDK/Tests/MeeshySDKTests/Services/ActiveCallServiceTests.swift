import XCTest
@testable import MeeshySDK

final class ActiveCallServiceTests: XCTestCase {

    private func makeSUT() -> (sut: ActiveCallService, api: MockAPIClient) {
        let api = MockAPIClient()
        let sut = ActiveCallService(api: api)
        return (sut, api)
    }

    private func makeSession(
        id: String = "call-1",
        conversationId: String = "conv-1",
        mode: String = "p2p",
        status: String = "active",
        callType: String? = nil,
        participants: [ActiveCallParticipant] = []
    ) -> ActiveCallSession {
        ActiveCallSession(
            id: id, conversationId: conversationId, mode: mode, status: status,
            metadata: callType.map { ActiveCallMetadata(type: $0) },
            participants: participants
        )
    }

    func test_activeCall_hitsConversationScopedEndpoint() async throws {
        let (sut, api) = makeSUT()
        api.stub("/conversations/conv-1/active-call", result: APIResponse<ActiveCallSession?>(success: true, data: nil, error: nil))

        _ = try await sut.activeCall(conversationId: "conv-1")

        XCTAssertEqual(api.lastRequest?.path, "/conversations/conv-1/active-call")
        XCTAssertEqual(api.lastRequest?.method, "GET")
    }

    func test_activeCall_whenNoActiveCall_returnsNil() async throws {
        let (sut, api) = makeSUT()
        api.stub("/conversations/conv-1/active-call", result: APIResponse<ActiveCallSession?>(success: true, data: nil, error: nil))

        let result = try await sut.activeCall(conversationId: "conv-1")

        XCTAssertNil(result)
    }

    func test_activeCall_whenActiveCallExists_returnsSession() async throws {
        let (sut, api) = makeSUT()
        // Wire truth: mode stays p2p; the video nature travels in metadata.type.
        let session = makeSession(callType: "video", participants: [
            ActiveCallParticipant(userId: "user-1", user: ActiveCallParticipantUser(id: "user-1", username: "alice", displayName: "Alice")),
            ActiveCallParticipant(userId: "user-2", user: ActiveCallParticipantUser(id: "user-2", username: "bob", displayName: "Bob"))
        ])
        api.stub("/conversations/conv-1/active-call", result: APIResponse<ActiveCallSession?>(success: true, data: session, error: nil))

        let result = try await sut.activeCall(conversationId: "conv-1")

        XCTAssertEqual(result?.id, "call-1")
        XCTAssertTrue(result?.isVideo ?? false)
        XCTAssertEqual(result?.remoteParticipant(currentUserId: "user-1")?.userId, "user-2")
    }

    func test_activeCall_propagatesError() async throws {
        let (sut, api) = makeSUT()
        api.errorToThrow = APIError.unauthorized

        do {
            _ = try await sut.activeCall(conversationId: "conv-1")
            XCTFail("Expected activeCall to throw")
        } catch {
            XCTAssertTrue(error is APIError)
        }
    }
}
