import Foundation

public final class FriendService {
    public static let shared = FriendService()
    private init() {}
    private var api: APIClient { APIClient.shared }

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
}
