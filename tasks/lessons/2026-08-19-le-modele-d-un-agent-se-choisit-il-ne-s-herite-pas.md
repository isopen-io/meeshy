## 2026-08-19 — Le modèle d'un agent se choisit, il ne s'hérite pas

Un workflow de 15 agents lancé sans `model` sur aucun appel : tous ont hérité du
modèle de session (Opus), y compris les lots dont le plan portait déjà le code
exact à écrire. Correction du user : « utiliser un modèle adapté à la complexité
de la tâche et pas forcément Opus systématiquement ».

Le critère n'est pas la taille de la tâche mais **le coût d'une erreur et la
portée du raisonnement** :

- **Sonnet** — appliquer un plan qui contient déjà le code, ligne à ligne : les
  lots d'implémentation, la revue de conventions, les branchements mécaniques.
- **Opus** — là où une erreur est coûteuse et le raisonnement traverse les
  fichiers : une ACL partagée par deux verdicts, une UI à gestes composés, une
  revue transversale aux trois plateformes, un arbitrage entre constats
  contradictoires.

Deuxième leçon, dans le rattrapage : **avant de changer les `opts` d'un agent
pour reprendre un run, vérifier ce qui a DÉJÀ été livré.** Le cache de resume est
keyé sur `(prompt, opts)` — changer le modèle d'un agent terminé l'invalide et le
fait rejouer un travail déjà committé. `git log` avant l'édition du script, pas
après : je m'apprêtais à faire re-tourner deux lots gateway dont les commits
étaient en base.

À retenir : le modèle est un paramètre de conception du workflow, au même titre
que le découpage en phases. L'omettre n'est pas un défaut neutre — c'est choisir
le plus cher par défaut.
