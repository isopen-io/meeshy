import Foundation

/// Un message minimal, tel que `FirstUnreadBoundary` en a besoin — jamais le
/// modèle complet `MeeshyMessage` (building block SDK, § SDK Purity du
/// `CLAUDE.md` racine : paramètres opaques, aucune dépendance à un store
/// nommé).
public struct FirstUnreadCandidateMessage: Equatable, Sendable {
    public let id: String
    public let senderId: String
    public let createdAt: Date

    public init(id: String, senderId: String, createdAt: Date) {
        self.id = id
        self.senderId = senderId
        self.createdAt = createdAt
    }
}

/// La loi du PREMIER MESSAGE NON LU — miroir de `firstUnreadBoundary()`
/// (`packages/shared/utils/first-unread.ts`), mêmes cas rejoués ici en Swift
/// Testing (`FirstUnreadBoundaryTests.swift`). Voir le doc-comment du fichier
/// TS pour la loi complète, ses citations `fichier:ligne` et ses deux bornes
/// assumées (le compte porte sur la FENÊTRE reçue, pas sur la conversation ;
/// un message supprimé n'arrive jamais, la liste pose `deletedAt: null`).
/// Résumé :
///
/// 1. **Jamais un message du LECTEUR** — ni élu, ni compté. `viewerId` et
///    `senderId` se comparent dans l'espace des `User.id`, celui que le
///    gateway sert aux clients (il remappe le `Participant.id` de la base).
/// 2. **Jamais avant (ni AU) la frontière** — les MÊMES trois rangs que le
///    compte autoritatif du serveur
///    (`services/gateway/src/services/MessageReadStatusService.ts:259-260`) :
///    `lastReadMessageCreatedAt` (la clé chronologique), puis `lastReadAt`
///    (l'horloge de l'ACTION de lecture), puis `joinedAt` (l'entrée du
///    lecteur — sans lui, un membre neuf d'un groupe ancien ouvrirait le fil
///    sur le premier message de 2019 ; il se lit sur
///    `MeeshyConversation.currentUserJoinedAt`, servi par `GET
///    /conversations` mais PAS par `GET /conversations/:id`). Aucun des
///    trois ⇒ tout message d'autrui est candidat. `lastReadMessageId` est en plus exclu
///    explicitement (défense contre un décalage d'horloge entre le curseur et
///    la fenêtre chargée).
/// 3. **`nil` si tout est lu** — jamais un `Result` à `unreadCount == 0`.
///
/// À `createdAt` ÉGAL, l'`id` départage : `Swift.sorted(by:)` n'est PAS
/// stable là où `Array.prototype.sort` l'est, donc sans cette seconde clé les
/// deux miroirs éliraient deux messages différents pour la même entrée.
///
/// Stateless et pur — safe à appeler depuis `body` ou hors `@MainActor`.
public enum FirstUnreadBoundary {

    public struct Result: Equatable, Sendable {
        public let firstUnreadId: String
        public let unreadCount: Int

        public init(firstUnreadId: String, unreadCount: Int) {
            self.firstUnreadId = firstUnreadId
            self.unreadCount = unreadCount
        }
    }

    public static func resolve(
        messages: [FirstUnreadCandidateMessage],
        lastReadMessageId: String?,
        lastReadAt: Date?,
        lastReadMessageCreatedAt: Date?,
        joinedAt: Date? = nil,
        viewerId: String
    ) -> Result? {
        let boundaryTime = lastReadMessageCreatedAt ?? lastReadAt ?? joinedAt

        let candidates = messages
            .filter { $0.senderId != viewerId }
            .filter { $0.id != lastReadMessageId }
            .filter { message in
                guard let boundaryTime else { return true }
                return message.createdAt > boundaryTime
            }
            .sorted { left, right in
                left.createdAt == right.createdAt
                    ? left.id < right.id
                    : left.createdAt < right.createdAt
            }

        guard let first = candidates.first else { return nil }

        return Result(firstUnreadId: first.id, unreadCount: candidates.count)
    }
}
