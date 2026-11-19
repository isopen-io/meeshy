# Cycle 185 — réparer un filtre inerte TRANSFÈRE une décision, et il fallait le lire avant

*2026-11-19, à la suite du cycle 184 (#19802, fusionné dans `dev` par `b9525b350e`).
Branche `claude/exciting-planck-loe3fu`. Instruit **#19803**, les DEUX derniers
sites du tri de #19748 — et **#19834**, que réparer le premier rend atteignable.*

---

## Pourquoi celui-là

C'est la dernière colonne du tri de #19748 : le fermer permet de fermer #19748.
Et les deux sites sont du même genre que les trois cycles précédents — une
égalité nue sur une colonne qu'aucun créateur n'écrit, donc un chemin
entièrement mort :

| site | ce qui était mort |
|---|---|
| `services/talkie/talkieFallback.ts` | le repli du talkie ne rendait **jamais** de conversation, pour aucune paire |
| `services/notifications/fanout/story-comment.ts` | **aucun commentateur précédent** n'était jamais prévenu d'un nouveau commentaire sous une story |

Le second est le seul site du dépôt à lire cette colonne par une égalité : ses
**105 voisines** passent par `deletedAt: NOT_DELETED` (`{ isSet: false }`), la
discipline INVERSE. La forme juste était donc déjà nommée, utilisée cent cinq
fois, et ce site l'ignorait.

## Ce que le cycle 184 a changé dans ma façon de prendre un lot

L'audit du cycle précédent m'a coûté un correctif retiré : ma « discipline
d'écriture sans risque » était l'interrupteur d'une passe qui aurait écrit à des
comptes déjà purgés. La leçon — **lire le CONSOMMATEUR avant d'allumer quoi que
ce soit** — s'applique ici, et cette fois elle a été appliquée AVANT d'écrire.

`withFallbackConversation` (`talkieRelay.ts`) n'agit que sur un refus
`FALLBACK_VOICE` et pose `conversationId` sur l'accusé. Or **le client PRÉFÈRE ce
que le serveur nomme.** Tant que le filtre est inerte, le serveur ne nomme rien
et le client choisit seul, par le RANG (`pickTalkieCopyDestination` :
`listRankAt ?? lastMessageAt ?? updatedAt`).

> **Réparer le filtre ne « rallume » pas un chemin : il TRANSFÈRE la décision du
> client au serveur.** Et le serveur triait par `lastMessageAt` SEUL — un critère
> que la règle partagée contredit depuis #9026 (rang = max(`lastMessageAt`,
> `lastActivityAt`), « les clients trient sur `listRankAt` quand il est servi —
> ils ne recalculent pas »). Depuis que le cycle 182 a rendu `lastActivityAt`
> vivante, les deux critères DIVERGENT dès qu'une réaction, un appel ou une
> épingle a remonté une conversation.

Donc réparer le site 1 seul aurait fait partir la copie vocale **ailleurs que là
où l'utilisateur voit sa conversation en tête** — un défaut PIRE que celui qu'on
corrige, parce qu'il a l'air d'un caprice plutôt que d'une absence. C'est #19834,
et il se livre dans ce lot.

> **Un filtre inerte cache la divergence du chemin qu'il désamorce.** Le serveur
> et le client nommaient deux destinations différentes depuis #9026 et personne
> ne pouvait le voir : le serveur n'en nommait aucune. C'est la forme du cycle 181
> (« un filtre inerte rend son balayage gratuit, donc invisible ») appliquée à un
> CRITÈRE au lieu d'un coût.

## Les correctifs, et pourquoi la machinerie des deux flux est inutile ici

- **Site 1** : `...unsetOrNull('deletedAt')` — la décision « lecture plutôt
  qu'écriture » n'est pas nouvelle : la jumelle `directPair.ts` pose la même
  question sur la même table et l'a tranchée ainsi (#14643), et 100 % des lignes
  en base sont dans l'état « clé absente ».
- **Site 1, critère** : le rang se calcule **sur place**, par
  `listRankFromColumns` — la règle partagée, pas une seconde copie d'elle. Le
  `max` de deux colonnes ne s'écrit pas en `orderBy` Prisma, mais l'ensemble
  candidat est **déjà borné** par les conversations partagées de la paire : la
  machinerie à deux flux de `list-rank.ts` existe pour trier une COLLECTION
  entière, pas une poignée d'identifiants déjà en main.
- **Site 2** : `deletedAt: NOT_DELETED`, comme ses 105 voisines.

## Trois témoins de production qui attestaient le défaut

C'est la part la plus instructive du lot : les trois tests qui couvraient ces
chemins **passaient au vert sur le défaut**, chacun pour une raison différente.

1. **`talkie-waking` § #17141 — un double qui ignorait sa clause.** Son
   `findFirst` ne lisait du `where` que `id.in` et triait lui-même par
   `lastMessageAt` : ni `deletedAt`, ni `isActive`, ni `type`, ni le régime de
   chiffrement n'étaient exercés. Il acceptait donc l'égalité nue exactement
   comme la forme juste. Il ÉVALUE désormais la clause contre des documents, et
   ses horloges sont des `Date` comme la colonne.
2. **`talkie-waking` § #17142 — une assertion de FORME.**
   `toHaveBeenCalledWith(objectContaining({ where: … }))` sur un `findFirst`
   rendant toujours `null` : il épinglait la forme de la clause, donc il
   survivait à une clause qui n'apparie rien. Converti en assertion d'EFFET —
   une communauté et une conversation chiffrée plus RÉCENTES, et seule la
   lisible doit gagner — ce qui est strictement plus fort.
3. **`NotificationService.storycomments` — une copie de la clause fausse.**
   `expect(…).toHaveBeenCalledWith(objectContaining({ where: { deletedAt: null } }))` :
   le témoin recopiait l'égalité nue, donc il **attestait le défaut**. Même
   famille que le cycle 182 (« un double qui APPLIQUE une sémantique à la main en
   fige sa compréhension du jour »), en version la plus directe : ici il ne
   l'appliquait pas, il la citait.

## Ce que rendre un double HONNÊTE a découvert, et que ce lot ne tranche pas

Le double évaluant a aussitôt refusé la clause de production — à cause du
`NOT: SERVER_BLIND_REGIME_FILTER` qui l'accompagne, pas du `deletedAt`.

`matchesMongoWhere` applique la règle mesurée de #8309 (« toute négation exige la
clé PRÉSENTE »), juste d'une négation **scalaire**. Celle-ci nie une condition
**composée et positive** (`AND: [{ isSet: true }, { not: null }, { notIn }]`),
dont le doc-comment dit lui-même « un champ absent n'y entre jamais » : pour un
document sans la clé, la condition interne est FAUSSE, donc `$nor` devrait rendre
VRAI, donc le document devrait être apparié. Le double rend l'inverse.

> **Ici le double a refusé une clause juste, ce qui se VOIT** — un témoin rouge
> qui accuse la production. La même imprécision, sur une autre clause, ferait
> PASSER un témoin, et c'est la direction dangereuse. Un double qui ne sait pas
> doit jeter, et son propre en-tête l'exige : « toute autre forme jette ».

Ce lot ne le tranche pas : cela demande une mesure contre `mongo:8` que ce
conteneur ne peut pas prendre. Les témoins posent donc `encryptionMode: null`
explicitement, avec la raison écrite au site — **faire décider au double une
question pour laquelle il n'a pas été mesuré rendrait un verdict sur `deletedAt`
qui dépendrait d'une autre colonne.** C'est **#19907**.

Et la population concernée existe : plusieurs créateurs de `Conversation`
n'écrivent pas `encryptionMode` (`worldConversation`, `open-external-conversation`,
`InitService`), donc des lignes sans la clé traversent ce `NOT` tous les jours.

## Preuve

- **RED prouvé par mutation, trois fois** : l'égalité nue rendue au repli talkie
  ⇒ **6 témoins tombent** ; le tri rendu à `lastMessageAt` seul ⇒ **2 tombent** ;
  l'égalité nue rendue à l'éventail de story ⇒ **1 tombe** ;
- `deleted-at-nominal-form` **5 verts**, les 9 suites talkie **193 verts**, les
  30 suites de notifications + `storycomments` + le cliquet de soft-state
  **503 verts** ;
- `tsc --noEmit` sur `services/gateway` : **EXIT=0**.

## Ce qui n'a pas été mesuré, et ne doit pas se lire comme vert

- **La sémantique de `NOT` sur une condition composée** contre un vrai MongoDB :
  c'est #19907, et c'est la seule chose qui dirait si le repli du talkie apparie
  bien les conversations dont `encryptionMode` est absente — c'est-à-dire s'il
  est VRAIMENT vivant pour toute la population, ou seulement pour celle dont la
  clé est posée. **Le lot répare un filtre mort et ne peut pas prouver que le
  chemin entier est vivant.** Il faut le dire dans cet ordre.
- **L'arriéré** : sans objet ici — les deux correctifs sont des LECTURES, donc
  ils couvrent les lignes déjà en base. C'est la différence avec les cycles 183
  et 184, et c'est ce qui rend ce lot complet là où les deux précédents ont
  laissé une moitié ouverte.
- **Ce que les clients font d'une destination de copie vocale qui CHANGE** : la
  destination élue passe de « le choix du client » à « le choix du serveur », et
  les deux coïncident désormais par construction. Aucune recette sur appareil.
