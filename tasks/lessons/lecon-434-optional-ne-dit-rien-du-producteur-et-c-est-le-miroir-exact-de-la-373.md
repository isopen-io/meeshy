## Leçon 434 — `optional()` ne dit rien du PRODUCTEUR, et c'est le miroir exact de la 373

**Le fait.** Le lot #4591 (`acecfd51e7`) a corrigé une faute de lecture qu'il
nomme lui-même, et très bien : on lisait `timing: optional()` dans le contrat
partagé comme « cette famille n'a pas de temps », d'où un cercle de six absences
(leçon 373). La règle qu'il en tire est juste :

> `optional` décrit la PRÉSENCE d'un champ, jamais la CAPACITÉ d'une famille.

Puis, dans la même note de livraison, il écrit : « Aucune publication existante
ne change : les quatre champs sont **optionnels sur le fil** et absents partout. »
C'est la MÊME optionalité, relue cette fois comme la preuve que le champ
VOYAGE. Mesuré au dépôt : la branche `place` de `CanvasV3Migration` passe
`timing: timingV3(start: nil, …)` et n'émet ni `duration`, ni `fadeIn`, ni
`fadeOut` ; le retour n'en relit aucun (#4840).

> **Une optionalité de schéma est muette dans les DEUX sens.** Elle n'interdit
> pas à une famille d'avoir un temps ; elle ne promet pas non plus qu'un
> producteur en émet. Elle décrit ce que le fil TOLÈRE, jamais ce qu'un site
> ÉCRIT — et un contrat permissif (`payload: z.record(z.string(), z.unknown())`,
> `canvas-v3.ts:59`) n'a rien à dire du tout.

**Le geste.** Devant un champ optionnel au contrat, ne jamais conclure : aller
lire le PRODUCTEUR, nommément. La question n'est pas « le fil accepte-t-il ce
champ ? » mais « quel site l'écrit, et sur quel chemin ? ». C'est la jumelle,
côté émission, de la question du cycle 122 (« qui AFFICHE ce que ce résolveur
élit ? ») : ici, **qui ÉMET ce que ce schéma autorise ?**

**Ce qui rend le cas instructif** n'est pas l'erreur — c'est qu'elle survient
dans le lot qui vient d'énoncer la règle contre elle. Une règle formulée pour un
sens ne se retourne pas toute seule ; elle protège de la lecture qu'on vient de
payer, pas de sa symétrique. **Quand on écrit une règle du type « X ne dit pas
Y », se demander tout de suite : dit-il non-Y ?**

**La forme générale, et pourquoi elle se rejouera.** Ce n'est pas une étourderie
locale : c'est un signal qu'on DISQUALIFIE pour une lecture et qu'on QUALIFIE
aussitôt pour la lecture inverse.

> **Disqualifier une lecture d'un signal ne le qualifie pas pour son contraire.**
> Apprendre que `optional()` ne prouve pas « pas de temps » ne lui fait pas
> prouver « le champ voyage ». Il reste MUET — et un signal muet le reste dans
> les deux sens.

Une session voisine, arrivée au même endroit par un autre axe le même jour, le
formule d'un cran plus haut, et les deux versions se valent : *une règle énoncée
sans énumérer ses dimensions n'est relue que sur celle qui l'a fait naître.*
Chez elle, « un bloc qui grandit ne rencontre pas les mêmes voisins » n'avait
servi qu'à la PLACE, laissant les touchers, le Z et les gestes (leçon 435). Ici,
« qui lit ce champ ? » ne ramène jamais l'éditeur ni le convertisseur — puisque
justement ils ne le lisent pas. **Dans les deux cas la règle est juste, citée, et
protège un quart de ce qu'elle couvre.**

**Corollaire de méthode, payé dans le même tour.** J'ai d'abord écrit dans #4840
que le cercle « avait été brisé en trois sommets ». Le message du commit disait
SIX, avec sa table. J'avais compté les sommets que je voyais depuis mon point
d'entrée au lieu de lire l'inventaire de celui qui les avait réparés — et
l'inventaire était à un `git log -1` de distance.
