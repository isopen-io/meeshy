import Foundation

// MARK: - User Stats

public struct UserStats: Codable, Sendable, CacheIdentifiable {
    public var id: String { "current" }
    public let totalMessages: Int
    public let totalConversations: Int
    public let totalTranslations: Int
    public let friendRequestsReceived: Int
    public let languagesUsed: Int
    public let memberDays: Int
    /// Compteurs de contenu du profil (bandeau Postes/Réels/Stories) — `nil`
    /// tant que le gateway ne les fournit pas (vieux serveur). `storiesCount`
    /// compte TOUTES les stories non supprimées de l'auteur, expirées comprises
    /// (archive) — la valeur dérivée côté client était structurellement 0.
    public let postsCount: Int?
    public let reelsCount: Int?
    public let storiesCount: Int?
    public let languages: [String]
    public let achievements: [Achievement]
    /// « Mes contenus » (#19469, #19470) : mes messages favoris, mes publications enregistrées et mes packs — `nil`
    /// tant que la passerelle ne les sert pas ; la rangée garde alors son chevron sans chiffre.
    public let starredMessagesCount: Int?
    public let bookmarksCount: Int?
    public let packsCount: Int?

    public init(
        totalMessages: Int = 0, totalConversations: Int = 0,
        totalTranslations: Int = 0, friendRequestsReceived: Int = 0,
        languagesUsed: Int = 0, memberDays: Int = 0,
        postsCount: Int? = nil, reelsCount: Int? = nil, storiesCount: Int? = nil,
        languages: [String] = [], achievements: [Achievement] = [],
        starredMessagesCount: Int? = nil, bookmarksCount: Int? = nil, packsCount: Int? = nil
    ) {
        self.totalMessages = totalMessages; self.totalConversations = totalConversations
        self.totalTranslations = totalTranslations; self.friendRequestsReceived = friendRequestsReceived
        self.languagesUsed = languagesUsed; self.memberDays = memberDays
        self.postsCount = postsCount; self.reelsCount = reelsCount; self.storiesCount = storiesCount
        self.languages = languages; self.achievements = achievements
        self.starredMessagesCount = starredMessagesCount; self.bookmarksCount = bookmarksCount; self.packsCount = packsCount
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        totalMessages = (try? container.decode(Int.self, forKey: .totalMessages)) ?? 0
        totalConversations = (try? container.decode(Int.self, forKey: .totalConversations)) ?? 0
        totalTranslations = (try? container.decode(Int.self, forKey: .totalTranslations)) ?? 0
        friendRequestsReceived = (try? container.decode(Int.self, forKey: .friendRequestsReceived)) ?? 0
        languagesUsed = (try? container.decode(Int.self, forKey: .languagesUsed)) ?? 0
        memberDays = (try? container.decode(Int.self, forKey: .memberDays)) ?? 0
        postsCount = try? container.decode(Int.self, forKey: .postsCount)
        reelsCount = try? container.decode(Int.self, forKey: .reelsCount)
        storiesCount = try? container.decode(Int.self, forKey: .storiesCount)
        languages = (try? container.decode([String].self, forKey: .languages)) ?? []
        achievements = (try? container.decode([Achievement].self, forKey: .achievements)) ?? []
        starredMessagesCount = Self.count(container, .starredMessagesCount)
        bookmarksCount = Self.count(container, .bookmarksCount)
        packsCount = Self.count(container, .packsCount)
    }

    /// Un compteur servi négatif ou illisible se lit absent : jamais un chiffre inventé.
    private static func count(_ container: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys) -> Int? {
        guard let value = try? container.decode(Int.self, forKey: key), value >= 0 else { return nil }
        return value
    }

    enum CodingKeys: String, CodingKey {
        case totalMessages, totalConversations, totalTranslations
        case friendRequestsReceived, languagesUsed, memberDays
        case postsCount, reelsCount, storiesCount
        case languages, achievements
        case starredMessagesCount, bookmarksCount, packsCount
    }
}

// MARK: - Achievement

public struct Achievement: Codable, Identifiable, Sendable {
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

public struct TimelinePoint: Codable, Identifiable, CacheIdentifiable {
    public var id: String { date }
    public let date: String
    public let messages: Int

    public init(date: String, messages: Int) {
        self.date = date; self.messages = messages
    }
}
