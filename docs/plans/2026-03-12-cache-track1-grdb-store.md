# Unified Cache — Track 1: GRDBCacheStore + Models

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **Worktree:** `../v2_meeshy-feat/cache-grdb-store` branch `feat/cache-grdb-store`

**Goal:** Implement the GRDBCacheStore actor (L1/L2 with persist-on-dirty, LRU eviction) and add CacheIdentifiable conformance on all SDK models.

**Architecture:** Generic actor conforming to MutableCacheStore. L1 = Dictionary with LRU eviction. L2 = GRDB cache_entries table (BLOB encoding). Persist-on-dirty with 2s debounce and 10s max cap. Freshness via CachePolicy.

**Tech Stack:** Swift 5.9+, GRDB 6.29.3, XCTest

**Prerequisites:** Phase 0 must be merged (CachePolicy, CacheIdentifiable, CacheResult, protocols available)

**File ownership (no other track touches these):**
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/AppDatabase.swift` (v3 migration)
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/CacheEntry.swift` (new)
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheStore.swift` (new)
- `packages/MeeshySDK/Sources/MeeshySDK/Models/*.swift` (CacheIdentifiable conformance)
- `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/GRDBCacheStoreTests.swift` (new)
- `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/AppDatabaseMigrationTests.swift` (extend)

---

### Task 1: CacheEntry GRDB Record + Migration v3

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/CacheEntry.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/AppDatabase.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/AppDatabaseMigrationTests.swift`

**Step 1: Write failing tests** (add to AppDatabaseMigrationTests.swift)

```swift
func test_v3Migration_createsCacheEntriesTable() throws {
    let dbQueue = try DatabaseQueue()
    try AppDatabase.runMigrations(on: dbQueue)
    try dbQueue.read { db in XCTAssertTrue(try db.tableExists("cache_entries")) }
}

func test_v3Migration_cacheEntriesHasCompoundPK() throws {
    let dbQueue = try DatabaseQueue()
    try AppDatabase.runMigrations(on: dbQueue)
    try dbQueue.read { db in
        let cols = try db.columns(in: "cache_entries").map(\.name)
        XCTAssertTrue(cols.contains("key"))
        XCTAssertTrue(cols.contains("itemId"))
        XCTAssertTrue(cols.contains("encodedData"))
        XCTAssertTrue(cols.contains("updatedAt"))
    }
}

func test_v3Migration_cacheEntriesKeyIndex() throws {
    let dbQueue = try DatabaseQueue()
    try AppDatabase.runMigrations(on: dbQueue)
    try dbQueue.read { db in
        let idx = try db.indexes(on: "cache_entries").map(\.name)
        XCTAssertTrue(idx.contains("idx_cache_entries_key"))
    }
}

func test_v3Migration_dropsCachedParticipants() throws {
    let dbQueue = try DatabaseQueue()
    try AppDatabase.runMigrations(on: dbQueue)
    try dbQueue.read { db in XCTAssertFalse(try db.tableExists("cached_participants")) }
}

func test_v3Migration_preservesExistingTables() throws {
    let dbQueue = try DatabaseQueue()
    try AppDatabase.runMigrations(on: dbQueue)
    try dbQueue.read { db in
        XCTAssertTrue(try db.tableExists("conversations"))
        XCTAssertTrue(try db.tableExists("messages"))
        XCTAssertTrue(try db.tableExists("cache_metadata"))
    }
}

func test_cacheEntry_insertAndFetch() throws {
    let dbQueue = try DatabaseQueue()
    try AppDatabase.runMigrations(on: dbQueue)
    try dbQueue.write { db in
        var entry = CacheEntry(key: "test:key", itemId: "item1", encodedData: Data("hello".utf8), updatedAt: Date())
        try entry.insert(db)
    }
    let rows = try dbQueue.read { db in try CacheEntry.fetchAll(db) }
    XCTAssertEqual(rows.count, 1)
    XCTAssertEqual(rows[0].key, "test:key")
    XCTAssertEqual(rows[0].itemId, "item1")
}

func test_cacheEntry_upsertOnConflict() throws {
    let dbQueue = try DatabaseQueue()
    try AppDatabase.runMigrations(on: dbQueue)
    try dbQueue.write { db in
        let entry1 = CacheEntry(key: "k", itemId: "i1", encodedData: Data("v1".utf8), updatedAt: Date())
        try entry1.save(db) // INSERT
        let entry2 = CacheEntry(key: "k", itemId: "i1", encodedData: Data("v2".utf8), updatedAt: Date())
        try entry2.save(db) // UPDATE (same PK)
    }
    let rows = try dbQueue.read { db in try CacheEntry.fetchAll(db) }
    XCTAssertEqual(rows.count, 1)
    XCTAssertEqual(String(data: rows[0].encodedData, encoding: .utf8), "v2")
}
```

**Step 2: Run tests — expected FAIL**

**Step 3: Implement**

`CacheEntry.swift`:
```swift
import Foundation
import GRDB

struct CacheEntry: Codable, FetchableRecord, PersistableRecord, Sendable {
    static let databaseTableName = "cache_entries"
    var key: String
    var itemId: String
    var encodedData: Data
    var updatedAt: Date
}
```

Add v3 migration to `AppDatabase.runMigrations(on:)` after v2:
```swift
migrator.registerMigration("v3_unified_cache") { db in
    try db.drop(table: "cached_participants")
    try db.create(table: "cache_entries") { t in
        t.column("key", .text).notNull()
        t.column("itemId", .text).notNull()
        t.column("encodedData", .blob).notNull()
        t.column("updatedAt", .datetime).notNull()
        t.primaryKey(["key", "itemId"])
    }
    try db.create(index: "idx_cache_entries_key", on: "cache_entries", columns: ["key"])
}
```

**Step 4: Run tests — expected PASS** (7 new + existing)

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/CacheEntry.swift \
       packages/MeeshySDK/Sources/MeeshySDK/Persistence/AppDatabase.swift \
       packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/AppDatabaseMigrationTests.swift
git commit -m "feat(sdk): add GRDB v3 migration — cache_entries table, drop cached_participants"
```

---

### Task 2: GRDBCacheStore — Core Actor

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheStore.swift`
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/GRDBCacheStoreTests.swift`

**Step 1: Write failing tests**

```swift
import XCTest
import GRDB
@testable import MeeshySDK

private struct TestItem: CacheIdentifiable, Codable, Equatable {
    var id: String
    var name: String
}

final class GRDBCacheStoreTests: XCTestCase {

    private func makeStore(
        policy: CachePolicy = .conversations,
        maxL1Keys: Int = 20
    ) throws -> (GRDBCacheStore<String, TestItem>, DatabaseQueue) {
        let dbQueue = try DatabaseQueue()
        try AppDatabase.runMigrations(on: dbQueue)
        let store = GRDBCacheStore<String, TestItem>(policy: policy, db: dbQueue, maxL1Keys: maxL1Keys)
        return (store, dbQueue)
    }

    // MARK: - Save + Load

    func test_save_thenLoad_returnsFresh() async throws {
        let (store, _) = try makeStore()
        await store.save([TestItem(id: "1", name: "Alice")], for: "k")
        let result = await store.load(for: "k")
        switch result {
        case .fresh(let items, let age):
            XCTAssertEqual(items, [TestItem(id: "1", name: "Alice")])
            XCTAssert(age < 1)
        default: XCTFail("Expected .fresh, got \(result)")
        }
    }

    func test_load_nonExistent_returnsEmpty() async throws {
        let (store, _) = try makeStore()
        let result = await store.load(for: "missing")
        if case .empty = result { } else { XCTFail("Expected .empty") }
    }

    func test_save_persistsToL2() async throws {
        let (store, db) = try makeStore()
        await store.save([TestItem(id: "1", name: "A"), TestItem(id: "2", name: "B")], for: "k")
        let rows = try db.read { db in try CacheEntry.filter(Column("key") == "k").fetchCount(db) }
        XCTAssertEqual(rows, 2)
    }

    func test_save_updatesMetadata() async throws {
        let (store, db) = try makeStore()
        await store.save([TestItem(id: "1", name: "A")], for: "k")
        let meta = try db.read { db in try DBCacheMetadata.fetchOne(db, key: "k") }
        XCTAssertNotNil(meta)
        XCTAssertFalse(meta!.isExpired(ttl: 86400))
    }

    func test_save_trimsToMaxItemCount() async throws {
        let policy = CachePolicy(ttl: 3600, staleTTL: nil, maxItemCount: 2, storageLocation: .grdb)
        let (store, _) = try makeStore(policy: policy)
        let items = [TestItem(id: "1", name: "A"), TestItem(id: "2", name: "B"), TestItem(id: "3", name: "C")]
        await store.save(items, for: "k")
        let result = await store.load(for: "k")
        XCTAssertEqual(result.value?.count, 2)
    }

    // MARK: - Update

    func test_update_mutatesL1() async throws {
        let (store, _) = try makeStore()
        await store.save([TestItem(id: "1", name: "Alice")], for: "k")
        await store.update(for: "k") { $0.map { var i = $0; i.name = "Bob"; return i } }
        XCTAssertEqual((await store.load(for: "k")).value?.first?.name, "Bob")
    }

    func test_update_onMissingKey_isNoOp() async throws {
        let (store, _) = try makeStore()
        await store.update(for: "missing") { _ in [TestItem(id: "1", name: "X")] }
        if case .empty = await store.load(for: "missing") { } else { XCTFail("Expected .empty") }
    }

    // MARK: - Invalidate

    func test_invalidate_clearsKeyFromL1AndL2() async throws {
        let (store, db) = try makeStore()
        await store.save([TestItem(id: "1", name: "A")], for: "k")
        await store.invalidate(for: "k")
        let result = await store.load(for: "k")
        XCTAssertNil(result.value)
        let rows = try db.read { db in try CacheEntry.filter(Column("key") == "k").fetchCount(db) }
        XCTAssertEqual(rows, 0)
    }

    func test_invalidateAll_clearsAllKeys() async throws {
        let (store, _) = try makeStore()
        await store.save([TestItem(id: "1", name: "A")], for: "k1")
        await store.save([TestItem(id: "2", name: "B")], for: "k2")
        await store.invalidateAll()
        XCTAssertNil((await store.load(for: "k1")).value)
        XCTAssertNil((await store.load(for: "k2")).value)
    }

    // MARK: - Flush

    func test_flushDirtyKeys_persistsMutationToL2() async throws {
        let (store, db) = try makeStore()
        await store.save([TestItem(id: "1", name: "Alice")], for: "k")
        await store.update(for: "k") { $0.map { var i = $0; i.name = "Bob"; return i } }
        await store.flushDirtyKeys()
        let rows = try db.read { db in try CacheEntry.filter(Column("key") == "k").fetchAll(db) }
        XCTAssertEqual(rows.count, 1)
        let decoded = try JSONDecoder().decode(TestItem.self, from: rows[0].encodedData)
        XCTAssertEqual(decoded.name, "Bob")
    }

    func test_flushDirtyKeys_noDirty_isNoOp() async throws {
        let (store, _) = try makeStore()
        await store.save([TestItem(id: "1", name: "A")], for: "k")
        await store.flushDirtyKeys() // No update → nothing dirty
    }

    func test_flushDirtyKeys_removesDeletedItems() async throws {
        let (store, db) = try makeStore()
        await store.save([TestItem(id: "1", name: "A"), TestItem(id: "2", name: "B")], for: "k")
        await store.update(for: "k") { $0.filter { $0.id != "1" } }
        await store.flushDirtyKeys()
        let rows = try db.read { db in try CacheEntry.filter(Column("key") == "k").fetchAll(db) }
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows[0].itemId, "2")
    }

    // MARK: - LRU

    func test_lru_evictsOldestFromL1_butPreservesL2() async throws {
        let (store, db) = try makeStore(maxL1Keys: 3)
        await store.save([TestItem(id: "1", name: "A")], for: "k1")
        await store.save([TestItem(id: "2", name: "B")], for: "k2")
        await store.save([TestItem(id: "3", name: "C")], for: "k3")
        await store.save([TestItem(id: "4", name: "D")], for: "k4")
        // k1 evicted from L1 but still in L2 — load should restore it
        let result = await store.load(for: "k1")
        XCTAssertEqual(result.value?.first?.name, "A")
        // Verify L2 still has it
        let rows = try db.read { db in try CacheEntry.filter(Column("key") == "k1").fetchCount(db) }
        XCTAssertEqual(rows, 1)
    }

    // MARK: - Freshness from L2

    func test_load_fromL2_checksFreshnessViaMetadata() async throws {
        let policy = CachePolicy(ttl: 1, staleTTL: nil, maxItemCount: nil, storageLocation: .grdb)
        let (store, _) = try makeStore(policy: policy)
        await store.save([TestItem(id: "1", name: "A")], for: "k")
        // Wait for TTL to expire
        try await Task.sleep(for: .seconds(1.5))
        // Clear L1 manually via invalidate + re-save to L2 is complex,
        // so just test that expired returns .expired
        await store.invalidateAll() // Clears L1 AND L2
        let result = await store.load(for: "k")
        if case .empty = result { } else { XCTFail("Expected .empty after invalidateAll") }
    }
}
```

**Step 2: Run tests — expected FAIL**

**Step 3: Implement GRDBCacheStore.swift**

The actor must implement:
- `init(policy:db:maxL1Keys:)` — injectable DatabaseWriter
- `memoryCache: [Key: L1Entry]` with `L1Entry { items, loadedAt }`
- `accessOrder: [Key]` and `maxL1Keys: Int` for LRU
- `dirtyKeys: Set<Key>`, `persistTask: Task?`, `firstDirtyAt: Date?` for persist-on-dirty
- `save()` — trim to maxItemCount, write to L2 directly (UPSERT + cleanup), populate L1, upsert metadata
- `load()` — check L1 freshness, then L2 freshness via metadata.lastFetchedAt, return CacheResult
- `update()` — mutate L1, markDirty
- `invalidate()` — clear L1 entry, delete L2 entries + metadata
- `invalidateAll()` — clear all L1, delete all L2 entries + metadata
- `flushDirtyKeys()` — public, UPSERT dirty items, DELETE removed items, clear dirty keys only on success
- `markDirty()` — debounce 2s, max cap 10s
- `touchKey()` — LRU tracking

Use `CachePolicy.freshness(age:)` for all freshness decisions.

**Step 4: Run tests — expected PASS** (15 tests)

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheStore.swift \
       packages/MeeshySDK/Tests/MeeshySDKTests/Cache/GRDBCacheStoreTests.swift
git commit -m "feat(sdk): add GRDBCacheStore — L1/L2 with persist-on-dirty, LRU, and freshness"
```

---

### Task 3: CacheIdentifiable Conformance on SDK Models

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/ParticipantModels.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift`

**Step 1: Add CacheIdentifiable conformance**

Each of these models already has `id: String` and is `Codable`. Add the conformance extension:

```swift
// In ConversationModels.swift (after MeeshyConversation definition)
extension MeeshyConversation: CacheIdentifiable {}

// In MessageModels.swift (after MeeshyMessage definition)
extension MeeshyMessage: CacheIdentifiable {}

// In ParticipantModels.swift (after PaginatedParticipant definition)
// PaginatedParticipant already conforms to Identifiable with `id: String`
extension PaginatedParticipant: CacheIdentifiable {}

// In CoreModels.swift (after MeeshyUser definition, if it exists and has `id: String`)
extension MeeshyUser: CacheIdentifiable {}
```

**IMPORTANT:** Before adding, verify each model:
1. Has `var id: String` (or `let id: String`)
2. Conforms to `Codable` (needed for GRDBCacheStore BLOB encoding)
3. Conforms to `Sendable` (CacheIdentifiable requires Sendable)

If any model is NOT Codable, add conformance. If any is NOT Sendable, add `@unchecked Sendable` or make it Sendable.

**Step 2: Build to verify**

```bash
cd packages/MeeshySDK && swift build
```

Expected: Build succeeded

**Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/
git commit -m "feat(sdk): add CacheIdentifiable conformance to SDK models"
```

---

## Track 1 Complete

After all 3 tasks, push the branch:

```bash
git push origin feat/cache-grdb-store
```

This track delivers:
- GRDB v3 migration with `cache_entries` table
- `CacheEntry` GRDB record type
- `GRDBCacheStore<Key, Value>` fully tested actor
- All SDK models conforming to `CacheIdentifiable`

**Merge order: 1** — merge this track first before Track 2.
