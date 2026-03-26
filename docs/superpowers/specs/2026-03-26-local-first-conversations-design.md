# Local-First Conversations & Messages

**Date:** 2026-03-26
**Status:** Draft
**Scope:** iOS app (MeeshySDK + Meeshy app) + Gateway delta sync endpoint

## Problem

L'app iOS affiche un chargement (spinner/skeleton) avant d'afficher les conversations, meme quand le cache local contient des donnees. L'utilisateur attend le reseau alors que les donnees sont deja sur son telephone. L'objectif : affichage instantane des conversations et messages depuis le cache local, synchronisation reseau en arriere-plan.

## Decision Summary

| Decision | Choice |
|----------|--------|
| Sync initiale (cold start) | Lazy : conversations metadata d'abord, messages au premier open |
| Sync continue | Hybrid push (Socket.IO) + pull (delta sync foreground/reconnect) |
| Retention messages | max(600 messages, < 1 an) par conversation |
| Envoi offline | Hors scope (spec separe) |
| Architecture | SyncEngine actor dedie (ViewModels read-only sur cache) |

## Architecture

```
Views (ConversationListView, ConversationView)
  |  observe cache (Combine publishers)
  v
ViewModels (read cache only, never call network)
  |  observe cache
  v
CacheCoordinator (GRDB SQLite L1+L2)
  ^  write only
  |
ConversationSyncEngine (actor, singleton)
  |  - Socket Relay (17+ message events + social socket events)
  |  - Delta Sync (foreground/reconnect -> API -> cache writes)
  |  - Message Loader (ensure messages, fetch older)
  |  - Retention Cleanup (1x/24h, deferred 5s post-launch, background priority)
  |
  v
Gateway API + Socket.IO
  - GET /conversations?updatedSince={ISO8601}  (NEW)
  - GET /conversations/:id/messages             (existing)
  - Socket.IO events                            (existing)
```

### Key Principle

ViewModels never touch the network. They read from CacheCoordinator and observe changes. The SyncEngine is the sole writer to the cache (via Socket.IO events + API responses). This decouples UI from network state entirely.

## ConversationSyncEngine — Public API

### Protocol (TDD requirement)

Per iOS CLAUDE.md: every new service must define a protocol before implementation.

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift

public protocol ConversationSyncEngineProviding: Sendable {
    /// Publisher: conversations cache was updated
    var conversationsDidChange: PassthroughSubject<Void, Never> { get }
    /// Publisher: messages cache was updated for a specific conversation
    var messagesDidChange: PassthroughSubject<String, Never> { get }

    /// Cold start — first launch, empty cache
    func fullSync() async
    /// Delta sync — foreground / reconnect
    func syncSinceLastCheckpoint() async
    /// Load messages for a conversation (cache first, network if empty)
    func ensureMessages(for conversationId: String) async
    /// Load older messages (infinite scroll)
    func fetchOlderMessages(for conversationId: String, before messageId: String) async
    /// Retention cleanup (max 600 or < 1 year)
    func cleanupRetentionIfNeeded() async
    /// Start socket event relay
    func startSocketRelay() async
    /// Stop socket event relay
    func stopSocketRelay() async
}
```

### Implementation

```swift
public actor ConversationSyncEngine: ConversationSyncEngineProviding {
    public static let shared = ConversationSyncEngine()

    // Publishers — nonisolated to avoid Swift 6 actor/Combine conflict.
    // PassthroughSubject is not Sendable; nonisolated(unsafe) lets us
    // expose them without actor hop. send() is thread-safe on Subject.
    nonisolated(unsafe) public let conversationsDidChange = PassthroughSubject<Void, Never>()
    nonisolated(unsafe) public let messagesDidChange = PassthroughSubject<String, Never>()

    // State
    private var lastSyncTimestamp: Date  // persisted UserDefaults
    private var isSyncing: Bool = false
    private var socketSubscriptions: Set<AnyCancellable> = []

    // Dependencies (injected for testability)
    private let cache: CacheCoordinator
    private let conversationService: ConversationServiceProviding
    private let messageService: MessageServiceProviding
    private let messageSocket: MessageSocketProviding
    private let socialSocket: SocialSocketProviding
}
```

### Mock for Testing

```swift
// Tests/MockConversationSyncEngine.swift
final class MockConversationSyncEngine: ConversationSyncEngineProviding, @unchecked Sendable {
    let conversationsDidChange = PassthroughSubject<Void, Never>()
    let messagesDidChange = PassthroughSubject<String, Never>()

    var fullSyncCallCount = 0
    var syncSinceLastCheckpointCallCount = 0
    var ensureMessagesCallCount = 0
    // ... Result<Void, Error> stubs per method

    func fullSync() async { fullSyncCallCount += 1 }
    func syncSinceLastCheckpoint() async { syncSinceLastCheckpointCallCount += 1 }
    func ensureMessages(for conversationId: String) async { ensureMessagesCallCount += 1 }
    func fetchOlderMessages(for conversationId: String, before messageId: String) async {}
    func cleanupRetentionIfNeeded() async {}
    func startSocketRelay() async {}
    func stopSocketRelay() async {}
}
```

## GRDBCacheStore — New `upsert` Method

The existing `GRDBCacheStore.update()` silently no-ops when the key is not in L1 memory (LRU cap = 20 keys). The SyncEngine's socket relay needs to update items that may have been evicted from L1. A new `upsert` method is required.

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheStore.swift

/// Append an item to an existing cache entry, reading from L2 if not in L1.
/// Unlike update(), this never silently no-ops on L1 miss.
public func upsert(item: Value, for key: Key, merge: @Sendable ([Value], Value) -> [Value]) async {
    // 1. Try L1 first
    if var l1 = memoryCache[key] {
        l1.items = merge(l1.items, item)
        memoryCache[key] = l1
        markDirty(key)
        return
    }
    // 2. L1 miss — read from L2 (SQLite), merge, write back to both L1 + L2
    let existing = await readFromL2(for: key) ?? []
    let merged = merge(existing, item)
    memoryCache[key] = L1Entry(items: merged, timestamp: Date())
    markDirty(key)
}

/// Update a field on a single item within a cache entry (e.g., patch a conversation).
/// Reads from L2 if L1 miss. Applies mutator to matching item.
public func upsertPatch(for key: Key, itemId: String, mutate: @Sendable (inout Value) -> Void) async {
    // Similar pattern: L1 first, L2 fallback, apply mutate, write back
}
```

This replaces the spec's pseudocode `cache.messages.append(...)` and `cache.conversations.patch(...)`.

## Loading Flows

### Flow 1 — Warm Start (cache exists)

```
App launch
  -> ConversationListVM.init()
  -> cache.conversations.load("list")
  -> .fresh/.stale -> INSTANT display (0ms, no spinner)
  -> Task { SyncEngine.syncSinceLastCheckpoint() }  // fire-and-forget, NOT awaited
       -> GET /conversations?updatedSince={lastSync}
       -> merge delta into cache
       -> VM observes cache -> UI updates silently
```

Zero spinner. Zero skeleton. User sees their list immediately. Sync is fire-and-forget — the VM does NOT await it.

### Flow 2 — Cold Start (first launch / empty cache)

```
App launch
  -> cache.conversations.load("list")
  -> .empty -> skeleton (ONLY case where skeleton is allowed)
  -> SyncEngine.fullSync()
       -> GET /conversations?limit=100&offset=0
       -> save to cache (deduplicated merge, not overwrite) -> VM observes -> skeleton disappears
       -> background: paginate remaining (100 per page), each page merged into existing cache
  -> lastSyncTimestamp = server response Date header (NOT client Date())
```

### Flow 3 — Opening a Conversation

```
User taps conversation
  -> ConversationVM.init(conversationId)
  -> cache.messages.load(conversationId)

  CASE A: cache has messages (.fresh/.stale)
    -> INSTANT display
    -> Task { SyncEngine.ensureMessages(convId) }  // fire-and-forget if .stale

  CASE B: cache empty (.empty) — first open
    -> skeleton (loadState = .loading)
    -> await SyncEngine.ensureMessages(convId)
       -> GET /conversations/{id}/messages?limit=30
       -> save to cache -> VM observes -> display
    -> background: preload up to 600 messages
```

### Flow 4 — Scroll Up (older messages)

```
User scrolls up
  -> VM detects proximity to top

  CASE A: local cache has older messages
    -> load from cache -> instant display

  CASE B: local cache exhausted but < 1 year of history
    -> SyncEngine.fetchOlderMessages(convId, before: oldestMsgId)
    -> save to cache -> VM observes -> display
    -> small spinner at top during fetch only

  CASE C: messages > 1 year (outside local retention)
    -> classic network infinite scroll (no caching)
```

### Flow 5 — Return to Foreground

```
App returns from background
  -> SyncEngine.syncSinceLastCheckpoint()
  -> delta = GET /conversations?updatedSince={lastSync}
  -> merge modified conversations into cache (deduplicated)
  -> for each conv with new messages:
       -> if conv is open: fetch new messages
       -> if conv is closed: update lastMessage + unreadCount in cache
  -> lastSyncTimestamp = server response Date header
```

### Flow 6 — Socket.IO Reconnect

```
Socket reconnects after disconnection
  -> SyncEngine.syncSinceLastCheckpoint()
  -> same logic as Flow 5
  -> resume socket event relay
```

### Flow 7 — Retention Cleanup

```
Trigger: 5 seconds after app launch (max 1x per 24h)
  -> Task.detached(priority: .background) { SyncEngine.cleanupRetentionIfNeeded() }
  -> for each conversation:
       count = cache.messages.count(for: convId)  // metadata query, no full load
       if count > 600:
           load messages for this conv
           recentByDate = messages where createdAt > 1 year ago
           recentByCount = last 600 messages
           keep whichever set is larger
           delete the rest from cache
```

Cleanup runs on `.background` priority, 5s after launch, to never compete with the warm-start display path.

## ViewModel Refactoring

### LoadState Compliance

Per `apps/ios/CLAUDE.md`, every data-loading ViewModel must use `LoadState` enum, not raw `isLoading: Bool`.

### ConversationListViewModel — After

```swift
func loadConversations() async {
    let cached = await cache.conversations.load(for: "list")
    switch cached {
    case .fresh(let data, _):
        conversations = data
        loadState = .cachedFresh
    case .stale(let data, _):
        conversations = data
        loadState = .cachedStale
        Task { await syncEngine.syncSinceLastCheckpoint() }  // fire-and-forget
    case .expired, .empty:
        loadState = .loading  // skeleton
        await syncEngine.fullSync()
        loadState = .loaded
    }
}

func observeSync() {
    syncEngine.conversationsDidChange
        .debounce(for: .milliseconds(50), scheduler: DispatchQueue.main)
        .sink { [weak self] in
            Task { await self?.reloadFromCache() }
        }
        .store(in: &cancellables)
}

private func reloadFromCache() async {
    let cached = await cache.conversations.load(for: "list")
    switch cached {
    case .fresh(let data, _):
        conversations = data
        loadState = .cachedFresh
    case .stale(let data, _):
        conversations = data
        loadState = .cachedStale
    case .expired, .empty:
        break  // don't clear existing data
    }
}
```

### ConversationViewModel — After

```swift
func loadMessages() async {
    let cached = await cache.messages.load(for: conversationId)
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
        loadState = .loaded
    }
}

func loadOlderMessages() async {
    guard let oldest = messages.first else { return }
    await syncEngine.fetchOlderMessages(for: conversationId, before: oldest.id)
}

func observeSync() {
    syncEngine.messagesDidChange
        .filter { $0 == self.conversationId }
        .debounce(for: .milliseconds(50), scheduler: DispatchQueue.main)
        .sink { [weak self] _ in
            Task { await self?.reloadFromCache() }
        }
        .store(in: &cancellables)
}

private func reloadFromCache() async {
    let cached = await cache.messages.load(for: conversationId)
    switch cached {
    case .fresh(let data, _), .stale(let data, _):
        messages = data
    case .expired, .empty:
        break
    }
}
```

## Socket Relay Migration

### Ownership Transfer

**Explicitly remove** `subscribeToMessageSocket()` and `subscribeToSocialSocket()` from `CacheCoordinator.start()`. CacheCoordinator retains only:
- Cache CRUD operations (load/save/update/upsert/remove)
- Flush-on-background (write dirty L1 entries to L2)
- Evict-on-memory-warning (clear L1, keep L2)
- `clearAll()` on logout

All 17+ message socket events AND social socket events (new conversation invites, friend requests) move to SyncEngine.

### SyncEngine Socket Relay

```swift
func startSocketRelay() async {
    // Message events
    messageSocket.messageReceived
        .sink { [weak self] msg in
            Task { await self?.handleNewMessage(msg) }
        }
        .store(in: &socketSubscriptions)

    messageSocket.messageEdited
        .sink { [weak self] msg in
            Task { await self?.handleEditedMessage(msg) }
        }
        .store(in: &socketSubscriptions)

    // Social events (new conversation invites, etc.)
    socialSocket.conversationCreated
        .sink { [weak self] conv in
            Task { await self?.handleNewConversation(conv) }
        }
        .store(in: &socketSubscriptions)

    // ... same pattern for all remaining events
}

private func handleNewMessage(_ msg: APIMessage) async {
    // 1. Upsert into message cache (L2 fallback if L1 miss)
    await cache.messages.upsert(
        item: msg.toMeeshyMessage(),
        for: msg.conversationId
    ) { existing, new in
        // Deduplicate by id, append if new
        existing.contains(where: { $0.id == new.id }) ? existing : existing + [new]
    }
    // 2. Patch conversation lastMessage + unreadCount
    await cache.conversations.upsertPatch(for: "list", itemId: msg.conversationId) { conv in
        conv.lastMessage = msg
        conv.unreadCount += 1
    }
    // 3. Notify VMs (debounced on subscriber side)
    messagesDidChange.send(msg.conversationId)
    conversationsDidChange.send()
}

private func handleNewConversation(_ conv: APIConversation) async {
    // Add new conversation to local cache
    await cache.conversations.upsert(
        item: conv.toMeeshyConversation(),
        for: "list"
    ) { existing, new in
        existing.contains(where: { $0.id == new.id }) ? existing : existing + [new]
    }
    conversationsDidChange.send()
}
```

## Gateway Changes

### New Query Parameter: `updatedSince`

```
GET /api/v1/conversations?updatedSince={ISO8601}
```

Added to the existing conversations listing endpoint. When present:
- Prisma filter: `{ updatedAt: { gt: new Date(updatedSince) } }`
- Returns all conversations modified since that timestamp
- No pagination limit on delta (typically < 50 conversations)
- Deleted conversations included with `deletedAt` set -> client removes from cache
- Response includes `Date` header (server time) for client to use as next `lastSyncTimestamp`

When absent: existing behavior (offset/limit pagination).

### Ensure `updatedAt` Bump on Mutations

The Prisma schema has `updatedAt DateTime @updatedAt` on the Conversation model. Prisma bumps it automatically on direct `conversation.update()` calls.

**Verify during implementation** that `updatedAt` is bumped when:
- A message is sent in the conversation
- A message is edited/deleted
- unreadCount changes
- Participants added/removed

For message mutations that don't directly update the conversation record, add an explicit `conversation.update({ data: { updatedAt: new Date() } })` touch.

### `updatedAt` in Select Clause

The current `GET /conversations` select clause does not include `updatedAt`. Add it to the select so the client receives it in the response payload for delta comparison.

## Clock Skew Protection

`lastSyncTimestamp` must be derived from the **server's** clock, not the client's:

```swift
// After a successful sync response
if let dateHeader = response.httpResponse?.value(forHTTPHeaderField: "Date"),
   let serverDate = httpDateFormatter.date(from: dateHeader) {
    lastSyncTimestamp = serverDate
} else {
    // Fallback: client time minus 30s safety buffer
    lastSyncTimestamp = Date().addingTimeInterval(-30)
}
```

This prevents missed updates when the device clock is ahead of the server.

## Retention & Storage

### Retention Rule

Per conversation, keep **whichever is larger**:
- The **600 most recent** messages
- All messages **less than 1 year old**

### Storage Estimates

| Data | Calculation | Size |
|------|-------------|------|
| Conversations (always 100% local) | 1000 x 2KB | ~2MB |
| Messages (typical: 300 active x 600 + 700 dormant x 50) | mixed | ~320MB |
| Messages (worst case: 1000 x 600 x 1.5KB) | full | ~900MB |
| Media (existing DiskCacheStore limits) | images 300MB + audio 200MB + video 500MB + thumbs 50MB | ~1050MB |
| **Total typical** | | **~500MB** |
| **Total worst case** | | **~1.9GB** |

Acceptable for a messaging app (Telegram/WhatsApp typically 2-5GB).

### Cleanup Triggers

| Event | Action |
|-------|--------|
| App launch + 5s delay | `cleanupRetentionIfNeeded()` on `.background` priority (max 1x/24h) |
| Delta sync | Remove conversations with `deletedAt` |
| Low memory warning | Evict L1 (in-memory), keep L2 (SQLite) |
| User logout | `cache.clearAll()` |

## Lifecycle Integration

```swift
// AppDelegate or App.init
@MainActor
func setupSync() {
    let syncEngine = ConversationSyncEngine.shared

    Task {
        await syncEngine.startSocketRelay()
    }

    // Deferred cleanup — 5s after launch, background priority
    Task {
        try? await Task.sleep(for: .seconds(5))
        await syncEngine.cleanupRetentionIfNeeded()
    }

    // Foreground sync
    NotificationCenter.default.addObserver(
        forName: UIApplication.willEnterForegroundNotification
    ) { _ in
        Task { await syncEngine.syncSinceLastCheckpoint() }
    }
}
```

**Important:** Remove `CacheCoordinator.start()` socket subscription calls. CacheCoordinator no longer subscribes to any socket events.

## Test Strategy

### Test Files to Create

| File | Purpose |
|------|---------|
| `packages/MeeshySDK/Tests/MeeshySDKTests/Sync/ConversationSyncEngineTests.swift` | Unit tests for SyncEngine (cold start, delta sync, socket relay, retention) |
| `apps/ios/MeeshyTests/ViewModels/ConversationListViewModelSyncTests.swift` | VM tests with MockConversationSyncEngine |
| `apps/ios/MeeshyTests/ViewModels/ConversationViewModelSyncTests.swift` | VM tests with MockConversationSyncEngine |
| `services/gateway/src/modules/conversations/__tests__/delta-sync.test.ts` | Gateway updatedSince endpoint tests |

### Key Test Scenarios

**SyncEngine:**
- `test_fullSync_emptyCache_fetchesAllConversations`
- `test_syncSinceLastCheckpoint_sendsCorrectTimestamp`
- `test_syncSinceLastCheckpoint_mergesDeltaWithoutDuplicates`
- `test_ensureMessages_cacheHit_noNetworkCall`
- `test_ensureMessages_cacheMiss_fetchesFromAPI`
- `test_handleNewMessage_upsertsToCache_notifiesPublisher`
- `test_handleNewConversation_fromSocialSocket_addsToCache`
- `test_cleanupRetention_keepsMax600OrUnder1Year`
- `test_lastSyncTimestamp_usesServerTime`

**ViewModels (with mock SyncEngine):**
- `test_loadConversations_cacheStale_displaysInstantly_syncsInBackground`
- `test_loadConversations_cacheEmpty_showsSkeleton`
- `test_loadMessages_cacheFresh_noSyncCall`
- `test_observeSync_debounces_reloadsFromCache`

**Gateway:**
- `test_listConversations_withUpdatedSince_filtersCorrectly`
- `test_listConversations_withoutUpdatedSince_returnsAll`
- `test_updatedAt_bumpedOnNewMessage`

## Out of Scope

- **Offline message sending** (MessageSendQueue + optimistic UI) — separate spec
- **Manual cache purge** in settings — not needed yet
- **Message search index** — existing server-side search is sufficient
- **Media sync** — already handled by existing DiskCacheStore with LRU eviction

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift` | Protocol + actor implementation |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Sync/ConversationSyncEngineTests.swift` | SyncEngine unit tests |
| `apps/ios/MeeshyTests/ViewModels/ConversationListViewModelSyncTests.swift` | VM sync tests |
| `apps/ios/MeeshyTests/ViewModels/ConversationViewModelSyncTests.swift` | VM sync tests |
| `services/gateway/src/modules/conversations/__tests__/delta-sync.test.ts` | Delta sync endpoint tests |

### Modified Files
| File | Change |
|------|--------|
| `packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheStore.swift` | Add `upsert(item:for:merge:)` and `upsertPatch(for:itemId:mutate:)` methods |
| `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift` | Remove `subscribeToMessageSocket()` and `subscribeToSocialSocket()` calls from `start()` |
| `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift` | Remove network calls, read cache + observe SyncEngine, use LoadState |
| `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` | Remove network calls, read cache + observe SyncEngine, use LoadState |
| `services/gateway/src/modules/conversations/conversations.routes.ts` | Add `updatedSince` query param |
| `services/gateway/src/modules/conversations/conversations.service.ts` | Add Prisma filter for `updatedSince`, add `updatedAt` to select |
| App lifecycle (AppDelegate/MeeshyApp.swift) | Start SyncEngine on launch, remove CacheCoordinator socket start |

## Success Criteria

1. **Warm start: 0ms to conversation list** — cache displayed instantly, no spinner
2. **Cold start: skeleton only** — conversations appear as API responds
3. **Conversation open with cache: 0ms** — messages displayed instantly
4. **Conversation open without cache: skeleton + fetch** — first open only
5. **Background sync transparent** — no UI flicker, silent updates
6. **Retention enforced** — max(600, < 1 year) per conversation, ~500MB typical
7. **Socket events still real-time** — no regression on live message delivery
8. **All tests pass** — SyncEngine, ViewModel, and Gateway test suites green
9. **No dual socket subscriptions** — CacheCoordinator fully cleaned of socket listeners
