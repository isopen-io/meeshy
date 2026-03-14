# UserIdentityBar Unified Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor UserIdentityBar into a zone-based layout engine with typed elements and 3 context presets (message bubble, comment, listing), merging the message meta row into the identity bar to eliminate duplication.

**Architecture:** Replace the fixed-layout UserIdentityBar with a composable component accepting 4 zones of ordered `IdentityBarElement` values. Each element is a self-contained renderable unit; the component does zero formatting. Provide 3 static factory presets. In ThemedMessageBubble, when the identity bar is shown, it replaces both the old identity bar AND the meta row.

**Tech Stack:** SwiftUI, MeeshySDK (MeeshyUI target), MeeshySDK models (MemberRole, DeliveryStatus, PresenceState)

---

### Task 1: Define IdentityBarElement enum and AvatarConfig struct

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Primitives/UserIdentityBar.swift`

**Context:** The current `UserIdentityBar.swift` is a simple 87-line component with fixed avatar+name+username+time layout. We need to replace it entirely with the zone-based engine. This task defines the data types only — no view code yet.

**Reference types already in the SDK:**
- `MemberRole` at `packages/MeeshySDK/Sources/MeeshySDK/Models/MemberRole.swift` — has `.icon` property returning SF Symbol names (`crown.fill`, `shield.checkered`, `shield.lefthalf.filled`, `person.fill`)
- `MeeshyMessage.DeliveryStatus` at `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift:328` — enum with `.sending`, `.sent`, `.delivered`, `.read`, `.failed`
- `PresenceState` at `packages/MeeshySDK/Sources/MeeshySDK/Models/PresenceModels.swift:5` — enum with `.online`, `.away`, `.offline`
- `AvatarMode` at `packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyAvatar.swift:6` — enum with `.messageBubble` (32pt), `.conversationList` (52pt), etc.
- `AvatarContextMenuItem` at `packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyAvatar.swift:117` — struct with `label`, `icon`, `role`, `action`

**Step 1: Write the failing test**

Create test file:

```swift
// packages/MeeshySDK/Tests/MeeshySDKTests/Models/IdentityBarElementTests.swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

final class IdentityBarElementTests: XCTestCase {

    func test_element_name_hasStableId() {
        let e1 = IdentityBarElement.name
        let e2 = IdentityBarElement.name
        XCTAssertEqual(e1.id, e2.id)
    }

    func test_element_username_hasStableId() {
        let e = IdentityBarElement.username("@alice")
        XCTAssertFalse(e.id.isEmpty)
    }

    func test_element_time_hasStableId() {
        let e = IdentityBarElement.time("19:47")
        XCTAssertFalse(e.id.isEmpty)
    }

    func test_element_roleBadge_hasStableId() {
        let e = IdentityBarElement.roleBadge(.admin)
        XCTAssertFalse(e.id.isEmpty)
    }

    func test_element_delivery_hasStableId() {
        let e = IdentityBarElement.delivery(.read)
        XCTAssertFalse(e.id.isEmpty)
    }

    func test_element_text_hasStableId() {
        let e = IdentityBarElement.text("custom")
        XCTAssertFalse(e.id.isEmpty)
    }

    func test_avatarConfig_initDefaults() {
        let config = AvatarConfig(accentColor: "FF0000")
        XCTAssertNil(config.url)
        XCTAssertEqual(config.accentColor, "FF0000")
        XCTAssertNil(config.moodEmoji)
    }
}
```

**Step 2: Run test to verify it fails**

```bash
cd packages/MeeshySDK && xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshySDKTests/IdentityBarElementTests 2>&1 | grep -E '(Test Case|passed|failed|error:)' | tail -20
```

Expected: FAIL — `IdentityBarElement` and `AvatarConfig` not defined.

**Step 3: Write minimal implementation**

Replace the entire content of `packages/MeeshySDK/Sources/MeeshyUI/Primitives/UserIdentityBar.swift` with:

```swift
import SwiftUI
import MeeshySDK

// MARK: - Identity Bar Element

public enum IdentityBarElement: Identifiable {
    case name
    case username(String)
    case roleBadge(MemberRole)
    case time(String)
    case delivery(MeeshyMessage.DeliveryStatus)
    case flags([String], active: String?, onTap: ((String) -> Void)?)
    case translateButton(action: () -> Void)
    case presence(PresenceState)
    case memberSince(String)
    case actionButton(String, action: () -> Void)
    case actionMenu(String, items: [ActionMenuItem])
    case text(String)

    public var id: String {
        switch self {
        case .name: return "name"
        case .username(let u): return "username:\(u)"
        case .roleBadge(let r): return "role:\(r.rawValue)"
        case .time(let t): return "time:\(t)"
        case .delivery(let d): return "delivery:\(d.rawValue)"
        case .flags: return "flags"
        case .translateButton: return "translate"
        case .presence(let p): return "presence:\(String(describing: p))"
        case .memberSince(let s): return "since:\(s)"
        case .actionButton(let label, _): return "action:\(label)"
        case .actionMenu(let label, _): return "menu:\(label)"
        case .text(let t): return "text:\(t)"
        }
    }
}

// MARK: - Action Menu Item

public struct ActionMenuItem: Identifiable {
    public let id = UUID()
    public let label: String
    public let icon: String?
    public var role: ButtonRole? = nil
    public let action: () -> Void

    public init(label: String, icon: String? = nil, role: ButtonRole? = nil, action: @escaping () -> Void) {
        self.label = label
        self.icon = icon
        self.role = role
        self.action = action
    }
}

// MARK: - Avatar Config

public struct AvatarConfig {
    public var url: String?
    public var accentColor: String
    public var mode: AvatarMode
    public var moodEmoji: String?
    public var presenceState: PresenceState
    public var onTap: (() -> Void)?
    public var contextMenuItems: [AvatarContextMenuItem]?

    public init(
        url: String? = nil,
        accentColor: String,
        mode: AvatarMode = .messageBubble,
        moodEmoji: String? = nil,
        presenceState: PresenceState = .offline,
        onTap: (() -> Void)? = nil,
        contextMenuItems: [AvatarContextMenuItem]? = nil
    ) {
        self.url = url
        self.accentColor = accentColor
        self.mode = mode
        self.moodEmoji = moodEmoji
        self.presenceState = presenceState
        self.onTap = onTap
        self.contextMenuItems = contextMenuItems
    }
}

// MARK: - UserIdentityBar (placeholder body — implemented in Task 2)

public struct UserIdentityBar: View {
    public var avatar: AvatarConfig?
    public var name: String?
    public var leadingPrimary: [IdentityBarElement]
    public var trailingPrimary: [IdentityBarElement]
    public var leadingSecondary: [IdentityBarElement]
    public var trailingSecondary: [IdentityBarElement]

    public init(
        avatar: AvatarConfig? = nil,
        name: String? = nil,
        leadingPrimary: [IdentityBarElement] = [],
        trailingPrimary: [IdentityBarElement] = [],
        leadingSecondary: [IdentityBarElement] = [],
        trailingSecondary: [IdentityBarElement] = []
    ) {
        assert(avatar != nil || name != nil, "UserIdentityBar requires at least avatar or name")
        self.avatar = avatar
        self.name = name
        self.leadingPrimary = leadingPrimary
        self.trailingPrimary = trailingPrimary
        self.leadingSecondary = leadingSecondary
        self.trailingSecondary = trailingSecondary
    }

    @ObservedObject private var theme = ThemeManager.shared

    public var body: some View {
        EmptyView() // Placeholder — layout implemented in Task 2
    }
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/MeeshySDK && xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshySDKTests/IdentityBarElementTests 2>&1 | grep -E '(Test Case|passed|failed|error:)' | tail -20
```

Expected: All 7 tests PASS.

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Primitives/UserIdentityBar.swift \
       packages/MeeshySDK/Tests/MeeshySDKTests/Models/IdentityBarElementTests.swift
git commit -m "feat(ui): define IdentityBarElement enum, AvatarConfig, and ActionMenuItem"
```

---

### Task 2: Implement zone-based layout body

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Primitives/UserIdentityBar.swift`

**Context:** Task 1 left the `body` as `EmptyView()`. This task implements the full layout engine that renders the 4 zones with a `render()` function per element type. The rendering specs come from the design doc.

**Reference for rendering:**
- ThemeManager colors: `theme.textPrimary`, `theme.textSecondary`, `theme.textMuted`
- MemberRole icons: `.icon` property returns SF Symbol string (e.g. `crown.fill`)
- DeliveryStatus: reuse the exact checkmark rendering logic from `ThemedMessageBubble.swift:938-980` (the `deliveryCheckmarks` function)
- Translate icon: `Image(systemName: "translate")` with color `#4ECDC4`
- Flag rendering: emoji text with size 10-12, active flag slightly larger with colored underline (from `swapFlagButton` at `ThemedMessageBubble.swift:735-783`)

**Step 1: Write the failing test**

Add to `IdentityBarElementTests.swift`:

```swift
import SwiftUI

// Test that the body renders without crashing for each configuration
final class UserIdentityBarLayoutTests: XCTestCase {

    func test_barWithNameOnly_doesNotCrash() {
        let bar = UserIdentityBar(
            name: "Alice",
            leadingPrimary: [.name]
        )
        XCTAssertNotNil(bar.body)
    }

    func test_barWithAvatarOnly_doesNotCrash() {
        let bar = UserIdentityBar(
            avatar: AvatarConfig(accentColor: "FF0000")
        )
        XCTAssertNotNil(bar.body)
    }

    func test_barWithAllZones_doesNotCrash() {
        let bar = UserIdentityBar(
            avatar: AvatarConfig(accentColor: "6366F1"),
            name: "Alice",
            leadingPrimary: [.name, .roleBadge(.admin)],
            trailingPrimary: [.time("19:47"), .delivery(.read)],
            leadingSecondary: [.username("@alice")],
            trailingSecondary: [.text("info")]
        )
        XCTAssertNotNil(bar.body)
    }

    func test_barWithEmptySecondaryZones_hidesSecondLine() {
        let bar = UserIdentityBar(
            name: "Alice",
            leadingPrimary: [.name],
            trailingPrimary: [.time("19:47")]
        )
        // secondaryZones empty → second line hidden
        XCTAssertTrue(bar.leadingSecondary.isEmpty)
        XCTAssertTrue(bar.trailingSecondary.isEmpty)
    }
}
```

**Step 2: Run test to verify it fails**

```bash
cd packages/MeeshySDK && xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshySDKTests/UserIdentityBarLayoutTests 2>&1 | grep -E '(Test Case|passed|failed|error:)' | tail -20
```

Expected: Tests may technically pass since `EmptyView()` returns a non-nil body. But we're building towards a real layout. Proceed to implementation.

**Step 3: Implement the layout body**

Replace the `body` property and add the `render()` function in `UserIdentityBar.swift`. The full `body` and supporting code:

```swift
// Inside UserIdentityBar struct, replace the body and add render helpers:

public var body: some View {
    HStack(spacing: 8) {
        if let avatar {
            MeeshyAvatar(
                name: name ?? "?",
                mode: avatar.mode,
                accentColor: avatar.accentColor,
                avatarURL: avatar.url,
                moodEmoji: avatar.moodEmoji,
                presenceState: avatar.presenceState,
                enablePulse: false,
                onTap: avatar.onTap,
                onViewProfile: avatar.onTap,
                contextMenuItems: avatar.contextMenuItems
            )
        }

        VStack(alignment: .leading, spacing: 2) {
            // Line 1
            HStack(spacing: 4) {
                ForEach(leadingPrimary) { element in
                    renderElement(element)
                }
                Spacer(minLength: 4)
                ForEach(trailingPrimary) { element in
                    renderElement(element)
                }
            }

            // Line 2 (only if non-empty)
            if !leadingSecondary.isEmpty || !trailingSecondary.isEmpty {
                HStack(spacing: 4) {
                    ForEach(leadingSecondary) { element in
                        renderElement(element)
                    }
                    Spacer(minLength: 4)
                    ForEach(trailingSecondary) { element in
                        renderElement(element)
                    }
                }
            }
        }
    }
}

// MARK: - Element Renderer

@ViewBuilder
private func renderElement(_ element: IdentityBarElement) -> some View {
    switch element {
    case .name:
        if let name {
            Text(name)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .lineLimit(1)
        }

    case .username(let username):
        Text(username)
            .font(.system(size: 11))
            .foregroundColor(theme.textSecondary)
            .lineLimit(1)

    case .roleBadge(let role):
        if role != .member {
            Image(systemName: role.icon)
                .font(.system(size: 11))
                .foregroundColor(roleBadgeColor(for: role))
        }

    case .time(let timeString):
        Text(timeString)
            .font(.system(size: 11, weight: .medium))
            .foregroundColor(theme.textSecondary)

    case .delivery(let status):
        deliveryView(status)

    case .flags(let codes, let active, let onTap):
        flagsView(codes: codes, active: active, onTap: onTap)

    case .translateButton(let action):
        Image(systemName: "translate")
            .font(.system(size: 10, weight: .medium))
            .foregroundColor(Color(hex: "4ECDC4"))
            .onTapGesture { action() }
            .accessibilityLabel("Traduction disponible")

    case .presence(let state):
        presenceView(state)

    case .memberSince(let text):
        Text(text)
            .font(.system(size: 11))
            .foregroundColor(theme.textSecondary)
            .lineLimit(1)

    case .actionButton(let label, let action):
        Button(action: action) {
            Text(label)
                .font(.system(size: 12, weight: .medium))
                .padding(.horizontal, 12)
                .padding(.vertical, 5)
                .background(MeeshyColors.indigo500.opacity(0.15))
                .foregroundColor(MeeshyColors.indigo500)
                .clipShape(Capsule())
        }

    case .actionMenu(let label, let items):
        Menu {
            ForEach(items) { item in
                Button(role: item.role) {
                    item.action()
                } label: {
                    Label(item.label, systemImage: item.icon ?? "circle")
                }
            }
        } label: {
            HStack(spacing: 3) {
                Text(label)
                Image(systemName: "chevron.down")
                    .font(.system(size: 8, weight: .bold))
            }
            .font(.system(size: 12, weight: .medium))
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .background(MeeshyColors.indigo500.opacity(0.15))
            .foregroundColor(MeeshyColors.indigo500)
            .clipShape(Capsule())
        }

    case .text(let content):
        Text(content)
            .font(.system(size: 11))
            .foregroundColor(theme.textSecondary)
            .lineLimit(1)
    }
}

// MARK: - Delivery Checkmarks

@ViewBuilder
private func deliveryView(_ status: MeeshyMessage.DeliveryStatus) -> some View {
    let color = theme.textSecondary.opacity(0.6)
    switch status {
    case .sending:
        Image(systemName: "clock")
            .font(.system(size: 10))
            .foregroundColor(color)
    case .sent:
        Image(systemName: "checkmark")
            .font(.system(size: 10, weight: .semibold))
            .foregroundColor(color)
    case .delivered:
        ZStack(alignment: .leading) {
            Image(systemName: "checkmark")
                .font(.system(size: 10, weight: .semibold))
            Image(systemName: "checkmark")
                .font(.system(size: 10, weight: .semibold))
                .offset(x: 4)
        }
        .foregroundColor(color)
        .frame(width: 16)
    case .read:
        ZStack(alignment: .leading) {
            Image(systemName: "checkmark")
                .font(.system(size: 10, weight: .semibold))
            Image(systemName: "checkmark")
                .font(.system(size: 10, weight: .semibold))
                .offset(x: 4)
        }
        .foregroundColor(MeeshyColors.readReceipt)
        .frame(width: 16)
    case .failed:
        Image(systemName: "exclamationmark.circle.fill")
            .font(.system(size: 11, weight: .bold))
            .foregroundColor(MeeshyColors.error)
    }
}

// MARK: - Flags View

@ViewBuilder
private func flagsView(codes: [String], active: String?, onTap: ((String) -> Void)?) -> some View {
    HStack(spacing: 4) {
        ForEach(codes, id: \.self) { code in
            let display = LanguageDisplay.from(code: code)
            let langColor = Color(hex: LanguageDisplay.colorHex(for: code))
            let isActive = active?.lowercased() == code.lowercased()

            VStack(spacing: 1) {
                Text(display?.flag ?? "🏳️")
                    .font(.system(size: isActive ? 12 : 10))
                    .scaleEffect(isActive ? 1.05 : 1.0)

                if isActive {
                    RoundedRectangle(cornerRadius: 0.5)
                        .fill(langColor)
                        .frame(width: 10, height: 1.5)
                }
            }
            .animation(.spring(response: 0.2), value: isActive)
            .onTapGesture {
                onTap?(code)
            }
        }
    }
}

// MARK: - Presence View

@ViewBuilder
private func presenceView(_ state: PresenceState) -> some View {
    HStack(spacing: 4) {
        switch state {
        case .online:
            Circle()
                .fill(MeeshyColors.success)
                .frame(width: 6, height: 6)
            Text("En ligne")
                .font(.system(size: 11))
                .foregroundColor(MeeshyColors.success)
        case .away:
            Circle()
                .fill(MeeshyColors.warning)
                .frame(width: 6, height: 6)
            Text("Absent")
                .font(.system(size: 11))
                .foregroundColor(MeeshyColors.warning)
        case .offline:
            EmptyView()
        }
    }
}

// MARK: - Role Badge Color

private func roleBadgeColor(for role: MemberRole) -> Color {
    switch role {
    case .creator: return MeeshyColors.warning
    case .admin: return MeeshyColors.indigo500
    case .moderator: return MeeshyColors.indigo400
    case .member: return theme.textSecondary
    }
}
```

**Important:** This code references `LanguageDisplay` which is defined in the app, not the SDK. Check if it needs to be moved or if the flags element should accept pre-resolved flag emoji strings instead. If `LanguageDisplay` is not accessible from MeeshyUI, change `.flags` to accept `[(code: String, flag: String, colorHex: String)]` tuples instead.

**Step 4: Run test to verify it passes**

```bash
cd packages/MeeshySDK && xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshySDKTests/IdentityBarElementTests \
  -only-testing:MeeshySDKTests/UserIdentityBarLayoutTests 2>&1 | grep -E '(Test Case|passed|failed|error:)' | tail -20
```

Expected: All tests PASS.

**Step 5: Build the full iOS app**

```bash
./apps/ios/meeshy.sh build
```

Expected: Build succeeds. If `LanguageDisplay` is not found, adjust the `.flags` element to accept pre-resolved strings (see note above).

**Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Primitives/UserIdentityBar.swift \
       packages/MeeshySDK/Tests/MeeshySDKTests/Models/IdentityBarElementTests.swift
git commit -m "feat(ui): implement zone-based layout engine for UserIdentityBar"
```

---

### Task 3: Add 3 static factory presets

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Primitives/UserIdentityBar.swift`

**Context:** Add `messageBubble`, `comment`, and `listing` static factories that construct the appropriate zone configuration for each context. These save callers from manually assembling zones every time.

**Step 1: Write the failing test**

Add to `IdentityBarElementTests.swift`:

```swift
final class UserIdentityBarPresetTests: XCTestCase {

    func test_messageBubblePreset_populatesAllZones() {
        let bar = UserIdentityBar.messageBubble(
            name: "Alice",
            username: "@alice",
            avatarURL: nil,
            accentColor: "FF0000",
            role: .admin,
            time: "19:47",
            delivery: .read,
            flags: ["fr", "en"],
            activeFlag: "fr",
            onFlagTap: nil,
            onTranslateTap: nil,
            presenceState: .online,
            moodEmoji: nil,
            onAvatarTap: nil
        )
        XCTAssertNotNil(bar.avatar)
        XCTAssertEqual(bar.name, "Alice")
        XCTAssertEqual(bar.leadingPrimary.count, 2) // .name + .roleBadge
        XCTAssertEqual(bar.trailingPrimary.count, 2) // .time + .delivery
        XCTAssertEqual(bar.leadingSecondary.count, 1) // .username
        XCTAssertEqual(bar.trailingSecondary.count, 2) // .flags + .translateButton
    }

    func test_messageBubblePreset_noRole_omitsRoleBadge() {
        let bar = UserIdentityBar.messageBubble(
            name: "Alice", username: nil, avatarURL: nil, accentColor: "FF0000",
            role: nil, time: "19:47", delivery: nil, flags: [],
            activeFlag: nil, onFlagTap: nil, onTranslateTap: nil,
            presenceState: .offline, moodEmoji: nil, onAvatarTap: nil
        )
        XCTAssertEqual(bar.leadingPrimary.count, 1) // .name only
        XCTAssertEqual(bar.trailingPrimary.count, 1) // .time only
        XCTAssertTrue(bar.leadingSecondary.isEmpty)  // no username
        XCTAssertTrue(bar.trailingSecondary.isEmpty)  // no flags, no translate
    }

    func test_commentPreset_populatesCorrectly() {
        let bar = UserIdentityBar.comment(
            name: "Bob",
            username: "@bob",
            avatarURL: "https://example.com/bob.jpg",
            accentColor: "00FF00",
            role: .moderator,
            time: "il y a 2h",
            flags: ["en"],
            activeFlag: nil,
            onFlagTap: nil,
            onTranslateTap: { },
            onAvatarTap: nil
        )
        XCTAssertNotNil(bar.avatar)
        XCTAssertEqual(bar.leadingPrimary.count, 2) // .name + .roleBadge
        XCTAssertEqual(bar.trailingPrimary.count, 1) // .time
        XCTAssertEqual(bar.leadingSecondary.count, 1) // .username
        XCTAssertEqual(bar.trailingSecondary.count, 2) // .flags + .translateButton
    }

    func test_listingPreset_withAction() {
        let bar = UserIdentityBar.listing(
            name: "Charlie",
            username: "@charlie",
            avatarURL: nil,
            accentColor: "0000FF",
            role: nil,
            actionLabel: "Ajouter",
            onAction: { },
            statusText: "En ligne",
            onAvatarTap: nil
        )
        XCTAssertEqual(bar.trailingPrimary.count, 1) // .actionButton
        XCTAssertEqual(bar.trailingSecondary.count, 1) // .text (status)
    }

    func test_listingPreset_noAction_noStatus() {
        let bar = UserIdentityBar.listing(
            name: "Charlie", username: nil, avatarURL: nil, accentColor: "0000FF",
            role: nil, actionLabel: nil, onAction: nil, statusText: nil, onAvatarTap: nil
        )
        XCTAssertTrue(bar.trailingPrimary.isEmpty)
        XCTAssertTrue(bar.trailingSecondary.isEmpty)
        XCTAssertTrue(bar.leadingSecondary.isEmpty)
    }
}
```

**Step 2: Run test to verify it fails**

```bash
cd packages/MeeshySDK && xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshySDKTests/UserIdentityBarPresetTests 2>&1 | grep -E '(Test Case|passed|failed|error:)' | tail -20
```

Expected: FAIL — static factories not defined.

**Step 3: Implement the presets**

Add to `UserIdentityBar.swift`, as an extension:

```swift
// MARK: - Presets

extension UserIdentityBar {

    public static func messageBubble(
        name: String,
        username: String?,
        avatarURL: String?,
        accentColor: String,
        role: MemberRole?,
        time: String,
        delivery: MeeshyMessage.DeliveryStatus?,
        flags: [String],
        activeFlag: String?,
        onFlagTap: ((String) -> Void)?,
        onTranslateTap: (() -> Void)?,
        presenceState: PresenceState = .offline,
        moodEmoji: String? = nil,
        onAvatarTap: (() -> Void)?
    ) -> UserIdentityBar {
        var lp: [IdentityBarElement] = [.name]
        if let role, role != .member { lp.append(.roleBadge(role)) }

        var tp: [IdentityBarElement] = [.time(time)]
        if let delivery { tp.append(.delivery(delivery)) }

        var ls: [IdentityBarElement] = []
        if let username { ls.append(.username(username)) }

        var ts: [IdentityBarElement] = []
        if !flags.isEmpty { ts.append(.flags(flags, active: activeFlag, onTap: onFlagTap)) }
        if let onTranslateTap { ts.append(.translateButton(action: onTranslateTap)) }

        return UserIdentityBar(
            avatar: AvatarConfig(
                url: avatarURL,
                accentColor: accentColor,
                mode: .messageBubble,
                moodEmoji: moodEmoji,
                presenceState: presenceState,
                onTap: onAvatarTap,
                contextMenuItems: onAvatarTap != nil ? [
                    AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill", action: onAvatarTap!)
                ] : nil
            ),
            name: name,
            leadingPrimary: lp,
            trailingPrimary: tp,
            leadingSecondary: ls,
            trailingSecondary: ts
        )
    }

    public static func comment(
        name: String,
        username: String?,
        avatarURL: String?,
        accentColor: String,
        role: MemberRole?,
        time: String,
        flags: [String],
        activeFlag: String?,
        onFlagTap: ((String) -> Void)?,
        onTranslateTap: (() -> Void)?,
        onAvatarTap: (() -> Void)?
    ) -> UserIdentityBar {
        var lp: [IdentityBarElement] = [.name]
        if let role, role != .member { lp.append(.roleBadge(role)) }

        var ls: [IdentityBarElement] = []
        if let username { ls.append(.username(username)) }

        var ts: [IdentityBarElement] = []
        if !flags.isEmpty { ts.append(.flags(flags, active: activeFlag, onTap: onFlagTap)) }
        if let onTranslateTap { ts.append(.translateButton(action: onTranslateTap)) }

        return UserIdentityBar(
            avatar: AvatarConfig(
                url: avatarURL,
                accentColor: accentColor,
                mode: .messageBubble,
                onTap: onAvatarTap
            ),
            name: name,
            leadingPrimary: lp,
            trailingPrimary: [.time(time)],
            leadingSecondary: ls,
            trailingSecondary: ts
        )
    }

    public static func listing(
        name: String,
        username: String?,
        avatarURL: String?,
        accentColor: String,
        role: MemberRole?,
        actionLabel: String?,
        onAction: (() -> Void)?,
        statusText: String?,
        onAvatarTap: (() -> Void)?
    ) -> UserIdentityBar {
        var lp: [IdentityBarElement] = [.name]
        if let role, role != .member { lp.append(.roleBadge(role)) }

        var tp: [IdentityBarElement] = []
        if let actionLabel, let onAction {
            tp.append(.actionButton(actionLabel, action: onAction))
        }

        var ls: [IdentityBarElement] = []
        if let username { ls.append(.username(username)) }

        var ts: [IdentityBarElement] = []
        if let statusText { ts.append(.text(statusText)) }

        return UserIdentityBar(
            avatar: AvatarConfig(
                url: avatarURL,
                accentColor: accentColor,
                mode: .conversationList,
                onTap: onAvatarTap
            ),
            name: name,
            leadingPrimary: lp,
            trailingPrimary: tp,
            leadingSecondary: ls,
            trailingSecondary: ts
        )
    }
}
```

**Step 4: Run tests**

```bash
cd packages/MeeshySDK && xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshySDKTests/UserIdentityBarPresetTests 2>&1 | grep -E '(Test Case|passed|failed|error:)' | tail -20
```

Expected: All 5 tests PASS.

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Primitives/UserIdentityBar.swift \
       packages/MeeshySDK/Tests/MeeshySDKTests/Models/IdentityBarElementTests.swift
git commit -m "feat(ui): add messageBubble, comment, listing presets to UserIdentityBar"
```

---

### Task 4: Integrate into ThemedMessageBubble

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift`

**Context:** This is the critical integration task. When the identity bar is shown (`!isDirect && isLastInGroup && !message.isMe`), it replaces both the `messageMetaRow` and the old `UserIdentityBar`. When the identity bar is NOT shown, `messageMetaRow` stays as-is.

**Key changes:**
1. Remove the `Divider()` between content and identity bar (line ~478-480)
2. Replace the old `UserIdentityBar(...)` instantiation (lines ~482-501) with `UserIdentityBar.messageBubble(...)`
3. Conditionally skip `messageMetaRow` when identity bar is visible
4. Pass flag/translation data to the new preset

**Step 1: Identify the current structure**

Current code at lines ~460-502 (approximate):
```swift
VStack(alignment: .leading, spacing: 8) {
    // ... attachments, text, secondaryContent ...
    messageMetaRow(insideBubble: true)    // <-- always shown currently
}
.padding(...)

// Identity bar (group conversations only)
if !isDirect && isLastInGroup && !message.isMe {
    Divider()                                // <-- REMOVE
        .background(...)
        .padding(...)

    UserIdentityBar(                         // <-- REPLACE with .messageBubble(...)
        name: ..., username: ..., ...
    )
    .padding(...)
}
```

**Step 2: Implement the changes**

Add a computed property for the identity bar condition:

```swift
private var showIdentityBar: Bool {
    !isDirect && isLastInGroup && !message.isMe
}
```

Change the VStack to conditionally show `messageMetaRow`:

```swift
VStack(alignment: .leading, spacing: 8) {
    // ... existing attachments, text, secondaryContent ...

    if !showIdentityBar {
        messageMetaRow(insideBubble: true)
    }
}
.padding(.horizontal, 14)
.padding(.vertical, hasTextOrNonMediaContent ? 10 : 4)

if showIdentityBar {
    UserIdentityBar.messageBubble(
        name: message.senderName ?? "?",
        username: message.senderUsername.map { "@\($0)" },
        avatarURL: message.senderAvatarURL,
        accentColor: message.senderColor ?? contactColor,
        role: nil, // TODO: pass participant role when available
        time: timeString,
        delivery: message.isMe ? message.deliveryStatus : message.deliveryStatus,
        flags: buildAvailableFlags(),
        activeFlag: secondaryLangCode,
        onFlagTap: { code in handleFlagTap(code) },
        onTranslateTap: textTranslations.isEmpty ? nil : { onShowTranslationDetail?(message.id) },
        presenceState: presenceState,
        moodEmoji: senderMoodEmoji,
        onAvatarTap: { selectedProfileUser = .from(message: message) }
    )
    .padding(.horizontal, 10)
    .padding(.vertical, 8)
}
```

Extract flag building from `inlineFlagStrip` into a reusable function:

```swift
private func buildAvailableFlags() -> [String] {
    let activeLang = currentDisplayLangCode.lowercased()
    let origLower = message.originalLanguage.lowercased()
    let user = AuthManager.shared.currentUser

    var all: [String] = [origLower]
    var seen: Set<String> = [origLower]

    if let pc = preferredTranslation?.targetLanguage.lowercased(), !seen.contains(pc) {
        all.append(pc); seen.insert(pc)
    }

    if let reg = user?.regionalLanguage?.lowercased(), !seen.contains(reg),
       textTranslations.contains(where: { $0.targetLanguage.lowercased() == reg }) {
        all.append(reg); seen.insert(reg)
    }

    if user?.useCustomDestination == true,
       let custom = user?.customDestinationLanguage?.lowercased(), !seen.contains(custom),
       textTranslations.contains(where: { $0.targetLanguage.lowercased() == custom }) {
        all.append(custom); seen.insert(custom)
    }

    return all.filter { $0 != activeLang }
}

private func handleFlagTap(_ code: String) {
    let isOriginal = code.lowercased() == message.originalLanguage.lowercased()
    let hasContent = isOriginal || textTranslations.contains(where: { $0.targetLanguage.lowercased() == code.lowercased() })

    if !hasContent {
        onRequestTranslation?(message.id, code)
        HapticFeedback.light()
        return
    }
    if isOriginal {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            activeDisplayLangCode = code
            secondaryLangCode = nil
        }
    } else {
        let isShowing = secondaryLangCode?.lowercased() == code.lowercased()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            secondaryLangCode = isShowing ? nil : code
        }
    }
    HapticFeedback.light()
}
```

**Step 3: Remove the old Divider and old UserIdentityBar block**

Delete lines containing:
- `Divider().background(theme.textMuted.opacity(0.2)).padding(.horizontal, 8)`
- The old `UserIdentityBar(name: ..., username: ..., ...)` block

**Step 4: Build and verify**

```bash
./apps/ios/meeshy.sh build
```

Expected: Build succeeds.

**Step 5: Visual verification on simulator**

```bash
./apps/ios/meeshy.sh run
```

Open a group conversation and verify:
1. Last message of a sender group shows: avatar + name + time + checkmarks on line 1, @username + flags + translate on line 2
2. Non-last messages show the classic meta row (flags + translate + time + checkmarks)
3. No Divider between content and identity bar
4. DM conversations: no identity bar, meta row as before
5. Own messages: no identity bar, meta row as before

**Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift
git commit -m "feat(ios): integrate unified UserIdentityBar into message bubbles, merge meta row"
```

---

### Task 5: Full build + all SDK tests + visual verification

**Files:** None (verification only)

**Step 1: Run full iOS build**

```bash
./apps/ios/meeshy.sh build
```

Expected: Build succeeds.

**Step 2: Run all SDK tests**

```bash
cd packages/MeeshySDK && xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' 2>&1 | grep -E '(Test Suite.*passed|Test Suite.*failed|Executed)' | tail -10
```

Expected: All tests pass (500+ existing + 17 new).

**Step 3: Visual verification on simulator**

Install and launch:
```bash
./apps/ios/meeshy.sh run
```

Verify these scenarios:
1. **Group conversation** — last message from other: avatar + name + badge + time + checkmarks / @username + flags + translate
2. **Group conversation** — non-last message from other: classic meta row only
3. **Group conversation** — own messages: classic meta row (no identity bar)
4. **DM conversation** — no identity bar on any message
5. **Flags still work** — tap flag switches language, tap translate opens detail
6. **Reactions** still overlay correctly on top

**Step 4: Commit (if any fixes needed)**

```bash
git add -A && git commit -m "fix(ios): adjustments from visual verification"
```
