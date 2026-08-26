# Iteration 237 — Plan : borner le clamp d'index et garder les entrées hors domaine de `formatFileSize`

## Objectifs
Faire de `formatFileSize` (`packages/shared/types/attachment.ts`) une SSOT
réellement totale sur son domaine : aucune entrée `number` ne doit produire le
littéral `undefined`/`NaN`. Aligner son contrat de robustesse sur le formatteur
jumeau `formatClock` (entrées négatives / non finies ramenées à zéro).

## Affected modules
- `packages/shared/types/attachment.ts` — fonction `formatFileSize` (logique).
- `packages/shared/__tests__/types/attachment.test.ts` — 2 nouveaux cas de test.

Aucun autre fichier. Les 30+ appelants web/gateway sont inchangés (sorties
identiques pour toute entrée entière ≥ 1 et pour 0).

## Implementation phases
1. **RED** — ajouter deux `it(...)` dans le `describe('formatFileSize')` :
   - sous-octet positif (`0.5 → '0.5 B'`, `0.001 → '0 B'`) ;
   - négatif / non fini (`-1`, `-1024`, `NaN`, `±Infinity` → `'0 B'`).
   Vérifier l'échec : `"512 undefined"` et `"NaN undefined"`.
2. **GREEN** — dans `formatFileSize` :
   - remplacer `if (bytes === 0)` par `if (!Number.isFinite(bytes) || bytes <= 0)` ;
   - remplacer `Math.min(i, len-1)` par `Math.min(Math.max(i, 0), len-1)`.
3. **REFACTOR** — commenter les deux gardes (pourquoi bas-clamp, pourquoi garde
   non-fini) en pointant le précédent maison `formatClock`.

## Dependencies
Aucune. Changement autonome dans `packages/shared`. Rebuild `dist/` requis (les
appelants importent depuis `@meeshy/shared/types/attachment`).

## Estimated risks
Très faibles. Pas de changement de signature ; parité stricte sur les 13
assertions existantes et sur les 30+ sites d'appel. Seul comportement changé :
des entrées aujourd'hui non produites par aucun appelant.

## Rollback strategy
`git revert` du commit unique. Aucune migration, aucun état persistant, aucun
contrat réseau touché.

## Validation criteria
- [x] RED reproduit (`"512 undefined"`, `"NaN undefined"`).
- [x] GREEN : nouveaux cas verts.
- [x] `packages/shared` suite complète verte (98 fichiers / 2360 tests).
- [x] `bun run build` (tsc) vert, `dist/` régénéré.
- [x] `vitest run --coverage` exit 0, tous les seuils tenus.

## Completion status
**COMPLETE** — RED→GREEN vérifié, suite complète + coverage verts, dist rebuild.

## Progress tracking
- Analyse : `docs/routine/analyses/2026-08-21-iteration-237-analyse.md`.
- Commit unique sur `claude/brave-archimedes-1wk6ow`, PR à ouvrir vers `main`.

## Future improvements
Voir la section « Améliorations futures » de l'analyse : `formatFileSizeI18n`
(divergence délibérée, ne pas toucher), `playbackStretch` Zod (sans impact +
liste d'évitement), et les candidats reportés des itérations 233→236.
