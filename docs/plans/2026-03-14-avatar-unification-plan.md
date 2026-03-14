# Avatar Unification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `AvatarMode` with `AvatarContext` enum, fix `handleTap()` story priority, and migrate all custom avatar renderings to `MeeshyAvatar`.

**Architecture:** New `AvatarContext` enum in MeeshyAvatar.swift encodes full behavior per usage context. `AvatarMode` is deprecated with a mapping. All Circle+initials and CachedAsyncImage avatar code across the app is replaced by `MeeshyAvatar` calls. `AvatarConfig` in UserIdentityBar is updated to use `AvatarContext`.

**Tech Stack:** Swift 5.9, SwiftUI, MeeshySDK (MeeshyUI target), XCTest

---

### Task 1: Add AvatarContext enum and deprecate AvatarMode

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyAvatar.swift:6-77`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/AvatarContextTests.swift`

**Step 1: Write tests for AvatarContext computed properties**

Create `packages/MeeshySDK/Tests/MeeshyUITests/AvatarContextTests.swift`:

```swift
import XCTest
@testable import MeeshyUI

final class AvatarContextTests: XCTestCase {

    // MARK: - Size

    func test_storyTray_size_is44() {
        XCTAssertEqual(AvatarContext.storyTray.size, 44)
    }

    func test_conversationList_size_is52() {
        XCTAssertEqual(AvatarContext.conversationList.size, 52)
    }

    func test_messageBubble_size_is32() {
        XCTAssertEqual(AvatarContext.messageBubble.size, 32)
    }

    func test_profileBanner_size_is90() {
        XCTAssertEqual(AvatarContext.profileBanner.size, 90)
    }

    func test_typingIndicator_size_is24() {
        XCTAssertEqual(AvatarContext.typingIndicator.size, 24)
    }

    func test_postReaction_size_is20() {
        XCTAssertEqual(AvatarContext.postReaction.size, 20)
    }

    func test_custom_size_isPassedValue() {
        XCTAssertEqual(AvatarContext.custom(100).size, 100)
    }

    // MARK: - Story Ring

    func test_storyTray_showsStoryRing() {
        XCTAssertTrue(AvatarContext.storyTray.showsStoryRing)
    }

    func test_storyViewer_hidesStoryRing() {
        XCTAssertFalse(AvatarContext.storyViewer.showsStoryRing)
    }

    func test_postComment_hidesStoryRing() {
        XCTAssertFalse(AvatarContext.postComment.showsStoryRing)
    }

    func test_typingIndicator_hidesStoryRing() {
        XCTAssertFalse(AvatarContext.typingIndicator.showsStoryRing)
    }

    func test_profileEdit_hidesStoryRing() {
        XCTAssertFalse(AvatarContext.profileEdit.showsStoryRing)
    }

    func test_recentParticipant_showsStoryRing() {
        XCTAssertTrue(AvatarContext.recentParticipant.showsStoryRing)
    }

    // MARK: - Mood Badge

    func test_messageBubble_showsMoodBadge() {
        XCTAssertTrue(AvatarContext.messageBubble.showsMoodBadge)
    }

    func test_postComment_hidesMoodBadge() {
        XCTAssertFalse(AvatarContext.postComment.showsMoodBadge)
    }

    func test_userListItem_hidesMoodBadge() {
        XCTAssertFalse(AvatarContext.userListItem.showsMoodBadge)
    }

    func test_notification_hidesMoodBadge() {
        XCTAssertFalse(AvatarContext.notification.showsMoodBadge)
    }

    func test_profileBanner_showsMoodBadge() {
        XCTAssertTrue(AvatarContext.profileBanner.showsMoodBadge)
    }

    // MARK: - Online Dot

    func test_conversationList_showsOnlineDot() {
        XCTAssertTrue(AvatarContext.conversationList.showsOnlineDot)
    }

    func test_notification_hidesOnlineDot() {
        XCTAssertFalse(AvatarContext.notification.showsOnlineDot)
    }

    func test_storyViewer_hidesOnlineDot() {
        XCTAssertFalse(AvatarContext.storyViewer.showsOnlineDot)
    }

    // MARK: - Tappable

    func test_postReaction_isNotTappable() {
        XCTAssertFalse(AvatarContext.postReaction.isTappable)
    }

    func test_typingIndicator_isNotTappable() {
        XCTAssertFalse(AvatarContext.typingIndicator.isTappable)
    }

    func test_conversationList_isTappable() {
        XCTAssertTrue(AvatarContext.conversationList.isTappable)
    }

    // MARK: - Default Pulse

    func test_messageBubble_defaultPulseTrue() {
        XCTAssertTrue(AvatarContext.messageBubble.defaultPulse)
    }

    func test_conversationList_defaultPulseFalse() {
        XCTAssertFalse(AvatarContext.conversationList.defaultPulse)
    }

    func test_profileBanner_defaultPulseTrue() {
        XCTAssertTrue(AvatarContext.profileBanner.defaultPulse)
    }

    // MARK: - Shadow

    func test_postReaction_shadowRadiusZero() {
        XCTAssertEqual(AvatarContext.postReaction.shadowRadius, 0)
    }

    func test_profileBanner_shadowRadius12() {
        XCTAssertEqual(AvatarContext.profileBanner.shadowRadius, 12)
    }

    func test_messageBubble_shadowRadius4() {
        XCTAssertEqual(AvatarContext.messageBubble.shadowRadius, 4)
    }

    // MARK: - Derived Metrics

    func test_ringSize_isSizePlus6() {
        XCTAssertEqual(AvatarContext.conversationList.ringSize, 58)
    }

    func test_initialFont_is38PercentOfSize() {
        XCTAssertEqual(AvatarContext.conversationList.initialFont, 52 * 0.38, accuracy: 0.01)
    }

    func test_storyTray_ringWidth_is07() {
        XCTAssertEqual(AvatarContext.storyTray.ringWidth, 0.7)
    }

    func test_messageBubble_ringWidth_is15() {
        XCTAssertEqual(AvatarContext.messageBubble.ringWidth, 1.5)
    }
}
```

**Step 2: Run tests to verify they fail**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/AvatarContextTests -quiet 2>&1 | tail -5
```
Expected: FAIL — `AvatarContext` not defined

**Step 3: Implement AvatarContext enum**

In `MeeshyAvatar.swift`, add the new enum ABOVE the existing `AvatarMode`:

```swift
// MARK: - Avatar Context

public enum AvatarContext {
    // Stories
    case storyTray
    case storyViewer

    // Feed
    case feedComposer
    case postAuthor
    case postComment
    case postReaction

    // Messages
    case messageBubble
    case typingIndicator

    // Conversation
    case conversationList
    case conversationHeaderCollapsed
    case conversationHeaderExpanded
    case conversationHeaderStacked
    case recentParticipant

    // Profile
    case profileBanner
    case profileEdit
    case profileSheet

    // Listings
    case userListItem

    // Notifications
    case notification

    // Custom
    case custom(CGFloat)

    public var size: CGFloat {
        switch self {
        case .storyTray, .storyViewer, .conversationHeaderCollapsed,
             .conversationHeaderExpanded, .postAuthor, .userListItem, .notification:
            return 44
        case .conversationList: return 52
        case .messageBubble: return 32
        case .feedComposer: return 36
        case .postComment, .conversationHeaderStacked: return 28
        case .typingIndicator: return 24
        case .postReaction, .recentParticipant: return 20
        case .profileBanner: return 90
        case .profileEdit, .profileSheet: return 80
        case .custom(let v): return v
        }
    }

    public var showsStoryRing: Bool {
        switch self {
        case .storyViewer, .postComment, .postReaction, .typingIndicator, .profileEdit:
            return false
        default: return true
        }
    }

    public var showsMoodBadge: Bool {
        switch self {
        case .storyViewer, .postComment, .postReaction, .typingIndicator,
             .profileEdit, .userListItem, .notification:
            return false
        default: return true
        }
    }

    public var showsOnlineDot: Bool {
        switch self {
        case .storyViewer, .postComment, .postReaction, .typingIndicator,
             .profileEdit, .notification:
            return false
        default: return true
        }
    }

    public var isTappable: Bool {
        switch self {
        case .postReaction, .typingIndicator:
            return false
        default: return true
        }
    }

    public var defaultPulse: Bool {
        switch self {
        case .messageBubble, .conversationHeaderCollapsed, .conversationHeaderExpanded,
             .profileBanner, .profileSheet, .custom:
            return true
        default: return false
        }
    }

    public var shadowRadius: CGFloat {
        switch self {
        case .postReaction, .typingIndicator, .recentParticipant: return 0
        case .postComment: return 2
        case .messageBubble, .storyViewer, .feedComposer, .userListItem, .notification,
             .conversationHeaderStacked: return 4
        case .profileBanner: return 12
        default: return 8
        }
    }

    public var shadowY: CGFloat {
        switch self {
        case .postReaction, .typingIndicator, .recentParticipant: return 0
        case .postComment: return 1
        case .messageBubble, .conversationHeaderStacked: return 2
        default: return 4
        }
    }

    public var ringSize: CGFloat { size + 6 }
    public var initialFont: CGFloat { size * 0.38 }
    public var ringWidth: CGFloat {
        switch self {
        case .storyTray: return 0.7
        default: return size <= 32 ? 1.5 : 2.5
        }
    }
    public var badgeSize: CGFloat { size * 0.42 }
    public var onlineDotSize: CGFloat { size * 0.26 }
}
```

Then deprecate `AvatarMode`:

```swift
@available(*, deprecated, message: "Use AvatarContext instead")
public enum AvatarMode {
    // ... existing code unchanged
}
```

**Step 4: Run tests to verify they pass**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/AvatarContextTests -quiet 2>&1 | tail -5
```
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyAvatar.swift \
       packages/MeeshySDK/Tests/MeeshyUITests/AvatarContextTests.swift
git commit -m "feat(sdk): add AvatarContext enum, deprecate AvatarMode"
```

---

### Task 2: Add context-based init to MeeshyAvatar and fix handleTap

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyAvatar.swift:131-252`

**Step 1: Add new init accepting AvatarContext**

Add a new init to `MeeshyAvatar` (keep existing inits for backward compat):

```swift
// Context-based init (preferred)
public init(name: String, context: AvatarContext, kind: AvatarKind = .user,
            accentColor: String = "", secondaryColor: String? = nil,
            avatarURL: String? = nil, storyState: StoryRingState = .none,
            moodEmoji: String? = nil, presenceState: PresenceState = .offline,
            isDark: Bool = ThemeManager.shared.mode.isDark,
            onTap: (() -> Void)? = nil, onViewProfile: (() -> Void)? = nil,
            onViewStory: (() -> Void)? = nil, onMoodTap: ((CGPoint) -> Void)? = nil,
            onOnlineTap: (() -> Void)? = nil, contextMenuItems: [AvatarContextMenuItem]? = nil) {
    self.name = name; self.mode = context; self.kind = kind; self.accentColor = accentColor
    self.secondaryColor = secondaryColor; self.avatarURL = avatarURL
    self.storyState = storyState; self.moodEmoji = moodEmoji; self.presenceState = presenceState
    self.enablePulse = context.defaultPulse; self.isDark = isDark
    self.onTap = onTap; self.onViewProfile = onViewProfile; self.onViewStory = onViewStory
    self.onMoodTap = onMoodTap; self.onOnlineTap = onOnlineTap; self.contextMenuItems = contextMenuItems
}
```

**Important**: The `mode` property type must change from `AvatarMode` to a protocol or we need a different approach. Since both `AvatarMode` and `AvatarContext` share the same computed properties, the cleanest approach is:

Change the stored property to use a protocol-free approach — store the context directly and derive mode properties from it:

Replace `public let mode: AvatarMode` with a dual-storage approach:

```swift
// Internal storage — either AvatarContext (new) or AvatarMode (legacy)
private let _size: CGFloat
private let _showsStoryRing: Bool
private let _showsMoodBadge: Bool
private let _showsOnlineDot: Bool
private let _isTappable: Bool
private let _shadowRadius: CGFloat
private let _shadowY: CGFloat
private let _ringWidth: CGFloat

// Expose derived metrics
public var size: CGFloat { _size }
// ... etc
```

**Actually, simpler approach**: Since `AvatarContext` has the exact same computed properties as `AvatarMode`, just change the stored property type to `AvatarContext` and update the legacy inits to map:

```swift
public struct MeeshyAvatar: View {
    public let name: String
    public let context: AvatarContext  // was: mode: AvatarMode
    // ... rest unchanged
```

Update the `AvatarMode`-based init to map to `AvatarContext`:

```swift
// Legacy init (AvatarSize) — maps to AvatarContext
public init(name: String, size: AvatarSize, ...) {
    self.name = name
    switch size {
    case .small: self.context = .messageBubble
    case .medium: self.context = .conversationHeaderCollapsed
    case .large: self.context = .conversationList
    case .xlarge: self.context = .storyTray
    case .custom(let v): self.context = .custom(v)
    }
    // ...
}

// Legacy init (AvatarMode) — maps to AvatarContext
public init(name: String, mode: AvatarMode, ...) {
    self.name = name
    switch mode {
    case .conversationList: self.context = .conversationList
    case .storyTray: self.context = .storyTray
    case .conversationHeader: self.context = .conversationHeaderCollapsed
    case .messageBubble: self.context = .messageBubble
    case .callNotification(let v): self.context = .custom(v)
    case .custom(let v): self.context = .custom(v)
    }
    // ...
}
```

Then replace ALL internal references from `mode.` to `context.` in the body (size, showsStoryRing, shadowRadius, etc.).

**Step 2: Fix handleTap priority**

Change from:
```swift
private func handleTap() {
    HapticFeedback.light()
    if let onTap { onTap(); return }
    if storyState == .unread, let onViewStory { onViewStory(); return }
    if let onViewProfile { onViewProfile(); return }
}
```

To:
```swift
private func handleTap() {
    HapticFeedback.light()
    if storyState == .unread, let onViewStory { onViewStory(); return }
    if let onTap { onTap(); return }
    if let onViewProfile { onViewProfile(); return }
}
```

**Step 3: Build to verify no regressions**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -3
```
Expected: Build succeeded

**Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyAvatar.swift
git commit -m "feat(sdk): add AvatarContext init to MeeshyAvatar, fix handleTap story priority"
```

---

### Task 3: Update AvatarConfig to use AvatarContext

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Primitives/UserIdentityBar.swift:57-83`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/IdentityBarElementTests.swift`

**Step 1: Update AvatarConfig**

```swift
public struct AvatarConfig {
    public let url: String?
    public let accentColor: String
    public let context: AvatarContext  // was: mode: AvatarMode
    public let moodEmoji: String?
    public let presenceState: PresenceState
    public let onTap: (() -> Void)?
    public let contextMenuItems: [AvatarContextMenuItem]?

    public init(
        url: String? = nil,
        accentColor: String,
        context: AvatarContext = .messageBubble,  // was: mode: AvatarMode
        moodEmoji: String? = nil,
        presenceState: PresenceState = .offline,
        onTap: (() -> Void)? = nil,
        contextMenuItems: [AvatarContextMenuItem]? = nil
    ) {
        self.url = url
        self.accentColor = accentColor
        self.context = context
        self.moodEmoji = moodEmoji
        self.presenceState = presenceState
        self.onTap = onTap
        self.contextMenuItems = contextMenuItems
    }
}
```

**Step 2: Update MeeshyAvatar call in UserIdentityBar body**

Change line ~122 from `mode: avatar.mode` to `context: avatar.context`.

**Step 3: Update tests**

Update `IdentityBarElementTests.swift` — `AvatarConfig` references now use `context:` instead of `mode:`.

**Step 4: Update all `.messageBubble()` factory preset**

In the `UserIdentityBar` factory presets, update `AvatarConfig` creation to use `context:` parameter name.

**Step 5: Build and run tests**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests -quiet 2>&1 | tail -5
```

**Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Primitives/UserIdentityBar.swift \
       packages/MeeshySDK/Tests/MeeshyUITests/IdentityBarElementTests.swift
git commit -m "refactor(sdk): update AvatarConfig to use AvatarContext"
```

---

### Task 4: Migrate existing MeeshyAvatar usages from mode: to context:

**Files:** All files in `apps/ios/` and `packages/MeeshySDK/Sources/MeeshyUI/` that reference `MeeshyAvatar(... mode:`.

Use find-and-replace across the codebase. Key mappings:

| Old | New |
|-----|-----|
| `mode: .conversationList` | `context: .conversationList` |
| `mode: .storyTray` | `context: .storyTray` |
| `mode: .conversationHeader` | `context: .conversationHeaderCollapsed` (default) |
| `mode: .messageBubble` | `context: .messageBubble` |
| `mode: .custom(X)` | `context: .custom(X)` |

**Context-specific mappings** (not global replace — must check each file):

- `StoryTrayView.swift` storyRing: `mode: .storyTray` → `context: .storyTray`
- `ConversationView+Header.swift` collapsed: `mode: .conversationHeader` → `context: .conversationHeaderCollapsed`
- `ConversationView+Header.swift` expanded DM: `mode: .custom(44)` → `context: .conversationHeaderExpanded`
- `ConversationView+Header.swift` expanded group stacked: `mode: .custom(28)` → `context: .conversationHeaderStacked`
- `ProfileView.swift` banner: `mode: .custom(90)` → `context: .profileBanner`
- `UserProfileSheet.swift` main: `mode: .custom(80)` → `context: .profileSheet`
- `CommunityInviteView.swift`: `mode: .conversationHeader` → `context: .userListItem`
- `CommunityMembersView.swift`: `mode: .conversationHeader` → `context: .userListItem`
- `CommunitySettingsView.swift`: `mode: .custom(40)` → `context: .custom(40)` (kind: .entity)
- `ThreadView.swift`: `mode: .custom(32)` → `context: .messageBubble`

Also remove explicit `enablePulse:` parameters since `context.defaultPulse` handles it now.

**Step 1: Migrate all SDK usages**

Update files in `packages/MeeshySDK/Sources/MeeshyUI/`:
- `Profile/UserProfileSheet.swift`
- `Community/CommunityInviteView.swift`
- `Community/CommunityMembersView.swift`
- `Community/CommunitySettingsView.swift`

**Step 2: Migrate all app usages**

Update files in `apps/ios/Meeshy/Features/Main/Views/`:
- `StoryTrayView.swift`
- `ConversationView+Header.swift`
- `ThemedConversationRow.swift`
- `ThemedMessageBubble.swift`
- `ProfileView.swift`
- `ThreadView.swift`
- `ConversationHelperViews.swift`
- `GlobalSearchView.swift`
- `SharePickerView.swift`
- `ForwardPickerSheet.swift`
- `MessageDetailSheet.swift`
- `MessageInfoSheet.swift`
- `AddParticipantSheet.swift`
- `ParticipantsView.swift`
- `ConversationInfoSheet.swift`
- `EditProfileView.swift`
- `AudioFullscreenView.swift`
- `NewConversationView.swift`
- `FeedView+Attachments.swift`
- `BlockedUsersView.swift`
- `FriendRequestListView.swift`
- `MessageOverlayMenu.swift`
- `WidgetPreviewView.swift`

**Step 3: Build**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -3
```
Expected: Build succeeded

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor(ios): migrate all MeeshyAvatar usages from mode to context"
```

---

### Task 5: Migrate custom Circle+initials avatars to MeeshyAvatar

**Files to modify:**

#### 5a. `apps/ios/Meeshy/Features/Main/Views/RootViewComponents.swift:492-506`

Replace Circle+initials with:
```swift
MeeshyAvatar(
    name: item.author,
    context: .postAuthor,
    accentColor: item.color,
    avatarURL: item.authorAvatarURL  // add if available on model, else nil
)
```

Note: If the `FeedItem` model (or equivalent) has no `authorAvatarURL`, `avatarURL` stays nil and MeeshyAvatar falls back to gradient+initials (same visual, but now unified).

#### 5b. `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift:184-191`

Replace repost author Circle with:
```swift
MeeshyAvatar(
    name: repost.author,
    context: .postComment,
    accentColor: repost.authorColor,
    avatarURL: repost.authorAvatarURL  // if available
)
```

#### 5c. `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift:374-387`

Replace stacked comment avatars with:
```swift
ForEach(Array(post.comments.dropFirst(3).prefix(3).enumerated()), id: \.element.id) { index, comment in
    MeeshyAvatar(
        name: comment.author,
        context: .postReaction,
        accentColor: comment.authorColor
    )
    .overlay(Circle().stroke(theme.backgroundPrimary, lineWidth: 1.5))
    .zIndex(Double(3 - index))
}
```

#### 5d. `apps/ios/Meeshy/Features/Main/Views/ConversationListHelpers.swift:125-139`

Replace custom Circle+gradient+initial with:
```swift
MeeshyAvatar(
    name: conversation.name,
    context: .conversationList,
    accentColor: accentColor,
    secondaryColor: secondaryColor
)
```

**Step 1: Apply all changes above**

**Step 2: Build**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -3
```

**Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/RootViewComponents.swift \
       apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift \
       apps/ios/Meeshy/Features/Main/Views/ConversationListHelpers.swift
git commit -m "refactor(ios): migrate custom Circle+initials avatars to MeeshyAvatar"
```

---

### Task 6: Migrate SDK custom avatars to MeeshyAvatar

**Files to modify:**

#### 6a. `packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationRowView.swift:62-84`

Replace the entire `iconView` with:
```swift
private var iconView: some View {
    ZStack(alignment: .topTrailing) {
        MeeshyAvatar(
            name: notification.senderName ?? "?",
            context: .notification,
            accentColor: accentColor.toHex(),
            avatarURL: notification.senderAvatar
        )

        // Notification type badge overlay (bottom-right)
        Circle()
            .fill(accentColor)
            .frame(width: 18, height: 18)
            .overlay(
                Image(systemName: notifType.systemIcon)
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(.white)
            )
            .overlay(Circle().stroke(theme.backgroundPrimary, lineWidth: 1.5))
            .offset(x: 4, y: 26)
    }
    .frame(width: 48, height: 48)
}
```

Note: If `accentColor` is already a `Color` and not a hex String, use the hex conversion or pass the DynamicColorGenerator fallback.

#### 6b. `packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityCreateView.swift:381-388`

Replace Circle+initial with:
```swift
MeeshyAvatar(
    name: user.displayName ?? user.username,
    context: .userListItem,
    accentColor: DynamicColorGenerator.colorForName(user.username),
    avatarURL: user.avatar,
    presenceState: user.isOnline == true ? .online : .offline
)
```

Note: Size changes from 36 → 44 (userListItem standard). If 36 is required for layout, use `context: .custom(36)`.

#### 6c. `packages/MeeshySDK/Sources/MeeshyUI/Profile/FullscreenImageView.swift:100-111`

Replace the 200pt Circle+initials fallback with:
```swift
MeeshyAvatar(
    name: fallbackText,
    context: .custom(200),
    accentColor: accentColor
)
```

#### 6d. `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift:889-896`

Replace `CachedAsyncImage` with:
```swift
MeeshyAvatar(
    name: viewer.username,
    context: .storyViewer,
    accentColor: DynamicColorGenerator.colorForName(viewer.username),
    avatarURL: viewer.avatarUrl
)
```

**Step 1: Apply all changes above**

Check each file for the exact variable names available on the model (notification.senderName, viewer.username, etc.).

**Step 2: Build**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -3
```

**Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationRowView.swift \
       packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityCreateView.swift \
       packages/MeeshySDK/Sources/MeeshyUI/Profile/FullscreenImageView.swift \
       apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift
git commit -m "refactor(sdk,ios): migrate CachedAsyncImage and custom avatars to MeeshyAvatar"
```

---

### Task 7: Cleanup — remove AvatarMode and AvatarSize if fully replaced

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyAvatar.swift`

**Step 1: Check if AvatarMode or AvatarSize is still referenced**

```bash
# Search for remaining usages
grep -r "AvatarMode\|AvatarSize" packages/MeeshySDK/Sources/ apps/ios/Meeshy/ --include="*.swift" -l
```

If the only references are the deprecated enum definitions and the legacy inits in MeeshyAvatar itself, proceed to remove them.

If some files still reference `AvatarMode` (e.g. via `mode:` parameter), they need migrating first (go back to Task 4).

**Step 2: Remove legacy enums and inits (only if zero external usages)**

Delete `AvatarMode`, `AvatarSize`, and both legacy inits from `MeeshyAvatar`.

**Step 3: Build full app + tests**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -3
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet 2>&1 | tail -5
```

**Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyAvatar.swift
git commit -m "refactor(sdk): remove deprecated AvatarMode and AvatarSize enums"
```

---

### Task 8: Final verification

**Step 1: Full build**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -3
```

**Step 2: Full SDK test suite**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet 2>&1 | tail -10
```

**Step 3: Visual verification**

Launch app and check:
- Conversation list: avatars show story rings, mood badges, presence dots
- Open a conversation: header avatar tap with unread story opens story
- Feed: post author avatars show story rings
- Story tray: tap opens story
- Profile sheet: avatar shows story ring + mood

```bash
./apps/ios/meeshy.sh run
```

**Step 4: Commit any final fixes**

---

## Notes

### Community avatars — NOT migrated
`CommunityDetailView.swift:291-350` uses `RoundedRectangle(cornerRadius: 18)` with emoji fallback. This is fundamentally different from MeeshyAvatar (which is always circular). Keep custom. Same for `ConvBgFixedAvatar` (decorative background effect).

### App extensions — NOT migrated
`ShareViewController`, `LiveActivities`, `AppIntents` use direct `AsyncImage` because they run in separate processes without MeeshyUI SDK access. Keep as-is.

### AvatarConfig in UserIdentityBar
`AvatarConfig` should also gain `storyState` and `onViewStory` properties to support story override in identity bar contexts. This is a follow-up if needed.
