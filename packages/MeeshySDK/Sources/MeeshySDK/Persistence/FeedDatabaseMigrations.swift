import Foundation
import GRDB

public enum FeedDatabaseMigrations {

    public static func runAll(on db: any DatabaseWriter) throws {
        var migrator = DatabaseMigrator()
        registerAll(in: &migrator)
        try migrator.migrate(db)
    }

    public static func registerAll(in migrator: inout DatabaseMigrator) {
        migrator.registerMigration("feed_v1_posts") { db in
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

        migrator.registerMigration("feed_v1_comments") { db in
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

        migrator.registerMigration("feed_v1_translations") { db in
            try db.create(table: "feed_translations") { t in
                t.column("id", .text).primaryKey()
                t.column("postId", .text).notNull().indexed()
                t.column("targetLanguage", .text).notNull()
                t.column("translatedContent", .text).notNull()
                t.column("receivedAt", .datetime).notNull()
            }
        }

        // Durable per-emoji reaction counts on comments (mirrors `feed_posts`).
        // Without this column the live `comment:reaction-*` socket events had no
        // persistent home, so the aggregate count reverted to the last REST
        // snapshot on a cold start. Nullable blob → existing rows decode to `nil`.
        migrator.registerMigration("feed_v2_comment_reactions") { db in
            try db.alter(table: "feed_comments") { t in
                t.add(column: "reactionSummaryJson", .blob)
            }
        }
    }
}
