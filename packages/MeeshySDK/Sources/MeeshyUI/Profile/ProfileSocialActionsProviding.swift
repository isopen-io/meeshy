import MeeshySDK

@MainActor
public protocol ProfileSocialActionsProviding: AnyObject {
    /// `message` : le mot facultatif de la demande (planche `Etat-Demande`), `nil` sans mot.
    func sendFriendRequest(to userId: String, message: String?) async throws -> FriendRequest
    func deleteFriendRequest(_ requestId: String) async throws
    /// La demande en attente telle que le cache la garde (date, mot de l'émetteur), `nil` si elle n'y est pas.
    func pendingFriendRequest(_ requestId: String) async -> FriendRequest?
    func respondToFriendRequest(_ requestId: String, accepted: Bool) async throws
    func blockUser(_ userId: String) async throws
    func unblockUser(_ userId: String) async throws
    /// `reason` : le mot facultatif du signalement (500 signes au plus), `nil` sans mot. `attachedMessageIds` : les
    /// messages joints (#19609), vide quand rien n'est joint ou que la passerelle n'annonce pas le champ.
    func reportUser(_ userId: String, reportType: String, reason: String?, attachedMessageIds: [String]) async throws
    func userPosts(of userId: String) async throws -> [APIPost]
}
