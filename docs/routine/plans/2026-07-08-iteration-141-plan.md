# Iteration 141 — Plan d'implémentation (R-AR1)

## Objectives
Porter la garde d'idempotence d'iter 134 (réactions message) sur le miroir pièce-jointe : ne plus
re-broadcaster `ATTACHMENT_REACTION_ADDED/REMOVED` quand l'état DB n'a pas changé (re-react identique ou
remove déjà-absent).

## Affected modules
- `services/gateway/src/services/AttachmentReactionService.ts` — `addAttachmentReaction` retourne
  `{ changed: boolean }` (détecte l'emoji précédent via `findUnique`) ; `removeAttachmentReaction` retourne
  `boolean` (`deleteMany.count > 0`).
- `services/gateway/src/socketio/handlers/AttachmentReactionHandler.ts` — early-return `success` sans emit
  sur `!changed` / `!removed`.
- Tests :
  - `src/socketio/handlers/__tests__/AttachmentReactionHandler.test.ts` (no-op add + no-op remove ; mocks
    service alignés sur les nouveaux retours).
  - `src/services/__tests__/AttachmentReactionService.test.ts` (retours `changed`/`boolean` ; `findUnique`
    ajouté au mock).
  - `src/__tests__/unit/services/AttachmentReactionService.test.ts` (no-op via `findUnique`, retours remove).
  - `src/__tests__/unit/handlers/AttachmentReactionHandler.test.ts` (mocks service + no-op add/remove).

## Implementation phases
1. **RED** : nouveaux tests service (retour `{changed}` / `boolean`) + handler (no-op ne broadcaste pas) →
   échecs prouvés contre le code `void`.
2. **GREEN** : `findUnique` de l'emoji précédent + retours ; handler early-return miroir de `ReactionHandler`.
3. **REFACTOR** : aucun — spécification donnée par le chemin message sœur.
4. Suite AttachmentReaction 72/72 ; suite gateway complète 510/510 ; `tsc --noEmit` exit 0.

## Dependencies
Aucune. Seul le handler appelle les deux méthodes service (grep confirmé). Pas de chemin REST pour les
réactions pièce-jointe.

## Estimated risks
Faible. Les chemins nominaux (add frais, swap emoji, remove effectif) restent inchangés ; seuls les no-op
cessent de broadcaster. Changement de type de retour `void` → `{changed}`/`boolean` sans autre consommateur.

## Rollback strategy
Revert du commit unique.

## Validation criteria
- RED→GREEN vert (10 tests ajoutés).
- Non-régression : 41 tests nominaux préexistants verts.
- Suite gateway complète 510/510 ; `tsc --noEmit` exit 0.

## Completion status
- [x] RED tests écrits (no-op broadcast prouvé)
- [x] GREEN (service `{changed}`/`boolean` + handler early-return)
- [x] Suites AttachmentReaction 72/72
- [x] Suite gateway complète 510/510
- [ ] Rebase sur origin/main + push + PR #1659 + merge

## Progress tracking
Itération 141 en cours (rebasée sur `origin/main` @ 5946ece après collision de numéro avec l'iter 139
web/audio prise en parallèle).

## Future improvements
Backlog F104 (tier Go NotificationService), F106/F107 (iter 139), F102, F100, F98, F90 — voir analyse 141.
