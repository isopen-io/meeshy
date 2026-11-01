import Foundation
import MeeshySDK
import MeeshyUI

@MainActor
final class UncachedProfileLoading: ProfileLoading {
    nonisolated deinit {}

    func cachedProfile(for key: String) async -> CacheResult<[MeeshyUser]> { .empty }

    func fetchProfile(handle: String) async throws -> MeeshyUser {
        let user = try await UserService.shared.getProfile(handle: handle, expand: [.presence]).user
        UserDisplayNameCache.shared.trackFromUser(user)
        return user
    }

    func storeProfile(_ user: MeeshyUser, lookupKey: String) async {}

    func cachedStats(for userId: String) async -> CacheResult<[UserStats]> { .empty }

    func fetchStats(userId: String) async throws -> UserStats {
        try await UserService.shared.getUserStats(userId: userId)
    }

    func storeStats(_ stats: UserStats, userId: String) async {}

    func sharedConversations(with userId: String, currentUserId: String) async throws -> [MeeshyConversation] {
        try await ConversationService.shared.listSharedWith(userId: userId)
            .map { $0.toConversation(currentUserId: currentUserId) }
    }
}
