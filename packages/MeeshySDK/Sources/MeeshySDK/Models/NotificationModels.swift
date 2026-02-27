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

public enum MeeshyNotificationType: String, Codable, CaseIterable {
    case newMessage = "NEW_MESSAGE"
    case messageReaction = "MESSAGE_REACTION"
    case mention = "MENTION"
    case friendRequest = "FRIEND_REQUEST"
    case friendAccepted = "FRIEND_ACCEPTED"
    case groupInvite = "GROUP_INVITE"
    case groupJoined = "GROUP_JOINED"
    case groupLeft = "GROUP_LEFT"
    case callMissed = "CALL_MISSED"
    case callIncoming = "CALL_INCOMING"
    case postLike = "POST_LIKE"
    case postComment = "POST_COMMENT"
    case storyReply = "STORY_REPLY"
    case affiliateSignup = "AFFILIATE_SIGNUP"
    case achievementUnlocked = "ACHIEVEMENT_UNLOCKED"
    case systemAlert = "SYSTEM_ALERT"
    case statusUpdate = "STATUS_UPDATE"
    case translationReady = "TRANSLATION_READY"

    public var icon: String {
        switch self {
        case .newMessage: return "bubble.left.fill"
        case .messageReaction: return "heart.fill"
        case .mention: return "at"
        case .friendRequest: return "person.badge.plus"
        case .friendAccepted: return "person.2.fill"
        case .groupInvite: return "person.3.fill"
        case .groupJoined: return "person.badge.checkmark"
        case .groupLeft: return "person.badge.minus"
        case .callMissed: return "phone.arrow.down.left"
        case .callIncoming: return "phone.fill"
        case .postLike: return "hand.thumbsup.fill"
        case .postComment: return "text.bubble.fill"
        case .storyReply: return "arrowshape.turn.up.left.fill"
        case .affiliateSignup: return "link.badge.plus"
        case .achievementUnlocked: return "trophy.fill"
        case .systemAlert: return "exclamationmark.triangle.fill"
        case .statusUpdate: return "circle.fill"
        case .translationReady: return "globe"
        }
    }

    public var color: String {
        switch self {
        case .newMessage: return "3498DB"
        case .messageReaction: return "FF6B6B"
        case .mention: return "9B59B6"
        case .friendRequest, .friendAccepted: return "4ECDC4"
        case .groupInvite, .groupJoined, .groupLeft: return "F8B500"
        case .callMissed, .callIncoming: return "E91E63"
        case .postLike: return "FF6B6B"
        case .postComment: return "3498DB"
        case .storyReply: return "9B59B6"
        case .affiliateSignup: return "2ECC71"
        case .achievementUnlocked: return "F8B500"
        case .systemAlert: return "EF4444"
        case .statusUpdate: return "4ECDC4"
        case .translationReady: return "08D9D6"
        }
    }
}

// MARK: - API Notification

public struct APINotification: Decodable, Identifiable {
    public let id: String
    public let userId: String
    public let type: String
    public let senderId: String?
    public let senderName: String?
    public let senderAvatar: String?
    public let title: String?
    public let message: String?
    public let data: NotificationData?
    public let isRead: Bool
    public let readAt: String?
    public let createdAt: String
    public let updatedAt: String?

    public var notificationType: MeeshyNotificationType {
        MeeshyNotificationType(rawValue: type) ?? .systemAlert
    }
}

public struct NotificationData: Decodable {
    public let conversationId: String?
    public let messageId: String?
    public let postId: String?
    public let achievementId: String?
    public let callId: String?
    public let friendRequestId: String?
    public let preview: String?
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
