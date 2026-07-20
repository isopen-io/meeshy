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
# Plan Iteration 184 — Aligner `CommonSchemas.language` : borne longueur `.max(5)` → `.max(6)` (fin du fix partiel 639-3 régionalisé)

## Objectifs
Rendre le contrat de `CommonSchemas.language` **cohérent** : la borne de longueur
maximale doit refléter la longueur réelle acceptée par sa regex
(`[a-z]{2,3}(-[A-Z]{2})?` = jusqu'à 6 caractères), afin que la forme
`code-639-3 + sous-tag région` (`bas-CM`, `ewo-CM`, `ksf-CM`) — matchée par la
regex mais rejetée par `.max(5)` — cesse de recevoir un 400 VALIDATION sur
`sendMessage`/`editMessage`. Termine le fix partiel qui avait relâché le corps
`{2}`→`{2,3}` sans rehausser la borne.

## Modules affectés
- `packages/shared/utils/validation.ts:91` (borne `.max(5)` → `.max(6)`, +
  commentaire liant la borne à la regex).
- `packages/shared/__tests__/validation.test.ts` (+1 test combinaison 639-3 +
  région).

## Phases d'implémentation
1. **RED** — ajouter dans le bloc `describe('language')` un test affirmant que
   `bas-CM`, `ewo-CM`, `ksf-CM` (corps 639-3 3-lettres + région BCP-47) sont
   acceptés (`success: true`). Échoue sur `.max(5)` actuel (`too_big`).
2. **GREEN** — `validation.ts:91` : `.max(5)` → `.max(6)`. Ajouter un commentaire
   court reliant la borne à la longueur max de la regex (`xxx-XX`) pour prévenir
   toute re-divergence future.
3. **VALIDATE** — `vitest run __tests__/validation.test.ts` : tous verts, dont le
   nouveau test ; vérifier qu'aucun test « rejects malformed codes » ne casse
   (regex inchangée → `EN`, `english`, `fr2` toujours rejetés).

## Dépendances
Aucune. `packages/shared` autonome, vitest installé (`bun install` OK).

## Risques estimés
Très faible : un caractère de production (`5`→`6`). La regex reste l'unique
gardien de la forme ; `.max(6)` ne laisse passer aucune chaîne que la regex ne
matchait déjà (max regex = 6). Aucune valeur préalablement acceptée ne change de
verdict ; aucune forme persistée modifiée. Site unique (`grep` confirmé).

## Stratégie de rollback
`git revert` du commit unique (2 fichiers). Aucun impact runtime au-delà du
rétablissement du rejet de `bas-CM`.

## Critères de validation
- `CommonSchemas.language.safeParse('bas-CM').success === true` (était `false`).
- `vitest run __tests__/validation.test.ts` intégralement vert.
- `fr`, `en`, `bas`, `en-US`, `fr-FR` toujours acceptés ; `EN`, `english`,
  `fr2`, `f` toujours rejetés (regex inchangée).

## Statut de complétion
- [x] Phase 1 — test RED (combinaison 639-3 + région) — échec confirmé `too_big`
- [x] Phase 2 — GREEN (`.max(5)`→`.max(6)` + commentaire liant borne↔regex)
- [x] Phase 3 — validation vitest — **1369/1369 tests verts (46 suites)**, dont
      `validation.test.ts` 37/37. Vérif manuelle : `bas-CM`/`ewo-CM`/`ksf-CM`
      acceptés ; `EN`/`fr_FR`/`en-us`/`english`/`fr2`/`ab-CDE`/`abcd-EF` toujours
      rejetés (regex inchangée, zéro élargissement sémantique).

## Progress tracking
Démarré 2026-07-20 sur `claude/brave-archimedes-z7wvon` @ base `a0e5279`.

## Améliorations futures
Voir la section Backlog de l'analyse : `participantsFilters.limit` (clamp/NaN,
dead code — candidat corroboré par sweep Explore), casse/séparateur de
`CommonSchemas.language`, normalisation `originalLanguage`, sémantique `limit=0`.
