import Foundation

// MARK: - API Conversation Models

public struct APIConversationUser: Decodable {
    public let id: String
    public let username: String
    public let displayName: String?
    public let firstName: String?
    public let lastName: String?
    public let avatar: String?
    public let avatarUrl: String?
    public let isOnline: Bool?
    public let lastActiveAt: Date?

    public var name: String { displayName ?? username }
    public var resolvedAvatar: String? { avatar ?? avatarUrl }
}

public struct APIMessageCount: Decodable {
    public let attachments: Int?
}

public struct APIConversationLastMessage: Decodable {
    public let id: String
    public let content: String?
    public let senderId: String?
    public let createdAt: Date
    public let messageType: String?
    public let sender: APIConversationUser?
    public let attachments: [APIMessageAttachment]?
    public let _count: APIMessageCount?
    public let isBlurred: Bool?
    public let isViewOnce: Bool?
    public let expiresAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, content, senderId, createdAt, messageType, sender, attachments
        case _count
        case isBlurred, isViewOnce, expiresAt
    }
}

public struct APIConversationMember: Decodable {
    public let userId: String
    public let role: String?
    public let user: APIConversationUser?
}

public struct APIConversationPreferences: Decodable {
    public let isPinned: Bool?
    public let isMuted: Bool?
    public let isArchived: Bool?
    public let isDeletedForUser: Bool?
    public let tags: [String]?
    public let categoryId: String?
}

public struct APIConversation: Decodable {
    public let id: String
    public let type: String
    public let identifier: String?
    public let title: String?
    public let description: String?
    public let avatar: String?
    public let banner: String?
    public let communityId: String?
    public let isActive: Bool?
    public let memberCount: Int?
    public let isAnnouncementChannel: Bool?
    public let lastMessageAt: Date?
    public let members: [APIConversationMember]?
    public let lastMessage: APIConversationLastMessage?
    public let recentMessages: [APIConversationLastMessage]?
    public let userPreferences: [APIConversationPreferences]?
    public let unreadCount: Int?
    public let updatedAt: Date?
    public let encryptionMode: String?
    public let createdAt: Date
}

extension APIConversation {
    public func toConversation(currentUserId: String) -> MeeshyConversation {
        let otherMember = members?.first { $0.userId != currentUserId }
        let otherUser = otherMember?.user

        let convType: MeeshyConversation.ConversationType = {
            switch type.lowercased() {
            case "direct", "dm": return .direct
            case "group": return .group
            case "community": return .community
            case "channel": return .channel
            case "public": return .public
            case "global": return .global
            case "bot": return .bot
            default: return .direct
            }
        }()

        let displayName: String = {
            if convType == .direct, let user = otherUser { return user.name }
            if let t = title, !t.isEmpty { return t }
            return "Conversation"
        }()

        let participantAvatar: String? = otherUser?.resolvedAvatar
        let currentRole = members?.first(where: { $0.userId == currentUserId })?.role
        let prefs = userPreferences?.first

        let tags: [MeeshyConversationTag] = (prefs?.tags ?? []).enumerated().map { index, tagName in
            MeeshyConversationTag(name: tagName, color: MeeshyConversationTag.colors[index % MeeshyConversationTag.colors.count])
        }

        let lastMsgAttachments: [MeeshyMessageAttachment] = (lastMessage?.attachments ?? []).map { apiAtt in
            MeeshyMessageAttachment(
                id: apiAtt.id,
                originalName: apiAtt.originalName ?? "",
                mimeType: apiAtt.mimeType ?? "application/octet-stream",
                fileSize: apiAtt.fileSize ?? 0,
                fileUrl: apiAtt.fileUrl ?? "",
                width: apiAtt.width,
                height: apiAtt.height,
                thumbnailUrl: apiAtt.thumbnailUrl,
                duration: apiAtt.duration
            )
        }
        let lastMsgAttCount = lastMessage?._count?.attachments ?? lastMsgAttachments.count
        let lastMsgSenderName = lastMessage?.sender?.name

        let recentPreviews: [RecentMessagePreview] = (recentMessages ?? []).map { msg in
            let sName = msg.sender?.name ?? "?"
            let attMime = msg.attachments?.first?.mimeType
            let attCount = msg._count?.attachments ?? msg.attachments?.count ?? 0
            return RecentMessagePreview(
                id: msg.id,
                content: msg.content ?? "",
                senderName: sName,
                messageType: msg.messageType ?? "text",
                createdAt: msg.createdAt,
                attachmentMimeType: attMime,
                attachmentCount: attCount
            )
        }

        return MeeshyConversation(
            id: id, identifier: identifier ?? id, type: convType, title: displayName,
            description: description, avatar: convType != .direct ? avatar : nil,
            banner: banner, communityId: communityId,
            isActive: isActive ?? true,
            memberCount: memberCount ?? members?.count ?? 2,
            lastMessageAt: lastMessageAt ?? lastMessage?.createdAt ?? createdAt,
            encryptionMode: encryptionMode ?? (convType == .direct ? "e2ee" : nil),
            createdAt: createdAt, updatedAt: updatedAt ?? createdAt,
            unreadCount: unreadCount ?? 0, lastMessagePreview: lastMessage?.content,
            lastMessageAttachments: lastMsgAttachments,
            lastMessageAttachmentCount: lastMsgAttCount,
            lastMessageId: lastMessage?.id,
            lastMessageSenderName: lastMsgSenderName,
            lastMessageIsBlurred: lastMessage?.isBlurred ?? false,
            lastMessageIsViewOnce: lastMessage?.isViewOnce ?? false,
            lastMessageExpiresAt: lastMessage?.expiresAt,
            recentMessages: recentPreviews,
            tags: tags, isAnnouncementChannel: isAnnouncementChannel ?? false,
            isPinned: prefs?.isPinned ?? false,
            sectionId: prefs?.categoryId,
            isMuted: prefs?.isMuted ?? false,
            participantUserId: otherMember?.userId,
            participantAvatarURL: participantAvatar,
            currentUserRole: currentRole
        )
    }
}
