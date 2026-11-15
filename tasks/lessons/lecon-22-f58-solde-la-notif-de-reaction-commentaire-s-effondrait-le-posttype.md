## Leçon 22 — F58 soldé : la notif de réaction-commentaire s'effondrait le postType vers un booléen `isStory` (2026-07-04, itération 96)

Même classe de bug que le fix post-reaction déjà accepté (« Hardcoding 'POST' here dropped that
typing on every socket-path reaction »). `createCommentReactionNotification` prenait
`isStory?: boolean` et posait `metadata.postType: isStory ? 'STORY' : 'POST'` — un REEL/STATUS
portant un commentaire réagi produisait `metadata.postType: 'POST'` + un corps « … sur le post de X ».
La sœur `createPostLikeNotification`, sur le même contenu, portait déjà le vrai
`postType?: 'POST'|'STORY'|'MOOD'|'STATUS'|'REEL'` sans collapse. Fix en 3 points miroir : (1) shared
`COMMENT_CONTEXT` élargi de `{story, post}` à un `ObjMap` complet (5 `NotificationPostKind` × 8
langues), en réutilisant les choix de noms des tables voisines (`INDEF_OBJ`/`LOC_OBJ`) pour la
cohérence de genre/casse ; (2) `createCommentReactionNotification` prend `postType` (mirror de la
sœur), body + metadata sans collapse ; (3) `CommentReactionHandler` forwarde `post?.type` au lieu de
`isStory = post?.type === 'STORY'`. **Garde-fou legacy conservé** : la branche `reaction.commentVerbose`
résout `kind = params.postType ?? (params.isStory ? 'STORY' : 'POST')` — `postType` prime, `isStory`
reste un repli inerte quand `postType` est fourni → les 2 tests `isStory:true/false` existants restent
verts sans réécriture. Zéro changement iOS/web/DB : la sœur post-reaction émettait déjà REEL/STATUS
en `metadata.postType`, donc les clients gèrent déjà ces valeurs.

**Ménage de backlog fait ce cycle (règle réutilisable)** : toujours VÉRIFIER dans le code qu'un item
listé « parké » l'est encore avant de le retenir. Les reports it.90→94 listaient F53/F54 (HIGH) comme
parkés alors qu'ils étaient soldés en it.89 et présents sur `main` (lecture directe de
`PostFeedService.ts` + `attachment-validators.ts`) — un report se périme si l'itération qui solde ne
nettoie pas la liste en aval. **Note F57** : ce cycle avait pré-évalué F57 comme inerte côté
consommateurs de prod (`hasMentions`/`extractMentions` référencés uniquement par des tests, chemins
d'extraction de prod sur usernames ASCII-validés `/^[a-z0-9_]{1,30}$/`) ; une itération parallèle
(it.95 sur `main`) l'a néanmoins durci défensivement — les deux constats coexistent, F57 est clos.
Leçon transverse : toujours grep les call-sites non-test AVANT d'inscrire (ou de clore) un item comme
dette — et vérifier `origin/main` juste avant de statuer, un cycle parallèle peut l'avoir traité.
