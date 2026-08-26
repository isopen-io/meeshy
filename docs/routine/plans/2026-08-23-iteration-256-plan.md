# Plan — Itération 256 : brique SSOT `isMsRangeStrictlyOrdered` (régime strict de `time-range`)

## Objectifs

Donner au régime STRICT `endMs > startMs` la même brique unique que le régime
`>=` (`isMsRangeOrdered`, itération 238), et rebrancher ses trois consommateurs
triplés dessus — sans changer aucun comportement.

## Modules affectés

- `packages/shared/utils/time-range.ts` (+1 export, docstring des deux régimes)
- `packages/shared/__tests__/utils/time-range.test.ts` (+4 tests)
- `services/gateway/src/validation/messages-schemas.ts` (refine → brique)
- `services/gateway/src/utils/playback-trace.ts` (`isUsable` → brique)
- `services/gateway/src/utils/playback-segments.ts` (`isUsable` → brique)

## Phases d'implémentation

1. **RED** — 4 tests `isMsRangeStrictlyOrdered` (ordonné, durée nulle refusée,
   inversé, contraste avec `isMsRangeOrdered`). ✅
2. **GREEN** — `isMsRangeStrictlyOrdered` + docstring. Rebuild `packages/shared`
   (le gateway importe depuis `dist`). ✅
3. **Rebranchement** — les trois sites gateway consomment la brique ; commentaires
   alignés, message de wire `STRETCH_END_MUST_EXCEED_START` préservé. ✅
4. **Validation** — tsc gateway + suites ciblées + régression élargie + suite
   shared complète. ✅

## Dépendances

`packages/shared` doit être rebuild avant les tests/tsc gateway (import
`@meeshy/shared/utils/time-range` résolu via `dist`, comme `call-schemas.ts`).

## Risques estimés

Négligeable : prédicat identique aux trois expressions remplacées ; ajout shared
purement additif. Voir `docs/routine/analyses/2026-08-23-iteration-256-analyse.md`
§ Risk assessment.

## Stratégie de rollback

Retirer l'export + les 4 tests, réinliner `endMs > startMs` aux trois sites.
Revert atomique (un seul commit).

## Critères de validation

Voir l'analyse § Validation criteria. Résumé : shared 2553/2553, gateway
390/390 sur la régression élargie, tsc gateway exit 0.

## Statut de complétion

**Complet.** Toutes les phases exécutées et validées localement. Reste : CI verte
sur la PR.

## Suivi de progression

- [x] RED prouvé
- [x] GREEN + rebuild shared
- [x] 3 consommateurs rebranchés
- [x] Validation locale complète
- [ ] Push + CI

## Améliorations futures

Voir l'analyse § Améliorations futures (parité client du régime strict ; CanvasV3
sous d'autres noms de champ).
# Plan — Itération 256 : retrait d'`AuthTestService` + `authenticate()` legacy

## Objectives
Retirer le chemin d'authentification mort (faux backend à identifiants codés en
dur + jeton base64 non signé) et son unique appelant `@deprecated`.

## Affected modules
- `services/gateway/src/services/AuthTestService.ts` → **supprimé**
- `services/gateway/src/__tests__/unit/services/AuthTestService.test.ts` → **supprimé**
- `services/gateway/src/middleware/auth.ts` → retrait de `authenticate()` legacy
- `services/gateway/src/__tests__/unit/middleware/auth-extended.test.ts` →
  retrait mock AuthTestService + import `authenticate` + 3 `describe`

## Implementation phases
1. `git rm` des deux fichiers `AuthTestService*`.
2. Retirer la fonction `authenticate()` (`auth.ts:630-678`), conserver le
   marqueur `LEGACY COMPATIBILITY` (couvre `requireRole`/`requireEmailVerification`).
3. Dans `auth-extended.test.ts` : retirer `mockAuthServiceVerify`/`GetUser`,
   `jest.mock('../../../services/AuthTestService')`, l'import `authenticate`,
   l'en-tête de doc, et les trois `describe` (`authenticate (legacy)`,
   `authenticate legacy — development mode`, `… with valid user returned`).
4. `tsc --noEmit` + `test:coverage`.

## Dependencies
Prérequis CI parity : `bun install --ignore-scripts`, `prisma generate`,
`packages/shared build`.

## Estimated risks
Très faibles — code mort. Risque résiduel : un test conservé référençant un
symbole retiré → capté par `tsc`.

## Rollback strategy
`git revert` du commit (suppression pure, aucune migration de données).

## Validation criteria
- `tsc --noEmit` exit 0.
- Suite gateway verte, seuils tenus.
- `grep` : plus aucune référence de code à `AuthTestService` ni à l'import
  `authenticate` de `middleware/auth`.

## Completion status
- [x] Fichiers supprimés (`AuthTestService.ts` + son test)
- [x] `authenticate()` retirée de `middleware/auth.ts`
- [x] Tests nettoyés (mock + import + 3 `describe` retirés)
- [x] `tsc --noEmit` gateway exit 0
- [x] Suites auth vertes (65/65)
- [ ] `test:coverage` complète verte (en cours)
- [ ] Merge main

## Future improvements
Poursuivre le balayage des services gateway importés uniquement par leur test.
