# Réels — Likes, Audio, Commentaires : audit + corrections

Demande user : par lecture de code, s'assurer de bout en bout que (1) on peut liker les réels
depuis la vue réels / le feed / le détail de post, (2) le son des réels joue sans glitch,
(3) on peut liker les commentaires et y répondre. Attaque autonome, Opus.

## Diagnostic validé dans le code réel (Phase 1+2 systematic-debugging)

### Audio réels
- **A1 (HAUTE)** — 1er réel MUET à l'ouverture depuis le feed. `ReelVideoView.drive`
  (`ReelsPlayerView.swift:874-877`) ne pose `isMuted=false` que dans `if activeURL != fileUrl`.
  Le handoff feed→viewer fait `pause()` (pas `stop()`) → `activeURL` inchangé → bloc sauté →
  reste muet (le feed force `isMuted=true`, `ReelFeedVideoSurface.swift:80`, et `isMuted` est
  global persistant, non reset par `cleanup()` `SharedAVPlayerManager.swift:289`).
- **A2 (HAUTE)** — l'audio d'un réel-audio continue après fermeture du viewer.
  `closeReels()` (`RootView.swift:1349`) ne fait que `pause()` du moteur vidéo, jamais
  `PlaybackCoordinator.stopAllAudio()`. Le réel-audio (moteur externe `@StateObject`) survit.
- **A3 (MOY-HAUTE)** — viewer plein écran PAS call-aware. `ReelsPlayerView`/`ReelsViewModel`
  n'ont AUCUNE réf à `CallManager`/`callState`. Un appel entrant pendant un réel ne le met pas en pause.

### Like commentaires
- **C1 (MAJEUR)** — `likedIds` jamais semé : `CommentsSheetView.computeLikedIds`
  (`FeedCommentsSheet.swift:208`) existe + est testé mais N'EST BRANCHÉ NULLE PART. Cœur vide à
  l'ouverture pour les commentaires déjà likés. De plus `currentUserReactions` n'est pas propagé
  dans `FeedComment` aux 2 sites (`PostModels.toFeedPost:245`, `FeedCommentsSheet.loadReplies:475`).
  Gateway renvoie BIEN `currentUserReactions` (`PostCommentService.ts:131/189`).
- **C5 (MOYEN)** — like de commentaire INERTE dans `PostDetailView` : `likedIds:[]` codé en dur
  (`PostDetailView.swift:373-375`) → cœur ne se remplit jamais sur cette surface.

### Architectural — DOCUMENTÉ, hors scope autonome (touche le gateway / design produit)
- Like de POST : 2 systèmes temps réel disjoints (REST `/like` vs socket `post:reaction-add`).
  Les likes FONCTIONNENT (optimistic + rollback + seed `post.isLiked`) ; seule la cohérence
  temps réel inter-surfaces diverge.
- Like de COMMENTAIRE : compteur `likeCount` (REST) ≠ `reactionCount` (socket). Double-écriture
  feed. → décision produit/backend.

## Plan d'exécution (TDD où il y a un seam)
- [ ] A1 — `ReelsPlayerView.drive` : `isMuted=false` inconditionnel quand actif (sortir du `if`).
- [ ] A2 — `RootView.closeReels` : ajouter `PlaybackCoordinator.shared.stopAllAudio()`.
- [ ] A3 — `ReelsPlayerView` : pause vidéo + stop audio sur `CallManager.$callState` actif + garde drive.
- [ ] C1 — propager `currentUserReactions` ; overload `computeLikedIds(from: [FeedComment])` testé ;
      semer `likedIds` dans `CommentsSheetView`.
- [ ] C5 — `PostDetailView`/`PostDetailViewModel` : like commentaire optimiste + socket reaction + seed.
- [ ] Build `./apps/ios/meeshy.sh build` vert + tests ciblés verts.

## Review — LIVRÉ

### Corrections appliquées (build ✓ + tests ciblés ✓)
- **A1** `ReelsPlayerView.drive` : `manager.isMuted = false` sorti du `if activeURL != fileUrl`
  → le 1er réel n'est plus muet à l'ouverture depuis le feed. Aucun bouton mute dans le viewer
  (seule réf `isMuted` = cette ligne) → unmute inconditionnel sûr.
- **A2** `RootView.closeReels` : `PlaybackCoordinator.shared.stopAllAudio()` ajouté → l'audio d'un
  réel-audio ne survit plus à la fermeture (laisse le moteur vidéo pour la reprise du feed).
- **A3** `ReelsPlayerView` : `.onReceive(CallManager.$callState.map(\.isActive))` pause vidéo +
  `stopAllAudio()` au démarrage d'appel ; garde `!isCallActive` dans `drive` (miroir feed).
- **C1** `currentUserReactions` propagé dans `FeedComment` (toFeedPost SDK + loadReplies +
  commentAdded) ; overload `CommentsSheetView.computeLikedIds(from: [FeedComment])` ; `likedIds`
  semé dans `CommentsSheetView` (onAppear top-level + task cache + loadReplies réseau) → les
  commentaires déjà likés s'affichent cœur plein à l'ouverture.
- **C5** `PostDetailViewModel` : état like-commentaire optimiste (`commentLikedIds/Delta/InFlight`)
  + `toggleCommentLike` (réaction socket cœur + rollback) + `seedCommentLikes` + listeners
  `commentReactionAdded/Removed` ; `PostDetailView` câblé dessus → le like de commentaire dans le
  détail de post n'est plus inerte (cœur se remplit, retour instantané, persiste).
- **Bonus** : `StoryViewerCommentReactionTests.swift` (orphelin, absent du pbxproj — ses tests ne
  tournaient pas) câblé dans le projet (4 entrées, UUIDs `SVCR…`). 16 tests récupérés + verts.

### Vérification
- `./apps/ios/meeshy.sh build` : Build succeeded (33s).
- `StoryViewerCommentReactionTests` : 16/16 (dont 3 nouveaux `computeLikedIds_feedComment_*`).
- `PostDetailViewModelTests` : 19/19 (dont `test_loadComments_seedsCommentLikedIds_…` C5).
- `ReelsViewModelTests` + `ReelFeedAutoplayCoordinatorTests` : 11/11 (pas de régression reels).

### Non corrigé (architectural — décision produit/backend, hors scope autonome)
- Cohérence TEMPS RÉEL inter-surfaces du like de POST : viewer réels (REST `/like`, aucun listener)
  vs feed/détail (socket `reaction-add`), deux systèmes d'événements serveur disjoints. Les likes
  FONCTIONNENT sur les 3 surfaces (optimistic + rollback + seed `post.isLiked` à l'ouverture).
- Compteur de like de COMMENTAIRE : `likeCount` (REST) ≠ `reactionCount` (socket reaction). Le
  chemin socket (utilisé par sheet + détail) ne persiste pas le compteur côté serveur ; double-
  écriture sur le chemin feed (`onLikeComment`). À trancher au niveau gateway (unifier les deux
  mécanismes). L'état "liké par moi" (cœur), lui, est désormais correct et persistant partout.

---

# UNIFICATION DU LIKE DE POST (3 vues) — 2026-06-17

Demande user : le like de post n'est pas aligné sur la même donnée entre feed / détail / reel
viewer. Unifier EN PROD + capturer les stats + remontée temps réel sur chacune des 3 vues.

## Cause racine (validée gateway + web + iOS)
- Source de vérité = table `PostReaction` (par-user). MAIS 3 bugs serveur :
  - **likeCount non synchronisé par le chemin socket** (`PostReactionService.updatePostReactionSummary`
    ne touchait que reactionSummary/reactionCount). Divergence des compteurs selon le chemin.
  - **isLikedByMe lu depuis le Json legacy `post.reactions`** (`enrichWithLikeStatus`) → faux après
    un like SOCKET. iOS lit `feedPost.isLiked = isLikedByMe ?? false` → like socket invisible au reload.
    `getPostById` (détail) ne renvoyait MÊME PAS isLikedByMe → détail toujours « non liké ».
  - **Routage d'événements disjoint** : REST `/like`→`post:liked` (feed rooms) ; socket
    `post:reaction-add`→`post:reaction-added` (post room). Jamais le même client → désync temps réel.
- Contrainte web (préservée) : web ne reçoit QUE `post:liked` (payload absolu `{likeCount,
  reactionSummary}`), n'émet jamais `post:join`. Ack socket `{success}` requis. Emoji `❤️`.

## Design (full unification, backward-compatible web)
Événement CANONIQUE absolu `post:liked`/`post:unliked` (payload `{postId,userId,emoji,likeCount,
reactionSummary}`) émis vers feed rooms + post room, depuis les DEUX chemins d'écriture. Le ❤️ socket
bascule de `post:reaction-added` vers `post:liked` (POST/REEL uniquement ; stories/statuses + emojis
non-❤️ gardent leur chemin). Un seul événement par like → pas de double-comptage.

## Implémentation GATEWAY (✓ typecheck + suite 4176 tests verts)
- [x] S1 `PostReactionService.updatePostReactionSummary` : compteur AUTORITAIRE (count table) →
      `reactionCount` ET `likeCount` synchronisés sur les deux chemins (auto-réparant).
- [x] S2 `enrichWithLikeStatus(post, currentUserReactions[])` dérive isLikedByMe de la TABLE (5 sites)
      + `getPostById` renvoie isLikedByMe.
- [x] S3a `broadcastPostLiked/Unliked` émettent AUSSI vers `ROOMS.post` (détail + reel viewer).
- [x] S3b `PostReactionHandler` injecte `SocialEventsHandler` ; ❤️ POST/REEL → `broadcastPostLiked`
      (skip post:reaction-added). Wiring `MeeshySocketIOManager`.
- [x] Tests mis à jour : PostReactionService ($transaction tx.postReaction.count), PostReactionHandler
      (dep socialEvents + 2 nouveaux tests heart→post:liked / story→reaction-added), SocialEventsHandler
      (4 émissions: feed×3 + post room).

## Implémentation iOS (réconciliation base absolue + purge delta + isLiked)
- [x] Feed : `FeedView` onReceive postLiked/postUnliked (purge delta + isLiked acteur) ; `FeedViewModel`
      pose base absolue + persiste isLiked acteur (cache cold-start).
- [x] Détail : `PostDetailView` onReceive postLiked/postUnliked (base `viewModel.post.likes` + purge
      delta + isLiked). Déjà dans ROOMS.post.
- [x] Reel viewer : `ReelsViewModel` import Combine + cancellables + subscribe postLiked/postUnliked
      (`applyServerLike`) + currentId.didSet join/leave ROOMS.post ; `ReelsPlayerView` onAppear/onDisappear
      lifecycle room.
- [x] Build iOS vert (22s) + tests iOS 98/98 (Feed 74, Détail 19, Reels 5).

## NOTES DE DÉPLOIEMENT PROD (user déploie)
### Ordre recommandé : iOS d'abord, gateway ensuite (éviter un glitch transitoire)
- **WEB** : AUCUN changement requis, fonctionnel pendant/après le rollout (payload `post:liked`
  `{likeCount, reactionSummary}` préservé ; web ne reçoit pas la post room — pas de `post:join`).
- **iOS first** : nouveau client iOS + ANCIEN gateway = AUCUNE régression (le ❤️ reste sur
  `post:reaction-added` ; détail/feed gardent leurs handlers reaction-added ; seul le reel viewer
  n'a pas encore son real-time cross-user — capacité NOUVELLE, l'optimistic marche déjà).
- **Gateway ensuite** : tout s'aligne. ⚠️ Pendant la fenêtre où de VIEUX clients iOS (pré-update)
  tournent avec le NOUVEAU gateway, l'acteur peut voir un **double-comptage TRANSITOIRE** de son
  propre like dans le FEED (vieux FeedView ne purge pas le delta optimiste sur `post:liked`).
  Cosmétique (+1), **s'auto-corrige au refresh**. Inverser l'ordre (gateway d'abord) = ce glitch
  dès le deploy gateway.
- Rebuild image gateway + restart. **Pas de migration Prisma** (champs likeCount/reactionCount
  existants ; S1 auto-répare les compteurs au fil des likes). Optionnel : backfill ponctuel
  `likeCount = count(PostReaction)` par post pour corriger l'historique d'un coup.
- **Vérifs post-deploy** : (1) liker dans le feed → détail/reel ouverts du même post se mettent à jour
  instantanément (et inversement) ; (2) isLikedByMe correct au reload après un like SOCKET ; (3) le
  détail d'un post liké s'ouvre cœur PLEIN (getPostById→isLikedByMe) ; (4) likeCount == reactionCount
  quel que soit le chemin d'écriture.

## Review unification — LIVRÉ ✓
- Gateway : S1+S2+S3a+S3b. `npx tsc --noEmit` 0 erreur sur mes fichiers ; **suite 156 suites /
  4176 tests verts** (les 13 « failed » initiales = barrel `@meeshy/shared` non buildé, résolu).
  Tests adaptés : PostReactionService, PostReactionHandler (+2 nouveaux), SocialEventsHandler.
- iOS : build vert + 98 tests verts. 3 vues réconcilient depuis l'événement canonique absolu.
- Source de vérité unique = table `PostReaction` ; un seul événement (`post:liked`) par like vers
  les 3 surfaces ; compteurs alignés ; web intact.
- Reste (user) : déploiement selon l'ordre ci-dessus + vérifs e2e device.

---

# UNIFICATION DU LIKE DE COMMENTAIRE (socket-only) — 2026-06-17 (suite)

Même problème dual que le post, appliqué aux commentaires (choix user : socket-only).
- **CS1 (gateway ✓ 68/68 + suite 4176)** : `CommentReactionService.updateCommentReactionSummary`
  synchronise `likeCount` = `reactionCount` = `count(CommentReaction)` (miroir de S1). Le chemin
  socket maintient désormais `likeCount` → compteur de like de commentaire cohérent au reload.
- **CS2 (iOS ✓ build + 90 tests)** : `CommentsSheetView.toggleCommentLike` retire la DOUBLE-écriture
  (`onLikeComment?` REST/outbox en plus du socket) qui (a) incrémentait `likeCount`+`reactionSummary`
  DEUX fois sur le feed, (b) envoyait toujours `liked:true` (unlike impossible). Réaction socket =
  source unique (= web/reels/détail). Plumbing mort retiré : param `onLikeComment` de `CommentsSheetView`
  + `FeedPostCard` + closures `FeedView`/`RootViewComponents` + méthode `FeedViewModel.likeComment`.
- État `isLiked` du commentaire : déjà table-based (`currentUserReactions`) → correct (inchangé).
- Compromis assumé (validé user) : perte de la durabilité OFFLINE du like de commentaire sur le feed
  (les reels/détail ne l'avaient déjà pas ; le chemin offline était de toute façon buggé).
- REST `/comments/:id/like` (`PostCommentService.likeComment`) reste en place mais DORMANT (web+iOS
  socket) ; legacy à déprécier (n'écrit pas la table CommentReaction, incrément aveugle non idempotent).
- Déploiement : même ordre que le post (iOS d'abord puis gateway).

---

# FALLBACK REST DU LIKE-COMMENTAIRE — 2026-06-17 (suite, sur question user)

Question user : « en cas d'échec du socket, pas de fallback REST ? ». Réponse : exact, le socket-only
n'avait plus de fallback (rollback seulement), incohérent vs le like de POST (`togglePostHeart` a un
fallback REST). Ajouté proprement :

- **Prérequis gateway** : `PostCommentService.likeComment/unlikeComment` réécrits → écrivent la table
  `CommentReaction` (`upsert` sur la contrainte unique / `deleteMany`, idempotent) puis recomptent
  `likeCount = reactionCount = count(table)` + `reactionSummary` via `groupBy`. → cohérent avec le
  chemin socket (CS1). Le REST n'est plus un incrément aveugle → fallback SÛR (pas de double-comptage
  même si socket ET REST se déclenchent : la table est idempotente, count() autoritaire). Route
  `/comments/:id/like` inchangée (même forme de retour). Tests `PostService.test.ts` réécrits (6).
- **iOS** : `CommentsSheetView.toggleCommentLike` + `PostDetailViewModel.toggleCommentLike` → socket
  PRIMAIRE, sur échec → REST (`PostService.likeComment/unlikeComment`), rollback SEULEMENT si REST
  échoue aussi. Mutuellement exclusif (pas la double-écriture retirée). `unlikeComment` ajouté au
  protocole `PostServiceProviding` (SDK) + `MockPostService` (app + SDK).
- Vérif : gateway 156 suites / 4173 verts ; iOS build vert (39s) + 109 tests verts (Feed 74, Détail 19,
  like-commentaire 16).
- Note : le REST `/comments/:id/like` n'est donc PLUS legacy/incohérent — il est désormais
  table-autoritative comme le socket, et sert de fallback. (Le like de POST avait déjà ce fallback.)

---

# NORMALISATION SOCKET + FALLBACK REST DU LIKE — 2026-06-17 (suite)

Demande user : « Reels doit utiliser les sockets aussi ! normalise l'utilisation des sockets avec
fallback REST, un maximum ! »

Audit : le SEUL chemin socket d'interaction existant = la RÉACTION (like) post + commentaire
(`addPostReaction`/`removePostReaction`, `addCommentReaction`/`removeCommentReaction`). Bookmark,
share, viewPost, repost n'ont AUCUNE méthode socket (REST partout par design — le socket ne fait que
DIFFUSER ces changements). Donc « max » = le like.

État AVANT : feed ✓ socket+REST, détail ✓ socket+REST, commentaires ✓ socket+REST (déjà fait),
**REELS = REST-only** (seule surface non normalisée → cause de l'écart de compteur observé).

- [x] `ReelsViewModel.toggleLike` → socket PRIMAIRE (`addPostReaction`/`removePostReaction` ❤️ avec
      `withTaskTimeout`) + fallback REST (`service.like`/`unlike`) déclenché SEULEMENT si le socket
      échoue ; rollback optimistic uniquement si le REST échoue aussi. Miroir exact de
      `FeedView.togglePostHeart`. Le reels rejoint déjà `ROOMS.post` du réel actif → reçoit l'écho
      `post:liked` → `applyServerLike` réconcilie.
- Résultat : les 3 vues + commentaires utilisent désormais le MÊME pattern (socket primaire + fallback
      REST) → comportement homogène. Après déploiement gateway (S1), compteurs identiques partout.
