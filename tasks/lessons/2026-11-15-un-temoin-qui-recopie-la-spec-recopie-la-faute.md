## Un témoin qui recopie la spec attendue recopie la faute : tester la RÈGLE et la SOURCE, pas la valeur

**Le cas.** L'index unique partiel `(conversationId, clientMessageId)` a manqué
deux mois en production (#18621). La migration existait et avait été écrite avec
soin. Elle a échoué deux fois, de deux façons :

| panne | ce qu'elle a donné |
|---|---|
| `$ne` dans un `partialFilterExpression` — opérateur que MongoDB n'y admet pas | `createIndex` lève, l'index n'a jamais existé |
| `db.messages` au lieu de `db.Message` — le model Prisma n'a pas de `@@map` | une collection VIDE : « l'index semblait créé et ne protégeait rien » |

**Le témoin évident n'attrape ni l'une ni l'autre.** Écrire
`expect(spec).toEqual({ … partialFilterExpression: { clientMessageId: { $ne: '' } } })`
passe au vert sur la première panne : il AFFIRME la faute. Et
`expect(spec.collection).toBe('messages')` passe sur la seconde. Un témoin qui
recopie la valeur attendue ne peut, par construction, que confirmer la valeur
écrite — y compris quand elle est fausse.

**Ce qui les attrape.** Deux formes, et elles ne mesurent pas la valeur :

- **la RÈGLE.** Une liste blanche des opérateurs qu'un filtre partiel admet
  (`$exists`, `$gt`, `$gte`, `$lt`, `$lte`, `$type`, `$and` racine), balayée sur
  le filtre réel. Elle vient de la documentation de MongoDB, pas du code testé,
  donc elle est INDÉPENDANTE de la faute. `$ne` n'y est pas : le témoin tombe,
  quelle que soit la spec écrite.
- **la SOURCE.** Le nom de collection ne se devine pas, il se LIT : un model
  Prisma sans `@@map` donne son nom à la collection. Le témoin dit d'où vient le
  nom, pas quel nom il espère.

**La question à poser à un témoin de configuration.** *Si la valeur testée était
celle de la panne, ce témoin serait-il rouge ?* Si la réponse est non, il ne
teste rien — il documente. Un témoin de configuration n'a de valeur que lorsqu'il
confronte la valeur à quelque chose d'EXTÉRIEUR à elle : une règle publiée, une
source de vérité, un invariant du système.

**Corollaire.** Cela vaut partout où un défaut vient d'une valeur littérale que
le système ne valide pas lui-même — nom de collection ou de room, opérateur,
en-tête, clé d'index, nom d'événement socket, chemin. Le dépôt avait déjà la
forme ailleurs (le cliquet d'inventaire des champs du fil, dérivé du `select`
plutôt que recopié) ; elle manquait ici parce que l'index ne vivait dans aucune
structure que du code pouvait lire.
