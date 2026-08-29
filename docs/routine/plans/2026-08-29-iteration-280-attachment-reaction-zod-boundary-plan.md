# Plan — Itération 280 : schéma Zod de frontière pour AttachmentReactionHandler

## Objectifs
Aligner la « douzième famille » de réactions (par pièce jointe) sur la discipline
de frontière socket de ses trois jumelles : validation par schéma Zod, borne
d'emoji à l'entrée, suppression de la garde manuscrite redondante.

## Modules affectés
- `services/gateway/src/validation/socket-event-schemas.ts` (deux schémas neufs)
- `services/gateway/src/socketio/handlers/AttachmentReactionHandler.ts`
- `services/gateway/src/socketio/handlers/__tests__/AttachmentReactionHandler.test.ts`
- `services/gateway/src/__tests__/unit/handlers/AttachmentReactionHandler.test.ts`

## Phases
1. **RED** — réécrire les assertions de frontière des DEUX suites vers la forme
   Zod (`'Validation failed'`), ajouter un témoin de borne d'emoji. ✔
2. **GREEN** — ajouter `SocketAttachmentReactionAddSchema` / `RemoveSchema` ;
   câbler `validateSocketEvent` en tête de `_apply` ; retirer la garde
   `isValidObjectId` subsumée et son import ; `data.*` → `validated.*`. ✔
3. **Validation** — 314 tests des 4 familles + schemas verts ; `tsc --noEmit`
   exit 0 ; RED reprouvé par revert de l'implémentation. ✔

## Dépendances
Aucune (isolé au gateway ; `mongoId` déjà défini dans le fichier de schémas).

## Risques estimés
Faible. Équivalence `mongoId` ↔ `isValidObjectId` mesurée (même
`OBJECT_ID_REGEX`). Changement de chaîne d'erreur sur chemins de refus =
alignement voulu sur les jumelles ; chemin succès inchangé.

## Stratégie de rollback
Revert du commit — changement isolé à un handler + un fichier de schémas + deux
suites.

## Critères de validation
Cf. analyse § « Critères de validation (atteints) ».

## Statut de complétude
LIVRÉ. Les quatre familles de réaction valident leur entrant par schéma Zod.

## Améliorations futures
`LocationHandler` (dernière famille validant à la main) — à peser séparément
(cf. analyse § Suivi).
