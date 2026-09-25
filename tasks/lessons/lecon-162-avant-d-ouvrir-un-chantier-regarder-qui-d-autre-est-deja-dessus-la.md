## Leçon 162 — Avant d'OUVRIR un chantier, regarder qui d'autre est déjà dessus — la leçon 159 vaut aussi à l'aller (2026-08-14, routine messaging, cycle 123bis)

La leçon 160 disait : avant de RÉPARER un fichier cassé, chercher qui d'autre le répare déjà. Ce
cycle a montré que la règle vaut à l'identique pour une FONCTIONNALITÉ, et qu'elle se paie plus
cher — parce qu'un chantier dure des heures, pas trois minutes.

J'ai implémenté « le filtre de la cloche ne filtre que le déjà-chargé » de bout en bout : gateway,
web, témoins, doc, PR #2991, CI verte sur quatorze jobs. Pendant que ma CI tournait, une autre
session de LA MÊME routine a livré et fusionné le même correctif (#2986). Deux implémentations
indépendantes du même défaut, dont une jetée — la mienne.

**Ce qui l'aurait dit en dix secondes, avant d'écrire la première ligne :**

```bash
git ls-remote origin 'refs/heads/*' | grep -i <mot-clé-du-chantier>
# et : gh/MCP search_pull_requests state:open — le TITRE d'une PR ouverte dit le chantier
```

Le candidat que j'ai pris venait de la section « Prochains candidats » de `tasks/todo.md` — c'est-
à-dire d'une liste PUBLIQUE, lue par toutes les sessions de la routine. **Une file de tâches
partagée sans réservation produit mécaniquement des doublons** : le premier candidat de la liste
est celui que tout le monde prend. Prendre le premier NON déjà porté par une branche distante est
le geste correct.

**Ce que le doublon coûte, et ce qu'il ne coûte pas.** Il ne coûte pas la compréhension du défaut :
les deux implémentations sont arrivées aux mêmes conclusions (`?types=` en CSV, liste vide = pas de
filtre, compte serveur pour les pastilles), ce qui est un signe que l'analyse était juste. Il coûte
le temps machine et, surtout, il fait courir le risque d'un ÉCRASEMENT : deux branches qui touchent
les mêmes fichiers, et la dernière fusionnée gagne. C'est exactement le scénario de la leçon 160,
en plus gros.

**Le geste de sortie, quand le doublon est constaté : ne pas fusionner par-dessus.** Repartir de
`main`, comparer les deux implémentations point par point, et ne garder que le DELTA réellement
absent. Ici, trois choses manquaient à la version fusionnée — le squelette qui emporte toute la
page à chaque premier passage sur un onglet, le `{ types: [] }` qui dédouble le cache de la cloche,
et la doc qui annonçait toujours les paramètres fantômes à l'origine du bug. Le cycle a donc rendu
une PR de suite, petite et honnête, au lieu d'une PR concurrente. Le travail superseded est gardé
sous un tag (`cycle123-superseded-by-2986`) plutôt que poussé.

**Corollaire — une CI longue est une fenêtre de collision.** Quatorze jobs, dont un de huit
minutes, laissent une demi-heure pendant laquelle `main` peut recevoir le même correctif. Re-faire
`git fetch origin main` AVANT de fusionner n'est donc pas une formalité : c'est le seul moment où
la collision est encore réparable proprement.
