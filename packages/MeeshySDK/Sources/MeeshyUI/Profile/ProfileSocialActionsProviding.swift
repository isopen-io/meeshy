import MeeshySDK

@MainActor
public protocol ProfileSocialActionsProviding: AnyObject {
    func sendFriendRequest(to userId: String) async throws -> FriendRequest
    func deleteFriendRequest(_ requestId: String) async throws
    func respondToFriendRequest(_ requestId: String, accepted: Bool) async throws
    func blockUser(_ userId: String) async throws
    func unblockUser(_ userId: String) async throws
    func reportUser(_ userId: String, reportType: String) async throws
    func userPosts(of userId: String) async throws -> [APIPost]
}
