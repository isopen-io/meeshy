# Story Editor + Reader — Petites touches (SANS refonte) + Reposts + Refactor canvas

> Plan issu de 2 workflows de cartographie (wx0sehd91 = éditeur/reader ; wt0lf2vqs = repost/refactor).
> Vérité architecturale : **canvas live + reader + export MP4 partagent DÉJÀ un seul renderer** (`StoryCanvasUIView.rebuildLayers → StoryRenderer.render`). Le **fork** qui casse les proportions est uniquement dans le chemin **snapshot/cover** (`StorySlideRenderer` en CoreGraphics).
> Contraintes : aucune refonte · jamais retirer d'effet · source de vérité unique · moteur audio unique call-safe (pas de double-start) · stories RAW Prisme · sanitize file:// · vérif simu 18.2 via meeshy.sh.

## Décisions produit RÉSOLUES (2026-06-30)
- [x] D1 — **Feed muet, son dans les détails** → WS4.RF4 ABANDONNÉ ; reposts Feed = autoplay muet
- [x] D2 — **Autoplay vidéo à l'ouverture des détails (global)** → WS3.7 : flag opt-in `autoplayOnAppear` sur `_InlineRenderer`, activé aux call sites détails (avec son)
- [x] D3 — **Garder en pause (parité IG)** → WS3.6 ABANDONNÉ

## Ordre d'implémentation (séquentiel — builds iOS non parallélisables)
WS1 (proportions) → WS5 (structure/Prisme) → WS3 (autoplay, +WS3.7) → WS4 (reposts RF1/RF2/RF3) → WS2 (effets immédiats) → WS6 (refactor, EN DERNIER)

## WS1 — Proportions snapshot/preview (req 2) [HIGH] ✅ VERT (test 18.2 : 21+5 tests, 0 fail)
- [x] WS1.1 `StorySlideRenderer.drawMediaObject` → `baseMediaDesignSize(aspectRatio:)×scale` projeté (SSOT)
- [x] WS1.2 `StorySlideRenderer` fond legacy+moderne → `drawAspectFill` clippé (parité reader)
- [x] WS1.3 `StorySlideRenderer` : cadre média (bord 2px blanc gaté ≥24pt + corner radius 0.06)
- [x] WS1.4 `StoryMediaLayer.layoutSublayers()` (nonisolated) : sync `avPlayerLayer.frame`+cornerRadius
- [x] WS1.5 `toRenderableSlide` : hydrater `aspectRatio` legacy depuis `FeedMedia.width/height` (+2 tests)

## WS2 — Effets immédiats dans le canvas (req 1) [MEDIUM, SDK] ⏳ EN COURS (suivant dans l'ordre)
- [~] WS2.1 Glass backdrop per-frame en édition (fond vidéo) : `editTick` re-feed throttlé ~18fps (`StoryEditBackdropThrottle`), gaté `mode==.edit && case .video`, re-capture `backdropCapture` (mêmes geometry/currentTime que rebuildLayers) + re-feed `StoryTextLayer` glass en place, SANS `rebuildLayers()`. ✅ compile + unit-test (6) + régression canvas (6) vert 18.2. ⚠️ RESTE smoke device : confirmer que le `CARenderer` de `StoryBackdropCapture` capture la frame VIDÉO live (sinon backdrop reste statique = inerte, pas de régression)
- [x] WS2.2 `filterAppliesToEntireSlide` inerte → RETIRÉ (code mort : déclaré protocole/concret/mock, lu nulle part en prod, seulement round-trip dans un test de conformance). Supprimé des 4 sites ; build vert + conformance 3/3 sur 18.2
- [ ] WS2.3 (opt) bake filtre intensité hors main-thread
- [ ] WS2.4 (opt) ⚠️ PRÉMISSE À RÉVISER : `StoryFilteredLayer` n'est PAS un orphelin propre. Seule l'instance CALayer (render/présentation) est morte ; la machinerie STATIQUE est VIVANTE — `preheatAllPipelines()` appelé par `AppDelegate:49` (+ asserté par `AppInitWireupTests`), `Kind(storyFilter:)` utilisé par `StorySlideRenderer:162`, couvert par `StoryFilteredLayer_WarmUpTests`. `rm` = régression. Vrai travail = EXTRAIRE preheat+`Kind`+cache pipeline dans un type non-layer, puis retirer l'instance orpheline. Non fait (pas un quick-win)

## WS3 — Autoplay audio+vidéo à l'ouverture, tout call site (req 3) [HIGH, app+SDK] ✅ COMMITTÉ `6429f0d0b`
- [x] WS3.1 Reels AUDIO autostart : `ReelPageView.startActiveAudioIfNeeded()` ~ `ReelVideoView.drive()` + gate `shouldStartActiveMedia` (onAppear + change isActive + change revealCompleted)
- [x] WS3.2 `StoryCanvasUIView.startAudioPlayback()` : `guard !MediaSessionCoordinator.shared.isCallActive`
- [x] WS3.3 Unifier démarrage vidéo fg sur `alignToTimelineThenPlay` (drop raw play())
- [x] WS3.4 Waveform/karaoké reader piloté par `ReaderAudioMixer.clipElapsedSeconds` (clock unique)
- [ ] WS3.5 Documenter contrat `StoryReaderPrefetcher.activate(.play)` (doc — non vérifié)
- [x] ~~WS3.6 (D3) Notif commentaires/réactions~~ → ABANDONNÉ (garder pause IG)
- [x] WS3.7 (D2) Flag opt-in `autoplayOnAppear` sur `MeeshyVideoPlayer(.inline)`/`_InlineRenderer` ; activé aux call sites DÉTAILS (PostDetailView own + repost vidéo) avec son ; Feed reste tap/muet

## WS4 — Reposts média + son (req 4) [app, corrigé par la critique] ✅ COMMITTÉ `5f66730f2` + vert 18.2 (27/27)
- [x] WS4.RF1 `FeedPostCard.repostView` : afficher `repost.media` (helpers own-media), gaté `!isEmpty`, tap → POST ORIGINAL — `repostMediaPreviewModel`/`repostTapTargetId` testés
- [x] WS4.RF2 `ReelRepostEmbedCell` : réel inline via `ReelFeedVideoSurface` (moteur unique, muet) — **élection par identité de CELLULE** (`reelCellId = post.id`), poster fallback ; `ReelRepostEmbedContainer` + `.equatable()` ; vérifié single-surface
- [x] WS4.RF3 `PostDetailView` story-repost : `mute:false`+`isPaused` via `storyCanvasContainer` partagé (suivi visibilité câblé sur les 2 chemins) ; `StoryDetailPlaybackPolicy` partagé
  - [x] WS4.RF3-fix (review #1) : `StoryCanvasUIView.startAudioPlayback()` → `guard !isPlaybackPaused` (ferme la fuite audio hors-écran sur ré-entrée async, pré-existante héritée du chemin natif) + test `CanvasAudioLifecycleTests`
- [x] ~~WS4.RF4 (D1) Son Feed~~ → ABANDONNÉ (Feed reste muet)

## WS5 — Structure story / Prisme (req 1 structure) [HIGH, SDK+app] ✅ COMMITTÉ `5513bc4a8` (sauf 5.4)
- [x] WS5.1 Persister `originalLanguage` dans publish offline/queue (champ optionnel + threading + migrator + bootstrap)
- [x] WS5.2 Payload Timeline publish = `[StorySlide]` (pas `TimelineProject`) → match unique décodeur
- [x] WS5.3 Préserver type vidéo dans converters offline (sniff extension)
- [~] WS5.4 fond legacy — SPLIT en 2 :
  - [x] **(a) SAFE** `StoryRenderer.renderBackground` : le fond legacy `slide.mediaURL` routait `slide.id` (clé non-média que le resolver `mediaList.first{ $0.id==postId }` ne matche jamais) → fond blanc/noir. Fix : router l'URL directe via `postMediaId` (résolue par `directURLIfAny` file://+http(s)://), miroir de la branche image `isBackground`. +2 tests SDK (`test_renderBackground_legacyMediaURL_routesDirectURLNotSlideID`, `_noMediaNoHex_fallsBackToSolidBlack`).
  - [ ] **(b) DEFERRED** `toRenderableSlide` : promouvoir `media[0]` non-flaggé en bg statique quand `resolvedBackgroundMedia == nil` — ⚠️ cas produit-ambigu, cassait en NOIR (revert `b39a4c15f`) ; nécessite une règle produit pour ne pas masquer le fallback couleur unie.

## WS6 — Refactor < 1000 LOC (req 5) [MEDIUM, SDK, mécanique behavior-preserving]
Cible : Canvas 3771→~700 · ComposerView 2566→~700 · ComposerVM 1788→~620. 26 fichiers (extensions même-type).
- [x] WS6.0 `d9245bc71` access-control private→internal (3 cibles) ; `mode`→`public internal(set)` ; `nonisolated(unsafe)` + registre préservés
- [x] WS6.1 `6ac32b19d` types libres : StoryCanvasNotifications, CanvasManipulationLayer, ThreeFingerPinch (Canvas) ; StoryComposerSupportTypes, StoryComposerChildViews (View). SPM auto-glob → 0 modif pbxproj
- [x] WS6.2 `ff2428486` VM **1795→214** : types libres (ToolModes, CanvasElement, MediaAsset, StoryComposerProviding, ArraySafeAccess) + +Elements/+Slides/+ZOrder/+Timeline/+Lifecycle/+Repost. Stored props/init/deinit/nested types restés
- [x] WS6.3 Canvas **3712→657** : +Core/+Rendering/+Audio/+ContentReadiness/+Lifecycle/+Playback/+Gestures/+Manipulation/+Accessibility + +ContextMenu + +PointerAndDelegates (`a71e200a4`)
- [x] WS6.4 View **2566→233** : +Canvas/+TopBar/+SlideStrip/+SyncRestore/+Media/+Publication (body/init/stored state restés) (`7c7e0e0b3`)
- [x] WS6.5 `ab141d920` docs relocalisés vers extensions + MARK orphelins retirés ; **clean build à froid SUCCEEDED** ; suite **4542 tests / 0 échec** ; diff pur vérifié (209 méthodes conservées, 0 ligne code ajoutée aux principaux)

## Vérification
- `meeshy.sh build` → grep `BUILD SUCCEEDED` · `xcodebuild test -scheme MeeshySDK-Package` 18.2 → xcresult · parité rendu pixel · smoke device audio/vidéo

## Review (post-impl)
**WS6 COMPLET** (branche `feat/story-ws6-refactor`, worktree isolé depuis `c8063196a`). Refactor mécanique behavior-preserving, 7 commits (WS6.0→6.5), 23 nouveaux fichiers d'extension. Cibles atteintes : Canvas 3712→657, VM 1795→214, ComposerView 2566→233. Méthode : cartographie par subagent (props stockées/init/deinit/types imbriqués = STAY ; méthodes/computed = MOVE bucketées) → extraction par script Python (indices d'origine, tri+validation non-chevauchement) → build incrémental vert par lot → cleanup orphelins → clean build à froid + suite complète. Aucune modif pbxproj (cible SPM MeeshyUI auto-glob). Reste : décision d'intégration (merge main / PR).
