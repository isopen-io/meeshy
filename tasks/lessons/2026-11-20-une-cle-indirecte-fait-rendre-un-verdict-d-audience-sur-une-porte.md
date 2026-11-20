## Une CLÉ indirecte fait rendre un verdict d'AUDIENCE sur une PORTE (cycle 195, #20100)

#20091 avait appris au cliquet des audiences à **publier** ce qu'il ne sait pas
juger, et nommé une forme : la **portée** indirecte — `{ ...SCOPE, isActive: true }`,
un `where` littéral dont le `conversationId` vient d'un étalement, donc qu'on ne
peut pas rattacher à une conversation.

Il avait laissé l'autre moitié se faire juger. `{ conversationId, ...callerParticipantWhere(caller) }`
a toute l'apparence d'une audience — portée écrite, aucune identité visible — et
c'en est le CONTRAIRE : l'appel porte la **clé du membre**. En ajoutant `findFirst`
au relevé (où cette forme est la règle, une lecture unitaire ÉTANT une porte), le
balayage se serait mis à déclarer « audience nue » des portes parfaitement
cadrées, et à envoyer les réparer.

> Les deux formes ont la même cause — un étalement illisible — et **seule la
> seconde produit un faux verdict plutôt qu'un silence.** Un lot qui corrige la
> première sans voir la seconde a traité le symptôme le plus visible, pas la
> classe.

Le discriminant ne retient qu'un **APPEL**, jamais un identifiant, et ce n'est pas
une commodité de mise en œuvre : **nommer un membre en particulier exige une
valeur d'exécution**, qu'une constante de module ne peut pas porter. Le premier jet
publiait les deux formes, et il a fallu mesurer ce qu'il faisait DISPARAÎTRE :
trois décisions déjà instruites (`NOT_YET_ACCEPTED`, `[...narrowing]`), reclassées
en « je ne sais pas » par le lot même qui prétendait mieux voir.

> **Un lot qui élargit ce qu'un instrument PUBLIE doit mesurer ce qu'il fait
> sortir de ce qu'il JUGEAIT.** Une entrée d'inventaire qui devient illisible
> n'est pas une information de plus : c'est une décision instruite remplacée par
> un silence, et elle part sans bruit — le cliquet reste vert, et l'inventaire
> rougit seulement parce qu'une clé ne désigne plus rien, ce qui se lit comme un
> détail de clé.

Même règle, un cran plus bas : les fabriques de clause purement NÉGATIVES du dépôt
(`unsetOrNull`, `differsOrUnset`) sont exemptées, parce qu'**aucune forme négative
ne SÉLECTIONNE quelqu'un** — et c'est la même correction qui a fait entrer onze
audiences réelles que le discriminant d'identité écartait en silence : il
n'admettait que `{ not: null }`, la NULLITÉ, et prenait `userId: { not: userId }`
(« tous les membres SAUF moi », soit l'audience la plus courante d'un tête-à-tête)
pour la désignation d'une personne.
