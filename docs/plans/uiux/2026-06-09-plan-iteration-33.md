# UI/UX Plan — Iteration 33 (2026-06-09)

## Objective
1. Restore 6 locale sections lost in iter-32 merge conflict (dashboard, layout, usersList, usersDetail, rankingPage, settingsModal) — all 4 locales
2. Wire i18n for admin user-detail sub-components (5 files, ~78 strings)
3. Wire i18n for admin agent tabs (2 files, ~65 strings)
4. Fix dark mode on `bg-white` inputs in admin/users/new/page.tsx
5. iOS: Dynamic Type in SecurityVerificationView
6. iOS: Accessibility labels on `.onLongPressGesture` in BubbleStandardLayout+Media + BubbleReactionsOverlay

## Web Actions

### Locale keys (admin.json — en/fr/es/pt) — restore lost iter-32 keys
1. Add `dashboard.*` section (48 keys) to all 4 locales
2. Add `layout.*` section (20 keys) to all 4 locales
3. Add `usersList.*` section (36 keys) to all 4 locales
4. Add `usersDetail.*` section (44 keys) to all 4 locales
5. Add `rankingPage.*` section (7 keys) to all 4 locales
6. Add `settingsModal.*` section (5 keys) to all 4 locales

### Locale keys (admin.json) — new iter-33 keys
7. Extend `userDetail.*` section with ~78 new keys for user-detail sub-components
8. Extend `llm.*` section with AgentLlmTab-specific keys (~20)
9. Extend `globalConfig.*` section with AgentGlobalConfigTab-specific keys (~30)

### Components
10. `components/admin/user-detail/UserContactInfoSection.tsx` — import useI18n('admin'), wire ~14 strings
11. `components/admin/user-detail/UserPersonalInfoSection.tsx` — import useI18n('admin'), wire ~16 strings
12. `components/admin/user-detail/UserGeolocationSection.tsx` — import useI18n('admin'), wire ~8 strings
13. `components/admin/user-detail/UserSecuritySection.tsx` — import useI18n('admin'), wire ~20 strings
14. `components/admin/user-detail/UserActivitySection.tsx` — import useI18n('admin'), wire ~20 strings
15. `components/admin/agent/AgentLlmTab.tsx` — wire remaining ~30 strings
16. `components/admin/agent/AgentGlobalConfigTab.tsx` — wire remaining ~35 strings
17. `app/admin/users/new/page.tsx` — add `dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100` to all `bg-white` inputs/selects

## iOS Actions
18. `SecurityVerificationView.swift` — replace `.font(.system(size: 64/16/14))` with semantic Dynamic Type fonts
19. `BubbleStandardLayout+Media.swift:565` — add `.accessibilityLabel(t("longPressMediaLabel"))` to `.onLongPressGesture` view
20. `BubbleReactionsOverlay.swift:134,233` — add `.accessibilityLabel` to `.onLongPressGesture` reaction views
