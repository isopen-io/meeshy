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

    public init(
        id: String, postId: String, parentId: String?,
        authorId: String, authorUsername: String?,
        authorDisplayName: String?, authorAvatarURL: String?,
        content: String, originalLanguage: String?,
        translatedContent: String?,
        likeCount: Int, replyCount: Int, effectFlags: Int,
        createdAt: Date, changeVersion: Int64
    ) {
        self.id = id
        self.postId = postId
        self.parentId = parentId
        self.authorId = authorId
        self.authorUsername = authorUsername
        self.authorDisplayName = authorDisplayName
        self.authorAvatarURL = authorAvatarURL
        self.content = content
        self.originalLanguage = originalLanguage
        self.translatedContent = translatedContent
        self.likeCount = likeCount
        self.replyCount = replyCount
        self.effectFlags = effectFlags
        self.createdAt = createdAt
        self.changeVersion = changeVersion
    }
}

extension CommentRecord: Equatable {
    public static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.id == rhs.id && lhs.changeVersion == rhs.changeVersion
    }
}
