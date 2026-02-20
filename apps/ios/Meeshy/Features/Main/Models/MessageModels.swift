import Foundation

// MARK: - API Message Models (aligned with gateway GET /conversations/:id/messages)

struct APIMessageSender: Decodable {
    let id: String
    let username: String
    let displayName: String?
    let avatar: String?
}

struct APIMessageAttachment: Decodable {
    let id: String
    let fileName: String?
    let originalName: String?
    let mimeType: String?
    let fileSize: Int?
    let fileUrl: String?
    let thumbnailUrl: String?
    let width: Int?
    let height: Int?
    let duration: Int? // ms
    let latitude: Double?
    let longitude: Double?
}

struct APIMessageReplyTo: Decodable {
    let id: String
    let content: String?
    let senderId: String?
    let sender: APIMessageSender?
}

struct APIMessage: Decodable {
    let id: String
    let conversationId: String
    let senderId: String?
    let anonymousSenderId: String?
    let content: String?
    let originalLanguage: String?
    let messageType: String?
    let messageSource: String?
    let isEdited: Bool?
    let isDeleted: Bool?
    let replyToId: String?
    let pinnedAt: String?
    let isViewOnce: Bool?
    let isBlurred: Bool?
    let createdAt: Date
    let updatedAt: Date?
    let sender: APIMessageSender?
    let attachments: [APIMessageAttachment]?
    let replyTo: APIMessageReplyTo?
    let reactionSummary: [String: Int]?
    let reactionCount: Int?
    let currentUserReactions: [String]?
}

// MARK: - Messages API Response

struct MessagesAPIResponse: Decodable {
    let success: Bool
    let data: [APIMessage]
    let pagination: OffsetPagination?
}

// MARK: - Send Message Request

struct SendMessageRequest: Encodable {
    let content: String?
    let originalLanguage: String?
    let replyToId: String?
    let attachmentIds: [String]?
}

// MARK: - Send Message Response

struct SendMessageResponseData: Decodable {
    let id: String
    let conversationId: String
    let senderId: String?
    let content: String?
    let messageType: String?
    let createdAt: Date
}

// MARK: - APIMessage → Message Conversion

extension APIMessage {
    func toMessage(currentUserId: String) -> Message {
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
                id: apiAtt.id,
                fileName: apiAtt.fileName ?? "",
                originalName: apiAtt.originalName ?? "",
                mimeType: apiAtt.mimeType ?? "application/octet-stream",
                fileSize: apiAtt.fileSize ?? 0,
                fileUrl: apiAtt.fileUrl ?? "",
                width: apiAtt.width,
                height: apiAtt.height,
                thumbnailUrl: apiAtt.thumbnailUrl,
                duration: apiAtt.duration,
                uploadedBy: senderId ?? "",
                latitude: apiAtt.latitude,
                longitude: apiAtt.longitude,
                thumbnailColor: DynamicColorGenerator.colorForName(sender?.username ?? "?")
            )
        }

        let uiReactions: [Reaction] = {
            guard let summary = reactionSummary else { return [] }
            return summary.flatMap { emoji, count in
                (0..<count).map { _ in
                    Reaction(messageId: id, emoji: emoji)
                }
            }
        }()

        let uiReplyTo: ReplyReference? = {
            guard let reply = replyTo else { return nil }
            let isReplyMe = reply.senderId == currentUserId
            let authorName = reply.sender?.displayName ?? reply.sender?.username ?? "?"
            return ReplyReference(
                authorName: authorName,
                previewText: reply.content ?? "",
                isMe: isReplyMe
            )
        }()

        return Message(
            id: id,
            conversationId: conversationId,
            senderId: senderId,
            anonymousSenderId: anonymousSenderId,
            content: content ?? "",
            originalLanguage: originalLanguage ?? "fr",
            messageType: msgType,
            messageSource: msgSource,
            isEdited: isEdited ?? false,
            isDeleted: isDeleted ?? false,
            replyToId: replyToId,
            isViewOnce: isViewOnce ?? false,
            isBlurred: isBlurred ?? false,
            createdAt: createdAt,
            updatedAt: updatedAt ?? createdAt,
            attachments: uiAttachments,
            reactions: uiReactions,
            replyTo: uiReplyTo,
            senderName: sender?.displayName ?? sender?.username,
            senderColor: DynamicColorGenerator.colorForName(sender?.username ?? "?"),
            senderAvatarURL: sender?.avatar,
            isMe: senderId == currentUserId
        )
    }
}
