# Iteration 34 — Plan d'implémentation (2026-06-12)

## Objectif
Lot web désigné par le plan iter 33 (F3+F5) : selectors Zustand sur les chemins chauds
(liste de conversations, layout, header, modal) et recharts différé via le wrapper dynamic
existant sur les routes admin ranking/analytics. Web uniquement, zéro changement de
comportement visible.

## Étapes (TDD : RED → GREEN)

### Phase 1 — Selector hooks stores (F3, fondations)
- [x] RED : `__tests__/stores/conversation-preferences-store.test.ts` (nouveau) —
      `useConversationPreference(A)` ne re-rend PAS quand les prefs de B changent ;
      `useConversationPreferencesActions()` identité stable à travers les mutations
- [x] RED : extension `__tests__/stores/user-store.test.ts` — `useUserById(id)` retourne
      l'utilisateur et ne re-rend pas pour les mutations d'autres users ; tick selector
- [x] GREEN : `stores/conversation-preferences-store.ts` — ajouter
      `useConversationPreferencesActions()` (useShallow, actions stables) ;
      `stores/user-store.ts` — ajouter `useUserById(userId)`, `useUserStatusTick()`,
      selector d'action `mergeParticipants`

### Phase 2 — Migration des 9 call sites (F3)
- [x] `hooks/conversations/use-participants.ts` — `mergeParticipants` via selector (stable),
      `loadParticipants` sans dépendance instable, alias déprécié `setParticipants` remplacé
- [x] `conversation-item/ConversationItem.tsx` — `useConversationPreference(id)` +
      `useConversationPreferencesActions()` + tick/getUserById via selectors
- [x] `conversation-participants.tsx` — tick + `getUserById` via selectors
- [x] `ConversationSettingsModal.tsx` — actions-only prefs store ; tick + getUserById user store
- [x] `header/use-header-preferences.ts` — `useConversationPreference` +
      `useConversationCategories` + selectors étroits (isLoading, isInitialized, actions)
- [x] `header/use-participant-info.ts` — tick + getUserById via selectors
- [x] `components/conversations/hooks/useConversationPreferences.ts` — selectors étroits
- [x] Vert : jest ciblé (stores + use-header-preferences + ranking) — les tests existants
      passent sans modification (comportement inchangé)

### Phase 3 — recharts différé (F5)
- [x] `components/admin/ranking/RankingStats.tsx` → `RankingStatsImpl.tsx` (impl recharts) ;
      nouveau `RankingStats.tsx` wrapper `next/dynamic` (ssr:false, skeleton), garde
      `criterion === 'recent_activity' || rankings.length === 0 → null` hoistée dans le wrapper
- [x] `components/admin/ChartsImpl.tsx` — ajouter `SimpleBarChart` (data, xAxisKey, dataKey,
      color, height) ; `Charts.tsx` — export dynamic + skeleton nu (sans Card)
- [x] `app/admin/analytics/page.tsx` — remplacer le bloc recharts inline par `SimpleBarChart`,
      supprimer l'import `recharts`
- [x] Découvert via garde-fou grep : `app/links/tracked/[token]/page.tsx` (route user-facing)
      importait recharts statiquement → extraction `TrackedLinkClicksChart.tsx` + `next/dynamic`
- [x] Garde-fou : `grep` — plus aucun import statique de recharts hors `ChartsImpl.tsx`,
      `RankingStatsImpl.tsx`, `TrackedLinkClicksChart.tsx`, `ScanHistoryChart.tsx`,
      `AgentOverviewTab.tsx` (tous différés via dynamic au niveau consommateur)

### Phase 4 — Vérification & livraison
- [x] `tsc --noEmit` web : aucun nouveau fichier en erreur vs main (2 erreurs préexistantes
      `formatCount` corrigées au passage) ; `next build` OK, −103/−108/−113 kB First Load JS
      sur analytics/ranking/tracked-links ; eslint hérité cassé dans l'env (préexistant, CI lint
      en continue-on-error)
- [x] Suites jest ciblées : résultats identiques à main (suites rouges préexistantes hors
      périmètre) + 2 suites stores vertes (35 tests dont 8 nouveaux)
- [ ] Commit + push `claude/inspiring-euler-q45kkg`, PR vers `main`, CI verte, merge

## Hors périmètre (consigné dans l'analyse)
- F2 : flip `SOCKET_LANG_FILTER` (validation staging)
- F4 : pollings admin → events Socket.IO (events gateway à créer)
- F7/F8 : gateway (dénormalisation Notification, trim participant détail)
- F9 : extraction indicateur de présence en composant feuille (décroissance à valider)

## Continuité
Iter 35+ : F7/F8 gateway (le plus actionnable), F9 web, F4 quand les events gateway existent,
F2 quand la mesure staging est disponible.

## Statut (mis à jour en fin d'itération)
- [x] Phase 1 — selector hooks stores + tests
- [x] Phase 2 — migration des 9 call sites
- [x] Phase 3 — recharts différé (ranking + analytics + tracked-links)
- [ ] Phase 4 — CI verte, mergé dans main
