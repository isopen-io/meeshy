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
