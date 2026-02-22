import Foundation
import MeeshySDK

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
    let attachments: [APIMessageAttachment]?
}

struct APIForwardedFrom: Decodable {
    let id: String
    let content: String?
    let messageType: String?
    let createdAt: Date?
    let sender: APIMessageSender?
    let attachments: [APIMessageAttachment]?
}

struct APIForwardedFromConversation: Decodable {
    let id: String
    let title: String?
    let identifier: String?
    let type: String?
    let avatar: String?
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
    let forwardedFromId: String?
    let forwardedFromConversationId: String?
    let pinnedAt: String?
    let pinnedBy: String?
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
    let forwardedFrom: APIForwardedFrom?
    let forwardedFromConversation: APIForwardedFromConversation?
    let deliveredToAllAt: Date?
    let readByAllAt: Date?
    let deliveredCount: Int?
    let readCount: Int?
    let isEncrypted: Bool?
    let encryptionMode: String?
}

// MARK: - Messages API Response

struct MessagesAPIResponse: Decodable {
    let success: Bool
    let data: [APIMessage]
    let pagination: OffsetPagination?
    let cursorPagination: CursorPagination?
    let hasNewer: Bool?  // Present in "around" mode responses
}

// MARK: - Send Message Request

struct SendMessageRequest: Encodable {
    var content: String? = nil
    var originalLanguage: String? = nil
    var replyToId: String? = nil
    var forwardedFromId: String? = nil
    var forwardedFromConversationId: String? = nil
    var attachmentIds: [String]? = nil
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

// MARK: - Search Result Item

struct SearchResultItem: Identifiable {
    let id: String
    let conversationId: String
    let content: String
    let matchedText: String
    let matchType: String // "content" or "translation"
    let senderName: String
    let senderAvatar: String?
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
            let firstAttachment = reply.attachments?.first
            let attType: String? = firstAttachment.flatMap { att in
                guard let mime = att.mimeType else { return nil }
                if mime.hasPrefix("image/") { return "image" }
                if mime.hasPrefix("video/") { return "video" }
                if mime.hasPrefix("audio/") { return "audio" }
                return "file"
            }
            let attThumb = firstAttachment?.thumbnailUrl ?? (attType == "image" ? firstAttachment?.fileUrl : nil)
            let previewText = (reply.content ?? "").isEmpty
                ? (attType.map { "[\($0.capitalized)]" } ?? "")
                : (reply.content ?? "")
            return ReplyReference(
                messageId: reply.id,
                authorName: authorName,
                previewText: previewText,
                isMe: isReplyMe,
                attachmentType: attType,
                attachmentThumbnailUrl: attThumb
            )
        }()

        let uiForwardedFrom: ForwardReference? = {
            guard let fwd = forwardedFrom, let fwdSender = fwd.sender else { return nil }
            let senderName = fwdSender.displayName ?? fwdSender.username
            let previewText = (fwd.content ?? "").isEmpty ? "[Media]" : (fwd.content ?? "")
            let firstAtt = fwd.attachments?.first
            let attType: String? = firstAtt.flatMap { att in
                guard let mime = att.mimeType else { return nil }
                if mime.hasPrefix("image/") { return "image" }
                if mime.hasPrefix("video/") { return "video" }
                if mime.hasPrefix("audio/") { return "audio" }
                return "file"
            }
            let attThumb = firstAtt?.thumbnailUrl ?? (attType == "image" ? firstAtt?.fileUrl : nil)
            let convName = forwardedFromConversation?.title ?? forwardedFromConversation?.identifier
            return ForwardReference(
                originalMessageId: fwd.id,
                senderName: senderName,
                senderAvatar: fwdSender.avatar,
                previewText: previewText,
                conversationId: forwardedFromConversationId,
                conversationName: convName,
                attachmentType: attType,
                attachmentThumbnailUrl: attThumb
            )
        }()

        let parsedPinnedAt: Date? = {
            guard let str = pinnedAt else { return nil }
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            return formatter.date(from: str)
        }()

        let status: Message.DeliveryStatus = {
            guard senderId == currentUserId else { return .sent }
            if readByAllAt != nil { return .read }
            if deliveredToAllAt != nil { return .delivered }
            return .sent
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
            forwardedFromId: forwardedFromId,
            forwardedFromConversationId: forwardedFromConversationId,
            isViewOnce: isViewOnce ?? false,
            isBlurred: isBlurred ?? false,
            pinnedAt: parsedPinnedAt,
            pinnedBy: pinnedBy,
            isEncrypted: isEncrypted ?? false,
            encryptionMode: encryptionMode,
            createdAt: createdAt,
            updatedAt: updatedAt ?? createdAt,
            attachments: uiAttachments,
            reactions: uiReactions,
            replyTo: uiReplyTo,
            forwardedFrom: uiForwardedFrom,
            senderName: sender?.displayName ?? sender?.username,
            senderColor: DynamicColorGenerator.colorForName(sender?.username ?? "?"),
            senderAvatarURL: sender?.avatar,
            deliveryStatus: status,
            isMe: senderId == currentUserId
        )
    }
}
