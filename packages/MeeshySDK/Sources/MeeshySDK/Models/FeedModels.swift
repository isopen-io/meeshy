import Foundation

// MARK: - Feed Media Type
public enum FeedMediaType: String, Sendable, Codable {
    case image, video, audio, document, location
}

// MARK: - Post Translation
public struct PostTranslation: Sendable, Codable {
    public let text: String
    public let translationModel: String?
    public let confidenceScore: Double?

    public init(text: String, translationModel: String? = nil, confidenceScore: Double? = nil) {
        self.text = text
        self.translationModel = translationModel
        self.confidenceScore = confidenceScore
    }
}

// MARK: - Feed Media Model
public struct FeedMedia: Identifiable, Sendable, Codable {
    public let id: String
    public let type: FeedMediaType
    public let url: String?
    public let thumbnailColor: String
    public var width: Int?
    public var height: Int?
    public var duration: Int?
    public var fileName: String?
    public var fileSize: String?
    public var pageCount: Int?
    public var locationName: String?
    public var latitude: Double?
    public var longitude: Double?
    public var transcription: MessageTranscription?

    public init(id: String = UUID().uuidString, type: FeedMediaType, url: String? = nil, thumbnailColor: String = "4ECDC4",
                width: Int? = nil, height: Int? = nil, duration: Int? = nil,
                fileName: String? = nil, fileSize: String? = nil, pageCount: Int? = nil,
                locationName: String? = nil, latitude: Double? = nil, longitude: Double? = nil,
                transcription: MessageTranscription? = nil) {
        self.id = id; self.type = type; self.url = url; self.thumbnailColor = thumbnailColor
        self.width = width; self.height = height; self.duration = duration
        self.fileName = fileName; self.fileSize = fileSize; self.pageCount = pageCount
        self.locationName = locationName; self.latitude = latitude; self.longitude = longitude
        self.transcription = transcription
    }

    public static func image(color: String = "4ECDC4") -> FeedMedia {
        FeedMedia(type: .image, thumbnailColor: color, width: 1200, height: 800)
    }

    public static func image(url: String, color: String = "4ECDC4") -> FeedMedia {
        FeedMedia(type: .image, url: url, thumbnailColor: color, width: 1200, height: 800)
    }

    public static func video(duration: Int, color: String = "FF6B6B") -> FeedMedia {
        FeedMedia(type: .video, thumbnailColor: color, width: 1920, height: 1080, duration: duration)
    }

    public static func audio(duration: Int, color: String = "9B59B6") -> FeedMedia {
        FeedMedia(type: .audio, thumbnailColor: color, duration: duration)
    }

    public static func document(name: String, size: String, pages: Int, color: String = "F8B500") -> FeedMedia {
        FeedMedia(type: .document, thumbnailColor: color, fileName: name, fileSize: size, pageCount: pages)
    }

    public static func location(name: String, lat: Double, lon: Double, color: String = "2ECC71") -> FeedMedia {
        FeedMedia(type: .location, thumbnailColor: color, locationName: name, latitude: lat, longitude: lon)
    }

    public var durationFormatted: String? {
        guard let d = duration else { return nil }
        return String(format: "%d:%02d", d / 60, d % 60)
    }
}

// MARK: - Repost Content Model
public struct RepostContent: Identifiable, Sendable {
    public let id: String
    public let author: String
    public let authorId: String
    public let authorColor: String
    public let authorAvatarURL: String?
    public let content: String
    public let timestamp: Date
    public var likes: Int
    public let isQuote: Bool

    public init(id: String = UUID().uuidString, author: String, authorId: String = "", authorAvatarURL: String? = nil,
                content: String, timestamp: Date = Date(), likes: Int = 0, isQuote: Bool = false) {
        self.id = id; self.author = author; self.authorId = authorId
        self.authorColor = DynamicColorGenerator.colorForName(authorId.isEmpty ? author : authorId)
        self.authorAvatarURL = authorAvatarURL
        self.content = content; self.timestamp = timestamp; self.likes = likes
        self.isQuote = isQuote
    }
}

extension RepostContent: Codable {
    enum CodingKeys: String, CodingKey {
        case id, author, authorId, authorAvatarURL, content, timestamp, likes, isQuote
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        author = try c.decode(String.self, forKey: .author)
        authorId = try c.decode(String.self, forKey: .authorId)
        authorAvatarURL = try c.decodeIfPresent(String.self, forKey: .authorAvatarURL)
        content = try c.decode(String.self, forKey: .content)
        timestamp = try c.decode(Date.self, forKey: .timestamp)
        likes = try c.decode(Int.self, forKey: .likes)
        isQuote = try c.decode(Bool.self, forKey: .isQuote)
        authorColor = DynamicColorGenerator.colorForName(authorId.isEmpty ? author : authorId)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(author, forKey: .author)
        try c.encode(authorId, forKey: .authorId)
        try c.encodeIfPresent(authorAvatarURL, forKey: .authorAvatarURL)
        try c.encode(content, forKey: .content)
        try c.encode(timestamp, forKey: .timestamp)
        try c.encode(likes, forKey: .likes)
        try c.encode(isQuote, forKey: .isQuote)
    }
}

// MARK: - Feed Comment Model
public struct FeedComment: Identifiable, Sendable {
    public let id: String
    public let author: String
    public let authorId: String
    public let authorColor: String
    public let authorAvatarURL: String?
    public let content: String
    public let timestamp: Date
    public var likes: Int
    public var replies: Int
    public var originalLanguage: String?
    public var translatedContent: String?

    public var displayContent: String { translatedContent ?? content }

    public init(id: String = UUID().uuidString, author: String, authorId: String = "", authorAvatarURL: String? = nil,
                content: String, timestamp: Date = Date(), likes: Int = 0, replies: Int = 0,
                originalLanguage: String? = nil, translatedContent: String? = nil) {
        self.id = id; self.author = author; self.authorId = authorId
        self.authorColor = DynamicColorGenerator.colorForName(authorId.isEmpty ? author : authorId)
        self.authorAvatarURL = authorAvatarURL
        self.content = content; self.timestamp = timestamp; self.likes = likes; self.replies = replies
        self.originalLanguage = originalLanguage; self.translatedContent = translatedContent
    }
}

extension FeedComment: Codable {
    enum CodingKeys: String, CodingKey {
        case id, author, authorId, authorAvatarURL, content, timestamp, likes, replies
        case originalLanguage, translatedContent
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        author = try c.decode(String.self, forKey: .author)
        authorId = try c.decode(String.self, forKey: .authorId)
        authorAvatarURL = try c.decodeIfPresent(String.self, forKey: .authorAvatarURL)
        content = try c.decode(String.self, forKey: .content)
        timestamp = try c.decode(Date.self, forKey: .timestamp)
        likes = try c.decode(Int.self, forKey: .likes)
        replies = try c.decode(Int.self, forKey: .replies)
        originalLanguage = try c.decodeIfPresent(String.self, forKey: .originalLanguage)
        translatedContent = try c.decodeIfPresent(String.self, forKey: .translatedContent)
        authorColor = DynamicColorGenerator.colorForName(authorId.isEmpty ? author : authorId)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(author, forKey: .author)
        try c.encode(authorId, forKey: .authorId)
        try c.encodeIfPresent(authorAvatarURL, forKey: .authorAvatarURL)
        try c.encode(content, forKey: .content)
        try c.encode(timestamp, forKey: .timestamp)
        try c.encode(likes, forKey: .likes)
        try c.encode(replies, forKey: .replies)
        try c.encodeIfPresent(originalLanguage, forKey: .originalLanguage)
        try c.encodeIfPresent(translatedContent, forKey: .translatedContent)
    }
}

// MARK: - Feed Post Model
public struct FeedPost: Identifiable, Sendable {
    public let id: String
    public let author: String
    public let authorId: String
    public let authorColor: String
    public let authorAvatarURL: String?
    public let type: String?
    public let content: String
    public let timestamp: Date
    public var likes: Int
    public var isLiked: Bool = false
    public var comments: [FeedComment] = []
    public var commentCount: Int = 0
    public var repost: RepostContent? = nil
    public var repostAuthor: String? = nil
    public var isQuote: Bool = false
    public var media: [FeedMedia] = []
    public var originalLanguage: String?
    public var translations: [String: PostTranslation]?
    public var translatedContent: String?

    public var hasMedia: Bool { !media.isEmpty }
    public var mediaUrl: String? { media.first?.url }
    public var isTranslated: Bool { translatedContent != nil }
    public var displayContent: String { translatedContent ?? content }
    public var availableLanguages: [String] { Array(translations?.keys ?? [String: PostTranslation]().keys) }

    public init(id: String = UUID().uuidString, author: String, authorId: String = "", authorAvatarURL: String? = nil,
                type: String? = nil, content: String, timestamp: Date = Date(), likes: Int = 0,
                comments: [FeedComment] = [], commentCount: Int? = nil, repost: RepostContent? = nil, repostAuthor: String? = nil,
                isQuote: Bool = false, media: [FeedMedia] = [], mediaUrl: String? = nil,
                originalLanguage: String? = nil, translations: [String: PostTranslation]? = nil, translatedContent: String? = nil) {
        self.id = id; self.author = author; self.authorId = authorId
        let stableId = authorId.isEmpty ? author : authorId
        self.authorColor = DynamicColorGenerator.colorForPost(authorId: stableId, type: type, originalLanguage: originalLanguage)
        self.authorAvatarURL = authorAvatarURL; self.type = type
        self.content = content; self.timestamp = timestamp; self.likes = likes
        self.comments = comments; self.commentCount = commentCount ?? comments.count
        self.repost = repost; self.repostAuthor = repostAuthor
        self.isQuote = isQuote
        if !media.isEmpty { self.media = media }
        else if mediaUrl != nil { self.media = [.image()] }
        self.originalLanguage = originalLanguage; self.translations = translations; self.translatedContent = translatedContent
    }
}

extension FeedPost: Codable {
    enum CodingKeys: String, CodingKey {
        case id, author, authorId, authorAvatarURL, type, content, timestamp, likes, isLiked
        case comments, commentCount, repost, repostAuthor, isQuote, media
        case originalLanguage, translations, translatedContent
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        author = try c.decode(String.self, forKey: .author)
        authorId = try c.decode(String.self, forKey: .authorId)
        authorAvatarURL = try c.decodeIfPresent(String.self, forKey: .authorAvatarURL)
        type = try c.decodeIfPresent(String.self, forKey: .type)
        content = try c.decode(String.self, forKey: .content)
        timestamp = try c.decode(Date.self, forKey: .timestamp)
        likes = try c.decode(Int.self, forKey: .likes)
        isLiked = try c.decode(Bool.self, forKey: .isLiked)
        comments = try c.decode([FeedComment].self, forKey: .comments)
        commentCount = try c.decode(Int.self, forKey: .commentCount)
        repost = try c.decodeIfPresent(RepostContent.self, forKey: .repost)
        repostAuthor = try c.decodeIfPresent(String.self, forKey: .repostAuthor)
        isQuote = try c.decode(Bool.self, forKey: .isQuote)
        media = try c.decode([FeedMedia].self, forKey: .media)
        originalLanguage = try c.decodeIfPresent(String.self, forKey: .originalLanguage)
        translations = try c.decodeIfPresent([String: PostTranslation].self, forKey: .translations)
        translatedContent = try c.decodeIfPresent(String.self, forKey: .translatedContent)
        let stableId = authorId.isEmpty ? author : authorId
        authorColor = DynamicColorGenerator.colorForPost(authorId: stableId, type: type, originalLanguage: originalLanguage)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(author, forKey: .author)
        try c.encode(authorId, forKey: .authorId)
        try c.encodeIfPresent(authorAvatarURL, forKey: .authorAvatarURL)
        try c.encodeIfPresent(type, forKey: .type)
        try c.encode(content, forKey: .content)
        try c.encode(timestamp, forKey: .timestamp)
        try c.encode(likes, forKey: .likes)
        try c.encode(isLiked, forKey: .isLiked)
        try c.encode(comments, forKey: .comments)
        try c.encode(commentCount, forKey: .commentCount)
        try c.encodeIfPresent(repost, forKey: .repost)
        try c.encodeIfPresent(repostAuthor, forKey: .repostAuthor)
        try c.encode(isQuote, forKey: .isQuote)
        try c.encode(media, forKey: .media)
        try c.encodeIfPresent(originalLanguage, forKey: .originalLanguage)
        try c.encodeIfPresent(translations, forKey: .translations)
        try c.encodeIfPresent(translatedContent, forKey: .translatedContent)
    }
}

extension FeedPost: CacheIdentifiable {}
