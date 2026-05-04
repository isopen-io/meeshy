# Message Data Flow Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 3 critical data flow mismatches between Gateway, SDK, and iOS app that cause messages to display incorrect content (missing translations on cache-hit, nil senderUserId, stale bubbles).

**Architecture:** Three independent fixes, each surgically targeted:
1. Hydrate `messageTranslations` from `CacheCoordinator` when messages load from cache (no network)
2. Unify `toMessage()` by adding `currentUsername` to the SDK version and deleting the app-layer duplicate
3. Add `updatedAt` to `ThemedMessageBubble.Equatable` to fix stale re-renders

**Tech Stack:** Swift 5.9, SwiftUI, MeeshySDK (SPM local package), XCTest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift` | Modify | Add `currentUsername` param to SDK `toMessage()` |
| `apps/ios/Meeshy/Features/Main/Models/MessageModels.swift` | Modify | Delete duplicate `toMessage()`, keep `SearchResultItem` |
| `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` | Modify | Hydrate translations from cache; update `toMessage` call sites |
| `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift` | Modify | Add `updatedAt` to `Equatable` |
| `apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift` | Modify | Update `toMessage` call sites |
| `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift` | Modify | Add bulk translation lookup method |

---

## Task 1: Hydrate translations from CacheCoordinator on cache-hit

The critical bug: when `ConversationViewModel.loadMessages()` loads from cache (`.fresh` or `.stale`), `messageTranslations` stays empty. The user sees original language instead of their preferred language until a network refresh fires.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`

### Step 1.1: Add bulk translation lookup to CacheCoordinator

- [ ] **Add `cachedTranslations(for messageIds:)` method**

In `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift`, after the existing `cachedTranslations(for messageId:)` method (line ~80), add:

```swift
public func cachedTranslations(for messageIds: [String]) -> [String: [TranslationData]] {
    var result: [String: [TranslationData]] = [:]
    for msgId in messageIds {
        if let translations = cachedTranslations(for: msgId) {
            result[msgId] = translations
        }
    }
    return result
}
```

- [ ] **Verify it compiles**

Run: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`

- [ ] **Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift
git commit -m "feat(sdk): add bulk cachedTranslations(for:) lookup on CacheCoordinator"
```

### Step 1.2: Hydrate messageTranslations after cache load

- [ ] **Add `hydrateTranslationsFromCache()` private method in ConversationViewModel**

In `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`, after the `extractTextTranslations(from:)` method (around line 2077), add:

```swift
private func hydrateTranslationsFromCache() async {
    let msgIds = messages.map(\.id)
    let cached = await CacheCoordinator.shared.cachedTranslations(for: msgIds)
    guard !cached.isEmpty else { return }
    for (msgId, translations) in cached {
        var existing = messageTranslations[msgId] ?? []
        for t in translations {
            let mt = MessageTranslation(
                id: t.id,
                messageId: t.messageId,
                sourceLanguage: t.sourceLanguage,
                targetLanguage: t.targetLanguage,
                translatedContent: t.translatedContent,
                translationModel: t.translationModel,
                confidenceScore: t.confidenceScore
            )
            if let idx = existing.firstIndex(where: { $0.targetLanguage == mt.targetLanguage }) {
                existing[idx] = mt
            } else {
                existing.append(mt)
            }
        }
        messageTranslations[msgId] = existing
    }
}
```

- [ ] **Call it in `loadMessages()` after each cache-hit branch**

In `loadMessages()` (line ~768), after `messages = data` in the `.fresh` and `.stale` branches, add the hydration call:

```swift
case .fresh(let data, _):
    messages = data
    await hydrateTranslationsFromCache()

case .stale(let data, _):
    messages = data
    await hydrateTranslationsFromCache()
    isRevalidating = true
    // ... existing Task for refreshMessagesFromAPI
```

Also after the `.expired/.empty` branch where messages are reloaded from cache (line ~792):

```swift
case .expired, .empty:
    await refreshMessagesFromAPI()
    let reloaded = await CacheCoordinator.shared.messages.load(for: conversationId)
    if let data = reloaded.value {
        messages = data
        // refreshMessagesFromAPI already called extractTextTranslations,
        // but those translations may have been evicted from the
        // CacheCoordinator's in-memory store — no need to double-hydrate.
    }
```

No change needed for `.expired/.empty` since `refreshMessagesFromAPI()` already calls `extractTextTranslations(from:)`.

- [ ] **Verify it compiles**

Run: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`

- [ ] **Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift
git commit -m "fix(ios): hydrate messageTranslations from CacheCoordinator on cache-hit load

Previously, opening a conversation from cache showed messages in
original language until a network refresh because messageTranslations
was never populated from the persisted translation cache."
```

---

## Task 2: Unify `toMessage()` — eliminate app-layer duplicate

The app-layer `toMessage(currentUserId:currentUsername:)` at `apps/ios/.../Models/MessageModels.swift:26` duplicates the SDK's version but drops `senderUserId`, `senderUsername`, `storyReplyToId`, and `thumbHash`. We'll add `currentUsername` to the SDK version (the only feature the app version adds) and delete the duplicate.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift:291`
- Modify: `apps/ios/Meeshy/Features/Main/Models/MessageModels.swift`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` (call sites)
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift` (call sites)

### Step 2.1: Add `currentUsername` parameter to SDK `toMessage()`

- [ ] **Update the SDK `toMessage()` signature and `isMe` logic**

In `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift`, change line 291:

From:
```swift
public func toMessage(currentUserId: String) -> MeeshyMessage {
```

To:
```swift
public func toMessage(currentUserId: String, currentUsername: String? = nil) -> MeeshyMessage {
```

And update the `isMe` computation (line ~418):

From:
```swift
isMe: (sender?.resolvedUserId ?? senderId) == currentUserId,
```

To:
```swift
isMe: (sender?.resolvedUserId ?? senderId) == currentUserId
    || (currentUsername != nil && sender?.username == currentUsername),
```

Where `sender?.username` — check that `APIMessageSender` has a `username` property. If it only has `user?.username`, use `resolvedUsername` which is computed above at line 380:
```swift
let resolvedUsername = sender?.username ?? sender?.user?.username
```

So the final `isMe` becomes:
```swift
isMe: (sender?.resolvedUserId ?? senderId) == currentUserId
    || (currentUsername != nil && resolvedUsername == currentUsername),
```

- [ ] **Verify SDK compiles**

Run: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`

- [ ] **Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift
git commit -m "feat(sdk): add currentUsername param to APIMessage.toMessage for isMe fallback"
```

### Step 2.2: Delete the app-layer duplicate `toMessage()`

- [ ] **Remove the extension from `apps/ios/Meeshy/Features/Main/Models/MessageModels.swift`**

Delete lines 17-193 (the `sharedISO8601Formatter`, the `nonisolated extension APIMessage`, and the entire `toMessage` function). Keep lines 1-15 (`SearchResultItem` struct) which is app-only and unrelated.

The file should become:

```swift
import Foundation
import MeeshySDK

// MARK: - Search Result Item (app-only)

struct SearchResultItem: Identifiable {
    let id: String
    let conversationId: String
    let content: String
    let matchedText: String
    let matchType: String // "content" or "translation"
    let senderName: String
    let senderAvatar: String?
    let createdAt: Date
}
```

- [ ] **Verify it compiles — fix any call-site signature mismatches**

Run: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`

The SDK `toMessage` is `public` and available in the `MeeshySDK` module. The app imports `MeeshySDK`, so the SDK version should be visible. The `typealias Message = MeeshyMessage` and `typealias MessageAttachment = MeeshyMessageAttachment` etc. ensure the return type matches.

If there are call sites using `toMessage(currentUserId:currentUsername:)`, they will now resolve to the SDK version which has the same signature.

If there are compile errors about `nonisolated` mismatches (the app version was `nonisolated extension`), note that the SDK version is also `nonisolated` — the extension is defined outside of any actor context. The `nonisolated` keyword on the app version may have been needed if the app's file was in a `@MainActor` context, but the SDK file is not. This should be fine since `APIMessage` is `Sendable`.

- [ ] **Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Models/MessageModels.swift
git commit -m "fix(ios): remove duplicate app-layer toMessage(), use unified SDK version

The app-layer duplicate was dropping senderUserId, senderUsername,
storyReplyToId, and thumbHash during conversion. The SDK version
now handles the currentUsername fallback for isMe detection."
```

---

## Task 3: Fix `ThemedMessageBubble.Equatable` — add `updatedAt`

When a message's `updatedAt` changes (e.g. server-confirmed edit, metadata-only update), the bubble doesn't re-render because `Equatable` doesn't compare `updatedAt`.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift:1540-1578`

### Step 3.1: Add `updatedAt` to the Equatable comparison

- [ ] **Add the comparison**

In `ThemedMessageBubble.swift`, in the `static func ==` implementation (line ~1541), add after `lhs.message.pinnedAt == rhs.message.pinnedAt &&`:

```swift
lhs.message.updatedAt == rhs.message.updatedAt &&
```

- [ ] **Verify it compiles**

Run: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`

- [ ] **Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift
git commit -m "fix(ios): add updatedAt to ThemedMessageBubble.Equatable

Messages with metadata-only changes (server edit confirmation,
reaction sync without count change) now correctly trigger re-render."
```

---

## Verification

After all three tasks:

- [ ] **Full build**: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`
- [ ] **Run tests**: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh test`
- [ ] **Manual test scenario**:
  1. Open a conversation with translated messages → close app → reopen → messages should show in preferred language immediately (Task 1)
  2. Star a message → check that `senderUserId` is populated in the starred snapshot (Task 2)
  3. Edit a message from another device → bubble should re-render with new content (Task 3)
