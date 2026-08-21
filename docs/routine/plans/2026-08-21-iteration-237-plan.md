# Iteration 237 — Plan : aligner `chunk()` sur son contrat « tranche unique pour size < 1 »

## Objectifs
Faire honorer à `chunk<T>(items, size)` (`packages/shared/utils/concurrency.ts`) le contrat énoncé
par son propre docstring — « `size` non finie **ou < 1** produit une tranche unique » — actuellement
respecté seulement pour le chemin non fini. Épingler le contrat par un test de structure, non de
`.flat()`.

## Modules affectés
- `packages/shared/utils/concurrency.ts` — garde du calcul de `step` (1 ligne).
- `packages/shared/__tests__/utils/concurrency.test.ts` — bloc `it.each` de la taille absurde
  réécrit pour asserter la structure et couvrir `0.5` + `Infinity`.

## Phases

### Phase 1 — RED
Réécrire `it.each([0, -1, Number.NaN])` → `it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])`
assertant `chunk([1,2,3], size)` `toEqual([[1, 2, 3]])`. Preuve RED : 3 échecs (`0`, `-1`, `0.5`
rendent `[[1],[2],[3]]`), 2 passages (`NaN`, `Infinity` déjà tranche unique).

### Phase 2 — GREEN
```ts
const step = Number.isFinite(size) && size >= 1 ? Math.floor(size) : items.length;
```
Docstring in-line citant le drift corrigé et la sémantique « size absurde ⇒ ne pas découper ».

### Phase 3 — Validation
- `bunx vitest run __tests__/utils/concurrency.test.ts` → 23/23.
- `bunx vitest run` (packages/shared) → 96 fichiers / 2330 tests.
- `bunx tsc --noEmit` (shared) → 0 ; `bun run build` (shared) → OK.
- `bunx tsc --noEmit` (gateway) → 0.
- Audit appelants (`useAttachmentUpload.ts`, `MessageProcessor.ts`).

## Dépendances
Aucune. La signature et le type de retour de `chunk` sont inchangés.

## Estimated risks
- **Faible.** Comportement identique pour `size >= 1` et pour `size` non fini ; seul le finite-`< 1`
  change, de singletons vers tranche unique — le contrat documenté. Aucun appelant de production ne
  passe `size < 1`.
- **Rollback :** retirer `&& size >= 1` et restaurer l'assertion `.flat()`.

## Validation criteria
- [x] RED prouvé (3 fails structure sur `0`/`-1`/`0.5`).
- [x] GREEN `concurrency.test.ts` 23/23.
- [x] Suite shared complète 2330/2330.
- [x] `tsc` shared + gateway : 0 erreur ; build shared OK.
- [x] Appelants audités inchangés.

## Completion status
- [x] RED écrit et prouvé.
- [x] GREEN posé.
- [x] Validations locales exécutées.
- [x] Commit `fe4d665e` + push `claude/brave-archimedes-oj0vgv` + PR #3253 (souscrite).

## Progress tracking
- Constat issu d'une passe de survey des utilitaires purs `packages/shared/utils/` hors des 8
  domaines de PR en vol.

## Future improvements
- Envisager un garde de lint/type interdisant un `size` non-`number`-entier-positif à la frontière
  de `chunk` si un futur appelant calcule des bornes dynamiques (hors périmètre de cette itération).
