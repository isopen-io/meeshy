## Une loi qui PUBLIE son `select` n'est appliquée que par les consommateurs qui l'importent (cycle 152, #17208)

`messageLivenessOf` (`services/gateway/src/services/messages/message-liveness.ts`)
interroge trois colonnes — `deletedAt`, `expiresAt`, `viewOnceBurnedAt` — et
publie la liste sous `MESSAGE_LIVENESS_SELECT`, avec son doc-comment qui dit
exactement pourquoi : « **tout consommateur doit les `select`** ; le `select` est
la seule des conditions qu'aucun témoin de verdict ne peut voir ».

Des **quatre** consommateurs, les deux du drain hors ligne spreadaient la
constante. Les deux de `NotificationService` énuméraient huit colonnes à la main,
sans la troisième — la seule preuve que laisse `purgeViewOnceContent`, qui détruit
le clair d'une vue unique sans écrire `deletedAt`. Les trois éventails de bannière
rendaient donc `live` sur un message dont le serveur n'a plus le contenu.

> **Une constante de `select` publiée ne garde rien par sa seule existence.** Elle
> ne rougit chez personne : un appelant qui retape ses colonnes compile, ses
> témoins passent, et sa requête est en retard d'exactement ce que la loi a gagné
> depuis. La question à poser à toute loi qui déclare ses colonnes n'est pas « la
> publie-t-elle ? » mais **« combien de ses appelants l'importent ? »** — et elle
> se répond par une commande, pas par une intuition (forme outillée du cycle 123
> bis : *compter les appelants du helper*).

Trois corollaires, tous mesurés dans le même lot :

- **Le TYPE du paramètre est l'autre moitié de la garde, et c'est elle qui
  manquait.** `NotificationService.messageLiveness` déclarait
  `{ deletedAt?: Date | null; expiresAt?: Date | null }` : il ne POUVAIT pas faire
  rougir le compilateur sur une ligne sans `viewOnceBurnedAt`, puisqu'il ne la
  demandait pas. **Une loi déclare la forme qu'elle interroge** (`MessageLivenessRow`) ;
  un appelant qui la ré-énonce plus étroitement s'exempte en silence.

- **Les témoins de VERDICT ne peuvent pas tomber, et il faut l'écrire au-dessus
  d'eux.** Un double Prisma rend ce qu'on lui dit quel que soit le `select` : la
  fixture porte la colonne, la loi la lit, le verdict est juste, le témoin passe —
  sur une production aveugle. Ce qui prouve un tel correctif est un témoin de
  **REQUÊTE** (`expect(findUnique.mock.calls[n][0].select).toMatchObject(LA_LOI)`).
  Les témoins de verdict restent écrits, pour garder le comportement une fois la
  colonne là ; **un témoin dont on SAIT qu'il ne peut pas tomber vaut mieux qu'un
  témoin dont on l'ignore.**

- **Le cliquet qui ferme la classe est le moins cher**, et sa limite se dit plutôt
  qu'elle ne se tait : tout fichier de production qui appelle la loi doit
  référencer sa constante. Il ne prouve pas que le `select` de la requête est
  celui-là — c'est le travail des témoins de requête, par consommateur — il prouve
  qu'aucun appelant n'ignore la liste publiée. Sans cette phrase écrite dans le
  fichier, il mesurerait la popularité d'un idiome au lieu d'une propriété, et le
  dépôt a déjà JETÉ un balayage coupable de ça (cycle 107, sept faux positifs).

Et la façon dont le défaut a survécu mérite d'être dite, parce qu'elle se
reproduira : **le lot qui a laissé le trou l'avait ÉCRIT.** Le doc-comment de
`purgeQueuedCopies` porte, mot pour mot, « `viewOnceBurnedAt` n'est lu par aucune
garde de remise » — puis le cycle 143 bis a donné la colonne au DRAIN sans la
donner aux bannières. C'est la règle de #16706 appliquée à son auteur suivant :
*un lot qui écrit « cette garde ne peut pas voir X » doit, dans le même lot, soit
lui donner X, soit dire pourquoi elle ne doit pas l'avoir.* Un constat posé et
laissé tel quel se relit comme une décision instruite.

**Comment il a été trouvé** : en posant au `select` de la relecture la question
que l'issue voisine (#17195) posait à ses PARAMÈTRES. Les deux moitiés d'une garde
— ce qu'elle reçoit, et ce que sa requête ramène — se vérifient séparément, et la
seconde n'a aucun témoin naturel.
---
