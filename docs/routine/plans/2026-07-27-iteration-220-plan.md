# Plan — Iteration 220 : garde `unchanged` sur `post:reaction-add` / `comment:reaction-add`

## Objectifs
Aligner `PostReactionHandler`/`CommentReactionHandler` sur `ReactionHandler` : ne plus diffuser
`post:liked`/`comment:reaction-added` ni re-notifier l'auteur quand un ajout de réaction est
idempotent (la ligne existe déjà, aucun changement DB).

## Modules affectés
- `services/gateway/src/services/PostReactionService.ts` (type retour + `unchanged` sur 3 branches)
- `services/gateway/src/services/CommentReactionService.ts` (idem)
- `services/gateway/src/socketio/handlers/PostReactionHandler.ts` (garde `if (reaction.unchanged)`)
- `services/gateway/src/socketio/handlers/CommentReactionHandler.ts` (idem)
- `services/gateway/src/__tests__/unit/services/PostReactionService.test.ts` (3 tests unchanged)
- `services/gateway/src/__tests__/unit/services/CommentReactionService.test.ts` (3 tests unchanged)
- `services/gateway/src/__tests__/unit/socketio/PostReactionHandler.test.ts` (const + 1 test no-op)
- `services/gateway/src/__tests__/unit/socketio/CommentReactionHandler.test.ts` (const + 1 test no-op)

## Phases
1. **Service** — type `…ReactionData & { readonly unchanged: boolean }` ; `unchanged: true` sur
   existing-reaction (findFirst) + branche P2002 ; `unchanged: false` sur insert frais. (×2 services)
2. **RED** — tests handler no-op (mock `unchanged: true` → attend zéro broadcast/notif) ; échec
   confirmé (garde absente). Tests service unchanged.
3. **GREEN** — garde `if (reaction.unchanged) { ACK success avec updateEvent; return; }` dans les 2
   handlers, avant broadcast + notification.
4. **VALIDATION** — 4 suites ciblées vertes + surface gateway sans régression.

## Dépendances
Aucune. `createUpdateEvent` est en lecture seule (agrégation) → sûr à appeler sur le chemin no-op.

## Risques estimés
Faible — champ additif plat sur le retour d'`addReaction` seul ; `mapReactionToData` inchangé ;
`PostService.likePost` ignore le retour ; seule différence observable = suppression d'émissions
redondantes.

## Stratégie de rollback
Revert du commit unique (changements isolés à 8 fichiers, aucune migration DB).

## Critères de validation
- Handler : chemin unchanged → ACK success, `broadcastPostLiked`/`POST_REACTION_ADDED` **non** appelés,
  `createPostLikeNotification` **non** appelée ; chemin changed (tests existants) → inchangé.
- Service : `unchanged: true` (existing + P2002), `unchanged: false` (insert frais).
- Suites `PostReactionService`/`CommentReactionService`/`PostReactionHandler`/`CommentReactionHandler`
  vertes ; pas de régression gateway.

## Statut de complétion
**COMPLET** — implémenté, testé (RED→GREEN), documenté. Prêt à merger.

## Suivi de progression
- [x] Analyse (docs/routine/analyses/2026-07-27-iteration-220-analyse.md)
- [x] Plan (ce fichier)
- [x] Service : `unchanged` (Post + Comment)
- [x] Tests RED handler (2 échecs confirmés : broadcast/notif sur no-op)
- [x] Garde handler (Post + Comment) → GREEN
- [x] Tests service unchanged (existing + insert frais + P2002)
- [x] Validation suites (4 suites 195/195 ; consommateurs PostService/interactions/notifications 117/117)
- [x] CHANGELOG
- [ ] Commit + push + PR

## Améliorations futures
- Forme wrapper `{ reaction, unchanged }` exacte de `ReactionService` si `replacedEmojis` devient
  pertinent (swap d'emoji à `MAX_REACTIONS_PER_USER > 1`).
