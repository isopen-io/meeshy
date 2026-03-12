# Unified Cache System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace 6+ ad-hoc cache managers with a unified L1/L2 cache system featuring socket-driven invalidation, configurable TTL with stale-while-revalidate, and media support.

**Architecture:** Protocol-oriented cache with `ReadableCacheStore` + `MutableCacheStore` protocols. `GRDBCacheStore` (actor) handles structured data via BLOB encoding in a generic `cache_entries` table. `DiskCacheStore` (actor) handles media files with NSCache L1. A `CacheCoordinator` (actor) bridges Socket.IO Combine publishers to cache mutations with persist-on-dirty debounce.

**Tech Stack:** Swift 5.9+, GRDB 6.29.3, Combine, Swift Concurrency (actors), XCTest

**Design doc:** `docs/plans/2026-03-12-unified-cache-system-design.md`

---

## Task 1: CachePolicy + CacheIdentifiable + CacheResult

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CachePolicy.swift`
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheIdentifiable.swift`
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheResult.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/CachePolicyTests.swift`

**Step 1: Write failing tests**

```swift
import XCTest
@testable import MeeshySDK

final class CachePolicyTests: XCTestCase {

    func test_init_validStaleTTL_preservesValues() {
        let policy = CachePolicy(ttl: 3600, staleTTL: 300, maxItemCount: 50, storageLocation: .grdb)
        XCTAssertEqual(policy.ttl, 3600)
        XCTAssertEqual(policy.staleTTL, 300)
        XCTAssertEqual(policy.maxItemCount, 50)
    }

    func test_init_staleTTLGreaterThanTTL_clampsToTTL() {
        let policy = CachePolicy(ttl: 300, staleTTL: 3600, maxItemCount: nil, storageLocation: .grdb)
        XCTAssertEqual(policy.staleTTL, 300, "staleTTL should be clamped to ttl")
    }

    func test_init_nilStaleTTL_staysNil() {
        let policy = CachePolicy(ttl: 3600, staleTTL: nil, maxItemCount: nil, storageLocation: .grdb)
        XCTAssertNil(policy.staleTTL)
    }

    func test_init_staleTTLEqualToTTL_preserves() {
        let policy = CachePolicy(ttl: 3600, staleTTL: 3600, maxItemCount: nil, storageLocation: .grdb)
        XCTAssertEqual(policy.staleTTL, 3600)
    }

    func test_predefined_conversations() {
        let p = CachePolicy.conversations
        XCTAssertEqual(p.ttl, 86400)
        XCTAssertEqual(p.staleTTL, 300)
        XCTAssertNil(p.maxItemCount)
    }

    func test_predefined_messages() {
        let p = CachePolicy.messages
        XCTAssertEqual(p.ttl, 15_552_000) // 6 months
        XCTAssertNil(p.staleTTL)
        XCTAssertEqual(p.maxItemCount, 50)
    }

    func test_timeInterval_helpers() {
        XCTAssertEqual(TimeInterval.minutes(5), 300)
        XCTAssertEqual(TimeInterval.hours(24), 86400)
        XCTAssertEqual(TimeInterval.days(7), 604800)
    }

    func test_cacheResult_value_freshReturnsData() {
        let result = CacheResult<[String]>.fresh(["a", "b"], age: 10)
        XCTAssertEqual(result.value, ["a", "b"])
    }

    func test_cacheResult_value_expiredReturnsNil() {
        let result = CacheResult<[String]>.expired
        XCTAssertNil(result.value)
    }

    func test_cacheResult_value_staleReturnsData() {
        let result = CacheResult<[String]>.stale(["a"], age: 500)
        XCTAssertEqual(result.value, ["a"])
    }
}
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshySDKTests/CachePolicyTests -quiet 2>&1 | tail -5`
Expected: FAIL — types not defined

**Step 3: Write minimal implementation**

`CacheIdentifiable.swift`:
```swift
import Foundation

public protocol CacheIdentifiable: Sendable {
    var id: String { get }
}
```

`CacheResult.swift`:
```swift
import Foundation

public enum CacheResult<T: Sendable>: Sendable {
    case fresh(T, age: TimeInterval)
    case stale(T, age: TimeInterval)
    case expired
    case empty

    public var value: T? {
        switch self {
        case .fresh(let v, _), .stale(let v, _): return v
        case .expired, .empty: return nil
        }
    }
}
```

`CachePolicy.swift`:
```swift
import Foundation
import os

public struct CachePolicy: Sendable {
    public let ttl: TimeInterval
    public let staleTTL: TimeInterval?
    public let maxItemCount: Int?
    public let storageLocation: StorageLocation

    private static let logger = Logger(subsystem: "com.meeshy.sdk", category: "cache-policy")

    public enum StorageLocation: Sendable {
        case grdb
        case disk(subdir: String, maxBytes: Int)
    }

    public init(ttl: TimeInterval, staleTTL: TimeInterval?, maxItemCount: Int?, storageLocation: StorageLocation) {
        self.ttl = ttl
        self.maxItemCount = maxItemCount
        self.storageLocation = storageLocation

        if let stale = staleTTL, stale > ttl {
            Self.logger.warning("staleTTL (\(stale)s) > ttl (\(ttl)s) — clamping staleTTL to ttl")
            self.staleTTL = ttl
        } else {
            self.staleTTL = staleTTL
        }
    }
}

// MARK: - Predefined Policies

extension CachePolicy {
    public static let conversations = CachePolicy(ttl: .hours(24), staleTTL: .minutes(5), maxItemCount: nil, storageLocation: .grdb)
    public static let messages = CachePolicy(ttl: .months(6), staleTTL: nil, maxItemCount: 50, storageLocation: .grdb)
    public static let participants = CachePolicy(ttl: .hours(24), staleTTL: .minutes(5), maxItemCount: nil, storageLocation: .grdb)
    public static let userProfiles = CachePolicy(ttl: .hours(1), staleTTL: .minutes(5), maxItemCount: 100, storageLocation: .grdb)
    public static let mediaImages = CachePolicy(ttl: .years(1), staleTTL: nil, maxItemCount: nil, storageLocation: .disk(subdir: "Images", maxBytes: 300_000_000))
    public static let mediaAudio = CachePolicy(ttl: .months(6), staleTTL: nil, maxItemCount: nil, storageLocation: .disk(subdir: "Audio", maxBytes: 200_000_000))
    public static let mediaVideo = CachePolicy(ttl: .months(6), staleTTL: nil, maxItemCount: nil, storageLocation: .disk(subdir: "Video", maxBytes: 500_000_000))
    public static let thumbnails = CachePolicy(ttl: .days(7), staleTTL: nil, maxItemCount: nil, storageLocation: .disk(subdir: "Thumbnails", maxBytes: 50_000_000))
}

// MARK: - TimeInterval Helpers

extension TimeInterval {
    static func minutes(_ n: Double) -> TimeInterval { n * 60 }
    static func hours(_ n: Double) -> TimeInterval { n * 3600 }
    static func days(_ n: Double) -> TimeInterval { n * 86400 }
    static func months(_ n: Double) -> TimeInterval { n * 30 * 86400 }
    static func years(_ n: Double) -> TimeInterval { n * 365 * 86400 }
}
```

**Step 4: Run tests to verify they pass**

Run: same command as Step 2
Expected: PASS — 10 tests, 0 failures

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/CachePolicy.swift \
       packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheIdentifiable.swift \
       packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheResult.swift \
       packages/MeeshySDK/Tests/MeeshySDKTests/Cache/CachePolicyTests.swift
git commit -m "feat(sdk): add CachePolicy, CacheIdentifiable, CacheResult foundation types"
```

---

## Task 2: ReadableCacheStore + MutableCacheStore Protocols

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheStoreProtocols.swift`
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/MockCacheStoreTests.swift`

**Step 1: Write failing tests**

```swift
import XCTest
@testable import MeeshySDK

// Test helper: concrete mock to verify protocol works
private struct TestItem: CacheIdentifiable, Codable, Equatable {
    var id: String
    var name: String
}

private actor MockMutableStore: MutableCacheStore {
    typealias Key = String
    typealias Value = TestItem
    let policy = CachePolicy.conversations
    var storage: [String: [TestItem]] = [:]

    func load(for key: String) async -> CacheResult<[TestItem]> {
        guard let items = storage[key] else { return .empty }
        return .fresh(items, age: 0)
    }
    func save(_ items: [TestItem], for key: String) async { storage[key] = items }
    func update(for key: String, mutate: @Sendable ([TestItem]) -> [TestItem]) async {
        storage[key] = mutate(storage[key] ?? [])
    }
    func invalidate(for key: String) async { storage.removeValue(forKey: key) }
    func invalidateAll() async { storage.removeAll() }
}

final class MockCacheStoreTests: XCTestCase {

    func test_mockStore_saveAndLoad() async {
        let store = MockMutableStore()
        let items = [TestItem(id: "1", name: "Alice")]
        await store.save(items, for: "key1")
        let result = await store.load(for: "key1")
        XCTAssertEqual(result.value, items)
    }

    func test_mockStore_update_mutatesInPlace() async {
        let store = MockMutableStore()
        await store.save([TestItem(id: "1", name: "Alice")], for: "key1")
        await store.update(for: "key1") { items in
            items.map { var i = $0; i.name = "Bob"; return i }
        }
        let result = await store.load(for: "key1")
        XCTAssertEqual(result.value?.first?.name, "Bob")
    }

    func test_mockStore_invalidate_removesKey() async {
        let store = MockMutableStore()
        await store.save([TestItem(id: "1", name: "Alice")], for: "key1")
        await store.invalidate(for: "key1")
        let result = await store.load(for: "key1")
        XCTAssertNil(result.value)
    }

    func test_mockStore_invalidateAll_clearsEverything() async {
        let store = MockMutableStore()
        await store.save([TestItem(id: "1", name: "A")], for: "key1")
        await store.save([TestItem(id: "2", name: "B")], for: "key2")
        await store.invalidateAll()
        let r1 = await store.load(for: "key1")
        let r2 = await store.load(for: "key2")
        XCTAssertNil(r1.value)
        XCTAssertNil(r2.value)
    }

    func test_readableStore_conformance() async {
        // Verify ReadableCacheStore works independently
        let store = MockMutableStore()
        await store.save([TestItem(id: "1", name: "A")], for: "k")
        let readable: any ReadableCacheStore<String, TestItem> = store
        // This should compile and work — existential type erasure
        _ = readable
    }
}
```

**Step 2: Run tests — expected FAIL** (protocols not defined)

**Step 3: Write minimal implementation**

`CacheStoreProtocols.swift`:
```swift
import Foundation

public protocol ReadableCacheStore<Key, Value> {
    associatedtype Key: Hashable & Sendable & CustomStringConvertible
    associatedtype Value: Sendable

    var policy: CachePolicy { get }

    func load(for key: Key) async -> CacheResult<[Value]>
    func invalidate(for key: Key) async
    func invalidateAll() async
}

public protocol MutableCacheStore<Key, Value>: ReadableCacheStore {
    func save(_ items: [Value], for key: Key) async
    func update(for key: Key, mutate: @Sendable ([Value]) -> [Value]) async
}
```

**Step 4: Run tests — expected PASS** (5 tests, 0 failures)

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheStoreProtocols.swift \
       packages/MeeshySDK/Tests/MeeshySDKTests/Cache/MockCacheStoreTests.swift
git commit -m "feat(sdk): add ReadableCacheStore and MutableCacheStore protocols"
```

---

## Task 3: GRDB Migration v3 — cache_entries Table

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/AppDatabase.swift`
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/CacheEntry.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/AppDatabaseMigrationTests.swift`

**Step 1: Write failing tests** (add to existing migration test file)

```swift
// Add to AppDatabaseMigrationTests.swift

func test_v3Migration_createsCacheEntriesTable() throws {
    let dbQueue = try DatabaseQueue()
    try AppDatabase.runMigrations(on: dbQueue)
    try dbQueue.read { db in
        XCTAssertTrue(try db.tableExists("cache_entries"))
    }
}

func test_v3Migration_cacheEntriesHasCompoundPrimaryKey() throws {
    let dbQueue = try DatabaseQueue()
    try AppDatabase.runMigrations(on: dbQueue)
    try dbQueue.read { db in
        let columns = try db.columns(in: "cache_entries")
        let colNames = columns.map(\.name)
        XCTAssertTrue(colNames.contains("key"))
        XCTAssertTrue(colNames.contains("itemId"))
        XCTAssertTrue(colNames.contains("encodedData"))
        XCTAssertTrue(colNames.contains("updatedAt"))
    }
}

func test_v3Migration_cacheEntriesKeyIndex() throws {
    let dbQueue = try DatabaseQueue()
    try AppDatabase.runMigrations(on: dbQueue)
    try dbQueue.read { db in
        let indexes = try db.indexes(on: "cache_entries")
        let indexNames = indexes.map(\.name)
        XCTAssertTrue(indexNames.contains("idx_cache_entries_key"))
    }
}

func test_v3Migration_dropsCachedParticipants() throws {
    let dbQueue = try DatabaseQueue()
    try AppDatabase.runMigrations(on: dbQueue)
    try dbQueue.read { db in
        XCTAssertFalse(try db.tableExists("cached_participants"))
    }
}

func test_v3Migration_preservesV1Tables() throws {
    let dbQueue = try DatabaseQueue()
    try AppDatabase.runMigrations(on: dbQueue)
    try dbQueue.read { db in
        XCTAssertTrue(try db.tableExists("conversations"))
        XCTAssertTrue(try db.tableExists("messages"))
        XCTAssertTrue(try db.tableExists("cache_metadata"))
    }
}
```

**Step 2: Run tests — expected FAIL** (v3 migration not registered)

**Step 3: Write implementation**

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

Add v3 migration to `AppDatabase.runMigrations(on:)`:

```swift
migrator.registerMigration("v3_unified_cache") { db in
    // Drop normalized participants table (migration directe, app en dev)
    try db.drop(table: "cached_participants")

    // Create generic cache entries table
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

**Step 4: Run tests — expected PASS** (all migration tests including new 5)

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/CacheEntry.swift \
       packages/MeeshySDK/Sources/MeeshySDK/Persistence/AppDatabase.swift \
       packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/AppDatabaseMigrationTests.swift
git commit -m "feat(sdk): add GRDB v3 migration — cache_entries table, drop cached_participants"
```

---

## Task 4: GRDBCacheStore — Core Implementation

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

    private func makeStore(policy: CachePolicy = .conversations) throws -> GRDBCacheStore<String, TestItem> {
        let dbQueue = try DatabaseQueue()
        try AppDatabase.runMigrations(on: dbQueue)
        return GRDBCacheStore(policy: policy, db: dbQueue)
    }

    // MARK: - Save + Load

    func test_save_persistsToL2_loadReturnsFromL2() async throws {
        let store = try makeStore()
        let items = [TestItem(id: "1", name: "Alice"), TestItem(id: "2", name: "Bob")]
        await store.save(items, for: "key1")
        // Force L1 miss by creating new store with same DB
        // Since actor, we read directly — L1 should be populated from save
        let result = await store.load(for: "key1")
        XCTAssertEqual(result.value, items)
    }

    func test_load_emptyStore_returnsEmpty() async throws {
        let store = try makeStore()
        let result = await store.load(for: "nonexistent")
        switch result {
        case .empty: break
        default: XCTFail("Expected .empty, got \(result)")
        }
    }

    func test_load_freshData_returnsFresh() async throws {
        let store = try makeStore(policy: CachePolicy(ttl: 3600, staleTTL: 300, maxItemCount: nil, storageLocation: .grdb))
        await store.save([TestItem(id: "1", name: "A")], for: "k")
        let result = await store.load(for: "k")
        switch result {
        case .fresh(let items, let age):
            XCTAssertEqual(items.count, 1)
            XCTAssert(age < 1)
        default: XCTFail("Expected .fresh")
        }
    }

    // MARK: - Update (L1 mutation + dirty)

    func test_update_mutatesL1() async throws {
        let store = try makeStore()
        await store.save([TestItem(id: "1", name: "Alice")], for: "k")
        await store.update(for: "k") { items in
            items.map { var i = $0; i.name = "Bob"; return i }
        }
        let result = await store.load(for: "k")
        XCTAssertEqual(result.value?.first?.name, "Bob")
    }

    func test_update_onMissingKey_doesNothing() async throws {
        let store = try makeStore()
        await store.update(for: "missing") { _ in [TestItem(id: "1", name: "X")] }
        let result = await store.load(for: "missing")
        // Should not create entry from thin air via update
        switch result {
        case .empty: break
        default: XCTFail("Expected .empty since key was never saved")
        }
    }

    // MARK: - Invalidate

    func test_invalidate_removesKeyFromL1AndL2() async throws {
        let store = try makeStore()
        await store.save([TestItem(id: "1", name: "A")], for: "k")
        await store.invalidate(for: "k")
        let result = await store.load(for: "k")
        switch result {
        case .empty, .expired: break
        default: XCTFail("Expected empty/expired after invalidate")
        }
    }

    func test_invalidateAll_clearsEverything() async throws {
        let store = try makeStore()
        await store.save([TestItem(id: "1", name: "A")], for: "k1")
        await store.save([TestItem(id: "2", name: "B")], for: "k2")
        await store.invalidateAll()
        let r1 = await store.load(for: "k1")
        let r2 = await store.load(for: "k2")
        XCTAssertNil(r1.value)
        XCTAssertNil(r2.value)
    }

    // MARK: - Flush

    func test_flushDirtyKeys_persistsMutationsToL2() async throws {
        let dbQueue = try DatabaseQueue()
        try AppDatabase.runMigrations(on: dbQueue)
        let store = GRDBCacheStore<String, TestItem>(policy: .conversations, db: dbQueue)
        await store.save([TestItem(id: "1", name: "Alice")], for: "k")
        await store.update(for: "k") { items in
            items.map { var i = $0; i.name = "Bob"; return i }
        }
        await store.flushDirtyKeys()
        // Verify L2 directly
        let rows = try dbQueue.read { db in
            try CacheEntry.filter(Column("key") == "k").fetchAll(db)
        }
        XCTAssertEqual(rows.count, 1)
        let decoded = try JSONDecoder().decode(TestItem.self, from: rows[0].encodedData)
        XCTAssertEqual(decoded.name, "Bob")
    }

    func test_flushDirtyKeys_noDirty_doesNothing() async throws {
        let store = try makeStore()
        await store.save([TestItem(id: "1", name: "A")], for: "k")
        // No update → no dirty → flush should be a no-op
        await store.flushDirtyKeys()
    }

    // MARK: - LRU Eviction

    func test_lru_evictsOldestKey_whenMaxL1KeysExceeded() async throws {
        // Use a store with small maxL1Keys for testing
        let dbQueue = try DatabaseQueue()
        try AppDatabase.runMigrations(on: dbQueue)
        let store = GRDBCacheStore<String, TestItem>(policy: .conversations, db: dbQueue, maxL1Keys: 3)
        await store.save([TestItem(id: "1", name: "A")], for: "k1")
        await store.save([TestItem(id: "2", name: "B")], for: "k2")
        await store.save([TestItem(id: "3", name: "C")], for: "k3")
        await store.save([TestItem(id: "4", name: "D")], for: "k4")
        // k1 should be evicted from L1, but still in L2
        // Load k1 — should come from L2
        let result = await store.load(for: "k1")
        XCTAssertEqual(result.value?.first?.name, "A")
    }

    // MARK: - maxItemCount trimming

    func test_save_trimsToMaxItemCount() async throws {
        let policy = CachePolicy(ttl: 3600, staleTTL: nil, maxItemCount: 2, storageLocation: .grdb)
        let dbQueue = try DatabaseQueue()
        try AppDatabase.runMigrations(on: dbQueue)
        let store = GRDBCacheStore<String, TestItem>(policy: policy, db: dbQueue)
        let items = [TestItem(id: "1", name: "A"), TestItem(id: "2", name: "B"), TestItem(id: "3", name: "C")]
        await store.save(items, for: "k")
        let result = await store.load(for: "k")
        XCTAssertEqual(result.value?.count, 2, "Should trim to maxItemCount")
    }
}
```

**Step 2: Run tests — expected FAIL** (GRDBCacheStore not defined)

**Step 3: Write implementation**

`GRDBCacheStore.swift` — the core actor implementing `MutableCacheStore` with:
- L1 Dictionary with LRU eviction (configurable `maxL1Keys`, default 20)
- L2 GRDB via `cache_entries` table + `cache_metadata` for TTL
- Persist-on-dirty with 2s debounce and 10s max cap
- Freshness calculation using `CachePolicy.staleTTL` and `CachePolicy.ttl`
- `flushDirtyKeys()` as public method (for background flush)
- UPSERT via GRDB `record.save(db)` + DELETE removed items
- Only clears dirty keys after successful write
- `save()` writes directly to L2 + L1 (no dirty marking — it's a full replace)
- `update()` mutates L1 only, marks dirty for batch persist
- `load()` checks L1 freshness → L2 freshness → returns appropriate CacheResult

**Implementation notes for the subagent:**
- `GRDBCacheStore` must `import GRDB` and `import os`
- Use `JSONEncoder` with `.iso8601` date strategy for BLOB encoding
- `save()` must also upsert a `DBCacheMetadata` row with `lastFetchedAt = Date()` for L2 TTL tracking
- `load()` from L2 reads `DBCacheMetadata` to check `lastFetchedAt` freshness
- `invalidate(for:)` must delete from L1, L2 (`cache_entries`), and metadata (`cache_metadata`)
- Constructor: `init(policy: CachePolicy, db: any DatabaseWriter, maxL1Keys: Int = 20)`

**Step 4: Run tests — expected PASS** (12 tests, 0 failures)

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheStore.swift \
       packages/MeeshySDK/Tests/MeeshySDKTests/Cache/GRDBCacheStoreTests.swift
git commit -m "feat(sdk): add GRDBCacheStore — L1/L2 cache with persist-on-dirty and LRU eviction"
```

---

## Task 5: DiskCacheStore — Media Cache Implementation

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore.swift`
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/DiskCacheStoreTests.swift`

**Step 1: Write failing tests**

```swift
import XCTest
import GRDB
@testable import MeeshySDK

final class DiskCacheStoreTests: XCTestCase {

    private let tempDir = FileManager.default.temporaryDirectory.appendingPathComponent("DiskCacheStoreTests-\(UUID().uuidString)")

    override func tearDown() {
        try? FileManager.default.removeItem(at: tempDir)
        super.tearDown()
    }

    private func makeStore(policy: CachePolicy? = nil) throws -> DiskCacheStore {
        let p = policy ?? CachePolicy(ttl: 86400, staleTTL: nil, maxItemCount: nil, storageLocation: .disk(subdir: "TestImages", maxBytes: 10_000_000))
        let dbQueue = try DatabaseQueue()
        try AppDatabase.runMigrations(on: dbQueue)
        return DiskCacheStore(policy: p, db: dbQueue, baseDirectory: tempDir)
    }

    func test_save_writesFileToDisk() async throws {
        let store = try makeStore()
        let data = Data("hello world".utf8)
        await store.save(data, for: "https://example.com/image.jpg")
        let result = await store.load(for: "https://example.com/image.jpg")
        XCTAssertEqual(result.value, data)
    }

    func test_load_nonExistentKey_returnsEmpty() async throws {
        let store = try makeStore()
        let result = await store.load(for: "https://nonexistent.com/x.jpg")
        switch result {
        case .empty: break
        default: XCTFail("Expected .empty")
        }
    }

    func test_invalidate_removesFile() async throws {
        let store = try makeStore()
        await store.save(Data("test".utf8), for: "https://example.com/a.jpg")
        await store.invalidate(for: "https://example.com/a.jpg")
        let result = await store.load(for: "https://example.com/a.jpg")
        switch result {
        case .empty: break
        default: XCTFail("Expected .empty after invalidate")
        }
    }

    func test_invalidateAll_removesAllFiles() async throws {
        let store = try makeStore()
        await store.save(Data("a".utf8), for: "https://example.com/1.jpg")
        await store.save(Data("b".utf8), for: "https://example.com/2.jpg")
        await store.invalidateAll()
        let r1 = await store.load(for: "https://example.com/1.jpg")
        let r2 = await store.load(for: "https://example.com/2.jpg")
        XCTAssertNil(r1.value)
        XCTAssertNil(r2.value)
    }

    func test_localFileURL_returnsDiskPath() async throws {
        let store = try makeStore()
        await store.save(Data("audio".utf8), for: "https://example.com/voice.m4a")
        let url = await store.localFileURL(for: "https://example.com/voice.m4a")
        XCTAssertNotNil(url)
        XCTAssertTrue(FileManager.default.fileExists(atPath: url!.path))
    }

    func test_evictExpired_removesOldFiles() async throws {
        let policy = CachePolicy(ttl: 1, staleTTL: nil, maxItemCount: nil, storageLocation: .disk(subdir: "Test", maxBytes: 10_000_000))
        let store = try makeStore(policy: policy)
        await store.save(Data("old".utf8), for: "https://example.com/old.jpg")
        // Wait for TTL to expire
        try await Task.sleep(for: .seconds(1.5))
        await store.evictExpired()
        let result = await store.load(for: "https://example.com/old.jpg")
        XCTAssertNil(result.value)
    }

    func test_isCached_returnsTrueForExistingKey() async throws {
        let store = try makeStore()
        await store.save(Data("x".utf8), for: "https://example.com/x.jpg")
        let cached = await store.isCached("https://example.com/x.jpg")
        XCTAssertTrue(cached)
    }
}
```

**Step 2: Run tests — expected FAIL**

**Step 3: Write implementation**

`DiskCacheStore.swift` — actor implementing `ReadableCacheStore<String, Data>` with:
- L1: `NSCache<NSString, NSData>` (auto-purged by iOS)
- L2: FileManager in configured `baseDirectory/{subdir}/`
- File key: SHA256 truncated 16 hex chars + original extension
- Metadata in `cache_metadata` (key = `"media:{hash}"`)
- `save(_ data: Data, for key: String)` — write file + L1 + metadata
- `load(for:)` from `ReadableCacheStore` — returns `CacheResult<[Data]>` (array with single element or empty)
- `localFileURL(for:)` — returns file path for AVPlayer
- `isCached(_:)` — checks L1 then L2 (no network)
- `evictExpired()` — removes files past TTL
- `prefetch(_:)` — background save from URLs (deduplication via `inFlightTasks`)
- Budget eviction on save if `totalSize > maxBytes`

**Important:** `DiskCacheStore` does NOT conform to `MutableCacheStore` — no `update(mutate:)`. Media is immutable.

**Step 4: Run tests — expected PASS** (7 tests)

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore.swift \
       packages/MeeshySDK/Tests/MeeshySDKTests/Cache/DiskCacheStoreTests.swift
git commit -m "feat(sdk): add DiskCacheStore — media file cache with NSCache L1 and FileManager L2"
```

---

## Task 6: CacheCoordinator — Socket Integration

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift`
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/CacheCoordinatorTests.swift`

**Step 1: Write failing tests**

Tests must use mock socket publishers to verify cache mutations:

```swift
import XCTest
import Combine
import GRDB
@testable import MeeshySDK

final class CacheCoordinatorTests: XCTestCase {

    // Use mock socket that exposes PassthroughSubjects for testing
    // MessageSocketProviding and SocialSocketProviding already exist as protocols

    func test_handleNewMessage_appendsToMessageCache() async throws {
        // Setup: create coordinator with in-memory DB and mock sockets
        // Send a message through mock socket publisher
        // Verify message appears in message store
    }

    func test_handleMessageDeleted_removesFromCache() async throws {
        // Setup: save messages, send delete event
        // Verify message removed
    }

    func test_handleRoleUpdated_mutatesParticipantRole() async throws {
        // Setup: save participants, send role update event
        // Verify participant role changed
    }

    func test_handleParticipantJoined_invalidatesParticipantCache() async throws {
        // Setup: save participants, send joined event
        // Verify participant cache invalidated for that conversation
    }

    func test_handleReconnection_invalidatesConversations() async throws {
        // Send reconnect event
        // Verify conversation cache invalidated
    }

    func test_stores_areAccessible() async throws {
        // Verify CacheCoordinator exposes stores as public properties
        // coordinator.conversations, coordinator.messages, etc.
    }
}
```

**Implementation notes:**
- Constructor accepts `MessageSocketProviding`, `SocialSocketProviding`, `DatabaseWriter`
- `.shared` singleton uses real instances as defaults
- Subscribe helper: `private func subscribe<T>(_ publisher: PassthroughSubject<T, Never>, handler:)`
- Each socket event → dedicated `private func handle{Event}` method
- Lifecycle observers: `willResignActive` → `beginBackgroundTask` + flush all stores
- `didReceiveMemoryWarning` → evict expired media

**Step 2-4: Red-Green cycle**

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift \
       packages/MeeshySDK/Tests/MeeshySDKTests/Cache/CacheCoordinatorTests.swift
git commit -m "feat(sdk): add CacheCoordinator — socket-driven cache invalidation bridge"
```

---

## Task 7: CacheIdentifiable Conformance on Existing Models

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/ParticipantModels.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift` (MeeshyUser if exists)

**Step 1: Add CacheIdentifiable conformance**

For each model that will be cached via `GRDBCacheStore`:

```swift
// ConversationModels.swift — MeeshyConversation already has `id: String`
extension MeeshyConversation: CacheIdentifiable {}

// MessageModels.swift — MeeshyMessage already has `id: String`
extension MeeshyMessage: CacheIdentifiable {}

// ParticipantModels.swift — PaginatedParticipant already has `id: String`
extension PaginatedParticipant: CacheIdentifiable {}

// CoreModels.swift — MeeshyUser (if Codable, has `id: String`)
extension MeeshyUser: CacheIdentifiable {}
```

**Step 2: Build to verify compilation**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeded

**Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/
git commit -m "feat(sdk): add CacheIdentifiable conformance to MeeshyConversation, MeeshyMessage, PaginatedParticipant"
```

---

## Task 8: Wire CacheCoordinator into iOS App — ConversationListViewModel

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift`

**Step 1: Replace ConversationCacheManager + MessageCacheManager calls**

Find all `ConversationCacheManager.shared` and `MessageCacheManager.shared` calls and replace with `CacheCoordinator.shared.conversations` / `CacheCoordinator.shared.messages`.

Pattern:
```swift
// Before:
let cached = await ConversationCacheManager.shared.loadConversations()
// After:
let result = await CacheCoordinator.shared.conversations.load(for: "list")
switch result {
case .fresh(let items, _), .stale(let items, _):
    self.conversations = items
    if case .stale = result { Task { await refreshFromAPI() } }
case .expired, .empty:
    await loadFromAPI()
}
```

**Step 2: Build**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeded

**Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift
git commit -m "feat(ios): wire CacheCoordinator into ConversationListViewModel"
```

---

## Task 9: Wire CacheCoordinator into iOS App — ConversationViewModel

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift`

**Step 1: Replace MessageCacheManager + ParticipantCacheManager calls**

Same pattern as Task 8 — replace cache manager calls with CacheCoordinator store access.

**Step 2: Build**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeded

**Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift \
       apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift
git commit -m "feat(ios): wire CacheCoordinator into ConversationViewModel and ConversationInfoSheet"
```

---

## Task 10: Delete Old Cache Managers + LocalStore

**Files:**
- Delete: `packages/MeeshySDK/Sources/MeeshySDK/Cache/ConversationCacheManager.swift`
- Delete: `packages/MeeshySDK/Sources/MeeshySDK/Cache/MessageCacheManager.swift`
- Delete: `packages/MeeshySDK/Sources/MeeshySDK/Cache/ParticipantCacheManager.swift`
- Delete: `packages/MeeshySDK/Sources/MeeshySDK/Cache/UserProfileCacheManager.swift`
- Delete: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/LocalStore.swift`
- Delete: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/SQLLocalStore.swift`
- Delete: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/DBCachedParticipant.swift`
- Delete: `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/ConversationCacheManagerTests.swift`
- Delete: `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/MessageCacheManagerTests.swift`
- Delete: `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/ParticipantCacheManagerTests.swift`
- Delete: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/DBCachedParticipantTests.swift`

**Step 1: Delete files**

**Step 2: Search for remaining references**

```bash
grep -r "ConversationCacheManager\|MessageCacheManager\|ParticipantCacheManager\|UserProfileCacheManager\|LocalStore\.shared\|SQLLocalStore" packages/MeeshySDK/Sources/ apps/ios/Meeshy/ --include="*.swift"
```

Fix any remaining references (replace with CacheCoordinator equivalents).

**Step 3: Build + test**

```bash
./apps/ios/meeshy.sh build
cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -quiet
```

Expected: Build succeeded, all tests pass

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor(sdk): remove old cache managers in favor of unified CacheCoordinator"
```

---

## Task 11: Migrate MediaCacheManager → DiskCacheStore

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/AudioPlayerManager.swift` (use CacheCoordinator.shared.audio)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/VideoFrameExtractor.swift` (use CacheCoordinator.shared.video)
- Modify: any iOS views that call `MediaCacheManager.shared.data(for:)` or `MediaCacheManager.shared.image(for:)`
- Delete: `packages/MeeshySDK/Sources/MeeshySDK/Cache/MediaCacheManager.swift`

**Step 1: Search all MediaCacheManager usages**

```bash
grep -rn "MediaCacheManager" packages/MeeshySDK/Sources/ apps/ios/Meeshy/ --include="*.swift"
```

**Step 2: Replace each call pattern:**

```swift
// Before:
let data = try await MediaCacheManager.shared.data(for: urlString)
// After:
let result = await CacheCoordinator.shared.images.load(for: urlString)
// Or for download+cache:
await CacheCoordinator.shared.images.save(downloadedData, for: urlString)
```

**Step 3: Verify AudioPlayerManager and VideoFrameExtractor work with new stores**

**Step 4: Build + verify**

```bash
./apps/ios/meeshy.sh build
```

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor(sdk): migrate MediaCacheManager to DiskCacheStore via CacheCoordinator"
```

---

## Task 12: Final Build + Full Test Suite + Push

**Step 1: Run full SDK tests**

```bash
cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -quiet
```

Expected: All tests pass (except pre-existing `testAPIConversationMemberDecoding`)

**Step 2: Build iOS app**

```bash
./apps/ios/meeshy.sh build
```

Expected: Build succeeded

**Step 3: Verify no remaining references to old managers**

```bash
grep -r "ConversationCacheManager\|MessageCacheManager\|ParticipantCacheManager\|UserProfileCacheManager\|MediaCacheManager\|LocalStore\|SQLLocalStore" packages/MeeshySDK/Sources/ apps/ios/Meeshy/ --include="*.swift"
```

Expected: No results (or only in comments/docs)

**Step 4: Push**

```bash
git push origin dev
```

**Step 5: Summary of all new/changed files**

New:
- `CachePolicy.swift`, `CacheIdentifiable.swift`, `CacheResult.swift`
- `CacheStoreProtocols.swift`
- `CacheEntry.swift` (GRDB record)
- `GRDBCacheStore.swift`
- `DiskCacheStore.swift`
- `CacheCoordinator.swift`
- Test files for each

Deleted:
- `ConversationCacheManager.swift`, `MessageCacheManager.swift`, `ParticipantCacheManager.swift`
- `UserProfileCacheManager.swift`, `MediaCacheManager.swift`
- `LocalStore.swift`, `SQLLocalStore.swift`, `DBCachedParticipant.swift`
- Old test files

Modified:
- `AppDatabase.swift` (v3 migration)
- Model files (CacheIdentifiable conformance)
- `ConversationListViewModel.swift`, `ConversationViewModel.swift`, `ConversationInfoSheet.swift`
- `AudioPlayerManager.swift`, `VideoFrameExtractor.swift`
