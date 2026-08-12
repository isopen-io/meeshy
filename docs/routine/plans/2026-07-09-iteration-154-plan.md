# Iteration 154 — Plan d'implémentation (2026-07-09)

## Objectif
Corriger F120 : `ConversationStatsService.computeStats` transmet l'ObjectId résolu à
`computeOnlineUsers`, qui re-dérive le flag global via `=== "meeshy"`, rendant le compteur
d'utilisateurs en ligne de la conversation globale **vide** sur tout recompute complet.

## Modules affectés
- `services/gateway/src/services/ConversationStatsService.ts` (1 ligne de prod).
- `services/gateway/src/__tests__/unit/services/ConversationStatsService.test.ts` (1 test RED
  ajouté + commentaires du test « member intersection » corrigés).

## Phases

### Phase 1 — RED
Ajouter dans `describe('Online Users Computation')` un test :
« should include connected users for the global conversation even when it has no Participant
records ». Mock `conversation.findFirst` (identifier + id → globalConv), `user.findMany` → 2
users, `participant.findMany` → `[]` (réalité prod), `getConnectedUserIds = () => [u1, u2]`.
Assert `onlineUsers` = {u1, u2}. **Échoue** avant le fix (branche non-globale, `participant`
vide → `[]`).

### Phase 2 — GREEN
`ConversationStatsService.ts:243` : passer `conversationId` (brut) au lieu de
`realConversationId`, à l'identique de la sœur `updateOnNewMessage:110`.

### Phase 3 — Test existant
Corriger les commentaires du test « member intersection » (ligne ~769) : après le fix,
`computeOnlineUsers` prend la branche **globale** (pas la « member check path ») ; le mock
`participant.findMany` devient sans effet. Assertion `onlineUsers.length === 2` inchangée
(branche globale → `allowedIds = connectés`).

## Dépendances
Aucune. Pas de changement de schéma, de type partagé, ni d'API.

## Risques estimés
Très faibles. Comportement identique pour toute conversation normale
(`realConversationId === conversationId`). Seule la globale change vers le comportement
correct.

## Stratégie de rollback
Revert du commit unique (1 ligne prod + tests).

## Critères de validation
- `bun run test` ciblé sur `ConversationStatsService.test.ts` : suite verte, nouveau test
  passe, aucun régressé.
- Type-check gateway OK.

## Statut
- [x] Phase 1 — RED
- [x] Phase 2 — GREEN
- [x] Phase 3 — commentaires test existant
- [x] Validation

## Améliorations futures
Voir « Suivis » de l'analyse (composer mention boundary, recordView duration, reaction
self-echo ID).
