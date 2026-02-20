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
    public let pinnedAt: String?
    public let isViewOnce: Bool?
    public let isBlurred: Bool?
    public let createdAt: Date
    public let updatedAt: Date?
    public let sender: APIMessageSender?
    public let attachments: [APIMessageAttachment]?
    public let replyTo: APIMessageReplyTo?
    public let reactionSummary: [String: Int]?
    public let reactionCount: Int?
    public let currentUserReactions: [String]?
}

public struct MessagesAPIResponse: Decodable {
    public let success: Bool
    public let data: [APIMessage]
    public let pagination: OffsetPagination?
}

public struct SendMessageRequest: Encodable {
    public let content: String?
    public let originalLanguage: String?
    public let replyToId: String?
    public let attachmentIds: [String]?

    public init(content: String?, originalLanguage: String? = nil, replyToId: String? = nil, attachmentIds: [String]? = nil) {
        self.content = content; self.originalLanguage = originalLanguage
        self.replyToId = replyToId; self.attachmentIds = attachmentIds
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

// MARK: - APIMessage -> Message Conversion

extension APIMessage {
    public func toMessage(currentUserId: String) -> Message {
        let msgType: Message.MessageType = {
            switch messageType?.lowercased() {
            case "image": return .image
            case "file": return .file
            case "audio": return .audio
            case "video": return .video
            case "location": return .location
            default: return .text
            }
        }()

        let msgSource: Message.MessageSource = {
            switch messageSource?.lowercased() {
            case "system": return .system
            case "ads": return .ads
            case "app": return .app
            case "agent": return .agent
            case "authority": return .authority
            default: return .user
            }
        }()

        let uiAttachments: [MessageAttachment] = (attachments ?? []).map { apiAtt in
            MessageAttachment(
                id: apiAtt.id, fileName: apiAtt.fileName ?? "", originalName: apiAtt.originalName ?? "",
                mimeType: apiAtt.mimeType ?? "application/octet-stream", fileSize: apiAtt.fileSize ?? 0,
                fileUrl: apiAtt.fileUrl ?? "", width: apiAtt.width, height: apiAtt.height,
                thumbnailUrl: apiAtt.thumbnailUrl, duration: apiAtt.duration, uploadedBy: senderId ?? "",
                latitude: apiAtt.latitude, longitude: apiAtt.longitude,
                thumbnailColor: DynamicColorGenerator.colorForName(sender?.username ?? "?")
            )
        }

        let uiReactions: [Reaction] = {
            guard let summary = reactionSummary else { return [] }
            return summary.flatMap { emoji, count in
                (0..<count).map { _ in Reaction(messageId: id, emoji: emoji) }
            }
        }()

        let uiReplyTo: ReplyReference? = {
            guard let reply = replyTo else { return nil }
            let isReplyMe = reply.senderId == currentUserId
            let authorName = reply.sender?.displayName ?? reply.sender?.username ?? "?"
            return ReplyReference(authorName: authorName, previewText: reply.content ?? "", isMe: isReplyMe)
        }()

        let senderDisplayName = sender?.displayName ?? sender?.username
        let senderColor = senderDisplayName.map { DynamicColorGenerator.colorForName($0) }

        return Message(
            id: id, conversationId: conversationId, senderId: senderId,
            anonymousSenderId: anonymousSenderId, content: content ?? "",
            originalLanguage: originalLanguage ?? "fr", messageType: msgType, messageSource: msgSource,
            isEdited: isEdited ?? false, isDeleted: isDeleted ?? false, replyToId: replyToId,
            isViewOnce: isViewOnce ?? false, isBlurred: isBlurred ?? false,
            createdAt: createdAt, updatedAt: updatedAt ?? createdAt,
            attachments: uiAttachments, reactions: uiReactions, replyTo: uiReplyTo,
            senderName: senderDisplayName, senderColor: senderColor,
            senderAvatarURL: sender?.avatar,
            isMe: senderId == currentUserId
        )
    }
}
