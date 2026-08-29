# Plan — Itération 281 : garde d'admission d'écriture sur la réaction par-pièce-jointe

## Objectif
Faire refuser à `AttachmentReactionService.addAttachmentReaction` l'écriture d'une
réaction dans une conversation CLOSE / sur un message supprimé / système —
parité stricte avec `ReactionService.addReaction`.

## Modules affectés
- `services/gateway/src/services/AttachmentReactionService.ts` (production)
- `services/gateway/src/__tests__/unit/services/AttachmentReactionService.test.ts` (défaut mock + témoins)
- `services/gateway/src/__tests__/unit/services/AttachmentReactionService.reactionLimit.test.ts` (défaut mock)

## Phases
1. **RED** — Ajouter les témoins closed/inactive/deleted/system dans
   `AttachmentReactionService.test.ts` (fournir `message.findUnique` renvoyant la
   forme fautive ; asserter refus + aucun `upsert`). Prouver RED.
2. **GREEN** — Importer `isConversationClosed` + `CLOSED_CONVERSATION_REACTION_ERROR` ;
   dans `addAttachmentReaction`, charger le message et poser les trois gardes
   avant l'idempotence.
3. Mettre à jour le défaut `message.findUnique` des deux fichiers de tests pour
   renvoyer un message vivant `{ deletedAt: null, messageType: 'text',
   conversation: { isActive: true, closedAt: null } }`.
4. **REFACTOR** — vérifier la lisibilité, aligner les commentaires sur la jumelle.

## Dépendances
`isConversationClosed`, `CLOSED_CONVERSATION_REACTION_ERROR` — déjà exportés.

## Risques
Faible. Le seul risque est de casser les tests existants du service (défaut mock
`message.findUnique: null`) — traité en phase 3.

## Stratégie de rollback
Revert du commit unique.

## Critères de validation
Suite gateway complète verte + `tsc --noEmit` exit 0 ; RED prouvé sur chaque garde.

## Statut
LIVRÉ. Gates : gateway `npx jest` = 904 suites / 20574 tests verts ;
`tsc --noEmit` exit 0. RED prouvé (5 témoins de garde tombent sans le bloc), GREEN
après. Inventaire `conversationClosedWriteVerbs.test.ts` étendu au 5e transport.
