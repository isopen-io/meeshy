import Foundation
import UIKit

// MARK: - Tag Model

public struct ConversationTag: Identifiable, Hashable, Codable {
    public let id: String
    public let name: String
    public let color: String

    public init(id: String = UUID().uuidString, name: String, color: String) {
        self.id = id
        self.name = name
        self.color = color
    }

    public var estimatedWidth: CGFloat {
        let charWidth: CGFloat = 7
        let padding: CGFloat = 22
        return CGFloat(name.count) * charWidth + padding
    }

    public static let colors: [String] = [
        "FF6B6B", "4ECDC4", "9B59B6", "F8B500", "2ECC71",
        "E91E63", "3498DB", "FF7F50", "00CED1", "45B7D1",
    ]

    public static let samples: [ConversationTag] = [
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

public struct ConversationSection: Identifiable, Hashable {
    public let id: String
    public let name: String
    public let icon: String
    public let color: String
    public var isExpanded: Bool = true
    public let order: Int

    public init(id: String = UUID().uuidString, name: String, icon: String, color: String, isExpanded: Bool = true, order: Int = 0) {
        self.id = id
        self.name = name
        self.icon = icon
        self.color = color
        self.isExpanded = isExpanded
        self.order = order
    }

    public static let pinned = ConversationSection(id: "pinned", name: "Epingles", icon: "pin.fill", color: "FF6B6B", order: 0)
    public static let work = ConversationSection(id: "work", name: "Travail", icon: "briefcase.fill", color: "3498DB", order: 1)
    public static let family = ConversationSection(id: "family", name: "Famille", icon: "house.fill", color: "2ECC71", order: 2)
    public static let friends = ConversationSection(id: "friends", name: "Amis", icon: "person.2.fill", color: "9B59B6", order: 3)
    public static let groups = ConversationSection(id: "groups", name: "Groupes", icon: "person.3.fill", color: "F8B500", order: 4)
    public static let other = ConversationSection(id: "other", name: "Autres", icon: "tray.fill", color: "45B7D1", order: 5)

    public static let allSections: [ConversationSection] = [.pinned, .work, .family, .friends, .groups, .other]
}

// MARK: - Conversation Model

public struct Conversation: Identifiable, Hashable {
    public let id: String
    public let identifier: String
    public let type: ConversationType
    public var title: String?
    public var description: String?
    public var avatar: String?
    public var banner: String?
    public var communityId: String?
    public var isActive: Bool = true
    public var memberCount: Int = 0
    public var lastMessageAt: Date
    public var encryptionMode: String?
    public let createdAt: Date
    public var updatedAt: Date

    public var unreadCount: Int = 0
    public var lastMessagePreview: String?
    public var tags: [ConversationTag] = []

    public var isPinned: Bool = false
    public var sectionId: String? = nil
    public var isMuted: Bool = false
    public var participantUserId: String? = nil
    public var participantAvatarURL: String? = nil
    public var lastSeenAt: Date? = nil

    public var language: ConversationContext.ConversationLanguage = .french
    public var theme: ConversationContext.ConversationTheme = .general

    public enum ConversationType: String, Codable, CaseIterable {
        case direct, group, `public`, global, community, channel, bot
    }

    public var colorContext: ConversationContext {
        let ctxType: ConversationContext.ConversationType
        switch type {
        case .direct: ctxType = .direct
        case .group: ctxType = .group
        case .public, .global: ctxType = .community
        case .community: ctxType = .community
        case .channel: ctxType = .channel
        case .bot: ctxType = .bot
        }
        return ConversationContext(name: title ?? identifier, type: ctxType, language: language, theme: theme, memberCount: memberCount)
    }

    public var colorPalette: ConversationColorPalette {
        DynamicColorGenerator.colorFor(context: colorContext)
    }

    public var accentColor: String { colorPalette.primary }
    public var name: String { title ?? identifier }
    public var isArchived: Bool { !isActive }

    public var lastSeenText: String? {
        guard let date = lastSeenAt else { return nil }
        let interval = Date().timeIntervalSince(date)
        if interval < 60 { return "En ligne" }
        if interval < 3600 { return "Vu il y a \(Int(interval / 60))min" }
        if interval < 86400 { return "Vu il y a \(Int(interval / 3600))h" }
        return "Vu il y a \(Int(interval / 86400))j"
    }

    public init(id: String = UUID().uuidString, identifier: String, type: ConversationType = .direct,
                title: String? = nil, description: String? = nil, avatar: String? = nil, banner: String? = nil,
                communityId: String? = nil, isActive: Bool = true, memberCount: Int = 2,
                lastMessageAt: Date = Date(), encryptionMode: String? = nil,
                createdAt: Date = Date(), updatedAt: Date = Date(),
                unreadCount: Int = 0, lastMessagePreview: String? = nil,
                tags: [ConversationTag] = [], isPinned: Bool = false, sectionId: String? = nil,
                isMuted: Bool = false, participantUserId: String? = nil, participantAvatarURL: String? = nil, lastSeenAt: Date? = nil,
                language: ConversationContext.ConversationLanguage = .french,
                theme: ConversationContext.ConversationTheme = .general) {
        self.id = id; self.identifier = identifier; self.type = type
        self.title = title; self.description = description; self.avatar = avatar; self.banner = banner
        self.communityId = communityId; self.isActive = isActive; self.memberCount = memberCount
        self.lastMessageAt = lastMessageAt; self.encryptionMode = encryptionMode
        self.createdAt = createdAt; self.updatedAt = updatedAt
        self.isPinned = isPinned; self.sectionId = sectionId; self.isMuted = isMuted
        self.participantUserId = participantUserId; self.participantAvatarURL = participantAvatarURL; self.lastSeenAt = lastSeenAt
        self.unreadCount = unreadCount; self.lastMessagePreview = lastMessagePreview; self.tags = tags
        self.language = language; self.theme = theme
    }

    public func hash(into hasher: inout Hasher) { hasher.combine(id) }
    public static func == (lhs: Conversation, rhs: Conversation) -> Bool { lhs.id == rhs.id }
}

// MARK: - Community Model

public struct Community: Identifiable, Hashable {
    public let id: String
    public let identifier: String
    public let name: String
    public var description: String?
    public var avatar: String?
    public var banner: String?
    public var isPrivate: Bool = true
    public var isActive: Bool = true
    public var deletedAt: Date?
    public let createdBy: String
    public let createdAt: Date
    public var updatedAt: Date
    public var memberCount: Int = 0
    public var conversationCount: Int = 0
    public var emoji: String = ""
    public var color: String = "4ECDC4"
    public var theme: ConversationContext.ConversationTheme = .general
    public var language: ConversationContext.ConversationLanguage = .french

    public init(id: String = UUID().uuidString, identifier: String, name: String,
                description: String? = nil, avatar: String? = nil, banner: String? = nil,
                isPrivate: Bool = true, isActive: Bool = true, deletedAt: Date? = nil,
                createdBy: String = "", createdAt: Date = Date(), updatedAt: Date = Date(),
                memberCount: Int = 0, conversationCount: Int = 0,
                emoji: String = "", color: String = "4ECDC4",
                theme: ConversationContext.ConversationTheme = .general,
                language: ConversationContext.ConversationLanguage = .french) {
        self.id = id; self.identifier = identifier; self.name = name
        self.description = description; self.avatar = avatar; self.banner = banner
        self.isPrivate = isPrivate; self.isActive = isActive; self.deletedAt = deletedAt
        self.createdBy = createdBy; self.createdAt = createdAt; self.updatedAt = updatedAt
        self.memberCount = memberCount; self.conversationCount = conversationCount
        self.emoji = emoji; self.color = color; self.theme = theme; self.language = language
    }
}

// MARK: - Message Model

public struct Message: Identifiable {
    public let id: String
    public let conversationId: String
    public var senderId: String?
    public var anonymousSenderId: String?
    public var content: String
    public var originalLanguage: String = "fr"
    public var messageType: MessageType = .text
    public var messageSource: MessageSource = .user
    public var isEdited: Bool = false
    public var editedAt: Date?
    public var isDeleted: Bool = false
    public var deletedAt: Date?
    public var replyToId: String?
    public var forwardedFromId: String?
    public var forwardedFromConversationId: String?
    public var expiresAt: Date?
    public var isViewOnce: Bool = false
    public var maxViewOnceCount: Int?
    public var viewOnceCount: Int = 0
    public var isBlurred: Bool = false
    public var pinnedAt: Date?
    public var pinnedBy: String?
    public var isEncrypted: Bool = false
    public var encryptionMode: String?
    public let createdAt: Date
    public var updatedAt: Date
    public var attachments: [MessageAttachment] = []
    public var reactions: [Reaction] = []
    public var replyTo: ReplyReference?
    public var senderName: String?
    public var senderColor: String?
    public var senderAvatarURL: String?
    public var isMe: Bool = false

    public enum MessageType: String, Codable, CaseIterable {
        case text, image, file, audio, video, location
    }

    public enum MessageSource: String, Codable, CaseIterable {
        case user, system, ads, app, agent, authority
    }

    public init(id: String = UUID().uuidString, conversationId: String, senderId: String? = nil,
                anonymousSenderId: String? = nil, content: String, originalLanguage: String = "fr",
                messageType: MessageType = .text, messageSource: MessageSource = .user,
                isEdited: Bool = false, editedAt: Date? = nil, isDeleted: Bool = false, deletedAt: Date? = nil,
                replyToId: String? = nil, forwardedFromId: String? = nil, forwardedFromConversationId: String? = nil,
                expiresAt: Date? = nil, isViewOnce: Bool = false, maxViewOnceCount: Int? = nil,
                viewOnceCount: Int = 0, isBlurred: Bool = false, pinnedAt: Date? = nil, pinnedBy: String? = nil,
                isEncrypted: Bool = false, encryptionMode: String? = nil,
                createdAt: Date = Date(), updatedAt: Date = Date(),
                attachments: [MessageAttachment] = [], reactions: [Reaction] = [],
                replyTo: ReplyReference? = nil,
                senderName: String? = nil, senderColor: String? = nil, senderAvatarURL: String? = nil,
                isMe: Bool = false) {
        self.id = id; self.conversationId = conversationId; self.senderId = senderId
        self.anonymousSenderId = anonymousSenderId; self.content = content
        self.originalLanguage = originalLanguage; self.messageType = messageType; self.messageSource = messageSource
        self.isEdited = isEdited; self.editedAt = editedAt; self.isDeleted = isDeleted; self.deletedAt = deletedAt
        self.replyToId = replyToId; self.forwardedFromId = forwardedFromId
        self.forwardedFromConversationId = forwardedFromConversationId
        self.expiresAt = expiresAt; self.isViewOnce = isViewOnce; self.maxViewOnceCount = maxViewOnceCount
        self.viewOnceCount = viewOnceCount; self.isBlurred = isBlurred
        self.pinnedAt = pinnedAt; self.pinnedBy = pinnedBy
        self.isEncrypted = isEncrypted; self.encryptionMode = encryptionMode
        self.createdAt = createdAt; self.updatedAt = updatedAt
        self.attachments = attachments; self.reactions = reactions; self.replyTo = replyTo
        self.senderName = senderName; self.senderColor = senderColor; self.senderAvatarURL = senderAvatarURL
        self.isMe = isMe
    }

    public var text: String { content }
    public var timestamp: Date { createdAt }
    public var attachment: MessageAttachment? { attachments.first }
}

public typealias ChatMessage = Message

// MARK: - Message Attachment

public struct MessageAttachment: Identifiable, Codable {
    public let id: String
    public var messageId: String?
    public let fileName: String
    public let originalName: String
    public let mimeType: String
    public let fileSize: Int
    public let filePath: String
    public let fileUrl: String
    public var title: String?
    public var alt: String?
    public var caption: String?
    public var forwardedFromAttachmentId: String?
    public var isForwarded: Bool = false
    public var isViewOnce: Bool = false
    public var maxViewOnceCount: Int?
    public var viewOnceCount: Int = 0
    public var isBlurred: Bool = false
    public var width: Int?
    public var height: Int?
    public var thumbnailPath: String?
    public var thumbnailUrl: String?
    public var duration: Int?
    public var bitrate: Int?
    public var sampleRate: Int?
    public var codec: String?
    public var channels: Int?
    public var fps: Float?
    public var videoCodec: String?
    public var pageCount: Int?
    public var lineCount: Int?
    public let uploadedBy: String
    public var isAnonymous: Bool = false
    public let createdAt: Date
    public var isEncrypted: Bool = false
    public var encryptionMode: String?
    public var latitude: Double?
    public var longitude: Double?
    public var thumbnailColor: String = "4ECDC4"

    public var type: AttachmentType {
        if mimeType.starts(with: "image/") { return .image }
        if mimeType.starts(with: "video/") { return .video }
        if mimeType.starts(with: "audio/") { return .audio }
        if mimeType == "application/x-location" { return .location }
        return .file
    }

    public enum AttachmentType: String, Codable {
        case image, video, audio, file, location
    }

    public init(id: String = UUID().uuidString, messageId: String? = nil,
                fileName: String = "", originalName: String = "",
                mimeType: String = "application/octet-stream", fileSize: Int = 0,
                filePath: String = "", fileUrl: String = "",
                title: String? = nil, alt: String? = nil, caption: String? = nil,
                forwardedFromAttachmentId: String? = nil, isForwarded: Bool = false,
                isViewOnce: Bool = false, maxViewOnceCount: Int? = nil, viewOnceCount: Int = 0, isBlurred: Bool = false,
                width: Int? = nil, height: Int? = nil, thumbnailPath: String? = nil, thumbnailUrl: String? = nil,
                duration: Int? = nil, bitrate: Int? = nil, sampleRate: Int? = nil, codec: String? = nil, channels: Int? = nil,
                fps: Float? = nil, videoCodec: String? = nil, pageCount: Int? = nil, lineCount: Int? = nil,
                uploadedBy: String = "", isAnonymous: Bool = false, createdAt: Date = Date(),
                isEncrypted: Bool = false, encryptionMode: String? = nil,
                latitude: Double? = nil, longitude: Double? = nil, thumbnailColor: String = "4ECDC4") {
        self.id = id; self.messageId = messageId; self.fileName = fileName; self.originalName = originalName
        self.mimeType = mimeType; self.fileSize = fileSize; self.filePath = filePath; self.fileUrl = fileUrl
        self.title = title; self.alt = alt; self.caption = caption
        self.forwardedFromAttachmentId = forwardedFromAttachmentId; self.isForwarded = isForwarded
        self.isViewOnce = isViewOnce; self.maxViewOnceCount = maxViewOnceCount
        self.viewOnceCount = viewOnceCount; self.isBlurred = isBlurred
        self.width = width; self.height = height; self.thumbnailPath = thumbnailPath; self.thumbnailUrl = thumbnailUrl
        self.duration = duration; self.bitrate = bitrate; self.sampleRate = sampleRate; self.codec = codec; self.channels = channels
        self.fps = fps; self.videoCodec = videoCodec; self.pageCount = pageCount; self.lineCount = lineCount
        self.uploadedBy = uploadedBy; self.isAnonymous = isAnonymous; self.createdAt = createdAt
        self.isEncrypted = isEncrypted; self.encryptionMode = encryptionMode
        self.latitude = latitude; self.longitude = longitude; self.thumbnailColor = thumbnailColor
    }

    public static func image(color: String = "4ECDC4") -> MessageAttachment {
        MessageAttachment(mimeType: "image/jpeg", thumbnailColor: color)
    }

    public static func video(durationMs: Int, color: String = "FF6B6B") -> MessageAttachment {
        MessageAttachment(mimeType: "video/mp4", duration: durationMs, thumbnailColor: color)
    }

    public static func audio(durationMs: Int, color: String = "9B59B6") -> MessageAttachment {
        MessageAttachment(mimeType: "audio/mpeg", duration: durationMs, thumbnailColor: color)
    }

    public static func file(name: String, size: Int, color: String = "F8B500") -> MessageAttachment {
        MessageAttachment(fileName: name, originalName: name, mimeType: "application/octet-stream", fileSize: size, thumbnailColor: color)
    }

    public static func location(latitude: Double = 0, longitude: Double = 0, color: String = "2ECC71") -> MessageAttachment {
        MessageAttachment(mimeType: "application/x-location", latitude: latitude, longitude: longitude, thumbnailColor: color)
    }

    public var durationFormatted: String? {
        guard let d = duration else { return nil }
        let seconds = d / 1000
        return String(format: "%d:%02d", seconds / 60, seconds % 60)
    }

    public var fileSizeFormatted: String {
        let kb = Double(fileSize) / 1024
        if kb < 1024 { return String(format: "%.1f KB", kb) }
        return String(format: "%.1f MB", kb / 1024)
    }
}

// MARK: - Reply Reference

public struct ReplyReference {
    public let authorName: String
    public let authorColor: String
    public let previewText: String
    public let isMe: Bool

    public init(authorName: String, previewText: String, isMe: Bool = false, authorColor: String? = nil) {
        self.authorName = authorName
        self.previewText = previewText
        self.isMe = isMe
        self.authorColor = authorColor ?? DynamicColorGenerator.colorForName(authorName)
    }
}

// MARK: - Reaction Model

public struct Reaction: Identifiable, Codable {
    public let id: String
    public let messageId: String
    public var userId: String?
    public var anonymousId: String?
    public let emoji: String
    public let createdAt: Date
    public var updatedAt: Date

    public init(id: String = UUID().uuidString, messageId: String, userId: String? = nil,
                anonymousId: String? = nil, emoji: String, createdAt: Date = Date(), updatedAt: Date = Date()) {
        self.id = id; self.messageId = messageId; self.userId = userId
        self.anonymousId = anonymousId; self.emoji = emoji; self.createdAt = createdAt; self.updatedAt = updatedAt
    }
}

// MARK: - Reaction Summary

public struct ReactionSummary {
    public let emoji: String
    public let count: Int
    public let includesMe: Bool

    public init(emoji: String, count: Int, includesMe: Bool = false) {
        self.emoji = emoji; self.count = count; self.includesMe = includesMe
    }
}

public typealias MessageReaction = ReactionSummary

// MARK: - Feed Item Model

public struct FeedItem: Identifiable {
    public let id = UUID()
    public let author: String
    public let content: String
    public let timestamp: Date
    public let likes: Int
    public let color: String

    public init(author: String, content: String, timestamp: Date = Date(), likes: Int = 0, color: String? = nil) {
        self.author = author; self.content = content; self.timestamp = timestamp; self.likes = likes
        self.color = color ?? DynamicColorGenerator.colorForName(author)
    }
}

// MARK: - Category Filter

public enum ConversationCategory: String, CaseIterable, Identifiable {
    case all = "Tous"
    case unread = "Non lus"
    case personnel = "Personnel"
    case privee = "Privee"
    case ouvertes = "Ouvertes"
    case archived = "Archives"

    public var id: String { self.rawValue }

    public var color: String {
        switch self {
        case .all: return "4ECDC4"
        case .unread: return "FF6B6B"
        case .personnel: return "3498DB"
        case .privee: return "F8B500"
        case .ouvertes: return "2ECC71"
        case .archived: return "9B59B6"
        }
    }
}
