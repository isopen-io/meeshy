# Cartes Réel dans le feed iOS — Design

**Date :** 2026-06-14
**Plateforme :** iOS (`apps/ios/`, SDK `packages/MeeshySDK/`)
**Statut :** Design approuvé, prêt pour planification d'implémentation

## Objectif

Dans le listing du feed, les Réels ne doivent plus être des cartes texte avec un tag « Réel ». Ils deviennent des **cartes plein-cadre** : le contenu média (image / vidéo / audio) remplit toute la carte, les informations (auteur + boutons d'interaction) sont en **overlay** par-dessus, avec le **logo Réel au coin supérieur droit, sans texte**. Les Réels vidéo/audio **jouent automatiquement, en muet**, quand ils sont le plus centrés dans le viewport ; ils s'arrêtent en sortant du centre / du viewport. Un **tap sur le contenu** ouvre le viewer plein écran (avec la révélation liquide existante) où le son et les contrôleurs vivent.

## État actuel (existant)

- Feed : `apps/ios/Meeshy/Features/Main/Views/FeedView.swift` → `LazyVStack` → `feedPostCardView(for:)` → `FeedPostCard`.
- Tag « Réel » : `FeedPostCard.swift:79-94` (`reelBadge`) affiché en `:292-294`. **À retirer.**
- Média dans la carte : `FeedPostCard+Media.swift` (`imageMediaView`, `videoMediaView`, `audioMediaView`).
- Boutons d'interaction : `FeedPostCard.swift:612-762` (`actionsBar` — like, comment, repost, bookmark, share).
- Viewer plein écran : `ReelsPresenter.shared.present(posts:startId:)` → `ReelsPlayerView` ; transition de révélation liquide existante via `ReelsRevealContainer` + `LiquidRevealShape` (`RootView.swift:297-317`). Tap sur un réel route déjà vers le viewer (`FeedView.swift:677-692`).
- Moteur lecture vidéo unique : `SharedAVPlayerManager` ; résolution disponibilité : `VideoAvailabilityResolver` (cascade cache → downloader → policy).
- Modèle : `FeedPost` (SDK `FeedModels.swift`) — `isReel`, `primaryReelMedia` (vidéo > audio > image), `media: [FeedMedia]` (avec `width`, `height`, `duration`, `thumbHash`, `accentColor` via `authorColor`/génération), compteurs (`likes`, `commentCount`, `repostCount`, `bookmarkCount`, `shareCount`), états (`isLiked`, `isBookmarkedByMe`, `isRepostedByMe`).
- **Pas** d'autoplay au centre du viewport dans le feed (à construire). L'autoplay existant (`ReelVideoView.isActive`) ne concerne que le pager plein écran.

## Design

### 1. Routage — carte séparée

Dans `FeedView`, là où `feedPostCardView(for:)` rend une carte : si `post.isReel` → **`ReelFeedCard`** ; sinon `FeedPostCard` inchangé. `reelBadge` est supprimé de `FeedPostCard` (lignes 79-94 + 292-294).

### 2. `ReelFeedCard` (nouveau, app-side)

`apps/ios/Meeshy/Features/Main/Views/ReelFeedCard.swift`. Vue feuille, inputs primitifs (pas d'`@ObservedObject` sur singletons globaux ; reçoit `accentHex`, `isDark`, etc. en `let`), conforme au pattern « Zero Unnecessary Re-render ».

**Layout :**
- Largeur = largeur de contenu du feed (même gabarit que `FeedPostCard`).
- Hauteur = `largeur × clamp(mediaH/mediaW, minRatio, 1.25)` — **plafond 4:5** (`1.25`). Vidéo 9:16 (`h/w ≈ 1.78`) → plafonnée à `1.25` → ~420pt à largeur ~336pt. `minRatio` ≈ `0.75` (4:3) pour qu'un paysage ne soit pas trop plat. Le calcul vit dans une **fonction pure testable** `reelCardHeight(mediaWidth:mediaHeight:cardWidth:) -> CGFloat` (audio / dimensions absentes → ratio par défaut 4:5).
- Média en **fond, aspect-fill** (`scaledToFill` + `clipped`, coins arrondis) — couvre toute la carte (le 9:16 est recadré dans le 4:5).
- **Overlay bas** : scrim dégradé (noir→clair, bas vers haut) pour lisibilité, contenant : détails auteur (avatar + nom, zone tappable → profil/auteur), légende optionnelle (1-2 lignes), puis la **ligne de boutons** cœur / commentaire / repartager / sauvegarder / partager. La logique des boutons réutilise celle de `FeedPostCard.actionsBar` (extraction d'un composant partagé `PostActionsRow` si nécessaire, sinon réimplémentation fine appelant les mêmes callbacks `onLike`/`onBookmark`/`onShare`/`showComments`/`showRepost`).
- **Logo Réel** : petite icône (`play.rectangle.on.rectangle.fill` ou glyphe réel) sur material léger, **coin haut-droit, sans texte**.
- **Réel audio** : fond = dégradé `accentColor` + **waveform animé** quand actif (composant `ReelAudioBackdrop`) ; pas de lecture sonore dans le feed.

**Interaction :**
- Tap sur la **zone média** (hors boutons/auteur) → `ReelsPresenter.shared.present(posts:startId:)` (révélation liquide existante).
- Boutons + auteur tappables indépendamment (ne déclenchent pas l'ouverture du viewer).
- **Aucun contrôleur de lecture** sur la carte (pas de play/pause/scrub) — ils vivent dans le viewer.

### 3. Autoplay au centre du viewport — `ReelFeedAutoplayCoordinator`

`apps/ios/Meeshy/Features/Main/...` (app-side : encode une décision UX produit « quel réel joue »). `@MainActor`, observable.

**Mécanique (iOS 16-compatible, pas d'API scroll iOS 17) :**
- Chaque `ReelFeedCard` publie sa frame via `GeometryReader` + `PreferenceKey` (`ReelVisibilityPreferenceKey : [ReelFrame(id, frameInGlobalSpace, mediaKind)]`).
- Au niveau de `FeedView`, un handler (réagissant via `adaptiveOnChange` — jamais `.onChange` brut, cf. cible iOS 16) reçoit l'agrégat des frames + la frame globale du viewport (depuis le `GeometryReader` du conteneur scroll).
- Une **fonction pure testable** `mostCenteredReel(frames:, viewport:) -> String?` élit l'id du réel dont le centre est le plus proche du centre du viewport ET dont la fraction visible ≥ seuil (~0.6). Recalcul **throttlé** (coalescing court) pour éviter le churn au scroll.
- Le coordinateur expose `activeReelId`. Chaque carte compare `coordinator.activeReelId == post.id` pour piloter sa lecture.

**Lecture :**
- Réel **vidéo** actif : résout l'URL via `VideoAvailabilityResolver`, charge/joue via le **`SharedAVPlayerManager` unique** avec `isMuted = true`. Les cartes non-actives mettent en pause / libèrent. Un seul moteur ⇒ un seul réel joue.
- Réel **audio** actif : anime seulement la waveform (pas de son, pas de moteur dans le feed).
- **Call-aware** : si un appel est actif (coordinateur média/appel existant), l'autoplay est suspendu. Reprise à la fin de l'appel.
- Quitter le viewport / cesser d'être le plus centré → pause immédiate.

### 4. Tap → viewer plein écran

Réutilise `ReelsPresenter.shared.present(posts: viewModel.posts, startId: post.id)` et la révélation liquide existante. Le viewer gère le son (démarrage au tap), les contrôleurs (scrub), et le thread d'affinité (`getReels`/`seedReelId`). Le moteur vidéo du feed est mis en pause à l'ouverture du viewer (handoff vers le moteur du viewer — même `SharedAVPlayerManager`).

## Unités & responsabilités (isolation)

| Unité | Rôle | Dépendances | Testable |
|---|---|---|---|
| `reelCardHeight(...)` | Hauteur carte depuis ratio média, plafond 4:5 | aucune (pure) | ✅ unitaire |
| `mostCenteredReel(...)` | Élit le réel le plus centré visible | aucune (pure) | ✅ unitaire |
| `ReelFeedCard` | Rendu carte plein-cadre + overlays | `FeedPost`, callbacks, coordinator (id actif) | smoke |
| `ReelFeedAutoplayCoordinator` | État `activeReelId`, throttle, call-aware | `SharedAVPlayerManager`, call coordinator | unitaire (logique) |
| `ReelAudioBackdrop` | Dégradé accentColor + waveform | `accentHex`, `isActive` | smoke |

## Tests

- TDD sur les 2 fonctions pures (`reelCardHeight`, `mostCenteredReel`) — cas : 9:16 plafonné, paysage, carré, dimensions absentes (audio), choix du plus centré, seuil de visibilité.
- Coordinateur : transitions d'`activeReelId` selon les frames simulées + suppression pendant appel.
- `./apps/ios/meeshy.sh build` + `./apps/ios/meeshy.sh test` verts avant commit.

## Réutilisation / nouveau

**Réutilise :** `SharedAVPlayerManager`, `VideoAvailabilityResolver`, `FeedPost.primaryReelMedia`, `actionsBar` (callbacks like/comment/repost/bookmark/share), `ReelsPresenter` + révélation liquide, `accentColor`/génération couleur, coordinateur d'appel existant.
**Nouveau :** `ReelFeedCard`, `ReelFeedAutoplayCoordinator`, `ReelAudioBackdrop`, `reelCardHeight`, `mostCenteredReel`, `ReelVisibilityPreferenceKey`.

## Hors périmètre (YAGNI)

- Web (`apps/web`) — iOS uniquement pour cette itération.
- Bouton mute/unmute sur la carte (autoplay toujours muet ; son dans le viewer). À considérer plus tard si besoin.
- Préchargement agressif multi-réels / ranking d'attention (séparé, monétisation).
- Changement du viewer plein écran existant (hors le handoff de lecture).
