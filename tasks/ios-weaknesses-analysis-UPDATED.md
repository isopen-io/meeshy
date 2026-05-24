# Updated Analysis Report — Meeshy iOS Weaknesses

**Date**: 2026-05-24
**Status**: Updated re-analysis after major development cycle.

---

## 1. Executive Summary

Since the initial audit on 2026-05-21, several critical (P0) items have been addressed:
- **Auth**: 2FA challenge is integrated into the login flow; session refresh is serialized to avoid races; logout is now resilient with retries and cache clearing.
- **Media/Cache**: Disk budget eviction is now automatic on save; VoIP dedup uses a timestamped ring.
- **Navigation**: Universal links handling is more robust.
- **Missing Components**: `ActiveSessionsViewModel` is now implemented.

However, significant debt remains:
1. **Security**: `activeUserId` and `savedAccounts` are still stored in `UserDefaults`.
2. **Architecture**: `ConversationViewModel` remains a 3000+ line God Object.
3. **Notification Routing**: A regression causes Post notifications to sometimes route to the Story Viewer.
4. **Foreground Sync**: In-app state sync for foreground notifications needs refinement to ensure immediate DB/cache updates.
5. **Perf**: Extensive use of Spring animations and `@Published` properties in list ViewModels still impacts battery and UI fluidity.

---

## 2. Updated Priority List (P0 — Blocking Production)

### 2.1 Security & Session (High Priority)
1. **[NEW P0] Move `activeUserId` and `savedAccounts` to Keychain**: Current implementation in `AuthManager.swift` relies on `UserDefaults` for these fields. While tokens are in Keychain, the session identity should also be protected.
2. **[REMAINING] Audit `AnonymousSessionStore` accessibility**: Ensure `AfterFirstUnlock` is used consistently for background NSE access.

### 2.2 Navigation & Notifications
3. **[CRITICAL BUG] Fix Post/Story Notification Routing**: Correct the heuristic in `RootView.navigateFromNotification` and `isStoryNotification` to prevent posts from opening in the Story viewer.
4. **[REFINED] Foreground Notification Sync**: Ensure `AppDelegate.userNotificationCenter(_:willPresent:)` triggers the same `ConversationSyncEngine` logic as silent pushes to keep local state fresh without waiting for a manual refresh.
5. **[REMAINING] In-app Muting**: Expand banner suppression to more contexts (e.g., muting post reaction notifications if the post detail is already open).

### 2.3 Architectural Refactor
6. **[CRITICAL] Split `ConversationViewModel`**: Decompose into `ConversationStateStore`, `ConversationCommandHandler`, and `TranslationResolver`.
7. **[REFINED] Optimize `ConversationListViewModel`**: Reduce the number of `@Published` properties (currently 16) by extracting specific domains into sub-stores.

### 2.4 Prisme Linguistique
8. **[REMAINING] Full Prisme Coverage**: Verify that `lastMessagePreview` translation in `ThemedConversationRow` is working correctly in all edge cases (e.g., when translations are fetched late).

---

## 3. Detailed Status of Previous P0s

| Original P0 | Status | Note |
|---|---|---|
| 1. Security tokens (Keychain) | 🟡 Partial | JWT is in Keychain, but `activeUserId` is in UD. |
| 2. Multiple-401 refresh race | ✅ Fixed | Serialized via `tokenRefreshTask`. |
| 3. 2FA challenge at login | ✅ Fixed | `completeLoginWith2FA` implemented. |
| 4. `ActiveSessionsViewModel` | ✅ Fixed | File exists and is wired. |
| 5. Foreground muting | 🟡 Partial | Suppresses banner for active conv, needs expansion. |
| 6. Story expiration 24h | ✅ Fixed | Check implemented in `StoryViewerView`. |
| 7/8. Prisme in list | ✅ Fixed | `resolvedLastMessagePreview` implemented. |
| 9. Outbox idempotence | ✅ Fixed | `OutboxRecord` and `clientMessageId` wired. |
| 10. Cache invalidation at logout | ✅ Fixed | `CacheCoordinator.reset()` called on logout. |
| 11. Disk budget eviction | ✅ Fixed | `runBudgetEvictionIfNeeded` on `save()`. |
| 12. GRDB L2 encryption | 🟡 Pending | Needs verification of fail-mode. |
| 13. `@Published` proliferation | 🔴 Pending | `ConversationListViewModel` still has 16. |
| 14. God object `ConversationViewModel` | 🔴 Pending | Still 3000+ lines. |
| 15. Spring animations | 🟡 Partial | Reduced to ~100, but still high. |
| 16. Stories vs Status | 🔴 Pending | User requested better UX separation. |
| 17. Foreground audio leak | 🟡 Pending | Needs verification in `AudioRecorderManager`. |
| 18. VoIP dedup | ✅ Fixed | `VoIPDedupRing` with timestamps. |
| 19. Tests coverage | 🔴 Pending | TDD requested for new work. |
| 20. Anonymous session accessibility | 🟡 Pending | Verify `AfterFirstUnlock`. |
