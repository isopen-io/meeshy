import Foundation

// MARK: - Outbound Link Tracking

/// A single raw-URL → tracking-token mapping attached to a message or post by
/// the gateway. The client never rewrites the message content; instead it
/// resolves `https://meeshy.me/l/<token>` as the tappable destination for the
/// raw URL (capture + 302 redirect to the original page), keeping the displayed
/// text and any video preview intact. Optional everywhere → older payloads
/// without this field decode unchanged (rollout-safe).
public struct TrackedLink: Codable, Sendable, Equatable {
    public let url: String
    public let token: String

    public init(url: String, token: String) {
        self.url = url
        self.token = token
    }
}

extension Sequence where Element == TrackedLink {
    /// Collapses a list of `{ url, token }` mappings into a `[url: token]`
    /// lookup. Last token wins on a duplicate URL (gateway sends one per URL).
    public var trackedLinkMap: [String: String] {
        reduce(into: [:]) { $0[$1.url] = $1.token }
    }
}

// MARK: - API Message Models

public struct APIMessageSenderUser: Decodable, Sendable {
    public let id: String?
    public let username: String?
    public let displayName: String?
    public let firstName: String?
    public let lastName: String?
    public let avatar: String?
}

public struct APIMessageSender: Decodable, Sendable {
    public let id: String
    public let username: String?
    public let displayName: String?
    public let avatar: String?
    public let type: String?
    public let userId: String?
    public let firstName: String?
    public let lastName: String?
    public let user: APIMessageSenderUser?

    public var name: String {
        nonEmpty(displayName) ?? nonEmpty(user?.displayName) ?? nonEmpty(username) ?? nonEmpty(user?.username) ?? id
    }

    public var resolvedAvatar: String? {
        nonEmpty(avatar) ?? nonEmpty(user?.avatar)
    }

    /// L'auteur a-t-il un COMPTE ?
    ///
    /// `type` était décodé depuis toujours et ne remontait à aucun modèle de
    /// domaine — exactement le même dernier mètre que sur le web, où le champ
    /// était chargé, mappé, puis retiré à la sérialisation. Un participant
    /// `anonymous` s'affichait donc comme n'importe quel inscrit.
    ///
    /// Le PSEUDO ne prouve rien : un compte peut s'appeler `ano_bob`. Seul le
    /// type tranche.
    public var isAnonymous: Bool { type == "anonymous" }

    public var resolvedUserId: String? {
        userId ?? user?.id
    }

    private func nonEmpty(_ s: String?) -> String? {
        guard let s, !s.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        return s
    }
}

public struct APIAttachmentTranscription: Codable, Sendable {
    public let text: String?
    public let transcribedText: String?
    public let language: String?
    public let confidence: Double?
    public let durationMs: Int?
    public let segments: [TranscriptionSegment]?
    public let speakerCount: Int?

    public var resolvedText: String { text ?? transcribedText ?? "" }
}

public struct APIAttachmentTranslation: Codable, Sendable {
    public let type: String?
    public let transcription: String?
    public let url: String?
    public let durationMs: Int?
    public let format: String?
    public let cloned: Bool?
    public let quality: Double?
    public let voiceModelId: String?
    public let ttsModel: String?
    public let segments: [TranscriptionSegment]?
}

public struct APIMessageAttachment: Decodable, Sendable {
    // ── Identifiers ──
    public let id: String
    public let messageId: String?

    // ── File info ──
    public let fileName: String?
    public let originalName: String?
    public let mimeType: String?
    public let fileSize: Int?
    public let fileUrl: String?

    // ── Visual / thumbnail ──
    public let thumbnailUrl: String?
    public let thumbHash: String?
    public let width: Int?
    public let height: Int?
    /// D4 — responsive downscaled WebP variants for `srcset`-style selection.
    /// Décodage tolérant par élément (`LossyImageVariants`).
    @LossyImageVariants public var imageVariants: [MeeshyImageVariant]?
    /// BUG2 A' — réactions par-image agrégées (emoji→count).
    public let reactionSummary: [String: Int]?
    /// BUG2 A' — emojis posés par l'utilisateur courant sur cette pièce jointe.
    public let currentUserReactions: [String]?
    /// Phase 2 — progression de consommation PERSONNELLE du current-user
    /// (position + complétion), pour seeder le tint waveform / progress-bar.
    public let currentUserConsumption: MeeshyMediaConsumption?

    // ── Audio / video ──
    public let duration: Int?
    public let bitrate: Int?
    public let sampleRate: Int?
    public let codec: String?
    public let channels: Int?
    public let fps: Double?
    public let videoCodec: String?

    // ── Document ──
    public let pageCount: Int?
    public let lineCount: Int?

    // ── Location (legacy fields, kept for compat) ──
    public let latitude: Double?
    public let longitude: Double?

    // ── Uploader / timestamps ──
    public let uploadedBy: String?
    public let isAnonymous: Bool?
    public let createdAt: Date?

    // NOTE: `metadata` (generic JSON blob) is intentionally NOT decoded
    // here — iOS has no JSONValue-style any-codable helper yet and no
    // current consumer reads it. Add when needed.

    // ── Forwarding ──
    public let forwardedFromAttachmentId: String?
    public let isForwarded: Bool?

    // ── Provenance ──
    /// Le fichier sort de la caméra ou du micro DE L'APPLICATION. Déclaré par
    /// le client qui a capturé, à l'envoi — lui seul le sait, et seulement à cet
    /// instant — puis rendu ici par la passerelle. La feuille de partage le lit
    /// pour décider si PUBLIER ce média demande confirmation.
    /// @see `PublicationTargetRule.needsCaptureConfirmation`
    public let capturedInApp: Bool?

    // ── View-once / Effects / Blur ──
    public let isViewOnce: Bool?
    public let maxViewOnceCount: Int?
    public let viewOnceCount: Int?
    public let isBlurred: Bool?
    public let effectFlags: UInt32?

    /// Protection DÉCLARÉE par le fil — `nil` quand il n'en dit RIEN (les deux
    /// drapeaux absents), ce qui n'est pas la même chose que « dit qu'elle est
    /// absente ». Site UNIQUE de la dérivation pour `ReplyReference
    /// .attachmentIsProtected`, que le chemin réseau (`uiReplyTo`) et le chemin
    /// cache (`MessagePersistenceActor`) gravent tous les deux.
    ///
    /// Un `false` fabriqué à partir d'un silence serait une AFFIRMATION : il
    /// rendrait la citation d'un média protégé indistinguable de celle d'un
    /// média ordinaire, et le jour où le fil se met à porter les drapeaux, le
    /// blob gravé continuerait de mentir. `nil` se laisse corriger.
    public var declaredProtection: Bool? {
        guard isViewOnce != nil || isBlurred != nil else { return nil }
        return (isViewOnce ?? false) || (isBlurred ?? false)
    }

    // ── Consumption tracking (R5 — denormalized counters surfaced in
    //    attachmentFullSelect; required to render the consumption strip
    //    and the per-attachment "delivered / viewed / listened / watched
    //    by all" timestamps). Pre-R7 these fields existed on the wire
    //    but iOS dropped them silently because `APIMessageAttachment`
    //    didn't declare them.
    public let deliveredToAllAt: Date?
    public let viewedByAllAt: Date?
    public let downloadedByAllAt: Date?
    public let listenedByAllAt: Date?
    public let watchedByAllAt: Date?
    public let viewedCount: Int?
    public let downloadedCount: Int?
    public let consumedCount: Int?

    // ── E2EE envelope (R5 — clients MUST receive these to decrypt the
    //    attachment payload. Pre-R7 they were sent by the gateway but
    //    dropped silently here because the iOS struct didn't declare them.
    public let isEncrypted: Bool?
    public let encryptionMode: String?
    public let encryptionIv: String?
    public let encryptionAuthTag: String?

    // ── Prisme Linguistique JSON blobs ──
    public let transcription: APIAttachmentTranscription?
    public let translations: [String: APIAttachmentTranslation]?

    // MARK: - CodingKeys

    private enum CodingKeys: String, CodingKey {
        case id, messageId
        case fileName, originalName, mimeType, fileSize, fileUrl
        case thumbnailUrl, thumbHash, width, height, imageVariants, reactionSummary, currentUserReactions, currentUserConsumption
        case duration, bitrate, sampleRate, codec, channels, fps, videoCodec
        case pageCount, lineCount
        case latitude, longitude
        case uploadedBy, isAnonymous, createdAt
        case forwardedFromAttachmentId, isForwarded, capturedInApp
        case isViewOnce, maxViewOnceCount, viewOnceCount, isBlurred, effectFlags
        case deliveredToAllAt, viewedByAllAt, downloadedByAllAt
        case listenedByAllAt, watchedByAllAt
        case viewedCount, downloadedCount, consumedCount
        case isEncrypted, encryptionMode, encryptionIv, encryptionAuthTag
        case transcription, translations
    }

    /// Custom `init(from:)` to isolate `transcription` and `translations`
    /// decode failures from the rest of the attachment. The Prisme
    /// Linguistique JSON blobs are the only fields that can carry
    /// partially-enriched payloads (e.g., a language entry mid-write by
    /// a translator worker). Without isolation, a single malformed entry
    /// would throw and the ENTIRE `APIMessageAttachment` decode would
    /// fail — `MessageSocketManager.decode(_:from:)` would then silently
    /// swallow the event and iOS would never see the enrichment. This
    /// init wraps both fields with `try?` so the rest of the attachment
    /// is still surfaced even if one Prisme blob is malformed.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try c.decode(String.self, forKey: .id)
        self.messageId = try c.decodeIfPresent(String.self, forKey: .messageId)
        self.fileName = try c.decodeIfPresent(String.self, forKey: .fileName)
        self.originalName = try c.decodeIfPresent(String.self, forKey: .originalName)
        self.mimeType = try c.decodeIfPresent(String.self, forKey: .mimeType)
        self.fileSize = try c.decodeIfPresent(Int.self, forKey: .fileSize)
        self.fileUrl = try c.decodeIfPresent(String.self, forKey: .fileUrl)
        self.thumbnailUrl = try c.decodeIfPresent(String.self, forKey: .thumbnailUrl)
        self.thumbHash = try c.decodeIfPresent(String.self, forKey: .thumbHash)
        self.width = try c.decodeIfPresent(Int.self, forKey: .width)
        self.height = try c.decodeIfPresent(Int.self, forKey: .height)
        self._imageVariants = try c.decode(LossyImageVariants.self, forKey: .imageVariants)
        self.reactionSummary = try c.decodeIfPresent([String: Int].self, forKey: .reactionSummary)
        self.currentUserReactions = try c.decodeIfPresent([String].self, forKey: .currentUserReactions)
        self.currentUserConsumption = try c.decodeIfPresent(MeeshyMediaConsumption.self, forKey: .currentUserConsumption)
        self.duration = try c.decodeIfPresent(Int.self, forKey: .duration)
        self.bitrate = try c.decodeIfPresent(Int.self, forKey: .bitrate)
        self.sampleRate = try c.decodeIfPresent(Int.self, forKey: .sampleRate)
        self.codec = try c.decodeIfPresent(String.self, forKey: .codec)
        self.channels = try c.decodeIfPresent(Int.self, forKey: .channels)
        self.fps = try c.decodeIfPresent(Double.self, forKey: .fps)
        self.videoCodec = try c.decodeIfPresent(String.self, forKey: .videoCodec)
        self.pageCount = try c.decodeIfPresent(Int.self, forKey: .pageCount)
        self.lineCount = try c.decodeIfPresent(Int.self, forKey: .lineCount)
        self.latitude = try c.decodeIfPresent(Double.self, forKey: .latitude)
        self.longitude = try c.decodeIfPresent(Double.self, forKey: .longitude)
        self.uploadedBy = try c.decodeIfPresent(String.self, forKey: .uploadedBy)
        self.isAnonymous = try c.decodeIfPresent(Bool.self, forKey: .isAnonymous)
        self.createdAt = try c.decodeIfPresent(Date.self, forKey: .createdAt)
        self.forwardedFromAttachmentId = try c.decodeIfPresent(String.self, forKey: .forwardedFromAttachmentId)
        self.isForwarded = try c.decodeIfPresent(Bool.self, forKey: .isForwarded)
        self.capturedInApp = try c.decodeIfPresent(Bool.self, forKey: .capturedInApp)
        self.isViewOnce = try c.decodeIfPresent(Bool.self, forKey: .isViewOnce)
        self.maxViewOnceCount = try c.decodeIfPresent(Int.self, forKey: .maxViewOnceCount)
        self.viewOnceCount = try c.decodeIfPresent(Int.self, forKey: .viewOnceCount)
        self.isBlurred = try c.decodeIfPresent(Bool.self, forKey: .isBlurred)
        self.effectFlags = try c.decodeIfPresent(UInt32.self, forKey: .effectFlags)
        self.deliveredToAllAt = try c.decodeIfPresent(Date.self, forKey: .deliveredToAllAt)
        self.viewedByAllAt = try c.decodeIfPresent(Date.self, forKey: .viewedByAllAt)
        self.downloadedByAllAt = try c.decodeIfPresent(Date.self, forKey: .downloadedByAllAt)
        self.listenedByAllAt = try c.decodeIfPresent(Date.self, forKey: .listenedByAllAt)
        self.watchedByAllAt = try c.decodeIfPresent(Date.self, forKey: .watchedByAllAt)
        self.viewedCount = try c.decodeIfPresent(Int.self, forKey: .viewedCount)
        self.downloadedCount = try c.decodeIfPresent(Int.self, forKey: .downloadedCount)
        self.consumedCount = try c.decodeIfPresent(Int.self, forKey: .consumedCount)
        self.isEncrypted = try c.decodeIfPresent(Bool.self, forKey: .isEncrypted)
        self.encryptionMode = try c.decodeIfPresent(String.self, forKey: .encryptionMode)
        self.encryptionIv = try c.decodeIfPresent(String.self, forKey: .encryptionIv)
        self.encryptionAuthTag = try c.decodeIfPresent(String.self, forKey: .encryptionAuthTag)

        // ── Fault-tolerant Prisme Linguistique blobs ──
        // The two fields below CAN be partial/malformed during async
        // enrichment (translator workers writing in flight). `try?` here
        // is INTENTIONAL : we'd rather show the attachment without its
        // transcription / translations than lose the whole attachment.
        self.transcription = (try? c.decodeIfPresent(APIAttachmentTranscription.self, forKey: .transcription)) ?? nil
        self.translations = (try? c.decodeIfPresent([String: APIAttachmentTranslation].self, forKey: .translations)) ?? nil
    }
}

public struct APIForwardedFrom: Decodable, Sendable {
    public let id: String
    public let content: String?
    public let messageType: String?
    public let createdAt: Date?
    public let sender: APIMessageSender?
    public let attachments: [APIMessageAttachment]?
}

public struct APIForwardedFromConversation: Decodable, Sendable {
    public let id: String
    public let title: String?
    public let identifier: String?
    public let type: String?
    public let avatar: String?
}

public struct APITextTranslation: Decodable, Identifiable, Sendable {
    public let id: String
    public let messageId: String
    public let targetLanguage: String
    public let translatedContent: String
    public let translationModel: String
    public let confidenceScore: Double?
    public let sourceLanguage: String?
    /// `true` quand `translatedContent` est un CRYPTOGRAMME et non du texte.
    /// Le gateway pose le drapeau depuis `Message.translations[lang].isEncrypted`
    /// (`transformTranslationsToArray`) ; il était sur le fil depuis toujours,
    /// simplement jamais décodé — donc jamais respecté par les surfaces qui
    /// rendent cette traduction sans clé de déchiffrement (l'aperçu de la ligne
    /// de liste, cf. `ConversationSyncEngine.previewTranslations`).
    /// `nil` sur un payload qui l'omet : on ne suppose alors PAS le chiffrement.
    public let isEncrypted: Bool?
}

/// Métadonnées enrichies de la story citée — renvoyées par le gateway dans
/// `GET /messages` quand le message répond à une story. `nil` si la story a
/// été supprimée.
/// Snapshot figé du post cité (status/story/reel/post) dans une réponse —
/// reçu via le champ `postReplyTo` (legacy : `storyReplyTo`). Survit à
/// l'expiration du post car capturé au moment de la réponse.
public struct APIPostReplyTarget: Decodable, Sendable {
    public let id: String
    /// Type du post cité ("STATUS" | "STORY" | "POST" | "REEL"), figé dans le
    /// snapshot. Optionnel pour compat avec les payloads legacy.
    public let type: String?
    public let reactionCount: Int
    public let commentCount: Int
    /// Nombre de partages de la story, figé au moment de la réponse.
    public let shareCount: Int
    public let createdAt: Date
    public let thumbnailUrl: String?
    public let previewText: String
    /// Présent quand le post cité est un mood/statut — déclenche le rendu
    /// dédié (emoji + contenu + date) côté bulle.
    public let moodEmoji: String?
    /// Nom d'affichage de l'auteur du post cité, figé par le gateway.
    /// `nil` sur un snapshot antérieur au 2026-08-10 — le rendu retombe alors
    /// sur le libellé générique de la citation.
    public let authorName: String?

    private enum CodingKeys: String, CodingKey {
        case id, type, reactionCount, commentCount, shareCount, createdAt, thumbnailUrl, previewText, moodEmoji, authorName
    }

    nonisolated(unsafe) private static let isoFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    nonisolated(unsafe) private static let isoPlain = ISO8601DateFormatter()

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        type = try c.decodeIfPresent(String.self, forKey: .type)
        reactionCount = try c.decode(Int.self, forKey: .reactionCount)
        commentCount = try c.decode(Int.self, forKey: .commentCount)
        shareCount = try c.decodeIfPresent(Int.self, forKey: .shareCount) ?? 0
        thumbnailUrl = try c.decodeIfPresent(String.self, forKey: .thumbnailUrl)
        previewText = try c.decode(String.self, forKey: .previewText)
        moodEmoji = try c.decodeIfPresent(String.self, forKey: .moodEmoji)
        authorName = try c.decodeIfPresent(String.self, forKey: .authorName)
        // `createdAt` est décodé depuis une String puis parsé ici — agnostique
        // de la `dateDecodingStrategy` du JSONDecoder appelant (la prod utilise
        // une stratégie `.custom`, les tests `.iso8601`). Tolère les
        // millisecondes (`.000Z`) que le gateway émet via `Date.toISOString()`.
        let raw = try c.decode(String.self, forKey: .createdAt)
        guard let date = Self.isoFractional.date(from: raw) ?? Self.isoPlain.date(from: raw) else {
            throw DecodingError.dataCorruptedError(forKey: .createdAt, in: c,
                debugDescription: "Date ISO8601 invalide: \(raw)")
        }
        createdAt = date
    }
}

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
    /// Lieu partagé, hissé par le gateway depuis `metadata.location` — même
    /// mécanique que `postReplyTo`. Le SDK ne décode pas `metadata` brut.
    /// `var`/`= nil` (au lieu de `let`) : même patron que `trackingLinks`
    /// ci-dessous, pour rester source-compatible avec le memberwise init déjà
    /// utilisé par les tests existants sans devoir y ajouter ce paramètre.
    public var location: SharedPlace? = nil
    /// Sticker porté par le message (#4823), hissé par le gateway depuis
    /// `metadata.sticker` sur ses deux producteurs (REST et `message:new`) ;
    /// repli sur l'enveloppe `metadata` pour une charge qui ne le hisse pas.
    /// Toujours RENDABLE quand non nil (`MessageSticker.ifRenderable`) — un
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
    /// Outbound-link tracking mappings minted by the gateway. Parsed from the
    /// top-level `trackingLinks` (socket `message:new`) OR from
    /// `metadata.trackingLinks` (REST). `nil` when the payload predates the
    /// feature — the renderer then falls back to the raw URLs. Defaulted so the
    /// memberwise initializer stays source-compatible with existing call sites.
    public var trackingLinks: [TrackedLink]? = nil

    /// `[rawURL: token]` lookup derived from `trackingLinks`. Empty when no
    /// tracking data is present. Consumed by `MessageTextRenderer` (tappable
    /// link rewrite) and `VideoEmbedContainer` (façade destination).
    public var trackedLinkMap: [String: String] { (trackingLinks ?? []).trackedLinkMap }
}

extension APIMessage: Decodable {
    private enum CodingKeys: String, CodingKey {
        case id, clientMessageId, conversationId, senderId, content, originalLanguage
        case messageType, messageSource, isEdited, editedAt, deletedAt
        case replyToId, storyReplyToId, postReplyTo, storyReplyTo, forwardedFromId, forwardedFromConversationId
        case pinnedAt, pinnedBy, isViewOnce, isBlurred, expiresAt, location, sticker
        case isEncrypted, encryptionMode, createdAt, updatedAt
        case sender, attachments, replyTo, forwardedFrom, forwardedFromConversation
        case reactionSummary, reactionCount, currentUserReactions
        case deliveredToAllAt, readByAllAt, deliveredCount, readCount, recipientCount
        case effectFlags, translations, mentionedUsers
        case metadata
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
        location = try c.decodeIfPresent(SharedPlace.self, forKey: .location)
        // Sticker : la racine d'abord (les deux producteurs le hissent), sinon
        // l'enveloppe `metadata`. Les deux lectures sont tolérantes — une forme
        // inattendue laisse le champ nil sans faire tomber le message — et un
        // sticker non rendable vaut absence (règle de `MessageSticker`).
        let rootSticker: MessageSticker? = try? c.decodeIfPresent(MessageSticker.self, forKey: .sticker)
        let metadataSticker: MessageSticker? = (try? c.decodeIfPresent(MessageStickerEnvelope.self, forKey: .metadata))?.sticker
        sticker = rootSticker?.ifRenderable ?? metadataSticker?.ifRenderable
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
        translations = try c.decodeIfPresent([APITextTranslation].self, forKey: .translations)
        mentionedUsers = try c.decodeIfPresent([MentionedUser].self, forKey: .mentionedUsers)
        // Tolerant: a present-but-non-call metadata object must not fail the
        // whole message decode, so swallow shape mismatches into nil.
        callSummary = try? c.decodeIfPresent(CallSummaryMetadata.self, forKey: .metadata)
        joinNotice = try? c.decodeIfPresent(JoinNoticeMetadata.self, forKey: .metadata)
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

public struct MessagesAPIMeta: Decodable, Sendable {
    public let userLanguage: String?
    public let mentionedUsers: [MentionedUser]?
}

public struct MessagesAPIResponse: Decodable, Sendable {
    public let success: Bool
    public let data: [APIMessage]
    public let pagination: OffsetPagination?
    public let cursorPagination: CursorPagination?
    public let hasNewer: Bool?
    public let meta: MessagesAPIMeta?
}

public struct SendMessageRequest: Encodable, Sendable {
    /// Stable end-to-end identifier (`cid_<uuid v4 lowercase>`) generated by the
    /// client BEFORE the request is dispatched. Required by the Phase 4 contract
    /// (spec §6.2 — `services/gateway/src/socketio/handlers/MessageHandler.ts`
    /// `_sendResponse()` echoes it back in the ACK, and the gateway uses it for
    /// the unique-index dedup that prevents duplicate inserts on retry). The
    /// stored property is non-optional so the value is always serialized; the
    /// initializer accepts an optional argument for source compatibility and
    /// auto-generates a fresh `cid_*` when nil.
    public let clientMessageId: String
    public let content: String?
    public let originalLanguage: String?
    public let replyToId: String?
    public let storyReplyToId: String?
    public let forwardedFromId: String?
    public let forwardedFromConversationId: String?
    public let attachmentIds: [String]?
    public var expiresAt: Date?
    public var ephemeralDuration: Int?
    public var isViewOnce: Bool?
    public var maxViewOnceCount: Int?
    public var isBlurred: Bool?
    public var effectFlags: UInt32?
    public var isEncrypted: Bool?
    public var encryptionMode: String?
    /// Lieu partagé attaché au message — clé JSON `location`, celle que le
    /// schéma REST valide déjà (`routes/conversations/messages.ts`, champ
    /// `location` passé à `parseSharedPlace`). L'encodage synthétisé omet les
    /// optionnels nil : un `location` nil n'apparaît PAS dans le corps envoyé.
    public var location: SharedPlace?
    /// Fan-out de partage — clé JSON `copyAttachmentsFromMessageId`. Le serveur
    /// crée de NOUVELLES `MessageAttachment` pointant les MÊMES fichiers
    /// (`filePath`/`fileUrl`) que celles du message source, **sans** écrire
    /// `forwardedFromId` : aucun destinataire ne voit de badge « Transféré
    /// depuis … ». Réutiliser les `attachmentIds` de la source les
    /// DÉPLACERAIT (`associateAttachmentsToMessage` est un `updateMany`,
    /// `AttachmentService.ts:161-173`), ce qui les retirerait au premier
    /// destinataire. Contrat serveur :
    /// `docs/superpowers/plans/2026-08-19-forward-reach.md` Task 5.
    /// L'encodage synthétisé omet les optionnels nil.
    public var copyAttachmentsFromMessageId: String?
    /// Sticker du message (#4823) — clé JSON `sticker`, que le gateway range
    /// sous `metadata.sticker` et ressert hissée. Le PNG rendu voyage à part,
    /// en pièce jointe image ordinaire (`attachmentIds`). L'encodage
    /// synthétisé omet les optionnels nil : un `sticker` nil n'apparaît PAS
    /// dans le corps envoyé.
    public var sticker: MessageSticker?

    public init(content: String?, originalLanguage: String? = nil, replyToId: String? = nil, storyReplyToId: String? = nil, forwardedFromId: String? = nil, forwardedFromConversationId: String? = nil, attachmentIds: [String]? = nil, expiresAt: Date? = nil, ephemeralDuration: Int? = nil, isViewOnce: Bool? = nil, maxViewOnceCount: Int? = nil, isBlurred: Bool? = nil, effectFlags: UInt32? = nil, isEncrypted: Bool? = nil, encryptionMode: String? = nil, clientMessageId: String? = nil, location: SharedPlace? = nil, copyAttachmentsFromMessageId: String? = nil, sticker: MessageSticker? = nil) {
        self.clientMessageId = clientMessageId ?? ClientMessageId.generate()
        self.content = content; self.originalLanguage = originalLanguage
        self.replyToId = replyToId; self.storyReplyToId = storyReplyToId; self.forwardedFromId = forwardedFromId
        self.forwardedFromConversationId = forwardedFromConversationId; self.attachmentIds = attachmentIds
        self.expiresAt = expiresAt; self.ephemeralDuration = ephemeralDuration
        self.isViewOnce = isViewOnce; self.maxViewOnceCount = maxViewOnceCount
        self.isBlurred = isBlurred; self.effectFlags = effectFlags
        self.isEncrypted = isEncrypted; self.encryptionMode = encryptionMode
        self.location = location
        self.copyAttachmentsFromMessageId = copyAttachmentsFromMessageId
        self.sticker = sticker
    }
}

public struct SendMessageResponseData: Decodable, Sendable {
    public let id: String
    /// Echo of the `clientMessageId` sent in the request (Phase 4 contract).
    /// Optional on the wire because anonymous-link / legacy REST surfaces may
    /// not populate it yet during the rollout window.
    public let clientMessageId: String?
    public let conversationId: String
    public let senderId: String?
    public let content: String?
    public let messageType: String?
    public let createdAt: Date
}

public struct ConsumeViewOnceResponse: Decodable, Sendable {
    public let messageId: String
    public let viewOnceCount: Int
    public let maxViewOnceCount: Int
    public let isFullyConsumed: Bool
}

// MARK: - APIMessage -> MeeshyMessage Conversion

extension APIMessage {
    nonisolated(unsafe) private static let pinnedAtFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    /// `preferredLanguages` — le prisme ORDONNÉ du lecteur
    /// (`MeeshyUser.preferredContentLanguages`), par lequel la CITATION descend
    /// le Prisme au moment où elle est gravée. Vide ⇒ l'original, comme pour
    /// un participant anonyme.
    public func toMessage(
        currentUserId: String,
        currentUsername: String? = nil,
        currentUserDisplayName: String? = nil,
        preferredLanguages: [String] = []
    ) -> MeeshyMessage {
        let msgType: MeeshyMessage.MessageType = {
            switch messageType?.lowercased() {
            case "image": return .image
            case "file": return .file
            case "audio": return .audio
            case "video": return .video
            case "location": return .location
            default: return .text
            }
        }()

        let msgSource: MeeshyMessage.MessageSource = {
            switch messageSource?.lowercased() {
            case "system": return .system
            case "ads": return .ads
            case "app": return .app
            case "agent": return .agent
            case "authority": return .authority
            default: return .user
            }
        }()

        let senderDisplayName = sender?.name
        let senderColor = senderDisplayName.map { DynamicColorGenerator.colorForName($0) }
        let thumbnailColor = senderColor ?? DynamicColorGenerator.colorForName("?")

        let uiAttachments: [MeeshyMessageAttachment] = (attachments ?? []).map { apiAtt in
            let embeddedTranscription: MeeshyMessageAttachment.EmbeddedTranscription? = apiAtt.transcription.map { t in
                MeeshyMessageAttachment.EmbeddedTranscription(
                    text: t.resolvedText,
                    language: t.language ?? "und",
                    confidence: t.confidence,
                    durationMs: t.durationMs,
                    speakerCount: t.speakerCount,
                    segments: t.segments?.map { s in
                        MeeshyMessageAttachment.EmbeddedTranscription.TranscriptionSegmentData(
                            text: s.text,
                            startTime: s.startTime,
                            endTime: s.endTime,
                            speakerId: s.speakerId
                        )
                    }
                )
            }
            let embeddedAudioTranslations: [String: MeeshyMessageAttachment.EmbeddedAudioTranslation]? = apiAtt.translations.flatMap { dict in
                let mapped = dict.compactMapValues { t -> MeeshyMessageAttachment.EmbeddedAudioTranslation? in
                    guard let url = t.url else { return nil }
                    return MeeshyMessageAttachment.EmbeddedAudioTranslation(
                        url: url,
                        transcription: t.transcription,
                        durationMs: t.durationMs,
                        format: t.format,
                        cloned: t.cloned,
                        quality: t.quality,
                        voiceModelId: t.voiceModelId,
                        ttsModel: t.ttsModel,
                        segments: t.segments?.map { s in
                            MeeshyMessageAttachment.EmbeddedTranscription.TranscriptionSegmentData(
                                text: s.text,
                                startTime: s.startTime,
                                endTime: s.endTime,
                                speakerId: s.speakerId
                            )
                        }
                    )
                }
                return mapped.isEmpty ? nil : mapped
            }
            return MeeshyMessageAttachment(
                id: apiAtt.id, fileName: apiAtt.fileName ?? "", originalName: apiAtt.originalName ?? "",
                mimeType: apiAtt.mimeType ?? "application/octet-stream", fileSize: apiAtt.fileSize ?? 0,
                fileUrl: apiAtt.fileUrl ?? "", capturedInApp: apiAtt.capturedInApp == true,
                width: apiAtt.width, height: apiAtt.height,
                thumbnailUrl: apiAtt.thumbnailUrl, thumbHash: apiAtt.thumbHash, duration: apiAtt.duration, uploadedBy: senderId,
                latitude: apiAtt.latitude, longitude: apiAtt.longitude,
                thumbnailColor: thumbnailColor,
                transcription: embeddedTranscription,
                audioTranslations: embeddedAudioTranslations,
                imageVariants: apiAtt.imageVariants,
                deliveredToAllAt: apiAtt.deliveredToAllAt, viewedByAllAt: apiAtt.viewedByAllAt,
                downloadedByAllAt: apiAtt.downloadedByAllAt, listenedByAllAt: apiAtt.listenedByAllAt,
                watchedByAllAt: apiAtt.watchedByAllAt, viewedCount: apiAtt.viewedCount,
                downloadedCount: apiAtt.downloadedCount, consumedCount: apiAtt.consumedCount,
                currentUserConsumption: apiAtt.currentUserConsumption
            )
        }

        let uiReactions = MeeshyReaction.reconstructFromSummary(
            messageId: id,
            reactionSummary: reactionSummary,
            currentUserReactions: currentUserReactions,
            currentUserId: currentUserId
        )

        let uiReplyTo: ReplyReference? = {
            if let reply = replyTo {
                // Site UNIQUE, partagé avec le jumeau CACHE
                // (`MessagePersistenceActor.replyToJson`) : média représentatif,
                // protection, Prisme et faits gravés y sont décidés une fois.
                return reply.toReplyReference(currentUserId: currentUserId, preferredLanguages: preferredLanguages)
            }
            // Snapshot figé du post cité (vignette + compteurs like/commentaire/
            // partage + date, ou emoji+contenu+date pour un mood) — la citation
            // affiche le vrai aperçu et survit à l'expiration du post.
            if let target = postReplyTo {
                // Réponse à un mood : rendu dédié (emoji + contenu + date).
                if let emoji = target.moodEmoji {
                    // `authorAvatarUrl` reste nil, DELIBEREMENT : le snapshot
                    // `postReplyTo` ne porte aucun avatar d'auteur, et une
                    // citation de mood n'ouvre aucun profil (elle saute au post).
                    return ReplyReference(
                        messageId: target.id,
                        // Le nom vient du snapshot serveur. Vide sur un snapshot
                        // legacy : `quotedTitle` retombe alors sur « Humeur »,
                        // filet et non cas nominal.
                        authorName: target.authorName ?? "",
                        previewText: target.previewText,
                        isStoryReply: true,
                        storyPublishedAt: target.createdAt,
                        moodEmoji: emoji
                    )
                }
                // Idem : aucun avatar dans le snapshot `postReplyTo`, et
                // `authorName` vaut litteralement "Story" — il n'y a pas de
                // personne a ouvrir depuis cette citation.
                return ReplyReference(
                    messageId: target.id, authorName: "Story",
                    previewText: target.previewText.isEmpty ? "\u{1F4F7} Story" : target.previewText,
                    isStoryReply: true,
                    storyPublishedAt: target.createdAt,
                    storyReactionCount: target.reactionCount,
                    storyCommentCount: target.commentCount,
                    storyShareCount: target.shareCount,
                    storyThumbnailUrl: target.thumbnailUrl
                )
            }
            if let storyId = storyReplyToId, !storyId.isEmpty {
                // Repli le plus pauvre : seul l'identifiant de la story est
                // connu. Ni auteur reel, ni avatar — aucune porte vers un profil.
                return ReplyReference(
                    messageId: storyId, authorName: "Story",
                    previewText: "\u{1F4F7} Story", isStoryReply: true
                )
            }
            return nil
        }()

        let uiForwardRef: ForwardReference? = {
            guard let fwd = forwardedFrom else { return nil }
            let fwdSenderName = fwd.sender?.name ?? "?"
            let firstAtt = fwd.attachments?.first
            // Same mime → short kind contract as `uiReplyTo` above —
            // single source of truth is `AttachmentKind`.
            let fwdKindRaw = firstAtt?.mimeType.map { AttachmentKind(mimeType: $0).rawValue }
            return ForwardReference(
                originalMessageId: fwd.id,
                senderName: fwdSenderName,
                senderAvatar: fwd.sender?.avatar,
                previewText: fwd.content ?? "",
                conversationId: forwardedFromConversation?.id,
                // Même repli que `MeeshyConversation.name` : un public sans
                // titre garde un nom affichable via son identifier.
                conversationName: forwardedFromConversation?.title ?? forwardedFromConversation?.identifier,
                attachmentType: fwdKindRaw,
                attachmentThumbnailUrl: firstAtt?.thumbnailUrl,
                conversationType: forwardedFromConversation?.type
            )
        }()
        let resolvedUsername = sender?.username ?? sender?.user?.username
        let isMe = (sender?.resolvedUserId ?? senderId) == currentUserId
            || (currentUsername != nil && resolvedUsername?.lowercased() == currentUsername?.lowercased())

        // Un écho socket allégé peut omettre l'enveloppe expéditeur. Pour MON
        // propre message, l'identité de la session est déjà la vérité en local :
        // s'en servir évite que l'aperçu de la liste perde le nom de l'auteur
        // entre l'insertion optimiste et le prochain resync REST. Repli
        // strictement borné à `isMe` — jamais deviner le nom d'un autre.
        let effectiveSenderName = senderDisplayName ?? (isMe ? currentUserDisplayName : nil)
        let effectiveSenderUsername = resolvedUsername ?? (isMe ? currentUsername : nil)

        var effects: MessageEffects = .none
        if let flags = effectFlags, flags > 0 {
            effects.flags = MessageEffectFlags(rawValue: flags)
        } else {
            if isBlurred == true { effects.flags.insert(.blurred) }
            if isViewOnce == true { effects.flags.insert(.viewOnce) }
            if expiresAt != nil { effects.flags.insert(.ephemeral) }
        }

        if let username = resolvedUsername, let displayName = senderDisplayName, displayName != username {
            UserDisplayNameCache.shared.track(username: username, displayName: displayName)
        }

        let computedDeliveryStatus: MeeshyMessage.DeliveryStatus = {
            if (readCount ?? 0) > 0 || readByAllAt != nil { return .read }
            if (deliveredCount ?? 0) > 0 || deliveredToAllAt != nil { return .delivered }
            return .sent
        }()

        return MeeshyMessage(
            id: id, clientMessageId: clientMessageId,
            conversationId: conversationId, senderId: senderId,
            content: content ?? "",
            originalLanguage: originalLanguage ?? "fr", messageType: msgType, messageSource: msgSource,
            isEdited: isEdited ?? false, deletedAt: deletedAt, replyToId: replyToId,
            storyReplyToId: storyReplyToId,
            forwardedFromId: forwardedFromId, forwardedFromConversationId: forwardedFromConversationId,
            expiresAt: expiresAt, effects: effects,
            pinnedAt: pinnedAt.flatMap { Self.pinnedAtFormatter.date(from: $0) },
            pinnedBy: pinnedBy,
            isEncrypted: isEncrypted ?? false, encryptionMode: encryptionMode,
            createdAt: createdAt, updatedAt: updatedAt ?? createdAt,
            attachments: uiAttachments, reactions: uiReactions, replyTo: uiReplyTo,
            forwardedFrom: uiForwardRef,
            senderName: effectiveSenderName, senderUsername: effectiveSenderUsername, senderColor: senderColor,
            senderAvatarURL: sender?.resolvedAvatar, senderUserId: sender?.resolvedUserId,
            senderIsAnonymous: sender?.isAnonymous ?? false,
            deliveryStatus: computedDeliveryStatus,
            isMe: isMe,
            deliveredToAllAt: deliveredToAllAt, readByAllAt: readByAllAt,
            deliveredCount: deliveredCount ?? 0, readCount: readCount ?? 0,
            recipientCount: recipientCount ?? 0,
            callSummary: callSummary,
            joinNotice: joinNotice,
            sticker: sticker,
            trackedLinkMap: trackedLinkMap
        )
    }
}
