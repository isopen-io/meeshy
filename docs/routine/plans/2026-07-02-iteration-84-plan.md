# Iteration 84 — Plan d'implémentation (2026-07-02)

## Objectifs
Fermer **F47** — le TOCTOU résiduel du cap `maxUses` du token d'affiliation
(`AffiliateTrackingService.convertAffiliateVisit`). Dernier résidu « intégrité de compteur/cap »
de la famille lost-update (iter 79→83).

## Modules affectés
- `services/gateway/src/services/AffiliateTrackingService.ts` (méthode `convertAffiliateVisit`).
- `services/gateway/src/__tests__/unit/services/AffiliateTrackingService.test.ts` (mock + 3 tests).

## Phases
1. **Réservation atomique** — remplacer « create relation → increment inconditionnel » par
   « réserver la place (updateMany conditionnel pour cappé / update pour illimité) → create
   relation ». Rejet `count === 0` avant toute création. ✅
2. **Tests** — mock `updateMany` ({count:1} par défaut) + 3 régressions :
   réservation cappée, rejet race-loser, chemin illimité. ✅
3. **Validation** — suites affiliate + `tsc`. ⏳

## Dépendances
Aucune. Changement localisé à un service + sa suite.

## Risques estimés
FAIBLE. Écriture conditionnelle atomique, comportement inchangé hors concurrence. Slot fantôme
sur erreur `create` (chemin DB rare) assumé — moins nuisible qu'un dépassement de cap.

## Stratégie de rollback
`git revert` du commit unique. Aucune migration, aucun changement de schéma.

## Critères de validation
- `AffiliateTrackingService.test.ts` vert (dont 3 tests neufs).
- `routes/affiliate.test.ts` + `devices-affiliate.test.ts` verts.
- `tsc --noEmit` : 0 erreur nouvelle.

## Statut de complétion
- [x] Phase 1 — réservation atomique
- [x] Phase 2 — tests
- [x] Phase 3 — validation locale (AffiliateTrackingService 35/35, affiliate routes + devices-affiliate 25/25, tsc 0 nouvelle erreur)
- [x] Commit + push

## Améliorations futures
- F49 (ConversationStats cache, TTL-guéri, basse sévérité).
- F50 (agrégats JSON stats en RMW, `recompute()`-corrigé, modèle relationnel requis).
