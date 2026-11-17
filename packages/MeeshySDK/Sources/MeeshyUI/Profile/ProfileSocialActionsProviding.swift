import MeeshySDK

@MainActor
public protocol ProfileSocialActionsProviding: AnyObject {
    /// `message` : le mot facultatif de la demande (planche `Etat-Demande`), `nil` sans mot.
    func sendFriendRequest(to userId: String, message: String?) async throws -> FriendRequest
    func deleteFriendRequest(_ requestId: String) async throws
    func respondToFriendRequest(_ requestId: String, accepted: Bool) async throws
    func blockUser(_ userId: String) async throws
    func unblockUser(_ userId: String) async throws
    func reportUser(_ userId: String, reportType: String) async throws
    func userPosts(of userId: String) async throws -> [APIPost]
}
