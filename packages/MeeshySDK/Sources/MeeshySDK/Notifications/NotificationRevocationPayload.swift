import Foundation

/// Révocation de notifications déjà POUSSÉES (features 4/5).
///
/// Quand une notification cesse d'exister côté serveur (message supprimé,
/// demande d'ami annulée, notification effacée depuis un autre appareil), le
/// gateway l'annonce par un push de contrôle SILENCIEUX (`apns-push-type:
/// background`, priorité 5, `content-available: 1`) dont le `userInfo` porte :
///
///     type            = "notification_revoked"
///     notificationIds = "<id1>,<id2>,…"      (joints par virgule)
///     conversationIds = "<c1>,<c2>"          (optionnel, même ordre, entrée vide possible)
///
/// Chaque bannière déjà livrée porte `notificationId` dans son propre
/// `userInfo` : c'est sur cet id que le retrait se décide (`covers(_:)`).
///
/// Type PUR : aucune lecture de singleton, aucun effet — le parseur ne fait
/// que dire « ce push est une révocation, et voici ce qu'elle révoque ».
public struct NotificationRevocationPayload: Equatable, Sendable {
    /// Valeur du `type` qui désigne ce push. Toute autre valeur ⇒ `init` nil.
    public static let pushType = "notification_revoked"

    public let notificationIds: [String]
    public let conversationIds: [String]

    public init(notificationIds: [String], conversationIds: [String]) {
        self.notificationIds = notificationIds
        self.conversationIds = conversationIds
    }

    /// `nil` quand `userInfo` n'est pas une révocation : l'appelant poursuit
    /// alors sa logique nominale (sync silencieuse). Une révocation sans id
    /// reste une révocation — il n'y a simplement rien à retirer.
    public init?(userInfo: [AnyHashable: Any]) {
        guard (userInfo["type"] as? String) == Self.pushType else { return nil }
        self.init(
            notificationIds: Self.ids(from: userInfo["notificationIds"]),
            conversationIds: Self.ids(from: userInfo["conversationIds"])
        )
    }

    /// Une bannière livrée est couverte par cette révocation quand son
    /// `userInfo.notificationId` figure dans `notificationIds`. Une bannière
    /// sans id (appel, ancien format) n'est jamais retirée par erreur.
    public func covers(_ bannerUserInfo: [AnyHashable: Any]) -> Bool {
        guard let id = bannerUserInfo["notificationId"] as? String, !id.isEmpty else { return false }
        return notificationIds.contains(id)
    }

    /// Le contrat joint les ids par virgule ; un tableau JSON est accepté
    /// aussi (charge FCM/APNs sérialisée telle quelle). Chaque entrée est
    /// rognée des espaces, mais AUCUNE n'est filtrée : `notificationIds` et
    /// `conversationIds` partagent le même RANG (doc du type ci-dessus,
    /// « même ordre, entrée vide possible »), et filtrer les vides
    /// SÉPARÉMENT sur les deux tableaux désynchronise ce rang — une entrée
    /// vide de `conversationIds` au rang i affirme « pas de conversation pour
    /// `notificationIds[i]` », ce n'est pas du bruit à retirer (#3894). Une
    /// bannière livrée n'a de toute façon jamais un `notificationId` vide
    /// (`covers(_:)` l'exclut explicitement), donc une entrée vide résiduelle
    /// dans `notificationIds` n'y fait correspondre aucune bannière.
    static func ids(from value: Any?) -> [String] {
        let raw: [String]
        switch value {
        case let joined as String: raw = joined.components(separatedBy: ",")
        case let array as [String]: raw = array
        case let array as [Any]: raw = array.compactMap { $0 as? String }
        default: raw = []
        }
        return raw.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
    }
}
