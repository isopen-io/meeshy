## Une loi DÉCLARÉE sans site d'application est zéro garde avec l'apparence d'une (cycle 176, #19385)

Le dépôt sait déjà qu'**une loi qui PUBLIE son `select` n'est appliquée que par
les consommateurs qui l'importent** (cycle 152) et qu'**une règle qu'il faut
retaper à chaque site est une règle qu'un site finira par ne pas avoir**
(cycle 175). Les deux décrivent une loi **partiellement** appliquée. Il existe un
état plus simple et plus coûteux, et aucun des deux ne le nomme : la loi
déclarée, miroitée, testée — et appliquée **par aucun site**.

`dm.readReceipts` vivait dans le catalogue des cercles (`relation-levels.ts`,
plancher `ACQUAINTANCE`), dans son témoin de catalogue, et dans les DEUX miroirs
clients (`RelationAccess.swift`, `RelationAccess.kt`). Elle n'avait aucun
appelant dans la passerelle, quand son jumeau `dm.typing` — même lot (#14107),
même plancher, même doc-comment — en avait un.

### La mesure qui l'attrape tient en une commande

```
$ grep -rn "feature: '" services/gateway/src --include=*.ts | grep -v __tests__ \
    | sed "s/.*feature: '\([^']*\)'.*/\1/" | sort | uniq -c
      2 dm.direct
      2 dm.request
      1 dm.typing
      …
                         ← `dm.readReceipts` : absent
```

> **Un catalogue de features est un inventaire de DÉCLARATIONS, jamais
> d'applications.** Compter les sites d'application par feature, et confronter
> les deux listes, est une passe de quelques secondes qu'aucun cliquet du dépôt
> ne faisait. Une entrée à zéro n'est pas une dette partielle : c'est une
> permission grande ouverte sous un nom qui dit le contraire.

Et le mensonge est pire qu'une absence, parce que trois artefacts l'étayent : le
catalogue dit que la règle existe, les miroirs clients disent qu'elle est
partagée, et le témoin de catalogue passe au vert en attestant… le catalogue.
Personne ne va chercher derrière trois verts.

### La CAUSE n'était pas un oubli : le résolveur était aveugle au viewer

C'est la partie qui vaut au-delà du lot. Les deux résolveurs d'accusés ne
recevaient pas le lecteur :

| canal | ce qui décidait | le viewer |
|---|---|---|
| socket | `shouldShowReadReceipts(acteur)` — un réglage GLOBAL | jamais lu |
| REST | `filterReadReceiptVisible(identities)` | **pas même un paramètre** |

C'est exactement `resolvePrefsOnly`, que la loi de PRÉSENCE a **SUPPRIMÉE** avec
une garde de source qui interdit son retour (directive 2026-08-25).

> **Une résolution aveugle au viewer ne PEUT PAS porter une loi par paire — donc
> une loi par paire écrite pour un tel canal reste inerte, quoi qu'elle
> déclare.** La loi n'était pas « oubliée » : elle n'avait littéralement aucun
> endroit où s'appliquer. Chercher pourquoi une loi n'est pas appliquée en
> cherchant l'appel manquant est donc le mauvais bout ; il faut demander **ce que
> le résolveur REÇOIT**, et s'il a de quoi répondre à la question que la loi pose.

Corollaire actionnable : **un dépôt qui a supprimé une forme fautive sur un canal
doit la chercher sur les canaux JUMEAUX.** La garde de source de la présence
interdit `resolvePrefsOnly` sous trois racines — elle garde un IDENTIFIANT, pas
une FORME. Le canal des accusés portait la même forme sous un autre nom, et
aucune garde ne pouvait la voir. C'est la règle du cycle 105 (« chercher une
forme fautive par son NOM de déclaration, c'est manquer tous les sites qui
l'obtiennent autrement ») appliquée non plus à une porte d'émission mais à un
résolveur de confidentialité.

### Et la campagne de mutation a trouvé un trou que les 22 témoins cachaient

Six mutations, toutes vérifiées APPLIQUÉES avant lecture du verdict. Quatre
rouges. Deux vertes, et elles ne disaient pas la même chose :

- **« le viewer est toujours nul »** restait VERTE. C'était un vrai trou : les
  témoins appelaient les portes avec un viewer écrit à la main, et le
  dérivateur `receiptViewerOf` — **seul maillon entre le contexte
  d'authentification et la loi, sur les TROIS portes REST** — n'avait aucun
  témoin. La mutation retirait donc la loi des trois portes d'un coup sans faire
  tomber quoi que ce soit. Fermé par une suite à lui.
- **« inverser le sens de la loi »** restait VERTE aussi, et c'était JUSTE :
  mesuré, `dm.readReceipts` n'a pas de bouclier des mineurs, son privilège
  d'équipe exige les deux côtés, et le niveau est le minimum des deux accords —
  les deux sens rendent le même verdict sur toute paire.

> **Une mutation verte accuse le témoin (cycle 174) — sauf quand elle mesure une
> symétrie réelle.** Les deux cas se ressemblent exactement, et ne se
> distinguent qu'en allant lire ce qui pourrait désymétriser la loi. Écrire la
> réponse dans le code est obligatoire : sans elle, le prochain lot « prouvera »
> la direction par un témoin incapable de tomber, ou lira le vert comme un trou
> et ajoutera un témoin qui n'en est pas un.

Même discipline pour la troisième verte, `=== false` au lieu de `!== true` sur
l'entrée absente de la carte : `pairAccessAmong` rend une entrée par id REÇU,
donc l'état est **INATTEIGNABLE** depuis ces appels. La forme défensive se garde
(elle protège d'un changement de contrat du collaborateur) et le dit sur place —
règle du cycle 175 : on perd la mutation parce qu'on a gagné l'impossibilité, et
il faut l'écrire sans quoi un relevé futur conclut à un trou.

### Ce que le lot a tiré de la forme, et qui se réemploie

Le viewer est un paramètre **REQUIS** des trois portes nominatives —
`getMessageStatusDetails` a perdu son `options = {}` pour cela. Les cinq sites
d'appel ont été nommés par `tsc` (`TS2554`, `TS2345`), pas par un `grep`.

> Forme forte de #19303 : **un module partagé DÉPLACE la discipline — il faut
> penser à l'appeler ; un paramètre REQUIS la SUPPRIME.** Et c'est le seul état
> où « un paramètre dont l'absence désactive une garde est un demi-correctif »
> cesse de s'appliquer, puisque l'absence ne compile plus.
