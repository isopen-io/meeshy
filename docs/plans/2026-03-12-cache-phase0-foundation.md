# Unified Cache — Phase 0: Foundation Types

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create the shared foundation types (CachePolicy, CacheIdentifiable, CacheResult, protocols) that all parallel tracks depend on.

**Architecture:** Pure value types and protocols with zero dependencies beyond Foundation. Committed directly on the feature branch before forking worktrees.

**Tech Stack:** Swift 5.9+, XCTest

**IMPORTANT:** This phase MUST complete before Track 1 and Track 2 fork. Both parallel tracks start from the commit at the end of this phase.

---

### Task 1: CacheIdentifiable + CacheResult

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheIdentifiable.swift`
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheResult.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/CacheResultTests.swift`

**Step 1: Write failing tests**

```swift
import XCTest
@testable import MeeshySDK

final class CacheResultTests: XCTestCase {

    func test_fresh_returnsValue() {
        let result = CacheResult<[String]>.fresh(["a", "b"], age: 10)
        XCTAssertEqual(result.value, ["a", "b"])
    }

    func test_stale_returnsValue() {
        let result = CacheResult<[String]>.stale(["a"], age: 500)
        XCTAssertEqual(result.value, ["a"])
    }

    func test_expired_returnsNil() {
        let result = CacheResult<[String]>.expired
        XCTAssertNil(result.value)
    }

    func test_empty_returnsNil() {
        let result = CacheResult<[String]>.empty
        XCTAssertNil(result.value)
    }

    func test_isFresh_truForFresh() {
        let result = CacheResult<[String]>.fresh(["a"], age: 0)
        if case .fresh = result { } else { XCTFail("Expected .fresh") }
    }

    func test_isStale_trueForStale() {
        let result = CacheResult<[String]>.stale(["a"], age: 400)
        if case .stale = result { } else { XCTFail("Expected .stale") }
    }
}
```

**Step 2: Run tests — expected FAIL**

Run: `cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshySDKTests/CacheResultTests -quiet 2>&1 | tail -5`

**Step 3: Write implementation**

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

**Step 4: Run tests — expected PASS** (6 tests)

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheIdentifiable.swift \
       packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheResult.swift \
       packages/MeeshySDK/Tests/MeeshySDKTests/Cache/CacheResultTests.swift
git commit -m "feat(sdk): add CacheIdentifiable protocol and CacheResult enum"
```

---

### Task 2: CachePolicy

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CachePolicy.swift`
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
        XCTAssertEqual(policy.staleTTL, 300)
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
    }

    func test_predefined_messages() {
        let p = CachePolicy.messages
        XCTAssertEqual(p.ttl, TimeInterval.months(6))
        XCTAssertNil(p.staleTTL)
        XCTAssertEqual(p.maxItemCount, 50)
    }

    func test_predefined_mediaImages() {
        let p = CachePolicy.mediaImages
        XCTAssertEqual(p.ttl, TimeInterval.years(1))
        if case .disk(let subdir, let max) = p.storageLocation {
            XCTAssertEqual(subdir, "Images")
            XCTAssertEqual(max, 300_000_000)
        } else { XCTFail("Expected .disk") }
    }

    func test_timeInterval_minutes() { XCTAssertEqual(TimeInterval.minutes(5), 300) }
    func test_timeInterval_hours() { XCTAssertEqual(TimeInterval.hours(24), 86400) }
    func test_timeInterval_days() { XCTAssertEqual(TimeInterval.days(7), 604800) }
    func test_timeInterval_months() { XCTAssertEqual(TimeInterval.months(6), 15_552_000) }
    func test_timeInterval_years() { XCTAssertEqual(TimeInterval.years(1), 31_536_000) }

    func test_freshness_freshWhenUnderStaleTTL() {
        let policy = CachePolicy(ttl: 3600, staleTTL: 300, maxItemCount: nil, storageLocation: .grdb)
        let result = policy.freshness(age: 100)
        XCTAssertEqual(result, .fresh)
    }

    func test_freshness_staleWhenBetweenStaleTTLAndTTL() {
        let policy = CachePolicy(ttl: 3600, staleTTL: 300, maxItemCount: nil, storageLocation: .grdb)
        let result = policy.freshness(age: 500)
        XCTAssertEqual(result, .stale)
    }

    func test_freshness_expiredWhenOverTTL() {
        let policy = CachePolicy(ttl: 3600, staleTTL: 300, maxItemCount: nil, storageLocation: .grdb)
        let result = policy.freshness(age: 4000)
        XCTAssertEqual(result, .expired)
    }

    func test_freshness_noStaleTTL_freshUnderTTL() {
        let policy = CachePolicy(ttl: 3600, staleTTL: nil, maxItemCount: nil, storageLocation: .grdb)
        let result = policy.freshness(age: 100)
        XCTAssertEqual(result, .fresh)
    }

    func test_freshness_noStaleTTL_expiredOverTTL() {
        let policy = CachePolicy(ttl: 3600, staleTTL: nil, maxItemCount: nil, storageLocation: .grdb)
        let result = policy.freshness(age: 4000)
        XCTAssertEqual(result, .expired)
    }
}
```

**Step 2: Run tests — expected FAIL**

**Step 3: Write implementation**

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

    public enum StorageLocation: Sendable, Equatable {
        case grdb
        case disk(subdir: String, maxBytes: Int)
    }

    public enum Freshness: Sendable, Equatable {
        case fresh
        case stale
        case expired
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

    public func freshness(age: TimeInterval) -> Freshness {
        if let stale = staleTTL {
            if age < stale { return .fresh }
            if age < ttl { return .stale }
            return .expired
        } else {
            return age < ttl ? .fresh : .expired
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
    public static func minutes(_ n: Double) -> TimeInterval { n * 60 }
    public static func hours(_ n: Double) -> TimeInterval { n * 3600 }
    public static func days(_ n: Double) -> TimeInterval { n * 86400 }
    public static func months(_ n: Double) -> TimeInterval { n * 30 * 86400 }
    public static func years(_ n: Double) -> TimeInterval { n * 365 * 86400 }
}
```

**Step 4: Run tests — expected PASS** (18 tests)

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/CachePolicy.swift \
       packages/MeeshySDK/Tests/MeeshySDKTests/Cache/CachePolicyTests.swift
git commit -m "feat(sdk): add CachePolicy with TTL, stale-while-revalidate, and freshness calculation"
```

---

### Task 3: ReadableCacheStore + MutableCacheStore Protocols

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheStoreProtocols.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/CacheStoreProtocolTests.swift`

**Step 1: Write failing tests**

```swift
import XCTest
@testable import MeeshySDK

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

final class CacheStoreProtocolTests: XCTestCase {

    func test_saveAndLoad() async {
        let store = MockMutableStore()
        await store.save([TestItem(id: "1", name: "Alice")], for: "k")
        let result = await store.load(for: "k")
        XCTAssertEqual(result.value, [TestItem(id: "1", name: "Alice")])
    }

    func test_update_mutatesInPlace() async {
        let store = MockMutableStore()
        await store.save([TestItem(id: "1", name: "Alice")], for: "k")
        await store.update(for: "k") { $0.map { var i = $0; i.name = "Bob"; return i } }
        XCTAssertEqual((await store.load(for: "k")).value?.first?.name, "Bob")
    }

    func test_invalidate_removesKey() async {
        let store = MockMutableStore()
        await store.save([TestItem(id: "1", name: "A")], for: "k")
        await store.invalidate(for: "k")
        XCTAssertNil((await store.load(for: "k")).value)
    }

    func test_invalidateAll() async {
        let store = MockMutableStore()
        await store.save([TestItem(id: "1", name: "A")], for: "k1")
        await store.save([TestItem(id: "2", name: "B")], for: "k2")
        await store.invalidateAll()
        XCTAssertNil((await store.load(for: "k1")).value)
        XCTAssertNil((await store.load(for: "k2")).value)
    }
}
```

**Step 2: Run tests — expected FAIL**

**Step 3: Write implementation**

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

**Step 4: Run tests — expected PASS** (4 tests)

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheStoreProtocols.swift \
       packages/MeeshySDK/Tests/MeeshySDKTests/Cache/CacheStoreProtocolTests.swift
git commit -m "feat(sdk): add ReadableCacheStore and MutableCacheStore protocols"
```

---

## Phase 0 Complete — Fork Worktrees

After all 3 tasks committed, create the parallel worktrees:

```bash
git worktree add ../v2_meeshy-feat/cache-grdb-store -b feat/cache-grdb-store dev
git worktree add ../v2_meeshy-feat/cache-disk-store -b feat/cache-disk-store dev
```

Both tracks start from the same commit containing Phase 0 types.
