## Leçon 154 — Trois porteurs d'une même donnée, et aucun geste qui les touche tous

Cycle 114-ter (non-lu iOS, signalement utilisateur « ça affiche 99 puis ça tombe »).

Le compteur de non-lu d'une conversation était tenu en local par TROIS porteurs — cache disque,
store RAM, lignes `@Published` — plus un quatrième pour le badge d'icône. Chacun était correct pris
isolément, chacun avait ses tests, et le va-et-vient venait de ce qu'AUCUN geste ne les écrivait
tous : selon qui republiait en dernier, la ligne montrait 0 ou 99.

> **Un défaut de cohérence ne se voit dans aucun des fichiers concernés.** Il n'existe que dans le
> tableau « qui écrit quoi, sur quel geste » — un tableau que personne ne dessine tant qu'il n'y a
> pas de bug. Le dessiner est le diagnostic ; le code ne le contient nulle part.

Deux corollaires de méthode, tous deux vérifiés ici :

1. **Une règle partagée ne l'est que là où on l'appelle.** `reconcileUnread` existait, était pure,
   testée, et documentée « source de vérité » — appliquée par UN seul des trois porteurs. Nommer
   une fonction « la règle » ne la propage pas ; seul un appel le fait. Le test qui compte n'est pas
   « la règle est-elle juste ? » mais « combien de sites la contournent ? », et il se répond par un
   grep du nom de la fonction, pas par la lecture de sa doc.
2. **Un garde-fou qui protège un champ ne protège que ce champ.** Le store version-gate `userState`
   pour défendre les mutations optimistes en vol — mais le non-lu ne participe PAS au versionnement
   (`applyReadReceipt` ne bumpe jamais `version`, par conception). Le garde-fou était donc
   structurellement inopérant sur lui, à l'égalité de version, c'est-à-dire toujours. **Quand une
   structure porte deux champs régis par des horloges différentes, un garde-fou écrit pour l'une est
   un trou pour l'autre** — et il se lit comme une protection.

Corollaire produit, distinct des deux précédents : **« j'ai lu » et « ma pastille s'éteint » sont
deux décisions, pas une.** La première engage l'utilisateur vis-à-vis des autres (accusés de
lecture, exactitude de ce qu'on déclare avoir vu) ; la seconde n'engage que son propre écran. Les
avoir confondues a produit les deux bugs symétriques à un an d'écart : d'abord un accusé
sur-déclaré, ensuite une pastille qui ne s'éteignait plus. Les séparer explicitement — un chemin
local sans réseau, un chemin serveur gaté par l'exactitude — les résout tous les deux à la fois.
