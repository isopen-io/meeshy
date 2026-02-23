import Foundation

public struct BlockedUser: Decodable {
    public let id: String
    public let username: String
    public let displayName: String?
    public let avatar: String?
}

public final class BlockService {
    public static let shared = BlockService()
    private var api: APIClient { APIClient.shared }

    private init() {}

    public func blockUser(userId: String) async throws {
        let _: APIResponse<BlockActionResponse> = try await api.post(
            endpoint: "/users/\(userId)/block",
            body: [String: String]()
        )
    }

    public func unblockUser(userId: String) async throws {
        let _ = try await api.delete(
            endpoint: "/users/\(userId)/block"
        )
    }

    public func listBlockedUsers() async throws -> [BlockedUser] {
        let response: APIResponse<[BlockedUser]> = try await api.request(
            endpoint: "/users/me/blocked-users"
        )
        return response.data
    }
}

public struct BlockActionResponse: Decodable {
    public let message: String?
}
