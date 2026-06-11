import Foundation

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
    public let imageVariants: [MeeshyImageVariant]?
    /// BUG2 A' — réactions par-image agrégées (emoji→count).
    public let reactionSummary: [String: Int]?
    /// BUG2 A' — emojis posés par l'utilisateur courant sur cette pièce jointe.
    public let currentUserReactions: [String]?

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

    // ── View-once / Effects / Blur ──
    public let isViewOnce: Bool?
    public let maxViewOnceCount: Int?
    public let viewOnceCount: Int?
    public let isBlurred: Bool?
    public let effectFlags: UInt32?

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
        case thumbnailUrl, thumbHash, width, height, imageVariants, reactionSummary, currentUserReactions
        case duration, bitrate, sampleRate, codec, channels, fps, videoCodec
        case pageCount, lineCount
        case latitude, longitude
        case uploadedBy, isAnonymous, createdAt
        case forwardedFromAttachmentId, isForwarded
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
        self.imageVariants = try c.decodeIfPresent([MeeshyImageVariant].self, forKey: .imageVariants)
        self.reactionSummary = try c.decodeIfPresent([String: Int].self, forKey: .reactionSummary)
        self.currentUserReactions = try c.decodeIfPresent([String].self, forKey: .currentUserReactions)
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

public struct APIMessageReplyTo: Decodable, Sendable {
    public let id: String
    public let content: String?
    public let senderId: String?
    public let sender: APIMessageSender?
    public let attachments: [APIMessageAttachment]?
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
}

/// Métadonnées enrichies de la story citée — renvoyées par le gateway dans
/// `GET /messages` quand le message répond à une story. `nil` si la story a
/// été supprimée.
public struct APIStoryReplyTarget: Decodable, Sendable {
    public let id: String
    public let reactionCount: Int
    public let commentCount: Int
    public let createdAt: Date
    public let thumbnailUrl: String?
    public let previewText: String
    /// Présent quand le post cité est un mood/statut — déclenche le rendu
    /// dédié (emoji + contenu + date) côté bulle.
    public let moodEmoji: String?

    private enum CodingKeys: String, CodingKey {
        case id, reactionCount, commentCount, createdAt, thumbnailUrl, previewText, moodEmoji
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
        reactionCount = try c.decode(Int.self, forKey: .reactionCount)
        commentCount = try c.decode(Int.self, forKey: .commentCount)
        thumbnailUrl = try c.decodeIfPresent(String.self, forKey: .thumbnailUrl)
        previewText = try c.decode(String.self, forKey: .previewText)
        moodEmoji = try c.decodeIfPresent(String.self, forKey: .moodEmoji)
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
    public let deletedAt: Date?
    public var isDeleted: Bool { deletedAt != nil }
    public let replyToId: String?
    public let storyReplyToId: String?
    public let storyReplyTo: APIStoryReplyTarget?
    public let forwardedFromId: String?
    public let forwardedFromConversationId: String?
    public let pinnedAt: String?
    public let pinnedBy: String?
    public let isViewOnce: Bool?
    public let isBlurred: Bool?
    public let expiresAt: Date?
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
    public let effectFlags: UInt32?
    public let translations: [APITextTranslation]?
    public let mentionedUsers: [MentionedUser]?
    /// Structured per-type payload. For call-summary system messages this decodes
    /// into a `CallSummaryMetadata`; absent / non-call metadata yields `nil`.
    public let callSummary: CallSummaryMetadata?
}

extension APIMessage: Decodable {
    private enum CodingKeys: String, CodingKey {
        case id, clientMessageId, conversationId, senderId, content, originalLanguage
        case messageType, messageSource, isEdited, deletedAt
        case replyToId, storyReplyToId, storyReplyTo, forwardedFromId, forwardedFromConversationId
        case pinnedAt, pinnedBy, isViewOnce, isBlurred, expiresAt
        case isEncrypted, encryptionMode, createdAt, updatedAt
        case sender, attachments, replyTo, forwardedFrom, forwardedFromConversation
        case reactionSummary, reactionCount, currentUserReactions
        case deliveredToAllAt, readByAllAt, deliveredCount, readCount
        case effectFlags, translations, mentionedUsers
        case metadata
        // MongoDB fallback
        case _id
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
        deletedAt = try c.decodeIfPresent(Date.self, forKey: .deletedAt)
        replyToId = try c.decodeIfPresent(String.self, forKey: .replyToId)
        storyReplyToId = try c.decodeIfPresent(String.self, forKey: .storyReplyToId)
        storyReplyTo = try c.decodeIfPresent(APIStoryReplyTarget.self, forKey: .storyReplyTo)
        forwardedFromId = try c.decodeIfPresent(String.self, forKey: .forwardedFromId)
        forwardedFromConversationId = try c.decodeIfPresent(String.self, forKey: .forwardedFromConversationId)
        pinnedAt = try c.decodeIfPresent(String.self, forKey: .pinnedAt)
        pinnedBy = try c.decodeIfPresent(String.self, forKey: .pinnedBy)
        isViewOnce = try c.decodeIfPresent(Bool.self, forKey: .isViewOnce)
        isBlurred = try c.decodeIfPresent(Bool.self, forKey: .isBlurred)
        expiresAt = try c.decodeIfPresent(Date.self, forKey: .expiresAt)
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
        effectFlags = try c.decodeIfPresent(UInt32.self, forKey: .effectFlags)
        translations = try c.decodeIfPresent([APITextTranslation].self, forKey: .translations)
        mentionedUsers = try c.decodeIfPresent([MentionedUser].self, forKey: .mentionedUsers)
        // Tolerant: a present-but-non-call metadata object must not fail the
        // whole message decode, so swallow shape mismatches into nil.
        callSummary = try? c.decodeIfPresent(CallSummaryMetadata.self, forKey: .metadata)
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

    public init(content: String?, originalLanguage: String? = nil, replyToId: String? = nil, storyReplyToId: String? = nil, forwardedFromId: String? = nil, forwardedFromConversationId: String? = nil, attachmentIds: [String]? = nil, expiresAt: Date? = nil, ephemeralDuration: Int? = nil, isViewOnce: Bool? = nil, maxViewOnceCount: Int? = nil, isBlurred: Bool? = nil, effectFlags: UInt32? = nil, isEncrypted: Bool? = nil, encryptionMode: String? = nil, clientMessageId: String? = nil) {
        self.clientMessageId = clientMessageId ?? ClientMessageId.generate()
        self.content = content; self.originalLanguage = originalLanguage
        self.replyToId = replyToId; self.storyReplyToId = storyReplyToId; self.forwardedFromId = forwardedFromId
        self.forwardedFromConversationId = forwardedFromConversationId; self.attachmentIds = attachmentIds
        self.expiresAt = expiresAt; self.ephemeralDuration = ephemeralDuration
        self.isViewOnce = isViewOnce; self.maxViewOnceCount = maxViewOnceCount
        self.isBlurred = isBlurred; self.effectFlags = effectFlags
        self.isEncrypted = isEncrypted; self.encryptionMode = encryptionMode
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

    public func toMessage(currentUserId: String, currentUsername: String? = nil) -> MeeshyMessage {
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
            MeeshyMessageAttachment(
                id: apiAtt.id, fileName: apiAtt.fileName ?? "", originalName: apiAtt.originalName ?? "",
                mimeType: apiAtt.mimeType ?? "application/octet-stream", fileSize: apiAtt.fileSize ?? 0,
                fileUrl: apiAtt.fileUrl ?? "", width: apiAtt.width, height: apiAtt.height,
                thumbnailUrl: apiAtt.thumbnailUrl, thumbHash: apiAtt.thumbHash, duration: apiAtt.duration, uploadedBy: senderId,
                latitude: apiAtt.latitude, longitude: apiAtt.longitude,
                thumbnailColor: thumbnailColor,
                imageVariants: apiAtt.imageVariants
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
                let isReplyMe = reply.senderId == currentUserId
                let authorName = reply.sender?.name ?? "?"
                let firstAtt = reply.attachments?.first
                // Single source of truth for mime → category: AttachmentKind
                // (see `AttachmentKind.swift`). Pre-fix this stored the raw
                // MIME (`"image/jpeg"`) which broke the reply-preview icon
                // resolution — consumers expect a short kind (`"image"`,
                // `"video"`, ...) matching `AttachmentKind.rawValue`.
                let kindRaw = firstAtt?.mimeType.map { AttachmentKind(mimeType: $0).rawValue }
                return ReplyReference(
                    messageId: reply.id, authorName: authorName,
                    previewText: reply.content ?? "", isMe: isReplyMe,
                    attachmentType: kindRaw,
                    attachmentThumbnailUrl: firstAtt?.thumbnailUrl
                )
            }
            // Enriched story-reply target (thumbnail + reaction/comment
            // counts + publish date) — lets the quoted-reply citation show
            // the real story preview instead of a bare "Story" placeholder.
            if let target = storyReplyTo {
                // Réponse à un mood : rendu dédié (emoji + contenu + date).
                if let emoji = target.moodEmoji {
                    return ReplyReference(
                        messageId: target.id, authorName: "",
                        previewText: target.previewText,
                        isStoryReply: true,
                        storyPublishedAt: target.createdAt,
                        moodEmoji: emoji
                    )
                }
                return ReplyReference(
                    messageId: target.id, authorName: "Story",
                    previewText: target.previewText.isEmpty ? "\u{1F4F7} Story" : target.previewText,
                    isStoryReply: true,
                    storyPublishedAt: target.createdAt,
                    storyReactionCount: target.reactionCount,
                    storyCommentCount: target.commentCount,
                    storyThumbnailUrl: target.thumbnailUrl
                )
            }
            if let storyId = storyReplyToId, !storyId.isEmpty {
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
                conversationName: forwardedFromConversation?.title,
                attachmentType: fwdKindRaw,
                attachmentThumbnailUrl: firstAtt?.thumbnailUrl
            )
        }()
        let resolvedUsername = sender?.username ?? sender?.user?.username

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
            senderName: senderDisplayName, senderUsername: resolvedUsername, senderColor: senderColor,
            senderAvatarURL: sender?.resolvedAvatar, senderUserId: sender?.resolvedUserId,
            deliveryStatus: computedDeliveryStatus,
            isMe: (sender?.resolvedUserId ?? senderId) == currentUserId
                || (currentUsername != nil && resolvedUsername?.lowercased() == currentUsername?.lowercased()),
            deliveredToAllAt: deliveredToAllAt, readByAllAt: readByAllAt,
            deliveredCount: deliveredCount ?? 0, readCount: readCount ?? 0,
            callSummary: callSummary
        )
    }
}
