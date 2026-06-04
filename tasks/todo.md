# Conversation User State Unification — Implementation Checklist

**Branch** : `claude/conversation-user-state-plan-3veyD`
**Spec** : `docs/superpowers/specs/2026-05-22-conversation-user-state-unification-design.md`
**Estimation** : ~6 days, 9 phases
**Date** : 2026-05-22

Each phase is independently deployable unless flagged otherwise. Tick boxes as work lands.

---

## Phase 0 — Preparation (~0.5j, not deployable solo) ✅

- [x] Add `version Int @default(0)` to `UserConversationPreferences` in `packages/shared/prisma/schema.prisma:1773-1822`
- [x] Generate Prisma migration locally (do NOT run on prod yet) — MongoDB schema, no SQL migration needed; field is non-breaking (existing docs read as default `0`)
- [x] In `packages/shared/types/socketio-events.ts` (around line 237) add event constants:
  - [x] `USER_PREFERENCES_REORDERED = 'user:preferences-reordered'`
  - [x] `CATEGORY_CREATED = 'category:created'`
  - [x] `CATEGORY_UPDATED = 'category:updated'`
  - [x] `CATEGORY_DELETED = 'category:deleted'`
  - [x] `CATEGORIES_REORDERED = 'categories:reordered'`
- [x] Define matching `ServerEvents` payload types (`UserPreferencesUpdatedEventData` upgraded to discriminated union: user-level `{userId, category}` + new conversation-scoped `{userId, conversationId, version, reset, preferences}`)
- [x] Create `services/gateway/src/utils/socket-broadcast.ts` with `broadcastToUser(fastify, userId, event, payload)` helper (per design §8.2)
- [x] Write failing jest tests for endpoints in `services/gateway/src/__tests__/` — RED (3 in conversation-preferences-broadcast.test.ts, 4 in category-broadcast.test.ts, plus 5 GREEN helper tests in socket-broadcast.test.ts)

## Phase 1 — Gateway emissions (~0.5j, **deployable solo**, non-breaking) ✅

In `services/gateway/src/routes/conversation-preferences.ts`:
- [x] `PUT /user-preferences/conversations/:id` — Prisma upsert with `version: { increment: 1 }`; emit `USER_PREFERENCES_UPDATED` with full payload + version
- [x] `DELETE /user-preferences/conversations/:id` — emit `{ conversationId, reset: true, version: 0 }`
- [x] `POST /user-preferences/conversations/reorder` — emit `USER_PREFERENCES_REORDERED { updates }`

In the categories route file (`/me/preferences/categories`):
- [x] `POST` — emit `CATEGORY_CREATED`
- [x] `PATCH /:id` — emit `CATEGORY_UPDATED`
- [x] `DELETE /:id` — emit `CATEGORY_DELETED`
- [x] `POST /reorder` — emit `CATEGORIES_REORDERED`
- [x] Phase 0 tests now GREEN (12/12 across the 3 broadcast suites)
- [x] Total diff: ~110 lines across gateway + shared (event constants + payload types + 2 route files + helper)
- [ ] Deploy on staging first; verify with a manual `socket.on()` listener — _pending sysadmin action_

### Web compatibility shim (Phase 1 side-effect)
- [x] Widened `MeeshySocketIOService.onPreferencesUpdated` / `SocketIOOrchestrator.onPreferencesUpdated` listener type to the new union
- [x] `use-socket-cache-sync.ts` narrows on `'category' in data` before invalidating React Query cache; conversation-scoped variant is currently ignored (consumed iOS-side in later phases; web wiring deferred)

## Phase 2 — SDK Models (~0.5j, deployable, rétro-compat)   <!-- ✅ DONE (10/10) -->

In `packages/MeeshySDK/Sources/MeeshySDK/Models/`:
- [x] New file `ConversationUserState.swift` — struct per design §4.1 (Codable, Hashable, Sendable); include `version`, `lastSyncedAt`, `pendingMutationCount`, plus local-only `isLocked`, `hasDraft`, `draftPreview`
- [x] New file `UserStateMutation.swift` — enum per §4.2 with `Codable` round-trip + tolerant decoding for future cases
- [x] Modify `CoreModels.swift:92-328` `MeeshyConversation`:
  - [x] Add `public var userState: ConversationUserState`
  - [x] Convert each existing per-user `var` (lines 110, 140, 147-163) into a deprecated computed property forwarding to `userState`
  - [x] Update decoder so existing JSON keys still populate the nested struct
- [x] Unit tests:
  - [x] Codable round-trip with `.sortedKeys`
  - [x] Defaults
  - [x] Hashable / Equatable
  - [x] Tolerant decoding (unknown mutation case → skip without crash)

## Phase 3 — Outbox SQLite (~1j, deployable)   <!-- ✅ DONE (14/15, schemaVersion drop test manquant) -->

In `packages/MeeshySDK/Sources/MeeshySDK/Store/` (sibling of `StoryDraftStore.swift`):
- [x] `ConversationStateOutbox.swift` — `public actor` per §4.5
- [x] GRDB schema: `conversation_outbox_tasks(id TEXT PK, convId TEXT, mutationJSON TEXT, createdAt INTEGER, attempts INTEGER, nextRetryAt INTEGER NULL, schemaVersion INTEGER)`
- [x] `enqueue(_:)` coalescing rules per §4.5:
  - [x] Single-field mutations (pinned/muted/mentions/archived/customName/reaction/section/order) overwrite prior unsent tasks
  - [x] Tag mutations (`setTags`/`addTag`/`removeTag`) fuse to final `setTags(finalArray)`
  - [x] `markAsRead`/`markAsUnread` last-write-wins
  - [x] `deleteForUser`/`leave` NEVER coalesce
- [x] `flush(via:)` — pop ready tasks (`now ≥ nextRetryAt`), dispatch via closure
- [x] Retry backoff: `nextRetryAt = now + min(60s, 2^attempts × 5s)`
- [x] `markCompleted(_:)` / `markFailed(_:reason:)`
- [x] `pendingCount(for:)`
- [ ] Tests:
  - [x] Enqueue/dequeue
  - [x] Each coalescing rule (one test per rule)
  - [x] Retry backoff math
  - [x] Kill-app-restart round-trip (in-memory then reload)
  - [ ] `schemaVersion` mismatch → drop with log

## Phase 4 — ConversationStore (~1.5j, deployable, not yet wired to UI)   <!-- ⏳ PARTIEL (18 done / 7 open ‘Phase 4 bis’ / 1 uncertain) -->

In `packages/MeeshySDK/Sources/MeeshySDK/Store/ConversationStore.swift`:
- [x] `public actor ConversationStore` with `.shared` singleton (§4.3)
- [x] State: `conversations: [String: MeeshyConversation]`, per-conv `CurrentValueSubject`, `listSubject`
- [ ] Injectables (default `.shared`): `CacheCoordinator`, `ConversationStateOutbox`, `PreferenceServiceProviding`, `ConversationServiceProviding`
- [x] Read API: `conversation(id:)`, `publisher(for:)`, `listPublisher()`
- [x] Hydration (SWR) — handle each `CacheResult` case explicitly, NEVER `.value`:
  - [x] `hydrate(_:)`, `hydrateList(_:)`, `hydrateFromCache()` <!-- hydrateFromCache 2026-06-04 (SWR clé "list") -->
- [x] `apply(_:for:)` pipeline (§6):
  - [x] Snapshot → optimistic mutation → `version += 1` candidate → publish
  - [x] Enqueue in outbox → dispatch
  - [x] ACK → overwrite with authoritative `version` from server response, set `lastSyncedAt`
  - [x] 4xx → rollback snapshot, `outbox.markFailed`, rethrow
  - [x] Transient (5xx / network) → leave in outbox, no rollback
- [x] Composite helpers:
  - [x] `createSectionAndAssign(name:color:icon:toConversation:)` <!-- 2026-06-04 -->
  - [x] `reorderConversations(_:)` <!-- 2026-06-04 : POST /user-preferences/reorder + optimistic/rollback -->
- [x] Remote application:
  - [x] `applyRemote(UserPreferencesUpdatedEvent)` — ignore if `event.version <= local.version`; reset:true → defaults; else apply + bump + publish + cache.save
  - [x] `applyReadReceipt(ReadStatusEvent)` — monotone `lastReadAt`; trust server `unreadCount` <!-- 2026-06-04 -->
  - [x] `applyConversationDeleted(_:)` — remove from store <!-- 2026-06-04 -->
- [x] _Phase 4 bis : wiring socket via `ConversationStoreSocketBridge` (2026-06-04). Routés : `conversation:deleted`→applyConversationDeleted, `user:preferences-reordered`→applyRemoteReorder. **Déférés** (payload socket ≠ entrée store) : `user:preferences-updated` (pas de version/reset, shape plate) et `read-status:updated` (pas de lastReadAt/unreadCount par-user) — méthodes store prêtes, à wirer quand les payloads seront alignés._
- [x] `flushOutbox()` — call on app foreground + network reachability change
- [x] Wire `MessageSocketManager` publishers (add if missing): `userPreferencesUpdated`, `userPreferencesReordered`, `readStatus`, `conversationDeleted` <!-- 2026-06-04 : reordered + conversationDeleted + category:×4 ajoutés ; updated/readStatus existaient -->
- [x] `ConversationStore.applyRemoteReorder` (reorder distant, local-only) + `ConversationStoreSocketBridge` (4 tests) <!-- 2026-06-04 -->
- [x] Gateway émet `conversation:deleted` sur delete-for-me (2 tests jest) <!-- 2026-06-04 -->
- [x] Tests per §10 SDK section:
  - [x] `apply` optimistic visible immediately; version +1 candidate
  - [x] ACK overwrites version
  - [x] 4xx restores snapshot
  - [x] Transient retains in outbox
  - [x] `applyRemote` version gate (ignore stale)
  - [x] `applyRemote` reset:true defaults
  - [x] Multi-subscriber publisher cohérence

## Phase 5 — UserCategoryStore (~0.5j, deployable)   <!-- ✅ DONE (14/14, listeners socket câblés via bridge 2026-06-04) -->

In `packages/MeeshySDK/Sources/MeeshySDK/Store/UserCategoryStore.swift`:
- [x] `public actor UserCategoryStore` with `.shared`
- [x] `categories()`, `publisher()`
- [x] CRUD: `create`, `rename`, `setColor`, `setIcon`, `setExpanded`, `delete`
- [x] `reorder(_:)`
- [x] `applyRemote(CategoryRemoteEvent)` — handle CREATED / UPDATED / DELETED / REORDERED
- [x] Wire socket listeners on `MessageSocketManager` <!-- 2026-06-04 : category:×4 listeners + ConversationStoreSocketBridge -->
- [x] Tests for each CRUD method + reorder + each remote event variant

## Phase 6 — Refactor iOS ViewModels (~1j, deployable)   <!-- 🔲 OUVERT (0/11) — EN COURS -->

In `apps/ios/Meeshy/Features/Main/ViewModels/`:
- [ ] **`ConversationListViewModel.swift`** (~1595 lines today):
  - [ ] Replace internal state with `cancellables`-managed sink on `ConversationStore.shared.listPublisher()`
  - [ ] Delete mutation methods at lines 1221-1373: `togglePin`, `toggleMute`, `markAsRead`, `markAsUnread`, `archiveConversation`, `unarchiveConversation`, `deleteConversation`, `moveToSection`, `setFavoriteReaction`
  - [ ] Verify ~400 lines net removed
- [ ] **`ConversationOptionsViewModel`**:
  - [ ] Slim to ~80 lines
  - [ ] Keep only debounced `customName` (500ms) + tags input drafts
  - [ ] Drop optimistic / rollback / broadcaster / L2-cache logic (deferred to store)
  - [ ] All toggle handlers → `await ConversationStore.shared.apply(...)`
- [ ] **`ConversationViewModel`** (header):
  - [ ] Sink `store.publisher(for: id)`
  - [ ] `onAppear` + `.scenePhase == .active` with `unreadCount > 0` → `store.apply(.markAsRead, for: id)`
- [ ] Leave `ConversationSettingsViewModel` untouched (settings globaux, §14 hors scope)
- [ ] Tests in `apps/ios/MeeshyTests/`:
  - [ ] List VM is read-only mirror, mutation methods gone
  - [ ] Options VM debounce called 1× over 500ms window
  - [ ] Conv VM `markAsRead` triggers correctly on appear + scenePhase

## Phase 7 — UI re-wiring (~0.5j, deployable)   <!-- 🔲 OUVERT (0/10) -->

Per §7 matrix:
- [ ] `ThemedConversationRow` reads snapshot from list VM mirror
- [ ] Swipe leading (pin/mute/lock) → `store.apply(.setPinned | .setMuted | .setLocked)`
- [ ] Swipe trailing (archive/markread/block/hide) → `store.apply(.setArchived | .markAs[Read|Unread] | .deleteForUser)` + `BlockService` for block
- [ ] Context menu long-press (13 actions) → `store.apply(...)` + composite helpers (`createSectionAndAssign`)
- [ ] Section headers → `UserCategoryStore.publisher()` + `setExpanded` / drop → `setSection` / drag → `reorderConversations`
- [ ] `ConversationView` header → `store.publisher(for: id)`
- [ ] `ConversationOptionsSheet` → `store.publisher(for: id)` + `UserCategoryStore.publisher()`
- [ ] `ConversationInfoSheet` → `store.publisher(for: id)` read-only
- [ ] Surface `userState.pendingMutationCount > 0` as "removal pending" UI state for `deleteForUser`/`leave` (§12 risk mitigation: opacity reduce, swipe/long-press masqués)
- [ ] Snapshot tests in MeeshyUITests:
  - [ ] `ThemedConversationRow` × {pinned, muted, archived, unread, customName, reaction, pendingSync, locked, draft}
  - [ ] `ConversationOptionsSheet` × {tous toggles, picker catégories, chips tags, vide, peuplé}

## Phase 8 — Smoke + cleanup (~0.5j)   <!-- 🔲 OUVERT (1 done / gated sur 6-7) -->

- [ ] Delete deprecated computed shims added in Phase 2
- [x] Sweep call sites still touching inline flags; rewrite to `userState.X`
- [ ] Verify ~700 lines of obsolete mutation/optimistic/rollback removed (§13 criterion 6)
- [ ] E2E smoke (XCUITest minimal, §10):
  - [ ] Pin from list → options sheet of same conv reflects without interaction (same Combine tick)
  - [ ] Airplane mode → toggle 5 prefs → restore network → all replayed via outbox, none lost
  - [ ] Mark-as-read on iPhone → iPad sees badge clear via socket
- [ ] Quality gate:
  - [ ] `./apps/ios/meeshy.sh test` GREEN
  - [ ] Gateway vitest GREEN
  - [ ] Web turbo lint GREEN (no regressions)
- [ ] Update `tasks/lessons.md` with anything learned mid-refactor
- [ ] Update this file's "Review" section below

---

## Cross-cutting watchlist (§12)

| Risk | Mitigation | Owner phase |
|---|---|---|
| Cache disque mismatch après changement de struct | Bump GRDB schema version; drop+refetch on mismatch | Phase 2 |
| Outbox tasks pré-upgrade illisibles | `schemaVersion` per task; drop+log if outdated | Phase 3 |
| Socket arrive avant hydratation | `applyRemote` no-op sur conv inconnue; refresh rattrape | Phase 4 |
| Prisme Linguistique régression | Ne pas toucher `resolveUserLanguage()`; store ignore `systemLanguage`/`regionalLanguage` | All |
| `deleteForUser`/`leave` pending au retour user | Conv reste dans store avec `deletedForUserAt`+`pendingMutationCount > 0`; UI degrade | Phase 7 |
| Migration Prisma prod | `Int @default(0)` non-breaking; staging d'abord | Phase 0/1 |
| Re-renders SwiftUI excessifs | `MeeshyConversation` Hashable → dedup; mesurer via Instruments si besoin | Phase 7 |

---

## Critères de succès (§13)

1. [ ] Toutes les options de l'inventaire (§3) câblées via le store
2. [ ] Toutes les surfaces UI (§7) lisent le même snapshot, mutent via le store
3. [ ] Mutation depuis une surface met à jour les autres dans le même tick Combine main
4. [ ] Mutation hors réseau persistée dans outbox SQLite, rejouée au reconnect
5. [ ] Event socket d'un autre device update via versioning sans régression
6. [ ] ~700 lignes de mutation/optimistic/rollback supprimées des ViewModels
7. [ ] Tous tests (SDK + app + gateway) passent + 3 smoke manuels validés

---

## Hors scope (rappel §14)

- Settings globaux conversation (title, avatar, defaultWriteRole, slowMode, autoTranslate)
- Member management (promote/demote/expel/ban)
- Block/unblock (reste sur `BlockService.shared`)
- Préférences de langue per-conversation (Prisme Linguistique)
- UI `clearHistoryBefore` (champ câblé, UI plus tard)
- Cache normalisé / delta sync / CRDT
- Migration `@Observable` (iOS 17+)

---

## Review

_To be filled after Phase 8._
