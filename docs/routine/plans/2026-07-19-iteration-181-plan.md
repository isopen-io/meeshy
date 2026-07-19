# Plan d'implémentation — Itération 181

## Objectifs
Brancher `ReactionService.getMessageReactions` sur la SSOT
`resolveParticipantDisplayName` / `resolveParticipantAvatar` (avec jointure du
compte lié) afin que l'identité d'un réacteur enregistré (nom + avatar) soit
cohérente avec le fil de messages et ne retombe plus sur `'Anonymous'` / avatar
absent, tout en supprimant la fuite chaîne-vide.

## Modules affectés
- `services/gateway/src/services/ReactionService.ts` (import + `select` + enrichissement)
- `services/gateway/src/__tests__/unit/services/ReactionService.test.ts` (RED)

## Phases
1. **RED** — +5 tests dans le describe `getMessageReactions` : fallback compte,
   priorité local, blank→absent, ni l'un ni l'autre→`'Anonymous'`/`null`,
   jointure `user` dans le `select`. ✅
2. **GREEN** — import des helpers ; jointure `user: { select: { displayName,
   avatar } }` ; `resolveParticipantDisplayName(participant) ?? 'Anonymous'` +
   `resolveParticipantAvatar(participant)`. ✅
3. **Validation** — jest `ReactionService` + suites consommatrices
   `ReactionHandler|reactions`. ✅

## Dépendances
`@meeshy/shared/utils/participant-helpers` — déjà en production (importé par
`routes/conversations/messages.ts`). `prisma generate --generator client` requis
pour que ts-jest résolve les types Prisma (étape CI parité).

## Risques estimés
Très faibles — helpers idempotents déjà déployés ; type de retour inchangé ;
comportement identique pour les participants anonymes.

## Stratégie de rollback
Revert du commit unique de l'itération.

## Critères de validation
- `ReactionService.test.ts` 83/83 (5 nouveaux).
- `ReactionHandler|reactions` 508/508 (15 suites).

## Statut
**COMPLETE** — implémenté et validé.

## Suivi de progression
- [x] RED (5 tests)
- [x] GREEN (import + select + enrichissement)
- [x] Validation jest (83 + 508)
- [x] Analyse + plan
- [ ] Commit + push

## Améliorations futures
- Voir backlog de l'analyse 181 : `CommentReactionService.ts:247-248`,
  `routes/conversations/stats.ts:77-78`, `participants.ts:541` (fuites
  chaîne-vide niveau compte, RED-first dans une itération dédiée).
