## Une diffusion de publication résout ses COMPAGNONS par lecteur (2026-11-28, #20711, suivi de #20204)

**Date** : 2026-11-28 · **Issue** : #20711 · **Suivi de** : #20204, #16894, #20430

### Le constat

Deux contenus d'AUTRES auteurs voyagent DANS un post servi : la source d'une
republication (`repostOf`) et l'aperçu des commentaires (`comments`, trois au
plus). Les douze portes REST les retirent par lecteur depuis #16894 et #20204,
par la loi `withoutSeparatedCompanions`, posée sur `WireReader.separatedUserIds`.

**Une diffusion n'a pas de lecteur** : `WIRE_BROADCAST` ne porte aucune
séparation, par construction. Les sept familles de `emitPostToAudience`
servaient donc ces compagnons à TOUTE leur audience. Et comme les trois clients
fusionnent la charge reçue par REMPLACEMENT de leur carte, **la diffusion
réinjectait ce que le REST venait de retirer** — sur un déclencheur fait par un
TIERS.

Vecteur : A a bloqué B. Une publication de C republie un post de B, ou porte un
commentaire de B dans son aperçu. C édite sa publication. A reçoit
`post:updated` avec le contenu de B et l'écrit par-dessus sa carte. Symptôme :
la liste est juste, et le contenu tu revient tout seul.

### Les trois formes instruites, et pourquoi aucune des deux premières

L'issue en proposait trois. Le relevé des CONSOMMATEURS des trois clients en a
écarté deux, et ce relevé est la décision :

| forme | verdict |
|---|---|
| retirer `comments` de la charge | **non** — aucun décodeur ne tombe, mais deux aperçus RENDUS s'effacent |
| forme mixte (garder `repostOf`, retirer `comments`) | **non** — même défaut sur `comments`, et `repostOf` reste la fuite |
| résoudre par destinataire | **retenue** |

**Ce qui tranche n'est pas le décodage, c'est la FUSION.** Les deux clés sont
optionnelles partout — iOS `PostModels.swift:290-291` en `decodeIfPresent`,
Android `Post.kt:219-220` nullables avec défaut, web ne déclare même pas
`comments`. Un retrait ne casse donc aucun décodeur. Mais les trois fusions sont
des REMPLACEMENTS — web `mergeServedPost` (`card-caches.ts:280`), iOS
`FeedViewModel+Socket.swift:70-77`, Android `PostUpdateMerge.kt:32-37` — donc
**une clé ABSENTE EFFACE la valeur tenue** au lieu de la corriger. Retirer
`comments` aurait vidé l'aperçu des trois premiers commentaires de la carte iOS
(`FeedPostCard+CommentsPreview.swift:31`) et de son jumeau Android
(`FeedPostPresentation.kt:293`) à chaque édition — y compris sur un simple
basculement de réglage de commentaires, qui rediffuse le post ENTIER
(`commentSettings.ts:84`).

> **« Le client lit-il cette clé ? » et « l'exige-t-il ? » sont deux questions,
> et il en faut une TROISIÈME : que fait-il de son ABSENCE ?** Sur une fusion
> par remplacement, l'absence n'est pas un silence — c'est un effacement. Un
> relevé qui s'arrête à l'optionalité du décodeur conclut « on peut retirer » et
> livre une régression d'affichage.

### Ce qui est livré

`SocialEmissionCore.companionSeparation(post)` résout la séparation des
compagnons pour toute l'audience, puis `emitPostToAudience` sert à chaque
lecteur séparé SA charge, par la MÊME loi que les douze portes REST
(`withoutSeparatedCompanions`) — jamais par une forme à part. `repostOf` sort
donc à `null` et l'aperçu perd les seuls commentaires qu'un blocage sépare : **la
clé reste PRÉSENTE**, qui est la propriété dont les trois fusions dépendent, et
`repostOf: null` est la forme qu'ils rendent déjà « ce contenu n'est plus
disponible » (Android l'affiche explicitement,
`RepostEmbedPresentation.kt:125`).

**Le coût du cas nominal est NUL.** `companionSubjectsOf` rend `[]` dès qu'un
post n'a ni source republiée ni commentaire en aperçu — la forme de toute
publication NEUVE — et `pairsAround([])` répond sans ouvrir de requête. Quand il
y a des compagnons, c'est **deux lectures, quel que soit leur nombre**, et le
cache partagé de `separatedRooms` les rend une fois par jeu de sujets.

### `pairsAround` : la même lecture, rendue PAR LECTEUR

`roomsAround` suffit quand la réponse est une EXCLUSION. Elle ne suffit pas
quand le sujet n'est qu'un COMPAGNON de la charge : le lecteur a droit au post,
et seul le compagnon se tait — il faut savoir LEQUEL, sans quoi un lecteur
séparé d'UN commentateur perdrait l'aperçu entier. `pairsAround` rend la carte
`lecteur → sujets`, depuis les DEUX MÊMES lectures : le sens « qui a bloqué un
sujet » projette en plus la colonne `blockedUserIds` qu'il filtrait déjà, et le
sens inverse la projetait déjà. `roomsAround` n'en prend plus que les CLÉS —
une seule chose à garder juste, au lieu de deux champs qui disent la même chose
sous deux formes.

**Le `where` PROUVE la relation ; la colonne n'en donne que le détail.**
`hasSome` garantit que la ligne a bloqué au moins un sujet quoi que la
projection rende : une intersection vide est donc le signe d'une colonne
manquante, jamais d'une absence de blocage, et on retombe sur TOUS les sujets —
fail-closed, et `roomsAround` rend la même réponse dans les deux cas.

### Les deux fermetures, et leurs raisons opposées

| lecture qui échoue | ce qu'on fait | pourquoi |
|---|---|---|
| `contentSeparation` (#20430, sujet = l'AUTEUR) | la room du post sort de l'adresse, les feed rooms partent seules | le pré-filtre des feed rooms est keyé sur l'auteur : elles sont DÉJÀ gardées contre lui |
| `companionSeparation` (#20711, sujet = un TIERS) | **l'audience ne reçoit RIEN** | un compagnon n'est pas l'auteur : les feed rooms ne sont PAS gardées contre lui, et n'en fermer qu'une partie ne fermerait rien |

C'est le discriminant que #20236 et #20338 ont déjà tranché pour cette forme
exacte, appliqué au bon sujet. Coût assumé : sur une panne de lecture, une
édition ou une republication n'apparaît pas en direct — le prochain fetch REST,
qui est gardé, la rend.

**L'AUTEUR est un LECTEUR, lui aussi** : il a pu bloquer un commentateur de son
propre post, et le REST le lui retire déjà — son écho suit donc la même loi.
Mais il part TOUJOURS (exemption écrite de #20430), et sur une panne il part
INCHANGÉ : une édition qui n'affiche plus l'aperçu de sa propre publication
serait une dégradation visible payée pour un secret que l'auteur a lui-même
hébergé.

### Preuve

**RED prouvé avant correction** : 28 rouges sur les sept familles
(`post:created`, `post:updated`, `post:reposted`, `story:created`,
`story:updated`, `status:created`, `status:updated`) × les deux compagnons.

**Quatre mutations, toutes rouges sur l'arbre livré** : loi retirée de la charge
par lecteur (35), fermeture rendue fail-OUVERTE (14), précision par lecteur
remplacée par l'union des sujets (7), exclusion de la charge commune retirée (5).

**Et DEUX de ces quatre témoins ne pouvaient pas tomber à leur première
rédaction** — c'est le constat le plus utile du lot :

- le témoin de FERMETURE faisait lever TOUTE lecture de blocage, donc aussi le
  pré-filtre des feed rooms, dont le `catch` ne rend que l'auteur : le lecteur
  n'était jamais dans l'audience, bloqué ou non. C'est le constat C9 de #20430,
  qui frappe une seconde fois sur l'AUTRE lecture. Réparé par un mode de panne
  CIBLÉ (`'panne-compagnons'`, qui ne fait lever que `hasSome`) ;
- le témoin de PRÉCISION n'avait qu'UN lecteur séparé, donc « chacun sa charge »
  et « la charge amputée de TOUS les compagnons » rendaient le même verdict.
  Réparé par un second lecteur, séparé d'un AUTRE compagnon.

> **Une mutation qui laisse tout vert ne dit pas que le code est bon : elle dit
> que le témoin ne regarde pas.** Et un double qui fait tomber PLUS que la
> lecture visée déplace le défaut hors de l'audience, où plus aucune assertion
> ne peut le voir.

`tsc --noEmit` (passerelle) : **0**.
