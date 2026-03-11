# SDK Persistent Cache Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate ParticipantCacheManager from in-memory to SQLite (GRDB) persistent storage with 24h TTL and socket-based invalidation, then replicate for conversations and messages.

**Architecture:** GRDB-backed actor cache managers in the SDK. Normalized columns for participants (individual mutations). BLOB encoding for conversations/messages (existing pattern). Single `AppDatabase.shared.databaseWriter` as storage backend. Protocol-first design for testability with in-memory GRDB databases in tests.

**Tech Stack:** Swift 5.9, GRDB 6.29.3, XCTest, iOS 17+

---

## Phase 1: Participants Persistent Cache (TDD Prototype)

### Task 1: GRDB Migration v2 — Participant Tables

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/AppDatabase.swift:38-60`

**Context:** AppDatabase has a single migration `v1_create_tables` with conversations + messages tables. We add a v2 migration for `cached_participants` and `cache_metadata`.

**Step 1: Write the failing test**

Create test file:
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/AppDatabaseMigrationTests.swift`

```swift
import XCTest
import GRDB
@testable import MeeshySDK

final class AppDatabaseMigrationTests: XCTestCase {

    private func makeInMemoryDatabase() throws -> DatabaseQueue {
        let db = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: db)
        return db
    }

    func test_v2Migration_createsCachedParticipantsTable() throws {
        let db = try makeInMemoryDatabase()
        let columns = try db.read { db in
            try db.columns(in: "cached_participants").map(\.name)
        }
        XCTAssertTrue(columns.contains("id"))
        XCTAssertTrue(columns.contains("conversationId"))
        XCTAssertTrue(columns.contains("userId"))
        XCTAssertTrue(columns.contains("username"))
        XCTAssertTrue(columns.contains("firstName"))
        XCTAssertTrue(columns.contains("lastName"))
        XCTAssertTrue(columns.contains("displayName"))
        XCTAssertTrue(columns.contains("avatar"))
        XCTAssertTrue(columns.contains("conversationRole"))
        XCTAssertTrue(columns.contains("isOnline"))
        XCTAssertTrue(columns.contains("lastActiveAt"))
        XCTAssertTrue(columns.contains("joinedAt"))
        XCTAssertTrue(columns.contains("isActive"))
        XCTAssertTrue(columns.contains("cachedAt"))
    }

    func test_v2Migration_createsCacheMetadataTable() throws {
        let db = try makeInMemoryDatabase()
        let columns = try db.read { db in
            try db.columns(in: "cache_metadata").map(\.name)
        }
        XCTAssertTrue(columns.contains("key"))
        XCTAssertTrue(columns.contains("nextCursor"))
        XCTAssertTrue(columns.contains("hasMore"))
        XCTAssertTrue(columns.contains("totalCount"))
        XCTAssertTrue(columns.contains("lastFetchedAt"))
    }

    func test_v2Migration_createsConversationIdIndex() throws {
        let db = try makeInMemoryDatabase()
        let indexes = try db.read { db in
            try db.indexes(on: "cached_participants").map(\.name)
        }
        XCTAssertTrue(indexes.contains("idx_cached_participants_conversationId"))
    }
}
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/MeeshySDK && swift test --filter AppDatabaseMigrationTests 2>&1 | tail -20`
Expected: FAIL — `runMigrations` method doesn't exist, tables don't exist

**Step 3: Implement migration**

Modify `AppDatabase.swift` to:
1. Extract migrations into a static method `runMigrations(on:)` so tests can use in-memory DB
2. Add v2 migration with `cached_participants` and `cache_metadata` tables

```swift
import Foundation
import GRDB
import os

public final class AppDatabase: @unchecked Sendable {
    public static let shared = AppDatabase()

    public let databaseWriter: any DatabaseWriter
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "grdb")

    private init() {
        do {
            let fileManager = FileManager.default
            let appSupportDir = try fileManager.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            let directoryURL = appSupportDir.appendingPathComponent("Database", isDirectory: true)

            if !fileManager.fileExists(atPath: directoryURL.path) {
                try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true)
            }

            let databaseURL = directoryURL.appendingPathComponent("meeshy.sqlite")

            var configuration = Configuration()
            configuration.prepareDatabase { db in
                db.trace { _ in }
            }

            let pool = try DatabasePool(path: databaseURL.path, configuration: configuration)
            self.databaseWriter = pool

            try Self.runMigrations(on: self.databaseWriter)
        } catch {
            fatalError("Failed to initialize GRDB: \(error)")
        }
    }

    static func runMigrations(on writer: any DatabaseWriter) throws {
        var migrator = DatabaseMigrator()

        migrator.registerMigration("v1_create_tables") { db in
            try db.create(table: "conversations") { t in
                t.column("id", .text).primaryKey()
                t.column("name", .text).notNull()
                t.column("encodedData", .blob).notNull()
                t.column("updatedAt", .datetime).notNull()
            }

            try db.create(table: "messages") { t in
                t.column("id", .text).primaryKey()
                t.column("conversationId", .text).notNull().references("conversations", onDelete: .cascade)
                t.column("createdAt", .datetime).notNull()
                t.column("encodedData", .blob).notNull()
            }

            try db.create(index: "index_messages_on_conversationId_createdAt", on: "messages", columns: ["conversationId", "createdAt"])
        }

        migrator.registerMigration("v2_participant_cache") { db in
            try db.create(table: "cached_participants") { t in
                t.column("id", .text).primaryKey()
                t.column("conversationId", .text).notNull()
                t.column("userId", .text)
                t.column("username", .text)
                t.column("firstName", .text)
                t.column("lastName", .text)
                t.column("displayName", .text)
                t.column("avatar", .text)
                t.column("conversationRole", .text)
                t.column("isOnline", .boolean)
                t.column("lastActiveAt", .datetime)
                t.column("joinedAt", .datetime)
                t.column("isActive", .boolean)
                t.column("cachedAt", .datetime).notNull()
            }

            try db.create(index: "idx_cached_participants_conversationId", on: "cached_participants", columns: ["conversationId"])

            try db.create(table: "cache_metadata") { t in
                t.column("key", .text).primaryKey()
                t.column("nextCursor", .text)
                t.column("hasMore", .boolean).notNull().defaults(to: true)
                t.column("totalCount", .integer)
                t.column("lastFetchedAt", .datetime).notNull()
            }
        }

        try migrator.migrate(writer)
    }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/MeeshySDK && swift test --filter AppDatabaseMigrationTests 2>&1 | tail -20`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/AppDatabase.swift packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/AppDatabaseMigrationTests.swift
git commit -m "feat(sdk): add v2 GRDB migration for participant cache tables"
```

---

### Task 2: DBCachedParticipant Record Type

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/DBCachedParticipant.swift`
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/DBCachedParticipantTests.swift`

**Context:** GRDB record type that maps to the `cached_participants` table. Must convert to/from `PaginatedParticipant` (the API model). `PaginatedParticipant` is currently `Decodable` only — it needs to become `Codable` for this roundtrip.

**Step 1: Write the failing test**

```swift
import XCTest
import GRDB
@testable import MeeshySDK

final class DBCachedParticipantTests: XCTestCase {

    private func makeDB() throws -> DatabaseQueue {
        let db = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: db)
        return db
    }

    func test_insertAndFetch_roundtrips() throws {
        let db = try makeDB()
        let record = DBCachedParticipant(
            id: "p1", conversationId: "c1", userId: "u1",
            username: "alice", firstName: "Alice", lastName: "Wonder",
            displayName: "Alice Wonder", avatar: "https://img.com/a.jpg",
            conversationRole: "admin", isOnline: true,
            lastActiveAt: Date(timeIntervalSince1970: 1000),
            joinedAt: Date(timeIntervalSince1970: 500),
            isActive: true, cachedAt: Date()
        )
        try db.write { try record.save($0) }
        let fetched = try db.read { try DBCachedParticipant.fetchOne($0, key: "p1") }
        XCTAssertEqual(fetched?.userId, "u1")
        XCTAssertEqual(fetched?.username, "alice")
        XCTAssertEqual(fetched?.conversationRole, "admin")
    }

    func test_toPaginatedParticipant_convertsCorrectly() throws {
        let record = DBCachedParticipant(
            id: "p1", conversationId: "c1", userId: "u1",
            username: "bob", firstName: "Bob", lastName: "Smith",
            displayName: "Bob Smith", avatar: nil,
            conversationRole: "member", isOnline: false,
            lastActiveAt: nil, joinedAt: Date(), isActive: true, cachedAt: Date()
        )
        let participant = record.toPaginatedParticipant()
        XCTAssertEqual(participant.id, "p1")
        XCTAssertEqual(participant.userId, "u1")
        XCTAssertEqual(participant.username, "bob")
        XCTAssertEqual(participant.name, "Bob Smith")
    }

    func test_fromPaginatedParticipant_convertsCorrectly() {
        let participant = PaginatedParticipant(
            id: "p2", userId: "u2", username: "charlie",
            firstName: "Charlie", lastName: "Brown",
            displayName: "Charlie Brown", avatar: "https://img.com/c.jpg",
            conversationRole: "moderator", isOnline: true,
            lastActiveAt: Date(), joinedAt: Date(), isActive: true
        )
        let record = DBCachedParticipant.from(participant, conversationId: "c1")
        XCTAssertEqual(record.id, "p2")
        XCTAssertEqual(record.conversationId, "c1")
        XCTAssertEqual(record.conversationRole, "moderator")
    }

    func test_fetchByConversationId_returnsOnlyMatching() throws {
        let db = try makeDB()
        let now = Date()
        let r1 = DBCachedParticipant(id: "p1", conversationId: "c1", userId: nil, username: nil, firstName: nil, lastName: nil, displayName: "A", avatar: nil, conversationRole: nil, isOnline: nil, lastActiveAt: nil, joinedAt: nil, isActive: nil, cachedAt: now)
        let r2 = DBCachedParticipant(id: "p2", conversationId: "c1", userId: nil, username: nil, firstName: nil, lastName: nil, displayName: "B", avatar: nil, conversationRole: nil, isOnline: nil, lastActiveAt: nil, joinedAt: nil, isActive: nil, cachedAt: now)
        let r3 = DBCachedParticipant(id: "p3", conversationId: "c2", userId: nil, username: nil, firstName: nil, lastName: nil, displayName: "C", avatar: nil, conversationRole: nil, isOnline: nil, lastActiveAt: nil, joinedAt: nil, isActive: nil, cachedAt: now)
        try db.write { db in
            try r1.save(db); try r2.save(db); try r3.save(db)
        }
        let results = try db.read {
            try DBCachedParticipant.filter(Column("conversationId") == "c1").fetchAll($0)
        }
        XCTAssertEqual(results.count, 2)
    }

    func test_deleteByConversationId_removesAll() throws {
        let db = try makeDB()
        let now = Date()
        let r1 = DBCachedParticipant(id: "p1", conversationId: "c1", userId: nil, username: nil, firstName: nil, lastName: nil, displayName: "A", avatar: nil, conversationRole: nil, isOnline: nil, lastActiveAt: nil, joinedAt: nil, isActive: nil, cachedAt: now)
        let r2 = DBCachedParticipant(id: "p2", conversationId: "c1", userId: nil, username: nil, firstName: nil, lastName: nil, displayName: "B", avatar: nil, conversationRole: nil, isOnline: nil, lastActiveAt: nil, joinedAt: nil, isActive: nil, cachedAt: now)
        try db.write { db in
            try r1.save(db); try r2.save(db)
        }
        try db.write {
            _ = try DBCachedParticipant.filter(Column("conversationId") == "c1").deleteAll($0)
        }
        let count = try db.read { try DBCachedParticipant.fetchCount($0) }
        XCTAssertEqual(count, 0)
    }

    func test_updateRole_updatesInPlace() throws {
        let db = try makeDB()
        var record = DBCachedParticipant(id: "p1", conversationId: "c1", userId: "u1", username: nil, firstName: nil, lastName: nil, displayName: "A", avatar: nil, conversationRole: "member", isOnline: nil, lastActiveAt: nil, joinedAt: nil, isActive: nil, cachedAt: Date())
        try db.write { try record.save($0) }
        try db.write { db in
            record.conversationRole = "admin"
            try record.update(db)
        }
        let fetched = try db.read { try DBCachedParticipant.fetchOne($0, key: "p1") }
        XCTAssertEqual(fetched?.conversationRole, "admin")
    }
}
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/MeeshySDK && swift test --filter DBCachedParticipantTests 2>&1 | tail -20`
Expected: FAIL — `DBCachedParticipant` type not found

**Step 3: Implement DBCachedParticipant**

```swift
import Foundation
import GRDB

struct DBCachedParticipant: Codable, FetchableRecord, PersistableRecord, Sendable {
    static let databaseTableName = "cached_participants"

    var id: String
    var conversationId: String
    var userId: String?
    var username: String?
    var firstName: String?
    var lastName: String?
    var displayName: String?
    var avatar: String?
    var conversationRole: String?
    var isOnline: Bool?
    var lastActiveAt: Date?
    var joinedAt: Date?
    var isActive: Bool?
    var cachedAt: Date

    func toPaginatedParticipant() -> PaginatedParticipant {
        PaginatedParticipant(
            id: id, userId: userId, username: username,
            firstName: firstName, lastName: lastName,
            displayName: displayName, avatar: avatar,
            conversationRole: conversationRole, isOnline: isOnline,
            lastActiveAt: lastActiveAt, joinedAt: joinedAt, isActive: isActive
        )
    }

    static func from(_ participant: PaginatedParticipant, conversationId: String) -> DBCachedParticipant {
        DBCachedParticipant(
            id: participant.id, conversationId: conversationId,
            userId: participant.userId, username: participant.username,
            firstName: participant.firstName, lastName: participant.lastName,
            displayName: participant.displayName, avatar: participant.avatar,
            conversationRole: participant.conversationRole, isOnline: participant.isOnline,
            lastActiveAt: participant.lastActiveAt, joinedAt: participant.joinedAt,
            isActive: participant.isActive, cachedAt: Date()
        )
    }
}
```

Also modify `PaginatedParticipant` in `ParticipantModels.swift`:
- Change `Decodable` to `Codable`
- Add `public init(...)` with all fields

```swift
public struct PaginatedParticipant: Codable, Identifiable, Sendable {
    public let id: String
    public let userId: String?
    public let username: String?
    public let firstName: String?
    public let lastName: String?
    public let displayName: String?
    public let avatar: String?
    public var conversationRole: String?
    public let isOnline: Bool?
    public let lastActiveAt: Date?
    public let joinedAt: Date?
    public let isActive: Bool?

    public init(
        id: String, userId: String? = nil, username: String? = nil,
        firstName: String? = nil, lastName: String? = nil,
        displayName: String? = nil, avatar: String? = nil,
        conversationRole: String? = nil, isOnline: Bool? = nil,
        lastActiveAt: Date? = nil, joinedAt: Date? = nil, isActive: Bool? = nil
    ) {
        self.id = id; self.userId = userId; self.username = username
        self.firstName = firstName; self.lastName = lastName
        self.displayName = displayName; self.avatar = avatar
        self.conversationRole = conversationRole; self.isOnline = isOnline
        self.lastActiveAt = lastActiveAt; self.joinedAt = joinedAt; self.isActive = isActive
    }

    public var name: String {
        displayName ?? [firstName, lastName].compactMap { $0 }.joined(separator: " ").nilIfEmpty ?? username ?? "?"
    }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/MeeshySDK && swift test --filter DBCachedParticipantTests 2>&1 | tail -20`
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/DBCachedParticipant.swift packages/MeeshySDK/Sources/MeeshySDK/Models/ParticipantModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/DBCachedParticipantTests.swift
git commit -m "feat(sdk): add DBCachedParticipant GRDB record with PaginatedParticipant conversion"
```

---

### Task 3: DBCacheMetadata Record Type

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/DBCacheMetadata.swift`
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/DBCacheMetadataTests.swift`

**Context:** Generic cache metadata record used by all cache managers. Key format: `participants:{conversationId}`, `conversations:list`, `messages:{conversationId}`.

**Step 1: Write the failing test**

```swift
import XCTest
import GRDB
@testable import MeeshySDK

final class DBCacheMetadataTests: XCTestCase {

    private func makeDB() throws -> DatabaseQueue {
        let db = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: db)
        return db
    }

    func test_insertAndFetch_roundtrips() throws {
        let db = try makeDB()
        let now = Date()
        let meta = DBCacheMetadata(key: "participants:c1", nextCursor: "abc123", hasMore: true, totalCount: 217, lastFetchedAt: now)
        try db.write { try meta.save($0) }
        let fetched = try db.read { try DBCacheMetadata.fetchOne($0, key: "participants:c1") }
        XCTAssertEqual(fetched?.nextCursor, "abc123")
        XCTAssertEqual(fetched?.hasMore, true)
        XCTAssertEqual(fetched?.totalCount, 217)
    }

    func test_upsert_updatesExisting() throws {
        let db = try makeDB()
        let m1 = DBCacheMetadata(key: "participants:c1", nextCursor: "a", hasMore: true, totalCount: 100, lastFetchedAt: Date())
        try db.write { try m1.save($0) }
        let m2 = DBCacheMetadata(key: "participants:c1", nextCursor: "b", hasMore: false, totalCount: 200, lastFetchedAt: Date())
        try db.write { try m2.save($0) }
        let count = try db.read { try DBCacheMetadata.fetchCount($0) }
        XCTAssertEqual(count, 1)
        let fetched = try db.read { try DBCacheMetadata.fetchOne($0, key: "participants:c1") }
        XCTAssertEqual(fetched?.nextCursor, "b")
        XCTAssertEqual(fetched?.hasMore, false)
    }

    func test_isExpired_returnsTrueAfterTTL() {
        let old = DBCacheMetadata(key: "test", nextCursor: nil, hasMore: false, totalCount: nil, lastFetchedAt: Date().addingTimeInterval(-86401))
        XCTAssertTrue(old.isExpired(ttl: 86400))
    }

    func test_isExpired_returnsFalseBeforeTTL() {
        let fresh = DBCacheMetadata(key: "test", nextCursor: nil, hasMore: false, totalCount: nil, lastFetchedAt: Date())
        XCTAssertFalse(fresh.isExpired(ttl: 86400))
    }

    func test_delete_removesRecord() throws {
        let db = try makeDB()
        let meta = DBCacheMetadata(key: "participants:c1", nextCursor: nil, hasMore: false, totalCount: nil, lastFetchedAt: Date())
        try db.write { try meta.save($0) }
        try db.write { _ = try DBCacheMetadata.deleteOne($0, key: "participants:c1") }
        let fetched = try db.read { try DBCacheMetadata.fetchOne($0, key: "participants:c1") }
        XCTAssertNil(fetched)
    }
}
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/MeeshySDK && swift test --filter DBCacheMetadataTests 2>&1 | tail -20`
Expected: FAIL — `DBCacheMetadata` type not found

**Step 3: Implement DBCacheMetadata**

```swift
import Foundation
import GRDB

struct DBCacheMetadata: Codable, FetchableRecord, PersistableRecord, Sendable {
    static let databaseTableName = "cache_metadata"

    var key: String
    var nextCursor: String?
    var hasMore: Bool
    var totalCount: Int?
    var lastFetchedAt: Date

    func isExpired(ttl: TimeInterval) -> Bool {
        Date().timeIntervalSince(lastFetchedAt) > ttl
    }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/MeeshySDK && swift test --filter DBCacheMetadataTests 2>&1 | tail -20`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/DBCacheMetadata.swift packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/DBCacheMetadataTests.swift
git commit -m "feat(sdk): add DBCacheMetadata record with TTL expiry check"
```

---

### Task 4: ParticipantCacheManager — Protocol + GRDB Backend

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/ParticipantCacheManager.swift`
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/ParticipantCacheManagerTests.swift`

**Context:** Refactor ParticipantCacheManager to read/write from GRDB. Keep actor isolation. Accept `DatabaseWriter` via init for testability (in-memory DB in tests). TTL = 86400 (24h). Keep in-memory dict as L1 cache for hot reads, GRDB as L2 persistent store.

**Step 1: Write the failing tests**

```swift
import XCTest
import GRDB
@testable import MeeshySDK

final class ParticipantCacheManagerTests: XCTestCase {

    private func makeManager() throws -> (ParticipantCacheManager, MockAPIClient, DatabaseQueue) {
        let db = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: db)
        let api = MockAPIClient()
        let manager = ParticipantCacheManager(databaseWriter: db, apiClient: api)
        return (manager, api, db)
    }

    // MARK: - Persistent Storage

    func test_loadFirstPage_persistsToSQLite() async throws {
        let (manager, api, db) = try makeManager()
        let response = PaginatedParticipantsResponse(
            success: true,
            data: [
                PaginatedParticipant(id: "p1", userId: "u1", username: "alice", displayName: "Alice"),
                PaginatedParticipant(id: "p2", userId: "u2", username: "bob", displayName: "Bob")
            ],
            pagination: PaginatedParticipantsPagination(nextCursor: nil, hasMore: false, totalCount: 2)
        )
        api.stub("/conversations/c1/participants?limit=30", result: response)

        _ = try await manager.loadFirstPage(for: "c1", forceRefresh: true)

        let count = try db.read { try DBCachedParticipant.filter(Column("conversationId") == "c1").fetchCount($0) }
        XCTAssertEqual(count, 2)
    }

    func test_cached_readsFromSQLiteOnColdStart() async throws {
        let (manager, _, db) = try makeManager()

        // Pre-populate SQLite directly (simulating app restart)
        try db.write { db in
            let record = DBCachedParticipant(
                id: "p1", conversationId: "c1", userId: "u1", username: "alice",
                firstName: "Alice", lastName: nil, displayName: "Alice", avatar: nil,
                conversationRole: "member", isOnline: nil, lastActiveAt: nil,
                joinedAt: nil, isActive: true, cachedAt: Date()
            )
            try record.save(db)
            let meta = DBCacheMetadata(key: "participants:c1", nextCursor: nil, hasMore: false, totalCount: 1, lastFetchedAt: Date())
            try meta.save(db)
        }

        let participants = await manager.cached(for: "c1")
        XCTAssertEqual(participants.count, 1)
        XCTAssertEqual(participants.first?.username, "alice")
    }

    func test_loadFirstPage_withFreshCache_doesNotCallAPI() async throws {
        let (manager, api, db) = try makeManager()

        // Pre-populate fresh cache
        try db.write { db in
            let record = DBCachedParticipant(id: "p1", conversationId: "c1", userId: nil, username: nil, firstName: nil, lastName: nil, displayName: "A", avatar: nil, conversationRole: nil, isOnline: nil, lastActiveAt: nil, joinedAt: nil, isActive: nil, cachedAt: Date())
            try record.save(db)
            let meta = DBCacheMetadata(key: "participants:c1", nextCursor: nil, hasMore: false, totalCount: 1, lastFetchedAt: Date())
            try meta.save(db)
        }

        _ = try await manager.loadFirstPage(for: "c1")
        XCTAssertEqual(api.requestCount, 0)
    }

    func test_loadFirstPage_withExpiredCache_callsAPI() async throws {
        let (manager, api, db) = try makeManager()

        // Pre-populate expired cache (25h ago)
        try db.write { db in
            let record = DBCachedParticipant(id: "p1", conversationId: "c1", userId: nil, username: nil, firstName: nil, lastName: nil, displayName: "A", avatar: nil, conversationRole: nil, isOnline: nil, lastActiveAt: nil, joinedAt: nil, isActive: nil, cachedAt: Date().addingTimeInterval(-90000))
            try record.save(db)
            let meta = DBCacheMetadata(key: "participants:c1", nextCursor: nil, hasMore: false, totalCount: 1, lastFetchedAt: Date().addingTimeInterval(-90000))
            try meta.save(db)
        }

        let response = PaginatedParticipantsResponse(
            success: true,
            data: [PaginatedParticipant(id: "p1", displayName: "Updated")],
            pagination: PaginatedParticipantsPagination(nextCursor: nil, hasMore: false, totalCount: 1)
        )
        api.stub("/conversations/c1/participants?limit=30", result: response)

        _ = try await manager.loadFirstPage(for: "c1")
        XCTAssertEqual(api.requestCount, 1)
    }

    // MARK: - Mutations

    func test_updateRole_persistsToSQLite() async throws {
        let (manager, _, db) = try makeManager()

        try db.write { db in
            let record = DBCachedParticipant(id: "p1", conversationId: "c1", userId: "u1", username: nil, firstName: nil, lastName: nil, displayName: "A", avatar: nil, conversationRole: "member", isOnline: nil, lastActiveAt: nil, joinedAt: nil, isActive: nil, cachedAt: Date())
            try record.save(db)
        }

        await manager.updateRole(conversationId: "c1", userId: "u1", newRole: "admin")

        let fetched = try db.read { try DBCachedParticipant.fetchOne($0, key: "p1") }
        XCTAssertEqual(fetched?.conversationRole, "admin")
    }

    func test_removeParticipant_deletesFromSQLite() async throws {
        let (manager, _, db) = try makeManager()

        try db.write { db in
            let r1 = DBCachedParticipant(id: "p1", conversationId: "c1", userId: "u1", username: nil, firstName: nil, lastName: nil, displayName: "A", avatar: nil, conversationRole: nil, isOnline: nil, lastActiveAt: nil, joinedAt: nil, isActive: nil, cachedAt: Date())
            let r2 = DBCachedParticipant(id: "p2", conversationId: "c1", userId: "u2", username: nil, firstName: nil, lastName: nil, displayName: "B", avatar: nil, conversationRole: nil, isOnline: nil, lastActiveAt: nil, joinedAt: nil, isActive: nil, cachedAt: Date())
            try r1.save(db); try r2.save(db)
            let meta = DBCacheMetadata(key: "participants:c1", nextCursor: nil, hasMore: false, totalCount: 2, lastFetchedAt: Date())
            try meta.save(db)
        }

        await manager.removeParticipant(conversationId: "c1", userId: "u1")

        let count = try db.read { try DBCachedParticipant.filter(Column("conversationId") == "c1").fetchCount($0) }
        XCTAssertEqual(count, 1)
        let meta = try db.read { try DBCacheMetadata.fetchOne($0, key: "participants:c1") }
        XCTAssertEqual(meta?.totalCount, 1)
    }

    // MARK: - Invalidation

    func test_invalidate_clearsConversationFromSQLite() async throws {
        let (manager, _, db) = try makeManager()

        try db.write { db in
            let record = DBCachedParticipant(id: "p1", conversationId: "c1", userId: nil, username: nil, firstName: nil, lastName: nil, displayName: "A", avatar: nil, conversationRole: nil, isOnline: nil, lastActiveAt: nil, joinedAt: nil, isActive: nil, cachedAt: Date())
            try record.save(db)
            let meta = DBCacheMetadata(key: "participants:c1", nextCursor: nil, hasMore: false, totalCount: 1, lastFetchedAt: Date())
            try meta.save(db)
        }

        await manager.invalidate(conversationId: "c1")

        let pCount = try db.read { try DBCachedParticipant.filter(Column("conversationId") == "c1").fetchCount($0) }
        let mCount = try db.read { try DBCacheMetadata.fetchOne($0, key: "participants:c1") }
        XCTAssertEqual(pCount, 0)
        XCTAssertNil(mCount)
    }

    // MARK: - Pagination

    func test_loadNextPage_appendsToExisting() async throws {
        let (manager, api, db) = try makeManager()

        // First page
        let page1 = PaginatedParticipantsResponse(
            success: true,
            data: [PaginatedParticipant(id: "p1", displayName: "A")],
            pagination: PaginatedParticipantsPagination(nextCursor: "cursor1", hasMore: true, totalCount: 2)
        )
        api.stub("/conversations/c1/participants?limit=30", result: page1)
        _ = try await manager.loadFirstPage(for: "c1", forceRefresh: true)

        // Second page
        let page2 = PaginatedParticipantsResponse(
            success: true,
            data: [PaginatedParticipant(id: "p2", displayName: "B")],
            pagination: PaginatedParticipantsPagination(nextCursor: nil, hasMore: false, totalCount: 2)
        )
        api.stub("/conversations/c1/participants?limit=30&cursor=cursor1", result: page2)
        _ = try await manager.loadNextPage(for: "c1")

        let count = try db.read { try DBCachedParticipant.filter(Column("conversationId") == "c1").fetchCount($0) }
        XCTAssertEqual(count, 2)
        let hasMore = await manager.hasMore(for: "c1")
        XCTAssertFalse(hasMore)
    }

    // MARK: - Total Count + Has More

    func test_totalCount_readsFromMetadata() async throws {
        let (manager, _, db) = try makeManager()
        try db.write { db in
            let meta = DBCacheMetadata(key: "participants:c1", nextCursor: nil, hasMore: false, totalCount: 42, lastFetchedAt: Date())
            try meta.save(db)
        }
        let count = await manager.totalCount(for: "c1")
        XCTAssertEqual(count, 42)
    }

    func test_hasMore_defaultsTrueWithNoCache() async throws {
        let (manager, _, _) = try makeManager()
        let hasMore = await manager.hasMore(for: "unknown")
        XCTAssertTrue(hasMore)
    }
}
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/MeeshySDK && swift test --filter ParticipantCacheManagerTests 2>&1 | tail -20`
Expected: FAIL — init signature doesn't accept `databaseWriter` or `apiClient`

**Step 3: Rewrite ParticipantCacheManager with GRDB backend**

Replace the entire content of `ParticipantCacheManager.swift`:

```swift
import Foundation
import GRDB
import os

public actor ParticipantCacheManager {
    public static let shared = ParticipantCacheManager()

    private let db: any DatabaseWriter
    private let apiClient: any APIClientProviding
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "participant-cache")
    private let pageSize = 30
    private let ttl: TimeInterval = 86400

    // L1 in-memory cache for hot reads (avoids DB round-trip)
    private var memoryCache: [String: [PaginatedParticipant]] = [:]

    public init(
        databaseWriter: (any DatabaseWriter)? = nil,
        apiClient: (any APIClientProviding)? = nil
    ) {
        self.db = databaseWriter ?? AppDatabase.shared.databaseWriter
        self.apiClient = apiClient ?? APIClient.shared
    }

    private func metadataKey(for conversationId: String) -> String {
        "participants:\(conversationId)"
    }

    // MARK: - Read

    public func cached(for conversationId: String) -> [PaginatedParticipant] {
        if let memory = memoryCache[conversationId] { return memory }
        do {
            let participants = try db.read { db in
                try DBCachedParticipant
                    .filter(Column("conversationId") == conversationId)
                    .fetchAll(db)
                    .map { $0.toPaginatedParticipant() }
            }
            if !participants.isEmpty { memoryCache[conversationId] = participants }
            return participants
        } catch {
            logger.error("Failed to read cached participants: \(error.localizedDescription)")
            return []
        }
    }

    public func hasMore(for conversationId: String) -> Bool {
        do {
            let meta = try db.read { try DBCacheMetadata.fetchOne($0, key: metadataKey(for: conversationId)) }
            return meta?.hasMore ?? true
        } catch { return true }
    }

    public func totalCount(for conversationId: String) -> Int? {
        do {
            let meta = try db.read { try DBCacheMetadata.fetchOne($0, key: metadataKey(for: conversationId)) }
            return meta?.totalCount
        } catch { return nil }
    }

    public func isExpired(for conversationId: String) -> Bool {
        do {
            let meta = try db.read { try DBCacheMetadata.fetchOne($0, key: metadataKey(for: conversationId)) }
            guard let meta else { return true }
            return meta.isExpired(ttl: ttl)
        } catch { return true }
    }

    // MARK: - Load

    public func loadFirstPage(for conversationId: String, forceRefresh: Bool = false) async throws -> [PaginatedParticipant] {
        if !forceRefresh, !isExpired(for: conversationId) {
            let existing = cached(for: conversationId)
            if !existing.isEmpty { return existing }
        }
        clearLocal(conversationId: conversationId)
        return try await loadNextPage(for: conversationId)
    }

    public func loadNextPage(for conversationId: String) async throws -> [PaginatedParticipant] {
        let key = metadataKey(for: conversationId)
        let existingMeta = try? db.read { try DBCacheMetadata.fetchOne($0, key: key) }
        if let existingMeta, !existingMeta.hasMore {
            return cached(for: conversationId)
        }

        let cursor = existingMeta?.nextCursor
        var endpoint = "/conversations/\(conversationId)/participants?limit=\(pageSize)"
        if let cursor { endpoint += "&cursor=\(cursor)" }

        let response: PaginatedParticipantsResponse = try await apiClient.request(endpoint: endpoint, method: "GET", body: nil, queryItems: nil)
        guard response.success else { return cached(for: conversationId) }

        let now = Date()
        try db.write { db in
            for participant in response.data {
                let record = DBCachedParticipant.from(participant, conversationId: conversationId)
                try record.save(db)
            }
            let newMeta = DBCacheMetadata(
                key: key,
                nextCursor: response.pagination?.nextCursor,
                hasMore: response.pagination?.hasMore ?? false,
                totalCount: response.pagination?.totalCount ?? existingMeta?.totalCount,
                lastFetchedAt: now
            )
            try newMeta.save(db)
        }

        // Refresh L1
        memoryCache[conversationId] = nil
        return cached(for: conversationId)
    }

    // MARK: - Mutations

    public func updateRole(conversationId: String, userId: String, newRole: String) {
        do {
            try db.write { db in
                let records = try DBCachedParticipant
                    .filter(Column("conversationId") == conversationId)
                    .filter(Column("id") == userId || Column("userId") == userId)
                    .fetchAll(db)
                for var record in records {
                    record.conversationRole = newRole.lowercased()
                    try record.update(db)
                }
            }
            // Update L1
            if var memory = memoryCache[conversationId],
               let idx = memory.firstIndex(where: { $0.id == userId || $0.userId == userId }) {
                memory[idx].conversationRole = newRole.lowercased()
                memoryCache[conversationId] = memory
            }
        } catch {
            logger.error("Failed to update role in cache: \(error.localizedDescription)")
        }
    }

    public func removeParticipant(conversationId: String, userId: String) {
        do {
            try db.write { db in
                _ = try DBCachedParticipant
                    .filter(Column("conversationId") == conversationId)
                    .filter(Column("id") == userId || Column("userId") == userId)
                    .deleteAll(db)

                let key = metadataKey(for: conversationId)
                if var meta = try DBCacheMetadata.fetchOne(db, key: key),
                   let total = meta.totalCount {
                    meta.totalCount = total - 1
                    try meta.update(db)
                }
            }
            memoryCache[conversationId]?.removeAll { $0.id == userId || $0.userId == userId }
        } catch {
            logger.error("Failed to remove participant from cache: \(error.localizedDescription)")
        }
    }

    // MARK: - Invalidation

    public func invalidate(conversationId: String) {
        clearLocal(conversationId: conversationId)
    }

    public func invalidateAll() {
        memoryCache.removeAll()
        do {
            try db.write { db in
                try DBCachedParticipant.deleteAll(db)
                _ = try DBCacheMetadata.filter(Column("key").like("participants:%")).deleteAll(db)
            }
        } catch {
            logger.error("Failed to invalidate all participant cache: \(error.localizedDescription)")
        }
    }

    private func clearLocal(conversationId: String) {
        memoryCache[conversationId] = nil
        do {
            try db.write { db in
                _ = try DBCachedParticipant.filter(Column("conversationId") == conversationId).deleteAll(db)
                _ = try DBCacheMetadata.deleteOne(db, key: metadataKey(for: conversationId))
            }
        } catch {
            logger.error("Failed to clear participant cache for \(conversationId): \(error.localizedDescription)")
        }
    }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/MeeshySDK && swift test --filter ParticipantCacheManagerTests 2>&1 | tail -20`
Expected: PASS (10 tests)

**Step 5: Run ALL existing tests to verify no regressions**

Run: `cd packages/MeeshySDK && swift test 2>&1 | tail -20`
Expected: All existing tests pass (no signature changes to public API consumed by app)

**Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/ParticipantCacheManager.swift packages/MeeshySDK/Tests/MeeshySDKTests/Cache/ParticipantCacheManagerTests.swift
git commit -m "feat(sdk): migrate ParticipantCacheManager to GRDB persistent storage with 24h TTL"
```

---

### Task 5: iOS App Integration + Build Verification

**Files:**
- Verify: `apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift`
- Verify: `apps/ios/Meeshy/Features/Main/Views/ParticipantsView.swift`

**Context:** The app already uses `ParticipantCacheManager.shared` which now defaults to `AppDatabase.shared.databaseWriter`. No code changes needed in the app — the migration is transparent. We just need to verify the build succeeds and the app works.

**Step 1: Build iOS app**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeded

**Step 2: Run SDK tests via xcodebuild (full integration)**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet 2>&1 | tail -20`
Expected: All tests pass

**Step 3: Commit (only if any build fixes were needed)**

If clean build with no changes:
```bash
echo "No changes needed — integration verified"
```

---

## Phase 2: Conversations + Messages Persistent Cache

### Task 6: ConversationCacheManager — GRDB Backend

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Cache/ConversationCacheManager.swift`
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/ConversationCacheManagerTests.swift`

**Context:** Uses the existing `conversations` table (v1 migration) with BLOB encoding. `LocalStore` already does this — we consolidate into a proper `ConversationCacheManager` actor with TTL=24h and the same pattern as `ParticipantCacheManager`. The app's `ConversationListViewModel` will read from this cache on startup instead of always hitting the API.

**Step 1: Write the failing tests**

Tests should cover:
- `saveConversations()` persists to SQLite
- `loadConversations()` reads from SQLite (cold start)
- `loadConversations()` with fresh cache does NOT call API
- `loadConversations()` with expired (>24h) cache calls API
- `invalidate()` clears SQLite
- `invalidateAll()` clears all
- `updateConversation()` upserts single conversation in SQLite
- `removeConversation()` deletes from SQLite

Follow the exact same TDD pattern as Task 4. Use in-memory `DatabaseQueue` + `MockAPIClient`.

The `ConversationCacheManager` stores `MeeshyConversation` as BLOB (via `JSONEncoder`) in the existing `conversations` table. Metadata key: `conversations:list`.

**Step 2-5:** RED → GREEN → REFACTOR → COMMIT

```bash
git commit -m "feat(sdk): add ConversationCacheManager with GRDB persistence and 24h TTL"
```

---

### Task 7: MessageCacheManager — GRDB Backend

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Cache/MessageCacheManager.swift`
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/MessageCacheManagerTests.swift`

**Context:** Uses the existing `messages` table (v1 migration) with BLOB encoding. Stores last N messages per conversation. The app's `ConversationViewModel` will read cached messages on open instead of loading from API.

**Step 1: Write the failing tests**

Tests should cover:
- `saveMessages(for:)` persists to SQLite (max 50 per conversation)
- `loadMessages(for:)` reads from SQLite in chronological order
- `appendMessage(for:)` adds single message (realtime socket)
- `updateMessage(for:)` updates existing message (edit)
- `deleteMessage(for:)` removes from SQLite
- `invalidate(conversationId:)` clears messages + metadata
- TTL check: expired (>24h) triggers API reload

Follow same TDD pattern. Use in-memory `DatabaseQueue`.

Metadata key: `messages:{conversationId}`.

**Step 2-5:** RED → GREEN → REFACTOR → COMMIT

```bash
git commit -m "feat(sdk): add MessageCacheManager with GRDB persistence and 24h TTL"
```

---

### Task 8: Wire ConversationCacheManager into ConversationListViewModel

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift`

**Context:** Replace the 30-second in-memory TTL with `ConversationCacheManager.shared`. On app open, read from SQLite immediately. Only refresh on socket events or pull-to-refresh.

**Step 1:** Read current `loadInitial()` and `refresh()` methods
**Step 2:** Replace with `ConversationCacheManager.shared.loadConversations()` for initial load
**Step 3:** Wire socket events (`conversation:joined`, `conversation:left`, `message:new`) to `invalidate()`
**Step 4:** Wire pull-to-refresh to `forceRefresh: true`
**Step 5:** Build and verify

```bash
git commit -m "feat(ios): wire ConversationCacheManager into ConversationListViewModel"
```

---

### Task 9: Wire MessageCacheManager into ConversationViewModel

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`

**Context:** On conversation open, read cached messages from SQLite immediately, display them, then check if new messages exist via API. Socket events (`message:new`, `message:edited`, `message:deleted`) update the cache.

**Step 1:** Read current `loadInitial()` method
**Step 2:** Add `MessageCacheManager.shared.loadMessages(for:)` as first step
**Step 3:** Display cached messages immediately, then fetch newer from API in background
**Step 4:** Wire socket events to cache mutations
**Step 5:** Build and verify

```bash
git commit -m "feat(ios): wire MessageCacheManager into ConversationViewModel"
```

---

### Task 10: Deprecate LocalStore

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/LocalStore.swift`

**Context:** Add `@available(*, deprecated)` to `LocalStore` now that all its functionality is in dedicated cache managers. Remove all call sites. Clean up in a follow-up PR.

**Step 1:** Search all usages of `LocalStore.shared`
**Step 2:** Replace with appropriate cache manager calls
**Step 3:** Mark `LocalStore` as deprecated
**Step 4:** Build and verify no compile errors

```bash
git commit -m "refactor(sdk): deprecate LocalStore in favor of dedicated CacheManagers"
```

---

### Task 11: Final Build + Push

**Step 1:** Run full SDK tests

Run: `cd packages/MeeshySDK && swift test 2>&1 | tail -20`

**Step 2:** Build iOS app

Run: `./apps/ios/meeshy.sh build`

**Step 3:** Push and merge

```bash
git push origin dev
git checkout main && git merge dev -m "merge: persistent SDK cache (GRDB) for participants, conversations, messages" && git push origin main && git checkout dev
```
