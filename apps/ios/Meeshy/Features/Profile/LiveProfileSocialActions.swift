import MeeshySDK
import MeeshyUI

@MainActor
final class LiveProfileSocialActions: ProfileSocialActionsProviding {
    nonisolated deinit {}

    func sendFriendRequest(to userId: String) async throws -> FriendRequest {
        try await FriendService.shared.sendFriendRequest(receiverId: userId, message: nil)
    }

    func deleteFriendRequest(_ requestId: String) async throws {
        try await FriendService.shared.deleteRequest(requestId: requestId)
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

    func reportUser(_ userId: String, reportType: String) async throws {
        try await ReportService.shared.reportUser(userId: userId, reportType: reportType, reason: nil)
    }

    func userPosts(of userId: String) async throws -> [APIPost] {
        try await PostService.shared.getUserPosts(userId: userId, cursor: nil, limit: 20).data
    }
}
