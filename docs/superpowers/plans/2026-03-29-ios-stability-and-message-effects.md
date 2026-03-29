# iOS Stability & Message Effects Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the iOS app (4 critical fixes) and implement a combinable message effects system (OptionSet-based) with 3 axes: lifecycle behaviors, one-shot appearance effects, and persistent visual effects.

**Architecture:** The message effects system adds a `UInt32` bitfield (`effectFlags`) + optional parameters alongside existing fields. Effects are combinable across 3 independent axes. Backend stores a single Int, iOS uses `OptionSet`. Existing `isBlurred`/`isViewOnce`/`expiresAt` remain as stored properties synchronized with the new `effects` struct to preserve Codable and backward compat.

**Tech Stack:** Swift 5.9/SwiftUI, Prisma/MongoDB, TypeScript (Gateway), Socket.IO, GRDB cache

---

## Phase 1: Stability Fixes

### Task 1: Background Task Protection for Uploads

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Networking/TusUploadManager.swift:108-125` (processQueue) and `:127+` (performTusUpload)

The TUS upload manager performs multi-chunk uploads (10MB each) using `URLSession.shared` in foreground only. If the user switches apps mid-upload, iOS suspends the process and the upload is lost.

**CRITICAL**: The background task must wrap `performTusUpload` (the actual upload), NOT `uploadFile` (which only enqueues). `uploadFile` returns via `withCheckedThrowingContinuation` — wrapping it would acquire and immediately release the task.

- [ ] **Step 1: Add UIKit import and background task wrapper**

```swift
// At top of TusUploadManager.swift (UIKit already used in other SDK files):
import UIKit

// Add helper inside the actor:
private func withBackgroundTask<T>(named name: String, _ work: () async throws -> T) async throws -> T {
    let taskId = await UIApplication.shared.beginBackgroundTask(withName: name) {
        // OS is about to kill us — upload will resume on next launch via TUS offset
    }
    do {
        let result = try await work()
        await MainActor.run { UIApplication.shared.endBackgroundTask(taskId) }
        return result
    } catch {
        await MainActor.run { UIApplication.shared.endBackgroundTask(taskId) }
        throw error
    }
}
```

- [ ] **Step 2: Wrap performTusUpload in processQueue**

In `processQueue()`, wrap the `performTusUpload` call:

```swift
private func processQueue() {
    while activeCount < maxConcurrent, !queue.isEmpty {
        let (fileURL, mimeType, token, uploadContext, continuation) = queue.removeFirst()
        activeCount += 1
        Task {
            do {
                let result = try await withBackgroundTask(named: "meeshy-tus-upload") {
                    try await performTusUpload(fileURL: fileURL, mimeType: mimeType, token: token, uploadContext: uploadContext)
                }
                activeCount -= 1
                continuation.resume(returning: result)
                processQueue()
            } catch {
                activeCount -= 1
                continuation.resume(throwing: error)
                processQueue()
            }
        }
    }
}
```

- [ ] **Step 3: Build and verify**

```bash
./apps/ios/meeshy.sh build
```

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Networking/TusUploadManager.swift
git commit -m "fix(sdk): add background task protection for TUS uploads"
```

---

### Task 2: Rate Limit Retry with Exponential Backoff

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift:267-269`

Currently, 429 responses throw immediately with no retry. We need exponential backoff with Retry-After header support. Also handle 503 (deploy restarts).

**IMPORTANT**: The existing error translation logic (`URLError` → `MeeshyError.network`, `DecodingError` → `MeeshyError.server`, 401/403/429/5xx checks) must be preserved within each retry iteration. Only the HTTP status check + retry decision wraps the existing logic.

- [ ] **Step 1: Add retry helper method**

```swift
private func shouldRetry(statusCode: Int, attempt: Int, response: HTTPURLResponse) -> TimeInterval? {
    guard [429, 503].contains(statusCode), attempt < 3 else { return nil }
    if let retryAfter = response.value(forHTTPHeaderField: "Retry-After"),
       let seconds = Double(retryAfter) {
        return min(seconds, 30)
    }
    return Double(1 << attempt) // 1s, 2s, 4s exponential backoff
}
```

- [ ] **Step 2: Wrap the URLSession call in a retry loop**

In the main `request` method, wrap ONLY the `session.data(for:)` call and HTTP status check in a loop. Keep all error translation (`URLError` catch, `DecodingError` catch, etc.) at the same level:

```swift
var lastStatusCode = 0
for attempt in 0..<4 {
    if attempt > 0 {
        let delay = shouldRetry(statusCode: lastStatusCode, attempt: attempt, response: lastHTTPResponse!)
        guard let delay else { break }
        try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
        guard !Task.isCancelled else { throw CancellationError() }
    }

    let (data, response) = try await session.data(for: urlRequest)
    guard let httpResponse = response as? HTTPURLResponse else { ... }
    lastStatusCode = httpResponse.statusCode
    lastHTTPResponse = httpResponse

    if [429, 503].contains(httpResponse.statusCode) && attempt < 3 {
        logger.warning("Rate limited (\(httpResponse.statusCode)), retry \(attempt + 1)/3")
        continue
    }

    // ... existing status code handling (401, 403, 429 final, 5xx, decode) ...
    // The 429 check here is the FINAL attempt fallthrough
}
```

- [ ] **Step 3: Build and verify**

```bash
./apps/ios/meeshy.sh build
```

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift
git commit -m "fix(sdk): add exponential backoff retry for 429/503 responses"
```

---

### Task 3: Memory Warning L1 Cache Eviction

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift:150-156`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheStore.swift`

**ALREADY EXISTS**: `CacheCoordinator` already subscribes to `didReceiveMemoryWarningNotification` in `subscribeToLifecycle()` (line 130-136). However `evictUnderMemoryPressure()` (line 150-156) only evicts disk caches (images, audio, video, thumbnails). It does NOT evict L1 memory dictionaries in `GRDBCacheStore` instances.

**FIX**: Add `evictL1()` to `GRDBCacheStore` and call it from `evictUnderMemoryPressure()`.

- [ ] **Step 1: Add evictL1() to GRDBCacheStore**

```swift
// In GRDBCacheStore.swift, add public method:
public func evictL1() {
    memoryCache.removeAll()
    accessOrder.removeAll()
    // Do NOT clear dirtyKeys — flush them first or they'll be lost
}
```

- [ ] **Step 2: Extend evictUnderMemoryPressure in CacheCoordinator**

```swift
public func evictUnderMemoryPressure() async {
    // Existing: evict disk caches
    await images.evictExpired()
    await audio.evictExpired()
    await video.evictExpired()
    await thumbnails.evictExpired()
    // NEW: flush dirty L1 keys first, then evict L1 memory
    await messages.flushDirtyKeys()
    await conversations.flushDirtyKeys()
    await participants.flushDirtyKeys()
    await profiles.flushDirtyKeys()
    await messages.evictL1()
    await conversations.evictL1()
    await participants.evictL1()
    await profiles.evictL1()
    logger.info("Memory pressure — evicted expired media + L1 GRDB caches")
}
```

- [ ] **Step 3: Verify CacheCoordinator.start() is called at app launch**

Check if `CacheCoordinator.shared.start()` is called. If not, add it in `MeeshyApp.swift` or `AppDelegate`. This is what triggers `subscribeToLifecycle()`.

- [ ] **Step 4: Build and verify**

```bash
./apps/ios/meeshy.sh build
```

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheStore.swift
git commit -m "fix(sdk): evict L1 GRDB memory caches on memory warning"
```

---

### Task 4: Sticky Date Headers + Message Sort Fix

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift:725-805`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`

**NOTE**: `LazyVStack` is already in use (line 731). This task replaces the flat ForEach with grouped Sections + `pinnedViews: [.sectionHeaders]` for sticky date headers, and fixes message sort order.

**Message ordering issue**: `refreshMessagesFromAPI()` does `existing + newOnly` (line 542) without sorting. If `newOnly` contains messages with timestamps between existing messages, the order breaks.

- [ ] **Step 1: Add sort after merge in refreshMessagesFromAPI**

In `ConversationViewModel.swift`, after merging in `refreshMessagesFromAPI()`:

```swift
if !newOnly.isEmpty {
    messages = (existing + newOnly).sorted { $0.createdAt < $1.createdAt }
}
```

Also add sort after cache load in `observeSync()`:

```swift
case .fresh(let data, _), .stale(let data, _):
    self.messages = data.sorted { $0.createdAt < $1.createdAt }
```

- [ ] **Step 2: Add message grouping computed property**

In `ConversationViewModel.swift`:

```swift
struct DateGroup: Identifiable {
    let id: String  // date string key
    let date: Date
    let messages: [Message]
}

var messagesByDate: [DateGroup] {
    let calendar = Calendar.current
    let grouped = Dictionary(grouping: messages) { msg -> String in
        let comps = calendar.dateComponents([.year, .month, .day], from: msg.createdAt)
        return "\(comps.year!)-\(comps.month!)-\(comps.day!)"
    }
    return grouped.map { DateGroup(id: $0.key, date: $0.value.first!.createdAt, messages: $0.value) }
        .sorted { $0.date < $1.date }
}
```

- [ ] **Step 3: Replace flat ForEach with Section-based LazyVStack**

In `ConversationView.swift` `messageScrollView`, replace:

```swift
LazyVStack(spacing: 0, pinnedViews: [.sectionHeaders]) {
    // ... loading indicators, empty state, encryption disclaimer ...

    ForEach(viewModel.messagesByDate) { group in
        Section {
            ForEach(group.messages) { msg in
                let index = viewModel.messageIndex(for: msg.id) ?? 0
                if msg.id == viewModel.firstUnreadMessageId { unreadSeparator }
                messageRow(index: index, msg: msg)
                    .onAppear {
                        if index < 5 && viewModel.hasOlderMessages && !viewModel.isLoadingOlder && !viewModel.isProgrammaticScroll {
                            Task { await viewModel.loadOlderMessages() }
                        }
                    }
            }
        } header: {
            dateSectionView(for: group.date)
        }
    }

    // ... typing indicator, newer messages trigger, bottom spacer ...
}
```

- [ ] **Step 4: Build and verify**

```bash
./apps/ios/meeshy.sh build
```

- [ ] **Step 5: Run app and verify**

```bash
./apps/ios/meeshy.sh run
```

Verify: most recent messages at bottom, date headers stick at top while scrolling through that day's messages.

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationView.swift
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift
git commit -m "fix(ios): add sticky date headers and fix message sort order"
```

---

## Phase 2: Message Effects System

### Task 5: Define MessageEffectFlags OptionSet (SDK)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageEffects.swift`

Define the combinable effects system with OptionSet and parameters struct. Uses existing `EphemeralDuration` enum from `CoreModels.swift` — do NOT redefine it.

- [ ] **Step 1: Create MessageEffects.swift**

```swift
import Foundation

// MARK: - MessageEffectFlags (OptionSet — single UInt32 bitfield)

public struct MessageEffectFlags: OptionSet, Codable, Sendable, Hashable {
    public let rawValue: UInt32
    public init(rawValue: UInt32) { self.rawValue = rawValue }

    // Axe 1: Comportement de cycle de vie (bits 0-7)
    public static let ephemeral  = MessageEffectFlags(rawValue: 1 << 0)
    public static let blurred    = MessageEffectFlags(rawValue: 1 << 1)
    public static let viewOnce   = MessageEffectFlags(rawValue: 1 << 2)

    // Axe 2: Effets visuels d'apparition — one-shot (bits 8-15)
    public static let shake      = MessageEffectFlags(rawValue: 1 << 8)
    public static let zoom       = MessageEffectFlags(rawValue: 1 << 9)
    public static let explode    = MessageEffectFlags(rawValue: 1 << 10)
    public static let confetti   = MessageEffectFlags(rawValue: 1 << 11)
    public static let fireworks  = MessageEffectFlags(rawValue: 1 << 12)
    public static let waoo       = MessageEffectFlags(rawValue: 1 << 13)

    // Axe 3: Effets visuels persistants (bits 16-23)
    public static let glow       = MessageEffectFlags(rawValue: 1 << 16)
    public static let pulse      = MessageEffectFlags(rawValue: 1 << 17)
    public static let rainbow    = MessageEffectFlags(rawValue: 1 << 18)
    public static let sparkle    = MessageEffectFlags(rawValue: 1 << 19)

    // Convenience masks
    public static let lifecycleMask: MessageEffectFlags   = [.ephemeral, .blurred, .viewOnce]
    public static let appearanceMask: MessageEffectFlags   = [.shake, .zoom, .explode, .confetti, .fireworks, .waoo]
    public static let persistentMask: MessageEffectFlags   = [.glow, .pulse, .rainbow, .sparkle]

    public var hasLifecycleEffect: Bool { !intersection(.lifecycleMask).isEmpty }
    public var hasAppearanceEffect: Bool { !intersection(.appearanceMask).isEmpty }
    public var hasPersistentEffect: Bool { !intersection(.persistentMask).isEmpty }
    public var hasAnyEffect: Bool { rawValue != 0 }
}

// MARK: - Bit Assignment Source of Truth
// These MUST match the TypeScript constants in packages/shared/types/message-effect-flags.ts
// Lifecycle:  ephemeral=1<<0, blurred=1<<1, viewOnce=1<<2
// Appearance: shake=1<<8, zoom=1<<9, explode=1<<10, confetti=1<<11, fireworks=1<<12, waoo=1<<13
// Persistent: glow=1<<16, pulse=1<<17, rainbow=1<<18, sparkle=1<<19

// MARK: - MessageEffects (flags + parameters)

public struct MessageEffects: Codable, Sendable, Hashable {
    public var flags: MessageEffectFlags

    // Lifecycle parameters
    public var ephemeralDuration: Int?
    public var maxViewOnceCount: Int?
    public var blurRevealDuration: TimeInterval?

    // Appearance parameters
    public var zoomScale: Double?
    public var explodeStyle: ExplodeStyle?

    // Persistent parameters
    public var glowIntensity: Double?
    public var pulseFrequency: Double?
    public var rainbowColors: [String]?
    public var sparkleIntensity: Double?

    public init(flags: MessageEffectFlags = [],
                ephemeralDuration: Int? = nil,
                maxViewOnceCount: Int? = nil,
                blurRevealDuration: TimeInterval? = nil,
                zoomScale: Double? = nil,
                explodeStyle: ExplodeStyle? = nil,
                glowIntensity: Double? = nil,
                pulseFrequency: Double? = nil,
                rainbowColors: [String]? = nil,
                sparkleIntensity: Double? = nil) {
        self.flags = flags
        self.ephemeralDuration = ephemeralDuration
        self.maxViewOnceCount = maxViewOnceCount
        self.blurRevealDuration = blurRevealDuration
        self.zoomScale = zoomScale
        self.explodeStyle = explodeStyle
        self.glowIntensity = glowIntensity
        self.pulseFrequency = pulseFrequency
        self.rainbowColors = rainbowColors
        self.sparkleIntensity = sparkleIntensity
    }

    public static let none = MessageEffects()
    public var hasAnyEffect: Bool { flags.hasAnyEffect }
}

public enum ExplodeStyle: String, Codable, Sendable, CaseIterable {
    case burst, shatter, dissolve
}

// MARK: - Backward Compatibility

extension MessageEffects {
    public static func fromLegacy(
        isBlurred: Bool, isViewOnce: Bool, expiresAt: Date?,
        ephemeralDuration: Int?, maxViewOnceCount: Int?
    ) -> MessageEffects {
        var flags: MessageEffectFlags = []
        if isBlurred { flags.insert(.blurred) }
        if isViewOnce { flags.insert(.viewOnce) }
        if expiresAt != nil || ephemeralDuration != nil { flags.insert(.ephemeral) }
        return MessageEffects(flags: flags, ephemeralDuration: ephemeralDuration, maxViewOnceCount: maxViewOnceCount)
    }

    public var legacyIsBlurred: Bool { flags.contains(.blurred) }
    public var legacyIsViewOnce: Bool { flags.contains(.viewOnce) }
    public var legacyEphemeralDuration: Int? { flags.contains(.ephemeral) ? ephemeralDuration : nil }
    public var legacyMaxViewOnceCount: Int? { flags.contains(.viewOnce) ? maxViewOnceCount : nil }
}
```

- [ ] **Step 2: Build SDK**

```bash
./apps/ios/meeshy.sh build
```

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/MessageEffects.swift
git commit -m "feat(sdk): add MessageEffectFlags OptionSet with 3-axis combinable effects"
```

---

### Task 6: Integrate MessageEffects into MeeshyMessage

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift:286-386`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift:119-240`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift` (conversation preview refs)
- Modify: `apps/ios/Meeshy/Features/Main/Models/MessageModels.swift` (app-local Message conversion)

**CRITICAL — Codable preservation**: `MeeshyMessage` is Codable and serialized to GRDB cache. `isBlurred`/`isViewOnce` MUST remain as stored properties (not computed) to preserve Codable synthesis. Add `effects` as a NEW field, and synchronize it with the legacy stored properties.

**Strategy**: Keep `isBlurred`/`isViewOnce` as stored `Bool` properties. Add `effects: MessageEffects` alongside. Sync them in the init and in a `didSet` on `effects`. This avoids breaking Codable, init call sites, and GRDB cache.

- [ ] **Step 1: Add effects property to MeeshyMessage**

In `CoreModels.swift`, add to `MeeshyMessage` stored properties:

```swift
public var effects: MessageEffects = .none
```

Add to init parameter list with default:

```swift
effects: MessageEffects = .none
```

And in init body, sync effects from legacy fields:

```swift
self.effects = effects
// Sync: if legacy fields are set but effects is empty, build effects from legacy
if effects.flags.rawValue == 0 && (isBlurred || isViewOnce || expiresAt != nil) {
    self.effects = .fromLegacy(
        isBlurred: isBlurred, isViewOnce: isViewOnce,
        expiresAt: expiresAt, ephemeralDuration: nil,
        maxViewOnceCount: maxViewOnceCount
    )
}
```

- [ ] **Step 2: Add effectFlags to APIMessage**

In `MessageModels.swift`, add to `APIMessage`:

```swift
let effectFlags: UInt32?

// In CodingKeys:
case effectFlags = "effectFlags"
```

- [ ] **Step 3: Update APIMessage.toMessage to pass effects**

```swift
var effects: MessageEffects = .none
if let flags = effectFlags, flags > 0 {
    effects = MessageEffects(flags: MessageEffectFlags(rawValue: flags))
} else {
    effects = .fromLegacy(
        isBlurred: isBlurred ?? false, isViewOnce: isViewOnce ?? false,
        expiresAt: expiresAt, ephemeralDuration: nil,
        maxViewOnceCount: nil
    )
}
// Pass effects: effects to MeeshyMessage init
```

- [ ] **Step 4: Add effectFlags to SendMessageRequest**

```swift
public var effectFlags: UInt32?

// In CodingKeys:
case effectFlags = "effectFlags"
```

- [ ] **Step 5: Update app-local Message conversion**

In `apps/ios/Meeshy/Features/Main/Models/MessageModels.swift`, ensure the `APIMessage.toMessage()` extension passes `effects` through.

- [ ] **Step 6: Build and verify all compile**

```bash
./apps/ios/meeshy.sh build
```

- [ ] **Step 7: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift
git add packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift
git add packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift
git add apps/ios/Meeshy/Features/Main/Models/MessageModels.swift
git commit -m "feat(sdk): integrate MessageEffects into MeeshyMessage with legacy compat"
```

---

### Task 7: Backend — Add effectFlags to Prisma + Shared Types

**Files:**
- Modify: `packages/shared/prisma/schema.prisma` (Message model, ~line 530)
- Modify: `packages/shared/types/message-types.ts`
- Create: `packages/shared/types/message-effect-flags.ts` (shared source of truth for bit assignments)

- [ ] **Step 1: Create shared effect flags constants**

```typescript
// packages/shared/types/message-effect-flags.ts
export const MESSAGE_EFFECT_FLAGS = {
    // Lifecycle (bits 0-7)
    EPHEMERAL: 1 << 0,   // 1
    BLURRED:   1 << 1,   // 2
    VIEW_ONCE: 1 << 2,   // 4
    // Appearance one-shot (bits 8-15)
    SHAKE:     1 << 8,   // 256
    ZOOM:      1 << 9,   // 512
    EXPLODE:   1 << 10,  // 1024
    CONFETTI:  1 << 11,  // 2048
    FIREWORKS: 1 << 12,  // 4096
    WAOO:      1 << 13,  // 8192
    // Persistent (bits 16-23)
    GLOW:      1 << 16,  // 65536
    PULSE:     1 << 17,  // 131072
    RAINBOW:   1 << 18,  // 262144
    SPARKLE:   1 << 19,  // 524288
} as const;
```

- [ ] **Step 2: Add effectFlags field to Prisma Message model**

```prisma
model Message {
  // ... existing fields ...
  effectFlags          Int       @default(0)
}
```

- [ ] **Step 3: Add effectFlags to GatewayMessage type**

```typescript
effectFlags?: number;
```

- [ ] **Step 4: Generate Prisma client AND push to DB**

```bash
cd packages/shared && npx prisma generate && npx prisma db push
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/prisma/schema.prisma
git add packages/shared/types/message-types.ts
git add packages/shared/types/message-effect-flags.ts
git commit -m "feat(shared): add effectFlags bitfield and shared constants"
```

---

### Task 8: Backend — Gateway Message Handling for effectFlags

**Files:**
- Modify: `services/gateway/src/routes/conversations/messages.ts`
- Modify: `services/gateway/src/routes/conversations/core.ts`
- Modify: `services/gateway/src/routes/messages.ts`
- Modify: `services/gateway/src/socketio/handlers/MessageHandler.ts`
- Modify: `services/gateway/src/services/MessageProcessor.ts`
- Modify: `services/gateway/src/socketio/MeeshySocketIOManager.ts`

**NOTE**: `effectFlags` must be added to ALL files that reference `isBlurred`/`isViewOnce` in Prisma select clauses and message payloads. There are 9+ files, not just 2.

- [ ] **Step 1: Add effectFlags: true to ALL Prisma message select clauses**

Search for `isBlurred: true` and `isViewOnce: true` in all gateway files. Add `effectFlags: true` alongside each occurrence.

- [ ] **Step 2: Accept effectFlags in message creation**

```typescript
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

const effectFlags = body.effectFlags ?? 0;
// Merge legacy fields into effectFlags for backward compat:
let flags = effectFlags;
if (body.isBlurred && !(flags & MESSAGE_EFFECT_FLAGS.BLURRED)) flags |= MESSAGE_EFFECT_FLAGS.BLURRED;
if (body.isViewOnce && !(flags & MESSAGE_EFFECT_FLAGS.VIEW_ONCE)) flags |= MESSAGE_EFFECT_FLAGS.VIEW_ONCE;
if (body.ephemeralDuration && !(flags & MESSAGE_EFFECT_FLAGS.EPHEMERAL)) flags |= MESSAGE_EFFECT_FLAGS.EPHEMERAL;
```

- [ ] **Step 3: Include effectFlags in Socket.IO message:new events**

In `MessageProcessor.ts` and `MeeshySocketIOManager.ts`, ensure `effectFlags` is included in emitted payloads.

- [ ] **Step 4: Build gateway**

```bash
cd services/gateway && pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/
git commit -m "feat(gateway): handle effectFlags in message creation and Socket.IO events"
```

---

### Task 9: iOS — Effects Picker UI in Composer

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Components/EffectsPickerView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` (composer area)
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`

- [ ] **Step 1: Create EffectsPickerView**

Use valid SF Symbol names only (verified for iOS 17+):

```swift
struct EffectsPickerView: View {
    @Binding var effects: MessageEffects
    let accentColor: String

    var body: some View {
        VStack(spacing: 12) {
            EffectSection(title: "Comportement", effects: [
                (.ephemeral, "hourglass", "Éphémère"),
                (.blurred, "eye.slash", "Flou"),
                (.viewOnce, "1.circle", "Vue unique"),
            ], selected: $effects.flags)

            EffectSection(title: "Animation d'entrée", effects: [
                (.shake, "waveform", "Shake"),
                (.zoom, "arrow.up.left.and.arrow.down.right", "Zoom"),
                (.explode, "rays", "Explosion"),          // NOT "burst" (invalid)
                (.confetti, "party.popper", "Confetti"),
                (.fireworks, "sparkles", "Feux d'artifice"),
                (.waoo, "star.fill", "Waoo"),
            ], selected: $effects.flags)

            EffectSection(title: "Effet permanent", effects: [
                (.glow, "sun.max", "Glow"),
                (.pulse, "heart.fill", "Pulse"),
                (.rainbow, "rainbow", "Arc-en-ciel"),
                (.sparkle, "sparkle", "Scintillant"),
            ], selected: $effects.flags)

            // Use existing EphemeralDuration enum from CoreModels.swift
            if effects.flags.contains(.ephemeral) {
                EphemeralDurationPicker(duration: $effects.ephemeralDuration)
            }
        }
        .padding()
    }
}
```

- [ ] **Step 2: Add effects state to ConversationViewModel**

```swift
@Published var pendingEffects: MessageEffects = .none
@Published var showEffectsPicker: Bool = false
```

- [ ] **Step 3: Wire effects picker into composer**

Add magic wand button + sheet/popover in composer area. Show badge when effects are active.

- [ ] **Step 4: Pass effects to sendMessage**

Include `effectFlags: pendingEffects.flags.rawValue` in `SendMessageRequest`. Reset after send.

- [ ] **Step 5: Build and verify**

```bash
./apps/ios/meeshy.sh build
```

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/EffectsPickerView.swift
git add apps/ios/Meeshy/Features/Main/Views/ConversationView.swift
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift
git commit -m "feat(ios): add effects picker UI for combinable message effects"
```

---

### Task 10: iOS — Visual Effect Renderers in ThemedMessageBubble

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Components/MessageEffectModifiers.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift`

**NOTE**: Existing blur handling (`isBlurRevealed`, `blurRevealTask`, `fogOpacity`) already handles the `.blurred` lifecycle flag. Do NOT duplicate with a new BlurEffect modifier — reuse existing mechanism. Do NOT add `@ObservedObject` on singletons (pre-existing violation on line 60 — don't make it worse).

- [ ] **Step 1: Create MessageEffectModifiers.swift**

ViewModifiers for each effect type:

```swift
// Appearance effects (one-shot animations triggered onAppear)
struct ShakeEffect: ViewModifier { ... }      // Horizontal oscillation via offset + phase
struct ZoomEffect: ViewModifier { ... }       // Scale-in from 0.5 with spring bounce
struct ExplodeEffect: ViewModifier { ... }    // Scale + opacity burst with particles
struct ConfettiEffect: ViewModifier { ... }   // Canvas particle system, falling colored dots
struct FireworksEffect: ViewModifier { ... }  // Canvas radial sparks from center
struct WaooEffect: ViewModifier { ... }       // Scale overshoot + golden glow pulse

// Persistent effects (continuous looping animations)
struct GlowEffect: ViewModifier { ... }       // Pulsing shadow with hue rotation
struct PulseEffect: ViewModifier { ... }      // Subtle scale 1.0-1.02 loop
struct RainbowEffect: ViewModifier { ... }    // Hue-rotating overlay or border
struct SparkleEffect: ViewModifier { ... }    // TimelineView floating sparkle particles
```

- [ ] **Step 2: Add effect rendering to ThemedMessageBubble**

After the bubble content, apply effects based on `message.effects.flags`:

```swift
bubbleContent
    .modifier(ShakeEffect(active: message.effects.flags.contains(.shake) && !hasPlayedAppearance))
    .modifier(ZoomEffect(active: message.effects.flags.contains(.zoom) && !hasPlayedAppearance))
    .modifier(GlowEffect(active: message.effects.flags.contains(.glow), intensity: message.effects.glowIntensity ?? 0.5))
    .modifier(PulseEffect(active: message.effects.flags.contains(.pulse)))
    .modifier(RainbowEffect(active: message.effects.flags.contains(.rainbow)))
    .modifier(SparkleEffect(active: message.effects.flags.contains(.sparkle)))
    .overlay {
        if message.effects.flags.contains(.confetti) && !hasPlayedAppearance { ConfettiOverlay() }
        if message.effects.flags.contains(.fireworks) && !hasPlayedAppearance { FireworksOverlay() }
        if message.effects.flags.contains(.explode) && !hasPlayedAppearance { ExplodeOverlay() }
        if message.effects.flags.contains(.waoo) && !hasPlayedAppearance { WaooOverlay() }
    }
    .onAppear { hasPlayedAppearance = true }
```

- [ ] **Step 3: Add @State for one-shot tracking**

```swift
@State private var hasPlayedAppearance = false
```

- [ ] **Step 4: Build and verify**

```bash
./apps/ios/meeshy.sh build
```

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/MessageEffectModifiers.swift
git add apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift
git commit -m "feat(ios): implement visual effect renderers for all 13 message effects"
```

---

## Phase 3: Feature Gaps

### Task 11: Mention Suggestions (@autocomplete)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Services/MentionService.swift`
- Create: `apps/ios/Meeshy/Features/Main/Components/MentionAutocompleteView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`

Gateway has `GET /mentions/suggestions?conversationId=X&query=Y`.

**NOTE**: Per iOS CLAUDE.md TDD requirements, define `MentionServiceProviding` protocol BEFORE implementation.

- [ ] **Step 1: Create MentionService with protocol**

```swift
public struct MentionSuggestion: Codable, Identifiable, Sendable {
    public let id: String
    public let username: String
    public let displayName: String
    public let avatarUrl: String?
}

public protocol MentionServiceProviding {
    func suggestions(conversationId: String, query: String) async throws -> [MentionSuggestion]
}

public class MentionService: MentionServiceProviding {
    public static let shared = MentionService()
    public func suggestions(conversationId: String, query: String) async throws -> [MentionSuggestion] {
        let response: APIResponse<[MentionSuggestion]> = try await APIClient.shared.request(
            endpoint: "/mentions/suggestions",
            queryItems: [
                URLQueryItem(name: "conversationId", value: conversationId),
                URLQueryItem(name: "query", value: query)
            ]
        )
        return response.data
    }
}
```

- [ ] **Step 2: Create MentionAutocompleteView**

Floating overlay above composer showing matching users (avatar + name + @username).

- [ ] **Step 3: Wire into composer text field**

Detect `@` in input, extract query, debounce, fetch suggestions, display overlay.

- [ ] **Step 4: Build and verify**

```bash
./apps/ios/meeshy.sh build
```

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Services/MentionService.swift
git add apps/ios/Meeshy/Features/Main/Components/MentionAutocompleteView.swift
git add apps/ios/Meeshy/Features/Main/Views/ConversationView.swift
git commit -m "feat(ios): add @mention autocomplete with gateway integration"
```

---

### Task 12: Data Export GDPR

**Files:**
- Create: `services/gateway/src/routes/me/export.ts`
- Modify: `services/gateway/src/routes/me/index.ts`
- Modify: `apps/ios/Meeshy/Features/Main/Views/DataExportView.swift`
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Services/DataExportService.swift`

- [ ] **Step 1: Create export endpoint in gateway**

```typescript
// GET /me/export?format=json&types=messages,contacts
// Returns JSON export of user data (messages, contacts, profile)
```

- [ ] **Step 2: Create DataExportService in SDK**

- [ ] **Step 3: Wire DataExportView to real API**

Replace fake timer with actual API call + download handling.

- [ ] **Step 4: Build and verify**

```bash
cd services/gateway && pnpm build
./apps/ios/meeshy.sh build
```

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/routes/me/
git add packages/MeeshySDK/Sources/MeeshySDK/Services/DataExportService.swift
git add apps/ios/Meeshy/Features/Main/Views/DataExportView.swift
git commit -m "feat: add GDPR data export endpoint and wire iOS UI"
```

---

### Task 13: Message Pinning — Endpoint + iOS UI

**Files:**
- Create: `services/gateway/src/routes/conversations/pins.ts`
- Modify: `packages/shared/types/socketio-events.ts`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift`

Prisma schema already has `pinnedAt DateTime?` and `pinnedBy String?` on Message. `MeeshyMessage` already has `pinnedAt: Date?` and `pinnedBy: String?`.

- [ ] **Step 1: Create pin/unpin endpoints**

```typescript
POST /conversations/:id/messages/:messageId/pin    → sets pinnedAt + pinnedBy
DELETE /conversations/:id/messages/:messageId/pin  → clears pinnedAt + pinnedBy
GET /conversations/:id/pinned-messages             → returns pinned messages
```

- [ ] **Step 2: Add Socket.IO events**

Add `message:pinned` and `message:unpinned` to `socketio-events.ts`.

- [ ] **Step 3: Add pinned message banner in ConversationView**

Collapsible banner at top showing pinned messages (tap to scroll to pinned message).

- [ ] **Step 4: Add pin indicator to ThemedMessageBubble**

Small pin icon on pinned messages + "Pin" action in context menu.

- [ ] **Step 5: Build and verify**

```bash
cd services/gateway && pnpm build
./apps/ios/meeshy.sh build
```

- [ ] **Step 6: Commit**

```bash
git add services/gateway/src/routes/conversations/pins.ts
git add packages/shared/types/socketio-events.ts
git add apps/ios/Meeshy/Features/Main/Views/ConversationView.swift
git add apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift
git commit -m "feat: add message pinning endpoints, Socket.IO events, and iOS UI"
```

---

## Phase 4: Competitive Features

### Task 14: Read Receipts & Typing Indicator Toggles

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/PrivacySettingsView.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/UserModels.swift`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`

- [ ] **Step 1: Add toggles to privacy preferences**
- [ ] **Step 2: Add toggles to PrivacySettingsView**
- [ ] **Step 3: Respect toggles before sending read/typing events**
- [ ] **Step 4: Build, verify, commit**

---

### Task 15: Media Auto-Download Settings

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/MediaDownloadSettingsView.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/UserModels.swift`

- [ ] **Step 1: Add MediaDownloadPreferences model**
- [ ] **Step 2: Create settings view with WiFi/cellular toggles per media type**
- [ ] **Step 3: Respect settings via NWPathMonitor before auto-downloading**
- [ ] **Step 4: Build, verify, commit**

---

## Phase 5: Cache Migration Safety

### Task 16: GRDB Cache Version Bump

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift`

Adding `effects: MessageEffects` to `MeeshyMessage` changes the Codable layout. Existing GRDB cache entries won't have this field. While Swift's Codable handles missing optional fields gracefully (defaults to `.none`), we should verify this works.

- [ ] **Step 1: Verify backward-compat decode**

Ensure `MessageEffects` init defaults `flags` to `[]` (empty), so missing `effects` field in cached JSON decodes as `.none`. This should work automatically since `effects: MessageEffects = .none` has a default.

- [ ] **Step 2: If decode fails, add cache version key**

```swift
private static let cacheSchemaVersion = 2 // bump from 1
// On start(), check stored version. If mismatch, invalidateAll().
```

- [ ] **Step 3: Build and verify**

---

## Execution Order & Dependencies

```
Phase 1 (Stability) — Can run in parallel:
  Task 1 (Background uploads)     ← independent
  Task 2 (Rate limit retry)       ← independent
  Task 3 (Memory warning L1)      ← independent
  Task 4 (Sticky dates + sort)    ← independent

Phase 2 (Effects) — Sequential core, then parallel UI:
  Task 5 (OptionSet definition)   ← first
  Task 6 (SDK integration)        ← depends on 5
  Task 7 (Prisma + shared types)  ← depends on 5 (can parallel with 6)
  Task 8 (Gateway handling)       ← depends on 7
  Task 9 (Effects picker UI)      ← depends on 6
  Task 10 (Visual renderers)      ← depends on 6

Phase 3 (Features) — Independent:
  Task 11 (Mentions)              ← independent
  Task 12 (Data Export)           ← independent
  Task 13 (Message Pinning)       ← independent

Phase 4 (Competitive) — Independent:
  Task 14 (Privacy toggles)       ← independent
  Task 15 (Media download)        ← independent

Phase 5 (Safety):
  Task 16 (Cache migration)       ← depends on 6
```

**Parallel execution strategy:**
- Tasks 1-4: ALL parallel subagents
- Tasks 5 first, then 6+7 parallel, then 8+9+10 parallel
- Tasks 11-15: ALL parallel subagents
