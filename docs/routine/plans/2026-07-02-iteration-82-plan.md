# Iteration 82 — Plan d'implémentation (2026-07-02)

## Objectifs
Corriger les 2 analogues NON encore corrigés de la classe « lost-update / out-of-order sur
curseurs & compteurs partagés du gateway » (continuité directe de `c0939a3f` et PR #1362) :
- **A** — compteur `currentUses` d'affiliation : increment atomique.
- **B** — curseur `lastMessageAt` au delete : garde de concurrence optimiste.

## Modules affectés
- `services/gateway/src/services/AffiliateTrackingService.ts` (prod, 1 ligne)
- `services/gateway/src/__tests__/unit/services/AffiliateTrackingService.test.ts` (1 assert + 1 test)
- `services/gateway/src/socketio/handlers/MessageHandler.ts` (prod, select + updateMany)
- `services/gateway/src/__tests__/unit/handlers/MessageHandler.core.test.ts` (helper + 2 tests + mocks)

## Phases (TDD)
1. **RED (A)** — assert existant `{ currentUses: 1 }` → `{ currentUses: { increment: 1 } }` +
   test de régression « increment atomique, jamais une valeur pré-calculée ». Échoue sur le code
   `+ 1`.
2. **GREEN (A)** — `currentUses: affiliateToken.currentUses + 1` → `currentUses: { increment: 1 }`.
3. **RED (B)** — helper `makeMessageForDelete` : ajouter `conversation.lastMessageAt`. Adapter le
   test existant pour asserter `conversation.updateMany` avec la garde optimiste + 1 test fallback
   (aucun message restant → `conversation.createdAt`, toujours gardé). Basculer les 6 mocks
   `conversation: { update }` → `{ updateMany }`. Échoue sur `conversation.update`.
4. **GREEN (B)** — `+ lastMessageAt: true` dans le select ; `conversation.update` →
   `conversation.updateMany({ where: { id, lastMessageAt: message.conversation.lastMessageAt }, data })`.
5. **VALIDATION** — suites `AffiliateTrackingService` + `MessageHandler.core` vertes, puis
   balayage `handlers/` + routes affiliate.

## Dépendances
Aucune. Indépendant des 3 PR ouvertes (#1360 iOS, #1361 android, #1362 gateway read-status —
fichier distinct : `MessageReadStatusService` vs `MessageHandler`/`AffiliateTrackingService`).

## Risques estimés
FAIBLE. (A) increment atomique = strictement plus correct. (B) concurrence optimiste standard,
sans hypothèse d'horloge, comportement préservé hors course. Aucune signature publique modifiée.

## Stratégie de rollback
`git revert` du commit unique. (A) revient au read-then-write ; (B) revient à l'`update`
inconditionnel — comportement fonctionnel identique hors concurrence.

## Critères de validation
- [x] `AffiliateTrackingService.test.ts` vert (assert increment + test régression).
- [x] `MessageHandler.core.test.ts` vert (test guardé + fallback).
- [x] Balayage `handlers/` + routes affiliate : 8 suites / 260 tests verts, 0 régression.
- [x] Compilation ts-jest OK (les fichiers modifiés compilent via la suite).

## Statut de complétion
✅ COMPLÉTÉ — 2 fixes prod + tests. 260 tests verts sur le périmètre affecté.

## Suivi de progression
- [x] Analyse iter 82
- [x] Plan iter 82
- [x] RED/GREEN A (compteur affiliation)
- [x] RED/GREEN B (curseur lastMessageAt)
- [x] Validation (260 tests verts)
- [ ] Commit + push

## Améliorations futures
- **F47** cap `maxUses` affiliation via `updateMany` conditionnelle transactionnelle + rollback.
- **F48** `ConversationMessageStatsService` edit/delete — écritures absolues dérivées d'une lecture.
- **F49** `ConversationStatsService` cache `messagesPerLanguage` in-process lost-update.
