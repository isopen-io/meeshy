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

## Le second tour : ce que l'audit adversarial a cassé

Le lot est passé par `auditeur-adversarial` avant fusion. **Verdict BLOQUANT**,
et il avait raison sur deux points de fond. Les deux sont du même genre, et
c'est ce qui les rend instructifs : **le lot avait raison sur sa règle et tort
sur l'endroit où elle s'applique.**

### F1 — une loi juste, appliquée à une forme que personne n'émet

`withoutSeparatedCompanions` retire `repostOf.snapshotAuthorId` — la colonne de
DÉCISION — et les cinq producteurs composent leur charge par
`withMentions(ligne, WIRE_BROADCAST)` **dans la route**. La colonne était donc
déjà partie quand `companionSubjectsOf` la cherchait : la moitié « copie d'un
contenu éphémère » de la loi était **morte sur tous les chemins de production**.

Le vecteur est réel et n'a rien d'exotique : B publie un éphémère, E le republie
(`PostService` écrit `snapshotAuthorId = B`), C republie le post de E, A a bloqué
B. L'auteur de la source (E) n'étant pas bloqué, le contenu copié de B atteignait
A — et c'est **exactement** le cas pour lequel `snapshotAuthorId` existe.

> **Les témoins du lot ne pouvaient pas l'attraper, et pas par négligence : ils
> construisaient leur post À LA MAIN.** Mutée, la ligne qui porte cette moitié
> de la loi laissait 881 témoins verts — elle n'était gardée par rien, ce qui est
> cohérent avec le fait qu'elle était inatteignable. Une fixture manuelle atteste
> une loi sur la forme qu'on a imaginée ; le producteur, lui, en émet une autre.
>
> La question à poser à toute fixture de diffusion n'est donc pas « porte-t-elle
> les bons champs ? » mais **« par où le producteur réel la fait-il passer avant
> d'émettre ? »** — et le témoin la fait passer par là.

Réparé par `keepsDecisionColumn` (une diffusion garde la colonne : sa charge
n'est pas encore SERVIE) plus une fabrique UNIQUE dans `emitPostToAudience` que
les trois chemins traversent, charge commune comprise. Le témoin de non-fuite
tient les trois ensemble, et sa fixture traverse la composition réelle.

**Un témoin existant est tombé au passage, et il avait raison de tomber** :
`separatedCompanions.test.ts` asserte « la colonne ne part jamais sur le fil,
séparation ou non », en comptant la composition d'une diffusion parmi les
charges servies. Elle ne l'est pas. Le témoin a changé de PORTÉE, pas de
garantie : ce qui se garde là est ce qui reste vrai là — toute charge servie la
retire — et la garantie « jamais sur le fil » est tenue à son vrai endroit, par
son propre témoin.

### F3 — la règle du module, lue en l'étendant, et pas appliquée

`pairsAround` cachait par défaut. Ses sujets étant l'auteur republié et les trois
commentateurs d'aperçu, c'est une clé **par publication** — littéralement la
situation que le doc-comment du module INTERDIT, à quarante lignes du site
fautif, en citant l'audit adversarial de #20337 qui l'avait fait corriger sur
l'autre question. Mesuré : 512 publications à compagnons évinçaient l'entrée de
`contentSeparation`, donc le cache qui garde #20216.

> **Une règle écrite dans le module qu'on étend ne s'applique pas d'elle-même à
> l'extension.** C'est « écrire une règle ne l'applique pas au lot qui l'écrit »,
> rejouée sur une règle qu'on n'a même pas écrite soi-même — et la lire en
> passant ne compte pas comme l'avoir appliquée.

### Trois gardes JUSTES que rien ne tenait

Chaque mutation isolée laissait 881 verts : la réduction de l'écho de l'auteur,
et les **deux couches** qui ferment la charge commune (le retrait des
`audienceRooms`, l'`except` sur la room `user:`) — mutuellement redondantes, donc
jamais seules en cause. Les deux ensemble faisaient tomber 30 témoins.

> **Une défense en profondeur dont aucune couche n'est tenue perd une couche en
> silence**, et la seconde devient le seul rempart sans que personne le sache.

### Et DEUX des témoins posés en réponse à l'audit étaient mal visés

Mesuré, pas supposé — les deux mutations correspondantes restaient vertes :

- le témoin du cache exerçait l'**option** `cached: false` sans vérifier que le
  site de production la pose. **Un témoin qui exerce une option n'atteste pas
  que l'appelant la pose.**
- le témoin de la seconde couche passait par `broadcastPostUpdated`, donc par la
  branche « room du post », alors que la règle vit aussi dans la branche en
  boucle — celle des six autres familles. **Un seam à deux branches est deux
  sites, même quand elles portent la même règle.** C'est la forme du cycle 127
  (« une garde qui protège la population la plus NOMBREUSE peut manquer la plus
  EXPOSÉE ») appliquée à un `if`.

### Ce que l'audit a mesuré FAUX dans ce lot, hors défauts

Le « RED prouvé : 28 rouges » du premier commit. Rejoué contre les témoins
LIVRÉS : **60 rouges** sur 91. Le 28 était celui de la première rédaction, avant
les deux réparations de témoins qui en ont AJOUTÉ des cas, et il n'était
reproductible sous aucun découpage. **Un compte est une affirmation : il se
recompte quand ce qu'il compte change** — c'est la règle du cycle 93, et ce
journal vient de la payer.

### Les deux coûts assumés, et les trois issues ouvertes

- Un **spectateur de la room du post**, séparé d'un compagnon et hors de
  l'audience, ne reçoit plus rien (il recevait la charge entière, donc la fuite,
  avant le lot). Perte fonctionnelle, pas de confidentialité. **#20779.**
- Le **cache est process-local** : son invalidation ne franchit pas une seconde
  passerelle, et le doc-comment affirme le contraire. Latent (une seule
  passerelle en production), mais ce lot double la surface. **#20780.**
- Les **MENTIONS** ne sont filtrées par aucune séparation, nulle part — et la
  règle n'existe pas, dans aucun sens. Ce n'est pas un défaut de ce lot : REST et
  diffusion font la même chose. **#20781**, en `décision-produit`, parce que la
  bonne réponse dépend de *qui a ÉCRIT ce que le champ porte*.

## Preuve

| étape | mesure |
|---|---|
| RED avant correction, rejoué contre les témoins LIVRÉS | **60 rouges** sur 91 |
| mutation « la fabrique servie n'applique plus la loi » | 42 rouges |
| mutation « `pairsAround` toujours vide » | 58 rouges |
| mutation « charge par lecteur non réduite » | 35 rouges |
| mutation « commentaires retirés des sujets » | 21 rouges |
| mutation « fermeture fail-OUVERTE » | 14 rouges |
| mutation « précision → union des sujets » | 7 rouges |
| mutation « exclusion de la charge commune retirée » | 5 rouges |
| mutation « colonne de décision retirée dès la composition » | 3 rouges |
| mutation « `snapshotAuthorId` retiré des sujets » (vert avant F1) | 2 rouges |
| mutation « écho de l'auteur non réduit » (vert avant l'audit) | 2 rouges |
| mutation « couche 1 retirée » (vert avant l'audit) | 2 rouges |
| mutation « couche 2, branche sans room de post » (vert avant l'audit) | 1 rouge |
| mutation « cache rendu aux clés jetables » (vert avant l'audit) | 1 rouge |
| mutation « dédoublonnage des destinataires retiré » | 1 rouge |
| mutation « repli de colonne manquante ouvert » | 1 rouge |
| arbre livré | **105 verts** sur les deux fichiers du lot |
| suites de séparation et de diffusion sociale | **972 verts** / 62 suites |
| `tsc --noEmit` (passerelle) | **0** |

**Six des seize mutations ci-dessus étaient VERTES avant l'audit.** C'est la
mesure la plus utile de ce cycle : le lot avait prouvé son ROUGE, posé ses
gardes, et six d'entre elles n'étaient tenues par rien.
