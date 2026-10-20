import Foundation
import GRDB

struct FeedV1PostsMigration: DatabaseMigration {
    let identifier = "feed_v1_posts"

    func migrate(_ db: Database) throws {
        try db.create(table: "feed_posts") { t in
            t.column("id", .text).primaryKey()
            t.column("authorId", .text).notNull()
            t.column("authorUsername", .text)
            t.column("authorDisplayName", .text)
            t.column("authorAvatarURL", .text)
            t.column("type", .text)
            t.column("content", .text)
            t.column("originalLanguage", .text)
            t.column("visibility", .text)
            t.column("likeCount", .integer).notNull().defaults(to: 0)
            t.column("commentCount", .integer).notNull().defaults(to: 0)
            t.column("repostCount", .integer).notNull().defaults(to: 0)
            t.column("viewCount", .integer).notNull().defaults(to: 0)
            t.column("bookmarkCount", .integer).notNull().defaults(to: 0)
            t.column("shareCount", .integer).notNull().defaults(to: 0)
            t.column("isLikedByMe", .boolean).notNull().defaults(to: false)
            t.column("isPinned", .boolean).notNull().defaults(to: false)
            t.column("isEdited", .boolean).notNull().defaults(to: false)
            t.column("isQuote", .boolean).notNull().defaults(to: false)
            t.column("moodEmoji", .text)
            t.column("audioUrl", .text)
            t.column("audioDuration", .integer)
            t.column("mediaJson", .blob)
            t.column("reactionSummaryJson", .blob)
            t.column("repostOfJson", .blob)
            t.column("mentionedUsersJson", .blob)
            t.column("translationsJson", .blob)
            t.column("createdAt", .datetime).notNull()
            t.column("updatedAt", .datetime)
            t.column("changeVersion", .integer).notNull().defaults(to: 0)
        }
        try db.create(index: "idx_feed_posts_date", on: "feed_posts", columns: ["createdAt"])
    }
}

struct FeedV1CommentsMigration: DatabaseMigration {
    let identifier = "feed_v1_comments"

    func migrate(_ db: Database) throws {
        try db.create(table: "feed_comments") { t in
            t.column("id", .text).primaryKey()
            t.column("postId", .text).notNull()
            t.column("parentId", .text)
            t.column("authorId", .text).notNull()
            t.column("authorUsername", .text)
            t.column("authorDisplayName", .text)
            t.column("authorAvatarURL", .text)
            t.column("content", .text).notNull()
            t.column("originalLanguage", .text)
            t.column("translatedContent", .text)
            t.column("likeCount", .integer).notNull().defaults(to: 0)
            t.column("replyCount", .integer).notNull().defaults(to: 0)
            t.column("effectFlags", .integer).notNull().defaults(to: 0)
            t.column("createdAt", .datetime).notNull()
            t.column("changeVersion", .integer).notNull().defaults(to: 0)
        }
        try db.create(index: "idx_comments_post", on: "feed_comments", columns: ["postId", "createdAt"])
        try db.create(index: "idx_comments_parent", on: "feed_comments", columns: ["parentId"])
    }
}

struct FeedV1TranslationsMigration: DatabaseMigration {
    let identifier = "feed_v1_translations"

    func migrate(_ db: Database) throws {
        try db.create(table: "feed_translations") { t in
            t.column("id", .text).primaryKey()
            t.column("postId", .text).notNull().indexed()
            t.column("targetLanguage", .text).notNull()
            t.column("translatedContent", .text).notNull()
            t.column("receivedAt", .datetime).notNull()
        }
    }
}

struct FeedV2CommentReactionsMigration: DatabaseMigration {
    let identifier = "feed_v2_comment_reactions"

    func migrate(_ db: Database) throws {
        try db.alter(table: "feed_comments") { t in
            t.add(column: "reactionSummaryJson", .blob)
        }
    }
}

struct FeedLocationMigration: DatabaseMigration {
    let identifier = "feed_location"

    func migrate(_ db: Database) throws {
        try db.alter(table: "feed_posts") { t in
            t.add(column: "locationJson", .text)
        }
        try db.alter(table: "feed_comments") { t in
            t.add(column: "locationJson", .text)
        }
    }
}

struct FeedV3CommentMediaMigration: DatabaseMigration {
    let identifier = "feed_v3_comment_media"

    func migrate(_ db: Database) throws {
        try db.alter(table: "feed_comments") { t in
            t.add(column: "mediaJson", .blob)
        }
    }
}

struct FeedV4PostAudienceMigration: DatabaseMigration {
    let identifier = "feed_v4_post_audience"

    func migrate(_ db: Database) throws {
        try db.alter(table: "feed_posts") { t in
            t.add(column: "visibilityUserIdsJson", .text)
        }
    }
}

struct FeedV5PostReachCountersMigration: DatabaseMigration {
    let identifier = "feed_v5_post_reach_counters"

    func migrate(_ db: Database) throws {
        try db.alter(table: "feed_posts") { t in
            t.add(column: "impressionCount", .integer)
            t.add(column: "postOpenCount", .integer)
            t.add(column: "playCount", .integer)
            t.add(column: "qualifiedViewCount", .integer)
        }
    }
}

struct FeedV6PostAuthorRingMigration: DatabaseMigration {
    let identifier = "feed_v6_post_author_ring"

    func migrate(_ db: Database) throws {
        try db.alter(table: "feed_posts") { t in
            t.add(column: "authorRingJson", .text)
        }
    }
}
