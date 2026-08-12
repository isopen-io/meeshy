# Iteration 168 — Plan d'implémentation (2026-07-11)

## Objectifs
Rendre `TranslationToggle` réactif à ses props (`translations`, `userLanguage`) tout en
préservant la sélection manuelle de l'utilisateur. Corriger F127 (Prisme non réactif).

## Modules affectés
- `apps/web/components/v2/TranslationToggle.tsx` (production)
- `apps/web/__tests__/components/v2/translation-toggle.test.tsx` (tests)

## Phases
1. **RED** — Ajouter 3 tests : (a) traduction arrivant après montage via re-render,
   (b) changement de `userLanguage` via re-render, (c) préservation de la sélection manuelle
   après un nouveau prop `translations`.
2. **GREEN** — Refactor : `autoResolved` en `useMemo`, `manualSelection` state
   (`{ languageCode, isOriginal } | null`), `displayedVersion` dérivé. `handleSelect` écrit
   `manualSelection`. Supprimer le `useState` paresseux figé.
3. **REFACTOR** — Vérifier `otherVersions` et les deux variantes (inline/block) restent corrects.

## Dépendances
Aucune. Composant de présentation isolé.

## Risques estimés
Faible. Risque principal = clobber la sélection manuelle → couvert par test (c).

## Rollback
Revert du commit unique. Aucune migration, aucun changement d'API.

## Critères de validation
- `bun x jest translation-toggle` : 7/7 verts.
- Typecheck web (`tsc --noEmit`) OK sur le fichier touché.
- Aucun changement de comportement des 4 tests existants.

## Statut
- [x] Analyse rédigée
- [x] RED (4 nouveaux tests ajoutés, échouaient sur le montage figé)
- [x] GREEN (`autoResolved`/`manualSelection`/`displayedVersion` dérivés — 8/8 verts)
- [x] Validation (translation-toggle 8/8, comment-components + post-card-enhanced 38/38, typecheck OK)
- [ ] Merge

## Améliorations futures
- `TranslationToggle` pourrait exposer un callback `onExplore` pour la télémétrie Prisme
  (combien d'utilisateurs explorent la VO). Hors périmètre de ce cycle.
