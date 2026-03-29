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

public enum MeeshyNotificationType: String, Codable, CaseIterable, Sendable {
    // Message events
    case newMessage = "new_message"
    case messageReply = "message_reply"
    case messageEdited = "message_edited"
    case messageDeleted = "message_deleted"
    case messagePinned = "message_pinned"
    case messageForwarded = "message_forwarded"

    // Conversation events
    case newConversation = "new_conversation"
    case addedToConversation = "added_to_conversation"
    case removedFromConversation = "removed_from_conversation"

    // Contact/Friend events
    case contactRequest = "contact_request"
    case contactAccepted = "contact_accepted"
    case friendRequest = "friend_request"
    case friendAccepted = "friend_accepted"

    // Interaction events
    case userMentioned = "user_mentioned"
    case mention = "mention"
    case messageReaction = "message_reaction"
    case reaction = "reaction"
    case reply = "reply"

    // Social/Post events
    case postLike = "post_like"
    case postComment = "post_comment"
    case postRepost = "post_repost"
    case storyReaction = "story_reaction"
    case statusReaction = "status_reaction"
    case commentLike = "comment_like"
    case commentReply = "comment_reply"

    // Call events
    case missedCall = "missed_call"
    case incomingCall = "incoming_call"
    case callEnded = "call_ended"
    case callDeclined = "call_declined"

    // Translation events
    case translationCompleted = "translation_completed"
    case translationReady = "translation_ready"
    case transcriptionCompleted = "transcription_completed"
    case voiceCloneReady = "voice_clone_ready"

    // Security events
    case securityAlert = "security_alert"
    case loginNewDevice = "login_new_device"
    case passwordChanged = "password_changed"
    case twoFactorEnabled = "two_factor_enabled"
    case twoFactorDisabled = "two_factor_disabled"

    // Community events
    case communityInvite = "community_invite"
    case communityJoined = "community_joined"
    case communityLeft = "community_left"

    // Member events
    case memberJoined = "member_joined"
    case memberLeft = "member_left"
    case memberRemoved = "member_removed"
    case memberPromoted = "member_promoted"
    case memberDemoted = "member_demoted"
    case memberRoleChanged = "member_role_changed"

    // System events
    case system = "system"
    case maintenance = "maintenance"
    case updateAvailable = "update_available"

    // Engagement
    case achievementUnlocked = "achievement_unlocked"
    case streakMilestone = "streak_milestone"
    case badgeEarned = "badge_earned"

    // Legacy uppercase (backward compat)
    case legacyNewMessage = "NEW_MESSAGE"
    case legacyMention = "MENTION"
    case legacyMessageReaction = "MESSAGE_REACTION"
    case legacyFriendRequest = "FRIEND_REQUEST"
    case legacyFriendAccepted = "FRIEND_ACCEPTED"
    case legacyGroupInvite = "GROUP_INVITE"
    case legacyGroupJoined = "GROUP_JOINED"
    case legacyGroupLeft = "GROUP_LEFT"
    case legacyCallMissed = "CALL_MISSED"
    case legacyCallIncoming = "CALL_INCOMING"
    case legacyPostLike = "POST_LIKE"
    case legacyPostComment = "POST_COMMENT"
    case legacyStoryReply = "STORY_REPLY"
    case legacyAffiliateSignup = "AFFILIATE_SIGNUP"
    case legacyAchievementUnlocked = "ACHIEVEMENT_UNLOCKED"
    case legacySystemAlert = "SYSTEM_ALERT"
    case legacyStatusUpdate = "STATUS_UPDATE"
    case legacyTranslationReady = "TRANSLATION_READY"

    public var systemIcon: String {
        switch self {
        case .newMessage, .legacyNewMessage, .messageReply: return "bubble.left.fill"
        case .messageReaction, .reaction, .legacyMessageReaction: return "heart.fill"
        case .userMentioned, .mention, .legacyMention: return "at"
        case .friendRequest, .contactRequest, .legacyFriendRequest: return "person.badge.plus"
        case .friendAccepted, .contactAccepted, .legacyFriendAccepted: return "person.2.fill"
        case .communityInvite, .legacyGroupInvite: return "person.3.fill"
        case .communityJoined, .memberJoined, .legacyGroupJoined: return "person.badge.checkmark"
        case .communityLeft, .memberLeft, .legacyGroupLeft: return "person.badge.minus"
        case .missedCall, .callDeclined, .legacyCallMissed: return "phone.arrow.down.left"
        case .incomingCall, .callEnded, .legacyCallIncoming: return "phone.fill"
        case .postLike, .legacyPostLike, .storyReaction, .statusReaction, .commentLike: return "hand.thumbsup.fill"
        case .postComment, .commentReply, .legacyPostComment, .legacyStoryReply: return "text.bubble.fill"
        case .achievementUnlocked, .legacyAchievementUnlocked, .streakMilestone, .badgeEarned: return "trophy.fill"
        case .translationCompleted, .translationReady, .legacyTranslationReady, .transcriptionCompleted: return "globe"
        case .securityAlert, .loginNewDevice, .legacySystemAlert, .passwordChanged, .twoFactorEnabled, .twoFactorDisabled: return "exclamationmark.triangle.fill"
        case .system, .maintenance, .updateAvailable: return "bell.fill"
        case .legacyAffiliateSignup: return "link.badge.plus"
        case .legacyStatusUpdate: return "circle.fill"
        case .voiceCloneReady: return "waveform"
        case .postRepost: return "arrow.2.squarepath"
        case .addedToConversation, .newConversation: return "bubble.left.and.bubble.right.fill"
        case .removedFromConversation: return "person.badge.minus"
        case .memberRemoved: return "person.badge.minus"
        case .memberPromoted: return "star.fill"
        case .memberDemoted: return "arrow.down.circle.fill"
        case .memberRoleChanged: return "person.badge.shield.checkmark"
        case .messageEdited: return "pencil"
        case .messageDeleted: return "trash"
        case .messagePinned: return "pin.fill"
        case .messageForwarded: return "arrowshape.turn.up.right.fill"
        case .reply: return "arrowshape.turn.up.left.fill"
        }
    }

    public var accentHex: String {
        switch self {
        case .newMessage, .legacyNewMessage, .messageReply, .reply, .postComment, .commentReply, .legacyPostComment, .legacyStoryReply:
            return "3498DB"
        case .messageReaction, .reaction, .legacyMessageReaction, .postLike, .legacyPostLike, .storyReaction, .statusReaction, .commentLike:
            return "FF6B6B"
        case .userMentioned, .mention, .legacyMention:
            return "9B59B6"
        case .friendRequest, .contactRequest, .legacyFriendRequest, .friendAccepted, .contactAccepted, .legacyFriendAccepted, .legacyStatusUpdate:
            return "4ECDC4"
        case .communityInvite, .communityJoined, .communityLeft, .memberJoined, .memberLeft, .memberRemoved, .memberPromoted, .memberDemoted, .memberRoleChanged, .legacyGroupInvite, .legacyGroupJoined, .legacyGroupLeft, .achievementUnlocked, .legacyAchievementUnlocked, .streakMilestone, .badgeEarned:
            return "F8B500"
        case .missedCall, .callDeclined, .incomingCall, .callEnded, .legacyCallMissed, .legacyCallIncoming:
            return "E91E63"
        case .legacyAffiliateSignup:
            return "2ECC71"
        case .securityAlert, .loginNewDevice, .legacySystemAlert, .passwordChanged, .twoFactorEnabled, .twoFactorDisabled:
            return "EF4444"
        case .translationCompleted, .translationReady, .legacyTranslationReady, .transcriptionCompleted, .voiceCloneReady:
            return "08D9D6"
        case .system, .maintenance, .updateAvailable:
            return "6366F1"
        case .postRepost:
            return "9B59B6"
        case .addedToConversation, .newConversation, .removedFromConversation:
            return "4ECDC4"
        case .messageEdited, .messageDeleted, .messagePinned, .messageForwarded:
            return "3498DB"
        }
    }
}

// MARK: - Notification Actor (who triggered)

public struct NotificationActor: Codable, Sendable {
    public let id: String
    public let username: String
    public let displayName: String?
    public let avatar: String?

    public var displayedName: String {
        displayName ?? username
    }
}

// MARK: - Notification Context (where it happened)

public struct NotificationContext: Codable, Sendable {
    public let conversationId: String?
    public let conversationTitle: String?
    public let conversationType: String?
    public let messageId: String?
    public let originalMessageId: String?
    public let callSessionId: String?
    public let friendRequestId: String?
    public let reactionId: String?
    public let postId: String?
    public let commentId: String?
}

// MARK: - Notification State

public struct NotificationState: Codable, Sendable {
    public let isRead: Bool
    public let readAt: String?
    public let createdAt: String
    public let expiresAt: String?
}

// MARK: - Notification Delivery

public struct NotificationDelivery: Codable, Sendable {
    public let emailSent: Bool
    public let pushSent: Bool
}

// MARK: - Notification Metadata

public struct NotificationMetadata: Codable, Sendable {
    public let messagePreview: String?
    public let action: String?
    public let reactionEmoji: String?
    public let callType: String?
    public let memberCount: Int?
    public let postId: String?
    public let commentId: String?
    public let commentPreview: String?
    public let emoji: String?

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        messagePreview = try container.decodeIfPresent(String.self, forKey: .messagePreview)
        action = try container.decodeIfPresent(String.self, forKey: .action)
        reactionEmoji = try container.decodeIfPresent(String.self, forKey: .reactionEmoji)
        callType = try container.decodeIfPresent(String.self, forKey: .callType)
        memberCount = try container.decodeIfPresent(Int.self, forKey: .memberCount)
        postId = try container.decodeIfPresent(String.self, forKey: .postId)
        commentId = try container.decodeIfPresent(String.self, forKey: .commentId)
        commentPreview = try container.decodeIfPresent(String.self, forKey: .commentPreview)
        emoji = try container.decodeIfPresent(String.self, forKey: .emoji)
    }

    private enum CodingKeys: String, CodingKey {
        case messagePreview, action, reactionEmoji, callType, memberCount
        case postId, commentId, commentPreview, emoji
    }
}

// MARK: - API Notification (matches gateway NotificationFormatter output)

public struct APINotification: Codable, Identifiable, Sendable, CacheIdentifiable {
    public let id: String
    public let userId: String
    public let type: String
    public let priority: String?
    public let content: String?
    public let actor: NotificationActor?
    public let context: NotificationContext?
    public let metadata: NotificationMetadata?
    public let state: NotificationState
    public let delivery: NotificationDelivery?

    public var notificationType: MeeshyNotificationType {
        MeeshyNotificationType(rawValue: type) ?? .system
    }

    public var isRead: Bool { state.isRead }
    public var readAt: String? { state.readAt }
    public var createdAt: String { state.createdAt }

    public var senderId: String? { actor?.id }
    public var senderName: String? { actor?.displayName ?? actor?.username }
    public var senderAvatar: String? { actor?.avatar }

    public var message: String? { content ?? metadata?.messagePreview }

    public var data: NotificationData? {
        guard let context else { return nil }
        return NotificationData(
            conversationId: context.conversationId,
            messageId: context.messageId,
            postId: context.postId,
            achievementId: nil,
            callId: context.callSessionId,
            friendRequestId: context.friendRequestId,
            preview: metadata?.messagePreview
        )
    }

    // MARK: - Formatted title for display

    public var formattedTitle: String {
        let actorName = actor?.displayedName ?? "Quelqu'un"
        let conversationTitle = context?.conversationTitle ?? "la conversation"

        switch notificationType {
        case .newMessage, .legacyNewMessage:
            return "Message de \(actorName)"
        case .messageReply, .reply, .legacyStoryReply:
            return "Reponse de \(actorName)"
        case .messageReaction, .reaction, .legacyMessageReaction:
            let emoji = metadata?.reactionEmoji ?? metadata?.emoji ?? content ?? "heart.fill"
            return "\(actorName) a reagi \(emoji) a votre message"
        case .userMentioned, .mention, .legacyMention:
            return "\(actorName) vous a mentionne"
        case .friendRequest, .contactRequest, .legacyFriendRequest:
            return "\(actorName) veut se connecter"
        case .friendAccepted, .contactAccepted, .legacyFriendAccepted:
            return "\(actorName) a accepte votre invitation"
        case .addedToConversation, .newConversation:
            return "Invitation a \(conversationTitle)"
        case .removedFromConversation:
            return "Retire de \(conversationTitle)"
        case .communityInvite, .legacyGroupInvite:
            return "Invitation a \(conversationTitle)"
        case .communityJoined, .memberJoined, .legacyGroupJoined:
            return "\(actorName) a rejoint \(conversationTitle)"
        case .communityLeft, .memberLeft, .legacyGroupLeft:
            return "\(actorName) a quitte \(conversationTitle)"
        case .memberRemoved:
            return "\(actorName) a ete retire de \(conversationTitle)"
        case .memberPromoted:
            return "\(actorName) a ete promu"
        case .memberDemoted:
            return "\(actorName) a ete retrogade"
        case .memberRoleChanged:
            return "Role modifie pour \(actorName)"
        case .missedCall, .callDeclined, .legacyCallMissed:
            return "Appel manque de \(actorName)"
        case .incomingCall, .callEnded, .legacyCallIncoming:
            return "Appel de \(actorName)"
        case .postLike, .legacyPostLike, .storyReaction, .statusReaction, .commentLike:
            return "\(actorName) a aime votre publication"
        case .postComment, .commentReply, .legacyPostComment:
            return "\(actorName) a commente votre publication"
        case .postRepost:
            return "\(actorName) a repartage votre publication"
        case .translationCompleted, .translationReady, .legacyTranslationReady, .transcriptionCompleted:
            return "Traduction disponible"
        case .voiceCloneReady:
            return "Clone vocal pret"
        case .achievementUnlocked, .legacyAchievementUnlocked, .streakMilestone, .badgeEarned:
            return "Nouveau badge debloque !"
        case .securityAlert, .legacySystemAlert:
            return "Alerte de securite"
        case .loginNewDevice:
            return "Connexion depuis un nouvel appareil"
        case .passwordChanged:
            return "Mot de passe modifie"
        case .twoFactorEnabled:
            return "Verification en 2 etapes activee"
        case .twoFactorDisabled:
            return "Verification en 2 etapes desactivee"
        case .legacyAffiliateSignup:
            return "Inscription via votre lien"
        case .legacyStatusUpdate:
            return "Mise a jour de statut"
        case .messageEdited:
            return "Message modifie"
        case .messageDeleted:
            return "Message supprime"
        case .messagePinned:
            return "Message epingle"
        case .messageForwarded:
            return "Message transfere"
        case .system, .maintenance, .updateAvailable:
            return content ?? "Notification systeme"
        }
    }

    // MARK: - Body content (below title)

    public var formattedBody: String? {
        switch notificationType {
        case .messageReaction, .reaction, .legacyMessageReaction:
            return metadata?.messagePreview
        case .newMessage, .legacyNewMessage, .messageReply, .userMentioned, .mention, .legacyMention, .reply, .legacyStoryReply:
            return content?.isEmpty == false ? content : metadata?.messagePreview
        case .postComment, .commentReply, .legacyPostComment:
            return metadata?.commentPreview
        default:
            return nil
        }
    }
}

// MARK: - Legacy NotificationData (computed from context)

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
