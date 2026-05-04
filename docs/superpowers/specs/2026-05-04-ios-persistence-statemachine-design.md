# iOS Persistence Layer + Message State Machine — Refonte complète

**Date**: 2026-05-04
**Scope**: Refonte complète (big-bang, sprint dédié) de la couche persistence messages + state machine iOS
**Target**: Swift 6.2, iOS 18+, GRDB DatabasePool WAL mode
**Approach**: Actor-Isolated Persistence + Formal State Machine (Approche C)

## Motivation

L'audit de l'architecture messaging iOS a révélé 8 problèmes critiques :

1. **Dirty flush debounce 2-10s** — risque de perte de données si crash/background
2. **Pas de persistence avant envoi REST** — message optimiste en mémoire seule
3. **Delivery status updates non-persistés** — status perdu au cold-start
4. **Offline queue non-chiffrée** — corps des messages en clair dans Documents/
5. **Media non snapshottés avant upload** — photo disparaît si upload échoue
6. **Pas de gap detection au reconnect** — messages manqués pendant déconnexion
7. **`pendingServerIds` en mémoire seule** — mapping perdu au deinit ViewModel, duplicatas
8. **Pas de retry automatique** — messages .failed nécessitent tap manuel

La refonte résout tous ces problèmes en une seule itération, en appliquant les patterns SOTA (state-of-the-art) des apps de messagerie performantes (Telegram, Signal).

## Recherche SOTA appliquée

| Technique | Source | Application |
|-----------|--------|-------------|
| DatabasePool WAL mode | GRDB docs, SQLite WAL internals | Zero-contention reads (10 readers) + 1 writer |
| ValueObservation | GRDB, Stream Chat SDK | Push automatique DB → SwiftUI, remplace Combine manual |
| Pre-computed bubble layout | Telegram (AsyncDisplayKit) | Layout off-main-thread, stocké en DB, zero mesure SwiftUI |
| Windowed LazyVStack | Stream Chat, iOS 18 ScrollView APIs | 200 messages max en mémoire, pagination transparente |
| Equatable views + drawingGroup | Airbnb SwiftUI research | Skip re-renders + Metal rendering |
| mmap + CGImageSource | Telegram, Apple docs | Thumbnails sans heap allocation |
| Batched writes 16ms | Telegram MTProto pattern | 1 transaction GRDB pour N messages socket |
| Actor isolation | Swift 6.2 SE-0466 | Zero race condition, zero lock manual |

---

## Section 1 : MessageStateMachine — Transitions formelles

### Principe

Type pur (Sendable, zero dépendance) qui encapsule l'état d'un message et force le passage par des transitions validées. Impossible de construire un état invalide.

### MessageState enum

```swift
public enum MessageState: String, Codable, Sendable {
    case draft          // Composé, pas encore envoyé (scheduled messages)
    case queued         // Dans l'offline queue, en attente de réseau
    case sending        // Envoi en cours (optimistic visible)
    case sent           // Serveur ACK (single check)
    case delivered      // Destinataire(s) reçu (double check gris)
    case read           // Destinataire(s) lu (double check bleu)
    case failed         // Échec définitif (après retries épuisés)
}
```

### MessageEvent enum

```swift
public enum MessageEvent: Sendable {
    case enqueue
    case startSending
    case serverAck(serverId: String, at: Date)
    case delivered(count: Int, at: Date)
    case readBy(userId: String, at: Date)
    case sendFailed(Error)
    case retry
    case retryExhausted
}
```

### MessageStateMachine struct

```swift
public struct MessageStateMachine: Sendable {
    public private(set) var state: MessageState
    public private(set) var retryCount: Int = 0
    public private(set) var serverId: String?
    public private(set) var lastError: String?
    public private(set) var deliveredAt: Date?
    public private(set) var readAt: Date?

    public static let maxRetries = 3

    /// Tente une transition — retourne le nouvel état ou nil si transition invalide
    public mutating func apply(_ event: MessageEvent) -> MessageState? {
        switch (state, event) {
        case (.draft, .enqueue), (.draft, .startSending):
            state = .queued

        case (.queued, .startSending):
            state = .sending

        case (.sending, .serverAck(let id, _)):
            serverId = id
            state = .sent

        case (.sent, .delivered(let count, let at)) where count > 0:
            deliveredAt = at
            state = .delivered

        case (.delivered, .readBy(_, let at)):
            readAt = at
            state = .read

        case (.sent, .readBy(_, let at)):
            // Skip delivered, go straight to read
            readAt = at
            state = .read

        case (.sending, .sendFailed(let error)):
            lastError = error.localizedDescription
            if retryCount < Self.maxRetries {
                retryCount += 1
                state = .queued
            } else {
                state = .failed
            }

        case (.failed, .retry):
            retryCount = 0
            state = .queued

        case (.queued, .retryExhausted):
            state = .failed

        default:
            return nil
        }
        return state
    }
}
```

### Transition rules

1. **Monotone** pour delivery : sending -> sent -> delivered -> read (jamais de retour)
2. **Skip autorisé** : sent -> read directement (si read arrive avant delivered)
3. **Retry loop** : sending -> queued -> sending... (max 3 tentatives) -> failed
4. **Manual retry** : failed -> queued uniquement sur action user explicite
5. **`apply()` retourne `nil`** pour transitions invalides — caller ignore silencieusement

---

## Section 2 : MessagePersistenceActor — Write-through isolé

### Principe

Swift Actor encapsulant TOUTES les écritures GRDB. Write-through (persist AVANT de retourner), DatabasePool WAL mode pour lectures concurrentes zero-contention.

### MessageRecord (GRDB)

```swift
struct MessageRecord: Codable, FetchableRecord, PersistableRecord, Sendable, Equatable {
    static let databaseTableName = "messages"

    var localId: String              // PK : temp_<uuid> ou server ID
    var serverId: String?
    var conversationId: String
    var senderId: String
    var content: String?
    var contentType: String          // text, image, audio, video, file
    var state: MessageState
    var retryCount: Int
    var lastError: String?
    var encryptedPayload: Data?
    var attachmentManifest: Data?    // JSON [LocalAttachment]
    var createdAt: Date
    var sentAt: Date?
    var deliveredAt: Date?
    var readAt: Date?
    var updatedAt: Date
    var cachedBubbleWidth: Double?   // Pre-computed layout
    var cachedBubbleHeight: Double?
    var layoutVersion: Int
}
```

### PendingIdRecord (GRDB)

```swift
struct PendingIdRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    static let databaseTableName = "pending_ids"

    var localId: String              // PK
    var serverId: String
    var conversationId: String
    var reconciledAt: Date?
}
```

### Actor

```swift
public actor MessagePersistenceActor {
    private let dbPool: DatabasePool

    init(databasePath: String, encryptionKey: Data) throws {
        var config = Configuration()
        config.maximumReaderCount = 10
        config.prepareDatabase { db in
            try db.usePassphrase(encryptionKey)
            try db.execute(sql: "PRAGMA synchronous = NORMAL")
            try db.execute(sql: "PRAGMA journal_size_limit = 16777216")
        }
        self.dbPool = try DatabasePool(path: databasePath, configuration: config)
        try migrate()
    }
```

### Key methods

- **`insertOptimistic(_ record)`** — GRDB write immédiat, appelé AVANT l'envoi REST
- **`applyEvent(localId, event)`** — lit le record, applique la state machine, persiste atomiquement dans une seule transaction GRDB, retourne le nouvel état ou nil
- **`applyBatchDeliveryUpdate(conversationId, upToMessageId, event)`** — batch update dans une seule transaction, pour quand 50 messages sont lus d'un coup
- **`reconcileIncoming(serverMessage, existingLocalId)`** — réconcilie un message socket entrant avec un optimiste existant ou insère un nouveau
- **`messages(for conversationId, before, limit)`** — lecture paginée
- **`resolveServerId(for localId)`** — lookup dans pending_ids
- **`computeLayout(for record, maxWidth)`** — pre-compute bubble size off-main-thread
- **`bufferIncoming(_ message)`** — batched writes 16ms pour les rafales socket

### nonisolated reader access

```swift
nonisolated func reader() -> DatabasePool { dbPool }
```

Les ValueObservation du MessageStore utilisent ce reader — lectures concurrentes, zero contention avec l'actor writer.

### Database migrations

- Table `messages` : localId PK, indexes sur (conversationId, createdAt), (serverId), (state)
- Table `pending_ids` : localId PK, index sur (serverId)
- Table `local_attachments` : localId PK, index sur (messageLocalId)

### Batched writes (16ms)

Quand plusieurs messages arrivent en rafale (reconnexion socket), ils sont bufferisés pendant 16ms (1 frame) puis écrits dans une seule transaction GRDB. ValueObservation se déclenche une seule fois pour le batch entier.

---

## Section 3 : MessageStore — Couche de lecture observable

### Principe

`@Observable` MainActor qui maintient un tableau en mémoire synchronisé avec GRDB via `ValueObservation`. Windowed (200 messages max), diffing Equatable, sections par date.

### Backing store

`OrderedDictionary<String, MessageRecord>` pour :
- O(1) lookup par localId
- O(1) update in-place par clé
- Itération ordonnée pour ForEach

### ValueObservation (remplace PassthroughSubject)

```swift
func startObserving(dbPool: DatabasePool, conversationId: String) {
    let observation = ValueObservation.tracking { db in
        try MessageRecord
            .filter(Column("conversationId") == conversationId)
            .order(Column("createdAt").asc)
            .limit(200)
            .fetchAll(db)
    }

    observationCancellable = observation.start(
        in: dbPool,
        scheduling: .async(onQueue: .main),
        onError: { _ in },
        onChange: { [weak self] records in
            self?.applyDiff(records)
        }
    )
}
```

### Windowed loading

- `windowSize = 200` messages max en mémoire
- `prefetchThreshold = 30` — charge plus quand il reste 30 messages avant le bord
- `onApproachingTop()` — prepend older messages, trim bottom si > windowSize
- `onApproachingBottom()` — append newer messages, trim top si > windowSize
- Pagination transparente pour l'utilisateur

### Computed projections

- `sections: [MessageSection]` — messages groupés par jour, invalidés sur mutation
- `pendingCount: Int` — messages en .sending/.queued
- `lastInsertedId: String?` — pour scroll-to-bottom

---

## Section 4A : RetryEngine — Retry automatique

### Principe

Actor qui surveille les messages en `.queued`, retry avec backoff exponentiel, respect du réseau et de l'ordre FIFO.

### Backoff

```
retryCount=0 -> wait 1s  -> retry
retryCount=1 -> wait 3s  -> retry
retryCount=2 -> wait 9s  -> retry (dernier)
retryCount=3 -> .failed definitif (UI: "Tap to retry")
```

### Comportement

- **FIFO** : messages retried dans l'ordre chronologique par conversation
- **Network-aware** : attend la connectivité avant de retry
- **Manual retry** : `.failed -> .queued` avec retryCount reset à 0
- **Cycle** : vérifie toutes les 2-5s s'il y a des messages à retry
- **Lifecycle** : start() au app launch, stop() au shutdown

### Protocol

```swift
public protocol MessageSending: Sendable {
    func send(conversationId: String, content: String?, contentType: String,
              encryptedPayload: Data?, attachments: Data?) async throws -> SendMessageResponse
}
```

---

## Section 4B : ReconnectionGapDetector — Sync des messages manqués

### Principe

Au reconnect socket, détecte les messages reçus pendant l'absence et fetch le delta via REST.

### Mécanisme

1. Track `lastReceivedTimestamps: [conversationId: Date]` pour chaque conversation active
2. Au socket reconnect (`on(.connect)`) :
   - Pour chaque conversation active : compare lastLocal vs serveur
   - Fetch les messages après lastLocal (limit 100)
   - Dedup par serverId (évite les doublons avec ce qui était déjà en cache)
   - Persist via `persistence.reconcileIncoming()`
3. Sync aussi les previews des conversations NON-ouvertes (juste lastMessage + unreadCount)

### Persistance des timestamps

Stockés dans UserDefaults (pas critique — fallback sur GRDB si absent). Restaurés au init.

### Scénarios

| Scénario | Comportement |
|----------|-------------|
| Tunnel 30s | Reconnect -> fetch delta -> messages apparaissent sans reload |
| Mode avion 2h | Reconnect -> fetch jusqu'à 100 messages manqués par conversation |
| App killed + relancée | loadInitial() charge GRDB -> stale-while-revalidate via REST |
| Background push | Gap detector sync au applicationDidBecomeActive |
| Socket flap | syncGap est idempotent (dedup par serverId) |

---

## Section 5A : MediaSnapshotStore — Persistence média avant upload

### Principe

Snapshot local du média AVANT upload. L'utilisateur voit sa photo/vidéo immédiatement dans le chat, même si l'upload prend 30s ou échoue.

### LocalAttachment

```swift
struct LocalAttachment: Codable, Sendable {
    let localId: String           // temp_attachment_<uuid>
    let messageLocalId: String
    let type: AttachmentType      // image, video, audio, file
    let mimeType: String
    let fileName: String
    let fileSize: Int64
    let localPath: String         // Relatif dans snapshot dir
    let thumbnailPath: String?
    let dimensions: CGSize?
    let duration: TimeInterval?
    let createdAt: Date
    var remoteUrl: String?
    var uploadProgress: Double?
    var uploadState: UploadState   // pending, uploading, completed, failed
}
```

### Flow outbound (envoi photo)

1. User sélectionne photo
2. `createSnapshot()` -> copie fichier, génère thumbnail 300x300, persist GRDB
3. `insertOptimistic()` -> message avec attachmentManifest
4. UI affiche thumbnail LOCAL (zero latence réseau)
5. Upload en background -> `updateProgress()` -> UI barre de progression
6. Upload terminé -> `markUploadCompleted(remoteUrl)` -> REST POST avec URL
7. 24h plus tard -> `pruneCompleted()` supprime snapshot local

### Cleanup

`pruneCompleted(olderThan: 86400)` — supprime snapshots dont l'upload est completé depuis > 24h. Le CDN est la source de vérité.

---

## Section 5B : ThumbnailPrefetcher — Prefetch entrants

### Principe

Prefetch des thumbnails des messages entrants en background. Quand l'utilisateur scrolle, le thumbnail est déjà en cache.

### Techniques SOTA

- **mmap** : `Data(contentsOf: url, options: .mappedIfSafe)` — le kernel page-in seulement ce qui est nécessaire
- **CGImageSource** : downsample au display size exact, pas de décodage full-res en heap
- **Max concurrency** : 4 downloads simultanés max

### Flow inbound (réception photo)

1. Socket `message:new` avec attachment { thumbnailUrl, url }
2. `reconcileIncoming()` -> persist message avec dimensions connues
3. `ThumbnailPrefetcher.prefetch()` -> download background
4. UI affiche placeholder avec dimensions (pas de reflow)
5. Thumbnail arrive (~200ms) -> DiskCacheStore.store()
6. Vue observe le cache -> thumbnail apparaît avec fade-in
7. User tap full-screen -> download full-res à la demande

---

## Section 6 : Orchestration

### Dependency graph

```
App Singleton Layer:
  DependencyContainer
    -> DatabasePool (WAL, 1 writer + 10 readers, chiffré)
    -> MessagePersistenceActor (owns all message writes)
    -> MediaSnapshotStore (owns attachment writes + files)
    -> RetryEngine (watches .queued, auto-retry with backoff)
    -> ReconnectionGapDetector (delta sync on reconnect)
    -> ThumbnailPrefetcher (background media prefetch)
    -> MessageSocketManager (Socket.IO connection)
    -> NetworkMonitor

Per-Conversation Layer:
  ConversationViewModel (orchestrates, no business logic)
    -> MessageStore (@Observable, ValueObservation, windowed 200)
    -> ConversationSocketHandler (Combine subs -> Actor writes)
    -> MediaAttachmentCoordinator (upload + progress)

SwiftUI View Layer:
  ConversationView
    -> LazyVStack (windowed)
    -> ForEach(store.sections) -> MessageBubble (Equatable, drawingGroup)
    -> DeliveryIndicator (animated: clock -> check -> double-check -> blue)
    -> TypingIndicator
    -> iOS 18 ScrollPosition + onScrollTargetVisibilityChange
```

### DependencyContainer

Créé une fois au app launch. Pas de framework DI — simple class avec lazy init. Factory method `makeConversationViewModel(conversationId:)` pour créer les ViewModels.

### ConversationViewModel refactoré

Le ViewModel est un **orchestrateur pur** :
- Ne contient aucune logique métier
- Délègue tout aux composants spécialisés
- Plus de `@Published var messages: [Message]` -> remplacé par `store.messages`
- Plus de `pendingServerIds` en mémoire -> persisté dans GRDB `pending_ids`

### Key methods

- **`onAppear()`** : store.startObserving() + store.loadInitial() + armSocketHandler() + gapDetector.activate() + markAsRead()
- **`onDisappear()`** : socketHandler.disarm() + store.stopObserving() + gapDetector.deactivate()
- **`send(text:)`** : computeLayout -> insertOptimistic -> encrypt -> REST -> applyEvent(.serverAck)
- **`send(text:, attachments:)`** : createSnapshot per media -> insertOptimistic -> uploadAll -> REST
- **`onVisibleMessagesChanged(_:)`** : pagination prefetch + markAsRead tracking
- **`retryMessage(localId:)`** : retryEngine.manualRetry()

### ConversationSocketHandler refactoré

Ne touche plus le ViewModel directement. Écrit dans l'Actor, ValueObservation propage automatiquement.

- `message:new` -> dedup -> persistence.reconcileIncoming() -> thumbnailPrefetcher.prefetch()
- `read-status:updated` -> persistence.applyBatchDeliveryUpdate()
- `typing:start/stop` -> local state, callback vers ViewModel
- `message:edited/deleted` -> persistence update

### Lifecycle complet

```
APP LAUNCH:
  DependencyContainer init -> DatabasePool -> migrations -> RetryEngine.start()

USER OPENS CONVERSATION:
  store.startObserving() -> ValueObservation reads GRDB (instant)
  -> UI renders cached messages (0ms latency)
  -> socketHandler.arm() -> conversation:join
  -> gapDetector.activate() -> fetch missed -> persist -> UI updated

USER SENDS MESSAGE:
  persistence.insertOptimistic() -> ValueObservation -> UI shows clock
  -> REST POST -> persistence.applyEvent(.serverAck) -> UI shows check
  -> Socket read-status -> persistence.applyEvent(.delivered) -> UI shows double-check
  -> persistence.applyEvent(.readBy) -> UI shows blue double-check

INCOMING MESSAGE:
  Socket message:new -> socketHandler -> persistence.reconcileIncoming()
  -> ValueObservation -> store updated -> UI renders bubble
  -> thumbnailPrefetcher.prefetch() (background)
  -> markAsRead() (fire & forget)

APP BACKGROUND:
  All data already persisted (write-through, no flush needed)
  Socket stays connected ~30s (iOS grace period)
  RetryEngine pauses

APP FOREGROUND:
  Socket reconnects -> gapDetector.onReconnected()
  -> fetch missed messages -> persist -> ValueObservation -> UI
  RetryEngine resumes
```

### SwiftUI View (iOS 18+)

```swift
struct ConversationView: View {
    @State var viewModel: ConversationViewModel
    @State private var scrollPosition = ScrollPosition()

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.store.sections, id: \.date) { section in
                    DateSeparator(date: section.date)
                    ForEach(section.messageIds, id: \.self) { id in
                        if let record = viewModel.store.message(for: id) {
                            MessageBubble(/* primitive values from record */)
                                .equatable()
                                .id(id)
                        }
                    }
                }
                if !viewModel.typingUsernames.isEmpty {
                    TypingIndicator(usernames: viewModel.typingUsernames)
                }
            }
        }
        .scrollPosition($scrollPosition)
        .onScrollTargetVisibilityChange(idType: String.self) { ids in
            viewModel.onVisibleMessagesChanged(ids)
        }
        .task { await viewModel.onAppear() }
        .onDisappear { viewModel.onDisappear() }
    }
}
```

### DeliveryIndicator animations

```swift
struct DeliveryIndicator: View, Equatable {
    let state: MessageState
    let timestamp: Date

    var body: some View {
        HStack(spacing: 4) {
            Text(timestamp, style: .time).font(.caption2).foregroundStyle(.secondary)
            Group {
                switch state {
                case .sending, .queued:  Image(systemName: "clock")
                case .sent:              Image(systemName: "checkmark")
                case .delivered:         HStack(spacing: -4) { Image(systemName: "checkmark"); Image(systemName: "checkmark") }
                case .read:              HStack(spacing: -4) { Image(systemName: "checkmark"); Image(systemName: "checkmark") }.foregroundStyle(.blue)
                case .failed:            Image(systemName: "exclamationmark.circle").foregroundStyle(.red)
                case .draft:             EmptyView()
                }
            }
            .font(.caption2)
            .transition(.scale.combined(with: .opacity))
            .animation(.snappy(duration: 0.25), value: state)
        }
    }
}
```

### Error model

```swift
enum ConversationError: Equatable {
    case persistenceFailed(String)
    case mediaSnapshotFailed(String)
    case encryptionFailed
    case networkUnavailable
    case serverError(Int, String)

    var isRetryable: Bool { ... }
    var userMessage: String { ... }
}
```

---

## Section 7 : Tests

### Test pyramid

| Niveau | Count | Framework | Speed |
|--------|-------|-----------|-------|
| Unit (StateMachine, Layout, Dedup) | ~40 | XCTest | < 1s each |
| Unit Actor (Persistence, Retry, Gap, Media) | ~25 | XCTest + in-memory GRDB | < 2s each |
| Integration (Actor -> Store -> ValueObs pipeline) | ~15 | XCTest + temp DatabasePool | < 5s each |
| E2E (Send -> receive -> display) | 2-3 | XCUITest | ~30s each |

### MessageStateMachine tests

Pure function tests — the fastest and most numerous :
- Happy path : sending -> sent -> delivered -> read
- Skip transitions : sent -> read (skipping delivered)
- Retry logic : sending -> queued (x3) -> failed
- Manual retry : failed -> queued (retryCount reset)
- Invalid transitions : all return nil, state unchanged
- Monotonicity : state never goes backward through full lifecycle
- Error capture : sendFailed captures error description

### MessagePersistenceActor tests

With in-memory DatabasePool :
- insertOptimistic persists immediately
- applyEvent updates state and persists serverId atomically
- Invalid transitions return nil, preserve state
- Nonexistent localId returns nil
- Batch delivery update updates all eligible, leaves higher states unchanged
- Reconcile incoming merges with existing optimistic (no duplicates)
- Reconcile incoming without existing inserts new
- 100 concurrent writes don't corrupt database

### BubbleLayoutCalculator tests

- Short text fits single line
- Long text wraps multiple lines
- Image respects aspect ratio
- Nil dimensions returns fallback size
- Empty content returns minimum size

### RetryEngine tests

- Queued message retried automatically on network available
- Respects network unavailability (never sends when offline)
- Manual retry resets count and requeues
- FIFO order preserved across retries

### MediaSnapshotStore tests

- createSnapshot copies file and generates thumbnail
- Upload progress tracked correctly
- pruneCompleted removes old files and DB records

### Integration tests

- Full send lifecycle : state transitions reflected in store via ValueObservation
- Incoming + dedup : optimistic + socket broadcast = exactly 1 message
- Batch update 50 messages completes under 100ms
- Windowed loading limits memory footprint to windowSize
- Messages survive store recreation (persistence verified)

### Critical scenarios

| # | Scenario | Verifies |
|---|----------|----------|
| 1 | Send offline -> app kill -> relaunch -> network back | Queued message survives crash, auto-retry |
| 2 | Send photo -> upload 50% -> app background -> foreground | Upload resumes, progress preserved |
| 3 | 100 messages received in 50ms (reconnection) | Batch write < 100ms, 1 re-render |
| 4 | 10k message conversation -> rapid scroll up | Windowing, no OOM, FPS > 55 |
| 5 | Send -> REST ACK -> socket broadcast (same message) | Exactly 1 message, no duplicate |
| 6 | Send -> REST timeout -> retry -> success | sending -> queued -> sending -> sent |
| 7 | 2 users read simultaneously -> batch read-status | Batch update, 1 GRDB transaction |
| 8 | App background 2h -> foreground -> gap sync | Missed messages fetched and displayed |
| 9 | Typing start -> 15s timeout -> auto typing stop | Safety timer works |
| 10 | GRDB encrypted -> logout -> login other user | Old DB inaccessible, new DB clean |

### Protocols for injection

Every dependency testable via protocol :

```swift
protocol MessagePersisting: Actor
protocol MessageSending: Sendable
protocol NetworkMonitorProviding: Sendable
protocol MediaSnapshotting: Actor
protocol ThumbnailPrefetching: Actor
```

Each has a `Mock*` in the test target with :
- Configurable `Result<T, Error>` per method
- Call count tracking
- Argument capture

---

## Files to create/modify

### New files (MeeshySDK)

| File | Component |
|------|-----------|
| `MeeshySDK/Models/MessageState.swift` | MessageState enum + MessageEvent enum |
| `MeeshySDK/Models/MessageStateMachine.swift` | Pure state machine struct |
| `MeeshySDK/Persistence/MessagePersistenceActor.swift` | Actor + GRDB write-through |
| `MeeshySDK/Persistence/MessageRecord.swift` | GRDB record + PendingIdRecord |
| `MeeshySDK/Persistence/MessageDatabaseMigrations.swift` | GRDB migrations |
| `MeeshySDK/Persistence/BubbleLayoutCalculator.swift` | Pre-computed layout |
| `MeeshySDK/Persistence/RetryEngine.swift` | Auto-retry actor |
| `MeeshySDK/Persistence/ReconnectionGapDetector.swift` | Gap sync actor |
| `MeeshySDK/Persistence/MediaSnapshotStore.swift` | Media snapshot actor |
| `MeeshySDK/Persistence/ThumbnailPrefetcher.swift` | mmap + CGImageSource |

### New files (App layer)

| File | Component |
|------|-----------|
| `Meeshy/Core/DependencyContainer.swift` | Root DI container |
| `Meeshy/Features/Main/Stores/MessageStore.swift` | @Observable + ValueObservation |
| `Meeshy/Features/Main/Coordinators/MediaAttachmentCoordinator.swift` | Upload orchestration |

### Modified files

| File | Changes |
|------|---------|
| `ConversationViewModel.swift` | Strip to orchestrator, delegate to Store/Actor |
| `ConversationSocketHandler.swift` | Write to Actor instead of ViewModel |
| `MeeshyApp.swift` | Init DependencyContainer at launch |
| `ConversationView.swift` | Use store.messages, iOS 18 ScrollPosition |

### Removed/replaced

| File | Reason |
|------|--------|
| `GRDBCacheStore.swift` message methods | Replaced by MessagePersistenceActor |
| `CacheCoordinator.swift` message methods | Replaced by MessageStore + ValueObservation |
| Dirty-tracking debounce logic | Replaced by write-through |
| In-memory `pendingServerIds` dict | Replaced by GRDB `pending_ids` table |

### Test files

| File | Tests |
|------|-------|
| `MeeshySDKTests/MessageStateMachineTests.swift` | ~15 tests |
| `MeeshySDKTests/BubbleLayoutCalculatorTests.swift` | ~5 tests |
| `MeeshySDKTests/MessagePersistenceActorTests.swift` | ~10 tests |
| `MeeshySDKTests/RetryEngineTests.swift` | ~5 tests |
| `MeeshySDKTests/MediaSnapshotStoreTests.swift` | ~5 tests |
| `MeeshyTests/Integration/MessagePipelineIntegrationTests.swift` | ~10 tests |
