# UI/UX Plan — Iteration 4 (2026-06-08)

## Goals

1. Create `admin` i18n namespace (en/fr/es/pt) for ranking/scan-log/regex-tester strings
2. Extend `viewers.markdown` namespace with `delete` and `fullscreen` keys
3. Add i18n to RankingTable, ScanLogTable, AgentTopicRegexTester, MarkdownViewer
4. Fix AdminLayout.tsx header dark mode (add `dark:bg-gray-800 dark:border-gray-700`)
5. iOS: migrate clipboard preview `Color(hex:)` literals to MeeshyColors tokens

## Changes

### Web Locale Files
- Create `locales/{en,fr,es,pt}/admin.json` with sections: `ranking`, `scanLog`, `filter`, `trigger`, `timeAgo`, `regexTester`
- Update `locales/{en,fr,es,pt}/viewers.json` — add `markdown.delete`, `markdown.fullscreen`
- Register `admin` in all four `index.ts` files

### Web Components
- `RankingTable.tsx`: add `'use client'`, `useI18n('admin')`, replace 8 strings
- `ScanLogTable.tsx`: `useI18n('admin')`, move `formatTimeAgo` inside component (needs `t`), replace filter/trigger/empty strings
- `AgentTopicRegexTester.tsx`: `useI18n('admin')`, replace 6 strings
- `MarkdownViewer.tsx`: `useI18n('viewers')`, remove `errorMessage` state, replace 5 strings
- `AdminLayout.tsx`: add `dark:bg-gray-800 dark:border-gray-700` to header (line 306)

### iOS
- `UniversalComposerBar+Attachments.swift`: 4 `Color(hex:)` → `MeeshyColors.*` in `clipboardContentPreview()`
