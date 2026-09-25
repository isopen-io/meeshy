## Leçon 244 — Une branche qui n'est pas poussée n'existe pas (2026-08-22)

Rappel user en cours de lot : « merge régulièrement avec le worktree et le main
local pour ne pas perdre le travail ; si tu es dans une branche, push
régulièrement ! ». Une heure de commits dormaient sur une branche locale d'un
worktree, pendant qu'un voisin faisait un `reset --hard` quelques heures plus
tôt et qu'il restait 990 Mio de disque.

> **Un commit local n'est qu'une promesse ; le push est la sauvegarde.** Dès le
> premier lot vert : `git push -u origin <branche>`, puis à chaque commit. Dès
> que les gates d'un lot sont vertes : ff `main` local sur `origin/main`, merge
> `--no-ff`, push — sans attendre les autres lots. Le gate long (suite
> complète) ne retient pas le push de la BRANCHE, seulement le merge dans main.

Corollaire : l'arbre de travail n'est pas une sauvegarde non plus — le
`reset --hard` d'une session voisine ne demande pas la permission.
