# Plan itération 63w (web) — épuration `components/settings/_archived/`

**Base** : `main` HEAD post-merge #847 (iter-62wb, commit `4172b8f`).
**Branche** : `claude/practical-fermat-5f6moi`.
**Type** : épuration code mort (orthogonal à la vague i18n `t()||fallback` #843/#849).

## Objectif

Supprimer le code mort `components/settings/_archived/` (jamais rendu en prod,
tests déjà ignorés par jest) afin de **résoudre à la racine** le faux-positif
récurrent `font-selector` (carry-over 59w) et de respecter la consigne
« logique d'épuration ».

## Changements (5 fichiers)

1. ✅ `rm components/settings/_archived/complete-user-settings.tsx`
2. ✅ `rm components/settings/_archived/settings-layout.tsx`
3. ✅ `rm __tests__/components/settings/_archived/complete-user-settings.test.tsx` (test déjà ignoré)
4. ✅ `rm __tests__/components/settings/_archived/settings-layout.test.tsx` (test déjà ignoré)
5. ✅ `jest.config.js` : retrait du pattern `'/_archived/'` (désormais mort)
6. ✅ `app/settings/README.md` : section Migration Notes mise à jour (plus de `_archived/`)

## Vérification

- ✅ Sweep `grep -rn _archived` → seul reste la note explicative du README.
- ✅ Aucun import prod/test réel des symboles archivés (barrels propres).
- ✅ Suppression **CI-neutre** (tests étaient ignorés) et **coverage-positive**
  (composants 0 %-couverts retirés du dénominateur).
- ⏳ CI verte avant merge (gate dur).

## Suivi (carry-over mis à jour)

- **NOUVEAU (63w)** : `components/settings/font-selector.tsx` est désormais
  **fully orphaned** (plus aucun consommateur après suppression de `_archived/` ;
  subsistent : réexports `components/index.ts` + `components/settings/index.ts`,
  et son test `__tests__/components/settings/font-selector.test.tsx`). Candidat
  épuration **complète** en 64w+ : supprimer le composant + son test + les 2
  réexports barrel. Bornée, orthogonale à l'i18n. NE PLUS i18n font-selector
  (orphelin, supprimer plutôt).
- `_archived/` n'existe plus → NE PLUS le re-flagger ni comme candidat épuration.

## Numérotation

`62w` (#843) et `62wb` (#847, mergée) existent ; cette passe = **63w** pour éviter
toute collision avec la vague i18n en vol.
