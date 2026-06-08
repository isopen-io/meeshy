# UI/UX Plan — Iteration 7 (2026-06-08)

## Scope

Based on `docs/analyses/uiux/2026-06-08-iteration-7.md`.

## Tasks

- [x] iOS flaky test fix: `MockAPIClientForApp.paginatedRequest` — add `await Task.yield()`
- [x] Web i18n: `MessageSearch.tsx` — add `useI18n('conversations')` + wire 4 keys
- [x] Web i18n: `PinnedMessageBanner.tsx` — add `useI18n('conversations')` + wire 1 key
- [x] Web i18n: `groups-layout-responsive.tsx` — wire 5 existing keys via `tGroups`
- [x] Locale files: add `messageSearch` + `pinnedMessage` blocks to all 4 locales (fr/en/es/pt)
- [x] Docs: create analysis + plan documents

## Files Modified

### iOS
- `apps/ios/MeeshyTests/Mocks/MockAPIClientForApp.swift`

### Web Components
- `apps/web/components/conversations/MessageSearch.tsx`
- `apps/web/components/conversations/PinnedMessageBanner.tsx`
- `apps/web/components/groups/groups-layout-responsive.tsx`

### Locale Files
- `apps/web/locales/fr/conversations.json`
- `apps/web/locales/en/conversations.json`
- `apps/web/locales/es/conversations.json`
- `apps/web/locales/pt/conversations.json`

## Verification

- TypeScript build: no new errors expected (pure i18n key wiring)
- iOS test: `test_loadFeed_whenAlreadyLoading_guardsAgainstDoubleLoad` should now pass
- All 4 locale files have consistent keys under `conversations.messageSearch` and `conversations.pinnedMessage`
