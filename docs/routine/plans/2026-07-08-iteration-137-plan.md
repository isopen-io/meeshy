# Iteration 137 — Plan d'implémentation (F101)

## Objectives
Aligner `clicksByHour` sur UTC (`getUTCHours()`) dans `TrackingLinkService.getTrackingLinkStats` pour
qu'il partage le même référentiel temporel que `clicksByDate` (UTC via `toISOString()`).

## Affected modules
- `services/gateway/src/services/TrackingLinkService.ts` — 1 ligne (bucket horaire) + commentaire.
- `services/gateway/src/__tests__/unit/services/TrackingLinkService.clicksByHourUtc.test.ts` — nouveau
  test de régression forçant `TZ=Asia/Tokyo`.

## Implementation phases
1. **RED** : écrire le test dédié forçant `TZ=Asia/Tokyo` ; prouver l'échec avec `getHours()`.
2. **GREEN** : `getHours()` → `getUTCHours()` ; commentaire « Par heure (0-23, UTC) ».
3. **REFACTOR** : aucun — changement minimal, pas d'opportunité additionnelle.
4. Suite complète `TrackingLinkService` verte + suite gateway ciblée.

## Dependencies
Aucune. Fonction pure d'agrégation, sans I/O au-delà du `findMany` déjà mocké.

## Estimated risks
Quasi-nul. Sous `TZ=UTC` (prod + CI) les valeurs de `clicksByHour` sont inchangées.

## Rollback strategy
Revert du commit unique. Aucune migration, aucun état persistant modifié.

## Validation criteria
- Nouveau test RED→GREEN vert.
- `TrackingLinkService.test.ts` (suite existante) vert.
- Aucun changement de forme de réponse.

## Completion status
- [x] RED test écrit (échec prouvé sous TZ=UTC via date-double local≠UTC)
- [x] GREEN (fix appliqué : `getHours()` → `getUTCHours()`)
- [x] Suite verte (TrackingLinkService 73/73 + routes tracking-links 77/77)
- [ ] Commit + push + merge

## Progress tracking
Itération 137 en cours.

## Future improvements
Voir backlog F100 / F97 / F98 / F90 dans l'analyse 137.
