import XCTest
import GRDB
@testable import MeeshySDK

final class PostRecordTests: XCTestCase {

    func test_equatable_sameIdDifferentVersion_areNotEqual() {
        let a = PostRecordFactory.make(id: "post_1", changeVersion: 1)
        let b = PostRecordFactory.make(id: "post_1", changeVersion: 2)
        XCTAssertNotEqual(a, b)
    }

    func test_equatable_sameIdSameVersion_areEqual() {
        let a = PostRecordFactory.make(id: "post_1", changeVersion: 1)
        let b = PostRecordFactory.make(id: "post_1", changeVersion: 1)
        XCTAssertEqual(a, b)
    }

    func test_grdb_insertAndFetch() throws {
        let dbQueue = try DatabaseQueue()
        try FeedDatabaseMigrations.runAll(on: dbQueue)

        let record = PostRecordFactory.make(id: "post_rt", content: "Hello feed")
        try dbQueue.write { db in try record.insert(db) }

        let fetched = try dbQueue.read { db in
            try PostRecord.fetchOne(db, key: "post_rt")
        }
        XCTAssertEqual(fetched?.content, "Hello feed")
    }
}

enum PostRecordFactory {
    static func make(
        id: String = "post_\(UUID().uuidString)",
        authorId: String = "user_1",
        content: String? = "Test post",
        changeVersion: Int64 = 0
    ) -> PostRecord {
        PostRecord(
            id: id, authorId: authorId, authorUsername: "testuser",
            authorDisplayName: "Test User", authorAvatarURL: nil,
            type: "post", content: content, originalLanguage: "fr",
            visibility: "public", likeCount: 0, commentCount: 0,
            repostCount: 0, viewCount: 0, bookmarkCount: 0, shareCount: 0,
            isLikedByMe: false, isPinned: false, isEdited: false, isQuote: false,
            moodEmoji: nil, audioUrl: nil, audioDuration: nil,
            mediaJson: nil, reactionSummaryJson: nil, repostOfJson: nil,
            mentionedUsersJson: nil, translationsJson: nil,
            createdAt: Date(), updatedAt: nil, changeVersion: changeVersion
        )
    }
}
