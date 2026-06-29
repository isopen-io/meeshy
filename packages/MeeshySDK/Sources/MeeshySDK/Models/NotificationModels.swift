import Foundation

// MARK: - Device Token Registration

public struct RegisterDeviceTokenRequest: Encodable {
    public let token: String
    public let platform: String
    public let type: String
    /// "development" for sandbox APNs (debug builds), "production" for App Store/TestFlight.
    /// Optional — gateway defaults to "production" when omitted.
    public let apnsEnvironment: String?

    public init(
        token: String,
        platform: String = "ios",
        type: String = "apns",
        apnsEnvironment: String? = nil
    ) {
        self.token = token
        self.platform = platform
        self.type = type
        self.apnsEnvironment = apnsEnvironment
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
    /// First-message notification for a freshly created **direct** conversation.
    /// Emitted by `gateway/.../NotificationService.createConversationInviteNotification`
    /// when `conversationType == "direct"`. Distinct from `.newConversation` so
    /// the iOS UI can choose a DM-specific icon / avatar treatment, but the
    /// navigation target is identical: open the conversation by `conversationId`.
    case newConversationDirect = "new_conversation_direct"
    /// Same as `.newConversationDirect` but for a freshly created **group**
    /// conversation (`conversationType == "group"`).
    case newConversationGroup = "new_conversation_group"
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
    case commentReaction = "comment_reaction"
    case storyNewComment = "story_new_comment"
    case friendStoryComment = "friend_story_comment"
    case storyThreadReply = "story_thread_reply"
    // Friend content events (Phase 4F) — fired when a friend publishes new content
    case friendNewStory = "friend_new_story"
    case friendNewPost = "friend_new_post"
    case friendNewMood = "friend_new_mood"

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
        case .commentReaction: return "heart.fill"
        case .postComment, .commentReply, .legacyPostComment, .legacyStoryReply: return "text.bubble.fill"
        case .storyNewComment, .friendStoryComment, .storyThreadReply: return "text.bubble.fill"
        case .friendNewStory: return "camera.fill"
        case .friendNewPost: return "square.text.square.fill"
        case .friendNewMood: return "face.smiling.fill"
        case .achievementUnlocked, .legacyAchievementUnlocked, .streakMilestone, .badgeEarned: return "trophy.fill"
        case .translationCompleted, .translationReady, .legacyTranslationReady, .transcriptionCompleted: return "globe"
        case .securityAlert, .loginNewDevice, .legacySystemAlert, .passwordChanged, .twoFactorEnabled, .twoFactorDisabled: return "exclamationmark.triangle.fill"
        case .system, .maintenance, .updateAvailable: return "bell.fill"
        case .legacyAffiliateSignup: return "link.badge.plus"
        case .legacyStatusUpdate: return "circle.fill"
        case .voiceCloneReady: return "waveform"
        case .postRepost: return "arrow.2.squarepath"
        case .addedToConversation, .newConversation, .newConversationDirect, .newConversationGroup: return "bubble.left.and.bubble.right.fill"
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
        case .newMessage, .legacyNewMessage, .messageReply, .reply, .postComment, .commentReply, .legacyPostComment, .legacyStoryReply, .storyNewComment, .friendStoryComment, .storyThreadReply:
            return "3498DB"
        case .messageReaction, .reaction, .legacyMessageReaction, .postLike, .legacyPostLike, .storyReaction, .statusReaction, .commentLike, .commentReaction:
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
        case .friendNewStory, .friendNewPost, .friendNewMood:
            return "6366F1"
        case .postRepost:
            return "9B59B6"
        case .addedToConversation, .newConversation, .newConversationDirect, .newConversationGroup, .removedFromConversation:
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
    /// Avatar de la conversation/groupe — repli pour la toast quand l'expéditeur
    /// n'a pas d'avatar personnel (messages de groupe).
    public let conversationAvatar: String?
    public let messageId: String?
    public let originalMessageId: String?
    public let callSessionId: String?
    public let friendRequestId: String?
    public let reactionId: String?
    public let postId: String?
    public let commentId: String?
    /// Identifiant du commentaire parent quand `commentId` est une réponse.
    /// Permet de déplier le fil parent puis de défiler jusqu'à la réponse ciblée.
    public let parentCommentId: String?
    /// URL publique du 1er attachment du message (image/audio/vidéo).
    public let firstAttachmentUrl: String?
    /// MIME type du 1er attachment, ex. `audio/m4a`, `image/jpeg`.
    public let firstAttachmentMimeType: String?
    /// Durée en ms du 1er attachment audio/vidéo.
    public let firstAttachmentDurationMs: Int?
    /// Date ISO de publication de l'entité sociale liée (post/story/réel/mood).
    /// Permet d'afficher « publié il y a 2 j » même quand le contenu n'est plus
    /// accessible (story expirée).
    public let postCreatedAt: String?
    /// Date ISO d'expiration de l'entité sociale liée (story/status éphémère).
    /// Le client affiche « expirée » et explique la perte d'accès.
    public let postExpiresAt: String?

    public init(
        conversationId: String? = nil,
        conversationTitle: String? = nil,
        conversationType: String? = nil,
        conversationAvatar: String? = nil,
        messageId: String? = nil,
        originalMessageId: String? = nil,
        callSessionId: String? = nil,
        friendRequestId: String? = nil,
        reactionId: String? = nil,
        postId: String? = nil,
        commentId: String? = nil,
        parentCommentId: String? = nil,
        firstAttachmentUrl: String? = nil,
        firstAttachmentMimeType: String? = nil,
        firstAttachmentDurationMs: Int? = nil,
        postCreatedAt: String? = nil,
        postExpiresAt: String? = nil
    ) {
        self.conversationId = conversationId
        self.conversationTitle = conversationTitle
        self.conversationType = conversationType
        self.conversationAvatar = conversationAvatar
        self.messageId = messageId
        self.originalMessageId = originalMessageId
        self.callSessionId = callSessionId
        self.friendRequestId = friendRequestId
        self.reactionId = reactionId
        self.postId = postId
        self.commentId = commentId
        self.parentCommentId = parentCommentId
        self.firstAttachmentUrl = firstAttachmentUrl
        self.firstAttachmentMimeType = firstAttachmentMimeType
        self.firstAttachmentDurationMs = firstAttachmentDurationMs
        self.postCreatedAt = postCreatedAt
        self.postExpiresAt = postExpiresAt
    }
}

// MARK: - Notification State

public struct NotificationState: Codable, Sendable {
    public let isRead: Bool
    public let readAt: String?
    public let createdAt: String
    public let expiresAt: String?

    public init(isRead: Bool, readAt: String?, createdAt: String, expiresAt: String?) {
        self.isRead = isRead; self.readAt = readAt
        self.createdAt = createdAt; self.expiresAt = expiresAt
    }
}

// MARK: - Notification Delivery

public struct NotificationDelivery: Codable, Sendable {
    public let emailSent: Bool
    public let pushSent: Bool
}

// MARK: - Notification Metadata

public struct NotificationMetadata: Codable, Sendable {
    /// Résumé léger d'un attachment de message (média inline + détails).
    public struct Attachments: Codable, Sendable {
        public let count: Int?
        /// "image" | "video" | "audio" | "document" | "text" | "code"
        public let firstType: String?
        public let firstFilename: String?
        /// Durée en ms du 1er attachment audio/vidéo.
        public let firstDurationMs: Int?
        /// Taille en octets du 1er attachment.
        public let firstFileSize: Int?
        /// Dimensions du 1er attachment image/vidéo.
        public let firstWidth: Int?
        public let firstHeight: Int?
    }

    public let messagePreview: String?
    public let action: String?
    public let reactionEmoji: String?
    public let callType: String?
    public let memberCount: Int?
    public let postId: String?
    public let commentId: String?
    /// Identifiant du commentaire parent (réponse à un commentaire) — permet de
    /// déplier le fil parent puis de défiler/surligner la réponse (`commentId`).
    public let parentCommentId: String?
    public let commentPreview: String?
    public let emoji: String?
    public let postType: String?
    /// Type de contenu pour les notifs « friend_new_* » (STORY/POST/MOOD/STATUS/REEL).
    public let contentType: String?
    /// Aperçu de l'entité visée (post/story/réel) — réactions, commentaires, partages.
    public let postPreview: String?
    /// Aperçu du commentaire parent (réponse à un commentaire).
    public let parentCommentPreview: String?
    /// Extrait textuel du contenu publié (friend_new_*).
    public let excerpt: String?
    /// Nature du média principal — "image" | "video" | "audio" | "text".
    public let mediaType: String?
    /// Miniature (image) de l'entité sociale liée (post/story/réel) — rendue
    /// comme vignette dans la ligne de notification in-app.
    public let postThumbnailUrl: String?
    /// Détails du 1er attachment d'un message (durée audio, taille, dimensions).
    public let attachments: Attachments?

    // Login new device fields
    public let deviceName: String?
    public let deviceVendor: String?
    public let deviceOS: String?
    public let deviceOSVersion: String?
    public let deviceType: String?
    public let ipAddress: String?
    public let country: String?
    public let countryName: String?
    public let city: String?
    public let location: String?

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        messagePreview = try container.decodeIfPresent(String.self, forKey: .messagePreview)
        action = try container.decodeIfPresent(String.self, forKey: .action)
        reactionEmoji = try container.decodeIfPresent(String.self, forKey: .reactionEmoji)
        callType = try container.decodeIfPresent(String.self, forKey: .callType)
        memberCount = try container.decodeIfPresent(Int.self, forKey: .memberCount)
        postId = try container.decodeIfPresent(String.self, forKey: .postId)
        commentId = try container.decodeIfPresent(String.self, forKey: .commentId)
        parentCommentId = try container.decodeIfPresent(String.self, forKey: .parentCommentId)
        commentPreview = try container.decodeIfPresent(String.self, forKey: .commentPreview)
        emoji = try container.decodeIfPresent(String.self, forKey: .emoji)
        postType = try container.decodeIfPresent(String.self, forKey: .postType)
        contentType = try container.decodeIfPresent(String.self, forKey: .contentType)
        postPreview = try container.decodeIfPresent(String.self, forKey: .postPreview)
        parentCommentPreview = try container.decodeIfPresent(String.self, forKey: .parentCommentPreview)
        excerpt = try container.decodeIfPresent(String.self, forKey: .excerpt)
        mediaType = try container.decodeIfPresent(String.self, forKey: .mediaType)
        postThumbnailUrl = try container.decodeIfPresent(String.self, forKey: .postThumbnailUrl)
        attachments = try container.decodeIfPresent(Attachments.self, forKey: .attachments)
        deviceName = try container.decodeIfPresent(String.self, forKey: .deviceName)
        deviceVendor = try container.decodeIfPresent(String.self, forKey: .deviceVendor)
        deviceOS = try container.decodeIfPresent(String.self, forKey: .deviceOS)
        deviceOSVersion = try container.decodeIfPresent(String.self, forKey: .deviceOSVersion)
        deviceType = try container.decodeIfPresent(String.self, forKey: .deviceType)
        ipAddress = try container.decodeIfPresent(String.self, forKey: .ipAddress)
        country = try container.decodeIfPresent(String.self, forKey: .country)
        countryName = try container.decodeIfPresent(String.self, forKey: .countryName)
        city = try container.decodeIfPresent(String.self, forKey: .city)
        location = try container.decodeIfPresent(String.self, forKey: .location)
    }

    private enum CodingKeys: String, CodingKey {
        case messagePreview, action, reactionEmoji, callType, memberCount
        case postId, commentId, parentCommentId, commentPreview, emoji, postType
        case contentType, postPreview, parentCommentPreview, excerpt, mediaType, postThumbnailUrl, attachments
        case deviceName, deviceVendor, deviceOS, deviceOSVersion, deviceType
        case ipAddress, country, countryName, city, location
    }
}

// MARK: - API Notification (matches gateway NotificationFormatter output)

public struct APINotification: Codable, Identifiable, Sendable, CacheIdentifiable {
    public let id: String
    public let userId: String
    public let type: String
    public let priority: String?
    // Mirror the APN/FCM push header so the iOS in-app toast (driven by
    // `notification:new` over Socket.IO) can render the same "sender +
    // conversation" framing as the native banner. Both fields are
    // populated by `buildPushHeader()` on the gateway and are absent on
    // REST-fetched notifications (kept optional for backwards compat).
    public let title: String?
    public let subtitle: String?
    public let content: String?
    public let actor: NotificationActor?
    public let context: NotificationContext?
    public let metadata: NotificationMetadata?
    public let state: NotificationState
    public let delivery: NotificationDelivery?

    public init(
        id: String, userId: String, type: String, priority: String?,
        title: String? = nil, subtitle: String? = nil,
        content: String?, actor: NotificationActor?, context: NotificationContext?,
        metadata: NotificationMetadata?, state: NotificationState, delivery: NotificationDelivery?
    ) {
        self.id = id; self.userId = userId; self.type = type; self.priority = priority
        self.title = title; self.subtitle = subtitle
        self.content = content; self.actor = actor; self.context = context
        self.metadata = metadata; self.state = state; self.delivery = delivery
    }

    public var notificationType: MeeshyNotificationType {
        MeeshyNotificationType(rawValue: type) ?? .system
    }

    public var isRead: Bool { state.isRead }
    public var readAt: String? { state.readAt }
    public var createdAt: String { state.createdAt }

    public var senderId: String? { actor?.id }
    public var senderName: String? { actor?.displayName ?? actor?.username }
    public var senderAvatar: String? { actor?.avatar }

    /// Miniature (image) du contenu social lié (post/story/réel) à afficher en
    /// vignette de la ligne — `nil` quand le contenu n'a pas de média visuel.
    public var postThumbnailURLString: String? {
        guard let url = metadata?.postThumbnailUrl, !url.isEmpty else { return nil }
        return url
    }

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
        // Source unique : le gateway calcule le titre « acteur + action »
        // localisé et conscient de l'entité (story / réel / publication…) puis
        // le persiste. On l'affiche tel quel — identique au push et au web.
        // Le switch ci-dessous n'est qu'un REPLI pour les anciennes notifications
        // ou les types non gérés côté serveur (messages, appels, système…).
        if let title, !title.trimmingCharacters(in: .whitespaces).isEmpty {
            return title
        }

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
        case .newConversationDirect:
            // Direct DM: the conversation has no real title — surface the
            // sender name so the user immediately knows who started it.
            // Mirror of the gateway push body
            // ("Nouvelle conversation avec ${actor.displayName}").
            return "Nouvelle conversation avec \(actorName)"
        case .newConversationGroup:
            // Group invite: the conversation title is the meaningful label.
            return "Invitation au groupe \(conversationTitle)"
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
            if let content, !content.isEmpty {
                return "\(actorName) \(content)"
            }
            let emoji = metadata?.emoji ?? metadata?.reactionEmoji
            let typeLabel: String = {
                if notificationType == .storyReaction || metadata?.postType == "STORY" { return "story" }
                if notificationType == .statusReaction || metadata?.postType == "STATUS" { return "statut" }
                if notificationType == .commentLike { return "commentaire" }
                return "publication"
            }()
            if let emoji {
                return "\(actorName) a reagi \(emoji) a votre \(typeLabel)"
            }
            return "\(actorName) a aime votre \(typeLabel)"
        case .commentReaction:
            let emoji = metadata?.emoji ?? metadata?.reactionEmoji
            if let emoji {
                return "\(actorName) a reagi \(emoji) a votre commentaire"
            }
            return "\(actorName) a reagi a votre commentaire"
        case .commentReply:
            return "\(actorName) a repondu a votre commentaire"
        case .postComment, .legacyPostComment:
            return "\(actorName) a commente votre publication"
        case .storyNewComment:
            return "\(actorName) a commente votre story"
        case .friendStoryComment:
            return "\(actorName) a commente une story"
        case .storyThreadReply:
            return "\(actorName) a repondu dans un fil de commentaires"
        // Phase 4F — friend new content
        case .friendNewStory:
            return "\(actorName) a publie une nouvelle story"
        case .friendNewPost:
            return "\(actorName) a publie une nouvelle publication"
        case .friendNewMood:
            return "\(actorName) a partage une humeur"
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
            let device = metadata?.deviceName ?? metadata?.deviceOS ?? "un appareil inconnu"
            return "Connexion depuis \(device)"
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
            // What message was reacted to.
            return metadata?.messagePreview
        case .newMessage, .legacyNewMessage, .messageReply, .userMentioned, .mention, .legacyMention, .reply, .legacyStoryReply:
            // `content` already embeds attachment details (durée audio, taille,
            // dimensions) built server-side; fall back to the raw preview.
            return Self.firstNonEmpty(content, metadata?.messagePreview)
        // Comments & replies — show the actual comment / reply text.
        case .postComment, .legacyPostComment, .commentReply,
             .storyNewComment, .friendStoryComment, .storyThreadReply:
            return Self.firstNonEmpty(metadata?.commentPreview, content)
        // Reactions / likes / reposts on an entity — surface a text excerpt of
        // the entity. Media-only content (e.g. a photo story) shows no body text:
        // the thumbnail carries the visual and the context line already states
        // « Votre story · 📷 Photo », so a body fallback would just triplicate it.
        case .postLike, .legacyPostLike, .storyReaction, .statusReaction, .postRepost:
            return metadata?.postPreview
        case .commentLike, .commentReaction:
            return metadata?.commentPreview
        // Friend new content — the excerpt, or a media summary when text-less.
        case .friendNewStory, .friendNewPost, .friendNewMood:
            return Self.firstNonEmpty(metadata?.excerpt, mediaSummary)
        case .loginNewDevice:
            return loginDeviceBody
        default:
            return nil
        }
    }

    /// Secondary, muted context line: WHICH entity the notification concerns
    /// (« Story · « aperçu » », « En réponse à « … » ») and its lifecycle
    /// (« publiée il y a 2 j · expirée ») so an expired story is self-explanatory.
    public var formattedContext: String? {
        // Types sociaux : base d'entité (sous-titre serveur localisé préféré,
        // sinon repli client) + date de PUBLICATION du contenu lié (locale
        // appareil — « du 23/06/2026 14:30 ») + état d'expiration. Pour les
        // autres types, le sous-titre serveur (nom du groupe, etc.) est la ligne.
        switch notificationType {
        case .postComment, .legacyPostComment, .storyNewComment, .friendStoryComment, .storyThreadReply,
             .postLike, .legacyPostLike, .storyReaction, .statusReaction, .postRepost,
             .commentLike, .commentReaction, .commentReply,
             .friendNewStory, .friendNewPost, .friendNewMood:
            return decoratedSocialContext
        default:
            return (subtitle?.isEmpty == false) ? subtitle : nil
        }
    }

    /// Base d'entité + date du contenu + expiry, jointes par « · ». La date
    /// n'est ajoutée que si le contenu lié porte une `postCreatedAt` — elle est
    /// distincte de l'horodatage d'arrivée de la notif (affiché à droite).
    private var decoratedSocialContext: String? {
        let base = serverSubtitleBase ?? legacySocialEntityBase
        let parts = [base, contentPublishedLabel, expiryLabel]
            .compactMap { value -> String? in (value?.isEmpty == false) ? value : nil }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    /// Sous-titre serveur (localisé, conscient de l'entité) s'il est présent.
    private var serverSubtitleBase: String? {
        guard let subtitle, !subtitle.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        return subtitle
    }

    /// Repli client (anciennes notifs / sous-titre serveur absent) : libellé
    /// d'entité + aperçu, SANS date ni expiry (ajoutés par `decoratedSocialContext`).
    private var legacySocialEntityBase: String? {
        switch notificationType {
        case .commentReply:
            if let parent = metadata?.parentCommentPreview, !parent.isEmpty {
                return "En réponse à « \(parent) »"
            }
            return "En réponse à votre commentaire"
        case .commentLike, .commentReaction, .friendNewStory, .friendNewPost, .friendNewMood:
            // Le body montre déjà le commentaire/extrait — pas d'aperçu dupliqué ici.
            return socialKindLabel
        default:
            var line = socialKindLabel
            if let preview = metadata?.postPreview, !preview.isEmpty {
                line += " · « \(preview) »"
            }
            return line
        }
    }

    /// Date de publication du contenu lié (« il y a 6 min » / « hier 14:30 » /
    /// « 23/06/2026 14:30 »), formatée pour l'appareil. `nil` si absente.
    private var contentPublishedLabel: String? {
        guard let iso = context?.postCreatedAt, let date = Self.parseISODate(iso) else { return nil }
        return NotificationDateFormatter.string(for: date)
    }

    private var loginDeviceBody: String? {
        var parts: [String] = []
        if let location = metadata?.location, !location.isEmpty {
            parts.append(location)
        } else {
            let loc = [metadata?.city, metadata?.countryName].compactMap { $0 }.joined(separator: ", ")
            if !loc.isEmpty { parts.append(loc) }
        }
        if let ip = metadata?.ipAddress, !ip.isEmpty {
            parts.append("IP: \(ip)")
        }
        if let os = metadata?.deviceOS, !os.isEmpty {
            parts.append(os)
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

// MARK: - Social context & lifecycle helpers

extension APINotification {
    /// Libellé typé du contenu social : distingue story / réel / mood / statut /
    /// publication. Lit `metadata.postType` (réactions, commentaires) ou
    /// `metadata.contentType` (friend_new_*), avec repli sur le type de notif.
    var socialKindLabel: String {
        switch (metadata?.postType ?? metadata?.contentType)?.uppercased() {
        case "STORY": return "Story"
        case "REEL": return "Réel"
        case "MOOD": return "Humeur"
        case "STATUS": return "Statut"
        case "POST": return "Publication"
        default:
            switch notificationType {
            case .storyReaction, .storyNewComment, .friendStoryComment, .storyThreadReply, .friendNewStory:
                return "Story"
            case .statusReaction:
                return "Statut"
            case .friendNewMood:
                return "Humeur"
            default:
                return "Publication"
            }
        }
    }

    /// Résumé média pour un contenu sans texte (« 📷 Photo », « 🎥 Vidéo »…).
    var mediaSummary: String? {
        switch metadata?.mediaType?.lowercased() {
        case "image": return "📷 Photo"
        case "video": return "🎥 Vidéo"
        case "audio": return "🎵 Audio"
        default: return nil
        }
    }

    /// « expirée » quand la date d'expiration de l'entité liée est dépassée.
    var expiryLabel: String? {
        guard let iso = context?.postExpiresAt, let date = Self.parseISODate(iso) else { return nil }
        return date <= Date() ? "expirée" : nil
    }

    /// Indique si l'entité sociale liée est une story/statut expiré.
    public var isLinkedContentExpired: Bool {
        guard let iso = context?.postExpiresAt, let date = Self.parseISODate(iso) else { return false }
        return date <= Date()
    }

    static func firstNonEmpty(_ values: String?...) -> String? {
        for value in values {
            if let value, !value.isEmpty { return value }
        }
        return nil
    }

    // `nonisolated(unsafe)` : ISO8601DateFormatter est thread-safe pour le
    // parsing une fois configuré ; ces statics sont partagés depuis un struct
    // Sendable nonisolated (même pattern que les CIContext/NSCache du SDK).
    private nonisolated(unsafe) static let isoFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private nonisolated(unsafe) static let isoPlain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static func parseISODate(_ string: String) -> Date? {
        isoFractional.date(from: string) ?? isoPlain.date(from: string)
    }
}

// MARK: - Mutation Helpers

extension APINotification {
    public func withReadState(_ isRead: Bool) -> APINotification {
        let newState = NotificationState(
            isRead: isRead,
            readAt: isRead ? state.readAt ?? state.createdAt : nil,
            createdAt: state.createdAt,
            expiresAt: state.expiresAt
        )
        return APINotification(
            id: id, userId: userId, type: type, priority: priority,
            content: content, actor: actor, context: context,
            metadata: metadata, state: newState, delivery: delivery
        )
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
