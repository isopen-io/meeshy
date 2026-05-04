# WhatsApp-Level Reactivity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all perceptible jank and delays — scroll at 60fps, instant message display, zero wasted re-renders.

**Architecture:** Surgical fixes ordered by impact. Each task is independent and produces a measurable improvement. No architectural rewrites — targeted mutations of existing code.

**Tech Stack:** Swift 5.9, SwiftUI, Combine, MeeshySDK

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` | Modify | Remove unnecessary @Published, fix didSet cache invalidation |
| `apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift` | Modify | Fix read-status O(n) copy, add conversation filter on reactions |
| `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift` | Modify | Pre-compute reactionSummaries, pass currentUserId as param |
| `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble+Media.swift` | Modify | Remove AnyView wrapping |
| `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift` | Modify | Fix JSONDecoder data race |
| `packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore.swift` | Modify | Add image downsampling |

---

### Task 1: Fix JSONDecoder data race in MessageSocketManager

The `JSONDecoder` instance is shared across concurrent socket event handlers on background threads. `JSONDecoder` is not thread-safe — concurrent `decode()` calls are undefined behavior.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift:737`

- [ ] **Step 1: Replace shared decoder with per-call decoder**

In `MessageSocketManager.swift`, find the instance property:

```swift
private let decoder = JSONDecoder()
```

Delete it. Then find the `decode<T>` helper function (around line 1537-1563) and change it to create a local decoder:

```swift
// BEFORE (shared, thread-unsafe):
// let decoded = try decoder.decode(T.self, from: jsonData)

// AFTER (local, thread-safe):
let localDecoder = JSONDecoder()
localDecoder.dateDecodingStrategy = .custom { decoder in
    let container = try decoder.singleValueContainer()
    let dateStr = try container.decode(String.self)
    let f1 = ISO8601DateFormatter()
    f1.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = f1.date(from: dateStr) { return d }
    let f2 = ISO8601DateFormatter()
    f2.formatOptions = [.withInternetDateTime]
    if let d = f2.date(from: dateStr) { return d }
    throw DecodingError.dataCorruptedError(in: container, debugDescription: "Bad date: \(dateStr)")
}
let decoded = try localDecoder.decode(T.self, from: jsonData)
```

NOTE: Check how the decoder's `dateDecodingStrategy` is configured in `init()` and replicate it in the local decoder. If `.iso8601` is used, use that. If a custom strategy, copy it exactly.

- [ ] **Step 2: Verify build**

Run: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`

- [ ] **Step 3: Commit**

```
fix(sdk): create local JSONDecoder per socket decode call to prevent data race
```

---

### Task 2: Remove AnyView in media grid cells

`AnyView` wrapping every media cell defeats SwiftUI's structural identity and diff optimization — the runtime cannot skip re-evaluation.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble+Media.swift:72-90`

- [ ] **Step 1: Remove AnyView wrapper from gridCell**

In `ThemedMessageBubble+Media.swift`, find the `gridCell` function (line ~72). Change:

```swift
// BEFORE:
AnyView(
    ZStack {
        Color.black
        // ... switch content ...
    }
)

// AFTER: remove AnyView wrapper, keep the ZStack directly
ZStack {
    Color.black
    // ... switch content unchanged ...
}
```

The function is already `@ViewBuilder` — the `AnyView` wrapper is unnecessary.

- [ ] **Step 2: Verify build**

Run: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`

- [ ] **Step 3: Commit**

```
perf(ios): remove AnyView wrapping in media grid cells for SwiftUI diff optimization
```

---

### Task 3: Convert isProgrammaticScroll from @Published to plain var

`isProgrammaticScroll` is toggled on/off within 0.5s during programmatic scrolls, causing 2 gratuitous full re-renders of ConversationView. It is only read by guards in `loadOlderMessages`/`loadNewerMessages` — it does NOT drive any UI.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:112`

- [ ] **Step 1: Remove @Published**

Change line 112 from:

```swift
@Published var isProgrammaticScroll = false
```

To:

```swift
var isProgrammaticScroll = false
```

- [ ] **Step 2: Verify build — fix any compiler errors**

If any view reads `$isProgrammaticScroll` (the projected value), that will fail. Search for `$isProgrammaticScroll` and remove any bindings. This property is only used as a boolean guard — it should not be observed.

Run: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`

- [ ] **Step 3: Commit**

```
perf(ios): demote isProgrammaticScroll from @Published to plain var

It is only used as a guard in loadOlderMessages/loadNewerMessages,
never drives UI. The toggle on/off within 0.5s was causing 2
gratuitous full re-renders of the entire ConversationView.
```

---

### Task 4: Fix read-status:updated — in-place mutation instead of O(n) array copy

Every read receipt copies the entire messages array, then reassigns it, invalidating all 11 lazy caches. Use targeted index mutation instead.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift:421-437`

- [ ] **Step 1: Replace snapshot copy with in-place mutation**

Find the `readStatusUpdated` handler (line ~410-437). Replace:

```swift
// BEFORE:
var snapshot = delegate.messages
var didChange = false
for i in snapshot.indices.reversed() {
    guard snapshot[i].isMe else { continue }
    let current = snapshot[i].deliveryStatus
    guard current != .read else { break }
    if newStatus.isBetterThan(current) {
        snapshot[i].deliveryStatus = newStatus
        snapshot[i].deliveredCount = summary.deliveredCount
        snapshot[i].readCount = summary.readCount
        didChange = true
    }
}
if didChange {
    delegate.messages = snapshot
}
```

With:

```swift
// AFTER: in-place mutation — no array copy, targeted didSet
for i in delegate.messages.indices.reversed() {
    guard delegate.messages[i].isMe else { continue }
    let current = delegate.messages[i].deliveryStatus
    guard current != .read else { break }
    if newStatus.isBetterThan(current) {
        delegate.messages[i].deliveryStatus = newStatus
        delegate.messages[i].deliveredCount = summary.deliveredCount
        delegate.messages[i].readCount = summary.readCount
    }
}
```

NOTE: This still fires `messages.didSet` per mutation. But it avoids the O(n) array copy. The didSet will fire once per mutated message instead of once for the entire array reassignment.

- [ ] **Step 2: Verify build**

Run: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`

- [ ] **Step 3: Commit**

```
perf(ios): use in-place mutation for read-status updates instead of O(n) array copy

Each read receipt was copying the entire messages array then
reassigning it, invalidating all 11 lazy caches. Now mutates
directly at the target index.
```

---

### Task 5: Pass currentUserId to ThemedMessageBubble — remove AuthManager.shared from leaf view

`reactionSummaries` accesses `AuthManager.shared.currentUser?.id` inside the bubble body, called 3 times per body evaluation. This is a singleton access in a leaf view rendered in a loop.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift` (call site)

- [ ] **Step 1: Add currentUserId property to ThemedMessageBubble**

In `ThemedMessageBubble.swift`, add a new `let` property near the top (with other `let` properties):

```swift
let currentUserId: String
```

Then in `reactionSummaries` (line ~169-188), replace:

```swift
let currentUserId = AuthManager.shared.currentUser?.id ?? ""
```

With just removing that line — `currentUserId` is now the stored property.

Also check `buildAvailableFlags()` (line ~887) for any `AuthManager.shared.currentUser` access. If it accesses the user, pass the needed data as a stored property too.

- [ ] **Step 2: Update the call site in ConversationView+MessageRow.swift**

In `ConversationView+MessageRow.swift`, find where `ThemedMessageBubble(...)` is constructed (line ~49-100). Add:

```swift
currentUserId: viewModel.currentUserId,
```

If `viewModel.currentUserId` doesn't exist, use `AuthManager.shared.currentUser?.id ?? ""` at the call site (it's the parent view, not a leaf).

- [ ] **Step 3: Update ThemedMessageBubble.Equatable if needed**

The `Equatable` extension (line ~1540) does NOT need `currentUserId` — it never changes during a session.

- [ ] **Step 4: Verify build**

Run: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`

- [ ] **Step 5: Commit**

```
perf(ios): pass currentUserId as let property to ThemedMessageBubble

Removes AuthManager.shared singleton access from leaf view
rendered in a loop. reactionSummaries was calling it 3× per
body evaluation across all visible bubbles.
```

---

### Task 6: Add conversation filter to reactionAdded/reactionRemoved socket subscriptions

Unlike other subscriptions, `reactionAdded` and `reactionRemoved` do NOT filter by `conversationId`. Every reaction event across ALL conversations fires the handler in every active `ConversationSocketHandler`.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift:353-380`

- [ ] **Step 1: Add .filter to reactionAdded subscription**

Find the `reactionAdded` subscription (line ~352-367). Currently:

```swift
socketManager.reactionAdded
    .receive(on: DispatchQueue.main)
    .sink { ...
```

Change to:

```swift
socketManager.reactionAdded
    .filter { $0.conversationId == convId }
    .receive(on: DispatchQueue.main)
    .sink { ...
```

Check that `ReactionUpdateEvent` (or whatever the event type is) has a `conversationId` property. If it doesn't, check what properties exist on the event and whether it can be filtered. If no `conversationId` exists, skip this step and document why.

- [ ] **Step 2: Add .filter to reactionRemoved subscription**

Same change for `reactionRemoved` (line ~369-380):

```swift
socketManager.reactionRemoved
    .filter { $0.conversationId == convId }
    .receive(on: DispatchQueue.main)
    .sink { ...
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`

- [ ] **Step 4: Commit**

```
perf(ios): add conversation filter to reaction socket subscriptions

Prevents unnecessary handler execution for reactions in
unrelated conversations.
```

---

### Task 7: Add image downsampling in DiskCacheStore

Images are decoded at full resolution — a 4MP photo uses 16MB of bitmap memory. With 30 images visible, that's 480MB. WhatsApp downsamples to display size.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore.swift:297`

- [ ] **Step 1: Add downsampling function**

In `DiskCacheStore.swift`, add a private static helper before the `image(for:)` method:

```swift
private static func downsampledImage(data: Data, maxPixelSize: CGFloat = 1200) -> UIImage? {
    let options: [CFString: Any] = [
        kCGImageSourceShouldCache: false,
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: maxPixelSize
    ]
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
          let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    else { return UIImage(data: data) }
    return UIImage(cgImage: cgImage)
}
```

- [ ] **Step 2: Use downsampling in image(for:) method**

In the `image(for:)` method (line ~287-313), replace both `UIImage(data: data)` calls with `downsampledImage(data: data)`:

```swift
// BEFORE:
if let data = result.value?.first, let image = UIImage(data: data) {

// AFTER:
if let data = result.value?.first, let image = Self.downsampledImage(data: data) {
```

And:

```swift
// BEFORE:
let image = UIImage(data: data) else { return nil }

// AFTER:
let image = Self.downsampledImage(data: data) else { return nil }
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`

- [ ] **Step 4: Commit**

```
perf(sdk): downsample images to 1200px max on decode

Full-resolution bitmaps were accumulating in memory (4MP =
16MB each). Uses CGImageSource thumbnail API for efficient
downsampling without decoding the full image first.
```

---

### Task 8: Selective cache invalidation in messages.didSet

Currently ALL 11 lazy caches are invalidated on every single mutation to `messages[]` — even a delivery status change. Most caches only need invalidation when messages are added/removed, not when fields are mutated in-place.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:28-41`

- [ ] **Step 1: Split cache invalidation into structural vs content**

Replace the current `didSet`:

```swift
@Published var messages: [Message] = [] {
    didSet {
        _messageIdIndex = nil
        _messagesByDate = nil
        _topActiveMembers = nil
        _mediaSenderInfoMap = nil
        _allVisualAttachments = nil
        _mediaCaptionMap = nil
        _allAudioItems = nil
        _replyCountMap = nil
        _mentionDisplayNames = nil
        _mentionCandidates = nil
        _cachedLastReceivedIndex = nil
    }
}
```

With:

```swift
@Published var messages: [Message] = [] {
    didSet {
        let countChanged = messages.count != oldValue.count
        // Always invalidate the index — any mutation might change message order or IDs
        _messageIdIndex = nil
        _cachedLastReceivedIndex = nil

        // Only invalidate structural caches when messages are added/removed
        if countChanged {
            _messagesByDate = nil
            _topActiveMembers = nil
            _mediaSenderInfoMap = nil
            _allVisualAttachments = nil
            _mediaCaptionMap = nil
            _allAudioItems = nil
            _replyCountMap = nil
            _mentionDisplayNames = nil
            _mentionCandidates = nil
        }
    }
}
```

This means in-place mutations (delivery status, reactions, edit, pin) no longer rebuild date groups, media lists, or mention candidates — only the message index is rebuilt.

- [ ] **Step 2: Verify build**

Run: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`

- [ ] **Step 3: Commit**

```
perf(ios): selective cache invalidation in messages.didSet

Only invalidate structural caches (messagesByDate, media lists,
mentions) when message count changes. Field mutations (delivery
status, reactions, edits) no longer trigger O(n) recomputation
of date groups and media indices.
```

---

## Verification

After all 8 tasks:

- [ ] **Full build**: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`
- [ ] **Run app**: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh run`
- [ ] **Manual scroll test**: Open a conversation with 100+ messages, scroll rapidly up and down — should be 60fps smooth
- [ ] **Manual send test**: Send a text message — should appear in <100ms
- [ ] **Manual media test**: Open a conversation with images — should load from cache instantly on revisit
