import Foundation

// MARK: - Repost Content Model
public struct RepostContent: Identifiable, Sendable {
    public let id: String
    public let author: String
    public let authorId: String
    public let authorUsername: String?
    public let authorColor: String
    public let authorAvatarURL: String?
    /// Le contour équipé de l'auteur original (#10946), servi avec lui (#10945) ; `nil` sans contour.
    public var authorRing: ServedProfileDecorItem? = nil
    public let content: String
    public let timestamp: Date
    public var likes: Int
    public let isQuote: Bool
    /// Type of the reposted entity ("STORY" / "POST" / "STATUS"). Used by the
    /// feed cell to decide whether to render the embedded story canvas.
    public let type: String?
    public let originalLanguage: String?
    public let audioUrl: String?
    /// Mood emoji of the reposted STATUS (nil for non-status sources). Lets the
    /// feed quote-block render the mood instead of an empty body.
    public let moodEmoji: String?
    public let storyEffects: StoryEffects?
    public let media: [FeedMedia]
    public let translations: [String: PostTranslation]?
    public let originalRepostOfId: String?
    public let visibility: String?
    public let expiresAt: Date?
    /// Lieu attaché au post SOURCE (miroir de `FeedPost.location`) : sans lui,
    /// un repost perdait la position de l'original (reste ouvert du lot 2,
    /// clos 2026-07-30).
    public let location: SharedPlace?
    /// Les personnes que le post SOURCE nomme. `nil` = la charge utile n'en
    /// disait rien ; `[]` = elle affirme qu'il n'y en a aucune. Le renderer du
    /// texte cité s'appuie sur cette différence pour décider quoi linkifier.
    public let mentions: [PostReference]?

    /// Les pseudos que le texte cité a le droit de rendre cliquables — miroir
    /// exact de `FeedPost.validMentionUsernames`, même règle, même casse.
    ///
    /// `nil` se propage : sans avis sur les références du source, le renderer
    /// garde son comportement historique. C'est la seule valeur honnête — une
    /// liste vide affirmerait « personne n'est nommé », ce qu'une charge utile
    /// muette ne dit pas.
    public var validMentionUsernames: Set<String>? {
        mentions.map { Set($0.map { $0.username.lowercased() }) }
    }

    public init(id: String = UUID().uuidString, author: String, authorId: String = "",
                authorUsername: String? = nil, authorAvatarURL: String? = nil,
                content: String, timestamp: Date = Date(), likes: Int = 0, isQuote: Bool = false,
                type: String? = nil, originalLanguage: String? = nil, audioUrl: String? = nil,
                moodEmoji: String? = nil,
                storyEffects: StoryEffects? = nil, media: [FeedMedia] = [],
                translations: [String: PostTranslation]? = nil,
                originalRepostOfId: String? = nil, visibility: String? = nil,
                expiresAt: Date? = nil, location: SharedPlace? = nil,
                mentions: [PostReference]? = nil) {
        self.id = id; self.author = author; self.authorId = authorId
        self.authorUsername = authorUsername
        self.authorColor = DynamicColorGenerator.colorForName(authorId.isEmpty ? author : authorId)
        self.authorAvatarURL = authorAvatarURL
        self.content = content; self.timestamp = timestamp; self.likes = likes
        self.isQuote = isQuote
        self.type = type
        self.originalLanguage = originalLanguage
        self.audioUrl = audioUrl
        self.moodEmoji = moodEmoji
        self.storyEffects = storyEffects
        self.media = media
        self.translations = translations
        self.originalRepostOfId = originalRepostOfId
        self.visibility = visibility
        self.expiresAt = expiresAt
        self.location = location
        self.mentions = mentions
    }
}

extension RepostContent: Codable {
    enum CodingKeys: String, CodingKey {
        case id, author, authorId, authorUsername, authorAvatarURL, content, timestamp, likes, isQuote
        case type, originalLanguage, audioUrl, moodEmoji, storyEffects, media, translations
        case originalRepostOfId, visibility, expiresAt, location, mentions, authorRing
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        author = try c.decode(String.self, forKey: .author)
        authorId = try c.decode(String.self, forKey: .authorId)
        authorUsername = try c.decodeIfPresent(String.self, forKey: .authorUsername)
        authorAvatarURL = try c.decodeIfPresent(String.self, forKey: .authorAvatarURL)
        content = try c.decode(String.self, forKey: .content)
        timestamp = try c.decode(Date.self, forKey: .timestamp)
        likes = try c.decode(Int.self, forKey: .likes)
        isQuote = try c.decode(Bool.self, forKey: .isQuote)
        type = try c.decodeIfPresent(String.self, forKey: .type)
        originalLanguage = try c.decodeIfPresent(String.self, forKey: .originalLanguage)
        audioUrl = try c.decodeIfPresent(String.self, forKey: .audioUrl)
        moodEmoji = try c.decodeIfPresent(String.self, forKey: .moodEmoji)
        // Resilience: a single malformed `storyEffects` payload must NOT fail
        // the whole decode (RepostContent/FeedPost are decoded inside strict
        // arrays — one throwing entry would drop the entire feed page). Degrade
        // this entry to no effects (miroir de PostModels.swift:290-293).
        do {
            storyEffects = try c.decodeIfPresent(StoryEffects.self, forKey: .storyEffects)
        } catch {
            storyEffects = nil
        }
        media = try c.decodeIfPresent([FeedMedia].self, forKey: .media) ?? []
        translations = try c.decodeIfPresent([String: PostTranslation].self, forKey: .translations)
        originalRepostOfId = try c.decodeIfPresent(String.self, forKey: .originalRepostOfId)
        visibility = try c.decodeIfPresent(String.self, forKey: .visibility)
        expiresAt = try c.decodeIfPresent(Date.self, forKey: .expiresAt)
        location = try c.decodeIfPresent(SharedPlace.self, forKey: .location)
        mentions = try c.decodeIfPresent([PostReference].self, forKey: .mentions)
        authorRing = try? c.decodeIfPresent(ServedProfileDecorItem.self, forKey: .authorRing)
        authorColor = DynamicColorGenerator.colorForName(authorId.isEmpty ? author : authorId)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(author, forKey: .author)
        try c.encode(authorId, forKey: .authorId)
        try c.encodeIfPresent(authorUsername, forKey: .authorUsername)
        try c.encodeIfPresent(authorAvatarURL, forKey: .authorAvatarURL)
        try c.encode(content, forKey: .content)
        try c.encode(timestamp, forKey: .timestamp)
        try c.encode(likes, forKey: .likes)
        try c.encode(isQuote, forKey: .isQuote)
        try c.encodeIfPresent(type, forKey: .type)
        try c.encodeIfPresent(originalLanguage, forKey: .originalLanguage)
        try c.encodeIfPresent(audioUrl, forKey: .audioUrl)
        try c.encodeIfPresent(moodEmoji, forKey: .moodEmoji)
        try c.encodeIfPresent(storyEffects, forKey: .storyEffects)
        if !media.isEmpty { try c.encode(media, forKey: .media) }
        try c.encodeIfPresent(translations, forKey: .translations)
        try c.encodeIfPresent(originalRepostOfId, forKey: .originalRepostOfId)
        try c.encodeIfPresent(visibility, forKey: .visibility)
        try c.encodeIfPresent(expiresAt, forKey: .expiresAt)
        try c.encodeIfPresent(location, forKey: .location)
        try c.encodeIfPresent(mentions, forKey: .mentions)
        try c.encodeIfPresent(authorRing, forKey: .authorRing)
    }
}

// MARK: - Repost Reel Classification

public extension RepostContent {
    /// True when the reposted content is a reel (server-side `REEL` type is the
    /// single source of truth, mirroring `FeedPost.isReel`). Lets the feed cell
    /// render a rich reel preview instead of the empty text-only quote block.
    var isReel: Bool {
        (type ?? "").uppercased() == "REEL"
    }

    /// Media surfaced first when previewing a reposted reel: the first video,
    /// else the first audio, else the first image. `nil` when the repost is not a
    /// reel or carries no playable/visual media. Mirrors `FeedPost.primaryReelMedia`.
    var primaryReelMedia: FeedMedia? {
        guard isReel else { return nil }
        if let video = media.first(where: { $0.type == .video }) { return video }
        if let audio = media.first(where: { $0.type == .audio }) { return audio }
        return media.first(where: { $0.type == .image })
    }
}
