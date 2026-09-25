## Leçon 488 — Un gate qui ne s'EXÉCUTE pas rend le même signal qu'un gate vert, et la fin d'un fichier n'est pas son maximum

Deux mesures du 2026-09-03, prises à dix minutes d'écart, qui disent la même
chose sur deux objets sans rapport.

### 1. `CI` était rouge sur `dev` depuis des heures, et personne ne pouvait le voir

Mesuré en vérifiant mon propre push :

| commit | `CI` |
|---|---|
| `d6b33cb940` (04:42) | **failure** |
| `4a4e76eebe` (07:00) | **failure** |
| `5d5838d0f3` (07:35, à moi) | **failure** |

Et le fait qui explique tout : **le run précédent de `CI` sur `dev` datait du
2026-08-04.** Un mois. Ses filtres de chemins ne matchent pas un lot iOS pur, et
`dev` n'avait reçu que cela ; le premier lot qui a touché `packages/` et
`tasks/` l'a réveillé — sur deux jobs déjà rouges.

> **Un gate qui ne s'exécute pas ne protège pas, et son silence ressemble
> exactement à un vert.** Trois sessions ont poussé sur `dev` toute la nuit avec
> l'idée raisonnable que « la CI dirait si c'était cassé ». Elle ne disait rien,
> et ne rien dire est indistinguable de dire oui.

C'est la jumelle de la leçon sur les jobs filtrés par chemin qui cachent leur
propre échec — mais un cran plus haut : là c'était un JOB qui se cachait dans un
workflow qui tournait ; ici c'est le WORKFLOW ENTIER qui ne tournait pas.

**Le témoin qui l'attrape ne coûte qu'une commande**, et il faut la poser sur la
DATE, jamais sur la couleur :

```bash
gh run list --workflow "CI" --limit 5 --json headBranch,headSha,conclusion,createdAt
```

Un `createdAt` vieux d'un mois est une information beaucoup plus alarmante qu'un
`failure` récent. Et attention à l'instrument : `gh run list --branch dev
--workflow CI` m'a rendu « dernier run : 2026-08-04 » pendant que la liste SANS
`--branch` montrait quatre runs du jour sur `dev`. Deux requêtes sur le même
fait, deux réponses ; c'est la requête PAR COMMIT (`--commit <sha complet>`) qui
tranche — et elle exige le SHA complet, un préfixe rendant zéro ligne en silence.

### 2. J'ai choisi mes numéros de leçon en regardant la FIN du fichier

Pour numéroter 484 et 485, j'ai fait `grep "^## Leçon" | tail -5`. Ça répond à
« quelles sont les cinq dernières lignes ? », pas à « quel numéro est libre ? ».
Le fichier est écrit par trois sessions en parallèle et n'est PAS ordonné : un
`## Leçon 474` traînait à la ligne 26219, **après** 480, 481, 482 et 483.

J'ai eu de la chance — 484 et 485 étaient libres. Le doublon que le gate a
attrapé était celui de `474`, plus ancien que mon lot. Mais la méthode qui m'a
donné raison ce jour-là est la même qui donnera tort au prochain.

> **Dans un fichier que plusieurs sessions APPENDENT, la dernière ligne n'est
> pas le maximum.** La question « ce numéro est-il libre ? » se pose au fichier
> ENTIER, et sa réponse tient en une commande :
>
> ```bash
> grep "^## Leçon " tasks/lessons.md | sed -E 's/^## Leçon ([0-9]+).*/\1/' | sort -n | tail -3
> ```

### Ce que les deux ont en commun

Un coup d'œil bon marché a répondu à une question VOISINE de celle que je
posais — « le dernier run est-il rouge ? » au lieu de « y a-t-il eu un run ? »,
« quelles sont les dernières lignes ? » au lieu de « quel est le maximum ? ».
C'est la forme de la leçon 462, appliquée non plus à un instrument de mesure
mais à un ORDRE : *ce qui vient en dernier* et *ce qui est le plus grand* sont
deux choses différentes dès que quelqu'un d'autre écrit dans le même fichier.
