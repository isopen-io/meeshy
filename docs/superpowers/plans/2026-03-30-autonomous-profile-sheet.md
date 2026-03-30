# Autonomous UserProfileSheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `UserProfileSheet` self-contained — it resolves blocking, friendship, and actions internally from SDK singletons. Callers just pass `user:` and optional navigation callbacks.

**Architecture:** Move all action logic (block/unblock/friend request/accept/decline/cancel) from `ProfileFetchingSheet` in RootView into `UserProfileSheet` itself. The component uses `AuthManager.shared`, `BlockService.shared`, `FriendService.shared`, `FriendshipCache.shared` internally. Toast feedback uses `NotificationCenter` post (app-side `ToastManager` is not in SDK). `HapticFeedback` (already in MeeshyUI) provides tactile feedback.

**Tech Stack:** SwiftUI, MeeshySDK singletons, MeeshyUI

**Key constraint:** `ToastManager` lives in `apps/ios/`, not in the SDK. The component posts `Notification.Name("showToast")` with `userInfo` — the app's `ToastManager` observes it.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift` | Modify | Internalize state + actions, simplify public init |
| `apps/ios/Meeshy/Features/Main/Services/ToastManager.swift` | Modify | Add NotificationCenter observer for SDK toast events |
| `apps/ios/Meeshy/Features/Main/Views/RootView.swift` | Modify | Remove `ProfileFetchingSheet`, simplify sheet call |
| `apps/ios/Meeshy/Features/Main/Views/RootViewComponents.swift` | Modify | Simplify `ThemedFeedComposer` profile sheet call |
| `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift` | No change | Already minimal — now gets full functionality for free |
| `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift` | No change | Already minimal |
| `apps/ios/Meeshy/Features/Main/Views/FeedCommentsSheet.swift` | No change | Already minimal |
| `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift` | No change | Already minimal |
| `apps/ios/Meeshy/Features/Main/Views/AudioFullscreenView.swift` | No change | Already minimal |
| `apps/ios/Meeshy/Features/Main/Views/GlobalSearchView.swift` | No change | Already minimal |
| `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift` | No change | Already minimal |
| `apps/ios/Meeshy/Features/Main/Views/BookmarksView.swift` | Check | May need simplification if it passes callbacks |

---

### Task 1: Add toast notification bridge in ToastManager

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/ToastManager.swift`

The SDK can't call `ToastManager.shared` directly. We add a `NotificationCenter` observer so the SDK can post toast events.

- [ ] **Step 1: Add notification name and observer to ToastManager**

In `apps/ios/Meeshy/Features/Main/Services/ToastManager.swift`, add a static notification name and observer setup:

```swift
import Foundation
import MeeshyUI

@MainActor
final class ToastManager: ObservableObject {
    static let shared = ToastManager()

    /// Notification name for SDK components to request toasts
    static let showToastNotification = Notification.Name("meeshy.showToast")

    @Published var currentToast: Toast?

    private var dismissTask: Task<Void, Never>?

    private init() {
        observeSDKToasts()
    }

    /// Listen for toast requests from SDK components (UserProfileSheet, etc.)
    private nonisolated func observeSDKToasts() {
        NotificationCenter.default.addObserver(
            forName: Self.showToastNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let message = notification.userInfo?["message"] as? String,
                  let isSuccess = notification.userInfo?["isSuccess"] as? Bool else { return }
            Task { @MainActor in
                if isSuccess {
                    self?.showSuccess(message)
                } else {
                    self?.showError(message)
                }
            }
        }
    }

    // ... rest unchanged
}
```

- [ ] **Step 2: Verify build**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

- [ ] **Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/ToastManager.swift
git commit -m "feat(ios): add NotificationCenter toast bridge for SDK components"
```

---

### Task 2: Internalize UserProfileSheet — state resolution & actions

This is the core task. We rewrite `UserProfileSheet` to resolve all state internally and handle all actions.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift`

- [ ] **Step 1: Replace public properties and init**

Replace lines 13-101 (the struct declaration, public properties, and init) with:

```swift
public struct UserProfileSheet: View {
    // REQUIRED — identity
    public let user: ProfileSheetUser

    // OPTIONAL — navigation (context-dependent)
    public var onDismiss: (() -> Void)?
    public var onNavigateToConversation: ((MeeshyConversation) -> Void)?
    public var onSendMessage: (() -> Void)?

    // OPTIONAL — mood
    public var moodEmoji: String?
    public var onMoodTap: ((CGPoint) -> Void)?

    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss
    @State private var selectedTab: ProfileTab = .profile
    @State private var showFullscreenImage = false
    @State private var fullscreenImageURL: String? = nil
    @State private var fullscreenImageFallback: String = ""
    @State private var internalFullUser: MeeshyUser?
    @State private var internalUserStats: UserStats?
    @State private var internalConversations: [MeeshyConversation] = []
    @State private var internalIsLoading = false
    @State private var internalIsLoadingStats = false
    @State private var internalIsLoadingConversations = false

    // Internal action state (resolved from SDK singletons)
    @State private var isBlocked = false
    @State private var isBlockedByTarget = false
    @State private var connectionStatus: ConnectionStatus = .none
    @State private var pendingRequestId: String?

    private var currentUserId: String {
        AuthManager.shared.currentUser?.id ?? ""
    }

    private var isCurrentUser: Bool {
        guard let userId = user.userId else { return false }
        return userId == currentUserId
    }

    public init(
        user: ProfileSheetUser,
        onDismiss: (() -> Void)? = nil,
        onNavigateToConversation: ((MeeshyConversation) -> Void)? = nil,
        onSendMessage: (() -> Void)? = nil,
        moodEmoji: String? = nil,
        onMoodTap: ((CGPoint) -> Void)? = nil
    ) {
        self.user = user
        self.onDismiss = onDismiss
        self.onNavigateToConversation = onNavigateToConversation
        self.onSendMessage = onSendMessage
        self.moodEmoji = moodEmoji
        self.onMoodTap = onMoodTap
    }
```

- [ ] **Step 2: Update computed properties**

Remove the old `effectiveIsLoading`, `effectiveUserStats`, `effectiveIsLoadingStats`, `effectiveConversations` that referenced removed properties. Replace with:

```swift
    private var resolvedAccent: String {
        user.accentColor
    }

    private var displayUser: ProfileSheetUser {
        if let loaded = internalFullUser {
            return ProfileSheetUser.from(user: loaded, accentColor: user.accentColor)
        }
        return user
    }

    private var effectiveIsLoading: Bool {
        internalIsLoading
    }

    private var effectiveUserStats: UserStats? {
        internalUserStats
    }

    private var effectiveIsLoadingStats: Bool {
        internalIsLoadingStats
    }

    private var effectiveConversations: [MeeshyConversation] {
        internalConversations
    }
```

- [ ] **Step 3: Update body to auto-dismiss when blocked by target**

Update the `body` to check for `isBlockedByTarget` and dismiss:

```swift
    public var body: some View {
        ZStack {
            if isBlockedByTarget {
                // Blocked by target — dismiss silently
                Color.clear
                    .onAppear {
                        onDismiss?()
                        dismiss()
                    }
            } else {
                VStack(spacing: 0) {
                    bannerSection
                    identitySection
                        .padding(.top, -40)

                    if isBlocked {
                        blockedByMeCard
                            .padding(.horizontal, 20)
                            .padding(.top, 16)
                        Spacer()
                    } else {
                        tabSection
                    }
                }
                .background(theme.backgroundPrimary)
                .ignoresSafeArea(edges: .top)

                if showFullscreenImage {
                    FullscreenImageView(
                        imageURL: fullscreenImageURL,
                        fallbackText: fullscreenImageFallback,
                        accentColor: resolvedAccent
                    )
                    .transition(.opacity)
                    .zIndex(100)
                    .onTapGesture {
                        withAnimation(.easeOut(duration: 0.2)) {
                            showFullscreenImage = false
                        }
                    }
                }
            }
        }
        .task {
            await resolveInitialState()
        }
    }
```

- [ ] **Step 4: Add resolveInitialState and action methods**

Add these methods after the existing `loadConversationsIfNeeded()`:

```swift
    // MARK: - State Resolution

    private func resolveInitialState() async {
        guard let userId = user.userId, !userId.isEmpty, userId != currentUserId else { return }

        // Check block status (from in-memory cache)
        isBlocked = BlockService.shared.isBlocked(userId)

        // Resolve friendship status (from in-memory cache)
        resolveConnectionStatus()

        // Try loading profile — 403 = blocked by target
        await loadProfileAndDetectBlock(userId)
    }

    private func loadProfileAndDetectBlock(_ userId: String) async {
        let cacheResult = await CacheCoordinator.shared.profiles.load(for: userId)

        switch cacheResult {
        case .fresh(let cached, _):
            if let profile = cached.first { internalFullUser = profile }
            return
        case .stale(let cached, _):
            if let profile = cached.first { internalFullUser = profile }
        case .expired, .empty:
            internalIsLoading = internalFullUser == nil
        }

        do {
            let fetchedUser = try await UserService.shared.getProfile(idOrUsername: userId)
            internalFullUser = fetchedUser
            await CacheCoordinator.shared.profiles.save([fetchedUser], for: userId)
        } catch let error as APIError {
            if case .serverError(403, _) = error {
                isBlockedByTarget = true
            }
        } catch {}
        internalIsLoading = false
    }

    private func resolveConnectionStatus() {
        guard let userId = user.userId, !userId.isEmpty else { return }
        let status = FriendshipCache.shared.status(for: userId)
        switch status {
        case .friend:
            connectionStatus = .connected
        case .pendingSent(let requestId):
            pendingRequestId = requestId
            connectionStatus = .pendingSent(requestId: requestId)
        case .pendingReceived(let requestId):
            pendingRequestId = requestId
            connectionStatus = .pendingReceived(requestId: requestId)
        case .none:
            connectionStatus = .none
        }
    }

    // MARK: - Toast Helper

    private func postToast(_ message: String, isSuccess: Bool) {
        NotificationCenter.default.post(
            name: Notification.Name("meeshy.showToast"),
            object: nil,
            userInfo: ["message": message, "isSuccess": isSuccess]
        )
    }

    // MARK: - Connection Actions

    private func sendConnectionRequest() async {
        guard let userId = user.userId, !userId.isEmpty else { return }
        do {
            let request = try await FriendService.shared.sendFriendRequest(receiverId: userId)
            FriendshipCache.shared.didSendRequest(to: userId, requestId: request.id)
            pendingRequestId = request.id
            connectionStatus = .pendingSent(requestId: request.id)
            HapticFeedback.success()
            postToast("Demande envoyee", isSuccess: true)
        } catch {
            HapticFeedback.error()
            postToast("Impossible d'envoyer la demande", isSuccess: false)
        }
    }

    private func cancelRequest() async {
        guard let requestId = pendingRequestId, let userId = user.userId else { return }
        FriendshipCache.shared.didCancelRequest(to: userId)
        pendingRequestId = nil
        connectionStatus = .none
        HapticFeedback.medium()
        do {
            try await FriendService.shared.deleteRequest(requestId: requestId)
            postToast("Demande annulee", isSuccess: true)
        } catch {
            FriendshipCache.shared.didSendRequest(to: userId, requestId: requestId)
            resolveConnectionStatus()
            postToast("Impossible d'annuler", isSuccess: false)
        }
    }

    private func resendRequest() async {
        if let requestId = pendingRequestId {
            try? await FriendService.shared.deleteRequest(requestId: requestId)
        }
        await sendConnectionRequest()
    }

    private func acceptRequest() async {
        guard let requestId = pendingRequestId, let userId = user.userId else { return }
        FriendshipCache.shared.didAcceptRequest(from: userId)
        connectionStatus = .connected
        pendingRequestId = nil
        HapticFeedback.success()
        do {
            let _ = try await FriendService.shared.respond(requestId: requestId, accepted: true)
            postToast("Connexion acceptee", isSuccess: true)
        } catch {
            FriendshipCache.shared.rollbackAccept(senderId: userId, requestId: requestId)
            resolveConnectionStatus()
            HapticFeedback.error()
            postToast("Impossible d'accepter", isSuccess: false)
        }
    }

    private func declineRequest() async {
        guard let requestId = pendingRequestId, let userId = user.userId else { return }
        FriendshipCache.shared.didRejectRequest(from: userId)
        connectionStatus = .none
        pendingRequestId = nil
        HapticFeedback.medium()
        do {
            let _ = try await FriendService.shared.respond(requestId: requestId, accepted: false)
            postToast("Demande refusee", isSuccess: true)
        } catch {
            FriendshipCache.shared.rollbackReject(senderId: userId, requestId: requestId)
            resolveConnectionStatus()
            HapticFeedback.error()
            postToast("Impossible de refuser", isSuccess: false)
        }
    }

    // MARK: - Block Actions

    private func blockUser() async {
        guard let userId = user.userId, !userId.isEmpty else { return }
        do {
            try await BlockService.shared.blockUser(userId: userId)
            isBlocked = true
            HapticFeedback.medium()
            postToast("Utilisateur bloque", isSuccess: true)
        } catch {
            postToast("Impossible de bloquer", isSuccess: false)
        }
    }

    private func unblockUser() async {
        guard let userId = user.userId, !userId.isEmpty else { return }
        do {
            try await BlockService.shared.unblockUser(userId: userId)
            isBlocked = false
            // Re-resolve friendship after unblock
            resolveConnectionStatus()
            HapticFeedback.light()
            postToast("Utilisateur debloque", isSuccess: true)
        } catch {
            postToast("Impossible de debloquer", isSuccess: false)
        }
    }
```

- [ ] **Step 5: Update actionButtons to use internal methods instead of optional callbacks**

Replace the `actionButtons` computed property:

```swift
    @ViewBuilder
    private var actionButtons: some View {
        VStack(spacing: 10) {
            switch connectionStatus {
            case .none:
                profileActionButton(
                    icon: "person.badge.plus.fill",
                    label: "Demande de connexion",
                    color: Color(hex: resolvedAccent),
                    action: { Task { await sendConnectionRequest() } }
                )
            case .pendingSent:
                profileActionButton(
                    icon: "xmark.circle.fill",
                    label: "Annuler la demande",
                    color: theme.textMuted,
                    action: { Task { await cancelRequest() } }
                )
                profileActionButton(
                    icon: "arrow.clockwise.circle.fill",
                    label: "Renvoyer la demande",
                    color: Color(hex: resolvedAccent),
                    action: { Task { await resendRequest() } }
                )
            case .pendingReceived:
                profileActionButton(
                    icon: "checkmark.circle.fill",
                    label: "Accepter la connexion",
                    color: MeeshyColors.success,
                    action: { Task { await acceptRequest() } }
                )
                profileActionButton(
                    icon: "xmark.circle.fill",
                    label: "Refuser la connexion",
                    color: theme.textMuted,
                    action: { Task { await declineRequest() } }
                )
            case .connected:
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundColor(MeeshyColors.success)
                    Text("Connectes")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(MeeshyColors.success)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(MeeshyColors.success.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }

            if isBlocked {
                profileActionButton(
                    icon: "hand.raised.slash.fill",
                    label: "Debloquer l'utilisateur",
                    color: MeeshyColors.warning,
                    action: { Task { await unblockUser() } }
                )
            } else {
                profileActionButton(
                    icon: "hand.raised.fill",
                    label: "Bloquer cet utilisateur",
                    color: theme.error,
                    action: { Task { await blockUser() } }
                )
            }
        }
    }
```

- [ ] **Step 6: Update tabSection .task to use new loading**

Replace the `.task` block in `tabSection`:

```swift
        .task {
            await loadDataIfNeeded()
            await loadConversationsIfNeeded()
        }
```

And update `loadDataIfNeeded` to remove the `fullUser == nil` guard (it's always nil now):

```swift
    private func loadDataIfNeeded() async {
        guard let userId = user.userId else { return }

        let cacheResult = await CacheCoordinator.shared.profiles.load(for: userId)

        switch cacheResult {
        case .fresh(let cached, _):
            if let profile = cached.first { internalFullUser = profile }
            return
        case .stale(let cached, _):
            if let profile = cached.first { internalFullUser = profile }
            await fetchAndCacheProfile(userId)
        case .expired, .empty:
            internalIsLoading = internalFullUser == nil
            await fetchAndCacheProfile(userId)
        }
    }
```

And update `loadStatsIfNeeded` to remove `onLoadStats` guard:

```swift
    private func loadStatsIfNeeded() async {
        guard let userId = user.userId else { return }

        internalIsLoadingStats = true
        do {
            let fetchedStats = try await UserService.shared.getUserStats(userId: userId)
            internalUserStats = fetchedStats
        } catch {}
        internalIsLoadingStats = false
    }
```

And update `loadConversationsIfNeeded` to use internal `currentUserId`:

```swift
    private func loadConversationsIfNeeded() async {
        guard let userId = user.userId else { return }

        internalIsLoadingConversations = true
        do {
            let apiConversations = try await ConversationService.shared.listSharedWith(userId: userId)
            internalConversations = apiConversations.map { $0.toConversation(currentUserId: currentUserId) }
        } catch {}
        internalIsLoadingConversations = false
    }
```

- [ ] **Step 7: Update sendMessageButton to use onSendMessage or NotificationCenter**

Find the `sendMessageButton` and `sendMessageButtonCompact` computed properties. They should use `onSendMessage` if provided, or fall back to `NotificationCenter`:

The existing code likely uses `onSendMessage` callback. Keep that behavior — it's an external navigation callback. If nil, post notification:

```swift
    private func handleSendMessage() {
        if let onSendMessage {
            onSendMessage()
        } else if let userId = user.userId {
            dismiss()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                NotificationCenter.default.post(
                    name: Notification.Name("sendMessageToUser"),
                    object: userId
                )
            }
        }
    }
```

- [ ] **Step 8: Verify build**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED (may have errors to fix — proceed to fix them)

- [ ] **Step 9: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift
git commit -m "feat(sdk): make UserProfileSheet autonomous — internalize blocking, friendship, and actions"
```

---

### Task 3: Simplify RootView — remove ProfileFetchingSheet

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/RootView.swift`

- [ ] **Step 1: Remove entire ProfileFetchingSheet struct**

Delete the `ProfileFetchingSheet` struct (lines ~764-1003) — it's no longer needed. All its logic is now inside `UserProfileSheet`.

- [ ] **Step 2: Update the profile sheet presentation**

Find the `.sheet(item: $router.deepLinkProfileUser)` modifier (line ~381) and simplify:

Before:
```swift
.sheet(item: $router.deepLinkProfileUser) { user in
    ProfileFetchingSheet(user: user)
        .environmentObject(statusViewModel)
}
```

After:
```swift
.sheet(item: $router.deepLinkProfileUser) { user in
    UserProfileSheet(
        user: user,
        moodEmoji: statusViewModel.statusForUser(userId: user.userId ?? "")?.moodEmoji,
        onMoodTap: statusViewModel.moodTapHandler(for: user.userId ?? "")
    )
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
}
```

- [ ] **Step 3: Verify build**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/RootView.swift
git commit -m "refactor(ios): remove ProfileFetchingSheet — UserProfileSheet is now autonomous"
```

---

### Task 4: Simplify RootViewComponents — ThemedFeedComposer

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/RootViewComponents.swift`

- [ ] **Step 1: Simplify ThemedFeedComposer profile sheet**

Find the `.sheet(item: $selectedProfileUser)` in `ThemedFeedComposer` (line ~554) and simplify:

Before:
```swift
.sheet(item: $selectedProfileUser) { user in
    UserProfileSheet(
        user: user,
        isCurrentUser: true,
        moodEmoji: statusViewModel.statusForUser(userId: user.userId ?? "")?.moodEmoji,
        onMoodTap: statusViewModel.moodTapHandler(for: user.userId ?? "")
    )
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
}
```

After:
```swift
.sheet(item: $selectedProfileUser) { user in
    UserProfileSheet(
        user: user,
        moodEmoji: statusViewModel.statusForUser(userId: user.userId ?? "")?.moodEmoji,
        onMoodTap: statusViewModel.moodTapHandler(for: user.userId ?? "")
    )
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
}
```

Note: `isCurrentUser` is now computed internally (userId == AuthManager.shared.currentUser?.id).

- [ ] **Step 2: Verify build**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

- [ ] **Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/RootViewComponents.swift
git commit -m "refactor(ios): simplify ThemedFeedComposer profile sheet call"
```

---

### Task 5: Check and simplify BookmarksView

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/BookmarksView.swift` (if needed)

- [ ] **Step 1: Check BookmarksView for UserProfileSheet usage**

Read `BookmarksView.swift` and check if it uses `UserProfileSheet` with extra callbacks.

- [ ] **Step 2: Simplify if needed**

If it passes callbacks beyond the new simplified API, remove them. The pattern should be:

```swift
UserProfileSheet(
    user: user,
    moodEmoji: ...,
    onMoodTap: ...
)
```

- [ ] **Step 3: Verify build**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

- [ ] **Step 4: Commit (if changes were made)**

```bash
git add apps/ios/Meeshy/Features/Main/Views/BookmarksView.swift
git commit -m "refactor(ios): simplify BookmarksView profile sheet call"
```

---

### Task 6: Final integration build and test

- [ ] **Step 1: Full build**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED with zero errors

- [ ] **Step 2: Check all UserProfileSheet call sites compile**

Run grep to verify no call sites use removed parameters:

```bash
cd /Users/smpceo/Documents/v2_meeshy
grep -rn "isBlocked:\|onBlock:\|onUnblock:\|onConnectionRequest:\|onCancelRequest:\|onResendRequest:\|onAcceptRequest:\|onDeclineRequest:\|onLoadStats:\|currentUserId:\|isCurrentUser:" apps/ios/ packages/MeeshySDK/Sources/MeeshyUI/ --include="*.swift" | grep -v "//\|private\|@State\|case\|let isBlocked\|var isBlocked"
```

Expected: No call sites passing these removed parameters.

- [ ] **Step 3: Verify with meeshy.sh run (manual test)**

Run: `./apps/ios/meeshy.sh run`

Manual test checklist:
1. Open Feed → tap on a post author avatar → profile sheet opens with action buttons (add/block)
2. Open Feed → tap on a comment author → profile sheet opens with action buttons
3. Tap "Bloquer" → user gets blocked, UI shows "Debloquer" only
4. Tap "Debloquer" → user gets unblocked, full UI returns
5. Check own profile → no action buttons shown (isCurrentUser detected)
6. Deep link profile → works with full actions (RootView path)

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(ios): autonomous UserProfileSheet — all feed/post/comment profile sheets now have full actions"
```
