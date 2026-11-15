## Leçon 78 — Une baseline lancée en tâche de fond pendant qu'on code n'est pas une baseline (2026-08-10, routine messaging, cycle 55)

La leçon 75.6 impose de comparer à une baseline MESURÉE sur arbre propre. Elle a été appliquée — et
ratée, par une erreur d'ordonnancement : la suite complète a été lancée en tâche de fond « pendant
ce temps », puis les fichiers du correctif ont été écrits dans les minutes qui ont suivi. Jest
n'énumère pas ses suites une fois pour toutes au démarrage : les fichiers créés en cours de route
sont ramassés, et ceux qu'on édite sont lus au moment où leur suite démarre. Le résultat annonçait
21 suites rouges dont une, `postRemovalEffects`, que le correctif venait de toucher — une baseline
qui décrit un arbre qui n'a jamais existé.

Le tell est bon marché et vaut d'être cherché : **si la liste des suites rouges d'une baseline
contient un fichier que le cycle touche, la baseline est contaminée.** Une baseline saine ne connaît
rien du travail en cours.

La parade est un ordre, pas une précaution : **commiter d'abord, mesurer ensuite.** Le travail
commité, `git checkout HEAD~1` en tête détachée rend un arbre réellement propre sans rien risquer —
tout est récupérable par un `git checkout` de retour sur la branche. C'est aussi ce qui évite le
`git stash -u` que la leçon 69 apprend à redouter. Le seul coût est une seconde exécution complète,
qui est précisément ce que la mesure vaut.

**Addendum, la cause racine étant pire que le symptôme.** La contamination n'était pas un défaut de
patience : les attentes étaient lancées en tâche de fond puis la question suivante posée sans
attendre leur notification, si bien que **zéro seconde réelle s'écoulait entre deux sondages**. Ça a
produit une seconde erreur, plus coûteuse : une étape de CI vue « en cours » à trois sondages
d'intervalle a été déclarée BLOQUÉE depuis 50 minutes alors qu'elle tournait depuis deux, et un
correctif de CI a été écrit — puis retiré — sur cette observation fabriquée. Elle avait duré
93 secondes.

Deux règles qui en sortent, et la seconde vaut au-delà de l'outillage :
1. **Une attente en tâche de fond n'est une attente que si l'on rend la main jusqu'à sa
   notification.** Sonder juste après l'avoir lancée mesure l'instant du lancement.
2. **Une durée n'est jamais « le nombre de fois que j'ai regardé ».** Avant de qualifier quoi que ce
   soit de bloqué, lire les HORODATAGES de la chose observée et les soustraire. Ici les deux
   timestamps étaient dans la réponse même qui servait à conclure au blocage.
