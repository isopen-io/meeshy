import Foundation

// MARK: - Offline Queue Item

// Extrait d'`OfflineQueue.swift` (3 297 lignes, très au-delà du plafond DUR de
// 1 200 de la directive 2026-09-02, qui INTERDIT d'ajouter à un fichier hors
// budget) : l'ancre de la pièce citée (#6164) doit survivre à un envoi mis en
// file — on extrait d'abord, on ajoute ensuite.
//
// Le découpage suit la RESPONSABILITÉ, pas une tranche : l'ITEM est ce qu'on
// met dans la file, la FILE est l'acteur qui l'ordonne, le persiste et le
// rejoue. L'item ne connaît ni GRDB ni Combine — il se relit seul, et c'est
// ce que la séparation rend visible.

public struct OfflineQueueItem: Codable, Identifiable, Sendable {
    public let id: String
    /// Stable end-to-end identifier (`cid_<uuid v4 lowercase>`) used to dedup
    /// the message on the server (see `MessagingService.handleMessage`
    /// catch-P2002 pattern in the gateway) and to coalesce in-queue actions
    /// targeting the same logical message (edit-after-send, delete-after-edit,
    /// etc.). Replaces the legacy `temp_/offline_/retry_*` prefixed local ids.
    public let clientMessageId: String
    /// Backwards-compatible alias surfaced as `tempId` to existing consumers
    /// (Combine subscribers, optimistic UI, persisted message cache rows).
    /// Now identical to `clientMessageId` — the legacy local-id prefix scheme
    /// has been removed end-to-end as of Phase 4.
    public var tempId: String { clientMessageId }
    public let conversationId: String
    public let content: String
    public let originalLanguage: String?
    public let replyToId: String?
    public let forwardedFromId: String?
    public let forwardedFromConversationId: String?
    public let attachmentIds: [String]?
    /// Raw values of `AttachmentKind` aligned with `attachmentIds` by index.
    /// `nil` when the queue item was created before this field existed (old
    /// on-disk rows decoded after a SDK upgrade) — the mapper falls back to
    /// `.image` per spec §4.2 in that case. Optional so the synthesized
    /// `Decodable` keeps reading legacy payloads without migration.
    public let attachmentKinds: [String]?
    /// Local filesystem path to a pending audio file kept under
    /// `Documents/pending-audio/<clientMessageId>.m4a` while the message
    /// waits for upload. `nil` for non-audio messages. The pattern is
    /// write-ahead: `OutboxRecord` is inserted FIRST (status `.pending`
    /// referencing this path), then the audio bytes are copied to disk.
    /// Boot recovery (`OfflineQueue.bootRecovery`) detects records whose
    /// referenced file is missing and marks them `.failed`.
    public let localAudioPath: String?
    /// Relative paths to N pending audio files for a MULTI-TRACK audio message,
    /// stored under `Documents/pending-audio/<clientMessageId>/<index>.m4a`.
    /// `nil` for non-audio and for legacy single-audio messages (which use
    /// `localAudioPath`). Decoded with `decodeIfPresent` so on-disk rows
    /// written before this field existed keep decoding without migration.
    public let localAudioPaths: [String]?
    /// Relative paths to N pending VISUAL media files (image/video) for an
    /// offline photo/video message, under
    /// `Documents/pending-media/<clientMessageId>/<index>.<ext>`. The original
    /// file extension is PRESERVED so the dispatcher can derive the upload MIME
    /// per file. `nil` for non-visual messages. Decoded with `decodeIfPresent`
    /// so on-disk rows written before this field existed keep decoding without
    /// migration (S7b — durable offline media, parity with `localAudioPaths`).
    public let localMediaPaths: [String]?
    /// Lieu partagé attaché au message (Lot 2 — chaîne d'écriture du lieu).
    /// Rejoué tel quel par le dispatcher sous la clé `location` du corps REST.
    /// `nil` pour un message sans lieu ET pour les lignes écrites avant ce
    /// champ — décodé en `decodeIfPresent` pour que les payloads déjà sur le
    /// disque des utilisateurs continuent à décoder sans migration (même
    /// convention que `attachmentKinds` / `localAudioPaths`).
    public let location: SharedPlace?
    /// Sticker du message (#4823) — ce que le PNG rejoué REPRÉSENTE, rejoué
    /// par le dispatcher sous la clé `sticker` (REST et socket) à côté des
    /// pièces jointes remontées. `nil` pour un message sans sticker ET pour
    /// les lignes écrites avant ce champ — même convention `decodeIfPresent`
    /// que `location`, pour que les payloads déjà sur disque décodent sans
    /// migration.
    public let sticker: MessageSticker?
    /// Fan-out de partage — le `clientMessageId` LOCAL de la cible qui porte
    /// les octets. Au moment de l'enfilage, cette cible n'a pas encore été
    /// envoyée : son identifiant SERVEUR n'existe pas. `OutboxDispatcher` le
    /// résout au moment de partir (`PendingIdRecord`) et, à défaut, réessaie
    /// plus tard. `nil` pour tout message ordinaire ET pour les lignes écrites
    /// avant ce champ — décodé en `decodeIfPresent` pour que les payloads déjà
    /// sur le disque des utilisateurs continuent à décoder sans migration
    /// (même convention que `attachmentKinds` / `localAudioPaths`).
    public let copyAttachmentsFromClientMessageId: String?
    /// Fan-out de partage — l'identifiant SERVEUR de la cible d'origine,
    /// quand il est DÉJÀ connu au moment de l'enfilage. Cas unique :
    /// `SharePendingSendConsumer` reprend une fiche dont l'origine a été
    /// servie par l'EXTENSION de partage, qui poste directement en REST sans
    /// jamais écrire de ligne locale — `PendingIdRecord` (alimenté par
    /// `applyEvent(.serverAck)` sur un envoi APP) ne peut donc jamais
    /// résoudre `copyAttachmentsFromClientMessageId` pour ce cas précis. La
    /// fiche de reprise porte déjà `serverMessageId` par cible ; ce champ le
    /// transporte jusqu'au dispatcher pour l'utiliser DIRECTEMENT, sans
    /// passer par une traduction GRDB qui ne peut pas aboutir. `nil` pour
    /// tout message ordinaire, pour une origine partie par l'app (résolution
    /// via `PendingIdRecord`, chemin inchangé), et pour les lignes écrites
    /// avant ce champ — même convention `decodeIfPresent`.
    public let copyAttachmentsFromServerMessageId: String?
    /// **L'ANCRE de la pièce citée** (#6164), rejouée telle quelle par le
    /// dispatcher sous la clé `attachmentReplyTo` du corps REST.
    ///
    /// Un identifiant NU, pas un `QuotedAttachmentSend` : ce qui se persiste
    /// doit se relire, et une file écrite avant ce champ ne connaît aucun type.
    /// Le dispatcher le rehabille au moment de partir — le seul endroit qui
    /// compose un corps.
    ///
    /// **Ce champ est la raison pour laquelle le repli socket refuse un envoi
    /// qui le porte** (`ConversationViewModel.sendMessage`) : le canal socket
    /// perdrait l'ancre en silence, alors que l'outbox la préserve. Sans lui,
    /// une réponse composée sur la troisième photo d'un carrousel partirait,
    /// après un échec réseau, en citant la première.
    ///
    /// `nil` pour toute réponse ordinaire ET pour les lignes écrites avant ce
    /// champ — même convention `decodeIfPresent` que `location` et `sticker`,
    /// pour que les payloads déjà sur disque décodent sans migration.
    public let attachmentReplyTo: String?
    public let createdAt: Date

    public init(
        conversationId: String,
        content: String,
        clientMessageId: String? = nil,
        originalLanguage: String? = nil,
        replyToId: String? = nil,
        forwardedFromId: String? = nil,
        forwardedFromConversationId: String? = nil,
        attachmentIds: [String]? = nil,
        attachmentKinds: [String]? = nil,
        localAudioPath: String? = nil,
        localAudioPaths: [String]? = nil,
        localMediaPaths: [String]? = nil,
        location: SharedPlace? = nil,
        sticker: MessageSticker? = nil,
        copyAttachmentsFromClientMessageId: String? = nil,
        copyAttachmentsFromServerMessageId: String? = nil,
        attachmentReplyTo: String? = nil
    ) {
        self.id = UUID().uuidString
        self.clientMessageId = clientMessageId ?? ClientMessageId.generate()
        self.conversationId = conversationId
        self.content = content
        self.originalLanguage = originalLanguage
        self.replyToId = replyToId
        self.forwardedFromId = forwardedFromId
        self.forwardedFromConversationId = forwardedFromConversationId
        self.attachmentIds = attachmentIds
        self.attachmentKinds = attachmentKinds
        self.localAudioPath = localAudioPath
        self.localAudioPaths = localAudioPaths
        self.localMediaPaths = localMediaPaths
        self.location = location
        self.sticker = sticker
        self.copyAttachmentsFromClientMessageId = copyAttachmentsFromClientMessageId
        self.copyAttachmentsFromServerMessageId = copyAttachmentsFromServerMessageId
        self.attachmentReplyTo = attachmentReplyTo
        self.createdAt = Date()
    }

    /// Decoder-friendly init that accepts a pre-existing `id` and `createdAt`,
    /// used when re-hydrating from `OutboxRecord.payload` at boot or retry time.
    public init(
        id: String,
        clientMessageId: String,
        conversationId: String,
        content: String,
        originalLanguage: String?,
        replyToId: String?,
        forwardedFromId: String?,
        forwardedFromConversationId: String?,
        attachmentIds: [String]?,
        attachmentKinds: [String]? = nil,
        localAudioPath: String?,
        localAudioPaths: [String]? = nil,
        localMediaPaths: [String]? = nil,
        location: SharedPlace? = nil,
        sticker: MessageSticker? = nil,
        copyAttachmentsFromClientMessageId: String? = nil,
        copyAttachmentsFromServerMessageId: String? = nil,
        attachmentReplyTo: String? = nil,
        createdAt: Date
    ) {
        self.id = id
        self.clientMessageId = clientMessageId
        self.conversationId = conversationId
        self.content = content
        self.originalLanguage = originalLanguage
        self.replyToId = replyToId
        self.forwardedFromId = forwardedFromId
        self.forwardedFromConversationId = forwardedFromConversationId
        self.attachmentIds = attachmentIds
        self.attachmentKinds = attachmentKinds
        self.localAudioPath = localAudioPath
        self.localAudioPaths = localAudioPaths
        self.localMediaPaths = localMediaPaths
        self.location = location
        self.sticker = sticker
        self.copyAttachmentsFromClientMessageId = copyAttachmentsFromClientMessageId
        self.copyAttachmentsFromServerMessageId = copyAttachmentsFromServerMessageId
        self.attachmentReplyTo = attachmentReplyTo
        self.createdAt = createdAt
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case clientMessageId
        case conversationId
        case content
        case originalLanguage
        case replyToId
        case forwardedFromId
        case forwardedFromConversationId
        case attachmentIds
        case attachmentKinds
        case localAudioPath
        case localAudioPaths
        case localMediaPaths
        case location
        case sticker
        case copyAttachmentsFromClientMessageId
        case copyAttachmentsFromServerMessageId
        case attachmentReplyTo
        case createdAt
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try c.decode(String.self, forKey: .id)
        self.clientMessageId = try c.decode(String.self, forKey: .clientMessageId)
        self.conversationId = try c.decode(String.self, forKey: .conversationId)
        self.content = try c.decode(String.self, forKey: .content)
        self.originalLanguage = try c.decodeIfPresent(String.self, forKey: .originalLanguage) ?? nil
        self.replyToId = try c.decodeIfPresent(String.self, forKey: .replyToId) ?? nil
        self.forwardedFromId = try c.decodeIfPresent(String.self, forKey: .forwardedFromId) ?? nil
        self.forwardedFromConversationId = try c.decodeIfPresent(String.self, forKey: .forwardedFromConversationId) ?? nil
        self.attachmentIds = try c.decodeIfPresent([String].self, forKey: .attachmentIds) ?? nil
        self.attachmentKinds = try c.decodeIfPresent([String].self, forKey: .attachmentKinds) ?? nil
        self.localAudioPath = try c.decodeIfPresent(String.self, forKey: .localAudioPath) ?? nil
        self.localAudioPaths = try c.decodeIfPresent([String].self, forKey: .localAudioPaths) ?? nil
        self.localMediaPaths = try c.decodeIfPresent([String].self, forKey: .localMediaPaths) ?? nil
        // Clé absente des lignes écrites avant ce champ → nil, jamais d'échec.
        self.location = try c.decodeIfPresent(SharedPlace.self, forKey: .location)
        // Même tolérance : un sticker non rendable (clé présente mais vide)
        // vaut absent, comme partout où `MessageSticker` est relu.
        self.sticker = try c.decodeIfPresent(MessageSticker.self, forKey: .sticker)?.ifRenderable
        self.copyAttachmentsFromClientMessageId = try c.decodeIfPresent(String.self, forKey: .copyAttachmentsFromClientMessageId)
        self.copyAttachmentsFromServerMessageId = try c.decodeIfPresent(String.self, forKey: .copyAttachmentsFromServerMessageId)
        self.attachmentReplyTo = try c.decodeIfPresent(String.self, forKey: .attachmentReplyTo)
        self.createdAt = try c.decode(Date.self, forKey: .createdAt)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(clientMessageId, forKey: .clientMessageId)
        try c.encode(conversationId, forKey: .conversationId)
        try c.encode(content, forKey: .content)
        try c.encodeIfPresent(originalLanguage, forKey: .originalLanguage)
        try c.encodeIfPresent(replyToId, forKey: .replyToId)
        try c.encodeIfPresent(forwardedFromId, forKey: .forwardedFromId)
        try c.encodeIfPresent(forwardedFromConversationId, forKey: .forwardedFromConversationId)
        try c.encodeIfPresent(attachmentIds, forKey: .attachmentIds)
        try c.encodeIfPresent(attachmentKinds, forKey: .attachmentKinds)
        try c.encodeIfPresent(localAudioPath, forKey: .localAudioPath)
        try c.encodeIfPresent(localAudioPaths, forKey: .localAudioPaths)
        try c.encodeIfPresent(localMediaPaths, forKey: .localMediaPaths)
        try c.encodeIfPresent(location, forKey: .location)
        try c.encodeIfPresent(sticker, forKey: .sticker)
        try c.encodeIfPresent(copyAttachmentsFromClientMessageId, forKey: .copyAttachmentsFromClientMessageId)
        try c.encodeIfPresent(copyAttachmentsFromServerMessageId, forKey: .copyAttachmentsFromServerMessageId)
        try c.encodeIfPresent(attachmentReplyTo, forKey: .attachmentReplyTo)
        try c.encode(createdAt, forKey: .createdAt)
    }
}
