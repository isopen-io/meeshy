import Foundation
import GRDB

public struct PostRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    public static let databaseTableName = "feed_posts"

    public var id: String
    public var authorId: String
    public var authorUsername: String?
    public var authorDisplayName: String?
    public var authorAvatarURL: String?
    public var type: String?
    public var content: String?
    public var originalLanguage: String?
    public var visibility: String?
    public var likeCount: Int
    public var commentCount: Int
    public var repostCount: Int
    public var viewCount: Int
    public var bookmarkCount: Int
    public var shareCount: Int
    public var isLikedByMe: Bool
    public var isPinned: Bool
    public var isEdited: Bool
    public var isQuote: Bool
    public var moodEmoji: String?
    public var audioUrl: String?
    public var audioDuration: Int?
    public var mediaJson: Data?
    public var reactionSummaryJson: Data?
    public var repostOfJson: Data?
    public var mentionedUsersJson: Data?
    public var translationsJson: Data?
    public var createdAt: Date
    public var updatedAt: Date?
    public var changeVersion: Int64

    public init(
        id: String, authorId: String,
        authorUsername: String?, authorDisplayName: String?,
        authorAvatarURL: String?, type: String?,
        content: String?, originalLanguage: String?,
        visibility: String?,
        likeCount: Int, commentCount: Int,
        repostCount: Int, viewCount: Int,
        bookmarkCount: Int, shareCount: Int,
        isLikedByMe: Bool, isPinned: Bool,
        isEdited: Bool, isQuote: Bool,
        moodEmoji: String?, audioUrl: String?, audioDuration: Int?,
        mediaJson: Data?, reactionSummaryJson: Data?,
        repostOfJson: Data?, mentionedUsersJson: Data?,
        translationsJson: Data?,
        createdAt: Date, updatedAt: Date?,
        changeVersion: Int64
    ) {
        self.id = id
        self.authorId = authorId
        self.authorUsername = authorUsername
        self.authorDisplayName = authorDisplayName
        self.authorAvatarURL = authorAvatarURL
        self.type = type
        self.content = content
        self.originalLanguage = originalLanguage
        self.visibility = visibility
        self.likeCount = likeCount
        self.commentCount = commentCount
        self.repostCount = repostCount
        self.viewCount = viewCount
        self.bookmarkCount = bookmarkCount
        self.shareCount = shareCount
        self.isLikedByMe = isLikedByMe
        self.isPinned = isPinned
        self.isEdited = isEdited
        self.isQuote = isQuote
        self.moodEmoji = moodEmoji
        self.audioUrl = audioUrl
        self.audioDuration = audioDuration
        self.mediaJson = mediaJson
        self.reactionSummaryJson = reactionSummaryJson
        self.repostOfJson = repostOfJson
        self.mentionedUsersJson = mentionedUsersJson
        self.translationsJson = translationsJson
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.changeVersion = changeVersion
    }
}

extension PostRecord: Equatable {
    public static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.id == rhs.id && lhs.changeVersion == rhs.changeVersion
    }
}
