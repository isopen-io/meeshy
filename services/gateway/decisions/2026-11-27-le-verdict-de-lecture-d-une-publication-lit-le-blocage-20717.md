## 2026-11-27 : le verdict de LECTURE d'une publication lit le blocage, et le chemin de lot ne le lit qu'une fois

**Contexte.** `viewerAudience.ts` porte, depuis #7184, une décision écrite sur le
site : le blocage n'est pas posé dans le filtre de visibilité des accès
UNITAIRES, parce qu'« il appartient à `canUserConsumePost` ». Mesuré le
2026-11-27 (#20717) : `postVisibility.ts` ne portait aucune lecture de blocage.
La délégation désignait un domicile vide.

Les deux moitiés de la phrase étaient vraies du code — le filtre ne posait pas
la règle, et le délégataire ne l'avait jamais reçue — ce qui est la forme sous
laquelle une règle devient invisible : chaque moitié renvoie à l'autre. Le lot
#7416 l'avait relevé indépendamment le 2026-11-25 (« le verdict rejoué […] ne
lit pas le blocage sur un post PUBLIC »).

**Ce qui était ouvert.** Huit portes gouvernées par ce verdict, toutes ouvertes à
un lecteur séparé dès que la publication est `PUBLIC` : `post:join` et sa salle
temps réel, `post:reaction-request-sync`, le fil de commentaires
(`canUserConsumeThread`), le favori / l'impression / le partage
(`postConsumptionGate`), la réponse à une story, l'éligibilité d'une
notification, le verdict de modération, et `GET /posts/:postId`. Les trois
portes voisines — commenter, réagir, republier — et le fil de LISTE appliquaient
la règle depuis longtemps.

### CORRECTION (audit adversarial du lot, le jour même) — `GET /posts/:postId` n'est PAS fermé

L'énumération ci-dessus comptait `GET /posts/:postId` parmi les portes fermées.
**Mesuré faux**, et vérifié deux fois :

- `PostService.ts` n'importe de `postVisibility` que `isEphemeralPostType` et
  `RepostPassage` — il n'appelle **aucun** verdict de consommation ;
- son filtre est `buildViewerVisibilityFilter`, qui passe `blockedAuthorIds = []`
  (`viewerAudience.ts:44`), et `buildPostVisibilityOrFilter` court-circuite sur
  une liste vide (`postVisibility.ts:165` : `if (blockedAuthorIds.length === 0)
  return audience;`).

Restent donc ouverts à un lecteur séparé : **lire la publication**
(`GET /posts/:postId`), **compter une vue** (`recordView`, qui le fait en outre
APPARAÎTRE dans la liste des vues de l'auteur), **télécharger ses médias**
(`recordMediaDownloads`) et `recordEngagementBatch`.

> **Le lot a commis, dans son propre commit, l'erreur dont il est le correctif.**
> Il a mesuré qu'une délégation écrite désignait un domicile vide — puis a
> compté parmi ses portes fermées une porte qui ne visite pas ce domicile, sur
> la foi de la même délégation. Et il ÉCARTE explicitement, dans ses
> alternatives, la seule modification qui l'aurait fermée (« poser le blocage
> dans `buildViewerVisibilityFilter` »), tout en affirmant fermée la porte
> qu'elle sert : les deux phrases vivent dans le même fichier.
>
> C'est mot pour mot la mise en garde du `CLAUDE.md` de la passerelle —
> *« écrire une règle ne l'applique pas au lot qui l'écrit : la relire contre
> son propre diff est une étape, pas une évidence »* — et c'est la seconde fois
> que le dépôt la paie au même endroit.

**Et le commentaire fautif de `viewerAudience.ts` n'est PAS réparé par ce lot** :
il continue de nommer `getPostById`, `recordView` et `deletePost` comme les
accès unitaires dont `canUserConsumePost` porte le blocage — trois accès qui ne
l'appellent jamais. La délégation est désormais plus CRÉDIBLE qu'avant, puisque
le délégataire applique enfin la règle : c'est un piège aggravé, pas réduit.

Périmètre réel de ce lot : les portes qui passent par `canUserConsumePost`,
`canUserConsumeThread`, `mayConsumePost`, `resolveConsumptionTarget`,
`filterConsumablePostIds` et `consumablePostAuthors`. Suivi : **#20720**.

**Décision.**

1. **La règle se pose dans `canUserConsumePost`**, le domicile que le dépôt
   désigne, AVANT l'audience : une séparation refuse quelle que soit la
   visibilité, et il n'y a rien à apprendre du graphe d'un lien qu'un blocage
   vient de couper. FERMÉ sur l'échec, comme les trois portes voisines.

2. **À frais neufs, jamais par le cache de `separatedRooms.ts`.** Un verdict de
   lecture est une AUTORISATION ; ce cache déclare explicitement ne servir que
   des AUDIENCES, et la distinction est la sienne, pas la nôtre.

3. **Le verdict d'INTERACTION n'est pas touché.** L'asymétrie « voir ⊇
   interagir » (décision 2026-07-08) reste, et ses appelants portent déjà leur
   propre lecture de blocage (`PostReactionService`, `commentHome`) : y ajouter
   la règle ferait payer deux lectures aux deux chemins chauds du dépôt. Un
   témoin gèle cette frontière.

4. **La séparation est une question par LECTEUR, pas par publication.**
   `consumablePostAuthors` — appelé à chaque défilement sur jusqu'à cinquante
   publications — la lit UNE fois pour tous les auteurs distincts
   (`getBlockedUserIdsAmong`, deux requêtes bornées) et la passe au verdict.
   Sans cette passe, la promesse de son en-tête (« un post PUBLIC ou dont on est
   l'auteur ne coûte aucune requête de plus ») serait perdue. Une garde juste qui
   coûte N requêtes sur un chemin de défilement est une lenteur, donc un bug.

5. **La POLARITÉ du paramètre est la moitié de sa raison d'être.** `separatedAuthorIds`
   est optionnel, et son ABSENCE fait LIRE — elle ne désarme pas. Ce n'est donc
   pas le « paramètre dont l'absence désactive une garde » que le dépôt refuse :
   omettre coûte une requête de plus, jamais une règle de moins. C'est le motif
   que `feedVisibility.ts` emploie déjà pour la même valeur.

6. **L'échec du lot ferme le lot ENTIER.** Une lecture de séparation qui ne
   conclut pas ne permet de servir AUCUN id, puisqu'on ne sait plus lesquels sont
   séparés. Servir le reste serait un fail-closed PARTIEL, ce que #20236
   interdit, sur une porte dont rien d'autre ne tient la règle.

7. **L'exemption de l'AUTEUR vit à la porte**, et non dans la discipline de ses
   appelants — bien que `isBlockedWithAny` et `getBlockedUserIdsAmong` filtrent
   tous deux l'id de l'acteur. C'est ce qui rend le contrat de la porte
   indépendant de ses collaborateurs, et le témoin qui le prouve exerce le seul
   chemin où la ligne décide seule : un ensemble fourni qui contiendrait l'auteur.

**Ce que ce lot ne prétend pas.** Il ne répare pas une fuite de contenu mesurée :
l'exclusion à l'ÉMISSION (#20430 et ses quatre prédécesseurs) tait déjà ce qui
part de la salle vers un lecteur séparé. Il ferme la porte d'ENTRÉE, la seule
surface où la séparation ne se posait pas — et dont dépend la durabilité de
toute éviction (#20458, #7416) : évincer un lecteur d'une salle dont la porte le
réadmet ne garde que l'instant.

**Alternatives écartées.**

- *Poser le blocage dans `buildViewerVisibilityFilter`* — c'est précisément ce
  que #7184 a refusé, et pour une raison qui tient : cela mettrait une règle
  d'audience de LISTE sur le chemin d'un post nommé, et ferait payer deux
  lectures à chaque suppression.
- *Poser la règle dans `canUserViewPost`*, le tronc commun — uniforme, mais elle
  frapperait aussi le verdict d'interaction, dont les appelants la lisent déjà.
- *Un cache par lecteur avec invalidation* (la forme de `separatedRooms.ts`) —
  écarté par le point 2 : son propre doc-comment interdit de l'employer pour une
  autorisation, et le point 4 rend le gain inutile là où il comptait.

**Preuve.** 19 témoins neufs ; `tsc --noEmit` vert. Matrice de mutation :

| mutation | ce qui tombe |
|---|---|
| la garde retirée de `canUserConsumePost` | 10 |
| l'ensemble fourni ABSENT vaut « non séparé » (garde désarmée) | 8 |
| fail-OPEN sur l'échec de lecture | 1 |
| l'auteur n'est plus exempté à la porte | 1 |
| la passe unique du lot retirée (le verdict lit lui-même) | 1 |
| le lot sert le reste quand la lecture échoue (fail-closed partiel) | 1 |

Issue : #20717. Famille : #7184, #7416, #20576, #20458, #20430.
