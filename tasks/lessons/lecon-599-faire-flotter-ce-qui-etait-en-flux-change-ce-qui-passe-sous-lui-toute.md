## Leçon 599 — Faire FLOTTER ce qui était en flux change ce qui passe SOUS lui : toute mesure d'occlusion devient dépendante du défilement

#6220 a sorti la barre de recherche de la liste du flux (`absolute inset-x-0 bottom-0 z-10`), avec la bonne réserve (`padding-block-end` mesurée par `ResizeObserver`) pour que la dernière rangée reste atteignable. Le lot a ajouté ses témoins sur ce qu'il visait — le CENTRE de la dernière rangée, au bas maximal du défilement — et ils passent. `Peaux web-v2` est pourtant devenu rouge sur `dev` :

```
· la cible tactile du bouton d'actions de « c-nouvelle » couvre 44×44
    (2 coin(s) hors cible, boîte 34×34
     | bas-gauche → DIV.flex … backdrop-blur-xl           [DANS LA BARRE]
     | bas-droit  → DIV.absolute inset-x-0 bottom-0 z-10  [DANS LA BARRE]
     | btnTop=753 btnBottom=787  vh=844)
```

1. **Une réserve protège la FIN du contenu, jamais son passage.** `padding-block-end` garantit qu'on peut défiler assez loin pour voir la dernière rangée dégagée. Elle ne dit rien des rangées qui traversent la bande du flotteur en chemin — et c'est désormais chacune d'elles, à un moment. La question à poser à tout élément qu'on fait flotter n'est pas seulement « le contenu peut-il l'éviter ? » mais **« qu'est-ce qui passe dessous, et que lui prend-il au passage ? »**.

2. **Le débord d'une cible tactile dépasse la boîte, donc il sort de la réserve.** `tap-target-34` porte un bouton de 34 px à 44 par un `::after` de 5 px sur chaque bord. Une réserve calculée sur des BOÎTES laisse ces 5 px sous le flotteur. Un débord invisible est invisible aux mesures de disposition aussi.

3. **Le symptôme désigne la POSITION, pas l'élément — et il le dit en changeant de nom.** Le constat tombait sur `c-nouvelle` en local et `c-salon-riviere` en CI. **Un défaut qui change de sujet d'une machine à l'autre est un artefact de position**, et le chercher dans la rangée nommée est une impasse. Une sonde qui rend l'élément gagnant de `elementFromPoint` (et non le seul compte de coins ratés) a donné la réponse en un tir.

4. **Corriger la MESURE, pas la loi — et le prouver.** La section mesurait la géométrie du bouton ; l'occlusion par un flotteur assumé est un autre sujet, dont la réponse produit (parité iOS) est que la barre possède sa bande. Le gate centre donc la rangée avant de mesurer, avec une CONTRE-GARDE qui vérifie qu'elle est bien dégagée de la barre — sans quoi un futur changement de disposition remettrait la mesure sous le flotteur en silence. Et la garde garde ses dents, vérifié : plancher porté de 44 à 60 ⇒ **29 constats en défaut, quatre coins chacun**. Sans cette contre-épreuve, « le gate est vert » ne distingue pas une garde réparée d'une garde désarmée.

Issues : #6220 (la barre flottante), #6237 (l'artefact et sa correction).
