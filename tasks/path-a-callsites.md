# Path A Mutation Callsites — migration status

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

The following sites remain in `ConversationViewModel.swift` for Tasks 1.5/1.6:

All sites are in `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`
unless otherwise noted.

## Whole-array assignments (`messages = ...`)

| Line | Context | Proposed persistence call |
|------|---------|--------------------------|
| 743  | `subscribeToMessageStore()` — GRDB observation update | already uses MessageRecord path; this line IS the output |
| 876  | `loadMessages()` — cache hit `.fresh` | replace with `messageStore.loadInitial()` + let store drive |
| 880  | `loadMessages()` — cache hit `.stale` | same |
| 898  | `loadMessages()` — cache miss, after API refresh | same |
| 970  | `refreshMessagesFromAPI()` — after merge with API | move merge into persistence actor |
| 1020 | `handleAccessRevoked()` — clear on 403 | `persistence.deleteAll(conversationId:)` + store will emit empty |
| 1137 | `subscribeToLanguagePreferenceChanges()` — delivery-status merge | update individual records via `persistence.applyEvent` |
| 1140 | same (no new messages, delivery status only) | same |
| 1180 | `loadOlderMessages()` — after fetching older page | `messageStore.loadOlder(before:)` already exists |
| 2133 | `jumpToMessage()` — replace with messages around jump target | load window around target date |
| 2204 | `clearSearch()` — restore saved messages after search | driven by store window; no explicit restore needed |

## Element-level mutations (`messages[idx].field = ...`)

These represent optimistic UI updates that need matching `MessageRecord` updates:

| Line range | Context | Proposed persistence call |
|------------|---------|--------------------------|
| 769        | `subscribeToQueueReconciliation` — mark `.failed` | `persistence.applyEvent(.failPermanent)` |
| 785–792    | `subscribeToQueueReconciliation` — reconcile reactions from queue | `persistence.updateReactions(localId:reactionsJson:)` |
| 818        | `reconcileQueuedSend` — mark `.sent` after server ack | `persistence.applyEvent(.serverAck(...))` |
| 1490–1491  | `sendMessage()` — mark sent + timestamp after success | `persistence.applyEvent(.serverAck(...))` |
| 1542       | `sendMessage()` — mark `.sending` on retry | `persistence.applyEvent(.retry)` |
| 1696–1713  | `toggleReaction()` — optimistic add/remove reaction | `persistence.updateReactions(...)` |
| 1781–1782  | `deleteMessage()` — optimistic delete | `persistence.applyEvent(.softDelete)` |
| 1788       | `deleteMessage()` — rollback on failure | `persistence.applyEvent(.restoreDeleted)` |
| 1810–1818  | `deleteAttachment()` — optimistic remove + rollback | `persistence.updateAttachments(...)` |
| 1832–1853  | `togglePin()` — optimistic pin/unpin + rollback | `persistence.updatePinned(...)` |
| 1867       | `consumeViewOnce()` — update viewOnceCount | `persistence.applyEvent(.viewOnceConsumed(...))` |
| 1890–1891  | `revealBlurredContent()` — un-blur | `persistence.updateBlurred(localId: isBlurred: false)` |
| 1905–1928  | `editMessage()` — optimistic content + rollback | `persistence.applyEvent(.editApplied(...))` |

## Test callsites (`sut.messages = [...]`)

Tests in `MeeshyTests/Unit/ViewModels/ConversationViewModelTests.swift` use
direct assignment to seed test state. These will need to be replaced with
`persistence.insertOptimistic(...)` + `await store propagation` patterns.

Lines with test-only mutations: 309, 320, 331, 342, 355, 367, 379, 392, 402,
413, 423, 435, 446, 458, 467, 484, 515, 555, 607, 620, 627, 634, 646, 666,
679, 829, 861, 892, 966, 982.

## Notes

- The `storeObservation` subscription (line 743) is the OUTPUT of the GRDB
  pipeline — it is the correct write site, not a legacy callsite.
- `subscribeToLanguagePreferenceChanges()` delivery-status merges (lines
  1137/1140) can be replaced by storing delivery status updates directly in
  GRDB, which the store observation will surface automatically.
- All `messages[idx].X = Y` optimistic updates should write to GRDB first;
  the store observation fires within ~16ms (non-scroll) and surfaces the
  change to the view without any explicit `messages` mutation.
