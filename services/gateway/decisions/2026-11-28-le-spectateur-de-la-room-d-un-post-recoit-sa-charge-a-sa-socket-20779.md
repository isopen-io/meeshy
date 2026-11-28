## Un spectateur de la room d'un post reçoit sa charge À SA SOCKET (2026-11-28, #20779, suivi de #20711)

**Date** : 2026-11-28 · **Issue** : #20779 · **Suivi de** : #20711, #20430, #20204

### Le constat

#20711 sert à chaque lecteur qu'un blocage sépare d'un COMPAGNON du post
(`repostOf`, l'aperçu des commentaires) une charge amputée de ce seul compagnon.
Il le fait en DEUX temps : les lecteurs séparés sortent de la charge commune —
par `except` sur leur room `user:`, qui porte sur toutes les adresses de
l'émission, `ROOMS.post(postId)` comprise — puis chacun reçoit la sienne.

**La seconde moitié n'itère que `recipients`**, seule liste énumérable. Un
spectateur présent dans la room du post SANS être dans l'audience sortait donc
de la charge commune sans en recevoir aucune autre : **zéro livraison**. Avant
#20711 il recevait la charge entière, donc la fuite — ce n'est pas une
régression de confidentialité, c'est une édition qui cesse d'apparaître en
direct pour qui a bloqué un commentateur ou un auteur republié.

Qui : quiconque a ouvert le détail d'un post, le reel viewer, la feuille de
commentaires ou le lecteur de story d'un post PUBLIC d'un inconnu (`post:join`
est gaté par visibilité côté serveur) et a bloqué un des trois commentateurs de
son aperçu ou l'auteur de sa source republiée.

### La mesure qui a tranché, et elle était le critère de fin

L'issue proposait trois formes et exigeait **le coût de `fetchSockets` MESURÉ sur
les deux adaptateurs, pas estimé**. Banc réel : `socket.io` 4.8.4 +
`@socket.io/redis-adapter` 8.3.0 (les versions du dépôt), `redis-server` local,
200 appels par ligne, commandes Redis comptées par un `Proxy` sur le client
`pub`.

| adaptateur | sockets dans la room | latence moyenne | commandes Redis / appel |
|---|---|---|---|
| mémoire (défaut) | 1 / 5 / 25 | **2 / 2 / 6 µs** | 0 |
| Redis, **1 nœud** | 1 / 5 / 25 | **63 / 71 / 71 µs** | **1** |
| Redis, **2 nœuds** (global) | 2 / 10 / 50 | **477 / 313 / 464 µs** | 1 + publish + attente |
| Redis, 2 nœuds (`io.local`) | 1 / 5 / 25 | **3 µs** | 0 |

Ce que la source de l'adaptateur dit, et que le compte confirme
(`dist/index.js:544-576`) : `fetchSockets()` fait sa lecture locale, **puis** un
`serverCount()` — un unique `PUBSUB NUMSUB`. Si `numSub <= 1`, il rend les
sockets locaux et **s'arrête** : d'où « une commande, indépendante du nombre de
sockets de la room ». Au-delà d'un nœud, il publie une requête, attend les
`numSub - 1` réponses — chacune portant le `handshake` complet de chaque socket
— et **REJETTE** après `requestsTimeout` (5 000 ms par défaut, non configuré).

**La production attache bien l'adaptateur Redis** (`docker-compose.prod.yml`
pose `REDIS_URL`), avec UNE réplique : le coût réel aujourd'hui est **un
aller-retour Redis de ~70 µs**.

Le relevé des sites d'appel a réduit le périmètre une seconde fois : des **huit**
appels de `emitPostToAudience`, **un seul passe `postRoom`** —
`broadcastPostUpdated`. Les sept autres familles (`*:created`, `post:reposted`,
`story:updated`, `status:updated`) n'adressent pas la room du post, n'ont donc
aucun spectateur hors audience, et ne paient rien.

> **Avant d'arbitrer entre « exact mais cher » et « gratuit mais faux », mesurer
> ce que le chemin paie DÉJÀ.** Cette branche fait deux lectures Mongo
> (`pairsAround`) avant d'arriver là. Un aller-retour Redis de 70 µs posé à côté
> n'est pas un arbitrage : c'est du bruit. L'arbitrage que l'issue annonçait a
> disparu une fois le chiffre obtenu — même forme que #20277 et que #20711, sur
> une dépendance externe au lieu d'une requête.

### La forme retenue — la 1, la seule exacte

`separatedCompanionSpectators` (`socketio/handlers/`) énumère la room du post et
rend les sockets à servir à part. `emitPostToAudience` leur sert chacune sa
charge par la MÊME fabrique `served` que ses trois autres chemins.

Les formes 2 et 3 sont écartées pour ce que l'issue écrivait déjà : la 2 ferait
perdre l'aperçu et la citation à **tout** spectateur, y compris celui que rien ne
sépare ; la 3 gèle une perte de direct dont le coût est maintenant chiffré à
70 µs.

**Trois décisions de forme, et chacune ferme une porte que la forme 1 ouvrirait :**

| décision | la porte qu'elle ferme |
|---|---|
| la charge part à la **SOCKET**, jamais à `ROOMS.feed(readerId)` | tout utilisateur connecté se tient dans sa propre feed room (`feed:subscribe`) : y émettre servirait le post à un lecteur ni spectateur ni dans l'audience, donc peut-être non autorisé |
| les rooms que l'axe de l'**AUTEUR** ferme sont soustraites (#20430) | leur servir une charge amputée des compagnons leur livrerait le **POST**, que le blocage de l'auteur leur refuse — une fuite plus grave que celle qu'on répare |
| les lecteurs **DÉJÀ servis** (l'audience, l'auteur) sont soustraits | les resservir à leur socket livrerait DEUX `post:updated` pour une édition, la forme exacte du défaut que `emitToUserFeedAndPostRoom` existe pour empêcher |

Et `postRoom.separated === null` ⇒ **on n'énumère pas**. L'axe de l'auteur n'a
pas pu être lu, #20430 n'adresse donc pas la room ; énumérer malgré tout
servirait le post à un lecteur dont on ne sait rien, sur la foi d'une panne.

### Les deux coûts assumés, écrits

- **Une énumération qui ÉCHOUE rend `[]`.** Le repli est l'état d'AVANT ce lot
  (le spectateur hors audience ne reçoit rien) : une perte de direct, jamais une
  fuite, et jamais pire que ce qu'on remplace. Le `catch` est au site, pas chez
  l'appelant : un rejet qui remonterait emporterait des émissions déjà parties.
- **Au-delà d'un nœud, le coût change de NATURE** — 1 commande devient 1
  commande + un publish + l'attente de `numSub - 1` réponses chargées de
  `handshake`, avec un rejet à 5 s. La garde tient le rejet ; elle ne tient pas
  la latence. Le lot qui ajoutera une seconde passerelle (#9232, cf. **#20780**)
  doit relire ce paragraphe — le chiffre y est pour qu'il n'ait pas à le
  remesurer.

### Ce que les mutations ont mesuré, et c'est la moitié utile du lot

Dix mutations rejouées contre les témoins LIVRÉS. **Deux étaient VERTES à la
première rédaction**, et elles disent deux choses différentes :

1. **Le court-circuit du cas nominal était écrit DEUX fois** — dans le module, et
   dans la condition d'appel (`apart.size === 0`). Mutée, chaque couche était
   couverte par l'autre : **131 témoins verts**. C'est « une défense en
   profondeur dont aucune couche n'est tenue perd une couche en silence » (audit
   de #20711), sur un coût au lieu d'un secret. **La redondance est RETIRÉE, pas
   doublée d'un témoin** : le site d'appel ne décide plus que de ce que lui seul
   sait — la room est-elle adressée ? — et le module décide seul s'il y a quelque
   chose à énumérer. Ce qui a permis de retirer sans rien payer : les deux
   ensembles de soustraction se construisent APRÈS le court-circuit, donc le cas
   nominal n'alloue toujours rien.
2. **Le fail-open de l'axe de l'auteur n'était tenu par rien.** Retirer
   `postRoom.separated === null` de la condition laissait **tous** les témoins
   verts. Réparé par un mode de panne CIBLÉ sur les deux requêtes dont les
   sujets sont exactement `[AUTEUR]` — faire lever TOUTE lecture de blocage
   ferait tomber le pré-filtre des feed rooms et déplacerait le défaut hors de
   l'audience, où plus aucune assertion ne peut le voir (constat C9 de #20430,
   qui frappe ici une troisième fois).

Et **un témoin manquait que seule une mutation pouvait nommer** : « rendre tous
les sockets sans filtrer sur la séparation » laissait tout vert, alors qu'il fait
recevoir au spectateur que rien ne sépare la charge commune **ET** une charge à
sa socket — deux `post:updated` pour une édition.

> **Aucune assertion `toContain` ne peut voir un DOUBLON ; seul un COMPTE le
> voit.** Un témoin de confidentialité demande « ce texte est-il parti ? » ; un
> témoin de LIVRAISON demande « combien de fois ? », et les deux ne se
> subsument pas. Toute boucle qui ajoute une adresse à une émission déjà
> dédoublonnée doit poser la seconde question.

**Une mutation est restée verte à juste titre, et il faut le dire** : servir la
charge par `withAudienceListFor(post, readerId)` au lieu de
`withoutAudienceList(post)`. `mayReadAudienceList` exige `post.authorId ===
viewerId`, et un spectateur n'est jamais l'auteur (il est soustrait par
`alreadyServed`) : les deux expressions rendent le MÊME objet. C'est une
mutation ÉQUIVALENTE, pas une garde non tenue — et confondre les deux ferait
poser un témoin qui ne peut pas tomber.

### Nature NEUVE au cliquet de la room du post

`post-room-separation-sweep.ts` déclarait quatre natures — émission gouvernée,
fabrique de rooms, adhésion, exemption motivée. Ce module en est une
**cinquième** : il **LIT** l'appartenance de la room et n'émet rien. Elle est
ajoutée plutôt que forcée dans une des quatre, parce qu'aucune ne la décrit, et
ce qu'elle ENGAGE lui est propre : sa sortie DÉCIDE qui sera servi à part, donc
c'est elle qui doit soustraire les rooms fermées — un verdict pris en aval ne la
rattraperait pas.

La raison déclarée de `socialEmissionCore.ts` a été mise à jour dans le même
mouvement : elle ÉNUMÉRAIT « les quatre primitives d'adresse », et une
énumération corrigée reste une énumération — celle-ci nomme désormais la
cinquième et dit qu'elle n'adresse pas la room mais la lit.
