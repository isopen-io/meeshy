# Conversation User State Unification — Implementation Checklist

**Branch** : `claude/conversation-user-state-plan-3veyD`
**Spec** : `docs/superpowers/specs/2026-05-22-conversation-user-state-unification-design.md`
**Estimation** : ~6 days, 9 phases
**Date** : 2026-05-22

Each phase is independently deployable unless flagged otherwise. Tick boxes as work lands.

---

## Phase 0 — Preparation (~0.5j, not deployable solo)

- [ ] Add `version Int @default(0)` to `UserConversationPreferences` in `packages/shared/prisma/schema.prisma:1773-1822`
- [ ] Generate Prisma migration locally (do NOT run on prod yet)
- [ ] In `packages/shared/types/socketio-events.ts` (around line 237) add event constants:
  - [ ] `USER_PREFERENCES_REORDERED = 'user:preferences-reordered'`
  - [ ] `CATEGORY_CREATED = 'category:created'`
  - [ ] `CATEGORY_UPDATED = 'category:updated'`
  - [ ] `CATEGORY_DELETED = 'category:deleted'`
  - [ ] `CATEGORIES_REORDERED = 'categories:reordered'`
- [ ] Define matching `ServerEvents` payload types (mirror `UserPreferencesUpdatedEvent`, include `version` field where relevant)
- [ ] Create `services/gateway/src/utils/socket-broadcast.ts` with `broadcastToUser(fastify, userId, event, payload)` helper (per design §8.2)
- [ ] Write failing vitest tests for each of the 7 endpoints in `services/gateway/__tests__/` — assert emission shape (currently RED)

## Phase 1 — Gateway emissions (~0.5j, **deployable solo**, non-breaking)

In `services/gateway/src/routes/conversation-preferences.ts`:
- [ ] `PUT /user-preferences/conversations/:id` — Prisma upsert with `version: { increment: 1 }`; emit `USER_PREFERENCES_UPDATED` with full payload + version
- [ ] `DELETE /user-preferences/conversations/:id` — emit `{ conversationId, reset: true, version: 0 }`
- [ ] `POST /user-preferences/conversations/reorder` — emit `USER_PREFERENCES_REORDERED { updates }`

In the categories route file (`/me/preferences/categories`):
- [ ] `POST` — emit `CATEGORY_CREATED`
- [ ] `PATCH /:id` — emit `CATEGORY_UPDATED`
- [ ] `DELETE /:id` — emit `CATEGORY_DELETED`
- [ ] `POST /reorder` — emit `CATEGORIES_REORDERED`
- [ ] Phase 0 tests now GREEN
- [ ] Total diff ≈ 66 added lines / ≈ 7 modified
- [ ] Deploy on staging first; verify with a manual `socket.on()` listener

## Phase 2 — SDK Models (~0.5j, deployable, rétro-compat)

In `packages/MeeshySDK/Sources/MeeshySDK/Models/`:
- [ ] New file `ConversationUserState.swift` — struct per design §4.1 (Codable, Hashable, Sendable); include `version`, `lastSyncedAt`, `pendingMutationCount`, plus local-only `isLocked`, `hasDraft`, `draftPreview`
- [ ] New file `UserStateMutation.swift` — enum per §4.2 with `Codable` round-trip + tolerant decoding for future cases
- [ ] Modify `CoreModels.swift:92-328` `MeeshyConversation`:
  - [ ] Add `public var userState: ConversationUserState`
  - [ ] Convert each existing per-user `var` (lines 110, 140, 147-163) into a deprecated computed property forwarding to `userState`
  - [ ] Update decoder so existing JSON keys still populate the nested struct
- [ ] Unit tests:
  - [ ] Codable round-trip with `.sortedKeys`
  - [ ] Defaults
  - [ ] Hashable / Equatable
  - [ ] Tolerant decoding (unknown mutation case → skip without crash)

## Phase 3 — Outbox SQLite (~1j, deployable)

In `packages/MeeshySDK/Sources/MeeshySDK/Store/` (sibling of `StoryDraftStore.swift`):
- [ ] `ConversationStateOutbox.swift` — `public actor` per §4.5
- [ ] GRDB schema: `conversation_outbox_tasks(id TEXT PK, convId TEXT, mutationJSON TEXT, createdAt INTEGER, attempts INTEGER, nextRetryAt INTEGER NULL, schemaVersion INTEGER)`
- [ ] `enqueue(_:)` coalescing rules per §4.5:
  - [ ] Single-field mutations (pinned/muted/mentions/archived/customName/reaction/section/order) overwrite prior unsent tasks
  - [ ] Tag mutations (`setTags`/`addTag`/`removeTag`) fuse to final `setTags(finalArray)`
  - [ ] `markAsRead`/`markAsUnread` last-write-wins
  - [ ] `deleteForUser`/`leave` NEVER coalesce
- [ ] `flush(via:)` — pop ready tasks (`now ≥ nextRetryAt`), dispatch via closure
- [ ] Retry backoff: `nextRetryAt = now + min(60s, 2^attempts × 5s)`
- [ ] `markCompleted(_:)` / `markFailed(_:reason:)`
- [ ] `pendingCount(for:)`
- [ ] Tests:
  - [ ] Enqueue/dequeue
  - [ ] Each coalescing rule (one test per rule)
  - [ ] Retry backoff math
  - [ ] Kill-app-restart round-trip (in-memory then reload)
  - [ ] `schemaVersion` mismatch → drop with log

## Phase 4 — ConversationStore (~1.5j, deployable, not yet wired to UI)

In `packages/MeeshySDK/Sources/MeeshySDK/Store/ConversationStore.swift`:
- [ ] `public actor ConversationStore` with `.shared` singleton (§4.3)
- [ ] State: `conversations: [String: MeeshyConversation]`, per-conv `CurrentValueSubject`, `listSubject`
- [ ] Injectables (default `.shared`): `CacheCoordinator`, `ConversationStateOutbox`, `PreferenceServiceProviding`, `ConversationServiceProviding`
- [ ] Read API: `conversation(id:)`, `publisher(for:)`, `listPublisher()`
- [ ] Hydration (SWR) — handle each `CacheResult` case explicitly, NEVER `.value`:
  - [ ] `hydrate(_:)`, `hydrateList(_:)`, `hydrateFromCache()`
- [ ] `apply(_:for:)` pipeline (§6):
  - [ ] Snapshot → optimistic mutation → `version += 1` candidate → publish
  - [ ] Enqueue in outbox → dispatch
  - [ ] ACK → overwrite with authoritative `version` from server response, set `lastSyncedAt`
  - [ ] 4xx → rollback snapshot, `outbox.markFailed`, rethrow
  - [ ] Transient (5xx / network) → leave in outbox, no rollback
- [ ] Composite helpers:
  - [ ] `createSectionAndAssign(name:color:icon:toConversation:)`
  - [ ] `reorderConversations(_:)`
- [ ] Remote application:
  - [ ] `applyRemote(UserPreferencesUpdatedEvent)` — ignore if `event.version <= local.version`; reset:true → defaults; else apply + bump + publish + cache.save
  - [ ] `applyReadReceipt(ReadStatusEvent)` — monotone `lastReadAt`; trust server `unreadCount`
  - [ ] `applyConversationDeleted(_:)` — remove from store
- [ ] `flushOutbox()` — call on app foreground + network reachability change
- [ ] Wire `MessageSocketManager` publishers (add if missing): `userPreferencesUpdated`, `userPreferencesReordered`, `readStatus`, `conversationDeleted`
- [ ] Tests per §10 SDK section:
  - [ ] `apply` optimistic visible immediately; version +1 candidate
  - [ ] ACK overwrites version
  - [ ] 4xx restores snapshot
  - [ ] Transient retains in outbox
  - [ ] `applyRemote` version gate (ignore stale)
  - [ ] `applyRemote` reset:true defaults
  - [ ] Multi-subscriber publisher cohérence

## Phase 5 — UserCategoryStore (~0.5j, deployable)

In `packages/MeeshySDK/Sources/MeeshySDK/Store/UserCategoryStore.swift`:
- [ ] `public actor UserCategoryStore` with `.shared`
- [ ] `categories()`, `publisher()`
- [ ] CRUD: `create`, `rename`, `setColor`, `setIcon`, `setExpanded`, `delete`
- [ ] `reorder(_:)`
- [ ] `applyRemote(CategoryRemoteEvent)` — handle CREATED / UPDATED / DELETED / REORDERED
- [ ] Wire socket listeners on `MessageSocketManager`
- [ ] Tests for each CRUD method + reorder + each remote event variant

## Phase 6 — Refactor iOS ViewModels (~1j, deployable)

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

## Phase 7 — UI re-wiring (~0.5j, deployable)

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

## Phase 8 — Smoke + cleanup (~0.5j)

- [ ] Delete deprecated computed shims added in Phase 2
- [ ] Sweep call sites still touching inline flags; rewrite to `userState.X`
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
