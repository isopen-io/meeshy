## Leçon 431 — Un repli BIEN TESTÉ rend un champ perdu indiscernable d'un champ absent

**Le fait.** `StoryLocationObject.styleId` — le gabarit qui décore une pastille
de lieu (#4717) — ne quittait jamais l'appareil. Trois sites le perdaient, dans
les deux sens : l'aller v1→v3 du SDK, le retour v3→v1, et le convertisseur de la
passerelle. Le lot qui a créé le champ est FERMÉ ; le champ n'a jamais voyagé.

Personne ne l'a vu pendant deux semaines, et la raison est la seule partie
intéressante : **le repli d'un `styleId` absent est `location.pill`, c'est-à-dire
l'un des six gabarits.** Le seul gabarit qui survivait à l'aller-retour était
donc celui qui SERT de repli. Décorer une pastille en « pastille » marchait
parfaitement ; les cinq autres retombaient dessus, en silence, avec exactement
l'aspect que le lot promettait de préserver « au pixel près ».

Et les témoins livrés par ce lot étaient bons — ils mesuraient la RÉSILIENCE du
rendu : un id inconnu retombe sur la pastille, un id d'une autre famille aussi.
Tous verts. Aucun ne mesurait la SURVIE du champ.

> **Un repli est une machine à effacer les preuves.** Plus il est soigné, moins
> la perte se voit : il rend « le champ n'est pas arrivé » identique à « il n'y
> avait pas de champ ». Un repli non testé finit par produire un trou visible ;
> un repli parfait produit un contenu plausible.

**Le geste — où s'écrit le témoin.** Un témoin qui vérifie qu'un champ VOYAGE
s'écrit sur une valeur qui DIFFÈRE du repli. Sur la valeur de repli, la règle
juste et le champ perdu rendent le même verdict, donc le témoin ne peut pas
tomber. C'est la forme exacte de la **leçon 261** (« un témoin de RANG s'écrit
sur un rang AUTRE que le premier »), portée d'un résolveur à un convertisseur :
partout où une valeur par défaut existe, elle est l'endroit où l'on ne mesure
rien.

**La moitié structurelle, et pourquoi un témoin par clé ne suffit pas.** Ces
convertisseurs ne TRANSPORTENT pas une charge : ils la RECOMPOSENT clé par clé.
Chaque branche est donc un inventaire humain à tenir à jour, et toute clé
ajoutée en amont s'y perd sans que rien ne rougisse. Trois pertes en deux jours
sur le même fichier — `postMediaId`/`provider`, puis `templateId`/`slots`, puis
`styleId`. Le correctif du matin avait livré un témoin par clé, juste et vert :
il ne POUVAIT pas attraper `styleId`.

> **Un témoin par clé ne parle que des clés auxquelles on a déjà pensé** —
> c'est-à-dire précisément l'ensemble sur lequel on ne se trompe pas. Ce qui
> attrape la classe entière est un témoin d'EXHAUSTIVITÉ : comparer l'ensemble
> des clés que l'ÉMETTEUR produit à l'ensemble que le convertisseur recompose,
> sans en nommer aucune. Ouvert en #4833.

**Et un commentaire qui raconte le piège ne protège pas du piège.** Le code
fautif du convertisseur portait, juste au-dessus, un commentaire décrivant ce
défaut pour l'avoir déjà subi. Il dit « c'est arrivé » ; il ne dit pas « ça peut
recommencer », et surtout **il ne compte rien**. Seul un témoin qui se DÉRIVE de
la source compte.

**La jumelle de MISE EN PAGE** (relevée par une session voisine dans le même
cycle, sur `ComposerToolRow`) : une rangée qui ÉNUMÈRE ses entrées à la main a
le même défaut. Mesurée à six entrées, une septième est entrée par un slot
d'accessoire, personne n'a remesuré — et là encore un repli sauvait les
apparences, un `ScrollView` : le geste existait, donc la loi 4 restait tenue, et
un défilement n'a pas d'état d'échec. Le correctif a la même forme que #4833 :
dériver le compte de ce qui est RENDU plutôt que de l'écrire.

**La règle générale, valable des deux côtés :** *ce qui s'énumère se périme, ce
qui se dérive tient.* Partout où du code recopie une liste — clés d'une charge,
entrées d'une rangée, champs d'un `select`, sites d'une règle — la liste est une
dette, et le témoin doit interroger la SOURCE, jamais la copie.

### AMENDEMENT — le TEST qui manquait, et qui se pose à la DÉCLARATION

Cette leçon décrit un symptôme : un repli soigné efface la trace de la perte.
Elle ne donnait aucun moyen de le voir venir. Une session voisine l'a extrait
d'un cas de la même famille rencontré le même jour (#4868) — `hasMoreComments`
initialisé à `true` pour signifier « je ne sais pas encore », et lu partout « il
y en a plus ». Le détail rendait donc « Commentaires (0) » et « Charger plus »
côte à côte.

Ce n'est pas une analogie avec le cas des gabarits : c'est le **même mécanisme
sur deux types différents**.

| cas | valeur par défaut | ce qu'elle rend indiscernable |
|---|---|---|
| `styleId` absent | `location.pill`, **un gabarit valide** | « pas arrivé » et « pas de gabarit » rendent le même pixel |
| `hasMoreComments` | `true`, **une réponse valide** | « je ne sais pas » et « il y en a » rendent le même bouton |

> **Le test : la valeur par défaut appartient-elle au DOMAINE DES VALEURS
> LÉGITIMES ?**
>
> - **Oui** ⇒ elle est indiscernable d'une vraie réponse. Il faut un état HORS
>   domaine — `nil`, un cas d'énumération dédié, un sentinel.
> - **Non** ⇒ elle se distingue toute seule, et le repli est sans danger.

Ce qui rend ce test précieux est **le moment où il se pose** : à la DÉCLARATION,
avant qu'aucun consommateur n'existe. Les deux cas ci-dessus ont été trouvés
depuis l'aval — un pixel faux, un bouton en trop — c'est-à-dire des mois après
que la décision de type ait été prise, et par hasard. Le test, lui, se pose en
écrivant la ligne.

Et il explique pourquoi « un tri-état écrasé en booléen » et « un repli bien
choisi » sont le même défaut : dans les deux cas, l'ignorance a été codée avec
une valeur qui signifie déjà autre chose.
