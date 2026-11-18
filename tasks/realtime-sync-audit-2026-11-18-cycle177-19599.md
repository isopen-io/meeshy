# Cycle 177 — la « sixième copie » en était cinq, et le `min` du gateway n'était pas une clause de la loi

*2026-11-18. Branche `claude/exciting-planck-7cczh7`, partie de la tête de `dev`
(`14404376b`). Livre **#19599**, le premier des cinq suivis que le cycle 176
avait laissés.*

---

## Le point de départ

Le cycle 176 bis s'était clos sur ce suivi, rédigé avec les trois questions à
trancher avant la première ligne :

> **#19599** — la sixième copie, instruite ci-dessus avec les trois questions à
> trancher avant la première ligne, et le cliquet qu'aucun des deux lots n'a
> posé : la protection de #19299 est le TYPE, et le type ne porte pas jusque
> dans `shared`.

Il avait raison sur l'adresse (`packages/shared/utils/first-unread.ts:155`) et
sur le diagnostic de fond : la protection de #19299 est l'exigence de type
`ReadFloorCursor`, qui ne franchit pas la frontière du paquet. Il était faux
sur deux points, et chacun se mesure.

## Mesure 1 — la sixième copie en était CINQ, parce que le compte était fait en TypeScript

```
packages/shared/utils/first-unread.ts                      1
packages/MeeshySDK/.../Models/FirstUnreadBoundary.swift     2   ← resolve ET orderedCandidates
apps/android/core/model/.../FirstUnreadBoundary.kt          2   ← resolve ET orderedCandidates
```

Deux choses que le relevé de #19299 ne pouvait pas voir, et la seconde est la
plus instructive :

- **La loi du premier non-lu a DEUX miroirs natifs**, et son propre
  doc-comment n'en nommait qu'un (« Miroir Swift : … ») alors que le miroir
  Kotlin existe depuis le cycle 118. C'est la leçon 261 à la lettre : une
  énumération de sites affirme aussi qu'elle est COMPLÈTE. Corrigé dans ce lot.
- **Les deux miroirs portaient l'idiome DEUX FOIS dans la même unité** —
  `resolve` recalculant `hasChronologicalRank` que son propre assembleur de
  candidats recalcule trois lignes plus bas. Une jumelle divergente n'a pas
  besoin d'un autre fichier pour naître : le même suffit.

## Mesure 2 — le `min` du gateway est une clause de son HISTOIRE, pas de la loi

C'est la question que l'issue posait et la partie du lot qui valait le plus
cher à instruire. Les deux formes :

| site | forme | diffère quand |
|---|---|---|
| `readFloorOf` (gateway) | `min(position, horloge)` | — |
| `firstUnreadBoundary` (trois clients) | `position ?? horloge` | `position > horloge` |

L'invariant attendu est `position <= horloge` (un message est créé avant d'être
lu) : les deux coïncident sur toute donnée saine et ne divergent que sous une
dérive d'horloge entre deux serveurs.

**La tentation était de transposer**, le gateway ayant écrit sa raison : « le
minimum ne peut que l'ABAISSER, et abaisser est la direction sûre des TROIS
consommateurs ». Mesuré, cette phrase ne parle pas du SUJET de la loi mais du
PASSÉ de ses consommateurs : avant #19299 les trois sites étaient ancrés sur
l'HORLOGE, donc la position seule aurait pu rétrécir leur fenêtre sous ce
qu'elle couvrait — *une régression introduite par le correctif lui-même*.
C'est un cliquet de NON-RÉGRESSION.

**Aucun client n'a ce passé.** `firstUnreadBoundary` descend la position
d'abord depuis son origine (#7215). Et le coût de l'abaisser n'est pas celui du
gateway :

```
curseur dérivé { position = 12:00, horloge = 11:00 }
M1 11:30 · M2 11:45 · M3 12:30
```

| plancher | candidats | ce que le séparateur fait |
|---|---|---|
| position (12:00) — `??` | `[M3]` | juste : M1 et M2 sont sous la position, donc ATTEINTS |
| horloge (11:00) — `min` | `[M1, M2, M3]` | **M1 et M2 redeviennent « non lus »** |

La position est la valeur AUTORITATIVE de ce que le curseur a franchi :
l'abaisser fait remonter le lecteur dans du déjà-lu **sans qu'aucun non-lu ne
soit en jeu**. Les clients gardent donc `??`, et c'est écrit dans la loi.

## Le découpage, qui répond aux DEUX objections de l'issue

L'issue opposait deux issues : loi dans `shared` ⇒ les jumelles se séparent ;
loi dans le gateway ⇒ une copie à justifier. La troisième tient parce que ce
qui est partagé n'est pas la loi :

```
readCursorFloorOf(cursor)                    ← packages/shared : la PREMIÈRE clause
readFloorOf(c) = clampToClock(readCursorFloorOf(c), c.lastReadAt)   ← gateway : + son cliquet
boundaryTime   = readCursorFloorOf(...) ?? joinedAt                 ← client : + son 3e rang
```

- **Elle vit dans `shared` parce que les deux colonnes y sont déjà déclarées**
  (`ReadCursorBoundary`, `types/conversation.ts`) : une descente vit où ses
  colonnes sont déclarées.
- **`readFloor.ts` et `deliveryFloor.ts` restent adjacentes** : le gateway n'a
  rien perdu, il COMPOSE. La différence entre les deux régimes est désormais une
  fonction NOMMÉE au lieu d'un écart de prose que personne ne confronte.
- **`deliveryFloorOf` ne compose rien, et c'est écrit** : le curseur de
  LIVRAISON ne sort jamais du serveur, aucun client n'en descend les colonnes.
  La symétrie des deux jumelles est de STRUCTURE, pas de portée.
- **`joinedAt` reste au site** — il appartient au comptage, pas au curseur
  (décision de #19299 sur `unreadCountOfParticipant`).

## Le cliquet, et ses trois axes

`packages/shared/utils/read-cursor-floor-single-spelling.test.ts` : un balayage
de quatre extensions sur sept racines, **commentaires dépouillés** — sans quoi
il retrouverait les doc-comments qui CITENT l'idiome pour l'interdire, dont
celui qu'écrit ce lot. Inventaire des graphies tolérées **VIDE** : il n'y a pas
de graphie à la main légitime à porter.

Trois mutations, trois témoins DISTINCTS, chacun nommant son axe :

| mutation | témoin qui tombe |
|---|---|
| la graphie revient dans `first-unread.ts` | « ne trouve AUCUNE graphie à la main hors des trois sites de loi » |
| une SECONDE graphie revient dans le miroir Swift | « chaque site de loi ne porte la descente qu'UNE fois » |
| les racines du balayage pointent à côté | « BALAIE bien quelque chose » |

Le troisième est le contrôle que la garde de `presence-visibility-viewer-aware`
impose à tout cliquet négatif : un balayage dont le relevé rend `[]` reste
vert, donc il doit d'abord prouver qu'il voit.

## Preuve

- **RED d'abord**, poussé avant la logique (`71d0059c0f`, doctrine de la branche
  poussée tôt) : 2 témoins sur 4 rouges sur l'arbre de `dev` ;
- `packages/shared`, suite **COMPLÈTE** : **447 suites, 10 692 témoins verts**,
  seuils de couverture tenus (voir § ci-dessous sur le gate manqué) ;
- gateway : **14 suites, 296 témoins verts** sur `MessageReadStatusService*`,
  `conversationUnreadBadge`, `unreadCountsParity`, `captureNoticeUnreadCounts`,
  plus `readFloor` et `deliveryFloor` (15 témoins) ;
- web : **35 témoins verts** sur `unread-boundary` et `receipts` ;
- `tsc --noEmit` : `packages/shared` **EXIT=0**, `services/gateway` **EXIT=0** ;
- gardes iOS en local : `check_house_rules.sh` (42 règles), `check_cohesion_budget.sh`,
  `check_test_registration.sh` (2 039 fichiers de test inscrits) — les trois vertes ;
- gardes de journal : `journal-one-file-per-entry-guard` (18) et
  `lessons-numbering-single-key-guard` — vertes avec l'ADR et la leçon de ce lot ;
- **`dev` fusionnée dans la branche** (#18654) : `origin/dev` à
  `dfd1b74eb6e4f967b0c04eb7d64f3a0bd6b663d2` est CONTENUE dans la branche, et
  les gates ci-dessus ont été rejoués sur l'arbre FUSIONNÉ — 17 suites et
  **328 témoins** côté gateway, le témoin neuf de `dev`
  (`CallService.directCallTurnedGroup`) compris. Aucun chemin commun entre les
  deux côtés : `dev` n'a touché que la surface des appels ;
- **aucun comportement de production ne change** : les deux formes coïncident
  sur toute donnée saine, et l'arbitrage retenu est celui déjà en place des deux
  côtés. Ce lot rend VÉRIFIABLE ce qui ne l'était pas.

## Le gate que je n'avais pas lancé, et qui tenait un bug de RUNTIME

Les suites CIBLÉES étaient vertes, et la suite COMPLÈTE de `packages/shared` ne
l'était pas :

```
FAIL __tests__/esm-relative-imports.test.ts
  × tout import relatif de valeur porte une extension .js/.json explicite
    + "utils/first-unread.ts → './read-cursor-floor'"
```

`packages/shared` est en ESM pur et sert son `dist` : un import relatif SANS
`.js` ne se résout pas à l'exécution. Le défaut n'était visible par aucun des
instruments que j'avais lancés — ni `tsc` (qui résout par le `moduleResolution`
du paquet), ni vitest sur les suites ciblées (qui résout comme un bundler), ni
`bun run build` (qui compile sans exécuter). **Il l'était par le cliquet, et le
cliquet n'est pas dans le fichier que je touchais.**

> La leçon n'est pas « lancer la suite complète », qui est déjà écrite. C'est
> que **le premier fichier qu'un paquet reçoit depuis longtemps éprouve des
> conventions que les fichiers existants satisfont tous** — personne n'écrit
> l'extension en pensant à la résolution ESM, on la copie du voisin. Ajouter un
> MODULE à un paquet n'est pas la même opération qu'éditer un module : c'est la
> seule qui peut violer une convention de paquet.

Réparé (`./read-cursor-floor.js`), et la suite complète est verte :
**447 suites, 10 692 témoins**, seuils de couverture tenus (98,47 / 94,23 /
98,95 / 99,23 contre 98 / 94 / 93 / 98).

## Ce que ce conteneur ne peut pas prouver

- **Swift et Kotlin ne compilent pas ici.** Pas de chaîne Swift ;
  `./apps/android/meeshy.sh jvm-check` tombe sur `build-artifacts.signal.org`
  refusé par le proxy (403 sur `libsignal-client:0.106.2`), de la même famille
  que `dl.google.com`. Les deux miroirs sont donc prouvés par `ios.yml` et
  `android.yml` sur la PR, jamais par un « ça devrait compiler ».
- Et le relevé du `jvm-check` est passé par un `| tail`, qui a rendu `exit 0`
  sur un `BUILD FAILED` : la leçon « ne jamais passer un gate par un pipe quand
  c'est son code de sortie qu'on interroge » attrape encore, et elle m'a
  attrapé dans le lot même qui cite le cycle 176.

## Suivis

- **Le miroir Kotlin n'a pas de `remainingUnread`**, que Swift porte depuis
  #7350 (I-2). Écart de parité hérité du gel Android, hors périmètre de ce lot
  — à ouvrir en issue.
- **`unreadCountHint` est un `Int` non borné en haut** dans les trois miroirs ;
  un hint supérieur à la fenêtre rend tous les candidats, ce que la borne
  assumée documente. Inchangé.
- Les quatre autres suivis du cycle 176 restent ouverts : **#19603** (l'arbitrage
  produit de la rétractation), **#19604** (le point de convergence des
  réactions), **#19612** et **#19613** (le self-test du cliquet de verrouillage
  et le format de `bun.lock`), et **#18760** — toujours pas refermé, troisième
  session de suite.
