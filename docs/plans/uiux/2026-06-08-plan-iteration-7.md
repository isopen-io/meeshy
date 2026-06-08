# Plan UI/UX — Itération 7 (2026-06-08)

## Objectif
Corriger les bugs i18n silencieux hérités (key paths incorrects), localiser les nouvelles
composantes web (MessageSearch, PinnedMessageBanner), migrer les couleurs hardcodées iOS vers
les tokens sémantiques MeeshyColors, et localiser les toasts iOS manquants.

## Travaux réalisés

### [x] Web — Fix key paths i18n cassés (admin + groups)
- `RankingFilters.tsx`: `t('admin.ranking.*')` → `t('ranking.*')` (3 placeholders Select)
- `AgentLiveTab.tsx`: `t('admin.agentLive.selectConversation')` → correct
- `UserLanguageSection.tsx`: fix prefix + 2 toasts FR hardcodés → `t()`
- `translation-monitor.tsx`: fix prefix + titre FR hardcodé → `t()`
- `groups-layout-responsive.tsx`: 5 `tGroups('groups.xxx')` → `tGroups('xxx')` +
  `"Chargement..."` → `tGroups('list.loadingInProgress')`

### [x] Web — i18n MessageSearch + PinnedMessageBanner
- Import + hook `useI18n('conversations')` dans les deux composants
- Wire: placeholder, close aria-label, error, noResults
- Ajout clés `messageSearch.*` + `pinnedBanner.close` dans `conversations.json` ×4 langs
- Ajout clés `userDetail.languagePreferences{Saved,Error}` dans `admin.json` ×4 langs

### [x] iOS — Couleurs sémantiques ConversationDashboardView
- `Color(hex: "34D399")` × 8 → `MeeshyColors.success`
- `Color(hex: "FBBF24")` × 4 → `MeeshyColors.warning`
- `Color(hex: "F87171")` × 4 → `MeeshyColors.error`

### [x] iOS — Couleurs sémantiques ConversationInfoSheet
- `Color(hex: "EF4444")` × 4 → `MeeshyColors.error` (bouton block)
- `Color(hex: "4ECDC4")` × 1 → `MeeshyColors.indigo300` (icône E2EE)

### [x] iOS — Toast i18n FeedViewModel (11 strings)
bookmark/comment/like/repost/share/delete/report/pin → `String(localized: "post.xxx")`

### [x] iOS — Toast i18n PostDetailViewModel (4 strings)
comments.loadError, like.error ×2, comment.error ×2 → `String(localized: "post.xxx")`

## Résultat
PR #384 mergé dans main. CI: aucun test iOS affecté (changements cosmétiques seulement).
