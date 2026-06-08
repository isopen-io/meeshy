# Plan UI/UX — Itération 5 (2026-06-08)

## Contexte
Basé sur l'analyse `docs/analyses/uiux/2026-06-08-iteration-5.md`.
Itérations 1-4 terminées (PRs #345, #347, #350, #354, #356).

## Scope

### A. Accessibilité Web (aria-label) — 6 composants
| Composant | Bouton | aria-label |
|-----------|--------|-----------|
| `AgentConversationsTab.tsx` | Settings icon | `"Edit agent configuration"` |
| `AgentConversationsTab.tsx` | Trash2 icon | `"Delete configuration"` |
| `TriggerSchedulingModal.tsx` | X close | `"Cancel schedule"` |
| `UserPicker.tsx` (admin/agent) | Plus | `"Add user"` |
| `ConversationPicker.tsx` (admin/agent) | X clear | `"Clear selection"` |
| `AudioEffectsCarousel.tsx` | X close | `"Close audio effects"` |
| `CustomizationManager.tsx` | X close | `"Close"` |

### B. i18n Web — 8 composants + 3 fichiers locale

#### Nouveaux clés locale

**joinPage.json** : `usernameAvailable`

**admin.json** :
- `agentOverview.{recentActivity, noActivity}`
- `agentLive.{selectConversation, liveTitle, loading}`
- `ranking.{filtersTitle, entityType, selectType, entityUsers, entityConversations, entityMessages, entityLinks, criterion, selectCriterion, filterCriteria, noCriterion, period, selectPeriod, period1d…periodAll, resultsCount}`
- `userDetail.{languagePreferences, edit}`
- `translationMonitor.{loading, messages, translated, languageBreakdown, messagesUnit, errorsUnit}`

**components.json** : `languageSelect.noLanguageFound`

#### Composants à câbler
1. `AnonymousForm.tsx` — `t('usernameAlreadyTaken')` + `t('usernameAvailable')` (joinPage namespace déjà présent)
2. `groups-layout-responsive.tsx` — réutiliser clés existantes tGroups()
3. `AgentOverviewTab.tsx` — ajouter `useI18n('admin')`
4. `AgentLiveTab.tsx` — ajouter `useI18n('admin')`
5. `RankingFilters.tsx` — ajouter `useI18n('admin')` + PERIODS computed
6. `UserLanguageSection.tsx` — ajouter `useI18n('admin')`
7. `translation-monitor.tsx` — ajouter `useI18n('admin')`
8. `language-select.tsx` — ajouter `useI18n('components')`

### C. Dark mode — 1 fix
`RankingFilters.tsx:109` — `dark:bg-gray-950` → `dark:bg-gray-800` (sticky filter header)

### D. Accessibilité iOS — 2 boutons
1. `OnboardingStepViews.swift` — password visibility toggle: `Image(systemName:)` seul → ajouter `.accessibilityLabel()`
2. `OnboardingStepViews.swift` — search clear button (ligne ~771): `Image(systemName:)` seul → ajouter `.accessibilityLabel()`

## Fichiers modifiés
```
apps/web/locales/{en,fr,es,pt}/joinPage.json
apps/web/locales/{en,fr,es,pt}/admin.json
apps/web/locales/{en,fr,es,pt}/components.json
apps/web/components/join/AnonymousForm.tsx
apps/web/components/groups/groups-layout-responsive.tsx
apps/web/components/admin/agent/AgentOverviewTab.tsx
apps/web/components/admin/agent/AgentLiveTab.tsx
apps/web/components/admin/ranking/RankingFilters.tsx
apps/web/components/admin/user-detail/UserLanguageSection.tsx
apps/web/components/translation/translation-monitor.tsx
apps/web/components/ui/language-select.tsx
apps/web/components/admin/agent/AgentConversationsTab.tsx
apps/web/components/admin/agent/TriggerSchedulingModal.tsx
apps/web/components/admin/agent/UserPicker.tsx
apps/web/components/admin/agent/ConversationPicker.tsx
apps/web/components/video-calls/AudioEffectsCarousel.tsx
apps/web/components/conversations/details-sidebar/CustomizationManager.tsx
apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift
```

## Non-inclus (itération suivante)
- `constants.ts` ranking criteria labels (refactor architectural nécessaire — clés i18n au lieu de labels statiques)
- 170+ `Color(hex:)` iOS restants (audit categorisation à finaliser)
