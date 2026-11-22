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

## Troisième tour — l'exclusion de l'acteur était PIRE que le défaut qu'elle corrigeait

Le deuxième audit adversarial a rendu BLOQUANT sur **un seul** correctif du
deuxième tour, et il avait raison.

### T2-1 / T2-2 — exclure l'acteur lui infligeait le cœur de trop

Le deuxième tour avait fermé le CONSTAT 2 en SORTANT l'acteur de la diffusion
quand un réacteur l'en sépare. Mesuré : c'est le défaut même que ce lot refuse
d'infliger aux tiers, déplacé sur l'acteur.

`CommentHeartLedger` (iOS) le dit dans son propre doc-comment — « Displayed
likes are `likes + delta`; **a socket aggregate is authoritative and clears the
delta** » — et `settle(_, delivered: true)` fait `guard !delivered else
{ return }` : après un envoi réussi, le delta optimiste est **CONSERVÉ**, en
attente de la DIFFUSION. `reconcile` est le seul site qui le purge
(`likeDelta[commentId] = nil`), et il n'est branché que sur la diffusion — l'ACK
est **jeté** par les deux clients (iOS `_ = try await …`, Android ne lit que
`success`).

Donc : acteur exclu ⇒ `reconcile` ne tourne jamais pour lui ⇒ le `+1` reste ⇒ au
premier rafraîchissement REST, `likes` repasse à la valeur serveur, **qui compte
déjà sa réaction**, et `displayedLikes = likes + 1` **indéfiniment**, sur la
ligne qu'il vient de toucher. Et `except(ROOMS.user(actor))` retirant TOUS ses
sockets, ses autres appareils restaient sur un compteur périmé **que iOS
persiste** (`FeedPersistenceActor`) : divergence entre deux appareils d'un même
compte.

> **Fermer l'AUDIENCE au lieu de la CHARGE n'avait pas supprimé le défaut : il
> l'avait déplacé du tiers vers l'acteur** — sur le seul lecteur dont on était
> certain qu'il recevrait l'événement. Un correctif de confidentialité qui
> retire un événement à quelqu'un doit se demander **ce que cet événement
> FAISAIT chez lui**, pas seulement ce qu'il lui apprenait.

**Le correctif, et il est unique** : l'acteur n'est plus jamais `keep` — il sort
de la diffusion de room dans TOUS les cas — et reçoit sa charge **SERVIE** sur
sa room personnelle (`emitToActor`, donc tous ses appareils), filtrée pour lui.
`ROOMS.user(actorId)` est le second endroit où un filtrage par lecteur est
possible, et le lot calculait déjà la valeur : `updateEventServedTo` cesse
d'être une lecture payée pour un ACK que personne ne lit, elle devient la charge
servie. La décision de #20236 — « un sujet ne s'exclut pas de son PROPRE
événement » — est mieux tenue qu'avec `keep`, puisqu'il le reçoit quelle que
soit la séparation.

### T2-3 — le témoin de contrôle du deuxième tour NE POUVAIT PAS TOMBER

Le commit du deuxième tour écrivait : « séparé du seul AUTEUR il garde sa
diffusion, témoin de contrôle à l'appui ». **Faux dès que l'auteur a lui aussi
réagi** — un auteur qui aime son propre commentaire, ce que rien n'interdit :
il devient alors un sujet du ROSTER, qui n'avait pas de `keep`. Le témoin passait
`roster: [ACTEUR]`, donc l'auteur n'était pas dans l'ensemble qui pouvait le
contredire, et le bon comportement comme le mauvais rendaient le même verdict.

> C'est la leçon 261 portée au SUJET : **un témoin qui garde « seulement
> l'auteur » doit mettre l'auteur dans l'ensemble qui pourrait le contredire.**

Le témoin porte désormais `roster: [ACTEUR, AUTEUR_COMMENTAIRE]`, et le chemin
est VIVANT — `handleRemoveReaction` n'a pas de porte
`commentAuthorSeparatedFrom`, par décision écrite.

### T2-4 / T2-6 — le lot avait recréé le spread qu'il venait de condamner

`updateEventServedTo`, **née dans le tour qui condamnait le spread**, spreadait :
`{ ...event, aggregation: { ...event.aggregation, userIds: filtré } }`. Aucune
fuite aujourd'hui, mais c'est la forme exacte du CONSTAT 1, écrite à quarante
lignes du doc-comment qui dit « UNE LISTE BLANCHE, JAMAIS UN SPREAD ». Les deux
filtres projettent maintenant, **inconditionnellement** : un repli « rien à taire
⇒ je rends la charge telle quelle » faisait dépendre la FORME servie du lecteur,
donc un champ ajouté en amont aurait disparu **pour les seuls lecteurs qui ont
des blocages** — le défaut le plus coûteux à reproduire qui soit.

Les trois verdicts de forme sont alignés entre les deux filtres : clé ABSENTE ⇒
forme connue, rien à taire (et projeter y AJOUTERAIT une clé, ce qui casserait
« ACK == ce que l'acteur reçoit ») ; valeur présente non-tableau ⇒ **refus**.

### Un double PARTIEL, et il a fait accuser le code au lieu du harnais

`CommentReactionHandler.test.ts` doublait `@meeshy/shared/types/socketio-events`
avec deux entrées de `SERVER_EVENTS` et le seul `ROOMS.post`. Sous ce double,
`ROOMS.user` valait `undefined` : l'émission à l'acteur **jetait**, la diffusion
n'avait jamais lieu, et trois témoins rougissaient en accusant le lot.

> C'est l'anti-patron que le dépôt documente **quatre fois** (cycles 86, 91, 93,
> 104) — « un double partiel perd en silence tout ce que le module GAGNE », et il
> ne se signale qu'au moment où le module grandit. Pour un module de CONSTANTES
> PURES, le remède n'est même pas `jest.requireActual` : c'est **l'absence de
> double**. Le double est supprimé.

### Les témoins de #20236 mis à jour, et pourquoi ce n'est pas un relâchement

Quatre témoins de `comment-activity-separated-20236.test.ts` assertaient
`exclues` par ÉGALITÉ. L'acteur sortant désormais toujours de la room, ils
mettent sa room de côté (`tiersExclus`) et gardent la propriété de #20236 — « qui
a bloqué l'acteur ou l'auteur est TU », intacte et toujours séparée par sujet.
La question de l'acteur est gardée **chez elle**, par un témoin qui assert qu'il
REÇOIT, et pas seulement qu'il n'est pas exclu — « un contrôle existe s'il a un
effet ». Les huit témoins `comment:liked` / `-unliked` (`SocialEventsHandler`,
non touché) restent verts sans changement : c'est la preuve que le MÉCANISME a
changé pour deux familles, pas la règle pour quatre.

### Ce que l'audit a trouvé SAIN au deuxième tour

`users[]` n'a plus aucune trace vivante et aucun consommateur ne l'attendait ; la
liste blanche ne perd rien (`CommentReactionAggregation` porte exactement ces
quatre champs, et les trois décodeurs clients n'en lisent pas d'autres) ; le
`throw` du CONSTAT 8 est inatteignable (un piège armé, pas un chemin) ; le
`cached: false` ne lit ni n'écrit le cache et le roster ne figure nulle part dans
la clé cacheable ; le fail-closed des deux lectures est intact, et un roster VIDE
rend `[]` **avant** le `try`, donc aucune panne n'est tue.

## Gates du troisième tour

| gate | résultat |
|---|---|
| témoins du lot | **19 / 19** |
| `socketio/handlers/__tests__/` + `__tests__/unit/socketio/` + `CommentReactionService` ×2 + `comments-like-delete` + cliquet de journal | **162 suites / 2 162 témoins, 0 rouge** |
| `tsc --noEmit` (gateway) | **exit 0** |
| suite complète du gateway (2e tour) | **45 066 verts / 3 028 suites** ; les **6** rouges de codec d'image (HEIF/AVIF/EXIF) **prouvés pré-existants** par retrait du lot de l'arbre |

## Quatrième tour — un cliquet que je n'avais pas lancé était ROUGE

Le troisième audit adversarial a rendu BLOQUANT sur un point, et c'était **un
gate du dépôt que mon filtre de témoins n'avait pas atteint**.

### T3-1 — `emitToActor` recréait MOT POUR MOT la neuvième porte d'émission

```ts
(this.io.to(ROOMS.user(actorId)) as unknown as { emit: (e: string, p: unknown) => unknown })
  .emit(event, payload);
```

À comparer à l'exemple que le doc-comment du balayage donne de ce qu'il a été
écrit pour attraper (`socketio/__tests__/server-emit-door-sweep.ts`) : **même
expression, même room `ROOMS.user(…)`, même `as unknown as`**. C'est la NEUVIÈME
porte du cycle 105 — celle qui avait échappé au balayage du cycle 104 et qui a
motivé l'ajout de sa seconde forme au discriminant. Le cliquet la nommait en
rouge, avec ma déclaration en clair.

Ce que cela coûtait n'est pas un cliquet : **le couple `(événement, charge)`
d'une ADRESSE D'ÉMISSION NEUVE n'était vérifié par rien** — mesuré par le dépôt
au cycle 108 sur cette forme exacte, un nom inventé et une charge fausse
compilent tous deux à zéro erreur, et une diffusion Socket.IO n'a aucun
sérialiseur pour rattraper l'écart (classe du défaut du cycle 101). Et la
signature `(event: string, payload: unknown)` effaçait le couple jusqu'au SITE
D'APPEL — la quatrième forme, #18649.

Correctif : `emitToActor<E extends ServerEventName>` + `emitServerEvent`, la
jumelle que `PostReactionHandler` emploie depuis toujours. **Le cast était
gratuit** : `tsc --noEmit` rend exit 0 sans lui.

> **Un gate rend DEUX verdicts, et c'est celui qu'on n'a pas demandé qui
> compte.** Mes « 162 suites / 2 162 témoins » avaient filtré sur
> `comment*` / `CommentReaction*` ; le cliquet qui garde précisément ce que ce
> tour changeait — la topologie d'ÉMISSION — vit sous `src/socketio/__tests__/`.
> **Un lot qui change une classe de code se gate sur le RÉPERTOIRE de cette
> classe, pas sur le nom de sa feature.** C'est la leçon du #20354 (« un lot qui
> change ce qu'une plateforme OBSERVE se gate chez celui qui tient
> l'inventaire ») appliquée à l'émission.

### T3-2 — une panne de lecture après un commit annulait l'événement pour toute la salle

`updateEventServedTo` est appelée APRÈS que la mutation est committée. Laisser
lever plaçait le `catch` du handler devant une écriture RÉUSSIE : l'ACK rendait
`success: false`, `separationAround` n'était jamais appelée, et la diffusion
était annulée **pour toute la salle** — alors que sa propre lecture de blocage
aurait peut-être abouti. Et le delta optimiste de l'acteur n'étant jamais purgé,
**le cœur de trop revenait par cette porte**, celle que le tour précédent venait
de fermer.

L'arbitrage est celui de `NotificationService.messageLiveness` — trois états, et
`unknown` se traite selon ce qui est en jeu : fail-CLOSED sur le SECRET,
fail-OPEN sur la LIVRAISON. Ici **le secret est le ROSTER, pas l'événement** :
un roster VIDE ne nomme personne, donc il se vide et l'événement part. Témoin
dédié, dont le double ne fait lever QUE `findUnique` (la lecture propre à
`blockedIdsAroundViewer`) pour que l'audience reste lisible — un double qui
ferait tout lever ne distinguerait pas les deux pannes.

### Ce que le troisième audit a trouvé SAIN, et qui tranche ma question ouverte

**La room personnelle EST une adresse fiable, mesuré et non supposé** — je
proposais de revenir en arrière si elle ne l'était pas : `socketToUser` n'a
qu'UN écrivain (`_registerUser`), ses deux appelants rejoignent
`ROOMS.user(clé)` **avant** l'enregistrement (la raison est écrite sur place), la
clé est la même des deux côtés, et l'anonyme n'atteint jamais ce chemin (les
réactions le refusent). Bénéfice non prévu : l'acteur reçoit désormais
l'événement **même s'il n'a jamais rejoint `post:<id>`** (réaction depuis le fil,
sans ouvrir le détail) — avant, il n'avait rien.

**Une seule livraison** (`separated` porte toujours sa room, `new Set`
dédoublonne), **`count` identique dans les deux charges** (la liste blanche le
recopie, seul `userIds` diffère), et **l'acteur ne peut pas comparer les deux**
(tous ses sockets sont exclus de la room). **Aucun client ne filtre par ROOM** —
une room est un concept serveur, et les cinq consommateurs filtrent par `postId`
— donc rien n'est servi dans le vide. Le `throw` de forme reste inatteignable.

## Suivi ouvert par le quatrième tour

- **#20418** — Android garde un cœur retiré sur son SECOND appareil quand le
  roster servi est VIDE avec `count > 0` (`CommentReactionLaw` n'a pas la branche
  « je suis l'acteur » qu'iOS a). Et `hasCurrentUser` cesse d'être faux par
  construction sur une charge servie PAR LECTEUR : c'est le correctif le moins
  cher, et il recadre #20410.
- **#20415** (élargi) — l'`emit` supplémentaire est INCONDITIONNEL, donc un
  PUBLISH Redis de plus par réaction de commentaire ; et la piste « une seule
  lecture du jeu de blocage de l'acteur » (six lectures par ajout aujourd'hui)
  reste ouverte.

### T3-3 bis — le filtre était GÉNÉRIQUE, donc sa reconstruction n'était vérifiée par RIEN

Trouvé en instruisant ma propre crainte sur le quatrième tour : la liste blanche
RECONSTRUIT l'agrégation champ par champ, et les deux filtres étaient typés par
une contrainte structurelle qui déclarait les quatre champs **optionnels**
(`T extends { aggregation?: { emoji?: string; … } }`). Le compilateur ne
confrontait donc la reconstruction à AUCUN contrat : un cinquième champ requis
ajouté à `CommentReactionAggregation` aurait été silencieusement SUPPRIMÉ du fil,
et c'est exactement la classe du défaut du cycle 101 (`message:edited` servi sans
`senderId`, rejeté en silence par les décodeurs iOS pendant des mois).

Les deux filtres sont désormais typés sur les types CONCRETS
(`CommentReactionUpdateEvent`, `CommentReactionSync`). **Mesuré** : sous la
mutation qui retire `hasCurrentUser` de la reconstruction, `tsc` rend

```
error TS2741: Property 'hasCurrentUser' is missing in type
'{ emoji: string; count: number; userIds: any[]; }'
but required in type 'CommentReactionAggregation'
```

Sous l'ancienne signature générique, la même mutation compilait. La garde est
donc un TYPE, pas un espoir — et c'est la règle du cycle 217 : « quand la
propriété à garder est une propriété de TYPE, la garde doit être un TYPE ».

> **Une liste blanche est un inventaire, et un inventaire se périme.** C'est le
> prix de la projection : elle ferme la classe du champ qui RIDE (leçon 275) et
> ouvre celle du champ qui MANQUE. Les deux se ferment, mais pas par le même
> moyen — la première par la projection, la seconde par le type concret qui la
> confronte au contrat.
