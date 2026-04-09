import Foundation

// MARK: - Protocol

public protocol FriendServiceProviding: Sendable {
    func sendFriendRequest(receiverId: String, message: String?) async throws -> FriendRequest
    func receivedRequests(offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]>
    func sentRequests(offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]>
    func respond(requestId: String, accepted: Bool) async throws -> FriendRequest
    func deleteRequest(requestId: String) async throws
    func sendEmailInvitation(email: String) async throws
}

public final class FriendService: FriendServiceProviding, @unchecked Sendable {
    public static let shared = FriendService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    // MARK: - Send Friend Request

    public func sendFriendRequest(receiverId: String, message: String? = nil) async throws -> FriendRequest {
        let body = SendFriendRequest(receiverId: receiverId, message: message)
        let response: APIResponse<FriendRequest> = try await api.post(
            endpoint: "/friend-requests",
            body: body
        )
        return response.data
    }

    // MARK: - Received Friend Requests

    public func receivedRequests(offset: Int = 0, limit: Int = 20) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]> {
        try await api.offsetPaginatedRequest(
            endpoint: "/friend-requests/received",
            offset: offset,
            limit: limit
        )
    }

    // MARK: - Sent Friend Requests

    public func sentRequests(offset: Int = 0, limit: Int = 20) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]> {
        try await api.offsetPaginatedRequest(
            endpoint: "/friend-requests/sent",
            offset: offset,
            limit: limit
        )
    }

    // MARK: - Respond to Friend Request

    public func respond(requestId: String, accepted: Bool) async throws -> FriendRequest {
        let body = RespondFriendRequest(accepted: accepted)
        let response: APIResponse<FriendRequest> = try await api.request(
            endpoint: "/friend-requests/\(requestId)",
            method: "PATCH",
            body: try JSONEncoder().encode(body)
        )
        return response.data
    }

    // MARK: - Delete Friend Request

    public func deleteRequest(requestId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(
            endpoint: "/friend-requests/\(requestId)"
        )
    }

    // MARK: - Email Invitation

    public func sendEmailInvitation(email: String) async throws {
        let body = EmailInvitationRequest(email: email)
        let _: APIResponse<EmailInvitationResponse> = try await api.post(
            endpoint: "/invitations/email",
            body: body
        )
    }
}
