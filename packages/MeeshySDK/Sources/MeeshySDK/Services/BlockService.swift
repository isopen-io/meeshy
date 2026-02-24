import Foundation
import Combine

public struct BlockedUser: Decodable, Identifiable {
    public let id: String
    public let username: String
    public let displayName: String?
    public let avatar: String?
    public let blockedAt: Date?

    public var name: String {
        displayName ?? username
    }
}

public final class BlockService: ObservableObject {
    public static let shared = BlockService()
    private var api: APIClient { APIClient.shared }

    @Published public private(set) var blockedUserIds: Set<String> = []

    private init() {}

    // MARK: - Block

    public func blockUser(userId: String) async throws {
        let _: APIResponse<BlockActionResponse> = try await api.post(
            endpoint: "/users/\(userId)/block",
            body: [String: String]()
        )
        await MainActor.run { blockedUserIds.insert(userId) }
    }

    // MARK: - Unblock

    public func unblockUser(userId: String) async throws {
        let _ = try await api.delete(
            endpoint: "/users/\(userId)/block"
        )
        await MainActor.run { blockedUserIds.remove(userId) }
    }

    // MARK: - List

    public func listBlockedUsers() async throws -> [BlockedUser] {
        let response: APIResponse<[BlockedUser]> = try await api.request(
            endpoint: "/users/me/blocked-users"
        )
        let users = response.data
        await MainActor.run { blockedUserIds = Set(users.map(\.id)) }
        return users
    }

    // MARK: - Local Cache

    public func isBlocked(userId: String) -> Bool {
        blockedUserIds.contains(userId)
    }

    public func refreshCache() async {
        _ = try? await listBlockedUsers()
    }
}

public struct BlockActionResponse: Decodable {
    public let message: String?
}
