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

public struct APIConversationLastMessage: Decodable {
    public let id: String
    public let content: String?
    public let senderId: String?
    public let createdAt: Date
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
    public let userPreferences: [APIConversationPreferences]?
    public let unreadCount: Int?
    public let updatedAt: Date?
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
        let prefs = userPreferences?.first

        let tags: [MeeshyConversationTag] = (prefs?.tags ?? []).enumerated().map { index, tagName in
            MeeshyConversationTag(name: tagName, color: MeeshyConversationTag.colors[index % MeeshyConversationTag.colors.count])
        }

        return MeeshyConversation(
            id: id, identifier: identifier ?? id, type: convType, title: displayName,
            description: description, avatar: convType != .direct ? avatar : nil,
            banner: banner, communityId: communityId,
            isActive: isActive ?? true,
            memberCount: memberCount ?? members?.count ?? 2,
            lastMessageAt: lastMessageAt ?? lastMessage?.createdAt ?? createdAt,
            createdAt: createdAt, updatedAt: updatedAt ?? createdAt,
            unreadCount: unreadCount ?? 0, lastMessagePreview: lastMessage?.content,
            tags: tags, isAnnouncementChannel: isAnnouncementChannel ?? false,
            isPinned: prefs?.isPinned ?? false,
            isMuted: prefs?.isMuted ?? false,
            participantUserId: otherMember?.userId,
            participantAvatarURL: participantAvatar
        )
    }
}
