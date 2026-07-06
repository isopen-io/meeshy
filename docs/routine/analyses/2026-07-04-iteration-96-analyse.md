# Iteration 96 — Analyse d'optimisation (2026-07-04)

## Protocole (démarrage)
`main` @ `f2a5f43e` (« fix(ios/calls): nonisolated data-channel value types … » — HEAD au
démarrage, working tree propre). Branche de travail `claude/brave-archimedes-f6n2i2` déjà
synchronisée sur `origin/main` (même SHA), 0 commit non-mergé à préserver.

PR ouvertes au démarrage : #1455 (Android — `block-outbox-durable`, `apps/android` uniquement).
Disjointe des fichiers gateway/shared ciblés ici.

### Ménage du backlog (constat de démarrage)
Les reports d'itérations 90→94 listaient encore **F53 (HIGH)** et **F54 (HIGH)** comme parkés —
c'est **stale** : les deux ont été soldés en itération 89 (`getReels` curseur chronologique et
`languageCodeSchema` ISO 639-3) et sont **présents et vérifiés sur `main`** (lecture directe de
`PostFeedService.ts:481-500` et `attachment-validators.ts:57-70`). Reste réellement ouvert :
F51b (LOW docs), F56b (LOW gateway sym.), **F57 (LOW)**, **F58 (LOW)**, F59 (LOW).

**F57** : pré-évalué ici comme non-problème côté consommateurs de production — `hasMentions` (les 2
shared + les 2 web) et `extractMentions` (web) ne sont référencés **QUE par des tests** ; les chemins
de production d'extraction de mention (`MentionService.MENTION_REGEX`, `parseMentions` handleRegex,
`resolveMentionedUsers`) opèrent sur des **usernames validés ASCII** (`/^[a-z0-9_]{1,30}$/`) et le
seul chemin Unicode (`parseMentions` display-name) est déjà l'autorité correcte pour les messages.
**Note post-rebase** : une itération parallèle (it.95 sur `main`) a néanmoins durci F57
défensivement — les deux constats coexistent, F57 est clos.

Cible retenue : **F58** — le body/metadata de la notification de réaction-commentaire s'effondre
le type d'entité vers un booléen `isStory` (→ STORY/POST), perdant REEL/STATUS. Purement
gateway+shared, vérifiable en jest/vitest.

## Cible : F58 — la notif de réaction-commentaire s'effondre le postType vers un booléen `isStory`

### Current state
Deux méthodes sœurs construisent la notification d'une réaction sur du contenu social :

1. **`createPostLikeNotification`** (réaction sur un **post/story/reel/status**) : porte un vrai
   `postType?: 'POST'|'STORY'|'MOOD'|'STATUS'|'REEL'`, route le type de notif
   (`story_reaction`/`status_reaction`/`post_like`), et persiste `metadata.postType` **sans
   collapse** (`params.postType || 'POST'`). Le caller `PostReactionHandler` passe `post.type`
   directement — corrigé explicitement (commit dédié : « Hardcoding 'POST' here dropped that
   typing on every socket-path reaction »).

2. **`createCommentReactionNotification`** (réaction sur un **commentaire**) : prenait
   `isStory?: boolean` et posait `metadata.postType: params.isStory ? 'STORY' : 'POST'`. Le body
   localisé `reaction.commentVerbose` ne distinguait aussi que `story`/`post`
   (`COMMENT_CONTEXT[L][isStory ? 'story' : 'post']`). Le caller
   `CommentReactionHandler._createCommentReactionNotification` calculait
   `isStory = post?.type === 'STORY'`.

Conséquence : réagir à un commentaire sous un **REEL** ou un **STATUS** produit
`metadata.postType: 'POST'` et un corps « … sur le post de X » — alors que la sœur post-reaction,
sur le même contenu, produit correctement REEL/STATUS. Asymétrie directe entre deux chemins qui
doivent porter le même contrat d'entité.

### Problems identified
- **Collapse d'entité** : REEL/STATUS/MOOD → 'POST' dans `metadata.postType` (que le client lit
  pour afficher le libellé « Réel »/« Statut » et router la navigation) et dans le corps localisé.
- **Asymétrie post-reaction / comment-reaction** : la sœur `createPostLikeNotification` porte déjà
  le postType complet ; la réaction-commentaire reste bloquée sur un booléen legacy.
- **Dette de contrat** : `isStory: boolean` est un booléen redondant là où le reste du système de
  notif utilise la clé d'énumération `NotificationPostKind` (5 valeurs) avec ses tables de noms
  localisés (`POSS_OBJ`/`LOC_OBJ`/`POST_NOUN_CAP`…).

### Root cause
Même classe de bug que le fix post-reaction déjà accepté : le caller a été écrit avec un booléen
`isStory` (binaire story/non-story) au lieu de forwarder le vrai `post.type`. Le collapse était
figé à la fois dans le caller, la signature de la méthode, et la table i18n `COMMENT_CONTEXT`
(qui n'avait que 2 clés `story`/`post`).

### Business impact
La notification de réaction sur commentaire est un signal d'engagement social direct. Un
destinataire qui reçoit « … a réagi ❤️ à votre commentaire **sur le post de** Bob » alors que le
contenu est un **réel** ou un **statut** perçoit une notif imprécise/incohérente — d'autant que
la notif jumelle (réaction sur le post lui-même) affiche, elle, le bon type. Le `metadata.postType`
erroné peut aussi mal router la navigation côté client (ouvrir en vue post plutôt qu'en viewer réel).

### Technical impact
- **shared** `notification-strings.ts` : `COMMENT_CONTEXT` élargi de `{story, post}` à un `ObjMap`
  complet (5 `NotificationPostKind` × 8 langues), réutilisant les choix de noms des tables voisines
  (`INDEF_OBJ`/`LOC_OBJ`). La branche `reaction.commentVerbose` résout
  `kind = params.postType ?? (params.isStory ? 'STORY' : 'POST')` — `postType` prime, `isStory`
  reste un repli legacy (aucune régression des tests existants).
- **gateway** `NotificationService.createCommentReactionNotification` : `isStory?: boolean` remplacé
  par `postType?: 'POST'|'STORY'|'MOOD'|'STATUS'|'REEL'` (mirror exact de la sœur) ; body et
  `metadata.postType` (`params.postType ?? 'POST'`) sans collapse.
- **gateway** `CommentReactionHandler` : forwarde `postType: post?.type` (mirror de
  `PostReactionHandler`) au lieu de `isStory: post?.type === 'STORY'`.
- Zéro changement iOS/web/DB : `metadata.postType` portait déjà REEL/STATUS via la sœur
  post-reaction — les clients gèrent déjà ces valeurs.

### Risk assessment
FAIBLE. `postType` optionnel → `undefined` retombe sur 'POST' partout (rétro-compat parfaite avec
tout appel sans type et avec le mock de test qui ne fournit pas `type`). Les tables i18n élargies
n'introduisent pas de nouvelle clé de template — seulement des entrées de noun map supplémentaires.
Le booléen `isStory` reste supporté dans le fallback, donc les tests existants
(`isStory:true/false`) restent verts. Aucune migration, aucune API publique retirée.

### Proposed improvements
1. Élargir `COMMENT_CONTEXT` à `ObjMap` (5 kinds × 8 langues) + `postType` prioritaire dans la
   branche `reaction.commentVerbose`.
2. `createCommentReactionNotification` : contrat `postType` (mirror de `createPostLikeNotification`),
   sans collapse en metadata.
3. `CommentReactionHandler` : forwarder `post?.type`.
4. Tests : shared (REEL/STATUS/en + précédence postType>isStory), gateway
   (body+metadata REEL/STATUS, fallback POST, forward handler REEL).

### Expected benefits
- Réaction-commentaire sur REEL/STATUS : libellé et `metadata.postType` corrects, symétriques à la
  réaction-post.
- Un seul contrat d'entité (`NotificationPostKind`) sur les deux chemins de réaction sociale.
- Corps localisé conscient de l'entité dans 8 langues.

### Implementation complexity
FAIBLE — 1 table i18n élargie + 1 branche + 3 éditions gateway, couvert par 4 tests shared neufs +
4 tests gateway neufs.

### Validation criteria
- [x] `notificationString('en','reaction.commentVerbose',{postType:'REEL',author})` → « … on X’s reel ».
- [x] `postType` prime sur `isStory` (REEL + isStory:false → « réel », pas « post »).
- [x] `createCommentReactionNotification({postType:'REEL'})` → `metadata.postType === 'REEL'`,
      body « … on Bob’s reel » ; STATUS idem ; sans postType → POST.
- [x] `CommentReactionHandler` forwarde `postType: 'REEL'` quand `post.type === 'REEL'`.
- [x] Suites `notification-strings` (shared) 28/28 ; `NotificationService.i18n` + `CommentReactionHandler`
      + `reactionSpam` + `storycomments` + `SocialNotificationPrecision` → 198+30 verts, 0 régression.
- [x] `tsc --noEmit` gateway 0 erreur ; shared 0 erreur.

## Candidats écartés ce cycle (documentés)
- **Retirer complètement `isStory` de `NotificationStringParams`** : garde-fou legacy conservé
  (repli binaire) — un retrait forcerait la réécriture des 2 tests `isStory` existants sans gain de
  correction. `postType` prime déjà ; le booléen est inerte quand `postType` est fourni.
- **F59** (REST `comment_like` vs socket `comment_reaction`) : divergence de **type de notif** selon
  le transport, possiblement intentionnelle (like legacy vs reaction) — confiance insuffisante sans
  spec produit. Reporté.

## Améliorations futures (report)
- **F51b** (LOW) : réécriture des docs `notifications/` (composition défunte, module fantôme
  `NotificationServiceExtensions`).
- **F56b** (LOW) : symétriser le gateway pour émettre un `likeCount` absolu sur
  `post:reaction-added/removed`.
- **F59** (LOW) : REST comment-like vs socket comment-reaction notif type divergence.

## Backlog nettoyé
- **F53/F54 (HIGH)** : soldés en it.89, vérifiés présents sur `main` — retirés des reports.
- **F57 (LOW)** : inerte (`hasMentions`/`extractMentions` test-only ; usernames ASCII-validés) —
  clos sans changement.
