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

public struct APIAttachmentTranscription: Decodable, Sendable {
    public let text: String?
    public let transcribedText: String?
    public let language: String?
    public let confidence: Double?
    public let durationMs: Int?
    public let segments: [TranscriptionSegment]?
    public let speakerCount: Int?

    public var resolvedText: String { text ?? transcribedText ?? "" }
}

public struct APIAttachmentTranslation: Decodable, Sendable {
    public let type: String?
    public let transcription: String?
    public let url: String?
    public let durationMs: Int?
    public let format: String?
    public let cloned: Bool?
    public let quality: Double?
    public let ttsModel: String?
    public let segments: [TranscriptionSegment]?
}

public struct APIMessageAttachment: Decodable, Sendable {
    public let id: String
    public let fileName: String?
    public let originalName: String?
    public let mimeType: String?
    public let fileSize: Int?
    public let fileUrl: String?
    public let thumbnailUrl: String?
    public let width: Int?
    public let height: Int?
    public let duration: Int?
    public let latitude: Double?
    public let longitude: Double?
    public let transcription: APIAttachmentTranscription?
    public let translations: [String: APIAttachmentTranslation]?
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

public struct APIMessage: Sendable {
    public let id: String
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
}

extension APIMessage: Decodable {
    private enum CodingKeys: String, CodingKey {
        case id, conversationId, senderId, content, originalLanguage
        case messageType, messageSource, isEdited, deletedAt
        case replyToId, storyReplyToId, forwardedFromId, forwardedFromConversationId
        case pinnedAt, pinnedBy, isViewOnce, isBlurred, expiresAt
        case isEncrypted, encryptionMode, createdAt, updatedAt
        case sender, attachments, replyTo, forwardedFrom, forwardedFromConversation
        case reactionSummary, reactionCount, currentUserReactions
        case deliveredToAllAt, readByAllAt, deliveredCount, readCount
        case effectFlags, translations, mentionedUsers
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

    public init(content: String?, originalLanguage: String? = nil, replyToId: String? = nil, storyReplyToId: String? = nil, forwardedFromId: String? = nil, forwardedFromConversationId: String? = nil, attachmentIds: [String]? = nil, expiresAt: Date? = nil, ephemeralDuration: Int? = nil, isViewOnce: Bool? = nil, maxViewOnceCount: Int? = nil, isBlurred: Bool? = nil, effectFlags: UInt32? = nil, isEncrypted: Bool? = nil, encryptionMode: String? = nil) {
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

    public func toMessage(currentUserId: String) -> MeeshyMessage {
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
                thumbnailUrl: apiAtt.thumbnailUrl, duration: apiAtt.duration, uploadedBy: senderId,
                latitude: apiAtt.latitude, longitude: apiAtt.longitude,
                thumbnailColor: thumbnailColor
            )
        }

        let userReactionSet = Set(currentUserReactions ?? [])
        let uiReactions: [MeeshyReaction] = {
            guard let summary = reactionSummary else { return [] }
            return summary.flatMap { emoji, count in
                let meReacted = userReactionSet.contains(emoji)
                return (0..<count).map { index in
                    MeeshyReaction(
                        messageId: id,
                        participantId: (meReacted && index == 0) ? currentUserId : nil,
                        emoji: emoji
                    )
                }
            }
        }()

        let uiReplyTo: ReplyReference? = {
            guard let reply = replyTo else { return nil }
            let isReplyMe = reply.senderId == currentUserId
            let authorName = reply.sender?.name ?? "?"
            let firstAtt = reply.attachments?.first
            return ReplyReference(
                messageId: reply.id, authorName: authorName,
                previewText: reply.content ?? "", isMe: isReplyMe,
                attachmentType: firstAtt?.mimeType,
                attachmentThumbnailUrl: firstAtt?.thumbnailUrl
            )
        }()

        let uiForwardRef: ForwardReference? = {
            guard let fwd = forwardedFrom else { return nil }
            let fwdSenderName = fwd.sender?.name ?? "?"
            let firstAtt = fwd.attachments?.first
            return ForwardReference(
                originalMessageId: fwd.id,
                senderName: fwdSenderName,
                senderAvatar: fwd.sender?.avatar,
                previewText: fwd.content ?? "",
                conversationId: forwardedFromConversation?.id,
                conversationName: forwardedFromConversation?.title,
                attachmentType: firstAtt?.mimeType,
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

        return MeeshyMessage(
            id: id, conversationId: conversationId, senderId: senderId,
            content: content ?? "",
            originalLanguage: originalLanguage ?? "fr", messageType: msgType, messageSource: msgSource,
            isEdited: isEdited ?? false, deletedAt: deletedAt, replyToId: replyToId,
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
            isMe: (sender?.resolvedUserId ?? senderId) == currentUserId
        )
    }
}
