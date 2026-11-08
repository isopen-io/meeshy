## `git checkout -- .` TRONQUE un fichier « intent-to-add » au lieu de le laisser (2026-11-08)

Pour mettre un correctif de côté sans polluer la branche pendant qu'une preuve
CI tournait, j'ai fait : `git add -N <fichier neuf>` (pour que `git diff` voie
son contenu), `git diff > correctif.patch`, puis `git checkout -- .` pour rendre
l'arbre propre. Le fichier neuf a survécu — **vide.**

`-N` l'inscrit à l'index avec un contenu VIDE et une intention d'ajout. Pour
`git checkout -- .`, la version de référence de ce chemin est donc le vide, et
il y restaure... le vide. Aucune erreur, aucun avertissement : un fichier de 73
lignes devient un fichier de 0 ligne, et `git status` ne montre plus rien
d'anormal puisque l'arbre est bien « conforme à l'index ».

> **Un chemin « intent-to-add » a une version de référence, et c'est le VIDE.**
> Pour mettre de côté un fichier NEUF, le déplacer hors du dépôt (`mv`) ou le
> ranger avec `git stash -u` — jamais le confier à une commande de restauration,
> qui restaurera exactement ce que l'index déclare.

Ce qui rend la famille coûteuse, c'est que la perte ne se voit pas au moment où
elle arrive mais au moment où l'on se sert du résultat : j'ai découvert le vide
une heure plus tard, en relisant le fichier avant de le committer. Le contenu
n'était heureusement pas perdu — le patch, lui, le portait — mais c'est un coup
de chance de l'ordre des commandes, pas une sauvegarde.

Et c'est la **sixième** fois de ce cycle qu'une mesure ou une mise de côté
n'a pas survécu à ce qu'elle manipulait : l'arbre édité pendant la passe, deux
passes concurrentes, le vert d'une sélection vide, le gate lu avant le dernier
commit, la garde de source pointant un fichier déplacé — et maintenant la
sauvegarde qui vide ce qu'elle sauve. *Le contrôle est toujours le même : relire
l'objet APRÈS l'opération qui était censée le préserver.*
