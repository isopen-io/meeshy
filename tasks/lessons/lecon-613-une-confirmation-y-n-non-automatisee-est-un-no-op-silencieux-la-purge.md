## Leçon 613 — Une confirmation `y/N` non automatisée est un no-op SILENCIEUX : la purge « posée » ne retire rien, et on croit avoir purgé (2026-09-15)

**Directive porteur, deux moitiés :** dans le code de release des images sur le serveur final, la purge
(`docker image prune`) est obligatoire **et son `y` s'envoie tout seul** ; et le déploiement automatique
**ne se fait qu'en DEV, jamais sur `main` en production**.

### Ce qui rendait le défaut invisible

`docker image prune` demande `y/N`. Au bout d'un `ssh`, dans un `heredoc`, dans un job de CI, **il n'y a
pas de terminal** : `stdin` est vide ou fermé, la réponse vide vaut « N », la commande **rend 0** et
n'affiche même pas d'erreur. Le script continue, vert. C'est le pire des verdicts — pas un échec, une
**absence d'effet** que rien ne distingue du succès. L'hôte de staging a accumulé une image par service et
par version jusqu'au `no space left on device` du 2026-09-14 (#6556) : le `pull` a échoué, le déploiement
s'est arrêté là, et staging a continué de servir la version précédente **sans que rien à l'écran ne le dise**.

> **Une commande interactive dans un chemin automatisé ne « demande » rien : elle abandonne.**
> Devant tout `prune`, `rm -i`, `apt install`, `gh` interactif dans un script, la question n'est pas
> « ai-je posé la commande ? » mais **« qui répond, et que vaut le silence ? »**.

### Le second angle mort : l'ORDRE, pas seulement la présence

Une purge POSTÉRIEURE au `pull` est aussi inutile qu'une purge refusée — ce qui manque de place, c'est
l'écriture des couches téléchargées. Même forme que la leçon 275 (« une garde se mesure sur ce qui part »)
appliquée au temps : **une garde juste, au mauvais moment, ne garde rien.**

### Ce qui reste hors du dépôt, et qu'il faut dire

Ce que la CI déclenche sur l'hôte était un script **non suivi** (`/usr/local/bin/meeshy-deploy-staging.sh`,
contraint par `command=…,restrict` dans `authorized_keys`). Deux sessions successives ont conclu « bloqué,
pas d'accès serveur » — et la conclusion était juste sur l'ACTION, fausse sur le LIVRABLE : on ne pouvait
pas installer le script, on pouvait **le versionner**, avec sa purge, sa liste blanche et son self-test.
**Un livrable inatteignable n'annule pas le livrable ATTEIGNABLE qui le précède.**

### Le geste qui l'attrape

`scripts/check-docker-prune-noninteractive.mjs` (job `quality` de `ci.yml`), trois règles et six mutations :
chaque purge du dépôt porte `-f`/`-af`/`--force` ; chaque script qui tire des images sur un hôte distant
purge **avant** de tirer ; tout job de workflow porteur d'une clé SSH de déploiement reste épinglé à
`refs/heads/dev` et ne peut mentionner ni `refs/heads/main` ni `refs/tags/`.

---
