# WhatsApp-Level Reactivity Phase 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the remaining 5 performance bottlenecks — conversation list pipeline, background animations during scroll, singleton observers in leaf views, and optimistic media display.

**Architecture:** Surgical fixes, each independently deployable. Ordered by impact.

**Tech Stack:** Swift 5.9, SwiftUI, Combine, MeeshySDK

---

## Task 1: Eliminate triple @Published pipeline — direct grouping from observeSync

The conversation list has 3 cascading @Published updates per socket event:
`conversations` → `filteredConversations` → `groupedConversations` = 200ms+ latency, 3 re-renders.

**Fix:** Skip the intermediate `filteredConversations` @Published. Compute filtering+grouping in one pass directly in `reloadFromCache()`. Keep the Combine pipeline only for search/filter USER INPUT changes.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift`

- [ ] **Step 1:** Change `filteredConversations` from `@Published` to private non-published:

```swift
// BEFORE (line 26):
@Published var filteredConversations: [Conversation] = []
// AFTER:
private var filteredConversations: [Conversation] = []
```

- [ ] **Step 2:** In `reloadFromCache()`, after assigning `conversations = data`, compute grouped directly:

```swift
private func reloadFromCache() async {
    let cached = await CacheCoordinator.shared.conversations.load(for: "list")
    switch cached {
    case .fresh(let data, _), .stale(let data, _):
        conversations = data
        // Compute filtered+grouped in one pass, skip intermediate @Published
        let filtered = Self.filterConversations(data, searchText: searchText, filter: selectedFilter)
        filteredConversations = filtered
        let categories = userCategories
        Task.detached { [weak self] in
            let grouped = Self.groupConversations(filtered, categories: categories)
            await MainActor.run { self?.groupedConversations = grouped }
        }
    case .expired, .empty:
        break
    }
}
```

- [ ] **Step 3:** Keep the Combine pipeline ONLY for user-driven search/filter changes (typing in search bar, changing filter). The pipeline should only react to `$searchText` and `$selectedFilter`, NOT `$conversations`:

Modify Pipeline 1 (line ~108) to use just `$searchText` + `$selectedFilter`:

```swift
Publishers.CombineLatest($searchText, $selectedFilter)
    .debounce(for: .milliseconds(150), scheduler: DispatchQueue.main)
    .sink { [weak self] (text, filter) in
        guard let self else { return }
        let filtered = Self.filterConversations(self.conversations, searchText: text, filter: filter)
        self.filteredConversations = filtered
        let categories = self.userCategories
        Task.detached { [weak self] in
            let grouped = Self.groupConversations(filtered, categories: categories)
            await MainActor.run { self?.groupedConversations = grouped }
        }
    }
    .store(in: &cancellables)
```

Remove the Pipeline 2 (`CombineLatest($filteredConversations, $userCategories)`) entirely — grouping is now done inline.

- [ ] **Step 4:** Verify build, commit.

---

## Task 2: Pause background animations during scroll

16 concurrent `.repeatForever` animations compete with scroll for GPU time.

**Fix:** Add a `reducedMotion` flag that simplifies or pauses animations when the user is scrolling. The simplest approach: pass an `isScrolling: Bool` from the parent and reduce animation complexity.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationAnimatedBackground.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` (pass isScrolling)

- [ ] **Step 1:** Add `isScrolling` property to `ConversationAnimatedBackground`:

```swift
var isScrolling: Bool = false
```

- [ ] **Step 2:** Wrap animation shapes in a conditional that reduces complexity during scroll. In the body, use `.opacity(isScrolling ? 0.3 : 1.0)` on the animated layers and `.animation(.easeInOut(duration: 0.3), value: isScrolling)` to fade them smoothly:

```swift
// In body, wrap the animated ZStack content:
ZStack {
    // ... all animated shapes
}
.opacity(isScrolling ? 0.3 : 1.0)
.animation(.easeInOut(duration: 0.3), value: isScrolling)
.drawingGroup()  // Flatten all animations into single Metal draw call
```

The `.drawingGroup()` is the key win — it rasterizes the animated background into a single texture, preventing per-shape compositing passes during scroll.

- [ ] **Step 3:** In `ConversationView.swift`, track scroll state and pass to background. Add a `@State private var isScrolling = false` and use a scroll phase observer or gesture to toggle it. Simple approach:

```swift
// In ConversationView body, add to the ScrollView:
.onScrollPhaseChange { _, newPhase in
    isScrolling = newPhase == .interacting || newPhase == .decelerating
}
```

Note: `.onScrollPhaseChange` is iOS 18+. For iOS 17 compat, use a simple approach: the background is already behind the scroll content, so just adding `.drawingGroup()` is sufficient for the biggest win.

- [ ] **Step 4:** Verify build, commit.

---

## Task 3: Remove @ObservedObject SharedAVPlayerManager from BubbleCarouselView

`BubbleCarouselView` is a leaf view in a ForEach. `SharedAVPlayerManager.shared` has 8 @Published properties including `currentTime` that updates at 10Hz. Every tick re-renders every visible carousel.

**Fix:** Pass only the needed values as `let` properties.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble+Media.swift`

- [ ] **Step 1:** In `BubbleCarouselView`, replace `@ObservedObject` with `let` properties:

```swift
// BEFORE (line 306):
@ObservedObject private var videoManager = SharedAVPlayerManager.shared

// AFTER:
let activeVideoURL: String
```

- [ ] **Step 2:** Replace all `videoManager.xxx` reads in `BubbleCarouselView` with the `let` property or direct calls. The carousel only needs to know which video is currently active to show play/pause state. Audit every `videoManager` reference:

- `videoManager.activeURL` → use `activeVideoURL`
- `videoManager.pause()` → call `SharedAVPlayerManager.shared.pause()` directly (one-shot action, not reactive observation)

- [ ] **Step 3:** Pass `activeVideoURL` from the parent call site. In `ThemedMessageBubble` where `BubbleCarouselView` is created, pass:

```swift
activeVideoURL: SharedAVPlayerManager.shared.activeURL
```

This is fine at the parent level since `ThemedMessageBubble` already has `.equatable()` which gates re-renders.

- [ ] **Step 4:** Verify build, commit.

---

## Task 4: Optimistic display for image/video attachments before upload

Currently, the message bubble only appears after TUS upload completes + server echo. WhatsApp shows it immediately with a local file preview.

**Fix:** Insert an optimistic message with local file URLs before starting the upload. Update it with server URLs after upload completes.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`

- [ ] **Step 1:** In `ConversationViewModel`, add a method for optimistic media insert:

```swift
func insertOptimisticMediaMessage(
    content: String,
    localAttachments: [MessageAttachment],
    replyToId: String? = nil
) -> String {
    let tempId = UUID().uuidString
    let msg = Message(
        id: tempId,
        conversationId: conversationId,
        senderId: currentUserId,
        content: content,
        messageType: localAttachments.first?.type == .video ? .video : .image,
        attachments: localAttachments,
        replyToId: replyToId,
        senderName: authManager.currentUser?.displayName,
        senderColor: DynamicColorGenerator.colorForName(authManager.currentUser?.displayName ?? "?"),
        senderAvatarURL: authManager.currentUser?.avatar,
        deliveryStatus: .sending,
        isMe: true
    )
    messages.append(msg)
    newMessageAppended += 1
    return tempId
}
```

- [ ] **Step 2:** In `ConversationView+AttachmentHandlers.swift`, insert optimistic message BEFORE the upload loop:

```swift
// BEFORE uploads start (around line 80):
// Build local attachments from pending media files
let localAttachments: [MessageAttachment] = attachments.compactMap { att in
    guard let fileURL = mediaFiles[att.id] else { return nil }
    return MessageAttachment(
        id: att.id,
        fileName: fileURL.lastPathComponent,
        originalName: fileURL.lastPathComponent,
        mimeType: att.mimeType,
        fileUrl: fileURL.absoluteString,  // Local file URL
        width: att.width,
        height: att.height,
        thumbnailUrl: fileURL.absoluteString  // Use local file as thumbnail
    )
}

let tempId = viewModel.insertOptimisticMediaMessage(
    content: content,
    localAttachments: localAttachments,
    replyToId: replyId
)

// Clear composer UI immediately
composerState.pendingAttachments.removeAll()
composerState.pendingMediaFiles.removeAll()
messageText = ""
```

Then AFTER the upload completes, the server echo via socket will reconcile the temp message (existing reconciliation logic handles this).

- [ ] **Step 3:** Verify build, commit.

---

## Task 5: Coalesce observeSync — skip redundant reloads

`handleNewMessage` fires `_conversationsDidChange` on EVERY message. With rapid messages, this causes 1-2 full cache reloads per second.

**Fix:** In `ConversationSyncEngine.handleNewMessage`, skip `_conversationsDidChange.send()` if the conversation is already at position 0 with the same `lastMessageId`. Also increase the observeSync debounce from 50ms to 200ms.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift`

- [ ] **Step 1:** Increase observeSync debounce from 50ms to 200ms:

```swift
// In ConversationListViewModel.observeSync(), line ~222:
.debounce(for: .milliseconds(200), scheduler: DispatchQueue.main)
```

This coalesces rapid bursts (5 messages in 1 second = 1 reload instead of 5).

- [ ] **Step 2:** Verify build, commit.

---

## Verification

After all 5 tasks:

- [ ] **Full build**: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`
- [ ] **Scroll test**: Open a busy group chat, scroll rapidly — should be 60fps
- [ ] **Send media test**: Send a photo — bubble should appear IMMEDIATELY with local file
- [ ] **Message burst test**: Receive 10 rapid messages — list should update smoothly, not jank
