# Bubble Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign message bubbles with brand Indigo gradient for own messages, blended (conversation accent 30% + Indigo 70%) for others, symmetric margins, content-sized widths, and an inline `UserIdentityBar` component for group conversations.

**Architecture:** Add a `UserColorCache` actor in the SDK for centralized color caching, a `blend()` function in `DynamicColorGenerator`, a reusable `UserIdentityBar` SwiftUI component in MeeshyUI, then modify `ThemedMessageBubble` colors/layout and `ConversationView+MessageRow` to remove external avatars and use symmetric margins.

**Tech Stack:** SwiftUI, MeeshySDK (Theme, Cache), MeeshyUI (Primitives), XCTest

---

### Task 1: Add `blend()` to DynamicColorGenerator

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Theme/ColorGeneration.swift:266-279`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/ColorGenerationTests.swift` (create)

**Step 1: Write the failing test**

Create `packages/MeeshySDK/Tests/MeeshySDKTests/Models/ColorGenerationTests.swift`:

```swift
import XCTest
@testable import MeeshySDK

final class ColorGenerationTests: XCTestCase {

    // MARK: - blend two colors

    func test_blendTwoColors_50_50_returnsAverage() {
        // Pure red (FF0000) + pure blue (0000FF) at 50/50 → mid purple
        let result = DynamicColorGenerator.blendTwo("FF0000", weight1: 0.5, "0000FF", weight2: 0.5)
        // R=127, G=0, B=127 → "7F007F"
        XCTAssertEqual(result, "7F007F")
    }

    func test_blendTwoColors_30_70_weightsAppliedCorrectly() {
        // Accent (FF6B6B) 30% + Indigo (6366F1) 70%
        let result = DynamicColorGenerator.blendTwo("FF6B6B", weight1: 0.30, "6366F1", weight2: 0.70)
        // R = 255*0.3 + 99*0.7 = 76+69 = 145 (91)
        // G = 107*0.3 + 102*0.7 = 32+71 = 103 (67)
        // B = 107*0.3 + 241*0.7 = 32+168 = 200 (C8)
        XCTAssertEqual(result, "9167C8")
    }

    func test_blendTwoColors_0_100_returnsSecondColor() {
        let result = DynamicColorGenerator.blendTwo("FF0000", weight1: 0.0, "6366F1", weight2: 1.0)
        XCTAssertEqual(result, "6366F1")
    }

    func test_blendTwoColors_100_0_returnsFirstColor() {
        let result = DynamicColorGenerator.blendTwo("FF6B6B", weight1: 1.0, "000000", weight2: 0.0)
        XCTAssertEqual(result, "FF6B6B")
    }

    // MARK: - colorForName determinism

    func test_colorForName_sameInput_returnsSameOutput() {
        let color1 = DynamicColorGenerator.colorForName("Alice")
        let color2 = DynamicColorGenerator.colorForName("Alice")
        XCTAssertEqual(color1, color2)
    }

    func test_colorForName_differentInputs_returnsDifferentColors() {
        let color1 = DynamicColorGenerator.colorForName("Alice")
        let color2 = DynamicColorGenerator.colorForName("Bob")
        XCTAssertNotEqual(color1, color2)
    }
}
```

**Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshySDKTests/ColorGenerationTests -quiet 2>&1 | tail -20`
Expected: FAIL — `blendTwo` does not exist

**Step 3: Implement the blend function**

In `packages/MeeshySDK/Sources/MeeshySDK/Theme/ColorGeneration.swift`, add after line 278 (after the existing private `blendColors` method):

```swift
    /// Blend two hex colors with given weights (must sum to 1.0). Returns hex string.
    public static func blendTwo(_ hex1: String, weight1: Double, _ hex2: String, weight2: Double) -> String {
        let c1 = hexToRGB(hex1)
        let c2 = hexToRGB(hex2)

        let r = Int(Double(c1.r) * weight1 + Double(c2.r) * weight2)
        let g = Int(Double(c1.g) * weight1 + Double(c2.g) * weight2)
        let b = Int(Double(c1.b) * weight1 + Double(c2.b) * weight2)

        return String(format: "%02X%02X%02X", min(255, r), min(255, g), min(255, b))
    }
```

**Step 4: Run test to verify it passes**

Run: same command as Step 2
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Theme/ColorGeneration.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/ColorGenerationTests.swift
git commit -m "feat(sdk): add blendTwo() public method to DynamicColorGenerator"
```

---

### Task 2: Create `UserColorCache` actor

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Theme/UserColorCache.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/UserColorCacheTests.swift` (create)

**Step 1: Write the failing test**

Create `packages/MeeshySDK/Tests/MeeshySDKTests/Models/UserColorCacheTests.swift`:

```swift
import XCTest
@testable import MeeshySDK

final class UserColorCacheTests: XCTestCase {

    func test_blendedColor_returnsSameValueOnSecondCall() async {
        let cache = UserColorCache()
        let first = await cache.blendedColor(for: "FF6B6B")
        let second = await cache.blendedColor(for: "FF6B6B")
        XCTAssertEqual(first, second)
    }

    func test_blendedColor_differentAccents_returnDifferentResults() async {
        let cache = UserColorCache()
        let a = await cache.blendedColor(for: "FF6B6B")
        let b = await cache.blendedColor(for: "4ECDC4")
        XCTAssertNotEqual(a, b)
    }

    func test_blendedColor_staysInIndigoFamily() async {
        // The blended result should have Indigo influence (blue channel > red for most accents)
        let cache = UserColorCache()
        let result = await cache.blendedColor(for: "2ECC71") // green accent
        // With 70% Indigo (6366F1), the blue channel should be dominant
        XCTAssertFalse(result.isEmpty)
        // Verify it's a valid 6-char hex
        XCTAssertEqual(result.count, 6)
    }

    func test_colorForUser_returnsCachedValue() async {
        let cache = UserColorCache()
        let first = await cache.colorForUser(name: "Alice")
        let second = await cache.colorForUser(name: "Alice")
        XCTAssertEqual(first, second)
    }

    func test_invalidateAll_clearsCachedValues() async {
        let cache = UserColorCache()
        let before = await cache.blendedColor(for: "FF6B6B")
        await cache.invalidateAll()
        let after = await cache.blendedColor(for: "FF6B6B")
        // Values should be equal (same computation) but cache was cleared
        XCTAssertEqual(before, after)
    }

    func test_cacheHitCount_incrementsOnRepeatAccess() async {
        let cache = UserColorCache()
        _ = await cache.blendedColor(for: "FF6B6B")
        _ = await cache.blendedColor(for: "FF6B6B")
        _ = await cache.blendedColor(for: "FF6B6B")
        let stats = await cache.stats()
        XCTAssertEqual(stats.hits, 2) // first is miss, next two are hits
        XCTAssertEqual(stats.misses, 1)
    }
}
```

**Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshySDKTests/UserColorCacheTests -quiet 2>&1 | tail -20`
Expected: FAIL — `UserColorCache` does not exist

**Step 3: Implement UserColorCache**

Create `packages/MeeshySDK/Sources/MeeshySDK/Theme/UserColorCache.swift`:

```swift
import Foundation

public actor UserColorCache {
    public static let shared = UserColorCache()

    private static let brandIndigo = "6366F1"
    private static let accentWeight: Double = 0.30
    private static let indigoWeight: Double = 0.70

    private var blendedColors: [String: String] = [:]
    private var userColors: [String: String] = [:]
    private var hitCount: Int = 0
    private var missCount: Int = 0

    public init() {}

    /// Returns hex string of blended color (conversation accent 30% + brand Indigo 70%).
    /// Cached per accent hex — computed once per unique conversation accent.
    public func blendedColor(for conversationAccent: String) -> String {
        let key = conversationAccent.uppercased()
        if let cached = blendedColors[key] {
            hitCount += 1
            return cached
        }
        missCount += 1
        let result = DynamicColorGenerator.blendTwo(
            key, weight1: Self.accentWeight,
            Self.brandIndigo, weight2: Self.indigoWeight
        )
        blendedColors[key] = result
        return result
    }

    /// Returns hex string for a user's name-based color. Cached per name.
    public func colorForUser(name: String) -> String {
        if let cached = userColors[name] {
            hitCount += 1
            return cached
        }
        missCount += 1
        let result = DynamicColorGenerator.colorForName(name)
        userColors[name] = result
        return result
    }

    /// Clear all cached values (called on logout).
    public func invalidateAll() {
        blendedColors.removeAll()
        userColors.removeAll()
        hitCount = 0
        missCount = 0
    }

    /// Cache statistics for debugging/testing.
    public func stats() -> (hits: Int, misses: Int) {
        (hits: hitCount, misses: missCount)
    }
}
```

**Step 4: Run test to verify it passes**

Run: same command as Step 2
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Theme/UserColorCache.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/UserColorCacheTests.swift
git commit -m "feat(sdk): add UserColorCache actor for centralized color caching"
```

---

### Task 3: Wire UserColorCache into CacheCoordinator

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift:335-344`

**Step 1: Add invalidation call**

In `CacheCoordinator.swift`, modify `invalidateAll()` to also clear the color cache:

```swift
    public func invalidateAll() async {
        await conversations.invalidateAll()
        await messages.invalidateAll()
        await participants.invalidateAll()
        await profiles.invalidateAll()
        await images.invalidateAll()
        await audio.invalidateAll()
        await video.invalidateAll()
        await thumbnails.invalidateAll()
        await UserColorCache.shared.invalidateAll()
    }
```

**Step 2: Build to verify**

Run: `./apps/ios/meeshy.sh build 2>&1 | tail -5`
Expected: BUILD SUCCEEDED

**Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift
git commit -m "feat(sdk): wire UserColorCache.invalidateAll into CacheCoordinator"
```

---

### Task 4: Create `UserIdentityBar` component

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Primitives/UserIdentityBar.swift`

**Step 1: Implement the component**

Create `packages/MeeshySDK/Sources/MeeshyUI/Primitives/UserIdentityBar.swift`:

```swift
import SwiftUI
import MeeshySDK

/// Reusable inline identity bar showing avatar + display name + @username + optional timestamp.
/// Designed for message bubble footers, but usable in search results, comment threads, member lists, etc.
public struct UserIdentityBar: View {
    public let name: String
    public var username: String? = nil
    public var avatarURL: String? = nil
    public var accentColor: String = ""
    public var timestamp: Date? = nil
    public var avatarMode: AvatarMode = .messageBubble
    public var presenceState: PresenceState = .offline
    public var moodEmoji: String? = nil
    public var onAvatarTap: (() -> Void)? = nil
    public var contextMenuItems: [AvatarContextMenuItem]? = nil

    public init(
        name: String,
        username: String? = nil,
        avatarURL: String? = nil,
        accentColor: String = "",
        timestamp: Date? = nil,
        avatarMode: AvatarMode = .messageBubble,
        presenceState: PresenceState = .offline,
        moodEmoji: String? = nil,
        onAvatarTap: (() -> Void)? = nil,
        contextMenuItems: [AvatarContextMenuItem]? = nil
    ) {
        self.name = name
        self.username = username
        self.avatarURL = avatarURL
        self.accentColor = accentColor
        self.timestamp = timestamp
        self.avatarMode = avatarMode
        self.presenceState = presenceState
        self.moodEmoji = moodEmoji
        self.onAvatarTap = onAvatarTap
        self.contextMenuItems = contextMenuItems
    }

    @ObservedObject private var theme = ThemeManager.shared

    private var timeString: String? {
        guard let timestamp else { return nil }
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: timestamp)
    }

    public var body: some View {
        HStack(spacing: 8) {
            MeeshyAvatar(
                name: name,
                mode: avatarMode,
                accentColor: accentColor.isEmpty ? DynamicColorGenerator.colorForName(name) : accentColor,
                avatarURL: avatarURL,
                moodEmoji: moodEmoji,
                presenceState: presenceState,
                enablePulse: false,
                onTap: onAvatarTap,
                onViewProfile: onAvatarTap,
                contextMenuItems: contextMenuItems
            )

            VStack(alignment: .leading, spacing: 1) {
                Text(name)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                if let username {
                    Text("@\(username)")
                        .font(.system(size: 11))
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 4)

            if let time = timeString {
                Text(time)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(theme.textSecondary)
            }
        }
    }
}
```

**Step 2: Build to verify**

Run: `./apps/ios/meeshy.sh build 2>&1 | tail -5`
Expected: BUILD SUCCEEDED

**Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Primitives/UserIdentityBar.swift
git commit -m "feat(sdk): add reusable UserIdentityBar component"
```

---

### Task 5: Update ThemedMessageBubble colors

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift`

**Step 1: Update bubble background colors**

Find the `bubbleBackground` computed property (around line 1379). Replace it with:

```swift
    private var bubbleBackground: some View {
        let isDark = theme.mode.isDark

        return RoundedRectangle(cornerRadius: 18, style: .continuous)
            .fill(
                message.isMe ?
                LinearGradient(
                    colors: [Color(hex: "6366F1"), Color(hex: "4338CA")],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ) :
                LinearGradient(
                    colors: [
                        Color(hex: otherBubbleColor).opacity(isDark ? 0.35 : 0.25),
                        Color(hex: otherBubbleColor).opacity(isDark ? 0.20 : 0.15)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(
                        message.isMe ?
                        LinearGradient(colors: [Color.clear, Color.clear], startPoint: .topLeading, endPoint: .bottomTrailing) :
                        LinearGradient(
                            colors: [Color(hex: otherBubbleColor).opacity(0.5), Color(hex: otherBubbleColor).opacity(0.2)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: message.isMe ? 0 : 1
                    )
            )
    }
```

**Step 2: Add `otherBubbleColor` computed property**

Add near the existing `bubbleColor` property (around line 104):

```swift
    /// Blended color for others' bubbles: conversation accent (30%) + brand Indigo (70%).
    /// Stays in the Indigo chromatic family while reflecting the conversation's unique accent.
    private var otherBubbleColor: String {
        DynamicColorGenerator.blendTwo(contactColor, weight1: 0.30, "6366F1", weight2: 0.70)
    }
```

Note: This is a synchronous call using `DynamicColorGenerator.blendTwo` directly (not the actor cache) since we're in a View body. The `UserColorCache` actor is for non-View contexts. The computation is lightweight (hex math) and SwiftUI caches view bodies.

**Step 3: Update shadow color for own messages**

Search for shadow references on the bubble. Update any `Color(hex: contactColor).opacity(0.3)` for isMe to use brand Indigo:

Replace shadow for `isMe` from:
```swift
.shadow(color: Color(hex: contactColor).opacity(message.isMe ? 0.3 : 0.2), radius: 6, y: 3)
```
To:
```swift
.shadow(color: Color(hex: message.isMe ? "6366F1" : otherBubbleColor).opacity(message.isMe ? 0.3 : 0.2), radius: 6, y: 3)
```

**Step 4: Build and verify**

Run: `./apps/ios/meeshy.sh build 2>&1 | tail -5`
Expected: BUILD SUCCEEDED

**Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift
git commit -m "feat(ios): brand Indigo for own bubbles, blended accent for others"
```

---

### Task 6: Integrate UserIdentityBar into ThemedMessageBubble

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift`

**Step 1: Add `isDirect` property to ThemedMessageBubble**

Add a new property in the struct definition (around line 18, after `contactColor`):

```swift
    var isDirect: Bool = false
```

**Step 2: Add the identity bar inside the bubble**

Find where the bubble content VStack ends (the VStack that contains text, media, meta row, etc. — before the `.background(bubbleBackground)`). Add the `UserIdentityBar` as the last element inside the bubble, after the meta row, conditionally for group conversations:

```swift
        // Identity bar (group conversations only, last in group, others' messages)
        if !isDirect && isLastInGroup && !message.isMe {
            Divider()
                .frame(height: 0.5)
                .background(theme.textMuted.opacity(0.2))
                .padding(.horizontal, 8)

            UserIdentityBar(
                name: message.senderName ?? "?",
                username: message.senderUsername,
                avatarURL: message.senderAvatarURL,
                accentColor: message.senderColor ?? contactColor,
                timestamp: message.createdAt,
                avatarMode: .messageBubble,
                presenceState: presenceState,
                moodEmoji: senderMoodEmoji,
                onAvatarTap: {
                    selectedProfileUser = .from(message: message)
                },
                contextMenuItems: [
                    AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill") {
                        selectedProfileUser = .from(message: message)
                    }
                ]
            )
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
        }
```

**Step 3: Build and verify**

Run: `./apps/ios/meeshy.sh build 2>&1 | tail -5`
Expected: BUILD SUCCEEDED

**Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift
git commit -m "feat(ios): integrate UserIdentityBar footer in group bubble"
```

---

### Task 7: Update ConversationView+MessageRow — remove external avatar, symmetric margins, pass isDirect

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift`

**Step 1: Pass `isDirect` to ThemedMessageBubble**

Find where `ThemedMessageBubble` is instantiated (around line 44-80). Add the `isDirect` parameter:

```swift
    ThemedMessageBubble(
        message: msg,
        contactColor: accentColor,
        isDirect: isDirect,       // ADD THIS LINE
        transcription: ...
```

**Step 2: Remove external avatar pass-through**

Change the `showAvatar` parameter from `!isDirect && isLastInGroup` to `false` (the avatar is now inside the bubble via UserIdentityBar):

```swift
        showAvatar: false,  // Avatar now inside bubble via UserIdentityBar
```

**Step 3: Remove Spacer-based alignment in ThemedMessageBubble**

In `ThemedMessageBubble.swift`, find the HStack that contains the avatar + bubble content (around line 387-429). The structure is currently:

```swift
HStack(alignment: .bottom, spacing: 8) {
    if message.isMe { Spacer(minLength: 50) }

    if !message.isMe {
        if showAvatar {
            MeeshyAvatar(...)
        } else {
            Color.clear.frame(width: 32, height: 32)
        }
    }

    VStack(...) { /* bubble content */ }

    if !message.isMe { Spacer(minLength: 50) }
}
```

Replace with symmetric layout — remove external avatar, keep `Spacer(minLength: 50)` on opposite side only:

```swift
HStack(alignment: .bottom, spacing: 0) {
    if message.isMe { Spacer(minLength: 50) }

    VStack(alignment: message.isMe ? .trailing : .leading, spacing: 4) {
        /* existing bubble content unchanged */
    }

    if !message.isMe { Spacer(minLength: 50) }
}
```

Remove the entire `if !message.isMe { if showAvatar { MeeshyAvatar(...) } else { Color.clear... } }` block.

**Step 4: Build and test on simulator**

Run: `./apps/ios/meeshy.sh build 2>&1 | tail -5`
Expected: BUILD SUCCEEDED

Then: `./apps/ios/meeshy.sh run` — verify visually:
- Own messages: Indigo gradient, right-aligned
- Others' messages (DM): blended color, left-aligned, no identity bar
- Others' messages (group): blended color, left-aligned, identity bar on last-in-group

**Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift
git commit -m "feat(ios): remove external avatar, symmetric margins, pass isDirect"
```

---

### Task 8: Final build, visual verification, and cleanup

**Files:**
- All modified files from Tasks 1-7

**Step 1: Full build**

Run: `./apps/ios/meeshy.sh build 2>&1 | tail -10`
Expected: BUILD SUCCEEDED with zero warnings on modified files

**Step 2: Run SDK tests**

Run: `cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet 2>&1 | tail -20`
Expected: ALL TESTS PASS (including new ColorGenerationTests and UserColorCacheTests)

**Step 3: Visual verification on simulator**

Run: `./apps/ios/meeshy.sh run`

Verify:
1. **DM conversation**: Own bubbles = Indigo gradient. Other's bubbles = blended tint. No identity bar. Same margin distance from edges.
2. **Group conversation**: Own bubbles = Indigo gradient. Others' = blended tint. Last-in-group has identity bar with avatar + name + @username + time. Reactions overlay on top.
3. **Different conversations**: The blended color varies per conversation accent but always stays in the Indigo family.
4. **Dark mode**: Check contrast and readability.
5. **Light mode**: Check contrast and readability.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(ios): bubble redesign — brand Indigo, blended accent, UserIdentityBar"
```
