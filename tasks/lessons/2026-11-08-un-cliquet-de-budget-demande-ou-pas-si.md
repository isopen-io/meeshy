## Un cliquet de BUDGET ne demande pas « ton lot est-il juste ? » mais « est-il à sa PLACE ? »

*Cycle 147, 2026-11-08.*

### Ce qui s'est passé

Trois lots justes, prouvés rouges puis verts, ont fait tomber les deux cliquets
de budget de taille. Les trois fichiers touchés étaient à **999, 999 et 995
lignes** — le seuil au-delà duquel un découpage se justifie sans se discuter.
Le dépôt les y avait tenus délibérément.

Mon premier réflexe a été de **raccourcir la prose jusqu'à ce que ça passe**. J'ai
trimé un doc-comment, remesuré, re-trimé. À la troisième passe, le fichier était
encore à 1006 pour un budget de 999, et le commentaire ne disait plus pourquoi la
décision avait été prise.

### La règle que je n'avais pas lue comme un ordre

> « Ajouter à un fichier déjà hors budget est interdit : **on extrait d'abord, on
> ajoute ensuite.** »

Elle ne dit pas « écris moins ». Elle dit que le fichier a atteint sa taille, et
que le lot suivant doit commencer par lui enlever quelque chose.

### Pourquoi les trois autres cliquets du cycle ne posaient pas la même question

Le cycle 147 en a vu quatre rougir sur des lots justes. Trois demandaient *ton
lot est-il juste ?* — un verdict de livraison manquant, une délégation non
déclarée, un double de test partiel — et la réponse était **dans le lot**.

Celui du budget demande *ton lot est-il à sa place ?*, et la réponse n'est
presque jamais dans le lot : **elle est dans le fichier d'à côté qui n'existe pas
encore.** Trois en sont sortis, chacun portant une responsabilité qui n'avait pas
de maison :

- le noyau d'un geste, jumeau exact du noyau de son geste inverse qui existait
  déjà et vivait seul ;
- deux fonctions de jonction de rooms, extraites d'une classe de 999 lignes ;
- l'unité de rebranchement des sockets, avec ses deux règles d'emploi — qui
  n'étaient écrites nulle part avant d'avoir un fichier à elles.

### La règle pour la prochaine fois

**Devant un cliquet de budget qui rougit, ne pas commencer par le texte.**
Commencer par la question : *quelle responsabilité ce fichier porte-t-il qui
pourrait vivre ailleurs ?* Si la réponse est « aucune », alors le lot est
peut-être au mauvais endroit. Si c'est « celle-là », l'extraction est le lot, et
le correctif vient après.

Et le signe qu'on est en train de se tromper : **on remesure le nombre de lignes
plus d'une fois.** Mesurer deux fois veut dire qu'on négocie avec le cliquet au
lieu de l'écouter.

### Corollaire sur la prose

Un doc-comment qu'on raccourcit pour tenir dans un budget perd d'abord sa
RAISON, et garde sa description — c'est l'inverse de ce qui est utile. La raison
d'une décision a deux maisons possibles : le doc-comment de l'unité qui la porte,
ou le journal du cycle. Jamais « nulle part, parce qu'il ne restait plus de
place ».
