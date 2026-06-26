import Foundation
import Combine

public struct BlockedUser: Codable, CacheIdentifiable, Identifiable, Sendable, Equatable {
    public let id: String
    public let username: String
    public let displayName: String?
    public let avatar: String?
    public let blockedAt: Date?

    public init(
        id: String,
        username: String,
        displayName: String? = nil,
        avatar: String? = nil,
        blockedAt: Date? = nil
    ) {
        self.id = id
        self.username = username
        self.displayName = displayName
        self.avatar = avatar
        self.blockedAt = blockedAt
    }

    public var name: String {
        displayName ?? username
    }
}

// MARK: - Protocol

public protocol BlockServiceProviding: Sendable {
    var blockedUserIds: Set<String> { get }
    func blockUser(userId: String) async throws
    func unblockUser(userId: String) async throws
    func listBlockedUsers() async throws -> [BlockedUser]
    func isBlocked(userId: String) -> Bool
    func refreshCache() async
}

public final class BlockService: ObservableObject, BlockServiceProviding, @unchecked Sendable {
    public static let shared = BlockService()
    private let api: APIClientProviding

    @Published public private(set) var blockedUserIds: Set<String> = []

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    // MARK: - Block

    public func blockUser(userId: String) async throws {
        let _: APIResponse<BlockActionResponse> = try await api.post(
            endpoint: "/users/\(userId)/block",
            body: [String: String]()
        )
        await MainActor.run { _ = blockedUserIds.insert(userId) }
    }

    // MARK: - Unblock

    public func unblockUser(userId: String) async throws {
        let _ = try await api.delete(
            endpoint: "/users/\(userId)/block"
        )
        await MainActor.run { _ = blockedUserIds.remove(userId) }
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

    // MARK: - Session quiesce (P1 — logout)

    /// Purge la blocklist en mémoire pour que la session suivante (autre user
    /// sur le même device) ne voie pas la blocklist du user précédent avant
    /// le prochain refresh réseau. Câblée depuis `AuthManager.logout()`.
    public func reset() async {
        await MainActor.run { blockedUserIds.removeAll() }
    }
}

public struct BlockActionResponse: Decodable {
    public let message: String?
}
