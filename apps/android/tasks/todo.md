# Loop slice — Conversation swipe actions (pin / mute / archive)

Vertical slice porting the iOS conversation-list swipe actions to Android,
on the existing SWR + outbox foundation. Mirrors
`ConversationListView+Rows.swift` (leading: pin/mute; trailing: archive).
Mark-read already exists (`markReadOptimistic`); block/lock/hide need
separate managers/endpoints and are deferred to later loops.

Gateway endpoint: `PUT /api/v1/user-preferences/conversations/:id`
(partial body `{ isPinned?, isMuted?, isArchived? }`).

## Steps (TDD)
- [x] `core/model`: `ConversationPreferencesUpdate` (@Serializable, nullable fields)
- [x] `core/network`: `ConversationApi.updatePreferences(id, body)` (PUT)
- [x] `sdk-core/outbox`: `OutboxKind.UPDATE_CONVERSATION_PREFS` + `ConversationPrefField`
      + per-field target key helper; coalescer rule = replace same kind+target
      (last-write-wins per field)
- [x] `sdk-core/outbox`: sender in `OutboxFlushWorker` (parse cid#field, partial PUT)
- [x] `sdk-core/conversation`: `setPinnedOptimistic` / `setMutedOptimistic`
      / `setArchivedOptimistic` (mutate cached prefs + enqueue, no-op when unchanged)
- [x] `feature/conversations`: pure `ConversationSwipeActions` derivation (port iOS set)
- [x] `feature/conversations`: VM intents `togglePin/toggleMute/toggleArchive`
- [x] `feature/conversations`: swipe UI in `ConversationListScreen`
- [x] Tests: coalescer rule, repo optimistic (Robolectric), swipe derivation, VM intents
- [x] `./meeshy.sh test` green + `:app:assembleDebug` green

## Review
Shipped a full vertical slice for conversation **pin / mute / archive** on the
existing SWR + outbox foundation, porting `ConversationListView+Rows.swift`:

- **Pure layer** (`ConversationSwipeActions`): UI-agnostic derivation of the
  leading (pin, mute) and trailing (archive) action set + current toggled state.
- **SDK plumbing**: `ConversationPreferencesUpdate` DTO; `ConversationApi.updatePreferences`
  (`PUT user-preferences/conversations/:id`, partial body); new outbox kind
  `UPDATE_CONVERSATION_PREFS` with a **per-field target key** (`cid#FIELD`) so a
  pin and a mute toggle on the same conversation coalesce independently
  (last-write-wins per field); sender wired in `OutboxFlushWorker`.
- **Repository**: `set{Pinned,Muted,Archived}Optimistic` mutate the cached
  payload's `preferences` instantly (no-op when unchanged) and enqueue the
  mutation — mirroring `markReadOptimistic`.
- **UI**: `SwipeToDismissBox` (leading=pin, trailing=archive, snap-back so the
  row is a trigger not a dismissal) + long-press `DropdownMenu` covering all
  three actions incl. mute; row now shows pin/mute glyphs. Tints mirror iOS
  (pin=indigo, mute=slate, archive=amber). Strings in EN/FR/ES/PT.

Verification: `:sdk-core` + `:feature:conversations` + `:core:model`
`testDebugUnitTest` green (13 new tests); `:app:assembleDebug` green.

Deferred (separate managers/endpoints): lock, block, mark-unread, hide.
