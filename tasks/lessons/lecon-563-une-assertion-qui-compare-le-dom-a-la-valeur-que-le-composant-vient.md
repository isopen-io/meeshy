## Leçon 563 — Une assertion qui compare le DOM à la valeur que le composant vient LUI-MÊME d'écrire ne peut jamais rougir

2026-09-10, web-v3 (#5935, revue-correction). Un gate de gouttière d'avatar
comparait `getBoundingClientRect().height` d'un nœud à `min-height: 34px` —
sauf que ce `34px` était le `style` inline que `focal-row.tsx` venait D'ÉCRIRE
sur ce MÊME nœud, une ligne plus haut. L'assertion mesurait sa propre entrée :
supprimer TOUS les `[data-presence]` du DOM (l'état que le gate prétendait
garder) laissait les six hauteurs mesurées identiques avant et après
(`34,34,34,34,34,34`) — elle ne pouvait, PAR CONSTRUCTION, jamais rougir.

> **Avant de faire confiance à une assertion géométrique, demander : la
> valeur MESURÉE et la valeur ATTENDUE viennent-elles de deux calculs
> INDÉPENDANTS ?** Si l'attendu est un `style` posé par le même composant que
> celui qu'on mesure, l'assertion prouve que le navigateur sait lire du CSS,
> rien de plus.

Le correctif compare désormais l'EXTENSION RÉELLE d'un nœud FRÈRE (la
gouttière d'avatar + sa pastille de présence en débord) à une cote DÉRIVÉE en
dur (`AVATAR_FRAME`), sur un corpus qui porte à la fois des têtes AVEC et
SANS pastille — et la falsifiabilité a été VÉRIFIÉE en local, pas supposée :
porter `AVATAR_SIZE` à 40 (expérience jetée après coup) fait rougir la
nouvelle assertion (« mesuré 40.00 px » contre le plafond 34), ce que
l'ancienne ne pouvait pas faire quelle que soit la régression introduite.

Voisine directe de la leçon 558 (« un gate qui ne peut pas distinguer deux
causes ne garde rien ») mais un vice DIFFÉRENT : celui-ci ne manquait pas de
discriminant dans ses données d'entrée — il comparait une valeur à
ELLE-MÊME.
