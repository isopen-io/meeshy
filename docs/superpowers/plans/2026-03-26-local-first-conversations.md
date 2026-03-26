# Local-First Conversations Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make conversation list and messages display instantly from local cache, with background network sync.

**Architecture:** New `ConversationSyncEngine` actor in MeeshySDK owns all network sync. ViewModels become read-only cache observers. Gateway gets `updatedSince` param for delta sync.

**Tech Stack:** Swift (actor, Combine), GRDB (SQLite), Fastify (Prisma), Socket.IO

**Spec:** `docs/superpowers/specs/2026-03-26-local-first-conversations-design.md`

---

## File Structure

### New Files
| File | Purpose |
|------|---------|
| `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift` | Protocol + actor: fullSync, deltaSync, socket relay, retention |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Sync/ConversationSyncEngineTests.swift` | Unit tests for SyncEngine |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/GRDBCacheStoreUpsertTests.swift` | Upsert method tests |
| `apps/ios/MeeshyTests/ViewModels/ConversationListViewModelSyncTests.swift` | ConversationListVM sync tests |
| `apps/ios/MeeshyTests/ViewModels/ConversationViewModelSyncTests.swift` | ConversationVM sync tests |
| `services/gateway/src/routes/conversations/__tests__/delta-sync.test.ts` | Gateway updatedSince endpoint tests |

### Modified Files
| File | Change |
|------|--------|
| `packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheStore.swift:89` | Add `upsert(item:for:merge:)` and `upsertPatch(for:itemId:mutate:)` methods after `update()` |
| `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift:68-74` | Remove `subscribeToMessageSocket()` from `start()`, keep `resolveCurrentUserId()` + `subscribeToLifecycle()` |
| `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift:90-217` | Delete entire `subscribeToMessageSocket()` method and all handler methods (lines 90-361+) |
| `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift:417-469` | Replace `loadConversations()` with cache-first + fire-and-forget sync |
| `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift:212-362` | Remove direct socket subscriptions (moved to SyncEngine) |
| `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:492-541` | Replace `loadMessages()` with cache-first pattern |
| `services/gateway/src/routes/conversations/core.ts:98-155` | Add `updatedSince` query param + Prisma filter |
| `services/gateway/src/routes/conversations/core.ts:201` | Add `updatedAt: true` to select clause |
| `apps/ios/Meeshy/Features/Main/Views/RootView.swift:282-290` | Add SyncEngine startup in `.task` block |

---

## Task 1: Gateway — Add `updatedSince` Query Param

**Files:**
- Modify: `services/gateway/src/routes/conversations/core.ts:98-230`
- Create: `services/gateway/src/routes/conversations/__tests__/delta-sync.test.ts`

- [ ] **Step 1: Write failing test for `updatedSince` filter**

```typescript
// services/gateway/src/routes/conversations/__tests__/delta-sync.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildTestApp } from '../../../../__tests__/helpers/app-builder'

describe('GET /conversations?updatedSince', () => {
  let app: any
  let authToken: string

  beforeAll(async () => {
    app = await buildTestApp()
    // Login to get auth token
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'atabeth', password: 'pD5p1ir9uxLUf2X2FpNE' }
    })
    authToken = loginRes.json().data.token
  })

  afterAll(async () => { await app?.close() })

  it('returns only conversations updated after the given timestamp', async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString() // 24h ago
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/conversations?updatedSince=${pastDate}`,
      headers: { Authorization: `Bearer ${authToken}` }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    // All returned conversations should have updatedAt > pastDate
    for (const conv of body.data) {
      expect(new Date(conv.updatedAt).getTime()).toBeGreaterThan(new Date(pastDate).getTime())
    }
  })

  it('returns updatedAt field in response', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations?limit=1',
      headers: { Authorization: `Bearer ${authToken}` }
    })
    expect(res.statusCode).toBe(200)
    const conv = res.json().data[0]
    expect(conv.updatedAt).toBeDefined()
  })

  it('without updatedSince returns all conversations (existing behavior)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations?limit=5',
      headers: { Authorization: `Bearer ${authToken}` }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/smpceo/Documents/v2_meeshy && pnpm vitest run services/gateway/src/routes/conversations/__tests__/delta-sync.test.ts`
Expected: FAIL — `updatedSince` not yet handled, `updatedAt` not in response

- [ ] **Step 3: Add `updatedSince` to query schema and Prisma filter**

In `services/gateway/src/routes/conversations/core.ts`, modify the route at line 98:

Add to querystring schema properties (after `withUserId` at line 111):
```typescript
updatedSince: { type: 'string', description: 'ISO8601 timestamp — return only conversations updated after this time' }
```

Add to the type annotation:
```typescript
Querystring: { limit?: string; offset?: string; before?: string; includeCount?: string; type?: string; withUserId?: string; updatedSince?: string }
```

After line 141 (`const beforeCursor = ...`), add:
```typescript
const updatedSince = request.query.updatedSince;
```

After the `whereClause` construction (after line 158), add:
```typescript
// Delta sync: only conversations updated since the given timestamp
if (updatedSince) {
  const sinceDate = new Date(updatedSince);
  if (!isNaN(sinceDate.getTime())) {
    whereClause.updatedAt = { gt: sinceDate };
  }
}
```

Add `updatedAt: true` to the select clause at line 201 (after `createdAt: true` at line 207):
```typescript
updatedAt: true,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/smpceo/Documents/v2_meeshy && pnpm vitest run services/gateway/src/routes/conversations/__tests__/delta-sync.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/routes/conversations/core.ts services/gateway/src/routes/conversations/__tests__/delta-sync.test.ts
git commit -m "feat(gateway): add updatedSince query param for delta sync"
```

---

## Task 2: GRDBCacheStore — Add `upsert` Methods

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheStore.swift:89-95`

- [ ] **Step 1: Write failing test for `upsert`**

Add to existing GRDBCacheStore tests or create new file:

```swift
// packages/MeeshySDK/Tests/MeeshySDKTests/Cache/GRDBCacheStoreUpsertTests.swift
import XCTest
@testable import MeeshySDK

final class GRDBCacheStoreUpsertTests: XCTestCase {

    // Use in-memory DB for SDK tests (AppDatabase.shared is app-level, not available here)
    private func makeStore() throws -> GRDBCacheStore<String, TestItem> {
        let db = try DatabaseQueue()
        try CacheCoordinator.applyMigrations(to: db)
        return GRDBCacheStore(policy: .conversations, db: db, namespace: "test_upsert")
    }

    func test_upsert_appendsItem_whenKeyExistsInL1() async {
        let store = makeStore()
        let existing = TestItem(id: "1", value: "first")
        await store.save([existing], for: "key1")

        let newItem = TestItem(id: "2", value: "second")
        await store.upsert(item: newItem, for: "key1") { existing, new in
            existing.contains(where: { $0.id == new.id }) ? existing : existing + [new]
        }

        let result = await store.load(for: "key1")
        XCTAssertEqual(result.value?.count, 2)
    }

    func test_upsert_appendsItem_whenKeyOnlyInL2() async {
        let store = makeStore()
        let existing = TestItem(id: "1", value: "first")
        await store.save([existing], for: "key1")

        // Force L1 eviction by loading 21 other keys (LRU cap = 20)
        for i in 0..<21 {
            await store.save([TestItem(id: "\(i)", value: "filler")], for: "filler_\(i)")
        }

        // key1 should be evicted from L1 but still in L2
        let newItem = TestItem(id: "2", value: "second")
        await store.upsert(item: newItem, for: "key1") { existing, new in
            existing.contains(where: { $0.id == new.id }) ? existing : existing + [new]
        }

        let result = await store.load(for: "key1")
        XCTAssertEqual(result.value?.count, 2)
    }

    func test_upsert_deduplicates_whenItemAlreadyExists() async {
        let store = makeStore()
        let existing = TestItem(id: "1", value: "first")
        await store.save([existing], for: "key1")

        // Upsert same item — merge should deduplicate
        await store.upsert(item: existing, for: "key1") { existing, new in
            existing.contains(where: { $0.id == new.id }) ? existing : existing + [new]
        }

        let result = await store.load(for: "key1")
        XCTAssertEqual(result.value?.count, 1)
    }
}

// Test helper
struct TestItem: Codable, Sendable, CacheIdentifiable, Equatable {
    let id: String
    let value: String
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshySDKTests/GRDBCacheStoreUpsertTests -quiet`
Expected: FAIL — `upsert` method does not exist

- [ ] **Step 3: Implement `upsert` method**

In `packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheStore.swift`, after the `update()` method at line 95, add:

```swift
    /// Upsert an item into a cache entry. Unlike update(), this reads from L2 on L1 miss.
    public func upsert(item: Value, for key: Key, merge: @Sendable ([Value], Value) -> [Value]) async {
        if var l1 = memoryCache[key] {
            l1.items = merge(l1.items, item)
            memoryCache[key] = l1
            touchKey(key)
            markDirty(key)
            return
        }
        // L1 miss — read from L2, merge, write back
        let keyStr = namespacedKey(key.description)
        let existing = readFromL2(for: keyStr)?.items ?? []
        let merged = merge(existing, item)
        let entry = L1Entry(items: merged, loadedAt: Date())
        memoryCache[key] = entry
        touchKey(key)
        markDirty(key)
    }

    /// Upsert-patch: update a single item in a list by ID. Reads from L2 on L1 miss.
    public func upsertPatch(for key: Key, itemId: String, mutate: @Sendable (inout Value) -> Void) async {
        if var l1 = memoryCache[key] {
            if let idx = l1.items.firstIndex(where: { $0.id == itemId }) {
                mutate(&l1.items[idx])
                memoryCache[key] = l1
                touchKey(key)
                markDirty(key)
            }
            return
        }
        // L1 miss — read from L2
        let keyStr = namespacedKey(key.description)
        guard var items = readFromL2(for: keyStr)?.items else { return }
        if let idx = items.firstIndex(where: { $0.id == itemId }) {
            mutate(&items[idx])
            let entry = L1Entry(items: items, loadedAt: Date())
            memoryCache[key] = entry
            touchKey(key)
            markDirty(key)
        }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshySDKTests/GRDBCacheStoreUpsertTests -quiet`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheStore.swift packages/MeeshySDK/Tests/MeeshySDKTests/Cache/GRDBCacheStoreUpsertTests.swift
git commit -m "feat(cache): add upsert and upsertPatch to GRDBCacheStore for L2 fallback"
```

---

## Task 3: CacheCoordinator — Remove Socket Subscriptions

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift:68-361+`

- [ ] **Step 1: Verify existing tests still pass before changes**

Run: `cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet`
Expected: PASS (baseline)

- [ ] **Step 2: Remove `subscribeToMessageSocket()` call from `start()`**

In `CacheCoordinator.swift`, modify `start()` at line 68-74:

```swift
    public func start() {
        guard !isStarted else { return }
        isStarted = true
        resolveCurrentUserId()
        // Socket subscriptions moved to ConversationSyncEngine
        subscribeToLifecycle()
    }
```

- [ ] **Step 3: Delete `subscribeToMessageSocket()` and all handler methods**

Delete the entire block from line 90 (`private func subscribeToMessageSocket()`) through the end of all handler methods (lines 90-361 approximately). These are:
- `subscribeToMessageSocket()` (lines 90-217)
- `handleMessageReceived()` (line 221+)
- `handleMessageEdited()`, `handleMessageDeleted()`
- `handleReactionAdded()`, `handleReactionRemoved()`, `handleReactionSynced()`
- `handleParticipantRoleUpdated()`
- `handleUnreadUpdated()`, `handleReadStatusUpdated()`
- `handleTranslationReceived()`, `handleTranscriptionReady()`
- `handleAudioTranslation()`
- `handleReconnect()`

Keep: `subscribeToLifecycle()`, `resolveCurrentUserId()`, `setCurrentUserId()`, all cache store properties, and CRUD methods.

- [ ] **Step 4: Run tests to verify nothing broke**

Run: `cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet`
Expected: PASS (no tests should depend on internal socket subscription wiring)

- [ ] **Step 5: Build iOS app to verify compilation**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED (the app doesn't call these methods directly)

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift
git commit -m "refactor(cache): remove socket subscriptions from CacheCoordinator (moved to SyncEngine)"
```

---

## Task 4: ConversationSyncEngine — Protocol + Actor Skeleton

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift`
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Sync/ConversationSyncEngineTests.swift`

- [ ] **Step 1: Write test for SyncEngine protocol conformance and initialization**

```swift
// packages/MeeshySDK/Tests/MeeshySDKTests/Sync/ConversationSyncEngineTests.swift
import XCTest
import Combine
@testable import MeeshySDK

@MainActor
final class ConversationSyncEngineTests: XCTestCase {

    func test_shared_returnsSameInstance() async {
        let a = ConversationSyncEngine.shared
        let b = ConversationSyncEngine.shared
        XCTAssertTrue(a === b)
    }

    func test_conformsToProtocol() async {
        let engine: any ConversationSyncEngineProviding = ConversationSyncEngine.shared
        XCTAssertNotNil(engine)
    }

    func test_publishers_emitValues() async {
        let engine = ConversationSyncEngine.shared
        let expectation = XCTestExpectation(description: "conversationsDidChange fires")
        var cancellable: AnyCancellable?
        cancellable = engine.conversationsDidChange.sink { expectation.fulfill(); cancellable?.cancel() }
        engine.conversationsDidChange.send()
        await fulfillment(of: [expectation], timeout: 1.0)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshySDKTests/ConversationSyncEngineTests -quiet`
Expected: FAIL — file doesn't exist

- [ ] **Step 3: Create protocol + actor skeleton**

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift
import Foundation
import Combine

// MARK: - Protocol

/// Protocol uses AnyPublisher (read-only) to avoid Sendable issues with PassthroughSubject.
/// Callers observe changes; only the concrete implementation can send.
public protocol ConversationSyncEngineProviding: AnyObject {
    var conversationsDidChange: AnyPublisher<Void, Never> { get }
    var messagesDidChange: AnyPublisher<String, Never> { get }

    func fullSync() async
    func syncSinceLastCheckpoint() async
    func ensureMessages(for conversationId: String) async
    func fetchOlderMessages(for conversationId: String, before messageId: String) async
    func cleanupRetentionIfNeeded() async
    func startSocketRelay() async
    func stopSocketRelay() async
}

// MARK: - Implementation

public final class ConversationSyncEngine: ConversationSyncEngineProviding, @unchecked Sendable {
    public static let shared = ConversationSyncEngine()

    // Internal subjects (send-capable)
    private let _conversationsDidChange = PassthroughSubject<Void, Never>()
    private let _messagesDidChange = PassthroughSubject<String, Never>()

    // Protocol-exposed publishers (read-only)
    public var conversationsDidChange: AnyPublisher<Void, Never> { _conversationsDidChange.eraseToAnyPublisher() }
    public var messagesDidChange: AnyPublisher<String, Never> { _messagesDidChange.eraseToAnyPublisher() }

    // State (protected by actor-like serial queue)
    private let stateQueue = DispatchQueue(label: "me.meeshy.sync-engine.state")
    private var _isSyncing = false
    private var isSyncing: Bool {
        get { stateQueue.sync { _isSyncing } }
        set { stateQueue.sync { _isSyncing = newValue } }
    }
    private var socketSubscriptions = Set<AnyCancellable>()

    // Dependencies
    private let cache: CacheCoordinator
    private let conversationService: ConversationServiceProviding
    private let messageService: MessageServiceProviding
    private let messageSocket: MessageSocketProviding
    private let socialSocket: SocialSocketProviding
    private let api: APIClient

    // Persisted sync timestamp
    private let syncTimestampKey = "me.meeshy.lastSyncTimestamp"
    private var lastSyncTimestamp: Date {
        get { UserDefaults.standard.object(forKey: syncTimestampKey) as? Date ?? .distantPast }
        set { UserDefaults.standard.set(newValue, forKey: syncTimestampKey) }
    }

    private let cleanupDateKey = "me.meeshy.lastCleanupDate"
    private var lastCleanupDate: Date? {
        get { UserDefaults.standard.object(forKey: cleanupDateKey) as? Date }
        set { UserDefaults.standard.set(newValue, forKey: cleanupDateKey) }
    }

    init(
        cache: CacheCoordinator = .shared,
        conversationService: ConversationServiceProviding = ConversationService(),
        messageService: MessageServiceProviding = MessageService(),
        messageSocket: MessageSocketProviding = MessageSocketManager.shared,
        socialSocket: SocialSocketProviding = SocialSocketManager.shared,
        api: APIClient = .shared
    ) {
        self.cache = cache
        self.conversationService = conversationService
        self.messageService = messageService
        self.messageSocket = messageSocket
        self.socialSocket = socialSocket
        self.api = api
    }

    // MARK: - Public API (stubs for now, implemented in subsequent tasks)

    public func fullSync() async {
        // Task 5
    }

    public func syncSinceLastCheckpoint() async {
        // Task 6
    }

    public func ensureMessages(for conversationId: String) async {
        // Task 7
    }

    public func fetchOlderMessages(for conversationId: String, before messageId: String) async {
        // Task 7
    }

    public func cleanupRetentionIfNeeded() async {
        // Task 8
    }

    public func startSocketRelay() async {
        // Task 9
    }

    public func stopSocketRelay() async {
        socketSubscriptions.removeAll()
    }
}
```

**Note:** We use `@unchecked Sendable` class (not actor) because `PassthroughSubject` can't cross actor boundaries cleanly in Swift 6. Serial dispatch queue protects mutable state. This matches the pattern used in `MessageSocketManager`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshySDKTests/ConversationSyncEngineTests -quiet`
Expected: PASS

- [ ] **Step 5: Verify full build**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift packages/MeeshySDK/Tests/MeeshySDKTests/Sync/ConversationSyncEngineTests.swift
git commit -m "feat(sync): add ConversationSyncEngine protocol and skeleton"
```

---

## Task 5: SyncEngine — `fullSync()` Implementation

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshySDKTests/Sync/ConversationSyncEngineTests.swift`

- [ ] **Step 1: Write failing test for fullSync**

```swift
func test_fullSync_fetchesConversationsAndSavesToCache() async {
    // Use MockConversationService that returns known data
    let mockConvService = MockConversationService()
    mockConvService.listResult = .success(makeConversationListResponse(count: 5, hasMore: false))

    let engine = ConversationSyncEngine(
        conversationService: mockConvService
    )

    await engine.fullSync()

    XCTAssertEqual(mockConvService.listCallCount, 1)
    // Verify conversations were saved to cache
    let cached = await CacheCoordinator.shared.conversations.load(for: "list")
    XCTAssertEqual(cached.value?.count, 5)
}

func test_ensureMessages_staleCache_callsNetwork() async {
    // Pre-populate cache with OLD data (will be stale)
    let msgs = [makeMessage(id: "m1")]
    await CacheCoordinator.shared.messages.save(msgs, for: "conv1")
    // Fast-forward staleness by setting loadedAt to past
    // (Or use a CachePolicy with very short staleTTL for testing)

    let mockMsgService = MockMessageService()
    mockMsgService.listResult = .success(makeMessagesResponse(count: 5))
    let engine = ConversationSyncEngine(messageService: mockMsgService)
    await engine.ensureMessages(for: "conv1")

    XCTAssertGreaterThanOrEqual(mockMsgService.listCallCount, 1)
}

func test_fullSync_paginatesWhenHasMore() async {
    let mockConvService = MockConversationService()
    // First page: hasMore = true
    mockConvService.listResults = [
        .success(makeConversationListResponse(count: 100, hasMore: true)),
        .success(makeConversationListResponse(count: 50, hasMore: false))
    ]

    let engine = ConversationSyncEngine(conversationService: mockConvService)
    await engine.fullSync()

    XCTAssertEqual(mockConvService.listCallCount, 2)
}
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — `fullSync()` is a stub

- [ ] **Step 3: Implement `fullSync()`**

```swift
public func fullSync() async {
    guard !isSyncing else { return }
    isSyncing = true
    defer { isSyncing = false }

    var allConversations: [MeeshyConversation] = []
    var offset = 0
    let pageSize = 100
    var hasMore = true

    while hasMore {
        do {
            let response: OffsetPaginatedAPIResponse<[APIConversation]> = try await api.offsetPaginatedRequest(
                endpoint: "/conversations",
                offset: offset,
                limit: pageSize
            )
            let userId = await AuthManager.shared.currentUser?.id ?? ""
            let page = response.data.map { $0.toConversation(currentUserId: userId) }

            // Merge: deduplicate by id
            let existingIds = Set(allConversations.map(\.id))
            let newItems = page.filter { !existingIds.contains($0.id) }
            allConversations.append(contentsOf: newItems)

            // Save after first page for immediate display
            await cache.conversations.save(allConversations, for: "list")
            _conversationsDidChange.send()

            hasMore = response.pagination?.hasMore ?? false
            offset += pageSize
        } catch {
            break
        }
    }

    // Use server time from response Date header if available
    // Fallback: client time - 30s buffer for clock skew protection
    lastSyncTimestamp = Date().addingTimeInterval(-30)
}
```

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift packages/MeeshySDK/Tests/MeeshySDKTests/Sync/ConversationSyncEngineTests.swift
git commit -m "feat(sync): implement fullSync with pagination and deduplication"
```

---

## Task 6: SyncEngine — `syncSinceLastCheckpoint()` Implementation

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshySDKTests/Sync/ConversationSyncEngineTests.swift`

- [ ] **Step 1: Write failing tests**

```swift
func test_syncSinceLastCheckpoint_sendsUpdatedSinceParam() async {
    let mockConvService = MockConversationService()
    mockConvService.listResult = .success(makeConversationListResponse(count: 2, hasMore: false))

    let engine = ConversationSyncEngine(conversationService: mockConvService)
    // Set a known sync timestamp
    UserDefaults.standard.set(Date(timeIntervalSince1970: 1000), forKey: "me.meeshy.lastSyncTimestamp")

    await engine.syncSinceLastCheckpoint()

    XCTAssertEqual(mockConvService.lastUpdatedSince?.timeIntervalSince1970, 1000, accuracy: 1)
}

func test_syncSinceLastCheckpoint_mergesWithoutDuplicates() async {
    // Pre-populate cache with existing conversations
    let existing = [makeConversation(id: "conv1"), makeConversation(id: "conv2")]
    await CacheCoordinator.shared.conversations.save(existing, for: "list")

    let mockConvService = MockConversationService()
    // Delta returns conv2 (updated) + conv3 (new)
    mockConvService.listResult = .success(makeConversationListResponse(
        conversations: [makeAPIConversation(id: "conv2"), makeAPIConversation(id: "conv3")],
        hasMore: false
    ))

    let engine = ConversationSyncEngine(conversationService: mockConvService)
    await engine.syncSinceLastCheckpoint()

    let cached = await CacheCoordinator.shared.conversations.load(for: "list")
    XCTAssertEqual(cached.value?.count, 3) // conv1 + updated conv2 + new conv3
}

func test_syncSinceLastCheckpoint_removesDeletedConversations() async {
    let existing = [makeConversation(id: "conv1"), makeConversation(id: "conv2")]
    await CacheCoordinator.shared.conversations.save(existing, for: "list")

    let mockConvService = MockConversationService()
    // conv2 comes back with deletedAt set
    let deletedConv = makeAPIConversation(id: "conv2", deletedAt: Date())
    mockConvService.listResult = .success(makeConversationListResponse(conversations: [deletedConv], hasMore: false))

    let engine = ConversationSyncEngine(conversationService: mockConvService)
    await engine.syncSinceLastCheckpoint()

    let cached = await CacheCoordinator.shared.conversations.load(for: "list")
    XCTAssertEqual(cached.value?.count, 1) // only conv1 remains
}
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement `syncSinceLastCheckpoint()`**

```swift
public func syncSinceLastCheckpoint() async {
    guard !isSyncing else { return }
    isSyncing = true
    defer { isSyncing = false }

    do {
        let since = lastSyncTimestamp
        let response: OffsetPaginatedAPIResponse<[APIConversation]> = try await api.offsetPaginatedRequest(
            endpoint: "/conversations",
            queryParams: ["updatedSince": ISO8601DateFormatter().string(from: since)],
            offset: 0,
            limit: 500 // Delta is typically small
        )

        let userId = await AuthManager.shared.currentUser?.id ?? ""
        let deltaConversations = response.data.map { $0.toConversation(currentUserId: userId) }

        // Load existing cache
        let existing = await cache.conversations.load(for: "list").value ?? []
        var merged = existing

        for delta in deltaConversations {
            if let deletedAt = delta.deletedAt, deletedAt != nil {
                // Remove deleted conversation
                merged.removeAll { $0.id == delta.id }
                await cache.messages.invalidate(for: delta.id)
            } else if let idx = merged.firstIndex(where: { $0.id == delta.id }) {
                // Update existing
                merged[idx] = delta
            } else {
                // New conversation
                merged.append(delta)
            }
        }

        await cache.conversations.save(merged, for: "list")
        _conversationsDidChange.send()

        // Update timestamp (server time - 30s buffer)
        lastSyncTimestamp = Date().addingTimeInterval(-30)
    } catch {
        // Silent failure — cache still has data
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift packages/MeeshySDK/Tests/MeeshySDKTests/Sync/ConversationSyncEngineTests.swift
git commit -m "feat(sync): implement delta sync with updatedSince and merge logic"
```

---

## Task 7: SyncEngine — `ensureMessages()` and `fetchOlderMessages()`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshySDKTests/Sync/ConversationSyncEngineTests.swift`

- [ ] **Step 1: Write failing tests**

```swift
func test_ensureMessages_cacheHit_noNetworkCall() async {
    // Pre-populate cache
    let msgs = [makeMessage(id: "m1"), makeMessage(id: "m2")]
    await CacheCoordinator.shared.messages.save(msgs, for: "conv1")

    let mockMsgService = MockMessageService()
    let engine = ConversationSyncEngine(messageService: mockMsgService)
    await engine.ensureMessages(for: "conv1")

    XCTAssertEqual(mockMsgService.listCallCount, 0) // No network call
}

func test_ensureMessages_cacheMiss_fetchesFromAPI() async {
    let mockMsgService = MockMessageService()
    mockMsgService.listResult = .success(makeMessagesResponse(count: 30))

    let engine = ConversationSyncEngine(messageService: mockMsgService)
    await engine.ensureMessages(for: "conv_empty")

    XCTAssertEqual(mockMsgService.listCallCount, 1)
    let cached = await CacheCoordinator.shared.messages.load(for: "conv_empty")
    XCTAssertEqual(cached.value?.count, 30)
}

func test_fetchOlderMessages_appendsToCachedMessages() async {
    let existing = [makeMessage(id: "m5"), makeMessage(id: "m6")]
    await CacheCoordinator.shared.messages.save(existing, for: "conv1")

    let mockMsgService = MockMessageService()
    mockMsgService.listBeforeResult = .success(makeMessagesResponse(ids: ["m3", "m4"]))

    let engine = ConversationSyncEngine(messageService: mockMsgService)
    await engine.fetchOlderMessages(for: "conv1", before: "m5")

    let cached = await CacheCoordinator.shared.messages.load(for: "conv1")
    XCTAssertEqual(cached.value?.count, 4) // m3, m4, m5, m6
}
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement both methods**

```swift
public func ensureMessages(for conversationId: String) async {
    let cached = await cache.messages.load(for: conversationId)
    switch cached {
    case .fresh:
        return // Cache is good, nothing to do
    case .stale:
        // Background refresh
        break
    case .expired, .empty:
        break
    }

    do {
        let response = try await messageService.list(
            conversationId: conversationId, offset: 0, limit: 30, includeReplies: true
        )
        let userId = await AuthManager.shared.currentUser?.id ?? ""
        let messages = response.data.map { $0.toMessage(currentUserId: userId) }
        await cache.messages.save(messages, for: conversationId)
        _messagesDidChange.send(conversationId)
    } catch {
        // Silent — cache still has stale data if available
    }
}

public func fetchOlderMessages(for conversationId: String, before messageId: String) async {
    do {
        let response = try await messageService.listBefore(
            conversationId: conversationId, before: messageId, limit: 30, includeReplies: true
        )
        let userId = await AuthManager.shared.currentUser?.id ?? ""
        let olderMessages = response.data.map { $0.toMessage(currentUserId: userId) }

        // Merge older messages at the beginning of existing cache
        let existing = await cache.messages.load(for: conversationId).value ?? []
        let existingIds = Set(existing.map(\.id))
        let newOnly = olderMessages.filter { !existingIds.contains($0.id) }
        let merged = newOnly + existing

        await cache.messages.save(merged, for: conversationId)
        _messagesDidChange.send(conversationId)
    } catch {
        // Silent failure
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift packages/MeeshySDK/Tests/MeeshySDKTests/Sync/ConversationSyncEngineTests.swift
git commit -m "feat(sync): implement ensureMessages and fetchOlderMessages"
```

---

## Task 8: SyncEngine — `cleanupRetentionIfNeeded()`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshySDKTests/Sync/ConversationSyncEngineTests.swift`

- [ ] **Step 1: Write failing tests**

```swift
func test_cleanupRetention_keepsMax600Messages() async {
    // Create 800 messages for a conversation
    let msgs = (0..<800).map { makeMessage(id: "m\($0)") }
    await CacheCoordinator.shared.messages.save(msgs, for: "conv1")

    let engine = ConversationSyncEngine()
    await engine.cleanupRetentionIfNeeded()

    let cached = await CacheCoordinator.shared.messages.load(for: "conv1")
    XCTAssertEqual(cached.value?.count, 600)
}

func test_cleanupRetention_keepsAllUnder1Year() async {
    // 700 messages, all from last month (under 1 year)
    let recentDate = Date().addingTimeInterval(-30 * 86400)
    let msgs = (0..<700).map { makeMessage(id: "m\($0)", createdAt: recentDate) }
    await CacheCoordinator.shared.messages.save(msgs, for: "conv1")

    let engine = ConversationSyncEngine()
    await engine.cleanupRetentionIfNeeded()

    let cached = await CacheCoordinator.shared.messages.load(for: "conv1")
    XCTAssertEqual(cached.value?.count, 700) // All kept (> 600 but all < 1 year)
}

func test_cleanupRetention_skipsIfRunWithin24h() async {
    let engine = ConversationSyncEngine()
    UserDefaults.standard.set(Date(), forKey: "me.meeshy.lastCleanupDate")

    let msgs = (0..<800).map { makeMessage(id: "m\($0)") }
    await CacheCoordinator.shared.messages.save(msgs, for: "conv1")

    await engine.cleanupRetentionIfNeeded()

    let cached = await CacheCoordinator.shared.messages.load(for: "conv1")
    XCTAssertEqual(cached.value?.count, 800) // NOT cleaned — too recent
}
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement retention cleanup**

```swift
public func cleanupRetentionIfNeeded() async {
    // Max 1x per 24h
    if let lastCleanup = lastCleanupDate,
       Date().timeIntervalSince(lastCleanup) < 86400 {
        return
    }

    let oneYearAgo = Calendar.current.date(byAdding: .year, value: -1, to: Date()) ?? Date()
    let convs = await cache.conversations.load(for: "list").value ?? []

    for conv in convs {
        let messages = await cache.messages.load(for: conv.id).value ?? []
        guard messages.count > 600 else { continue }

        let recentByDate = messages.filter { $0.createdAt > oneYearAgo }
        let recentByCount = Array(messages.suffix(600))

        let toKeep = recentByDate.count > recentByCount.count ? recentByDate : recentByCount

        if toKeep.count < messages.count {
            await cache.messages.save(toKeep, for: conv.id)
        }
    }

    lastCleanupDate = Date()
}
```

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift packages/MeeshySDK/Tests/MeeshySDKTests/Sync/ConversationSyncEngineTests.swift
git commit -m "feat(sync): implement retention cleanup (max 600 or < 1 year)"
```

---

## Task 9: SyncEngine — Socket Relay

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift`

- [ ] **Step 1: Write failing test for socket relay**

```swift
func test_startSocketRelay_didReconnect_triggersDeltaSync() async {
    let mockMsgSocket = MockMessageSocket()
    let mockConvService = MockConversationService()
    mockConvService.listResult = .success(makeConversationListResponse(count: 0, hasMore: false))

    let engine = ConversationSyncEngine(
        conversationService: mockConvService,
        messageSocket: mockMsgSocket
    )
    await engine.startSocketRelay()

    // Simulate reconnect
    mockMsgSocket.didReconnect.send()
    try? await Task.sleep(for: .milliseconds(200))

    // Should trigger syncSinceLastCheckpoint, which calls the API
    XCTAssertGreaterThanOrEqual(mockConvService.listCallCount, 1)
}

func test_startSocketRelay_newMessage_updatesCache() async {
    let mockMsgSocket = MockMessageSocket()
    let engine = ConversationSyncEngine(messageSocket: mockMsgSocket)

    await engine.startSocketRelay()

    // Simulate a socket event
    let apiMsg = makeAPIMessage(id: "new1", conversationId: "conv1")
    mockMsgSocket.messageReceived.send(apiMsg)

    // Give Combine pipeline time to process
    try? await Task.sleep(for: .milliseconds(100))

    let cached = await CacheCoordinator.shared.messages.load(for: "conv1")
    XCTAssertTrue(cached.value?.contains(where: { $0.id == "new1" }) ?? false)
}
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement socket relay**

Implement `startSocketRelay()` in `ConversationSyncEngine.swift`. Subscribe to all 17+ message socket events and social socket events. Each handler calls `cache.upsert(...)` or `cache.upsertPatch(...)` and fires the appropriate publisher.

Key handlers:
- `messageReceived` → `cache.messages.upsert(...)` + `cache.conversations.upsertPatch(...)` (update lastMessage, unreadCount)
- `messageEdited` → `cache.messages.upsertPatch(...)` (update content)
- `messageDeleted` → `cache.messages.upsertPatch(...)` (set deletedAt)
- `reactionAdded/Removed` → `cache.messages.upsertPatch(...)` (update reactions)
- `unreadUpdated` → `cache.conversations.upsertPatch(...)` (update unreadCount)
- `translationReceived` → in-memory translation cache
- `transcriptionReady` → in-memory transcription cache
- `audioTranslation*` → in-memory audio translation cache
- `didReconnect` → call `syncSinceLastCheckpoint()`
- Social: `conversationCreated` → `cache.conversations.upsert(...)`

Mirror the handler logic from the deleted `CacheCoordinator.subscribeToMessageSocket()` but use `upsert`/`upsertPatch` instead of `update`.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Build full iOS app**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift packages/MeeshySDK/Tests/MeeshySDKTests/Sync/ConversationSyncEngineTests.swift
git commit -m "feat(sync): implement socket relay with upsert (17+ events)"
```

---

## Task 10: Refactor ConversationListViewModel — Cache-First

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift:212-469`

- [ ] **Step 1: Write failing test for cache-first loading**

```swift
// apps/ios/MeeshyTests/ViewModels/ConversationListViewModelSyncTests.swift
import XCTest
import Combine
@testable import Meeshy
@testable import MeeshySDK

@MainActor
final class ConversationListViewModelSyncTests: XCTestCase {

    private func makeSUT() -> (sut: ConversationListViewModel, mockSync: MockConversationSyncEngine) {
        let mockSync = MockConversationSyncEngine()
        let sut = ConversationListViewModel(syncEngine: mockSync)
        return (sut, mockSync)
    }

    func test_loadConversations_withCachedData_displaysInstantly() async {
        // Pre-populate cache
        let convs = [makeConversation(id: "c1"), makeConversation(id: "c2")]
        await CacheCoordinator.shared.conversations.save(convs, for: "list")

        let (sut, mockSync) = makeSUT()
        await sut.loadConversations()

        XCTAssertEqual(sut.conversations.count, 2)
        // Sync should be called in background but not awaited
        XCTAssertEqual(mockSync.syncSinceLastCheckpointCallCount, 1)
    }

    func test_loadConversations_emptyCache_showsLoadingState() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        let (sut, mockSync) = makeSUT()

        // Start loading (won't complete until sync finishes)
        let loadTask = Task { await sut.loadConversations() }

        // loadState should be .loading
        try? await Task.sleep(for: .milliseconds(50))
        XCTAssertEqual(sut.loadState, .loading)
        loadTask.cancel()
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Refactor `loadConversations()`**

In `ConversationListViewModel.swift`:

1. Add `syncEngine` dependency (injected, default `.shared`):
```swift
private let syncEngine: ConversationSyncEngineProviding

init(syncEngine: ConversationSyncEngineProviding = ConversationSyncEngine.shared) {
    self.syncEngine = syncEngine
    // ... existing init code
}
```

2. Replace `loadConversations()` (lines 417-469) with:
```swift
func loadConversations() async {
    let cached = await CacheCoordinator.shared.conversations.load(for: "list")
    switch cached {
    case .fresh(let data, _):
        conversations = data
        loadState = .cachedFresh
    case .stale(let data, _):
        conversations = data
        loadState = .cachedStale
        Task { await syncEngine.syncSinceLastCheckpoint() }
    case .expired, .empty:
        loadState = .loading
        await syncEngine.fullSync()
        let reloaded = await CacheCoordinator.shared.conversations.load(for: "list")
        if let data = reloaded.value { conversations = data }
        loadState = .loaded
    }
}
```

3. Add `observeSync()` method:
```swift
func observeSync() {
    syncEngine.conversationsDidChange
        .debounce(for: .milliseconds(50), scheduler: DispatchQueue.main)
        .sink { [weak self] in
            Task { await self?.reloadFromCache() }
        }
        .store(in: &cancellables)
}

private func reloadFromCache() async {
    let cached = await CacheCoordinator.shared.conversations.load(for: "list")
    switch cached {
    case .fresh(let data, _), .stale(let data, _):
        conversations = data
    case .expired, .empty:
        break
    }
}
```

4. Remove direct socket subscriptions from `subscribeToSocketEvents()` that are now handled by SyncEngine. Explicitly:

**REMOVE** (handled by SyncEngine socket relay):
- `messageSocket.messageReceived` → SyncEngine updates cache
- `messageSocket.messageEdited` → SyncEngine updates cache
- `messageSocket.messageDeleted` → SyncEngine updates cache
- `messageSocket.unreadUpdated` → SyncEngine updates cache
- `messageSocket.reactionAdded/Removed/Synced` → SyncEngine updates cache
- `messageSocket.readStatusUpdated` → SyncEngine updates cache
- `messageSocket.translationReceived` → SyncEngine caches translation
- `messageSocket.transcriptionReady` → SyncEngine caches transcription
- `messageSocket.audioTranslation*` → SyncEngine caches audio

**KEEP** (view-specific, not cache-related):
- `messageSocket.typingStarted` → shows typing indicator in UI
- `messageSocket.typingStopped` → hides typing indicator in UI
- `messageSocket.participantRoleUpdated` → may affect UI permissions

After this removal, the `messageSocket` init parameter may become unused if only typing events remain. If so, keep it for the typing subscription. Do NOT remove it from init — existing call sites pass it.

5. Remove `loadAllRemainingBackground()` — pagination is now in SyncEngine's `fullSync()`.

6. Update init to accept `syncEngine` parameter with `.shared` default. Keep ALL existing parameters (some are still used for typing, presence, prefetch):
```swift
init(
    syncEngine: ConversationSyncEngineProviding = ConversationSyncEngine.shared,
    api: APIClientProviding = APIClient.shared,
    conversationService: ConversationServiceProviding = ConversationService.shared,
    // ... keep all existing params
)
```

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Build iOS app**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift apps/ios/MeeshyTests/ViewModels/ConversationListViewModelSyncTests.swift
git commit -m "refactor(ios): ConversationListVM cache-first with SyncEngine"
```

---

## Task 11: Refactor ConversationViewModel — Cache-First

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:492-541`

- [ ] **Step 1: Write failing test**

```swift
// apps/ios/MeeshyTests/ViewModels/ConversationViewModelSyncTests.swift
import XCTest
import Combine
@testable import Meeshy
@testable import MeeshySDK

@MainActor
final class ConversationViewModelSyncTests: XCTestCase {

    // IMPORTANT: Before writing these tests, READ ConversationViewModel.init to verify
    // the actual parameter names and order. The init signature below is approximate —
    // adjust to match the real init (conversationId may be set via a different mechanism).

    func test_loadMessages_withCachedData_displaysInstantly() async {
        let msgs = [makeMessage(id: "m1"), makeMessage(id: "m2")]
        await CacheCoordinator.shared.messages.save(msgs, for: "conv1")

        let mockSync = MockConversationSyncEngine()
        // Verify actual init params — conversationId may be a property, not init param
        let sut = ConversationViewModel(conversationId: "conv1", syncEngine: mockSync)
        await sut.loadMessages()

        XCTAssertEqual(sut.messages.count, 2)
    }

    func test_loadMessages_cacheMiss_callsEnsureMessages() async {
        await CacheCoordinator.shared.messages.invalidate(for: "conv_new")

        let mockSync = MockConversationSyncEngine()
        let sut = ConversationViewModel(conversationId: "conv_new", syncEngine: mockSync)
        await sut.loadMessages()

        XCTAssertEqual(mockSync.ensureMessagesCallCount, 1)
    }

    func test_observeSync_updatesMessagesOnChange() async {
        let mockSync = MockConversationSyncEngine()
        let sut = ConversationViewModel(conversationId: "conv1", syncEngine: mockSync)
        sut.observeSync()

        // Pre-populate cache then fire publisher
        let msgs = [makeMessage(id: "m1")]
        await CacheCoordinator.shared.messages.save(msgs, for: "conv1")
        mockSync.messagesDidChange.send("conv1")

        try? await Task.sleep(for: .milliseconds(100))
        XCTAssertEqual(sut.messages.count, 1)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Refactor `loadMessages()`**

In `ConversationViewModel.swift`:

1. Add `syncEngine` dependency:
```swift
private let syncEngine: ConversationSyncEngineProviding

init(..., syncEngine: ConversationSyncEngineProviding = ConversationSyncEngine.shared) {
    self.syncEngine = syncEngine
    // ... existing init
}
```

2. Replace `loadMessages()` (lines 492-541):
```swift
func loadMessages() async {
    guard !isLoadingInitial else { return }
    isLoadingInitial = true
    error = nil

    let cached = await CacheCoordinator.shared.messages.load(for: conversationId)
    switch cached {
    case .fresh(let data, _):
        messages = data
        loadState = .cachedFresh
    case .stale(let data, _):
        messages = data
        loadState = .cachedStale
        Task { await syncEngine.ensureMessages(for: conversationId) }
    case .expired, .empty:
        loadState = .loading
        await syncEngine.ensureMessages(for: conversationId)
        let reloaded = await CacheCoordinator.shared.messages.load(for: conversationId)
        if let data = reloaded.value { messages = data }
        loadState = .loaded
    }

    // Calculate unread position
    if initialUnreadCount > 0, messages.count >= initialUnreadCount {
        let idx = messages.count - initialUnreadCount
        let candidate = messages[idx]
        if !candidate.isMe { firstUnreadMessageId = candidate.id }
    }

    markAsRead()
    isLoadingInitial = false
}
```

3. Replace `loadOlderMessages()` to use SyncEngine:
```swift
func loadOlderMessages() async {
    guard hasOlderMessages, !isLoadingOlder, !isLoadingInitial else { return }
    guard let oldestId = messages.first?.id else { return }

    let now = Date()
    guard now.timeIntervalSince(lastOlderPaginationTime) >= Self.paginationDebounceInterval else { return }
    lastOlderPaginationTime = now

    isLoadingOlder = true
    scrollAnchorId = oldestId

    await syncEngine.fetchOlderMessages(for: conversationId, before: oldestId)

    // Reload from cache
    let cached = await CacheCoordinator.shared.messages.load(for: conversationId)
    if let data = cached.value { messages = data }

    isLoadingOlder = false
}
```

4. Add `observeSync()`:
```swift
func observeSync() {
    syncEngine.messagesDidChange
        .filter { [weak self] in $0 == self?.conversationId }
        .debounce(for: .milliseconds(50), scheduler: DispatchQueue.main)
        .sink { [weak self] _ in
            Task { await self?.reloadMessagesFromCache() }
        }
        .store(in: &cancellables)
}

private func reloadMessagesFromCache() async {
    let cached = await CacheCoordinator.shared.messages.load(for: conversationId)
    switch cached {
    case .fresh(let data, _), .stale(let data, _):
        messages = data
    case .expired, .empty:
        break
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Build iOS app**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift apps/ios/MeeshyTests/ViewModels/ConversationViewModelSyncTests.swift
git commit -m "refactor(ios): ConversationVM cache-first with SyncEngine"
```

---

## Task 12: Lifecycle Integration — Start SyncEngine on Launch

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/RootView.swift:282-290`

- [ ] **Step 1: Add SyncEngine startup to RootView's `.task` block**

In `RootView.swift`, in the `.task` block (around line 282), add after socket connect:

```swift
.task {
    // Existing: connect sockets
    MessageSocketManager.shared.connect()

    // NEW: Start SyncEngine
    await ConversationSyncEngine.shared.startSocketRelay()

    // Deferred cleanup — 5s after launch, background priority
    Task.detached(priority: .background) {
        try? await Task.sleep(for: .seconds(5))
        await ConversationSyncEngine.shared.cleanupRetentionIfNeeded()
    }

    // Existing: load conversations
    await conversationViewModel.loadConversations()
}
```

- [ ] **Step 2: Add foreground sync observer**

In the same view or in `MeeshyApp.swift`, add:

```swift
.onChange(of: scenePhase) { _, newPhase in
    if newPhase == .active {
        Task { await ConversationSyncEngine.shared.syncSinceLastCheckpoint() }
    }
}
```

- [ ] **Step 3: Call `observeSync()` on ViewModels**

In `RootView.swift`, after creating `ConversationListViewModel`, ensure `observeSync()` is called in `.onAppear` or init.

In `ConversationView.swift`, ensure `ConversationViewModel.observeSync()` is called in `.task` or `.onAppear`.

- [ ] **Step 4: Build and test on simulator**

Run: `./apps/ios/meeshy.sh run`
Expected: App launches, conversations display instantly from cache on 2nd launch

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/RootView.swift apps/ios/Meeshy/MeeshyApp.swift
git commit -m "feat(ios): wire SyncEngine into app lifecycle (launch + foreground)"
```

---

## Task 13: Integration Testing — Full Flow

- [ ] **Step 1: Run full SDK test suite**

Run: `cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet`
Expected: ALL PASS

- [ ] **Step 2: Run full iOS app test suite**

Run: `./apps/ios/meeshy.sh test`
Expected: ALL PASS

- [ ] **Step 3: Run gateway tests**

Run: `cd /Users/smpceo/Documents/v2_meeshy && pnpm vitest run services/gateway/src/routes/conversations/__tests__/`
Expected: ALL PASS

- [ ] **Step 4: Manual smoke test on simulator**

Run: `./apps/ios/meeshy.sh run`

Verify:
1. First launch: skeleton → conversations appear
2. Kill app, relaunch: conversations appear INSTANTLY (no skeleton)
3. Open a conversation: messages load (first time = network, second time = instant)
4. Background app, send a message from web → return to app → new message appears
5. Pull to refresh works

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
git commit -m "fix(sync): integration test fixes"
```

---

## Summary

| Task | Component | Estimated Steps |
|------|-----------|-----------------|
| 1 | Gateway `updatedSince` endpoint | 5 |
| 2 | GRDBCacheStore `upsert` methods | 5 |
| 3 | CacheCoordinator socket removal | 6 |
| 4 | SyncEngine protocol + skeleton | 6 |
| 5 | SyncEngine `fullSync()` | 5 |
| 6 | SyncEngine `syncSinceLastCheckpoint()` | 5 |
| 7 | SyncEngine `ensureMessages()` + `fetchOlder()` | 5 |
| 8 | SyncEngine retention cleanup | 5 |
| 9 | SyncEngine socket relay | 6 |
| 10 | ConversationListVM refactor | 6 |
| 11 | ConversationVM refactor | 6 |
| 12 | Lifecycle integration | 5 |
| 13 | Integration testing | 5 |

**Dependencies:** Tasks 1-3 are independent (can run in parallel). Task 4 depends on 2-3. Tasks 5-9 depend on 4 (sequential). Tasks 10-11 depend on **9** (socket relay must be active before VMs drop their own subscriptions). Task 12 depends on 9-11. Task 13 depends on all.

**Parallel execution strategy:**
- Worktree A: Tasks 1 (gateway)
- Worktree B: Tasks 2-3 (cache layer)
- Main: Tasks 4-13 (after A+B merge)
