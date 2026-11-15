## Leçon 164 — Quand deux éléments se disputent une bande, la géométrie sépare ; l'exclusion mutuelle ampute

**Symptôme.** La pastille de jour d'une conversation et la rangée du header flottant vivaient toutes
deux juste sous l'encoche. Le 12/08 le chevauchement est signalé, le 13/08 au soir il est « résolu »
par une EXCLUSION MUTUELLE : la pastille n'apparaît que pendant le défilement actif, moment où le
header s'efface entièrement en retour. Retour user le lendemain : « remets la gestion des dates et
l'affichage du header comme c'était avant hier soir ».

**Ce que l'exclusion mutuelle coûte, et qu'on ne voit pas en l'écrivant.** Elle a l'air élégante :
un seul occupant à la fois, plus aucun pixel en conflit, et le code se lit comme une invariante
propre. Mais elle paie ce zéro-conflit avec la DISPONIBILITÉ des deux éléments — chacun devient
absent pendant toute la fenêtre de l'autre. Ici : plus de retour, d'avatar ni de titre dès que le
doigt touche la liste ; et la date qui s'évanouit à l'arrêt, c'est-à-dire exactement au moment où on
la LIT. Aucun des deux n'était en trop, et c'est là le point : on n'arbitre pas entre deux éléments
que le produit veut tous les deux, on leur donne chacun leur bande.

**Le remède était déjà là — et il avait été jeté.** L'offset de 60 pt (padding haut du header +
rangée de contrôles + marge) posait déjà la pastille SOUS le header depuis le 12/08. Il a été
supprimé au profit de l'exclusion, au motif qu'un « grand offset fixe » ne permettait pas de poser
la pastille près de l'encoche. C'est un objectif esthétique qui a désarmé une solution
fonctionnelle : la contrainte réelle n'était pas « près de l'encoche », c'était « lisible et sans
chevauchement ».

**Règle : face à deux éléments qui se chevauchent, chercher d'abord la séparation SPATIALE
(offset, bande, colonne) ; ne réserver l'exclusion temporelle qu'aux éléments dont le produit
accepte l'absence.** Un test de disponibilité écrit avant l'arbitrage l'aurait dit : « le header
est-il joignable pendant un défilement ? », « la date est-elle lisible à l'arrêt ? » — deux
questions auxquelles l'exclusion répond non, et qu'aucune garde de chevauchement ne pose.

**Ce qui méritait d'être gardé.** Le signal de défilement construit pour l'exclusion
(`onScrollingActiveChanged`, drag ou décélération) était bon ; c'est son USAGE qui était trop
large. Rebranché sur la seule grappe d'ACTIONS du header — appel, recherche — il devient la loi
`ScrollMotion`, généralisée aux quatre en-têtes à liste : une vue en mouvement ne montre pas ses
boutons d'action, mais elle garde son identité et ses repères de lecture. Un signal juste mal
appliqué se réoriente ; il ne se jette pas avec la solution qu'il servait.

---
