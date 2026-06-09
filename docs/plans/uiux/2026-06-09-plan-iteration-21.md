# UI/UX Plan — Iteration 21 (2026-06-09)

## Objective
Internationalize document-settings, ConversationDrawer, and AgentTopicsTab.

## Actions
1. Add `settings.document.*` keys to all 4 locale files
2. Add `conversations.drawer.*` keys to all 4 locale files
3. Add `agent.topics.*` keys to all 4 admin locale files
4. Fix `document-settings.tsx` — import useI18n, wire ~40 strings
5. Fix `ConversationDrawer.tsx` — add tConv = useI18n('conversations'), wire 18 strings
6. Fix `AgentTopicsTab.tsx` — import useI18n('admin'), wire 9 strings
