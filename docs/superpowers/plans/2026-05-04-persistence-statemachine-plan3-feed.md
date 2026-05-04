# Plan 3: Feed + Comments — UICollectionView + FeedActor + FeedStore

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the UICollectionView-based feed (posts with infinite scroll) and nested comment list, backed by FeedPersistenceActor using the same shared DatabasePool, with real-time socket updates.

**Architecture:** Same pipeline as message list: Socket events → FeedPersistenceActor (write-through GRDB) → DatabaseRegionObservation → FeedStore/CommentStore (@Observable) → DiffableDataSource → UICollectionView cell recycling. Posts and comments share the same DatabasePool (App Group, SQLCipher WAL).

**Tech Stack:** Swift 6.2, UIKit (UICollectionView), GRDB 6.29.3, Combine, XCTest

**Depends on:** Plan 1 (Core Persistence) must be completed first. Plan 2 is independent.

**Spec reference:** `docs/superpowers/specs/2026-05-04-ios-persistence-statemachine-design.md` (Sections 10-12)

---

## File Structure

### New Files (MeeshySDK)

| File | Responsibility |
|------|---------------|
| `Sources/MeeshySDK/Persistence/FeedPersistenceActor.swift` | Write-through for posts + comments |
| `Sources/MeeshySDK/Persistence/PostRecord.swift` | GRDB record for posts |
| `Sources/MeeshySDK/Persistence/CommentRecord.swift` | GRDB record for comments (nested) |
| `Sources/MeeshySDK/Persistence/FeedDatabaseMigrations.swift` | 3 GRDB migrations |

### New Files (App)

| File | Responsibility |
|------|---------------|
| `Meeshy/Features/Main/Stores/FeedStore.swift` | @Observable for feed posts |
| `Meeshy/Features/Main/Stores/CommentStore.swift` | @Observable for nested comments |
| `Meeshy/Features/Main/Views/FeedListViewController.swift` | UICollectionView infinite scroll feed |
| `Meeshy/Features/Main/Views/FeedListView.swift` | UIViewControllerRepresentable bridge |
| `Meeshy/Features/Main/Views/CommentListViewController.swift` | UICollectionView nested comments |
| `Meeshy/Features/Main/Views/CommentListView.swift` | UIViewControllerRepresentable bridge |
| `Meeshy/Features/Main/Views/Cells/TextPostCell.swift` | Text-only post |
| `Meeshy/Features/Main/Views/Cells/MediaPostCell.swift` | Post with media carousel |
| `Meeshy/Features/Main/Views/Cells/TopLevelCommentCell.swift` | Top-level comment |
| `Meeshy/Features/Main/Views/Cells/ReplyCell.swift` | Nested reply (indented) |
| `Meeshy/Features/Main/Views/Cells/LoadMoreRepliesCell.swift` | "View N replies" |
| `Meeshy/Features/Main/ViewModels/FeedSocketHandler.swift` | Socket → FeedPersistenceActor |

### Modified Files

| File | Changes |
|------|---------|
| `FeedViewModel.swift` | Strip to orchestrator, use FeedStore |
| `PostDetailViewModel.swift` | Strip to orchestrator, use CommentStore |
| `FeedView.swift` | Use FeedListView (UIKit bridge) |
| `PostDetailView.swift` | Use CommentListView (UIKit bridge) |
| `DependencyContainer.swift` | Add FeedPersistenceActor |
| `MessageDatabaseMigrations.swift` | Add feed tables (or separate FeedDatabaseMigrations) |

### Test Files

| File | Tests |
|------|-------|
| `Tests/MeeshySDKTests/Persistence/FeedPersistenceActorTests.swift` | ~10 tests |
| `Tests/MeeshySDKTests/Persistence/PostRecordTests.swift` | ~3 tests |
| `Tests/MeeshySDKTests/Persistence/CommentRecordTests.swift` | ~3 tests |
| `MeeshyTests/Integration/FeedPipelineIntegrationTests.swift` | ~5 tests |

---

## Task 1: PostRecord + CommentRecord — GRDB models

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/PostRecord.swift`
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/CommentRecord.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/PostRecordTests.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/CommentRecordTests.swift`

- [ ] **Step 1: Write failing tests**

```swift
// packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/PostRecordTests.swift

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
```

```swift
// packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/CommentRecordTests.swift

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
```

- [ ] **Step 2: Implement PostRecord**

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Persistence/PostRecord.swift

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
```

- [ ] **Step 3: Implement CommentRecord**

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Persistence/CommentRecord.swift

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
```

- [ ] **Step 4: Implement FeedDatabaseMigrations**

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Persistence/FeedDatabaseMigrations.swift

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
    }
}
```

- [ ] **Step 5: Run tests**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh test`
Expected: All PostRecord + CommentRecord tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/PostRecord.swift
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/CommentRecord.swift
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/FeedDatabaseMigrations.swift
git add packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/PostRecordTests.swift
git add packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/CommentRecordTests.swift
git commit -m "feat(sdk): add PostRecord + CommentRecord + FeedDatabaseMigrations"
```

---

## Task 2: FeedPersistenceActor

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/FeedPersistenceActor.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/FeedPersistenceActorTests.swift`

- [ ] **Step 1: Write failing tests**

```swift
// packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/FeedPersistenceActorTests.swift

import XCTest
import GRDB
@testable import MeeshySDK

final class FeedPersistenceActorTests: XCTestCase {

    private var actor: FeedPersistenceActor!
    private var dbPool: DatabasePool!

    override func setUp() async throws {
        dbPool = try DatabasePool(path: ":memory:")
        try FeedDatabaseMigrations.runAll(on: dbPool)
        actor = FeedPersistenceActor(dbPool: dbPool)
    }

    func test_insertPost_persists() async throws {
        let post = PostRecordFactory.make(id: "post_1", content: "Hello")
        try await actor.insertPost(post)
        let fetched = try actor.posts(limit: 10)
        XCTAssertEqual(fetched.count, 1)
        XCTAssertEqual(fetched[0].content, "Hello")
    }

    func test_insertPosts_bulk() async throws {
        let posts = (0..<10).map { PostRecordFactory.make(id: "post_\($0)") }
        try await actor.insertPosts(posts)
        let fetched = try actor.posts(limit: 20)
        XCTAssertEqual(fetched.count, 10)
    }

    func test_updateLikeCount() async throws {
        try await actor.insertPost(PostRecordFactory.make(id: "post_like"))
        try await actor.updateLikeCount(postId: "post_like", count: 5, isLikedByMe: true)
        let fetched = try actor.posts(limit: 10)
        XCTAssertEqual(fetched[0].likeCount, 5)
        XCTAssertTrue(fetched[0].isLikedByMe)
    }

    func test_deletePost() async throws {
        try await actor.insertPost(PostRecordFactory.make(id: "post_del"))
        try await actor.deletePost(id: "post_del")
        let fetched = try actor.posts(limit: 10)
        XCTAssertEqual(fetched.count, 0)
    }

    func test_insertComment_topLevel() async throws {
        let comment = CommentRecordFactory.make(id: "c_1", postId: "post_1", parentId: nil)
        try await actor.insertComment(comment)
        let fetched = try actor.comments(forPostId: "post_1", limit: 10)
        XCTAssertEqual(fetched.count, 1)
    }

    func test_insertComment_nested() async throws {
        let parent = CommentRecordFactory.make(id: "c_parent", postId: "post_1")
        let reply = CommentRecordFactory.make(id: "c_reply", postId: "post_1", parentId: "c_parent")
        try await actor.insertComment(parent)
        try await actor.insertComment(reply)

        let topLevel = try actor.comments(forPostId: "post_1", parentId: nil, limit: 10)
        XCTAssertEqual(topLevel.count, 1)

        let replies = try actor.comments(forPostId: "post_1", parentId: "c_parent", limit: 10)
        XCTAssertEqual(replies.count, 1)
    }

    func test_updateCommentCount() async throws {
        try await actor.insertPost(PostRecordFactory.make(id: "post_cc"))
        try await actor.updateCommentCount(postId: "post_cc", count: 7)
        let fetched = try actor.posts(limit: 10)
        XCTAssertEqual(fetched[0].commentCount, 7)
    }

    func test_deleteComment() async throws {
        try await actor.insertComment(CommentRecordFactory.make(id: "c_del", postId: "post_1"))
        try await actor.deleteComment(id: "c_del")
        let fetched = try actor.comments(forPostId: "post_1", limit: 10)
        XCTAssertEqual(fetched.count, 0)
    }

    func test_cursorPagination() async throws {
        for i in 0..<30 {
            var post = PostRecordFactory.make(id: "post_\(i)")
            post.createdAt = Date().addingTimeInterval(Double(i))
            try await actor.insertPost(post)
        }

        let page1 = try actor.posts(limit: 10)
        XCTAssertEqual(page1.count, 10)

        let page2 = try actor.posts(cursor: page1.last!.createdAt, limit: 10)
        XCTAssertEqual(page2.count, 10)
        XCTAssertTrue(page2[0].createdAt < page1.last!.createdAt)
    }
}
```

- [ ] **Step 2: Implement FeedPersistenceActor**

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Persistence/FeedPersistenceActor.swift

import Foundation
import GRDB

public actor FeedPersistenceActor {
    private let dbPool: DatabasePool

    public init(dbPool: DatabasePool) {
        self.dbPool = dbPool
    }

    // MARK: - Post Writes

    public func insertPost(_ record: PostRecord) throws {
        try dbPool.write { db in try record.save(db) }
    }

    public func insertPosts(_ records: [PostRecord]) throws {
        try dbPool.write { db in
            for record in records { try record.save(db) }
        }
    }

    public func updateLikeCount(postId: String, count: Int, isLikedByMe: Bool) throws {
        try dbPool.write { db in
            try db.execute(
                sql: """
                    UPDATE feed_posts SET likeCount = ?, isLikedByMe = ?,
                    changeVersion = changeVersion + 1 WHERE id = ?
                    """,
                arguments: [count, isLikedByMe, postId]
            )
        }
    }

    public func updateCommentCount(postId: String, count: Int) throws {
        try dbPool.write { db in
            try db.execute(
                sql: """
                    UPDATE feed_posts SET commentCount = ?,
                    changeVersion = changeVersion + 1 WHERE id = ?
                    """,
                arguments: [count, postId]
            )
        }
    }

    public func deletePost(id: String) throws {
        try dbPool.write { db in
            try db.execute(sql: "DELETE FROM feed_posts WHERE id = ?", arguments: [id])
        }
    }

    // MARK: - Comment Writes

    public func insertComment(_ record: CommentRecord) throws {
        try dbPool.write { db in try record.save(db) }
    }

    public func deleteComment(id: String) throws {
        try dbPool.write { db in
            try db.execute(sql: "DELETE FROM feed_comments WHERE id = ?", arguments: [id])
        }
    }

    // MARK: - Reads (nonisolated)

    public nonisolated var reader: DatabasePool { dbPool }

    public nonisolated func posts(cursor: Date? = nil, limit: Int = 20) throws -> [PostRecord] {
        try dbPool.read { db in
            var query = PostRecord.order(Column("createdAt").desc).limit(limit)
            if let cursor { query = query.filter(Column("createdAt") < cursor) }
            return try query.fetchAll(db)
        }
    }

    public nonisolated func comments(forPostId postId: String, parentId: String? = nil,
                                      cursor: Date? = nil, limit: Int = 20) throws -> [CommentRecord] {
        try dbPool.read { db in
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
```

- [ ] **Step 3: Run tests**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh test`
Expected: All 10 FeedPersistenceActor tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/FeedPersistenceActor.swift
git add packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/FeedPersistenceActorTests.swift
git commit -m "feat(sdk): add FeedPersistenceActor with write-through for posts + comments"
```

---

## Task 3: FeedStore + CommentStore

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Stores/FeedStore.swift`
- Create: `apps/ios/Meeshy/Features/Main/Stores/CommentStore.swift`

- [ ] **Step 1: Implement FeedStore (same pattern as MessageStore)**
- [ ] **Step 2: Implement CommentStore (with nested threads, expand/collapse)**
- [ ] **Step 3: Build**
- [ ] **Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Stores/FeedStore.swift
git add apps/ios/Meeshy/Features/Main/Stores/CommentStore.swift
git commit -m "feat(ios): add FeedStore + CommentStore with DatabaseRegionObservation"
```

---

## Task 4: Feed cells — TextPostCell + MediaPostCell

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/Cells/TextPostCell.swift`
- Create: `apps/ios/Meeshy/Features/Main/Views/Cells/MediaPostCell.swift`

- [ ] **Step 1: Implement TextPostCell (author header, content, reaction bar, timestamp)**
- [ ] **Step 2: Implement MediaPostCell (carousel, author header, content, reactions)**
- [ ] **Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/Cells/TextPostCell.swift
git add apps/ios/Meeshy/Features/Main/Views/Cells/MediaPostCell.swift
git commit -m "feat(ios): add TextPostCell + MediaPostCell for feed UICollectionView"
```

---

## Task 5: Comment cells — TopLevelCommentCell + ReplyCell + LoadMoreRepliesCell

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/Cells/TopLevelCommentCell.swift`
- Create: `apps/ios/Meeshy/Features/Main/Views/Cells/ReplyCell.swift`
- Create: `apps/ios/Meeshy/Features/Main/Views/Cells/LoadMoreRepliesCell.swift`

- [ ] **Step 1: Implement TopLevelCommentCell**
- [ ] **Step 2: Implement ReplyCell (with indentation: depth * 40pt)**
- [ ] **Step 3: Implement LoadMoreRepliesCell ("View N replies" tap target)**
- [ ] **Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/Cells/TopLevelCommentCell.swift
git add apps/ios/Meeshy/Features/Main/Views/Cells/ReplyCell.swift
git add apps/ios/Meeshy/Features/Main/Views/Cells/LoadMoreRepliesCell.swift
git commit -m "feat(ios): add comment cells — TopLevel, Reply (indented), LoadMore"
```

---

## Task 6: FeedListViewController + CommentListViewController

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/FeedListViewController.swift`
- Create: `apps/ios/Meeshy/Features/Main/Views/FeedListView.swift`
- Create: `apps/ios/Meeshy/Features/Main/Views/CommentListViewController.swift`
- Create: `apps/ios/Meeshy/Features/Main/Views/CommentListView.swift`

- [ ] **Step 1: Implement FeedListViewController (NOT flipped — top-to-bottom, infinite scroll DOWN)**
- [ ] **Step 2: Implement FeedListView bridge**
- [ ] **Step 3: Implement CommentListViewController (sections per top-level comment, expand/collapse)**
- [ ] **Step 4: Implement CommentListView bridge**
- [ ] **Step 5: Build**
- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/FeedListViewController.swift
git add apps/ios/Meeshy/Features/Main/Views/FeedListView.swift
git add apps/ios/Meeshy/Features/Main/Views/CommentListViewController.swift
git add apps/ios/Meeshy/Features/Main/Views/CommentListView.swift
git commit -m "feat(ios): add FeedListViewController + CommentListViewController UICollectionView"
```

---

## Task 7: FeedSocketHandler — socket events to actor

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/ViewModels/FeedSocketHandler.swift`

- [ ] **Step 1: Implement FeedSocketHandler (8 post events + 3 comment events + 1 translation)**
- [ ] **Step 2: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/FeedSocketHandler.swift
git commit -m "feat(ios): add FeedSocketHandler — socket events to FeedPersistenceActor"
```

---

## Task 8: Refactor FeedViewModel + PostDetailViewModel + Views

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/PostDetailViewModel.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift`

- [ ] **Step 1: Refactor FeedViewModel to use FeedStore**
- [ ] **Step 2: Refactor PostDetailViewModel to use CommentStore**
- [ ] **Step 3: Refactor FeedView to use FeedListView UIKit bridge**
- [ ] **Step 4: Refactor PostDetailView to use CommentListView UIKit bridge**
- [ ] **Step 5: Build + run tests**
- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift
git add apps/ios/Meeshy/Features/Main/ViewModels/PostDetailViewModel.swift
git add apps/ios/Meeshy/Features/Main/Views/FeedView.swift
git add apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift
git commit -m "refactor(ios): FeedViewModel + PostDetailViewModel as orchestrators + UIKit bridges"
```

---

## Task 9: Wire in DependencyContainer + Integration tests

**Files:**
- Modify: `apps/ios/Meeshy/Core/DependencyContainer.swift`
- Create: `apps/ios/MeeshyTests/Integration/FeedPipelineIntegrationTests.swift`

- [ ] **Step 1: Add FeedPersistenceActor to DependencyContainer**

```swift
// Add to DependencyContainer:
let feedPersistence: FeedPersistenceActor

// In init(), after message migrations:
try FeedDatabaseMigrations.runAll(on: pool)
self.feedPersistence = FeedPersistenceActor(dbPool: pool)
```

- [ ] **Step 2: Write integration tests**

```swift
// apps/ios/MeeshyTests/Integration/FeedPipelineIntegrationTests.swift

import XCTest
import GRDB
@testable import MeeshySDK
@testable import Meeshy

final class FeedPipelineIntegrationTests: XCTestCase {

    private var dbPool: DatabasePool!
    private var feedActor: FeedPersistenceActor!

    override func setUp() async throws {
        dbPool = try DatabasePool(path: ":memory:")
        try FeedDatabaseMigrations.runAll(on: dbPool)
        feedActor = FeedPersistenceActor(dbPool: dbPool)
    }

    @MainActor
    func test_postInsert_appearsInFeedStore() async throws {
        let store = FeedStore(persistence: feedActor)
        store.startObserving(dbPool: dbPool)

        let post = PostRecordFactory.make(id: "feed_int_1", content: "Integration test")
        try await feedActor.insertPost(post)

        try await Task.sleep(for: .milliseconds(100))
        XCTAssertEqual(store.posts.count, 1)
        XCTAssertEqual(store.posts[0].content, "Integration test")

        store.stopObserving()
    }

    @MainActor
    func test_likeUpdate_reflectedInStore() async throws {
        let store = FeedStore(persistence: feedActor)
        store.startObserving(dbPool: dbPool)

        try await feedActor.insertPost(PostRecordFactory.make(id: "feed_like"))
        try await Task.sleep(for: .milliseconds(50))

        try await feedActor.updateLikeCount(postId: "feed_like", count: 42, isLikedByMe: true)
        try await Task.sleep(for: .milliseconds(100))

        XCTAssertEqual(store.posts[0].likeCount, 42)
        XCTAssertTrue(store.posts[0].isLikedByMe)

        store.stopObserving()
    }

    @MainActor
    func test_commentInsert_appearsInCommentStore() async throws {
        let store = CommentStore(postId: "post_int", persistence: feedActor)
        await store.loadInitial()

        try await feedActor.insertComment(
            CommentRecordFactory.make(id: "c_int_1", postId: "post_int", content: "Great post!"))

        try await Task.sleep(for: .milliseconds(100))
        await store.loadInitial() // Reload
        XCTAssertEqual(store.topLevelComments.count, 1)
    }

    @MainActor
    func test_nestedThread_expandCollapse() async throws {
        let store = CommentStore(postId: "post_thread", persistence: feedActor)

        var parent = CommentRecordFactory.make(id: "c_p", postId: "post_thread")
        parent.replyCount = 2
        try await feedActor.insertComment(parent)
        try await feedActor.insertComment(
            CommentRecordFactory.make(id: "c_r1", postId: "post_thread", parentId: "c_p"))
        try await feedActor.insertComment(
            CommentRecordFactory.make(id: "c_r2", postId: "post_thread", parentId: "c_p"))

        await store.loadInitial()
        XCTAssertEqual(store.topLevelComments.count, 1)
        XCTAssertTrue(store.replies(for: "c_p").isEmpty) // Not expanded yet

        await store.toggleThread("c_p")
        XCTAssertEqual(store.replies(for: "c_p").count, 2)
        XCTAssertTrue(store.expandedThreads.contains("c_p"))

        await store.toggleThread("c_p")
        XCTAssertFalse(store.expandedThreads.contains("c_p"))
    }
}
```

- [ ] **Step 3: Run all tests**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh test`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Meeshy/Core/DependencyContainer.swift
git add apps/ios/MeeshyTests/Integration/FeedPipelineIntegrationTests.swift
git commit -m "feat(ios): wire FeedPersistenceActor + integration tests feed pipeline"
```

---

## Plan 3 Summary

| Task | Component | Tests |
|------|-----------|-------|
| 1 | PostRecord + CommentRecord + FeedDatabaseMigrations | 6 |
| 2 | FeedPersistenceActor | 10 |
| 3 | FeedStore + CommentStore | 0 (used in integration) |
| 4 | TextPostCell + MediaPostCell | 0 (build) |
| 5 | Comment cells (TopLevel, Reply, LoadMore) | 0 (build) |
| 6 | FeedListViewController + CommentListViewController | 0 (build) |
| 7 | FeedSocketHandler | 0 |
| 8 | Refactor FeedViewModel + PostDetailViewModel + Views | existing tests |
| 9 | Wire DependencyContainer + Integration tests | 5 |

**Total: 9 tasks, ~21 new tests + existing test suite, ~1800 lines of production code**
