## 2026-11-25 — Un push refusé dit qu'une autre session écrit la branche : on relit avant de dispatcher (#20522)

### Ce qui s'est passé

Une passe de la boucle du Jeu préparait deux corrections de la PR #20547 (iOS) en attendant
la fin d'`ios.yml`. Son `git push` a été refusé (`cannot lock ref … is at c0ac4214d but
expected db0e4ed26`) : une autre session de la même boucle venait de pousser les MÊMES
corrections et de dispatcher les trois workflows. La passe a tout de même lancé, dans la
même commande, ses trois `workflow_dispatch` : ils ont annulé `ios.yml` et `android.yml` de
l'autre session (même ref, même concurrence), pour rejouer exactement le même SHA.

### Pourquoi

Le dispatch suivait le push dans une seule ligne de shell, sans condition sur son succès.
Un push refusé n'est pas une panne : c'est la seule trace, dans git, qu'un autre écrivain
est vivant sur la branche (directive « la branche poussée tôt », #5243).

### La règle

- Un dispatch ne part qu'APRÈS un push accepté, jamais dans la même commande sans `&&`.
- Un push refusé arrête tout geste sur cette branche : `git fetch`, lire l'auteur et la
  session du commit de tête, lire les runs `workflow_dispatch` à ce SHA. S'ils existent, la
  branche est à l'autre session : on cède et on n'y redispatche rien.
- Si son travail recouvre le nôtre, on se recale sur sa tête (fusion), on ne réécrit pas.
