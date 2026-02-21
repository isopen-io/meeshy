import Foundation
import SwiftUI

// MARK: - Tag Model
struct ConversationTag: Identifiable, Hashable, Codable {
    let id: String
    let name: String
    let color: String

    init(id: String = UUID().uuidString, name: String, color: String) {
        self.id = id
        self.name = name
        self.color = color
    }

    // Estimated width for tag chip (padding + text)
    var estimatedWidth: CGFloat {
        let charWidth: CGFloat = 7 // Approximate width per character at size 10
        let padding: CGFloat = 22  // Horizontal padding (8 * 2 + spacing)
        return CGFloat(name.count) * charWidth + padding
    }

    // Predefined tag colors
    static let colors: [String] = [
        "FF6B6B", "4ECDC4", "9B59B6", "F8B500", "2ECC71",
        "E91E63", "3498DB", "FF7F50", "00CED1", "45B7D1",
    ]

    // Sample tags for demo
    static let samples: [ConversationTag] = [
        ConversationTag(name: "Travail", color: "3498DB"),
        ConversationTag(name: "Famille", color: "2ECC71"),
        ConversationTag(name: "Important", color: "FF6B6B"),
        ConversationTag(name: "Amis", color: "9B59B6"),
        ConversationTag(name: "Projet", color: "F8B500"),
        ConversationTag(name: "Urgent", color: "E91E63"),
        ConversationTag(name: "Perso", color: "4ECDC4"),
        ConversationTag(name: "Sport", color: "2ECC71"),
        ConversationTag(name: "Musique", color: "FF7F50"),
        ConversationTag(name: "Tech", color: "45B7D1"),
    ]
}

// MARK: - Conversation Section Model
struct ConversationSection: Identifiable, Hashable {
    let id: String
    let name: String
    let icon: String
    let color: String
    var isExpanded: Bool = true
    let order: Int

    init(id: String = UUID().uuidString, name: String, icon: String, color: String, isExpanded: Bool = true, order: Int = 0) {
        self.id = id
        self.name = name
        self.icon = icon
        self.color = color
        self.isExpanded = isExpanded
        self.order = order
    }

    // Predefined sections
    static let pinned = ConversationSection(id: "pinned", name: "Épinglés", icon: "pin.fill", color: "FF6B6B", order: 0)
    static let work = ConversationSection(id: "work", name: "Travail", icon: "briefcase.fill", color: "3498DB", order: 1)
    static let family = ConversationSection(id: "family", name: "Famille", icon: "house.fill", color: "2ECC71", order: 2)
    static let friends = ConversationSection(id: "friends", name: "Amis", icon: "person.2.fill", color: "9B59B6", order: 3)
    static let groups = ConversationSection(id: "groups", name: "Groupes", icon: "person.3.fill", color: "F8B500", order: 4)
    static let other = ConversationSection(id: "other", name: "Autres", icon: "tray.fill", color: "45B7D1", order: 5)

    static let allSections: [ConversationSection] = [.pinned, .work, .family, .friends, .groups, .other]
}

// MARK: - Conversation Model (Prisma-aligned)
struct Conversation: Identifiable, Hashable {
    let id: String // MongoDB ObjectId string
    let identifier: String // Human-readable unique identifier
    let type: ConversationType // direct, group, public, global
    var title: String?
    var description: String?
    var avatar: String?
    var banner: String?
    var communityId: String?
    var isActive: Bool = true
    var memberCount: Int = 0
    var lastMessageAt: Date
    var encryptionMode: String? // null, "server", "e2ee"
    let createdAt: Date
    var updatedAt: Date

    // Local display properties (not from Prisma)
    var unreadCount: Int = 0
    var lastMessagePreview: String?
    var tags: [ConversationTag] = []

    // Section & organization properties
    var isPinned: Bool = false
    var sectionId: String? = nil  // nil = uncategorized (goes to "Autres")
    var isMuted: Bool = false
    var participantUserId: String? = nil
    var participantAvatarURL: String? = nil
    var lastSeenAt: Date? = nil

    // Dynamic color context for UI (not persisted)
    var language: ConversationContext.ConversationLanguage = .french
    var theme: ConversationContext.ConversationTheme = .general

    enum ConversationType: String, Codable, CaseIterable {
        case direct
        case group
        case `public`
        case global
        case community
        case channel
        case bot
    }

    // Computed context for color generation
    var colorContext: ConversationContext {
        let ctxType: ConversationContext.ConversationType
        switch type {
        case .direct: ctxType = .direct
        case .group: ctxType = .group
        case .public, .global: ctxType = .community
        case .community: ctxType = .community
        case .channel: ctxType = .channel
        case .bot: ctxType = .bot
        }
        return ConversationContext(
            name: title ?? identifier,
            type: ctxType,
            language: language,
            theme: theme,
            memberCount: memberCount
        )
    }

    var colorPalette: ConversationColorPalette {
        DynamicColorGenerator.colorFor(context: colorContext)
    }

    var accentColor: String {
        colorPalette.primary
    }

    // Convenience name property
    var name: String {
        title ?? identifier
    }

    // Legacy compatibility
    var isArchived: Bool {
        !isActive
    }

    var lastSeenText: String? {
        guard let date = lastSeenAt else { return nil }
        let interval = Date().timeIntervalSince(date)
        if interval < 60 { return "En ligne" }
        if interval < 3600 {
            let mins = Int(interval / 60)
            return "Vu il y a \(mins)min"
        }
        if interval < 86400 {
            let hours = Int(interval / 3600)
            return "Vu il y a \(hours)h"
        }
        let days = Int(interval / 86400)
        return "Vu il y a \(days)j"
    }

    init(id: String = UUID().uuidString,
         identifier: String,
         type: ConversationType = .direct,
         title: String? = nil,
         description: String? = nil,
         avatar: String? = nil,
         banner: String? = nil,
         communityId: String? = nil,
         isActive: Bool = true,
         memberCount: Int = 2,
         lastMessageAt: Date = Date(),
         encryptionMode: String? = nil,
         createdAt: Date = Date(),
         updatedAt: Date = Date(),
         unreadCount: Int = 0,
         lastMessagePreview: String? = nil,
         tags: [ConversationTag] = [],
         isPinned: Bool = false,
         sectionId: String? = nil,
         isMuted: Bool = false,
         participantUserId: String? = nil,
         participantAvatarURL: String? = nil,
         lastSeenAt: Date? = nil,
         language: ConversationContext.ConversationLanguage = .french,
         theme: ConversationContext.ConversationTheme = .general) {
        self.id = id
        self.identifier = identifier
        self.type = type
        self.title = title
        self.description = description
        self.avatar = avatar
        self.banner = banner
        self.communityId = communityId
        self.isActive = isActive
        self.memberCount = memberCount
        self.lastMessageAt = lastMessageAt
        self.encryptionMode = encryptionMode
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.isPinned = isPinned
        self.sectionId = sectionId
        self.isMuted = isMuted
        self.participantUserId = participantUserId
        self.participantAvatarURL = participantAvatarURL
        self.lastSeenAt = lastSeenAt
        self.unreadCount = unreadCount
        self.lastMessagePreview = lastMessagePreview
        self.tags = tags
        self.language = language
        self.theme = theme
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: Conversation, rhs: Conversation) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - Community Model (Prisma-aligned)
struct Community: Identifiable, Hashable {
    let id: String // MongoDB ObjectId string
    let identifier: String // Human-readable unique identifier
    let name: String
    var description: String?
    var avatar: String?
    var banner: String?
    var isPrivate: Bool = true
    var isActive: Bool = true
    var deletedAt: Date?
    let createdBy: String // User ObjectId
    let createdAt: Date
    var updatedAt: Date

    // Local display properties (computed/cached)
    var memberCount: Int = 0
    var conversationCount: Int = 0

    // UI properties (not from Prisma)
    var emoji: String = "🌐" // For display when no avatar
    var color: String = "4ECDC4"
    var theme: ConversationContext.ConversationTheme = .general
    var language: ConversationContext.ConversationLanguage = .french

    init(id: String = UUID().uuidString,
         identifier: String,
         name: String,
         description: String? = nil,
         avatar: String? = nil,
         banner: String? = nil,
         isPrivate: Bool = true,
         isActive: Bool = true,
         deletedAt: Date? = nil,
         createdBy: String = "",
         createdAt: Date = Date(),
         updatedAt: Date = Date(),
         memberCount: Int = 0,
         conversationCount: Int = 0,
         emoji: String = "🌐",
         color: String = "4ECDC4",
         theme: ConversationContext.ConversationTheme = .general,
         language: ConversationContext.ConversationLanguage = .french) {
        self.id = id
        self.identifier = identifier
        self.name = name
        self.description = description
        self.avatar = avatar
        self.banner = banner
        self.isPrivate = isPrivate
        self.isActive = isActive
        self.deletedAt = deletedAt
        self.createdBy = createdBy
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.memberCount = memberCount
        self.conversationCount = conversationCount
        self.emoji = emoji
        self.color = color
        self.theme = theme
        self.language = language
    }
}

// MARK: - Message Model (Prisma-aligned)
struct Message: Identifiable {
    let id: String // MongoDB ObjectId string
    let conversationId: String
    var senderId: String?
    var anonymousSenderId: String?
    var content: String
    var originalLanguage: String = "fr"
    var messageType: MessageType = .text
    var messageSource: MessageSource = .user
    var isEdited: Bool = false
    var editedAt: Date?
    var isDeleted: Bool = false
    var deletedAt: Date?
    var replyToId: String?
    var forwardedFromId: String?
    var forwardedFromConversationId: String?
    var expiresAt: Date?
    var isViewOnce: Bool = false
    var maxViewOnceCount: Int?
    var viewOnceCount: Int = 0
    var isBlurred: Bool = false
    var pinnedAt: Date?
    var pinnedBy: String?
    var isEncrypted: Bool = false
    var encryptionMode: String?
    let createdAt: Date
    var updatedAt: Date

    // Local display properties
    var attachments: [MessageAttachment] = []
    var reactions: [Reaction] = []
    var replyTo: ReplyReference?

    // Sender display info (for avatar in bubbles)
    var senderName: String?
    var senderColor: String?
    var senderAvatarURL: String?

    // Delivery status for own messages (sent → delivered → read)
    var deliveryStatus: DeliveryStatus = .sent

    // Computed properties for UI
    var isMe: Bool = false // Set based on current user comparison

    enum DeliveryStatus: String {
        case sending   // optimistic, not confirmed
        case sent      // server confirmed (single check)
        case delivered // recipient received (double gray check)
        case read      // recipient read (double blue check)
    }

    enum MessageType: String, Codable, CaseIterable {
        case text
        case image
        case file
        case audio
        case video
        case location
    }

    enum MessageSource: String, Codable, CaseIterable {
        case user
        case system
        case ads
        case app
        case agent
        case authority
    }

    init(id: String = UUID().uuidString,
         conversationId: String,
         senderId: String? = nil,
         anonymousSenderId: String? = nil,
         content: String,
         originalLanguage: String = "fr",
         messageType: MessageType = .text,
         messageSource: MessageSource = .user,
         isEdited: Bool = false,
         editedAt: Date? = nil,
         isDeleted: Bool = false,
         deletedAt: Date? = nil,
         replyToId: String? = nil,
         forwardedFromId: String? = nil,
         forwardedFromConversationId: String? = nil,
         expiresAt: Date? = nil,
         isViewOnce: Bool = false,
         maxViewOnceCount: Int? = nil,
         viewOnceCount: Int = 0,
         isBlurred: Bool = false,
         pinnedAt: Date? = nil,
         pinnedBy: String? = nil,
         isEncrypted: Bool = false,
         encryptionMode: String? = nil,
         createdAt: Date = Date(),
         updatedAt: Date = Date(),
         attachments: [MessageAttachment] = [],
         reactions: [Reaction] = [],
         replyTo: ReplyReference? = nil,
         senderName: String? = nil,
         senderColor: String? = nil,
         senderAvatarURL: String? = nil,
         deliveryStatus: DeliveryStatus = .sent,
         isMe: Bool = false) {
        self.id = id
        self.conversationId = conversationId
        self.senderId = senderId
        self.anonymousSenderId = anonymousSenderId
        self.content = content
        self.originalLanguage = originalLanguage
        self.messageType = messageType
        self.messageSource = messageSource
        self.isEdited = isEdited
        self.editedAt = editedAt
        self.isDeleted = isDeleted
        self.deletedAt = deletedAt
        self.replyToId = replyToId
        self.forwardedFromId = forwardedFromId
        self.forwardedFromConversationId = forwardedFromConversationId
        self.expiresAt = expiresAt
        self.isViewOnce = isViewOnce
        self.maxViewOnceCount = maxViewOnceCount
        self.viewOnceCount = viewOnceCount
        self.isBlurred = isBlurred
        self.pinnedAt = pinnedAt
        self.pinnedBy = pinnedBy
        self.isEncrypted = isEncrypted
        self.encryptionMode = encryptionMode
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.attachments = attachments
        self.reactions = reactions
        self.replyTo = replyTo
        self.senderName = senderName
        self.senderColor = senderColor
        self.senderAvatarURL = senderAvatarURL
        self.isMe = isMe
        self.deliveryStatus = deliveryStatus
    }

    // Legacy convenience property
    var text: String { content }
    var timestamp: Date { createdAt }
    var attachment: MessageAttachment? { attachments.first }
}

// MARK: - ChatMessage Alias (Legacy compatibility)
typealias ChatMessage = Message

// MARK: - Message Attachment (Prisma-aligned)
struct MessageAttachment: Identifiable, Codable {
    let id: String // MongoDB ObjectId string
    var messageId: String?
    let fileName: String // Generated unique filename
    let originalName: String // Original filename
    let mimeType: String // MIME type (image/jpeg, application/pdf, etc.)
    let fileSize: Int // Size in bytes
    let filePath: String // Relative path: attachments/YYYY/mm/userId/filename
    let fileUrl: String // Full URL for access

    // User-provided metadata
    var title: String?
    var alt: String?
    var caption: String?

    // Forwarding
    var forwardedFromAttachmentId: String?
    var isForwarded: Bool = false

    // View-once / Blur
    var isViewOnce: Bool = false
    var maxViewOnceCount: Int?
    var viewOnceCount: Int = 0
    var isBlurred: Bool = false

    // Image metadata
    var width: Int?
    var height: Int?
    var thumbnailPath: String?
    var thumbnailUrl: String?

    // Audio/Video metadata
    var duration: Int? // Duration in MILLISECONDS
    var bitrate: Int?
    var sampleRate: Int?
    var codec: String?
    var channels: Int?

    // Video-specific
    var fps: Float?
    var videoCodec: String?

    // Document-specific
    var pageCount: Int?
    var lineCount: Int?

    // Upload info
    let uploadedBy: String // User ObjectId
    var isAnonymous: Bool = false

    let createdAt: Date

    // Encryption
    var isEncrypted: Bool = false
    var encryptionMode: String?

    // Location data (for location attachments)
    var latitude: Double?
    var longitude: Double?

    // UI helper
    var thumbnailColor: String = "4ECDC4"

    // Computed attachment type based on mimeType
    var type: AttachmentType {
        if mimeType.starts(with: "image/") { return .image }
        if mimeType.starts(with: "video/") { return .video }
        if mimeType.starts(with: "audio/") { return .audio }
        if mimeType == "application/x-location" { return .location }
        return .file
    }

    enum AttachmentType: String, Codable {
        case image
        case video
        case audio
        case file
        case location
    }

    init(id: String = UUID().uuidString,
         messageId: String? = nil,
         fileName: String = "",
         originalName: String = "",
         mimeType: String = "application/octet-stream",
         fileSize: Int = 0,
         filePath: String = "",
         fileUrl: String = "",
         title: String? = nil,
         alt: String? = nil,
         caption: String? = nil,
         forwardedFromAttachmentId: String? = nil,
         isForwarded: Bool = false,
         isViewOnce: Bool = false,
         maxViewOnceCount: Int? = nil,
         viewOnceCount: Int = 0,
         isBlurred: Bool = false,
         width: Int? = nil,
         height: Int? = nil,
         thumbnailPath: String? = nil,
         thumbnailUrl: String? = nil,
         duration: Int? = nil,
         bitrate: Int? = nil,
         sampleRate: Int? = nil,
         codec: String? = nil,
         channels: Int? = nil,
         fps: Float? = nil,
         videoCodec: String? = nil,
         pageCount: Int? = nil,
         lineCount: Int? = nil,
         uploadedBy: String = "",
         isAnonymous: Bool = false,
         createdAt: Date = Date(),
         isEncrypted: Bool = false,
         encryptionMode: String? = nil,
         latitude: Double? = nil,
         longitude: Double? = nil,
         thumbnailColor: String = "4ECDC4") {
        self.id = id
        self.messageId = messageId
        self.fileName = fileName
        self.originalName = originalName
        self.mimeType = mimeType
        self.fileSize = fileSize
        self.filePath = filePath
        self.fileUrl = fileUrl
        self.title = title
        self.alt = alt
        self.caption = caption
        self.forwardedFromAttachmentId = forwardedFromAttachmentId
        self.isForwarded = isForwarded
        self.isViewOnce = isViewOnce
        self.maxViewOnceCount = maxViewOnceCount
        self.viewOnceCount = viewOnceCount
        self.isBlurred = isBlurred
        self.width = width
        self.height = height
        self.thumbnailPath = thumbnailPath
        self.thumbnailUrl = thumbnailUrl
        self.duration = duration
        self.bitrate = bitrate
        self.sampleRate = sampleRate
        self.codec = codec
        self.channels = channels
        self.fps = fps
        self.videoCodec = videoCodec
        self.pageCount = pageCount
        self.lineCount = lineCount
        self.uploadedBy = uploadedBy
        self.isAnonymous = isAnonymous
        self.createdAt = createdAt
        self.isEncrypted = isEncrypted
        self.encryptionMode = encryptionMode
        self.latitude = latitude
        self.longitude = longitude
        self.thumbnailColor = thumbnailColor
    }

    // MARK: - Convenience factory methods for mock/local creation

    static func image(color: String = "4ECDC4") -> MessageAttachment {
        MessageAttachment(mimeType: "image/jpeg", thumbnailColor: color)
    }

    static func video(durationMs: Int, color: String = "FF6B6B") -> MessageAttachment {
        MessageAttachment(mimeType: "video/mp4", duration: durationMs, thumbnailColor: color)
    }

    static func audio(durationMs: Int, color: String = "9B59B6") -> MessageAttachment {
        MessageAttachment(mimeType: "audio/mpeg", duration: durationMs, thumbnailColor: color)
    }

    static func file(name: String, size: Int, color: String = "F8B500") -> MessageAttachment {
        MessageAttachment(fileName: name, originalName: name, mimeType: "application/octet-stream", fileSize: size, thumbnailColor: color)
    }

    static func location(latitude: Double = 0, longitude: Double = 0, color: String = "2ECC71") -> MessageAttachment {
        MessageAttachment(mimeType: "application/x-location", latitude: latitude, longitude: longitude, thumbnailColor: color)
    }

    // Legacy helper for formatted duration string
    var durationFormatted: String? {
        guard let d = duration else { return nil }
        let seconds = d / 1000
        let minutes = seconds / 60
        let remainingSeconds = seconds % 60
        return String(format: "%d:%02d", minutes, remainingSeconds)
    }

    // Legacy helper for formatted file size string
    var fileSizeFormatted: String {
        let kb = Double(fileSize) / 1024
        if kb < 1024 {
            return String(format: "%.1f KB", kb)
        }
        let mb = kb / 1024
        return String(format: "%.1f MB", mb)
    }
}

// ReplyReference is defined in MeeshySDK/Models/CoreModels.swift

// MARK: - Reaction Model (Prisma-aligned)
struct Reaction: Identifiable, Codable {
    let id: String // MongoDB ObjectId string
    let messageId: String
    var userId: String?
    var anonymousId: String?
    let emoji: String
    let createdAt: Date
    var updatedAt: Date

    init(id: String = UUID().uuidString,
         messageId: String,
         userId: String? = nil,
         anonymousId: String? = nil,
         emoji: String,
         createdAt: Date = Date(),
         updatedAt: Date = Date()) {
        self.id = id
        self.messageId = messageId
        self.userId = userId
        self.anonymousId = anonymousId
        self.emoji = emoji
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

// MARK: - Reaction Summary (for UI display)
struct ReactionSummary {
    let emoji: String
    let count: Int
    let includesMe: Bool

    init(emoji: String, count: Int, includesMe: Bool = false) {
        self.emoji = emoji
        self.count = count
        self.includesMe = includesMe
    }
}

// Legacy alias
typealias MessageReaction = ReactionSummary

// MARK: - Feed Item Model
struct FeedItem: Identifiable {
    let id = UUID()
    let author: String
    let content: String
    let timestamp: Date
    let likes: Int
    let color: String

    init(author: String, content: String, timestamp: Date = Date(), likes: Int = 0, color: String? = nil) {
        self.author = author
        self.content = content
        self.timestamp = timestamp
        self.likes = likes
        self.color = color ?? DynamicColorGenerator.colorForName(author)
    }
}

// MARK: - Category Filter
enum ConversationCategory: String, CaseIterable, Identifiable {
    case all = "Tous"
    case unread = "Non lus"
    case personnel = "Personnel"
    case privee = "Privée"
    case ouvertes = "Ouvertes"
    case archived = "Archivés"

    var id: String { self.rawValue }

    var color: String {
        switch self {
        case .all: return "4ECDC4"
        case .unread: return "FF6B6B"
        case .personnel: return "3498DB"      // Blue for personal/direct
        case .privee: return "F8B500"         // Amber for private groups
        case .ouvertes: return "2ECC71"       // Green for public/open
        case .archived: return "9B59B6"
        }
    }
}

// MARK: - Sample Data Generator
struct SampleData {

    static let conversations: [Conversation] = [
        // Direct conversations - Pinned
        Conversation(
            identifier: "conv_alice",
            type: .direct,
            title: "Alice",
            lastMessageAt: Date(),
            unreadCount: 2,
            lastMessagePreview: "Hey, are you free?",
            tags: [
                ConversationTag(name: "Amis", color: "9B59B6"),
                ConversationTag(name: "Important", color: "FF6B6B")
            ],
            isPinned: true,
            sectionId: "friends",
            participantUserId: "user_alice",
            lastSeenAt: Date(),
            language: .english,
            theme: .social
        ),
        Conversation(
            identifier: "conv_bob",
            type: .direct,
            title: "Bob",
            lastMessageAt: Date().addingTimeInterval(-3600),
            unreadCount: 1,
            lastMessagePreview: "📷 Photo",
            tags: [
                ConversationTag(name: "Travail", color: "3498DB"),
                ConversationTag(name: "Projet", color: "F8B500"),
                ConversationTag(name: "Urgent", color: "E91E63")
            ],
            isPinned: true,
            sectionId: "work",
            participantUserId: "user_bob",
            lastSeenAt: Date().addingTimeInterval(-1800),
            language: .french,
            theme: .work
        ),
        Conversation(
            identifier: "conv_sarah",
            type: .direct,
            title: "Sarah",
            lastMessageAt: Date().addingTimeInterval(-3700),
            lastMessagePreview: "Can we meet?",
            tags: [
                ConversationTag(name: "Amis", color: "9B59B6")
            ],
            sectionId: "friends",
            participantUserId: "user_sarah",
            lastSeenAt: Date().addingTimeInterval(-7200),
            language: .spanish,
            theme: .social
        ),
        Conversation(
            identifier: "conv_john",
            type: .direct,
            title: "John",
            lastMessageAt: Date().addingTimeInterval(-14400),
            lastMessagePreview: "Thanks for the help!",
            sectionId: "work",
            participantUserId: "user_john",
            lastSeenAt: Date().addingTimeInterval(-86400),
            language: .german,
            theme: .general
        ),
        Conversation(
            identifier: "conv_emma",
            type: .direct,
            title: "Emma",
            lastMessageAt: Date().addingTimeInterval(-21600),
            lastMessagePreview: "🎵 Voice message (0:42)",
            tags: [
                ConversationTag(name: "Famille", color: "2ECC71"),
                ConversationTag(name: "Perso", color: "4ECDC4")
            ],
            isPinned: true,
            sectionId: "family",
            participantUserId: "user_emma",
            lastSeenAt: Date().addingTimeInterval(-300),
            language: .french,
            theme: .food
        ),
        Conversation(
            identifier: "conv_tanaka",
            type: .direct,
            title: "田中太郎",
            lastMessageAt: Date().addingTimeInterval(-28000),
            unreadCount: 5,
            lastMessagePreview: "ありがとうございます！",
            tags: [
                ConversationTag(name: "Tech", color: "45B7D1"),
                ConversationTag(name: "Travail", color: "3498DB"),
                ConversationTag(name: "Important", color: "FF6B6B"),
                ConversationTag(name: "Projet", color: "F8B500")
            ],
            sectionId: "work",
            language: .japanese,
            theme: .tech
        ),

        // Groups with various member counts
        Conversation(
            identifier: "conv_project_x",
            type: .group,
            title: "Project X - Final Sprint",
            isActive: false,
            memberCount: 8,
            lastMessageAt: Date().addingTimeInterval(-7200),
            lastMessagePreview: "Deadline tomorrow",
            tags: [
                ConversationTag(name: "Travail", color: "3498DB"),
                ConversationTag(name: "Urgent", color: "E91E63"),
                ConversationTag(name: "Projet", color: "F8B500"),
                ConversationTag(name: "Important", color: "FF6B6B"),
                ConversationTag(name: "Tech", color: "45B7D1")
            ],
            isPinned: true,
            sectionId: "groups",
            language: .english,
            theme: .work
        ),
        Conversation(
            identifier: "conv_dev_team",
            type: .group,
            title: "Dev Team",
            memberCount: 12,
            lastMessageAt: Date().addingTimeInterval(-7300),
            lastMessagePreview: "Sprint planning at 2pm",
            tags: [
                ConversationTag(name: "Tech", color: "45B7D1"),
                ConversationTag(name: "Travail", color: "3498DB")
            ],
            language: .english,
            theme: .tech
        ),
        Conversation(
            identifier: "conv_gaming_squad",
            type: .group,
            title: "Gaming Squad 🎮",
            memberCount: 6,
            lastMessageAt: Date().addingTimeInterval(-25000),
            unreadCount: 23,
            lastMessagePreview: "GG! Next match?",
            tags: [
                ConversationTag(name: "Amis", color: "9B59B6")
            ],
            language: .english,
            theme: .gaming
        ),
        Conversation(
            identifier: "conv_famille_dupont",
            type: .group,
            title: "Famille Dupont - Vacances d'été 2024",
            memberCount: 15,
            lastMessageAt: Date().addingTimeInterval(-32000),
            lastMessagePreview: "J'ai réservé les billets!",
            tags: [
                ConversationTag(name: "Famille", color: "2ECC71"),
                ConversationTag(name: "Perso", color: "4ECDC4")
            ],
            language: .french,
            theme: .travel
        ),

        // Large communities
        Conversation(
            identifier: "conv_marketing",
            type: .community,
            title: "Marketing",
            memberCount: 45,
            lastMessageAt: Date().addingTimeInterval(-10800),
            lastMessagePreview: "New campaign ideas",
            language: .french,
            theme: .work
        ),
        Conversation(
            identifier: "conv_music_lovers",
            type: .community,
            title: "Music Lovers Worldwide 🎵🌍",
            memberCount: 234,
            lastMessageAt: Date().addingTimeInterval(-30000),
            unreadCount: 99,
            lastMessagePreview: "Check this new album!",
            language: .japanese,
            theme: .music
        ),
        Conversation(
            identifier: "conv_dev_francophone",
            type: .community,
            title: "Communauté Francophone des Développeurs iOS et Android - Paris & IDF",
            memberCount: 1250,
            lastMessageAt: Date().addingTimeInterval(-45000),
            lastMessagePreview: "Meetup ce weekend!",
            language: .french,
            theme: .tech
        ),
        Conversation(
            identifier: "conv_startup_founders",
            type: .community,
            title: "Global Startup Founders & Entrepreneurs Network",
            memberCount: 15420,
            lastMessageAt: Date().addingTimeInterval(-50000),
            unreadCount: 500,
            lastMessagePreview: "🚀 Series A announced!",
            language: .english,
            theme: .work
        ),

        // Channels
        Conversation(
            identifier: "conv_announcements",
            type: .channel,
            title: "📢 Announcements",
            memberCount: 50000,
            lastMessageAt: Date().addingTimeInterval(-3600),
            lastMessagePreview: "Version 2.0 is live!",
            language: .english,
            theme: .general
        ),

        // Bot conversations
        Conversation(
            identifier: "conv_ai_assistant",
            type: .bot,
            title: "🤖 AI Assistant",
            memberCount: 1,
            lastMessageAt: Date().addingTimeInterval(-120),
            lastMessagePreview: "How can I help you today?",
            language: .english,
            theme: .tech
        ),
    ]

    static let communities: [Community] = [
        // Short titles
        Community(identifier: "mshy_design", name: "Design", memberCount: 1250, conversationCount: 48, emoji: "🎨", color: "FF6B6B", theme: .art),
        Community(identifier: "mshy_swiftui", name: "SwiftUI", memberCount: 3420, conversationCount: 156, emoji: "📱", color: "4ECDC4", theme: .tech),
        Community(identifier: "mshy_music", name: "Music", memberCount: 890, conversationCount: 32, emoji: "🎵", color: "9B59B6", theme: .music),

        // Medium titles
        Community(identifier: "mshy_travel_adventures", name: "Travel Adventures", memberCount: 2100, conversationCount: 87, emoji: "✈️", color: "F8B500", theme: .travel),
        Community(identifier: "mshy_gaming_central", name: "Gaming Central", memberCount: 4500, conversationCount: 234, emoji: "🎮", color: "2ECC71", theme: .gaming),
        Community(identifier: "mshy_foodies_paradise", name: "Foodies Paradise", memberCount: 1800, conversationCount: 95, emoji: "🍕", color: "FF7F50", theme: .food),

        // Long titles (edge cases)
        Community(identifier: "mshy_photography_arts", name: "International Photography & Visual Arts Community", memberCount: 12500, conversationCount: 523, emoji: "📸", color: "E91E63", theme: .art),
        Community(identifier: "mshy_dev_rn_flutter", name: "Développeurs Francophones React Native & Flutter", memberCount: 8900, conversationCount: 312, emoji: "⚛️", color: "45B7D1", theme: .tech),
        Community(identifier: "mshy_startup_founders", name: "Startup Founders & Tech Entrepreneurs Worldwide", memberCount: 25000, conversationCount: 1250, emoji: "🚀", color: "9B59B6", theme: .work),

        // Very long titles
        Community(identifier: "mshy_ai_francophone", name: "Communauté Francophone des Passionnés d'Intelligence Artificielle", memberCount: 45000, conversationCount: 2340, emoji: "🤖", color: "00CED1", theme: .tech),
        Community(identifier: "mshy_digital_nomads", name: "European Digital Nomads & Remote Workers Association", memberCount: 78000, conversationCount: 4521, emoji: "🌍", color: "2ECC71", theme: .travel),

        // Edge case: Very large numbers
        Community(identifier: "mshy_global_news", name: "Global News", memberCount: 1500000, conversationCount: 50000, emoji: "📰", color: "3498DB", theme: .general),
        Community(identifier: "mshy_music_fans", name: "Music Fans", memberCount: 999999, conversationCount: 99999, emoji: "🎸", color: "E74C3C", theme: .music),

        // Edge case: Small numbers
        Community(identifier: "mshy_vip_club", name: "VIP Club", memberCount: 3, conversationCount: 1, emoji: "⭐", color: "F8B500", theme: .social),
        Community(identifier: "mshy_beta_testers", name: "Beta Testers", memberCount: 12, conversationCount: 5, emoji: "🧪", color: "9B59B6", theme: .tech),
    ]

    static let feedItems: [FeedItem] = [
        FeedItem(author: "Alice", content: "Just posted a new photo!", likes: 42, color: "FF6B6B"),
        FeedItem(author: "Design Team", content: "New UI concepts are ready for review", likes: 128, color: "4ECDC4"),
        FeedItem(author: "Bob", content: "Check out this cool article about SwiftUI", likes: 67, color: "9B59B6"),
        FeedItem(author: "Sarah", content: "Working on something exciting!", likes: 23, color: "F8B500"),
        FeedItem(author: "Dev Community", content: "New Swift 6 features announced", likes: 512, color: "E91E63"),
        FeedItem(author: "Emma", content: "Coffee break anyone? ☕", likes: 89, color: "45B7D1"),
    ]

    // Sample messages with various types
    static func sampleMessages(conversationId: String = "sample_conv", contactColor: String) -> [Message] {
        [
            // Regular text messages
            Message(conversationId: conversationId, content: "Hey! How are you?", createdAt: Date().addingTimeInterval(-600), isMe: false),

            Message(conversationId: conversationId, content: "I'm good! Working on the app", createdAt: Date().addingTimeInterval(-550), isMe: true),

            // Message with reply
            Message(
                conversationId: conversationId,
                content: "That sounds great! Keep it up 💪",
                createdAt: Date().addingTimeInterval(-500),
                replyTo: ReplyReference(authorName: "Me", previewText: "I'm good! Working on the app", isMe: true),
                isMe: false
            ),

            // Image attachment
            Message(
                conversationId: conversationId,
                content: "Check out this design I made!",
                createdAt: Date().addingTimeInterval(-450),
                attachments: [.image(color: "4ECDC4")],
                isMe: true
            ),

            // Reply to image
            Message(
                conversationId: conversationId,
                content: "Wow! This looks amazing 😍",
                createdAt: Date().addingTimeInterval(-400),
                replyTo: ReplyReference(authorName: "Me", previewText: "📷 Photo", isMe: true),
                isMe: false
            ),

            // Voice message
            Message(
                conversationId: conversationId,
                content: "",
                messageType: .audio,
                createdAt: Date().addingTimeInterval(-350),
                attachments: [.audio(durationMs: 42000, color: contactColor)],
                isMe: false
            ),

            // Reply to voice message
            Message(
                conversationId: conversationId,
                content: "Got it, will do!",
                createdAt: Date().addingTimeInterval(-300),
                replyTo: ReplyReference(authorName: "Contact", previewText: "🎵 Voice message (0:42)", isMe: false, authorColor: contactColor),
                isMe: true
            ),

            // File attachment
            Message(
                conversationId: conversationId,
                content: "Here's the document you asked for",
                messageType: .file,
                createdAt: Date().addingTimeInterval(-250),
                attachments: [.file(name: "Project_Brief.pdf", size: 2457600, color: "F8B500")],
                isMe: true
            ),

            // Video attachment
            Message(
                conversationId: conversationId,
                content: "Look at this funny video 😂",
                messageType: .video,
                createdAt: Date().addingTimeInterval(-200),
                attachments: [.video(durationMs: 83000, color: "FF6B6B")],
                isMe: false
            ),

            // Location share
            Message(
                conversationId: conversationId,
                content: "I'm here!",
                messageType: .location,
                createdAt: Date().addingTimeInterval(-150),
                attachments: [.location(latitude: 48.8566, longitude: 2.3522, color: "2ECC71")],
                isMe: false
            ),

            // Message with reactions (using ReactionSummary for display)
            Message(
                conversationId: conversationId,
                content: "Let's meet at 5pm then?",
                createdAt: Date().addingTimeInterval(-100),
                isMe: true
            ),

            // Long message
            Message(
                conversationId: conversationId,
                content: "By the way, I've been thinking about what we discussed yesterday. I think we should definitely go with option B because it provides more flexibility and scalability for future updates. What do you think?",
                createdAt: Date().addingTimeInterval(-50),
                isMe: false
            ),

            Message(conversationId: conversationId, content: "Yes! Totally agree 🎉", createdAt: Date().addingTimeInterval(-10), isMe: true),
        ]
    }
}
