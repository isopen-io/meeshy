import Foundation

/// Le push d'une notification RÉÉCRITE nomme la bannière qu'il ANNULE.
///
/// Éditer un message, un post ou un commentaire réécrit chaque notification qui
/// en portait le texte, sous la MÊME identité, et la passerelle repousse la
/// version d'après avec `userInfo.replacesNotificationId = <id de la ligne>`
/// (`REPLACES_NOTIFICATION_FIELD`, `packages/shared/types/reproduced-notification-push.ts`).
///
/// ## Pourquoi l'annulation voyage AVEC le remplacement
///
/// Elle partait avant dans un push SILENCIEUX séparé (`notification_revoked`).
/// APNs n'ordonne pas deux pushes, iOS bride le silencieux, et ne le livre
/// jamais à une application tuée : livré APRÈS le remplacement, il effaçait la
/// version d'après ; jamais livré, il laissait la version d'avant à côté d'elle.
/// Porté par le remplacement lui-même, il ne peut ni arriver après lui ni se
/// perdre sans lui — à condition que l'hôte qui l'AFFICHE (la NSE, ou
/// `willPresent` au premier plan) retire la bannière AVANT de rendre la main.
///
/// Type PUR : il ne fait que dire quelles bannières livrées sont remplacées.
/// Le retrait (et sa confirmation) appartient à chaque hôte.
public struct NotificationReplacement: Equatable, Sendable {
    /// La clé du contrat gateway — nommée UNE fois.
    public static let userInfoKey = "replacesNotificationId"

    /// L'identité de la notification réécrite, donc de la bannière d'avant.
    public let replacedNotificationId: String
    /// Le message de la notification, quand elle en a un — sert au seul repli
    /// des bannières d'ancien format, posées sans `notificationId`.
    public let messageId: String?
    /// Le type de la notification remplacée — même repli.
    public let type: String?

    public init?(userInfo: [AnyHashable: Any]) {
        guard let replaced = Self.nonEmpty(userInfo[Self.userInfoKey]) else { return nil }
        replacedNotificationId = replaced
        messageId = Self.nonEmpty(userInfo["messageId"])
        type = Self.nonEmpty(userInfo["type"])
    }

    /// Une bannière livrée est remplacée quand elle porte l'identité réécrite.
    ///
    /// Une bannière qui porte SON `notificationId` n'est jugée que sur lui : un
    /// autre id sur le même message (la réaction à ce message, une mention)
    /// est une autre notification. Sans `notificationId` (ancien format), le
    /// repli exige le même message ET le même type — jamais l'un seul.
    public func covers(_ bannerUserInfo: [AnyHashable: Any]) -> Bool {
        if let bannerId = Self.nonEmpty(bannerUserInfo["notificationId"]) {
            return bannerId == replacedNotificationId
        }
        guard let messageId, let type else { return false }
        return Self.nonEmpty(bannerUserInfo["messageId"]) == messageId
            && Self.nonEmpty(bannerUserInfo["type"]) == type
    }

    /// Les identifiants de requête à retirer parmi les bannières livrées.
    ///
    /// La requête ENTRANTE est exclue : un `apns-collapse-id` identique à celui
    /// d'une bannière livrée la remplace déjà nativement, et la retirer ici
    /// n'apporterait que le risque de toucher la version d'après.
    public func identifiersToRemove(
        from delivered: [(id: String, userInfo: [AnyHashable: Any])],
        excluding incomingIdentifier: String
    ) -> [String] {
        delivered.compactMap { entry in
            entry.id != incomingIdentifier && covers(entry.userInfo) ? entry.id : nil
        }
    }

    private static func nonEmpty(_ value: Any?) -> String? {
        guard let string = value as? String else { return nil }
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
