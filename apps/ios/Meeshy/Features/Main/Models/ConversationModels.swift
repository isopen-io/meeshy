import Foundation
import MeeshySDK

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
    let tags: [String]?
    let categoryId: String?
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
    let memberCount: Int?
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

        // Title resolution: DM → other user name first; non-DM → API title
        let displayName: String = {
            if convType == .direct, let user = otherUser { return user.name }
            if let t = title, !t.isEmpty { return t }
            return "Conversation"
        }()

        // Resolve avatar URL: for DMs use other user's avatar, for groups use conversation avatar
        let participantAvatar: String? = otherUser?.avatar ?? otherUser?.avatarUrl

        // Extract user preferences (first element if present)
        let prefs = userPreferences?.first

        // Map string tags to ConversationTag with auto-assigned colors
        let convTags: [ConversationTag] = (prefs?.tags ?? []).enumerated().map { index, tagName in
            let color = ConversationTag.colors[index % ConversationTag.colors.count]
            return ConversationTag(name: tagName, color: color)
        }

        return Conversation(
            id: id,
            identifier: identifier ?? id,
            type: convType,
            title: displayName,
            avatar: convType != .direct ? avatar : nil,
            banner: banner,
            communityId: communityId,
            isActive: isActive ?? true,
            memberCount: memberCount ?? members?.count ?? 2,
            lastMessageAt: lastMessageAt ?? lastMessage?.createdAt ?? createdAt,
            createdAt: createdAt,
            updatedAt: lastMessageAt ?? createdAt,
            unreadCount: unreadCount ?? 0,
            lastMessagePreview: lastMessage?.content,
            tags: convTags,
            isPinned: prefs?.isPinned ?? false,
            sectionId: prefs?.categoryId,
            isMuted: prefs?.isMuted ?? false,
            participantUserId: otherMember?.userId,
            participantAvatarURL: participantAvatar
        )
    }
}
