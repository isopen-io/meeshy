## Leçon 582 — Une PR en CONFLIT ne produit aucun run : l'absence de verdict n'est pas une panne de CI

2026-09-11, #6100. `gh pr checks 6100` répondait « no checks reported on the
branch » après deux poussées d'affilée, et j'ai cherché du côté de la CI :
relancer un run, pousser à vide, comparer les SHA. Le relevé disait pourtant
tout ce qu'il fallait :

```
gh pr view 6100 --json mergeable  →  CONFLICTING
```

Un workflow déclenché par `pull_request` construit le **commit de fusion**
(`refs/pull/N/merge`). Une PR en conflit n'en a pas. GitHub ne crée donc
AUCUN run — pas un run rouge, pas un run annulé : rien. Le verdict manquant
n'était pas perdu, il n'avait jamais été demandé.

> **« Aucun check » se lit toujours avec `mergeable` à côté, jamais seul.** « Pas
> de run » et « run en échec » se ressemblent dans un tableau de bord et n'ont
> pas la même cause : le premier est presque toujours un conflit, et il se
> corrige avec `git merge`, pas avec `gh run rerun`.

C'est la forme la plus discrète de « ce qui ne s'exécute pas ne se signale
pas » : `no checks reported` ressemble à « la CI n'a pas encore démarré » et dit
en réalité **« la CI ne démarrera jamais tant que le conflit tient »**.

Deux pièges de lecture s'ajoutent, et ils tirent en sens inverse :

- **`gh pr checks` / `gh pr view` servent un `mergeable` CALCULÉ, et il reste
  collé.** Sur #6112, l'API disait `CONFLICTING` alors que
  `git merge-tree --write-tree` rendait un arbre propre et qu'une vraie fusion
  dans un worktree jetable ne laissait aucun fichier `U`. Sur #6100, l'inverse :
  `gh pr view` disait encore `CONFLICTING` quand `gh api .../pulls/6100` disait
  déjà `mergeable: true, mergeable_state: unstable`. **Git a raison, l'API
  rattrape.** Mesurer soi-même coûte une commande.
- **`dev` bouge.** Entre le `merge origin/dev` et la poussée, trois PR y sont
  entrées ; la branche fusionnée ne contenait déjà plus `dev`
  (`git merge-base --is-ancestor origin/dev <branche>` → faux) et le conflit
  restait ANNONCÉ parce qu'il restait VRAI. Refetch avant de conclure que
  l'outil se trompe.

Parade : `git merge-base --is-ancestor origin/dev origin/<branche>` répond en
une commande à la seule question qui compte — *cette branche contient-elle dev
tel qu'il est MAINTENANT ?* — et `gh api repos/.../pulls/N -q .mergeable_state`
donne l'état non mis en cache quand on veut l'avis de GitHub plutôt que le sien.
