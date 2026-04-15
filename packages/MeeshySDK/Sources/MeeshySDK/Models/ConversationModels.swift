import Foundation

// MARK: - API Conversation Models

public struct APIConversationUserNested: Decodable, Sendable {
    public let id: String?
    public let username: String?
    public let displayName: String?
    public let firstName: String?
    public let lastName: String?
    public let avatar: String?
    public let isOnline: Bool?
    public let lastActiveAt: Date?
}

public struct APIConversationUser: Decodable, Sendable {
    public let id: String
    public let userId: String?
    public let username: String?
    public let displayName: String?
    public let firstName: String?
    public let lastName: String?
    public let avatar: String?
    public let isOnline: Bool?
    public let lastActiveAt: Date?
    public let type: String?
    public let user: APIConversationUserNested?

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

public struct APIMessageCount: Decodable, Sendable {
    public let attachments: Int?
}

public struct APIConversationLastMessage: Decodable, Sendable {
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

@available(*, deprecated, renamed: "APIParticipant")
public typealias APIConversationMember = APIParticipant

public struct APIConversationPreferences: Decodable, Sendable {
    public let isPinned: Bool?
    public let isMuted: Bool?
    public let isArchived: Bool?
    public let deletedForUserAt: Date?
    public let tags: [String]?
    public let categoryId: String?
    public let reaction: String?
    public let customName: String?
    public let mentionsOnly: Bool?
}

public struct APIConversation: Decodable, Sendable {
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
    public let defaultWriteRole: String?
    public let slowModeSeconds: Int?
    public let autoTranslateEnabled: Bool?
    public let lastMessageAt: Date?
    public let participants: [APIParticipant]?
    public let lastMessage: APIConversationLastMessage?
    public let recentMessages: [APIConversationLastMessage]?
    public let userPreferences: [APIConversationPreferences]?
    public let unreadCount: Int?
    public let updatedAt: Date?
    public let encryptionMode: String?
    public let currentUserRole: String?
    public let currentUserJoinedAt: Date?
    public let createdAt: Date
    public let closedAt: Date?
    public let closedBy: String?

    public init(
        id: String, type: String, identifier: String? = nil, title: String? = nil,
        description: String? = nil, avatar: String? = nil, banner: String? = nil,
        communityId: String? = nil, isActive: Bool? = nil, memberCount: Int? = nil,
        isAnnouncementChannel: Bool? = nil, defaultWriteRole: String? = nil,
        slowModeSeconds: Int? = nil, autoTranslateEnabled: Bool? = nil,
        lastMessageAt: Date? = nil, participants: [APIParticipant]? = nil,
        lastMessage: APIConversationLastMessage? = nil, recentMessages: [APIConversationLastMessage]? = nil,
        userPreferences: [APIConversationPreferences]? = nil, unreadCount: Int? = nil,
        updatedAt: Date? = nil, encryptionMode: String? = nil,
        currentUserRole: String? = nil, currentUserJoinedAt: Date? = nil,
        createdAt: Date,
        closedAt: Date? = nil, closedBy: String? = nil
    ) {
        self.id = id; self.type = type; self.identifier = identifier; self.title = title
        self.description = description; self.avatar = avatar; self.banner = banner
        self.communityId = communityId; self.isActive = isActive; self.memberCount = memberCount
        self.isAnnouncementChannel = isAnnouncementChannel; self.defaultWriteRole = defaultWriteRole
        self.slowModeSeconds = slowModeSeconds; self.autoTranslateEnabled = autoTranslateEnabled
        self.lastMessageAt = lastMessageAt; self.participants = participants
        self.lastMessage = lastMessage; self.recentMessages = recentMessages
        self.userPreferences = userPreferences; self.unreadCount = unreadCount
        self.updatedAt = updatedAt; self.encryptionMode = encryptionMode
        self.currentUserRole = currentUserRole; self.currentUserJoinedAt = currentUserJoinedAt
        self.createdAt = createdAt
        self.closedAt = closedAt; self.closedBy = closedBy
    }
}

// MARK: - Update Conversation Response (PUT — lighter than full APIConversation)

public struct UpdateConversationResponse: Decodable, Sendable {
    public let id: String
    public let type: String
    public let identifier: String?
    public let title: String?
    public let description: String?
    public let avatar: String?
    public let banner: String?
    public let communityId: String?
    public let isActive: Bool?
    public let isAnnouncementChannel: Bool?
    public let defaultWriteRole: String?
    public let slowModeSeconds: Int?
    public let autoTranslateEnabled: Bool?
    public let updatedAt: Date?
    public let createdAt: Date

    public func toAPIConversation() -> APIConversation {
        APIConversation(
            id: id, type: type, identifier: identifier, title: title,
            description: description, avatar: avatar, banner: banner,
            communityId: communityId, isActive: isActive,
            memberCount: nil, isAnnouncementChannel: isAnnouncementChannel,
            defaultWriteRole: defaultWriteRole, slowModeSeconds: slowModeSeconds,
            autoTranslateEnabled: autoTranslateEnabled, lastMessageAt: nil,
            participants: nil, lastMessage: nil, recentMessages: nil,
            userPreferences: nil, unreadCount: nil, updatedAt: updatedAt,
            encryptionMode: nil, currentUserRole: nil, currentUserJoinedAt: nil,
            createdAt: createdAt, closedAt: nil, closedBy: nil
        )
    }
}

extension APIConversation {
    public func toConversation(currentUserId: String) -> MeeshyConversation {
        let otherParticipant = participants?.first { $0.userId != currentUserId }
        let otherUser = otherParticipant?.user

        let convType: MeeshyConversation.ConversationType = {
            switch type.lowercased() {
            case "direct", "dm": return .direct
            case "group": return .group
            case "community": return .community
            case "channel": return .channel
            case "public": return .public
            case "global": return .global
            case "bot": return .bot
            case "broadcast": return .broadcast
            default: return .direct
            }
        }()

        let displayName: String = {
            if convType == .direct {
                if let participant = otherParticipant {
                    return participant.user?.name ?? participant.name
                }
                if let sender = lastMessage?.sender,
                   (sender.resolvedUserId ?? sender.id) != currentUserId {
                    return sender.name
                }
            }
            if let t = title, !t.isEmpty { return t }
            return "Conversation"
        }()

        let participantAvatar: String? = otherParticipant?.resolvedAvatar ?? otherUser?.resolvedAvatar
        let participantUsername: String? = otherUser?.username ?? otherParticipant?.user?.username
        let currentRole = currentUserRole ?? participants?.first(where: { $0.userId == currentUserId })?.role
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
            memberCount: memberCount ?? participants?.count ?? 2,
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
            defaultWriteRole: defaultWriteRole,
            slowModeSeconds: slowModeSeconds,
            autoTranslateEnabled: autoTranslateEnabled,
            isPinned: prefs?.isPinned ?? false,
            sectionId: prefs?.categoryId,
            isMuted: prefs?.isMuted ?? false,
            participantUserId: otherParticipant?.userId,
            participantUsername: participantUsername,
            participantAvatarURL: participantAvatar,
            closedAt: closedAt,
            closedBy: closedBy,
            currentUserRole: currentRole,
            currentUserJoinedAt: currentUserJoinedAt,
            reaction: prefs?.reaction
        )
    }
}
