# Iteration 91 — Analyse d'optimisation (2026-07-04)

## Protocole (démarrage)
`main` @ `2c0edb11` (« feat(android/contacts): online-first friends list… #1434 » — HEAD au
démarrage). Branche de travail `claude/brave-archimedes-6z3let` recréée à neuf depuis `origin/main`
(working tree propre, aucun commit non-mergé à préserver).

PR ouvertes au démarrage : #1436 (iOS calls — CXPlayDTMFCallAction MainActor + `CallCleanupService.ts`),
#1435 (gateway — `routes/conversations/messages.ts` mark-unread cursor), #1433 (iOS calls), #1432
(gateway — `PostService.ts` story caption source filter, F52), #1430 (iOS a11y), #1429 (gateway
realtime — `MessageHandler`/`MeeshySocketIOManager`/`delivery-queue`). Cible retenue **hors de tous
ces fichiers** : le handler socket de réaction sur post (`PostReactionHandler.ts`) — feature sociale
récente (stories/statuses/reels), Priorité 1, purement vérifiable en jest. Aucun conflit de merge
attendu.

Méthode : fan-out de 2 agents d'exploration en parallèle sur des clusters disjoints (social/stories
gateway ; shared utils + web react-query). Retenu le défaut le plus fort ET le plus confiant : dérive
de sibling sur le typage des notifications de réaction.

## Cible : la notification de réaction socket hardcode `postType: 'POST'`, perdant le typage STORY/STATUS/REEL

### Current state
Deux chemins créent la notification « X a réagi à votre contenu » via
`NotificationService.createPostLikeNotification` :

1. **REST** (`routes/posts/interactions.ts:104-113`, SSOT) — passe le **vrai** type et le contexte
   éphémère :
   ```ts
   notifService.createPostLikeNotification({
     actorId, postId, postAuthorId: post.authorId, emoji,
     postType: post.type,                    // STORY | STATUS | REEL | POST
     postPreview: post.content?.slice(0, 80),
     postCreatedAt: post.createdAt,
     postExpiresAt: post.expiresAt,          // contexte éphémère story/status
   });
   ```
2. **Socket** (`socketio/handlers/PostReactionHandler._createPostReactionNotification:458-481`) — le
   `findUnique` (l.463-466) ne `select`ait que `authorId`, et l'appel (l.476) **hardcodait**
   `postType: 'POST'`, sans `postPreview`/`postCreatedAt`/`postExpiresAt`.

`postType` est load-bearing dans `createPostLikeNotification` (`NotificationService.ts:2414-2497`) :
il pilote (a) le **type** de notification (`STORY → story_reaction`, `STATUS → status_reaction`, sinon
`post_like`, l.2442-2446) ; (b) la **chaîne de contenu** `reactPostType` (l.2449/2466) ; (c) le
**sous-titre** `subtitlePostType` (l.2450/2457) ; (d) `metadata.postType` (l.2490, REEL vs POST pilote
un label/icône client distinct). `postCreatedAt`/`postExpiresAt` alimentent le contexte d'expiration
(l.2479-2480, « story expirée » côté client) ; `postPreview` alimente le détail du sous-titre.

Le chemin socket est atteint sur **chaque** ajout de réaction (`handleAddReaction:207`,
fire-and-forget). Le test existant `test_handleAddReaction_heartOnStory_keepsReactionAdded_noPostLiked`
prouve que les STORY transitent bien par ce handler.

### Problems identified
Pour toute réaction émise via WebSocket (`post:reaction-add`) sur une STORY/STATUS/REEL :
- STORY → notification `post_like` au lieu de `story_reaction` ; STATUS → `post_like` au lieu de
  `status_reaction` ; REEL → `metadata.postType: 'POST'` au lieu de `'REEL'`.
- Contexte éphémère (`postExpiresAt`/`postCreatedAt`) et aperçu (`postPreview`) **perdus** : le
  destinataire ne voit ni « votre story » ni l'indication d'expiration.
- **Incohérence inter-chemins** : la même action utilisateur produit une notification correctement
  typée en REST mais mal typée en socket.

### Root cause
Motif récurrent « fix/règle appliqué à un sous-ensemble de siblings, pas audité sur tous »
(leçons #40/#42/#45/#50/#55/#56/#57). Le typage riche (`postType`/preview/expiry) a été câblé sur le
call site REST, mais le sibling socket — écrit en miroir de `CommentReactionHandler` — a gardé le
`postType: 'POST'` hardcodé d'origine et un `select` minimal (`authorId` seul).

### Business impact
Feature sociale récente (stories/statuses/reels, Priorité 1). Les réactions sont un usage central ;
côté client mobile la réaction passe par le socket. Un auteur qui reçoit une réaction sur sa story via
un client socket obtenait une notification générique « publication » sans contexte éphémère — dégrade
la clarté et la fraîcheur perçue de la surface notifications, et casse la cohérence avec le chemin REST.

### Technical impact
`select` élargi (`type`/`content`/`createdAt`/`expiresAt`) sur un `findUnique` **déjà émis** (zéro
requête supplémentaire) ; 4 champs forwardés en miroir exact du call site REST. Zéro nouvelle
dépendance, zéro changement de signature publique. Rétro-compatible : un POST classique produit
exactement la même notification qu'avant.

### Risk assessment
TRÈS FAIBLE. Le changement ne fait qu'aligner le chemin socket sur le chemin REST déjà en production.
Aucun comportement changé pour un POST (le `postType` résolu vaut alors `'POST'` comme le hardcode
précédent). Les champs éphémères sont `undefined`-safe (`?.`/`?? undefined`). Les 63 tests des deux
suites `PostReactionHandler` restent verts.

### Proposed improvements
1. `PostReactionHandler._createPostReactionNotification` : `select: { authorId, type, content,
   createdAt, expiresAt }` ; forwarder `postType: post.type`, `postPreview: post.content?.slice(0,80)`,
   `postCreatedAt: post.createdAt`, `postExpiresAt: post.expiresAt` (miroir exact du REST).

### Expected benefits
- Parité REST ↔ socket : une réaction sur une STORY/STATUS/REEL produit la notification correctement
  typée (`story_reaction`/`status_reaction`, label REEL) avec contexte d'expiration, quel que soit le
  chemin d'émission.
- Contrat « le typage de notification de réaction est résolu identiquement partout » rétabli.

### Implementation complexity
TRÈS FAIBLE — 1 `select` élargi + 4 champs forwardés (1 fichier de prod) + 1 test neuf RED→GREEN.

### Validation criteria
- [x] `PostReactionHandler.test.ts` : test neuf `reactionOnStory_forwardsRealTypeAndEphemeralContext`
  RED sans fix (`postType: 'POST'`, champs éphémères absents), GREEN après.
- [x] Les 2 suites `PostReactionHandler` (63 tests) vertes.
- [x] Suites `Reaction|interactions|NotificationService.reactionSpam|posts-engagement` : 23 suites /
  671 tests vertes, 0 régression.
- [x] `tsc --noEmit` gateway : 0 nouvelle erreur (baseline `@meeshy/shared/prisma/client` inchangé).

## Candidats écartés ce cycle (documentés)
- **Web — reels cache desync sur post edit/delete** (`use-post-socket-cache-sync.ts` +
  `use-post-mutations.ts`) : dérive réelle (le fil reels garde le caption périmé / le post supprimé),
  mais changement à 2 couches (optimiste + socket, 4 call sites). Reporté à une itération web dédiée
  (F55).
- **Web — `likeCount` double-compté sur self-reaction** (`use-post-socket-cache-sync.ts:229`) :
  s'appuie sur un self-echo gateway inféré (non observé, fichier socket exclu ce cycle). Reporté (F56).
- **shared — `hasMentions` (ASCII `\w`) vs `parseMentions` (Unicode `\p{L}`)** : dérive propre mais
  sévérité faible (le shared `hasMentions` est peu consommé côté serveur). Reporté (F57).
- **`getStatuses`/`getDiscoverStatuses` sans enrichissement `currentUserReactions`** vs `getStories` :
  possiblement intentionnel par surface, confiance moindre. Non retenu.

## Améliorations futures (report)
- **F51** : `FirebaseNotificationService` = implémentation FCM parallèle inutilisée. Candidat
  suppression/consolidation (report iter 87→91).
- **F55** (MEDIUM) : reels cache desync web sur edit/delete — itération web dédiée.
- **F56** (MEDIUM-HIGH) : `likeCount` double-count self-reaction web — à confirmer par lecture du
  broadcast gateway.
- **F57** (LOW) : `hasMentions` Unicode boundary.
