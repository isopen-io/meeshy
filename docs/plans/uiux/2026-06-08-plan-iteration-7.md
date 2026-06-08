# Plan UI/UX — Itération 7 (2026-06-08)

Deux passes parallèles, chacune fusionnée dans main séparément.

---

## Passe A — Web i18n fixes + iOS sentiment colors

✅ **COMPLÉTÉE — PR #384 mergée dans main**

### Objectifs
1. Corriger les bugs i18n silencieux (key paths incorrects dans admin + groups)
2. Localiser les nouveaux composants web (MessageSearch, PinnedMessageBanner)
3. Migrer les couleurs hardcodées iOS vers MeeshyColors (ConversationDashboardView, ConversationInfoSheet)

### Changements effectués
- `RankingFilters.tsx`: `t('admin.ranking.*')` → `t('ranking.*')` (3 placeholders Select)
- `AgentLiveTab.tsx`: fix prefix `admin.agentLive.selectConversation` → `agentLive.selectConversation`
- `UserLanguageSection.tsx`: fix prefix + 2 toasts FR hardcodés → `t()`
- `translation-monitor.tsx`: fix prefix + titre FR hardcodé → `t()`
- `groups-layout-responsive.tsx`: 5 `tGroups('groups.xxx')` → `tGroups('xxx')` + `"Chargement..."` → i18n
- `MessageSearch.tsx` + `PinnedMessageBanner.tsx`: `useI18n('conversations')` + keys ×4 langs
- `ConversationDashboardView.swift`: `34D399`→`success`, `FBBF24`→`warning`, `F87171`→`error` (16×)
- `ConversationInfoSheet.swift`: `EF4444`→`error` (4×), `4ECDC4`→`indigo400`

---

## Passe B — iOS toast localization + remaining color migration

✅ **COMPLÉTÉE — PR #389 mergée dans main**

### Objectifs
1. Localiser ~32 strings hardcodées dans 6 ViewModels iOS
2. Migrer les `Color(hex:)` restants dans `ConversationPreferencesTab`

### Changements effectués

**iOS toast strings (6 fichiers):**
- `FeedViewModel.swift` — 15 strings: like, bookmark, comment, repost, share, delete, report, edit, pin → `feed.*` keys
- `PostDetailViewModel.swift` — 6 strings: comment load, like, send comment, send reply → `feed.*` keys
- `StoryViewModel.swift` — 4 strings: story published/failed (×2 paths) → `story.*` keys
- `BookmarksViewModel.swift` — 2 strings: load/remove bookmark errors → `feed.bookmark.*` keys
- `StatusViewModel.swift` — 3 strings: publish, delete, react errors → `status.*` keys
- `ConversationView.swift` — 2 strings: access revoked + message not found → `conversation.*` keys

**iOS Color(hex:) migration:**
- `ConversationPreferencesTab.swift` — 11 occurrences: `3B82F6`→`info`, `FF6B6B`→`error`, `F59E0B`→`warning`, `F97316`→`warning`, `F87171`→`error`

---

## Déferré → Itération 8

- iOS Dynamic Type: `PostDetailView` (48×), `ThreadView` (13×), `ReplyThreadOverlay` (15×)
- iOS a11y: `OnboardingStepViews` (3 labels), `MagicLinkView` (1 label)
- iOS Color(hex:) remaining: `UniversalComposerBar` (~47×), `ConversationDashboardView` remaining
- Web a11y: 8 icon-only buttons needing aria-labels
