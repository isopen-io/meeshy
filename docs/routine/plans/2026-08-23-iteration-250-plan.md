# Plan — Itération 250 : retirer `_findUsersForLanguage` (code mort)

## Objectives

Clore le suivi #1 de l'audit langue (nommé par 249) en RETIRANT
`_findUsersForLanguage`, un orphelin non câblé, plutôt qu'en canonicalisant sa
comparaison brute — le chemin vivant (`groupSocketsByLanguage`) étant déjà routé
par la SSOT.

## Affected modules

- `services/gateway/src/socketio/MeeshySocketIOManager.ts` — retrait de la méthode.
- `services/gateway/src/socketio/__tests__/MeeshySocketIOManager.test.ts` —
  retrait du `describe('_findUsersForLanguage')` (3 tests).
- Docs : analyse + ce plan.

## Implementation phases

1. **Preuve du code mort** — `git grep findUsersForLanguage` : seule la
   définition + les tests référencent le symbole ; aucun `this._findUsersForLanguage(`.
   ✅ fait.
2. **Preuve du chemin vivant normalisé** — `groupSocketsByLanguage` +
   `normalizeGroupLanguage` (`message-payload-filter.ts`) canonicalisent déjà
   destinataire + origine. ✅ fait.
3. **Retrait** de la méthode + des 3 tests. ✅ fait.
4. **Validation** — `tsc`, suite du manager, couverture complète.

## Dependencies

Aucune. Additif négatif (suppression pure).

## Estimated risks

Très faible : suppression de code jamais exécuté + témoins-décoration. Le type
`SocketUser` reste utilisé (import conservé).

## Rollback strategy

`git revert` du commit unique restaure méthode + tests. Aucun état persistant,
aucune migration.

## Validation criteria

- [x] `tsc --noEmit` gateway exit 0.
- [x] `MeeshySocketIOManager.test.ts` 385/385.
- [x] `bun run test:coverage` verte (835 suites, 19246 tests, exit 0), seuils 87/80/86/83 tenus.
- [x] Chemin vivant (`message-payload-filter`) inchangé.

## Completion status

Implémenté et validé : tsc exit 0, suite manager 385/385, couverture complète
835 suites / 19246 tests verte (exit 0), seuils tenus.

## Progress tracking

- Analyse : `docs/routine/analyses/2026-08-23-iteration-250-analyse.md`.
- Suivis restants de l'audit langue : web (lot dédié), backfill base.

## Future improvements

Règle de méthode ajoutée à l'audit : vérifier l'existence d'un appelant AVANT de
canonicaliser un site de comparaison. Un défaut de forme sur du code mort se
résout par suppression.
