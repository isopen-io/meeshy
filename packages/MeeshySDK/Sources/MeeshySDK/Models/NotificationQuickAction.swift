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
        guard notificationType == .contactJoined, let userId = senderId, !userId.isEmpty else { return [] }
        return [.connect(userId: userId), .write(userId: userId)]
    }
}
