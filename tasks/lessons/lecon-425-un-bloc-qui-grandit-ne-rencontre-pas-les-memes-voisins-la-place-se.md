## Leçon 425 — Un bloc qui GRANDIT ne rencontre pas les mêmes voisins : la place se vérifie DÉPLIÉE

**Le fait.** La légende dépliée d'une story, testée sur un corpus de 580 mots,
passait **sous le rail d'actions** (Envoyer, Vues, Partager, Enregistrer,
Traductions) — texte et icônes superposés, les deux illisibles. Repliée, elle
tient en quelques lignes basses et ne rencontre personne.

> **Ce qui ne se chevauche pas dans un état peut se chevaucher dans l'autre.**

**Pourquoi aucun témoin ne pouvait l'attraper.** Les cinq témoins écrits ce
soir-là interrogent la règle de repli, la colonne, la teinte, l'opacité — des
propriétés de la légende SEULE. Le chevauchement est une propriété du
**VOISINAGE**, et il n'existe que dans un des deux états. Un test unitaire sur un
composant ne peut par construction rien en dire.

**Le geste.** Tout contrôle à deux états se photographie dans les DEUX, sur le
contenu qui pousse l'état ouvert à son maximum — un texte court ne fait pas
tomber la règle, il tient quel que soit le voisinage. Et quand la place manque,
la marge se déclare par l'HÔTE (qui connaît son rail) plutôt que dans le
composant partagé : ici `expandedTrailingInset` vaut ZÉRO par défaut, parce que
le plein écran média n'a pas de rail et qu'une marge lui coûterait de la largeur
pour rien.

**Corollaire de mécanisme, du même lot.** Pour dégager le texte de la scène, la
première implémentation posait un `.blur()` sur le canvas. Le porteur a corrigé :

> **Un voile AJOUTE une couche que personne n'a demandée ; effacer en RÉVÈLE une
> qui était déjà juste.**

Le lecteur montait déjà, sous la scène, un fond dérivé du ThumbHash de la slide
(là pour le démarrage à froid). Baisser l'opacité de la scène le découvre : moins
cher pour la machine, et plus honnête pour l'œil — le fond révélé est vraiment
celui de CETTE story, pas un gris générique.
