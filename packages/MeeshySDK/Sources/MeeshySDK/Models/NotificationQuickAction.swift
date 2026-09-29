import Foundation

/// Un geste proposé SUR la rangée d'une notification, sans l'ouvrir.
///
/// Le SDK dit QUELS gestes une notification porte ; l'app les exécute (demande
/// d'ami, conversation directe, navigation) — c'est de l'orchestration produit,
/// qui n'a pas sa place ici.
public enum NotificationQuickAction: Equatable, Sendable, Hashable {
    /// Envoyer une demande d'ami à cette personne.
    case connect(userId: String)
    /// Ouvrir (ou créer) la conversation directe avec elle.
    case write(userId: String)

    public var userId: String {
        switch self {
        case .connect(let userId), .write(let userId): return userId
        }
    }
}

public extension APINotification {
    /// « X a rejoint Meeshy » (#8105) porte Se connecter et Écrire vers
    /// l'arrivant. Sans acteur identifié, aucun geste : un bouton qui ne
    /// saurait pas vers qui aller n'existe pas.
    var quickActions: [NotificationQuickAction] {
        quickActions(isFriend: false)
    }

    /// #8724 — le badge « Invités venus » nomme la personne venue par votre
    /// lien : on peut lui ÉCRIRE, et se connecter à elle si l'amitié que le
    /// parrainage a nouée n'existe plus. Déjà amis ⇒ « Écrire » seul.
    func quickActions(isFriend: Bool) -> [NotificationQuickAction] {
        guard let userId = senderId, !userId.isEmpty else { return [] }
        switch notificationType {
        case .contactJoined:
            return [.connect(userId: userId), .write(userId: userId)]
        case .badgeEarned where metadata?.axisKey == EngagementAxisKey.inviteJoined.rawValue:
            return isFriend ? [.write(userId: userId)] : [.write(userId: userId), .connect(userId: userId)]
        default:
            return []
        }
    }
}
