import Foundation
import GRDB

/// Notification posted after FeedPersistenceActor commits a write that may
/// have changed the feed posts or comments. `FeedStore` and `CommentStore`
/// listen for this notification instead of using GRDB observation, which
/// crashes under Swift 6 strict concurrency interop with the GRDB Swift
/// module: passing any `@Sendable` closure to GRDB triggers
/// `_swift_task_checkIsolatedSwift` at invocation from GRDB's dispatch
/// queues. See the explanatory comment in
/// `apps/ios/Meeshy/Features/Main/Stores/MessageStore.swift` for context.
public extension Notification.Name {
    static let feedStoreShouldRefresh = Notification.Name("me.meeshy.feedStore.shouldRefresh")
}

/// Posts the `feedStoreShouldRefresh` notification on the main thread after
/// any write through `FeedPersistenceActor` that may affect the displayed
/// feed or comment list. The feed is a single global stream, so no scope
/// payload is required.
fileprivate func postFeedStoreRefresh() {
    DispatchQueue.main.async {
        NotificationCenter.default.post(
            name: .feedStoreShouldRefresh,
            object: nil
        )
    }
}

public actor FeedPersistenceActor {
    private let dbWriter: any DatabaseWriter

    public init(dbWriter: any DatabaseWriter) {
        self.dbWriter = dbWriter
    }

    // MARK: - Post Writes

    public func insertPost(_ record: PostRecord) throws {
        try dbWriter.write { db in try record.save(db) }
        postFeedStoreRefresh()
    }

    public func insertPosts(_ records: [PostRecord]) throws {
        try dbWriter.write { db in
            for record in records { try record.save(db) }
        }
        postFeedStoreRefresh()
    }

    public func updateLikeCount(postId: String, count: Int, isLikedByMe: Bool) throws {
        try dbWriter.write { db in
            try db.execute(
                sql: """
                    UPDATE feed_posts SET likeCount = ?, isLikedByMe = ?,
                    changeVersion = changeVersion + 1 WHERE id = ?
                    """,
                arguments: [count, isLikedByMe, postId]
            )
        }
        postFeedStoreRefresh()
    }

    public func updateCommentCount(postId: String, count: Int) throws {
        try dbWriter.write { db in
            try db.execute(
                sql: """
                    UPDATE feed_posts SET commentCount = ?,
                    changeVersion = changeVersion + 1 WHERE id = ?
                    """,
                arguments: [count, postId]
            )
        }
        postFeedStoreRefresh()
    }

    public func deletePost(id: String) throws {
        try dbWriter.write { db in
            try db.execute(sql: "DELETE FROM feed_posts WHERE id = ?", arguments: [id])
        }
        postFeedStoreRefresh()
    }

    // MARK: - Comment Writes

    public func insertComment(_ record: CommentRecord) throws {
        try dbWriter.write { db in try record.save(db) }
        postFeedStoreRefresh()
    }

    public func deleteComment(id: String) throws {
        try dbWriter.write { db in
            try db.execute(sql: "DELETE FROM feed_comments WHERE id = ?", arguments: [id])
        }
        postFeedStoreRefresh()
    }

    public func updateCommentLikeCount(commentId: String, count: Int) throws {
        try dbWriter.write { db in
            try db.execute(
                sql: """
                    UPDATE feed_comments SET likeCount = ?,
                    changeVersion = changeVersion + 1 WHERE id = ?
                    """,
                arguments: [count, commentId]
            )
        }
        postFeedStoreRefresh()
    }

    /// Met à jour le compteur d'UNE réaction emoji d'un post dans le cache local
    /// (`reactionSummaryJson`, un dict `[emoji: count]`). Reçu via
    /// `post:reaction-added` / `post:reaction-removed` : le payload porte le compte
    /// ABSOLU de cet emoji après l'action, donc l'écriture est idempotente — une
    /// double livraison réécrit exactement la même valeur. `count <= 0` retire
    /// l'emoji du dict. Sans ce write, le compteur de réactions revenait à sa
    /// valeur cache au redémarrage de l'app. Miroir de `upsertPostTranslation`.
    public func updatePostReactionSummary(postId: String, emoji: String, count: Int) throws {
        try dbWriter.write { db in
            let existingData = try Data.fetchOne(db, sql: "SELECT reactionSummaryJson FROM feed_posts WHERE id = ?", arguments: [postId])
            var summary: [String: Int] = [:]
            if let existingData {
                summary = (try? JSONDecoder().decode([String: Int].self, from: existingData)) ?? [:]
            }
            if count > 0 { summary[emoji] = count } else { summary.removeValue(forKey: emoji) }
            let updatedData = try? JSONEncoder().encode(summary)
            try db.execute(
                sql: """
                    UPDATE feed_posts SET reactionSummaryJson = ?,
                    changeVersion = changeVersion + 1 WHERE id = ?
                    """,
                arguments: [updatedData, postId]
            )
        }
        postFeedStoreRefresh()
    }

    /// Met à jour le compteur d'UNE réaction emoji d'un commentaire dans le cache
    /// local (`reactionSummaryJson`, un dict `[emoji: count]`). Reçu via
    /// `comment:reaction-added` / `comment:reaction-removed` : le payload porte le
    /// compte ABSOLU de cet emoji après l'action, donc l'écriture est idempotente —
    /// une double livraison (feed room + post room) réécrit la même valeur. `count
    /// <= 0` retire l'emoji du dict. Miroir exact de `updatePostReactionSummary`.
    public func updateCommentReactionSummary(commentId: String, emoji: String, count: Int) throws {
        try dbWriter.write { db in
            let existingData = try Data.fetchOne(db, sql: "SELECT reactionSummaryJson FROM feed_comments WHERE id = ?", arguments: [commentId])
            var summary: [String: Int] = [:]
            if let existingData {
                summary = (try? JSONDecoder().decode([String: Int].self, from: existingData)) ?? [:]
            }
            if count > 0 { summary[emoji] = count } else { summary.removeValue(forKey: emoji) }
            let updatedData = try? JSONEncoder().encode(summary)
            try db.execute(
                sql: """
                    UPDATE feed_comments SET reactionSummaryJson = ?,
                    changeVersion = changeVersion + 1 WHERE id = ?
                    """,
                arguments: [updatedData, commentId]
            )
        }
        postFeedStoreRefresh()
    }

    /// Remplace l'INTÉGRALITÉ du dict de réactions d'un commentaire — reçu via le
    /// `comment:reaction-request-sync` ACK qui porte l'état autoritaire complet
    /// (toutes les agrégations emoji). Les emoji à 0 sont écartés. Idempotent.
    public func replaceCommentReactionSummary(commentId: String, counts: [String: Int]) throws {
        let cleaned = counts.filter { $0.value > 0 }
        try dbWriter.write { db in
            let updatedData = cleaned.isEmpty ? nil : (try? JSONEncoder().encode(cleaned))
            try db.execute(
                sql: """
                    UPDATE feed_comments SET reactionSummaryJson = ?,
                    changeVersion = changeVersion + 1 WHERE id = ?
                    """,
                arguments: [updatedData, commentId]
            )
        }
        postFeedStoreRefresh()
    }

    public func upsertPostTranslation(postId: String, language: String, translatedText: String) throws {
        try dbWriter.write { db in
            let existingData = try Data.fetchOne(db, sql: "SELECT translationsJson FROM feed_posts WHERE id = ?", arguments: [postId])
            var translations: [String: String] = [:]
            if let existingData {
                translations = (try? JSONDecoder().decode([String: String].self, from: existingData)) ?? [:]
            }
            translations[language] = translatedText
            let updatedData = try? JSONEncoder().encode(translations)
            try db.execute(
                sql: """
                    UPDATE feed_posts SET translationsJson = ?,
                    changeVersion = changeVersion + 1 WHERE id = ?
                    """,
                arguments: [updatedData, postId]
            )
        }
        postFeedStoreRefresh()
    }

    // MARK: - Reads (nonisolated)

    public nonisolated var reader: any DatabaseWriter { dbWriter }

    public nonisolated func posts(cursor: Date? = nil, limit: Int = 20) throws -> [PostRecord] {
        try dbWriter.read { db in
            var query = PostRecord.order(Column("createdAt").desc).limit(limit)
            if let cursor { query = query.filter(Column("createdAt") < cursor) }
            return try query.fetchAll(db)
        }
    }

    public nonisolated func comments(forPostId postId: String, parentId: String? = nil,
                                      cursor: Date? = nil, limit: Int = 20) throws -> [CommentRecord] {
        try dbWriter.read { db in
            var query = CommentRecord
                .filter(Column("postId") == postId)
                .order(Column("createdAt").desc)
                .limit(limit)
            if let parentId {
                query = query.filter(Column("parentId") == parentId)
            } else {
                query = query.filter(Column("parentId") == nil)
            }
            if let cursor { query = query.filter(Column("createdAt") < cursor) }
            return try query.fetchAll(db)
        }
    }
}
