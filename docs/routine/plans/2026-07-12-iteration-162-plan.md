# Iteration 162 — Plan d'implémentation (2026-07-12)

## Objectif
Corriger `NotificationService.isDNDActive` (F131) : le filtre `dndDays` d'une
fenêtre DND nocturne doit être keyé sur le jour de **début** de la fenêtre, pas
sur le jour courant. Aligner sur la jumelle `PushNotificationService.isPushAllowed`.

## Modules affectés
- `services/gateway/src/services/notifications/NotificationService.ts` (~10 lignes).
- `services/gateway/src/__tests__/unit/services/NotificationService.uncovered-paths.test.ts`
  (+3 tests).

## Phases
1. **RED** — ajouter 3 tests (matin sélectionné → `true`, matin non-sélectionné →
   `false`, soir → `true`) qui échouent sur l'ancien ordre jour-avant-fenêtre. ✅
2. **GREEN** — réordonner : fenêtre d'abord, early-return hors-fenêtre, keying jour
   de début via `inMorningTail`. ✅
3. **REFACTOR** — n/a (le fix EST la convergence vers la jumelle).
4. **VALIDATION** — `NotificationService.uncovered-paths.test.ts` verte ; `tsc`
   sans nouvelle erreur.

## Dépendances
Aucune (fonction privée pure, mock Prisma déjà en place).

## Risques estimés
Très faibles. Parité stricte hors tranche-matin nocturne. Aucun changement de
contrat externe.

## Rollback
Revert du commit unique (2 fichiers).

## Critères de validation
Voir analyse iter 162.

## Statut
- [x] Analyse
- [x] Plan
- [x] RED (tests)
- [x] GREEN (fix)
- [ ] Validation (jest + tsc)
- [ ] Commit + push

## Améliorations futures (backlog)
- `utils/pagination.ts:51` `hasMore` off-by-one (probe `limit+1`).
- `routes/admin/messages.ts:262` `/trends` buckets en heure locale vs UTC.
- `MessageHandler.handleMessageDelete` n'ajuste aucune stat (blast radius plus large).
