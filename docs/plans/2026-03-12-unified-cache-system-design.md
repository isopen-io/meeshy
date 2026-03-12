# Unified Cache System — Design Document

**Date**: 2026-03-12
**Goal**: Remplacer les 6+ cache managers ad-hoc par un systeme de cache unifie L1/L2 avec invalidation socket, TTL configurable par type de donnee, et support media.

**Reviewed by**: iOS Architect Expert — APPROVED WITH CHANGES (all integrated below)

## Principes directeurs

1. **Protocol-oriented** — `ReadableCacheStore` + `MutableCacheStore` (sans Actor constraint)
2. **L1 memory + L2 persistent** — lectures instantanees, persistance across restarts
3. **Socket-driven invalidation** — un `CacheCoordinator` souscrit aux publishers Combine et dispatch les mutations aux stores
4. **Persist-on-dirty** — L2 write uniquement quand L1 a ete mute, debounce 2s avec cap max 10s
5. **Energy-efficient** — zero timer periodique, NSCache auto-purge, `Task.sleep` avec tolerance
6. **BLOB encoding** — mutations en L1 memory, re-persist batch en L2 (pattern Signal/Telegram)
7. **Stale-while-revalidate configurable** — retourne le cache stale + refresh async background
8. **L1 LRU eviction** — max 20 cles en memoire pour GRDBCacheStore, auto-purge NSCache pour DiskCacheStore

## Architecture

```
CachePolicy (config par type de donnee)
    |
ReadableCacheStore<Key, Value> (protocole — lecture + invalidation)
    |
MutableCacheStore<Key, Value> (protocole — extends Readable + save/update)
    |--- GRDBCacheStore (actor, modeles: conversations, messages, participants, profils)
    |--- DiskCacheStore (actor, medias: images, audio, video, thumbnails — ReadableCacheStore only)
    |
CacheCoordinator (actor, injectable)
    |--- Souscrit aux publishers MessageSocketManager / SocialSocketManager
    |--- Dispatch mutations vers les stores concernes
    |--- Flush dirty keys sur willResignActive (protege par beginBackgroundTask)
```

## CachePolicy

```swift
public struct CachePolicy: Sendable {
    public let ttl: TimeInterval
    public let staleTTL: TimeInterval?
    public let maxItemCount: Int?
    public let storageLocation: StorageLocation

    public enum StorageLocation: Sendable {
        case grdb
        case disk(subdir: String, maxBytes: Int)
    }

    public init(ttl: TimeInterval, staleTTL: TimeInterval?, maxItemCount: Int?, storageLocation: StorageLocation) {
        if let stale = staleTTL, stale > ttl {
            // Warning: staleTTL > ttl is invalid, clamping to ttl
            Logger(subsystem: "com.meeshy.sdk", category: "cache-policy")
                .warning("staleTTL (\(stale)s) > ttl (\(ttl)s) — clamping staleTTL to ttl")
            self.staleTTL = ttl
        } else {
            self.staleTTL = staleTTL
        }
        self.ttl = ttl
        self.maxItemCount = maxItemCount
        self.storageLocation = storageLocation
    }
}

// Convenience TimeInterval extensions (internal)
extension TimeInterval {
    static func minutes(_ n: Double) -> TimeInterval { n * 60 }
    static func hours(_ n: Double) -> TimeInterval { n * 3600 }
    static func days(_ n: Double) -> TimeInterval { n * 86400 }
    static func months(_ n: Double) -> TimeInterval { n * 30 * 86400 }
    static func years(_ n: Double) -> TimeInterval { n * 365 * 86400 }
}
```

### Politiques predefinies

| Type | TTL | staleTTL | maxItems | Storage | Justification |
|------|-----|----------|----------|---------|---------------|
| Conversations | 24h | 5min | nil | grdb | Change souvent (unread, last message) |
| Messages | 6 mois | nil | 50/conv | grdb | Rarement edite, socket events pour mutations |
| Participants | 24h | 5min | nil | grdb | Roles/online changent, stale acceptable |
| User Profiles | 1h | 5min | 100 | grdb | Consulte souvent, change rarement |
| Images | 1 an | nil | nil | disk(Images, 300MB) | Immutables une fois uploade |
| Audio | 6 mois | nil | nil | disk(Audio, 200MB) | Voice notes, immutables |
| Video | 6 mois | nil | nil | disk(Video, 500MB) | Immutables |
| Thumbnails | 7j | nil | nil | disk(Thumbnails, 50MB) | Reconstituables, purgeables |

## Cache Protocols (split per architect review C1)

```swift
// Identity protocol for cached items (architect review C2)
public protocol CacheIdentifiable: Sendable {
    var id: String { get }
}

// Read-only cache operations (DiskCacheStore + GRDBCacheStore)
public protocol ReadableCacheStore<Key, Value> {
    associatedtype Key: Hashable & Sendable & CustomStringConvertible
    associatedtype Value: Sendable

    var policy: CachePolicy { get }

    func load(for key: Key) async -> CacheResult<[Value]>
    func invalidate(for key: Key) async
    func invalidateAll() async
}

// Mutable cache operations (GRDBCacheStore only)
public protocol MutableCacheStore<Key, Value>: ReadableCacheStore {
    func save(_ items: [Value], for key: Key) async
    func update(for key: Key, mutate: @Sendable ([Value]) -> [Value]) async
}

// Result with age metadata (architect review I7)
public enum CacheResult<T: Sendable>: Sendable {
    case fresh(T, age: TimeInterval)
    case stale(T, age: TimeInterval)
    case expired
    case empty

    var value: T? {
        switch self {
        case .fresh(let v, _), .stale(let v, _): return v
        case .expired, .empty: return nil
        }
    }
}
```

### Freshness calculation (identique L1 et L2)

```
age = now - timestamp  (L1: loadedAt, L2: lastFetchedAt)

if staleTTL != nil:
    age < staleTTL  → .fresh(items, age)
    age < ttl       → .stale(items, age) — retourne + trigger refresh async
    age >= ttl      → .expired
else:
    age < ttl       → .fresh(items, age)
    age >= ttl      → .expired
```

## GRDBCacheStore — Modeles de donnees

```swift
public actor GRDBCacheStore<Key, Value>: MutableCacheStore
    where Key: Hashable & Sendable & CustomStringConvertible,
          Value: CacheIdentifiable & Codable
{
    public let policy: CachePolicy
    private let db: DatabaseWriter  // Injected — AppDatabase.shared.databaseWriter
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "grdb-cache")
}
```

### Schema SQLite (migration v3)

```sql
-- Supprimer la table normalisee participants (migration directe, app en dev)
DROP TABLE IF EXISTS cached_participants;

CREATE TABLE cache_entries (
    key TEXT NOT NULL,
    itemId TEXT NOT NULL,
    encodedData BLOB NOT NULL,
    updatedAt DATETIME NOT NULL,
    PRIMARY KEY (key, itemId)
);

CREATE INDEX idx_cache_entries_key ON cache_entries(key);

-- cache_metadata conservee telle quelle (v2)
```

### GRDB Record type (architect review M2 — type-safe, not raw SQL)

```swift
struct CacheEntry: Codable, FetchableRecord, PersistableRecord, Sendable {
    static let databaseTableName = "cache_entries"
    var key: String
    var itemId: String
    var encodedData: Data
    var updatedAt: Date
}
```

### Key format

| Type | Key pattern | itemId |
|------|-------------|--------|
| Conversations | `conversations:list` | conversation.id |
| Messages | `messages:{conversationId}` | message.id |
| Participants | `participants:{conversationId}` | participant.id |
| User Profiles | `profiles:users` | user.id |

### L1 Memory Cache with LRU eviction (architect review I4)

```swift
private var memoryCache: [Key: L1Entry] = [:]
private var accessOrder: [Key] = []
private let maxL1Keys = 20  // Max conversation buckets in memory

private struct L1Entry {
    var items: [Value]
    var loadedAt: Date
}

private func touchKey(_ key: Key) {
    accessOrder.removeAll { $0 == key }
    accessOrder.append(key)
    while accessOrder.count > maxL1Keys {
        let evicted = accessOrder.removeFirst()
        memoryCache.removeValue(forKey: evicted)
    }
}
```

### Persist-on-dirty with max delay cap (architect review C4, I2)

```swift
private var dirtyKeys: Set<Key> = []
private var persistTask: Task<Void, Never>?
private var firstDirtyAt: Date?

func update(for key: Key, mutate: @Sendable ([Value]) -> [Value]) async {
    // 1. Muter L1
    if var entry = memoryCache[key] {
        entry.items = mutate(entry.items)
        memoryCache[key] = entry
    }
    // 2. Mark dirty + debounce persist
    markDirty(key)
}

private func markDirty(_ key: Key) {
    dirtyKeys.insert(key)
    if firstDirtyAt == nil { firstDirtyAt = Date() }

    let elapsed = Date().timeIntervalSince(firstDirtyAt ?? Date())
    if elapsed > 10 {
        // Max delay cap reached — flush immediately
        persistTask?.cancel()
        persistTask = Task { await flushDirtyKeys() }
    } else {
        persistTask?.cancel()
        persistTask = Task {
            try? await Task.sleep(for: .seconds(2), tolerance: .seconds(1))
            guard !Task.isCancelled else { return }
            await flushDirtyKeys()
        }
    }
}

func flushDirtyKeys() async {
    let keys = dirtyKeys
    guard !keys.isEmpty else { return }
    firstDirtyAt = nil

    do {
        try db.write { [memoryCache] db in
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let now = Date()

            for key in keys {
                guard let entry = memoryCache[key] else { continue }
                let keyStr = key.description
                let currentIds = entry.items.map(\.id)

                // UPSERT each item (architect review I1)
                for item in entry.items {
                    let encoded = try encoder.encode(item)
                    let record = CacheEntry(key: keyStr, itemId: item.id, encodedData: encoded, updatedAt: now)
                    try record.save(db)  // INSERT OR REPLACE via GRDB
                }

                // Delete items no longer in the array
                if !currentIds.isEmpty {
                    try CacheEntry
                        .filter(Column("key") == keyStr)
                        .filter(!currentIds.contains(Column("itemId")))
                        .deleteAll(db)
                }
            }
        }
        // Only clear on success (architect review C4)
        dirtyKeys.subtract(keys)
    } catch {
        // Keys remain dirty, will be retried on next flush
        logger.error("Flush failed, \(keys.count) keys remain dirty: \(error.localizedDescription)")
    }
}
```

### Load flow

```
load(for: key)
  1. L1 hit → check freshness(loadedAt)
     .fresh → return .fresh(items, age)
     .stale → return .stale(items, age)
     (touchKey for LRU)
  2. L1 miss → read L2 (GRDB cache_entries WHERE key = ?)
     L2 hit → check freshness(cache_metadata.lastFetchedAt)
       .fresh → populate L1, touchKey, return .fresh(items, age)
       .stale → populate L1, touchKey, return .stale(items, age)
       expired → return .expired
     L2 miss → return .empty
```

## DiskCacheStore — Medias (ReadableCacheStore only)

```swift
public actor DiskCacheStore<Key, Value>: ReadableCacheStore
    where Key: Hashable & Sendable & CustomStringConvertible,
          Value: Sendable
{
    public let policy: CachePolicy

    // L1 — NSCache (auto-purged par iOS sous pression memoire)
    private let memoryCache: NSCache<NSString, CacheBox<Value>>

    // L2 — FileManager
    private let baseDirectory: URL

    // Metadata — cache_metadata table (key = "media:{url_hash}")
    private let db: DatabaseWriter

    // In-flight deduplication
    private var inFlightTasks: [String: Task<Value, Error>] = [:]
}
```

### Storage layout

```
~/Application Support/MeeshyMedia/
    Images/        ← TTL 1 an, 300MB max, persistant
    Audio/         ← TTL 6 mois, 200MB max, persistant
    Video/         ← TTL 6 mois, 500MB max, persistant

~/Library/Caches/MeeshyMedia/
    Thumbnails/    ← TTL 7j, 50MB max, iOS-purgeable
```

### Additional public methods (not in ReadableCacheStore)

```swift
// Save media to disk (called after download)
func save(_ data: Data, for key: Key) async

// Direct file URL for AVPlayer (audio/video)
func localFileURL(for key: Key) -> URL?

// Synchronous L1 lookup (no actor hop — static NSCache)
static func cachedValue(for key: Key) -> Value?

// Background prefetch
func prefetch(_ keys: [Key]) async

// Evict expired files (called on memory warning)
func evictExpired() async
```

### Eviction

- **TTL** : fichiers avec `lastFetchedAt + ttl < now` supprimes
- **Budget** : si `totalSize > maxBytes`, supprimer les plus vieux (LRU par `lastFetchedAt`)
- **Trigger** : eviction a chaque `save()` si budget depasse, + sur `didReceiveMemoryWarning`

### File naming

- SHA256 truncated 16 hex chars + extension (architect review M3 — better collision resistance than DJB2)
- Example: `a3b4c5d6e7f8a9b0.jpg`

## CacheCoordinator — Bridge Socket → Cache

Injectable actor (architect review I3) qui connecte les publishers Socket.IO aux stores.

```swift
public actor CacheCoordinator {
    public static let shared = CacheCoordinator()

    // Public access to stores for ViewModels
    public let conversations: GRDBCacheStore<String, MeeshyConversation>
    public let messages: GRDBCacheStore<String, MeeshyMessage>
    public let participants: GRDBCacheStore<String, PaginatedParticipant>
    public let profiles: GRDBCacheStore<String, MeeshyUser>

    public let images: DiskCacheStore<String, Data>
    public let audio: DiskCacheStore<String, Data>
    public let video: DiskCacheStore<String, Data>
    public let thumbnails: DiskCacheStore<String, Data>

    private var cancellables = Set<AnyCancellable>()

    // Injectable for testing (architect review I3)
    init(
        messageSocket: MessageSocketProviding = MessageSocketManager.shared,
        socialSocket: SocialSocketProviding = SocialSocketManager.shared,
        db: DatabaseWriter = AppDatabase.shared.databaseWriter
    ) {
        conversations = GRDBCacheStore(policy: .conversations, db: db)
        messages = GRDBCacheStore(policy: .messages, db: db)
        participants = GRDBCacheStore(policy: .participants, db: db)
        profiles = GRDBCacheStore(policy: .userProfiles, db: db)

        images = DiskCacheStore(policy: .mediaImages, db: db)
        audio = DiskCacheStore(policy: .mediaAudio, db: db)
        video = DiskCacheStore(policy: .mediaVideo, db: db)
        thumbnails = DiskCacheStore(policy: .thumbnails, db: db)

        setupSocketSubscriptions(messageSocket: messageSocket, socialSocket: socialSocket)
        setupLifecycleObservers()
    }
}
```

### Socket subscriptions → cache mutations (architect review I6 — extracted methods)

```swift
private func setupSocketSubscriptions(messageSocket: MessageSocketProviding, socialSocket: SocialSocketProviding) {
    // Messages
    subscribe(messageSocket.messageReceivedPublisher) { [weak self] in await self?.handleNewMessage($0) }
    subscribe(messageSocket.messageEditedPublisher) { [weak self] in await self?.handleMessageEdited($0) }
    subscribe(messageSocket.messageDeletedPublisher) { [weak self] in await self?.handleMessageDeleted($0) }

    // Reactions
    subscribe(messageSocket.reactionAddedPublisher) { [weak self] in await self?.handleReactionAdded($0) }
    subscribe(messageSocket.reactionRemovedPublisher) { [weak self] in await self?.handleReactionRemoved($0) }

    // Participants
    subscribe(messageSocket.participantRoleUpdatedPublisher) { [weak self] in await self?.handleRoleUpdated($0) }
    subscribe(messageSocket.conversationJoinedPublisher) { [weak self] in await self?.handleParticipantJoined($0) }
    subscribe(messageSocket.conversationLeftPublisher) { [weak self] in await self?.handleParticipantLeft($0) }
    subscribe(messageSocket.userStatusChangedPublisher) { [weak self] in await self?.handleUserStatusChanged($0) }

    // Read status
    subscribe(messageSocket.readStatusUpdatedPublisher) { [weak self] in await self?.handleReadStatusUpdated($0) }

    // Conversations
    subscribe(messageSocket.unreadUpdatedPublisher) { [weak self] in await self?.handleUnreadUpdated($0) }

    // Reconnection — invalidate stale caches
    subscribe(messageSocket.didReconnectPublisher) { [weak self] _ in await self?.handleReconnection() }
}

// Generic subscribe helper (architect review I6)
private func subscribe<T>(_ publisher: PassthroughSubject<T, Never>, handler: @escaping @Sendable (T) async -> Void) {
    publisher.sink { value in Task { await handler(value) } }
        .store(in: &cancellables)
}
```

### Handler examples

```swift
private func handleNewMessage(_ msg: APIMessage) async {
    await messages.update(for: msg.conversationId) { existing in
        guard !existing.contains(where: { $0.id == msg.id }) else { return existing }
        return existing + [msg.toMeeshyMessage()]
    }
}

private func handleMessageDeleted(_ event: MessageDeletedEvent) async {
    await messages.update(for: event.conversationId) { existing in
        existing.filter { $0.id != event.messageId }
    }
}

private func handleRoleUpdated(_ event: ParticipantRoleUpdatedEvent) async {
    await participants.update(for: event.conversationId) { existing in
        existing.map { p in
            guard p.userId == event.userId else { return p }
            var updated = p
            updated.conversationRole = event.newRole
            return updated
        }
    }
}

private func handleReconnection() async {
    // Conversations may have changed while disconnected
    await conversations.invalidateAll()
}
```

### Lifecycle observers (architect review C5 — background task protection)

```swift
private func setupLifecycleObservers() {
    // Flush all dirty keys before app goes to background
    NotificationCenter.default.addObserver(
        forName: UIApplication.willResignActiveNotification,
        object: nil, queue: .main
    ) { [weak self] _ in
        guard let self else { return }
        let taskId = UIApplication.shared.beginBackgroundTask()
        Task {
            await self.conversations.flushDirtyKeys()
            await self.messages.flushDirtyKeys()
            await self.participants.flushDirtyKeys()
            await self.profiles.flushDirtyKeys()
            await MainActor.run { UIApplication.shared.endBackgroundTask(taskId) }
        }
    }

    // Evict expired media on memory warning
    NotificationCenter.default.addObserver(
        forName: UIApplication.didReceiveMemoryWarningNotification,
        object: nil, queue: nil
    ) { [weak self] _ in
        guard let self else { return }
        Task {
            await self.images.evictExpired()
            await self.thumbnails.evictExpired()
            await self.audio.evictExpired()
        }
    }
}
```

## Migration depuis systeme actuel

### Suppressions

| Fichier | Action |
|---------|--------|
| `ConversationCacheManager.swift` | Supprimer |
| `MessageCacheManager.swift` | Supprimer |
| `ParticipantCacheManager.swift` | Supprimer |
| `DBCachedParticipant.swift` | Supprimer |
| `UserProfileCacheManager.swift` | Supprimer (remplace par GRDBCacheStore instance) |
| `MediaCacheManager.swift` | Supprimer (remplace par DiskCacheStore instances) |
| `LocalStore.swift` | Supprimer (deja deprecie) |
| `SQLLocalStore.swift` | Supprimer (deja deprecie) |

### Conserves

| Fichier | Raison |
|---------|--------|
| `VideoFrameExtractor.swift` | Cache L1 specialise (20 entries, UIImage). Consomme DiskCacheStore pour fetch video |
| `AudioPlayerManager.swift` | Wrapper AVAudioPlayer. Consomme DiskCacheStore pour fetch audio |
| `PhotoLibraryManager.swift` | Action utilisateur (sauvegarder en phototheque), pas du cache |

### Migration GRDB v3

```sql
-- Migration directe (app en dev, pas de backward compat necessaire)
DROP TABLE IF EXISTS cached_participants;

CREATE TABLE cache_entries (
    key TEXT NOT NULL,
    itemId TEXT NOT NULL,
    encodedData BLOB NOT NULL,
    updatedAt DATETIME NOT NULL,
    PRIMARY KEY (key, itemId)
);
CREATE INDEX idx_cache_entries_key ON cache_entries(key);
```

Les tables v1 (`conversations`, `messages`) restent intactes. Les nouveaux caches utilisent exclusivement `cache_entries`. Les tables v1 seront supprimees dans une migration future une fois le nouveau systeme valide.

### Integration iOS app

Les ViewModels passent de :
```swift
// Avant
let conversations = await ConversationCacheManager.shared.loadConversations()
```
A :
```swift
// Apres
let result = await CacheCoordinator.shared.conversations.load(for: "list")
switch result {
case .fresh(let items, _):
    self.conversations = items
case .stale(let items, _):
    self.conversations = items
    Task { await refreshConversationsFromAPI() }
case .expired, .empty:
    await loadConversationsFromAPI()
}
```

## Testing

- `ReadableCacheStore` / `MutableCacheStore` protocoles → injectable avec mock store en tests
- `GRDBCacheStore` testable avec `DatabaseQueue()` in-memory (pattern existant)
- `DiskCacheStore` testable avec temp directory (`FileManager.default.temporaryDirectory`)
- `CacheCoordinator` testable via init injection (mock socket publishers + in-memory DB)
- `CachePolicy` validation testable (staleTTL > ttl clamping)
- Pattern mock:

```swift
actor MockMutableCacheStore<K: Hashable & Sendable & CustomStringConvertible, V: CacheIdentifiable & Codable>: MutableCacheStore {
    var storage: [K: [V]] = [:]
    let policy: CachePolicy

    func load(for key: K) async -> CacheResult<[V]> {
        guard let items = storage[key] else { return .empty }
        return .fresh(items, age: 0)
    }
    func save(_ items: [V], for key: K) async { storage[key] = items }
    func update(for key: K, mutate: @Sendable ([V]) -> [V]) async {
        storage[key] = mutate(storage[key] ?? [])
    }
    func invalidate(for key: K) async { storage.removeValue(forKey: key) }
    func invalidateAll() async { storage.removeAll() }
}
```

## Non-goals (hors scope)

- Encryption du cache (a faire separement si besoin)
- Sync multi-device (pas de conflit resolution)
- Cache pour les appels video/WebRTC (temps reel pur)
- Migration des donnees existantes v1 tables → cache_entries (les anciennes tables restent, seront nettoyees plus tard)
- Cache pour le social feed (posts, stories, comments) — a ajouter dans un second temps avec le meme systeme
