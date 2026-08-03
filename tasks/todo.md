# Sémantique like / impression / vue — POST, REEL, MOOD (2026-07-31)

## Demande
1. Le like d'un réel depuis feed-posts / feed-réels / détail semble incrémenter
   « des données différentes au lieu de la même donnée ».
2. Chaque impression de REEL, POST, MOOD depuis **n'importe quelle** vue doit
   incrémenter `impressionCount`. Arbitrage retenu : **une impression par
   apparition à l'écran** (déduplication de session retirée).
3. Ouvrir un réel en détail doit aussi incrémenter `viewCount`, avec un champ de
   vues **uniques par utilisateur** — à réutiliser s'il existe.

## Constats (Phase 1 — investigation)

### Ce qui est SAIN (le soupçon ne se vérifie pas côté serveur)
- **Un seul écrivain du like.** `PostReactionService.updatePostReactionSummary`
  recalcule depuis la table `PostReaction` (`groupBy`) et écrit `reactionSummary`,
  `reactionCount` ET `likeCount` au **même total**. REST `/posts/:id/like` et le
  socket `reaction:add` y convergent tous les deux (`PostService.likePost` →
  `addReaction`). Vérifié en prod : 20/20 posts avec `likeCount == reactionCount`,
  `reactionSummary` cohérent.
- **Les vues uniques existent déjà.** `PostView` porte `@@unique([postId, userId])` ;
  `PostService.recordView` ne crée la ligne qu'à la première vue et n'incrémente
  `viewCount` qu'alors (auteur exclu, visibilité vérifiée). `viewCount` EST donc
  le compteur de vues uniques demandé — rien à créer.
- Le détail appelle bien `viewPost` (`PostDetailView:747`, `:1194`).

### D1 — Le batch d'impressions ignore les occurrences répétées
`POST /posts/impressions/batch` : `createMany` insère **N** lignes `PostImpression`
mais `updateMany({ where: { id: { in: capped } } })` incrémente chaque post
**une seule fois**. Envoyer `["A","A","A"]` crée 3 lignes et ne monte le compteur
que de 1 → table et compteur dénormalisé divergent. Bloquant pour la sémantique
« une par apparition ».
Fichier : `services/gateway/src/routes/posts/interactions.ts:400`.

### D2 — Le détail n'écoute pas le like du post
`PostDetailViewModel` s'abonne à `commentAdded`, `commentDeleted`,
`commentReaction*`, `postTranslationUpdated` — **pas** à `postLiked`/`postUnliked`.
Un like venu d'une autre surface ou d'un autre utilisateur n'atteint jamais le
détail ouvert.
Fichier : `apps/ios/Meeshy/Features/Main/ViewModels/PostDetailViewModel.swift:824`.

### D3 — Le like n'est écrit dans AUCUN cache partagé
Le même post vit sous plusieurs clés du store `feed` : `main-feed`, `<postId>`
(détail), la clé reels, `bookmarks`. Or :
- `PostDetailViewModel.likePost` mute `post` en mémoire, **jamais** `feed.save`
- `ReelsViewModel.toggleLike` n'a qu'un `likeDelta` mémoire — son protocole
  `ReelFeedCacheReading` est en **lecture seule**
- `FeedViewModel` ne persiste que `main-feed`
→ Le compteur affiché dépend de la clé de cache lue. C'est le « données
différentes au lieu de la même donnée » rapporté.

### D4 — MOOD/STATUS ne compte ni impression ni vue
`StatusViewModel` et les vues de statut n'appellent ni `recordImpression` ni
`viewPost`. Aucune source `status` dans l'enum d'impression.

### D5 — Déduplication de session sur toutes les surfaces sauf story
`recordedImpressionIds` (FeedView, ProfileUserPostsList), `impressionRecordedIds`
(ReelsViewModel) : un post revu ne recompte jamais. Contraire à l'arbitrage retenu.
Le rate limit `impression` (10/min) est trop bas pour la nouvelle sémantique.

## Plan

- [x] T1 gateway — batch : incrémenter par occurrence (+ 3 tests)
- [x] T2 gateway — source `status` dans l'enum d'impression (+ test)
- [x] T3 gateway — rate limit impression 10 → 30/min (+ test)
- [x] T4 iOS — retirer la dédup de session (FeedView, ProfileUserPostsList, ReelsViewModel)
- [x] T5 iOS — MOOD : impression à l'apparition, vue à l'ouverture (+ 3 tests)
- [x] T6 iOS — `PostDetailViewModel` s'abonne à `postLiked`/`postUnliked` (+ 4 tests)
- [x] T7 SDK — `GRDBCacheStore.patchEverywhere` + write-through du like dans
      `CacheCoordinator` (+ 5 + 4 tests)
- [x] T9 iOS — favoris : dernière surface de contenu sans impression
- [x] T10 web — même sémantique d'impression + sources `story`/`status` manquantes
- [x] T8 vérification — tsc, tests gateway, tests SDK/iOS/web, build, run iPad

## Revue

### Livré (4 commits)
| Commit | Portée |
|---|---|
| `3e2ac4163` | gateway — incrément par occurrence, source `status`, rate limit 30/min |
| `6d3cdcb84` | SDK — `patchEverywhere` + write-through du like dans `CacheCoordinator` |
| `e00439215` | iOS — dédup de session retirée, MOOD et favoris tracés, détail abonné aux likes |
| `6cdc64306` | web — même sémantique d'impression, enum de sources complété |

### Preuves
- **D1 mesuré en prod** : `POST /posts/impressions/batch` avec `[A,A,A]` répond
  `recorded:3` mais ne monte `impressionCount` que de 1 (29 → 30). La table
  `PostImpression` et le compteur dénormalisé divergeaient.
- **Nouvelle sémantique vérifiée sur iPad** : trois cycles d'apparition du même
  post donnent 32 → 33 → 34 → 35. Avec la déduplication de session, le compteur
  restait figé après la première apparition.
- Tests : 14 951 gateway (2 échecs `magic-link` — flake d'exécution parallèle,
  verts isolément avec ET sans les changements), 2453 SDK, 89 iOS ciblés, 9 web.
  Gateway `tsc` 0 erreur. Builds iOS + iPad verts.

### Piège de test rencontré
Le premier test du batch passait sur le code bogué : je sommais les ids répétés
du `where.id.in`, alors que Prisma **déduplique** un `in`. Corrigé en sommant sur
`Set(in)` — le test est alors devenu rouge (1 au lieu de 2) avant de passer.

### Dépend du déploiement
`source: "status"` répond encore `400` et le batch ne compte encore qu'une
occurrence par post tant que le gateway n'est pas redéployé. Les clients
dégradent proprement (échec avalé, aucune UI bloquée).

---

# Dette brouillons/stories — fidélité de reprise + sélection visible (2026-08-02)

## Demande (dette consignée par la session du 2026-08-02)
1. `resumeFailedItem` ne reporte pas `visibilityUserIds`/`originalLanguage` —
   le store de brouillons ne modélisait que `visibility`.
2. Grille « Mes stories » : mode sélection sans AUCUN indicateur visuel sur
   les cartes.

## Plan
- [x] T1 SDK — `StoryDraftStore.save/load` : meta `visibilityUserIds` (JSON)
      + `originalLanguage`, effacement des clés quand la valeur disparaît
      (+ 3 tests)
- [x] T2 SDK — `restorableVisibility(stored:userIds:)` : « Seulement…/Sauf… »
      survit AVEC sa liste ; `restoreDraft()` restaure audience + langue ;
      les 2 autosaves persistent les nouveaux champs (+ 4 tests)
- [x] T3 app — `resumeFailedItem` reporte `visibilityUserIds`/`originalLanguage`
      (+ 1 test)
- [x] T4 app — `MyStoryCard` : pastille de sélection (vide/cochée) + anneau
      accent, état décidé par `MyStoryCardPresentation.selectionIndicator`
      (+ 2 tests + 1 garde de câblage)
- [x] T5 — vérification : SDK 38/38 verts (StoryDraftStoreTests 23,
      StoryComposerPublishHandoffTests 15), build-for-testing app OK,
      app 26/26 verts (Resume 6, Presentation 17, BulkDeleteGuard 3)

## Revue
Store : clés meta par brouillon, effacées quand la valeur retombe (pas d'état
fantôme entre autosaves). Restauration : un mode à sélection ne survit
qu'accompagné de sa liste — sans elle, repli produit inchangé (Contacts).
La pastille de sélection est décidée par un helper pur
(MyStoryCardPresentation.selectionIndicator), la vue ne fait que rendre.
