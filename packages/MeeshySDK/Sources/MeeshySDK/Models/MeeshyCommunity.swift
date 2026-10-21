import Foundation
import UIKit

public struct MeeshyCommunity: Identifiable, Hashable, Sendable {
    public let id: String
    public let identifier: String
    public let name: String
    public var description: String?
    public var avatar: String?
    public var avatarThumbHash: String?
    public var banner: String?
    public var bannerThumbHash: String?
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
                description: String? = nil, avatar: String? = nil, avatarThumbHash: String? = nil, banner: String? = nil, bannerThumbHash: String? = nil,
                isPrivate: Bool = true, isActive: Bool = true, deletedAt: Date? = nil,
                createdBy: String = "", createdAt: Date = Date(), updatedAt: Date = Date(),
                memberCount: Int = 0, conversationCount: Int = 0,
                emoji: String = "", color: String = "4ECDC4",
                theme: ConversationContext.ConversationTheme = .general,
                language: ConversationContext.ConversationLanguage = .french) {
        self.id = id; self.identifier = identifier; self.name = name
        self.description = description; self.avatar = avatar; self.avatarThumbHash = avatarThumbHash; self.banner = banner; self.bannerThumbHash = bannerThumbHash
        self.isPrivate = isPrivate; self.isActive = isActive; self.deletedAt = deletedAt
        self.createdBy = createdBy; self.createdAt = createdAt; self.updatedAt = updatedAt
        self.memberCount = memberCount; self.conversationCount = conversationCount
        self.emoji = emoji; self.color = color; self.theme = theme; self.language = language
    }
}
