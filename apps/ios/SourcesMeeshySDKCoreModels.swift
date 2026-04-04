import Foundation

// MARK: - Core Models for MeeshySDK

// MARK: - Conversation Models

public struct MeeshyConversationTag: Identifiable, Codable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let color: String
    
    public init(id: String = UUID().uuidString, name: String, color: String) {
        self.id = id
        self.name = name
        self.color = color
    }
}

public enum ConversationType: String, Codable, Sendable {
    case direct
    case group
    case community
    case channel
}

public enum ConversationLanguage: String, Codable, Sendable {
    case english
    case french
    case spanish
    case german
    case japanese
    case chinese
    case arabic
    case portuguese
    case russian
    case italian
}

public enum ConversationTheme: String, Codable, Sendable {
    case general
    case social
    case work
    case tech
    case gaming
    case music
    case food
    case travel
    case sports
    case education
}

public struct MeeshyConversation: Identifiable, Codable, Hashable, Sendable {
    public let id: String
    public let identifier: String
    public let type: ConversationType
    public let title: String
    public var isActive: Bool
    public var memberCount: Int?
    public var lastMessageAt: Date?
    public var unreadCount: Int
    public var lastMessagePreview: String?
    public var tags: [MeeshyConversationTag]
    public var isPinned: Bool
    public var sectionId: String?
    public var participantUserId: String?
    public var lastSeenAt: Date?
    public var language: ConversationLanguage
    public var theme: ConversationTheme
    
    public init(
        id: String = UUID().uuidString,
        identifier: String,
        type: ConversationType,
        title: String,
        isActive: Bool = true,
        memberCount: Int? = nil,
        lastMessageAt: Date? = nil,
        unreadCount: Int = 0,
        lastMessagePreview: String? = nil,
        tags: [MeeshyConversationTag] = [],
        isPinned: Bool = false,
        sectionId: String? = nil,
        participantUserId: String? = nil,
        lastSeenAt: Date? = nil,
        language: ConversationLanguage = .english,
        theme: ConversationTheme = .general
    ) {
        self.id = id
        self.identifier = identifier
        self.type = type
        self.title = title
        self.isActive = isActive
        self.memberCount = memberCount
        self.lastMessageAt = lastMessageAt
        self.unreadCount = unreadCount
        self.lastMessagePreview = lastMessagePreview
        self.tags = tags
        self.isPinned = isPinned
        self.sectionId = sectionId
        self.participantUserId = participantUserId
        self.lastSeenAt = lastSeenAt
        self.language = language
        self.theme = theme
    }
}

public struct MeeshyConversationSection: Identifiable, Codable, Hashable, Sendable {
    public let id: String
    public let name: String
    public var order: Int
    public var isCollapsed: Bool
    
    public init(
        id: String = UUID().uuidString,
        name: String,
        order: Int = 0,
        isCollapsed: Bool = false
    ) {
        self.id = id
        self.name = name
        self.order = order
        self.isCollapsed = isCollapsed
    }
}

public struct MeeshyCommunity: Identifiable, Codable, Hashable, Sendable {
    public let id: String
    public let identifier: String
    public let name: String
    public var description: String?
    public var memberCount: Int
    public var isPublic: Bool
    public var iconURL: String?
    public var bannerURL: String?
    
    public init(
        id: String = UUID().uuidString,
        identifier: String,
        name: String,
        description: String? = nil,
        memberCount: Int = 0,
        isPublic: Bool = true,
        iconURL: String? = nil,
        bannerURL: String? = nil
    ) {
        self.id = id
        self.identifier = identifier
        self.name = name
        self.description = description
        self.memberCount = memberCount
        self.isPublic = isPublic
        self.iconURL = iconURL
        self.bannerURL = bannerURL
    }
}

// MARK: - Message Models

public enum MessageType: String, Codable, Sendable {
    case text
    case image
    case video
    case audio
    case file
    case location
    case contact
    case sticker
    case gif
    case poll
    case system
}

public struct MeeshyMessageAttachment: Identifiable, Codable, Hashable, Sendable {
    public let id: String
    public let type: MessageType
    public let url: String?
    public var thumbnailURL: String?
    public var filename: String?
    public var fileSize: Int64?
    public var mimeType: String?
    public var width: Int?
    public var height: Int?
    public var duration: TimeInterval?
    
    public init(
        id: String = UUID().uuidString,
        type: MessageType,
        url: String? = nil,
        thumbnailURL: String? = nil,
        filename: String? = nil,
        fileSize: Int64? = nil,
        mimeType: String? = nil,
        width: Int? = nil,
        height: Int? = nil,
        duration: TimeInterval? = nil
    ) {
        self.id = id
        self.type = type
        self.url = url
        self.thumbnailURL = thumbnailURL
        self.filename = filename
        self.fileSize = fileSize
        self.mimeType = mimeType
        self.width = width
        self.height = height
        self.duration = duration
    }
}

public struct MeeshyReaction: Codable, Hashable, Sendable {
    public let emoji: String
    public let userId: String
    public let timestamp: Date
    
    public init(emoji: String, userId: String, timestamp: Date = Date()) {
        self.emoji = emoji
        self.userId = userId
        self.timestamp = timestamp
    }
}

public struct MeeshyReactionSummary: Codable, Hashable, Sendable {
    public let emoji: String
    public var count: Int
    public var userIds: [String]
    
    public init(emoji: String, count: Int = 0, userIds: [String] = []) {
        self.emoji = emoji
        self.count = count
        self.userIds = userIds
    }
}

public struct MeeshyMessage: Identifiable, Codable, Hashable, Sendable {
    public let id: String
    public let conversationId: String
    public let senderId: String
    public var senderName: String?
    public var senderAvatarURL: String?
    public let type: MessageType
    public var content: String?
    public var attachments: [MeeshyMessageAttachment]
    public let timestamp: Date
    public var isRead: Bool
    public var isEdited: Bool
    public var editedAt: Date?
    public var reactions: [MeeshyReaction]
    public var replyTo: String?
    public var forwardedFrom: String?
    
    public init(
        id: String = UUID().uuidString,
        conversationId: String,
        senderId: String,
        senderName: String? = nil,
        senderAvatarURL: String? = nil,
        type: MessageType = .text,
        content: String? = nil,
        attachments: [MeeshyMessageAttachment] = [],
        timestamp: Date = Date(),
        isRead: Bool = false,
        isEdited: Bool = false,
        editedAt: Date? = nil,
        reactions: [MeeshyReaction] = [],
        replyTo: String? = nil,
        forwardedFrom: String? = nil
    ) {
        self.id = id
        self.conversationId = conversationId
        self.senderId = senderId
        self.senderName = senderName
        self.senderAvatarURL = senderAvatarURL
        self.type = type
        self.content = content
        self.attachments = attachments
        self.timestamp = timestamp
        self.isRead = isRead
        self.isEdited = isEdited
        self.editedAt = editedAt
        self.reactions = reactions
        self.replyTo = replyTo
        self.forwardedFrom = forwardedFrom
    }
}

public typealias MeeshyChatMessage = MeeshyMessage
public typealias MeeshyMessageReaction = MeeshyReaction

// MARK: - User Models

public struct MeeshyUser: Identifiable, Codable, Hashable, Sendable {
    public let id: String
    public var username: String
    public var displayName: String?
    public var avatarURL: String?
    public var bio: String?
    public var email: String?
    public var phoneNumber: String?
    public var isOnline: Bool
    public var lastSeenAt: Date?
    public var createdAt: Date
    
    public init(
        id: String = UUID().uuidString,
        username: String,
        displayName: String? = nil,
        avatarURL: String? = nil,
        bio: String? = nil,
        email: String? = nil,
        phoneNumber: String? = nil,
        isOnline: Bool = false,
        lastSeenAt: Date? = nil,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.username = username
        self.displayName = displayName
        self.avatarURL = avatarURL
        self.bio = bio
        self.email = email
        self.phoneNumber = phoneNumber
        self.isOnline = isOnline
        self.lastSeenAt = lastSeenAt
        self.createdAt = createdAt
    }
}
