import Foundation

// Extrait de `CoreModels.swift` (2 113 lignes, deux fois le budget 800-1100 de
// la directive 2026-08-28, qui interdit d'AJOUTER à un fichier hors budget).
// Le lot #4823 ajoute un champ à `MeeshyMessage` : on extrait d'abord, on
// ajoute ensuite. Découpe par RESPONSABILITÉ : ce fichier tient le message de
// conversation — son modèle, son init, son codage — et rien d'autre.

// MARK: - Message Model

public struct MeeshyMessage: Identifiable, Codable, Sendable {
    public let id: String
    /// Stable end-to-end identifier (`cid_<uuid v4 lowercase>`) used for
    /// idempotent dedup with the gateway and for reconciliation between the
    /// optimistic local row and the authoritative server message arriving via
    /// socket ACK or `message:new` broadcast.
    public let clientMessageId: String?
    public let conversationId: String
    public var senderId: String
    public var content: String
    public var originalLanguage: String = "fr"
    public var messageType: MessageType = .text
    public var messageSource: MessageSource = .user
    public var isEdited: Bool = false
    public var editedAt: Date?
    public var deletedAt: Date?
    public var isDeleted: Bool { deletedAt != nil }
    public var replyToId: String?
    public var storyReplyToId: String?
    public var forwardedFromId: String?
    public var forwardedFromConversationId: String?
    public var expiresAt: Date?
    public var effects: MessageEffects = .none
    public var maxViewOnceCount: Int?
    public var viewOnceCount: Int = 0
    public var pinnedAt: Date?

    public var isViewOnce: Bool {
        get { effects.flags.contains(.viewOnce) }
        set { if newValue { effects.flags.insert(.viewOnce) } else { effects.flags.remove(.viewOnce) } }
    }

    public var isBlurred: Bool {
        get { effects.flags.contains(.blurred) }
        set { if newValue { effects.flags.insert(.blurred) } else { effects.flags.remove(.blurred) } }
    }
    public var pinnedBy: String?
    public var isEncrypted: Bool = false
    public var encryptionMode: String?
    public let createdAt: Date
    public var updatedAt: Date
    public var attachments: [MeeshyMessageAttachment] = []
    public var reactions: [MeeshyReaction] = []
    public var replyTo: ReplyReference?
    public var forwardedFrom: ForwardReference?
    public var senderName: String?
    public var senderUsername: String?
    public var senderColor: String?
    public var senderAvatarURL: String?
    public var senderUserId: String?
    /// L'auteur n'a pas de compte (`Participant.type == "anonymous"`).
    ///
    /// C'est LUI qui décide du glyphe fantôme, jamais le pseudo : le préfixe
    /// `ano_` est lisible mais pas réservé, et un compte peut le porter.
    public var senderIsAnonymous: Bool = false
    public var deliveryStatus: DeliveryStatus = .sent
    public var isMe: Bool = false
    public var deliveredToAllAt: Date?
    public var readByAllAt: Date?
    public var deliveredCount: Int = 0
    public var readCount: Int = 0
    /// Authoritative denominator for the all-or-nothing delivery indicator: the
    /// server's count of ACTIVE recipients (conversation participants excluding
    /// this message's sender), projected per message by the gateway. `0` means
    /// the server did not provide it (older payload, socket `message:new`, or an
    /// optimistic local row) — the display then falls back to `memberCount − 1`.
    /// Using the server value removes the client's dependency on a possibly
    /// stale local membership count.
    public var recipientCount: Int = 0

    // Pre-computed "HH:mm" string set at ingestion time — avoids DateFormatter in bubble body
    public var cachedTimeString: String?

    /// Structured call facts for a call-summary system message
    /// (`messageSource == .system`). Drives the rich, actionable call bubble.
    /// `nil` for ordinary messages.
    public var callSummary: CallSummaryMetadata?
    /// Avis d'arrivée porté par ce message système (`metadata.kind ==
    /// "member-joined"`). Le rendu dédié court-circuite le rendu ordinaire —
    /// une arrivée n'est pas une prise de parole.
    public var joinNotice: JoinNoticeMetadata?

    /// Lieu partagé, restitué depuis la colonne `locationJson` du cache GRDB
    /// (`APIMessage.location` hissé côté serveur). `nil` pour un message sans
    /// position.
    public var location: SharedPlace?

    /// Sticker porté par le message (#4823), restitué depuis la colonne
    /// `stickerJson` du cache GRDB ou depuis `APIMessage.sticker`. `nil` pour
    /// un message sans sticker — et pour un sticker NON RENDABLE, ramené à
    /// l'absence dès le décodage (`MessageSticker.ifRenderable`) : une bulle
    /// ne dessine jamais un sticker vide.
    public var sticker: MessageSticker?

    /// `[rawURL: token]` outbound-link tracking map carried from the gateway
    /// (`APIMessage.trackedLinkMap`). Empty when the message has no tracked
    /// links. Consumed by the bubble renderer (tappable `/l/<token>` rewrite)
    /// and the embedded-video façade destination. Backward-compatible: cached
    /// rows predating the field decode to `[:]`.
    public var trackedLinkMap: [String: String] = [:]

    public enum DeliveryStatus: String, Codable, Sendable {
        case sending    // optimistic, not yet sent
        case invisible  // < 200ms, status hidden in UI (debounce — spec §6.2)
        case clock      // 200ms-5s, "clock" icon (small spinner) shown
        case slow       // 5s-30s, slow connection state (spec §6.2 timeouts)
        case sent       // server confirmed (single check)
        case delivered  // recipient received (double gray check)
        case read       // recipient read (double blue check)
        case failed     // send failed, retry available

        public func isBetterThan(_ other: DeliveryStatus) -> Bool {
            switch (self, other) {
            case (.read, .sent), (.read, .delivered), (.read, .sending),
                 (.read, .invisible), (.read, .clock), (.read, .slow):
                return true
            case (.delivered, .sent), (.delivered, .sending),
                 (.delivered, .invisible), (.delivered, .clock), (.delivered, .slow):
                return true
            case (.sent, .sending), (.sent, .invisible), (.sent, .clock), (.sent, .slow):
                return true
            case (.slow, .sending), (.slow, .invisible), (.slow, .clock):
                return true
            case (.clock, .sending), (.clock, .invisible):
                return true
            case (.invisible, .sending):
                return true
            default:
                return false
            }
        }
    }

    public enum MessageType: String, Codable, CaseIterable, Sendable {
        case text, image, file, audio, video, location
    }

    public enum MessageSource: String, Codable, CaseIterable, Sendable {
        case user, system, ads, app, agent, authority
    }

    public init(id: String = UUID().uuidString, clientMessageId: String? = nil,
                conversationId: String, senderId: String = "",
                content: String, originalLanguage: String = "fr",
                messageType: MessageType = .text, messageSource: MessageSource = .user,
                isEdited: Bool = false, editedAt: Date? = nil, deletedAt: Date? = nil,
                replyToId: String? = nil, storyReplyToId: String? = nil, forwardedFromId: String? = nil, forwardedFromConversationId: String? = nil,
                expiresAt: Date? = nil, effects: MessageEffects = .none, maxViewOnceCount: Int? = nil,
                viewOnceCount: Int = 0, pinnedAt: Date? = nil, pinnedBy: String? = nil,
                isEncrypted: Bool = false, encryptionMode: String? = nil,
                createdAt: Date = Date(), updatedAt: Date = Date(),
                attachments: [MeeshyMessageAttachment] = [], reactions: [MeeshyReaction] = [],
                replyTo: ReplyReference? = nil, forwardedFrom: ForwardReference? = nil,
                senderName: String? = nil, senderUsername: String? = nil, senderColor: String? = nil, senderAvatarURL: String? = nil, senderUserId: String? = nil,
                senderIsAnonymous: Bool = false,
                deliveryStatus: DeliveryStatus = .sent, isMe: Bool = false,
                deliveredToAllAt: Date? = nil, readByAllAt: Date? = nil,
                deliveredCount: Int = 0, readCount: Int = 0, recipientCount: Int = 0,
                cachedTimeString: String? = nil,
                callSummary: CallSummaryMetadata? = nil,
                joinNotice: JoinNoticeMetadata? = nil,
                location: SharedPlace? = nil,
                sticker: MessageSticker? = nil,
                trackedLinkMap: [String: String] = [:]) {
        self.id = id; self.clientMessageId = clientMessageId
        self.conversationId = conversationId; self.senderId = senderId
        self.content = content
        self.originalLanguage = originalLanguage; self.messageType = messageType; self.messageSource = messageSource
        self.isEdited = isEdited; self.editedAt = editedAt; self.deletedAt = deletedAt
        self.replyToId = replyToId; self.storyReplyToId = storyReplyToId; self.forwardedFromId = forwardedFromId
        self.forwardedFromConversationId = forwardedFromConversationId
        self.expiresAt = expiresAt; self.effects = effects; self.maxViewOnceCount = maxViewOnceCount
        self.viewOnceCount = viewOnceCount
        self.pinnedAt = pinnedAt; self.pinnedBy = pinnedBy
        self.isEncrypted = isEncrypted; self.encryptionMode = encryptionMode
        self.createdAt = createdAt; self.updatedAt = updatedAt
        self.attachments = attachments; self.reactions = reactions; self.replyTo = replyTo; self.forwardedFrom = forwardedFrom
        self.senderName = senderName; self.senderUsername = senderUsername; self.senderColor = senderColor; self.senderAvatarURL = senderAvatarURL; self.senderUserId = senderUserId
        self.senderIsAnonymous = senderIsAnonymous
        self.deliveryStatus = deliveryStatus; self.isMe = isMe
        self.deliveredToAllAt = deliveredToAllAt; self.readByAllAt = readByAllAt
        self.deliveredCount = deliveredCount; self.readCount = readCount
        self.recipientCount = recipientCount
        self.cachedTimeString = cachedTimeString
        self.callSummary = callSummary
        self.joinNotice = joinNotice
        self.location = location
        self.sticker = sticker
        self.trackedLinkMap = trackedLinkMap
    }

    private enum CodingKeys: String, CodingKey {
        case id, clientMessageId, conversationId, senderId, content, originalLanguage
        case messageType, messageSource, isEdited, editedAt, deletedAt
        case replyToId, storyReplyToId, forwardedFromId, forwardedFromConversationId
        case expiresAt, effects, maxViewOnceCount, viewOnceCount
        case pinnedAt, pinnedBy, isEncrypted, encryptionMode
        case createdAt, updatedAt, attachments, reactions
        case replyTo, forwardedFrom
        case senderName, senderUsername, senderColor, senderAvatarURL, senderUserId
        case deliveryStatus, isMe
        case deliveredToAllAt, readByAllAt, deliveredCount, readCount, recipientCount
        case cachedTimeString
        case callSummary
        case joinNotice
        case location
        case sticker
        case trackedLinkMap
        // Legacy keys for migration from old cached data
        case isViewOnce, isBlurred
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        clientMessageId = try c.decodeIfPresent(String.self, forKey: .clientMessageId)
        conversationId = try c.decode(String.self, forKey: .conversationId)
        senderId = try c.decodeIfPresent(String.self, forKey: .senderId) ?? ""
        content = try c.decodeIfPresent(String.self, forKey: .content) ?? ""
        originalLanguage = try c.decodeIfPresent(String.self, forKey: .originalLanguage) ?? "fr"
        messageType = try c.decodeIfPresent(MessageType.self, forKey: .messageType) ?? .text
        messageSource = try c.decodeIfPresent(MessageSource.self, forKey: .messageSource) ?? .user
        isEdited = try c.decodeIfPresent(Bool.self, forKey: .isEdited) ?? false
        editedAt = try c.decodeIfPresent(Date.self, forKey: .editedAt)
        deletedAt = try c.decodeIfPresent(Date.self, forKey: .deletedAt)
        replyToId = try c.decodeIfPresent(String.self, forKey: .replyToId)
        storyReplyToId = try c.decodeIfPresent(String.self, forKey: .storyReplyToId)
        forwardedFromId = try c.decodeIfPresent(String.self, forKey: .forwardedFromId)
        forwardedFromConversationId = try c.decodeIfPresent(String.self, forKey: .forwardedFromConversationId)
        expiresAt = try c.decodeIfPresent(Date.self, forKey: .expiresAt)
        effects = try c.decodeIfPresent(MessageEffects.self, forKey: .effects) ?? .none
        maxViewOnceCount = try c.decodeIfPresent(Int.self, forKey: .maxViewOnceCount)
        viewOnceCount = try c.decodeIfPresent(Int.self, forKey: .viewOnceCount) ?? 0
        pinnedAt = try c.decodeIfPresent(Date.self, forKey: .pinnedAt)
        pinnedBy = try c.decodeIfPresent(String.self, forKey: .pinnedBy)
        isEncrypted = try c.decodeIfPresent(Bool.self, forKey: .isEncrypted) ?? false
        encryptionMode = try c.decodeIfPresent(String.self, forKey: .encryptionMode)
        createdAt = try c.decode(Date.self, forKey: .createdAt)
        updatedAt = try c.decodeIfPresent(Date.self, forKey: .updatedAt) ?? Date()
        attachments = try c.decodeIfPresent([MeeshyMessageAttachment].self, forKey: .attachments) ?? []
        reactions = try c.decodeIfPresent([MeeshyReaction].self, forKey: .reactions) ?? []
        replyTo = try c.decodeIfPresent(ReplyReference.self, forKey: .replyTo)
        forwardedFrom = try c.decodeIfPresent(ForwardReference.self, forKey: .forwardedFrom)
        senderName = try c.decodeIfPresent(String.self, forKey: .senderName)
        senderUsername = try c.decodeIfPresent(String.self, forKey: .senderUsername)
        senderColor = try c.decodeIfPresent(String.self, forKey: .senderColor)
        senderAvatarURL = try c.decodeIfPresent(String.self, forKey: .senderAvatarURL)
        senderUserId = try c.decodeIfPresent(String.self, forKey: .senderUserId)
        deliveryStatus = try c.decodeIfPresent(DeliveryStatus.self, forKey: .deliveryStatus) ?? .sent
        isMe = try c.decodeIfPresent(Bool.self, forKey: .isMe) ?? false
        deliveredToAllAt = try c.decodeIfPresent(Date.self, forKey: .deliveredToAllAt)
        readByAllAt = try c.decodeIfPresent(Date.self, forKey: .readByAllAt)
        deliveredCount = try c.decodeIfPresent(Int.self, forKey: .deliveredCount) ?? 0
        readCount = try c.decodeIfPresent(Int.self, forKey: .readCount) ?? 0
        recipientCount = try c.decodeIfPresent(Int.self, forKey: .recipientCount) ?? 0
        cachedTimeString = try c.decodeIfPresent(String.self, forKey: .cachedTimeString)
        // Tolerant: a malformed / future-shape call-summary blob must not fail
        // the whole cached-message decode (mirrors the APIMessage path).
        callSummary = try? c.decodeIfPresent(CallSummaryMetadata.self, forKey: .callSummary)
        // Même tolérance que callSummary — et surtout : sans ce décodage, le
        // round-trip GRDB PERDAIT l'avis d'arrivée (CodingKey déclarée mais
        // jamais lue) et toute conversation rouverte retombait sur la vue
        // système générique (icône téléphone) avec le repli français.
        joinNotice = try? c.decodeIfPresent(JoinNoticeMetadata.self, forKey: .joinNotice)
        // Same tolerance as callSummary: a malformed location blob must not
        // fail the whole cached-message decode.
        location = try? c.decodeIfPresent(SharedPlace.self, forKey: .location)
        // Même tolérance — et la règle « non rendable ⇒ absent » appliquée dès
        // la relecture du cache, pour qu'une ligne ancienne ou malformée ne
        // ressuscite jamais un sticker vide.
        let cachedSticker: MessageSticker? = try? c.decodeIfPresent(MessageSticker.self, forKey: .sticker)
        sticker = cachedSticker?.ifRenderable
        // Backward-compatible: rows cached before this field decode to `[:]`.
        trackedLinkMap = try c.decodeIfPresent([String: String].self, forKey: .trackedLinkMap) ?? [:]
        // Legacy migration: merge old isViewOnce/isBlurred bools into effects
        if let legacyViewOnce = try c.decodeIfPresent(Bool.self, forKey: .isViewOnce), legacyViewOnce {
            effects.flags.insert(.viewOnce)
        }
        if let legacyBlurred = try c.decodeIfPresent(Bool.self, forKey: .isBlurred), legacyBlurred {
            effects.flags.insert(.blurred)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encodeIfPresent(clientMessageId, forKey: .clientMessageId)
        try c.encode(conversationId, forKey: .conversationId)
        try c.encode(senderId, forKey: .senderId)
        try c.encode(content, forKey: .content)
        try c.encode(originalLanguage, forKey: .originalLanguage)
        try c.encode(messageType, forKey: .messageType)
        try c.encode(messageSource, forKey: .messageSource)
        try c.encode(isEdited, forKey: .isEdited)
        try c.encodeIfPresent(editedAt, forKey: .editedAt)
        try c.encodeIfPresent(deletedAt, forKey: .deletedAt)
        try c.encodeIfPresent(replyToId, forKey: .replyToId)
        try c.encodeIfPresent(storyReplyToId, forKey: .storyReplyToId)
        try c.encodeIfPresent(forwardedFromId, forKey: .forwardedFromId)
        try c.encodeIfPresent(forwardedFromConversationId, forKey: .forwardedFromConversationId)
        try c.encodeIfPresent(expiresAt, forKey: .expiresAt)
        try c.encode(effects, forKey: .effects)
        try c.encodeIfPresent(maxViewOnceCount, forKey: .maxViewOnceCount)
        try c.encode(viewOnceCount, forKey: .viewOnceCount)
        try c.encodeIfPresent(pinnedAt, forKey: .pinnedAt)
        try c.encodeIfPresent(pinnedBy, forKey: .pinnedBy)
        try c.encode(isEncrypted, forKey: .isEncrypted)
        try c.encodeIfPresent(encryptionMode, forKey: .encryptionMode)
        try c.encode(createdAt, forKey: .createdAt)
        try c.encode(updatedAt, forKey: .updatedAt)
        try c.encode(attachments, forKey: .attachments)
        try c.encode(reactions, forKey: .reactions)
        try c.encodeIfPresent(replyTo, forKey: .replyTo)
        try c.encodeIfPresent(forwardedFrom, forKey: .forwardedFrom)
        try c.encodeIfPresent(senderName, forKey: .senderName)
        try c.encodeIfPresent(senderUsername, forKey: .senderUsername)
        try c.encodeIfPresent(senderColor, forKey: .senderColor)
        try c.encodeIfPresent(senderAvatarURL, forKey: .senderAvatarURL)
        try c.encodeIfPresent(senderUserId, forKey: .senderUserId)
        try c.encode(deliveryStatus, forKey: .deliveryStatus)
        try c.encode(isMe, forKey: .isMe)
        try c.encodeIfPresent(deliveredToAllAt, forKey: .deliveredToAllAt)
        try c.encodeIfPresent(readByAllAt, forKey: .readByAllAt)
        try c.encode(deliveredCount, forKey: .deliveredCount)
        try c.encode(readCount, forKey: .readCount)
        try c.encode(recipientCount, forKey: .recipientCount)
        try c.encodeIfPresent(cachedTimeString, forKey: .cachedTimeString)
        try c.encodeIfPresent(callSummary, forKey: .callSummary)
        try c.encodeIfPresent(joinNotice, forKey: .joinNotice)
        try c.encodeIfPresent(location, forKey: .location)
        try c.encodeIfPresent(sticker, forKey: .sticker)
        if !trackedLinkMap.isEmpty {
            try c.encode(trackedLinkMap, forKey: .trackedLinkMap)
        }
    }

    public var text: String { content }
    public var timestamp: Date { createdAt }
    public var attachment: MeeshyMessageAttachment? { attachments.first }

    /// Whether the message is ephemeral and has not yet expired.
    public var isEphemeralActive: Bool {
        guard let expiresAt else { return false }
        return expiresAt > Date()
    }
}

public typealias MeeshyChatMessage = MeeshyMessage

