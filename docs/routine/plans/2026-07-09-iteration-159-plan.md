# Iteration 159 — Plan d'implémentation (2026-07-09)

## Objectives
Aligner les 2 sites d'ajustement REST de `ConversationMessageStats` (edit, delete) sur le
**contrat de clé d'identité d'expéditeur** déjà appliqué par create/recompute, afin que le
breakdown par participant reste cohérent avec les totaux. Réf. analyse iter 159 (F125).

## Affected modules
- `services/gateway/src/routes/conversations/messages-advanced.ts` (prod, 2 lignes)
- `services/gateway/src/__tests__/unit/routes/conversation-messages-advanced.test.ts` (tests)

## Implementation phases
1. **RED** — ajouter/adapter les tests route :
   - DELETE : clé = `Participant.id` pour un message anonyme supprimé par un admin ;
     clé = `User.id` pour un auteur enregistré.
   - PUT : clé = expéditeur (`OTHER_USER_ID`) et non éditeur (`USER_ID`) pour une édition
     modérateur.
   - Réécrire le test pré-existant qui asserte le fallback `''` (bug encodé) vers `senderId`.
2. **GREEN** — corriger les 2 sites prod :
   `existingMessage.sender?.userId ?? existingMessage.senderId` (delete + edit).
3. **REFACTOR** — aucun (le fix EST la convergence ; pas de sur-ingénierie).

## Dependencies
Aucune. `existingMessage.senderId` scalaire déjà retourné par les deux requêtes `findFirst`
(chargées avec `include`).

## Estimated risks
Quasi-nul. Pour l'auteur enregistré, la nouvelle expression est équivalente à l'ancienne
(`sender?.userId` = `User.id`). Le changement n'affecte que : (a) delete anonyme (`''` →
`Participant.id`), (b) edit par un non-auteur (`editorId` → `senderId`).

## Rollback strategy
Revert du commit. Pas de migration ni d'état persistant modifié — un revert restaure
exactement l'ancien comportement.

## Validation criteria
- `conversation-messages-advanced.test.ts` : 99/99 verts.
- RED prouvé : 3 tests échouent sans le fix prod (stash), passent avec.
- `ConversationMessageStatsService.test.ts` + `routes/messages*` : verts (299/299).
- `tsc --noEmit` gateway : 0 erreur.

## Completion status
- [x] Phase 1 (RED) — tests ajoutés/adaptés, RED confirmé (3 fail sans le fix)
- [x] Phase 2 (GREEN) — 2 lignes prod corrigées, 99/99 verts
- [x] Phase 3 — n/a
- [x] Validation — tsc clean, suites stats+routes vertes

## Progress tracking
Commit unique sur `claude/brave-archimedes-ps9wy0`, PR vers `main`.

## Future improvements
- Câbler les stats sur le chemin de suppression **socket** (`handleMessageDelete`) — voir
  « Suivis » de l'analyse. Nécessite d'exposer le service à la couche socket ; cycle dédié.
- Envisager un helper partagé `senderStatsKey(sender, senderId)` si un 5e site apparaît, pour
  matérialiser le contrat en un seul endroit.
