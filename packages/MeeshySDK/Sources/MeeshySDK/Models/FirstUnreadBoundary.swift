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
/// (`packages/shared/utils/first-unread.ts`), même 8 cas rejoués ici en Swift
/// Testing (`FirstUnreadBoundaryTests.swift`). Voir le doc-comment du fichier
/// TS pour la loi complète ; résumé :
///
/// 1. **Jamais un message du LECTEUR** — ni élu, ni compté.
/// 2. **Jamais avant (ni AU) la frontière** — `lastReadMessageCreatedAt` en
///    priorité (la clé chronologique, voir `ConversationReadCursor` côté
///    partagé pour la raison), repli sur `lastReadAt`. Aucun des deux ⇒ tout
///    message d'autrui est candidat (participant neuf / curseur absent).
///    `lastReadMessageId` est en plus exclu explicitement (défense contre un
///    décalage d'horloge entre le curseur et la fenêtre chargée).
/// 3. **`nil` si tout est lu** — jamais un `Result` à `unreadCount == 0`.
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
        viewerId: String
    ) -> Result? {
        let boundaryTime = lastReadMessageCreatedAt ?? lastReadAt

        let candidates = messages
            .filter { $0.senderId != viewerId }
            .filter { $0.id != lastReadMessageId }
            .filter { boundaryTime == nil || $0.createdAt > boundaryTime! }
            .sorted { $0.createdAt < $1.createdAt }

        guard let first = candidates.first else { return nil }

        return Result(firstUnreadId: first.id, unreadCount: candidates.count)
    }
}
