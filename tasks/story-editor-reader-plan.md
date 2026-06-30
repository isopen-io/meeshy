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

## WS2 — Effets immédiats dans le canvas (req 1) [MEDIUM, SDK]
- [ ] WS2.1 Glass backdrop per-frame en édition (fond vidéo) : `editTick` (no-op), gaté+throttlé ~15-20fps, re-feed `setBackdropTexture` sans full rebuild
- [ ] WS2.2 `filterAppliesToEntireSlide` inerte : câbler OU retirer (défaut : retirer le code mort)
- [ ] WS2.3 (opt) bake filtre intensité hors main-thread ; WS2.4 (opt) retirer Metal orphelin `StoryFilteredLayer`

## WS3 — Autoplay audio+vidéo à l'ouverture, tout call site (req 3) [HIGH, app+SDK]
- [ ] WS3.1 Reels AUDIO autostart : `ReelPageView.startActiveAudioIfNeeded()` ~ `ReelVideoView.drive()` + gate `shouldStartActiveMedia` (onAppear + change isActive + change revealCompleted)
- [ ] WS3.2 `StoryCanvasUIView.startAudioPlayback()` : `guard !MediaSessionCoordinator.shared.isCallActive`
- [ ] WS3.3 Unifier démarrage vidéo fg sur `alignToTimelineThenPlay` (drop raw play())
- [ ] WS3.4 Waveform/karaoké reader piloté par `ReaderAudioMixer.clipElapsedSeconds` (clock unique)
- [ ] WS3.5 Documenter contrat `StoryReaderPrefetcher.activate(.play)`
- [x] ~~WS3.6 (D3) Notif commentaires/réactions~~ → ABANDONNÉ (garder pause IG)
- [ ] WS3.7 (D2) Flag opt-in `autoplayOnAppear` sur `MeeshyVideoPlayer(.inline)`/`_InlineRenderer` ; activé aux call sites DÉTAILS (PostDetailView own + repost vidéo) avec son ; Feed reste tap/muet

## WS4 — Reposts média + son (req 4) [app, corrigé par la critique]
- [ ] WS4.RF1 `FeedPostCard.repostView` : afficher `repost.media` (helpers own-media), gaté `!isEmpty`, tap → POST ORIGINAL
- [ ] WS4.RF2 `ReelRepostEmbedCell` : réel inline via `ReelFeedVideoSurface` (moteur unique, muet) — **élection par identité de CELLULE**, poster fallback
- [ ] WS4.RF3 `PostDetailView` story-repost : `mute:false`+`isPaused` **ET câbler suivi visibilité** sur canvas repost (fuite audio hors-écran = défaut critique #1) ; `StoryDetailPlaybackPolicy` partagé
- [x] ~~WS4.RF4 (D1) Son Feed~~ → ABANDONNÉ (Feed reste muet)

## WS5 — Structure story / Prisme (req 1 structure) [HIGH, SDK+app]
- [ ] WS5.1 Persister `originalLanguage` dans publish offline/queue (champ optionnel + threading + migrator + bootstrap)
- [ ] WS5.2 Payload Timeline publish = `[StorySlide]` (pas `TimelineProject`) → match unique décodeur
- [ ] WS5.3 Préserver type vidéo dans converters offline (sniff extension)
- [ ] WS5.4 `toRenderableSlide` : garder bg statique quand `effects.resolvedBackgroundMedia == nil`

## WS6 — Refactor < 1000 LOC (req 5) [MEDIUM, SDK, mécanique behavior-preserving]
Cible : Canvas 3771→~700 · ComposerView 2566→~700 · ComposerVM 1788→~620. 26 fichiers (extensions même-type).
- [ ] WS6.0 **Commit access-control AVANT déplacement** : private→internal cross-fichier + critique : `registerAsActiveAndPreemptOthers`/`unregisterFromActive`/`activePlayingCanvases`, préserver `nonisolated(unsafe)`, `mode` en `internal(set)`
- [ ] WS6.1 Types libres : StoryCanvasNotifications, ThreeFingerPinch, ComposerSupportTypes, ComposerChildViews, ComposerProviding, Array helper
- [ ] WS6.2 ViewModel : +Repost,+Lifecycle,+Slides,+ZOrder,+Elements,+Timeline → tests SDK
- [ ] WS6.3 Canvas : +ContextMenu,+PointerAndDelegates (cut/paste) ; +Accessibility,+Core,+Audio,+Rendering,+ContentReadiness,+Lifecycle,+Playback,+Gestures,+Manipulation (parité rendu avant/après)
- [ ] WS6.4 View en DERNIER : +TopBar,+SlideStrip,+SyncRestore,+Media,+Publication,+Canvas (garder body/sheetModifiers primaire)
- [ ] WS6.5 Clean build + smoke + `git diff` = déplacement pur + élargissements d'accès

## Vérification
- `meeshy.sh build` → grep `BUILD SUCCEEDED` · `xcodebuild test -scheme MeeshySDK-Package` 18.2 → xcresult · parité rendu pixel · smoke device audio/vidéo

## Review (post-impl)
