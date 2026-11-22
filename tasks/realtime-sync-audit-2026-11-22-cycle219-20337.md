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
| `apps/android` | **OUI** — `CommentSheetRules.kt:65,80` (`CommentReactionLaw`) |
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

**La contrainte est plus dure que ce paragraphe ne l'a d'abord écrit**, et c'est
l'audit adversarial du lot qui l'a mesuré. `SocketCommentReactionAggregation`
(`packages/MeeshySDK/.../SocialSocketEvents.swift:169-174`) déclare `userIds` et
`hasCurrentUser` **NON optionnels** : un `Codable` Swift sur un champ absent
LÈVE. Couper `userIds` ne ferait donc pas seulement sur-compter les iOS
déployés — il ferait **échouer le décodage de `comment:reaction-added` en
entier**, et les compteurs vivants s'arrêteraient.

**Et la première version du tableau ci-dessus disait « Android : non ». C'était
FAUX.** `CommentReactionLaw.applying` / `.viewerHeart`
(`apps/android/core/model/.../CommentSheetRules.kt:65,80`) dérivent le cœur du
lecteur de `aggregation.userIds`, et leur doc-comment Kotlin le dit à voix
haute. Android est plus robuste qu'iOS (il a un repli quand le roster est VIDE)
mais un roster non vide AMPUTÉ du lecteur lui fait **RETIRER** son cœur
(`held - emoji`) là où iOS sur-compte. Ce lot ne déclenche ni l'un ni l'autre —
le lecteur garde toujours son propre id — mais #20410 était **mal cadré** : il
faut aussi `CommentSheetRules.kt` et un train Android.

> **Un relevé par `grep` mesure une ORTHOGRAPHE, pas une propriété** — la leçon
> du cycle 217, repayée ici sur la mesure CENTRALE du lot. Le mot `userIds` est
> si commun dans le dépôt (audiences de stories, participants, carnet) qu'un
> relevé non qualifié rend des centaines de lignes : j'ai lu l'absence du mot
> SUR CE TYPE là où il fallait lire la LOI qui consomme l'agrégat. **Une mesure
> qui porte une décision de contrat se fait sur le consommateur, en ouvrant les
> fichiers.**

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

## Deuxième tour — ce que l'audit adversarial a cassé, et qui est corrigé

L'agent `auditeur-adversarial` a rendu un verdict **BLOQUANT** sur le premier
tour. Les constats justes sont corrigés dans ce lot.

### CONSTAT 1 (critique) — le filtre gardait la CHAÎNE et recopiait le champ VOISIN

`getCommentReactions` ne rendait pas `CommentReactionAggregation` mais
`CommentReactionAggregationWithUsers` : l'agrégat **plus** un `users[]` portant,
pour chaque réacteur, son `username` (= `User.displayName`), son `avatar` et le
`createdAt` de sa réaction **à la seconde**. `rosterServedTo` faisait
`{ ...reaction, userIds: filtré }` — le spread recopiait `users` verbatim. L'ack
servi à qui avait bloqué X portait donc encore l'id de X **et son nom et son
avatar**, intacts même quand le roster était vidé : strictement PLUS que ce que
`userIds` divulguait.

> **C'est la leçon 275 dans sa forme la plus pure, et le lot la CITAIT dans le
> doc-comment du filtre fautif.** Écrire une règle ne l'applique pas au lot qui
> l'écrit. La question « la charge que ce site remet contient-elle autre chose
> que ce que je viens de garder ? » se répond en lisant l'objet remis LIGNE À
> LIGNE — je ne l'ai lu qu'à travers le type que je CROYAIS qu'il avait, et le
> type réel était déclaré vingt lignes plus haut dans le même fichier.

Deux corrections, pas une :

1. **`users[]` est COUPÉ à la source** (le type et l'enrichissement). Aucun
   client ne le décodait — ni `SocketCommentReactionSyncEvent` (iOS), ni
   `SocketCommentReactionSyncData` (Android), ni le web, qui n'écoute pas cette
   famille. L'argument de rétrocompatibilité qui oblige à garder `userIds` ne
   s'applique pas à un champ que personne ne lit. La coupe retire au passage la
   requête `user.findMany` que l'enrichissement imposait à chaque synchronisation.
2. **`rosterServedTo` PROJETTE une liste blanche au lieu de spreader.** C'est la
   correction structurelle, celle qui ferme la CLASSE : un champ nominatif ajouté
   en amont ne peut plus rider, et s'il est légitime il faudra l'ajouter au
   filtre — fail-closed, le bon défaut pour un filtre de confidentialité.

### CONSTAT 2 (élevée) — l'ACTEUR est un lecteur comme un autre

`rosterServedTo` ne gardait que la sync. Les ACK de `comment:reaction-add` /
`-remove` rendaient l'`updateEvent` **brut**, roster compris, et `keep: actorId`
laissait l'acteur **dans** la diffusion qui porte le même roster. Or rien
n'empêche l'acteur de réagir à un commentaire dont le roster nomme un compte
qu'il a bloqué : la porte d'action garde l'ACL du post et l'AUTEUR du
commentaire, jamais les RÉACTEURS — et le chemin de RETRAIT n'a pas même la
porte de l'auteur.

> Le doc-comment du premier tour décrivait ce vecteur mot pour mot — « R a bloqué
> X ; X réagit au commentaire de B ; R reçoit l'événement et y lit l'id de X » —
> **avec R dans le rôle du lecteur, et ne l'a pas vu avec R dans le rôle de
> l'ACTEUR.** J'avais même écarté explicitement le filtrage de l'ACK, en le
> jugeant « no-op puisque l'acteur reçoit aussi la diffusion » : la conclusion
> juste était de fermer les DEUX, pas aucun. **Un « c'est un no-op » qui porte
> sur UN des deux chemins d'une même charge est un aveu, pas un arbitrage.**

L'ACK est filtré par l'acteur (`updateEventServedTo`), et l'acteur **sort de la
diffusion dès que la séparation vient du ROSTER** — son `keep` reste son
privilège sur SES sujets (lui-même, l'auteur), jamais sur un tiers qui se trouve
avoir réagi. Séparé du seul AUTEUR, il garde sa diffusion : la décision de
#20236 est intacte, et un témoin de CONTRÔLE la garde.

### CONSTAT 5 (moyenne, chemin chaud) — le roster annulait le cache et vidait celui du voisin

Le roster change à chaque mutation : sa clé est à **usage unique**, donc la
lecture ne rend jamais de hit (mesuré par l'audit : trois réactions sur le même
commentaire, six lectures, aucun hit). Pire, `MAX_ENTRIES` déclenche un
`cache.clear()` — un **vidage complet**, pas une éviction LRU — si bien qu'un
flux de clés jetables évince les entrées des appelants STABLES, dont les sept
diffusions de CONTENU pour lesquelles ce cache a été écrit (#20216). Le
doc-comment du premier tour annonçait « ce qui change est le taux de succès du
cache » : il était en réalité **nul** ici, et dégradé chez le voisin.

La séparation est désormais **deux lectures** : la paire acteur/auteur (clé
STABLE, donc cacheable, `keep` appliqué) et le roster **hors cache**
(`roomsAround(roster, { cached: false })`). C'est aussi la doctrine du module —
« ce cache sert une AUDIENCE, jamais une AUTORISATION ».

### CONSTAT 8 — un garde qui ne sait pas filtrer doit REFUSER

`if (!Array.isArray(reactions)) return sync` servait la charge **non filtrée** :
fail-OPEN sur un prédicat de forme. Il lève désormais, et le `catch` de
l'appelant rend un ack d'erreur. Un tableau VIDE reste une forme connue — il n'y
a rien à taire.

### CONSTAT 9 — la fixture n'avait pas la forme réelle, et c'est ce qui a laissé passer le CONSTAT 1

`syncBrut` portait quatre champs quand la charge réelle en portait cinq, et
`rosterServedTo` était typée assez LARGEMENT pour qu'aucun témoin n'ait à
utiliser `CommentReactionSync`. Le harnais ne **pouvait pas** rougir sur le champ
voisin. La fixture porte maintenant la forme d'AVANT la coupe, de sorte que son
retour rougit, et un témoin assert sur ce que le SERVICE produit — plus sur ce
que le témoin lui donne.

> **Un témoin dont la fixture est plus pauvre que la production ne garde que la
> fixture.** C'est le jumeau de « un double partiel perd en silence tout ce que
> le module GAGNE » : ici le double n'était pas un module mais une CHARGE, et ce
> qu'il perdait était le champ exact où vivait la fuite.

### Ce que l'audit a trouvé SAIN, et qui compte autant

Pas de collision de clé de cache (tuple trié joint par NUL, qu'aucun id hex ne
contient) ; `keep` appliqué **après** le cache, donc deux acteurs partageant un
tuple obtiennent chacun la bonne réponse ; invalidation toujours couverte par les
deux seuls écrivains de `blockedUserIds` ; **aucune route REST ne sert de roster
de commentaire** (`getCommentReactions` n'a qu'un appelant) ; `comment:liked` /
`-unliked` ne nomment que l'acteur, déjà sujet de #20236 ; `PostReactionHandler`
et `PostReactionService` n'agrègent que des comptes ; l'absence de `_seq` est
réelle (`emitWithSeq` est user-scoped) ; le chemin anonyme ne régresse pas. Les
6 rouges / 4 verts du premier tour étaient réels, et les témoins de contrôle en
étaient bien.

### Une affirmation du premier tour, corrigée

« Deux lectures concurrentes rendent le même total final » est **faux comme
écrit** : chacune rend le total à l'instant où elle tourne, et c'est l'ORDRE DE
LIVRAISON qui peut les inverser — iOS persistant le compteur
(`FeedPersistenceActor`). La formulation juste, que porte désormais le
doc-comment : **la fenêtre existait déjà et s'élargit**, et un client qui doute
resynchronise.

## Suivi ouvert par le deuxième tour

- **#20410** (recadré) — la coupe de `userIds` exige iOS **et Android**, et côté
  Swift les deux champs sont NON optionnels : la coupe casse le DÉCODAGE, pas
  seulement le compte.
- **#20414** — réconcilier par écrit la doctrine d'ordonnancement avec
  `SocialEventsHandler.ts` et `separatedRooms.ts`, que ce lot contredit à moitié.
- **#20415** — l'oracle `count` > `userIds.length`, le `cache.clear()` sans
  éviction LRU, et la nuisance d'exclusion pilotée par la liste de blocage d'un
  tiers.
