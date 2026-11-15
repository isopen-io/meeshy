# Plan — Itération 280 : frontière Zod de `AttachmentReactionHandler`

Issue : #4245. Statut : **livré**.

## Objectifs

Porter la quatrième famille de réaction (par-pièce-jointe) sur la même frontière
de validation Zod que ses trois jumelles, et lui rendre la borne d'emoji
manquante.

## Modules affectés

- `services/gateway/src/validation/socket-event-schemas.ts` (ajout de 2 schémas)
- `services/gateway/src/socketio/handlers/AttachmentReactionHandler.ts` (frontière)
- `services/gateway/src/socketio/handlers/__tests__/AttachmentReactionHandler.test.ts`
- `services/gateway/src/__tests__/unit/handlers/AttachmentReactionHandler.test.ts`

## Phases

1. **RED** — mettre à jour les deux fichiers de tests pour asserter le message de
   frontière (`'Validation failed: …'`) au lieu des messages manuscrits, et
   ajouter un témoin « emoji > 10 caractères » ; prouver le ROUGE en débranchant
   la validation (`const validated = data;`) → 13 témoins tombent.
2. **GREEN** — ajouter `SocketAttachmentReactionAddSchema` /
   `SocketAttachmentReactionRemoveSchema`, câbler `validateSocketEvent` en tête de
   `_apply`, remplacer `data.*` par `validated.*`, retirer les gardes manuscrites
   et l'import `isValidObjectId`.
3. **REFACTOR / validation** — `tsc --noEmit`, suite complète du gateway.

## Dépendances

Aucune. `mongoId` et `validateSocketEvent` préexistent.

## Risques & rollback

Risque faible (frontière strictement alignée sur les jumelles ; `mongoId`
subsume `isValidObjectId`). Rollback = revert du commit ; aucune migration,
aucun changement de contrat de fil ni de schéma de réponse.

## Critères de validation

- Suite gateway complète verte (904/904 suites).
- `tsc --noEmit` exit 0.
- ROUGE prouvé sur les témoins de frontière.

## Statut / suite

Livré. Ferme #4245. Ferme le piège armé du suivi 279 (b).
Suites potentielles (non ouvertes ici) : la parité de frontière des autres
familles socket est déjà couverte par les cliquets existants ; rien de neuf à
instruire.
