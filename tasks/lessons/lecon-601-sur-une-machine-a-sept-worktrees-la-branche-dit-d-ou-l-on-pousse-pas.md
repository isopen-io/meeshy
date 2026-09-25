## Leçon 601 — Sur une machine à sept worktrees, la BRANCHE dit d'où l'on pousse, pas qui a indexé : le discriminant est le TRAILER de session, et le commit de FUSION en est dépourvu

Deux sessions ont passé une partie de la nuit à se demander qui tenait `dev`. La
réponse s'est trouvée en une ligne, et le chemin vaut la réponse.

`git log --format=%an` ne sépare rien : toutes les sessions committent sous
l'identité du porteur. La note que je portais en mémoire disait « ce qui dit qui a
fait quoi est la BRANCHE, jamais le nom ». **Faux dès qu'il y a plus d'un
worktree** : `git worktree list` en rend **sept** sur cette machine, et une
session peut écrire dans un worktree PARTAGÉ tout en poussant sur sa propre
branche. La branche dit d'où l'on POUSSE ; elle ne dit pas qui a INDEXÉ.

Le discriminant direct est le trailer que chaque session pose dans le corps de
ses commits :

```bash
git log --format=%B -1 <sha> | grep -oE 'session_[A-Za-z0-9]+'
```

Six commits de `dev` que `%an` rendait indistinguables se sont séparés d'un
coup — trois d'une session pair (qui l'a ensuite confirmé), un de la mienne, deux
muets.

1. **Le trou est structurel, et il est au pire endroit.** `git merge --no-edit`
   ne produit aucun trailer. Or **le commit le plus susceptible d'emporter le
   travail d'autrui est précisément celui qui ne dit pas qui l'a fait** : une
   fusion de consolidation. Mesuré sur `dev` : **12 des 60 derniers commits sans
   trailer, soit 20 %** — mes propres fusions comprises. La parade est un `-m`
   explicite sur toute fusion de consolidation ; elle ne coûte rien et rend la
   ligne attribuable.
2. **`git add -A` n'indexe que le worktree COURANT** — chaque worktree a son
   propre index. « Mon `add -A` a-t-il pu emporter le travail en cours d'un
   pair ? » se répond donc par « dans quel worktree l'ai-je lancé ? », et un
   `add -A` dans un worktree distinct est innocent par construction. Mais dans un
   worktree PARTAGÉ il emporte tout : y indexer par CHEMIN, jamais en bloc. Deux
   `wip(ios): point d'etape` ont ainsi emporté le travail iOS en cours d'une
   session — sans trailer, donc sans auteur identifiable.
3. **Le rôle de porteur de `dev` mérite d'être situé, pas supposé.** « Je tiens
   `dev` » n'est vérifiable par personne tant qu'aucune trace ne le dit. Si deux
   sessions le croient en même temps, aucune ne s'en aperçoit avant un conflit —
   c'est exactement ce qui est arrivé, et ce qui s'est réglé en une question
   posée plutôt qu'en un arbitrage de commits.

Corollaire de posture, appris de l'autre côté : la session pair a reconnu d'elle-même
avoir poussé une intégration de dépendances **sans lancer le garde que le dépôt
tient pour ça**, et son raisonnement (« le lock périmé ne casse rien, la CI
installe non figé ») était JUSTE sur son axe. Ce qui a cassé vivait sur un autre
axe : la scission des manifestes entre workspaces. **Un raisonnement correct sur
la dimension qu'on regarde ne dit rien des dimensions qu'on ne regarde pas** —
d'où l'intérêt d'un garde, qui les regarde toutes sans avoir à y penser.
