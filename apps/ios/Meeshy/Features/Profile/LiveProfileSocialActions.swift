import MeeshySDK
import MeeshyUI

@MainActor
final class LiveProfileSocialActions: ProfileSocialActionsProviding {
    nonisolated deinit {}

    func sendFriendRequest(to userId: String, message: String?) async throws -> FriendRequest {
        try await FriendService.shared.sendFriendRequest(receiverId: userId, message: message)
    }

    func deleteFriendRequest(_ requestId: String) async throws {
        try await FriendService.shared.deleteRequest(requestId: requestId)
    }

    func pendingFriendRequest(_ requestId: String) async -> FriendRequest? {
        let store = await CacheCoordinator.shared.friendRequests
        let received = await store.loadIgnoringExpiry(for: FriendshipCache.PersistenceKeys.receivedRequests)?.items ?? []
        let sent = await store.loadIgnoringExpiry(for: FriendshipCache.PersistenceKeys.sentRequests)?.items ?? []
        return (received + sent).first { $0.id == requestId }
    }

    func respondToFriendRequest(_ requestId: String, accepted: Bool) async throws {
        _ = try await FriendService.shared.respond(requestId: requestId, accepted: accepted)
    }

    func blockUser(_ userId: String) async throws {
        try await BlockService.shared.blockUser(userId: userId)
    }

    func unblockUser(_ userId: String) async throws {
        try await BlockService.shared.unblockUser(userId: userId)
    }

    func reportUser(_ userId: String, reportType: String, reason: String?, attachedMessageIds: [String]) async throws {
        try await ReportService.shared.reportUser(userId: userId, reportType: reportType, reason: reason,
                                                  attachedMessageIds: attachedMessageIds)
    }

    func userPosts(of userId: String) async throws -> [APIPost] {
        try await PostService.shared.getUserPosts(userId: userId, cursor: nil, limit: 20).data
    }
}
