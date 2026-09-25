## Leçon 198 — deux exécutions de la même routine ont travaillé la même piste en parallèle, et rien ne les en a empêchées (2026-08-16, routine temps réel, cycle 44 bis)

**Le fait.** Deux sessions autonomes ont ouvert le cycle 44 sur la MÊME piste
prioritaire — celle que le cycle 43 avait laissée en fin de document — et ont
produit deux correctifs concurrents du même défaut, dans les mêmes fichiers. Le
second n'a découvert la collision qu'au `git fetch` d'intégration, après avoir
écrit son correctif, ses huit témoins, son entrée de changelog et sa leçon.
Coût : un cycle entier de travail jeté, et une leçon numérotée 280 en double —
la seconde collision, la première ayant déjà été résolue à la main (279 → 280)
dans ce même créneau.

**Pourquoi ce n'est pas un accident isolé.** Une piste laissée en fin de cycle
est, par construction, ce que la prochaine exécution lira en premier : le
mécanisme même qui donne sa continuité à la routine la rend *déterministe*.
Deux exécutions qui démarrent du même état de `main` choisiront la même piste —
non par hasard, mais parce qu'elles suivent correctement la consigne. *La
continuité et la concurrence tirent en sens inverse : le protocole qui garantit
qu'aucune piste n'est perdue garantit aussi que deux instances la prendront
ensemble.*

**Ce que la vérification initiale ne pouvait pas voir.** Le second cycle a bien
commencé par vérifier l'état du dépôt — `git fetch`, branche à parité avec
`main`, cycle 43 intégralement mergé. Le constat était juste **à l'instant où il
a été fait**. Le travail concurrent n'existait pas encore sur `main` : il y est
arrivé pendant la rédaction. *Un `fetch` en début de tâche établit un point de
départ, pas une réservation ; sur une tâche longue, il faut le refaire avant
d'écrire, pas seulement avant de merger.*

**Règle pour la suite.** Avant d'ouvrir un développement sur une piste héritée :
(1) `git fetch origin main` et relire le journal **au niveau du fichier visé**
(`git log --oneline origin/main -- <chemin>`), pas seulement le sommet de
branche ; (2) refaire ce `fetch` au moment de passer du diagnostic à l'écriture,
qui est le point le plus tardif où l'abandon reste bon marché. Et quand la
collision est constatée après coup, **le travail déjà mergé gagne** : rebaser
dessus et ne conserver que le delta réellement additif — ici une seule ligne
morte (`status`) que l'autre correctif avait laissée — plutôt que de faire
concourir deux implémentations d'un même correctif. *Devant deux correctifs
justes du même défaut, le critère n'est pas lequel est le meilleur, c'est lequel
est déjà éprouvé sur `main` ; le second se réduit à son reste.*
