import Foundation

/// La porte de consommation d'un toucher de bannière (#18911, ios-systeme-6).
///
/// Un payload publié SANS session ouverte attend que `isAuthenticated` devienne
/// vrai ; celui qui se connecte alors n'est pas forcément le compte que la
/// bannière visait. La charge est marquée au toucher (`addressedTo`) : la
/// navigation n'a lieu que sous ce compte, et tout le reste est effacé sans
/// bruit — mieux vaut perdre un toucher que d'ouvrir la conversation d'un autre.
public enum PushTapConsumption {
    public enum Decision: Equatable, Sendable {
        case navigate
        case discard
    }

    public static func decide(payload: NotificationPayload, currentUserId: String?) -> Decision {
        guard let addressee = payload.addressedTo, addressee == currentUserId else { return .discard }
        return .navigate
    }
}
