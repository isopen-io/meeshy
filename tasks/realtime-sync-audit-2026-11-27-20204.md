# 2026-11-27 — Ce qui voyage avec un post, aux portes UNITAIRES (#20204)

**Date** : 2026-11-27 · **Branche** : `claude/exciting-planck-u0k3cs` · **Issue** : #20204

**Ce journal ne porte pas de numéro de cycle, et c'est délibéré.** Le journal du
2026-11-22 (#20443) s'est renuméroté DEUX fois — 222, 223, puis 224 — parce que
d'autres sessions avaient fusionné le même numéro dans `dev` entre-temps, et il
a conclu que « la date et l'issue sont déjà uniques : ce fichier est
identifiable par `2026-11-22` + `20443` sans aucun numéro ». C'est #5102 — un
identifiant qui ne s'alloue pas collisionne — et la réparation est de cesser de
tirer l'identifiant, pas de mieux le tirer.

## Le point de départ : un suivi hérité, et ce qu'il disait

#20204 est le suivi de #16894, qui a fait retirer par les **dix portes de
LISTE** (fil, stories, réels, profil, favoris, communauté, recherche, albums,
hashtag, à proximité) deux contenus d'AUTRES auteurs qui voyagent DANS un post
servi : la source d'une republication (`repostOf`) et les commentaires en
aperçu (`comments`, trois au plus). La règle est portée par le LECTEUR
(`WireReader.separatedUserIds`), lue par `readerSeparatedFrom` et appliquée dans
`withMentions` → `withoutSeparatedCompanions`.

L'issue nommait **quatre portes restées ouvertes**. Les quatre ont été OUVERTES
une par une, et elles ne disaient pas la même chose.

| porte | ce que l'issue affirmait | mesuré |
|---|---|---|
| `getDiscoverStatuses` | sert les statuts `PUBLIC` de tout auteur, bloqué compris | **VRAI** — corrigé |
| `GET /posts/:postId` | sert `repostOf` et l'aperçu des commentaires sans séparation | **VRAI** — corrigé |
| `POST`/`DELETE /posts/:postId/like` | « rendent le post entier au lecteur » | **FAUX** — voir plus bas |
| diffusions `WIRE_BROADCAST` | « à instruire » | **instruit, et c'est une fuite** — #20711 |

## Porte 1 — la découverte des statuts n'avait AUCUNE clause de séparation

`getDiscoverStatuses` compose son `where` à la main : `deletedAt`, `type`,
`visibility: PUBLIC`, l'expiration, le curseur. Sa **jumelle** `getStatuses`
passe par `buildFeedVisibilityFilter`, qui lit les blocages **lui-même** quand
on ne lui passe pas d'ensemble, et pose donc `authorId: { notIn }` sans que
personne l'écrive.

> **Ce qui a tenu ce défaut invisible n'est pas un oubli : c'est que la règle
> existait, posée par un collaborateur que cette porte-ci n'appelle pas.** Deux
> fonctions voisines, même table, même type de contenu, l'une gardée
> gratuitement et l'autre pas — et rien dans le code de la seconde ne manque,
> puisqu'elle n'a jamais prétendu déléguer. La question qui l'attrape est
> « ma jumelle paie-t-elle cette garde par un chemin que je ne prends pas ? »,
> et c'est la forme du cycle 85 (« un commentaire ne documente que l'exemplaire
> qu'il touche ») appliquée à une DÉLÉGATION plutôt qu'à un commentaire.

Corrigé : la découverte résout son lecteur (`readerSeparatedFrom`) et pose les
deux clauses que les dix portes de liste posent déjà — `authorId: { notIn }` et
`snapshotAuthorNotSeparated` (la COPIE d'un contenu éphémère porte les médias de
son auteur d'ORIGINE et lui survit). L'exclusion vit dans la REQUÊTE : filtrée
après lecture, une page reviendrait courte avec un `hasMore` faux.

`separated.length === 0 ⇒ aucune clause` — un `notIn: []` coûterait un niveau de
plan pour rien, et c'est la forme que le dépôt emploie déjà.

## Porte 2 — la fiche, et pourquoi la garde LIT au lieu de RECEVOIR

`GET /posts/:postId` sert par `servePublishedPost`, « la seule fonction qui
compose une réponse de publication » (#4151). Son lecteur venait de
`wireReaderFromRequest`, qui porte la négociation de scène (capacités de
canevas, langue) et **pas** la séparation. Mesuré au JSON servi : la source
republiée d'un auteur séparé et ses commentaires en aperçu partaient entiers —
à un geste de distance de la liste qui les tait depuis #16894.

Le point de conception du lot est **comment** la garde est posée. Trois formes
étaient possibles, et deux sont des demi-correctifs :

| forme | ce qu'elle laisse faire |
|---|---|
| `reader?: WireReader` optionnel | l'omettre désactive la garde — et chaque porte de publication future l'omettra sans qu'un témoin tombe |
| `separated: ReadonlySet<string>` requis | rien à oublier, mais un appelant pressé passe `new Set()` et le compilateur dit oui |
| **`prisma` + `await`, la fonction LIT** | il n'y a rien à passer de faux : la séparation n'est pas une entrée |

`servePublishedPost` est donc devenue `async` et prend `prisma`. Le compilateur
a nommé ses **quatre** autres appelants dans la seconde qui a suivi (`TS2345`,
`prisma is missing`) — c'est exactement ce qu'on veut d'un élargissement de
garde : la liste des portes à instruire est rendue par `tsc`, pas par un `grep`.

**Et toutes ces portes en avaient besoin, les CRÉATIONS comprises.** La réponse
d'un repost sert `repostOf`, c'est-à-dire la ligne d'un TIERS, et rien n'empêche
de republier la publication PUBLIQUE de quelqu'un qu'on a bloqué
(`canUserInteractWithPost` rend `true` sur `PUBLIC` sans lire le blocage). Une
exemption « l'auteur sert sa propre ligne » aurait donc été fausse là où elle
avait l'air le plus évidente.

## Et la lecture n'est payée que si elle décide de quelque chose

La forme « la fonction LIT » a un coût mesurable : deux requêtes indexées
(`getBlockRelatedUserIds`) par ouverture de fiche **et par création**. Le premier
jet les payait partout — et il a fait rougir **quarante suites**, toutes de la
même façon : le double Prisma d'un harnais de création n'a pas de `user`, donc
la lecture lève, donc la route rend 500. Fail-closed fonctionnait exactement
comme annoncé, et il annonçait que la garde ne servait à rien là où elle
coûtait.

Parce qu'une publication qu'on vient d'écrire **n'a pas de compagnon** : aucun
commentaire, et `repostOf` n'existe que sur une republication. La lecture y
décide de RIEN.

`hasSeparableCompanions` (`separatedCompanions.ts`) est donc le prédicat qui
gouverne la lecture, et il est **dérivé des mêmes accesseurs** que
`withoutSeparatedCompanions` — pas recopié. Un prédicat recopié dériverait au
premier compagnon ajouté au filtre, et il dériverait du mauvais côté : en
répondant « rien à filtrer » sur une forme qui porte désormais un tiers. Le
témoin qui garde l'équivalence ne teste pas le prédicat seul : il prend chaque
forme que le FILTRE sait toucher, vérifie que le filtre la change, et exige que
le prédicat l'annonce.

> **Ce n'est pas un raccourci de garde, et la distinction tient à ce sur quoi le
> prédicat porte : la charge SORTANTE, jamais une autorisation.** `false` veut
> dire « il n'y a rien à taire », pas « il n'y a rien à vérifier ». Un prédicat
> de la seconde espèce — « ce lecteur a-t-il l'air d'être concerné ? » — serait
> la famille « une garde conditionnée à ce qu'elle garde est un no-op ».

Mesure après : **93 suites de `routes/posts` vertes, 1 546 témoins**, sans
toucher un seul harnais. Les quarante rouges n'étaient pas une dette de harnais
à solder — c'était le lot qui lisait au mauvais endroit.

Les cinq rouges qui RESTENT sur la suite complète (`ExifStrip.orientation`,
`heif-upload-conversion`, `avif-variants`, `tus-handler-heif-conversion`,
`UploadProcessor.heif-conversion`) sont PRÉEXISTANTS : vérifié en remisant le
lot (`git stash`) et en rejouant — même rouge sur l'arbre nu. Le conteneur n'a
pas les codecs d'image. Le dire évite qu'un prochain lot les lise comme sa
propre régression.

## Porte 3 — « rendent le post entier » : mesuré FAUX

Le témoin RED écrit pour cette porte a rendu `comments: undefined`. Le corps
servi, mesuré :

```
POST   /posts/:postId/like → {"success":true,"data":{"liked":true,"reactionSummary":{"❤️":1}}}
DELETE /posts/:postId/like → {"success":true,"data":{"liked":false,"reactionSummary":{"❤️":1}}}
```

Ces routes ne déclarent **aucun schéma de réponse** : le gestionnaire compose
`{ liked, reactionSummary }` à la main. Le post rendu par `likePost` /
`unlikePost` ne quitte le gestionnaire que par six champs — `likeCount`,
`reactionSummary`, `authorId`, `type`, `createdAt`, `expiresAt` — consommés par
la diffusion de COMPTEURS (`broadcastPostLiked` et ses deux jumeaux ne portent
que `postId`, `userId`, `emoji` et la paire de compteurs) et par la
notification. Aucun compagnon ne part.

> **C'est la règle du cycle 84, et elle a coûté un témoin RED pour être
> entendue : « un audit qui liste des sites ne liste pas des fuites ; avant de
> qualifier l'une, traverser la sérialisation. »** Ce qui a rendu la fuite
> crédible, c'est la FORME du site : `withMentions(res, wireReaderFromRequest(request))`
> est, partout ailleurs dans le dépôt, la composition d'une réponse SERVIE.
> Quatre sites de cette forme, dans un fichier de routes, suffisent à faire
> écrire « rendent le post entier au lecteur » — l'affirmation décrit la forme,
> pas la charge.

Et il reste quelque chose à faire, parce que **la non-fuite est ACCIDENTELLE** :
elle tient à ce que le gestionnaire compose sa réponse à la main. Le jour où
quelqu'un sert le post depuis ces routes — pour épargner un aller-retour au
client, raison parfaitement légitime — la fuite s'ouvre le même jour, et aucun
autre témoin du dépôt ne tombe. D'où un **piège armé** (cycle 84) :
`like-response-separated-companions-20204.test.ts` fige les deux corps servis à
`{ liked, reactionSummary }`, nomme dans son doc-comment ce qu'il NE prouve pas,
et dit à qui le fera tomber ce qu'il doit poser dans le même lot
(`servedWireReader`).

## Porte 4 — la diffusion, instruite : c'est une fuite, et elle n'est pas de ce lot

`PUT /posts/:postId` compose son `broadcastPost` avec `WIRE_BROADCAST`, dont
`separatedUserIds` est absent par construction — une diffusion n'a pas de
lecteur. Et `PostService.updatePost` rend `select: postInclude`, qui porte
`comments` (les trois de l'aperçu) **et** `repostOf`.

Mesuré, donc : `post:updated` / `story:updated` / `status:updated` portent à
toute l'audience la source republiée et l'aperçu des commentaires, sans aucune
séparation — et le web fusionne la charge reçue PAR-DESSUS sa carte. **Une
diffusion réinjecte ce que le REST vient de retirer**, et le symptôme est le
pire de la famille : la liste est juste, et c'est une édition faite par un
TIERS qui ramène le contenu tu.

Ce lot ne la ferme pas, et la raison est un arbitrage, pas un manque de temps :
une charge de diffusion est UNE pour une audience HÉTÉROGÈNE sur la séparation.
Les deux formes possibles coûtent chacune quelque chose qui se décide, pas qui
se code — résoudre par destinataire (une composition par lecteur sur un chemin
d'édition), ou retirer les compagnons de la charge et laisser chaque client les
relire par le REST (gratuit, mais un `post:reposted` sans `repostOf` n'a plus de
carte à rendre). **Issue : #20711.**

## Ce que le lot a aussi mesuré, et qui ne change rien

- **`statusPostSelect` ne charge NI `comments` NI `repostOf`.** Le lecteur passé
  à `withMentions` dans `getStatuses` et `getDiscoverStatuses` n'a donc, sur
  l'axe des compagnons, rien à taire — le défaut de la découverte était
  entièrement dans son `where`, pas dans sa composition. Le dire évite qu'un
  prochain lot « corrige » une composition qui n'a jamais rien laissé passer.
- **`buildViewerVisibilityFilter` ne lit PAS les blocages, par décision écrite
  (#7184)** : la garde unitaire du blocage appartient à `canUserConsumePost`.
  `getPostById` ne payait donc aucune lecture de blocage, et l'élargissement de
  `servePublishedPost` en coûte bien une (deux requêtes indexées, celles de
  `getBlockRelatedUserIds`) par ouverture de fiche et par création. Avant de
  l'écrire « gratuit » — ce que la règle maison invite à vérifier — le site a
  été ouvert : il ne l'était pas.

## Preuve

**RED prouvé avant correction, par porte** :

| porte | rouges |
|---|---|
| `getDiscoverStatuses` | **4** (aucune clause d'auteur, aucune clause de copie, aucune lecture de blocage, aucune fermeture sur panne) |
| `GET /posts/:postId` | **3** (`repostOf` servi entier, aucune lecture, aucune fermeture sur panne) |

Dans les deux cas, le témoin « sans blocage, tout est servi » était **VERT avant
comme après** : c'est un témoin de NON-RÉGRESSION, et le dire évite de le
compter comme une preuve de correction.

**Mutations rejouées après correction** : remettre `wireReaderFromRequest` au
lecteur de `servePublishedPost` fait tomber 3 rouges ; retirer la clause
`authorId` de la découverte en fait tomber 1 ; faire lever la lecture des
blocages fait tomber les deux témoins FERMÉS (la fiche rend 500, la découverte
rejette) — et **aucune donnée ne sort** dans les deux cas, ce que les deux
témoins assertent en plus du statut.

`tsc --noEmit` (passerelle) : **0**. Suite gateway complète : voir le
commentaire de clôture de l'issue.
