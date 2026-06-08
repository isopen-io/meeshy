# UI/UX Plan — Iteration 5 (2026-06-08)

## Objective

Eliminate remaining hardcoded hex colors across iOS (ConversationInfoSheet destructive section,
BubbleStandardLayout mention links, BubbleStandardLayout+Media error overlays, FeedView toolbar),
migrate readable text fonts to Dynamic Type in FeedView, and complete web i18n for
MessageActionsBar help tooltip and notification-settings toast/confirm strings.

## Steps

### Step 1 — iOS: ConversationInfoSheet hex colors (HIGH)

File: `apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift`

- Line 975: `Color(hex: "4ECDC4")` → `MeeshyColors.indigo300`
- Lines 1212, 1221, 1226, 1229: `Color(hex: "EF4444")` ×4 → `MeeshyColors.error`

### Step 2 — iOS: BubbleStandardLayout+Media hex color (HIGH)

File: `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift`

- Line 373: `Color(hex: "FF6B6B")` → `MeeshyColors.error`

### Step 3 — iOS: BubbleStandardLayout hashtag link color (MEDIUM)

File: `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift`

- Line 934: `Color(hex: "818CF8")` → `MeeshyColors.indigo400`

### Step 4 — iOS: FeedView toolbar hex colors (MEDIUM)

File: `apps/ios/Meeshy/Features/Main/Views/FeedView.swift`

- Line 1070: `Color(hex: "4ECDC4")` → `MeeshyColors.indigo300`
- Line 1076: `Color(hex: "FF6B6B")` → `MeeshyColors.error`
- Line 1082: `Color(hex: "F8B500")` → `MeeshyColors.warning`
- Line 1088: `Color(hex: "9B59B6")` → `MeeshyColors.indigo500`
- Line 1094: `Color(hex: "2ECC71")` → `MeeshyColors.success`
- Line 1100: `Color(hex: "FF2E63")` → `MeeshyColors.error`

### Step 5 — iOS: FeedView Dynamic Type (MEDIUM)

File: `apps/ios/Meeshy/Features/Main/Views/FeedView.swift`

Replace fixed `.system(size: X)` with semantic fonts for readable content:
- Line 465: `.system(size: 16, weight: .bold)` → `.headline`
- Line 481: `.system(size: 14)` → `.body`
- Line 587: `.system(size: 18, weight: .bold)` → `.title3`
- Lines 951, 958, 972, 995: subheadline/headline/footnote semantic fonts

### Step 6 — Web: MessageActionsBar i18n (HIGH)

File: `apps/web/components/common/bubble-message/MessageActionsBar.tsx`

- Line 517: `Besoin d&apos;aide` → `{t('common.needHelp')}`
- Add `useI18n('common')` if not already imported
- Add key `common.needHelp` to all 4 locale files (en/fr/es/pt)

### Step 7 — Web: notification-settings i18n (HIGH)

File: `apps/web/components/settings/notification-settings.tsx`

Replace 7 hardcoded toast/confirm strings with `t()` calls.
Namespace: `notifications`.
New keys: `settings.saveError`, `settings.saveSuccess`, `settings.quietHoursError`,
`settings.resetConfirm`, `settings.resetSuccess`, `settings.permissionGranted`,
`settings.permissionDenied`.
Add translations to all 4 locale files.

## Validation

- `grep -n "Color(hex:\"EF4444\|4ECDC4\|FF6B6B\|818CF8\|F8B500\|9B59B6\|2ECC71\|FF2E63"` on modified iOS files → 0 results
- `python3 -c "import json; json.load(open(...))"` on all 8 modified locale files
- `cd apps/web && npx tsc --noEmit` → no new errors
- `git diff --stat` confirms only targeted files modified
