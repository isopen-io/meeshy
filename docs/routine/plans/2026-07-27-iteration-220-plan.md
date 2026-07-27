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
# Plan d'implémentation — Itération 220

## Objectifs
Canonicaliser `originalLanguage` au **write boundary** du domaine social (Post + PostComment), parité avec
le funnel messages (218) et les chemins hors-funnel messages (219, PR #2371). Rendre la base homogène sur
100 % des surfaces d'écriture claim-driven, messages **et** social. Bonus : supprimer la re-traduction
fantôme à l'édition d'un post quand le client renvoie une variante régionale de la même langue.

## Modules affectés
- `services/gateway/src/services/PostService.ts` (`createPost`, `updatePost` + trigger story-translation)
- `services/gateway/src/services/PostCommentService.ts` (`addComment`)
- `services/gateway/src/routes/posts/core.ts` (source de traduction = valeur canonique persistée, SSOT)
- Tests : `services/gateway/src/__tests__/unit/PostService.test.ts`

## Phases
1. **RED** — 6 tests ajoutés (prouvés RED via source revertée) :
   - createPost `'fr-FR'` → `create` avec `'fr'`.
   - createPost `'en_US'` → `create` avec `'en'`.
   - createPost `'bas'` → `create` avec `'bas'` (non-régression irréductible, vert avant/après).
   - updatePost variante régionale `'fr-FR'` vs stocké `'fr'` → **pas** de re-traduction (`originalLanguage`
     & `translations` absents de l'update).
   - updatePost vraie bascule `'en_US'` (stocké `'fr'`) → `update` avec `'en'` + `translations: {}`.
   - addComment `'fr-FR'` → `create` avec `'fr'` ; + `'bas'` verbatim ; + claim absente → `null`.
2. **GREEN** — Importer `normalizeLanguageCode` ; normaliser via `normalizeLanguageCode(claim) ?? claim`
   (repli identique au funnel 218/219) dans les 3 services ; câbler `core.ts` sur la valeur stockée.
3. **REFACTOR** — Aucun (changement minimal, aligné sur le pattern 218/219).

## Dépendances
- `@meeshy/shared/utils/language-normalize` (`normalizeLanguageCode`) — déjà sur `main`, déjà consommé par
  `MessagingService` (218) et les routes links/messages (219). Aucune nouvelle dépendance, aucun rebuild
  `dist` (ts-jest transpile la source).

## Risques estimés
Faible. Repli verbatim pour codes irréductibles ; idempotent sur codes déjà canoniques ; `detectLanguage`
(fallback sans claim) inchangé ; aucun chemin de lecture modifié ; `core.ts` bascule vers une valeur
strictement plus correcte (canonique) déjà en main.

## Stratégie de rollback
Revert du commit unique (3 fichiers source + 1 fichier de test). Aucune migration de données, aucun
changement de schema Prisma, aucun changement d'API contractuel.

## Critères de validation
- RED prouvé (source revertée) : 5 tests de canonicalisation échouent, les 3 non-régression restent verts.
- GREEN : 103/103 sur `PostService.test.ts`.
- Suites posts/traduction/commentaires connexes vertes (core, core-extended, posts-core,
  core.story-translation, PostTranslationService, PostCommentService) : 197/197.
- Suite gateway complète sans régression.

## Completion status
- [x] Analyse rédigée
- [x] Tests RED ajoutés + RED prouvé (5 échecs ciblés)
- [x] Implémentation GREEN (3 services + route)
- [x] Schema Prisma vérifié inchangé
- [x] Suites ciblées + connexes vertes (103 + 197)
- [x] Suite gateway complète verte (542/542 suites, 14688 tests, exit 0)
- [x] Commit + push + PR

## Progress tracking
Itération 220 = extension cross-domaine directe de 218/219. 218 → funnel messages ; 219 (#2371) → chemins
messages hors funnel ; 220 → domaine social (Post + PostComment). Le write-boundary de canonicalisation
`originalLanguage` couvre désormais messages **et** social.

## Future improvements
Voir « Future Considerations » de l'analyse : migration historique batch (Post/PostComment),
convergence `CommonSchemas.language` via `.transform` (SSOT unique au parse, tous consommateurs désormais
audités), audit `systemLanguage`/`regionalLanguage` (préférences in-app ; #2375 couvre déjà
`customDestinationLanguage`).
