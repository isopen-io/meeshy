import Foundation
import MeeshySDK
import MeeshyUI

@MainActor
final class LiveProfileLoading: ProfileLoading {
    nonisolated deinit {}

    func cachedProfile(for key: String) async -> CacheResult<[MeeshyUser]> {
        let result = await CacheCoordinator.shared.profiles.load(for: key)
        await CacheCoordinator.shared.profiles.touch(for: key)
        return result
    }

    func fetchProfile(handle: String) async throws -> MeeshyUser {
        let user = try await UserService.shared.getProfile(handle: handle, expand: [.presence]).user
        UserDisplayNameCache.shared.trackFromUser(user)
        return user
    }

    func storeProfile(_ user: MeeshyUser, lookupKey: String) async {
        try? await CacheCoordinator.shared.profiles.save([user], for: user.id)
        if lookupKey != user.id {
            try? await CacheCoordinator.shared.profiles.save([user], for: lookupKey)
        }
        await CacheCoordinator.shared.profiles.touch(for: user.id)
        await SearchIndex.shared.indexUsers([user])
    }

    func cachedStats(for userId: String) async -> CacheResult<[UserStats]> {
        await CacheCoordinator.shared.profileStats.load(for: userId)
    }

    func fetchStats(userId: String) async throws -> UserStats {
        try await UserService.shared.getUserStats(userId: userId)
    }

    func storeStats(_ stats: UserStats, userId: String) async {
        try? await CacheCoordinator.shared.profileStats.save([stats], for: userId)
    }

    func sharedConversations(with userId: String, currentUserId: String) async throws -> [MeeshyConversation] {
        let shared = try await ConversationService.shared.listSharedWith(userId: userId)
        let mapped = shared.map { $0.toConversation(currentUserId: currentUserId) }
        for conversation in mapped {
            await CacheCoordinator.shared.conversations.touch(for: conversation.id)
        }
        return mapped
    }
}
