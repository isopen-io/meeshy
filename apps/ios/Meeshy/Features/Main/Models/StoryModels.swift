import Foundation

// MARK: - Story Effects (decoded from API storyEffects JSON)

struct StoryEffects: Decodable {
    var background: String?
    var textStyle: String?
    var textColor: String?
    var textPosition: String?
    var filter: String?
    var stickers: [String]?
    // Extended text configuration
    var textAlign: String?
    var textSize: CGFloat?
    var textBg: String?
    var textOffsetY: CGFloat?

    init(
        background: String? = nil,
        textStyle: String? = nil,
        textColor: String? = nil,
        textPosition: String? = nil,
        filter: String? = nil,
        stickers: [String]? = nil,
        textAlign: String? = nil,
        textSize: CGFloat? = nil,
        textBg: String? = nil,
        textOffsetY: CGFloat? = nil
    ) {
        self.background = background
        self.textStyle = textStyle
        self.textColor = textColor
        self.textPosition = textPosition
        self.filter = filter
        self.stickers = stickers
        self.textAlign = textAlign
        self.textSize = textSize
        self.textBg = textBg
        self.textOffsetY = textOffsetY
    }
}

// MARK: - Story Item (single story within a group)

struct StoryItem: Identifiable {
    let id: String
    let content: String?
    let media: [FeedMedia]
    let storyEffects: StoryEffects?
    let createdAt: Date
    let expiresAt: Date?
    var isViewed: Bool

    var timeAgo: String {
        let seconds = Int(-createdAt.timeIntervalSinceNow)
        if seconds < 60 { return "now" }
        if seconds < 3600 { return "\(seconds / 60)m" }
        if seconds < 86400 { return "\(seconds / 3600)h" }
        return "\(seconds / 86400)d"
    }
}

// MARK: - Story Group (grouped by author)

struct StoryGroup: Identifiable {
    let id: String  // author userId
    let username: String
    let avatarColor: String
    let stories: [StoryItem]

    var hasUnviewed: Bool {
        stories.contains { !$0.isViewed }
    }

    var latestStory: StoryItem? {
        stories.last
    }
}

// MARK: - Status Entry (mood/status post)

struct StatusEntry: Identifiable {
    let id: String
    let userId: String
    let username: String
    let avatarColor: String
    let moodEmoji: String
    let content: String?
    let audioUrl: String?
    let createdAt: Date
    let expiresAt: Date?

    var timeRemaining: String {
        guard let expires = expiresAt else { return "" }
        let seconds = Int(expires.timeIntervalSinceNow)
        if seconds <= 0 { return "expired" }
        if seconds < 60 { return "\(seconds)s" }
        return "\(seconds / 60)min"
    }

    var timeAgo: String {
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
}

// MARK: - API → Story Group Conversion

extension Array where Element == APIPost {
    func toStoryGroups(currentUserId: String? = nil) -> [StoryGroup] {
        // Filter to STORY type only
        let storyPosts = self.filter { ($0.type ?? "").uppercased() == "STORY" }

        // Group by authorId
        var grouped: [String: (author: APIAuthor, stories: [StoryItem])] = [:]

        for post in storyPosts {
            let authorId = post.author.id
            let effects: StoryEffects? = nil // API doesn't decode nested JSON here; handled separately if needed

            let media: [FeedMedia] = (post.media ?? []).map { m in
                FeedMedia(
                    id: m.id,
                    type: m.mediaType,
                    url: m.fileUrl,
                    thumbnailColor: "4ECDC4",
                    width: m.width,
                    height: m.height,
                    duration: m.duration.map { $0 / 1000 }
                )
            }

            let item = StoryItem(
                id: post.id,
                content: post.content,
                media: media,
                storyEffects: effects,
                createdAt: post.createdAt,
                expiresAt: post.updatedAt, // API uses updatedAt or a separate expiresAt field
                isViewed: false
            )

            if var existing = grouped[authorId] {
                existing.stories.append(item)
                grouped[authorId] = existing
            } else {
                grouped[authorId] = (author: post.author, stories: [item])
            }
        }

        // Build groups
        var groups = grouped.map { (authorId, data) in
            StoryGroup(
                id: authorId,
                username: data.author.name,
                avatarColor: DynamicColorGenerator.colorForName(data.author.name),
                stories: data.stories.sorted { $0.createdAt < $1.createdAt }
            )
        }

        // Sort: own first, then unviewed, then by recency
        groups.sort { a, b in
            if let uid = currentUserId {
                if a.id == uid { return true }
                if b.id == uid { return false }
            }
            if a.hasUnviewed != b.hasUnviewed { return a.hasUnviewed }
            return (a.latestStory?.createdAt ?? .distantPast) > (b.latestStory?.createdAt ?? .distantPast)
        }

        return groups
    }
}

// MARK: - API → Status Entry Conversion

extension APIPost {
    func toStatusEntry() -> StatusEntry? {
        guard (type ?? "").uppercased() == "STATUS",
              let emoji = moodEmoji else { return nil }
        return StatusEntry(
            id: id,
            userId: author.id,
            username: author.name,
            avatarColor: DynamicColorGenerator.colorForName(author.name),
            moodEmoji: emoji,
            content: content,
            audioUrl: audioUrl,
            createdAt: createdAt,
            expiresAt: nil
        )
    }
}

// MARK: - Reply Context (for story/status replies)

enum ReplyContext {
    case story(storyId: String, authorName: String, preview: String)
    case status(statusId: String, authorName: String, emoji: String, content: String?)

    var toReplyReference: ReplyReference {
        switch self {
        case .story(_, let authorName, let preview):
            return ReplyReference(authorName: authorName, previewText: preview)
        case .status(_, let authorName, let emoji, let content):
            let previewText = "\(emoji) \(content ?? "")"
            return ReplyReference(authorName: authorName, previewText: previewText)
        }
    }
}

// MARK: - Reaction Request

struct ReactionRequest: Encodable {
    let emoji: String
}

// MARK: - Repost Request

struct RepostRequest: Encodable {
    let content: String?
    let isQuote: Bool?
}

// MARK: - Status Create Request

struct StatusCreateRequest: Encodable {
    let type = "STATUS"
    let moodEmoji: String
    let content: String?
    let visibility: String = "PUBLIC"
}

// MARK: - Story View Request

struct StoryViewRequest: Encodable {
    let viewed = true
}
