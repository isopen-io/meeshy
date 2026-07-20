# Plan — Iteration 184 : normaliser la casse des helpers d'affichage de langue web (parité SSOT)

## Objectives
Aligner `getLanguageDisplayName`, `getLanguageFlag`, `isSupportedLanguage`
(`apps/web/utils/language-utils.ts`) sur la normalisation `.toLowerCase().trim()`
de la SSOT `packages/shared/utils/languages.ts` (`getLanguageInfo`), pour qu'une
préférence de langue stockée non-lowercase (`'EN'`) affiche le drapeau et le nom
corrects au lieu du placeholder globe + code brut.

## Affected modules
- `apps/web/utils/language-utils.ts` (3 helpers)
- `apps/web/__tests__/utils/language-utils.test.ts` (tests RED)
- `docs/routine/{analyses,plans}/…-184-*.md`

## Implementation phases
1. **RED** — ajouter les cas casse-mixte/trim aux 3 blocs de tests (échouent).
2. **GREEN** — normaliser l'entrée en tête de chaque helper ; lookup + fallback
   sur le code normalisé.
3. **Validation** — `apps/web` jest `language-utils.test.ts` vert ; vérifier
   qu'aucune assertion existante ne régresse.

## Dependencies
Aucune (helpers purs, zéro dépendance runtime).

## Estimated risks
Très faible. Le seul changement observable est la correction du cas non-lowercase ;
lowercase, `'xyz'`, null/undefined inchangés.

## Rollback strategy
`git revert` du commit unique — helpers purs, aucun état.

## Validation criteria
- Suite `language-utils.test.ts` verte (40 → 40+N).
- Parité stricte avec `getLanguageInfo` shared sur casse + trim.

## Completion status
- [x] RED — 7 tests casse-mixte/trim ajoutés, échec confirmé sur la copie brute
- [x] GREEN — normalisation `.toLowerCase().trim()` sur les 3 helpers ; 47/47 verts
- [x] Validation — 13 suites consommatrices vertes (379 tests), zéro régression
- [ ] Commit + push + PR

## Progress tracking
Démarré @ `main` `62f338f`. Itération 184.

## Future improvements
Voir backlog de l'analyse 184 (link-identifier no-op, truncate surrogate split,
deep-link STATUS mapping).
