# Iteration 237 — Plan : frontière gauche du SSOT pour `removingHandle`

## Objectives
Fermer le drift entre la DÉTECTION de mention (`mention-parser.ts`, qui exporte
`NAME_BOUNDARY_LEFT`) et la SUPPRESSION de mention (`composer-references.removingHandle`, qui ne
l'appliquait pas), pour qu'un `@handle` collé à un e-mail (`bob@alice`) ne soit plus retiré du
texte du composeur.

## Affected modules
- `packages/shared/utils/composer-references.ts` — import + application de `NAME_BOUNDARY_LEFT`.
- `packages/shared/__tests__/utils/composer-references.test.ts` — +2 tests de régression.
- `packages/MeeshySDK/Sources/MeeshyUI/Story/ComposerMentionQuery.swift` — miroir Swift.

## Implementation phases
1. **RED** — ajouter les tests `bob@alice` préservé + frontière propre toujours retirée
   (échouent sur le code actuel car le fragment e-mail était amputé).
2. **GREEN** — importer `NAME_BOUNDARY_LEFT`, insérer le lookbehind à hauteur du `@`.
3. **Miroir** — répliquer le lookbehind dans le Swift.
4. **Validate** — vitest ciblé + suites mention + `tsc` + build.

## Dependencies
Aucune nouvelle dépendance externe. Import interne au package `@meeshy/shared`
(`composer-references` → `mention-parser`) ; pas de cycle (`mention-parser` n'importe pas
`composer-references`).

## Estimated risks
Très faible. Seul le NON-retrait d'un handle collé à un caractère de nom change — cas déjà
traité comme non-mention par la détection. 9 tests existants préservés.

## Rollback strategy
Revert du commit unique. Aucune migration de données, aucun changement de schéma/contrat de
wire, aucun état persisté touché.

## Validation criteria
- `composer-references.test.ts` : 11/11 verts.
- `mention-parser.test.ts` + `mention-extract.test.ts` : 69/69 (non régressés).
- `tsc --noEmit --project tsconfig.json` : 0 erreur.
- Build `dist/` : OK.

## Completion status
- [x] Tests RED ajoutés
- [x] Frontière gauche appliquée (TS)
- [x] Miroir Swift
- [x] Analyse + plan écrits
- [x] Validation locale verte
- [ ] Commit + push branche
- [ ] Revue Codex

## Progress tracking
Itération autonome 237. Commit de départ `6b3fc59e`. Une seule unité de changement, cohérente,
testée.

## Future improvements
Voir la section « Améliorations futures » de l'analyse : audit des autres consommateurs de
`@handle` iOS, et brique partagée `mentionSpanPattern(handle)` pour rendre le drift
structurellement impossible.
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
