import Foundation

// MARK: - Device Token Registration

public struct RegisterDeviceTokenRequest: Encodable {
    public let token: String
    public let platform: String
    public let type: String

    public init(token: String, platform: String = "ios", type: String = "apns") {
        self.token = token; self.platform = platform; self.type = type
    }
}

public struct UnregisterDeviceTokenRequest: Encodable {
    public let token: String

    public init(token: String) {
        self.token = token
    }
}

public struct RegisterDeviceTokenResponse: Decodable {
    public let id: String?
    public let type: String?
    public let platform: String?
    public let deviceName: String?
    public let isNew: Bool?
    public let message: String?
}

// MARK: - Notification Preferences

public struct NotificationPreferences: Codable {
    public var pushEnabled: Bool
    public var messageNotifications: Bool
    public var socialNotifications: Bool
    public var soundEnabled: Bool

    public init(pushEnabled: Bool = true, messageNotifications: Bool = true,
                socialNotifications: Bool = true, soundEnabled: Bool = true) {
        self.pushEnabled = pushEnabled; self.messageNotifications = messageNotifications
        self.socialNotifications = socialNotifications; self.soundEnabled = soundEnabled
    }
}

// MARK: - Notification Type
// Raw values match backend lowercase strings exactly

public enum MeeshyNotificationType: String, Codable, CaseIterable {
    case newMessage = "new_message"
    case message = "message"
    case messageReply = "message_reply"
    case messageReaction = "message_reaction"
    case reaction = "reaction"
    case mention = "user_mentioned"
    case mentionAlias = "mention"
    case friendRequest = "friend_request"
    case contactRequest = "contact_request"
    case friendAccepted = "friend_accepted"
    case contactAccepted = "contact_accepted"
    case newConversationDirect = "new_conversation_direct"
    case newConversationGroup = "new_conversation_group"
    case newConversation = "new_conversation"
    case memberJoined = "member_joined"
    case missedCall = "missed_call"
    case system = "system"

    public var systemIcon: String {
        switch self {
        case .newMessage, .message, .messageReply:
            return "bubble.left.fill"
        case .messageReaction, .reaction:
            return "heart.fill"
        case .mention, .mentionAlias:
            return "at"
        case .friendRequest, .contactRequest:
            return "person.badge.plus"
        case .friendAccepted, .contactAccepted:
            return "person.2.fill"
        case .newConversationDirect:
            return "bubble.left.and.bubble.right.fill"
        case .newConversationGroup, .newConversation:
            return "person.3.fill"
        case .memberJoined:
            return "person.badge.checkmark"
        case .missedCall:
            return "phone.arrow.down.left"
        case .system:
            return "bell.fill"
        }
    }

    public var accentHex: String {
        switch self {
        case .newMessage, .message, .messageReply:
            return "6366F1"
        case .messageReaction, .reaction:
            return "F87171"
        case .mention, .mentionAlias:
            return "FBBF24"
        case .friendRequest, .contactRequest, .friendAccepted, .contactAccepted:
            return "34D399"
        case .newConversationDirect, .newConversationGroup, .newConversation:
            return "818CF8"
        case .memberJoined:
            return "60A5FA"
        case .missedCall:
            return "F87171"
        case .system:
            return "A5B4FC"
        }
    }
}

// MARK: - API Notification (matches backend grouped structure)

public struct APINotificationActor: Decodable {
    public let id: String?
    public let username: String?
    public let displayName: String?
    public let avatar: String?

    public var displayedName: String {
        displayName ?? username ?? "Utilisateur"
    }
}

public struct APINotificationContext: Decodable {
    public let conversationId: String?
    public let conversationTitle: String?
    public let conversationType: String?
    public let messageId: String?
    public let postId: String?
}

public struct APINotificationState: Decodable {
    public let isRead: Bool
    public let readAt: String?
    public let createdAt: String
}

public struct APINotificationMetadata: Decodable {
    public let reactionEmoji: String?
    public let messageContent: String?
    public let callType: String?
    public let action: String?
}

public struct APINotification: Decodable, Identifiable {
    public let id: String
    public let userId: String
    public let type: String
    public let priority: String?
    public let content: String?
    public let actor: APINotificationActor?
    public let context: APINotificationContext?
    public let state: APINotificationState
    public let metadata: APINotificationMetadata?

    public var notificationType: MeeshyNotificationType {
        MeeshyNotificationType(rawValue: type) ?? .system
    }

    public var isRead: Bool { state.isRead }
    public var createdAt: String { state.createdAt }

    // MARK: - Formatted title for display

    public var formattedTitle: String {
        let actorName = actor?.displayedName ?? "Quelqu'un"
        let conversationTitle = context?.conversationTitle ?? "la conversation"

        switch notificationType {
        case .newMessage, .message:
            return "Message de \(actorName)"
        case .messageReply:
            return "Réponse de \(actorName)"
        case .messageReaction, .reaction:
            let emoji = metadata?.reactionEmoji ?? content ?? "❤️"
            return "\(actorName) a réagit \(emoji) à votre message"
        case .mention, .mentionAlias:
            return "\(actorName) vous a mentionné"
        case .friendRequest, .contactRequest:
            return "\(actorName) veut se connecter"
        case .friendAccepted, .contactAccepted:
            return "\(actorName) a accepté votre invitation"
        case .newConversationDirect:
            return "Nouvelle conversation avec \(actorName)"
        case .newConversationGroup, .newConversation:
            return "Invitation à « \(conversationTitle) »"
        case .memberJoined:
            return "Nouveau membre dans « \(conversationTitle) »"
        case .missedCall:
            return "Appel manqué de \(actorName)"
        case .system:
            return content ?? "Notification système"
        }
    }

    // MARK: - Body content (below title)

    public var formattedBody: String? {
        switch notificationType {
        case .messageReaction, .reaction:
            return metadata?.messageContent
        case .newMessage, .message, .messageReply, .mention, .mentionAlias:
            return content?.isEmpty == false ? content : nil
        default:
            return nil
        }
    }
}

// MARK: - Notification Response

public struct NotificationListResponse: Decodable {
    public let success: Bool
    public let data: [APINotification]
    public let pagination: NotificationPagination?
    public let unreadCount: Int?
}

public struct NotificationPagination: Decodable {
    public let total: Int
    public let offset: Int
    public let limit: Int
    public let hasMore: Bool
}

public struct UnreadCountResponse: Decodable {
    public let success: Bool
    public let count: Int
}

public struct MarkReadResponse: Decodable {
    public let success: Bool
    public let count: Int?
}
