import Foundation

// MARK: - User Stats

public struct UserStats: Decodable {
    public let totalMessages: Int
    public let totalConversations: Int
    public let totalTranslations: Int
    public let friendRequestsReceived: Int
    public let languagesUsed: Int
    public let memberDays: Int
    public let languages: [String]
    public let achievements: [Achievement]

    public init(
        totalMessages: Int = 0, totalConversations: Int = 0,
        totalTranslations: Int = 0, friendRequestsReceived: Int = 0,
        languagesUsed: Int = 0, memberDays: Int = 0,
        languages: [String] = [], achievements: [Achievement] = []
    ) {
        self.totalMessages = totalMessages; self.totalConversations = totalConversations
        self.totalTranslations = totalTranslations; self.friendRequestsReceived = friendRequestsReceived
        self.languagesUsed = languagesUsed; self.memberDays = memberDays
        self.languages = languages; self.achievements = achievements
    }
}

// MARK: - Achievement

public struct Achievement: Decodable, Identifiable {
    public let id: String
    public let name: String
    public let description: String
    public let icon: String
    public let color: String
    public let isUnlocked: Bool
    public let progress: Double
    public let threshold: Int
    public let current: Int

    public init(
        id: String, name: String, description: String,
        icon: String, color: String, isUnlocked: Bool = false,
        progress: Double = 0, threshold: Int = 0, current: Int = 0
    ) {
        self.id = id; self.name = name; self.description = description
        self.icon = icon; self.color = color; self.isUnlocked = isUnlocked
        self.progress = progress; self.threshold = threshold; self.current = current
    }
}

// MARK: - Timeline Point

public struct TimelinePoint: Decodable, Identifiable {
    public var id: String { date }
    public let date: String
    public let messages: Int

    public init(date: String, messages: Int) {
        self.date = date; self.messages = messages
    }
}
