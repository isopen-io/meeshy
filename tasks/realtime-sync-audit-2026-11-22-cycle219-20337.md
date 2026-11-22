# Cycle 219 — le roster d'une réaction de commentaire ne nomme que des comptes autorisés (#20337)

Suivi du cycle 218 (audit adversarial de #20236, constat 3). Lot gateway seul.

## Le défaut

#20236 a fermé les **rooms** des quatre événements d'activité d'un commentaire,
en nommant DEUX sujets : l'ACTEUR (`userId` dans la charge) et l'AUTEUR du
commentaire (dont le compteur bouge). Il ne pouvait pas fermer ce que la
**charge** transporte.

`CommentReactionAggregation.userIds` (`packages/shared/types/post.ts:673`) est le
roster NOMINATIF de tous les réacteurs, et il voyage sur deux chemins :

| chemin | forme de la charge | fuite |
|---|---|---|
| `comment:reaction-added` / `-removed` | UNE charge, N lecteurs | R a bloqué X ; X réagit au commentaire de B ; R n'est séparé ni de l'acteur ni de B, donc il REÇOIT l'événement — et y lit l'id de X |
| `comment:reaction-request-sync` | ack NOMINATIF | un `commentId` suffit : la porte garde l'AUTEUR (`commentAuthorSeparatedFrom`), jamais les RÉACTEURS |

## Deux mécanismes, parce qu'il y a deux formes de charge

**Diffusion — le roster est le TROISIÈME SUJET.** Une charge unique pour N
lecteurs n'admet aucun filtrage par lecteur : la seule lecture honnête de la
leçon 275 (« une protection se mesure sur tout ce que la charge TRANSPORTE »)
est que chaque id que la charge NOMME est un sujet de l'exclusion, au même titre
que l'acteur et que l'auteur. `separationAround` reçoit donc le roster, et
`roomsAround` lit les deux sens pour tous les sujets **en deux requêtes, quel
que soit leur nombre**.

**Synchronisation — un ack nominatif se FILTRE par lecteur.** `rosterServedTo`
retire de chaque `reactions[].userIds` les ids que `blockedIdsAroundViewer`
nomme. Filtrer vaut mieux que refuser, et le lecteur ne perd jamais son PROPRE
id — on n'est séparé de personne de soi-même —, donc rien de ce qu'il dérive de
« suis-je dans le roster ? » ne change. Les `count` ne bougent pas : un agrégat
sans identité n'est pas visé, et un compte par lecteur ferait diverger le même
commentaire d'un lecteur à l'autre pour un gain nul (même décision que les
compteurs bruts de `separatedCommentAuthors.ts`).

## Ce que le lot NE fait pas, et pourquoi — la mesure que l'issue demandait

L'issue proposait de **couper `userIds`** comme `PostReactionAggregation` l'a
reçu (« NO userIds, count only », six lignes plus loin dans le même fichier), en
précisant que le choix est une décision de contrat « à mesurer sur les trois
clients avant de trancher ». **Mesuré : la coupe n'est pas neutre.**

| client | consomme `aggregation.userIds` ? |
|---|---|
| `apps/web` | **non** — aucune occurrence hors tests |
| `apps/android` | **non** — aucune occurrence sur ce type |
| `apps/ios` | **OUI** — `PostDetailViewModel.swift:697,711` et `CommentsSheetLiveSync.swift:62` |

`CommentHeartLedger.reconcile` (`apps/ios/.../CommentHeartLedger.swift:53`)
dérive « mon cœur » de `reactorUserIds.contains(myUserId)` — et **pas** de
`hasCurrentUser`, que son doc-comment dit juste : il est calculé côté gateway
relativement à l'ACTEUR, donc faux pour les destinataires d'un broadcast.

Déroulé sous un roster coupé, pour un lecteur qui avait réagi, sur l'événement
d'un TIERS : le test `reactorUserIds.contains(me)` échoue, `actorUserId == me`
échoue, et la branche terminale rend `likedIds.contains ? count + 1 : count` —
**un cœur de trop**, le `count` absolu du serveur comptant déjà le lecteur. Ce
sont les clients **déjà déployés** qui le paieraient, ce que la
rétrocompatibilité interdit (#9223 : « un ancien client fonctionne contre le
nouveau serveur »). La coupe se décide avec un train de release, pas dans un
lot de confidentialité — suivi : **#20410**.

> **Une coupe de charge utile et une exclusion d'audience ne répondent pas à la
> même question.** La première change le CONTRAT et se paie chez les clients
> déployés ; la seconde change l'AUDIENCE et ne se paie que chez ceux que la
> règle visait déjà. Devant une fuite de roster, mesurer qui LIT le roster avant
> de choisir : l'issue proposait les deux options à égalité, la mesure les
> sépare.

## Ce que le lot change d'autre, et qu'il faut dire

La séparation est désormais lue **APRÈS** la mutation, puisque le roster est
produit par `createUpdateEvent` et par lui seul. #20236 la lisait avant, « pour
que l'émission reste synchrone après elle (l'ordre du fil porte un compteur
d'agrégation) ».

Cette phrase est juste du chemin LIKE (`SocialEventsHandler`, où l'émission est
réellement synchrone) et **était déjà inexacte ici** : `createUpdateEvent` est
une lecture en base, donc un `await` siégeait déjà entre la mutation et
l'émission. La fenêtre de réordonnancement s'élargit d'un `await` ; elle ne
s'ouvre pas. Ces deux événements voyagent sans curseur `_seq` et portent un
compteur ABSOLU — deux lectures concurrentes rendent le même total final, et un
client qui doute resynchronise. L'`unchanged` / `!removed` en dispense : un
no-op ne lit rien.

Coût d'audience assumé : un lecteur séparé d'un seul réacteur perd la mise à
jour VIVE du compteur de ce commentaire (il la retrouve à la lecture suivante).
C'est l'arbitrage que #20236 a déjà posé pour ses deux sujets — « on ne diffuse
pas une activité sans savoir à qui la taire ».

## Les témoins

`src/socketio/handlers/__tests__/comment-reaction-roster-20337.test.ts`, 10
témoins, construits sur le harnais de #20236 (faux `io` qui relève le triplet
`(événement, rooms, exclues)` et la charge telle qu'elle part).

Le ROUGE est prouvé : avant le correctif, **6 rouges / 4 verts** — les 4 verts
étant exactement les témoins de CONTRÔLE (aucun blocage, roster vide, fail-closed
de la diffusion, roster entier servi), ceux qui doivent passer dans les deux
états.

Les deux SENS du blocage sont séparés sur chacun des deux chemins : un témoin
posé sur le seul sens « le lecteur a bloqué » reste vert sous un correctif qui
n'en lit qu'un.

## Gates

| gate | résultat |
|---|---|
| suite du lot | **10 / 10** |
| `src/socketio/handlers/__tests__/` + `CommentReactionHandler` + `comments-like-delete` | **56 suites, 1078 témoins, 0 rouge** |
| `tsc --noEmit` (gateway) | **exit 0** |
| suite complète du gateway | voir le commentaire de clôture de #20337 |

## Suivi

- **#20410** — couper `userIds` de la charge de `comment:reaction-*` (parité avec
  `PostReactionAggregation`) exige d'abord de rendre `CommentHeartLedger`
  indépendant du roster, puis un train de release iOS. Décision de contrat.
- `hasCurrentUser` reste sur le fil, **faux par construction** pour tout
  destinataire d'un broadcast qui n'est pas l'acteur, et lu par aucun client
  (mesuré). Il part avec #20410, pas avant.
