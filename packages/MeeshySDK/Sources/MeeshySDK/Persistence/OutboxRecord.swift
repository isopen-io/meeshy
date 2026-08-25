import Foundation
import GRDB

/// Kind of write mutation persisted in the outbox.
///
/// Raw values are stable on-disk identifiers (column `outbox.kind`) — renaming
/// a case is a migration, not a refactor. New cases MUST be appended ;
/// existing cases MUST NOT have their raw value changed.
///
/// The first four (`.sendMessage`, `.sendReaction`, `.editMessage`,
/// `.deleteMessage`) are the message-centric kinds shipped in Phase 4 §6.
/// The 14 additional cases (Wave 1 Task 3.2) generalize the outbox to all
/// write mutations and key into the gateway `MutationLog` table via
/// `(userId, clientMutationId)`.
///
/// `CaseIterable` is required by `OutboxKindCodableTests` to lock the
/// total surface, and by future migration tooling.
public enum OutboxKind: String, Codable, CaseIterable, Sendable {
    // Message-centric (Phase 4 §6 — existing rows in the outbox table use
    // these raw values, do not rename).
    case sendMessage
    case sendReaction
    case editMessage
    case deleteMessage

    // Wave 1 Task 3.2 — non-message mutations. Keyed to the gateway
    // `MutationLog` via `clientMutationId` (`cmid_<uuid>`).
    case markAsRead
    case sendFriendRequest
    /// accept | reject — see `RespondFriendRequestPayload.action`.
    case respondFriendRequest
    case blockUser
    case unblockUser
    case createConversation
    /// title, description, avatar — see `UpdateConversationPayload`.
    case updateConversation
    /// displayName, bio, avatarUrl — see `UpdateProfilePayload`.
    case updateProfile
    /// language, regional, custom, notifications, privacy — see `UpdateSettingsPayload`.
    case updateSettings
    /// Existing `StoryOfflineQueue` items will migrate here (Tier C). The
    /// payload (`PublishStoryPayload`) holds the offline-queue item id so
    /// the slide snapshot stays in its current JSON file for now.
    case publishStory
    case repostStory
    case createPost
    /// Fil rouge du repost (lot 7, tâche 7.5) — porte `POST /posts/:id/repost`,
    /// PAS `.repostStory` (`RepostStoryPayload`, porte `targetConversationId`,
    /// un repost PRIVÉ en conversation — un autre geste) ni `.createPost` avec
    /// `repostOfId` (porte 3, cross-format, distincte de la republication
    /// simple). Voir `RepostPostPayload`. `targetType` y voyage OBLIGATOIRE
    /// (Loi 5 — « le repost miroite », spec 2026-08-23 §Loi 5) : jamais laissé
    /// au repli serveur `?? PostType.POST`, qui transforme silencieusement
    /// une source éphémère en post permanent.
    case repostPost
    /// R6 — état « vu » d'une story, durable offline (flush FIFO au reconnect).
    /// Idempotent côté gateway (P2002 no-op) ; coalescé par storyId (re-voir la
    /// même story ne stacke pas de doublons).
    case markStoryViewed
    case toggleLikePost
    case createComment
    case deleteComment
    case toggleLikeComment
    /// Point 7 — consommation d'un média (écoute, visionnage, ouverture,
    /// enregistrement). Volontairement NON coalescé : chaque rapport porte
    /// une trace différente, voir `ReportAttachmentStatusPayload`.
    case reportAttachmentStatus
}

extension OutboxKind {
    /// Whether a still-pending row of this kind should keep the app's
    /// « Synchronisation… » indicator visible.
    ///
    /// `markAsRead` est un accusé de lecture purement informatif et
    /// idempotent : s'il échoue ou reste coincé (session expirée, etc.) le
    /// contenu de la conversation est malgré tout synchronisé. Le compter
    /// ferait croire à l'utilisateur qu'une synchro est en cours alors que
    /// tout est à jour — c'est précisément le bandeau « bloqué » observé.
    /// `reportAttachmentStatus` relève de la même logique : personne n'attend
    /// qu'un rapport d'écoute parte pour considérer sa conversation à jour.
    /// `markStoryViewed` est le troisième de la famille : « vu » binaire,
    /// idempotent côté gateway (P2002 no-op), coalescé par storyId et sans
    /// destination de navigation (`OutboxUIItem.Source.unknown` → le tap sur la
    /// pastille ne mène nulle part). Le compter rendait la pastille PERMANENTE
    /// dès qu'un « vu » épuisait son budget de tentatives : `.exhausted` est
    /// explicitement surfacé (T14b), l'auto-masquage après 3 cycles a été
    /// retiré (2026-05-27) et la rétention GC est de 7 jours au boot — d'où le
    /// « Vues story non synchronisées 7/7 » figé en tête d'écran, sans aucun
    /// geste pour l'écarter.
    public var countsTowardSyncIndicator: Bool {
        switch self {
        case .markAsRead, .reportAttachmentStatus, .markStoryViewed:
            return false
        default:
            return true
        }
    }
}

public enum OutboxStatus: String, Codable, Sendable {
    case pending
    case inflight
    case failed
    case exhausted
}

public struct OutboxRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    public static let databaseTableName = "outbox"

    public let id: String
    public let kind: OutboxKind
    public let conversationId: String
    public let messageLocalId: String?
    /// Stable end-to-end identifier (`cid_<uuid v4 lowercase>`) used for idempotent
    /// dedup with the gateway and for in-queue coalescing of edit/delete/reaction
    /// records targeting the same message.
    public let clientMessageId: String
    public let payload: Data
    public var status: OutboxStatus
    public var attempts: Int
    public var lastError: String?
    public let createdAt: Date
    public var updatedAt: Date
    public var nextAttemptAt: Date
    /// Task 10, round 2 de revue (Important) — l'instant où CETTE ligne a
    /// été différée pour la PREMIÈRE FOIS parce qu'elle attend sa cible
    /// d'origine de fan-out (`OutboxDeferralError.waitingForFanoutOrigin`).
    /// `nil` tant que la ligne n'a jamais rencontré ce cas.
    ///
    /// Distinct de `createdAt` À DESSEIN : pour une copie de fan-out,
    /// `createdAt` porte l'horodatage du PARTAGE posé par l'extension (voir
    /// `SharePendingShare.createdAt`), qui peut précéder de plusieurs JOURS
    /// l'entrée réelle de cette ligne dans l'outbox — la reprise n'a lieu
    /// qu'au démarrage de l'app (`SharePendingSendConsumer.consumeAll`).
    /// Mesurer `OutboxFlusher.fanoutOriginWaitTimeout` depuis `createdAt`
    /// rouvrait donc, pour toute reprise différée, le défaut Critical corrigé
    /// au round 1. Ce champ, lui, est posé au moment du premier report RÉEL
    /// et PERSISTE avec la ligne (donc survit à un redémarrage de l'app),
    /// sans jamais retoucher `createdAt` — qui porte l'ordre de départ
    /// (l'epsilon du round 1) et la règle « ne pas antidater un partage
    /// repris ».
    public var waitingForFanoutOriginSince: Date?

    public init(
        id: String = UUID().uuidString,
        kind: OutboxKind,
        conversationId: String,
        messageLocalId: String? = nil,
        clientMessageId: String,
        payload: Data,
        status: OutboxStatus = .pending,
        attempts: Int = 0,
        lastError: String? = nil,
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        nextAttemptAt: Date = Date(),
        waitingForFanoutOriginSince: Date? = nil
    ) {
        self.id = id
        self.kind = kind
        self.conversationId = conversationId
        self.messageLocalId = messageLocalId
        self.clientMessageId = clientMessageId
        self.payload = payload
        self.status = status
        self.attempts = attempts
        self.lastError = lastError
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.nextAttemptAt = nextAttemptAt
        self.waitingForFanoutOriginSince = waitingForFanoutOriginSince
    }
}
