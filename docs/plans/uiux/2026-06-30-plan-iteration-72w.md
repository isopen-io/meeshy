# Plan — Itération 72w (a11y clavier `details-sidebar`)

**Base** : `main` HEAD `23837bf` (post-#1084 / 69w) — branche `claude/practical-fermat-auiwtk`

## Objectif
Rendre opérables au clavier les affordances « cliquer pour éditer » du cluster
`components/conversations/details-sidebar/*` (WCAG 2.1.1 / 4.1.2), surface
orthogonale aux PR web en vol.

## Étapes
1. [x] Audit du cluster `details-sidebar/` (`onClick` sans `onKeyDown`/role/focus).
2. [x] `DetailsHeader` : avatar éditable → `<button>` natif nommé + focus ring.
3. [x] `CustomizationManager` : cartes nom perso + réaction → `role=button` clavier.
4. [x] `DescriptionSection` : bouton d'édition `focus-visible:opacity-100`.
5. [x] i18n : `changeImage` / `editCustomName` / `editReaction` ×4 locales.
6. [x] Tests : `details-sidebar-a11y.test.tsx` (8 cas) + voisins verts.
7. [x] Docs analyse + plan + annotation « complété ».
8. [ ] Commit + push + CI vert.
9. [ ] Merge dans `main`, MAJ `branch-tracking.md`, suppression de branche.

## Gates CI
- Suite jest `__tests__/components/conversations/details-sidebar-a11y` + voisins.
- `Quality (bun)`. ESLint local KO (mismatch env, non bloquant — gate CI épingle).
- ⚠️ `Test Python (translator)` peut flaker (diff sans `.py`) — non bloquant.

## Risques
- Faible. Ajout pur de chemins clavier + visibilité focus ; aucun changement de
  comportement souris. `<button>` enveloppant `<Avatar>`/`<span>` = HTML valide
  (descendants non interactifs).
