## Une ligne qui répond à DEUX questions ne se corrige pas à moitié — j'ai posé le plancher et oublié la porte

*2026-11-08 — #17076, cycle 150*

### Ce qui s'est passé

J'ai fermé une fuite d'historique sur `GET …/conversations/:id/stats` : l'agrégat
est désormais borné au plancher du lecteur. Lot propre, treize témoins, rouge
prouvé, journal, leçons. Un audit adversarial l'a rendu **BLOQUANT** en une
observation.

Le lien de partage répond à **deux** questions sur la même ligne `Participant` :

| question | la loi | ce que j'ai fait |
|---|---|---|
| **depuis quand** ce lecteur peut lire | `historyFloor.ts` | posé |
| **si** ce lecteur peut encore lire | `shareLinkReadGate.ts` | oublié |

Les quatre surfaces de lecture que mon propre message de commit citait en
référence — le fil, la recherche, les fils de réponses, les épinglés — posent
**les deux**, avec le même helper et le même lecteur. `stats.ts` ne portait
aucune occurrence de `ShareLink`.

### Ce que ça coûtait, et pourquoi c'est pire qu'un oubli symétrique

La révocation d'un lien ne touche que les participations **anonymes**
(`shareLinkGuestsWhere` : `{ type: 'anonymous', isActive: true, … }`). Un
INSCRIT admis par lien n'est donc jamais révoqué : sa ligne reste active,
`canAccessConversation` continue de l'accepter, et **seule la porte par route
l'arrête.** Ma surface était la seule à ne pas l'avoir — donc, après expiration
du lien, la seule qui continuait de servir l'activité des jours suivants,
indéfiniment, à quelqu'un à qui le fil rendait 403.

Et la justification que j'avais ÉCRITE pour refuser un refus — « la fenêtre d'un
lecteur à plancher EST celle que `GET …/messages` lui sert déjà, donc la replier
ne publie rien de neuf » — était **fausse pour exactement cette population** :
`GET …/messages` lui sert 403.

> **Un argument de non-publication se vérifie contre la surface qu'il
> invoque, pour le lecteur qu'il décrit.** Le mien était vrai du lecteur moyen
> et faux du seul lecteur dont le lot parlait.

### Pourquoi le doc-comment de la loi ne m'a pas sauvé

Il le dit, et je l'ai lu : *« Le lien répond à DEUX questions sur la même ligne,
et elles restent séparées : la PORTE, ici, et le PLANCHER, rendu par
`historyFloor.ts` — qui dit de lui-même qu'il ne refuse pas un lien expiré. »*

Je suis arrivé par le plancher, parce que l'issue parlait de plancher. La loi m'a
renvoyé vers sa jumelle ; je l'ai lue comme une précision d'architecture, pas
comme une liste de choses à poser. **Une séparation de responsabilités énoncée
chez l'une des deux moitiés se lit comme une raison de ne pas confondre, pas
comme une obligation d'appeler les deux.**

La question qui l'attrape est mécanique, et elle ne demande pas d'y avoir pensé :
**pour chaque loi que je viens d'appliquer à une surface neuve, ouvrir UNE
surface voisine qui l'applique déjà et compter ses appels.** Quatre surfaces en
faisaient deux ; j'en faisais un.

### Et deux cliquets du dépôt ont trouvé le reste tout seuls

La suite complète a fait rougir `orphaned-sender-repair-surface-guard` et
`personal-history-hiding-surface-guard` : ma lecture neuve de `Message` entrait
dans deux inventaires gelés sans y être déclarée. Les deux disaient la même
chose que l'audit, en moins de mots.

> **Un inventaire gelé est un auditeur qui ne dort pas.** Il ne sait pas ce que
> mon lot voulait faire — il sait seulement qu'une lecture de plus est apparue,
> et il exige que je dise laquelle des règles de la maison elle applique, ou
> pourquoi elle en est exemptée. C'est la forme la moins chère d'une revue
> adversariale, et elle tourne à chaque suite.

Le budget de taille d'un cliquet voisin a même pointé un défaut que je n'avais
pas vu : j'avais mis un `findMany` dans un module dont le doc-comment déclare
qu'il ne connaît « ni prisma, ni cache ». Ne pouvant pas grossir le fichier du
cliquet, j'ai cherché où ma déclaration devait vraiment aller — et la réponse
était que la LECTURE n'était pas au bon endroit.
