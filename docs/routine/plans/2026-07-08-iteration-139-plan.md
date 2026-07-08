# Iteration 139 — Plan d'implémentation (F105)

## Objectives
Corriger `audio-effects.snapToScale` pour choisir la note de gamme la plus proche sur le **cercle des
hauteurs** (mod 12), en considérant le wrap d'octave (`scaleNote ± 12`).

## Affected modules
- `apps/web/utils/audio-effects.ts` — `snapToScale` (boucle interne) + `export` de `snapToScale`/`SCALES`.
- `apps/web/utils/__tests__/audio-effects.test.ts` — nouveau fichier de tests (5 cas).

## Implementation phases
1. **RED** : tests `snapToScale(71, SCALES.pentatonic) === 72` (+ transpose) → échec (`69` / `71`).
2. **GREEN** : tester candidats `scaleNote - 12 | scaleNote | scaleNote + 12`, minimiser la distance.
3. **REFACTOR** : aucun.
4. Suite `audio-effects` verte + non-régression.

## Dependencies
Aucune. `tone` et `pitchy` déjà mockés dans `apps/web/__mocks__`.

## Estimated risks
Faible. Le fix ne modifie que les cas où un candidat wrappé est strictement plus proche (les cas
aujourd'hui faux) ; notes in-scale et chromatique inchangées.

## Rollback strategy
Revert du commit unique.

## Validation criteria
- RED→GREEN vert (5/5).
- Non-régression : in-scale note inchangée, chromatique no-op, snap in-octave sans wrap, transpose.

## Completion status
- [x] RED test écrit (échec `69`/`71` prouvé)
- [x] GREEN (candidats wrappés ±12)
- [x] Suite verte (5/5)
- [ ] Commit + push + PR + merge

## Progress tracking
Itération 139 en cours.

## Future improvements
Backlog F106 (getUserStatus semantics), F107 (daily-timeline off-by-one/TZ), F102, F100, F98, F90.
