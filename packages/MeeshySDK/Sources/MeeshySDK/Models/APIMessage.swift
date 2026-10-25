import Foundation

public struct APIMessage: Sendable {
    public let id: String
    /// Stable end-to-end identifier (`cid_<uuid v4 lowercase>`) emitted by the
    /// gateway in the socket ACK and the `message:new` broadcast targeted at
    /// the original sender. Optional on the wire because generic broadcasts to
    /// other recipients omit it.
    public let clientMessageId: String?
    public let conversationId: String
    public let senderId: String
    public let content: String?
    public let originalLanguage: String?
    public let messageType: String?
    public let messageSource: String?
    public let isEdited: Bool?
    public let editedAt: Date?
    public let deletedAt: Date?
    public var isDeleted: Bool { deletedAt != nil }
    public let replyToId: String?
    public let storyReplyToId: String?
    /// Snapshot figé du post cité (reçu via `postReplyTo`, legacy `storyReplyTo`).
    public let postReplyTo: APIPostReplyTarget?
    public let forwardedFromId: String?
    public let forwardedFromConversationId: String?
    public let pinnedAt: String?
    public let pinnedBy: String?
    public let isViewOnce: Bool?
    public let isBlurred: Bool?
    public let expiresAt: Date?
    /// Durée d'un message éphémère, en SECONDES (contrat du fil #7451).
    ///
    /// C'est elle qui voyage désormais, pas l'échéance : `message:new` est une
    /// diffusion en room et ne peut pas porter une `expiresAt` différente par
    /// lecteur (contrat point 4). Le client compose donc son échéance locale
    /// avec sa propre réception. `nil` sur une charge antérieure au contrat —
    /// le message retombe alors sur `expiresAt`, qui reste servi.
    ///
    /// Même patron `var`/`= nil` que `location` et `sticker` : l'init
    /// memberwise reste source-compatible avec les fixtures existantes.
    public var ephemeralDuration: Int? = nil
    /// Vue unique déjà ouverte par CE lecteur (#7578, contrat serveur) : le
    /// serveur ne sert plus son contenu, et le client grave l'état « déjà
    /// ouvert » (`MessageRecord.viewOnceOpenedAt`). `nil` sur une charge
    /// antérieure au contrat.
    public var consumedByMe: Bool? = nil
    /// Lieu partagé, hissé par le gateway depuis `metadata.location` — même
    /// mécanique que `postReplyTo`. Le SDK ne décode pas `metadata` brut.
    /// `var`/`= nil` (au lieu de `let`) : même patron que `trackingLinks`
    /// ci-dessous, pour rester source-compatible avec le memberwise init déjà
    /// utilisé par les tests existants sans devoir y ajouter ce paramètre.
    public var location: SharedPlace? = nil
    /// Sticker porté par le message (#4823), hissé par le gateway depuis
    /// `metadata.sticker` sur ses deux producteurs (REST et `message:new`) ;
    /// repli sur l'enveloppe `metadata` pour une charge qui ne le hisse pas.
    /// Toujours `ifWireWorthy` quand non nil : rendable, OU un sticker de
    /// bibliothèque (`stickerId` seul, l'image jointe le rend, #10655) — un
    /// sticker vide sur le fil vaut absence. Même patron `var`/`= nil` que
    /// `location` pour garder l'init memberwise source-compatible.
    public var sticker: MessageSticker? = nil
    public let isEncrypted: Bool?
    public let encryptionMode: String?
    public let createdAt: Date
    public let updatedAt: Date?
    public let sender: APIMessageSender?
    public let attachments: [APIMessageAttachment]?
    public let replyTo: APIMessageReplyTo?
    public let forwardedFrom: APIForwardedFrom?
    public let forwardedFromConversation: APIForwardedFromConversation?
    public let reactionSummary: [String: Int]?
    public let reactionCount: Int?
    public let currentUserReactions: [String]?
    public let deliveredToAllAt: Date?
    public let readByAllAt: Date?
    public let deliveredCount: Int?
    public let readCount: Int?
    /// Server's authoritative count of ACTIVE recipients for this message
    /// (active conversation participants excluding the sender). Projected by the
    /// gateway so the all-or-nothing delivery indicator uses the real
    /// denominator instead of a possibly-stale client `memberCount`. `nil` when
    /// the payload predates the field (e.g. socket `message:new`).
    public let recipientCount: Int?
    public let effectFlags: UInt32?
    public let translations: [APITextTranslation]?
    public let mentionedUsers: [MentionedUser]?
    /// Structured per-type payload. For call-summary system messages this decodes
    /// into a `CallSummaryMetadata`; absent / non-call metadata yields `nil`.
    public let callSummary: CallSummaryMetadata?
    /// Avis d'arrivée (`metadata.kind == "member-joined"`). `nil` pour toute
    /// autre famille de message système — `JoinNoticeMetadata` garde sur `kind`.
    ///
    /// Défaut posé comme pour `trackingLinks` : l'init memberwise reste
    /// compatible avec les sites d'appel existants (fixtures de test).
    public var joinNotice: JoinNoticeMetadata? = nil
    /// Avis de capture (`metadata.kind == "content-capture"`, #9617).
    public var captureNotice: CaptureNoticeMetadata? = nil
    /// Ligne d'arrivées regroupées de Meeshy Global (`metadata.kind ==
    /// "members-arrived"`, #7759).
    public var arrivalsNotice: ArrivalsNoticeMetadata? = nil
    /// Avis de bascule du chiffrement (`metadata.kind` `encryption-enabled` /
    /// `encryption-disabled`, #12846).
    public var encryptionSwitchNotice: EncryptionSwitchNoticeMetadata? = nil
    /// L'événement système d'un avis que le SERVEUR complète sur place (#8565
    /// — la ligne d'arrivées de Meeshy Global, qui ne part qu'en
    /// `message:edited`). Même forme que `lastMessageSystemEvent` de
    /// `conversation:updated` : la ligne de liste en relit clé, noms et compte.
    public var systemEvent: LastMessageSystemEvent? = nil
    /// Outbound-link tracking mappings minted by the gateway. Parsed from the
    /// top-level `trackingLinks` (socket `message:new`) OR from
    /// `metadata.trackingLinks` (REST). `nil` when the payload predates the
    /// feature — the renderer then falls back to the raw URLs. Defaulted so the
    /// memberwise initializer stays source-compatible with existing call sites.
    public var trackingLinks: [TrackedLink]? = nil
    /// #11375 — l'auteur de la dernière modification tel que la passerelle l'a
    /// SERVI, ou `.untouched` quand la charge ne porte pas la clé `editedById`.
    /// Même patron `var`/défaut que `trackingLinks` : l'init memberwise reste
    /// source-compatible.
    public var editAuthorship: EditAuthorship = .untouched

    /// #11375 — l'éditeur tiers servi (`User.id`, ou la marque sans identité) ;
    /// `nil` quand c'est l'auteur ou que la charge ne le dit pas. Sa présence
    /// dit « modifié par un modérateur ».
    public var editedById: String? { editAuthorship.servedEditorId }

    /// `[rawURL: token]` lookup derived from `trackingLinks`. Empty when no
    /// tracking data is present. Consumed by `MessageTextRenderer` (tappable
    /// link rewrite) and `VideoEmbedContainer` (façade destination).
    public var trackedLinkMap: [String: String] { (trackingLinks ?? []).trackedLinkMap }
}

extension APIMessage: Decodable {
    private enum CodingKeys: String, CodingKey {
        case id, clientMessageId, conversationId, senderId, content, originalLanguage
        case messageType, messageSource, isEdited, editedAt, editedById, deletedAt
        case replyToId, storyReplyToId, postReplyTo, storyReplyTo, forwardedFromId, forwardedFromConversationId
        case pinnedAt, pinnedBy, isViewOnce, isBlurred, expiresAt, ephemeralDuration, location, sticker, consumedByMe
        case isEncrypted, encryptionMode, createdAt, updatedAt
        case sender, attachments, replyTo, forwardedFrom, forwardedFromConversation
        case reactionSummary, reactionCount, currentUserReactions
        case deliveredToAllAt, readByAllAt, deliveredCount, readCount, recipientCount
        case effectFlags, translations, mentionedUsers
        case metadata, systemEvent
        case trackingLinks
        // MongoDB fallback
        case _id
    }

    /// Minimal shape of the `metadata` JSON blob needed to extract
    /// `trackingLinks` on REST payloads (socket payloads put it top-level).
    /// Decoded with `try?` so a non-conforming metadata object never fails the
    /// whole message decode.
    private struct MessageMetadataEnvelope: Decodable {
        let trackingLinks: [TrackedLink]?
    }

    /// Enveloppe SÉPARÉE pour `metadata.sticker` : deux lectures tolérantes
    /// de la même clé plutôt qu'une, pour qu'un `sticker` malformé ne fasse
    /// pas perdre `trackingLinks` (et réciproquement) — chaque champ tombe
    /// seul.
    private struct MessageStickerEnvelope: Decodable {
        let sticker: MessageSticker?
    }

    /// #11375 — « absent » (la charge ne dit rien de l'auteur) et « null »
    /// (l'auteur a réécrit, la mention s'efface) ne se confondent pas.
    private static func servedEditAuthorship(in c: KeyedDecodingContainer<CodingKeys>) -> EditAuthorship {
        guard c.contains(.editedById) else { return .untouched }
        return .served(editedById: (try? c.decodeIfPresent(String.self, forKey: .editedById)) ?? nil)
    }

    /// Sticker : la racine d'abord (les deux producteurs le hissent), sinon
    /// l'enveloppe `metadata`. Les deux lectures sont tolérantes — une forme
    /// inattendue laisse le champ nil sans faire tomber le message — et un
    /// sticker non rendable vaut absence (règle de `MessageSticker`).
    private static func servedSticker(in c: KeyedDecodingContainer<CodingKeys>) -> MessageSticker? {
        let rootSticker: MessageSticker? = try? c.decodeIfPresent(MessageSticker.self, forKey: .sticker)
        let metadataSticker: MessageSticker? = (try? c.decodeIfPresent(MessageStickerEnvelope.self, forKey: .metadata))?.sticker
        return rootSticker?.ifWireWorthy ?? metadataSticker?.ifWireWorthy
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // Resilient id: try "id" first, fall back to "_id" (raw MongoDB)
        if let idValue = try c.decodeIfPresent(String.self, forKey: .id) {
            id = idValue
        } else {
            id = try c.decode(String.self, forKey: ._id)
        }
        clientMessageId = try c.decodeIfPresent(String.self, forKey: .clientMessageId)
        conversationId = try c.decode(String.self, forKey: .conversationId)
        senderId = try c.decode(String.self, forKey: .senderId)
        content = try c.decodeIfPresent(String.self, forKey: .content)
        originalLanguage = try c.decodeIfPresent(String.self, forKey: .originalLanguage)
        messageType = try c.decodeIfPresent(String.self, forKey: .messageType)
        messageSource = try c.decodeIfPresent(String.self, forKey: .messageSource)
        isEdited = try c.decodeIfPresent(Bool.self, forKey: .isEdited)
        editedAt = try c.decodeIfPresent(Date.self, forKey: .editedAt)
        editAuthorship = Self.servedEditAuthorship(in: c)
        deletedAt = try c.decodeIfPresent(Date.self, forKey: .deletedAt)
        replyToId = try c.decodeIfPresent(String.self, forKey: .replyToId)
        storyReplyToId = try c.decodeIfPresent(String.self, forKey: .storyReplyToId)
        // Champ moderne `postReplyTo` ; fallback `storyReplyTo` pour les
        // payloads legacy (messages écrits avant le renommage).
        postReplyTo = try c.decodeIfPresent(APIPostReplyTarget.self, forKey: .postReplyTo)
            ?? c.decodeIfPresent(APIPostReplyTarget.self, forKey: .storyReplyTo)
        forwardedFromId = try c.decodeIfPresent(String.self, forKey: .forwardedFromId)
        forwardedFromConversationId = try c.decodeIfPresent(String.self, forKey: .forwardedFromConversationId)
        pinnedAt = try c.decodeIfPresent(String.self, forKey: .pinnedAt)
        pinnedBy = try c.decodeIfPresent(String.self, forKey: .pinnedBy)
        isViewOnce = try c.decodeIfPresent(Bool.self, forKey: .isViewOnce)
        isBlurred = try c.decodeIfPresent(Bool.self, forKey: .isBlurred)
        expiresAt = try c.decodeIfPresent(Date.self, forKey: .expiresAt)
        ephemeralDuration = try c.decodeIfPresent(Int.self, forKey: .ephemeralDuration)
        consumedByMe = try c.decodeIfPresent(Bool.self, forKey: .consumedByMe)
        location = try c.decodeIfPresent(SharedPlace.self, forKey: .location)
        sticker = Self.servedSticker(in: c)
        isEncrypted = try c.decodeIfPresent(Bool.self, forKey: .isEncrypted)
        encryptionMode = try c.decodeIfPresent(String.self, forKey: .encryptionMode)
        createdAt = try c.decode(Date.self, forKey: .createdAt)
        updatedAt = try c.decodeIfPresent(Date.self, forKey: .updatedAt)
        sender = try c.decodeIfPresent(APIMessageSender.self, forKey: .sender)
        attachments = try c.decodeIfPresent([APIMessageAttachment].self, forKey: .attachments)
        replyTo = try c.decodeIfPresent(APIMessageReplyTo.self, forKey: .replyTo)
        forwardedFrom = try c.decodeIfPresent(APIForwardedFrom.self, forKey: .forwardedFrom)
        forwardedFromConversation = try c.decodeIfPresent(APIForwardedFromConversation.self, forKey: .forwardedFromConversation)
        reactionSummary = try c.decodeIfPresent([String: Int].self, forKey: .reactionSummary)
        reactionCount = try c.decodeIfPresent(Int.self, forKey: .reactionCount)
        currentUserReactions = try c.decodeIfPresent([String].self, forKey: .currentUserReactions)
        deliveredToAllAt = try c.decodeIfPresent(Date.self, forKey: .deliveredToAllAt)
        readByAllAt = try c.decodeIfPresent(Date.self, forKey: .readByAllAt)
        deliveredCount = try c.decodeIfPresent(Int.self, forKey: .deliveredCount)
        readCount = try c.decodeIfPresent(Int.self, forKey: .readCount)
        recipientCount = try c.decodeIfPresent(Int.self, forKey: .recipientCount)
        effectFlags = try c.decodeIfPresent(UInt32.self, forKey: .effectFlags)
        // Tolérant par ÉLÉMENT, comme `callSummary`/`trackingLinks` plus haut :
        // une traduction malformée est perdue, jamais le message — et surtout
        // jamais la page, que `MessagesResponse.data` décode d'un seul bloc.
        translations = c.decodeLossyArrayIfPresent([APITextTranslation].self, forKey: .translations)
        mentionedUsers = try c.decodeIfPresent([MentionedUser].self, forKey: .mentionedUsers)
        // Tolerant: a present-but-non-call metadata object must not fail the
        // whole message decode, so swallow shape mismatches into nil.
        callSummary = try? c.decodeIfPresent(CallSummaryMetadata.self, forKey: .metadata)
        joinNotice = try? c.decodeIfPresent(JoinNoticeMetadata.self, forKey: .metadata)
        captureNotice = try? c.decodeIfPresent(CaptureNoticeMetadata.self, forKey: .metadata)
        arrivalsNotice = try? c.decodeIfPresent(ArrivalsNoticeMetadata.self, forKey: .metadata); encryptionSwitchNotice = try? c.decodeIfPresent(EncryptionSwitchNoticeMetadata.self, forKey: .metadata)
        systemEvent = try? c.decodeIfPresent(LastMessageSystemEvent.self, forKey: .systemEvent)
        // Outbound-link tracking: prefer the top-level `trackingLinks` (socket
        // `message:new`); otherwise read it from the `metadata` envelope (REST).
        // Both decodes are tolerant so a malformed shape leaves the field nil
        // (renderer falls back to raw URLs) without failing the message.
        if let topLevel = try? c.decodeIfPresent([TrackedLink].self, forKey: .trackingLinks), !topLevel.isEmpty {
            trackingLinks = topLevel
        } else {
            trackingLinks = (try? c.decodeIfPresent(MessageMetadataEnvelope.self, forKey: .metadata))??.trackingLinks
        }
    }
}
