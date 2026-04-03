import Foundation
import UIKit

// MARK: - Tag Model

public struct MeeshyConversationTag: Identifiable, Hashable, Codable, Sendable {
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

    public static let samples: [MeeshyConversationTag] = [
        MeeshyConversationTag(name: "Travail", color: "3498DB"),
        MeeshyConversationTag(name: "Famille", color: "2ECC71"),
        MeeshyConversationTag(name: "Important", color: "FF6B6B"),
        MeeshyConversationTag(name: "Amis", color: "9B59B6"),
        MeeshyConversationTag(name: "Projet", color: "F8B500"),
        MeeshyConversationTag(name: "Urgent", color: "E91E63"),
        MeeshyConversationTag(name: "Perso", color: "4ECDC4"),
        MeeshyConversationTag(name: "Sport", color: "2ECC71"),
        MeeshyConversationTag(name: "Musique", color: "FF7F50"),
        MeeshyConversationTag(name: "Tech", color: "45B7D1"),
    ]
}

// MARK: - Conversation Section Model

public struct MeeshyConversationSection: Identifiable, Hashable, Sendable {
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

    public static let pinned = MeeshyConversationSection(id: "pinned", name: "Epingles", icon: "pin.fill", color: "FF6B6B", order: 0)
    public static let work = MeeshyConversationSection(id: "work", name: "Travail", icon: "briefcase.fill", color: "3498DB", order: 1)
    public static let family = MeeshyConversationSection(id: "family", name: "Famille", icon: "house.fill", color: "2ECC71", order: 2)
    public static let friends = MeeshyConversationSection(id: "friends", name: "Amis", icon: "person.2.fill", color: "9B59B6", order: 3)
    public static let groups = MeeshyConversationSection(id: "groups", name: "Groupes", icon: "person.3.fill", color: "F8B500", order: 4)
    public static let other = MeeshyConversationSection(id: "other", name: "Mes conversations", icon: "tray.fill", color: "45B7D1", order: 5)

    public static let allSections: [MeeshyConversationSection] = [.pinned, .work, .family, .friends, .groups, .other]
}

// MARK: - Recent Message Preview

public struct RecentMessagePreview: Identifiable, Hashable, Codable, Sendable {
    public let id: String
    public let content: String
    public let senderName: String
    public let messageType: String
    public let createdAt: Date
    public let attachmentMimeType: String?
    public let attachmentCount: Int

    public init(id: String, content: String, senderName: String, messageType: String = "text",
                createdAt: Date = Date(), attachmentMimeType: String? = nil, attachmentCount: Int = 0) {
        self.id = id; self.content = content; self.senderName = senderName
        self.messageType = messageType; self.createdAt = createdAt
        self.attachmentMimeType = attachmentMimeType; self.attachmentCount = attachmentCount
    }
}

// MARK: - Conversation Model

public struct MeeshyConversation: Identifiable, Hashable, Codable, Sendable {
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
    public var lastMessageAttachments: [MeeshyMessageAttachment] = []
    public var lastMessageAttachmentCount: Int = 0
    public var lastMessageId: String? = nil
    public var lastMessageSenderName: String? = nil
    public var lastMessageIsBlurred: Bool = false
    public var lastMessageIsViewOnce: Bool = false
    public var lastMessageExpiresAt: Date? = nil
    public var recentMessages: [RecentMessagePreview] = []
    public var tags: [MeeshyConversationTag] = []

    public var isAnnouncementChannel: Bool = false
    public var defaultWriteRole: String? = nil
    public var slowModeSeconds: Int? = nil
    public var autoTranslateEnabled: Bool? = nil

    public var isPinned: Bool = false
    public var sectionId: String? = nil
    public var isMuted: Bool = false
    public var participantUserId: String? = nil
    public var participantUsername: String? = nil
    public var participantAvatarURL: String? = nil
    public var lastSeenAt: Date? = nil

    public var currentUserRole: String? = nil
    public var currentUserJoinedAt: Date? = nil
    public var reaction: String? = nil

    public var language: ConversationContext.ConversationLanguage = .french
    public var theme: ConversationContext.ConversationTheme = .general

    public enum ConversationType: String, Codable, CaseIterable, Sendable {
        case direct, group, `public`, global, community, channel, bot, broadcast
    }

    public let colorPalette: ConversationColorPalette

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

    /// Hash des champs visuels — utilisé dans ThemedConversationRow.== pour détecter les changements de contenu.
    /// Mettre à jour ce hash quand un nouveau champ est affiché dans ThemedConversationRow.
    public var renderFingerprint: Int {
        var h = Hasher()
        h.combine(lastMessagePreview)
        h.combine(unreadCount)
        h.combine(lastMessageAt)
        h.combine(lastMessageSenderName)
        h.combine(lastMessageAttachmentCount)
        h.combine(lastMessageAttachments.first?.id)
        h.combine(lastMessageIsBlurred)
        h.combine(lastMessageIsViewOnce)
        h.combine(lastMessageExpiresAt)
        h.combine(name)
        h.combine(isMuted)
        h.combine(isPinned)
        h.combine(avatar)
        h.combine(participantUsername)
        h.combine(participantAvatarURL)
        h.combine(tags)
        h.combine(reaction)
        return h.finalize()
    }

    public static func computeColorPalette(type: ConversationType, title: String?, identifier: String,
                                               language: ConversationContext.ConversationLanguage,
                                               theme: ConversationContext.ConversationTheme,
                                               memberCount: Int) -> ConversationColorPalette {
        let ctxType: ConversationContext.ConversationType
        switch type {
        case .direct: ctxType = .direct
        case .group: ctxType = .group
        case .public, .global, .community, .broadcast: ctxType = .community
        case .channel: ctxType = .channel
        case .bot: ctxType = .bot
        }
        let context = ConversationContext(name: title ?? identifier, type: ctxType, language: language, theme: theme, memberCount: memberCount)
        return DynamicColorGenerator.colorFor(context: context)
    }

    public init(id: String = UUID().uuidString, identifier: String, type: ConversationType = .direct,
                title: String? = nil, description: String? = nil, avatar: String? = nil, banner: String? = nil,
                communityId: String? = nil, isActive: Bool = true, memberCount: Int = 2,
                lastMessageAt: Date = Date(), encryptionMode: String? = nil,
                createdAt: Date = Date(), updatedAt: Date = Date(),
                unreadCount: Int = 0, lastMessagePreview: String? = nil,
                lastMessageAttachments: [MeeshyMessageAttachment] = [],
                lastMessageAttachmentCount: Int = 0,
                lastMessageId: String? = nil,
                lastMessageSenderName: String? = nil,
                lastMessageIsBlurred: Bool = false,
                lastMessageIsViewOnce: Bool = false,
                lastMessageExpiresAt: Date? = nil,
                recentMessages: [RecentMessagePreview] = [],
                tags: [MeeshyConversationTag] = [], isAnnouncementChannel: Bool = false, defaultWriteRole: String? = nil, slowModeSeconds: Int? = nil, autoTranslateEnabled: Bool? = nil, isPinned: Bool = false, sectionId: String? = nil,
                isMuted: Bool = false, participantUserId: String? = nil, participantUsername: String? = nil, participantAvatarURL: String? = nil, lastSeenAt: Date? = nil,
                currentUserRole: String? = nil, currentUserJoinedAt: Date? = nil, reaction: String? = nil,
                language: ConversationContext.ConversationLanguage = .french,
                theme: ConversationContext.ConversationTheme = .general,
                colorPalette: ConversationColorPalette? = nil) {
        self.id = id; self.identifier = identifier; self.type = type
        self.title = title; self.description = description; self.avatar = avatar; self.banner = banner
        self.communityId = communityId; self.isActive = isActive; self.memberCount = memberCount
        self.lastMessageAt = lastMessageAt; self.encryptionMode = encryptionMode
        self.createdAt = createdAt; self.updatedAt = updatedAt
        self.isAnnouncementChannel = isAnnouncementChannel
        self.defaultWriteRole = defaultWriteRole; self.slowModeSeconds = slowModeSeconds; self.autoTranslateEnabled = autoTranslateEnabled
        self.isPinned = isPinned; self.sectionId = sectionId; self.isMuted = isMuted
        self.participantUserId = participantUserId; self.participantUsername = participantUsername; self.participantAvatarURL = participantAvatarURL; self.lastSeenAt = lastSeenAt
        self.currentUserRole = currentUserRole; self.currentUserJoinedAt = currentUserJoinedAt; self.reaction = reaction
        self.unreadCount = unreadCount; self.lastMessagePreview = lastMessagePreview
        self.lastMessageAttachments = lastMessageAttachments
        self.lastMessageAttachmentCount = lastMessageAttachmentCount
        self.lastMessageId = lastMessageId
        self.lastMessageSenderName = lastMessageSenderName
        self.lastMessageIsBlurred = lastMessageIsBlurred
        self.lastMessageIsViewOnce = lastMessageIsViewOnce
        self.lastMessageExpiresAt = lastMessageExpiresAt
        self.recentMessages = recentMessages
        self.tags = tags
        self.language = language; self.theme = theme
        self.colorPalette = colorPalette ?? Self.computeColorPalette(
            type: type, title: title, identifier: identifier,
            language: language, theme: theme, memberCount: memberCount
        )
    }

    public func hash(into hasher: inout Hasher) { hasher.combine(id) }
    public static func == (lhs: MeeshyConversation, rhs: MeeshyConversation) -> Bool { lhs.id == rhs.id }
}

// MARK: - Community Model

public struct MeeshyCommunity: Identifiable, Hashable, Sendable {
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

public struct MeeshyMessage: Identifiable, Codable, Sendable {
    public let id: String
    public let conversationId: String
    public var senderId: String
    public var content: String
    public var originalLanguage: String = "fr"
    public var messageType: MessageType = .text
    public var messageSource: MessageSource = .user
    public var isEdited: Bool = false
    public var editedAt: Date?
    public var deletedAt: Date?
    public var isDeleted: Bool { deletedAt != nil }
    public var replyToId: String?
    public var forwardedFromId: String?
    public var forwardedFromConversationId: String?
    public var expiresAt: Date?
    public var effects: MessageEffects = .none
    public var maxViewOnceCount: Int?
    public var viewOnceCount: Int = 0
    public var pinnedAt: Date?

    public var isViewOnce: Bool {
        get { effects.flags.contains(.viewOnce) }
        set { if newValue { effects.flags.insert(.viewOnce) } else { effects.flags.remove(.viewOnce) } }
    }

    public var isBlurred: Bool {
        get { effects.flags.contains(.blurred) }
        set { if newValue { effects.flags.insert(.blurred) } else { effects.flags.remove(.blurred) } }
    }
    public var pinnedBy: String?
    public var isEncrypted: Bool = false
    public var encryptionMode: String?
    public let createdAt: Date
    public var updatedAt: Date
    public var attachments: [MeeshyMessageAttachment] = []
    public var reactions: [MeeshyReaction] = []
    public var replyTo: ReplyReference?
    public var forwardedFrom: ForwardReference?
    public var senderName: String?
    public var senderUsername: String?
    public var senderColor: String?
    public var senderAvatarURL: String?
    public var senderUserId: String?
    public var deliveryStatus: DeliveryStatus = .sent
    public var isMe: Bool = false
    public var deliveredToAllAt: Date?
    public var readByAllAt: Date?
    public var deliveredCount: Int = 0
    public var readCount: Int = 0

    public enum DeliveryStatus: String, Codable, Sendable {
        case sending   // optimistic, not confirmed
        case sent      // server confirmed (single check)
        case delivered // recipient received (double gray check)
        case read      // recipient read (double blue check)
        case failed    // send failed, retry available
    }

    public enum MessageType: String, Codable, CaseIterable, Sendable {
        case text, image, file, audio, video, location
    }

    public enum MessageSource: String, Codable, CaseIterable, Sendable {
        case user, system, ads, app, agent, authority
    }

    public init(id: String = UUID().uuidString, conversationId: String, senderId: String = "",
                content: String, originalLanguage: String = "fr",
                messageType: MessageType = .text, messageSource: MessageSource = .user,
                isEdited: Bool = false, editedAt: Date? = nil, deletedAt: Date? = nil,
                replyToId: String? = nil, forwardedFromId: String? = nil, forwardedFromConversationId: String? = nil,
                expiresAt: Date? = nil, effects: MessageEffects = .none, maxViewOnceCount: Int? = nil,
                viewOnceCount: Int = 0, pinnedAt: Date? = nil, pinnedBy: String? = nil,
                isEncrypted: Bool = false, encryptionMode: String? = nil,
                createdAt: Date = Date(), updatedAt: Date = Date(),
                attachments: [MeeshyMessageAttachment] = [], reactions: [MeeshyReaction] = [],
                replyTo: ReplyReference? = nil, forwardedFrom: ForwardReference? = nil,
                senderName: String? = nil, senderUsername: String? = nil, senderColor: String? = nil, senderAvatarURL: String? = nil, senderUserId: String? = nil,
                deliveryStatus: DeliveryStatus = .sent, isMe: Bool = false,
                deliveredToAllAt: Date? = nil, readByAllAt: Date? = nil,
                deliveredCount: Int = 0, readCount: Int = 0) {
        self.id = id; self.conversationId = conversationId; self.senderId = senderId
        self.content = content
        self.originalLanguage = originalLanguage; self.messageType = messageType; self.messageSource = messageSource
        self.isEdited = isEdited; self.editedAt = editedAt; self.deletedAt = deletedAt
        self.replyToId = replyToId; self.forwardedFromId = forwardedFromId
        self.forwardedFromConversationId = forwardedFromConversationId
        self.expiresAt = expiresAt; self.effects = effects; self.maxViewOnceCount = maxViewOnceCount
        self.viewOnceCount = viewOnceCount
        self.pinnedAt = pinnedAt; self.pinnedBy = pinnedBy
        self.isEncrypted = isEncrypted; self.encryptionMode = encryptionMode
        self.createdAt = createdAt; self.updatedAt = updatedAt
        self.attachments = attachments; self.reactions = reactions; self.replyTo = replyTo; self.forwardedFrom = forwardedFrom
        self.senderName = senderName; self.senderUsername = senderUsername; self.senderColor = senderColor; self.senderAvatarURL = senderAvatarURL; self.senderUserId = senderUserId
        self.deliveryStatus = deliveryStatus; self.isMe = isMe
        self.deliveredToAllAt = deliveredToAllAt; self.readByAllAt = readByAllAt
        self.deliveredCount = deliveredCount; self.readCount = readCount
        self.effects = effects
    }

    private enum CodingKeys: String, CodingKey {
        case id, conversationId, senderId, content, originalLanguage
        case messageType, messageSource, isEdited, editedAt, deletedAt
        case replyToId, forwardedFromId, forwardedFromConversationId
        case expiresAt, effects, maxViewOnceCount, viewOnceCount
        case pinnedAt, pinnedBy, isEncrypted, encryptionMode
        case createdAt, updatedAt, attachments, reactions
        case replyTo, forwardedFrom
        case senderName, senderUsername, senderColor, senderAvatarURL, senderUserId
        case deliveryStatus, isMe
        case deliveredToAllAt, readByAllAt, deliveredCount, readCount
        // Legacy keys for migration from old cached data
        case isViewOnce, isBlurred
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        conversationId = try c.decode(String.self, forKey: .conversationId)
        senderId = try c.decodeIfPresent(String.self, forKey: .senderId) ?? ""
        content = try c.decodeIfPresent(String.self, forKey: .content) ?? ""
        originalLanguage = try c.decodeIfPresent(String.self, forKey: .originalLanguage) ?? "fr"
        messageType = try c.decodeIfPresent(MessageType.self, forKey: .messageType) ?? .text
        messageSource = try c.decodeIfPresent(MessageSource.self, forKey: .messageSource) ?? .user
        isEdited = try c.decodeIfPresent(Bool.self, forKey: .isEdited) ?? false
        editedAt = try c.decodeIfPresent(Date.self, forKey: .editedAt)
        deletedAt = try c.decodeIfPresent(Date.self, forKey: .deletedAt)
        replyToId = try c.decodeIfPresent(String.self, forKey: .replyToId)
        forwardedFromId = try c.decodeIfPresent(String.self, forKey: .forwardedFromId)
        forwardedFromConversationId = try c.decodeIfPresent(String.self, forKey: .forwardedFromConversationId)
        expiresAt = try c.decodeIfPresent(Date.self, forKey: .expiresAt)
        effects = try c.decodeIfPresent(MessageEffects.self, forKey: .effects) ?? .none
        maxViewOnceCount = try c.decodeIfPresent(Int.self, forKey: .maxViewOnceCount)
        viewOnceCount = try c.decodeIfPresent(Int.self, forKey: .viewOnceCount) ?? 0
        pinnedAt = try c.decodeIfPresent(Date.self, forKey: .pinnedAt)
        pinnedBy = try c.decodeIfPresent(String.self, forKey: .pinnedBy)
        isEncrypted = try c.decodeIfPresent(Bool.self, forKey: .isEncrypted) ?? false
        encryptionMode = try c.decodeIfPresent(String.self, forKey: .encryptionMode)
        createdAt = try c.decode(Date.self, forKey: .createdAt)
        updatedAt = try c.decodeIfPresent(Date.self, forKey: .updatedAt) ?? Date()
        attachments = try c.decodeIfPresent([MeeshyMessageAttachment].self, forKey: .attachments) ?? []
        reactions = try c.decodeIfPresent([MeeshyReaction].self, forKey: .reactions) ?? []
        replyTo = try c.decodeIfPresent(ReplyReference.self, forKey: .replyTo)
        forwardedFrom = try c.decodeIfPresent(ForwardReference.self, forKey: .forwardedFrom)
        senderName = try c.decodeIfPresent(String.self, forKey: .senderName)
        senderUsername = try c.decodeIfPresent(String.self, forKey: .senderUsername)
        senderColor = try c.decodeIfPresent(String.self, forKey: .senderColor)
        senderAvatarURL = try c.decodeIfPresent(String.self, forKey: .senderAvatarURL)
        senderUserId = try c.decodeIfPresent(String.self, forKey: .senderUserId)
        deliveryStatus = try c.decodeIfPresent(DeliveryStatus.self, forKey: .deliveryStatus) ?? .sent
        isMe = try c.decodeIfPresent(Bool.self, forKey: .isMe) ?? false
        deliveredToAllAt = try c.decodeIfPresent(Date.self, forKey: .deliveredToAllAt)
        readByAllAt = try c.decodeIfPresent(Date.self, forKey: .readByAllAt)
        deliveredCount = try c.decodeIfPresent(Int.self, forKey: .deliveredCount) ?? 0
        readCount = try c.decodeIfPresent(Int.self, forKey: .readCount) ?? 0
        // Legacy migration: merge old isViewOnce/isBlurred bools into effects
        if let legacyViewOnce = try c.decodeIfPresent(Bool.self, forKey: .isViewOnce), legacyViewOnce {
            effects.flags.insert(.viewOnce)
        }
        if let legacyBlurred = try c.decodeIfPresent(Bool.self, forKey: .isBlurred), legacyBlurred {
            effects.flags.insert(.blurred)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(conversationId, forKey: .conversationId)
        try c.encode(senderId, forKey: .senderId)
        try c.encode(content, forKey: .content)
        try c.encode(originalLanguage, forKey: .originalLanguage)
        try c.encode(messageType, forKey: .messageType)
        try c.encode(messageSource, forKey: .messageSource)
        try c.encode(isEdited, forKey: .isEdited)
        try c.encodeIfPresent(editedAt, forKey: .editedAt)
        try c.encodeIfPresent(deletedAt, forKey: .deletedAt)
        try c.encodeIfPresent(replyToId, forKey: .replyToId)
        try c.encodeIfPresent(forwardedFromId, forKey: .forwardedFromId)
        try c.encodeIfPresent(forwardedFromConversationId, forKey: .forwardedFromConversationId)
        try c.encodeIfPresent(expiresAt, forKey: .expiresAt)
        try c.encode(effects, forKey: .effects)
        try c.encodeIfPresent(maxViewOnceCount, forKey: .maxViewOnceCount)
        try c.encode(viewOnceCount, forKey: .viewOnceCount)
        try c.encodeIfPresent(pinnedAt, forKey: .pinnedAt)
        try c.encodeIfPresent(pinnedBy, forKey: .pinnedBy)
        try c.encode(isEncrypted, forKey: .isEncrypted)
        try c.encodeIfPresent(encryptionMode, forKey: .encryptionMode)
        try c.encode(createdAt, forKey: .createdAt)
        try c.encode(updatedAt, forKey: .updatedAt)
        try c.encode(attachments, forKey: .attachments)
        try c.encode(reactions, forKey: .reactions)
        try c.encodeIfPresent(replyTo, forKey: .replyTo)
        try c.encodeIfPresent(forwardedFrom, forKey: .forwardedFrom)
        try c.encodeIfPresent(senderName, forKey: .senderName)
        try c.encodeIfPresent(senderUsername, forKey: .senderUsername)
        try c.encodeIfPresent(senderColor, forKey: .senderColor)
        try c.encodeIfPresent(senderAvatarURL, forKey: .senderAvatarURL)
        try c.encodeIfPresent(senderUserId, forKey: .senderUserId)
        try c.encode(deliveryStatus, forKey: .deliveryStatus)
        try c.encode(isMe, forKey: .isMe)
        try c.encodeIfPresent(deliveredToAllAt, forKey: .deliveredToAllAt)
        try c.encodeIfPresent(readByAllAt, forKey: .readByAllAt)
        try c.encode(deliveredCount, forKey: .deliveredCount)
        try c.encode(readCount, forKey: .readCount)
    }

    public var text: String { content }
    public var timestamp: Date { createdAt }
    public var attachment: MeeshyMessageAttachment? { attachments.first }

    /// Whether the message is ephemeral and has not yet expired.
    public var isEphemeralActive: Bool {
        guard let expiresAt else { return false }
        return expiresAt > Date()
    }
}

public typealias MeeshyChatMessage = MeeshyMessage

// MARK: - Ephemeral Duration

public enum EphemeralDuration: Int, CaseIterable, Identifiable {
    case thirtySeconds = 30
    case oneMinute = 60
    case fiveMinutes = 300
    case oneHour = 3600
    case twentyFourHours = 86400

    public var id: Int { rawValue }

    public var label: String {
        switch self {
        case .thirtySeconds: return "30s"
        case .oneMinute: return "1min"
        case .fiveMinutes: return "5min"
        case .oneHour: return "1h"
        case .twentyFourHours: return "24h"
        }
    }

    public var displayLabel: String {
        switch self {
        case .thirtySeconds: return "30 secondes"
        case .oneMinute: return "1 minute"
        case .fiveMinutes: return "5 minutes"
        case .oneHour: return "1 heure"
        case .twentyFourHours: return "24 heures"
        }
    }

    public var expiresAt: Date {
        Date().addingTimeInterval(TimeInterval(rawValue))
    }
}

// MARK: - Message Attachment

public struct MeeshyMessageAttachment: Identifiable, Codable, Sendable {
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

    public static func image(color: String = "4ECDC4") -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(mimeType: "image/jpeg", thumbnailColor: color)
    }

    public static func video(durationMs: Int, color: String = "FF6B6B") -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(mimeType: "video/mp4", duration: durationMs, thumbnailColor: color)
    }

    public static func audio(durationMs: Int, color: String = "9B59B6") -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(mimeType: "audio/mpeg", duration: durationMs, thumbnailColor: color)
    }

    public static func file(name: String, size: Int, color: String = "F8B500") -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(fileName: name, originalName: name, mimeType: "application/octet-stream", fileSize: size, thumbnailColor: color)
    }

    public static func location(latitude: Double = 0, longitude: Double = 0, color: String = "2ECC71") -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(mimeType: "application/x-location", latitude: latitude, longitude: longitude, thumbnailColor: color)
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

public struct ReplyReference: Codable, Sendable {
    public let messageId: String
    public let authorName: String
    public let authorColor: String
    public let previewText: String
    public let isMe: Bool
    public let attachmentType: String?
    public let attachmentThumbnailUrl: String?
    public let isStoryReply: Bool

    public init(messageId: String = "", authorName: String, previewText: String, isMe: Bool = false, authorColor: String? = nil, attachmentType: String? = nil, attachmentThumbnailUrl: String? = nil, isStoryReply: Bool = false) {
        self.messageId = messageId
        self.authorName = authorName
        self.previewText = previewText
        self.isMe = isMe
        self.authorColor = authorColor ?? DynamicColorGenerator.colorForName(authorName)
        self.attachmentType = attachmentType
        self.attachmentThumbnailUrl = attachmentThumbnailUrl
        self.isStoryReply = isStoryReply
    }
}

// MARK: - Forward Reference

public struct ForwardReference: Codable, Sendable {
    public let originalMessageId: String
    public let senderName: String
    public let senderAvatar: String?
    public let previewText: String
    public let conversationId: String?
    public let conversationName: String?
    public let attachmentType: String?
    public let attachmentThumbnailUrl: String?

    public init(originalMessageId: String = "", senderName: String, senderAvatar: String? = nil,
                previewText: String, conversationId: String? = nil, conversationName: String? = nil,
                attachmentType: String? = nil, attachmentThumbnailUrl: String? = nil) {
        self.originalMessageId = originalMessageId
        self.senderName = senderName
        self.senderAvatar = senderAvatar
        self.previewText = previewText
        self.conversationId = conversationId
        self.conversationName = conversationName
        self.attachmentType = attachmentType
        self.attachmentThumbnailUrl = attachmentThumbnailUrl
    }
}

// MARK: - Reaction Model

public struct MeeshyReaction: Identifiable, Codable, Sendable {
    public let id: String
    public let messageId: String
    public var participantId: String?
    public let emoji: String
    public let createdAt: Date
    public var updatedAt: Date

    public init(id: String = UUID().uuidString, messageId: String, participantId: String? = nil,
                emoji: String, createdAt: Date = Date(), updatedAt: Date = Date()) {
        self.id = id; self.messageId = messageId; self.participantId = participantId
        self.emoji = emoji; self.createdAt = createdAt; self.updatedAt = updatedAt
    }

    @available(*, deprecated, renamed: "participantId")
    public var userId: String? { participantId }
}

// MARK: - Reaction Summary

public struct MeeshyReactionSummary: Sendable {
    public let emoji: String
    public let count: Int
    public let includesMe: Bool

    public init(emoji: String, count: Int, includesMe: Bool = false) {
        self.emoji = emoji; self.count = count; self.includesMe = includesMe
    }
}

public typealias MeeshyMessageReaction = MeeshyReactionSummary

// MARK: - Enriched Reaction Models

public struct ReactionUserDetail: Codable, Identifiable, Sendable {
    public let userId: String
    public let username: String
    public let avatar: String?
    public let createdAt: Date

    public var id: String { userId }

    public init(userId: String, username: String, avatar: String? = nil, createdAt: Date = Date()) {
        self.userId = userId
        self.username = username
        self.avatar = avatar
        self.createdAt = createdAt
    }
}

public struct ReactionGroup: Codable, Identifiable, Sendable {
    public let emoji: String
    public let count: Int
    public let users: [ReactionUserDetail]

    public var id: String { emoji }

    public init(emoji: String, count: Int, users: [ReactionUserDetail]) {
        self.emoji = emoji
        self.count = count
        self.users = users
    }
}

public struct ReactionSyncResponse: Codable, Sendable {
    public let messageId: String
    public let reactions: [ReactionGroup]
    public let totalCount: Int
    public let userReactions: [String]
}

// MARK: - Feed Item Model

public struct MeeshyFeedItem: Identifiable, Sendable {
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

// MARK: - Conversation Filter

public enum MeeshyConversationFilter: String, CaseIterable, Identifiable {
    case all = "Tous"
    case unread = "Non lus"
    case personnel = "Personnel"
    case privee = "Privee"
    case ouvertes = "Ouvertes"
    case globales = "Globales"
    case channels = "Channels"
    case favoris = "Favoris"
    case archived = "Archives"

    public var id: String { self.rawValue }

    public var color: String {
        switch self {
        case .all: return "4ECDC4"
        case .unread: return "FF6B6B"
        case .personnel: return "3498DB"
        case .privee: return "F8B500"
        case .ouvertes: return "2ECC71"
        case .globales: return "E74C3C"
        case .channels: return "1ABC9C"
        case .favoris: return "F59E0B"
        case .archived: return "9B59B6"
        }
    }
}

// MARK: - Shared Contact Model

public struct SharedContact: Codable, Identifiable, Sendable {
    public let id: String
    public let fullName: String
    public var phoneNumbers: [String]
    public var emails: [String]

    public init(id: String = UUID().uuidString, fullName: String, phoneNumbers: [String] = [], emails: [String] = []) {
        self.id = id
        self.fullName = fullName
        self.phoneNumbers = phoneNumbers
        self.emails = emails
    }
}

// MARK: - ConversationColorPalette Codable + Hashable

extension ConversationColorPalette: Codable, Hashable {
    enum CodingKeys: String, CodingKey {
        case primary, secondary, accent, saturationBoost
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let primary = try container.decode(String.self, forKey: .primary)
        let secondary = try container.decode(String.self, forKey: .secondary)
        let accent = try container.decode(String.self, forKey: .accent)
        let saturationBoost = try container.decode(Double.self, forKey: .saturationBoost)
        self.init(primary: primary, secondary: secondary, accent: accent, saturationBoost: saturationBoost)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(primary, forKey: .primary)
        try container.encode(secondary, forKey: .secondary)
        try container.encode(accent, forKey: .accent)
        try container.encode(saturationBoost, forKey: .saturationBoost)
    }

    public func hash(into hasher: inout Hasher) {
        hasher.combine(primary)
        hasher.combine(secondary)
        hasher.combine(accent)
        hasher.combine(saturationBoost)
    }

    public static func == (lhs: ConversationColorPalette, rhs: ConversationColorPalette) -> Bool {
        lhs.primary == rhs.primary && lhs.secondary == rhs.secondary
            && lhs.accent == rhs.accent && lhs.saturationBoost == rhs.saturationBoost
    }
}

// MARK: - CacheIdentifiable Conformance

extension MeeshyConversation: CacheIdentifiable {}
extension MeeshyMessage: CacheIdentifiable {}
