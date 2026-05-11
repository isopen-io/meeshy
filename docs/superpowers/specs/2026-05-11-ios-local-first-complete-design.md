# iOS Local-First Complete — Architecture & Design

**Date :** 2026-05-11
**Scope :** apps/ios + packages/MeeshySDK + services/gateway + packages/shared (Prisma)
**Hors scope :** apps/web (Next.js), WebRTC live streams, refonte schema MongoDB
**Audit source :** `docs/audit-cache-ios-2026-05-11.md`
**Approche retenue :** Hybride A+B (étendre l'existant en Vague 1, SyncEngine centralisé en Vague 2)
**Effort estimé :** 13 sprints (~13 semaines × 2 ingénieurs)

---

## Table des matières

1. [Contexte & motivation](#1-contexte--motivation)
2. [Architecture cible](#2-architecture-cible)
3. [Phasage global](#3-phasage-global)
4. [Vague 1 — Compléter & durcir l'existant (S1-S4)](#4-vague-1--compléter--durcir-lexistant-s1-s4)
5. [Vague 2 — SyncEngine centralisé (S5-S12)](#5-vague-2--syncengine-centralisé-s5-s12)
6. [Sprint 13 — Buffer & stabilisation](#6-sprint-13--buffer--stabilisation)
7. [Protocole `/sync`](#7-protocole-sync)
8. [Stratégie de tests](#8-stratégie-de-tests)
9. [Risques & mitigation](#9-risques--mitigation)
10. [Acceptance criteria globaux](#10-acceptance-criteria-globaux)
11. [Decision points (à valider en cours)](#11-decision-points-à-valider-en-cours)
12. [Référence : 8 brèches structurelles identifiées](#12-référence--8-brèches-structurelles-identifiées)

---

## 1. Contexte & motivation

L'audit `docs/audit-cache-ios-2026-05-11.md` identifie 8 brèches structurelles bloquant le "vrai local-first" iOS :

1. Couverture cache à ~54 % (Communities 0 %, Notifications 0 %, Calls 0 %, Drafts 0 %, Search 37 %, Settings 25 %)
2. `staleTTL` court (2-10 min) → spinner réseau inévitable au-delà
3. 7+ usages de `CacheResult.value` qui masquent `.stale` (pas de SWR)
4. Dédup gateway absente : pas de `@@unique(conversationId, clientMessageId)`, pas de `catch P2002`
5. 14 actions write *online-only* (block, friend req, profile, settings, post, like, comment...)
6. Gateway : 1 seul endpoint sur 30 supporte `?since=`, aucun event Socket.IO n'a de sequence number
7. Encryption fallback silencieux (plaintext si erreur) sur stores sensibles
8. `OfflineQueue.enqueue()` async non-throws → erreurs avalées par `try?`

**Score actuel :** 5.5/10. **Cible :** 9/10 (Instant App Principles + sync delta intelligent).

---

## 2. Architecture cible

```
┌─────────────────────────────────────────────────────────┐
│                ViewModels (consumers)                   │
│     observe(collection: .messages, conversationId)      │
└────────────────────────┬────────────────────────────────┘
                         │ AsyncStream<Delta<T>>
                         ▼
┌─────────────────────────────────────────────────────────┐
│              SyncEngine (actor singleton)                │
│  - checkpoints[collection] = (lastSyncedAt, lastSeq)     │
│  - mutations queue (extends OfflineQueue, all writes)    │
│  - conflict resolver (last-write-wins + custom)          │
│  - gap detection (sequenceNumber)                        │
└───────────┬────────────────────────┬────────────────────┘
            │                        │
            ▼                        ▼
   CacheCoordinator             Network layer
   (27 stores, GRDB+Disk)       /api/v1/sync?since=&seq=
            │                   Socket.IO + seqNumber
            ▼                        ▼
       SQLite (encrypted)        Gateway sync route
```

### Composants

- **`SyncEngine`** (actor singleton iOS) : orchestre TOUT le sync. Expose `observe(_:)`, `syncNow(_:)`, `enqueueMutation(_:)`.
- **`CacheCoordinator`** (actor existant, conservé) : couche persistence passive pilotée par `SyncEngine`. 27 stores typés GRDB + Disk inchangés.
- **`OutboxFlusher`** (existant, étendu) : exécute les mutations en attente. Vague 2 = même table `outbox`, nouveaux `OutboxKind`.
- **`/api/v1/sync`** (nouveau gateway) : endpoint unifié `?since=&collections=&seq=&cursor=` pour cold start / reconnect / gap recovery.
- **Socket.IO `_seq`** : chaque event émis enrichi d'un sequence number user-scoped pour gap detection.

### Principes directeurs

1. **Cache-first 100 %** : aucun écran data-driven n'affiche de spinner sur cache chaud
2. **Push-driven invalidation** : `staleTTL = .infinity` + Socket.IO push (au lieu de TTL-based revalidation)
3. **Write-anywhere idempotent** : toutes les actions write passent par l'outbox iOS + dédup gateway (`clientMutationId`)
4. **Gap-aware** : reconnect après offline → SyncEngine détecte les events ratés et resync delta
5. **Backward compatible** : cohabitation `CacheFirstLoader` ↔ `SyncEngine` via feature flag par collection pendant la migration

---

## 3. Phasage global

| Sprint | Vague | Thème | Livrable | Risque |
|--------|-------|-------|----------|--------|
| S1 | 1 | Fix 3 faiblesses arch | Encryption strict, dirty race fix, gateway `@@unique` + P2002, ACK socket clientMessageId | M |
| S2 | 1 | Couverture | Communities, Notifications, Calls, Drafts cache-first | L |
| S3 | 1 | Offline writes | 14 nouveaux `OutboxKind`, `MutationLog` gateway, fusion 3 queues → 1 | M |
| S4 | 1 | UX local-first | Migration `.value` → switch, skeletons, badge offline, banner sync, retry button, optimistic + rollback | M |
| S5 | 2 | Backend sync | `/api/v1/sync` endpoint, `_seq` sur 53 events, indexes Prisma `updatedAt` | M |
| S6 | 2 | iOS SyncEngine | `SyncEngine` actor + checkpoints GRDB + protocol `Syncable` | M |
| S7-S8 | 2 | Migration VMs ① | ConversationList, Conversation, UserProfile, Contacts, Requests, Blocked | M |
| S9-S10 | 2 | Migration VMs ② | Feed, Bookmarks, Story, Status, PostDetail, CommunityList, CommunityDetail, NotificationList, CallHistory, GlobalSearch | M |
| S11 | 2 | Resolver + gap | Conflict resolver pluggable, gap recovery, mutation replay | M |
| S12 | 2 | Perf + E2E | MetricKit signposts, tests E2E load, tuning final | L |
| S13 | Buffer | Stabilisation | Bugs feedback prod, observabilité finale, retrait `CacheFirstLoader` deprecated | L |

---

## 4. Vague 1 — Compléter & durcir l'existant (S1-S4)

### 4.1 Sprint 1 — Fix 3 faiblesses architecturales

#### 4.1.1 Encryption fallback strict

**Fichier :** `packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheStore.swift`
**Lignes actuelles :** 278, 315, 409

**État actuel :**
```swift
let data = DatabaseEncryption.shared.encrypt(json, encrypted: encrypted) ?? json
```
→ Silent plaintext fallback : brèche sécurité.

**Cible :**
```swift
let data: Data
if encrypted {
    guard let encryptedData = DatabaseEncryption.shared.encrypt(json) else {
        Logger.cache.error("Encryption failed for store \(self.storeName), refusing to persist")
        throw GRDBCacheError.encryptionFailed
    }
    data = encryptedData
} else {
    data = json
}
```

**Test associé :** force corruption Keychain → `markDirty(_:)` doit jeter, jamais écrire en clair.

#### 4.1.2 Dirty tracking race en `willTerminate`

**Fichier :** `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift:392-402`

**État actuel :** semaphore 4 s peut expirer avant flush complet.

**Cible :**
- Flush opportuniste remplacé par transaction GRDB unique regroupant les dirty keys de tous les stores
- Enregistrement `BGTaskScheduler.BGProcessingTask` (identifier `me.meeshy.cache.background-flush`) pour terminer le drain en arrière-plan si l'app est tuée
- Abandon propre si > 30 s écoulés, log structuré pour observabilité

**Test associé :** kill app pendant flush, relancer → données présentes au boot.

#### 4.1.3 Gateway dedup `@@unique(conversationId, clientMessageId)` + `catch P2002`

**Schema Prisma** (`packages/shared/prisma/schema.prisma`) :

```prisma
model Message {
  // ...
  clientMessageId String?
  // ...
  @@unique([conversationId, clientMessageId])   // REMPLACE @@index existant
  // ...
}
```

**Migration data legacy :** script pré-migration qui détecte les duplicates `(conversationId, clientMessageId)` non null et garde le plus ancien (suppression des autres).

**Route REST** (`services/gateway/src/routes/conversations/messages.ts`) :

```typescript
try {
  const message = await prisma.message.create({ data: { ..., clientMessageId } });
  return sendSuccess(reply, message);
} catch (err) {
  if (isPrismaP2002(err, ['conversationId', 'clientMessageId'])) {
    const existing = await prisma.message.findFirst({ where: { conversationId, clientMessageId } });
    return sendSuccess(reply, existing);   // idempotent retour
  }
  throw err;
}
```

**WS ACK** (`services/gateway/src/socketio/handlers/MessageHandler.ts:861-878`) :

```typescript
ack({ success: true, data: { messageId: data.id, clientMessageId: data.clientMessageId } });
```

**iOS reconciliation** : `OutboxDispatcher`/`ConversationViewModel.pendingServerIds` désormais clé par `clientMessageId` (au lieu de `tempId`).

#### 4.1.4 `OfflineQueue.enqueue` async throws

**Fichier :** `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift:225`

**Signature actuelle :** `public func enqueue(_ item: OfflineQueueItem) async`
**Signature cible :** `public func enqueue(_ item: OfflineQueueItem) async throws`

**Sites appelants** (`apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:1317` et autres) : passage en `try await`, catch → toast utilisateur "Message non envoyé, tap pour réessayer" + log structuré.

### 4.2 Sprint 2 — Extension couverture cache

Pattern systématique : nouveau store dans `CacheCoordinator`, nouveau `ViewModel` basé sur `CacheFirstLoader<Store>` (Vague 1) — sera migré vers `SyncEngine.observe(_:)` en Vague 2.

| Domaine | Nouveaux stores | Nouveau VM | Policy (TTL/staleTTL/max) |
|---------|-----------------|------------|----------------------------|
| Communities | `communities`, `communityMembers`, `communityFeed` | `CommunityListViewModel`, `CommunityDetailViewModel`, `CommunityMembersViewModel` | 24h / ∞ / 500 |
| Notifications | (existe déjà mais inutilisé) | `NotificationListViewModel` | 24h / ∞ / 200 |
| Calls | `callHistory` | `CallHistoryViewModel` (cursor pagination) | 30j / ∞ / 200 |
| Drafts | `drafts` (par conversationId) | write-through local sur keystroke debounced 500ms | ∞ / ∞ / ∞ (pure local V1) |

**Bonus si capacité** :
- `GlobalSearchViewModel` user-search → branche cache `userSearch` (déjà déclaré, jamais consommé)
- `UserProfileViewModel.loadUserStats()` → cache `stats` (déjà déclaré)
- `UserPreferencesViewModel` → cache `userPreferences` (déjà déclaré)

### 4.3 Sprint 3 — Extension OfflineQueue (14 actions write)

**Nouveaux `OutboxKind` :**

```swift
public enum OutboxKind: String, Codable, Sendable {
    // Existing
    case sendMessage, editMessage, deleteMessage, sendReaction

    // NEW Vague 1
    case markAsRead
    case sendFriendRequest
    case respondFriendRequest        // payload: { friendRequestId, action: accept | reject }
    case blockUser
    case unblockUser
    case createConversation
    case updateConversation          // title, description, avatar
    case updateProfile               // displayName, bio, avatarUrl
    case updateSettings              // language, privacy, notifications
    case publishStory                // migration depuis StoryOfflineQueue
    case repostStory
    case createPost
    case toggleLikePost
    case createComment
    case deleteComment
    case toggleLikeComment
}
```

**clientMutationId généralisé :**
- Chaque action génère `cmid_<uuid lowercase>` (`ClientMutationId.generate()`, similaire au `clientMessageId` existant)
- Header `X-Client-Mutation-Id: cmid_xxx` sur chaque route write OU body field `clientMutationId`
- Gateway dédup via table dédiée :

```prisma
model MutationLog {
  id               String   @id @default(auto()) @map("_id") @db.ObjectId
  userId           String
  clientMutationId String
  kind             String   // matches iOS OutboxKind
  resultId         String?  // ID du record créé (Message, FriendRequest, etc.)
  createdAt        DateTime @default(now())

  @@unique([userId, clientMutationId])
  @@index([createdAt])      // TTL cleanup job tourne dessus
}
```

Cleanup job : suppression `MutationLog` > 30 jours (cron quotidien).

**Fusion des 3 queues :** `OfflineQueue` (legacy), `MessageRetryQueue`, `ReactionQueue` → **un seul `OutboxFlusher`** sur la table `outbox` GRDB. Suppression `ReactionQueue.swift` (déjà partiellement sur OutboxRecord, finir la migration). Suppression `MessageRetryQueue.swift`.

### 4.4 Sprint 4 — UX local-first

#### 4.4.1 Migration `.value` → switch (7 sites)

Sites à migrer :
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift:1209`
- `apps/ios/Meeshy/Features/Main/ViewModels/GlobalSearchViewModel.swift:252`
- `apps/ios/Meeshy/Features/Main/ViewModels/GlobalSearchViewModel.swift:333`
- `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift:313`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:1886`
- `apps/ios/Meeshy/Features/Main/Views/UserStatsView.swift:194`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/ParticipantService.swift` (3 instances : ~38, 52, 99)

Pattern cible :
```swift
switch await CacheCoordinator.shared.messages.load(for: conversationId) {
case .fresh(let cached, _):
    apply(cached); state = .cachedFresh
case .stale(let cached, _):
    apply(cached); state = .cachedStale
    Task { await revalidate() }
case .expired, .empty:
    state = .loading
    await fetchAndApply()
}
```

**Linter custom** : règle `cacheresult_no_value` interdit `.value` sur `CacheResult` hors tests (CI fail).

#### 4.4.2 Skeletons branchés

Skeletons existants à brancher :
- `SkeletonConversationRow` → `ConversationListView` (sur `loadState == .loading && conversations.isEmpty`)
- `SkeletonMessageBubble` → `ConversationView`

Skeletons nouveaux à créer :
- `SkeletonProfileHeader` → `ProfileView`, `UserProfileView`
- `SkeletonStoryThumb` → `StoryTrayView`
- `SkeletonFeedPost` → `FeedView`

Règle : skeleton uniquement quand `cache.empty`. Sur `cache.stale`, afficher la donnée stale immédiatement.

#### 4.4.3 UX offline complète

- **Badge `⏳`** sur `MessageBubble` quand `deliveryStatus == .pending && !OfflineQueue.shared.isOnline`
- **Badge `⚠️ Retry`** (tappable) quand `deliveryStatus == .failed || outbox.status == .exhausted`
- **Banner `ConnectionBanner`** : nouveau state `.syncing` quand `online && OfflineQueue.shared.pendingCount > 0`
- **Optimistic + rollback** sur 5 actions critiques :
  - Block/unblock user (UserProfileViewModel)
  - Send/accept/reject friend request (RequestsViewModel, UserProfileViewModel)
  - Update profile avatar/bio/displayName (EditProfileViewModel)

#### 4.4.4 Fix `@ObservedObject` sur singletons

Vues à corriger :
- `apps/ios/Meeshy/MeeshyApp.swift:16` (ThemeManager) → `@Environment(\.colorScheme)`
- `apps/ios/Meeshy/Features/Main/Views/ConnectionBanner.swift:7-8` → ConnectionViewModel léger
- `apps/ios/Meeshy/Features/Auth/Views/SecurityView.swift:12,24`
- `apps/ios/Meeshy/Features/Main/Views/EditProfileView.swift:12`
- `apps/ios/Meeshy/Features/Main/Views/SettingsView.swift:10-11`
- `apps/ios/Meeshy/Features/Main/Views/ProfileView.swift:13`
- `apps/ios/Meeshy/Features/Main/Views/AudioPostComposerView.swift:13`

---

## 5. Vague 2 — SyncEngine centralisé (S5-S12)

### 5.1 Sprint 5 — Backend `/api/v1/sync` + sequenceNumber

**Endpoint** : voir §7 ci-dessous (Protocole `/sync`).

**`sequenceNumber` par utilisateur :**
- Nouvelle table Prisma `UserEventSeq { userId String @id, lastSeq BigInt @default(0) }`
- Helper `nextSeq(userId: string): Promise<bigint>` atomique via `findOneAndUpdate({ userId }, { $inc: { lastSeq: 1 } }, { upsert: true, returnDocument: 'after' })`
- Middleware Socket.IO `emitWithSeq()` enveloppe chaque émission user-scoped : `payload._seq = await nextSeq(userId)`
- 53 events à enrichir (`MessageSocketManager.swift` 35+, `SocialSocketManager.swift` 18+)

**Indexes Prisma `updatedAt`** à ajouter :
- `Conversation`, `Community`, `CommunityMember`, `FriendRequest`, `Notification`, `CallSession`, `Post`, `PostComment`, `Story`, `Reaction`, `Mention`

### 5.2 Sprint 6 — iOS `SyncEngine` actor

**Protocol `Syncable` :**
```swift
public protocol Syncable: Sendable, CacheIdentifiable {
    static var collection: SyncCollection { get }
    var updatedAt: Date { get }
    var deletedAt: Date? { get }
}
```

**`SyncEngine` actor :**
```swift
public actor SyncEngine {
    public static let shared = SyncEngine()

    private struct Checkpoint: Codable, Sendable {
        var lastSyncedAt: Date
        var lastSeq: Int64
    }
    private var checkpoints: [SyncCollection: Checkpoint] = [:]
    private var continuations: [SyncCollection: AsyncStream<SyncDelta>.Continuation] = [:]
    private var resolvers: [SyncCollection: Any] = [:]   // type-erased ConflictResolver

    public func observe<T: Syncable>(_: T.Type, scope: SyncScope = .global)
        -> AsyncStream<SyncDelta<T>>

    public func enqueueMutation(_ mutation: ClientMutation) async throws
    public func syncNow(collections: [SyncCollection]) async throws
    public func handleSocketEvent(_ event: SocketSyncEvent) async
    public func registerResolver<R: ConflictResolver>(_ resolver: R, for: R.T.Type)
    public func replayMutations() async   // boot recovery
}
```

**Checkpoints persistés :** nouvelle table GRDB `sync_checkpoints (collection PK, lastSyncedAt, lastSeq)`. Lecture au boot, write debounced 2 s.

**Réutilisation `CacheCoordinator` :** `SyncEngine` invoque `CacheCoordinator.<store>.upsert(_)` et émet sur l'`AsyncStream`. Pas de fork.

### 5.3 Sprints 7-8 — Migration VMs ① (conversations + profiles + friends)

VMs migrés :
- `ConversationListViewModel`
- `ConversationViewModel` (les listeners `MessageSocketManager` redirigés vers `SyncEngine.handleSocketEvent`)
- `UserProfileViewModel`
- `ContactsListViewModel`
- `RequestsViewModel`
- `BlockedViewModel`

**Pattern migration (avant/après) :**

**Avant (Vague 1) :**
```swift
let loader = CacheFirstLoader(store: store, key: "list")
revalidationTask = await loader.load(
    fetch: { try await ConversationService.shared.list() },
    setLoadState: { self.loadState = $0 },
    apply: { self.conversations = $0 }
)
```

**Après (Vague 2) :**
```swift
private var syncTask: Task<Void, Never>?

func bind() {
    syncTask = Task {
        for await delta in await SyncEngine.shared.observe(MeeshyConversation.self) {
            await MainActor.run {
                self.conversations = applyDelta(self.conversations, delta)
                self.loadState = delta.fromCache ? .cachedFresh : .loaded
            }
        }
    }
    Task { try? await SyncEngine.shared.syncNow(collections: [.conversations]) }
}

deinit { syncTask?.cancel() }
```

**Feature flag :** `SyncEngineFeatureFlag.enabled(for: .conversations)` permet de revenir à `CacheFirstLoader` instantanément.

### 5.4 Sprints 9-10 — Migration VMs ② (feed + stories + communities + notifications + calls + search)

VMs migrés :
- `FeedViewModel`, `BookmarksViewModel`, `PostDetailViewModel`
- `StoryViewModel`, `StatusViewModel`
- `CommunityListViewModel`, `CommunityDetailViewModel`
- `NotificationListViewModel`
- `CallHistoryViewModel`
- `GlobalSearchViewModel`

Pattern identique.

### 5.5 Sprint 11 — Conflict resolver pluggable + gap recovery

**Resolver pluggable :**
```swift
public protocol ConflictResolver: Sendable {
    associatedtype T: Syncable
    func resolve(local: T, remote: T) -> T
}

public struct LastWriteWinsResolver<T: Syncable>: ConflictResolver {
    public func resolve(local: T, remote: T) -> T {
        local.updatedAt > remote.updatedAt ? local : remote
    }
}
```

Enregistrement : `SyncEngine.shared.registerResolver(MessageResolver(), for: Message.self)`. Default = `LastWriteWinsResolver`.

**Gap recovery au reconnect :**
1. SyncEngine compare `expectedSeq = lastSeq + 1` vs `receivedSeq` du 1er event
2. Si `receivedSeq > expectedSeq` → gap → trigger `syncNow(collections: [...])`
3. Si gap > 10 000 → `hasGapAction == "full_resync_required"` → full cold sync

**Mutation log replay :** au boot, `SyncEngine.replayMutations()` = `OutboxFlusher.flushAll()`. Les mutations `.exhausted` génèrent toast utilisateur "X actions n'ont pas pu être synchronisées" avec bouton retry.

### 5.6 Sprint 12 — Perf + tests E2E + tuning

**Métriques MetricKit :**
- `MXSignpostMetric` : `sync.cold_start`, `sync.delta_latency`, `sync.gap_recovery_duration`
- Logs structurés iOS unified logging avec `subsystem: me.meeshy.sync`

**Tests E2E :**
- Airplane mode 5 min + 10 actions write + reconnect → 100 % appliquées
- Cold start cache chaud 10k msg × 100 conv → < 500 ms p95
- Multi-device iOS A offline + iOS B online → 1 seul message en DB, convergence après reconnect

**Tuning :**
- `maxL1Keys` GRDBCacheStore : 20 → 100 (mesurer mémoire avant/après)
- staleTTL : tous à `.infinity` sauf data volatile rare (status 1h/2m)
- Disk budget review (P95 storage utilisateur réel)

---

## 6. Sprint 13 — Buffer & stabilisation

- Corrections bugs feedback rollout progressif Vague 2 (10 %/50 %/100 %)
- Observabilité finale : dashboard interne (Grafana ou équivalent existant) avec métriques sync
- Retrait final `CacheFirstLoader` deprecated (suppression hard depuis le SDK)
- Documentation finale : `docs/cache-architecture.md`, `docs/cache-coverage.md` (matrice maintenue)
- Migration scripts éventuels pour utilisateurs avec données legacy

---

## 7. Protocole `/sync`

### 7.1 Endpoint REST

```
GET /api/v1/sync
  ?since=<ISO8601>                   (required)
  &collections=conv,msg,notif,...     (required)
  &seq=<int64>                        (optional, last seen sequence)
  &limit=<int>                        (default 200, hard cap 1000 per collection)
  &scope=<conversationId>             (optional, scoped sync)
  &cursor=<opaque>                    (optional, server-provided continuation)

Headers:
  Authorization: Bearer <jwt>
  Accept-Encoding: gzip
  If-None-Match: "<etag>"             (optional, 304 short-circuit)
```

### 7.2 Réponse

```jsonc
{
  "success": true,
  "data": {
    "checkpoint": "2026-05-11T14:23:45.123Z",
    "checkpointSeq": 91234,
    "collections": {
      "messages": {
        "added":    [/* full Message */],
        "modified": [/* full Message */],
        "deleted":  [{ "id", "conversationId", "deletedAt" }],
        "truncated": true,
        "nextCursor": "msg:cursor:opaque:..."
      },
      // ... only requested collections appear
    },
    "hasMore": true,
    "nextCursor": "global:cursor:opaque:...",
    "hasGap": false,
    "gapAction": null
  }
}
```

### 7.3 Règles

- **Pagination intra-collection :** hard cap 1000 items/collection/response, `truncated + nextCursor`
- **Pagination globale :** `hasMore` au top-level, client itère jusqu'à `false` avant de persister checkpoint
- **Ordre :** `added`/`modified` triés par `updatedAt ASC`, `deleted` par `deletedAt ASC`
- **Compression :** `gzip` automatique si payload > 4 KB (Fastify `@fastify/compress`)
- **Permissions :** filtrage par `SyncProvider<T>` côté gateway, RLS in code
- **Tombstones :** soft-deleted items visibles dans `deleted` pendant **30 jours**, au-delà hard delete (job cron quotidien)
- **Gap detection :** si client `seq < lastSeq - 10000` → `hasGap: true, gapAction: "full_resync_required"`
- **Cache headers :** `Cache-Control: no-store`, `ETag` (SHA256 du `userId + checkpointSeq + collectionsHash`)
- **Pas de POST /sync/mutations :** les routes write existantes restent autoritatives, généralisation du pattern `clientMutationId` (X-Client-Mutation-Id header ou body field) sur chacune

### 7.4 Mutations (push depuis client)

Pattern : les routes write existantes (`POST /conversations/:id/messages`, `POST /friend-requests`, `PATCH /users/profile`, etc.) acceptent `clientMutationId`. Le gateway dédup via `MutationLog (userId, clientMutationId)` `@@unique`. ACK retourne `clientMutationId` pour la réconciliation iOS.

### 7.5 Socket.IO complémentaire

Le serveur push individuellement chaque event via Socket.IO **enrichi de `_seq`**. Client applique en temps réel et avance son `lastSeq`. Le REST `/sync` reste pour : cold start, reconnect > 5 min, gap recovery.

---

## 8. Stratégie de tests

### 8.1 TDD non-négociable (CLAUDE.md)

RED-GREEN-REFACTOR sur chaque sprint. Tests écrits AVANT le code. 0 production code sans test failing.

### 8.2 Tests unitaires SDK (XCTest + Swift Testing)

- `SyncEngine` : checkpoints persistence, observe() emits, gap detection, replay mutations, resolver dispatch
- `OutboxFlusher` : ordre FIFO, exhaustion, dedup multi-`OutboxKind`
- `GRDBCacheStore` : encryption strict throw, dirty tracking flush, LRU eviction
- `CacheFirstLoader` rétro-compat (Vague 1 + cohabitation)

### 8.3 Tests intégration iOS

- `MockSyncProvider` simule gateway → `SyncEngine` côté client → deltas appliqués sur stores réels
- ViewModels migrés : binding, optimistic, rollback
- Multi-VM cohérence : 2 ViewModels observant la même collection reçoivent même delta

### 8.4 Tests E2E (XCUITest + stubs réseau)

- Airplane mode 5 min + 10 actions write + reconnect → 100 % appliquées
- Cold start cache chaud : 0 spinner sur 10 écrans data-driven (assert via accessibility tree)
- Multi-device : 1 seul message en DB, convergence après reconnect

### 8.5 Tests gateway (Vitest)

- `syncRoute` per-collection providers : permissions, pagination intra, 304 ETag
- `nextSeq()` atomique sous concurrence (100 emits parallèles → 0 collision)
- Dédup `MutationLog` : 100 POST avec même `clientMutationId` → 1 record + 99 retours `duplicate`

### 8.6 Tests de performance

- Cold start cache chaud 10k msg × 100 conv : `sync.cold_start` < 500 ms p95
- Sync delta après 30 min offline (~200 events ratés) : < 2 s
- Gap recovery 1000+ events ratés : < 5 s

### 8.7 Coverage targets

| Module | Target |
|--------|--------|
| `SyncEngine`, `OutboxFlusher`, mutations, conflict resolvers | 95 % |
| `GRDBCacheStore`, `DiskCacheStore`, `CacheCoordinator` | 90 % |
| ViewModels migrés | 85 % |
| Gateway syncRoute + providers | 90 % |

### 8.8 Mocking pattern (CLAUDE.md iOS TDD)

- Tous les nouveaux services derrière protocole `{Service}Providing`
- Mocks `Mock{Service}` conformant au protocole avec `Result<T, Error>` stubs + call counts
- Test naming `test_{method}_{condition}_{expectedResult}`

---

## 9. Risques & mitigation

| # | Risque | Probabilité | Impact | Mitigation |
|---|--------|-------------|--------|------------|
| 1 | Régression `.value` → switch en prod | M | H | Feature flag par collection + observabilité `.expired` vs `.empty` avant/après. Rollback instantané. |
| 2 | Migration MongoDB `@@unique` échoue sur duplicates legacy | M | H | Script pré-migration dédup `(conversationId, clientMessageId)`. Test sur dump anonymisé. |
| 3 | `sequenceNumber` sous concurrence : collision | L | H | `findOneAndUpdate({userId}, {$inc:{lastSeq:1}})` atomique MongoDB. Bench 1000 emits/s. |
| 4 | Charge `/sync` au cold start 1 mois offline | M | M | Pagination 1000 hard cap + iOS limite cold sync 7 jours, au-delà full resync via routes legacy. |
| 5 | Espace disque iOS explose | M | M | `evictOverBudget` automatique sur memory warning + background. `isExcludedFromBackup = true`. |
| 6 | Cohabitation `CacheFirstLoader` + `SyncEngine` durant migration | H | M | Feature flag par collection. Tests intégration sur 2 paths. Rollout 10/50/100 %. |
| 7 | Drift `OutboxKind` Vague 1 ↔ Vague 2 | M | M | Vague 2 RÉUTILISE table `outbox` + même type `OutboxKind`. Pas de fork. |
| 8 | Retry storm au reconnect après 24h offline | L | M | Throttle 200 ms inter-mutations, max 50 parallèle, backoff exponentiel sur 429. |
| 9 | Plan trop long → starvation autres features | H | M | Phasage strict + point produit post-vague. Vague 1 releasable seule. |
| 10 | App Store rejection sur `BGProcessingTask` | L | L | Whitelist iOS standard. Backup : retirer BGProcessingTask, garder willTerminate flush. |

---

## 10. Acceptance criteria globaux

- **Couverture cache-first : 100 %** des écrans data-driven (matrice `docs/cache-coverage.md`)
- **0 spinner réseau quand cache non `.empty`** (audit auto via lint custom + `git grep ProgressView`)
- **100 % des actions write offline-capable** (tests E2E airplane mode)
- **Sync delta < 500 ms p95** au cold start avec cache chaud (MetricKit signpost)
- **Gap detection < 1 s** au reconnect après 5 min offline (test E2E)
- **0 doublon multi-device** sur 1000 messages send-online + send-offline (test E2E iOS+web)
- **Score Instant App Principles : ≥ 9/10** (cf. évaluation audit)

---

## 11. Decision points (à valider en cours)

- **Q1 (post-S4 review)** : Vague 1 livrée seule = suffisant pour App Store launch ? Si oui, Vague 2 reportée post-launch.
- **Q2 (S6)** : Migration progressive par collection ou bigbang ? Recommandation : progressif via feature flag.
- **Q3 (S11)** : Garder `CacheFirstLoader` deprecated pour user code ou suppression hard ? Recommandation : deprecated 1 release, suppression sprint 13.
- **Q4 (S5)** : `sequenceNumber` global per-user ou per-collection ? Recommandation : per-user (plus simple, suffit pour gap detection).

---

## 12. Référence : 8 brèches structurelles identifiées

Cf. `docs/audit-cache-ios-2026-05-11.md` pour détails complets.

| # | Brèche | Adressée par | Sprint |
|---|--------|--------------|--------|
| 1 | Couverture cache 54 % | S2 + S9-S10 | S2, S9-10 |
| 2 | staleTTL court → spinner | S12 (passage à `.infinity` + push) | S12 |
| 3 | 7+ usages `.value` masquent stale | S4 migration switch + linter | S4 |
| 4 | Dédup gateway absente | S1 `@@unique` + P2002 | S1 |
| 5 | 14 actions write online-only | S3 14 nouveaux `OutboxKind` | S3 |
| 6 | 1 endpoint sur 30 avec `?since=`, aucun `_seq` | S5 `/sync` + `_seq` enrichi | S5 |
| 7 | Encryption fallback silencieux | S1 throw strict | S1 |
| 8 | `OfflineQueue.enqueue` async non-throws | S1 signature `async throws` | S1 |
