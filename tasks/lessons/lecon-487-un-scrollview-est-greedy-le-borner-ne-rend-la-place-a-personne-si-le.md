## Leçon 487 — Un `ScrollView` est GREEDY : le borner ne rend la place à personne si le voisin ne la demande pas

L'éditeur d'objet plein écran devait « laisser la place au canvas d'occuper
suffisamment l'espace » (directive porteur, #4997). Deux corrections, et la
première seule ne se voyait presque pas.

1. Le rail d'outils descend du couloir gauche à une rangée basse : la carte
   9:16 récupère 52 pt de largeur. Mesuré : 247 pt → 305 pt de haut.
2. La zone d'options était un `ScrollView` en `.frame(maxHeight: .infinity)`.
   Un `ScrollView` réclame TOUT ce qu'on lui offre, quel que soit son contenu :
   il gardait ≈ 250 pt de bande vide sous la grille des polices.

Le borner (`maxHeight: 260`) n'a pourtant rendu que la moitié du gain. **Le
sujet ne demandait pas la place libérée** : la carte est figée à son ratio et se
CENTRE dans ce qu'on lui donne, donc sans `maxHeight: .infinity` elle se
contentait de sa taille idéale et laissait le reste en vide.

> **Rendre de la place et la PRENDRE sont deux gestes.** Un plafond posé sur le
> voisin glouton ne suffit pas ; il faut aussi que le bénéficiaire soit
> flexible. C'est la forme SwiftUI de « un correctif dont la valeur n'atteint
> aucun lecteur n'a corrigé personne ».

Le contrôle qui l'attrape est une capture AVANT / APRÈS avec la hauteur de la
carte mesurée en points sur l'arbre d'accessibilité — pas « ça a l'air plus
grand ».
