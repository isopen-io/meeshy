## 2026-11-12 — Une destination du jeu se nomme par l'objectif visé, jamais par l'outil (#17769)

Correction du porteur.

### Ce qui s'est passé

Pour le barreau du menu qui ouvre le jeu, j'ai proposé « Progression » (le nom
de l'écran), puis retenu « Le Jeu » parmi « Le Jeu », « Exploits » et « Mon
rang ». Le porteur a refusé les deux : « il faut le désigner par l'objectif
visé, par exemple la Légende ».

### La règle

Un nom de destination du jeu dit **ce que le joueur poursuit**, pas ce qu'est
l'écran (« Progression ») ni la catégorie de produit (« Le Jeu »). Le nom
retenu : **« Ma Légende »**. Il est appliqué partout où il désigne la
destination : barreau du menu, titre de l'écran, rangées du Profil et des
Réglages, lien d'en-tête web, annonce de chargement.

### Avant de proposer un nom

1. Lire le glossaire de l'épopée (`packages/shared/design/game-epic-vocabulary/<langue>.json`).
   Il bannit des mots (« rang », « série ») et fixe les noms canoniques (paliers, rangs).
2. Vérifier qu'un nom d'objectif ne se confond pas avec un palier précis.
   « Légende » est un rang et « Mythe » est au-dessus : « La Légende » seule
   ferait croire que c'est le sommet. « Ma Légende » se lit comme l'histoire du
   joueur, vraie à tout rang.
3. Un nom change partout où il désigne la même chose (dimension 6), jamais sur
   un seul site.
