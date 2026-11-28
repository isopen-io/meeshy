---
name: repository-excellence
description: Passe d'ingénierie complète sur le monorepo Meeshy : découverte, référence, constats, lots, statut de release. À utiliser quand on demande un audit global ou de reprendre une passe.
---
# Passe d'ingénierie sur le monorepo

1. Lire `.amsf/STATE.md`, puis les issues de `.amsf/BACKLOG.md`. L'issue fait foi.
2. Remesurer la carte si `dev` a bougé : `.amsf/INVENTORY.md`, `.amsf/DEPENDENCY-GRAPH.md`. Ne jamais supposer la structure.
3. Poser la référence avant toute écriture : commandes de `.amsf/CONFIG.md`, résultat dans `.amsf/baselines/<date>.md`, rouges préexistants à part.
4. Un constat = une issue, dans un milestone, indexée dans `.amsf/BACKLOG.md`. Chercher d'abord l'issue ou la PR qui existe déjà : qui a écrit le premier garde le lot.
5. Un lot = une issue, une branche poussée tôt, un témoin rouge puis vert, `dev` fusionnée avant la PR.
6. Quatre flux d'écriture au plus, un worktree chacun ; les changements couplés restent séquentiels.
7. Clore par `.amsf/RELEASE-STATUS.md`, `.amsf/STATE.md` et un rapport daté dans `.amsf/reports/`. Dire ce qui n'a pas été vérifié.
