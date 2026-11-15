## Leçon 148 — Écraser un document de travail est une SUPPRESSION, et `cat >` ne la montre pas

**Le geste** : ce cycle a « créé » son plan avec `cat > tasks/todo.md`, sans avoir lu le fichier.
`tasks/todo.md` contenait 12 559 lignes — l'historique de tous les cycles précédents. Le plan en
faisait 40. La différence est partie dans le commit, et la PR affichait `12 527 deletions` pour un
travail qui en comptait six.

**Ce qui rend le défaut invisible sur le moment** : rien n'échoue. `cat >` ne demande pas
confirmation, ne prévient pas que la cible existe, ne dit pas ce qu'elle pesait. `git add -A`
avale la suppression sans la distinguer d'un ajout. La suite de tests reste verte — aucun test
ne lit `tasks/todo.md`. Les trois signaux qu'on consulte d'ordinaire (erreur, diff des fichiers
touchés, tests) sont tous au vert, et le seul qui parle est le COMPTE de lignes, qu'on ne
regarde qu'en ouvrant la PR.

**Le détail qui aggrave** : le fichier écrasé se terminait par
« Réparation tasks/todo.md : la résolution de fusion avait supprimé 5522 lignes du document de
main — restauré + sections annexées ». Le document portait la trace écrite du même accident, et
l'écrasement l'a emportée avec le reste. Une leçon rangée UNIQUEMENT dans le fichier qu'elle
protège ne protège rien : elle disparaît par le geste même qu'elle décrit. C'est pourquoi
celle-ci vit dans `lessons.md`.

**Le réflexe** : un document de travail PARTAGÉ et CUMULATIF (`todo.md`, `lessons.md`,
`decisions.md`, `CHANGELOG.md`) ne s'écrit jamais en mode troncature. On y AJOUTE — `cat >>`,
ou un `Edit` ancré sur la fin. `cat >` / `Write` sont réservés aux fichiers qu'on crée, et
« créer » se vérifie AVANT d'écrire, pas après.

**La garde qui tranche, et elle est arithmétique** : avant de pousser, lire
`git diff --stat <base>...HEAD` et confronter le nombre de suppressions à ce qu'on croit avoir
retiré. Un travail purement additif qui affiche des milliers de suppressions n'est pas « du bruit
de lockfile » — c'est un fichier emporté, et il faut le nommer. La même arithmétique attrape le
lockfile réellement modifié par un `bun install` de confort, qu'un `git add -A` embarque aussi.

**Corollaire de réparation** : restaurer depuis `git show <base>:<chemin>` et RE-ANNEXER sa
section, plutôt que de rejouer le geste dans l'autre sens. Le document appartient au dépôt, pas
au cycle en cours ; un cycle n'y ajoute qu'un chapitre.

---
