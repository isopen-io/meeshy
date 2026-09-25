## Leçon 402 — Un backtick dans une commande `ssh` s'exécute SUR LE SERVEUR, et une règle Traefik n'est faite que de backticks

**Lot des écrans d'accès v3.** Pour poser la nouvelle règle du routeur de
staging, j'ai interpolé la valeur lue localement dans une commande `ssh` :

```
NEW=$(grep ... compose.yml)          # contient Host(`staging…`) && PathPrefix(`/l/`) …
ssh root@hôte "... nouveau='$NEW' ..."
```

Le shell DISTANT a exécuté chaque `` `…` `` comme une substitution de commande.
Résultat écrit dans le compose de staging, puis appliqué par un `up -d` :

```
rule=Host() && (PathPrefix() || PathPrefix() || Path() || Path() || …)
```

Une règle qui ne réclame plus rien. Les dix chemins de la zone v3 sont retombés
au legacy le temps de la réparation.

> **La syntaxe de Traefik est faite du caractère que le shell interprète.** Toute
> valeur qui contient un backtick — règle de routeur, extrait de Markdown,
> message de commit — ne se met JAMAIS dans une chaîne interpolée : elle
> voyage par un FICHIER (`scp`) et se relit à destination.

C'est la troisième victime de cette classe dans le dépôt (message de commit,
corps d'issue `gh --body`, et maintenant une commande `ssh`), et la première qui
casse un déploiement plutôt qu'un texte. Le remède est le même partout :
`--body-file`, un `here-doc` à délimiteur QUOTÉ, ou `scp` + un script distant.

Deux signes qui l'attrapent avant l'application :
- la sortie affiche `command not found` ou `No such file or directory` sur des
  fragments de la valeur — c'est le shell qui vient de l'exécuter ;
- **relire la valeur ÉCRITE, jamais la valeur ENVOYÉE.** Le `grep` de contrôle
  qui suivait l'a d'ailleurs montrée cassée ; c'est en la lisant qu'on le voit.

---
