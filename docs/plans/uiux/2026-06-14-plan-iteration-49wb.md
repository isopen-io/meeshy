# Plan — Iteration 49wb (2026-06-14)

> Renommée `49wb` suite à une collision de numérotation avec une itération `49w` parallèle
> (appel vidéo, déjà mergée). Périmètres disjoints — voir l'analyse `49wb`.

Base : `main` HEAD post-merge iter-48i, re-synchronisée sur `main` (incl. 49w appel-vidéo).
Branche : `claude/focused-brown-uxa19f`. Périmètre : **web only**, surface admin Ranking (i18n).

## Objectifs
1. Réparer le préfixe i18n cassé `admin.ranking.*` → `ranking.*` (clés brutes affichées).
2. Internationaliser les 33 labels `RANKING_CRITERIA` (champ `label` FR dur supprimé).
3. Internationaliser les chaînes FR dures adjacentes de `LinkRankCard`.
4. Réanimer le fichier de test ranking (mort) pour valider les corrections.

## Étapes réalisées

### i18n locales (×4 : en/fr/es/pt, `locales/{loc}/admin.json`)
- [x] Bloc `ranking.criteria.*` (33 clés) — fr = libellés d'origine préservés ; en/es/pt traduits.
- [x] Clés `ranking.linkTrackedBadge`, `linkShareBadge`, `conversationPrefix`,
      `unitVisits`, `unitUnique`, `unitUses`, `unitMax`.
- [x] Parité vérifiée : 1738 clés/locale, 0 manquante/excédentaire.

### Composants (`components/admin/ranking/`)
- [x] `constants.ts` : champ `label` supprimé de chaque critère (icône+value conservés) ;
      export helper `criterionLabelKey(value) = ranking.criteria.${value}`.
- [x] `UserRankCard` / `ConversationRankCard` / `MessageRankCard` : `useI18n('admin')` +
      `t(criterionLabelKey(criterion))`.
- [x] `LinkRankCard` : `useI18n` + label critère i18n + 7 chaînes FR → `t('ranking.*')`.
- [x] `RankingFilters` : 13 appels `admin.ranking.*` → `ranking.*` ; `criteriaList` mappe
      vers `{...c, label: t(criterionLabelKey(c.value))}` (recherche + affichage sur libellé traduit).
- [x] `RankingStatsImpl` : `currentCriterion?.label` → `criterionLabel = t(criterionLabelKey(criterion))`
      (formatters tooltip top10 + évolution) ; import `RANKING_CRITERIA` mort retiré.

### Test (`components/admin/ranking/__tests__/RankingComponents.test.tsx`)
- [x] `import { adminService }` remonté en tête (était DANS un `it()` = Syntax Error).
- [x] Mock `@/hooks/useI18n` adossé à `locales/fr/admin.json` (coupe la chaîne encryption +
      rend les libellés fr attendus).
- [x] `formatCount(..., 'fr-FR')` explicite + assertions séparateur locale-agnostiques.
- [x] **30/30 verts**.

## Vérifications
- [x] Simulation node du loader `useI18n` : 100 % des clés ranking résolvent sur les 4 locales.
- [x] `tsc --noEmit` : 0 erreur sur les fichiers `admin/ranking/*` modifiés.
- [x] `jest RankingComponents.test.tsx` : 30/30.
- [x] Aucune occurrence `admin.ranking.` résiduelle dans `components/`/`app/`.

## Fichiers touchés
- `apps/web/components/admin/ranking/{constants,UserRankCard,ConversationRankCard,MessageRankCard,LinkRankCard,RankingFilters,RankingStatsImpl}.tsx` (+ `__tests__/RankingComponents.test.tsx`)
- `apps/web/locales/{en,fr,es,pt}/admin.json`
- `docs/analyses/uiux/2026-06-14-iteration-49wb.md`, `docs/plans/uiux/2026-06-14-plan-iteration-49wb.md`, `docs/plans/uiux/branch-tracking.md`

## ✅ Status : implémenté, testé, prêt à merger dans `main`.
