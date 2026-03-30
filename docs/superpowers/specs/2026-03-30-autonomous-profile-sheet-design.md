# Autonomous UserProfileSheet Design

**Date:** 2026-03-30
**Status:** Approved
**Scope:** `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift` + all callers

## Problem

`UserProfileSheet` requires 10+ action callbacks (`onBlock`, `onUnblock`, `onConnectionRequest`, `onCancelRequest`, `onResendRequest`, `onAcceptRequest`, `onDeclineRequest`) and state props (`isBlocked`, `isBlockedByTarget`, `connectionStatus`, `currentUserId`) from every parent view.

**Result:** Only `RootView` wires all callbacks. Feed views (`FeedPostCard`, `PostDetailView`, `FeedCommentsSheet`) pass nothing — profile sheets appear without action buttons and without blocking protection.

## Solution

Make `UserProfileSheet` **self-contained**. It consumes SDK singletons internally (all cached, stale-while-revalidate) and manages its own state. Parents pass only the user data and optional navigation callbacks.

## Public API (After)

```swift
public struct UserProfileSheet: View {
    // REQUIRED — identity
    public let user: ProfileSheetUser

    // OPTIONAL — navigation (context-dependent, parent controls)
    public var onDismiss: (() -> Void)?
    public var onNavigateToConversation: ((MeeshyConversation) -> Void)?
    public var onSendMessage: (() -> Void)?

    // OPTIONAL — mood (parent provides from StatusViewModel)
    public var moodEmoji: String?
    public var onMoodTap: ((CGPoint) -> Void)?
}
```

All action callbacks (`onBlock`, `onUnblock`, `onConnectionRequest`, `onCancelRequest`, `onResendRequest`, `onAcceptRequest`, `onDeclineRequest`) and state props (`isBlocked`, `isBlockedByTarget`, `connectionStatus`, `currentUserId`, `isCurrentUser`, `isLoading`, `fullUser`, `userStats`, `isLoadingStats`, `onLoadStats`) are **removed from public init** and managed internally.

## Internal State Resolution

All resolved on `.task` / `.onAppear` from cached SDK singletons:

| State | Source | Cache Strategy |
|-------|--------|----------------|
| `currentUserId` | `AuthManager.shared.currentUser?.id` | Session-long |
| `isCurrentUser` | `user.userId == currentUserId` | Derived |
| `isBlocked` | `BlockService.shared.isBlocked(userId)` | In-memory Set, refreshed on app foreground |
| `isBlockedByTarget` | Profile fetch returns 403 | Per-fetch, cached via CacheCoordinator |
| `connectionStatus` | `FriendshipCache.shared.status(for: userId)` | In-memory, hydrated at login |
| `fullUser` | `CacheCoordinator.shared.profiles.load(for:)` | Stale-while-revalidate |
| `userStats` | `UserService.shared.getUserStats(userId:)` | Fetched on stats tab select |

## Blocking Behavior

| Situation | Behavior |
|-----------|----------|
| Current user blocked target | Show minimal profile + "Debloquer" button only. No other actions, no conversations tab |
| Target blocked current user (403) | **Do not show sheet at all.** Dismiss immediately, no toast/error |
| No blocking | Full profile + all action buttons based on `connectionStatus` |
| Viewing own profile | Full profile, no action buttons |

### Pre-open block check

Before presenting the sheet, callers should ideally check `BlockService.shared.isBlocked(userId)` — but as a safety net, the sheet itself also checks and adapts on `.task`. For `isBlockedByTarget`, the sheet detects this when profile fetch returns 403 and auto-dismisses.

## Action Handlers (Internal)

All actions use optimistic updates with rollback:

### Connection Actions
- **Send request:** `FriendService.shared.sendFriendRequest(receiverId:)` + `FriendshipCache.shared.didSendRequest(to:requestId:)`
- **Cancel request:** `FriendService.shared.deleteRequest(requestId:)` + reset cache
- **Resend request:** Delete then re-send
- **Accept request:** `FriendService.shared.respond(requestId:accepted: true)` + `FriendshipCache.shared.didAcceptRequest(from:)`
- **Decline request:** `FriendService.shared.respond(requestId:accepted: false)` + `FriendshipCache.shared.didRejectRequest(from:)`

### Block Actions
- **Block:** `BlockService.shared.blockUser(userId:)` → update local `isBlocked`, show "Debloquer" only
- **Unblock:** `BlockService.shared.unblockUser(userId:)` → update local `isBlocked`, restore full UI

All actions show `HapticFeedback.success/error()` + `ToastManager.shared` feedback.

## Caller Simplification

### FeedPostCard (before)
```swift
.sheet(item: $selectedProfileUser) { user in
    UserProfileSheet(user: user, moodEmoji: mood?.emoji, onMoodTap: mood?.tapHandler)
}
```

### FeedPostCard (after) — identical, but now gets full functionality
```swift
.sheet(item: $selectedProfileUser) { user in
    UserProfileSheet(user: user, moodEmoji: mood?.emoji, onMoodTap: mood?.tapHandler)
}
```

No change needed in Feed callers. The component now does everything.

### RootView (before — ~150 lines of callback wiring)
```swift
UserProfileSheet(
    user: user, isBlocked: isBlocked, isLoading: isLoading,
    fullUser: fullUser, connectionStatus: connectionStatus,
    onBlock: { ... }, onUnblock: { ... },
    onConnectionRequest: { ... }, onCancelRequest: { ... },
    onResendRequest: { ... }, onAcceptRequest: { ... },
    onDeclineRequest: { ... }, onDismiss: { dismiss() },
    currentUserId: AuthManager.shared.currentUser?.id ?? "",
    moodEmoji: ..., onMoodTap: ...
)
```

### RootView (after)
```swift
UserProfileSheet(
    user: user,
    onDismiss: { dismiss() },
    onNavigateToConversation: { conv in router.navigate(to: conv) },
    moodEmoji: ..., onMoodTap: ...
)
```

## Files Changed

| File | Change |
|------|--------|
| `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift` | Internalize state + actions, simplify public init |
| `apps/ios/Meeshy/Features/Main/Views/RootView.swift` | Remove ~150 lines of callback wiring, simplify sheet call |
| `apps/ios/Meeshy/Features/Main/Views/RootViewComponents.swift` | Remove profile sheet helper functions if moved |
| `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift` | No change needed (already passes minimal params) |
| `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift` | No change needed |
| `apps/ios/Meeshy/Features/Main/Views/FeedCommentsSheet.swift` | No change needed |
| `apps/ios/Meeshy/Features/Main/Views/BookmarksView.swift` | Check and simplify if applicable |

## Non-Goals

- Changing `ProfileSheetUser` model
- Changing the visual design of the profile sheet
- Adding new UI elements beyond what already exists
- Modifying gateway API endpoints
