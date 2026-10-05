import Foundation

/// Le push qui REMPLACE une bannière la désigne lui-même.
///
/// Deux formes, deux contrats gateway
/// (`packages/shared/types/reproduced-notification-push.ts`) :
///
/// - **par identité** — `userInfo.replacesNotificationId` (`REPLACES_NOTIFICATION_FIELD`).
///   Éditer un message, un post ou un commentaire réécrit chaque notification
///   qui en portait le texte, sous la MÊME identité, et la passerelle repousse
///   la version d'après en nommant la ligne.
/// - **par acteur et sujet** — `userInfo.replacesActorSubject = "true"`
///   (`REPLACES_ACTOR_SUBJECT_FIELD`). Changer sa réaction (❤️ → 😂) retire une
///   ligne et en crée une AUTRE : aucune identité commune à nommer. La bannière
///   d'avant est celle du même `type`, du même acteur (`senderId`) et du même
///   sujet (`commentId`, sinon `messageId`, sinon `postId`).
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
    /// La clé du contrat « par identité » — nommée UNE fois.
    public static let userInfoKey = "replacesNotificationId"
    /// La clé du contrat « par acteur et sujet » — nommée UNE fois.
    public static let actorSubjectUserInfoKey = "replacesActorSubject"

    /// Ce qu'une réaction remplace : la bannière du même type, du même acteur,
    /// sur le même sujet.
    public struct ActorSubject: Equatable, Sendable {
        public let type: String
        public let senderId: String
        public let subjectId: String
    }

    /// L'identité de la notification réécrite, donc de la bannière d'avant —
    /// `nil` quand le push ne remplace que par acteur et sujet.
    public let replacedNotificationId: String?
    /// Le message de la notification, quand elle en a un — sert au seul repli
    /// des bannières d'ancien format, posées sans `notificationId`.
    public let messageId: String?
    /// Le type de la notification remplacée — même repli.
    public let type: String?
    /// Le remplacement par acteur et sujet, quand le push le déclare.
    public let actorSubject: ActorSubject?

    public init?(userInfo: [AnyHashable: Any]) {
        let replaced = Self.nonEmpty(userInfo[Self.userInfoKey])
        let actorSubject = Self.actorSubject(of: userInfo)
        guard replaced != nil || actorSubject != nil else { return nil }
        replacedNotificationId = replaced
        messageId = Self.nonEmpty(userInfo["messageId"])
        type = Self.nonEmpty(userInfo["type"])
        self.actorSubject = actorSubject
    }

    /// Une bannière livrée est remplacée quand elle porte l'identité réécrite,
    /// ou — pour une réaction — le même type, le même acteur et le même sujet.
    public func covers(_ bannerUserInfo: [AnyHashable: Any]) -> Bool {
        coversByIdentity(bannerUserInfo) || coversByActorSubject(bannerUserInfo)
    }

    /// Une bannière qui porte SON `notificationId` n'est jugée que sur lui : un
    /// autre id sur le même message (la réaction à ce message, une mention)
    /// est une autre notification. Sans `notificationId` (ancien format), le
    /// repli exige le même message ET le même type — jamais l'un seul.
    private func coversByIdentity(_ bannerUserInfo: [AnyHashable: Any]) -> Bool {
        guard let replacedNotificationId else { return false }
        if let bannerId = Self.nonEmpty(bannerUserInfo["notificationId"]) {
            return bannerId == replacedNotificationId
        }
        guard let messageId, let type else { return false }
        return Self.nonEmpty(bannerUserInfo["messageId"]) == messageId
            && Self.nonEmpty(bannerUserInfo["type"]) == type
    }

    private func coversByActorSubject(_ bannerUserInfo: [AnyHashable: Any]) -> Bool {
        guard let actorSubject else { return false }
        return Self.nonEmpty(bannerUserInfo["type"]) == actorSubject.type
            && Self.nonEmpty(bannerUserInfo["senderId"]) == actorSubject.senderId
            && Self.subjectId(of: bannerUserInfo) == actorSubject.subjectId
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

    private static func actorSubject(of userInfo: [AnyHashable: Any]) -> ActorSubject? {
        guard nonEmpty(userInfo[actorSubjectUserInfoKey]) == "true",
              let type = nonEmpty(userInfo["type"]),
              let senderId = nonEmpty(userInfo["senderId"]),
              let subjectId = subjectId(of: userInfo) else { return nil }
        return ActorSubject(type: type, senderId: senderId, subjectId: subjectId)
    }

    /// Le sujet le plus PRÉCIS que la charge nomme : un commentaire vit sous un
    /// post, donc le commentaire l'emporte sur le post qui le porte.
    private static func subjectId(of userInfo: [AnyHashable: Any]) -> String? {
        nonEmpty(userInfo["commentId"]) ?? nonEmpty(userInfo["messageId"]) ?? nonEmpty(userInfo["postId"])
    }

    private static func nonEmpty(_ value: Any?) -> String? {
        guard let string = value as? String else { return nil }
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
