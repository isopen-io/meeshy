## Leçon 527 — `git stash` dans un arbre PARTAGÉ applique le stash d'un AUTRE lot

Constat du 2026-09-05, incident causé et réparé dans la même session : un
correctif d'écran a lancé `git stash push -- <chemins de l'écran>` puis
`git stash pop`, dans un arbre où plusieurs lots (agents parallèles) écrivent
en même temps. Le `push` par chemins n'a RIEN pris — un commit de point
d'étape venait déjà d'absorber ces fichiers, donc rien n'était modifié à cet
instant précis — et `git stash` reste une pile UNIQUE, partagée par tout
l'arbre : le `pop` qui a suivi a donc réappliqué `stash@{0}`, le WIP d'un
AUTRE lot (« recherche »), sur les fichiers de CET écran — neuf fichiers en
conflit (`<<<<<<< Updated upstream` / `>>>>>>> Stashed changes`) sur des
chemins que le lot courant ne possédait même pas.

**`git stash` n'a pas de PORTÉE.** `push -- <chemins>` filtre ce qu'il MET
DANS le stash, jamais ce qu'un `pop` ultérieur en RETIRE — le stash est
toujours dépilé en entier, sur l'état COURANT de l'arbre, quel que soit le
lot qui l'a créé. Dans un arbre à un seul agent, la pile n'a qu'un
propriétaire et l'ambiguïté ne se voit jamais. Dans un arbre PARTAGÉ, la pile
est un canal commun : n'importe quel agent qui pop lit le sommet, pas SON
propre dépôt.

1. **Ne jamais employer `git stash` (ni aucune commande qui touche un état
   GLOBAL du dépôt — l'index, la pile de stash, `git bisect`, un hook global)
   dans un arbre que plusieurs agents éditent en parallèle.** Un worktree
   dédié (`git worktree add`) ou une copie de fichiers dans le scratchpad
   isolent l'opération ; un simple `git diff`/`git status` avant d'agir
   n'aurait pas suffi ici — le push avait réussi (silencieusement, sur rien)
   et rien ne distinguait un stash vide d'un stash correctement ciblé.
2. **Un `push -- <chemins>` qui ne modifie rien mérite un contrôle** : si
   `git status` montre les mêmes chemins avant et après le `push`, c'est que
   rien n'a été empilé — poursuivre par un `pop` dépile alors le sommet de
   quelqu'un d'autre, pas un vide inoffensif.
3. **La réparation se vérifie à TROIS niveaux, pas un** : `git diff HEAD --
   <chemins touchés>` doit rendre vide (rien ne reste de l'application
   erronée), `grep -rln '^<<<<<<< '` sur l'arbre doit rendre vide (aucun
   marqueur oublié), et `git stash list` doit encore montrer le stash
   d'origine INTACT (le "ours" repris pendant la résolution de conflit ne
   doit pas avoir aussi supprimé l'entrée de la pile — un `stash pop` réussi
   la retire automatiquement ; un conflit la LAISSE, ce qui est le filet de
   sécurité qui a permis de tout récupérer ici).
