# Path A Mutation Callsites — migration status

## Task 1.6 COMPLETE — Audit + remove all remaining direct vm.messages mutations (Group A)

All optimistic-update callsites now write through `MessagePersistenceActor`; the
`MessageStore → ConversationViewModel` store observation surfaces every change.

A lint invariant test (`MeeshyTests/Unit/Architecture/SingleSourceOfTruthTests.swift`)
patrols the Group A mutation patterns and will fail if future code reintroduces them.

### New persistence APIs added to `MessagePersistenceActor.swift`

- `markUndeleted(localId:)` — rollback for optimistic soft-delete
- `updatePinned(localId:pinnedAt:pinnedBy:)` — optimistic pin/unpin
- `updateBlurred(localId:isBlurred:)` — toggle blurred effect flag
- `markConsumed(localId:)` — set blurred flag + clear content (view-once consumed)

### Group A sites migrated

| Method | Migration |
|--------|-----------|
| `toggleReaction()` | `persistence.appendReaction` / `persistence.removeReaction` via Task |
| `subscribeToQueueReconciliation` ReactionQueue rollback | same persistence calls in sink Task |
| `deleteMessage(.local)` | removed `messages.remove(at:)`; LocallyHiddenMessagesStore + `_messagesByDate = nil` is sufficient |
| `deleteMessage(.everyone)` | `try? await persistence.markDeleted` + rollback `markUndeleted` |
| `deleteAttachment()` | `try? await persistence.updateAttachmentsJson` (optimistic + rollback) |
| `togglePin()` | `try? await persistence.updatePinned` (optimistic + rollback) |
| `consumeViewOnce()` | `try? await persistence.updateViewOnceCount` |
| `markMessageAsConsumed()` | `Task { try? await persistence.markConsumed }` |
| `editMessage()` | `try? await persistence.markEdited` (optimistic + rollback) |

---

## Task 1.5 COMPLETE — sendMessage optimistic send + queue reconciliation

`sendMessage()` no longer appends directly to `self.messages`. The optimistic
insert and all state transitions (serverAck, sendFailed, retryExhausted) go
through `MessagePersistenceActor`; the `MessageStore → ConversationViewModel`
store observation surfaces every change automatically.

Sites migrated:
- `messages.append(optimisticMessage)` in online send path → removed; GRDB `insertOptimistic` was already there
- `messages[idx].deliveryStatus = .sent` after server ack → removed; `applyEvent(.serverAck)` was already there
- `messages[idx].deliveryStatus = .sending` in catch block → replaced with `persistence.applyEvent(.sendFailed(error))`
- `reconcileQueuedSend(tempId:serverId:)` → removed entirely (was the only caller of `messages[idx].deliveryStatus = .sent` in queue path)
- `subscribeToQueueReconciliation` OfflineQueue/RetryQueue `.retrySucceeded` sinks → now call `persistence.applyEvent(.serverAck(...))`
- `subscribeToQueueReconciliation` RetryQueue `.retryExhausted` sink → now calls `persistence.applyEvent(.retryExhausted)`
- `newMessageAppended` increment → moved into `subscribeToMessageStore` (fires when store emits a count increase)

Side effects preserved:
- `OfflineQueue.shared.enqueue` in offline path — unchanged
- `MessageRetryQueue.shared.enqueue` in catch block — unchanged
- `pendingServerIds[tempId] = responseData.id` — retained (socket handler reconciliation)
- `persistMessagesUsingServerIds()` call on success — retained (CacheCoordinator legacy cache sync)
- All non-messages effects (ephemeralDuration, isBlurEnabled, pendingEffects, draftMentions, isSending) — unchanged

---

## Task 1.4 COMPLETE — ConversationSocketHandler.swift

All `delegate.messages` direct mutations have been removed from
`ConversationSocketHandler.swift`. Every event now writes through
`MessagePersistenceActor`; the `MessageStore → ConversationViewModel`
observation chain surfaces changes automatically.

Sites migrated:
- Server ACK in-place upgrade: `delegate.messages[idx] = existing` → `persistence.applyEvent(.serverAck) + persistence.updateServerAckedFields`
- Attachment refresh for existing message: `delegate.messages[idx] = apiMsg.toMessage(...)` → `persistence.updateAttachmentsJson`
- New message arrival: `delegate.messages.append(msg)` → `persistence.bufferIncoming` (already existed, Path A dropped)
- Edit: `delegate.messages[idx] = updated` → `persistence.markEdited` (already existed, Path A dropped)
- Delete: `delegate.messages[idx] = updated` → `persistence.markDeleted` (already existed, Path A dropped)
- Reaction add: `delegate.messages[idx].reactions.append(reaction)` → `persistence.appendReaction` (new method)
- Reaction remove: `delegate.messages[idx].reactions.removeAll` → `persistence.removeReaction` (new method)
- Read status loop: `delegate.messages[i] = msg` → `persistence.bufferBatchDelivery` (already existed, Path A dropped)
- Attachment status (touch): `delegate.messages[msgIdx].updatedAt = Date()` → `persistence.touchUpdatedAt` (new method)
- ViewOnce count: `delegate.messages[idx].viewOnceCount = ...` → `persistence.updateViewOnceCount` (already existed, Path A dropped)

UI-only signals retained as-is (not messages mutations):
- `delegate.lastUnreadMessage = msg` — unread scroll anchor
- `delegate.newMessageAppended += 1` — scroll-to-bottom trigger
- `delegate.typingUsernames` — typing indicator
- `delegate.evictViewOnceMedia(message:)` — media cache eviction (calls into media store, not messages array)
- `delegate.markMessageAsConsumed` — view-once state flag

---

## Task 2 COMPLETE — Group B migration (Followup #2)

All Group B sites have been migrated to persistence-driven observation, except the
3 deferred jump-to-message windowed state callsites (architectural skip, documented below).

### New persistence APIs added to `MessagePersistenceActor.swift`

- `upsertFromAPIMessages([APIMessage])` — full-fidelity upsert of REST API batches (attachments, reactions, reply/forward blobs, delivery counters)
- `deleteAll(conversationId:)` — wipes all GRDB rows for a conversation (403/access revoked)
- `deleteExpiredEphemeral(before: Date)` — removes expired ephemeral messages
- `updateDeliveryCounters(localId:deliveredCount:readCount:deliveredToAllAt:readByAllAt:)` — merge-only delivery counter update (no downgrade)

### Group B sites migrated

| Original line | Context | Migration applied |
|---------------|---------|-------------------|
| 744 | `subscribeToMessageStore()` — GRDB observation OUTPUT | **Kept** — correct write site |
| 876 | `loadMessages()` — cache hit `.fresh` | `messageStore.loadInitial()` — no assignment |
| 880 | `loadMessages()` — cache hit `.stale` | `messageStore.loadInitial()` — no assignment |
| 898 | `loadMessages()` — cache miss | `refreshMessagesFromAPI()` → upsert + store drives |
| 970 | `refreshMessagesFromAPI()` — after merge with API | `persistence.upsertFromAPIMessages` + `messageStore.loadInitial()` |
| 1020 | `handleAccessRevoked()` — clear on 403 | `persistence.deleteAll(conversationId:)` + store emits empty |
| 1137/1140 | `observeSync()` — delivery-status merge | `persistence.updateDeliveryCounters` per record + `bufferIncoming` for new |
| 1180 | `loadOlderMessages()` — after fetching older page | `messageStore.loadOlder(before:)` |
| append(offlineMessage) | offline send path | `persistence.insertOptimistic` via `Task.detached` |
| append(msg) | `insertOptimisticAudioMessage` | `persistence.insertOptimistic` via `Task.detached` |
| `messages.remove(at:)` + `removeAll` | `retryMessage` / `removeFailedMessage` | `persistence.markDeleted(localId:deletedAt:)` |
| `removeAll { expiresAt <= now }` | `removeExpiredMessages` | `persistence.deleteExpiredEphemeral(before:)` |
| `messages.append(contentsOf: newMessages)` | `syncMissedMessages` | `persistence.upsertFromAPIMessages` |

### Group B sites SKIPPED (jump-to-message windowed state — architectural constraint)

These 3 callsites are part of a temporary windowed view (jump to search result, paginate newer,
return to latest). Migrating them requires a window-switching mechanism in `MessageStore` that
is out of scope for this task.

| Line (current) | Context | Reason |
|----------------|---------|--------|
| ~2128 | `loadMessagesAround()` — `messages = fetchedMessages` | Jump-window replacement — requires MessageStore window switch |
| ~2168 | `loadNewerMessages()` — `messages.append(contentsOf: genuinelyNew)` | Jump-window pagination — same |
| ~2199 | `returnToLatest()` — `messages = saved` | Jump-window restore — saves/restores pre-jump state |

### Lint tightening

`SingleSourceOfTruthTests.swift` now has TWO lint tests:
1. `test_noDirectOptimisticMutation_of_conversationViewModel_messages` — Group A patterns (unchanged, still passes)
2. `test_wholeArrayMessagesWrite_countIsExact` — asserts exactly 3 whole-array `messages = ...` writes exist (1 legitimate + 2 deferred jump-window). Any new addition triggers failure.

## Group C — Test fixtures (DEFERRED, leave as-is)

Tests in `MeeshyTests/Unit/ViewModels/ConversationViewModelTests.swift` use
direct assignment to seed test state. These will need to be replaced with
`persistence.insertOptimistic(...)` + `await store propagation` patterns.
The lint exempts test files.

Lines with test-only mutations: 309, 320, 331, 342, 355, 367, 379, 392, 402,
413, 423, 435, 446, 458, 467, 484, 515, 555, 607, 620, 627, 634, 646, 666,
679, 829, 861, 892, 966, 982.

## Notes

- The `storeObservation` subscription (`messages = mapped` in `subscribeToMessageStore`) is the OUTPUT of the GRDB
  pipeline — it is the correct write site, not a legacy callsite.
- `subscribeToLanguagePreferenceChanges()` delivery-status merges can be replaced by storing delivery status updates
  directly in GRDB, which the store observation will surface automatically.
- All `messages[idx].X = Y` optimistic updates should write to GRDB first;
  the store observation fires within ~16ms (non-scroll) and surfaces the
  change to the view without any explicit `messages` mutation.
