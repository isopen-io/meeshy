# Cycle 160 — qui ENTRE dans une room, et qui le sait

*2026-11-14. Branche `claude/exciting-planck-sahr3j`, partie de `dev` à
`8fa0af9ad` (la tête juste après la fusion de #18437).*

**Livré** : #18381 (le suivi le plus cher du cycle 159), #16726 (ouverte depuis
#16687, « confirmée vivante » par trois cycles sans être prise), et #18444 —
trouvé par l'audit de ce cycle en reprenant la question de #18381 sur les
autres portes du manager.

Les trois lots forment **une seule classe**, et c'est ce qui les a fait venir
ensemble : *une carte node-locale est une réponse fausse dès qu'un adaptateur
existe*, et *un fait de SOCKET rangé dans une entrée par COMPTE se perd au
premier second appareil*. Leçon :
`tasks/lessons/2026-11-14-une-carte-node-locale-est-une-reponse-fausse-des-qu-un-adaptateur-existe.md`.

---

## Lot A — la porte de MI-SESSION n'avait ni réessai, ni marqueur, ni adaptateur (#18381)

Un compte ajouté à une conversation **pendant qu'il est connecté** y entre par
`joinUserToConversationRoom`. Sa JUMELLE — la porte d'AUTHENTIFICATION — porte
depuis #16687 trois choses que celle-ci n'avait pas :

| | authentification | mi-session (avant ce lot) |
|---|---|---|
| réessais | 3 tentatives (`joinConversationRoomsWithRetry`) | une seule |
| échec définitif | marque `unreachableConversations` | **rien** |
| portée | la socket qui s'authentifie, par définition locale | `userSockets` + `io.sockets.sockets`, NODE-LOCALES |

**Le marqueur n'est pas décoratif : c'est la SEULE chose qui réarme la file
hors ligne.** Sans lui, le compte est `connectedUsers.has(key) === true` sans
marqueur : `enqueueForOfflineParticipants` le SAUTE parce qu'il se croit
joignable, pendant que `io.to(ROOMS.conversation(id))` le manque aussi. Chaque
message, édition, suppression, réaction et épingle de cette conversation ne va
**nulle part** — et rien n'est rejoué à la reconnexion, puisque rien n'a été
écrit. C'est exactement le mode de panne que #16687 a fermé sur une porte et
laissé ouvert sur l'autre.

La loi vit désormais dans `socketio/midSessionRoomAdmission.ts` ; le manager
n'est plus qu'un câblage de dépendances (et perd 20 lignes, ce qui est le sens
où ce fichier doit aller).

### Le verdict dit ce que le nœud peut PROUVER

| ce que le nœud voit | verdict |
|---|---|
| au moins une socket locale a rejoint | joignable — le marqueur est RETIRÉ |
| des sockets locales, toutes en échec définitif | injoignable — marqueur POSÉ |
| aucune socket locale, compte dans `connectedUsers`, adaptateur qui a LEVÉ | marqué : aucune preuve de jonction nulle part |
| aucune socket locale, compte absent de `connectedUsers` | rien à marquer — la file l'enfile déjà comme hors ligne |

Marquer **par socket et non par compte** n'est pas un raffinement : marquer le
compte quand UNE de ses deux sockets a rejoint enfilerait pour un compte que la
room atteint — un doublon à la remise. L'arbitrage se lit dans les deux sens, et
les deux témoins le nomment.

### Preuves

| preuve | résultat |
|---|---|
| 10 témoins du lot | verts ; **6 sur 8** tombent sous l'implémentation d'avant, remise à la main |
| dont 2 qui traversent `enqueueForOfflineParticipants` | une jonction échouée fait ENFILER ; une jonction réussie n'enfile RIEN |
| `src/__tests__/unit/socketio/` + `src/socketio/__tests__/` | 189 suites, 2 323 témoins |
| `src/__tests__/unit/routes/` | 879 suites, 13 746 témoins |
| `tsc --noEmit` gateway | vert |

Les deux témoins qui NE tombent pas sous l'ancien code sont nommés comme tels :
l'ancien code n'appelait jamais l'adaptateur, donc « un adaptateur qui lève ne
retient pas les jonctions locales » y est vrai par vacuité. Un témoin vert sous
la mutation qu'il ne garde pas n'est pas un défaut de témoin — c'est un témoin
qui garde autre chose.

---

## Lot B — un fait de SOCKET rangé dans une entrée par COMPTE (#16726)

`unreachableConversations` et `allConversationRoomsUnreachable` naissent d'un
fait de SOCKET : « CETTE socket n'a pas pu rejoindre CETTE room ». Ils vivaient
dans `connectedUsers`, une carte par COMPTE — qui n'a qu'un exemplaire de
chaque champ. D'où deux pertes, de sens opposé et de coût très inégal :

- **le dernier arrivé ÉCRASE** : un second appareil sain remplaçait l'entrée
  d'un appareil malade. Juste tant que les deux vivent (le compte EST joignable
  par la room), faux dès que le sain part ;
- **le survivant HÉRITE** : `handleDisconnection` recopiait l'entrée en ne
  changeant que `socketId`. L'appareil malade qui reste héritait d'une entrée
  **SANS marqueur** — absent de la room ET tenu pour joignable. Ni diffusion,
  ni file, donc rien à rejouer. **C'est la perte sèche**, et c'est elle que le
  doc-comment de `SocketUser` décrivait depuis #16687 sans que personne la
  prenne.

Le correctif ne choisit pas un gagnant : il **range le fait là où il est vrai**
— sur la socket, dans `socket.data`, comme `SOCKET_SESSION_ID` et
`appForeground` — puis DÉRIVE l'entrée du compte.

### La loi de combinaison, et pourquoi c'est l'intersection

Un compte est joignable pour une conversation dès qu'**UNE** de ses sockets est
dans la room : `io.to(ROOMS.conversation(id))` l'atteint par elle. Le marqueur
du compte est donc l'**INTERSECTION** des ensembles de ses sockets.

- L'union enfilerait pour un compte parfaitement joignable (doublons).
- Le dernier écrit PERD — c'est le défaut qu'on répare.
- `allConversationRoomsUnreachable` est l'élément **ABSORBANT** : « toutes, dont
  j'ignore la liste » ne retire rien à ce qu'une autre socket nomme, et ne
  devient le verdict du compte que si TOUTES ses sockets le portent.
- **Zéro socket rend un verdict VIDE**, et c'est le bon : un compte sans socket
  n'est plus dans `connectedUsers`, la file l'enfile parce qu'il est hors ligne.

### `[]` et `undefined` ne disent pas la même chose, une fois de plus

`liveSocketsOf` rend `undefined` — jamais `[]` — quand le namespace n'est pas
lisible. `[]` AFFIRMERAIT « aucune socket » et effacerait des marqueurs sur la
foi d'une ignorance ; `undefined` laisse l'appelant garder l'entrée telle
qu'elle est, c'est-à-dire le comportement d'avant le lot. C'est la distinction
que le cycle 116 a payée sur la file hors ligne (`params.participants ?? requête`,
où `[]` n'est pas nullish) et que le cycle 159 a reprise sur
`MessageDeletedDelivery`.

### Preuves

| preuve | résultat |
|---|---|
| `socket-reachability-ledger` (la loi, 10 témoins) | verts |
| `AuthHandler.reachability-inheritance` (3 témoins) | verts ; **2 sur 3** tombent avec la recopie d'avant |
| `src/__tests__/unit/handlers/` | 17 suites, 340 témoins |

Le témoin du namespace illisible ne tombe pas sous l'ancien code, et c'est
voulu : il garde le REPLI, pas le correctif.

---

## Lot C — et la même question posée aux autres portes du manager (#18444)

L'audit de ce cycle n'a pas cherché un défaut : il a repris la question de
#18381 — **« quelle décision de livraison se prend sur une carte
node-locale ? »** — et l'a posée aux cinq cartes du processus. Trois réponses,
dans le même fichier.

**`disconnectUser`** est l'unique geste par lequel un administrateur coupe les
sessions d'un compte. Il n'énumérait que `userSockets` et `io.sockets.sockets`.
Son propre doc-comment raconte une correction de la même famille un cran plus
bas — « un force-logout / bannissement était contournable pour toute session
multiple » : le multi-APPAREIL a été fermé, le multi-NŒUD ne l'a jamais été. La
route répondait `404 « non trouvé ou non connecté »` pour un compte connecté
ailleurs : **un faux négatif qui ment à l'admin sur l'état du compte**.

**Deux méthodes publiques n'avaient AUCUN appelant de production** — seulement
leurs propres témoins, treize en tout :

| méthode | ce qu'elle ferait sous l'adaptateur |
|---|---|
| `isUserInConversationRoom` | faux négatif pour un lecteur connecté ailleurs ⇒ push envoyé à quelqu'un qui regarde l'écran |
| `sendToUser` | l'événement perdu en SILENCE pour une socket d'un autre nœud, et `false` rendu |

Les garder arme un piège dont la réparation — `io.to(ROOMS.user(id)).emit(...)` —
est déjà employée partout ailleurs. Elles partent avec leurs témoins.

### Piège armé, pas panne, et la distinction se MESURE

`REDIS_URL` est posée en production, donc l'adaptateur est actif. **Un seul
conteneur `meeshy-gateway` est déployé** (aucun `replicas` dans
`docker-compose.prod.yml`) : aujourd'hui, aucune de ces trois portes ne perd
rien. La règle du cycle 84 s'applique quand même — on ne laisse pas un piège
armé au motif que personne n'a encore marché dessus — et l'infrastructure vise
explicitement la montée en charge sans état (#9232). Annoncer une panne qu'on
n'a pas mesurée coûte la confiance dans les cycles où il y en a une.

### Un double qui n'a pas la porte fait attester le REPLI

Le double socket.io du harnais n'exposait pas `in()`. La production appelant
`io.in(room).fetchSockets()` en PREMIER, l'appel tombait dans le `catch` et
**tout témoin de déconnexion n'attestait que le repli node-local** — vert, et
sur l'autre moitié du code. Le double expose désormais
`in(room).fetchSockets()`, et le témoin du nœud distant tombe ROUGE,
déterministe, sous l'implémentation d'avant :

```
✕ disconnectUser coupe une session qui ne vit PAS sur ce nœud
```

C'est la famille « un double de test ment aussi par ce qu'il ACCEPTE »
(cycle 114), vue du côté de ce qu'il **n'a pas** : un double incomplet ne répond
pas faux, il déroute la mesure vers une autre branche.

---

## Ce que l'audit a rendu CLEAN, et pourquoi le dire

**La porte de SORTIE était déjà juste.** `endConversationMembership` évince par
`io.in(ROOMS.user(id)).fetchSockets()`, donc à travers l'adaptateur, avec ses
quatre portes convergées et son ordre (éteindre, puis sortir, puis invalider).
C'est ce qui a rendu le défaut d'ENTRÉE lisible : le dépôt portait les deux
formes côte à côte, dans la même paire d'opérations.

**Les trois autres lecteurs de `adapter.rooms`** (`messageNewByLanguage`,
`deliverTextTranslation`, les deux comptages du manager) nomment leur portée
node-locale dans leur propre doc-comment et s'en servent pour GROUPER par
langue, pas pour décider d'une livraison. Hors périmètre, délibérément.

---

## Suivis ouverts

| # | ce que c'est | état |
|---|---|---|
| #18381 | la porte de mi-session sans réessai, marqueur ni adaptateur | **fermée** par le lot A |
| #16726 | les marqueurs hérités par la mauvaise socket | **fermée** par le lot B |
| #18444 | le force-logout node-local, et deux portes mortes | **fermée** par le lot C |
| #18382 | les accusés de lecture et de remise n'ont ni file ni instantané de reconnexion | ouverte — demande un arbitrage produit entre deux branches |
| #18120 | la portée COMMUNAUTÉ n'atteint jamais iOS | ouverte — demande Xcode |
| #18124, #18115 | les pièges armés du cycle 157 | ouvertes |
| #18342 | les sept événements sans lecteur | ouverte — demande un verdict par événement |
| #18385 | iOS doit lire le `deletedAt` servi | ouverte — demande Xcode |
| #16688 | la convergence de l'appareil resté muet | ouverte, et le lot B la laisse intacte : dériver l'entrée ne fait pas converger une socket qui n'a rien demandé |
