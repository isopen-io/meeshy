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
        /// Le compte de la FENÊTRE reçue, jamais de la conversation (borne
        /// assumée, ci-dessus). **iOS ne l'ANNONCE plus depuis #7525** :
        /// `ConversationViewModel+InitialLoad` ne retient de cette loi que
        /// `firstUnreadId` (la POSITION) et affiche
        /// `conversation.userState.unreadCount` — le compte SERVEUR, celui de
        /// la ligne de liste — parce que le curseur serveur n'avance que sur
        /// le préfixe contigu vu et que la fenêtre paginée gardait alors des
        /// candidats déjà comptés lus. Le rebrancher sur le séparateur rouvre
        /// la divergence séparateur ↔ ligne de liste. Le miroir web
        /// (`apps/web-v2/src/lib/view/unread-boundary.ts`) le lit encore.
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
        let candidates = orderedCandidates(
            messages: messages,
            lastReadMessageId: lastReadMessageId,
            lastReadAt: lastReadAt,
            lastReadMessageCreatedAt: lastReadMessageCreatedAt,
            joinedAt: joinedAt,
            viewerId: viewerId
        )

        guard let first = candidates.first else { return nil }

        return Result(firstUnreadId: first.id, unreadCount: candidates.count)
    }

    /// Ce qui RESTE non lu après une lecture partielle (#7350, I-2), borné par
    /// la MÊME frontière que `resolve`. Le serveur n'avance son curseur que
    /// jusqu'au bout du PRÉFIXE CONTIGU de messages vus depuis la frontière
    /// (`MessageReadStatusService.ts`, mode exact) : un message sauté arrête
    /// le compte, et la loi le rejoue à l'identique.
    ///
    /// - `windowIsAtTip` : la fenêtre atteint le présent. Elle porte alors
    ///   TOUS les non-lus récents — y compris ceux arrivés depuis l'ouverture.
    ///   Si elle en compte MOINS que `unreadAtOpen`, les manquants sont PLUS
    ///   ANCIENS qu'elle : le premier non-lu réel n'y est pas, le curseur
    ///   serveur ne peut pas avancer, rien n'est consommé.
    /// - sinon (fenêtre ouverte SUR le séparateur, D-L2), les non-lus absents
    ///   sont plus RÉCENTS qu'elle et se déduisent de `unreadAtOpen`.
    /// - `caughtUpMessageId` : le dernier message RATTRAPÉ pendant l'affichage
    ///   (`ConversationCatchUpLaw`). Le serveur y a posé son curseur
    ///   (`caughtUpToMessageId`) quels que soient les messages sautés : il
    ///   devient la frontière, et rien n'était non lu à cet instant. Absent
    ///   de la fenêtre, il ne déplace rien.
    public static func remainingUnread(
        messages: [FirstUnreadCandidateMessage],
        lastReadMessageId: String?,
        lastReadAt: Date?,
        lastReadMessageCreatedAt: Date?,
        joinedAt: Date? = nil,
        viewerId: String,
        seenIds: Set<String>,
        unreadAtOpen: Int,
        windowIsAtTip: Bool,
        caughtUpMessageId: String? = nil
    ) -> Int {
        if let caughtUp = caughtUpMessageId.flatMap({ id in messages.first { $0.id == id } }) {
            return remainingUnread(
                messages: messages,
                lastReadMessageId: caughtUp.id,
                lastReadAt: nil,
                lastReadMessageCreatedAt: caughtUp.createdAt,
                joinedAt: joinedAt,
                viewerId: viewerId,
                seenIds: seenIds,
                unreadAtOpen: 0,
                windowIsAtTip: windowIsAtTip
            )
        }

        let candidates = orderedCandidates(
            messages: messages,
            lastReadMessageId: lastReadMessageId,
            lastReadAt: lastReadAt,
            lastReadMessageCreatedAt: lastReadMessageCreatedAt,
            joinedAt: joinedAt,
            viewerId: viewerId
        )
        let consumed = candidates.prefix { seenIds.contains($0.id) }.count

        guard windowIsAtTip else { return max(0, unreadAtOpen - consumed) }
        guard candidates.count >= unreadAtOpen else { return max(0, unreadAtOpen) }
        return candidates.count - consumed
    }

    private static func orderedCandidates(
        messages: [FirstUnreadCandidateMessage],
        lastReadMessageId: String?,
        lastReadAt: Date?,
        lastReadMessageCreatedAt: Date?,
        joinedAt: Date?,
        viewerId: String
    ) -> [FirstUnreadCandidateMessage] {
        let boundaryTime = lastReadMessageCreatedAt ?? lastReadAt ?? joinedAt

        return messages
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
    }
}
