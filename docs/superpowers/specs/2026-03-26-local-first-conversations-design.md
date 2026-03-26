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
  |  - Socket Relay (17+ events -> cache writes)
  |  - Delta Sync (foreground/reconnect -> API -> cache writes)
  |  - Message Loader (ensure messages, fetch older)
  |  - Retention Cleanup (1x/24h)
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

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift

public actor ConversationSyncEngine {
    public static let shared = ConversationSyncEngine()

    // Publishers for VM observation
    public let conversationsDidChange = PassthroughSubject<Void, Never>()
    public let messagesDidChange = PassthroughSubject<String, Never>() // convId

    // State
    private var lastSyncTimestamp: Date  // persisted UserDefaults
    private var isSyncing: Bool = false
    private var socketSubscriptions: Set<AnyCancellable> = []

    /// Cold start — first launch, empty cache
    public func fullSync() async

    /// Delta sync — foreground / reconnect
    public func syncSinceLastCheckpoint() async

    /// Load messages for a conversation (cache first, network if empty)
    public func ensureMessages(for conversationId: String) async

    /// Load older messages (infinite scroll)
    public func fetchOlderMessages(for conversationId: String, before messageId: String) async

    /// Retention cleanup (max 600 or < 1 year)
    public func cleanupRetentionIfNeeded() async

    /// Start socket event relay
    public func startSocketRelay() async

    /// Stop socket event relay
    public func stopSocketRelay() async
}
```

## Loading Flows

### Flow 1 — Warm Start (cache exists)

```
App launch
  -> ConversationListVM.init()
  -> cache.conversations.load("list")
  -> .fresh/.stale -> INSTANT display (0ms, no spinner)
  -> SyncEngine.syncSinceLastCheckpoint() in background
       -> GET /conversations?updatedSince={lastSync}
       -> merge delta into cache
       -> VM observes cache -> UI updates silently
```

Zero spinner. Zero skeleton. User sees their list immediately.

### Flow 2 — Cold Start (first launch / empty cache)

```
App launch
  -> cache.conversations.load("list")
  -> .empty -> skeleton (ONLY case where skeleton is allowed)
  -> SyncEngine.fullSync()
       -> GET /conversations?limit=100&offset=0
       -> save to cache -> VM observes -> skeleton disappears
       -> background: paginate remaining (100 per page) silently
  -> lastSyncTimestamp = now
```

### Flow 3 — Opening a Conversation

```
User taps conversation
  -> ConversationVM.init(conversationId)
  -> cache.messages.load(conversationId)

  CASE A: cache has messages (.fresh/.stale)
    -> INSTANT display
    -> SyncEngine.ensureMessages(convId) background if .stale

  CASE B: cache empty (.empty) — first open
    -> skeleton
    -> SyncEngine.ensureMessages(convId)
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
  -> merge modified conversations into cache
  -> for each conv with new messages:
       -> if conv is open: fetch new messages
       -> if conv is closed: update lastMessage + unreadCount in cache
  -> lastSyncTimestamp = now
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
Trigger: app launch (max 1x per 24h)
  -> SyncEngine.cleanupRetentionIfNeeded()
  -> for each conversation:
       messages = cache.messages.load(convId)
       if messages.count > 600:
           recentByDate = messages where createdAt > 1 year ago
           recentByCount = last 600 messages
           keep whichever set is larger
           delete the rest from cache
```

## ViewModel Refactoring

### ConversationListViewModel — Before vs After

**Before (~200 lines of network/cache logic):**
```swift
func loadConversations() async {
    isLoading = true
    let cached = await cache.conversations.load(for: "list")
    // ... fresh/stale/empty handling
    let response = try await conversationService.list(offset: 0, limit: 100)
    conversations = response.data.map { $0.toMeeshyConversation() }
    await cache.conversations.save(conversations, for: "list")
    isLoading = false
    // ... background pagination
}
```

**After (~20 lines):**
```swift
func loadConversations() async {
    let cached = await cache.conversations.load(for: "list")
    switch cached {
    case .fresh(let data, _), .stale(let data, _):
        conversations = data  // INSTANT
    case .expired, .empty:
        isLoading = true  // skeleton only here
    }

    await syncEngine.syncSinceLastCheckpoint()
    isLoading = false
}

func observeSync() {
    syncEngine.conversationsDidChange
        .receive(on: DispatchQueue.main)
        .sink { [weak self] in
            Task { await self?.reloadFromCache() }
        }
        .store(in: &cancellables)
}

private func reloadFromCache() async {
    let cached = await cache.conversations.load(for: "list")
    conversations = cached.value ?? []
}
```

### ConversationViewModel — Before vs After

**Before (~200 lines of network/cache logic):**
```swift
func loadMessages() async {
    let cached = await cache.messages.load(for: conversationId)
    if let data = cached.value, !data.isEmpty {
        messages = data
    }
    let response = try await messageService.list(conversationId: conversationId, ...)
    messages = process(response.data)
    await cache.messages.save(messages, for: conversationId)
}
```

**After (~20 lines):**
```swift
func loadMessages() async {
    let cached = await cache.messages.load(for: conversationId)
    switch cached {
    case .fresh(let data, _), .stale(let data, _):
        messages = data  // INSTANT
    case .expired, .empty:
        isLoading = true
    }

    await syncEngine.ensureMessages(for: conversationId)
    isLoading = false
}

func loadOlderMessages() async {
    guard let oldest = messages.first else { return }
    await syncEngine.fetchOlderMessages(for: conversationId, before: oldest.id)
}

func observeSync() {
    syncEngine.messagesDidChange
        .filter { $0 == self.conversationId }
        .receive(on: DispatchQueue.main)
        .sink { [weak self] _ in
            Task { await self?.reloadFromCache() }
        }
        .store(in: &cancellables)
}
```

## Socket Relay Migration

Currently CacheCoordinator subscribes to 17+ Socket.IO events and updates caches. This responsibility moves to SyncEngine:

```swift
func startSocketRelay() async {
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

    // ... same pattern for all 17+ events
}

private func handleNewMessage(_ msg: APIMessage) async {
    // 1. Append to message cache
    await cache.messages.append(msg.toMeeshyMessage(), for: msg.conversationId)
    // 2. Update lastMessage + unreadCount on conversation
    await cache.conversations.patch(msg.conversationId) { conv in
        conv.lastMessage = msg
        conv.unreadCount += 1
    }
    // 3. Notify VMs
    messagesDidChange.send(msg.conversationId)
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

When absent: existing behavior (offset/limit pagination).

### Ensure `updatedAt` Bump on Mutations

Verify that `conversation.updatedAt` is bumped when:
- A message is sent in the conversation
- A message is edited/deleted
- unreadCount changes
- Participants added/removed

Prisma `@updatedAt` handles direct conversation updates. For message mutations, ensure the gateway does a `conversation.update({ updatedAt: new Date() })` or equivalent touch.

This is the only required gateway change.

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
| App launch | `cleanupRetentionIfNeeded()` (max 1x/24h) |
| Delta sync | Remove conversations with `deletedAt` |
| Low memory warning | Evict L1 (in-memory), keep L2 (SQLite) |
| User logout | `cache.clearAll()` |

## Lifecycle Integration

```swift
// AppDelegate or App.init
@MainActor
func setupSync() {
    Task {
        await ConversationSyncEngine.shared.startSocketRelay()
        await ConversationSyncEngine.shared.cleanupRetentionIfNeeded()
    }

    NotificationCenter.default.addObserver(
        forName: UIApplication.willEnterForegroundNotification
    ) { _ in
        Task { await ConversationSyncEngine.shared.syncSinceLastCheckpoint() }
    }
}
```

## Out of Scope

- **Offline message sending** (MessageSendQueue + optimistic UI) — separate spec
- **Manual cache purge** in settings — not needed yet
- **Message search index** — existing server-side search is sufficient
- **Media sync** — already handled by existing DiskCacheStore with LRU eviction

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift` | Core sync engine actor |

### Modified Files
| File | Change |
|------|--------|
| `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift` | Remove network calls, read cache + observe SyncEngine |
| `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` | Remove network calls, read cache + observe SyncEngine |
| `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift` | Remove socket subscriptions (moved to SyncEngine) |
| `services/gateway/src/modules/conversations/conversations.routes.ts` | Add `updatedSince` query param |
| `services/gateway/src/modules/conversations/conversations.service.ts` | Add Prisma filter for `updatedSince` |
| App lifecycle (AppDelegate/MeeshyApp.swift) | Start SyncEngine on launch |

## Success Criteria

1. **Warm start: 0ms to conversation list** — cache displayed instantly, no spinner
2. **Cold start: skeleton only** — conversations appear as API responds
3. **Conversation open with cache: 0ms** — messages displayed instantly
4. **Conversation open without cache: skeleton + fetch** — first open only
5. **Background sync transparent** — no UI flicker, silent updates
6. **Retention enforced** — max(600, < 1 year) per conversation, ~500MB typical
7. **Socket events still real-time** — no regression on live message delivery
