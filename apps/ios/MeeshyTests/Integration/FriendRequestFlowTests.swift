import XCTest
import MeeshySDK
@testable import Meeshy

/// Integration test: send request -> pending -> accept -> friend
final class FriendRequestFlowTests: XCTestCase {

    // MARK: - Helpers

    private func makeService() -> MockFriendService {
        MockFriendService()
    }

    private func makePendingRequest(id: String = "req001", senderId: String = "user1", receiverId: String = "user2") -> FriendRequest {
        JSONStub.decode("""
        {"id":"\(id)","senderId":"\(senderId)","receiverId":"\(receiverId)","status":"pending","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}
        """)
    }

    private func makeAcceptedRequest(id: String = "req001") -> FriendRequest {
        JSONStub.decode("""
        {"id":"\(id)","senderId":"user1","receiverId":"user2","status":"accepted","respondedAt":"2026-01-02T00:00:00.000Z","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-02T00:00:00.000Z"}
        """)
    }

    // MARK: - Send Request Flow

    func test_sendFriendRequest_callsService() async {
        let service = makeService()
        service.sendRequestResult = .success(makePendingRequest())

        let result = try? await service.sendFriendRequest(receiverId: "user2", message: nil)

        XCTAssertEqual(service.sendRequestCallCount, 1)
        XCTAssertEqual(service.lastSendRequestReceiverId, "user2")
        XCTAssertNotNil(result)
        XCTAssertEqual(result?.status, "pending")
    }

    func test_sendFriendRequest_failure() async {
        let service = makeService()
        service.sendRequestResult = .failure(NSError(domain: "test", code: 409, userInfo: [NSLocalizedDescriptionKey: "Already sent"]))

        do {
            _ = try await service.sendFriendRequest(receiverId: "user2", message: nil)
            XCTFail("Expected error")
        } catch {
            XCTAssertEqual(service.sendRequestCallCount, 1)
        }
    }

    // MARK: - Accept Request Flow

    func test_acceptRequest_changesStatusToAccepted() async {
        let service = makeService()
        service.respondResult = .success(makeAcceptedRequest())

        let result = try? await service.respond(requestId: "req001", accepted: true)

        XCTAssertEqual(service.respondCallCount, 1)
        XCTAssertEqual(service.lastRespondRequestId, "req001")
        XCTAssertEqual(service.lastRespondAccepted, true)
        XCTAssertEqual(result?.status, "accepted")
        XCTAssertNotNil(result?.respondedAt)
    }

    // MARK: - Decline Request Flow

    func test_declineRequest_callsServiceWithFalse() async {
        let service = makeService()
        let declinedRequest: FriendRequest = JSONStub.decode("""
        {"id":"req001","senderId":"user1","receiverId":"user2","status":"declined","respondedAt":"2026-01-02T00:00:00.000Z","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-02T00:00:00.000Z"}
        """)
        service.respondResult = .success(declinedRequest)

        let result = try? await service.respond(requestId: "req001", accepted: false)

        XCTAssertEqual(service.respondCallCount, 1)
        XCTAssertEqual(service.lastRespondAccepted, false)
        XCTAssertEqual(result?.status, "declined")
    }

    // MARK: - List Received Requests

    func test_receivedRequests_returnsRequests() async {
        let service = makeService()
        let request = makePendingRequest()
        service.receivedRequestsResult = .success(
            OffsetPaginatedAPIResponse(success: true, data: [request], pagination: nil, error: nil)
        )

        let result = try? await service.receivedRequests(offset: 0, limit: 20)

        XCTAssertEqual(service.receivedRequestsCallCount, 1)
        XCTAssertEqual(result?.data.count, 1)
    }

    // MARK: - Delete Request

    func test_deleteRequest_callsService() async {
        let service = makeService()
        service.deleteResult = .success(())

        try? await service.deleteRequest(requestId: "req001")

        XCTAssertEqual(service.deleteCallCount, 1)
        XCTAssertEqual(service.lastDeleteRequestId, "req001")
    }

    // MARK: - Full Flow: Send -> Receive -> Accept

    func test_fullFlow_sendThenAccept() async {
        let service = makeService()

        service.sendRequestResult = .success(makePendingRequest(id: "req100", senderId: "me", receiverId: "friend"))
        let sent = try? await service.sendFriendRequest(receiverId: "friend", message: "Hi!")
        XCTAssertEqual(sent?.status, "pending")

        service.respondResult = .success(makeAcceptedRequest(id: "req100"))
        let accepted = try? await service.respond(requestId: "req100", accepted: true)
        XCTAssertEqual(accepted?.status, "accepted")

        XCTAssertEqual(service.sendRequestCallCount, 1)
        XCTAssertEqual(service.respondCallCount, 1)
    }
}
