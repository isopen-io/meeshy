# iOS Performance Optimization Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate UI freezes and achieve WhatsApp-level scrolling fluidity in the conversation list and message views.

**Architecture:** Seven targeted fixes across the SDK data layer, SwiftUI view layer, and Combine pipeline. Each task is independent and can be parallelized. Changes span `packages/MeeshySDK/` (models, networking, color generation) and `apps/ios/` (views, view models).

**Tech Stack:** Swift 6, SwiftUI, Combine, XCTest

---

## Chunk 1: SDK Data Layer Fixes (Tasks 1-3)

### Task 1: Store `colorPalette` as a pre-computed property

The `colorPalette` computed property on `MeeshyConversation` runs the full `DynamicColorGenerator.colorFor(context:)` pipeline (hex parsing, UIColor HSB conversion, hue shifting) on **every access**. It is accessed 13+ times per conversation row render and per message bubble render. This single fix eliminates thousands of color computations per second during scroll.

The same pattern exists in `MessageModels.swift` where `DynamicColorGenerator.colorForName()` is called multiple times per message in `toMessage()`.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift:140-157`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift:240-300`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift` (the `toConversation()` method that builds `MeeshyConversation`)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/CoreModelsTests.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/ColorGenerationTests.swift`

**Context:** `ConversationColorPalette` is defined in `ColorGeneration.swift:319-328`:
```swift
public struct ConversationColorPalette: Sendable {
    public let primary: String
    public let secondary: String
    public let accent: String
    public let saturationBoost: Double
}
```

`MeeshyConversation` currently has computed vars at lines 153-157:
```swift
public var colorPalette: ConversationColorPalette {
    DynamicColorGenerator.colorFor(context: colorContext)
}
public var accentColor: String { colorPalette.primary }
```

- [ ] **Step 1: Write failing test — colorPalette is a stored property**

In `CoreModelsTests.swift`, add a test that verifies `colorPalette` is stable and doesn't recompute:

```swift
func test_colorPalette_isStoredNotRecomputed() {
    let conv = MeeshyConversation(
        id: "test1", identifier: "test-conv", type: .direct,
        title: "Test", memberCount: 5,
        language: .french, theme: .general
    )
    let palette1 = conv.colorPalette
    let palette2 = conv.colorPalette
    XCTAssertEqual(palette1.primary, palette2.primary)
    XCTAssertEqual(palette1.secondary, palette2.secondary)
    XCTAssertEqual(palette1.accent, palette2.accent)
}
```

- [ ] **Step 2: Run test to verify it passes (this test will pass even with computed var — it validates correctness before refactoring)**

Run: `cd packages/MeeshySDK && swift test --filter CoreModelsTests/test_colorPalette_isStoredNotRecomputed`
Expected: PASS

- [ ] **Step 3: Convert `colorPalette` from computed to stored property**

In `CoreModels.swift`, replace the computed vars (lines 153-157) with a stored property. Keep `colorContext` as computed (it's only used during init now). Add `colorPalette` as a stored `let` property:

```swift
// REMOVE these computed vars (lines 153-157):
// public var colorPalette: ConversationColorPalette { ... }
// public var accentColor: String { colorPalette.primary }

// ADD stored properties:
public let colorPalette: ConversationColorPalette
public var accentColor: String { colorPalette.primary }
```

Update the `init` of `MeeshyConversation` to compute `colorPalette` once. Find the existing init (around line 194) and add the computation there. The init needs to build the `ConversationContext` and call `DynamicColorGenerator.colorFor(context:)` once, storing the result.

Add a `colorPalette` parameter to the init with a default that computes from the context:

```swift
public init(id: String = UUID().uuidString, identifier: String, type: ConversationType = .direct,
            title: String? = nil, /* ... existing params ... */,
            language: ConversationContext.ConversationLanguage = .french,
            theme: ConversationContext.ConversationTheme = .general,
            colorPalette: ConversationColorPalette? = nil) {
    // ... existing assignments ...
    self.language = language
    self.theme = theme
    // Compute palette once at construction
    if let palette = colorPalette {
        self.colorPalette = palette
    } else {
        let ctxType: ConversationContext.ConversationType
        switch type {
        case .direct: ctxType = .direct
        case .group: ctxType = .group
        case .public, .global, .community: ctxType = .community
        case .channel: ctxType = .channel
        case .bot: ctxType = .bot
        }
        let ctx = ConversationContext(name: title ?? identifier, type: ctxType, language: language, theme: theme, memberCount: memberCount)
        self.colorPalette = DynamicColorGenerator.colorFor(context: ctx)
    }
}
```

- [ ] **Step 4: Fix `toConversation()` in ConversationModels.swift**

Find the `toConversation()` method on `APIConversation` that constructs `MeeshyConversation`. It should now pass the palette through. Since the init computes it automatically from the context fields, this should work without changes — but verify.

- [ ] **Step 5: Fix `colorForName` calls in `MessageModels.swift:toMessage()`**

At line 247, `colorForName` is called per attachment for `thumbnailColor`. At line 296, it's called again for `senderColor`. Compute once before the loop:

```swift
// Before the attachments loop (around line 239):
let senderDisplayName = sender?.name ?? "?"
let senderColor = DynamicColorGenerator.colorForName(senderDisplayName)

// Line 247 — replace:
thumbnailColor: DynamicColorGenerator.colorForName(sender?.name ?? "?")
// with:
thumbnailColor: senderColor

// Line 296 — replace:
let senderColor = senderDisplayName.map { DynamicColorGenerator.colorForName($0) }
// with (already computed above, just use it):
// Remove this line, senderColor is already defined
```

- [ ] **Step 6: Run all model tests**

Run: `cd packages/MeeshySDK && swift test --filter "CoreModelsTests|ColorGenerationTests|ConversationModelsTests|MessageModelsTests"`
Expected: ALL PASS

- [ ] **Step 7: Run full SDK tests**

Run: `cd packages/MeeshySDK && swift test`
Expected: ALL PASS

- [ ] **Step 8: Build the iOS app**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED (fix any compilation errors from the stored property change)

- [ ] **Step 9: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/CoreModelsTests.swift
git commit -m "perf(sdk): store colorPalette as pre-computed property instead of computed var

Eliminates ~13 DynamicColorGenerator.colorFor() calls per conversation row render
and multiple colorForName() calls per message in toMessage(). Previously recomputed
hex parsing, UIColor HSB conversion, and hue shifting on every property access."
```

---

### Task 2: Cache `ISO8601DateFormatter` in `APIClient`

`APIClient.swift:175-184` creates a new `ISO8601DateFormatter()` inside the `dateDecodingStrategy` closure — called for **every date field** decoded. Loading 30 messages with ~4 date fields each = ~120 formatter allocations per page. `ISO8601DateFormatter` is one of the most expensive Foundation objects to instantiate (backed by ICU internals).

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift:174-184`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Networking/APIResponseTests.swift`

**Context:** `MessageSocketManager` already has the correct pattern with static cached formatters. `APIClient` must mirror it.

- [ ] **Step 1: Write failing test — date decoding produces correct results with cached formatter**

In `APIResponseTests.swift`, add a test that verifies ISO8601 dates with and without fractional seconds are decoded correctly:

```swift
func test_dateDecoding_handlesISO8601WithAndWithoutFractionalSeconds() throws {
    let json = """
    {"createdAt":"2026-03-14T10:30:00.123Z","updatedAt":"2026-03-14T10:30:00Z"}
    """.data(using: .utf8)!

    struct Dates: Decodable { let createdAt: Date; let updatedAt: Date }

    let client = APIClient(baseURL: "https://test.com", token: nil)
    let decoded = try client.decoder.decode(Dates.self, from: json)

    let cal = Calendar(identifier: .gregorian)
    let components = cal.dateComponents(in: TimeZone(identifier: "UTC")!, from: decoded.createdAt)
    XCTAssertEqual(components.hour, 10)
    XCTAssertEqual(components.minute, 30)

    let updComponents = cal.dateComponents(in: TimeZone(identifier: "UTC")!, from: decoded.updatedAt)
    XCTAssertEqual(updComponents.hour, 10)
    XCTAssertEqual(updComponents.minute, 30)
}
```

- [ ] **Step 2: Run test**

Run: `cd packages/MeeshySDK && swift test --filter APIResponseTests/test_dateDecoding`
Expected: PASS (correctness baseline before refactoring)

- [ ] **Step 3: Replace per-call formatter with static cached formatters**

In `APIClient.swift`, replace lines 174-184:

```swift
// BEFORE (lines 174-184):
self.decoder.dateDecodingStrategy = .custom { decoder in
    let container = try decoder.singleValueContainer()
    let dateStr = try container.decode(String.self)
    let iso = ISO8601DateFormatter()
    iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = iso.date(from: dateStr) { return date }
    iso.formatOptions = [.withInternetDateTime]
    if let date = iso.date(from: dateStr) { return date }
    throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateStr)")
}

// AFTER:
self.decoder.dateDecodingStrategy = .custom { decoder in
    let container = try decoder.singleValueContainer()
    let dateStr = try container.decode(String.self)
    if let date = Self.isoFormatterWithFractional.date(from: dateStr) { return date }
    if let date = Self.isoFormatter.date(from: dateStr) { return date }
    throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateStr)")
}
```

Add the static formatters as private static properties on `APIClient`:

```swift
private static let isoFormatterWithFractional: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
}()

private static let isoFormatter: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
}()
```

- [ ] **Step 4: Verify `decoder` is accessible for tests**

Check if `APIClient.decoder` is `public` or `internal`. If not accessible from tests, the test above needs adjustment (use the client's `request` method with mock data instead). If `decoder` is internal and tests are in same module, it works. If not, make `decoder` `public` or use `@testable import`.

- [ ] **Step 5: Run tests**

Run: `cd packages/MeeshySDK && swift test --filter "APIResponseTests|APIErrorTests"`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift packages/MeeshySDK/Tests/MeeshySDKTests/Networking/APIResponseTests.swift
git commit -m "perf(sdk): cache ISO8601DateFormatter as static let in APIClient

Eliminates ~120 formatter allocations per 30-message page load.
ISO8601DateFormatter is backed by ICU internals and is expensive to create."
```

---

### Task 3: Cache `ClientInfoProvider.buildHeaders()` result

`ClientInfoProvider.buildHeaders()` is called on **every HTTP request** (`APIClient.swift:211`). It uses `Mirror(reflecting: systemInfo.machine)` for device model detection — reflection is expensive. The device model, app version, and OS version never change during a session.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Networking/ClientInfoProvider.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Configuration/ClientInfoProviderTests.swift`

- [ ] **Step 1: Write failing test — headers are cached after first call**

```swift
func test_buildHeaders_returnsCachedResult() async {
    let provider = ClientInfoProvider()
    let headers1 = await provider.buildHeaders()
    let headers2 = await provider.buildHeaders()
    // Headers should be identical (same reference or equal values)
    XCTAssertEqual(headers1["X-App-Version"], headers2["X-App-Version"])
    XCTAssertEqual(headers1["X-Device-Model"], headers2["X-Device-Model"])
    XCTAssertEqual(headers1["X-OS-Version"], headers2["X-OS-Version"])
}
```

- [ ] **Step 2: Run test to verify it passes (baseline)**

Run: `cd packages/MeeshySDK && swift test --filter ClientInfoProviderTests/test_buildHeaders_returnsCachedResult`
Expected: PASS

- [ ] **Step 3: Add caching to `ClientInfoProvider`**

`ClientInfoProvider` is an `actor`. Add a cached result property:

```swift
// Add inside the actor:
private var cachedStaticHeaders: [String: String]?

public func buildHeaders() -> [String: String] {
    if let cached = cachedStaticHeaders {
        return cached
    }
    // ... existing header building logic (device model, app version, OS version) ...
    let headers = [/* built headers */]
    cachedStaticHeaders = headers
    return headers
}
```

Note: If `buildHeaders()` includes geo/location data that changes, only cache the static parts (device model, app version, OS version, platform) and merge with dynamic parts (geo) on each call. The geo part already has its own 1h cache (`geoCacheExpiry`).

- [ ] **Step 4: Run tests**

Run: `cd packages/MeeshySDK && swift test --filter ClientInfoProviderTests`
Expected: ALL PASS

- [ ] **Step 5: Build iOS app**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Networking/ClientInfoProvider.swift packages/MeeshySDK/Tests/MeeshySDKTests/Configuration/ClientInfoProviderTests.swift
git commit -m "perf(sdk): cache ClientInfoProvider headers to avoid Mirror reflection per request

Device model, app version, and OS version are constant for the session.
Eliminates Mirror(reflecting:) + utsname system call on every HTTP request."
```

---

## Chunk 2: Animation & Rendering Fixes (Tasks 4-5)

### Task 4: Reduce wave animation density and satellite count

`ConversationBackgroundComponents.swift:265` iterates `stride(from: 0, through: rect.width, by: 1)` — 393 `addLine` calls per frame at 120Hz ProMotion = ~47,000 path operations/second. For global/community conversations, 6 satellites each run 3+ infinite animations = 36+ concurrent animations.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationBackgroundComponents.swift:265`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationAnimatedBackground.swift` (satellite count)

- [ ] **Step 1: Reduce wave path stride from 1 to 4**

In `ConversationBackgroundComponents.swift:265`, change:
```swift
// BEFORE:
for x in stride(from: 0, through: rect.width, by: 1) {

// AFTER:
for x in stride(from: 0, through: rect.width, by: 4) {
```

This reduces path operations by 75% with imperceptible visual difference at the wave's amplitude and frequency.

- [ ] **Step 2: Reduce satellite count from 6 to 3**

Find where `ConvBgSatellite` instances are created (likely in `ConversationAnimatedBackground.swift`). Reduce from 6 to 3 satellites. Search for the loop or repeated instantiation pattern like `ForEach(0..<6)` and change to `ForEach(0..<3)`.

Also update the angle divisor inside `ConvBgSatellite` if it hardcodes `/6`:
```swift
// BEFORE:
baseAngle: CGFloat(index) * .pi * 2 / 6

// AFTER:
baseAngle: CGFloat(index) * .pi * 2 / 3
```

- [ ] **Step 3: Build and verify visually**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

Launch the app and open a global/community conversation to verify the background still looks good with fewer satellites and coarser wave resolution.

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationBackgroundComponents.swift apps/ios/Meeshy/Features/Main/Views/ConversationAnimatedBackground.swift
git commit -m "perf(ios): reduce wave path density (stride 4) and satellite count (6→3)

Wave path: 393→99 addLine calls per frame, imperceptible visual difference.
Satellites: 36→18 concurrent infinite animations for global conversations."
```

---

### Task 5: Add `Equatable` to `ThemedMessageBubble` and apply `.equatable()`

`ThemedMessageBubble` is the most expensive per-cell view — it renders text, attachments, reactions, waveforms, translations, and ephemeral timers. Unlike `ThemedConversationRow` which has `Equatable` + `.equatable()`, message bubbles re-render on **every** `@ObservedObject` change (ThemeManager, SharedAVPlayerManager) without any short-circuit.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift:10-37` (add Equatable extension)
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift:45-100` (apply `.equatable()`)

**Context:** `ThemedConversationRow` already has the pattern at line 538:
```swift
extension ThemedConversationRow: @MainActor Equatable {
    static func == (lhs: ThemedConversationRow, rhs: ThemedConversationRow) -> Bool {
        lhs.conversation.id == rhs.conversation.id &&
        lhs.conversation.renderFingerprint == rhs.conversation.renderFingerprint &&
        lhs.typingUsername == rhs.typingUsername &&
        // ...
    }
}
```

`ThemedMessageBubble` has 24+ `let` input parameters (lines 11-37) that define its visual state.

- [ ] **Step 1: Add `Equatable` extension to `ThemedMessageBubble`**

At the bottom of `ThemedMessageBubble.swift`, add:

```swift
// MARK: - Equatable (permet .equatable() pour eviter les re-renders superflus)
extension ThemedMessageBubble: @MainActor Equatable {
    static func == (lhs: ThemedMessageBubble, rhs: ThemedMessageBubble) -> Bool {
        lhs.message.id == rhs.message.id &&
        lhs.message.content == rhs.message.content &&
        lhs.message.deliveryStatus == rhs.message.deliveryStatus &&
        lhs.message.reactions.count == rhs.message.reactions.count &&
        lhs.message.attachments.count == rhs.message.attachments.count &&
        lhs.contactColor == rhs.contactColor &&
        lhs.isDirect == rhs.isDirect &&
        lhs.preferredTranslation?.translatedContent == rhs.preferredTranslation?.translatedContent &&
        lhs.transcription?.text == rhs.transcription?.text &&
        lhs.showAvatar == rhs.showAvatar &&
        lhs.presenceState == rhs.presenceState &&
        lhs.senderMoodEmoji == rhs.senderMoodEmoji &&
        lhs.isLastInGroup == rhs.isLastInGroup &&
        lhs.isLastReceivedMessage == rhs.isLastReceivedMessage &&
        lhs.activeAudioLanguage == rhs.activeAudioLanguage &&
        lhs.theme.mode == rhs.theme.mode
    }
}
```

- [ ] **Step 2: Apply `.equatable()` at the call site**

In `ConversationView+MessageRow.swift`, find where `ThemedMessageBubble(...)` is instantiated (around line 45-100). After the closing parenthesis of the `ThemedMessageBubble(...)` initializer, add `.equatable()`:

```swift
ThemedMessageBubble(
    message: msg,
    contactColor: accentColor,
    // ... all params ...
)
.equatable()  // ADD THIS
```

- [ ] **Step 3: Build the iOS app**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

- [ ] **Step 4: Verify scrolling in simulator**

Run: `./apps/ios/meeshy.sh run`
Open a conversation with many messages. Scroll up and down rapidly. Verify:
- Messages display correctly
- Reactions still appear
- Translations still show
- Attachments still render

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift
git commit -m "perf(ios): add Equatable to ThemedMessageBubble and apply .equatable()

Mirrors ThemedConversationRow pattern. Prevents unnecessary re-renders of message
bubbles when ThemeManager, PresenceManager, or other ObservedObjects publish changes
that don't affect the bubble's visual state."
```

---

## Chunk 3: ViewModel & Pipeline Fixes (Tasks 6-7)

### Task 6: Cache `cachedLastReceivedIndex` and move filter pipeline off main thread

Two issues in one task since they both modify the same ViewModel files:

**Issue A:** `cachedLastReceivedIndex` in `ConversationView.swift:186-188` is a computed var that scans all messages. Called per visible row = O(N^2) per render.

**Issue B:** `ConversationListViewModel.setupBackgroundProcessing()` at line 90 uses `debounce(scheduler: DispatchQueue.main)` — filtering + grouping runs on main thread.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:27-38` (add cached index to didSet)
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift:186-188` (use cached value)
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift:89-154` (move to background scheduler)

- [ ] **Step 1: Add `_cachedLastReceivedIndex` to `ConversationViewModel`**

In `ConversationViewModel.swift`, add a cached property alongside the existing caches (after line 38):

```swift
// Add with the other cached properties:
private var _cachedLastReceivedIndex: Int??  // nil = not computed, .some(nil) = computed but no match

var cachedLastReceivedIndex: Int? {
    if let cached = _cachedLastReceivedIndex { return cached }
    let result = messages.indices.last(where: { !messages[$0].isMe })
    _cachedLastReceivedIndex = .some(result)
    return result
}
```

Add `_cachedLastReceivedIndex = nil` to the `didSet` on `messages` (line 28-38):

```swift
@Published var messages: [Message] = [] {
    didSet {
        _messageIdIndex = nil
        _topActiveMembers = nil
        _mediaSenderInfoMap = nil
        _allVisualAttachments = nil
        _mediaCaptionMap = nil
        _allAudioItems = nil
        _replyCountMap = nil
        _mentionDisplayNames = nil
        _mentionCandidates = nil
        _cachedLastReceivedIndex = nil  // ADD THIS
    }
}
```

- [ ] **Step 2: Update `ConversationView` to use ViewModel's cached value**

In `ConversationView.swift`, replace lines 186-188:

```swift
// BEFORE:
var cachedLastReceivedIndex: Int? {
    viewModel.messages.indices.last(where: { !viewModel.messages[$0].isMe })
}

// AFTER:
var cachedLastReceivedIndex: Int? {
    viewModel.cachedLastReceivedIndex
}
```

- [ ] **Step 3: Move filter pipeline to background thread**

In `ConversationListViewModel.swift`, change the debounce scheduler at line 90:

```swift
// BEFORE (line 90):
.debounce(for: .milliseconds(150), scheduler: DispatchQueue.main)

// AFTER:
.debounce(for: .milliseconds(150), scheduler: DispatchQueue.global(qos: .userInitiated))
.receive(on: DispatchQueue.main)
```

The `.receive(on: .main)` ensures the `assign(to: &$filteredConversations)` happens on main thread (required for @Published).

For the second pipeline (lines 111-154), the `.sink` closure sets `self?.groupedConversations` which is `@Published` — it must run on main. Add `.receive(on: DispatchQueue.main)` before the `.sink`:

```swift
// BEFORE (around line 151):
.sink { [weak self] newGroups in
    self?.groupedConversations = newGroups
}

// AFTER:
.receive(on: DispatchQueue.main)
.sink { [weak self] newGroups in
    self?.groupedConversations = newGroups
}
```

And change the CombineLatest to also process on background. The `.map` closure (line 112-149) does the heavy grouping/sorting work. Since its input comes from `$filteredConversations` (which now publishes from `.receive(on: .main)`), add a hop to background before the `.map`:

```swift
Publishers.CombineLatest($filteredConversations, $userCategories)
    .subscribe(on: DispatchQueue.global(qos: .userInitiated))
    .map { (filtered, categories) -> [(section: ConversationSection, conversations: [Conversation])] in
        // ... existing grouping logic ...
    }
    .receive(on: DispatchQueue.main)
    .sink { [weak self] newGroups in
        self?.groupedConversations = newGroups
    }
    .store(in: &cancellables)
```

- [ ] **Step 4: Build the iOS app**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

- [ ] **Step 5: Test in simulator**

Run: `./apps/ios/meeshy.sh run`
Test:
- Open conversation list — verify conversations appear correctly
- Search for a conversation — verify filter works
- Switch filter tabs (All, Unread, etc.) — verify grouping works
- Open a conversation with many messages — scroll to verify no jank
- Receive a message — verify the last-received indicator appears on the correct message

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift apps/ios/Meeshy/Features/Main/Views/ConversationView.swift apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift
git commit -m "perf(ios): cache lastReceivedIndex (O(N²)→O(1)) and move filter pipeline off main thread

cachedLastReceivedIndex was a computed var scanning all messages, called per visible row.
Now cached in ViewModel and invalidated on messages.didSet.

Filter/grouping pipeline was running on DispatchQueue.main via debounce scheduler.
Now processes on .global(qos: .userInitiated) with .receive(on: .main) for publishing."
```

---

### Task 7: Pass `isDark: Bool` to leaf views instead of `@ObservedObject ThemeManager`

78 view files each hold `@ObservedObject var theme = ThemeManager.shared`. Any theme property change triggers re-render of **all** subscribed views simultaneously. Leaf views (message bubbles, conversation rows, avatars) only need `isDark: Bool` — they don't need the full observable subscription.

This task focuses on the **highest-impact** views only: `ThemedMessageBubble` and `MeeshyAvatar`. These are rendered per-cell in lists and account for the bulk of unnecessary re-renders.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift:55` (replace @ObservedObject with let)
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift:45-100` (pass isDark)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyAvatar.swift:189` (replace @ObservedObject with let)

**Important:** This is a progressive migration. Do NOT attempt to change all 78 files at once. Start with the two highest-impact views. Other views can be migrated incrementally in future tasks.

- [ ] **Step 1: Add `isDark` parameter to `ThemedMessageBubble`**

In `ThemedMessageBubble.swift`, add an `isDark` parameter and remove the `@ObservedObject`:

```swift
// BEFORE (line 55):
@ObservedObject var theme = ThemeManager.shared

// AFTER:
let isDark: Bool
```

Then find everywhere in `ThemedMessageBubble.swift` (and its extensions like `ThemedMessageBubble+Media.swift`) where `theme.mode.isDark` is used and replace with `isDark`. Search for patterns like:
- `theme.mode.isDark` → `isDark`
- `theme.mode` → remove (if only used for `.isDark`)

Note: If `theme` is used for anything OTHER than `isDark` (e.g., `theme.preference`, `theme.accentColor`), those usages need to be handled case-by-case. Check what `ThemeManager` properties are actually accessed in the bubble.

- [ ] **Step 2: Pass `isDark` at the call site**

In `ConversationView+MessageRow.swift`, where `ThemedMessageBubble(...)` is instantiated, add:

```swift
ThemedMessageBubble(
    message: msg,
    contactColor: accentColor,
    isDark: theme.mode.isDark,  // ADD THIS — theme is already @ObservedObject on ConversationView
    // ... rest of params ...
)
```

- [ ] **Step 3: Add `isDark` parameter to `MeeshyAvatar`**

In `MeeshyAvatar.swift:189`:

```swift
// BEFORE:
@ObservedObject private var theme = ThemeManager.shared

// AFTER:
private let isDark: Bool
```

Add `isDark: Bool = ThemeManager.shared.mode.isDark` as a parameter to `MeeshyAvatar.init` with a default value so existing call sites don't break:

```swift
public init(
    // ... existing params ...,
    isDark: Bool = ThemeManager.shared.mode.isDark
) {
    // ...
    self.isDark = isDark
}
```

Replace all `theme.mode.isDark` usages in `MeeshyAvatar.swift` with `isDark`.

- [ ] **Step 4: Build the iOS app**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED (fix any compilation errors from the property changes)

- [ ] **Step 5: Verify visually**

Run: `./apps/ios/meeshy.sh run`
Test:
- Dark mode: verify bubbles and avatars display correctly
- Light mode: toggle via Settings and verify everything adapts
- Scroll through messages — should feel noticeably smoother

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyAvatar.swift
git commit -m "perf(ios): pass isDark:Bool to ThemedMessageBubble and MeeshyAvatar

Removes @ObservedObject ThemeManager.shared subscription from the two
highest-frequency leaf views. Prevents mass re-render of all visible
message bubbles and avatars on any ThemeManager property change."
```

---

## Chunk 4: Fix typing timer (Task 8)

### Task 8: Convert typing timer from `let` to `@State` and guard mutation

`ConversationView.swift:150` declares the typing dot timer as `let` on a struct. Every struct reconstruction (on any `@ObservedObject` change) creates a new timer with `.autoconnect()`. The timer also fires unconditionally at 2Hz, mutating `@State headerState.typingDotPhase` even when nobody is typing — causing unnecessary re-renders.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift:150`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView+ScrollIndicators.swift:235,268` (guard the onReceive)

- [ ] **Step 1: Convert timer to `@State`**

In `ConversationView.swift:150`:

```swift
// BEFORE:
let typingDotTimer = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()

// AFTER:
@State private var typingDotTimer = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()
```

- [ ] **Step 2: Guard the `onReceive` handlers to skip when nobody is typing**

In `ConversationView+ScrollIndicators.swift`, find the two `onReceive(typingDotTimer)` handlers (around lines 235 and 268). Move the typing check BEFORE the state mutation:

```swift
// BEFORE (example around line 235):
.onReceive(typingDotTimer) { _ in
    headerState.typingDotPhase = (headerState.typingDotPhase + 1) % 3
}

// AFTER:
.onReceive(typingDotTimer) { _ in
    guard !viewModel.typingUsernames.isEmpty else { return }
    headerState.typingDotPhase = (headerState.typingDotPhase + 1) % 3
}
```

Apply the same guard to both `onReceive` handlers.

- [ ] **Step 3: Build and test**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationView.swift apps/ios/Meeshy/Features/Main/Views/ConversationView+ScrollIndicators.swift
git commit -m "perf(ios): fix typing timer — @State instead of let, guard when nobody typing

Timer was re-created on every struct reconstruction. State mutation at 2Hz
caused re-renders even with no active typers."
```

---

## Post-Implementation Verification

After all 8 tasks are complete:

- [ ] **Run full SDK test suite:** `cd packages/MeeshySDK && swift test`
- [ ] **Run iOS app test suite:** `./apps/ios/meeshy.sh test`
- [ ] **Build release:** `./apps/ios/meeshy.sh build`
- [ ] **Manual scroll test:** Open conversation list, scroll rapidly through 50+ conversations. Open a conversation with 100+ messages, scroll rapidly. Compare perceived smoothness with before.
- [ ] **Instruments profiling (optional):** Run Time Profiler in Instruments on the conversation list and message scroll to verify reduced main thread work.
