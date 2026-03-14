# Avatar Unification Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan from this design.

**Goal:** Replace `AvatarMode` with `AvatarContext` enum that encodes full behavior per usage context, unify all avatar rendering through `MeeshyAvatar`, and fix tap priority to always show unread stories first.

**Architecture:** Single enum `AvatarContext` replaces `AvatarMode` in `MeeshyAvatar`. Each case defines size, indicators, shadow, pulse defaults. `handleTap()` is reordered: unread story > contextual action > profile. All custom avatar renderings (Circle+initials, CachedAsyncImage, etc.) are migrated to `MeeshyAvatar`.

**Tech Stack:** SwiftUI, MeeshySDK (MeeshyUI target)

---

## 1. AvatarContext Enum

Replaces `AvatarMode` in `packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyAvatar.swift`.

```swift
public enum AvatarContext {
    // Stories
    case storyTray              // 44pt
    case storyViewer            // 44pt

    // Feed
    case feedComposer           // 36pt
    case postAuthor             // 44pt
    case postComment            // 28pt
    case postReaction           // 20pt

    // Messages
    case messageBubble          // 32pt
    case typingIndicator        // 24pt

    // Conversation
    case conversationList       // 52pt
    case conversationHeaderCollapsed  // 44pt
    case conversationHeaderExpanded   // 44pt
    case conversationHeaderStacked    // 28pt
    case recentParticipant      // 20pt

    // Profile
    case profileBanner          // 90pt
    case profileEdit            // 80pt
    case profileSheet           // 80pt

    // Listings
    case userListItem           // 44pt

    // Notifications
    case notification           // 44pt

    // Custom
    case custom(CGFloat)        // user-defined size, all features enabled
}
```

## 2. Behavior Matrix

| Context | Size | StoryRing | Mood | Presence | Tap | Pulse | Shadow |
|---------|------|-----------|------|----------|-----|-------|--------|
| `storyTray` | 44 | yes | yes | yes | story | no | 8 |
| `storyViewer` | 44 | no | no | no | profile | no | 4 |
| `feedComposer` | 36 | yes | yes | yes | story/profile | no | 4 |
| `postAuthor` | 44 | yes | yes | yes | story/profile | no | 8 |
| `postComment` | 28 | no | no | no | profile | no | 2 |
| `postReaction` | 20 | no | no | no | none | no | 0 |
| `messageBubble` | 32 | yes | yes | yes | story/profile | yes | 4 |
| `typingIndicator` | 24 | no | no | no | none | no | 0 |
| `conversationList` | 52 | yes | yes | yes | story/profile | no | 8 |
| `conversationHeaderCollapsed` | 44 | yes | yes | yes | story/expand | yes | 8 |
| `conversationHeaderExpanded` | 44 | yes | yes | yes | collapse | yes | 8 |
| `conversationHeaderStacked` | 28 | yes | yes | yes | collapse | no | 4 |
| `recentParticipant` | 20 | yes | yes | yes | story/profile | no | 0 |
| `profileBanner` | 90 | yes | yes | yes | story | yes | 12 |
| `profileEdit` | 80 | no | no | no | edit photo | no | 8 |
| `profileSheet` | 80 | yes | yes | yes | story | yes | 8 |
| `userListItem` | 44 | yes | no | yes | story/profile | no | 4 |
| `notification` | 44 | yes | no | no | story/profile | no | 4 |
| `custom(X)` | X | yes | yes | yes | all | yes | 8 |

## 3. Computed Properties

Each case exposes behavior via computed properties (no manual configuration):

```swift
extension AvatarContext {
    var size: CGFloat
    var showsStoryRing: Bool
    var showsMoodBadge: Bool
    var showsOnlineDot: Bool
    var isTappable: Bool
    var defaultPulse: Bool
    var shadowRadius: CGFloat
    var shadowY: CGFloat
    var ringWidth: CGFloat
    var initialFont: CGFloat     // size * 0.38
    var badgeSize: CGFloat       // size * 0.42
    var onlineDotSize: CGFloat   // size * 0.26
}
```

## 4. handleTap Priority (Universal)

```swift
private func handleTap() {
    HapticFeedback.light()
    // Unread story ALWAYS takes priority
    if storyState == .unread, let onViewStory { onViewStory(); return }
    // Contextual action
    if let onTap { onTap(); return }
    // Fallback to profile
    if let onViewProfile { onViewProfile(); return }
}
```

No per-context exceptions. If story is already viewed (.read/.none), onTap naturally takes over.

## 5. Migration Plan

### Phase 1: AvatarContext enum + handleTap fix
- Add `AvatarContext` enum with all computed properties
- Add new `MeeshyAvatar` init accepting `AvatarContext` (rename param from `mode` to `context`)
- Fix `handleTap()` priority (swap lines 249-250)
- Deprecate `AvatarMode` with mapping to `AvatarContext`

### Phase 2: Migrate existing MeeshyAvatar usages
- Replace `mode:` with `context:` across all 52 usages
- Add missing `onViewStory` callbacks where StoryViewModel is in scope
- Remove explicit `enablePulse:` (now derived from `context.defaultPulse`)

### Phase 3: Migrate custom avatar renderings
- `RootViewComponents.swift:502` (Circle+initial) -> MeeshyAvatar(.postAuthor)
- `FeedPostCard.swift:188` (Circle+initial) -> MeeshyAvatar(.postComment) or (.postReaction)
- `FeedPostCard.swift:378` (Circle+initial) -> MeeshyAvatar(.postReaction)
- `ConversationListHelpers.swift:136` (Circle+initial) -> MeeshyAvatar(.conversationList)
- `StoryViewerView+Content.swift:889` (CachedAsyncImage) -> MeeshyAvatar(.storyViewer)
- `NotificationRowView.swift:63` (CachedAsyncImage) -> MeeshyAvatar(.notification)
- `CommunityDetailView.swift:291` (communityAvatar) -> MeeshyAvatar(.custom(72), kind: .entity)
- `CommunityCreateView.swift:381` (Circle+initial) -> MeeshyAvatar(.userListItem)
- `FullscreenImageView.swift:107` (Circle+initial) -> MeeshyAvatar(.profileBanner)

### Phase 4: Cleanup
- Remove dead `AvatarMode` enum after all migrations
- Remove `CachedAvatarImage` struct if no longer used outside MeeshyAvatar
- Remove legacy `AvatarSize` enum
- Update tests

## 6. Files Modified

### SDK (packages/MeeshySDK/Sources/MeeshyUI/)
- `Primitives/MeeshyAvatar.swift` — AvatarContext enum, handleTap fix, new init
- `Primitives/UserIdentityBar.swift` — update AvatarConfig to use AvatarContext
- `Profile/UserProfileSheet.swift` — migrate to AvatarContext
- `Community/CommunityDetailView.swift` — migrate custom avatar
- `Community/CommunityCreateView.swift` — migrate custom avatar
- `Community/CommunityMembersView.swift` — migrate to AvatarContext
- `Community/CommunityInviteView.swift` — migrate to AvatarContext
- `Community/CommunitySettingsView.swift` — migrate to AvatarContext
- `Notifications/NotificationRowView.swift` — migrate CachedAsyncImage
- `Profile/FullscreenImageView.swift` — migrate custom avatar

### App (apps/ios/Meeshy/)
- `Features/Main/Views/StoryTrayView.swift` — migrate to .storyTray
- `Features/Main/Views/ConversationView+Header.swift` — migrate to header contexts
- `Features/Main/Views/ThemedConversationRow.swift` — migrate to .conversationList
- `Features/Main/Views/ThemedMessageBubble.swift` — migrate to .messageBubble
- `Features/Main/Views/ConversationListHelpers.swift` — migrate custom avatar
- `Features/Main/Views/RootViewComponents.swift` — migrate custom avatar
- `Features/Main/Views/FeedPostCard.swift` — migrate custom avatars
- `Features/Main/Views/StoryViewerView+Content.swift` — migrate CachedAsyncImage
- `Features/Main/Views/ProfileView.swift` — migrate to .profileBanner
- `Features/Main/Views/ThreadView.swift` — migrate to .messageBubble
- `Features/Main/Views/EditProfileView.swift` — migrate to .profileEdit
- Plus: GlobalSearchView, SharePickerView, ForwardPickerSheet, MessageDetailSheet, etc.

## 7. Non-Goals

- App extensions (ShareExtension, LiveActivities, AppIntents) stay with direct AsyncImage — they run in separate processes without SDK access
- `ConvBgFixedAvatar` (decorative background orbiting avatar) stays custom — it's a visual effect, not a user avatar
- No new parameters added to MeeshyAvatar — the API stays the same, only `mode` is replaced by `context`
