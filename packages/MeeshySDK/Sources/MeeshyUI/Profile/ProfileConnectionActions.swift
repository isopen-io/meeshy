import MeeshySDK

@MainActor
struct ProfileConnectionActions {
    let relationships: any ProfileRelationshipStateProviding
    let social: any ProfileSocialActionsProviding

    /// Le mot facultatif part rogné ; vide, il ne part pas.
    func sendRequest(to userId: String, message: String? = nil) async -> String? {
        let note = message?.trimmingCharacters(in: .whitespacesAndNewlines)
        let sent = (note?.isEmpty ?? true) ? nil : note
        guard let request = try? await social.sendFriendRequest(to: userId, message: sent) else { return nil }
        relationships.didSendRequest(to: userId, requestId: request.id)
        return request.id
    }

    func cancelRequest(requestId: String, userId: String, afterOptimistic: () -> Void) async -> Bool {
        relationships.didCancelRequest(to: userId)
        afterOptimistic()
        do {
            try await social.deleteFriendRequest(requestId)
            return true
        } catch {
            relationships.didSendRequest(to: userId, requestId: requestId)
            return false
        }
    }

    func pendingRequest(_ requestId: String) async -> FriendRequest? {
        await social.pendingFriendRequest(requestId)
    }

    func discardRequest(_ requestId: String) async {
        try? await social.deleteFriendRequest(requestId)
    }

    func acceptRequest(requestId: String, senderId: String, afterOptimistic: () -> Void) async -> Bool {
        relationships.didAcceptRequest(from: senderId)
        afterOptimistic()
        do {
            try await social.respondToFriendRequest(requestId, accepted: true)
            return true
        } catch {
            relationships.rollbackAccept(senderId: senderId, requestId: requestId)
            return false
        }
    }

    func declineRequest(requestId: String, senderId: String, afterOptimistic: () -> Void) async -> Bool {
        relationships.didRejectRequest(from: senderId)
        afterOptimistic()
        do {
            try await social.respondToFriendRequest(requestId, accepted: false)
            return true
        } catch {
            relationships.rollbackReject(senderId: senderId, requestId: requestId)
            return false
        }
    }

    func block(userId: String) async -> Bool {
        (try? await social.blockUser(userId)) != nil
    }

    func unblock(userId: String) async -> Bool {
        (try? await social.unblockUser(userId)) != nil
    }

    /// `reason` : le mot facultatif du signalement, `nil` sans mot.
    func report(userId: String, reportType: String, reason: String?) async -> Bool {
        (try? await social.reportUser(userId, reportType: reportType, reason: reason)) != nil
    }
}

extension ConnectionStatus {
    init(friendship: FriendshipStatus) {
        switch friendship {
        case .friend: self = .connected
        case .pendingSent(let requestId): self = .pendingSent(requestId: requestId)
        case .pendingReceived(let requestId): self = .pendingReceived(requestId: requestId)
        case .none: self = .none
        }
    }
}
