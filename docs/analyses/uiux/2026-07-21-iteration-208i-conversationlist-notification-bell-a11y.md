# Iteration 208i — iPad header notification bell: unread count dropped from VoiceOver + latent French-only key

**Track**: iOS UI/UX (suffix `i`)
**Date**: 2026-07-21
**Branch**: `claude/laughing-thompson-wkcpvr`
**Base**: `main` HEAD `22465a5`
**Files**:
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+Overlays.swift` (bell button)
- `apps/ios/Meeshy/Localizable.xcstrings` (new key `a11y.notifications.unread_count`)
- `apps/ios/MeeshyTests/Unit/Views/ConversationListOverlaysAccessibilityTests.swift` (source-level guard)

## Surface
The iPad / regular-width conversation-list header renders a `bell.fill` button with a
red badge showing the unread notification count (`Text("\(min(iPadNotificationCount, 99))")`).
It is the iPad-header sibling of the compact-width floating-menu bell in `RootView`.

## Defect (WCAG 1.3.1 Info & Relationships / 4.1.2 Name, Role, Value)
Two distinct, compounding problems:

1. **Count dropped from VoiceOver.** The bell carried only a static
   `.accessibilityLabel("Notifications")`. The visible unread-count badge — information
   sighted users get at a glance — was never announced. VoiceOver users heard "Notifications,
   button" with no indication that 5 items were waiting.

2. **Latent French-only announcement (shared key).** The compact bell in `RootView`
   (`RootView.swift:1676`) *does* announce the count via
   `String(localized: "a11y.notifications.unread_count", defaultValue: "%d notifications non lues", …)`.
   But that key had **no entry at all** in `Localizable.xcstrings` — only the inline French
   `defaultValue`. So on de / en / es / pt-BR devices the compact bell already announced the
   count **in French** ("5 notifications non lues") while the rest of the UI was localized.

## Fix
- **Bell** (`ConversationListView+Overlays.swift`): add `.accessibilityValue` that restates the
  count via the **same** shared key `a11y.notifications.unread_count`, guarded on
  `iPadNotificationCount > 0` (empty value otherwise). VoiceOver now announces
  "Notifications, 5 unread notifications, button". Label stays "Notifications" (the element's
  name); the count is exposed as the element's *value* per HIG. **0 visual change.**
- **Catalog** (`Localizable.xcstrings`): add `a11y.notifications.unread_count` with real
  translations for all five supported locales (de / en / es / fr / pt-BR), as a flat `%d`
  format string — matching how every count string in this codebase is consumed
  (`String(format: String(localized:…), count)`; cf. `accessibility.unread_count`,
  `a11y.floating.menu.notifications-value`, `a11y.back.with_unread`). This retroactively fixes
  the compact `RootView` bell too — one source-of-truth key, both bells now localize correctly.

**Zero logic/network change.** VoiceOver + i18n layer only. Uses the true `iPadNotificationCount`
(not the visually-capped `min(…, 99)`) so VoiceOver users get the exact number, consistent with
`RootView`'s use of the raw `unreadCount`.

## Verification
- New source-level guard `ConversationListOverlaysAccessibilityTests`:
  - `test_notificationBell_announcesUnreadCountToVoiceOver` — asserts the bell block carries
    `.accessibilityValue` referencing `a11y.notifications.unread_count` + `iPadNotificationCount`.
  - `test_unreadCountKey_isLocalizedForEverySupportedLocale` — parses `Localizable.xcstrings`
    and asserts the key exists with all five locales (de/en/es/fr/pt-BR), guarding the latent
    French-only regression from recurring.
- New test file auto-included by XcodeGen recursive globbing of `MeeshyTests/` (per
  `apps/ios/project.yml`) — no pbxproj hand-edit.
- Gate = CI `iOS Tests` (regenerates project via `xcodegen generate`, compiles Swift 6.2,
  runs on iOS 18.2 simulator).

## Status
✅ Resolved. Do not re-flag the iPad notification bell — it now announces the localized unread
count. `a11y.notifications.unread_count` is now a fully-localized shared key.

### Remaining / adjacent (defer, 1/iteration, collision-check first)
- `CallView.swift:1480` — raw `Color.green` on the "Réessayer" retry CTA. Deferred: the green
  may be an intentional call-affordance (iOS phone convention); the correct token (brand indigo
  vs `MeeshyColors.success` vs a call-green) is ambiguous and needs a product call.
- `ConversationListView+Overlays.swift:967` (`Text("Meeshy Chats")`) /
  `RootViewComponents.swift:363` (`Text("Meeshy Feed")`) — top-level headers rely on raw-English
  `LocalizedStringKey` with empty catalog entries; convert to the `String(localized:defaultValue:)`
  convention + add translations.
