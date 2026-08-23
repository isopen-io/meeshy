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
