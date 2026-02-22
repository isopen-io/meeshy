import Foundation

public final class UserService {
    public static let shared = UserService()
    private init() {}
    private var api: APIClient { APIClient.shared }

    public func search(query: String, limit: Int = 20, offset: Int = 0) async throws -> OffsetPaginatedAPIResponse<[UserSearchResult]> {
        try await api.offsetPaginatedRequest(endpoint: "/users/search", offset: offset, limit: limit)
        // Note: the query param needs to be added manually
    }

    public func searchUsers(query: String, limit: Int = 20, offset: Int = 0) async throws -> [UserSearchResult] {
        let response: OffsetPaginatedAPIResponse<[UserSearchResult]> = try await api.request(
            endpoint: "/users/search",
            queryItems: [
                URLQueryItem(name: "q", value: query),
                URLQueryItem(name: "limit", value: "\(limit)"),
                URLQueryItem(name: "offset", value: "\(offset)"),
            ]
        )
        return response.data
    }

    public func updateProfile(_ request: UpdateProfileRequest) async throws -> MeeshyUser {
        let response: APIResponse<UpdateProfileResponse> = try await api.put(endpoint: "/users/me", body: request)
        return response.data.user
    }
}
