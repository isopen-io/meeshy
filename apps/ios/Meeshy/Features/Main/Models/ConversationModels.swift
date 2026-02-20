import Foundation

// MARK: - API Conversation Models

struct APIConversationUser: Decodable {
    let id: String
    let username: String
    let displayName: String?
    let firstName: String?
    let lastName: String?
    let avatar: String?
    let avatarUrl: String?
    let isOnline: Bool?
    let lastActiveAt: Date?

    var name: String { displayName ?? username }
}

struct APIConversationLastMessage: Decodable {
    let id: String
    let content: String?
    let senderId: String?
    let createdAt: Date
}

struct APIConversationMember: Decodable {
    let userId: String
    let role: String?
    let user: APIConversationUser?
}

struct APIConversationPreferences: Decodable {
    let isPinned: Bool?
    let isMuted: Bool?
    let isArchived: Bool?
    let isDeletedForUser: Bool?
}

struct APIConversation: Decodable {
    let id: String
    let type: String
    let title: String?           // API returns "title" (not "name")
    let identifier: String?
    let avatar: String?
    let banner: String?
    let isActive: Bool?
    let communityId: String?
    let members: [APIConversationMember]?
    let lastMessage: APIConversationLastMessage?
    let lastMessageAt: Date?
    let unreadCount: Int?
    let userPreferences: [APIConversationPreferences]?
    let createdAt: Date
}

// MARK: - API -> Conversation Conversion

extension APIConversation {
    func toConversation(currentUserId: String) -> Conversation {
        // Determine other participant for DM
        let otherMember = members?.first { $0.userId != currentUserId }
        let otherUser = otherMember?.user

        let convType: Conversation.ConversationType = {
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

        // Title resolution: API title > other user name (DM) > fallback
        let displayName: String = {
            if let t = title, !t.isEmpty { return t }
            if convType == .direct, let user = otherUser { return user.name }
            return "Conversation"
        }()

        // Resolve avatar URL: for DMs use other user's avatar, for groups use conversation avatar
        let participantAvatar: String? = otherUser?.avatar ?? otherUser?.avatarUrl

        // Extract user preferences (first element if present)
        let prefs = userPreferences?.first

        return Conversation(
            id: id,
            identifier: identifier ?? id,
            type: convType,
            title: displayName,
            avatar: convType != .direct ? avatar : nil,
            banner: banner,
            communityId: communityId,
            isActive: isActive ?? true,
            memberCount: members?.count ?? 2,
            lastMessageAt: lastMessageAt ?? lastMessage?.createdAt ?? createdAt,
            createdAt: createdAt,
            updatedAt: lastMessageAt ?? createdAt,
            unreadCount: unreadCount ?? 0,
            lastMessagePreview: lastMessage?.content,
            isPinned: prefs?.isPinned ?? false,
            isMuted: prefs?.isMuted ?? false,
            participantUserId: otherMember?.userId,
            participantAvatarURL: participantAvatar
        )
    }
}
