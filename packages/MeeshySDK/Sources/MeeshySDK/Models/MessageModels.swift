import Foundation

// MARK: - API Message Models

public struct APIMessageSender: Decodable {
    public let id: String
    public let username: String
    public let displayName: String?
    public let avatar: String?
}

public struct APIMessageAttachment: Decodable {
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
}

public struct APIMessageReplyTo: Decodable {
    public let id: String
    public let content: String?
    public let senderId: String?
    public let sender: APIMessageSender?
    public let attachments: [APIMessageAttachment]?
}

public struct APIForwardedFrom: Decodable {
    public let id: String
    public let content: String?
    public let messageType: String?
    public let createdAt: Date?
    public let sender: APIMessageSender?
    public let attachments: [APIMessageAttachment]?
}

public struct APIForwardedFromConversation: Decodable {
    public let id: String
    public let title: String?
    public let identifier: String?
    public let type: String?
    public let avatar: String?
}

public struct APIMessage: Decodable {
    public let id: String
    public let conversationId: String
    public let senderId: String?
    public let anonymousSenderId: String?
    public let content: String?
    public let originalLanguage: String?
    public let messageType: String?
    public let messageSource: String?
    public let isEdited: Bool?
    public let isDeleted: Bool?
    public let replyToId: String?
    public let forwardedFromId: String?
    public let forwardedFromConversationId: String?
    public let pinnedAt: String?
    public let pinnedBy: String?
    public let isViewOnce: Bool?
    public let isBlurred: Bool?
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
}

public struct MessagesAPIResponse: Decodable {
    public let success: Bool
    public let data: [APIMessage]
    public let pagination: OffsetPagination?
    public let cursorPagination: CursorPagination?
}

public struct SendMessageRequest: Encodable {
    public let content: String?
    public let originalLanguage: String?
    public let replyToId: String?
    public let forwardedFromId: String?
    public let forwardedFromConversationId: String?
    public let attachmentIds: [String]?

    public init(content: String?, originalLanguage: String? = nil, replyToId: String? = nil, forwardedFromId: String? = nil, forwardedFromConversationId: String? = nil, attachmentIds: [String]? = nil) {
        self.content = content; self.originalLanguage = originalLanguage
        self.replyToId = replyToId; self.forwardedFromId = forwardedFromId
        self.forwardedFromConversationId = forwardedFromConversationId; self.attachmentIds = attachmentIds
    }
}

public struct SendMessageResponseData: Decodable {
    public let id: String
    public let conversationId: String
    public let senderId: String?
    public let content: String?
    public let messageType: String?
    public let createdAt: Date
}

// MARK: - APIMessage -> MeeshyMessage Conversion

extension APIMessage {
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

        let uiAttachments: [MeeshyMessageAttachment] = (attachments ?? []).map { apiAtt in
            MeeshyMessageAttachment(
                id: apiAtt.id, fileName: apiAtt.fileName ?? "", originalName: apiAtt.originalName ?? "",
                mimeType: apiAtt.mimeType ?? "application/octet-stream", fileSize: apiAtt.fileSize ?? 0,
                fileUrl: apiAtt.fileUrl ?? "", width: apiAtt.width, height: apiAtt.height,
                thumbnailUrl: apiAtt.thumbnailUrl, duration: apiAtt.duration, uploadedBy: senderId ?? "",
                latitude: apiAtt.latitude, longitude: apiAtt.longitude,
                thumbnailColor: DynamicColorGenerator.colorForName(sender?.username ?? "?")
            )
        }

        let uiReactions: [MeeshyReaction] = {
            guard let summary = reactionSummary else { return [] }
            return summary.flatMap { emoji, count in
                (0..<count).map { _ in MeeshyReaction(messageId: id, emoji: emoji) }
            }
        }()

        let uiReplyTo: ReplyReference? = {
            guard let reply = replyTo else { return nil }
            let isReplyMe = reply.senderId == currentUserId
            let authorName = reply.sender?.displayName ?? reply.sender?.username ?? "?"
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
            let fwdSenderName = fwd.sender?.displayName ?? fwd.sender?.username ?? "?"
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

        let senderDisplayName = sender?.displayName ?? sender?.username
        let senderColor = senderDisplayName.map { DynamicColorGenerator.colorForName($0) }

        return MeeshyMessage(
            id: id, conversationId: conversationId, senderId: senderId,
            anonymousSenderId: anonymousSenderId, content: content ?? "",
            originalLanguage: originalLanguage ?? "fr", messageType: msgType, messageSource: msgSource,
            isEdited: isEdited ?? false, isDeleted: isDeleted ?? false, replyToId: replyToId,
            forwardedFromId: forwardedFromId, forwardedFromConversationId: forwardedFromConversationId,
            isViewOnce: isViewOnce ?? false, isBlurred: isBlurred ?? false,
            pinnedAt: pinnedAt.flatMap { ISO8601DateFormatter().date(from: $0) },
            pinnedBy: pinnedBy,
            isEncrypted: isEncrypted ?? false, encryptionMode: encryptionMode,
            createdAt: createdAt, updatedAt: updatedAt ?? createdAt,
            attachments: uiAttachments, reactions: uiReactions, replyTo: uiReplyTo,
            forwardedFrom: uiForwardRef,
            senderName: senderDisplayName, senderColor: senderColor,
            senderAvatarURL: sender?.avatar,
            isMe: senderId == currentUserId
        )
    }
}
