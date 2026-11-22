# Une jumelle DURABLE peut garder la même donnée sous une loi plus forte que le DIRECT

**2026-11-22 · cycle 222 · #20443** (constat C2 de l'audit adversarial de #20429)

## Ce qui s'est passé

`story:viewed` — la charge la plus nominative des huit familles d'activité, la
seule à porter un **pseudo** en plus d'un id — était gardée contre le
**BLOCAGE** (#20429, livré la veille, correct, testé sous dix témoins).

La MÊME donnée, servie au MÊME lecteur par la jumelle REST de cet événement (la
liste « Vu par »), est gardée depuis #14108 sous la loi des **CERCLES** :
`pairAccessAmong({ feature: 'views.identity' })`, soit le niveau **Communauté**,
dont le blocage n'est qu'un des quatre facteurs.

Un viewer `PUBLIC`, sans aucune relation avec l'auteur et sans aucun blocage,
était donc **anonyme sur le REST et nommé sur le fil**.

## Pourquoi aucun témoin ne pouvait tomber

Le témoin de #20429 « un blocage qui ne concerne PAS le viewer ne tait pas
l'auteur » **figeait ce cas exact comme correct**. Il l'était — au regard de la
loi qu'on lui avait nommée.

> Un témoin atteste la loi qu'on lui a donnée, jamais que c'était la bonne loi.
> Dix témoins verts sur la loi du blocage ne disent rien de l'existence d'une
> loi des cercles sur la même donnée.

## La question à poser

Devant toute diffusion temps réel qui porte une donnée de personne :

> **« Cette donnée a-t-elle une jumelle DURABLE — une route REST qui la sert au
> même lecteur — et sous quelle loi la garde-t-elle ? »**
>
> Si les deux lois diffèrent, **c'est la plus FAIBLE qui décide de ce qui fuit**,
> et c'est presque toujours le DIRECT : une route REST a un schéma, un
> sérialiseur, une fonction de garde nommée ; une diffusion Socket.IO n'a rien
> de tout cela, et sa garde est écrite à la main par le lot qui a pensé à elle.

C'est la famille de « cette entité a-t-elle une JUMELLE ? »
(`services/gateway/CLAUDE.md`), avec une variante qui ne s'y trouvait pas : la
jumelle n'est ici ni une autre table, ni un autre site, ni un autre moment, ni
un autre médium — c'est **le même champ, pour le même œil, par un autre
TRANSPORT**. Et le transport décide de la force de la garde.

## Le corollaire de réparation

Quand l'écart est trouvé, **aligner la garde n'est pas la seule issue, et c'est
souvent la plus chère.** Trois questions, dans cet ordre :

1. **Qui LIT le champ ?** (relever les trois clients, pas supposer) — s'il n'a
   aucun lecteur, servir une garde pour l'alimenter est de la machinerie pour
   personne. Précédent : #14319.
2. **Où la garde se poserait-elle ?** Si le verdict exige une donnée qui n'arrive
   qu'APRÈS une écriture, la garde s'installe dans une fenêtre d'ordonnancement
   — un coût de correction, pas de la sécurité gratuite.
3. **Le retrait est-il SEC ?** Un décodeur client STRICT transforme un retrait de
   champ en perte de l'événement ENTIER, donc en perte des champs qui, eux, sont
   lus. La réponse rétrocompatible garde la clé et vide la VALEUR.

## Le corollaire de témoin

**Anonymiser une charge rend VACUEUX tout témoin de non-fuite posé sur elle.**
Le témoin « ni l'id ni le pseudo ne partent » reste vert sous n'importe quel
fail-open une fois la charge vidée : il n'atteste plus que le correctif qui
vient de le vider. Le lot qui retire une donnée hérite donc de la relecture de
tous les témoins qui l'exerçaient, et chacun se repose sur ce que son unité
**DÉCIDE** (ici : rien ne part du tout), pas sur ce que la charge contient.

## Et le champ en écriture seule

Le `username` de `SocialEventsActor` n'avait plus qu'un écrivain après ce lot et
zéro lecteur. Le laisser à portée de la couche de diffusion, c'est laisser le
prochain lot le remettre sur un fil sans qu'un témoin tombe : **la seule façon
de ne pas renommer quelqu'un est de ne pas transporter son nom jusque-là.**
