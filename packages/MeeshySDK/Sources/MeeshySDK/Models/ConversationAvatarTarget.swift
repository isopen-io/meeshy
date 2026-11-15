import Foundation

// MARK: - Ce qu'ouvre le toucher de l'avatar d'une ligne (#15887)
//
// Le profil du pair d'une directe, quand il existe et qu'on peut le montrer ;
// les détails de la conversation dans tous les autres cas. Jamais rien : un
// avatar qu'on touche sans effet est un geste mort.
//
// L'anonyme élu sans identifiant, le pair bloqué et le compte fermé (#15717)
// n'ont pas de profil à montrer — la fiche resterait vide, ou montrerait ce que
// le blocage et la fermeture retirent. Leur avatar ouvre donc les détails.

public nonisolated enum ConversationAvatarTarget: Equatable, Sendable {
    case profile(userId: String)
    case conversationInfo

    public static func resolve(
        type: MeeshyConversation.ConversationType,
        peerUserId: String?,
        peerBlocked: Bool,
        peerAccountClosed: Bool
    ) -> ConversationAvatarTarget {
        guard type == .direct, let peerUserId, !peerUserId.isEmpty, !peerBlocked, !peerAccountClosed else {
            return .conversationInfo
        }
        return .profile(userId: peerUserId)
    }

    public var opensProfile: Bool {
        guard case .profile = self else { return false }
        return true
    }
}

public extension MeeshyConversation {
    /// La cible du toucher d'avatar de CETTE ligne. Le blocage n'est pas porté
    /// par la conversation : l'appelant le lit dans `BlockService`.
    func avatarTarget(isPeerBlocked: Bool) -> ConversationAvatarTarget {
        .resolve(
            type: type,
            peerUserId: participantUserId,
            peerBlocked: isPeerBlocked,
            peerAccountClosed: participantAccountClosed
        )
    }
}
