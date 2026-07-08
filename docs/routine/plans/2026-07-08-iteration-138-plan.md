# Iteration 138 — Plan d'implémentation (F103)

## Objectives
Corriger le rollover Ko→Mo de `NotificationService.formatFileSize` : comparer la valeur **arrondie** au
seuil de tier (comme `formatCallDataSize`), pour ne jamais afficher `"1024 Ko"`.

## Affected modules
- `services/gateway/src/services/notifications/NotificationService.ts` — `formatFileSize` (2 lignes).
- `services/gateway/src/__tests__/unit/services/NotificationService.i18n.test.ts` — 2 tests de régression.

## Implementation phases
1. **RED** : test `formatSingleAttachmentLabelI18n('fr', { type: 'audio', fileSize: 1_048_500 })` attend
   `1.0 Mo` et rejette `1024 Ko` → échec prouvé.
2. **GREEN** : bascule du tier sur `Math.round(bytes / 1024)`.
3. **REFACTOR** : aucun (mirroir exact du contrat sibling).
4. Suite notifications complète verte (346 tests).

## Dependencies
Aucune. Fonction pure.

## Estimated risks
Quasi-nul. Valeurs déjà correctes inchangées ; seule la fenêtre `[1_048_064, 1_048_575]` bascule vers la
sortie correcte.

## Rollback strategy
Revert du commit unique.

## Validation criteria
- Nouveau test RED→GREEN vert.
- Non-régression tier Ko (`500_000 → "488 Ko"`) et tier Mo (`15_000_000 → "14.3 Mo"`).
- Suite `unit/services/notifications` + `NotificationService*` : 346/346 verte.

## Completion status
- [x] RED test écrit (échec `"1024 Ko"` prouvé)
- [x] GREEN (fix appliqué : tier sur valeur arrondie)
- [x] Suite verte (346/346)
- [ ] Commit + push + PR + merge

## Progress tracking
Itération 138 en cours.

## Future improvements
Backlog F102 (shared attachment.ts formatFileSize), F104 (tier Go), F100, F98, F90 — voir analyse 138.
