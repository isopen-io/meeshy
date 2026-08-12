# Plan — Itération 65w (web) — Épuration composants police orphelins

## Objectif
Supprimer le cluster de composants de police orphelins (dead code) hérité de la
suppression de `settings/_archived/` (63w). Surface **non-i18n orthogonale** à la
forte contention `t()||fallback` en vol.

## Étapes
1. [x] Vérifier l'orphelinat repo-wide de `FontSelector` et `FontPreview` (grep tous types de fichiers).
2. [x] Confirmer que `lib/fonts.ts` reste live (`app/layout.tsx`) → NE PAS supprimer.
3. [x] `git rm components/settings/font-selector.tsx`
4. [x] `git rm components/settings/font-preview.tsx`
5. [x] `git rm __tests__/components/settings/font-selector.test.tsx`
6. [x] Retirer `export { FontSelector } from './font-selector';` de `components/settings/index.ts`
7. [x] Retirer `FontSelector,` de l'agrégat `components/index.ts`
8. [x] Re-grep : 0 référence restante.
9. [x] Rédiger analyse `docs/analyses/uiux/2026-06-22-iteration-65w.md`
10. [x] Mettre à jour `branch-tracking.md` (Current State + History + base).
11. [ ] Commit + push sur `claude/practical-fermat-x6oum1`.
12. [ ] Ouvrir PR, attendre CI verte.
13. [ ] Merger dans `main`, supprimer la branche.

## Risque
Très faible : suppression pure de code orphelin, zéro consommateur vérifié.
Seul signal manquant en local : typecheck complet (install workspace incomplet).
CI authoritative.

## Continuité (66w)
Candidat épuration suivant : `hooks/use-font-preference.ts` (orphelin post-65w,
testé unitairement) — confirmer puis supprimer hook + test + barrel `hooks/index.ts`.
NE PAS toucher `lib/fonts.ts` (live).
