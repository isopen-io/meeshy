# UI/UX Plan — Iteration 32 (2026-06-09)

## Objective
1. Internationalize admin dashboard, users management, audit-logs, ranking pages, AdminLayout, user-settings-modal (web)
2. Fix dark mode on admin form inputs (web)
3. Fix critical textSelection bug on iOS message bubbles
4. Fix Dynamic Type in BubbleCallNoticeView, BubbleFooter (iOS)

## Web Actions

### Locale keys (admin.json — en/fr/es/pt)
1. Add `dashboard.*` section (47+ keys for admin/page.tsx)
2. Add `layout.*` section (20 keys for AdminLayout.tsx)
3. Add `users.list.*` section (42 keys for admin/users/page.tsx)
4. Add `users.detail.*` section (48 keys for admin/users/[id]/page.tsx)
5. Add `auditLogs.*` section (30 keys for audit-logs/page.tsx)
6. Add `ranking.pageTitle`, `ranking.description`, `ranking.podium`, `ranking.topN` keys
7. Add `settings.modal.*` keys for user-settings-modal.tsx

### Components
8. `app/admin/page.tsx` — import useI18n('admin'), wire all strings, fix `fr-FR` locale
9. `components/admin/AdminLayout.tsx` — wire ~20 unharvested strings, fix `fr-FR` locale
10. `app/admin/users/page.tsx` — import useI18n('admin'), wire all 42 strings, fix `fr-FR` locale
11. `app/admin/users/[id]/page.tsx` — import useI18n('admin'), wire all 48 strings
12. `app/admin/audit-logs/page.tsx` — import useI18n('admin'), wire all 30 strings
13. `app/admin/ranking/page.tsx` — import useI18n('admin'), wire 3 strings
14. `components/admin/ranking/RankingPodium.tsx` — import useI18n('admin'), wire 1 string
15. `components/admin/ranking/RankingFilters.tsx` — wire Top 10/25/50/100 keys
16. `components/settings/user-settings-modal.tsx` — wire 5 strings
17. Admin form inputs dark mode: add `dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100` to bare `<select>` and `<input bg-white>` elements in users pages

## iOS Actions
18. `BubbleExpandableText.swift` — Add `.textSelection(.enabled)` to message Text views; resolve the BUG4 comment; remove duplicate Copy from context menu to avoid double action
19. `BubbleCallNoticeView.swift` — Replace `.font(.system(size: X, weight: Y))` with semantic Dynamic Type fonts: `.caption2`, `.caption`, `.footnote`, `.subheadline`
20. `BubbleFooter.swift:39` — Replace `.font(.system(size: 11, weight: .medium))` with `.caption2.weight(.medium)`
