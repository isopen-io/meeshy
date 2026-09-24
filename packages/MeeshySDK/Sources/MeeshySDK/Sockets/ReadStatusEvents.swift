import Foundation

// MARK: - Read Status Event Data
//
// Extrait de `MessageSocketManager.swift` (budget de taille, CLAUDE.md —
// 4058 lignes, hors budget ; extraction PAR RESPONSABILITÉ avant tout ajout)
// au lot G-5 (#7347), pour y ajouter le mirroring de `messageId`/`readByAllAt`
// sans ajouter au fichier déjà hors budget.

/// Miroir Swift de `ReadStatusSummary`
/// (`packages/shared/types/socketio-events/message.ts`) — CHANGE avec elle,
/// jamais seul (règle du dépôt : « type partagé + miroir Swift changent
/// ensemble »).
///
/// `messageId` (#7348/W2, #7347/G-5) — le message que CE résumé décrit.
/// OPTIONNEL : une passerelle qui n'a pas encore basculé G-5 (repli legacy,
/// `broadcastReadStatus.getLatestMessageSummary`) ne le pose pas, et le
/// résumé décrit alors le DERNIER message non supprimé de la conversation —
/// même repli que documenté côté web (`applyReadStatusUpdated`,
/// `apps/web/src/lib/api/realtime-apply.ts`).
///
/// `readByAllAt` (#7347, G-5) — l'instant où le DERNIER destinataire actif a
/// lu CE message, `nil` tant qu'il en manque un. Même moteur que le REST
/// (`MessageReadStatusService.getConversationReadStatuses`, gateway).
///
/// Le CONSOMMATEUR iOS (`ConversationSocketHandler.swift`,
/// `MessagePersistenceActor.batchDeliverySync`, `ConversationSyncEngine
/// .applyReadReceipt(frontier:)`) n'est PAS réécrit par ce lot, et PRATIQUE
/// un défaut APPARENTÉ, pas une immunité : son mécanisme de FRONTIÈRE
/// applique `event.updatedAt` (et, avec G-5, le résumé du SEUL message
/// nommé par `summary.messageId`) à TOUT message ENVOYÉ localement sous
/// cette date — y compris des messages plus RÉCENTS que le pair n'a pas
/// encore vus. Avant G-5, l'agrégat portait sur le dernier message et ce
/// cas ne se produisait pas ; depuis G-5, un résumé par message rend la
/// frontière iOS capable de peindre un faux ✓✓ « Lu » sur un message que
/// le pair n'a pas lu. Le cibler PAR message (lire `summary.messageId`
/// avant d'appliquer la frontière) serait une réécriture d'architecture
/// distincte, hors des fichiers cadrés par ce lot (`ConversationSocketHandler.swift`
/// et `MessagePersistenceActor.swift` sont eux-mêmes hors budget, 1393 et
/// 2376 lignes, à extraire PAR RESPONSABILITÉ avant tout ajout) — dette
/// CONSIGNÉE, pas soldée : les deux champs sont décodés et prêts, mais
/// aucun consommateur iOS ne les lit encore. Suivi : voir l'issue iOS du
/// même milestone que #7347.
public struct ReadStatusSummary: Decodable, Sendable {
    public let totalMembers: Int
    public let deliveredCount: Int
    public let readCount: Int
    public let messageId: String?
    public let readByAllAt: Date?

    // Init EXPLICITE, jamais une valeur initiale sur les propriétés :
    // `= nil` sur une propriété `Decodable` SUPPRIME son décodage (le
    // compilateur l'avertit — « will not be decoded because it is declared
    // with an initial value which cannot be overwritten ») — `messageId` et
    // `readByAllAt` seraient restés `nil` même PRÉSENTS dans le JSON, un
    // défaut que seul un témoin qui affirme la valeur DÉCODÉE peut voir. Cet
    // init garde les trois-arguments des témoins existants appelables
    // (`NotificationCoordinatorTests`, `ConversationSyncEngineTests` ×3,
    // `ConversationStoreSocketBridgeTests`) SANS toucher à la synthèse
    // `Decodable.init(from:)`, qui reste automatique.
    public init(
        totalMembers: Int,
        deliveredCount: Int,
        readCount: Int,
        messageId: String? = nil,
        readByAllAt: Date? = nil
    ) {
        self.totalMembers = totalMembers
        self.deliveredCount = deliveredCount
        self.readCount = readCount
        self.messageId = messageId
        self.readByAllAt = readByAllAt
    }
}

public struct ReadStatusUpdateEvent: Decodable, Sendable {
    public let conversationId: String
    public let participantId: String
    /// `User.id` of the actor, or `nil` when the actor is an ANONYMOUS
    /// participant — they have no `User` row, so `participantId` is their only
    /// identity. Expected on the automatic delivery receipt of a share-link
    /// conversation, where anonymous participants are the dominant population.
    /// Consumers comparing this against the current user (multi-device read
    /// cursor sync) need no change: `nil` matches nobody, which is correct.
    public let userId: String?
    public let type: String
    public let updatedAt: Date
    public let summary: ReadStatusSummary
    /// Read frontier of the ACTOR at broadcast time. Lets the actor's OTHER
    /// devices sync their own read cursor (multi-device read sync). `nil` from
    /// a pre-rollout gateway or when the actor has no cursor yet. A recipient
    /// who is not the actor MUST ignore it. Read receipts are monotone, so a
    /// client applies it only when strictly newer than its local cursor.
    ///
    /// The actor is `userId ?? participantId`, in that order. `userId` alone is
    /// `nil` for a share-link guest, whose devices could then never recognise
    /// themselves; `participantId` is non-nil for the whole population and
    /// shared by every device of one identity. Same rule that names the
    /// personal room. This client has no accountless session, so it matches on
    /// `userId` only — the second branch stays unused here, and
    /// `ConversationStoreSocketBridge` is correct as written.
    ///
    /// **Delivered ONLY in the copy addressed to the actor.** This field and
    /// `unreadCount` describe a person, not the conversation — how far behind
    /// they are on this thread, and when they last caught up. The gateway
    /// therefore emits a `read` TWICE: one copy without them to the
    /// conversation fan-out, one complete copy to the actor's personal room
    /// (`user:<userId ?? participantId>`), which the fan-out excludes so no
    /// socket receives both. Nothing changes for this client: a device of the
    /// actor still joins that room at authentication and still receives the
    /// pair. A device that is NOT the actor now simply never sees the values
    /// its `event.userId == me` gate was already discarding.
    public let lastReadAt: Date?
    /// Server-authoritative unread count for the ACTOR after the action.
    /// Same `userId ?? participantId` scoping as `lastReadAt`, and the same
    /// addressing scope: the actor's copy, never the fan-out. `nil` from a
    /// pre-rollout gateway.
    public let unreadCount: Int?

    public init(
        conversationId: String,
        participantId: String,
        userId: String?,
        type: String,
        updatedAt: Date,
        summary: ReadStatusSummary,
        lastReadAt: Date? = nil,
        unreadCount: Int? = nil
    ) {
        self.conversationId = conversationId
        self.participantId = participantId
        self.userId = userId
        self.type = type
        self.updatedAt = updatedAt
        self.summary = summary
        self.lastReadAt = lastReadAt
        self.unreadCount = unreadCount
    }
}
