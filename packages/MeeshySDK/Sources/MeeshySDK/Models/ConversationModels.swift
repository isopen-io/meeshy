import Foundation

// MARK: - API Conversation Models

public struct APIConversationUser: Decodable {
    public let id: String
    public let username: String
    public let displayName: String?
    public let avatar: String?
    public let isOnline: Bool?
    public let lastActiveAt: Date?

    public var name: String { displayName ?? username }
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

public struct APIConversation: Decodable {
    public let id: String
    public let type: String
    public let name: String?
    public let description: String?
    public let avatar: String?
    public let isActive: Bool?
    public let memberCount: Int?
    public let members: [APIConversationMember]?
    public let lastMessage: APIConversationLastMessage?
    public let updatedAt: Date?
    public let createdAt: Date
}

extension APIConversation {
    public func toConversation(currentUserId: String) -> Conversation {
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
            if convType == .direct, let user = otherUser { return user.name }
            if let n = name, !n.isEmpty { return n }
            return "Conversation"
        }()

        let participantAvatar: String? = otherUser?.avatar

        return Conversation(
            id: id, identifier: id, type: convType, title: displayName,
            description: description, avatar: convType != .direct ? avatar : nil,
            isActive: isActive ?? true,
            memberCount: memberCount ?? members?.count ?? 2,
            lastMessageAt: updatedAt ?? lastMessage?.createdAt ?? createdAt,
            createdAt: createdAt, updatedAt: updatedAt ?? createdAt,
            unreadCount: 0, lastMessagePreview: lastMessage?.content,
            participantUserId: otherMember?.userId,
            participantAvatarURL: participantAvatar
        )
    }
}
