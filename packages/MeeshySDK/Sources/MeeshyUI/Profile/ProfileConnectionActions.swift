import Foundation
import MeeshySDK

/// Ce que rend l'envoi d'une demande : la demande servie (sa date, son mot), rien parce qu'elle n'est pas partie, ou
/// rien parce qu'une demande est déjà en route (second appui).
nonisolated enum ProfileRequestSend: Equatable, Sendable {
    case sent(FriendRequest)
    case failed
    case alreadyPending
}

/// Ce que rend « Renvoyer » : la nouvelle demande, l'ancienne gardée parce que son retrait a été refusé, ou l'ancienne
/// retirée sans que la nouvelle parte (l'étape retombe sur « La demande n'est pas partie »).
nonisolated enum ProfileRequestResend: Equatable, Sendable {
    case resent(FriendRequest)
    case withdrawFailed
    case unsent
}

@MainActor
struct ProfileConnectionActions {
    let relationships: any ProfileRelationshipStateProviding
    let social: any ProfileSocialActionsProviding

    /// L'identifiant que porte la demande le temps de son envoi : aucun serveur ne l'a donné.
    nonisolated static func provisionalRequestId(for userId: String) -> String {
        "local-pending-\(userId)"
    }

    nonisolated static func isProvisional(_ requestId: String?) -> Bool {
        requestId?.hasPrefix("local-pending-") ?? false
    }

    /// Optimiste : la demande est posée avant le réseau, défaite s'il la refuse. Une demande déjà en cours (second
    /// appui) ne repart pas. Le mot facultatif part rogné ; vide, il ne part pas.
    func sendRequest(to userId: String, message: String? = nil,
                     afterOptimistic: (String) -> Void = { _ in }) async -> ProfileRequestSend {
        guard relationships.status(for: userId) == FriendshipStatus.none else { return .alreadyPending }
        let note = message?.trimmingCharacters(in: .whitespacesAndNewlines)
        let sent = (note?.isEmpty ?? true) ? nil : note
        let provisional = Self.provisionalRequestId(for: userId)
        relationships.didSendRequest(to: userId, requestId: provisional)
        afterOptimistic(provisional)
        guard let request = try? await social.sendFriendRequest(to: userId, message: sent) else {
            relationships.didCancelRequest(to: userId)
            return .failed
        }
        relationships.didSendRequest(to: userId, requestId: request.id)
        return .sent(request)
    }

    /// « Renvoyer » : l'ancienne demande se retire (optimiste, remise si le réseau refuse), puis la nouvelle part avec
    /// le mot de l'ancienne.
    func resendRequest(requestId: String, userId: String, message: String?, afterWithdrawn: () -> Void,
                       afterOptimistic: (String) -> Void = { _ in }) async -> ProfileRequestResend {
        guard await perform(.resend, requestId: requestId, userId: userId, afterOptimistic: afterWithdrawn) else {
            return .withdrawFailed
        }
        switch await sendRequest(to: userId, message: message, afterOptimistic: afterOptimistic) {
        case .sent(let request): return .resent(request)
        case .failed, .alreadyPending: return .unsent
        }
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

    /// Le brouillon de la feuille « Signaler » : son motif, son mot et ses messages joints. Rien ne part sans motif.
    func report(userId: String, draft: ProfileReportDraft) async -> Bool {
        guard let reason = draft.reason else { return false }
        return await report(userId: userId, reportType: reason.rawValue, reason: draft.sentDetails,
                            attachedMessageIds: draft.sentMessageIds)
    }

    /// Le signalement part ; « Bloquer aussi » ne bloque qu'une fois le signalement parti. Un blocage demandé qui rate
    /// reste dit dans le résultat (`blockFailed`), jamais tu.
    func reportThenBlock(userId: String, draft: ProfileReportDraft, alreadyBlocked: Bool) async -> ProfileReportOutcome {
        guard draft.canSend, await report(userId: userId, draft: draft) else { return .notSent }
        guard draft.alsoBlocks, !alreadyBlocked else { return ProfileReportOutcome(isSent: true, isBlocked: alreadyBlocked) }
        let blocked = await block(userId: userId)
        return ProfileReportOutcome(isSent: true, isBlocked: blocked, blockRequested: true)
    }

    /// `reason` : le mot facultatif du signalement, `nil` sans mot ; `attachedMessageIds` : les messages joints.
    func report(userId: String, reportType: String, reason: String?, attachedMessageIds: [String] = []) async -> Bool {
        (try? await social.reportUser(userId, reportType: reportType, reason: reason,
                                      attachedMessageIds: attachedMessageIds)) != nil
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
