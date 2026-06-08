# UI/UX Plan — Iteration 7 (2026-06-08)

## Scope

iOS hex color cleanup (ConversationInfoSheet) + Web i18n/a11y on two new components
(MessageSearch, PinnedMessageBanner) + Web i18n in ConversationItemActions +
Web a11y in CustomizationManager and CategorySelector.

## Steps

- [ ] 1. iOS: Replace 5 `Color(hex:)` instances in ConversationInfoSheet.swift
- [ ] 2. Web: Add `useI18n` + replace 3 hardcoded strings in MessageSearch.tsx
- [ ] 3. Web: Add `useI18n` + replace hardcoded aria-label in PinnedMessageBanner.tsx
- [ ] 4. Web: Replace 6 hardcoded strings in ConversationItemActions.tsx (using t prop)
- [ ] 5. Web: Add aria-label to 2 Check buttons in CustomizationManager.tsx
- [ ] 6. Web: Add aria-label to 4 icon buttons in CategorySelector.tsx
- [ ] 7. Add new locale keys to all 4 locale files (en, fr, es, pt)
- [ ] 8. Commit, push, create PR, monitor CI, merge to main

## Files Modified

| File | Change |
|------|--------|
| `apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift` | 5× hex→token |
| `apps/web/components/conversations/MessageSearch.tsx` | useI18n + 3 strings |
| `apps/web/components/conversations/PinnedMessageBanner.tsx` | useI18n + 1 aria-label |
| `apps/web/components/conversations/conversation-item/ConversationItemActions.tsx` | 6 strings |
| `apps/web/components/conversations/details-sidebar/CustomizationManager.tsx` | 2 aria-labels |
| `apps/web/components/conversations/details-sidebar/CategorySelector.tsx` | 4 aria-labels |
| `apps/web/locales/{en,fr,es,pt}/conversations.json` | new keys |

## New Locale Keys

```json
"conversationHeader": {
  "reactions": "Reactions"
},
"messageSearch": {
  "placeholder": "Search in conversation…",
  "noResults": "No results",
  "searchError": "An error occurred during search."
},
"pinnedMessage": {
  "dismiss": "Dismiss pinned message"
}
```
