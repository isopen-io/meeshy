# Real-Time Data Flow Audit Fixes — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 17 real-time data flow bugs across iOS and web — eliminate message duplication, fix stale conversation list previews, fix translation format divergence, and align cache updates to match every socket event.

**Architecture:** Two parallel tracks (Web Track A, iOS Track B) that can be developed simultaneously. Web P0 bugs (dual-write, translation format) are fixed first by consolidating the two parallel update paths into one. iOS fixes add missing ConversationListViewModel subscribers and CacheCoordinator handlers. Final phase is cross-platform review.

**Tech Stack:** TypeScript/React Query/Zustand (web), Swift/SwiftUI/Combine (iOS), Jest (web tests), XCTest (iOS tests)

**Parallelization:** Track A (Web: Tasks 1-5) and Track B (iOS: Tasks 6-9) are fully independent and can run simultaneously. Task 10 (review) runs after both tracks complete.

---

## File Structure

### Web Track A — Modified files

| File | Change |
|------|--------|
| `apps/web/hooks/queries/use-socket-cache-sync.ts` | Become THE single source of truth for all socket→cache updates. Fix translation format. Add audio/transcription handlers. Fix delete without conversationId. Update reactionSummary. |
| `apps/web/hooks/conversations/use-socket-callbacks.ts` | Remove all cache mutation logic — delegate to `useSocketCacheSync`. Keep only UI-specific callbacks (scroll to bottom, mark as read). |
| `apps/web/hooks/queries/use-reactions-query.ts` | Also update `message.reactionSummary` in messages.infinite cache on reaction events. |
| `apps/web/hooks/queries/use-send-message-mutation.ts` | Align optimistic message format to use `_tempId` + `_localStatus` (same as socket path). |
| `apps/web/hooks/queries/use-messages-query.ts` | Add ID dedup guard in `addMessageToCache`. |

### Web Track A — Test files

| File | Purpose |
|------|---------|
| `apps/web/__tests__/hooks/use-socket-cache-sync.test.ts` | Test all cache update paths: new message dedup, edit with lastMessage update, delete without conversationId, translation array format, reaction summary update |

### iOS Track B — Modified files

| File | Change |
|------|--------|
| `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift` | Subscribe to `messageEdited` and `messageDeleted` to update lastMessagePreview |
| `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift` | Add subscribers for translation, transcription, audio events |
| `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` | Invalidate `_allAudioItems` cache on transcription/audio updates. Align soft-delete with CacheCoordinator. |

---

## Track A: Web Fixes (P0 + P1)

### Task 1: Eliminate dual-write — consolidate message cache updates (W1)

The web has TWO parallel update paths for socket events: `useSocketCacheSync` (Path A) and `useSocketCallbacks` (Path B). Both write to `messages.infinite` and `conversations.list`, causing duplicate messages.

**Fix strategy:** `useSocketCacheSync` becomes the SINGLE cache writer. `useSocketCallbacks` is refactored to ONLY do non-cache UI effects (scroll to bottom, focus, mark-as-read).

**Files:**
- Modify: `apps/web/hooks/queries/use-socket-cache-sync.ts`
- Modify: `apps/web/hooks/conversations/use-socket-callbacks.ts`
- Modify: `apps/web/hooks/queries/use-messages-query.ts`
- Test: `apps/web/__tests__/hooks/use-socket-cache-sync.test.ts` (existing file — add tests)

- [ ] **Step 1: Add ID dedup guard to `addMessageToCache` in use-messages-query.ts**

In `apps/web/hooks/queries/use-messages-query.ts`, find `addMessageToCache` function. Add an ID dedup check at the top:

```typescript
const addMessageToCache = (message: Message) => {
  queryClient.setQueryData(
    queryKeys.messages.infinite(conversationId),
    (old: ...) => {
      if (!old) return old;
      // DEDUP: check if message already exists in any page
      for (const page of old.pages) {
        if (page.messages.some(m => m.id === message.id)) return old;
      }
      return {
        ...old,
        pages: old.pages.map((page, index) =>
          index === 0
            ? { ...page, messages: [message, ...page.messages] }
            : page
        ),
      };
    }
  );
  // Same dedup for simple list cache
  queryClient.setQueryData<Message[]>(
    queryKeys.messages.list(conversationId),
    (old) => {
      if (!old) return [message];
      if (old.some(m => m.id === message.id)) return old;
      return [message, ...old];
    }
  );
};
```

- [ ] **Step 2: Remove cache mutations from useSocketCallbacks**

In `apps/web/hooks/conversations/use-socket-callbacks.ts`:

For `onNewMessage` callback: Remove the `addMessage(message)` call and the `setConversations(updater)` that updates lastMessage/unreadCount. Keep ONLY:
- The scroll-to-bottom trigger
- The `POST mark-as-received` call (if it's here and not in useSocketCacheSync)
- Any audio/media-specific UI effects

For `onMessageEdited` callback: Remove the `updateMessage()` call. Keep any UI effects.

For `onMessageDeleted` callback: Remove the `removeMessage()` call. Keep any UI effects.

For `onTranslation` callback: Remove the `updateMessage()` call. Keep the `removeTranslatingState()` and `addUsedLanguages()` calls.

- [ ] **Step 3: Ensure `useSocketCacheSync` handles ALL cache updates**

Verify that `useSocketCacheSync` already handles:
- `handleNewMessage`: message insert + conversation list lastMessage + unread count + conversation reorder
- `handleMessageEdited`: message update + conversation list lastMessage (conditional)
- `handleMessageDeleted`: message removal
- `handleUnreadUpdated`: conversation list unread count

If `handleNewMessage` doesn't update `unreadCount`, add it (increment for non-own messages):
```typescript
// In the conversations.list() update within handleNewMessage:
const isOwnMessage = currentUser && message.senderId === currentUser.id;
// For each conversation match:
unreadCount: isOwnMessage ? conv.unreadCount : (conv.unreadCount || 0) + 1,
```

- [ ] **Step 4: Run tests**

Run: `cd apps/web && npx jest __tests__/hooks/ --no-coverage --forceExit 2>&1 | tail -10`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/web/hooks/queries/use-socket-cache-sync.ts \
       apps/web/hooks/conversations/use-socket-callbacks.ts \
       apps/web/hooks/queries/use-messages-query.ts
git commit -m "fix(web): W1 eliminate dual-write — single cache writer for socket events

useSocketCacheSync is now the ONLY path that mutates React Query cache
from socket events. useSocketCallbacks stripped of all cache mutations,
keeps only UI effects (scroll, mark-as-read). addMessageToCache has
ID dedup guard to prevent duplicate messages."
```

---

### Task 2: Fix translation format divergence (W2)

**Files:**
- Modify: `apps/web/hooks/queries/use-socket-cache-sync.ts`

- [ ] **Step 1: Read the current `handleTranslation` implementation**

Read `apps/web/hooks/queries/use-socket-cache-sync.ts` and find `handleTranslation`. It currently writes translations as `Record<string, string>`. It needs to write as `Translation[]` array (matching the REST API format).

- [ ] **Step 2: Fix the translation cache update to use array format**

Replace the Record-based merge with array-based merge:

```typescript
const handleTranslation = (data: { messageId: string; translations: any[] }) => {
  if (!conversationId) return;

  queryClient.setQueryData(
    queryKeys.messages.infinite(conversationId),
    (old: any) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page: any) => ({
          ...page,
          messages: page.messages.map((m: any) => {
            if (m.id !== data.messageId) return m;
            // Merge translations as array, dedup by targetLanguage
            const existingTranslations = Array.isArray(m.translations) ? m.translations : [];
            const newTranslations = [...existingTranslations];
            for (const t of data.translations) {
              const targetLang = t.language || t.targetLanguage;
              const idx = newTranslations.findIndex((et: any) =>
                (et.language || et.targetLanguage) === targetLang
              );
              if (idx >= 0) {
                newTranslations[idx] = t;
              } else {
                newTranslations.push(t);
              }
            }
            return { ...m, translations: newTranslations };
          }),
        })),
      };
    }
  );
};
```

- [ ] **Step 3: Build to verify**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep "use-socket-cache-sync" | head -5`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/hooks/queries/use-socket-cache-sync.ts
git commit -m "fix(web): W2 fix translation format — use Translation[] array, not Record<string,string>

handleTranslation now merges translations as an array (matching REST API
format), deduplicating by targetLanguage. Previously wrote as Record which
caused type mismatch with components expecting arrays."
```

---

### Task 3: Fix delete without conversationId + reactionSummary stale (W3, W4)

**Files:**
- Modify: `apps/web/hooks/queries/use-socket-cache-sync.ts`
- Modify: `apps/web/hooks/queries/use-reactions-query.ts`

- [ ] **Step 1: Fix handleMessageDeleted to work without conversationId**

The `message:deleted` event only has `messageId`. The current code requires `conversationId` to construct the query key. Fix by scanning ALL cached conversation message queries:

```typescript
const handleMessageDeleted = (data: { messageId: string }) => {
  // If we have a specific conversationId, use it directly
  if (conversationId) {
    queryClient.setQueryData(
      queryKeys.messages.infinite(conversationId),
      (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            messages: page.messages.filter((m: any) => m.id !== data.messageId),
          })),
        };
      }
    );
  }
  // Also invalidate all message queries to pick up deletions
  queryClient.invalidateQueries({ queryKey: queryKeys.messages.all });
};
```

- [ ] **Step 2: Update reactionSummary on message objects when reactions change**

In `apps/web/hooks/queries/use-reactions-query.ts`, find where `reaction:added` and `reaction:removed` are handled. After updating `reactionKeys.message(messageId)`, also update the message in `messages.infinite`:

```typescript
// After updating reactionKeys.message(messageId), add:
// Update reactionSummary on the message object itself
queryClient.setQueryData(
  queryKeys.messages.infinite(conversationId),
  (old: any) => {
    if (!old) return old;
    return {
      ...old,
      pages: old.pages.map((page: any) => ({
        ...page,
        messages: page.messages.map((m: any) => {
          if (m.id !== messageId) return m;
          const summary = { ...m.reactionSummary } || {};
          if (isAdd) {
            summary[event.emoji] = (summary[event.emoji] || 0) + 1;
          } else {
            summary[event.emoji] = Math.max(0, (summary[event.emoji] || 0) - 1);
            if (summary[event.emoji] === 0) delete summary[event.emoji];
          }
          return { ...m, reactionSummary: summary, reactionCount: Object.values(summary).reduce((a: number, b: number) => a + b, 0) };
        }),
      })),
    };
  }
);
```

Note: The `conversationId` must be available. Read how the hook gets it — it may need to be extracted from the event data or from the message cache.

- [ ] **Step 3: Commit**

```bash
git add apps/web/hooks/queries/use-socket-cache-sync.ts \
       apps/web/hooks/queries/use-reactions-query.ts
git commit -m "fix(web): W3+W4 fix delete without conversationId + update reactionSummary on messages

handleMessageDeleted now invalidates all message queries when no
conversationId is available. Reaction events now also update
message.reactionSummary in messages.infinite cache."
```

---

### Task 4: Fix optimistic message format + add audio/transcription cache (W7, W6)

**Files:**
- Modify: `apps/web/hooks/queries/use-send-message-mutation.ts`
- Modify: `apps/web/hooks/queries/use-socket-cache-sync.ts`

- [ ] **Step 1: Align optimistic message format in useSendMessageMutation**

Find the optimistic message creation in `use-send-message-mutation.ts`. It currently uses `id: temp-${Date.now()}`. Change to use `_tempId` and a proper temp ID:

```typescript
const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const optimisticMessage = {
  ...messageData,
  id: tempId,
  _tempId: tempId,
  _localStatus: 'sending' as const,
  // ... rest of optimistic message
};
```

This makes the format compatible with `useSocketCacheSync`'s dedup logic which matches on `_tempId` + `_localStatus === 'sending'`.

- [ ] **Step 2: Add audio/transcription handlers to useSocketCacheSync**

In `use-socket-cache-sync.ts`, add handlers for:

```typescript
// Transcription ready — update attachment transcription in message cache
const handleTranscriptionReady = (data: { messageId: string; attachmentId: string; transcription: any }) => {
  if (!conversationId) return;
  queryClient.setQueryData(
    queryKeys.messages.infinite(conversationId),
    (old: any) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page: any) => ({
          ...page,
          messages: page.messages.map((m: any) => {
            if (m.id !== data.messageId) return m;
            const attachments = (m.attachments || []).map((att: any) =>
              att.id === data.attachmentId
                ? { ...att, transcription: data.transcription }
                : att
            );
            return { ...m, attachments };
          }),
        })),
      };
    }
  );
};

// Audio translation — update attachment translations in message cache
const handleAudioTranslation = (data: { messageId: string; attachmentId: string; language: string; translatedAudio: any }) => {
  if (!conversationId) return;
  queryClient.setQueryData(
    queryKeys.messages.infinite(conversationId),
    (old: any) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page: any) => ({
          ...page,
          messages: page.messages.map((m: any) => {
            if (m.id !== data.messageId) return m;
            const attachments = (m.attachments || []).map((att: any) => {
              if (att.id !== data.attachmentId) return att;
              const translations = Array.isArray(att.translations) ? [...att.translations] : [];
              const idx = translations.findIndex((t: any) => t.language === data.language);
              if (idx >= 0) {
                translations[idx] = data.translatedAudio;
              } else {
                translations.push(data.translatedAudio);
              }
              return { ...att, translations };
            });
            return { ...m, attachments };
          }),
        })),
      };
    }
  );
};
```

Wire these handlers to the socket service:
```typescript
const unsubTranscription = meeshySocketIOService.onTranscription(handleTranscriptionReady);
const unsubAudioTranslation = meeshySocketIOService.onAudioTranslationReady?.(handleAudioTranslation);
const unsubAudioProgressive = meeshySocketIOService.onAudioTranslationProgressive?.(handleAudioTranslation);
```

Add cleanup in the return block.

- [ ] **Step 3: Commit**

```bash
git add apps/web/hooks/queries/use-send-message-mutation.ts \
       apps/web/hooks/queries/use-socket-cache-sync.ts
git commit -m "fix(web): W7+W6 align optimistic message format + persist audio/transcription to cache

Optimistic messages now use _tempId+_localStatus matching socket dedup.
Audio transcription and translation events now update attachment data
in React Query message cache (previously lost on navigation)."
```

---

### Task 5: Fix unread count for filtered conversation lists (W5)

**Files:**
- Modify: `apps/web/hooks/queries/use-socket-cache-sync.ts`

- [ ] **Step 1: Update ALL conversation list query keys on unread change**

Replace the current `handleUnreadUpdated` that only updates the unfiltered list:

```typescript
const handleUnreadUpdated = (data: { conversationId: string; unreadCount: number }) => {
  // Update ALL conversation list queries (with and without filters)
  queryClient.setQueriesData(
    { queryKey: queryKeys.conversations.all },
    (old: any) => {
      if (!old || !Array.isArray(old)) return old;
      return old.map((conv: any) =>
        conv.id === data.conversationId
          ? { ...conv, unreadCount: data.unreadCount }
          : conv
      );
    }
  );
};
```

Note: `setQueriesData` updates all queries matching the prefix, including filtered variants. Verify `queryKeys.conversations.all` is a prefix that matches all conversation list variants.

- [ ] **Step 2: Commit**

```bash
git add apps/web/hooks/queries/use-socket-cache-sync.ts
git commit -m "fix(web): W5 update unread count across all conversation list query variants

Uses setQueriesData with conversations.all prefix to update unreadCount
in ALL filtered conversation list caches, not just the unfiltered one."
```

---

## Track B: iOS Fixes (P1 + P2)

### Task 6: Subscribe ConversationListVM to message:edited and message:deleted (I1, I2)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift`

- [ ] **Step 1: Add `messageEdited` subscription**

In the `setupSocketSubscriptions()` method (or equivalent), add:

```swift
messageSocket.messageEdited
    .receive(on: DispatchQueue.main)
    .sink { [weak self] apiMessage in
        guard let self else { return }
        let msg = apiMessage.toMessage()
        // Update lastMessagePreview if this is the last message
        if let idx = self.conversations.firstIndex(where: { $0.id == msg.conversationId }) {
            if self.conversations[idx].lastMessageId == msg.id {
                self.conversations[idx].lastMessagePreview = msg.content
                self.invalidateCache()
            }
        }
    }
    .store(in: &cancellables)
```

- [ ] **Step 2: Add `messageDeleted` subscription**

```swift
messageSocket.messageDeleted
    .receive(on: DispatchQueue.main)
    .sink { [weak self] event in
        guard let self else { return }
        if let idx = self.conversations.firstIndex(where: { $0.id == event.conversationId }) {
            if self.conversations[idx].lastMessageId == event.messageId {
                self.conversations[idx].lastMessagePreview = ""
                self.conversations[idx].lastMessageId = nil
                self.invalidateCache()
            }
        }
    }
    .store(in: &cancellables)
```

- [ ] **Step 3: Build**

Run: `./apps/ios/meeshy.sh build 2>&1 | tail -5`
Expected: BUILD SUCCEEDED

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift
git commit -m "fix(ios): I1+I2 update conversation list lastMessage on edit/delete

ConversationListViewModel now subscribes to messageEdited and messageDeleted.
lastMessagePreview is updated when the edited/deleted message was the last one."
```

---

### Task 7: Persist translations/transcriptions/audio in CacheCoordinator (I3)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift`

- [ ] **Step 1: Add translation subscription**

In the `setupSubscriptions()` method:

```swift
msgSocket.translationReceived
    .sink { [weak self] event in
        Task { [weak self] in
            await self?.handleTranslationReceived(event)
        }
    }
    .store(in: &cancellables)
```

Add handler:
```swift
private func handleTranslationReceived(_ event: TranslationEvent) {
    guard let convId = event.conversationId ?? findConversationForMessage(event.messageId) else { return }
    messages.update(for: convId) { existing in
        existing.map { msg in
            guard msg.id == event.messageId else { return msg }
            var updated = msg
            let newTranslation = MessageTranslation(
                targetLanguage: event.translations.first?.targetLanguage ?? "",
                translatedContent: event.translations.first?.translatedContent ?? "",
                translationModel: event.translations.first?.translationModel
            )
            if var translations = updated.translations {
                if let idx = translations.firstIndex(where: { $0.targetLanguage == newTranslation.targetLanguage }) {
                    translations[idx] = newTranslation
                } else {
                    translations.append(newTranslation)
                }
                updated.translations = translations
            } else {
                updated.translations = [newTranslation]
            }
            return updated
        }
    }
}
```

- [ ] **Step 2: Add transcription and audio subscriptions (same pattern)**

Similar handlers for `transcriptionReady`, `audioTranslationReady`, `audioTranslationProgressive`, `audioTranslationCompleted`.

- [ ] **Step 3: Build SDK + app**

Run: `cd packages/MeeshySDK && swift test 2>&1 | tail -5`
Run: `./apps/ios/meeshy.sh build 2>&1 | tail -5`
Expected: Both succeed

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift
git commit -m "fix(sdk): I3 persist translations/transcriptions/audio in CacheCoordinator L2 cache

CacheCoordinator now subscribes to translationReceived, transcriptionReady,
and audio translation events. Data persists to GRDB via dirty-tracking."
```

---

### Task 8: Invalidate `_allAudioItems` + align soft-delete (I4, I5)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`

- [ ] **Step 1: Invalidate `_allAudioItems` on transcription/audio changes**

Find the `messageTranscriptions` and `messageTranslatedAudios` `@Published` properties. Add `didSet` to invalidate the computed cache:

```swift
@Published var messageTranscriptions: [String: MessageTranscription] = [:] {
    didSet { _allAudioItems = nil }
}

@Published var messageTranslatedAudios: [String: [MessageTranslatedAudio]] = [:] {
    didSet { _allAudioItems = nil }
}
```

- [ ] **Step 2: Align CacheCoordinator delete with soft-delete**

In `CacheCoordinator.handleMessageDeleted`, change from hard-delete to soft-delete:

```swift
// BEFORE: existing.filter { $0.id != event.messageId }
// AFTER:
existing.map { msg in
    guard msg.id == event.messageId else { return msg }
    var updated = msg
    updated.deletedAt = Date()
    updated.content = ""
    return updated
}
```

- [ ] **Step 3: Build + test**

Run: `./apps/ios/meeshy.sh build 2>&1 | tail -5`
Expected: BUILD SUCCEEDED

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift \
       packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift
git commit -m "fix(ios): I4+I5 invalidate audio cache on updates + align soft-delete

_allAudioItems computed cache now invalidated when messageTranscriptions
or messageTranslatedAudios change. CacheCoordinator message:deleted now
uses soft-delete (deletedAt) consistent with ConversationSocketHandler."
```

---

### Task 9: Fix optimistic reaction participantId (I8)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`

- [ ] **Step 1: Find `toggleReaction` method**

Read the method. It creates an optimistic `MeeshyReaction` with `participantId: currentUserId`. The socket event returns `participantId` which is the Participant.id. These may differ.

- [ ] **Step 2: Use participant ID instead of user ID for optimistic reaction**

Find where the current user's participant is resolved. The ViewModel should have access to the current participant (from the conversation's participant list). Use `currentParticipantId` instead of `currentUserId`:

```swift
// Find the current user's participant in the conversation
let currentParticipantId = participants.first(where: { $0.userId == currentUserId })?.id ?? currentUserId
```

Use this `currentParticipantId` in the optimistic `MeeshyReaction`.

- [ ] **Step 3: Build + commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift
git commit -m "fix(ios): I8 use participantId for optimistic reactions (not userId)

Optimistic reactions now use the current user's Participant.id (from the
conversation participant list) instead of User.id. This ensures dedup
works when the server echoes back reaction:added with the Participant.id."
```

---

## Phase 3: Verification + Review

### Task 10: Full verification + cross-platform review

- [ ] **Step 1: Web — full TypeScript check + tests**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -5
cd apps/web && npx jest --no-coverage --forceExit 2>&1 | tail -10
```

- [ ] **Step 2: Gateway — full tests**

```bash
cd services/gateway && npx jest --no-coverage --forceExit 2>&1 | tail -10
```

- [ ] **Step 3: iOS — build + SDK tests**

```bash
cd packages/MeeshySDK && swift test 2>&1 | tail -10
./apps/ios/meeshy.sh build 2>&1 | tail -5
```

- [ ] **Step 4: Verify no remaining dual-write paths**

```bash
# Web: verify useSocketCallbacks no longer mutates React Query
grep -n "setQueryData\|addMessageToCache\|updateMessageInCache\|removeMessageFromCache\|setConversations" apps/web/hooks/conversations/use-socket-callbacks.ts
```
Expected: ZERO results (all cache mutations removed)

- [ ] **Step 5: Verify translation format consistency**

```bash
# Web: verify translations are always arrays
grep -n "Record<string, string>" apps/web/hooks/queries/use-socket-cache-sync.ts
```
Expected: ZERO results for translation-related code

---

## Feature Status Table (Post-Fix)

| Feature | Web Status | iOS Status | Notes |
|---------|-----------|------------|-------|
| **Messages — new** | OK (deduped) | OK | Single write path on web after fix |
| **Messages — edit** | OK + conv list | OK + conv list | Both platforms update lastMessage |
| **Messages — delete** | OK (any convId) | OK (soft-delete) | Delete now works without conversationId |
| **Reactions — add/remove** | OK + summary | OK | reactionSummary now updated on message |
| **Text translation** | OK (array format) | OK (in-memory) | Web persists to React Query. iOS persists to L2 after fix |
| **Audio transcription** | OK (in cache) | OK (in-memory + L2) | Web persists to React Query after fix |
| **Audio translation** | OK (in cache) | OK (in-memory + L2) | Web persists to React Query after fix |
| **Read receipts** | OK | OK | Zustand (web), Combine (iOS) |
| **Unread count** | OK (all filters) | OK | Web updates all query variants |
| **Typing indicators** | OK | OK | Separate state management |
| **Optimistic messages** | OK (aligned format) | OK | _tempId format aligned |
| **Optimistic reactions** | OK | OK (participantId) | iOS uses correct participant ID |
| **Conv list — lastMessage** | OK | OK | Edit + delete both handled |
| **Conv list — reorder** | OK | OK | New messages bump to top |
| **Conv list — unread badge** | OK | OK | Badge + widget updated |
| **Offline resilience** | Partial | OK (GRDB L2) | Web: React Query GC 30min. iOS: persistent |
| **Translation persistence** | React Query only | L2 after fix | Web loses on tab close. iOS survives restart |
| **Push notifications** | N/A (backend) | OK | Wired in previous fix |
| **Mention notifications** | OK (previous fix) | OK | Both platforms |

## Remaining for Premium UX (not in this plan)

| Item | Platform | Effort | Priority |
|------|----------|--------|----------|
| React Query IndexedDB persistence | Web | 1 day | P2 |
| Offline message queue (send while offline) | Web | 2 days | P2 |
| Translation L2 persistence in CacheCoordinator | iOS | 0.5 day | Done in this plan |
| `conversation:left` UI handling (remove from list) | Both | 0.5 day | P3 |
| `system:message` display in conversation | Both | 1 day | P3 |
| `attachment-status:updated` UI (upload progress) | Both | 1 day | P3 |
| Location sharing events | Both | 3 days | P4 (feature not built) |
| Social feed translation events | Both | 0.5 day | P4 |
