## Leçon 524 — Un agent lancé sans relever ce que le DISTANT a déjà livré refait le travail d'une autre session

Constat du 2026-09-05 (correction porteur) : l'agent de comptage de #4392 a
refait un inventaire que le commit `c2b6d22eb4` — livré par une autre session,
déjà sur `dev` — avait accompli ; seule la décision produit restait ouverte.
Dans un dépôt où plusieurs sessions livrent EN PARALLÈLE sur `dev`, l'état
d'une tâche n'est ni dans ma conversation ni dans le titre de l'issue : il est
dans `git log` récent des fichiers visés et dans les COMMENTAIRES de l'issue.

1. Avant de lancer un agent sur une issue : `gh issue view N --comments | tail`
   et `git log --oneline -5 -- <fichiers visés>` — un commit récent d'une autre
   session sur ces fichiers signifie que le travail est peut-être déjà fait,
   ou en cours ailleurs.
2. Le brief de l'agent inclut ce relevé (« le commit X a déjà fait Y — vérifie
   et complète, ne refais pas »).
3. Et symétriquement : committer et pousser RÉGULIÈREMENT (pas seulement au
   gate final) pour que les autres sessions voient NOTRE travail — un WIP
   long dans l'arbre partagé bloque les merges de `dev`, s'expose à
   l'écrasement (leçon du matin), et invite les sessions distantes à refaire
   ce qu'on tient. Un point d'étape committé avec un message honnête vaut
   mieux qu'un arbre divergent.
