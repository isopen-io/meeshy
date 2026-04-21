# Conversation Scroll Stability + Immediate Cache Sync

**Status:** Approved (2026-04-15)
**Scope:** `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`, `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`

## Problem

Two independent bugs observed in the iOS conversation UI.

### Bug 1 — Scroll bouncing on conversation open

When a user opens a conversation, the scroll position briefly snaps to bottom,
then bounces back up and down in a visible cascade before settling. The user
described it as "un effet debounce qui remonte et revient infiniment".

Reproduction: open any conversation from the list. The bouncing happens before
any user interaction.

Root cause: `ConversationView.messageScrollView` has ~10 `.onChange` handlers
each running `proxy.scrollTo("bottom_spacer", anchor: .bottom)` with a
`.spring` animation. During the opening phase, several of them fire in
sequence:

- `newMessageAppended` increments on cache load (`ConversationViewModel:628`)
  and again on API refresh (`:842`)
- `composerHeight` changes as the composer mounts (`GeometryReader` fires
  from 0 to the measured height)
- `keyboardHeight` can change if restoration logic adjusts it
- `isLoadingInitial` false transition fires an explicit scrollTo
- `.defaultScrollAnchor(.bottom)` re-anchors whenever content height changes
  (images load, translations arrive, avatars resolve)

Each spring animation (~0.3s) overlaps the next trigger, producing a visible
bounce. A comment at line 949 already recognizes the GeometryReader re-firing
pattern for the keyboard case, but the guard only covers the keyboard.

### Bug 2 — Messages received via socket are not persisted immediately

When a message arrives via Socket.IO (`ConversationSocketHandler:183`):

```swift
delegate.messages.append(newMsg)
delegate.newMessageAppended += 1
```

The in-memory `@Published messages` is updated. The view renders. But
`CacheCoordinator.shared.messages.save(...)` is never called. The only place
that writes the cache is `refreshMessagesFromAPI()` (`ConversationViewModel:630`),
which runs on explicit refresh.

Consequence: if the app is force-quit or crashes between an API refresh and
the next, every socket-delivered message since the last refresh is lost from
the local cache. On next launch, the user sees an older snapshot.

## Goals

1. Scroll opens smoothly. One scroll to bottom, no visible bounce, regardless
   of how many `@Published` properties update during the opening phase.
2. Every mutation of `messages` — socket, API refresh, optimistic send,
   edit, delete — reaches the local cache within ~300 ms without a manual
   hook at each site.

## Non-goals

- Writing to a persistent on-disk DB layer (SQLite/GRDB). The existing
  `CacheCoordinator.messages` store is the target. Disk-level persistence
  is a follow-up if needed.
- Changing the overall scroll architecture (`.defaultScrollAnchor(.bottom)`
  stays, all existing `onChange` handlers stay — just guarded).
- Unifying every scroll trigger into a single intent (considered as
  Approach B; rejected because the refactor surface is larger than the bug
  warrants).

## Design

### Bug 1 — Initial scroll guard

Add a single opening-phase flag in `ConversationView`:

```swift
@State private var initialScrollCompleted: Bool = false
```

The initial-load scroll handler sets the flag to `true` after 400 ms — long
enough for the opening-phase `@Published` cascades to settle but short enough
that a message arriving right after open still gets a reasonable scroll:

```swift
.onChange(of: viewModel.isLoadingInitial) { wasLoading, isLoading in
    guard wasLoading && !isLoading, !viewModel.messages.isEmpty else { return }
    initialScrollCompleted = false
    viewModel.markProgrammaticScroll()
    proxy.scrollTo("bottom_spacer", anchor: .bottom)  // no animation
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
        initialScrollCompleted = true
    }
}
```

The five opening-phase-dangerous handlers add a guard on the flag:

| Handler | Current | Added guard |
|---|---|---|
| `newMessageAppended` | scroll if nearBottom or isMe | `&& initialScrollCompleted` |
| `composerHeight` | scroll if > old + 20 | `&& initialScrollCompleted` |
| `keyboardHeight` | scroll on grow | `&& initialScrollCompleted` |
| `pendingAttachments.count` | scroll if nearBottom | `&& initialScrollCompleted` |
| `audioRecorder.isRecording` | scroll if nearBottom | `&& initialScrollCompleted` |

Handlers left untouched (no bounce risk during opening):
`isLoadingOlder`, `scrollToBottomTrigger` (user action), `scrollToMessageId`
(highlight jump), `typingUsernames`, `composerState.isUploading`.

**Edge case**: if a socket message arrives in the 400 ms window, it is
appended, shown, and the unread badge increments via the `else` branch of
`newMessageAppended`. The user can tap the badge to scroll.

### Bug 2 — Sink-driven cache persistence

Add to `ConversationViewModel`:

```swift
private var messagesPersistCancellable: AnyCancellable?
```

In `init` (after other state wiring, before socket subscription):

```swift
messagesPersistCancellable = $messages
    .dropFirst()
    .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
    .sink { [weak self] snapshot in
        Task { await self?.persistMessagesSnapshot(snapshot) }
    }
```

New method:

```swift
private func persistMessagesSnapshot(_ snapshot: [Message]) async {
    guard let convId = conversation?.id else { return }
    await CacheCoordinator.shared.messages.save(snapshot, for: convId)
}
```

Any mutation of `@Published messages` — socket append, API replace,
optimistic insert, edit, delete — triggers a save 300 ms after the last
mutation. Bulk updates (e.g. API returning 50 messages) produce a single
save, not 50.

## Risks

- **Missed scroll for messages arriving during the 400 ms opening window.**
  Mitigation: the unread badge handles it, matching behavior when the user
  is scrolled up in an existing session. Acceptable.
- **Debounce swallows a save if `messages` keeps mutating continuously for
  longer than 300 ms.** In practice, `messages` quiesces within a few hundred
  ms of any activity. If this becomes an issue, lower to 150 ms or add a
  max-wait.
- **`conversation?.id` is nil at init.** `persistMessagesSnapshot` guards
  against this; the sink fires harmlessly until a conversation is attached.

## Files

- `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` — add
  `@State initialScrollCompleted`, update 6 `.onChange` handlers.
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` —
  add `messagesPersistCancellable`, wire sink in init, add
  `persistMessagesSnapshot(_:)`.

No other files, no API changes, no migration.

## Verification

Manual, on simulator:

1. Open a conversation with 20+ messages. Scroll settles at bottom on the
   first frame, no visible bounce. Repeat 5 times to confirm deterministic.
2. While in the conversation, send a message. Scrolls to bottom once.
3. Receive a message (have a peer send one). Scrolls to bottom once if near
   bottom, otherwise badge appears.
4. Open a conversation, receive 5 messages in quick succession, force-quit
   the app via Cmd+Shift+H + swipe. Reopen, reopen the conversation — the
   5 messages are present before any API refresh completes.
5. Open a conversation, wait 400 ms + 1 s with no activity. Check logs for
   a single persist call, not a cascade.
