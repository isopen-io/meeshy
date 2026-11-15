## Leçon 511 — Sauver la MOITIÉ d'un lot le casse mieux que ne pas le sauver

**Contexte (2026-09-04, arbre partagé à quatre sessions).** Une session a voulu
protéger le travail en cours d'une autre et a committé ses fichiers **non
suivis** — `2de214435f chore(composer): sauvegarde des trois fichiers de la
pre-montee restes non suivis`. Intention irréprochable, résultat : **l'arbre a
cessé de compiler**, avec dix erreurs.

Le lot avait sept morceaux, pas trois :

| morceau | sort |
|---|---|
| trois fichiers NEUFS | committés par la sauvegarde |
| `adoptPreUploadedMedia` → `public` (SDK) | **perdu** |
| `@StateObject var preUploads` (hôte) | **perdu** |
| `enum ComposerPreUploadSweep` (ajout en fin de fichier existant) | **perdu** |
| l'appel `startPendingPreUploads()` (fin d'une fonction existante) | **perdu** |

Les trois fichiers sauvés référençaient exactement les quatre choses disparues.
Chaque erreur du compilateur était l'un des quatre morceaux manquants.

### Le renversement, qui est le cœur de la leçon

**Un WIP non committé ne casse personne.** Il n'est pas dans l'arbre ; tout
compile autour de lui. Committer ses seuls fichiers neufs produit un arbre qui
**ne peut pas** compiler, et qui compilait avant. La sauvegarde a strictement
DÉGRADÉ l'état qu'elle voulait protéger.

> **Le discriminant n'est pas « tracké ou non » mais « ce fichier a-t-il des
> dépendances non committées ? »** — et un fichier neuf en a presque toujours,
> sinon il ne servirait à rien.

C'est le contraire de l'intuition : les fichiers neufs ont l'air d'être ce qu'on
peut sauver le plus sûrement, puisqu'ils n'écrasent rien. Ils sont en réalité les
plus dangereux à sauver SEULS, parce qu'ils n'existent que pour être appelés.

### Ce qui a évité la récidive, et qui n'est pas la vigilance

Le porteur a demandé, une heure plus tard : « commit le repos actuel et push sur
dev ». Committer sans mesurer aurait poussé un `dev` cassé pour quatre sessions.

Ce qui l'a évité est un GESTE, pas une qualité : **compiler AVANT de signer**,
jamais après. `git status` ne dit rien de la compilabilité d'un arbre — il dit
qui a touché quoi, ce qui est une autre question. La seule façon de savoir si un
arbre est publiable est de le construire.

Corollaire pour un arbre partagé, et il vaut pour les deux rôles :
- **Ne jamais committer le WIP d'une autre session**, même pour le protéger. Si
  on croit devoir le faire, le lui DIRE d'abord : elle committera son lot entier
  en une minute, avec le message que seul son auteur peut écrire.
- **Committer tôt et souvent son propre lot.** Ce qui reste non committé dans un
  arbre partagé finira emporté par le premier qui livre — c'est arrivé deux fois
  ce jour-là, dans les deux sens.

### La forme générale

C'est la famille des **demi-corrections** : un `defaultValue` sans clé au
catalogue (leçon 509), un `exclude` désignant un artefact de runtime, une garde
posée sans son consommateur. Chacune fait quelque chose de juste sur une partie,
et laisse l'ensemble dans un état que personne n'a voulu — **plus difficile à
diagnostiquer que l'absence complète du geste**, parce que la partie faite
détourne l'attention de la partie manquante.
