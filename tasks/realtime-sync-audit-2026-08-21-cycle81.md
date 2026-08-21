# Cycle 81 — Le compteur de likes d'un commentaire ne savait que MONTER

**Date** : 2026-08-21
**Branche** : `claude/keen-hamilton-jixhnn`
**Périmètre** : contrat partagé, passerelle, web, SDK iOS, SDK Android

**Clients touchés** : les trois. **Un nom d'événement ajouté** au contrat
(`comment:unliked`) — aucun retiré, aucune charge existante modifiée.

---

## 1. D'où vient ce cycle

Le cycle 79 a produit le geste, le cycle 80 l'a rejoué d'un cran plus bas :
**prendre les transitions d'un même domaine et vérifier qu'elles forment une
grille CLOSE, montantes et descendantes appariées.**

Ce cycle applique le geste au niveau le plus littéral qui soit — la **table des
noms d'événements elle-même** (`packages/shared/types/socketio-events.ts`). Lus
en colonne, les couples sautent aux yeux :

```
post:liked        ↔  post:unliked          ✅
story:reacted     ↔  story:unreacted       ✅
status:reacted    ↔  status:unreacted      ✅
message:pinned    ↔  message:unpinned      ✅
…:participant-banned ↔ …:participant-unbanned  ✅ (cycle 79)
comment:reaction-added ↔ comment:reaction-removed ✅
comment:liked     ↔  ———                   ❌
```

Une seule ligne dépareillée sur toute la table. Ce n'est pas une omission de
nommage : c'est un défaut de production, et il était **déjà écrit noir sur blanc
dans un audit de juillet**, jamais corrigé
(`docs/superpowers/specs/2026-07-29-architecture-transport-services.md`) :

> **Le unlike REST n'est jamais diffusé** : `comments.ts` retourne sans aucun
> événement […]. Les autres clients gardent un compteur périmé, définitivement.

## 2. Le défaut, mesuré

`POST /posts/:postId/comments/:commentId/like` diffuse `comment:liked` — charge
ABSOLUE (`likeCount`) — vers **deux** adresses : la feed room de l'auteur du
commentaire, et la room du post (tous les lecteurs du fil).

`DELETE` de la même route ne diffusait **rien**. Elle rétractait la notification
(le symétrique EXISTAIT, et c'est ce qui rendait le trou peu visible : la moitié
« notification » de la paire était close, la moitié « temps réel » ne l'était
pas), puis rendait sa réponse.

| geste | ce que voit le liker | ce que voient les AUTRES |
|---|---|---|
| like | 0 → 1 | 0 → 1 (en direct) |
| unlike | 1 → 0 (sa propre réponse REST) | **1**, indéfiniment |

Les deux clients qui écoutent traitent la charge comme un instantané absolu —
web `handleCommentLiked` écrit `likeCount` tel quel, iOS `FeedSocketHandler`
aussi. Aucun des deux ne pouvait donc « deviner » la descendante : il n'y avait
rien à deviner, aucun octet n'arrivait.

**Pire sur iOS, et c'est le point qui fait passer le défaut de cosmétique à
durable** : `FeedSocketHandler.handleCommentLiked` **PERSISTE** la valeur reçue
(`persistence.updateCommentLikeCount`). Le compte gonflé ne survivait pas
seulement à la session — il survivait au **redémarrage de l'app**, jusqu'au
prochain REST qui touchait ce commentaire précis.

### Qui rattrapait, et en combien de temps

La question du cycle 79 (« avant de juger un no-op bénin, chercher QUI le
rattrape et EN COMBIEN DE TEMPS ») a la même réponse ici : **le prochain refetch
du fil de commentaires de ce post**, c'est-à-dire une ouverture de surface, pas
une horloge. Sur iOS, pas même ça : la valeur périmée est en base locale et sert
au démarrage à froid.

## 3. Le chemin socket était, lui, parfaitement clos

Il faut le dire pour délimiter le défaut. `CommentReactionHandler`
(`comment:reaction-add` / `-remove`) émet bien `comment:reaction-added` **et**
`comment:reaction-removed`, tous deux avec l'agrégat absolu, tous deux écoutés
par les trois clients.

Le trou est **exactement** au chemin REST — celui qu'empruntent le web
(`posts.service.ts`) et iOS (`PostService.swift`, `OutboxDispatcher`) pour le
cœur d'un commentaire. Autrement dit : le transport que les clients utilisent
vraiment pour ce geste était le seul des deux à ne pas savoir le défaire.

## 4. Le correctif : la jumelle, pas un rustine

`comment:unliked`, calque exact de `post:unliked` :

- **même forme de charge** que sa montante (`CommentUnlikedEventData` ≡
  `CommentLikedEventData`) — `likeCount` est le total **absolu APRÈS retrait**,
  jamais un delta ;
- **mêmes deux adresses** que sa montante (`broadcastCommentUnliked` est le
  miroir ligne à ligne de `broadcastCommentLiked`) ;
- **même `postId` que la pose** : celui du COMMENTAIRE (`thread.postId`), jamais
  le `:postId` de l'URL — l'invariant que la route de pose porte déjà, avec son
  propre témoin (un repost simple fait diverger les deux pour de vrai).

Un `−1` aveugle aurait été doublement faux : non idempotent sous double
livraison, et incapable de rattraper un événement manqué. L'absolu donne les
deux gratuitement — c'est la raison d'être de la forme, déjà écrite pour
`post:liked` et pour les agrégats de réaction.

**Une seule forme de payload côté clients.** iOS et Android réutilisent le type
de la montante pour la descendante, comme `SocketCommentReactionUpdateEvent`
sert déjà `added` ET `removed` : le SENS vit dans le sujet/flux, pas dans les
champs. Pas de struct jumelle recopiée.

### Ce qui a été câblé

| couche | fichier | geste |
|---|---|---|
| contrat | `packages/shared/types/{socketio-events,post}.ts` | nom + type + map serveur→client |
| passerelle | `socketio/handlers/SocialEventsHandler.ts` | `broadcastCommentUnliked` |
| passerelle | `routes/posts/comments.ts` | diffusion depuis le DELETE |
| web | `hooks/queries/use-post-socket-cache-sync.ts` | `handleCommentUnliked` + on/off |
| iOS SDK | `Sockets/SocialSocketManager.swift` | sujet `commentUnliked` + `socket.on` |
| iOS app | `ViewModels/FeedSocketHandler.swift` | abonnement → même écriture persistée |
| Android SDK | `socket/SocialSocketManager.kt` | flux `commentUnliked` + `listen` |

## 5. Ce qui a été vérifié

| garde | résultat |
|---|---|
| `comments-like-delete` (route) | 16/16, dont 2 témoins neufs |
| `SocialEventsHandler` (×2 suites) | 135/135 avec les 2 précédentes |
| `use-post-socket-cache-sync` (web) | 115/115, dont 4 témoins neufs |
| suite gateway complète | (voir §7) |
| suite web complète | (voir §7) |

**Preuve par mutation** — chaque garde neuve prouvée LIANTE en la neutralisant :

- diffusion de la route neutralisée (`if (false && …)`) ⇒ **1 rouge**, le témoin
  de diffusion exactement ;
- `socket.on(COMMENT_UNLIKED)` retiré côté web ⇒ **3 rouges**, les trois témoins
  de cache.

Le rouge initial, avant tout code de production, était `Number of calls: 0` — le
silence de la route, mesuré et non supposé.

Les témoins neufs ne sont pas que positifs :
- **idempotence** : la même charge livrée deux fois ne retire pas deux fois
  (c'est ce qui rend la jumelle rejouable après une reconnexion) ;
- **portée** : un commentaire vivant dans le cache des RÉPONSES est atteint
  (`commentReplies` est un descendant de préfixe de `posts.comments`) ;
- **absence de destinataire** : `authorId` nul ⇒ aucune diffusion, comme à la
  pose — pas d'`emitToUser(undefined)` ;
- **négatif** : un `commentId` étranger ne bouge rien.

## 6. Limites assumées

**Swift et Kotlin ne sont pas compilables dans ce conteneur** (aucun toolchain).
Les deux diffs y sont des miroirs ligne à ligne d'un bloc voisin existant, et
les trois conformances de `SocialSocketProviding` (le manager + les deux mocks)
ont été mises à jour ensemble — mais la preuve vient de la CI : `ios.yml`
(compile-only sur PR, `apps/ios/**` + `packages/MeeshySDK/**`) et `android.yml`
(`assembleDebug` + `testDebugUnitTest`). Pas de merge avant leur vert.

**Aucun consommateur Android** ne collecte `commentLiked` aujourd'hui — la
descendante y est donc, comme sa montante, une couche miroir du fil sans lecteur
applicatif. C'est délibéré : laisser une demi-paire dans une couche dont le rôle
EST de refléter le contrat serait reproduire le défaut du cycle dans un
troisième endroit.

## 7. Pistes laissées ouvertes

**La table a été relue en entier ; il reste UN dépareillé, et il est bénin.**
`post:bookmarked` n'a pas de `post:unbookmarked` — mais sa charge porte
`bookmarked: boolean` (les deux sens voyagent sur le même nom), et l'événement
est **personnel** (`emitToUser` vers l'acteur seul). Pas de tiers à tenir à
jour : hors classe, comme `PushPermissionBanner` l'était au cycle 80.

**Le reste du constat de juillet tient toujours**, et ce cycle n'y touche pas :
REST et socket gardent, pour la réaction de commentaire, deux services complets
(`PostCommentService` / `CommentReactionService`), deux interprétations opposées
de l'invariant « une réaction max », et deux familles d'événements. Unifier
demande une décision produit, pas un correctif.

**Domaines nommés au cycle 79/80, toujours ouverts** : appartenance à une
communauté, épinglage/archivage de CONVERSATION, blocage/déblocage d'un contact.
Vérifié au passage : aucun de ces trois n'a d'événement temps réel dans le
contrat — leur grille est donc à instruire côté REST, pas côté socket.

**Dette d'environnement, inchangée depuis le cycle 79** : `npx eslint` échoue
dans ce conteneur (un ESLint global sous `/opt/node22` est résolu à la place de
celui du dépôt). Reproduit sur un fichier non touché — l'environnement, pas le
diff. Le lint tourne en CI.
