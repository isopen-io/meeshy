import Foundation

// MARK: - Story Effects
public struct StoryEffects: Decodable {
    public var background: String?
    public var textStyle: String?
    public var textColor: String?
    public var textPosition: String?
    public var filter: String?
    public var stickers: [String]?
    public var textAlign: String?
    public var textSize: CGFloat?
    public var textBg: String?
    public var textOffsetY: CGFloat?

    public init(background: String? = nil, textStyle: String? = nil, textColor: String? = nil,
                textPosition: String? = nil, filter: String? = nil, stickers: [String]? = nil,
                textAlign: String? = nil, textSize: CGFloat? = nil, textBg: String? = nil, textOffsetY: CGFloat? = nil) {
        self.background = background; self.textStyle = textStyle; self.textColor = textColor
        self.textPosition = textPosition; self.filter = filter; self.stickers = stickers
        self.textAlign = textAlign; self.textSize = textSize; self.textBg = textBg; self.textOffsetY = textOffsetY
    }
}

// MARK: - Story Item
public struct StoryItem: Identifiable {
    public let id: String
    public let content: String?
    public let media: [FeedMedia]
    public let storyEffects: StoryEffects?
    public let createdAt: Date
    public let expiresAt: Date?
    public var isViewed: Bool

    public var timeAgo: String {
        let seconds = Int(-createdAt.timeIntervalSinceNow)
        if seconds < 60 { return "now" }
        if seconds < 3600 { return "\(seconds / 60)m" }
        if seconds < 86400 { return "\(seconds / 3600)h" }
        return "\(seconds / 86400)d"
    }

    public init(id: String, content: String? = nil, media: [FeedMedia] = [], storyEffects: StoryEffects? = nil,
                createdAt: Date = Date(), expiresAt: Date? = nil, isViewed: Bool = false) {
        self.id = id; self.content = content; self.media = media; self.storyEffects = storyEffects
        self.createdAt = createdAt; self.expiresAt = expiresAt; self.isViewed = isViewed
    }
}

// MARK: - Story Group
public struct StoryGroup: Identifiable {
    public let id: String
    public let username: String
    public let avatarColor: String
    public let avatarURL: String?
    public let stories: [StoryItem]

    public var hasUnviewed: Bool { stories.contains { !$0.isViewed } }
    public var latestStory: StoryItem? { stories.last }

    public init(id: String, username: String, avatarColor: String, avatarURL: String? = nil, stories: [StoryItem]) {
        self.id = id; self.username = username; self.avatarColor = avatarColor; self.avatarURL = avatarURL; self.stories = stories
    }
}

// MARK: - Status Entry
public struct StatusEntry: Identifiable {
    public let id: String
    public let userId: String
    public let username: String
    public let avatarColor: String
    public let moodEmoji: String
    public let content: String?
    public let audioUrl: String?
    public let createdAt: Date
    public let expiresAt: Date?
    public var visibility: String?
    public var reactionSummary: [String: Int]?

    public var timeRemaining: String {
        guard let expires = expiresAt else { return "" }
        let seconds = Int(expires.timeIntervalSinceNow)
        if seconds <= 0 { return "expired" }
        if seconds < 60 { return "\(seconds)s" }
        return "\(seconds / 60)min"
    }

    public var timeAgo: String {
        let seconds = Int(-createdAt.timeIntervalSinceNow)
        if seconds < 5 { return "il y a quelques secondes" }
        if seconds < 60 { return "il y a \(seconds)s" }
        let minutes = seconds / 60
        if minutes < 60 { return "il y a \(minutes)min" }
        let hours = minutes / 60
        let remainingMin = minutes % 60
        if remainingMin == 0 { return "il y a \(hours)h" }
        return "il y a \(hours)h \(remainingMin)min"
    }

    public init(id: String, userId: String, username: String, avatarColor: String, moodEmoji: String,
                content: String? = nil, audioUrl: String? = nil, createdAt: Date = Date(),
                expiresAt: Date? = nil, visibility: String? = nil, reactionSummary: [String: Int]? = nil) {
        self.id = id; self.userId = userId; self.username = username; self.avatarColor = avatarColor
        self.moodEmoji = moodEmoji; self.content = content; self.audioUrl = audioUrl
        self.createdAt = createdAt; self.expiresAt = expiresAt; self.visibility = visibility
        self.reactionSummary = reactionSummary
    }
}

// MARK: - API -> Story Group Conversion
extension Array where Element == APIPost {
    public func toStoryGroups(currentUserId: String? = nil) -> [StoryGroup] {
        let storyPosts = self.filter { ($0.type ?? "").uppercased() == "STORY" }
        var grouped: [String: (author: APIAuthor, stories: [StoryItem])] = [:]

        for post in storyPosts {
            let authorId = post.author.id
            let media: [FeedMedia] = (post.media ?? []).map { m in
                FeedMedia(id: m.id, type: m.mediaType, url: m.fileUrl, thumbnailColor: "4ECDC4",
                          width: m.width, height: m.height, duration: m.duration.map { $0 / 1000 })
            }
            let item = StoryItem(id: post.id, content: post.content, media: media,
                                 createdAt: post.createdAt, expiresAt: post.updatedAt, isViewed: false)
            if var existing = grouped[authorId] {
                existing.stories.append(item); grouped[authorId] = existing
            } else {
                grouped[authorId] = (author: post.author, stories: [item])
            }
        }

        var groups = grouped.map { (authorId, data) in
            StoryGroup(id: authorId, username: data.author.name,
                       avatarColor: DynamicColorGenerator.colorForName(data.author.name),
                       avatarURL: data.author.avatar ?? data.author.avatarUrl,
                       stories: data.stories.sorted { $0.createdAt < $1.createdAt })
        }
        groups.sort { a, b in
            if let uid = currentUserId {
                if a.id == uid { return true }; if b.id == uid { return false }
            }
            if a.hasUnviewed != b.hasUnviewed { return a.hasUnviewed }
            return (a.latestStory?.createdAt ?? .distantPast) > (b.latestStory?.createdAt ?? .distantPast)
        }
        return groups
    }
}

// MARK: - API -> Status Entry Conversion
extension APIPost {
    public func toStatusEntry() -> StatusEntry? {
        guard (type ?? "").uppercased() == "STATUS", let emoji = moodEmoji else { return nil }
        return StatusEntry(id: id, userId: author.id, username: author.name,
                           avatarColor: DynamicColorGenerator.colorForName(author.name),
                           moodEmoji: emoji, content: content, audioUrl: audioUrl, createdAt: createdAt)
    }
}

// MARK: - Reply Context
public enum ReplyContext {
    case story(storyId: String, authorName: String, preview: String)
    case status(statusId: String, authorName: String, emoji: String, content: String?)

    public var toReplyReference: ReplyReference {
        switch self {
        case .story(_, let authorName, let preview):
            return ReplyReference(authorName: authorName, previewText: preview)
        case .status(_, let authorName, let emoji, let content):
            return ReplyReference(authorName: authorName, previewText: "\(emoji) \(content ?? "")")
        }
    }
}

// MARK: - Request Models
public struct ReactionRequest: Encodable {
    public let emoji: String
    public init(emoji: String) { self.emoji = emoji }
}

public struct RepostRequest: Encodable {
    public let content: String?
    public let isQuote: Bool?
    public init(content: String? = nil, isQuote: Bool? = nil) { self.content = content; self.isQuote = isQuote }
}

public struct StatusCreateRequest: Encodable {
    public let type = "STATUS"
    public let moodEmoji: String
    public let content: String?
    public let visibility: String
    public let visibilityUserIds: [String]?

    public init(moodEmoji: String, content: String?, visibility: String = "PUBLIC", visibilityUserIds: [String]? = nil) {
        self.moodEmoji = moodEmoji; self.content = content; self.visibility = visibility; self.visibilityUserIds = visibilityUserIds
    }
}

public struct StoryViewRequest: Encodable {
    public let viewed = true
    public init() {}
}
