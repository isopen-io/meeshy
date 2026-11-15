## Leçon 242 — « Travaille directement sur main » : la directive de l'utilisateur prime le réflexe du worktree (2026-08-22, reprise Rivière)

Mon plan ouvrait un worktree dédié (réflexe acquis : agents parallèles = worktrees). L'utilisateur a
coupé : « Travailles directement sur main!! ». Deux sessions ont alors travaillé dans le MÊME arbre
sur `main` — l'autre y a mergé une branche pendant mes éditions non committées, et committé un test
non recalibré (`BubbleContentMatrixTests`) que j'ai dû réparer pour que le bundle recompile.

**Ce qui en découle, quand on partage un arbre :**
- committer par LOTS COURTS et par chemins explicites (`git commit -- <fichiers>`), jamais `add -A` ;
- relire `git status` avant chaque commit : un fichier inattendu est le WIP d'un autre ;
- chaque build peut être TUÉ par un voisin (« BUILD INTERRUPTED », « Test crashed with signal kill ») :
  rejouer sans conclure à une régression ; garder les étapes simulateur en premier plan, courtes.

**Et surtout** : un réflexe de méthode (worktree, branche, PR) n'est pas une règle produit. Quand la
consigne est explicite, on l'applique et on adapte la discipline (commits serrés) — on ne la
contourne pas « pour bien faire ».
