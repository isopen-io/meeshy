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
}

extension PostRecord: Equatable {
    public static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.id == rhs.id && lhs.changeVersion == rhs.changeVersion
    }
}
