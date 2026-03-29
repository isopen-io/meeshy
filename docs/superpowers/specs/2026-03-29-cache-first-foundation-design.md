# Cache-First Foundation — Design Spec

**Date**: 2026-03-29
**Status**: Approved
**Scope**: iOS app + SDK — add missing cache stores for instant display on all screens

## Problem

Multiple screens make direct API calls without checking cache first, causing:
- Spinners on every screen open (instead of instant cached data)
- Redundant API calls for data that rarely changes (stats, notifications, friend status)
- No stale-while-revalidate for read-heavy data
- Friend status checked via 2 API calls per profile open instead of instant lookup

## Audit Results

### Already using cache (OK)
| Screen | Store |
|--------|-------|
| Conversation list | `CacheCoordinator.conversations` |
| Conversation detail | `CacheCoordinator.messages` + `.participants` |
| Feed | `CacheCoordinator.feed` |
| Stories | `CacheCoordinator.stories` |
| Bookmarks | `CacheCoordinator.messages` |

### Missing cache (CRITICAL — user-visible delay)
| Screen | Data | Current | Fix |
|--------|------|---------|-----|
| Notifications | Notification list | Direct API, spinner | New `CacheCoordinator.notifications` |
| Profile (stats) | User stats + timeline | Direct API, spinner | New `CacheCoordinator.stats` |
| Profile (friend status) | Connection status | 2 API calls per open | `FriendshipCache` (DONE) |
| Post detail | Post + comments | Direct API, spinner | Use existing `.feed` store |
| Participants | Participant list | Direct API, spinner | Use existing `.participants` store |
| Thread replies | Message replies | Direct API, spinner | Use existing `.messages` store |
| Contacts (friends) | Accepted friends list | Direct API, spinner | Source from `FriendshipCache` |
| Contacts (requests) | Friend requests | Direct API, spinner | Source from `FriendshipCache` |

### Missing cache (IMPORTANT — less frequent)
| Screen | Data | Fix |
|--------|------|-----|
| Affiliate | Affiliate list + stats | New store or inline cache |
| ShareLinks | Share links list | New store or inline cache |
| TrackingLinks | Tracking links + stats | New store or inline cache |
| CommunityLinks | Community links | New store or inline cache |
| Share picker | Conversations for sharing | Use existing `.conversations` |

### No cache needed (write-only / auth / security)
ChangePassword, DeleteAccount, MagicLink, TwoFactorSetup, CreateShareLink, CreateTrackingLink, ReportUser, DataExport, Security, VoiceProfileWizard, ActiveSessions

## Solution

### 1. FriendshipCache (DONE)

Already implemented at `packages/MeeshySDK/Sources/MeeshySDK/Cache/FriendshipCache.swift`:
- Thread-safe singleton with NSLock
- Hydrated at login via `MeeshyApp.swift`
- Instant lookup: `FriendshipCache.shared.status(for: userId)` returns `.friend/.pendingSent/.pendingReceived/.none`
- Optimistic mutations with rollback on failure
- Used by `ProfileFetchingSheet` (RootView) and `DiscoverViewModel`

### 2. New: `CacheCoordinator.notifications` (GRDBCacheStore)

**Policy**: `CachePolicy(ttl: .hours(24), staleTTL: .minutes(2), maxItemCount: 200, storageLocation: .grdb)`

**Key**: `"notifications"` (single key, paginated data stored as array)

**Model**: `APINotification` (already `Decodable` in SDK)

**Integration in `NotificationListViewModel`**:
```swift
func loadInitial() async {
    // 1. Cache first
    let cacheResult = await CacheCoordinator.shared.notifications.load(for: "all")
    switch cacheResult {
    case .fresh(let cached, _), .stale(let cached, _):
        notifications = cached
        if case .stale = cacheResult { await refreshFromAPI() }
    case .expired, .empty:
        isLoading = notifications.isEmpty
        await refreshFromAPI()
    }
}

private func refreshFromAPI() async {
    do {
        let response = try await NotificationService.shared.list(offset: 0, limit: 30)
        notifications = response.data
        await CacheCoordinator.shared.notifications.save(response.data, for: "all")
    } catch { }
    isLoading = false
}
```

**Behavior**: Opening notifications shows cached list instantly. Background refresh updates silently. No spinner unless first ever open (empty cache).

### 3. New: `CacheCoordinator.stats` (GRDBCacheStore)

**Policy**: `CachePolicy(ttl: .hours(6), staleTTL: .minutes(10), maxItemCount: 10, storageLocation: .grdb)`

**Key**: userId (own stats keyed by current user ID)

**Model**: `UserStats` (already `Decodable` in SDK)

**Integration in `ProfileView`**:
```swift
.task {
    // Cache first
    let userId = authManager.currentUser?.id ?? ""
    let cacheResult = await CacheCoordinator.shared.stats.load(for: userId)
    switch cacheResult {
    case .fresh(let cached, _):
        stats = cached
    case .stale(let cached, _):
        stats = cached
        stats = try? await StatsService.shared.fetchStats()
    case .expired, .empty:
        stats = try? await StatsService.shared.fetchStats()
    }
    // Save to cache
    if let stats {
        await CacheCoordinator.shared.stats.save([stats], for: userId)
    }
}
```

**Integration in `UserStatsView`**: Same pattern — display cache, refresh in background.

### 4. Use existing `.participants` store in ParticipantsView

`ParticipantsView.loadParticipants()` currently calls API directly. Change to:
```swift
private func loadParticipants() async {
    let cacheResult = await CacheCoordinator.shared.participants.load(for: conversationId)
    switch cacheResult {
    case .fresh(let cached, _), .stale(let cached, _):
        participants = cached
        if case .stale = cacheResult { await refreshParticipants() }
    case .expired, .empty:
        isLoading = participants.isEmpty
        await refreshParticipants()
    }
}
```

### 5. Use existing `.feed` store in PostDetailViewModel

`PostDetailViewModel.loadPost()` currently calls API directly. Change to load from `.feed` cache first, then refresh.

### 6. Use existing `.conversations` store in SharePickerView

`SharePickerView.loadConversations()` currently calls API directly. Use `CacheCoordinator.conversations` for instant display.

## New CacheCoordinator Stores

Add to `CacheCoordinator.swift`:

```swift
public let notifications: GRDBCacheStore<String, APINotification>
public let stats: GRDBCacheStore<String, UserStats>
```

In `init()`:
```swift
self.notifications = GRDBCacheStore(policy: .notifications, db: db, namespace: "notif")
self.stats = GRDBCacheStore(policy: .userStats, db: db, namespace: "stats")
```

### New Cache Policies

Add to `CachePolicy.swift`:
```swift
public static let notifications = CachePolicy(
    ttl: .hours(24), staleTTL: .minutes(2), maxItemCount: 200, storageLocation: .grdb
)

// userStats already exists as .userProfiles can be reused, or add:
public static let userStatsPolicy = CachePolicy(
    ttl: .hours(6), staleTTL: .minutes(10), maxItemCount: 10, storageLocation: .grdb
)
```

## CacheIdentifiable Conformance

`APINotification` and `UserStats` must conform to `CacheIdentifiable` (requires `id: String`):

```swift
extension APINotification: CacheIdentifiable {}  // already has id: String
extension UserStats: CacheIdentifiable {
    public var id: String { "current" }  // single user stats
}
```

## Modified Files

| File | Change |
|------|--------|
| `CacheCoordinator.swift` | Add `.notifications` and `.stats` stores |
| `CachePolicy.swift` | Add `.notifications` and `.userStatsPolicy` policies |
| `NotificationListView.swift` (MeeshyUI) | Cache-first pattern in ViewModel |
| `ProfileView.swift` | Cache-first for stats |
| `UserStatsView.swift` | Cache-first for stats + timeline |
| `ParticipantsView.swift` | Use existing `.participants` cache |
| `PostDetailViewModel.swift` | Use existing `.feed` cache |
| `SharePickerView.swift` | Use existing `.conversations` cache |
| `APINotification` model | Add `CacheIdentifiable` conformance |
| `UserStats` model | Add `CacheIdentifiable` conformance |

## Principle (Non-Negotiable)

Every data-loading ViewModel MUST follow this pattern:
1. Check `CacheCoordinator` store FIRST
2. `.fresh` → display, done
3. `.stale` → display immediately + silent background refresh
4. `.expired` / `.empty` → skeleton placeholder (NOT spinner) + API call
5. After API response → save to cache + update UI

No `ProgressView()` when cached data exists. Period.

## Out of Scope

- Affiliate/ShareLinks/TrackingLinks/CommunityLinks cache (lower priority, less frequent)
- Socket.IO events for friendship updates (no events exist yet in gateway)
- Offline queue for friend actions
