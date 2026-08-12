# Plan d'implémentation — Iteration 200

## Objectifs
Converger les 4 réimplémentations locales restantes de la classification « temps
relatif » du dashboard agent sur le SSOT `classifyRelativeTime`, via un helper de
présentation i18n partagé, sans aucune régression visuelle.

## Modules affectés
- **Nouveau** : `apps/web/utils/relative-time-format.ts` — `formatPhrasedTimeAgo`,
  `formatCompactTimeAgo` (présentation ; classification déléguée au SSOT).
- **Nouveau** : `apps/web/__tests__/utils/relative-time-format.test.ts` — 13 tests.
- `apps/web/components/admin/agent/AgentOverviewTab.tsx` (phrasé, null → `never`).
- `apps/web/components/admin/agent/AgentConversationsTab.tsx` (phrasé, null → `'-'`).
- `apps/web/components/admin/agent/AgentMessagesModal.tsx` (phrasé, pas de null).
- `apps/web/components/admin/agent/ScanLogTable.tsx` (compact).
- `apps/web/components/admin/agent/AgentLiveTab.tsx` (compact ; remplace l'inline
  switch sur `classifyRelativeTime` par le helper partagé, null → `never`).

## Phases d'implémentation
1. **RED** — écrire `relative-time-format.test.ts` (phrasé + compact, bornes,
   débordement, futur). ✅
2. **GREEN** — créer `relative-time-format.ts` ; 13/13 verts. ✅
3. **Câblage** — remplacer le corps des 5 `formatTimeAgo` par un appel au helper,
   chaque wrapper conservant sa gestion du null. ✅
4. **VALIDATION** — suites agent + helper (159/159) ; `tsc` sans nouvelle erreur. ✅

## Dépendances
Aucune nouvelle dépendance. Réutilise `@meeshy/shared/utils/relative-time` (déjà
importé par `AgentLiveTab`) et les clés i18n existantes (`agent.overview.timeAgo.*`,
`timeAgo.*`).

## Risques estimés
Faible. Web-only, zéro API/schéma/i18n key. Comportement préservé par équivalence
arithmétique de l'échelle et conservation du style/null par site.

## Stratégie de rollback
Révert du commit unique — les 5 sites reviennent à leur helper local ; le SSOT et
les clés i18n sont inchangés.

## Critères de validation
- [x] `relative-time-format.test.ts` : 13/13.
- [x] Suites agent (`AgentOverviewTab`/`Conversations`/`MessagesModal`/`LiveTab`) +
      helper : 159/159.
- [x] `tsc` : 0 nouvelle erreur (11 pré-existantes dans des fixtures de test).
- [x] Aucun changement visuel (présentation par site inchangée).

## Statut de complétion
**Terminé.** Prêt à merger.

## Suivi de progression
- [x] Analyse rédigée (`docs/routine/analyses/2026-07-25-iteration-200-analyse.md`).
- [x] Helper + tests.
- [x] 5 sites recâblés.
- [x] Validation locale.
- [ ] Push + merge dans `main`.

## Améliorations futures
Voir la section « Future improvements » de l'analyse (unification des deux styles
d'affichage du dashboard, cibles #1/#3 du backlog 198, i18n de la surface v2).
