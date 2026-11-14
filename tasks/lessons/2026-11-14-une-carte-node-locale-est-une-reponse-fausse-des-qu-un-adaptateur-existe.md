## Une carte node-locale est une réponse FAUSSE dès qu'un adaptateur existe (cycle 160)

*2026-11-14, cycle 160 — #18381, #18444.*

### La forme

`userSockets`, `socketToUser`, `connectedUsers`, `io.sockets.sockets`,
`io.sockets.adapter.rooms` : cinq cartes du même processus. Sous l'adaptateur
Redis — posé dès que `REDIS_URL` l'est, ce qui est le cas en production —
aucune ne voit les sockets des autres nœuds.

Ce qui rend la classe coûteuse n'est pas l'ignorance : c'est que **chacune rend
une réponse d'apparence complète**. `userSockets.get(id)` rend un `Set`, pas une
erreur. Un `Set` vide se lit « ce compte n'a pas de socket », jamais « ce compte
n'a pas de socket ICI ».

### Les trois verdicts, et ce que chacun coûte

| le code demande | la carte répond | ce que ça produit |
|---|---|---|
| « où joindre ce compte ? » | les sockets de ce nœud | une jonction de room qui n'arrive jamais (#18381) |
| « ce compte est-il connecté ? » | non | un `404 « non connecté »` pour un compte connecté ailleurs (#18444) |
| « ce compte lit-il cette conversation ? » | non | un push envoyé à quelqu'un qui regarde l'écran |

Le troisième est le plus discret : un faux NÉGATIF de présence ne produit
aucune erreur, seulement un comportement un peu de travers que personne
n'attribue jamais à une carte.

### La question à poser

Pas « cette carte est-elle à jour ? » (elle l'est, pour ce qu'elle décrit) mais
**« la question que je lui pose a-t-elle une réponse LOCALE ? »**.

- « Quelles sockets ce PROCESSUS tient-il ? » — oui, c'est sa définition.
- « Ce COMPTE est-il joignable ? » — non. C'est une question de grappe, et elle
  se pose à l'adaptateur.

### L'idiome juste existait déjà, et c'est ce qui le rend mesurable

Le dépôt portait **les deux formes côte à côte** avant ce cycle :

| geste | forme | portée |
|---|---|---|
| sortir un membre d'une room (`endConversationMembership`) | `io.in(ROOMS.user(id)).fetchSockets()` | grappe |
| couper une session révoquée (`disconnectSession`) | `io.in(ROOMS.user(id)).fetchSockets()` | grappe |
| **entrer** un membre dans une room (porte de mi-session) | `userSockets` + `io.sockets.sockets` | nœud |
| **couper** toutes les sessions d'un compte (admin) | `userSockets` + `io.sockets.sockets` | nœud |

La SORTIE était juste et l'ENTRÉE ne l'était pas, dans la même paire
d'opérations. Devant une carte locale, chercher le geste INVERSE : s'il passe
par l'adaptateur, la question n'était pas locale.

### Et les deux sources s'UNISSENT, elles ne se remplacent pas

`fetchSockets()` sur la room personnelle ne voit que les sockets qui l'ont
REJOINTE — et l'échec de cette jonction n'est que journalisé
(`'failed to join personal rooms'`). Pour un geste de SÉCURITÉ, le repli local
reste donc nécessaire : on coupe tout ce qu'on peut nommer, et on déduplique
par `socket.id`. Remplacer une source par l'autre aurait échangé un angle mort
contre un autre.
