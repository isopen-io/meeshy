## Deux gardes symétriques ne paient pas la même chose pour GARDER (cycle 186, #19827)

*2026-11-19, cycle 186, #19827.*

### Le motif

Un dépôt qui pose une garde à l'ENTRÉE d'un tuyau en pose presque toujours une à
la SORTIE, et la seconde ressemble assez à la première pour qu'on soit tenté de
recopier son arbitrage. `RedisDeliveryQueue` en porte deux :

| garde | ce qu'elle classe | ce que GARDER retient |
|---|---|---|
| `isPermanentlyUnreadable` (drain) | une entrée SCELLÉE qui ne se rouvre pas | du chiffré — **rien** |
| `isPermanentlyUnsealable` (enfilage, #19827) | une entrée à sceller qui ne se scelle pas | du **CLAIR**, dans le tas |

Les deux voient les MÊMES causes — clé maîtresse absente, base des clés
injoignable, charge informe. Recopier le verdict du drain à l'enfilage aurait
retenu du clair pour des causes qu'aucune attente ne débloque.

### La question qui tranche

Pas « cette cause est-elle permanente ? » — elle l'est ou non indépendamment du
site. Mais :

> **Qu'est-ce que GARDER retient ici, et quel remède débloquerait cette cause ?**

Au drain, garder ne retient rien de lisible : la moindre chance de rouvrir plus
tard vaut d'être attendue. À l'enfilage, garder retient du clair, donc on ne
garde que ce qu'une attente peut débloquer **sans redémarrage** — puisque le
remède d'une clé maîtresse absente ou erronée est une variable d'environnement
et un redémarrage, qui vide le tas. Garder pour ces causes-là ne protège aucune
livraison et retient un secret pour rien.

D'où un ensemble PERMANENT plus LARGE à l'enfilage qu'au drain, sur les mêmes
causes. L'asymétrie n'est pas une négligence : elle est le contenu du lot, et
elle s'écrit au site.

### Le corollaire qui tient en production

Quand la garde décide de retenir quelque chose de plus sensible que son jumeau,
la restriction qui en découle doit être tenue par le CODE, pas par une note. Ici
l'entrée gardée est en clair : la tranche durable lui est fermée par un
court-circuit explicite (`heapOnly`), qui saute Redis **même en pleine santé**,
et non par un commentaire demandant de ne pas l'y pousser. Et la propriété « elle
n'en ressort pas par un autre chemin » se VÉRIFIE sur chaque sortie de la
structure plutôt que de se supposer.

### Ce qu'il faut faire quand on écrit la seconde garde

1. Nommer, pour chaque garde, **ce que garder retient** — pas ce que garder
   permet.
2. Pour chaque cause, nommer **le remède** et se demander s'il survit à ce qui
   porte la rétention (un tas ne survit pas à un redémarrage ; une ligne Redis à
   48 h de TTL, si).
3. Écrire l'asymétrie au site, dans les deux fonctions, avec sa raison — sans
   quoi le prochain lot « harmonisera » les deux et rouvrira ce qu'on vient de
   fermer.
