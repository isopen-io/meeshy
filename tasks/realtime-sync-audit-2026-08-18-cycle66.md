# Cycle 66 — la pastille se regarde hors du fil, et l'événement n'était adressé qu'au fil

**Date** : 2026-08-18
**Branche** : `claude/keen-hamilton-560g7t`
**Périmètre** : gateway (`MeeshySocketIOManager._broadcastUserStatus`) — présence
**Clients touchés** : aucun (nom d'événement et charge utile inchangés)

---

## 1. Par quel bout le cycle a pris le carnet

Le carnet du cycle 65 laissait huit pistes. Trois sont bloquées sur Xcode
(§ 8-3, § 8-4, § 8-8), deux sont explicitement soumises à la règle « mesurer
avant de trancher » et cet environnement ne peut pas produire la mesure (§ 8-1
le taux de rejet de `socket.join` en production, § 8-6 la pagination keyset),
une attend un CI rouge qui la nomme (§ 8-5), une demande une identité d'appareil
sur la socket (§ 8-2, « un cycle entier, et sans doute plusieurs »), une est
cosmétique (§ 8-7).

Le cycle a donc instruit la **méthode** que le cycle 65 a laissée derrière lui
plutôt qu'une de ses pistes. La Leçon 233 en formule deux :

> Pour chaque nom de room ou d'événement, compter ses DEUX extrémités.

> Avant d'écrire un état, demander ce que cet état DÉSACTIVE en aval.

La première a été passée sur les douze `eventType` de la file de livraison
(§ 6 bis) : **elle rend zéro défaut**, les deux extrémités existent partout. La
seconde, appliquée non pas à un drapeau mais à une ROOM, a rendu ce dossier.

---

## 2. Le défaut : refermer un fil démonte l'adresse d'un signal qui s'affiche ailleurs

`user:status` — la transition de présence — n'était adressé qu'aux rooms
`conversation:<id>` de la personne concernée :

```ts
const rooms = participantRows.map(p => ROOMS.conversation(p.conversationId));
emitter.emit(SERVER_EVENTS.USER_STATUS, { userId, username, isOnline, lastActiveAt });
```

Or **la pastille de présence se regarde très majoritairement HORS du fil** :
liste de conversations, écrans de contacts, en-têtes. C'est la règle produit du
`CLAUDE.md` (« Offline = pas de pastille sur les avatars », palette 1/3/5), et
les deux mappings centraux qui la rendent — `PRESENCE_DOT_CLASS` côté web,
`PresenceState.dotColor` côté iOS — servent d'abord des lignes de LISTE.

Et la room `conversation:<id>`, un client la QUITTE en refermant le fil, tout en
restant connecté :

| étape | site |
|---|---|
| la vue de conversation disparaît | iOS `ConversationSocketHandler.deinit` → `leaveRoom()` · web cleanup de `useEffect([conversationId])` |
| le client émet | `conversation:leave` (`MessageSocketManager.leaveConversation` · `meeshySocketIOService.leaveConversation`) |
| le gateway démonte | `ConversationHandler.handleConversationLeave` → `socket.leave(room)` |

La room que `AuthHandler` avait jointe à la connexion **pour atteindre ce
participant** était démontée par un geste qui ne voulait dire que « je ne
regarde plus ce fil ». C'est la Leçon 233 dans sa forme la plus littérale : un
état posé (ici : sortir d'une room) ne fait pas qu'arrêter ce qu'il prétend
arrêter — il ÉTEINT un canal dont un tout autre écran dépendait.

### 2 bis. Pourquoi rien ne le rattrapait

L'écart aurait été bénin si un autre signal avait reconvergé. Les trois candidats
ont été instruits, aucun ne le fait :

1. **`user:status` ne se répète pas.** Il ne marque que des TRANSITIONS
   (connexion, déconnexion). Un pair déjà en ligne n'émet plus rien — c'est
   précisément la faille que `presence:snapshot` a été créé pour combler, dans
   les termes de sa propre doc : « un user online depuis des heures ne
   s'allumerait jamais ».
2. **`presence:snapshot` n'est envoyé qu'à l'AUTHENTIFICATION**
   (`_emitPresenceSnapshot(socket, …)`). Il ne repasse pas en cours de session.
3. **iOS ne sonde jamais le réseau pour la présence.** `PresenceManager` n'a
   qu'un minuteur de 30 s, et ce minuteur ne fetch rien : il **recalcule la
   décroissance** 1/3/5 min depuis `lastActiveAt`.

Le symptôme visible n'est donc pas « une pastille figée », c'est **un pair qui
ne se rallume jamais** : sa décroissance locale l'a éteint, et la transition qui
l'aurait rallumé n'a plus d'adresse pour arriver. Et cela vaut exactement pour
les conversations que l'utilisateur a OUVERTES puis refermées — c'est-à-dire les
siennes, les plus fréquentées.

L'état ne se répare qu'à la reconnexion du socket (nouveau `presence:snapshot`).
Sur iPhone les bascules avant-plan / arrière-plan en produisent, ce qui masque le
défaut sans le supprimer : il est réintroduit dès le premier fil refermé.

**La gravité n'est pas la même des deux côtés, et le point n° 3 est la raison.**
Le web possède un filet que iOS n'a pas : `use-user-status-realtime.ts` resynchronise
`GET /users/presence` au retour de focus d'onglet et au retour en ligne. Sa
divergence est donc bornée par le prochain focus. **iOS n'a aucun équivalent** —
aucune de ses trois sources (socket, instantané d'authentification, minuteur de
décroissance) ne va rechercher l'état, si bien que la divergence y dure toute la
session. Le défaut est commun aux deux clients ; c'est sa RECONVERGENCE qui est
propre au web.

### 2 ter. Ce qui est touché — les DEUX clients, et une erreur de méthode en chemin

Le premier balayage a conclu « défaut propre à iOS, le web n'émet pas
`conversation:leave` ». **C'était faux, et la façon dont c'était faux mérite
d'être consignée** : la recherche portait sur la CHAÎNE littérale
`'conversation:leave'`, que le web n'écrit nulle part — il passe par la constante
`CLIENT_EVENTS.CONVERSATION_LEAVE`. Le dépôt impose pourtant cette indirection
comme une règle (`socketio-events.ts` est source de vérité, et un commentaire de
`messages.ts` note que deux lignes composant un nom de room à la main étaient
« invisibles au balayage d'audience »). Chercher un nom d'événement par sa chaîne
dans un dépôt qui interdit les chaînes brutes revient à chercher exactement ce
que la convention a supprimé.

Les deux clients quittent la room, et pour le même geste :

| client | site | déclencheur |
|---|---|---|
| iOS | `ConversationSocketHandler.deinit` → `leaveRoom()` | la vue de conversation disparaît |
| web | `use-socketio-messaging.ts` → cleanup de `useEffect([conversationId])` | on quitte la conversation |

Le correctif est posé côté gateway et non côté client : garder la
socket dans la room aurait fait payer à tous les clients les frappes de tous les
fils (`typing:*` est adressé à la room de conversation), ce que le `leave` existe
justement pour éviter. Ce n'est pas le `leave` qui est fautif — c'est
l'adressage d'un signal de PERSONNE à une room de FIL.

---

## 3. Ce qui a été livré

`user:status` s'adresse désormais aux **rooms personnelles** des participants,
selon la doctrine déjà écrite dans `emitToConversationParticipants` — un
participant s'adresse par `userId ?? id`, dans une room que `AuthHandler` joint à
la connexion et que **rien** ne fait quitter (vérifié : aucun
`leave(ROOMS.user(…))` dans le dépôt).

1. **Porte inscrite** — les rooms de conversation AMORCENT la chaîne, puis
   `participantUserRooms(peers, conversationRooms)` y ajoute la room personnelle
   de chaque participant.
2. **Porte anonyme** — passe par `emitToConversationParticipants`, le helper
   partagé, plutôt que par une seconde copie du motif.
3. **Quatre gardes** — § 4.

Deux propriétés tenaient le correctif hors de la catégorie « élargir une
audience » :

- **L'élargissement est purement ADDITIF.** Les rooms de conversation restent en
  tête de chaîne : aucun destinataire d'aujourd'hui n'est retiré. La population
  atteinte est la même (les participants des conversations de la personne) ; seule
  l'ADRESSE change.
- **Aucune fuite de présence.** Les nouveaux destinataires sont exactement ceux
  qui auraient reçu l'événement s'ils étaient restés assis dans le fil. Le
  chaînage `.to()` garantit au plus une copie par socket, et l'exclusion des
  bloqueurs porte sur des `socket.id` — elle survit donc intacte au changement
  d'adressage (garde n° 4).

### 3 bis. Le prix, nommé

Une requête `participant` de plus par transition de présence, sur un chemin de
**connexion / déconnexion** — jamais par message. C'est la MÊME requête que
`_emitPresenceSnapshot` exécute déjà à la connexion.

Elle n'est délibérément **pas** mutualisée avec le cache de cet instantané
(`presenceSnapshotCache`), qui aurait pourtant rendu l'audience gratuite : son
TTL ferait dépendre la LIVRAISON de la présence de la fraîcheur d'un cache
cosmétique, et son contenu exclut la personne elle-même — donc ses autres
appareils perdraient un événement qu'ils reçoivent aujourd'hui, cassant la
propriété « purement additif » qui rend ce changement sûr.

Le balayage de maintenance qui passe N utilisateurs hors ligne d'un coup paie
donc deux requêtes par utilisateur au lieu d'une. Borné, et dit ici plutôt que
découvert plus tard.

**Second prix, moins évident : la LISTE de rooms grossit.** L'emit passe de « une
room par conversation » à « une room par conversation + une par participant
distinct ». Pour quelqu'un ayant 30 conversations de 10 personnes, la liste passe
d'environ 30 noms à environ 300, et l'adaptateur Redis publie cette liste dans
son message de diffusion. Le nombre de SOCKETS touchés, lui, ne change pas.

La liste pourrait être réduite d'un tiers : les rooms de conversation sont en
théorie redondantes, puisque toute socket assise dans `conversation:<id>` siège
aussi dans sa propre room personnelle (`AuthHandler` joint les deux). Elles sont
gardées quand même, et c'est un choix : les retirer ferait perdre l'événement à
une socket restée dans une room de conversation dont la ligne `Participant` n'est
plus active — un cas de bord, mais une SOUSTRACTION, alors que toute la sûreté de
ce correctif tient à ce qu'il n'en fasse aucune. La règle du cycle 63 s'applique
telle quelle : on ne troque pas une propriété de sûreté contre une économie
supposée tant que l'économie n'est pas mesurée.

---

## 4. Les gardes, et laquelle compte

`services/gateway/src/socketio/__tests__/MeeshySocketIOManager.test.ts` :

| Garde | Ce qu'elle affirme |
|-------|--------------------|
| room personnelle | la présence atteint `user:<pair>`, pas seulement le fil |
| pair sans compte | un invité de lien est adressé par son `Participant.id` |
| **parité** | **les DEUX portes adressent le pair par sa room personnelle** |
| blocage | l'exclusion des bloqueurs survit au nouvel adressage |

**La troisième est celle qui a de la valeur**, et pour la raison exacte du cycle
65 § 5 : les deux premières décrivent la porte inscrite, et resteraient VERTES si
la porte anonyme gardait son unique `to(ROOMS.conversation(…))`. Or c'est elle
qui porte le pire cas — un invité de lien partagé n'a QU'UNE conversation, donc
« la room refermée » y vaut la totalité de sa présence, là où un inscrit n'en
perdrait qu'une sur N. C'est le corollaire de la Leçon 233, appliqué avant que
l'écart n'existe plutôt qu'après : **le chemin à 1 objet n'est pas le cas
facile.**

La garde ne nomme aucun nombre de rooms. Elle fait diffuser les deux portes vers
le même pair témoin et compare les deux résultats entre eux.

**ROUGE prouvé avant livraison** — les témoins tombent sur le code d'avant, et la
garde de parité chiffre le défaut au présent :

```
● les DEUX portes de présence adressent le pair par sa room personnelle
    - "porteAnonyme": true      ← attendu
    - "porteInscrite": true
    + "porteAnonyme": false     ← reçu
    + "porteInscrite": false
```

---

## 5. Vérification

| Gate | Résultat |
|------|----------|
| `tsc --noEmit` gateway | ✅ 0 erreur |
| Suite `MeeshySocketIOManager` | ✅ **388/388** (384 avant, +4 gardes) |
| Suite gateway complète | ✅ **746/746 suites, 18 070 témoins** verts |
| Δ témoins vs cycle 65 | **+4** (18 066 → 18 070) — exactement les gardes ajoutées, **aucun témoin existant réécrit** |
| Clients (web / iOS / Android) | **aucun changement** |

La suite complète a été relancée PROPREMENT : un premier passage avait été lancé
puis une retouche cosmétique appliquée pendant son exécution. Jest lit chaque
fichier à l'import de son worker, donc un arbre modifié en cours de route rend un
verdict qui ne porte sur aucun état unique du dépôt. Le premier passage a été tué
et rejoué après la retouche plutôt que rapporté — un vert obtenu sur deux
versions du code n'est pas un vert.

Aucun témoin existant n'a eu à être réécrit, et c'est une information et non une
formalité : les quatre témoins d'audience déjà en place
(`to(expect.arrayContaining([ROOMS.conversation(…)]))`) restent verts parce que
l'élargissement est additif. Un correctif qui les aurait fait tomber aurait été
un correctif qui RETIRE des destinataires.

---

## 6. Ce que l'inventaire a rendu, y compris quand il ne rend rien

### 6 bis. Les douze `eventType` de la file : zéro défaut

La Leçon 233 (« compter les deux extrémités ») a d'abord été passée sur la file
de livraison hors ligne, qui était le suspect le plus riche : chaque `eventType`
enfilé doit être rejoué sous un nom d'événement qu'un client écoute, faute de
quoi l'entrée est CONSOMMÉE par le drain et perdue — le pire des deux mondes.

Les douze membres de l'union `QueuedMessagePayload['eventType']` ont chacun leur
site d'enfilement et leur branche dans `_drainedEventName`. Le `return` par
défaut (`MESSAGE_NEW`) ne masque aucun oubli. **Aucune extrémité à zéro.**

Deux voisins ont été vérifiés au passage et sont sains : la clé de déduplication
des réactions de pièce jointe est bien présente (`attachmentId:reactor:emoji`,
plus fine que celle des réactions de message — le cas « plusieurs pièces jointes
sur un message » est traité), et les deux familles de réaction passent par le
même helper partagé.

C'est un résultat, pas une absence de résultat : la famille que les cycles 64 et
65 exploitaient est **épuisée** sur ce périmètre, et le cycle suivant n'a pas à
la repasser.

### 6 ter. Ce qui a déplacé la recherche

Le défaut n'a pas été trouvé en comptant des extrémités — les deux extrémités de
`user:status` existent (un émetteur, un écouteur iOS qui alimente
`PresenceManager`). Il a été trouvé en demandant **où le signal est REGARDÉ**, et
en constatant que la réponse (la liste) n'est pas là où il est ADRESSÉ (le fil).

Une room est un rendez-vous entre un émetteur et un écran. Compter les deux
extrémités du CODE ne dit rien de leur rendez-vous si l'écran qui consomme n'est
pas celui qui a fait joindre la room.

---

## 7. Pistes pour le cycle 67

1. **`presence:snapshot` n'est envoyé qu'à l'authentification** — nouvelle,
   constatée ici (§ 2 bis-2), non livrée. Ce cycle supprime la cause dominante de
   divergence, mais tout autre événement de présence manqué reste sans filet en
   cours de session. Un renvoi d'instantané sur reprise d'avant-plan (ou un
   `presence:resync` demandé par le client) serait le filet générique. Demande un
   changement CLIENT — à instruire quand Xcode est disponible.
2. **Refuser la session quand ZÉRO room a été atteinte** (cycle 65 § 7) —
   intacte. Demande une mesure de production que cet environnement ne produit
   pas.
3. **La file hors ligne par APPAREIL** (cycles 58/64/65) — intacte. Demande une
   identité d'appareil sur la socket.
4. **Le drain hors ligne reste destructif** (cycle 57 § 8-2, cycle 65 § 8-3) —
   intacte, bloquée sur Xcode pour sa moitié iOS.
5. **Les trois écouteurs iOS sans émetteur** (cycle 64 § 7-1) — intacte, bloquée
   sur Xcode.
6. **Le flake non identifié de `packages/shared`** (cycle 61 bis) — intacte ; le
   prochain CI rouge doit le NOMMER.
7. **`conversations.infinite()` en pagination keyset** (cycles 59/60) — intacte,
   soumise à « mesurer avant de trancher ».
8. **`PUT /conversations/:id` accepte toujours de renommer un tête-à-tête** —
   intacte, cosmétique.
9. **La famille « compter les deux extrémités » est épuisée sur la file de
   livraison** (§ 6 bis) — ne pas la repasser sur ce périmètre. La question qui
   l'a remplacée et qui a produit ce cycle : *où le signal est-il REGARDÉ, et
   est-ce là qu'il est adressé ?* Candidats non instruits sous cet angle :
   `MESSAGE_CONSUMED`, `LOCATION_LIVE_*`, `PARTICIPANT_ROLE_UPDATED` (celui-ci
   déjà tranché « thread-only à juste titre », vérifié plutôt que déduit).
