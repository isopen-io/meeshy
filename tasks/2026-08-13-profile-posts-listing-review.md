# Revue — listing des postes d'un profil (iOS)

Périmètre : `apps/ios/Meeshy/Features/Main/Views/ProfileUserPostsList.swift`
(vue + `ProfileUserPostsViewModel`), injecté dans l'onglet « Postes » de
`UserProfileSheet`. Objectif : coût énergétique, fluidité du défilement,
et synchronisation des actions de carte avec les compteurs serveur.

## Constats

### 1. Une requête réseau par carte défilée (énergie) — CORRIGÉ
`.onDisappear { Task { await viewModel.flushImpressions() } }` était posé sur le
`ForEach`. SwiftUI applique un modificateur de `ForEach` à **chaque vue
générée** : toute carte quittant l'écran annulait le minuteur de groupement de
`ImpressionBatcher` et postait un lot d'un seul id. Le batching (3 s) ne servait
plus à rien ; un défilement de 30 cartes = 30 POST `/posts/impressions`.
→ Modificateur remonté au conteneur, à côté de `.task`.
Garde de source : `ProfileUserPostsRenderWindowTests.test_impressionFlush_isAttachedToTheList_notToEachCard`.

### 2. Fenêtre de rendu qui bondit de 3 crans (fluidité) — CORRIGÉ
Les trois dernières cartes de la fenêtre appellent chacune `loadMoreIfNeeded`
au même frame, et chacune lançait sa propre `Task` → `renderWindow` avançait de
3 × `renderStep`. La liste est imbriquée dans le `ScrollView` de
`UserProfileSheet` : son `LazyVStack` perd sa paresse et **construit** tout ce
qu'il place — c'est exactement le pic de travail synchrone que la fenêtre
existe pour éviter.
→ `scheduleReveal()`, point d'entrée unique dont le drapeau est posé de façon
synchrone : une salve de déclencheurs = une progression.

### 3. Vues dérivées recalculées à chaque évaluation de body — CORRIGÉ
`filteredPosts` / `visiblePosts` / `reels` / `postsCounts` étaient des
propriétés calculées. `filteredPosts` copie jusqu'à 100 `FeedPost` (chacun
portant médias, commentaires, traductions), et `visiblePosts` était relu à
chaque body **et** à chaque `onAppear` de carte.
→ Mémoïsées, recalculées une fois quand leurs entrées changent.
`ProfilePostsCounts.compute` passe de trois `filter().count` (trois tableaux
alloués pour n'en lire que la taille) à trois `reduce`.

### 4. Changement de filtre sans remise à zéro de la fenêtre — CORRIGÉ
Passer de « tout » (fenêtre étendue) à « Réels » construisait d'un coup tous les
réels connus. → `filter.didSet` remet `renderWindow` à sa taille initiale.

### 5. Compteurs jamais réconciliés avec le serveur — CORRIGÉ
Le listing ne s'abonnait qu'à `post:translation-updated`. Un like reçu, un
commentaire posté depuis la feuille hoistée, une suppression ou une édition
faite ailleurs ne touchaient **jamais** les cartes : seul l'optimisme local
bougeait, par-dessus une base serveur figée au fetch. Le cache, lui, était déjà
réconcilié (`CacheCoordinator.subscribeToPostEngagement`) — l'écart ne portait
que sur l'exemplaire en mémoire, donc il se voyait tant que la vue restait
ouverte et disparaissait à la réouverture : la signature exacte d'un
« compteur qui ne se synchronise pas ».
→ Sinks `post:liked`/`unliked`, `comment:added`/`deleted`, `post:reposted`,
`post:bookmarked`, `post:updated`/`deleted`, plus `feed:subscribe` (un profil
ouvert hors du feed n'était dans aucune room qui reçoive ces événements).

Règle appliquée : le total **absolu** du serveur devient la base ET l'override
optimiste correspondant est levé. Le garder ferait dériver l'affichage de ±1,
`adjusted()` le réappliquant par-dessus un total qui inclut déjà l'action.
`post:reposted` ne portant qu'un delta, son incrément est gardé par
`appliedRepostIds` contre une re-livraison.

### 6. Édition / suppression perdues au retour du cache — CORRIGÉ
`updatePost` et `deletePost` ne touchaient que la mémoire. `post:updated` n'est
pas réconcilié côté cache : rouvrir le profil resservait l'ancien texte, et une
carte supprimée reparaissait (service cache-first).
→ `patchEverywhere` / `removeEverywhere` (fraîcheur SWR préservée : ce sont des
mutations locales, pas des fetchs).

### 7. Filtre sans résultat = écran vide muet — CORRIGÉ
Tuile « Réels » sur un profil sans réel : un bandeau surmontant du vide,
indiscernable d'un chargement bloqué. → `EmptyStateView` dédié, muet tant que
`hasMore` (la sentinelle porte déjà l'indicateur de chargement).

## Laissé en l'état (délibéré)

- **« Citer » ouvre le détail au lieu du composeur.** `FeedComposerSheet` exige
  un `FeedViewModel` ; le brancher ici imposerait soit d'en instancier un, soit
  de refactorer le composeur — une évolution produit, pas un correctif de revue.
  Le détail expose l'action de citation.
- **`pinPost` sans effet local** : parité exacte avec `FeedViewModel.pinPost`
  (toast seul, `isPinned` n'existe pas sur `FeedPost`).
- **Pas de pull-to-refresh** : le `ScrollView` parent possède le défilement
  (déjà documenté dans l'en-tête du fichier).

## Vérification

`meeshy.sh test` n'a pas pu être exécuté : la session tourne sur un conteneur
Linux, sans chaîne d'outils Swift ni simulateur. Les suites ajoutées
(`ProfileUserPostsRealtimeSyncTests`, `ProfileUserPostsRenderWindowTests`) et
les suites existantes (`ProfileUserPostsViewModelTests`, `ProfilePostsCountsTests`,
`ProfileActionBarWiringGuardTests`, `LocalizationCatalogGuardTests`) doivent être
passées avant merge. Les trois nouvelles clés de chaînes sont livrées dans les
sept langues du catalogue.
