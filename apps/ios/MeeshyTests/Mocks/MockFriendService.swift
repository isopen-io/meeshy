import Foundation
import MeeshySDK

final class MockFriendService: FriendServiceProviding, @unchecked Sendable {
    init() {}

    // MARK: - Stubbing

    var sendRequestResult: Result<FriendRequest, Error> = .failure(NSError(domain: "test", code: 0))
    var receivedRequestsResult: Result<OffsetPaginatedAPIResponse<[FriendRequest]>, Error> = .success(
        OffsetPaginatedAPIResponse(success: true, data: [], pagination: nil, error: nil)
    )
    var sentRequestsResult: Result<OffsetPaginatedAPIResponse<[FriendRequest]>, Error> = .success(
        OffsetPaginatedAPIResponse(success: true, data: [], pagination: nil, error: nil)
    )
    var respondResult: Result<FriendRequest, Error> = .failure(NSError(domain: "test", code: 0))
    var deleteResult: Result<Void, Error> = .success(())
    var sendEmailInvitationResult: Result<Void, Error> = .success(())

    // MARK: - Call Tracking

    var sendRequestCallCount = 0
    var lastSendRequestReceiverId: String?

    var receivedRequestsCallCount = 0
    var lastReceivedOffset: Int?
    var lastReceivedLimit: Int?

    var sentRequestsCallCount = 0
    var lastSentOffset: Int?
    var lastSentLimit: Int?

    var respondCallCount = 0
    var lastRespondRequestId: String?
    var lastRespondAccepted: Bool?

    var deleteCallCount = 0
    var lastDeleteRequestId: String?

    var sendEmailInvitationCallCount = 0
    var lastInvitationEmail: String?

    // MARK: - Protocol Conformance

    func sendFriendRequest(receiverId: String, message: String?) async throws -> FriendRequest {
        sendRequestCallCount += 1
        lastSendRequestReceiverId = receiverId
        return try sendRequestResult.get()
    }

    func receivedRequests(offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]> {
        receivedRequestsCallCount += 1
        lastReceivedOffset = offset
        lastReceivedLimit = limit
        return try receivedRequestsResult.get()
    }

    func sentRequests(offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]> {
        sentRequestsCallCount += 1
        lastSentOffset = offset
        lastSentLimit = limit
        return try sentRequestsResult.get()
    }

    func respond(requestId: String, accepted: Bool) async throws -> FriendRequest {
        respondCallCount += 1
        lastRespondRequestId = requestId
        lastRespondAccepted = accepted
        return try respondResult.get()
    }

    func deleteRequest(requestId: String) async throws {
        deleteCallCount += 1
        lastDeleteRequestId = requestId
        try deleteResult.get()
    }

    func sendEmailInvitation(email: String) async throws {
        sendEmailInvitationCallCount += 1
        lastInvitationEmail = email
        try sendEmailInvitationResult.get()
    }

    // MARK: - Reset

    func reset() {
        sendRequestCallCount = 0
        lastSendRequestReceiverId = nil
        receivedRequestsCallCount = 0
        lastReceivedOffset = nil
        lastReceivedLimit = nil
        sentRequestsCallCount = 0
        lastSentOffset = nil
        lastSentLimit = nil
        respondCallCount = 0
        lastRespondRequestId = nil
        lastRespondAccepted = nil
        deleteCallCount = 0
        lastDeleteRequestId = nil
        sendEmailInvitationCallCount = 0
        lastInvitationEmail = nil
    }
}
