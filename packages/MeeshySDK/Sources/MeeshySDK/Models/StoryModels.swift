import Foundation

// MARK: - Story Text Style

public enum StoryTextStyle: String, Codable, CaseIterable, Sendable {
    case bold
    case neon
    case typewriter
    case handwriting
    case classic

    public var displayName: String {
        switch self {
        case .bold: return "Bold"
        case .neon: return "Neon"
        case .typewriter: return "Typewriter"
        case .handwriting: return "Handwriting"
        case .classic: return "Classic"
        }
    }

    public var fontName: String? {
        switch self {
        case .bold: return nil
        case .neon: return nil
        case .typewriter: return "Courier"
        case .handwriting: return "SnellRoundhand"
        case .classic: return "Georgia"
        }
    }

    public var fontWeight: Int {
        switch self {
        case .bold: return 800
        case .neon: return 600
        case .typewriter: return 400
        case .handwriting: return 400
        case .classic: return 500
        }
    }
}

// MARK: - Story Filter

public enum StoryFilter: String, Codable, CaseIterable, Sendable {
    case vintage
    case bw
    case warm
    case cool
    case dramatic

    public var displayName: String {
        switch self {
        case .vintage: return "Vintage"
        case .bw: return "N&B"
        case .warm: return "Warm"
        case .cool: return "Cool"
        case .dramatic: return "Dramatic"
        }
    }

    public var ciFilterName: String {
        switch self {
        case .vintage: return "CIPhotoEffectTransfer"
        case .bw: return "CIPhotoEffectNoir"
        case .warm: return "CIColorControls"
        case .cool: return "CIColorControls"
        case .dramatic: return "CIPhotoEffectProcess"
        }
    }
}

// MARK: - Story Text Position

public struct StoryTextPosition: Codable, Sendable {
    public var x: CGFloat
    public var y: CGFloat

    public init(x: CGFloat = 0.5, y: CGFloat = 0.5) {
        self.x = x; self.y = y
    }

    public static let center = StoryTextPosition(x: 0.5, y: 0.5)
    public static let top = StoryTextPosition(x: 0.5, y: 0.2)
    public static let bottom = StoryTextPosition(x: 0.5, y: 0.8)
}

// MARK: - Story Sticker

public struct StorySticker: Codable, Identifiable, Sendable {
    public var id: String
    public var emoji: String
    public var x: CGFloat
    public var y: CGFloat
    public var scale: CGFloat
    public var rotation: CGFloat

    public init(id: String = UUID().uuidString, emoji: String, x: CGFloat = 0.5, y: CGFloat = 0.5,
                scale: CGFloat = 1.0, rotation: CGFloat = 0) {
        self.id = id; self.emoji = emoji; self.x = x; self.y = y
        self.scale = scale; self.rotation = rotation
    }
}

// MARK: - Story Slide

public struct StorySlide: Identifiable, Codable, Sendable {
    public var id: String
    public var mediaURL: String?
    public var mediaData: Data?
    public var content: String?
    public var effects: StoryEffects
    public var duration: TimeInterval
    public var order: Int

    public init(id: String = UUID().uuidString, mediaURL: String? = nil, mediaData: Data? = nil,
                content: String? = nil, effects: StoryEffects = StoryEffects(),
                duration: TimeInterval = 5, order: Int = 0) {
        self.id = id; self.mediaURL = mediaURL; self.mediaData = mediaData
        self.content = content; self.effects = effects
        self.duration = duration; self.order = order
    }

    enum CodingKeys: String, CodingKey {
        case id, mediaURL, content, effects, duration, order
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        mediaURL = try container.decodeIfPresent(String.self, forKey: .mediaURL)
        mediaData = nil
        content = try container.decodeIfPresent(String.self, forKey: .content)
        effects = try container.decodeIfPresent(StoryEffects.self, forKey: .effects) ?? StoryEffects()
        duration = try container.decodeIfPresent(TimeInterval.self, forKey: .duration) ?? 5
        order = try container.decodeIfPresent(Int.self, forKey: .order) ?? 0
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encodeIfPresent(mediaURL, forKey: .mediaURL)
        try container.encodeIfPresent(content, forKey: .content)
        try container.encode(effects, forKey: .effects)
        try container.encode(duration, forKey: .duration)
        try container.encode(order, forKey: .order)
    }
}

// MARK: - Story Effects

public struct StoryEffects: Codable, Sendable {
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
    public var stickerObjects: [StorySticker]?
    public var textPositionPoint: StoryTextPosition?
    public var drawingData: Data?
    public var musicTrackId: String?
    public var musicStartTime: TimeInterval?
    public var musicEndTime: TimeInterval?

    public init(background: String? = nil, textStyle: String? = nil, textColor: String? = nil,
                textPosition: String? = nil, filter: String? = nil, stickers: [String]? = nil,
                textAlign: String? = nil, textSize: CGFloat? = nil, textBg: String? = nil, textOffsetY: CGFloat? = nil,
                stickerObjects: [StorySticker]? = nil, textPositionPoint: StoryTextPosition? = nil,
                drawingData: Data? = nil, musicTrackId: String? = nil,
                musicStartTime: TimeInterval? = nil, musicEndTime: TimeInterval? = nil) {
        self.background = background; self.textStyle = textStyle; self.textColor = textColor
        self.textPosition = textPosition; self.filter = filter; self.stickers = stickers
        self.textAlign = textAlign; self.textSize = textSize; self.textBg = textBg; self.textOffsetY = textOffsetY
        self.stickerObjects = stickerObjects; self.textPositionPoint = textPositionPoint
        self.drawingData = drawingData; self.musicTrackId = musicTrackId
        self.musicStartTime = musicStartTime; self.musicEndTime = musicEndTime
    }

    public var parsedTextStyle: StoryTextStyle? {
        guard let raw = textStyle else { return nil }
        return StoryTextStyle(rawValue: raw)
    }

    public var parsedFilter: StoryFilter? {
        guard let raw = filter else { return nil }
        return StoryFilter(rawValue: raw)
    }

    public var resolvedTextPosition: StoryTextPosition {
        if let point = textPositionPoint { return point }
        switch textPosition {
        case "top": return .top
        case "bottom": return .bottom
        default: return .center
        }
    }

    public func toJSON() -> [String: Any] {
        var dict: [String: Any] = [:]
        if let bg = background { dict["background"] = bg }
        if let ts = textStyle { dict["textStyle"] = ts }
        if let tc = textColor { dict["textColor"] = tc }
        if let tp = textPositionPoint {
            dict["textPosition"] = ["x": tp.x, "y": tp.y]
        } else if let tp = textPosition {
            dict["textPosition"] = tp
        }
        if let f = filter { dict["filter"] = f }
        if let so = stickerObjects, !so.isEmpty {
            dict["stickers"] = so.map { s in
                ["emoji": s.emoji, "x": s.x, "y": s.y, "scale": s.scale, "rotation": s.rotation] as [String: Any]
            }
        } else if let st = stickers { dict["stickers"] = st }
        return dict
    }
}

// MARK: - Post Type

public enum PostType: String, CaseIterable, Sendable {
    case post = "POST"
    case story = "STORY"
    case status = "STATUS"

    public var displayName: String {
        switch self {
        case .post: return "Post"
        case .story: return "Story"
        case .status: return "Status"
        }
    }

    public var icon: String {
        switch self {
        case .post: return "square.and.pencil"
        case .story: return "camera.fill"
        case .status: return "face.smiling"
        }
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
    public let repostOfId: String?
    public var isViewed: Bool

    public var timeAgo: String {
        let seconds = Int(-createdAt.timeIntervalSinceNow)
        if seconds < 60 { return "now" }
        if seconds < 3600 { return "\(seconds / 60)m" }
        if seconds < 86400 { return "\(seconds / 3600)h" }
        return "\(seconds / 86400)d"
    }

    public init(id: String, content: String? = nil, media: [FeedMedia] = [], storyEffects: StoryEffects? = nil,
                createdAt: Date = Date(), expiresAt: Date? = nil, repostOfId: String? = nil, isViewed: Bool = false) {
        self.id = id; self.content = content; self.media = media; self.storyEffects = storyEffects
        self.createdAt = createdAt; self.expiresAt = expiresAt; self.repostOfId = repostOfId; self.isViewed = isViewed
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
                                 createdAt: post.createdAt, expiresAt: post.updatedAt,
                                 repostOfId: post.repostOf?.id, isViewed: false)
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
