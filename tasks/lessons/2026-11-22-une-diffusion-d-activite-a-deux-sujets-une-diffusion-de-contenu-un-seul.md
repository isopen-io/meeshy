# Une diffusion d'ACTIVITÉ a deux sujets ; une diffusion de CONTENU n'en a qu'un

**2026-11-22 · #20236 · cycle 218 de la routine temps réel**

## Le fait

#20216 a fermé six diffusions `comment:*` : un compte qu'un blocage sépare du
commentateur ne reçoit plus le contenu d'un commentaire en direct. Le lot était
complet **dans sa langue** — « ce qui porte le contenu d'un commentaire ».

Quatre événements restaient ouverts : `comment:liked`, `comment:unliked`,
`comment:reaction-added`, `comment:reaction-removed`. Ils ne portent aucun
contenu — un id, un emoji, un compteur. Et ils **nomment deux personnes** : le
lecteur qui a bloqué l'une des deux apprenait son activité.

## Les deux règles

**1. Un événement qui ne porte aucun contenu peut quand même nommer
quelqu'un.** Une garde de CONTENU ne couvre pas une garde d'ACTIVITÉ, et la
seconde ne se trouve pas en cherchant « où le texte part-il ? » : par
construction, ces événements n'apparaissent dans aucune énumération de contenu.
La question qui les attrape est *« qui cet événement NOMME-t-il ? »*, posée au
couple `(événement, charge)` ligne à ligne — pas à ce que l'événement
transporte.

**2. Une diffusion de contenu a UN sujet ; une diffusion d'activité en a
DEUX**, et taire un seul des deux ne tait rien. Ici l'ACTEUR (que la charge
nomme) et l'AUTEUR du commentaire (dont le compteur bouge). C'est ce qui dicte
la forme du témoin : **poser le blocage autour de chaque sujet SÉPARÉMENT**. Un
vecteur qui les bloque tous les deux ensemble passe au vert sous un correctif
qui n'en garde qu'un — mesuré, les deux mutations tombent sur des témoins
différents, et un seul vecteur groupé n'en aurait fait tomber aucun des deux.

## Le corollaire de coût, et sa frontière

Deux sujets au lieu d'un doublent naïvement la lecture (`getBlockRelatedUserIds`
coûte deux requêtes **par sujet**). Les deux sens se lisent pour **tous** les
sujets à la fois (`hasSome` / `id: { in }`) : deux lectures quel que soit le
nombre de sujets.

Et quand le même couple de sujets revient — la traduction d'un commentaire
diffuse une fois **par langue cible**, chaque résultat arrivant séparément du
pipeline, donc sans boucle où passer le résultat — un cache court est le seul
outil disponible. La frontière qui le rend acceptable tient en une phrase :

> **Un cache de blocages sert une AUDIENCE, jamais une AUTORISATION.** La
> décision de laisser agir se lit à frais neufs ; ce que la fenêtre peut coûter
> est au pire un événement d'activité livré à qui vient de bloquer, pendant que
> la liste REST se tait déjà. Relire à chaque langue d'un même commentaire est,
> lui, un coût certain pour une fraîcheur que personne n'observe.

Et il est BORNÉ : un cache qui grandit avec le trafic est une fuite, pas une
optimisation.

## Le prix à payer : les doubles qui décrivaient un monde parti

Quatre harnais voisins ont dû suivre — la lecture a changé de forme, deux
diffusions sont devenues asynchrones, `io.to()` peut recevoir `.except()`. Les
mettre à jour **fait partie du correctif** : un double qui ne modélise pas la
production atteste un monde qui n'existe plus (règle du cycle 92 bis). Aucune
assertion n'a bougé ; seules les formes de lecture et d'attente.

## Famille

Jumelle de « un lot ferme une classe dans SA langue » (cycle 128) : #20216
avait fermé « ce qui porte le contenu d'un commentaire », et l'activité n'en est
pas dans cette langue-là — elle écrit pourtant sur la même room, dans le même
fichier. Devant un inventaire de sites, demander : *ce que je viens de nommer
est-il la propriété, ou seulement le mot par lequel je l'ai trouvée ?*
