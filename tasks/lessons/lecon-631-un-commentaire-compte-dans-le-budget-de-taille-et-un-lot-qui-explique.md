## Leçon 631 — un COMMENTAIRE compte dans le budget de taille, et un lot qui explique bien peut faire rougir un fichier hors budget

2026-09-19, #7022 (PR #7047). Le lot faisait passer `NotificationService.ts` de
6119 à **6126** lignes, et `gateway-file-size-budget` l'a refusé : le fichier est
hors budget de longue date, et CLAUDE.md interdit tout AJOUT à un tel fichier —
« une dette héritée ne se solde pas en montant le plafond ».

Ce qui surprend, et qui est la leçon : **le lot n'ajoutait presque que du
commentaire.** Sur ses 16 lignes nettes, deux étaient du code (un `import`, une
délégation) ; les quatorze autres expliquaient pourquoi la composition d'adresse
devait vivre ailleurs. Un excellent commentaire reste des lignes, et un gardien
de taille ne distingue pas les deux. Le réflexe « j'ajoute juste une explication,
ça ne compte pas » est faux sur tout fichier proche de sa borne.

**Ce qu'il faut regarder pour choisir ce qui SORT.** La tentation est de couper
l'explication qu'on vient d'écrire — c'est le pire choix, on retire le savoir et
on garde la dette. Ici, la bonne pièce se reconnaissait à un aveu :
`toPublicMediaUrl` n'était plus qu'une **délégation d'une ligne**, et la seule
chose qu'elle ajoutait à la règle qu'elle appelait était un repli
`https://gate.meeshy.me` — un nom d'hôte de DÉPLOIEMENT écrit dans un service de
domaine, c'est-à-dire exactement ce que le lot retirait de la donnée. Le
correctif de budget et le correctif de conception étaient le même geste :
`publicMediaUrlFromEnv` vit désormais à côté de sa règle, aucun appelant ne nomme
plus d'hôte, et le fichier retombe à 6114.

> **Quand un garde de taille rougit, chercher la pièce qui CONTREDIT le lot,
> pas la plus courte à supprimer.** Un fichier hors budget contient presque
> toujours quelque chose qui n'aurait jamais dû y être ; le garde est l'occasion
> de le trouver, pas une taxe à payer.

Et un corollaire de séquence : **ce rouge était CACHÉ par un autre.** `Test
gateway` ne pouvait pas être lu tant que « Peaux web-v2 » mourait sur une
exception ; le budget n'est apparu qu'une fois le premier gate réparé. Un dépôt
qui traîne un rouge ne traîne jamais UN rouge — voir
`reference_a_quiet_branch_is_not_a_green_branch`.
