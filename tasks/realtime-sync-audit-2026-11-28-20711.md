# 2026-11-28 — La DIFFUSION d'une publication et ses compagnons (#20711)

**Date** : 2026-11-28 · **Branche** : `claude/exciting-planck-ovkcs8` · **Issue** : #20711

Suivi direct du cycle du 2026-11-27 (#20204), dont la quatrième porte était
« instruite, et c'en est une fuite ». Le journal ne porte pas de numéro de
cycle, pour la raison que le précédent a écrite : la date et l'issue sont déjà
uniques, et un identifiant qui ne s'alloue pas collisionne (#5102).

## Le relevé que l'issue demandait — les PRODUCTEURS de `WIRE_BROADCAST`

Le critère de fin exigeait, pour chaque producteur, si sa charge porte
`comments` / `repostOf`. Les sept sites de production ont été ouverts :

| producteur | sa charge vient de | `comments` | `repostOf` |
|---|---|---|---|
| `PUT /posts/:postId` (`routes/posts/core.ts:840`) | `PostService.updatePost` → `postInclude` | **oui** | **oui** |
| `routes/posts/publication.ts:255` (`broadcastPayload`) | `PublishedPostRow` de la porte de création | non (post neuf) | **oui** si republication |
| `routes/posts/interactions.ts:797` (republication de story) | la ligne republiée | non | **oui** |
| `routes/posts/interactions.ts:952` (repost) | la ligne du repost | non | **oui** |
| `routes/posts/commentSettings.ts:81` | relecture par `postInclude` | **oui** | **oui** |
| `services/posts/PostAudioService.ts:408` | relecture par `postInclude` | **oui** | **oui** |
| `services/attachments/.../ready-listener.ts:77` (`notifyPostReaders`) | relecture par `postInclude` | **oui** | **oui** |

**Et les sept convergent en UN seul seam.** Tous appellent une méthode
`broadcast*` de `SocialEventsHandler`, et les sept qui portent un `Post` entier
passent par `SocialEmissionCore.emitPostToAudience`. Le correctif vit donc là,
une fois, et non sept fois chez les producteurs — c'est ce qui l'a rendu petit.

> **Un relevé de PRODUCTEURS peut se refermer sur un seul site.** La question
> qui l'attrape n'est pas « combien composent cette charge ? » mais **« où
> se rejoignent-ils ? »** — sept correctifs chez les appelants auraient divergé
> au premier producteur ajouté, et le huitième aurait été écrit sans la loi.

Note de périmètre : `routes/posts/commentSettings.ts` n'a **aucun événement
dédié** — le basculement d'un réglage de commentaires rediffuse la publication
ENTIÈRE par `post:updated` / `story:updated` / `status:updated`. C'est le
déclencheur le plus discret de la fuite, et c'est aussi lui qui interdisait de
retirer `comments` de la charge (voir plus bas).

## Le relevé des CONSOMMATEURS, et ce qu'il a tranché

L'issue voulait savoir lesquels **EXIGENT** ces clés, pas seulement lesquels les
LISENT — #20443 ayant mesuré que ce sont deux propriétés distinctes. Mesuré sur
les trois clients :

| client | `comments` | `repostOf` | forme de fusion |
|---|---|---|---|
| web | non déclarée dans `FeedPost` | optionnelle (`feed-pages.ts:199`) | **REMPLACEMENT** (`card-caches.ts:280` + `viewer-points.ts:58`) |
| iOS | optionnelle, `decodeIfPresent` (`PostModels.swift:290`, `:390`) | optionnelle (`:291`, `:391`) | **REMPLACEMENT** (`FeedViewModel+Socket.swift:70-77`, `ProfileUserPostsViewModel.swift:579`) |
| Android | nullable + défaut (`Post.kt:219`) | nullable + défaut (`:220`) | **REMPLACEMENT** (`PostUpdateMerge.kt:32-37`) |

**Aucun décodeur n'exige l'une ou l'autre clé.** Les formes 2 et 3 de l'issue
— retirer `comments`, ou la forme mixte — étaient donc sûres au décodage, et
c'est exactement ce qui les rendait crédibles.

**Elles sont fausses à la FUSION.** Les trois clients écrasent leur carte par
la charge reçue : une clé ABSENTE n'est pas un silence, c'est un EFFACEMENT.
Retirer `comments` aurait vidé l'aperçu des trois premiers commentaires de la
carte iOS (`FeedPostCard+CommentsPreview.swift:31`) et de son jumeau Android
(`FeedPostPresentation.kt:293`) à chaque édition — et jusque sur un basculement
de réglage de commentaires, qui rediffuse le post entier. Retirer `repostOf`
aurait vidé la citation sur web (`card-model.ts:490`), rendu une carte de repost
« nu » entièrement VIDE (`content-card.ts:172`), et fait afficher « plus
disponible » par Android sur toute carte se déclarant repost
(`RepostEmbedPresentation.kt:125`).

> **Un relevé de consommateurs pose TROIS questions, pas deux.** « Lit-il cette
> clé ? », « l'exige-t-il ? », et **« que fait-il de son ABSENCE ? »**. La
> troisième est celle qui décide quand le client FUSIONNE, et elle ne se lit ni
> dans le décodeur ni dans le rendu : elle se lit dans le site de fusion. Un
> relevé qui s'arrête à l'optionalité conclut « on peut retirer » et livre une
> régression d'affichage que personne ne rattachera à ce lot.

La seule exception mesurée est la fusion CIBLÉE des Réels Android
(`ReelsViewModel.kt:390`, `copy(commentsDisabled, commentsClosed)`) — une
exception qui confirme la règle : partout ailleurs, c'est un remplacement.

## La forme retenue, et pourquoi elle ne paie rien

Une quatrième, que l'issue n'avait pas écrite et que le relevé rend évidente :
**résoudre par lecteur, exactement, et servir par la MÊME loi que le REST.**
`repostOf` sort à `null`, l'aperçu perd les seuls commentaires séparés, et la
clé reste PRÉSENTE. Détail, raisonnement et fermetures :
`services/gateway/decisions/2026-11-28-une-diffusion-de-publication-resout-ses-compagnons-par-lecteur-20711.md`.

Deux faits de coût qui ont permis de ne pas arbitrer :

- `companionSubjectsOf(post)` rend `[]` sur toute publication NEUVE sans
  republication — donc aucune lecture. Les trois familles `*:created` ne paient
  rien dans leur cas nominal.
- `pairsAround` tient dans les DEUX lectures que `roomsAround` faisait déjà : le
  sens « qui a bloqué un sujet » projette en plus une colonne qu'il filtrait
  déjà, et le sens inverse la projetait. Même cache, même invalidation.

> **Avant d'arbitrer entre « fidèle mais cher » et « gratuit mais faux »,
> mesurer la projection étroite.** L'arbitrage que l'issue annonçait — « une
> composition par lecteur, plus une lecture de blocages par lecteur » — a
> disparu une fois la lecture ouverte : il n'y avait pas de lecture par lecteur
> à payer. C'est la règle de `anonymousSession: { select: { rights: true } }`
> (#20277), rejouée sur une requête au lieu d'un `select`.

## Ce que le lot a mesuré sur ses PROPRES témoins

**Deux des quatre témoins ne pouvaient pas tomber à leur première rédaction**,
et c'est le constat le plus réutilisable du cycle.

1. **Le témoin de FERMETURE.** Il faisait lever TOUTE lecture de blocage pour
   simuler la panne — donc aussi le pré-filtre des feed rooms, dont le `catch`
   ne rend que l'auteur. Le lecteur n'était alors JAMAIS dans l'audience,
   bloqué ou non : rendre la fermeture fail-OUVERTE laissait **77 témoins
   verts**. C'est le constat C9 de #20430, qui frappe une seconde fois, sur
   l'AUTRE lecture. Réparé par un mode de panne CIBLÉ (`'panne-compagnons'`,
   qui ne fait lever que la requête `hasSome`).

2. **Le témoin de PRÉCISION.** Il n'avait qu'UN lecteur séparé d'UN compagnon :
   « chacun sa charge » et « la charge amputée de TOUS les compagnons » y
   rendent le même verdict. Remplacer la carte par lecteur par l'UNION de tous
   les sujets laissait **77 témoins verts**. Réparé par un second lecteur,
   séparé d'un AUTRE compagnon.

> **Un double qui fait tomber PLUS que la lecture visée déplace le défaut hors
> de l'audience, où plus aucune assertion ne peut le voir.** Et un témoin de
> précision a besoin de DEUX cas qui divergent — c'est la forme de la leçon 261
> (« un témoin de RANG s'écrit sur un rang AUTRE que le premier ») appliquée à
> une carte : un témoin de carte s'écrit sur DEUX entrées distinctes, sans quoi
> la carte et sa réduction sont indiscernables.

## Ce que le lot a aussi découvert, et qui ne change rien

**Les doubles de #20216, #20236 et #20430 ne projettent que `{ id }`** sur la
requête `hasSome` — ils ont donc tous rougi quand `roomsAround` est passé par la
carte par lecteur. La production projette bien les deux colonnes ; le repli
fail-closed (« intersection vide ⇒ tous les sujets », puisque le `where` prouve
déjà la relation) les a remis au vert sans masquer quoi que ce soit, et il est
gardé par son propre témoin — avec sa limite ÉCRITE : ce repli est exactement ce
qui rend les trois doubles partiels incapables de voir si la précision existe,
d'où un fichier de témoins dédié (`separatedRooms.pairs-20711.test.ts`).

> **Un repli qui sauve des doubles partiels est un repli qui les rend aveugles.**
> Le garder est juste ; ne pas écrire ce qu'il cache ne l'est pas.

## Preuve

| étape | mesure |
|---|---|
| RED avant correction | **28 rouges** (7 familles × 2 compagnons × 2 sens) |
| mutation « loi retirée de la charge par lecteur » | 35 rouges |
| mutation « fermeture fail-OUVERTE » | 14 rouges |
| mutation « précision → union des sujets » | 7 rouges |
| mutation « exclusion de la charge commune retirée » | 5 rouges |
| mutation « repli de colonne manquante ouvert » | 1 rouge |
| arbre livré | **91 verts** sur les deux fichiers du lot |
| `tsc --noEmit` (passerelle) | **0** |
