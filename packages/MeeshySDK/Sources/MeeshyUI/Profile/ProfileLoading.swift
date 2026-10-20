import SwiftUI
import MeeshySDK

@MainActor
public protocol ProfileLoading: AnyObject, Sendable {
    func cachedProfile(for key: String) async -> CacheResult<[MeeshyUser]>
    func fetchProfile(handle: String) async throws -> MeeshyUser
    func storeProfile(_ user: MeeshyUser, lookupKey: String) async
    func cachedStats(for userId: String) async -> CacheResult<[UserStats]>
    func fetchStats(userId: String) async throws -> UserStats
    func storeStats(_ stats: UserStats, userId: String) async
    func sharedConversations(with userId: String, currentUserId: String) async throws -> [MeeshyConversation]
}

private struct ProfileLoadingKey: EnvironmentKey {
    static let defaultValue: (any ProfileLoading)? = nil
}

public extension EnvironmentValues {
    var profileLoading: (any ProfileLoading)? {
        get { self[ProfileLoadingKey.self] }
        set { self[ProfileLoadingKey.self] = newValue }
    }
}

@MainActor
public final class UncachedProfileLoading: ProfileLoading {
    nonisolated deinit {}

    public init() {}

    public func cachedProfile(for key: String) async -> CacheResult<[MeeshyUser]> { .empty }

    public func fetchProfile(handle: String) async throws -> MeeshyUser {
        let user = try await UserService.shared.getProfile(handle: handle, expand: [.presence]).user
        UserDisplayNameCache.shared.trackFromUser(user)
        return user
    }

    public func storeProfile(_ user: MeeshyUser, lookupKey: String) async {}

    public func cachedStats(for userId: String) async -> CacheResult<[UserStats]> { .empty }

    public func fetchStats(userId: String) async throws -> UserStats {
        try await UserService.shared.getUserStats(userId: userId)
    }

    public func storeStats(_ stats: UserStats, userId: String) async {}

    public func sharedConversations(with userId: String, currentUserId: String) async throws -> [MeeshyConversation] {
        try await ConversationService.shared.listSharedWith(userId: userId)
            .map { $0.toConversation(currentUserId: currentUserId) }
    }
}
