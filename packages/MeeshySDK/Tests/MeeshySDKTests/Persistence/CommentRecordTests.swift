import XCTest
import GRDB
@testable import MeeshySDK

final class CommentRecordTests: XCTestCase {

    func test_grdb_insertAndFetchTopLevel() throws {
        let dbQueue = try DatabaseQueue()
        try FeedDatabaseMigrations.runAll(on: dbQueue)

        let comment = CommentRecordFactory.make(id: "c_1", postId: "post_1", parentId: nil)
        try dbQueue.write { db in try comment.insert(db) }

        let fetched = try dbQueue.read { db in
            try CommentRecord
                .filter(Column("postId") == "post_1")
                .filter(Column("parentId") == nil)
                .fetchAll(db)
        }
        XCTAssertEqual(fetched.count, 1)
        XCTAssertNil(fetched[0].parentId)
    }

    func test_grdb_nestedReplies() throws {
        let dbQueue = try DatabaseQueue()
        try FeedDatabaseMigrations.runAll(on: dbQueue)

        let parent = CommentRecordFactory.make(id: "c_parent", postId: "post_1", parentId: nil)
        let reply1 = CommentRecordFactory.make(id: "c_reply1", postId: "post_1", parentId: "c_parent")
        let reply2 = CommentRecordFactory.make(id: "c_reply2", postId: "post_1", parentId: "c_parent")

        try dbQueue.write { db in
            try parent.insert(db)
            try reply1.insert(db)
            try reply2.insert(db)
        }

        let replies = try dbQueue.read { db in
            try CommentRecord
                .filter(Column("parentId") == "c_parent")
                .fetchAll(db)
        }
        XCTAssertEqual(replies.count, 2)
    }

    func test_equatable_viaChangeVersion() {
        let a = CommentRecordFactory.make(id: "c_1", changeVersion: 1)
        let b = CommentRecordFactory.make(id: "c_1", changeVersion: 2)
        XCTAssertNotEqual(a, b)
    }
}

enum CommentRecordFactory {
    static func make(
        id: String = "comment_\(UUID().uuidString)",
        postId: String = "post_default",
        parentId: String? = nil,
        content: String = "Test comment",
        changeVersion: Int64 = 0
    ) -> CommentRecord {
        CommentRecord(
            id: id, postId: postId, parentId: parentId,
            authorId: "user_1", authorUsername: "commenter",
            authorDisplayName: "Commenter", authorAvatarURL: nil,
            content: content, originalLanguage: "fr",
            translatedContent: nil, likeCount: 0, replyCount: 0,
            effectFlags: 0, createdAt: Date(), changeVersion: changeVersion
        )
    }
}
