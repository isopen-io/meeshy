import Foundation

// MARK: - API Conversation Models

struct APIConversationUser: Decodable {
    let id: String
    let username: String
    let displayName: String?
    let avatar: String?
    let avatarUrl: String?

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

struct APIConversation: Decodable {
    let id: String
    let type: String
    let name: String?
    let description: String?
    let avatar: String?
    let isActive: Bool?
    let memberCount: Int?
    let members: [APIConversationMember]?
    let lastMessage: APIConversationLastMessage?
    let updatedAt: Date?
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

        let displayName: String = {
            if let n = name, !n.isEmpty { return n }
            if convType == .direct, let user = otherUser { return user.name }
            return "Conversation"
        }()

        // Resolve avatar URL: for DMs use other user's avatar, for groups use conversation avatar
        let participantAvatar: String? = otherUser?.avatar ?? otherUser?.avatarUrl

        return Conversation(
            id: id,
            identifier: id,
            type: convType,
            title: displayName,
            description: description,
            avatar: convType != .direct ? avatar : nil,
            isActive: isActive ?? true,
            memberCount: memberCount ?? members?.count ?? 2,
            lastMessageAt: updatedAt ?? lastMessage?.createdAt ?? createdAt,
            createdAt: createdAt,
            updatedAt: updatedAt ?? createdAt,
            unreadCount: 0,
            lastMessagePreview: lastMessage?.content,
            participantUserId: otherMember?.userId,
            participantAvatarURL: participantAvatar
        )
    }
}
