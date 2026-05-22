# Conversation User State Unification — Design

**Date** : 2026-05-22
**Topic** : Unification SWR de l'état per-user d'une conversation (iOS) + sync socket gateway
**Scope** : `apps/ios`, `packages/MeeshySDK`, `services/gateway` (mini-patch)
**Estimation** : ~6 jours

---

## 1. Problème

L'état per-user d'une conversation (épinglée, silencieuse, archivée, lue, nom personnalisé, réaction, tags, catégorie, ordre, etc.) est **fragmenté** côté iOS et **non synchronisé en temps réel** entre surfaces UI ni entre devices :

1. **Modèle iOS éclaté** : les flags per-user sont des `var` éparpillés sur `MeeshyConversation` (`isPinned`, `isMuted`, `unreadCount`, `customName`, `reaction`, `sectionId`, `tags`, `isArchivedByUser`, ...). Pas de struct unifiée.
2. **3 copies divergentes en mémoire** : `ConversationListViewModel.@Published conversations` (liste), `ConversationViewModel.conversation` (header conv ouverte), `ConversationOptionsViewModel.prefs` (sheet). Chacune mute sa copie sans diffuser aux autres.
3. **Gateway silencieux** : `PUT /user-preferences/conversations/:id`, `DELETE /user-preferences/...`, `POST .../reorder`, et les CRUD catégories n'émettent **aucun** event socket. L'event `user:preferences-updated` est défini dans `packages/shared/types/socketio-events.ts:237` mais jamais émis.
4. **Mutations non-résilientes** : optimistic update avec rollback simple, mais **pas d'outbox** persistant. Une mutation en cours pendant un kill app ou une perte réseau est perdue.
5. **Race conditions** : optimistic local + event socket distant peuvent s'écraser mutuellement sans versioning.

## 2. Objectif

- Une **struct unifiée** `ConversationUserState` attachée à chaque `MeeshyConversation`, regroupant tous les états per-user (read state, préférences, organisation, métadonnées sync).
- Un **store actor singleton** `ConversationStore` comme source de vérité unique en RAM, hydraté depuis le cache, sync avec le backend.
- Toutes les surfaces UI (cellule liste, swipe, context menu, header conv, options sheet, section headers) lisent et mutent **via ce seul store**.
- **SWR** (stale-while-revalidate) via `CacheCoordinator` existant.
- **Outbox SQLite** pour résilience offline, avec coalescing par champ.
- **Versioning bi-directionnel** pour neutraliser les races optimistic vs socket.
- **Mini-patch gateway** chirurgical (~66 lignes) pour fermer la boucle socket.

## 3. Inventaire des états per-user (exhaustif)

### Backend (Prisma)

| Modèle | Champ | Origine mutation |
|---|---|---|
| `ConversationReadCursor` | `lastReadMessageId`, `lastReadAt`, `lastDeliveredMessageId`, `lastDeliveredAt`, `unreadCount`, `version` | `mark-read`, `mark-unread`, message reçu |
| `UserConversationPreferences` | `isPinned`, `isMuted`, `mentionsOnly`, `isArchived`, `deletedForUserAt`, `clearHistoryBefore` (orphelin), `tags[]`, `categoryId`, `orderInCategory`, `customName`, `reaction` | `PUT /user-preferences/conversations/:id` |
| `Participant` | `role`, `language`, `nickname`, `permissions`, `joinedAt`, `leftAt`, `bannedAt` | Membership, hors scope (sera lu en lecture seule) |

### iOS — local-only (pas backend)

| Stockage | Champ | Nature |
|---|---|---|
| `ConversationLockManager` | `isLocked` | per-device, persiste via PIN master |
| `ConversationDraftManager` | `hasDraft`, `draftPreview` | brouillon composer |

### Endpoints REST disponibles

- `PUT /api/v1/user-preferences/conversations/:id` — partial update (10 champs)
- `DELETE /api/v1/user-preferences/conversations/:id` — reset prefs aux defaults
- `POST /api/v1/user-preferences/reorder` — batch reorder
- `POST /api/v1/conversations/:id/mark-read` — émet déjà `broadcastReadStatus`
- `POST /api/v1/conversations/:id/mark-unread` — émet déjà
- `POST /api/v1/conversations/:id/delete-for-me` — émet déjà vers user room + conversation room
- `POST /api/v1/conversations/:id/leave` — émet déjà `CONVERSATION_PARTICIPANT_LEFT`
- `GET/POST/PATCH/DELETE/reorder /me/preferences/categories[/:id]` — CRUD catégories

## 4. Architecture cible

### 4.1 Struct unifiée

```swift
public struct ConversationUserState: Codable, Hashable, Sendable {
    // Read state
    public var unreadCount: Int
    public var lastReadAt: Date?
    public var lastDeliveredAt: Date?

    // Préférences notifications
    public var isPinned: Bool
    public var isMuted: Bool
    public var mentionsOnly: Bool

    // Visibilité & cycle de vie
    public var isArchived: Bool
    public var deletedForUserAt: Date?
    public var clearHistoryBefore: Date?

    // Affichage personnel
    public var customName: String?
    public var reaction: String?
    public var tags: [String]

    // Organisation
    public var sectionId: String?           // categoryId
    public var orderInCategory: Int?

    // État local pur (non sync)
    public var isLocked: Bool
    public var hasDraft: Bool
    public var draftPreview: String?

    // Méta SDK
    public var version: Int
    public var lastSyncedAt: Date?
    public var pendingMutationCount: Int
}

extension ConversationUserState {
    public var hasUnreadIndicator: Bool { unreadCount > 0 }
    public var hasPendingSync: Bool { pendingMutationCount > 0 }
}
```

`MeeshyConversation` perd ses flags inline et reçoit `public var userState: ConversationUserState`. Les anciens flags deviennent des computed properties (shim de migration), supprimées en Phase 8.

### 4.2 Mutations enum

```swift
public enum UserStateMutation: Codable, Sendable {
    // PUT /api/v1/user-preferences/conversations/:id
    case setPinned(Bool)
    case setMuted(Bool)
    case setMentionsOnly(Bool)
    case setArchived(Bool)
    case setCustomName(String?)
    case setReaction(String?)
    case setSection(categoryId: String?)
    case setOrderInCategory(Int?)
    case setTags([String])
    case addTag(String)
    case removeTag(String)
    case setClearHistoryBefore(Date?)

    // POST mark-read / mark-unread
    case markAsRead
    case markAsUnread

    // POST delete-for-me / leave
    case deleteForUser
    case leave

    // Local-only
    case setLocked(Bool)
}
```

Mutations composites (helpers du store) :

- `createSectionAndAssign(name:color:icon:toConversation:)` — POST categories + setSection atomique
- `reorderConversations([(convId, order)])` — POST reorder batch

### 4.3 ConversationStore (source de vérité)

```swift
public actor ConversationStore {
    public static let shared: ConversationStore

    private var conversations: [String: MeeshyConversation]
    private var subjects: [String: CurrentValueSubject<MeeshyConversation, Never>]
    private let listSubject: CurrentValueSubject<[MeeshyConversation], Never>

    private let cache: CacheCoordinator
    private let outbox: ConversationStateOutbox
    private let preferenceService: ConversationPreferenceServiceProviding
    private let conversationService: ConversationServiceProviding

    // Lecture
    public func conversation(id: String) async -> MeeshyConversation?
    public nonisolated func publisher(for convId: String) -> AnyPublisher<MeeshyConversation, Never>
    public nonisolated func listPublisher() -> AnyPublisher<[MeeshyConversation], Never>

    // Hydratation (SWR)
    public func hydrate(_ conv: MeeshyConversation) async
    public func hydrateList(_ convs: [MeeshyConversation]) async
    public func hydrateFromCache() async

    // Mutations user-state
    public func apply(_ mutation: UserStateMutation, for convId: String) async throws

    // Mutations composites
    public func createSectionAndAssign(name: String, color: String?, icon: String?, toConversation convId: String) async throws
    public func reorderConversations(_ updates: [(convId: String, orderInCategory: Int)]) async throws

    // Réception remote
    public func applyRemote(_ event: UserPreferencesUpdatedEvent) async
    public func applyReadReceipt(_ event: ReadStatusEvent) async
    public func applyConversationDeleted(_ event: ConversationDeletedEvent) async

    // Outbox lifecycle
    public func flushOutbox() async
}
```

### 4.4 UserCategoryStore (entité user-level séparée)

```swift
public actor UserCategoryStore {
    public static let shared: UserCategoryStore

    public func categories() async -> [UserConversationCategory]
    public nonisolated func publisher() -> AnyPublisher<[UserConversationCategory], Never>

    public func create(name:color:icon:) async throws -> UserConversationCategory
    public func rename(_ id: String, to name: String) async throws
    public func setColor(_ id: String, color: String?) async throws
    public func setIcon(_ id: String, icon: String?) async throws
    public func setExpanded(_ id: String, expanded: Bool) async throws
    public func delete(_ id: String) async throws
    public func reorder(_ updates: [(id: String, order: Int)]) async throws

    public func applyRemote(_ event: CategoryRemoteEvent) async
}
```

### 4.5 Outbox SQLite

```swift
public actor ConversationStateOutbox {
    private let storage: OutboxPersistence    // SQLite via GRDB
    private var pending: [UUID: OutboxTask]

    public func enqueue(_ task: OutboxTask) async
    public func markCompleted(_ id: UUID) async
    public func markFailed(_ id: UUID, reason: String) async
    public func flush(via dispatch: (OutboxTask) async throws -> Void) async
    public func pendingCount(for convId: String) async -> Int
}

public struct OutboxTask: Codable, Sendable {
    public let id: UUID
    public let convId: String
    public let mutation: UserStateMutation
    public let createdAt: Date
    public var attempts: Int
    public var nextRetryAt: Date?
    public let schemaVersion: Int   // outbox schema, pas userState.version
}
```

**Politique** :

- **Coalescing par champ** : `setPinned(true)` puis `setPinned(false)` consécutifs s'annulent (tâche retirée). `setTags/addTag/removeTag` fusionnent en `setTags(finalArray)`. `markAsRead/markAsUnread` last-write-wins. `deleteForUser/leave` ne se coalescent jamais.
- **Retry backoff** : `nextRetryAt = now + min(60s, 2^attempts × 5s)`.
- **Rollback** : uniquement sur 4xx définitif. Transient (5xx, réseau) reste en outbox.
- **Persistance** : SQLite via GRDB, survit aux kill app.

## 5. Cycle SWR

```
Cold start
├─ ConversationStore.hydrateFromCache()
│  └─ CacheCoordinator.conversations.load(for: "list")
│     → CacheResult<[MeeshyConversation]>
│       ├ .fresh  → publish, no refresh
│       ├ .stale  → publish + silent refresh
│       ├ .expired → publish empty + fetch
│       └ .empty  → skeleton + fetch
└─ ConversationListViewModel.sink(listPublisher)

Open conversation
├─ ConversationViewModel(id:).sink(publisher(for: id))
└─ if unreadCount > 0: store.apply(.markAsRead)
    └─ re-trigger at ScenePhase.active

Socket reception
├─ MessageSocketManager.userPreferencesUpdated.sink
│  └─ store.applyRemote(event)
│     ├─ if event.version <= local.version: ignore
│     ├─ if event.reset: defaults
│     └─ else: apply + bump version + publish + cache.save
├─ MessageSocketManager.readStatus.sink → store.applyReadReceipt
└─ MessageSocketManager.conversationDeleted.sink → store.applyConversationDeleted
```

## 6. Mutation pipeline

```swift
public func apply(_ mutation: UserStateMutation, for convId: String) async throws {
    guard var conv = conversations[convId] else { throw .unknownConversation }
    let snapshot = conv.userState

    // 1. Optimistic + version candidate
    conv.userState = applyLocally(mutation, on: conv.userState)
    conv.userState.version += 1
    conversations[convId] = conv
    subjects[convId]?.send(conv)
    publishList()
    schedulePersist()

    // 2. Outbox + dispatch
    let task = OutboxTask(id: UUID(), convId: convId, mutation: mutation, ...)
    await outbox.enqueue(task)
    do {
        let response = try await dispatch(task)
        // ACK : version autoritative
        conv.userState.version = response.version
        conv.userState.lastSyncedAt = Date()
        conversations[convId] = conv
        subjects[convId]?.send(conv)
        publishList()
        await outbox.markCompleted(task.id)
    } catch is TransientError {
        // garde en outbox, pas de rollback
    } catch {
        // rollback 4xx
        conv.userState = snapshot
        conversations[convId] = conv
        subjects[convId]?.send(conv)
        publishList()
        await outbox.markFailed(task.id, reason: "\(error)")
        throw error
    }
}
```

### Mapping mutation → endpoint

| Mutation | Endpoint | Body | Confirmation socket |
|---|---|---|---|
| `setPinned/Muted/MentionsOnly/Archived/CustomName/Reaction/Section/Tags/OrderInCategory/ClearHistoryBefore` | `PUT /api/v1/user-preferences/conversations/:id` | partial | `user:preferences-updated` |
| `markAsRead` | `POST /api/v1/conversations/:id/mark-read` | — | `broadcastReadStatus` (existant) |
| `markAsUnread` | `POST /api/v1/conversations/:id/mark-unread` | — | idem |
| `deleteForUser` | `POST /api/v1/conversations/:id/delete-for-me` | — | `conversation:deleted` (user room, existant) |
| `leave` | `POST /api/v1/conversations/:id/leave` | — | `conversation:participant-left` (existant) |
| `setLocked` | local-only | — | — |

## 7. Surfaces UI — câblage

| Surface | Lecture | Mutation |
|---|---|---|
| `ConversationListView` cell (`ThemedConversationRow`) | `MeeshyConversation` snapshot via `ListViewModel` miroir de `listPublisher()` | — |
| Swipe leading (pin/mute/lock) | idem | `store.apply(.setPinned\|.setMuted\|.setLocked)` |
| Swipe trailing (archive/markread/block/hide) | idem | `store.apply(.setArchived\|.markAs[Read\|Unread]\|.deleteForUser)` + `BlockService` |
| Context menu long-press (13 actions) | idem | `store.apply(...)` + helpers (`createSectionAndAssign`) |
| Section headers | `UserCategoryStore.publisher()` | `UserCategoryStore.setExpanded` + `store.apply(.setSection)` (drop) + `store.reorderConversations` (drag) |
| `ConversationView` header | `store.publisher(for: id)` | onAppear/scenePhase → `store.apply(.markAsRead)` |
| `ConversationOptionsSheet` | `store.publisher(for: id)` + `UserCategoryStore.publisher()` | `store.apply(...)` (tous toggles) + `store.createSectionAndAssign` |
| `ConversationInfoSheet` | `store.publisher(for: id)` (read-only) | — |
| `ConversationSettingsView` (admin+, settings globaux) | hors scope user-state (gérée par `ConversationSettingsViewModel` existant) | `PUT /conversations/:id` (hors store) |

### Conséquence sur les ViewModels

- **`ConversationListViewModel`** : devient miroir lecture seule de `listPublisher()`. Suppression de ~400 lignes (`togglePin`, `toggleMute`, `markAsRead`, `markAsUnread`, `archiveConversation`, `unarchiveConversation`, `deleteConversation`, `setFavoriteReaction`, `moveToSection`). La View appelle directement `ConversationStore.shared.apply(...)`.
- **`ConversationOptionsViewModel`** : devient adaptateur mince (~80 lignes au lieu de ~300). Suppression de toute la logique optimistic/rollback/broadcaster/cache L2 (déléguée au store). Préserve uniquement debounce custom name + drafts tag input.
- **`ConversationViewModel`** (header) : sink `store.publisher(for: id)`, déclenche `markAsRead` à l'apparition et au scenePhase active.

## 8. Mini-patch gateway

### 8.1 Schéma Prisma

Ajouter `version: Int @default(0)` sur `UserConversationPreferences`. Migration non-breaking.

### 8.2 Helper d'émission

```typescript
// services/gateway/src/utils/socket-broadcast.ts
export function broadcastToUser(
  fastify: FastifyInstance,
  userId: string,
  event: string,
  payload: unknown
): void {
  const socketIOHandler = (fastify as any).socketIOHandler;
  const io = socketIOHandler?.getManager?.()?.io ?? (socketIOHandler as any)?.io;
  if (!io) return;
  io.to(ROOMS.user(userId)).emit(event, payload);
}
```

### 8.3 Endpoints à patcher

- `PUT /api/user-preferences/conversations/:id` : upsert avec `version: { increment: 1 }`, puis `broadcastToUser(... USER_PREFERENCES_UPDATED ...)` avec payload **complet** incluant `version`.
- `DELETE /api/user-preferences/conversations/:id` : émettre `{ conversationId, reset: true, version: 0 }`.
- `POST /api/user-preferences/reorder` : émettre `USER_PREFERENCES_REORDERED` avec `updates`.
- `POST /me/preferences/categories` : émettre `CATEGORY_CREATED`.
- `PATCH /me/preferences/categories/:id` : émettre `CATEGORY_UPDATED`.
- `DELETE /me/preferences/categories/:id` : émettre `CATEGORY_DELETED`.
- `POST /me/preferences/categories/reorder` : émettre `CATEGORIES_REORDERED`.

### 8.4 Coût total

~66 lignes ajoutées, ~7 lignes modifiées. Non-breaking pour les clients existants. Déployable seul (Phase 1) avant le refactor iOS.

## 9. Versioning bi-directionnel

### Portée du versioning

Le champ `version` côté iOS sert exclusivement aux **mutations préférences** (`UserConversationPreferences`). Il n'est PAS partagé avec les events de read receipt — la sync read state utilise une politique distincte basée sur la monotonie des timestamps.

### Pour les events `user:preferences-updated`

- Backend incrémente `UserConversationPreferences.version` atomiquement à chaque update Prisma (`update: { ..., version: { increment: 1 } }`).
- Réponse REST + payload socket portent toujours `version`.
- Client `applyRemote(UserPreferencesUpdatedEvent)` : si `event.version <= local.userState.version`, ignore (event obsolète).
- Client `apply(_:for:)` optimistic : `version += 1` candidate. Au ACK serveur : remplace par version autoritative retournée par l'API.
- Rollback restore le snapshot complet (donc `version` d'avant).

### Pour les events de read receipt (`broadcastReadStatus`)

- Pas de versioning explicite. Les read receipts sont **monotones** par nature : `lastReadAt`, `lastDeliveredAt`, `unreadCount` ne devraient évoluer qu'en avant (lecture nouvelle ne peut pas annuler une lecture ancienne).
- Client `applyReadReceipt(ReadStatusEvent)` : si `event.lastReadAt > local.lastReadAt`, applique. Sinon ignore.
- `unreadCount` est dérivé : appliqué tel quel depuis l'event (le serveur fait autorité).
- Cette politique n'incrémente PAS `userState.version` (réservé aux prefs).

### Résolution combinée

L'optimistic update d'une mutation prefs (`apply(.setPinned)`) et la réception simultanée d'un read receipt sur la même conv ne se gênent pas : ils mutent des champs disjoints (`isPinned` vs `lastReadAt/unreadCount`). Le `version` n'est touché que par le chemin prefs.

Cette approche évite la complexité CRDT tout en couvrant les races réellement observables.

## 10. Tests

### Unit (SDK)

- `ConversationUserState` : defaults, Codable round-trip avec `.sortedKeys`, Hashable, Equatable
- `UserStateMutation` : Codable round-trip pour chaque cas, decoding tolérant pour évolutions futures
- `ConversationStateOutbox` : enqueue/dequeue, coalescing par champ, retry backoff, persistance SQLite
- `ConversationStore.apply` : optimistic visible, version +1 candidate, ACK met version autoritative, rollback 4xx restore snapshot, transient garde outbox
- `ConversationStore.applyRemote` : ignore version <= local, applique version > local, reset:true → defaults, conv inconnue → no-op
- `ConversationStore.publisher` : sink reçoit snapshot initial + chaque mutation, multi-subscribers cohérents
- `UserCategoryStore` : CRUD complet, reorder, applyRemote

### ViewModels (app)

- `ConversationListViewModel` post-refactor : miroir liste, regroupement par catégorie, méthodes mutation supprimées
- `ConversationOptionsViewModel` : sink store, debounce customName 500ms appelle 1x, toggles → store.apply
- `ConversationViewModel` (header) : onAppear avec unreadCount>0 → markAsRead, scenePhase=active re-trigger

### Snapshot (MeeshyUI)

- `ThemedConversationRow` : pinned, muted, archived, unread, customName, reaction, pendingSync, locked, draft
- `ConversationOptionsSheet` : tous toggles, picker catégories, chips tags, vide/peuplé

### Intégration gateway

- `PUT /user-preferences/...` upsert + version incrémentée + event émis
- `DELETE /user-preferences/...` reset event émis
- `POST /user-preferences/reorder` event émis
- CRUD catégories events émis

### E2E (XCUITest minimal)

1. Pin depuis liste, options sheet de la même conv reflète sans interaction.
2. Mode avion, toggle 5 prefs, retour réseau, aucune mutation perdue.
3. Mark-as-read iPhone → iPad voit badge disparaître via socket.

## 11. Roadmap d'exécution

| Phase | Durée | Contenu | Déployable seul |
|---|---|---|---|
| 0 | 0.5j | Préparation : migration Prisma `version`, helper socket-broadcast, declarations events, tests gateway (RED) | non |
| 1 | 0.5j | Gateway emissions : 4 endpoints émettent, tests GREEN | **oui** (non-breaking) |
| 2 | 0.5j | SDK Modèles : `ConversationUserState`, `UserStateMutation`, conversion API → domain, computed shims sur `MeeshyConversation` | oui (rétro-compatible) |
| 3 | 1j | Outbox : actor + SQLite + coalescing + retry + tests | oui |
| 4 | 1.5j | `ConversationStore` : actor + publishers + apply + applyRemote + hydrate + versioning + listeners socket + tests | oui (pas encore utilisé par UI) |
| 5 | 0.5j | `UserCategoryStore` : actor + CRUD + reorder + applyRemote + tests | oui |
| 6 | 1j | Refactor ViewModels : List devient miroir, Options devient adaptateur, ConvVM sink publisher | oui |
| 7 | 0.5j | Re-câblage UI : swipe, context menu, section drop, drag reorder, sheet toggles | oui |
| 8 | 0.5j | Smoke + cleanup : suppression shims, suppression call sites obsolètes, verification gate | oui |
| **Total** | **~6j** | | |

## 12. Risques & mitigations

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Régression cache disque (format MeeshyConversation change) | Moyenne | Élevé | Versionner le cache GRDB. Si schema mismatch au boot → drop + re-fetch. |
| Migration Prisma `version` casse en prod | Faible | Moyen | `Int @default(0)` non-breaking. Tester sur staging. |
| Outbox tasks pré-upgrade ne décodent plus | Moyenne | Bas | `schemaVersion` sur chaque task. Drop avec log si version dépassée. |
| Listener socket arrive avant hydratation cache | Faible | Bas | `applyRemote` ignore conv inconnues. Refresh liste les rattrape. |
| Re-renders SwiftUI trop fréquents | Faible | Moyen | `MeeshyConversation` `Hashable` → SwiftUI déduplique. Mesurer via Instruments. |
| Régression Prisme Linguistique (`sectionId` confondu avec langue) | Faible | Élevé | Pas de modification de `resolveUserLanguage()`. Store n'y touche pas. |
| Mutation `deleteForUser/leave` en attente d'ACK quand utilisateur revient | Moyenne | Bas | Conv reste dans le store avec `deletedForUserAt`/`leavePending` posé localement, opacité réduite + badge "removal pending" via `pendingMutationCount > 0`, swipe/long-press masqués. Suppression effective du store à l'ACK. |

## 13. Critères de succès

1. Toutes les options de l'inventaire (§3) câblées via le store.
2. Toutes les surfaces UI (§7) lisent le même snapshot, mutent via le store.
3. Mutation depuis n'importe quelle surface met à jour les autres dans le même tick Combine main.
4. Mutation hors réseau persistée dans outbox SQLite, rejouée au reconnect.
5. Event socket d'un autre device update via versioning sans régression.
6. Suppression effective des ~700 lignes de mutation/optimistic/rollback éparpillées dans les ViewModels.
7. Tous tests passent (SDK + app + gateway) + 3 smoke manuels validés.

## 14. Hors scope (explicite)

- Refactor des settings globaux conversation (title, avatar, defaultWriteRole, slowMode, autoTranslate) → reste sur `ConversationSettingsViewModel`. À envisager dans un sprint séparé.
- Member management (promote, demote, expel, ban) → reste sur `ConversationSettingsViewModel`.
- Block/unblock user → reste sur `BlockService.shared`.
- Préférences de langue per-conversation (Prisme Linguistique) → globale-only, hors scope.
- `clearHistoryBefore` UI (champ câblé d'avance dans la struct, UI à activer plus tard).
- Cache normalisé, delta sync, CRDT — non-justifiés à l'échelle Meeshy actuelle.
- Migration `@Observable` (iOS 17+) — bloquée jusqu'au bump min target.

## 15. Décisions architecturales clés

| Décision | Alternative écartée | Raison |
|---|---|---|
| Une struct unifiée `ConversationUserState` | Sub-structs séparées (Read + Prefs) | Évite la double-plomberie dans les vues qui ont besoin des deux. |
| `ConversationStore` actor singleton | Injection via SwiftUI Environment | Cohérence avec patterns existants (`CacheCoordinator.shared`, `MessageSocketManager.shared`). Pragmatisme > pureté. |
| `UserCategoryStore` séparé | Catégories dans `ConversationStore` | Entité user-level, cycle de vie indépendant des conversations. |
| Versioning bi-directionnel côté DB | Versioning client-only | Résout proprement les races optimistic + socket. Coût ~40 lignes. |
| Pas de cache normalisé | Apollo-like normalized cache | Pas de duplication réelle à éliminer dans Meeshy (une liste + regroupements dérivés). |
| LWW par champ | CRDT complet | États per-user rarement contestés entre devices. Surdimensionné. |
| Payload socket complet (pas diff) | Payload diff partiel | Simplicité client : pas de merge partiel à orchestrer. Latence négligeable. |
| Mutation `deleteForUser/leave` reste en outbox | Exécution synchrone bloquante | Cohérence offline-first. Surface "removal pending" pendant l'attente. |
| `isLocked`/`hasDraft` dans struct malgré nature locale | Champs externes au store | Sinon retour des "3 copies divergentes" pour ces deux champs. |
