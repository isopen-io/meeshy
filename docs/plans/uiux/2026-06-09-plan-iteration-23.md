# UI/UX Plan — Iteration 23 (2026-06-09)

## Objective
Internationalize privacy-settings and v2/ConversationSettings.

## Actions
1. Add `privacy.*` keys (27) to all 4 settings locale files
2. Add `conversations.settings.*` keys (31) to all 4 conversations locale files
3. Fix `privacy-settings.tsx` — wire all 27 strings
4. Fix `ConversationSettings.tsx` — import useI18n('conversations'), wire ~22 strings
