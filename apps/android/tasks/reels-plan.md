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
- [ ] **P4 — nav + lancement** : route `reels` (+ `reels?seed=`) dans MeeshyApp/NavHost ;
      lancement depuis le Feed (tap carte réel / long-press) ; overlay plein écran.
- [ ] **P5 — intégration Feed** : les réels apparaissent dans le Feed (carte réel cliquable
      qui ouvre l'overlay Réels au bon seed) — « les deux » (écran dédié + dans le Feed).
- [ ] **P6 — boutons flottants « comme iOS »** : aligner le menu radial + le lancement
      Réels (long-press bouton Feed du menu radial) + actions de création (story/post/réel)
      telles qu'iOS les expose (RootView + RootViewComponents).

## Méthodo
Build `JAVA_HOME=/opt/homebrew/opt/openjdk@21/... ; ./apps/android/meeshy.sh build` (grep le
log, exit0 trompeur). Émulateur A/B `-gpu host` SANS `-dns-server`. Commits sélectifs sur
main, sans push, pathspec STRICT (WIP concurrent gateway/iOS présent — ne jamais committer).
Nav radial = FAB (964,2222)→expand→item. Détail parité + creds en mémoire
`project_android_ios_visual_parity_2026_07_06`.
