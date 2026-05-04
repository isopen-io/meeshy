import Foundation
import GRDB

public struct CommentRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    public static let databaseTableName = "feed_comments"

    public var id: String
    public var postId: String
    public var parentId: String?
    public var authorId: String
    public var authorUsername: String?
    public var authorDisplayName: String?
    public var authorAvatarURL: String?
    public var content: String
    public var originalLanguage: String?
    public var translatedContent: String?
    public var likeCount: Int
    public var replyCount: Int
    public var effectFlags: Int
    public var createdAt: Date
    public var changeVersion: Int64
}

extension CommentRecord: Equatable {
    public static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.id == rhs.id && lhs.changeVersion == rhs.changeVersion
    }
}
