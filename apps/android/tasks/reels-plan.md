# Réels Android — plan de portage (parité iOS)

Feature neuve côté Android (0 infra au départ). Backend : `GET /posts/feed/reels`
(thread vidéo vertical ; `?seed=<reelId>` = thread d'affinité depuis un réel touché
dans le Feed). Un réel = un `Post` (`type = "reel"`) avec média vidéo. Réf iOS :
`apps/ios/Meeshy/Features/Main/Views/{ReelsPlayerView,ReelFeedCard,ReelFeedVideoSurface,
ReelFeedAutoplayCoordinator,ReelFeedLayout}.swift`, `ViewModels/ReelsViewModel.swift`,
`ReelsPresenter`.

## Phases (chaque phase = build vert + commit + A/B vs iOS quand visuel)

- [x] **P1 — API + repo** : `PostApi.getReels(seed,cursor,limit)` + `PostRepository.getReels`. (fait)
- [x] **P2 — dépendance vidéo + lecteur atome** : Media3 1.4.1 (`media3-exoplayer` +
      `media3-ui`) au catalog + `:sdk-ui`. Atome `me.meeshy.ui.component.video.ReelVideoSurface`
      (AndroidView+PlayerView+ExoPlayer, loop+muted+RESIZE_MODE_ZOOM, play si `isActive`,
      release au dispose ; params opaques URL+isActive). (fait)
- [x] **P3 — écran Réels** : module `:feature:reels` (settings + app deps) + `ReelPresentation`
      /`ReelBuilder` (Post type=reel → vidéo via 1er média video/*, URL résolue vs config
      .socketUrl) + `ReelsViewModel(getReels seed)` + `ReelsScreen` = `VerticalPager` plein
      écran fond noir, chaque page = `ReelVideoSurface(isActive = page==currentPage)` +
      overlay (avatar/nom/légende bas-gauche, actions like/comment/repost/share colonne
      droite, bouton fermer). ReelVideoSurface passé en `@OptIn(UnstableApi)` interne (API
      stable pour l'appelant, feature/reels ne dépend pas de media3). (fait)
- [x] **P4 — nav + lancement (code ; A/B vidéo DIFFÉRÉ)** : `Routes.REELS="reels?seed={seed}"`
      + `reels(seed)` + composable → `ReelsScreen`. Feed `onPostClick` → `reels(seed=postId)`.
      Item radial « Réels » (PlayCircle/Error) → `reels()`. Build vert. **A/B VIDÉO VÉRIFIÉ ✅** (après reboot AVD) : la vidéo JOUE plein écran cropée
      (RESIZE_MODE_ZOOM), le swipe vertical change de réel (chaque page joue sa vidéo,
      poster→lecture), overlay auteur/légende/actions OK. = parité iOS ReelsPlayerView.
- [x] **P5 — intégration Feed (code ; A/B différé)** : `FeedPostPresentation.isReel` (post.type
      ==reel) ; bandeau réel (PlayCircle indigo + « Réel ») sur les cartes reel ; tap sur un
      reel → overlay Réels au seed (onClick gaté : non-reels inertes, pas de détail post).
      Build+tests verts. A/B différé (émulateur wedgé). string feed_reel ×4.
- [x] **P6 — boutons flottants « comme iOS »** : lecture RootView iOS — le `menuLadder` est
      un menu de NAVIGATION (Liens/Notifications/Contacts/Découvrir/Communautés/Réglages),
      PAS d'actions de création (la story se crée via le « + » du story tray, présent côté
      Android). Le radial Android couvre déjà la nav ; ajouté **Contacts** (People/PinnedBlue
      → Routes.CONTACTS). Radial = New/Messages/Feed/Réels/Calls/Activity/Contacts/Profile (8
      items lisibles). A/B vérifié. (Liens/Communautés/Découvrir-séparé = écrans absents
      Android, hors scope.) FEATURE RÉELS + BOUTONS FLOTTANTS COMPLETS.

## Méthodo
Build `JAVA_HOME=/opt/homebrew/opt/openjdk@21/... ; ./apps/android/meeshy.sh build` (grep le
log, exit0 trompeur). Émulateur A/B `-gpu host` SANS `-dns-server`. Commits sélectifs sur
main, sans push, pathspec STRICT (WIP concurrent gateway/iOS présent — ne jamais committer).
Nav radial = FAB (964,2222)→expand→item. Détail parité + creds en mémoire
`project_android_ios_visual_parity_2026_07_06`.
