## Une jumelle DURABLE peut garder la même donnée sous une loi plus forte que le DIRECT

**2026-11-22, cycle 222 (#20443)**, trouvé par l'audit adversarial de #20429
(constat C2).

`story:viewed` — la charge la plus nominative des huit familles d'activité, la
seule à porter un **pseudo** en plus d'un id — était gardée contre le
**BLOCAGE** (#20429, livré la veille, correct, testé sous dix témoins).

La MÊME donnée, servie au MÊME lecteur par la jumelle REST de cet événement (la
liste « Vu par »), est gardée depuis #14108 sous la loi des **CERCLES** :
`pairAccessAmong({ feature: 'views.identity' })`, soit le niveau **Communauté**,
dont le blocage n'est qu'un des quatre facteurs. Un viewer `PUBLIC`, sans
aucune relation avec l'auteur et sans aucun blocage, était donc **anonyme sur
le REST et nommé sur le fil**.

**Aucun témoin ne pouvait tomber**, et c'est le point. Le témoin de #20429
« un blocage qui ne concerne PAS le viewer ne tait pas l'auteur » figeait ce cas
exact comme CORRECT. Il l'était — au regard de la loi qu'on lui avait nommée.
Un témoin atteste la loi qu'on lui a donnée, jamais que c'était la bonne loi :
dix témoins verts sur la loi du blocage ne disent rien de l'existence d'une loi
des cercles sur la même donnée.

**La question à poser** à toute diffusion temps réel qui porte une donnée de
personne : *cette donnée a-t-elle une jumelle DURABLE — une route REST qui la
sert au même lecteur — et sous quelle loi la garde-t-elle ?* Si les deux lois
diffèrent, **c'est la plus FAIBLE qui décide de ce qui fuit**, et c'est presque
toujours le DIRECT : une route REST a un schéma, un sérialiseur et une fonction
de garde nommée ; une diffusion Socket.IO n'a rien de tout cela, et sa garde
est écrite à la main par le lot qui a pensé à elle. C'est la famille de « cette
entité a-t-elle une JUMELLE ? » avec une variante qui n'y figurait pas : la
jumelle n'est ici ni une autre table, ni un autre site, ni un autre moment, ni
un autre médium — c'est **le même champ, pour le même œil, par un autre
TRANSPORT**, et le transport décide de la force de la garde.

**Corollaire de réparation : aligner la garde n'est pas la seule issue, et
c'est souvent la plus chère.** Trois questions, dans cet ordre. *Qui LIT le
champ ?* — relever les trois clients, ne pas supposer : sans lecteur, servir une
garde pour l'alimenter est de la machinerie pour personne (précédent #14319).
*Où la garde se poserait-elle ?* — si son verdict exige une donnée qui n'arrive
qu'APRÈS une écriture, elle s'installe dans une fenêtre d'ordonnancement, ce qui
est un coût de correction et non de la sécurité gratuite. *Le retrait est-il
SEC ?* — un décodeur client STRICT transforme un retrait de champ en perte de
l'événement ENTIER, donc des champs qui, eux, sont lus ; la réponse
rétrocompatible garde la clé et vide la VALEUR.

**Et le relevé qui décide du retrait n'est pas celui qu'on croit : ne pas LIRE
un champ et ne pas EXIGER sa présence sont deux propriétés distinctes.** Les
deux clients de ce cas ne lisaient que `storyId` et `viewCount` — et
casseraient quand même sur une clé absente, chacun par sa propre mécanique
(`Decodable` non optionnel sur iOS, `String` sans défaut donc
`MissingFieldException` de kotlinx sur Android), en perdant `viewCount` avec
l'événement. « Qui lit ? » autorise le retrait de la VALEUR ; seul « qui exige
la CLÉ ? » autorise le retrait de la clé. Un lot qui ne pose que la première
question conclut « personne ne s'en sert, je retire » — et casse les deux
clients qui ne s'en servaient effectivement pas.

**Corollaire de témoin : anonymiser une charge rend VACUEUX tout témoin de
non-fuite posé sur elle.** Le témoin « ni l'id ni le pseudo ne partent » reste
vert sous n'importe quel fail-open une fois la charge vidée : il n'atteste plus
que le correctif qui vient de le vider. Le lot qui retire une donnée hérite donc
de la relecture de tous les témoins qui l'exerçaient, et chacun se repose sur ce
que son unité **DÉCIDE** (ici : rien ne part du tout), pas sur ce que la charge
contient.

**Et le champ en écriture seule qui reste derrière.** Le `username` de
`SocialEventsActor` n'avait plus qu'un écrivain après ce lot et zéro lecteur.
Le laisser à portée de la couche de diffusion, c'est laisser le prochain lot le
remettre sur un fil sans qu'un témoin tombe : **la seule façon de ne pas
renommer quelqu'un est de ne pas transporter son nom jusque-là.**

**Ce que ce lot a payé sur lui-même, et qui appartient à la leçon** : son
premier relevé affirmait « Android déclare le nom de l'événement sans y abonner
aucun décodeur ». Faux — un `grep` tronqué par `head -10`, sur une liste que dix
correspondances d'un `OutboxKind` sans rapport dominaient, n'avait rendu que la
déclaration de la constante. **Un `head` sur un relevé d'exhaustivité
transforme une propriété du dépôt en propriété de la commande** (leçon 261, par
l'instrument le plus banal qui soit). La conclusion tenait, la raison de garder
les clés s'est renforcée — mais c'est la mesure, pas une relecture, qui l'a
corrigée.
