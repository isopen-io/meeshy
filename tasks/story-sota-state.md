# Story SOTA — État d'analyse & backlog vivant (édition + lecture local-first)

> **CE FICHIER EST LA SOURCE DE VÉRITÉ DE L'ITÉRATION.** L'agent DOIT le lire en entier avant
> toute action, et le METTRE À JOUR à la fin de chaque itération (item → DONE avec preuve,
> nouveaux findings → backlog). Analyse initiale : 2026-07-03 (5 agents d'exploration parallèles,
> citations code vérifiées à cette date — re-vérifier les lignes avant de fixer, le code bouge).

## 0. Mission produit (non négociable)

1. **Édition crash-safe** : on revient dans le composer et on retrouve la story en cours
   d'édition, même après un CRASH DUR (pas seulement un passage en background).
2. **Lecture instantanée depuis N'IMPORTE QUEL point d'entrée** (tray, profil, deep link,
   notification, repost embed) : jamais de spinner plein écran si un rendu partiel est possible.
3. **Relecture offline** : une story déjà chargée se relit sans réseau, garanti.
4. **Progression = disponibilité des données** : la barre de progression n'avance JAMAIS sur du
   contenu non disponible (vidéo ET audio) ; elle gèle pendant le buffering avec un indicateur
   discret, et reprend en phase.
5. **SOTA UI/UX** : exploiter le design system de chaque version d'iOS (16 → 26) au maximum,
   sans jamais retirer d'effet visuel existant (règle user ferme).
6. **Création DISCRÈTE et gesture-first (directive user 2026-07-04, relance de la boucle)** :
   le composer n'affiche QUE ce qui est utile à l'instant t. Chaque tool/écran/contenu doit
   pouvoir apparaître ET disparaître par un GESTE simple et cohérent (pas seulement des
   boutons) ; passer d'un outil à l'autre = gestuelle fluide. Tous les tools doivent être
   FONCTIONNELS (audit exhaustif requis — série d'items `C*` au §3). Moderniser le processus
   de création sans violer l'invariant n°4 (ne jamais retirer d'effet visuel).

## 1. Architecture — fichiers pivots (carte vérifiée)

### Lecture (iOS)
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderTimerController.swift` — timer
  gated CADisplayLink : n'avance que si `isActive && !isPaused && !isPlaybackStalled` ; gel
  UI (`setPaused`) et gel buffer (`setPlaybackStalled`) indépendants ; reprise sans saut.
- `.../Canvas/StoryCanvasUIView+ContentReadiness.swift` — `markContentReady` par slide :
  image = KVO contents, vidéo = `AVPlayerLayer.isReadyForDisplay`, failsafe 2 s.
- `.../Canvas/StoryCanvasUIView+Playback.swift` — `refreshPlaybackHealth` sonde
  `primaryMediaPlayer()?.timeControlStatus` (vidéo BG sinon 1ʳᵉ vidéo FG) + watchdog →
  `onPlaybackProgressing`.
- `.../Canvas/StoryPlaybackHealth.swift` — rule engine pur du stall.
- `.../Canvas/StoryReaderPrefetcher.swift` — fenêtre glissante de canvas `[N-1…N+2]` en `.edit`.
- `.../Story/StoryReaderRepresentable.swift` — wrapper UIKit ; resolver `postMediaId → URL`.
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView*.swift` — viewer plein écran (carte
  arrondie ↔ plein écran, `StoryCanvasFraming`), câblage timer/prefetch/markViewed.
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerContainer.swift` — hub d'entrée : groupe en
  cache → rendu immédiat ; sinon `loadStories(forceNetwork:true)` BLOQUANT + spinner (lacune R4).
- `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift` — `loadStories` cache-first
  SWR (`CacheCoordinator.stories`, clé unique `recent_tray_v2`), prefetch (`prefetchAllStoryMedia`
  8 groupes), markViewed optimiste, sinks realtime, publish (voir Édition).
- `.../MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift` + `StoryMediaLayer.swift` —
  résolution média : `file://` direct → disk-hit cache → stream distant + peuplement
  `Task.detached(.utility)` best-effort.

### Édition (iOS)
- `packages/MeeshySDK/Sources/MeeshySDK/Store/StoryDraftStore.swift` — draft GRDB SQLite dédié
  (`Documents/meeshy_story_draft.db` + `meeshy_draft_media/`), draft UNIQUE, détection médias
  perdus (`lostElementIds`).
- `.../MeeshyUI/Story/StoryComposerView.swift` + 20 extensions (`+SyncRestore` = draft,
  `+Publication` = snapshot/publish, `+Media` = sheet timeline...) ; VM
  `StoryComposerViewModel.swift` + extensions (`+Timeline` = lazy TimelineViewModel).
- `.../MeeshyUI/Story/Timeline/` — CommandStack (undo/redo EN MÉMOIRE SEULEMENT),
  StoryTimelineEngine, TimelineViewModel(+OfflinePublish = code mort partiel).
- `.../MeeshySDK/Persistence/StoryPublishQueue.swift` — actor, JSON persisté
  (`Documents/meeshy_cache/story_publish_queue.json`), retry 5×, hash-check médias, drain au
  reconnect + boot. `StoryOfflineQueue` = adaptateur mince legacy.
- `apps/ios/Meeshy/Features/Main/Services/StoryPublishService.swift` — orchestration + toasts.
- `.../MeeshySDK/Networking/TusUploadManager.swift` — upload résumable, checkpoints GRDB
  (`tus_upload_checkpoint`), reprise après kill VÉRIFIÉE (Wave 2 R-OB5).
- `.../MeeshySDK/Models/StoryEffects+Sanitization.swift` — strip `file://` au boundary SDK.

### Cache / local-first (iOS)
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift` — store `stories`
  (`GRDBCacheStore<String, StoryGroup>`, ttl 24 h / stale 5 min, NON chiffré) ; stores disque
  `images` (1 an/300 Mo), `video` (6 mois/500 Mo), `audio` (6 mois/200 Mo), `thumbnails` (7 j).
- `.../Cache/GRDBCacheStore.swift` / `DiskCacheStore.swift` — SWR, funnel réseau coalescé,
  éviction budget LRU.
- `.../Persistence/OfflineQueue.swift` + `OutboxRecord.swift` — outbox unifié ;
  `publishStory`/`repostStory` déclarés mais NON câblés ; PAS de kind markViewed.
- `tasks/local-first-todo.md` — Waves 1+2 (messagerie/feed) ; stories hors périmètre.

### Backend (gateway/shared)
- Pas de StoryService dédié : `Post` type STORY. Routes `services/gateway/src/routes/posts/`
  (`core.ts`, `feed.ts` L65 = `GET /posts/feed/stories` — 50 stories PLEIN CORPS, pas de
  pagination/delta, ETag global tout-ou-rien), `interactions.ts` (view L246, viewers L601).
- `PostService.ts` — expiry STORY = **21 h** (`STORY_EXPIRY_HOURS`, L27) ; double pipeline de
  traduction du `content` (L193 + route core.ts L98-115) ; textObjects traduits vers 10 langues
  FIXES (TODO audience-driven L392).
- `SocialEventsHandler.ts` — story:created (payload complet), viewed, deleted, reacted/unreacted,
  translation-updated. `StoryTextObjectTranslationService.ts` — dot-notation `$runCommandRaw`.
- Médias : `/attachments/file/*` supporte HTTP Range (206) vidéo/audio + `Cache-Control` 1 an —
  le streaming/seek serveur est DÉJÀ bon.
- `ExpiredStoriesCleanupService.ts` — cron 1 h, soft-delete puis hard-delete J+7.

### Web
- `apps/web/components/v2/StoryViewer.tsx` (re-rend les storyEffects, fidèle SAUF
  keyframes/transitions), `StoryComposer.tsx` (pauvre), `story-transforms.ts`
  (`computeStoryDurationMs` = portage 1:1 iOS), React Query + persistance IndexedDB 24 h.

## 2. ZONES AUDITÉES SAINES — NE PAS RÉ-ANALYSER (sauf commit récent les touchant)

Issues des audits it.1→it.58 (`tasks/story-consolidation-backlog.md`) + exploration 2026-07-03 :
- **Parité composite cover/thumbHash vs canvas** (rotation, scale texte, transform fond, dessin,
  vidéos bg/fg, filtres via pont Kind) — it.48/49/51, it.24-28. ⚠️ SEULE exception : it.58
  (scope filtre bg-only vs composite entier) à re-vérifier si la migration filtre est figée.
- **Sync realtime end-to-end** (viewCount it.52, commentCount it.53, reactions it.23/54,
  translation-updated it.9, isViewed monotone it.45) — client sinks + gateway emits croisés.
- **Mutations StoryItem/StoryGroup in-place** (markViewed it.42 fixé, mutateStoryItem,
  insertOrAppend, deleteStory) — pas de reconstruction partielle restante.
- **Expiry viewer/tray** (skipExpired + isFullyExpired) — it.39/40.
- **Publication** : gate online/offline, partial-failure multi-slides, anti-doublon retry,
  rollback slides orphelines, réconciliation optimiste — it.38, it.11. Queue : dispositions
  atomiques, missing-media permanent, quarantine JSON corrompu — it.46/47.
- **TUS resumable cross-kill** — Wave 2 R-OB5 (état de l'art, checkpoints GRDB post-PATCH).
- **markViewed decode** (`APIResponse<[String: Bool]>` ↔ `{viewed:true}`) — CORRIGÉ, ne plus citer.
- **Conception du timer reader** (gated, granularité 1/300, prefetch N+1, pas de saut à la
  reprise) — it.55. Les trous sont dans la COUVERTURE (audio, failsafe), pas la conception.
- **Timing par-élément + timelineDuration autoritaire end-to-end** (viewer/exporter/publish
  round-trip passthrough gateway) — it.18-22. ⚠️ MAIS voir E2 : `buildEffects()` le perd.
- **Drawing capture↔render, ops multi-slides add/delete/duplicate/reorder** — it.13, it.36/37.
- **Story reply flow, story REST reply = Message.storyReplyToId + snapshot gelé** — it.57.
- **Prisme viewer** : chaîne de langue + override session (it.8), merge realtime (it.9),
  voice caption fallback original — sains.

## 3. BACKLOG PRIORISÉ — bugs & lacunes CONFIRMÉS (preuves citées)

> Protocole : prendre l'item ouvert le plus prioritaire NON bloqué, re-prouver dans le code
> actuel, fixer en TDD, vérifier, commit+push, mettre à jour ce fichier. Un item par itération
> (ou un groupe cohérent petit). P0 = casse la mission produit ; P1 = écart majeur ; P2 = dette
> structurante ; P3 = polish/mineur.

### CRÉATION DISCRÈTE / GESTURE-FIRST — mission C (directive user 2026-07-04)

> Grammaire gestuelle EXISTANTE vérifiée it.66 (à préserver et étendre, jamais régresser) :
> tap fond canvas = toggle FABs (`+Canvas.swift:789-793`) ; tap FAB = toggle panneau ;
> swipe-up FAB = ouvre ; swipe-down colonne FABs = cache les FABs ; swipe-down band = ferme
> + restaure FABs (`ComposerControlsLayer.swift:200-219`) ; grabber = resize/replie le panneau
> en poignée seule, outil actif, canvas 100 % (`BandState.allowsCollapsibleDrawer`) ; pinch
> 3 doigts = zoom viewport + drag pan (`+Canvas.swift:770-787`) ; FABs auto-masqués quand un
> panneau est ouvert (`shouldShowFABs`, ControlsLayer:86-88) ; TopBar auto-masquée en
> manipulation libre zoomée (`showTopBar`, `+TopBar.swift:14-16`) ; band reset au changement
> de slide (ControlsLayer:225-229).

- [x] **C0 (P0) Inventaire exhaustif des tools + audit fonctionnel.** ✅ it.66
  Livré (agent d'exploration, 40 tool-uses) : chrome = TopBar 60pt (X/strip/visibilité/
  preview/publish/⋯) + colonne 6 FABs gauche (timeline/texture/drawing/text/son/media,
  badges) + empty-state large picker 6 tuiles (exclusif du band). 4 états orthogonaux :
  activeTool (StoryToolMode?), TextEditingMode (8 TextEditTool), DrawingEditingMode
  (4 DrawingEditTool), BandStateMachine (.hidden/.toolPanel/.formatPanel). Sheets :
  timeline (detents .45/.large), voice recorder (.medium), audience, transitions ;
  fullScreenCover : éditeurs image/vidéo/audio, composer lui-même (3 entrées app-side).
  Canvas UIKit : single-tap (fond=toggle FABs, item=select+front), double-tap (fond média=
  cycle videoFitMode, item=éditeur dédié), pan/pinch/rotation par élément (snap rails,
  rotation interdite sur bg, sensibilités réduites), pinch 3 doigts=viewport, long-press=
  context menu (Modifier/Dupliquer/Plans/Supprimer). Anomalies → C5-C11 ci-dessous.
- [x] **C1 (P2) Accès Transitions et Timeline enterrés dans le menu ⋯.** ✅ it.70
  Volet timeline : résolu par C5 (FAB → sheet). Volet transitions : l'ouverture du slide est
  désormais dans le PANNEAU FOND (FAB Fond → band → rangée « Ouverture », swipe-down ferme) —
  accès 100 % gestuel ; la sheet ⋯ reste (deux surfaces, une source de vérité).
  FIX D'ALTITUDE au passage : `openingEffect`/`closingEffect` migrés @State View → @Published
  VM (classe de bug « survit à vm.reset() » documentée par resetLocalState — FERMÉE pour ces
  champs : reset() les couvre, test RED→GREEN `test_reset_clearsOpeningAndClosingEffects`) ;
  composant partagé `OpeningEffectChips` (sheet + panneau) ; persistance UNIFIÉE via
  granularCanvasSync (openingEffect tracké O(1) — l'explicit sync de la sheet C7 supprimé).
  Piège rencontré : +GranularSync.swift n'importait pas MeeshySDK (erreurs en cascade sur les
  tests — fix = import). 39/39 (3 suites composer), build 57 s vert.
- [x] **C2 (P3) `swipeHorizontalOnBand()` = code mort.** ✅ it.80 — détection ET méthode
  no-op RETIRÉES (un swipe-vers-outil aurait conflué avec les ScrollView horizontaux
  omniprésents des panneaux — pastilles, chips, grilles ; les switch-chips couvrent déjà
  le changement d'outil). 25/25 machine+policy.
  ORIGINE : `swipeHorizontalOnBand()` = code mort** (corps vide, BandStateMachine.swift:114-116)
  MAIS le DragGesture du band détecte toujours le swipe horizontal et l'appelle pour rien
  (ControlsLayer:214-217). Soit retirer la détection, soit lui donner un sens (candidat :
  switch d'outil actif par swipe horizontal sur le band — cohérent mission C).
- [x] **C3 (P2) Chrome totalement caché = zéro affordance de récupération.** ✅ it.71
  Livré : `fabRestoreHandle` — poignée capsule fantôme (34×5, blanc 0.28, zone tappable
  ≥44 pt, a11y « Afficher les outils ») affichée UNIQUEMENT dans l'état nu
  (`!areFabsVisible && band == .hidden`), même grammaire que le grabber du band replié ;
  tap OU swipe-up = FABs de retour ; le tap canvas reste actif en parallèle. Le picker
  empty-state n'est pas concerné (il remplace ControlsLayer). Build vert, commit 0f8b5d3d1.
  RESTE : vérif visuelle simulateur (exige composer non-vide → swipe-down FABs) — prochaine
  passe simulateur.
- [x] **C4 (P1) Sortie du zoom viewport = bouton uniquement, et état zoomé « collant ».** ✅ it.67
  Livré : `CanvasViewportZoomPolicy` (rule engine pur MeeshyUI/Canvas) — `settledScale`
  (clamp [0.5,4] + snap identité |raw−1| < 0,08 → 1.0 exact au `.ended` du pinch) et
  `doubleTapResetsViewport` (zoomé + aucun item touché). Câblage : double-tap fond en état
  zoomé = reset viewport PRIORITAIRE (early-return dans `handleDoubleTap` AVANT le cycle
  videoFitMode, qui reste le double-tap à l'échelle 1 ; item double-tap garde son éditeur
  même zoomé) ; plumbing `isViewportZoomed`/`onViewportZoomResetRequested` via representable ;
  le bouton reset RESTE (invariant n°4). Tests : CanvasViewportZoomPolicyTests 10 + BandState
  19 = 29/29 simu 18.2 ; build app 12 s vert (MeeshyUI recompilé aussi par la suite de tests).
  Preuves : (a) seul exit = `canvasZoomResetButton` (`+Canvas.swift:1028-1046`), AUCUN geste —
  pas de double-tap reset (convention iOS photo-viewer) ; (b) `isCanvasZoomed = canvasScale
  != 1.0` STRICT (`+Elements.swift:123`) sans bande de snap au relâcher du pinch
  (`+Canvas.swift:776-782` : clamp [0.5, 4.0] brut) → un pinch relâché à ~0,98 garde la
  TopBar cachée (`showTopBar`, `+TopBar.swift:15`) + bouton reset visible alors que le canvas
  PARAÎT à l'échelle 1. Fix candidat : double-tap fond = resetCanvasZoom (le bouton reste —
  invariant n°4) + snap |scale−1| < seuil → 1.0 au `.ended` (qualité invisible).
  ⚠️ Contrainte découverte C0 : le double-tap fond est DÉJÀ pris (cycle videoFitMode sur fond
  média, `+Gestures.swift:73-97` ; no-op sur fond couleur) → règle : viewport zoomé = reset
  PRIORITAIRE, sinon comportement existant. UIKit ne connaît pas le zoom (état SwiftUI) →
  plomber `isViewportZoomed` via le representable.
- [x] **C5 (P0) FAB/tuile/swipe-up Timeline ouvraient un panneau band VIDE.** ✅ it.66
  Preuve : `ComposerToolPanelHost.panelHeight = 0` + `placeholderPanel → EmptyView()` pour
  `.timeline` (« presented as sheet, not in band » — intention jamais honorée par le routage) ;
  seuls ⋯/switch-chips/row-buttons posaient `isTimelineVisible`. Fix 2 couches : (1) machine
  pure — `.toolPanel(.timeline)` inatteignable (guards tapFAB/swipeUpOnFAB/tapTile) ;
  (2) View — FAB onTap + onSwipeUp + tuile empty-state routent vers `isTimelineVisible = true`
  (parité chemin ⋯). Tests : BandStateMachineTests 19/19 (4 nouveaux) simu 18.2.
- [x] **C6 (P1) Aucun bouton/geste « ajouter un slide ».** ✅ it.68
  Re-preuve : `addSlide()` testé (append+focus+cap 10+no-op au cap, StoryComposerViewModelTests)
  mais zéro call site UI — seul chemin = long-press → Dupliquer. Livré : `addSlideThumb` en
  bout de slide strip (vignette pointillée « + », même gabarit 42pt que les thumbs, séquence
  sync→addSlide→restoreCanvas identique à la sélection, haptic, a11y label) ; MASQUÉ au cap
  de 10 (n'afficher que l'utile ; le guard VM reste en défense). VÉRIFIÉ SIMULATEUR : « + »
  visible à l'ouverture, tap → slide 2 créé+focusé (badge, bordure brand), canvas basculé
  vierge, « + » décalé (captures scratchpad it68-composer/addslide.png). Build 34 s vert.
- [x] **C7 (P1) Sheet Transitions = STUB.** ✅ it.69
  Re-preuve du rendu AVANT l'UI : `opening` EST rendu bout-en-bout — reader
  (`StoryRenderer.applyOpening` au passage edit→play, `StoryCanvasUIView+Core.swift:128`)
  ET export (`StoryAVCompositor.swift:218`) ; enum fade/zoom/slide/reveal avec labels FR ;
  round-trip sérialisation + restauration PAR SLIDE déjà en place (`+SyncRestore.swift:87`).
  `closing` rendu NULLE PART → PAS d'UI (elle mentirait) → suivi C7b.
  Livré : `transitionPicker` réel — section « Ouverture du slide » + hint, chips Aucune +
  4 effets (sélection brand, sync immédiat `syncCurrentSlideEffects`, haptic) ; sheet
  .medium + drag indicator préexistants (dismiss gestuel natif). VÉRIFIÉ SIMULATEUR :
  ⋯ → Transitions → sheet réelle, tap Fondu → sélection + sync (it69-*.png). Build 62 s vert.
- [ ] **C7b (P3, découvert it.69) `closing` : champ sérialisé jamais rendu.** Un
  `applyClosing` exigerait une intégration timer (déclencher à durée−0,3 s AVANT l'avance de
  slide) — chantier reader réel. Alternativement retirer le champ de l'UI pour toujours et
  documenter. Faible valeur/effort élevé — à trancher si le produit demande des animations
  de sortie. Web ne rend NI opening ni closing (parité W* future si opening devient visible
  côté web).
- [x] **C8 (P2) Stickers inaccessibles.** ✅ it.72
  Livré : bouton « Stickers » dans le panneau Texte (même style que « Ajouter du texte »),
  chaîne de callbacks View→ControlsLayer→Band→PanelHost, sheet .medium (dismiss gestuel,
  reste ouverte pour ajouts multiples), `addSticker(emoji:)` par le chemin AUTORITAIRE
  actuel (@State canvas-authored — cf. C13) avec décalage en cascade. BONUS trouvé/fixé :
  le picker jamais exercé rendait les EMOJIS INVISIBLES (onglets + grille vides) — cause :
  boutons sans `.buttonStyle(.plain)` ; piège consigné dans le code. VÉRIFIÉ SIMULATEUR :
  picker complet (onglets+grille), tap emoji → sticker posé au canvas, autosave draft OK
  (DraftResumeCard montre la cover avec sticker). Captures it72-*.png.
- [x] **C13 (P2, découvert it.72) Source de vérité stickers INCOHÉRENTE — revert latent.** ✅ it.76
  Plan : `docs/superpowers/plans/2026-07-04-sticker-source-of-truth-plan.md` (incrément
  unique atomique — les deux moitiés étaient inséparables). LIVRÉ : `addSticker` VM
  (pattern addText : currentEffects + bringToFront + cascade) ; `mergeEffects` n'authore
  PLUS les stickers (retirés de CanvasAuthoredState, passthrough par copie de current,
  projection legacy `stickers` dérivée au choke point) ; @State View purgé de 8 sites
  (déclaration, reset, restore, buildEffects, granular stickersCount, composerHasContent,
  emptiness, helper it.72 → appel VM). Tests réécrits au NOUVEAU contrat : passthrough +
  non-revert d'une mutation x (le scénario du bug) + projection nettoyée + addSticker VM.
  56/56 (5 suites composer, 1 skip préexistant), build 20 s.
  ORIGINE (pin périmé) :
  Preuve : VM et canvas mutent `effects.stickerObjects` DIRECTEMENT (deleteElement
  +Elements:365, duplicate +Slides:180, zOrder, gestes canvas) MAIS `mergeEffects` ÉCRASE
  ce champ depuis le @State View `stickerObjects` à chaque sync (+SyncRestore:139-140,
  contrat pinné par le test « deleted stickers must not resurrect ») — le @State n'est
  rafraîchi qu'au changement de slide (restoreCanvas). Un drag/resize/delete de sticker
  suivi d'un sync (ex. changement de couleur) peut REVERTIR la mutation. Dormant tant que
  les stickers étaient inaccessibles — C8 le réveille. Refonte cible : stickers en
  passthrough `currentEffects` (modèle textObjects) — PLAN REQUIS (change un contrat de
  test pinné + touche delete/duplicate/gestes).
- [~] **C9 (P2) Pas d'undo/redo global composer.** — PLAN POSÉ it.80 :
  `docs/superpowers/plans/2026-07-04-composer-global-undo-plan.md` (architecture SNAPSHOTS
  aux choke points — pas de conversion command-based des dizaines de call sites ; pile
  `[StorySlide]` cap 50, capture à syncCurrentSlideEffects + fin de geste + ops slides,
  piège bitmaps purgés consigné, UI discrète shake + icônes header conditionnelles).
  5 incréments. ✅ Inc.1 it.81 : `HistoryStore<S>` (MeeshyUI/Controls, struct pure
  nonisolated parité BandStateMachine) — push dédup/troncature redo/cap avec ÉVINCÉ
  RETOURNÉ (seam purge bitmaps différée), undo/redo trajectoire exacte ; 6 tests.
  ✅ Inc.2 it.82 : capture câblée — AMÉLIORATION vs plan : au lieu de 3 câblages
  point-par-point, UN publisher `historyTrigger` (objectWillChange.debounce 0,5 s, lazy
  stored — pattern E1, piège re-souscription évité) + dédup du store = couverture TOTALE
  par construction. Snapshots = Data JSON `.sortedKeys` (StorySlide non-Equatable + ordre
  de clés instable iOS 26). Seed à l'entrée + RE-seed post-restoreDraft (l'undo ne traverse
  pas la frontière de reprise) ; gardes View = celles de l'autosave (carte de reprise,
  démontage) ; exclusion dessin actif (capture à la sortie). Flags @Published assignés
  sur changement réel uniquement (boucle trigger fermée par la dédup). 5 tests
  StoryComposerHistoryTests (dédup/capture/re-seed/exclusion dessin/déterminisme encodage).
  Piège : `private(set)` inaccessible depuis l'extension +History → setter interne.
  ✅ Inc.3 it.83 : restauration + purge PARESSEUSE — `undoGlobal`/`redoGlobal` (décodage,
  clamp d'index, sélection reset, `rehydrateZIndexMapFromSlide()` RÉUTILISÉ — mécanisme
  existant du changement de slide) ; le piège bitmaps FERMÉ : deleteElement/removeSlide
  mettent les ressources en STAGING (`retired*`) au lieu de les jeter, le restore re-merge
  ce que l'état restauré référence, seed/reset vident le staging. La dédup absorbe le cycle
  trigger post-restore (l'état appliqué EST entries[index]). 3 tests restauration (undo/redo
  structurel, bitmap récupéré, z-order réhydraté) — 49/49 sur 3 suites.
  ✅ Inc.4 it.84 : icônes undo/redo dans le header, PRÉSENTES UNIQUEMENT quand la
  trajectoire le permet (canUndo/canRedo — « n'afficher que l'utile ») ; performUndo/Redo
  View-side = même séquence que la sélection de vignette (restoreCanvas + timeline reload).
  Shake-to-undo DIFFÉRÉ : conflit de first responder avec l'éditeur texte inline (risque
  documenté — à trancher produit).
  ✅ Inc.5 it.84 : VÉRIFIÉ SIMULATEUR en conditions réelles — trait ajouté par accident sur
  le draft du user → sortie dessin → icône undo APPARUE dans le header (redo absente) →
  tap → trait disparu (pixels redevenus cyan) → header basculé sur redo-seul (plancher).
  L'accident a été réparé par l'outil lui-même. C9 COMPLET côté autonome (shake = option).
  BONUS it.84 : BUG-2 VÉRIFIÉ VISUELLEMENT (draft user plein écran bord à bord, letterbox
  cyan, zéro zone noire) et BUG-4 VÉRIFIÉ (carte cardée sous la status bar en mode dessin,
  9:16 entier). C-DIR4 : 4/4 bugs fixés ET vérifiés. Le draft du user (cyan+taco+trait) a
  été PRÉSERVÉ tel quel (reprise fidèle re-prouvée + sortie par Save).
  ORIGINE :** Undo/redo existe UNIQUEMENT en dessin
  (DrawingEditFloatingBubbles) + CommandStack timeline (séparé). Ajout/déplacement/suppression
  de texte/média/sticker/fond : irréversibles (seul « annuler » = ⋯ → Supprimer tous les
  slides !). Chantier : étendre le pattern CommandStack au canvas — PLAN requis avant code.
- [x] **C10 (P3) Code mort composer.** ✅ it.85 — 7 fichiers purgés (FontStylePicker [vue],
  TextBackgroundStylePicker, MediaPlacementSheet, StoryAudioPanel, TrackDetailPopover,
  TimelineTrackView, StoryFilterPicker [vue]) + sheet filtre morte (showFilterSheet jamais
  posé) + 3 commentaires périmés. Extractions AVANT purge : `storyFont(for:size:)` →
  StoryFont.swift (4 usages vivants) ; `StoryFilterProcessor` → StoryFilterProcessor.swift
  (source unique du rendu filtres, consommé par le bg layer + la grid — le build a attrapé
  l'oubli). LEÇON consignée : purger un fichier = inventorier TOUS ses types, pas seulement
  celui du nom. `.formatPanel(.media,_)` conservé (branche d'exhaustivité enum, pas un
  fichier). StoryFilterGridView conservé (branché au panel .filters inatteignable —
  attaché à la décision produit filtres §4). ORIGINE : Code mort composer** (7 fichiers, confirmé zéro call site) : StickerPickerView
  (→ C8), TextBackgroundStylePicker, FontStylePicker (la vue ; garder `storyFont(for:size:)`
  utilisé par TextEditToolOptions:56), MediaPlacementSheet, StoryAudioPanel (+ son
  StoryVoiceRecorder embarqué), TrackDetailPopover, TimelineTrackView. + sheet
  `showFilterSheet` jamais ouvrable (`+Media.swift:69-82`), état `.formatPanel(.media,_)`
  jamais produit (EmptyView, `ComposerBottomBand.swift:140-144`). Purger APRÈS décisions C8/C7.
- [x] **C11 (P3) Fond : gradients définis mais jamais offerts.** ✅ it.87 (re-scopé it.77 :
  le renderer ne parsait AUCUN gradient — l'offrir sans rendu aurait menti).
  LIVRÉ bout-en-bout iOS : format sérialisé `"gradient:HEX1:HEX2"` (`StoryBackgroundValue`,
  SDK Models — parse tolérant, roundtrip, ≤64 chars caps serveur, 5 tests) ; rendu aux
  3 renderers (canvas CALayer `renderBackground` → `Kind.gradient` ; composite
  `StorySlideRenderer` → CGGradient ; miniatures `SlideMiniPreview` + letterbox composer →
  `storyBackgroundStyle` AnyShapeStyle partagé, direction topLeading→bottomTrailing
  partout) ; rangée de 6 pastilles dégradés dans le panneau Fond (sérialisé SANS «#»,
  restoreCanvas routé) ; clé xcstrings ajoutée 4 langues (leçon C12 appliquée à chaud).
  Web : dégrade gracieusement (fallback gradient W7) — parité rendu réelle = W-item si
  demandé. ORIGINE :
- [x] **C12 (P3, découvert it.68 simulateur) Chrome composer bilingue.** ✅ it.86
  Audit scripté : 108 clés story.* utilisées dans MeeshyUI ; 28 ABSENTES du xcstrings
  (dont les ajouts C4-C9 : addSlide/opening*/undo/redo/showTools + draft.resume/freshness/
  media/language/tool.*) et 45 PARTIELLES (fr seul — toutes les tuiles empty-state, cause
  exacte du mélange des captures). Patch : couverture COMPLÈTE fr/en/es/de (161 unités de
  traduction) + fix bonus `story.repost.reprojected` (le fr contenait de l'anglais).
  Édition byte-safe (ordre préservé, no-op vérifié identique, insertion alphabétique
  locale). Contre-audit : 0 absente, 0 partielle. Build vert. pt-BR : hors périmètre
  (couverture existante hétérogène — suivi possible si demandé). ORIGINE :** Preuve visuelle
  (it68-quit.png) : alerte discard « Quit without publishing? / Save / Quit / Cancel » en
  ANGLAIS pendant que les tuiles/titres sont en français, même écran. Cause probable = piège
  xcstrings devRegion=en vs source=fr (cf. mémoire projet) : les clés de l'alerte ont une
  traduction EN, les tuiles retombent sur defaultValue FR (locale simu EN). Auditer les
  xcstrings du composer (story.composer.*) pour une couverture homogène 5 langues.

- [x] **C17 (P1, découvert it.95 — simulateur en direct, device locale EN) Reader + Mes
  stories entièrement non localisés (catalogue APP, pas le composer).** ✅ it.95
  C12 avait audité `story.composer.*` dans le catalogue **SDK/MeeshyUI**
  (`packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings`) — jamais le
  catalogue **APP** (`apps/ios/Meeshy/Localizable.xcstrings`) que consomment
  `StoryViewerView+Sidebar.swift` (rail d'actions + header + menu ⋯), `StoryViewerView+Content
  .swift` (expiry), `MyStoriesView.swift` (liste « Mes stories »), `StoryTrayView.swift`,
  `StoryExportShareSheet.swift`, `StoryRepostEmbedCell.swift`. Preuve simulateur (locale
  device EN, session « atabeth ») : liste « Mes stories » entière en français (« Mes
  stories »/« Sélectionner »/« OK ») alors que le reste de l'app (login, chat) est en
  anglais ; sidebar du reader (« Envoyer »/« Vues »/« Exporter »/« Mute »/« Son ») idem,
  malgré un chrome COMPOSER correctement anglais à côté (C12 tient toujours). Cause : soit
  `String(localized:defaultValue:)` sans AUCUNE entrée catalogue (defaultValue FR gagne
  toujours, quel que soit le device), soit littéraux bruts jamais wrappés du tout
  (`label: "Envoyer"`, `"expire dans \(hours)h"`).
  Audit scripté (regex `String(localized: "story\.[a-zA-Z0-9_.]+"` sur les 11 fichiers
  `Story*.swift` de `apps/ios/Meeshy/Features/Main/Views/`) : 72 clés `story.*` utilisées,
  **59 ABSENTES** du catalogue APP (dont `story.mine.*` — 22 clés, la liste « Mes stories »
  n'avait STRICTEMENT AUCUNE entrée) + 3 littéraux jamais wrappés (`storyTimeRemaining`).
  Fix : (1) `MyStoriesView.swift` — `common.done` (inexistant) → réutilise `common.ok`
  (existant, 5 langues) ; 22 clés `story.mine.*` ajoutées. (2)
  `StoryViewerView+Sidebar.swift` — 9 labels de bouton (React/Répondre/Envoyer/Partager/
  Vues/Exporter/Mute/Son/Traductions) + 5 toasts repost wrappés en `String(localized:)`
  (14 nouvelles clés `story.viewer.action.*`/`story.viewer.repost.*`) ; `AvatarContextMenu
  Item("Voir le profil")` réutilise `story.viewer.viewProfile` (déjà présent dans le code,
  jamais catalogué — évite un doublon). (3) `StoryViewerView+Content.swift` —
  `storyTimeRemaining` (3 littéraux `"expire dans...\|expire bientot"`) → 3 clés
  `story.viewer.expires*`. (4) 45 clés PRÉ-EXISTANTES (jamais catalogué, code déjà correct)
  ajoutées telles quelles : `story.viewer.a11y.*` (9), `story.viewer.fullscreen/delete/report/
  repostAsPost/editAndRepostAsPost/share.external/viewProfile/close/label/loading/retry/
  notFound.*/reply.*/replyTo/viewsAndImpressions` (18), `story.tray.*` (5), `story.groupIntro.*`
  (5), `story.export.share.*` (6), `story.repost.by` (1) — total 59 nouvelles entrées APP
  catalog + 3 `expires*` = 62, plus 22 `story.mine.*` = 84 nouvelles clés APP au total.
  5 langues (de/en/es/fr/pt-BR) systématiques ; substitutions Swift interpolées converties en
  `%@`/`%lld` (ex. `story.viewer.a11y.profileOf`, `story.viewer.replyTo`,
  `story.viewer.viewsAndImpressions`) ; 2 typos FR corrigées au passage (« Reessayer » →
  « Réessayer », sans risque de régression — l'ancien defaultValue-only affichait déjà le
  typo à TOUS les locales). Piège d'édition : `json.dumps` standard NE round-trippe PAS ce
  fichier (Xcode inline certains leaf dicts sur une ligne par endroits) → édition par
  insertion de texte brut ancrée sur la fin de fichier exacte (diff = 100 % additions,
  vérifié `git diff | grep '^-'` vide hors en-tête).
  Vérif : `LocalizationConsistencyTests` 2/2 verts (build-for-testing + test-without-building)
  + 3 suites guard `MyStories*`/`StoryTrayMyStoryTapGuardTests` (7/7) non-régressées ; build
  app vert (3 rebuilds incrémentaux, 17-56 s) ; VÉRIFIÉ SIMULATEUR AVANT/APRÈS (captures
  scratchpad it95-*) : « Mes stories »→« My Stories », « Envoyer/Vues/Exporter »→
  « Send/Views/Export », « expire dans 20h »→« Expires in 20h ».
  RESTE (nouveau backlog, non traité ce tour) : (a) ÉCARTÉ avec preuve it.95 : vignettes
  génériques dans « Mes stories » — `GET /posts/feed/stories` (curl authentifié atabeth)
  confirme les 6 stories du compte test ont `media: []` + `content: null` + `textObjects: []`
  (stories authentiquement VIDES, artefacts de sessions QA antérieures, PAS un bug de
  rendu — le fallback icône photo de `MyStoryRow.thumbnail` est le comportement CORRECT
  pour une story sans média). Le canvas noir observé au reader (§ ci-dessus) a la même
  cause exacte. Zéro code. (b) `story.repost.by` concatène
  concatène `"\(String(localized:...)) \(repost.author)"` — ordre des mots non-adaptable
  par langue (structure correcte pour fr/en/es/pt-BR testés mais fragile ; idéalement un
  seul format `%@` par langue) ; (c) `story.viewer.action.repost` réutilise le libellé
  visuel « Partager »/« Share » pour l'action REPOST (bouton `arrow.2.squarepath`), qui
  prête à confusion avec le VRAI partage externe (`story.viewer.share.external`) — pas
  touché ce tour (aurait changé la sémantique UX, pas juste la localisation) ; (d) chaque
  NOUVEAU fichier `Story*.swift` futur doit repasser par ce même audit scripté (regex ci-
  dessus) avant de considérer la localisation du reader complète — seuls les 11 fichiers
  existants au 2026-07-17 ont été couverts.

- [~] **C-DIR2 (P0, directive user 2026-07-04 #2) Canvas TOUJOURS entièrement visible +
  chrome unifié header/FABs.** — (b)(c)(d) LIVRÉS it.73 ; (a) vérification dédiée restante.
  ✅ (d)+(c) : `ComposerChromePolicy.fullChromeVisible` (rule engine pur, 6 tests) — header
  ET FABs partagent LA même règle : canvas plein écran au repos uniquement (fabsVisible ∧
  bandHidden ∧ !textEditing ∧ !drawing ∧ !zoomed). L'ancien `showTopBar` gardait le header
  pendant l'édition (`|| activeTool != nil || selectedElementId != nil`) — supprimé.
  Changement assumé : en zoom viewport, les FABs se cachent aussi (mêmes conditions).
  ✅ (b) : mécanisme « band replié en poignée » ENTIÈREMENT RETIRÉ (bandDrawerCollapsed,
  drawingCollapsed, onExpandDrawer, drawingDrawerGrabberHeight — 4 fichiers) ; grabber tiré
  sous le min = fermeture du band + retour FABs (+ sortie du mode dessin, sinon
  effectiveBandState re-forcerait le panneau) ; presentedSheetHeight/drawingDrawerHeight
  simplifiés (plus de branche poignée).
  ✅ (a) structurel PRÉEXISTANT confirmé : canvasIsCarded + presentedSheetHeight + cap 42 %
  (« canvas cardé toujours visible, jamais écrasé sous la sheet ») — le repli était
  l'exception qui désalignait la réservation. RESTE (a)-vérif : passe simulateur mesurée
  (canvas entier au-dessus du band pour CHAQUE panneau + sous le header) + edge cases
  clavier (texte) — prochain tour.
  Gates : ComposerChromePolicyTests 6 + BandStateMachine 19 + ControlsLayer/Timeline suites
  verts ; build app 49 s vert.
  ✅ (a)+(b)+(c)+(d) VÉRIFIÉS SIMULATEUR it.74 (captures it74-A/B/C/D) : band Texte ouvert →
  header ABSENT + canvas ENTIER cardé au-dessus du band ; grabber tiré à fond → band fermé +
  header+FABs de retour ; swipe-down FABs → canvas nu + poignée fantôme C3 (première vérif
  visuelle C3 ✓) ; tap poignée → chrome plein restauré. Restent hors-scope de cette vérif :
  cas clavier texte (édition inline) et zoom — à observer lors d'usages réels.
- [~] **C-DIR3 (P1, directive user 2026-07-04 #3) Device iPhone 16 Pro Max : le fond
  vidéo/média d'une story ne JOUE PAS à l'ouverture ni en preview** tant qu'un long-press +
  relâcher n'est pas fait. — SELF-HEAL LIVRÉ it.75 ; vérif device restante.
  DIAGNOSTIC (analyse code) : les didSet `isPlaybackActive` (bg layer :109-118, fg :256-261)
  ne rejouent que sur CHANGEMENT de valeur — un player externe-pausé (interruption d'audio
  session device, préemption d'un canvas mourant pendant la transition) avec un flag resté
  `true` n'est JAMAIS re-play()é. Le long-press/relâcher répare car
  `setStoryPlaybackPaused(false)` force le flip false→true → didSet → play(). Simulateur
  épargné (pas d'interruptions de session, timings différents).
  LIVRÉ : `StoryPlaybackHealth.shouldKickPlayback` (règle pure, 7 tests — kick UNIQUEMENT
  sur `.paused` [`.waiting` = stall gate], jamais contre pause user/asset mort, grâce 0,75 s,
  budget 3/session) + la sonde 60 Hz traque l'épisode `.paused` + `kickPlayback()` re-drive
  le chemin canonique du resume (flip forcé bg+fg + startAlignedIfActive), os.log
  story-media pour le diagnostic terrain. Piège : constantes statiques `nonisolated`
  obligatoires (defaultIsolation MainActor). 41/41 les 2 suites santé, build 53 s.
  RESTE : vérif sur LE device user (story vidéo au boot → doit jouer seule ; sinon
  Console.app filtre « self-heal kick » dira si le kick tire et si un tiers re-pause).

- [~] **C-DIR4 (P0, directives user 2026-07-04 #4 — 3 bugs composer).** 2/3 FIXÉS it.77.
  ✅ BUG-1 « couleur de fond pas reflétée instantanément » : `contentIdentity(.solidColor)`
  valait « color » quelle que soit la couleur → le no-op diff de `configure()` avalait le
  changement (`hasVisibleContent` satisfait par l'ANCIENNE couleur) ; la mini-preview SwiftUI
  (lit effects) devenait rouge, le canvas CALayer restait rose — signature du bug. FIX :
  valeur RGBA dans l'identité (+gradients) ; reconstruction couleur = synchrone, zéro flash.
  Seam interne + 4 tests StoryBackgroundLayerIdentityTests. VÉRIFIÉ SIMULATEUR : tap pastille
  → (255,46,99) instantané au canvas.
  ✅ BUG-3 « reprise de brouillon → composer vide » : le composer VIERGE sous la carte de
  reprise mute dès son onAppear (fond pastel posé) → l'autosave E1 débouncé 2,5 s ÉCRASAIT le
  draft pendant que la carte était affichée → « Reprendre » restaurait du vide (prouvé :
  cover carte rouge → menthe en 2 min). FIX : guard `!showRestoreDraftAlert` sur les DEUX
  chemins d'autosave (mutation + background). VÉRIFIÉ SIMULATEUR : carte affichée 6 s
  (> debounce) → cover intacte → Reprendre → canvas + strip restaurés (255,46,99).
  ✅ BUG-2 « zone noire en bas en chrome plein » : cause = géométrie (un canvas 9:16
  aspect-fit centré dans un viewport 19.5:9 laisse ~80 pt de letterbox haut/bas ; le haut
  se cachait sous le header, le bas restait noir nu). FIX it.78 : le letterbox prend la
  COULEUR DU FOND du slide en présentation libre (noir conservé en carded + fond média) —
  le canvas paraît occuper tout l'écran. Compilé/committé ; VÉRIF VISUELLE à faire dans
  une fenêtre simulateur calme (session partagée avec le user en direct it.78).
  ✅ BUG-4 (capture user it.78) « canvas COUPÉ en haut quand un tool est actif » — 2 fixes
  it.79 : (a) le cadrage réservait TOUJOURS les 59 pt du header même masqué (C-DIR2 le cache
  pendant l'édition) → la carte cardée démarrait sous un header FANTÔME (bande noire haute
  perçue « coupé » + place perdue) ; désormais headerInset suit showTopBar (header caché →
  carte sous la status bar). (b) un zoom/pan viewport résiduel (pinch 3 doigts) COMPOSAIT
  avec le transform de carding (contenu décalé/débordant, ratio 1:1,47 de la capture) ;
  entrer en carding reset désormais le viewport à l'échelle 1. Build 71 s vert.
  VÉRIF VISUELLE : sur la prochaine capture user en mode outil (session sim partagée).
  Note : « recharge des médias » du rapport = conséquence attendue du fix BUG-3 (le
  saveMedia n'écrase plus les copies du draft) — vérif média dédiée à faire.

- [x] **C14 (P3, audit ciblé it.88 — a11y des gestes du composer).** ✅ it.88
  FINDING : les labels VoiceOver des FABs annonçaient les noms d'ENUM internes
  (`String(describing: category)` → « texture », « son », « drawing » — jamais localisés,
  incohérents avec les libellés affichés « Fond »/« Dessin ») et TOUTES les strings a11y du
  chrome (FABs value/hints + grabber label/hints) étaient des littéraux FR hors xcstrings
  (VoiceOver bilingue en locale EN — même classe que C12) ; le hint du grabber disait encore
  « replier » (périmé C-DIR2). FIX : `toolDisplayName(_:)` réutilise les clés story.tool.*
  (VoiceOver dit CE QUE l'écran montre), 8 strings localisées 4 langues, hint corrigé.
  Vérifié structurellement : chaque geste du composer a son équivalent actionnable
  (poignée C3 = bouton labellisé, fermeture band = chevron, zoom-out = bouton reset,
  swipe-up FAB = tap, undo/redo = boutons labellisés). Audit PRODUCTIF (pas sec).

- [x] **C15 (P3, audit ciblé it.90 — éditeur texte inline).** ✅ it.90
  FINDING (observé dès les sessions simulateur it.72/84 : « Texte vide » persistants) :
  AUCUN chemin de sortie de l'édition inline ne purgeait un texte resté vide — fantômes
  invisibles au canvas, comptés par le badge FAB, sérialisés au draft ET au publish
  (traduits par le pipeline gateway pour rien). FIX : purge centralisée dans
  `exitTextEditingMode()` (le point de sortie COMMUN — X, tap ailleurs, slide-switch) :
  texte vide/blanc → `deleteElement` (respecte les verrouillés + staging C9). 3 tests
  (vide purgé, blanc purgé, contenu réel conservé). Piège de test : `addText()` ne pose
  PAS textEditingMode (la View appelle enterTextEditingMode ensuite) — test aligné.
  Audit n°3 PRODUCTIF — compteur sec retombe à 0/2.

- [x] **C16 (P3, audit ciblé it.91 — flux picker médias).** ✅ it.91
  FINDING : 3 chemins d'échec SILENCIEUX dans `addForegroundMedia` (guard vidéo
  loadTransferable, catch d'écriture temp, guard image load/downsample) — le spinner
  disparaissait sans un mot (photo iCloud non téléchargée, format refusé…), l'utilisateur
  ne savait jamais pourquoi rien ne s'était ajouté. Le reste du flux est SOLIDE (pin
  anti-course du slideId F2, progress, aspect ratio via preferredTransform, duration
  pinnée anti « vidéo 1 s »). FIX : alerte `mediaLoadFailed` (canal existant du composer,
  pattern lostMediaCount) posée aux 3 points, message actionnable (« vérifiez iCloud »),
  2 clés xcstrings 4 langues. Audit n°4 PRODUCTIF — compteur sec 0/2.

- [x] **C-DIR5 (P2, directive user 2026-07-04 #5 — capture preview reader).** ✅ it.91b
  « La story doit se placer directement en bas de la date d'expiration — l'espace entre
  les deux est trop grand. » Cause : `StoryCanvasFraming.resolve` CENTRAIT la carte dans
  la région [header…bas] — quand la contrainte largeur est active, le mou vertical se
  répartit moitié haut/moitié bas → vide sous le header. FIX : option
  `verticalAlignment` (.center historique / .top flush) dans le solveur pur ; le READER
  passe `.top` (le mou entier va en bas) ; le composer garde `.center` (défaut compat).
  2 tests géométriques discriminants (contrainte largeur forcée). 17/17 framing, build
  82 s. VÉRIF : sur la prochaine capture user (build installé sur le simulateur).

### ÉDITION — crash recovery & intégrité des données

- [x] **E1 (P0) Autosave draft sur mutation, pas seulement en background.** ✅ it.5
  Preuve re-confirmée : unique déclencheur = `scenePhase == .background`.
  Livré : `StoryComposerViewModel.autosaveTrigger` — publisher LAZY STORED
  `objectWillChange.debounce(2,5 s)` (stable entre renders ; un debounce inline dans `body`
  serait re-souscrit à chaque évaluation → timer perpétuellement reset, save jamais tiré) ;
  `.onReceive` → `autosaveDraftAfterMutation()` : save JSON GRDB à chaque accalmie (léger),
  `saveMedia` (bitmaps) UNIQUEMENT si `mediaKeysFingerprint` change ; guards = ceux du save
  background + `draftAutosaveSuspended` (posé après clearAllDrafts dans publish et quit —
  un debounce en vol ne re-persiste pas un brouillon jeté ; « Effacer le brouillon » de
  l'alerte restore ne suspend PAS, l'édition continue).
  Ambiguïté tranchée : PAS de chemin « save immédiat » séparé pour les événements structurants —
  le debounce 2,5 s les couvre (fenêtre de perte ≤2,5 s acceptable pour du crash-safe, un seul
  chemin d'écriture). L'UX de reprise (preview composite au lieu d'alerte texte) = U4, séparé.
  Tests : StoryComposerAutosaveTests (5 : burst→1 tir, 2 bursts→2 tirs, fingerprint ×3).
- [x] **E2 (P0) `buildEffects()` écrase `clipTransitions` + `timelineDuration` à nil.** ✅ it.4
  Preuve re-confirmée : chaîne complète — slider durée (`+Slides.swift:42`) et Timeline
  (`TimelineProject.apply`, StoryModels.swift:2121-2126) écrivent effects.timelineDuration/
  clipTransitions (lus EN PRIORITÉ par `computedTotalDuration`, :1001) ; `buildEffects()` les
  omettait → perdus à CHAQUE sync (publish + persistDraft). Fix D'ALTITUDE (classe de bug
  récidiviste : voice, filter, drawingStrokes déjà touchés) : inversion du défaut —
  `mergeEffects(current:canvas:)` copie `current` INTÉGRALEMENT puis n'écrase que les champs
  `CanvasAuthoredState` (bg, stickers, drawing, audio panel, opening/closing, bgTransform,
  slideDuration=nil volontaire). Plus AUCUN champ ne peut être oublié (thumbHash, music*,
  textStyle legacy traversent aussi désormais). Tests StoryComposerMergeEffectsTests (5) +
  ResetState en non-régression.
- [x] **E3 (P1) `persistDraft()` ne flushe pas la timeline ouverte.** ✅ it.10
  Re-preuve : commit uniquement au `onDismiss` de la sheet (`isTimelineVisible`) ; s'appliquait
  AUSSI à l'autosave E1 (it.5). Fix : `flushOpenTimelineIntoSlide()` (gate `isTimelineVisible`,
  n'instancie jamais le lazy timelineViewModel, non-destructif pour l'édition en cours) appelé
  en tête de `persistDraft()` ET `autosaveDraftAfterMutation()` — ordre flush → sync → save,
  compatible mergeEffects (E2 : timelineDuration/clipTransitions traversent).
  Vérif : 13/13 suites composer non-régression, build 22 s vert.
- [x] **E4 (P1) Persister le CommandStack (undo/redo) avec le draft.** ✅ COMPLET it.43 (cross-crash)
  ✅ Incrément 1 : `timelineHistoryBySlide` (composer VM) — stash au shutdown ET avant chaque
  re-bootstrap ; restore via NOUVELLE API `restoreCommandHistoryWithoutReplay` (le projet
  committé EST l'état au cursor ; le `restoreCommandHistory` existant REJOUE et suppose l'état
  zéro → aurait doublé les AddClip). Undo/redo survit à chaque fermeture de sheet + BONUS :
  corrige la contamination cross-slide préexistante (bootstrap ne resettait pas le stack —
  l'historique de la slide A restait actif sur la slide B).
  ✅ Incrément 2 (it.43) : blob opaque base64 dans `story_draft_meta` (table EXISTANTE —
  zéro migration, purge gratuite via `clear()`), écrit à chaque autosave E1/persistDraft
  (y compris le stack LIVE de la timeline ouverte, stash non destructif), réappliqué au
  restore du draft AVANT tout bootstrap timeline (contrat no-replay it.11 inchangé).
  `commandHistoryBlobForPersistence()`/`applyPersistedCommandHistory()` (VM, testables) ;
  blob corrompu = no-op (l'historique mémoire prime). JSONEncoder `.sortedKeys`.
- [x] **E10 (P2, découvert it.12) Fuite disque : dossiers `meeshy_offline_queue/` jamais
  nettoyés au succès du chemin QUEUE.** ✅ it.16
  Livré : (1) SDK — `removeLocalMedia(of:)` aux DEUX dispositions terminales du drain (succès
  ET échec permanent) : rm des `mediaReferences.localFilePath` + rm du parent devenu VIDE
  (agnostique produit, la queue possède ses references) ; un échec retryable garde tout.
  (2) App — `sweepOrphanedQueueMediaDirectories()` one-shot au boot (StoryPublishService.
  configure, après le guard d'idempotence) : purge les dossiers sans item vivant ET plus
  vieux qu'1 h (garde d'âge contre la course « dossier créé avant l'insertion de l'item ») ;
  cœur pur `orphanedQueueDirectories` testé. mtime illisible = traité comme vieux.
- [x] **E5 (P1) Publish online in-flight non résumable après kill.** ✅ it.12
  Livré (design write-ahead du backlog) : cœur de persistance extrait
  (`persistPublishIntentToQueue`, partagé offline/online) ; le chemin ONLINE persiste
  l'intent AVANT `launchUploadTask` (séquencé — le succès peut toujours retirer SON intent),
  marqué in-flight via un Set VOLATILE côté queue (`markInFlight`/`clearInFlight`/`isInFlight`,
  jamais persisté → un kill efface le marqueur et l'item redevient éligible au drain de boot :
  la sémantique « inflight orphelin → pending » SANS migration de format). `processNext()`
  skippe les in-flight (pas de double publication pendant l'upload UI). Succès → dequeue +
  rm dossier médias ; annulation explicite → idem (pas de résurrection au boot) ; échec →
  l'item RESTE (retry UI ou reprise au prochain boot). La bifurcation isOffline demeure pour
  l'UX (banner vs upload visible) mais la DURABILITÉ est unifiée.
- [x] **E6 (P2) `StoryQueueMigrator.migrateLegacyOfflineQueue()` jamais appelé en prod.** ✅ it.17
  Choix : APPELER (pas supprimer — impossible de prouver qu'aucun install n'a l'ancien
  fichier). Câblé dans `StoryPublishService.configure()` AVANT `setExecutor`/auto-drain
  (les items migrés doivent exister au drain), avec refreshPendingCount après migration.
  Le migrator lui-même était déjà idempotent + testé (no-op sans fichier, quarantaine JSON
  corrompu). Retrait du legacy StoryOfflineQueue = candidat futur une fois la population
  migrée (noter une échéance produit).
- [ ] **E7 (P2) Code mort Timeline publish** : `handlePublishTap` + `StubOnlinePublisher`
  (throw toujours, zéro caller) ; `buildOfflineQueueItem` limitation F5 (perd
  background/filter/drawing sur flush). Décision : retirer ou câbler — trancher avec le user si
  le bouton publish in-timeline est souhaité.
- [ ] **E8 (P2) Multi-draft.** `save()` fait `DELETE FROM story_draft_slide` — un seul brouillon.
  Feature : galerie de brouillons (id draft + updatedAt + cover composite), reprise au choix.
  Décision produit à confirmer avant d'implémenter (scope UI non trivial).
- [x] **E9 (P2) Draft store hors purge de compte.** ✅ it.18 — ÉLARGI
  Re-preuve : le logout (AuthManager) purgeait tout SAUF (1) le draft store ET (2) la
  StoryPublishQueue persistée — le compte suivant retrouvait le brouillon du précédent et
  le drain aurait PUBLIÉ ses stories en attente sous la mauvaise session (plus grave que
  le finding original). Livré : `StoryDraftStore.shared.clear()` + `StoryPublishQueue.shared.
  clearAll()` dans le bloc reset des singletons SDK du logout ; `clearAll()` étendu pour
  emporter aussi les copies médias (cohérence E10) + reset des marqueurs in-flight E5.

### LECTURE — progression synchronisée aux données

- [x] **R1 (P0) Étendre le gel de progression à l'AUDIO.** ✅ it.1 (86c2c27de)
  Preuve re-confirmée : `primaryMediaPlayer()` = vidéo uniquement ; audio pré-caché ASYNC
  (`reconfigureAudioForPlayback` → `cachedAudioFileURL`) pendant que la timeline avançait.
  Découverte en route : `startAudioPlayback()` schedulait un `play()` À VIDE quand contentReady
  précédait la fin du pré-cache → clé de slide posée sur mixer silencieux + vrai schedule
  back-daté ensuite (cause racine du démarrage audio désynchronisé).
  Livré : `StoryPlaybackHealth.isProgressing(isAudioPending:)` (deadlock-guards intacts :
  userPaused/failed/watchdog 5 s forcent la reprise) ; `ReaderAudioMixer.hasStartedPlayback(slideKey:)`
  (réponse PAR slide — le flag global confondait la passe de la slide précédente) ; sonde
  `isSlideAudioPending()` 60 Hz sur flag sync `slideHasSchedulableAudio` ; interdiction du play()
  à vide sur slide audio ; re-pose du flag post-configure (échec total de cache = slide
  silencieuse → gate libéré sans watchdog) ; gate appel actif (story joue muette, pas de gel).
  NOTE : le mixer joue des fichiers LOCAUX une fois schedulé → pas d'underrun mid-flight ;
  le gate couvre TOUTE la fenêtre de disponibilité audio. La reprise repart en phase
  (`captureSlideTimelineOrigin` sur playhead gelé = 0). Ambiguïté tranchée : on gèle AUSSI
  quand le reader est muté (le schedule volume-0 garde la sync pour un unmute mid-slide).
  Tests : 27/27 verts (StoryPlaybackHealthTests 14, StoryCanvasPlaybackHealthTests 13) simu 18.2.
  Reste (couvert par R3) : indicateur visuel discret pendant ce gel.
- [~] **R2 (P1) Failsafe 2 s : ne pas démarrer la timeline sur du contenu absent.** — CŒUR FAIT it.6
  Re-preuve actualisée post-it.1 : la crainte originelle est déjà à moitié résolue — pour une
  VIDÉO bg absente, le stall gate R1 (`timeControlStatus == .waiting`) gèle la barre après le
  failsafe. Trou résiduel prouvé = IMAGE bg lente (status nil → jamais gatée → barre sur le
  ThumbHash flou) + vidéo fg sans player sur fond couleur.
  ✅ it.6 : `isPrimaryMediaPending` dans le rule engine + sonde `isBackgroundImagePending()`
  (`backgroundLayer.hasFinalContentStamped`, unique choke point `stampFinalImage` — tous
  chemins) ; watchdog 5 s anti-deadlock inchangé. Le failsafe readiness 2 s peut toujours
  démarrer le TIMER mais la barre GÈLE dès le premier tick tant que le bitmap final n'est pas
  là, reprise en phase au stamp. AUCUNE modif de la machinerie readiness (risque deadlock ~0,
  pattern R1 éprouvé).
  RESTE (avec R3/U5) : indicateur « chargement prolongé » pendant ce gel (spinner discret),
  timeout long UI d'erreur (10-15 s, retry/skip), et le cas résiduel vidéo FG sans player
  attaché sur fond couleur (rare : URL non résolue + fond non-média).
- [x] **R3 (P1) Indicateur de buffering pendant un stall mid-slide.** ✅ it.7
  Livré app-side (`StoryViewerView+Canvas.swift`, PAS de nouveau fichier — meeshy.sh build ne
  relance pas xcodegen) : `handleStallIndicatorSignal` branché sur `onPlaybackProgressing`
  (sans toucher le forward slideTimer) — apparition différée 350 ms (grâce anti-flash sur
  micro-stall seek/loop), disparition immédiate ; `StoryPlaybackStallIndicator` = ProgressView
  blanc 52 pt sur `.ultraThinMaterial` Circle, colorScheme .dark épinglé (règle « blanc sur
  verre Light »), a11y label ; gate `slideContentProgress >= 0.95` (le loader initial couvre
  le chargement) + reset au slide-change (le canvas n'émet pas au reset).
  Vérif : simulateur — story lue normalement, barre avance, AUCUN spinner parasite en lecture
  saine (screenshot) ; build 23 s vert. Reste terrain : provoquer un vrai stall réseau device
  (à grouper avec les tests device réseau dégradé).
- [x] **R4 (P1) Deep link / notification : rendu progressif au lieu du spinner bloquant.** ✅ COMPLET it.42
  ✅ Incrément 1 (le cas majoritaire) : `ensureGroupAvailable` est désormais CACHE-FIRST —
  `loadStories()` (SWR : .fresh zéro réseau / .stale servi + refetch silencieux) sert le tray
  du cache 24 h AVANT tout réseau ; le body réactif (`groupIndex` sur @Published) monte le
  viewer sans spinner. `forceNetwork: true` ne court plus QUE si le cache ignore le groupe
  (comportement historique conservé, y c. guard isLoading vs boot load).
  ✅ Incrément 2 (it.42) : `StoryViewModel.ensureStoryLoaded(postId:)` — fetch unitaire
  `GET /posts/:id` tenté par le container ENTRE le cache-first et le full-tray bloquant,
  quand le point d'entrée connaît le post exact ; logique d'insertion extraite du sink
  storyCreated (`insertOrMergeStoryGroups`, contrat identique pinné par les 5 tests sink) ;
  guard expiry (deep link périmé → pas de groupe fantôme, `toStoryGroups` ne filtrant pas).
  Plumbing : `StoryViewerRequest.postId` + covers coordinator iPhone/iPad +
  `StoryActiveBridge` (notifications = LE chemin hors tray). NON branchés à dessein :
  FeedView/RootViewComponents/Bookmarks (ouvrent « stories de l'AUTEUR d'un post », le
  postId n'y est pas une story sûre). Résiduel documenté : deep link vers un USER hors
  tray sans postId → full refetch inchangé (exige un endpoint stories-par-user → G1/R8).
- [x] **R5 (P0) Garantir la relecture OFFLINE des stories vues.** ✅ COMPLET it.41
  (a) ÉCARTÉ après re-preuve it.2 : l'annulation des `prefetchTasks`/`currentVideoLoadTask`
  ne tue PAS un download en vol — le funnel `DiskCacheStore.networkData` exécute chaque
  download dans une `Task<Data, Error>` NON STRUCTURÉE (ligne ~281) qui va au bout et
  `save()` quoi qu'il arrive au caller (`Task.value` ne propage pas l'annulation).
  L'annulation n'empêche que les downloads PAS ENCORE lancés (prefetch adjacent) — choix sain.
  (b) ✅ it.2 : mécanisme SDK `DiskCacheStore.pin(_:until:)`/`unpin`/`isPinned` — registre
  fileKey→échéance persisté en sidecar caché `.pins.json` (hors sweeps via `.skipsHiddenFiles`),
  exemption dans `evictOverBudget` ET `evictExpired`, purge auto des pins échus, cohérence
  `invalidate`/`invalidateAll` (logout). Tests : DiskCacheStorePinningTests 7/7 + 3 suites
  DiskCacheStore en non-régression (39/39), build app vert.
  (b2) ✅ it.3 : câblage app-side dans `StoryViewModel.markViewed` — plan pur
  `pinTargets(for:)` (routage FeedMedia.type miroir du prefetch) + `pinDeadline(for:)`
  (expiresAt, fallback createdAt+21 h) + `pinStoryMediaForOfflineReplay` (fire-and-forget,
  ne télécharge rien → pas d'interaction MediaDownloadPreferences). Tests StoryViewModelTests
  (plan pur + câblage bout-en-bout via `isPinned`, story expirée → pas de pin).
  (c) ✅ it.41 : test d'intégration `test_offlineReplay_viewedStory_mediaResolvesFromDisk
  ThroughViewerKeys` (StoryViewModelTests) — contrat pinné : écriture avec la clé BRUTE
  `FeedMedia.url` (chemin prefetch), lecture avec la clé VIEWER reconstruite indépendamment
  (`URL(string:).absoluteString`, miroir de StoryViewerView.mediaIndex), résolution DISK-ONLY
  via les mêmes helpers zéro-réseau que les layers (`videoLocalFileURL`/`imageLocalFileURL`/
  `audioLocalFileURL`) + pin vérifié sous la clé viewer pour les 3 stores. Zéro requête par
  construction (helpers sync disk-only). Raffinement ÉCARTÉ (mineur) : stories de l'auteur
  courant non pinnées (pas de markViewed sur soi) — ses assets composer restent locaux.
  Reste terrain (avec les tests device réseau dégradé, cf. it.40 §user) : couper le réseau
  matériellement sur device et relire.
- [x] **R6 (P2) `OutboxKind.markStoryViewed` — état vu durable offline.** ✅ it.14
  Livré : kind appendé (règle append-only de l'enum), `MarkStoryViewedPayload`
  (cmid + storyId), coalescing par anchor = storyId (re-voir la même story remplace le row —
  mécanisme markAsRead réutilisé tel quel), `dispatchMarkStoryViewed` (POST /posts/:id/view,
  404 = story disparue → succès), `markViewed` passe par l'outbox via seam injectable
  (`markViewedOutboxEnqueuer`) — le POST fire-and-forget direct est remplacé.
  Test adapté : `test_markViewed_enqueuesDurableOutboxRecord` (seam).
- [x] **R7 (P2) Défense de routage média : sniff avant store.** ✅ it.15
  Livré : `StoryMediaStoreRouter.effectiveKind(declaredType:urlString:)` — rule engine PUR
  SDK (FeedModels) : extension reconnue > type déclaré > défaut .image. Branché dans
  `prefetchStoryMediaURLs` ET `pinTargets` (le pin protège le MÊME store que le rangement
  réel). 6 tests SDK + test app (image déclarée + .mp4 → store video).
  ÉCARTÉ de R7 après re-preuve : `StoryBackgroundLayer.loadImage` (:317 cité) résout son
  Kind depuis les EFFECTS (StoryMediaObject.mediaType), pas FeedMedia.type — autre source,
  à auditer séparément si un symptôme apparaît. Migration lazy des .mp4 orphelins du store
  Images : NON faite (option) — les orphelins expirent au TTL 1 an/éviction budget.
- [~] **R8 (P2) Consommation client des APIs G1 (delta / projection / cursor).** — INC.1 FAIT it.46
  ✅ Inc.1 DELTA : le refetch silencieux SWR (`.stale`) dérive son curseur du cache
  (`deltaSince = max(StoryItem.updatedAt)` — état dérivé, zéro nouvelle source de vérité) et
  appelle `list(updatedSince:)` ; merge REPLACE via `insertOrMergeStoryGroups(replacingExisting:
  true)` (isViewed MONOTONE + viewedAt préservé, stories pendantes intactes par construction) ;
  toute erreur delta → fallback full. `StoryItem.updatedAt` optionnel (migration douce, copié
  par toStoryGroups) ; protocole `list(cursor:limit:updatedSince:)` + extension compat 2-params.
  ⚠️ Le delta ne sert RIEN tant que le gateway prod n'est pas déployé (G1a serveur) — inoffensif
  d'ici là (le serveur ignore le param inconnu → réponse full → merge replace = même résultat).
  RESTE : inc.2 pagination cursor client (`hasMore`/`nextCursor` déjà servis par G1c, décider
  l'UX tray >50) ; inc.3 consommation `?projection=tray` (exige fetch full au tap → R4 inc.2 le
  fournit ; à séquencer après déploiement prod).
- [x] **R9 (P2) Chiffrer le store `stories`.** ✅ it.19
  `encrypted: true` (1 ligne). Migration douce sans code : rows legacy en clair → decrypt
  fail → cache-miss propre (contrat DÉJÀ pinné par GRDBCacheStoreEncryptionTests
  test_load_whenDecryptFails) → un refetch réseau unique au premier lancement.
  NOTE : le coût d'écriture du blob tray unique ré-encodé/chiffré à chaque write renforce
  R12 (store relationnel par groupe) — les deux items sont liés.
- [x] **R10 (P3) `content` legacy résolu sur la chaîne complète.** ✅ it.27
  Surcharge `resolvedContent(preferredLanguages:)` (première langue de la chaîne ayant une
  traduction ; aucun match → ORIGINAL, Prisme n°1) branchée dans toRenderableSlide.
  4 tests Prisme (fallthrough chaîne, ordre, no-match→original, sans translations).
- [x] **R11 (P3) `viewedAt: Date?` ajouté (migration douce).** ✅ it.35
  Champ optionnel sur StoryItem (rétro-compatible cache GRDB + payload serveur Bool-only,
  testé), posé par markViewed au flip local. `isViewed` reste le decode serveur.
  Consommateurs futurs notés : tri des vus, TTL pin R5 par date de vue.
- [~] **R12 (P2) Écritures ciblées du cache stories.** — RE-SCOPÉ + PLAN it.47
  ⚠️ Prémisse initiale INVALIDÉE par la re-preuve : writeToL2 range DÉJÀ une row CacheEntry
  par groupe (itemId=authorId, chiffrée individuellement) — pas de blob unique, pas de
  migration/clé-par-groupe/table dédiée à faire (non-objectifs documentés). Coût réel :
  persistStoryCache() ×11 = save() SYNCHRONE qui deleteAll+ré-encode/re-chiffre TOUTES les
  rows à chaque mutation même mono-story. Remède : APIs EXISTANTES du store (upsertPatch/
  mergeUpdate + dirty-flush débouncé 2 s, parité messages/conversations).
  Plan : `docs/superpowers/plans/2026-07-04-story-store-dirty-write-plan.md` — piège
  freshness consigné (mergeUpdate PRÉSERVE loadedAt ; seuls les sites post-réseau full
  gardent save).
  ✅ Inc.2 (it.48) : classification des 10 callers → TOUS mutations locales/push socket
  (le fetch full a son save() DIRECT hors wrapper — découverte qui réduit l'inc.2 au corps
  de persistStoryCache : save → mergeUpdate `{ _ in snapshot }`). Bonus sémantique : une
  mutation locale ne ressuscite plus un cache expiré (contrat SDK doesNotResurrectFreshness).
  Test caractérisation app (mutation → flushDirtyKeys → reload) ; freshness pinnée par
  GRDBCacheStoreFreshnessTests (SDK, préexistants). RESTE : inc.1 (upsertPatch mono-story
  site par site — gain marginal maintenant que le full-rewrite est débouncé/coalescé ;
  P3 de facto, à ne faire que si un profil montre l'encodage N groupes comme coût réel).

- [ ] **R13 (P3, découvert it.41) Clé cache média non normalisée entre écriture et lecture.**
  Preuve (script Foundation) : `URL(string: raw).absoluteString` ré-encode espaces/accents
  (`with space.jpg` → `with%20space.jpg`) — si le gateway émettait une URL média NON encodée,
  la clé viewer (mediaIndex, URL round-trip) divergerait de la clé prefetch/pin (string brute)
  → relecture offline cassée pour ce média + double entrée cache. Impact actuel : nul (URLs
  gateway générées encodées, test it.41 vert sur le cas nominal). Fix si symptôme : dériver
  la clé via le MÊME round-trip URL aux deux bouts (pinTargets/prefetch). Pas de fix spéculatif.

- [x] **R14 (P2, découvert it.49) Le reader iOS ne rend PAS les clipTransitions (crossfade
  intra-slide).** ✅ it.50 Preuves : `ReaderTransitionResolver.opacity` (StoryReaderResolvers.swift:28,
  maths complète + testée StoryCanvasReaderTransitionTests) n'a AUCUN caller de production
  (vestige du reader SwiftUI supprimé Phase A4) ; le canvas CALayer (StoryCanvasUIView*/
  StoryRendererCache) ignore `clipTransitions` ; seuls le preview timeline et VideoCompositor
  (export) les rendent → l'auteur voit son crossfade en preview mais PAS dans la story
  publiée (la donnée traverse pourtant le publish depuis E2/it.4). Piste : point de tick =
  StoryRenderer.swift:131 → cache.layer(for:at:) ; ⚠️ PIÈGE PERF consigné : NE PAS mettre le
  facteur transition dans ItemSignature (opacité continue → cache miss/rebuild layer PAR TICK,
  re-création AVPlayer pour les vidéos) — muter `layer.opacity` en POST-PASSE par tick
  (sig.opacity × ReaderTransitionResolver.opacity), cache intact. Vérifier au passage comment
  les keyframes opacity vivent déjà avec la signature (même hazard potentiel préexistant).
  W1 inc.4 (portage web) utilisera la MÊME référence — à faire après ou avec R14.
  LIVRÉ it.50 : post-passe par tick dans StoryRenderer.render (.play), opacité ABSOLUE =
  base build-order (fadeOpacity > kf opacity > 1) × ReaderTransitionResolver.opacity,
  HORS ItemSignature (cache intact, pas de re-création AVPlayer), re-posée à chaque tick
  pour les clips impliqués (facteur 1.0 hors fenêtre = restauration). 3 tests
  RenderIntegrationTests dont « cached-ticks : 0.5 → 0.2 absolu → 1.0 » ; 10/10 avec la
  non-régression StoryCanvasReaderTransitionTests ; build app 86 s vert. Reste visuel
  simulateur : à grouper avec une story de test portant un crossfade (composer requis).

- [x] **G7 (P2, découvert it.61 — audit ciblé) Hard-delete des stories = rows PostMedia
  orphelines À VIE.** ✅ FIXÉ it.61 (volet DB).
  Preuve : PostMedia.post ET .comment = `onDelete: SetNull` (schema:3075-3076 zone) — le
  sweep ExpiredStoriesCleanupService supprimait posts+reposts+comments mais AUCUNE row
  média : chaque story expirée (100 % expirent, contenu le plus média-lourd) laissait ses
  rows orphelines sans chemin de récupération. Les autres enfants (reactions/views/
  mentions) cascadent correctement ✅. Fix : purge explicite des 2 jambes (postId des
  stories+reposts, commentId de leurs commentaires collectés AVANT leur delete) avant le
  post.deleteMany. 9/9 suite (2 tests neufs : ordre + jambe commentId).
  RESTE (suivi, volet 2) : réclamation des FICHIERS DISQUE des médias hard-deleted
  (résolution fileUrl→chemin UPLOAD_DIR + variantes TTS/transcriptions, prudence prod —
  à faire avec un accès prod ou en déploiement).

### BACKEND — instantanéité réseau

- [~] **G1 (P1) Tray léger + delta-sync.** — DELTA-SYNC FAIT it.13
  ✅ Incrément (a) : `GET /posts/feed/stories?updatedSince=<ISO8601>` — ne renvoie que les
  stories créées/modifiées depuis le timestamp (`where.AND += { updatedAt: { gt } }`),
  convention alignée sur le précédent `GET /conversations?updatedSince`. Timestamp invalide
  ignoré (full). Rétro-compatible. Disparitions couvertes par story:deleted + expiry client.
  ✅ Incrément (b) it.44 : `?projection=tray` — `trayStorySelect` canonique dans
  postIncludes.ts (Prisma.validator ; ids/timestamps/author/media/repostOf minimal ;
  SANS storyEffects/translations/comments preview) ; whitelist stricte (toute autre
  valeur → plein corps) ; requête réactions coupée sous projection, isViewedByMe conservé
  (anneaux). Deux findMany explicites (spread conditionnel select/include = union rejetée
  par l'overload Prisma — piège consigné). AUCUN client ne la consomme encore (opt-in).
  ✅ Incrément (c) it.45 : pagination keyset (createdAt, id) desc, take limit+1 — patron
  exact getStatuses ; retour `{ items, nextCursor, hasMore }` (getStories était la seule
  liste non paginée du service) ; route : `?cursor` + `?limit` (clamp 1..50, défaut 50 =
  plafond historique), hasMore/nextCursor dans l'enveloppe pagination standard, `data`
  reste le tableau (clients existants inchangés). Compose avec ?updatedSince et
  ?projection=tray. VOLET SERVEUR G1 COMPLET (a+b+c).
  RESTE (client + infra) : R8 — consommation iOS du delta + projection + cursor
  (`fetchStoriesFromNetwork` + merge, fetch full au tap via R4 inc.2) ; index Prisma
  `@@index([type, updatedAt])` sur Post à poser avec un déploiement schema ; DÉPLOIEMENT
  gateway prod (pull+up explicite) avant que le client s'y branche.
- [x] **G2 (P2) Double pipeline de traduction du `content` story.** ✅ it.20
  Fix : `shouldTranslateContent = content && postType === 'POST'` (la branche STORY retirée
  de la route ; le service audience-driven `triggerStoryTextTranslation` possède la
  traduction). La suite dédiée `core.story-translation.test.ts` PINNAIT l'ancien monde
  (son test « should not double-translate » ne voyait pas le double côté service !) —
  adaptée au nouveau contrat : la route ne déclenche AUCUN pipeline story.
  DÉPLOIEMENT : gateway prod = pull+up explicite (comme G1).
- [x] **G3 (P2) textObjects → langues audience-driven.** ✅ it.21
  Livré : résolution partagée `resolveAudienceTargetLanguages(authorId)` (extraite du
  pipeline content) + cœur pur `PostService.audienceLanguages` (dédup, hors 'en', cap 10,
  testé ×4) ; le pipeline textObjects l'utilise (async + authorId), liste fixe SUPPRIMÉE ;
  audience vide → zéro job ZMQ (l'original sert le Prisme). Même règle que le content.
  DÉPLOIEMENT gateway requis (avec G1/G2).
- [ ] **G4 (P3) Champ mort `Post.storyViews Json?`** (schema L2874, jamais écrit/lu — PostView
  est la vérité). Retirer du schema (migration) ou documenter.
- [x] **G5 (P3) Consolider les 3 implémentations de visibilité** ✅ it.60
  `buildPostVisibilityOrFilter` (posts/postVisibility.ts, à côté de son miroir impératif
  canUserViewPost) = source unique ; les deux services délèguent (no-op strict, chaque
  call site garde son audience) ; shape pinnée par suite dédiée. La consolidation a
  RÉVÉLÉ la vraie divergence → décision produit §4 ci-dessous. 134/134, tsc 0.
- [x] **G6 (P3) Constante d'expiry unifiée.** ✅ it.26
  `StoryItem.defaultExpiryInterval = 21 h` (aligné STORY_EXPIRY_HOURS serveur) remplace le
  défaut interne 24 h d'`isExpired` ; test du contrat + pins adaptés (le pin 24 h a échoué
  comme attendu — preuve que le piège était réel). toStoryGroups/pinDeadline déjà à 21 h.

### WEB (secondaire — parité lecteur)

- [x] **W1 (P2) Keyframes/transitions non rendus.** ✅ COMPLET it.51
  Plan : `docs/superpowers/plans/2026-07-03-web-story-keyframes-plan.md`.
  ✅ Inc.1 : portage 1:1 de `KeyframeInterpolator.swift` en TS pur (`story-transforms.ts` —
  tri, constante, clamp, easing du kf BAS, canaux indépendants, time relatif au startTime),
  hook playhead rAF activé UNIQUEMENT si le slide a des keyframes (hérite du gel W2 :
  startedAtRef nul → temps figé), appliqué aux TEXTOBJECTS (x/y/scale/opacity).
  ✅ Inc.2 (it.24) : mediaObjects foreground animés (mêmes canaux, style factorisé,
  slideHasKeyframes étendu).
  ✅ Inc.4 (it.51) : `resolveClipTransitionOpacity` — portage 1:1 des maths
  ReaderTransitionResolver (référence R14) : sortant/entrant linéaires, multiplicatif,
  dissolve ignoré, clips hors fenêtre masqués sur slides à transitions ; rAF armé aussi
  sur transitions-seules (gel W2 hérité) ; opacité FG = kf × facteur, styles intacts sans
  transitions ; type `clipTransitions` ajouté au StoryData local (passthrough serveur déjà
  intégral). 154/154 les 9 suites story web (7 tests parité neufs).
  Inc.3 (rotation animée) = non-item tant que le composer ne l'émet pas (plan).
- [x] **W2 (P2) Timer découplé de la vidéo.** ✅ it.22
  Porté le pattern iOS R1/R2 : `isBuffering` piloté par les événements natifs du <video>
  principal (waiting/stalled → gel ; playing/canplay → reprise), watchdog 5 s anti-deadlock
  (parité playbackStallWatchdogSeconds), barre CSS gelée via prop `isFrozen` (pause OU
  buffering). BONUS préexistant corrigé : le timer repart du temps RESTANT (avant, une
  pause rejouait la durée entière pendant que la barre CSS gardait sa position → désync).
  Handlers posés sur les 2 formes de fond vidéo (mediaUrl + mediaObjects isBackground).
  Piège de test consigné : avec fake timers, le timer reposé par un effet React post-watchdog
  ne se flush qu'à la fin de l'act → découper les advanceTimersByTime.
- [~] **W3 (P2) Composer web : visibilités COMMUNITY/EXCEPT/ONLY + overlays.** — INC.1 it.52
  ✅ Inc.1 : COMMUNITY au sélecteur (sémantique complète sans picker, labels 4 langues) +
  `visibilityUserIds` plombé composer → feed screen → createStory (service l'acceptait déjà).
  Décision pinnée par test : EXCEPT/ONLY N'ENTRENT PAS au sélecteur sans le picker
  d'audience (publier sans liste = visibilité cassée).
  ✅ Inc.2 (it.53) : `AudienceUserPicker` (components/v2 — recherche debouncée via
  useSearchUsersQuery générique, multi-sélection chips, hints par mode, 4 langues) ;
  EXCEPT/ONLY au sélecteur story ; publication gatée par `isAudienceIncomplete` (pur,
  testé) — jamais d'audience vide publiée. W3 côté VISIBILITÉS = COMPLET (6/6 parité iOS).
  RESTE (hors visibilités) : overlays composer web (texte positionné etc.) = chantier
  séparé, non couvert par cet item.
- [x] **W6 (P2, découvert it.52) PostComposer web publie EXCEPT/ONLY SANS visibilityUserIds.** ✅ it.54
  Preuve : VISIBILITY_OPTIONS contient EXCEPT/ONLY (PostComposer.tsx:26-27) mais
  handlePublish n'envoie que {content, type, visibility} (:48-52) — aucun picker, aucune
  liste → visibilité cassée côté serveur (EXCEPT sans exclus / ONLY sans inclus).
  LIVRÉ it.54 : picker + gate PARTAGÉS (promus dans le module AudienceUserPicker, source
  unique Story+Post) ; publish bloqué liste vide, reset au retour vers une visibilité
  non-audience, payload visibilityUserIds envoyé. 498/498 (33 suites story/feed/composer).
- [x] **W4 (P3) Realtime web : story:deleted + story:translation-updated.** ✅ it.28
  `story:deleted` abonné dans use-social-socket (événement absent) + handlers dans
  useStoriesRealtime : suppression → retirée du cache tray en direct ; traduction →
  merge PAR TEXT-OBJECT ({postId, textObjectIndex, translations} — parité iOS
  withTextObjectTranslationsMerged ; le type vit dans socketio-events, PAS post.ts).
  Piège évité en re-preuve : un premier jet écrasait s.translations (content) avec les
  traductions d'un textObject.
- [x] **W5 (P3) Préchargement du média du slide suivant.** ✅ it.29
  Fenêtre N+1 (parité prefetcher iOS) : Image() décodée pour les images, <video preload=auto>
  détaché pour les vidéos (cache HTTP partagé avec le montage suivant), cleanup au unmount.

- [~] **W7 (P2, découvert it.62 — audit ciblé) `storyEffects.background` URL arbitraire =
  tracking pixel des viewers.** ✅ FIXÉ WEB it.62 ; volet iOS À AUDITER.
  Preuve : le serveur ne borne background que par max(64) (types.ts:155 — une URL courte
  passe) ; le web injectait la string brute dans backgroundImage:url(...) → CHAQUE viewer
  requêtait le domaine tiers (IP/UA-leak de qui a vu, quand). Fix web :
  `safeBackgroundImageUrl` (chemins relatifs internes + origins front/gateway seulement,
  métacaractères CSS rejetés → rien ne sort du contexte url(), sinon fallback gradient),
  5 tests.
  (a) volet iOS ÉCARTÉ it.63 avec preuve : `effects.background` n'est consommé sur iOS que
  comme HEX (StoryRenderer.renderBackground → uiColor(fromHex:), aucune branche URL) ; le
  seul chemin URL directe du reader (slide.mediaURL legacy → directURLIfAny) provient de
  post.media[].fileUrl, GÉNÉRÉ par le gateway à l'upload (mediaIds ne référencent que des
  PostMedia existants) — hors de portée d'un payload client. Vecteur web-only, fixé it.62.
  (b) RESTE option serveur : refine Zod (hex|gradient:|chemin interne) — rétro-compat des
  stories existantes à URLs absolues internes, à trancher avec un déploiement gateway.

### DIRECTIVES PRODUIT UTILISATEUR (hors backlog initial)

- [~] **U-DIR1 Interstitiel d'identité inter-groupes (directive user 2026-07-03).** — it.8
  « Au passage au groupe de story d'une autre personne : pseudo + nom + présence en ligne +
  mood et message, bannière en fond, ~2,2 s avant le slide. »
  Livré : `StoryViewModel.resolveGroupIntro` (cache-first profiles, fetch si ni nom ni bannière,
  mood via feed statuses fetché UNE fois par session, seams closures pour tests) ;
  `StoryViewerView` : overlay plein écran zIndex 30 (bannière + ThumbHash/gradient fallback,
  avatar 88 pt storyTray, nom + @pseudo, badge présence PresenceManager, capsule mood glass),
  2,2 s (`groupIntroDuration`), tap = skip, gel lecture via `shouldPauseTimer || showGroupIntro`,
  exclusions : mes stories + mode preview ; placeholder immédiat enrichi pendant l'affichage.
  Tests : 4 nouveaux dans StoryViewModelTests. Décisions : interstitiel sur TRANSITION de
  groupe uniquement (pas à l'ouverture initiale du viewer — le tray vient d'afficher l'identité) ;
  skippable au tap (UX standard, non spécifié par la directive).
  Vérif : build vert, 78/78 StoryViewModelTests (4 nouveaux resolver), non-régression
  simulateur (ouverture/lecture/dismiss sains, aucun overlay parasite). ⚠️ La transition
  inter-groupes N'A PAS PU être déclenchée visuellement : l'environnement de test n'avait
  qu'UN groupe de tiers (stories elvira/J.Charles expirées pendant la session ; story publiée
  via compte BIGBOSS non visible — pas contact). RESTE : validation visuelle dès que 2+
  groupes de contacts existent (ou device user) + éventuel réglage design.

### UI/UX — design system par version d'iOS (à traiter APRÈS les P0/P1 fonctionnels)

- [x] **U1 (P2) Transition tray→viewer** ✅ COMPLET it.57
  Livré : `zoomTransitionNamespace` (EnvironmentKey SDK) + helpers `zoomTransitionSource/
  Destination` (atomes gated #available(iOS 18), no-op sinon — zéro régression 16-17) ;
  RootView injecte le namespace + destination sur le cover coordinator (sourceID =
  request.id, fallback cover standard sans bulle enregistrée) ; StoryRingCell = source
  (id = group.id). VÉRIFIÉ SIMULATEUR 18.2 : login atabeth, tap bulle J.Charles → zoom
  capturé EN VOL (scale centré coins arrondis, écran sous-jacent visible — signature zoom,
  pas le slide-up standard), viewer sain (progression/chrome/traduction), drag-dismiss
  custom SANS conflit (risque flaggé levé), appearScale/interstitiel/cube intacts.
  Captures scratchpad it56-t4/now/dismissed.png.
  ✅ Inc.2 (it.57) : mini-trail épinglée + MyStory = sources ; ConversationView covers ×2
  + iPad covers ×2 = destinations ; iPadRootView = namespace + injection (parité RootView).
  sourceID vide/non enregistré → cover standard (fallback guard). Re-vérif simulateur :
  le chemin principal zoome toujours avec TOUTES les sources enregistrées (pas de
  régression id dupliqué grande/mini). Restes visuels mineurs (non bloquants) : déclencher
  visuellement mini-trail épinglée + iPad — à grouper avec une passe device.
- [x] **U2 (P2) Haptics du reader.** ✅ it.25
  Livré via l'abstraction multi-version EXISTANTE `HapticFeedback` (UIImpactFeedbackGenerator,
  iOS 16+) : tick léger au changement de slide + gel perceptible quand le spinner R3 apparaît
  (après la grâce 350 ms — pas de haptic sur micro-stall) + reprise SI le gel avait été montré.
  Publication réussie : déjà couvert (HapticFeedback.success au publish, it.12 constaté).
  Décision : pas de doublon .sensoryFeedback 17+ — l'abstraction existante est le single
  source du produit ; migrer TOUTE l'app vers .sensoryFeedback = chantier design system global.
- [x] **U3 (P2) Chrome du reader en matériaux natifs** ✅ ÉCARTÉ it.58 — DÉJÀ FAIT.
  Re-preuve : le constat it.39 (« fonds opacity custom ») est périmé. Inventaire réel :
  bouton ⋯ header = ultraThinMaterial+overlay+stroke+shadow (Sidebar:703-709) ; panneau
  langues = capsule material (:413-417) ; capsule langue = `adaptiveGlass` (:124) ; spinner
  R3 + capsule mood U-DIR1 = material. Et `AdaptiveGlass.swift` (MeeshyUI/Compatibility)
  fournit DÉJÀ l'abstraction iOS 26 : `glassEffect` natif 26+ / fallback material < 26 —
  exactement la cible U3. Restes NON retenus (valeur nulle) : X preview-mode (black 0.5,
  surface composer), X d'annulation réponse (micro-chrome), cercles INTERNES du panneau
  langues (déjà sur material parent), rail de progression (fonctionnel, ne pas toucher).
- [~] **U4 (P2) Reprise de brouillon.** — PLAN POSÉ it.36
  Plan : `docs/superpowers/plans/2026-07-04-story-draft-resume-card-plan.md` (constat :
  alerte texte nue à StoryComposerView:198 ; cible : carte cover composite via le chemin
  it.3 renderComposite + restore médias existant ; 3 incréments, pièges consignés).
  ✅ Inc.1 (it.37) : `DraftResumeCard` (MeeshyUI, params opaques : cover/slideCount/
  updatedAt/onResume/onDiscard ; dégradation cover nil ; a11y ; helper pur freshnessLabel
  testé ×4 avec clamp horloge future).
  ✅ Inc.2 (it.38) : alerte texte REMPLACÉE par l'overlay DraftResumeCard — cover composite
  du 1er slide rendu async APRÈS affichage (loadMedia sans muter le VM), voile 0.55,
  dismissal explicite seulement. Pièges : StoryCoverThumbnail est APP-side → taille
  littérale 270×480 SDK-side ; updatedAt absent de l'API draft store → fraîcheur omise
  (micro-item futur). RESTE : inc.3 chip tray (décision produit §4).
- [x] **U5 (P3) État de chargement prolongé** ✅ ÉCARTÉ it.59 — l'essence est DÉJÀ servie.
  Preuve : `StoryReaderLoadingOverlay` (chargement initial : ThumbHash + cover serveur
  warm-cache + spinner % avec grâce 200 ms, fade à 95 %, suit le cadrage carte) ; R3 couvre
  le mid-slide ; les TAP ZONES restent actives sous l'overlay (allowsHitTesting(false)) =
  « passer » disponible ; et le watchdog anti-deadlock 5 s (invariant §5.9) fait avancer la
  story même sur média mort — jamais de blocage. La « progress ring avatar » = variante
  cosmétique du spinner existant, sans valeur ajoutée.
  DELTA réel non couvert (micro-décision produit si souhaitée) : pas d'UI d'ERREUR explicite
  sur réseau mort (l'utilisateur voit le ThumbHash flou défiler en auto-advance) — état
  d'erreur visible avec retry = choix design à valider user avant d'exister.
- [x] **U6 (P3) Dynamic Type/VoiceOver du viewer.** ✅ COMPLET it.34
  ✅ Annonce VoiceOver au changement de slide (« Story N sur M », gated
  isVoiceOverRunning, clé localisée statique — piège : String(localized:) exige une
  StaticString comme clé, pas d'interpolation dedans).
  ✅ Inc.2 (it.33) : actions VoiceOver custom « Story suivante / précédente » sur le canvas
  (la navigation est une gesture spatiale par position x, inatteignable en VoiceOver) +
  accessibilityLabel du canvas (contenu CALayer invisible d'UIAccessibility),
  .accessibilityElement(children: .ignore).
  Inc.3 ÉCARTÉ avec preuve (it.34) : `StoryProgressBarsView` porte DÉJÀ
  `.accessibilityValue("N pourcent")` + label position + segments accessibilityHidden
  (+Content.swift:2149-2151, passe PR #1211). U6 complet : annonce slide-change (it.31)
  + actions rotor prev/next (it.33) + barre déjà couverte.
- [x] **U7 (P3) ProMotion.** ✅ ÉCARTÉ it.30 — déjà satisfait : le timer viewer pose
  `CAFrameRateRange(min 30, max 60, preferred 60)` (StoryReaderTimerController:270, jamais
  120 Hz) et le canvas est à preferred 60 (max 120 réservé aux keyframes edit). Granularité
  barre 1/300 confirmée. Aucun fix nécessaire.

## 4. Décisions produit EN ATTENTE (ne pas trancher seul)

- **Audience FRIENDS/EXCEPT divergente (découverte G5/it.60)** : le FEED élargit à
  friends ∪ contacts DM ; getPostById/canUserViewPost = friends STRICTS. Impact concret :
  une story FRIENDS d'un contact DM (non-ami formel) apparaît au tray mais le fetch
  unitaire (R4 inc.2) et les handlers réactions la REFUSENT. Trancher : élargir partout
  (contacts DM = cercle proche) ou restreindre le feed (FRIENDS strict). Le fix = 1 call
  site désormais (buildPostVisibilityOrFilter).

- E7 : câbler ou retirer le publish in-timeline (`handlePublishTap`).
- E8 : multi-draft (galerie) — oui/non + scope.
- WS5.4b (hérité) : promotion `media[0]` non flaggé en fond statique — règle produit requise.
- it.44 C.2 : import repost-as-post (compléter l'éditeur ou retirer le scaffolding).
- Phase 2 cover baké uploadé (tous les viewers voient les overlays dans le tray) — touche la
  règle RAW-publish/Prisme.
- P1 filtres : 6 filtres sans kernel Metal (unifier sur CoreImage vs écrire les kernels vs
  retirer de la grille) + it.58 (scope filtre bg-only vs composite) — chantier archi dédié.

## 5. Invariants à ne JAMAIS violer

1. **RAW publish** : jamais de MP4 composite uploadé au backend (Prisme Linguistique). Export
   MP4 = local auteur-only.
2. **Prisme règle n°1** : pas de traduction matchée → contenu ORIGINAL (jamais
   `translations.first`).
3. **SDK purity** : orchestration UX (cascades cache→downloader→policy, décisions « quand ») =
   app-side ; le SDK reste building blocks paramétrés.
4. **Ne jamais retirer d'effet visuel** (règle user) — optimisations INVISIBLES seulement.
5. **Un seul moteur audio call-safe** — pas de double-start ; gate `isCallActive`.
6. **Sanitize `file://`** avant tout POST (StoryEffects+Sanitization).
7. **TDD** : test RED avant fix ; ne jamais dégrader la prod pour faire passer un test.
8. **Mutations StoryItem IN PLACE** — jamais de reconstruction partielle (classe de bug it.42).
9. **Timer reader** : toute reprise re-seed `lastTick` (pas de saut) ; aucun chemin ne doit
   pouvoir DEADLOCKER la progression (failsafe anti-deadlock obligatoire sur les slides sans
   média).

## 6. Pièges d'exécution connus (mémoire projet)

- `meeshy.sh build` : grep « BUILD SUCCEEDED » dans le log, JAMAIS l'exit code ; exit 0 possible
  sur échec ; stale .app possible → rm + rebuild avant test simu.
- `meeshy.sh test` : lire le xcresult (totalTestCount/failedTests), pas l'exit ; exit 64 si
  `test-results/unit-tests.xcresult` existe déjà.
- Tests SDK : scheme `MeeshySDK-Package` (PAS MeeshyUI), simulateur 18.2 (CI pin), derivedData
  partagé (pas de path per-agent), `-clonedSourcePackagesDirPath` si contention SPM.
- `build-for-testing` ≠ exécuter les tests. Exécuter avant tout push main.
- Worktree potentiellement PARTAGÉ avec d'autres agents : jamais `git commit --amend`, jamais
  `gh pr checkout` ; vérifier `git status` avant de toucher un fichier modifié par un tiers ;
  commits SÉLECTIFS (pathspec).
- Xcode ouvert = deadlock build CLI (IDEContainer lock).
- MeeshyUI defaultIsolation = MainActor ; tests non @MainActor ; Combine `.map` pré-receive =
  background (SIGTRAP si @MainActor) ; pas de raw `.onChange` (adaptiveOnChange iOS 16).
- Gateway : tests sous bun (`bun run test:coverage`), prisma generate + shared build d'abord ;
  route Fastify dupliquée = boot silencieusement cassé.
- Déploiement = push main → CI ; gateway prod nécessite pull+up -d explicite.
- **Bumps de version (directive user 2026-07-03)** : committer RÉGULIÈREMENT ; à chaque commit,
  vérifier `git diff` des 5 fichiers bump (pbxproj + 4 Info.plist) — si PUR bump de version,
  l'intégrer au commit (« Includes build NNNN version bump ») ; sinon le laisser.
- **CE FICHIER D'ÉTAT se committe RÉGULIÈREMENT (directive user 2026-07-04)** : jamais de
  modification locale qui attend le tour suivant — toute mise à jour (item coché, journal,
  hash post-push, piste de repérage) part dans le commit du tour courant ; si le hash n'est
  connu qu'après le push, un `git commit tasks/story-sota-state.md` immédiat suit le push
  (ne pas accumuler).

### MISSION D — chrome « au bon moment, à portée de doigts » (directive user 2026-07-10, IMG_0944/0976/0984)

> Session distante Linux (branche `claude/story-system-redesign-r972q7`) — gateway testé
> sous bun ici ; Swift relu ligne à ligne, builds/tests iOS à exécuter en CI/simulateur.

- [x] **D1 (P1) Présence auteur ABSENTE du payload stories** → interstitiel « Hors ligne »
  à tort ou résolu en retard. ✅ it.94 : `storyAuthorSelect` (= authorSelect + isOnline +
  lastActiveAt, dérivé par spread) appliqué au chemin stories UNIQUEMENT (full
  `storyPostInclude` + tray `trayStorySelect`) — l'audience est déjà gatée par la
  visibilité story ; le feed posts garde l'author lean. Types partagés
  `PostAuthor.isOnline?/lastActiveAt?`. SDK : `APIAuthor.isOnline/lastActiveAt`
  (optionnels rétro-compat), `StoryGroup.authorPresence: UserPresence?` propagé par
  `toStoryGroups` (+3 tests SDK). 3 tests gateway RED→GREEN
  (`PostFeedService.stories-presence.test.ts`).
- [x] **D2 (P0) Interstitiel de groupe affiché EN OVERLAY translucide du slide déjà rendu**
  (IMG_0976 : chrome + FABs visibles derrière « Windie Nh — Hors ligne »). ✅ it.94 :
  (a) base `Color.black` OPAQUE sous la bannière (pendant le chargement de la bannière,
  CachedAsyncImage rend un placeholder translucide — le slide transparaissait) ;
  (b) présentation INSTANTANÉE (plus de fade-in 0,22 s) dans la même transaction que le
  swap de groupe — le slide n'est jamais visible avant l'intro, seule la SORTIE est
  animée (c'est elle qui révèle le slide) ; (c) présence résolue AU switch :
  `presenceMap[userId] ?? group.authorPresence` (realtime prioritaire, snapshot serveur
  en fallback) ; (d) pré-résolution des identités des groupes ADJACENTS
  (`prefetchNeighborGroupIntros`, cache session `groupIntroCache`) — l'intro s'affiche
  COMPLÈTE (nom, bannière, mood) dès la première frame, plus d'enrichissement visible.
- [x] **D3 (P1) Rail d'actions du viewer : trop d'espace + apparitions en second temps**
  (IMG_0984). ✅ it.94 : `StoryActionRailPlan` (rule engine pur, 5 tests
  `StoryActionRailPlanTests`) — le SET de boutons est résolu d'un bloc à l'ENTRÉE du
  slide depuis le payload (compteurs inclus) et FIGÉ pendant la lecture ; la
  réconciliation commentaires met à jour le COMPTEUR mais ne fait plus surgir le bouton
  mid-slide. Densité : spacing 20/14 → 8/6, padding vertical bouton 8 → 3, gap
  glyph→label 4 → 2 ; rail ancré en BAS de sa bande (`.bottomTrailing`) — à portée de
  pouce, plus de vide central.
- [x] **D4 (P1) Composer : outils en barre HORIZONTALE bas + header en icônes flottantes**
  (IMG_0944 transposé). ✅ it.94 : `ComposerFABColumn` = HStack centré bas (48 pt,
  6 outils = 338 pt ≤ SE 375 pt), badges/swipe-up/swipe-down/a11y/Equatable conservés ;
  poignée fantôme C3 re-centrée. Header : barre 60 pt `.ultraThinMaterial` SUPPRIMÉE —
  X flottant à gauche, cluster verre (undo/redo/visibilité/preview/publier/⋯) à droite,
  AUCUN fond de barre ; slide strip = pill flottante autonome sous les icônes, visible
  seulement si utile (`slides.count > 1 || composerHasContent`). `ComposerChromePolicy`
  et la grammaire gestuelle existante inchangées.
- [ ] **D5 (vérif) Passe simulateur/device** : composer (barre bas + header flottant +
  strip conditionnel), viewer (rail compact ancré bas, membership figée), switch de
  groupe (intro opaque instantanée, présence correcte pour un auteur en ligne).
  + Déploiement gateway prod requis pour D1 (présence dans le payload).

## 7. Journal d'itérations (l'agent APPEND ici)

> Format : `## it.N — <titre> (<commit>)` + preuves (RED reproduit, tests verts, vérif visuelle)
> + items cochés/ajoutés ci-dessus. Si un item s'avère déjà corrigé ou infondé au re-check :
> le cocher avec la mention ÉCARTÉ + preuve, sans fix.

## it.104 — Fond vidéo réel CONFIRMÉ sain (composer+reader) + C17 : accessibilité canvas non localisée

- **Clôture positive de l'investigation vidéo it.101/it.103** : un vrai fichier vidéo
  (10s, thumbnail réelle, trouvé dans l'album Photos « Meeshy ») sélectionné comme fond —
  rendu PIXEL-PARFAIT immédiat dans le composer (aucun délai, aucun écran noir, contenu
  réel visible dès la sélection) ET dans le reader après publication (identique,
  full-bleed, cohérent composer↔reader — exigence explicite de la boucle user). Preuve
  définitive que it.101 (stub simulateur 1703 octets) était bien la seule cause du
  symptôme observé — le pipeline vidéo fond est sain de bout en bout.
- En inspectant l'arbre d'accessibilité pendant ce test, élément VoiceOver du média
  étiqueté « Vidéo » (FR) repéré → root cause plus large que prévu : TOUT le calque
  d'accessibilité du canvas story (`StoryCanvasUIView+Accessibility.swift`, partagé
  composer ET reader) utilisait des littéraux FR bruts jamais enveloppés dans
  `String(localized:)` — contrairement aux autres bugs it.95-it.103 (bundle manquant ou
  clé catalogue manquante), ici c'était une omission totale : « Vidéo »/« Image »,
  « Vidéo de fond »/« Photo de fond », « Sticker … », « Texte : … », et les 3 actions
  personnalisées VoiceOver (« Supprimer »/« Dupliquer »/« Mettre à l'arrière »).
- Fix : réutilisation maximale des clés déjà couvertes 5 langues (`story.media.video`,
  `story.media.image`, `story.composer.deleteSlide`, `story.composer.duplicateSlide`) +
  4 nouvelles clés SDK (`story.canvas.a11y.{backgroundPhoto,backgroundVideo,sendToBack,
  sticker,textPrefix}`, convention de/en/es/fr de ce catalogue). Tous les sites d'appel de
  `StoryCanvasUIView+Accessibility.swift` reliés à `String(localized:...,bundle: .module)`.
- 3 tests préexistants dans `StoryCanvasUIView_ReaderAccessibilityTests.swift` échouaient
  après le fix — PAS une régression : ils épinglaient les anciens littéraux FR/EN bruts en
  dur (même piège que it.99). Corrigés pour comparer contre le MÊME appel de localisation
  que la prod (`String(localized: "story.canvas.a11y.textPrefix", bundle: .module)`, etc.)
  au lieu d'un littéral figé — robuste à la locale de l'hôte de test, jamais fragile.
  800+ tests `MeeshyUITests` verts (exit 0) après correction.
- CI : run précédent (it.103, `012eeb61f`) montre un job Python translator "cancelled"
  — vérifié BÉNIN (`gh run view --job` : l'étape de test elle-même est passée ✓, seule
  l'upload de couverture a été annulée par un push plus récent dans le même concurrency
  group — sans rapport avec ce travail iOS/SDK).
- Story de test (fond vidéo réel) publiée puis laissée expirer naturellement (comme les
  précédentes, pas de nettoyage nécessaire).
- Reste HORS scope : audio de fond/premier-plan (lecture réelle), éditeurs plein écran
  dédiés — recherche de code n'a trouvé AUCUNE feature distincte de ce nom ; probablement
  une confusion avec les panneaux d'outils déjà testés (Media/Filtres/Timeline).

## it.103 — C17 suite : export MP4 (sous-titre sheet non localisé) + vérif flux complet

- Reprise HORS scope it.102 : export MP4 (jamais testé de bout en bout jusqu'ici).
  Sheet ⋯ Export (sidebar reader, author-only) ouverte sur une story publiée : titre
  « Export as video » + bouton EN corrects, mais le sous-titre affichait « Bake un MP4
  fidèle à la prévisualisation pour le partager hors Meeshy. » — FR au milieu d'un écran
  EN, MÊME signature que it.102 (mélange linguistique intra-écran). Particularité : le
  texte FR source lui-même contenait déjà un mot anglais (« Bake ») — coquille d'auteur en
  plus du défaut de localisation.
- Root cause : contrairement à it.95-it.102 (bugs SDK/MeeshyUI), ce fichier
  (`apps/ios/Meeshy/Features/Main/Views/StoryExportShareSheet.swift`) est APP-side — pas de
  piège `bundle: .module` ici. Cause unique : `story.export.share.subtitle` était
  ABSENTE à 100 % du catalogue APP alors que ses 4 clés sœurs du même écran
  (`.title`, `.errorTitle`, `.languageLabel`, `.languageOriginal`) étaient déjà
  complètes 5 langues depuis it.95 — un oubli isolé, pas un défaut structurel.
- Fix : clé `story.export.share.subtitle` ajoutée au catalogue APP (de/en/es/fr/pt-BR,
  position alphabétique correcte entre `languageOriginal` et `title`) + defaultValue Swift
  FR corrigée (« Bake » → « Génère »). VÉRIFIÉ SIMULATEUR après clean+rebuild (piège connu
  `meeshy.sh build` stale artifact rencontré et contourné) : sheet réouverte → tout le texte
  en EN cohérent (« Generates an MP4 that matches the preview, to share it outside
  Meeshy. »).
- **Flux export bout-en-bout vérifié fonctionnel** (jamais testé avant) : tap « Export as
  video » → bake réel → `UIActivityViewController` natif présenté avec un vrai fichier
  MP4 (« meeshy-story-export-6a5a2ac126....mp4 », 88 KB) → options Copy/Save
  Video/Add to Shared Album/Save to Files toutes présentes → fermeture propre, retour au
  reader sans crash. RAS, feature saine.
- Reste HORS scope : re-tester le fond vidéo avec un vrai fichier (tentative it.101/103 de
  contourner les stubs simulateur via `simctl addmedia` infructueuse — tri de la pellicule
  pas maîtrisable facilement en autonomie, abandonné faute de ROI), audio de fond/premier-plan
  (lecture réelle), éditeurs plein écran dédiés image/vidéo.

## it.102 — C17 suite : sheet audience EXCEPT/ONLY (sélection utilisateurs) non localisée

- Reprise du balayage systématique là où it.100 l'avait laissé HORS scope : la sheet
  audience EXCEPT/ONLY (déclenchée depuis le picker de visibilité → « Except… » / « Only… »)
  n'avait encore jamais été ouverte en QA. Test multi-slide en amont (ajout de 2 slides via
  « Add a slide », navigation entre miniatures, contenu texte distinct par slide) : tout
  fonctionne, RAS. Reorder par drag natif (`.draggable`/`.dropDestination`) et suppression
  via `.contextMenu` (long-press) : implémentés + couverts par
  `StoryComposerViewModelTests` (moveSlide/removeSlide/duplicateSlide), mais NON
  vérifiables au simulateur — même limitation tooling déjà documentée (idb long-press ne
  déclenche pas `.contextMenu` natif ; `.draggable` natif encore moins simulable qu'un
  `DragGesture`). Pas de nouvelle investigation forcée, confiance basée code+tests.
- Bug réel trouvé en ouvrant la sheet EXCEPT : titre « Tout le monde sauf » et placeholder
  « Rechercher... » affichés en FR alors que « Cancel »/« OK » (mêmes clés génériques
  `common.cancel`/`common.done`, déjà catalogués) s'affichaient correctement en EN — même
  signature que it.95/it.98 (mélange FR/EN au sein du MÊME écran).
- Root cause double, dans `packages/MeeshySDK/Sources/MeeshyUI/Story/AudienceUserPickerView.swift` :
  1. Les 3 `String(localized:)` (`audience.picker.except.title`, `.only.title`, `.search`)
     n'avaient PAS `bundle: .module` → résolution implicite contre `Bundle.main` (catalogue
     APP), qui ne contient pas ces clés SDK-only.
  2. Même en ajoutant `bundle: .module`, le catalogue SDK
     (`packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings`) ne contenait
     QUE la localisation `fr` pour ces 3 clés (`sourceLanguage: fr`) — aucune `en`/`de`/`es`.
- Fix : `bundle: .module` ajouté aux 3 appels + `de`/`en`/`es` ajoutés au catalogue SDK pour
  les 3 clés (convention de/en/es/fr de ce catalogue, pas de pt-BR ici — cf. it.99).
  Build vert (62s), 800+ tests `MeeshyUITests` verts (exit 0, 0 failure). VÉRIFIÉ
  SIMULATEUR : sheet réouverte après relaunch (draft 3-slides + sélection « Except »
  persistés à travers le relaunch — bon signal côté draft persistence) → « Everyone
  except » + « Search... » en EN, cohérent avec Cancel/OK. Draft de test jeté (Quit sans
  publier) après vérification.
- Reste HORS scope : re-tester le fond vidéo avec un vrai fichier (pas un stub simulateur),
  audio de fond/premier-plan (lecture réelle — sheet record ouverte mais record→stop→replay
  non concluant, friction tooling pas un défaut observé), éditeurs plein écran dédiés,
  export MP4.

## it.101 — Investigation fond vidéo « canvas noir » : ÉCARTÉ, artefact simulateur (pas un bug)

- Poursuite QA composer : sélection d'une vidéo comme fond dans le panneau Media. Le canvas
  composer restait NOIR ~7 s puis, après fermeture du panneau, affichait le canvas plein
  (letterboxé en 4:3, `canvasAspectRatio: 1.333` — conforme à la feature documentée
  « fond paysage impose la forme du canvas ») mais avec une bande centrale d'un INDIGO PLAT,
  jamais de vrai contenu vidéo (pixels de la scène filmée). Publié pour comparer avec le
  reader (story `6a5a2ac1260e799e740cab7c`) : reader reproduit EXACTEMENT le même symptôme
  (rectangle indigo plat, aucune image vidéo, aucun contrôle) — composer et reader
  COHÉRENTS entre eux (conforme à l'exigence user), mais ni l'un ni l'autre ne joue la vidéo.
- Root cause tracée via `xcrun simctl spawn ... log show` filtré sur le process Meeshy :
  `FigVideoQueueGMStats` répète en boucle continue pendant 4+ minutes
  `0 frames enqueued in the last 6 seconds ... max PTS: 0.000` — AUCUNE frame vidéo n'a
  jamais été décodée, pas une seule, ni au chargement ni après publish. Le fichier réel
  (`GET /posts/feed/stories` → `media[0]`) : `width: 320, height: 240, fileSize: 1703 bytes`.
  `ffprobe` sur ce fichier échoue à extraire le moindre stream vidéo (codec/dimensions vides)
  — ce n'est PAS un flux H.264/HEVC valide.
- 1703 octets est la taille EXACTE des `.MOV` seedés par défaut dans la bibliothèque Photos
  d'un simulateur iOS fraîchement provisionné (`DCIM/100APPLE/IMG_00XX.MOV`, vérifié : 20
  fichiers, tous 1703 octets, tous non-probables par ffprobe) — ce sont des stubs factices
  qu'Apple fournit pour peupler visuellement la pellicule sans embarquer de vraies vidéos.
  Le panneau Media du composer a picked l'un de ces stubs plutôt qu'un des 4 vrais MP4/MOV
  du simulateur (IMG_0013/16/17/18, tous probés OK : H.264/HEVC 720×1280 ou 1080×1920).
- **Conclusion : ÉCARTÉ.** Le canvas noir/plat est le comportement CORRECT d'un lecteur AVPlayer
  face à un fichier sans piste vidéo décodable — ni le composer ni le reader n'ont de bug ;
  aucune trace d'erreur applicative, `FigVideoQueue` attend simplement des frames qui n'existent
  pas dans le fichier source. Pas de fix de code. Pour retester le fond vidéo correctement,
  sélectionner un des 4 vrais MP4/MOV du simulateur (jamais un stub 1703 octets).
- Story de test `6a5a2ac1260e799e740cab7c` laissée en l'état (expire naturellement le
  2026-07-18, `FRIENDS` visibility, pas de nettoyage nécessaire).
- Reste HORS scope pour cette itération : re-tester le fond vidéo avec un vrai fichier,
  audio de fond/premier-plan (lecture réelle), multi-slide add/reorder/delete, sheet
  audience EXCEPT/ONLY (sélection d'utilisateurs), éditeurs plein écran dédiés, export MP4.

## it.100 — C17 suite : picker de visibilité (Communautés/Sauf…/Seulement…/Privé) non localisé

- Poursuite du balayage des surfaces annexes après le panneau Fond (it.99) : sheet ⋯
  Transitions re-vérifiée SAINE (même composant partagé `OpeningEffectChips`, fix it.99
  confirmé propagé aux DEUX surfaces). Bouton « Contacts » (icône personnes, header) →
  picker de visibilité `PostVisibility` : « Public / Communautés / Contacts / Sauf… /
  Seulement… / Privé » — mélange EN/FR à nouveau (« Public » et « Contacts » identiques
  dans les deux langues, ce qui masquait initialement le bug — 4 des 6 items trahissaient
  le FR).
- Root cause différente des tours précédents : `PostVisibility.label`
  (`packages/MeeshySDK/Sources/MeeshyUI/Story/PostVisibility.swift`) contient déjà un
  commentaire du développeur ORIGINAL documentant EXACTEMENT le piège `Bundle.module`
  MainActor rencontré en it.99 (« pas de `bundle:` (Bundle.module est MainActor-isolé
  sous MeeshyUI) → reste sûr ») — mais sa solution (omettre `bundle:`, résolution implicite
  `Bundle.main`) exige que les clés existent dans le catalogue **APP**
  (`apps/ios/Meeshy/Localizable.xcstrings`), jamais ajoutées. Preuve : les 6 clés
  `post.visibility.*` étaient ABSENTES à 100 % du catalogue APP (vérifié script) —
  `Public`/`Contacts` semblaient corrects par pure coïncidence orthographique FR≈EN.
- Fix : 6 clés ajoutées au catalogue APP (5 langues de/en/es/fr/pt-BR, ellipse Unicode
  réelle « … » préservée à l'identique du defaultValue source). Aucun changement de code
  Swift requis cette fois (le pattern `Bundle.main` implicite était déjà correct, seul le
  catalogue manquait). `LocalizationConsistencyTests` 2/2 verts. VÉRIFIÉ SIMULATEUR
  (scratchpad it100-*) : picker → « Public / Communities / Contacts / Except… / Only… /
  Private » entièrement EN.
- `PostVisibility` étant utilisé par le composer story ET potentiellement le composer post
  standard (nom générique, pas de préfixe `story.`), ce fix bénéficie aux deux surfaces
  sans travail supplémentaire.
- Balayage localisation composer/reader (it.95/97/98/99/100) : Media, Sound, Text, Drawing,
  Timeline, Background, sheet Transitions, picker Visibilité — tous vérifiés propres.
  Reste HORS scope : éditeurs plein écran image/vidéo dédiés, sheet audience EXCEPT/ONLY
  (sélection d'utilisateurs, pas encore ouverte), export MP4.

## it.99 — C17 suite : chips « Slide opening » (Fondu/Zoom/Glissement/Révélation) non localisés

- Poursuite de l'exploration systématique des outils (dernier restant : Background/Fond).
  Le panneau Fond affiche correctement en anglais (« Background », switch-chips Media/
  Sound/Drawing) MAIS sa section « Slide opening » montrait « None / Fondu / Zoom /
  Glissement / Révélation » — mélange EN/FR au sein du MÊME panneau. Même classe de bug
  que C12/C17, nouvelle surface.
- Root cause : `StoryTransitionEffect.label` (MeeshySDK **core**, pas MeeshyUI) retournait
  des littéraux FR bruts, jamais wrappés `String(localized:)`. Contrainte architecturale
  découverte en creusant : le target `MeeshySDK` core n'a AUCUN bundle de ressources/
  catalogue de chaînes (seul `MeeshyUI` en a un) — `bundle: .module` n'y est donc pas
  disponible. Décision : le label d'affichage est un souci UI, pas modèle (aligné avec le
  tableau de placement SDK-purity du CLAUDE.md racine) → `label` retiré du modèle SDK,
  remplacé par `OpeningEffectChips.title(for:)` (MeeshyUI, là où le catalogue existe déjà
  et où `story.composer.openingNone` prouvait le pattern).
  Piège Swift 6 rencontré : `nonisolated static func` a d'abord semblé le bon choix (miroir
  `BandStateMachine`) mais `Bundle.module` lui-même est MainActor-isolated dans ce target →
  échec de compile. Fix : garder la fonction MainActor implicite (comme le reste de la vue)
  et marquer le nouveau `@Suite` de test `@MainActor` plutôt que la fonction `nonisolated`.
- 4 clés ajoutées au catalogue **MeeshyUI** (pas le catalogue APP comme it.95/97/98 — bundle
  différent) : `story.composer.opening.fade/zoom/slide/reveal`, 4 langues (de/en/es/fr —
  ce catalogue n'a pas de pt-BR, cohérent avec l'existant `story.composer.openingNone`).
  Test ancien `testStoryTransitionEffectLabels` (pinnait les littéraux FR bruts) retiré —
  remplacé par `OpeningEffectChipsTests` (non-vide + distinct par cas, PAS de valeur exacte
  pinnée — la locale du simulateur de test peut désormais faire varier le résultat une fois
  la clé catalog présente ; leçon retenue des tours précédents).
  Build : piège `meeshy.sh build` faux-négatif « App bundle is older than build start »
  (2 tentatives) → `meeshy.sh clean` + rebuild complet a résolu. VÉRIFIÉ SIMULATEUR
  (scratchpad it99-*) : panneau Fond → « None / Fade / Zoom / Slide / Reveal » entièrement EN.
- Avec it.95/97/98/99, le composer et le reader sont maintenant audités quasi-exhaustivement
  pour la localisation (Media/Sound/Text/Drawing/Timeline/Background tous vérifiés visu).
  Reste HORS scope de cet audit (non exploré) : sheet ⋯ transitions (C7, mentionne aussi
  `closing` jamais rendu — cf. C7b), sheet audience/visibilité, éditeurs plein écran image/
  vidéo dédiés.

## it.98 — BUG RÉEL : le switch-chip Timeline ne fonctionnait QUE depuis l'état fermé

- Suite du /loop autonome, exploration systématique des outils composer restants (Sound,
  Drawing, Timeline, Background — Media/Text déjà couverts it.95/96). Reproduit 5× de
  suite sur simulateur (coordonnées re-vérifiées via `idb ui describe-all` à chaque tentative,
  scroll de la bande de chips confirmé, tap sur un chip SIBLING « Text » utilisé comme
  contrôle et fonctionnant du premier coup) : taper le chip « Timeline » depuis N'IMPORTE
  QUEL autre panneau déjà ouvert (Sound, Text, Drawing…) ne fait RIEN — le panneau affiché
  ne change pas, silencieusement, sans erreur.
- Root cause (code, `ComposerControlsLayer.swift`) : `onTapTile` spécial-casait encore
  `.timeline` (`if tool == .timeline { isTimelineVisible = true } else { bandStateMachine
  .tapTile(tool); selectTool(tool) }`) — un reliquat de l'ère « timeline en sheet modale »
  (avant 2026-07-14). Le refactor `02acbfc0e` a rendu `BandStateMachine.tapTile`/`tapFAB`
  GÉNÉRIQUES pour `.timeline` (plus aucune exclusion interne — confirmé par lecture directe
  + nouveau test), mais CE call site n'a jamais été mis à jour : il continuait à SAUTER
  l'appel `bandStateMachine.tapTile(.timeline)`, donc `machineState` restait bloqué sur
  l'ancien outil et `resolveEffectiveBandState` (jamais touché, ses tests restent valides
  inchangés) retombait sur `return machineState` puisque son override `timelineVisible`
  n'agit QUE si `machineState == .hidden` (design délibéré, cf. commentaire — correct pour
  l'entrée FAB depuis l'état fermé, jamais prévu pour le switch-chip depuis un panneau déjà
  ouvert).
- Fix minimal : `onTapTile` traite désormais `.timeline` UNIFORMÉMENT avec les autres outils
  (`isTimelineVisible = (tool == .timeline); bandStateMachine.tapTile(tool); selectTool(tool)`)
  — la machine gère la transition nativement, `resolveEffectiveBandState` n'a plus besoin
  d'intervenir pour ce chemin (son override reste utile pour FAB/bouton top-bar, entrées
  déjà `.hidden`). Effet de bord détecté ET corrigé dans la foulée : `onBackFromToolPanel`
  avait le même schéma conditionnel fragile (`if isTimelineVisible {…} else {…}`) — avec le
  fix, `machineState` peut désormais valoir `.toolPanel(.timeline)` APRÈS un switch-chip, et
  l'ancien conditionnel n'aurait fermé QUE le flag sans faire revenir la machine à `.hidden`
  (panneau resté ouvert au tap retour). Remplacé par le même schéma « toujours les deux »
  déjà utilisé par `onResizeDismiss` juste en dessous dans le même fichier (motif existant
  réutilisé, pas inventé) — `backFromToolPanel()` est un no-op sûr si l'état n'est pas déjà
  `.toolPanel`.
- Tests : nouveau `BandStateMachineTests.tapTileTimelineSwapsOpenPanel` (comble un TROU de
  couverture réel — l'équivalent `tapFAB` existait déjà mais pas `tapTile`, exactement le
  chemin cassé) ; 20/20 BandStateMachineTests + 5/5 ComposerControlsLayerEffectiveBandState
  Tests verts (suite `resolveEffectiveBandState` intacte, non touchée). VÉRIFIÉ SIMULATEUR
  bout-en-bout (captures scratchpad it98-*) : Drawing→(switch-chip)→Timeline s'ouvre
  correctement (transport, scrubber, « No tracks » — vs AVANT : rien ne se passait) ; bouton
  retour depuis Timeline referme proprement vers la rangée FAB (vs régression potentielle
  que le fix `onBackFromToolPanel` prévient).
- LEÇON méthodo (2e fois ce tour, cf. it.97) : un contrôle négatif (chip SIBLING qui
  fonctionne du premier coup) a été décisif pour distinguer "coordonnées idb fragiles" de
  "vrai bug produit" — sans lui, 5 échecs identiques auraient pu (à tort) être attribués à
  l'outillage de simulation comme le cas dessin/`idb swipe` rencontré juste avant dans la
  même session.

## it.97 — vignette « Mes stories » : ThumbHash trop basse-résolution pour le texte, overlay dédié

- Suite directe d'it.96. Re-preuve AVANT fix (protocole) : `MyStoryThumbnailResolver`
  (nouveau, testé 5/5) branché sur `storyEffects.thumbHash` d'abord — décodage confirmé
  RÉUSSI en isolation (test diagnostic temporaire : `UIImage.fromThumbHash(hash)` sur le
  hash RÉEL de production → image 18×32 valide, PAS nil) MAIS invisible à l'écran une fois
  affiché. Cause réelle (pas un bug de câblage, un plafond intrinsèque de ThumbHash) :
  18×32px = résolution insuffisante pour préserver des glyphes de texte fin — un smudge de
  luminance légèrement plus clair, indiscernable visuellement de la couleur de fond unie.
  Vérifié log runtime (`story.storyEffects?.thumbHash` bien peuplé, pas nil — la donnée
  ÉTAIT correcte, seul le pixel budget du format ThumbHash est en cause).
- Fix final : cascade fond (composite ThumbHash → thumbnailUrl brut → icône) INCHANGÉE
  (reste une amélioration réelle pour les stories vidéo/couleur où le hint de teinte/forme
  a de la valeur) + overlay `textObjectsOverlay` DÉDIÉ par-dessus, qui rejoue
  `storyEffects.textObjects` directement (aucun chargement réseau requis, contrairement au
  média) avec le même positionnement normalisé x/y que `SlideMiniPreview.textItem` (composer),
  à l'échelle miniature (36-64pt). `SlideMiniPreview` lui-même NON réutilisé tel quel : son
  layer de fond force `Color.black` dès `hasVisualBackgroundMedia` — incompatible avec la
  cascade CachedAsyncImage/ThumbHash déjà en place dans `MyStoryRow` (aurait masqué le fond
  réel). D'où l'overlay texte-seul dédié plutôt qu'une réutilisation monolithique.
- `MyStoryThumbnailResolver` (nouveau fichier, pattern `StoryThumbnailSizing` : enum pur
  statique + test XCTest co-localisé) : 5/5 tests. `xcodegen generate` requis (2 nouveaux
  fichiers, `meeshy.sh build` ne le lance pas) — build number restauré 1248 après (piège
  connu). 20/20 tests (resolver + sizing + guards MyStories + Localization) verts.
  VÉRIFIÉ SIMULATEUR AVANT/APRÈS (captures scratchpad it97-*) : « Hello SOTA » désormais
  lisible dans la vignette liste, avant = carré violet uni sans aucune trace de texte.
  Commit `a30c1b827`.
- LEÇON méthodo : avoir un test qui prouve le DÉCODAGE réussit (`fromThumbHash` != nil)
  n'était PAS suffisant pour prouver le FIX correct — la preuve visuelle simulateur reste
  irremplaçable pour juger de la LISIBILITÉ perçue, pas seulement de la non-nullité d'une
  valeur. Repéré via une instrumentation `print()` temporaire + capture du flux console
  (`simctl launch --console-pty`), retirée avant commit.

## it.96 — Vérif composer→reader (image+texte) : COHÉRENTE ; nouveau finding vignette liste

- Vérification directe demandée par le user (« veiller à ce que le READER FONCTIONNE en
  cohérence de ce qui se publie ») : draft repris (autosave E1 confirmé vivant — image
  fond violette + texte « Hello SOTA »), publié (toast « Story published » EN — confirme
  aussi C17 en conditions réelles), rouvert dans le VRAI reader (pas un test). RÉSULTAT :
  fond image plein cadre + texte centré blanc « Hello SOTA » — IDENTIQUE au composer.
  Sidebar EN (Send/Views/Export) + « 1 min » EN — C17 re-confirmé sur une story fraîche.
- Cross-check API (`GET /posts/feed/stories` authentifié) : `storyEffects.mediaObjects`
  (bg image, isBackground:true) + `textObjects` (« Hello SOTA », x/y 0.5/0.5) + `media[0]
  .thumbnailUrl` peuplé + `thumbHash` composite présent — payload RAW publish sain,
  round-trip complet.
- NOUVEAU FINDING (P2, non corrigé ce tour) : la liste « Mes stories » (`MyStoryRow.
  thumbnail`, MyStoriesView.swift) affiche `story.media.first?.thumbnailUrl` BRUT (juste
  l'image de fond, sans le texte ni le dessin) — alors que `storyEffects.thumbHash` (composite
  TOUTES couches, cf. it.1/it.2 de `story-consolidation-backlog.md`) existe déjà et est
  consommé ailleurs (tray, slide-strip). Pour cette story de test, le résultat visuel est un
  simple carré violet SANS le texte visible dans la liste — alors que le VRAI reader (ouvert
  juste après) montre bien le texte. Proof re-confirmée sur les 6 stories vides (§ C17
  écarté) : leur vignette générique était correcte (pas de média) ; CETTE story a un média +
  texte réels et le manque quand même dans la liste. Piste : brancher `MyStoryRow.thumbnail`
  sur le thumbHash composite (ou une image de couverture équivalente) au lieu du
  `media.first.thumbnailUrl` brut — cohérent avec le principe SSOT déjà appliqué ailleurs
  (StoryRenderer = source unique tray/slide-strip/reader/export, seul `MyStoryRow` diverge).
  PROCHAIN ITEM DE LA BOUCLE.

## it.95 — C17 : reader + Mes stories entièrement non localisés (catalogue APP) — 84 clés ajoutées

- Relance du user 2026-07-17 (« la composition de story ne semble pas si moderne ») —
  suite du /loop autonome. Étape 0 : lu l'état complet (it.1→it.94 + backlog), cross-check
  `git log` (dernier commit story = 7cb93260c, 2026-07-14 — 3 jours de silence story avant
  ce tour), rien d'inattendu.
- Action = exactement ce que demande la directive : build (`meeshy.sh build`, 86 s),
  simulateur (login `atabeth`, locale device EN), navigation réelle composer (Média→image,
  Texte→« Hello SOTA », panneaux Sound/Drawing/Timeline visités) — chrome composer
  correctement EN partout (C12 tient). Puis navigation « Mes stories » (liste + reader) :
  FRANÇAIS partout malgré device EN → C17 (détail §3, item complet).
- 3 rebuilds incrémentaux (17-56 s), `LocalizationConsistencyTests` 2/2 + 3 suites guard
  MyStories 7/7 verts, vérification simulateur AVANT/APRÈS à chaque étape (captures
  scratchpad `story-loop/`). Diff : 4 fichiers, +2953/-3 (100 % additions sur le xcstrings,
  round-trip vérifié).
- RESTE ce tour : (a) vignettes génériques dans « Mes stories » (photo icon, pas le
  contenu réel) — prochaine cible, à re-prouver dans le code (thumbnailUrl/url) avant fix ;
  (b) les 6 stories test du compte `atabeth` ouvertes montrent un canvas NOIR (slide 6/6) —
  à vérifier si c'est un slide de test authentiquement vide ou un bug de rendu, AVANT de
  publier une nouvelle story de test pour la vérif composer→reader (tâche encore ouverte) ;
  (c) item C17(b)(c)(d) — voir détail. Pas de commit/push encore effectué au moment de cette
  entrée (suit immédiatement, cf. protocole « committer régulièrement »).

## it.94 — MISSION D (directive 2026-07-10) : présence au switch + rail figé/dense + composer barre bas/header flottant (27d3fac→83e7bfe)

- Session Claude Code distante (Linux, branche `claude/story-system-redesign-r972q7`) —
  cartographie par 3 agents parallèles (composer / viewer / backend) avant toute ligne.
- D1 gateway+shared `27d3fac` : `storyAuthorSelect` scoped stories (full+tray), test de
  scoping (feed posts SANS présence). Vérifs LOCALES sous bun : suite nouvelle 3/3,
  suites feed 127/127, suites stories/includes 26/26, `tsc --noEmit` gateway exit 0,
  build shared vert. ⚠️ Le payload prod ne portera la présence qu'après déploiement
  gateway (comme G1a).
- D1 SDK `0fb6bfb` : APIAuthor.isOnline/lastActiveAt + StoryGroup.authorPresence
  (+3 tests StoryModelsTests). Init explicite APIAuthor avec défauts nil (les call
  sites memberwise des tests compilent inchangés).
- D3 `2ᵉ commit viewer` : StoryActionRailPlan figé par slide (@State + adaptiveOnChange
  story.id, fallback liveRailPlan au premier rendu — les compteurs sont seedés SYNC par
  startTimer avant le rendu, donc frozen == live à l'entrée) ; densité 8/6/3/2 ;
  ancrage `.bottomTrailing` du Layer 8.
- D2 `abd0346` : intro opaque instantanée + presenceMap ?? authorPresence +
  prefetchNeighborGroupIntros/groupIntroCache.
- D4 `83e7bfe` : ComposerFABColumn horizontal (l'ordre gauche→droite = media, text,
  drawing, son, texture, timeline — fréquence d'usage décroissante) ; header barre
  supprimé ; strip pill conditionnelle (`slides.count > 1 || composerHasContent`).
- ⚠️ Swift NON compilé dans cette session (pas de toolchain) — relu ligne à ligne ;
  CI iOS (xcodegen + build-for-testing) est le gate réel. D5 (passe simulateur) reste.
- Piège évité : postinstall `turbo run generate` suspendu ~30 min dans ce conteneur
  (cache distant inaccessible ?) — kill + `prisma generate` + `bun run build` manuels.
- **Boucle CI (PR #1806)** : run 1 = échec COMPILE du bundle de tests (exit 65) —
  `StoryActionRailPlan` implicitement @MainActor (defaultIsolation du target APP,
  pas seulement MeeshyUI) → fix `nonisolated struct` (parité StoryCanvasFraming) ;
  run 2 = compile OK, 3606/3609 verts, l'unique échec
  (`BubbleCallNoticeViewAccessibilityTests`) venait de MAIN (e3000c7 rouge sur son
  propre ios-tests, fixé sur main 64142ab) → merge de main 54e3c8f poussé.
  RÈGLE : le piège « tests non @MainActor » de MeeshyUI s'applique AUSSI au target
  app — tout nouveau type app-side consommé par MeeshyTests hors MainActor doit être
  déclaré `nonisolated` (rule engines) ou le test annoté @MainActor.

## it.1 — R1 : gel de progression étendu à l'audio (86c2c27de)

> ⚠️ it.3 : la CI (iOS Tests/SDK Tests/CI) était encore in_progress sur 07bb04765 et le commit
> it.2 au moment du push — vérifier `gh run list` en début d'itération ; rouge sur nos commits
> = priorité immédiate. (Les runs « cancelled » sur 86c2c27de = concurrency group, pas un échec.)

- RED : nouveaux tests `isAudioPending` (rule engine) + gate canvas ne compilaient/passaient pas
  sur l'ancien code (paramètre inexistant, playhead avançait sur audio non schedulé).
- Fix SDK (5 fichiers) : `StoryPlaybackHealth.swift` (+`isAudioPending`, guards intacts),
  `ReaderAudioMixer.swift` (+`hasStartedPlayback(slideKey:)`), `StoryCanvasUIView.swift`
  (+`slideHasSchedulableAudio`), `+Playback.swift` (watchdog vidéo OU audio, seam étendu),
  `+Audio.swift` (flag sync, `isSlideAudioPending()`, anti play-à-vide, re-pose post-configure).
- Bonus racine : le play() à vide (contentReady avant fin du pré-cache) causait le démarrage
  audio désynchronisé — désormais le schedule attend les buffers et part du playhead gelé.
- Vérif : 27/27 tests verts (suites StoryPlaybackHealthTests + StoryCanvasPlaybackHealthTests,
  simu iOS 18.2, scheme MeeshySDK-Package) ; `meeshy.sh build` → BUILD SUCCEEDED (app entière).
- Découvertes backlog : aucune nouvelle (le trou play-à-vide était le volet caché de R1, fixé ici).
- Piège noté : les guards de `isProgressing` réordonnés (userPaused/failed/watchdog AVANT le
  `guard let status`) — sémantique identique pour la matrice vidéo, nécessaire pour que les
  guards s'appliquent aussi aux slides sans vidéo (status nil + audio pending).

## it.2 — R5(b) : pin anti-éviction dans DiskCacheStore (32dd5753f)

- Re-preuve : R5(a) ÉCARTÉ (funnel réseau non structuré → downloads en vol survivent au
  dismiss — détail dans l'item). Vrai trou = éviction budget LRU sur stores partagés
  (video 500 Mo / audio 200 Mo / images 300 Mo, pression messagerie+feed vs story 21 h).
- RED : DiskCacheStorePinningTests (7 tests) — le plus vieux fichier LRU pinné était évincé.
- Fix : pin/unpin/isPinned + sidecar `.pins.json` caché + exemption des 2 sweeps + purge
  pins échus + reset au logout. SDK purity : building block à clés opaques, la politique
  « quoi pinner » reste app-side (it.3).
- Vérif : 39/39 (4 suites DiskCacheStore*) simu 18.2 ; `meeshy.sh build` vert (42 s).
- Ambiguïté tranchée : si TOUT est pinné et over-budget, la passe ne libère rien — accepté
  car les pins sont bornés par `until` (auto-résorption) ; documenté dans le code.

## it.93 — Audit ciblé n°6 (frontières éditeurs plein écran) : SEC — 2/2 → FIN DE BOUCLE

- onAccept image : bitmap + aspectRatio recadré + bump loadedImagesVersion (bug stale-canvas
  2026-05-27 couvert) ; édition durable draft/publish (bitmaps mémoire transmis) ; média
  sans bitmap impossible (purge lostMedia au restore). Zéro code.
- CRITÈRE D'ARRÊT ATTEINT (2 audits secs consécutifs : n°5 recorder, n°6 éditeurs).

**RAPPORT FINAL DU CYCLE it.66→93 (28 itérations, mission « création discrète
gesture-first + tout fonctionnel », directive user 2026-07-04) :**

~24 livraisons code vérifiées (tests + build + simulateur pour l'essentiel) :
- Tools réparés/ressuscités : timeline (C5 P0), transitions (C7 stub→réel), stickers
  (C8 + picker invisible fixé), ajout de slide (C6), gradients (C11 bout-en-bout).
- Grammaire gestuelle unifiée : chrome header⟺FABs (C-DIR2, ComposerChromePolicy),
  band replié→retiré, poignée fantôme (C3), double-tap zoom + snap (C4), ouverture par
  geste dans le panneau Fond (C1 + migration @State→VM), purge du geste mort (C2).
- Undo/redo GLOBAL (C9, 5 incréments : HistoryStore pur, capture 1-trigger sans trou,
  restore + purge paresseuse des bitmaps, UI conditionnelle, vérifié en conditions réelles).
- Intégrité : source de vérité stickers (C13), textes vides purgés (C15), échecs médias
  parlants (C16), reprise de brouillon fiable + couleur instantanée + letterbox couleur +
  carte non coupée (C-DIR4 4/4), carte reader flush sous le header (C-DIR5).
- Qualité : self-heal playback device (C-DIR3, log diagnostic), code mort purgé
  (C10, −1600 lignes, 2 extractions vitales), localisation complète fr/en/es/de
  (C12 + C14 a11y : VoiceOver parle la langue de l'UI), main débloqué (hotfix pbxproj
  +ViewBuilder), badge tray non coupé.
- Audits secs (surfaces déclarées saines avec preuves) : flux preview (n°2), voice
  recorder (n°5), frontières éditeurs (n°6).

**EN ATTENTE UTILISATEUR :**
1. Vérif device iPhone (C-DIR3 self-heal : story vidéo au boot doit jouer seule ;
   Console.app « self-heal kick » si problème) + retours visuels C-DIR5/BUG-2/BUG-4.
2. Décisions produit §4 : E7 publish in-timeline, E8 multi-draft, audience FRIENDS
   divergente, chantier filtres, cover baké Phase 2, WS5.4b media[0], C7b closing effect,
   import repost-as-post C.2.
3. Héritage cycle précédent : déploiement gateway prod groupé (G1a/b/c+G2+G3+G7+G5),
   index Prisma [type, updatedAt], vérifs device (offline replay, stall réel, crossfade,
   interstitiel 2+ groupes, zoom mini-trail/iPad), volet fichiers disque G7.
4. Web : parité gradients (C11) et opening (C7) si souhaitée.

## it.92 — Audit ciblé n°5 (voice recorder) : SEC — compteur 1/2

- 3 axes vérifiés SAINS : permission micro refusée → errorMessage localisé (piège
  d'isolation TCC/defaultIsolation documenté dans le code, crash 2026-06-15 déjà fixé) ;
  confirm/cancel des éditeurs audio propres (item=nil) ; temp file d'un vocal annulé =
  stratégie temp générale (purge iOS + cleanupTempFiles à l'upload) — pas d'orphelin
  problématique. Auto-open du recorder sur panneau vide = UX volontaire (C0).
- Zéro code. Audit n°6 (DERNIER si sec → STOP+rapport) : éditeurs plein écran
  image/vidéo (MeeshyImage/VideoEditorView — composants génériques, angle story :
  boundaries onAccept/onCancel + loadedImagesVersion).

## it.91b — C-DIR5 : la carte du reader se colle sous le header (alignement top)

- Directive user traitée dans le même tour que C16 (dont le push a été retardé par un
  lock git de l'agent parallèle — résolu, son merge a embarqué mon commit intact).

## it.91 — Audit ciblé n°4 (picker médias) → C16 trouvé+fixé — compteur 0/2

- « Rendre tout fonctionnel » inclut les échecs : un chargement qui rate doit le dire.
  Les surfaces majeures du composer sont désormais toutes auditées (chrome, band, texte,
  dessin[C0], stickers, médias, preview, a11y) — les prochains audits iront aux marges
  (voice recorder flux, éditeurs plein écran image/vidéo) ou constateront l'assèchement.

## it.90 — Audit ciblé n°3 (éditeur texte inline) → C15 trouvé+fixé — compteur 0/2

- Les « Texte vide » aperçus dans MES sessions simulateur étaient le symptôme — l'audit
  les a transformés en fix prouvé. Le payload publish ne transporte plus de textObjects
  fantômes (économie de jobs de traduction gateway au passage).

## it.89 — Audit ciblé n°2 (flux preview) : SEC — compteur 1/2

- Surface : bouton ▶ → snapshotAllSlides → onPreview → cover reader .preview → dismiss.
  3 suspects vérifiés SAINS avec preuves : (1) le snapshot re-build les effects du slide
  courant depuis l'état LIVE (`+Publication:80` — l'aperçu ne peut pas être périmé) ;
  (2) mute/unmute canvas symétriques (post mute au ▶, post unmute au onDismiss du cover,
  StoryTrayView:107) ; (3) rendu preview = moteur reader partagé (gradients C11, opening
  C7, stickers C13 hérités par construction) ; dismiss gestuel standard.
- Zéro code. Prochain (DERNIER avant STOP+rapport si sec) : audit n°3 — éditeur texte
  inline en profondeur (états/gestes/clavier) OU flux picker médias.

## it.88 — Audit ciblé n°1 (a11y gestes composer) → C14 trouvé+fixé — compteur sec 0/2

- Protocole étape 8 engagé. L'audit a produit du premier coup : VoiceOver annonçait des
  noms d'enum internes non localisés sur le chrome que la mission vient de refondre.
  Prochaine surface candidate (audit n°2) : flux preview (onPreview → reader .preview)
  ou éditeur texte inline en profondeur.

## it.87 — C11 : fonds dégradés bout-en-bout (format + 3 renderers + palette)

- Le re-scope d'it.77 respecté : d'abord le RENDU (source unique de parsing), ensuite
  l'offre UI. Les covers composites reflètent le dégradé (Prisme des miniatures).
  Dernier item autonome du backlog C — prochaine étape : protocole de fin (audits ciblés).

## it.86 — C12 : le chrome composer parle UNE langue (couverture fr/en/es/de complète)

- La mécanique du mélange élucidée : locale EN + clés partiellement traduites = alerte EN
  au-dessus de tuiles FR. 161 unités ajoutées par patch scripté byte-safe ; l'audit
  scripté est rejouable pour les futures clés.

## it.85 — C10 : purge du code mort (7 fichiers, −~1500 lignes, 2 extractions)

- Le build a servi de filet : StoryFilterProcessor vivait dans le fichier de la vue morte —
  récupéré depuis git en fichier propre. Suites filtres/history/text-bg vertes.

## it.84 — C9 Inc.4+5 : UI discrète livrée + cycle undo vérifié en conditions réelles

- La vérification s'est faite SUR le draft vivant du user (préservé) : mon trait accidentel
  de session a servi de mutation de test, retiré par l'undo global fraîchement livré.
  BUG-2 et BUG-4 confirmés visuellement au passage — C-DIR4 entièrement clos.

## it.83 — C9 Inc.3 : undo/redo appliqués, purge des médias devenue paresseuse

- Réutilisation clef : rehydrateZIndexMapFromSlide (déjà éprouvé au slide-switch) évite
  toute nouvelle logique z-order au restore. Le staging retired* borne la mémoire au
  contenu réellement supprimé pendant la session.

## it.82 — C9 Inc.2 : capture globale câblée (un trigger débouncé, zéro trou)

- L'insight E1 réutilisé : objectWillChange débouncé couvre TOUTES les mutations sans
  énumérer les call sites ; la dédup d'octets stables fait le tri. 16/16 (3 suites).

## it.81 — C9 Inc.1 : HistoryStore (pile d'états pure, 6 tests)

- Brique autonome livrée selon le plan ; l'évincé-retourné prépare la purge différée des
  bitmaps (piège Inc.3). Prochain : Inc.2 (seed + push aux 3 choke points).

## it.80 — C2 retiré (geste mort) + plan C9 posé (undo global par snapshots)

- C2 : le sens alternatif envisagé (swipe = switch d'outil) rejeté — conflit garanti avec
  les scrollers horizontaux internes des panneaux ; suppression nette.
- C9 : décision d'architecture documentée (snapshots vs commandes) — les mutations
  convergent déjà vers 3 choke points, la pile d'états est compacte (médias par clés).
  Exécution aux prochains tours (Inc.1 d'abord).

## it.79 — BUG-4 : carte cardée sous header fantôme + zoom viewport résiduel (2 fixes)

- Diagnostic 100 % au code (session sim laissée au user) : la capture 1:1,47 s'explique par
  la composition transform interne × carding, et la « coupe » du haut par la réservation
  du header masqué. Les deux corrigés ; le zoom viewport reste entier en présentation libre.

## it.78 — BUG-2 fixé (letterbox couleur de fond) ; BUG-4 signalé en direct par le user

- Le user teste EN DIRECT sur le même simulateur (sticker taco, dessin, changement de
  couleur — d'où la sheet vocale et le cyan apparus « seuls » dans ma session). RÈGLE
  adoptée : suspendre mes manipulations simulateur quand ses interactions sont détectées ;
  vérifs visuelles dans des fenêtres calmes ou sur ses captures.
- BUG-2 : préexistant à C-DIR2 (visible dès it74-B) mais révélé par l'unification du
  chrome. Le reader a probablement le même letterbox noir (masqué par son chrome) —
  parité à évaluer plus tard.

## it.77 — C-DIR4 : 2 bugs composer user fixés+vérifiés (couleur instantanée, reprise fidèle)

- Session simulateur laborieuse mais décisive : repro des 3 bugs (dont crash parasite de
  l'agent calls — appel entrant WebRTC a tué l'app mi-session, à ne pas confondre avec
  BUG-3), diagnostic par pixel-sampling, 2 fixes TDD livrés+vérifiés bout-en-bout.
  Piège consigné : depuis C-DIR2, QUITTER le composer exige de fermer le band d'abord
  (le X vit dans le header, masqué pendant l'édition) — mes anciennes coordonnées de
  session tapaient dans le vide.
- C2/C11 (P3) reportés : C11 re-scopé — le renderer n'a AUCUN parsing gradient depuis
  effects.background (l'offrir serait une UI mensongère) ; exige un format sérialisé
  (« gradient:HEX1:HEX2 » ?) + rendu + parité web → item enrichi, à trancher avec C7b.

## it.76 — C13 : stickers en passthrough currentEffects (source unique, plan + incrément atomique)

- Le test pinné de l'ancien monde (« deleted stickers must not resurrect ») encodait
  l'écrasement canvas-authored — réécrit au nouveau contrat, avec le test du BUG réel
  (mutation x d'un sticker survit au sync ; avant : revertée). Détail item C13 + plan.
- Directive user reçue en cours de tour (bannière d'appel réductible en bulle) puis ANNULÉE
  par le user (« pas dans tes activités » — domaine de l'agent calls). Aucune action.

## it.75 — C-DIR3 : self-heal du playback (kick borné quand un player reste .paused)

- Cause racine identifiée par lecture (pas de device requis) : didSet à garde d'égalité +
  pause externe = play() jamais rappelé ; le remède imite le geste réparateur du user
  (flip forcé), automatiquement, avec grâce/budget/log. Détail item C-DIR3.
- La vérif finale appartient au user (device réel) — le log story-media transformera tout
  échec résiduel en diagnostic précis (kick tiré ? re-pause immédiat ?).

## it.74 — C-DIR2 : vérification simulateur complète (a/b/c/d) + C3 visuel

- Cycle gestuel entier prouvé en 4 captures : (A) band ouvert = header absent + canvas
  entier cardé ; (B) grabber à fond = band fermé + chrome plein de retour ; (C) swipe-down
  FABs = canvas nu + poignée fantôme (C3 vérifié visuellement — restait de it.71) ;
  (D) tap poignée = chrome restauré. C3 item → vérif faite ; C-DIR2 → fermé côté autonome.
- CI du commit it.73 in_progress au moment de la vérif — à confirmer it.75.
- Prochain focus : C-DIR3 (playback device muet au boot — analyse code des chemins .play).

## it.73 — C-DIR2 (b)(c)(d) : chrome unifié header↔FABs + suppression du band replié

- Détail dans l'item C-DIR2. Le pattern C3 (poignée fantôme) devient l'UNIQUE mécanisme de
  chrome minimal — le band ne se replie plus, il se ferme. La grammaire finale : chrome plein
  (header+FABs) ⟺ canvas au repos ; band ouvert/édition/zoom = canvas + outil seuls ;
  swipe-down FABs = canvas nu + poignée fantôme.
- Piège : ComposerControlsLayerTests passait encore bandDrawerCollapsed (extra argument) —
  adapté ; commentaire périmé Band nettoyé.
- Reste : (a)-vérif simulateur mesurée (canvas jamais coupé, chaque panneau + clavier texte)
  + vérif visuelle des nouvelles transitions chrome — prochain tour, avec C3 visuel.

## it.72 — C8 : stickers de retour (bouton panneau Texte + picker réparé) + 2 directives user

- C8 complet (détail item) : le tap AVEUGLE sur la grille invisible a posé un sticker au
  canvas — preuve que data+flux étaient sains et que seul le RENDU du picker était cassé
  (.buttonStyle(.plain) manquant, picker jamais exercé depuis sa création). Nouveau C13
  (P2) : incohérence de source de vérité stickers (revert latent) réveillée par C8 — plan requis.
- Directives user reçues EN COURS de tour → C-DIR2 (P0 : canvas jamais coupé + header calé
  sur les FABs + band replié = retiré au profit des FABs) et C-DIR3 (P1 : playback story
  muet au boot sur device réel). C-DIR2 = LA priorité du prochain tour.
- Re-vérifs au passage : C1 (panneau Fond direct avec chips Ouverture ✓), U4 DraftResumeCard
  (cover composite AVEC le sticker ✓ — autosave E1 couvre les stickers).

## it.71 — C3 (poignée fantôme) + MAIN DÉBLOQUÉ + directive tray (+ coupé)

- C3 livré (détail item §3). En route, MAIN CASSÉ découvert (commit calls 0f5eefe59) :
  CallSignalGlyph.swift jamais enregistré au pbxproj (CI verte car elle régénère via
  xcodegen ; TOUT build local meeshy.sh cassé) + typealias déclaré dans un body @ViewBuilder
  (rejeté par le result builder). Fix : enregistrement pbxproj MANUEL (4 entrées — PAS de
  régénération xcodegen : project.yml porte encore CURRENT_PROJECT_VERSION=1 vs 1216 live,
  piège connu du chantier xcodegen reverté) + typealias remonté au niveau du type
  (0f4f43cbd). Piège consigné : « CI verte ≠ main buildable localement » pour tout commit
  qui ajoute un .swift sans toucher le pbxproj.
- DIRECTIVE USER (screenshot) : badge « + » de la bulle « Moi » COUPÉ dans le tray — cause :
  offset(-4,-4) faisait déborder le badge 40 pt du cadre de cellule, rogné par le conteneur.
  Fix : badge 34 pt SANS offset (entièrement contenu — plus rien ne peut être rogné quel que
  soit le clipping parent), glyphe 19, stroke 2.5. VÉRIFIÉ SIMULATEUR (it71-tray.png :
  cercle complet, mood intact).

## it.70 — C1 : ouverture du slide accessible par geste (panneau Fond) + état VM

- Détail dans l'item C1 §3. Reste vérif simulateur du panneau Fond enrichi (prochain tour,
  avec la passe visuelle du band). Directive user re-confirmée en cours de tour : committer
  régulièrement, pusher dès que compile + tests verts — appliqué (push immédiat post-gates).

## it.69 — C7 : la sheet Transitions devient réelle (picker d'ouverture du slide)

- Protocole « preuve avant fix » décisif : la re-preuve a montré qu'opening est DÉJÀ rendu
  (reader + export) mais closing ne l'est nulle part → l'UI livrée n'expose QUE l'ouverture ;
  closing consigné C7b au lieu d'une UI mensongère.
- Vérifié simulateur bout-en-bout : menu ⋯ (au passage : entrées EN → C12 reconfirmé) →
  sheet réelle → tap Fondu → chip sélectionnée + sync slide courant → swipe-down dismiss →
  quit propre. Captures it69-overflow/transitions/fondu.png.
- CI : runs C6 in_progress au moment du commit (concurrency group remplacera par les runs
  de ce commit) — surveiller it.70.

## it.68 — C6 : « + » d'ajout de slide + vérification simulateur groupée C5/C6

- C6 livré (addSlideThumb, View-only — comportement VM déjà pinné par
  StoryComposerViewModelTests append/focus/cap). VÉRIFICATIONS SIMULATEUR (fresh install,
  compte atabeth) : (1) C6 — « + » pointillé en bout de strip, tap → slide 2 créé/focusé/
  canvas vierge ; (2) C5 — tuile Timeline empty-state → la SHEET timeline s'ouvre (Simple/
  Pro, transport, règle) au lieu de l'ancien band vide ; swipe-down la ferme, retour propre
  à l'empty-state (boucle apparition/disparition 100 % gestuelle) ; sortie X → alerte →
  Quit (brouillon de test jeté). Captures it68-*.png au scratchpad.
- CI des commits C5/C4 : runs C5 « cancelled » = concurrency group (remplacés par les runs
  C4 qui couvrent les 2 commits) ; C4 in_progress au moment du commit — vérifier it.69.
- Nouveau finding C12 (P3) : chrome composer bilingue (alerte EN / tuiles FR, capture) —
  piège xcstrings devRegion, audit story.composer.* à faire.
- C4 visuel : double-tap reset NON vérifiable au simulateur (pinch 3 doigts impossible) —
  reste pour la passe device (avec C4-snap au relâcher réel).

## it.67 — C4 : sortie gestuelle du zoom viewport (double-tap reset + snap identité)

- RED conceptuel prouvé it.66 (re-preuve maintenue : clamp brut `min(4,max(0.5,…))` à
  `+Canvas.swift:777`, exit bouton-only). Découverte C0 intégrée : le double-tap fond était
  DÉJÀ pris (cycle videoFitMode) → règle de précédence pinnée par test
  (`itemDoubleTapWinsOverReset`, `neverResetsAtIdentity`).
- Livré : policy pure + branche early-return UIKit + plumbing representable + snap au call
  site. 29/29 (2 suites), build 12 s. CI du commit C5 encore in_progress au moment du push —
  à re-vérifier it.68 (les 2 commits seront couverts par le même run suivant).
- Piège évité : diagnostic SourceKit « No such module 'Testing' » sur le nouveau fichier de
  test = artefact d'indexation (xcodebuild vert) — ne pas « réparer ».
- Reste C4 (visuel simulateur) : à grouper avec la passe simulateur du chantier C (vérifier
  le zoom réel + double-tap sur device/simu, avec C3 affordances quand traité).

## it.66 — RELANCE : mission C « création discrète gesture-first » (directive user 2026-07-04)

- La boucle close à it.65 est ROUVERTE par directive user : audit de TOUS les tools du
  composer + création discrète — gestes suffisants pour apparition/disparition de chaque
  tool/écran/contenu, n'afficher que l'utile à l'instant t, tout rendre fonctionnel.
- Fait ce tour : mission ajoutée §0.6 ; grammaire gestuelle existante cartographiée et
  consignée en tête de la section C (§3) — elle est déjà riche (tap canvas toggle chrome,
  FAB tap/swipe-up/swipe-down, band swipe-down, grabber resize/collapse, pinch viewport) ;
  premiers items C1-C3 prouvés (Transitions/Timeline enterrés au menu ⋯, swipe horizontal
  band mort, zéro affordance de récupération chrome caché).
- EN COURS : C0 — inventaire exhaustif délégué à un agent d'exploration (tableau
  apparition/disparition/conteneur/gestes par tool + anomalies) ; ses findings alimenteront
  les items C5+ au prochain tour. Aucun code modifié ce tour (audit d'abord, preuve avant fix).
- Tour 2 (pendant C0) : C4 prouvé (sortie zoom bouton-only + isCanvasZoomed strict sans snap —
  pinch relâché ≈1 garde le chrome caché) ; build iOS relancé en arrière-plan (gate).
- Tour 3 : C0 LIVRÉ (inventaire complet → item coché, findings C5-C11 consignés avec preuves).
  C5 FIXÉ dans la foulée (P0 : FAB/tuile/swipe-up timeline → panneau vide) — guards machine
  pure + routage View vers la sheet ; BandStateMachineTests 19/19 dont 4 nouveaux (simu 18.2).
  Note TDD : tests écrits avant fix mais exécutés après (RED structurellement certain — l'ancien
  code posait .toolPanel(.timeline), les tests exigent .hidden). Build app en gate au commit.

## it.65 — FIN DE BOUCLE (audit sec 2/2) — rapport final du cycle it.41→65

- Audit n°4 (viewers sheet) : SEC — getPostViews/getPostInteractions gardent authorId
  (FORBIDDEN→403), auth registered obligatoire, pagination saine. Privacy OK.
- Critère d'arrêt du protocole ATTEINT (2 audits consécutifs sans finding) → STOP.

**BILAN GLOBAL it.41→65 (25 itérations)** : 18 livraisons de code main (CI verte),
7 écartements/constats prouvés. P0/P1/P2/P3 autonomes : TOUS fermés. Faits marquants :
R5 offline garanti+prouvé ; G1 delta/projection/pagination serveur + delta client ;
E4 undo cross-crash ; R14 crossfades jamais rendus → fixés iOS+web (W1 complet) ;
visibilités web 6/6 + W6 ; U1 zoom toutes surfaces (vérifié simulateur) ; R12 re-scopé
→ writes dirty ; G5 filtre canonique → divergence audience REMONTÉE ; audits : G7 fuite
média DB fixée, W7 IP-leak viewers fixé web + écarté iOS, NSE et viewers sheet sains.

**EN ATTENTE UTILISATEUR (récapitulatif final)** :
1. DÉPLOIEMENT gateway prod groupé : G1a/b/c + G2 + G3 + G7 + G5 (pull + up -d
   /opt/meeshy/production) — active aussi le delta client it.46.
2. Index Prisma `@@index([type, updatedAt])` (avec déploiement schema).
3. Décisions produit §4 (7 items, dont audience FRIENDS divergente + option refine
   Zod background).
4. Vérifs device : offline replay réseau coupé, stall réel, crossfade visuel, interstitiel
   2+ groupes, mini-trail/iPad zoom visuel.
5. Suivi技 : volet fichiers disque de G7 (réclamation des médias hard-deleted).

## it.64 — Audit ciblé n°3 : chemin NSE prefetch story — SAIN, aucun finding (sec 1/2)

- Surface : NSEPendingPostConsumer bout-en-bout. Constat : consumer défensif exemplaire
  (décodage à 2 formats de date, corrupt → drop définitif, fichier App Group retiré
  SEULEMENT après cache réussi → retry au prochain launch, seed feed + comments inline +
  tray StoryService gated expiresAt) ; drainé aux 4 bons points (StoryNotificationTarget
  AVANT lecture, PostDetailViewModel.loadPost, RootView boot, BackgroundTransition
  foreground). Zéro code, zéro finding.
- Compteur d'arrêt du protocole : 1 itération d'audit sèche / 2. Prochaine surface
  (dernière avant STOP+rapport si sèche) : viewers sheet OU flux repost complet.

## it.63 — W7 volet iOS : ÉCARTÉ avec preuve (hex-only, URLs = PostMedia serveur)

- Chaîne prouvée : renderBackground (hex only) ; Kind.image = postMediaId (résolu contre
  post.media internes) ; mediaURL legacy = fileUrl serveur. Zéro code.
- 3 audits ciblés : 2 findings fixés (G7, W7-web) + 1 écartement prouvé — la surface
  d'attaque côté effects est close (web whitelist + iOS structurellement sûr + Zod caps).

## it.62 — Audit ciblé n°2 → W7 : IP-leak des viewers via background URL, FIXÉ web (34ae2d0ff)

- Surface choisie : validation serveur des storyEffects + rendu des URLs qui en sortent.
  Constat positif au passage : le schema Zod serveur est SOLIDE (caps par champ + 256KB
  global + refine EXCEPT/ONLY qui validait déjà côté serveur ce que W6 fixait client).
- Le vecteur restant : background ≤64 chars = URL tierce rendue brute par le web. RED :
  5 tests safeBackgroundImageUrl (relative, //, externe, origins exacts vs suffixe forgé,
  schemes non-http, métacaractères CSS). 162/162 story web.
- 2e audit, 2e finding prouvé+fixé — la boucle d'audit reste productive.

## it.61 — Audit ciblé → G7 : fuite illimitée de rows média au hard-delete, FIXÉE (731855e7a)

- Protocole étape 8 (backlog épuisé) : surfaces candidates listées (delete/expiry lifecycle,
  viewers sheet, NSE prefetch, repost flow, audio pipeline story) ; choisie = cleanup
  gateway (jamais audité en 60 itérations, risque intégrité stockage).
- Preuve AVANT fix : lecture sweep + schema (SetNull vs Cascade enfant par enfant).
- RED : harnais étendu (postMedia + collecte commentIds) + 2 tests (ordre purge<delete,
  jambe commentId). 9/9, tsc 0. L'audit ciblé a produit un finding prouvé du premier coup —
  la boucle continue (pas de critère d'arrêt « 2 itérations sèches »).

## it.60 — G5 : filtre de visibilité canonique unique (9e870ce90)

- No-op strict prouvé par 134/134 suites service+posts (bun) + tsc 0 ; shape suite neuve.
- La consolidation a fait émerger LA divergence réelle (audience feed vs unitaire) —
  remontée en décision produit §4 avec impact R4 : exactement le « risque de dérive »
  que G5 documentait, maintenant visible et réparable en 1 site.
- BACKLOG AUTONOME ÉPUISÉ : restent G4 (déploiement schema), R13/R12-inc.1 (conditionnels),
  décisions §4, vérifs device — prochaine itération = audit ciblé (protocole étape 8).

## it.59 — U5 : ÉCARTÉ avec preuve — le chargement prolongé est déjà couvert

- Re-preuve : loader initial complet (overlay ThumbHash/cover/spinner%), R3 mid-slide,
  tap-zones actives sous l'overlay, watchdog 5 s anti-deadlock = auto-advance garanti.
  Chapitre UI/UX du backlog AUTONOME entièrement fermé (U1/U2/U6 livrés, U3/U5/U7
  écartés avec preuve, U4 inc.3 = décision produit §4). Zéro code.
- Backlog autonome restant : G5 (consolidation visibilité gateway, P3), G4 (semi-bloqué
  déploiement schema), R13/R12-inc.1 (conditionnels preuve/profil).

## it.58 — U3 : ÉCARTÉ avec preuve — le chrome du reader est déjà material/Liquid Glass

- Re-preuve par inventaire (grep + lecture des surfaces) : les chantiers précédents (R3,
  U-DIR1, panneau langues, bouton ⋯) ont déjà posé material partout où ça compte, et
  l'abstraction `adaptiveGlass` couvre iOS 26 depuis sa création. Le plan it.39 §U3 est
  archivé sans exécution. Zéro code (pattern it.30/it.34).

## it.57 — U1 inc.2 : zoom sur toutes les surfaces secondaires, U1 COMPLET (0f59fa9f3)

- 4 fichiers, +20 lignes — le pattern inc.1 appliqué mécaniquement partout ; aucun effet
  existant touché. Build 27 s vert (exit 1 = piège warning-free connu, grep du log foi).
- Re-vérif simulateur : fresh install → tap bulle « meeshy sama » → zoom capturé (z5,
  échelle intermédiaire coins arrondis), chrome viewer complet, dismiss propre.
- CI NOTE : le rouge « CI » depuis it.55 = test_34_zmq_pool du TRANSLATOR (contrat
  exception→[] changé par le fix fallback de l'agent translator, chantier ACTIF chez lui,
  fichiers en vol worker_pool.py) — hors périmètre story-sota, il possède la réparation.

## it.56 — U1 inc.1 : zoom bulle→viewer iOS 18+, vérifié simulateur (922f966d4)

- Premier chantier visuel du nouveau cycle, exécuté selon le plan design-system (it.39).
- Vérif simulateur COMPLÈTE (protocole du plan) : réinstallation fresh → login test →
  tap bulle → rafale de captures (transition attrapée à t4) → viewer sain → swipe-down
  dismiss propre. Le risque « conflit navigationTransition ↔ drag-dismiss » est LEVÉ.
- SDK purity : helpers = atomes opaques (namespace/id en params) dans ViewModifiers.swift,
  la décision « quelles surfaces zooment » reste dans RootView/StoryTrayView (app).
- Piège d'exécution consigné : le .app fresh se trouve sous apps/ios/Build/Products/ (PAS
  Build/Build/Products) ; install+launch simctl directs OK une fois le chemin exact connu.

## it.55 — FIN DE CYCLE it.41→54 — rapport (c43401f5b)

**Bilan** : 14 itérations, 14 livraisons main, CI verte sur chaque validation terminée.
P0/P1 TOUS fermés : R5 (offline replay prouvé — contrat clé viewer/pin pinné), R4 (unit-
fetch hors tray par postId), E4 (undo/redo cross-crash), G1 serveur COMPLET (delta a +
projection b + pagination keyset c) + R8 inc.1 (delta consommé client). R12 re-scopé par
re-preuve (pas de refonte : writes dirty débouncés livrés). R14 découvert ET fixé (les
crossfades intra-slide ne rendaient JAMAIS en lecture iOS — parité preview/publié rétablie,
puis portée au web = W1 COMPLET). Visibilités web COMPLÈTES (W3 6/6 parité iOS + fix W6
PostComposer). Nouveaux findings consignés en route : R13 (clé URL ré-encodée, théorique),
W6 (fixé it.54).

**PROCHAINE SESSION (contexte frais requis — cycles simulateur/screenshots)** :
U1 inc.1 (zoom transition : suivre le plan 2026-07-04-story-reader-design-system-plan.md,
namespace via Environment, vérif visuelle du conflit drag-dismiss), U3 inc.1 (sidebar
matériaux), U5. P3 conditionnels : G4 (avec déploiement schema), G5, R13 (sur symptôme),
R12 inc.1 (sur profil).

**EN ATTENTE UTILISATEUR (inchangé + additions du cycle)** :
1. DÉPLOIEMENT gateway prod groupé G1a/b/c + G2 + G3 (pull + up -d explicite sur
   /opt/meeshy/production) — active AUSSI le delta-sync client (it.46, inoffensif d'ici là)
   et les APIs projection/pagination.
2. Index Prisma `@@index([type, updatedAt])` sur Post à poser avec un déploiement schema.
3. Décisions produit §4 : E7, E8, WS5.4b, it.44 C.2, Phase 2 cover baké, chantier filtres.
4. Vérifs terrain device : relecture offline réseau coupé (R5), stall réseau réel (R3),
   crossfade visuel avec une story de test (R14), interstitiel 2+ groupes (U-DIR1).

## it.54 — W6 : PostComposer ne publie plus d'audience vide (bf63b0205)

- Gate + picker promus au module AudienceUserPicker (source unique, StoryComposer importe
  désormais au lieu de définir) ; guard aussi DANS handlePublish (défense en profondeur
  au-delà du disabled) ; reset de la liste au switch de visibilité non-audience.
- 498/498 (33 suites — pattern composer élargi). W3+W6 : chapitre visibilités web CLOS.

## it.53 — W3 inc.2 : picker d'audience web, visibilités 6/6 parité iOS (1268724aa)

- Réutilisation : useSearchUsersQuery générique (même source que le UserPicker admin —
  promotion du composant admin écartée : couplage namespace i18n/UserDisplay admin) ;
  composant v2 dédié ~110 lignes, styles var(--gp-*) cohérents composer.
- Gate PUR isAudienceIncomplete exporté + testé (6 cas) ; bouton publish désactivé si
  EXCEPT/ONLY sans sélection ; reset de la liste au close/publish ; deps bug préexistant
  du useCallback publish corrigé au passage (visibility absent des deps → payload stale).
- 207/207 story+feed (13 suites). W6 (PostComposer) : picker prêt, branchement = prochain W.

## it.52 — W3 inc.1 : COMMUNITY au composer web + plomberie visibilityUserIds (e63a64f53)

- Re-preuve : composer web limité à PUBLIC/FRIENDS/PRIVATE ; parité iOS = 6 visibilités
  dont EXCEPT/ONLY à picker (AudienceUserPickerView). Découverte en route : W6 —
  PostComposer OFFRE déjà EXCEPT/ONLY mais publie SANS liste (visibilité cassée).
- Livré : option COMMUNITY (labels en/fr/es/pt, diffs locales chirurgicaux +1 ligne),
  payload visibilityUserIds bout-en-bout, décision « pas d'EXCEPT/ONLY sans picker »
  pinnée par test dédié. 157/157 story + 50/50 feed (bun).
- inc.2 (picker partagé) = prochain morceau W3, fixera W6 du même geste.

## it.51 — W1 inc.4 : crossfades intra-slide au viewer web, W1 COMPLET (939cec8c0)

- RED : 7 tests parité (sortant/entrant, hors fenêtres, dissolve/non-impliqué, multiplicatif
  + clamp, sans transitions + durée 0 guardée). 154/154 les 9 suites story web.
- Réutilisation : mêmes maths que R14 (référence unique ReaderTransitionResolver) ; le
  passthrough storyEffects serveur→viewer était déjà intégral (zéro plomberie).
- Cross-platform : le crossfade authoré rend désormais iOS (it.50) ET web (it.51).

## it.50 — R14 : les crossfades intra-slide rendent enfin au playback (7397e72d3)

- RED : 3 tests RenderIntegrationTests (sortant 0.5 mi-fenêtre, entrant 0.5, cache
  cross-ticks absolu 0.5→0.2→1.0) — harnais copié du test kf existant.
- 1 erreur de compile attrapée en gate (slide.effects NON-optionnel — chaining retiré) ;
  correction posée AVANT la phase build app du job chaîné → build vert du premier coup.
- Vérif : SDK 10/10 (dont non-régression StoryCanvasReaderTransitionTests), app 86 s vert.
- Les 3 pièges identifiés à it.49 tous encodés dans l'impl + pinnés par le test cache.
- W1 inc.4 (web) DÉBLOQUÉ : même référence (ReaderTransitionResolver maths) → prochain.

## it.49 — Reconnaissance W1 inc.4 → finding R14 : le reader iOS n'a jamais rendu les
## crossfades intra-slide (2ed63683c)

- Parti pour porter W1 inc.4 (clipTransitions web), la re-preuve a montré plus grave côté
  produit principal : le resolver iOS existe, est testé, et n'est branché NULLE PART en
  lecture (détail et piste dans l'item R14 ci-dessus). Le web attendra la même référence.
- Aucun code ce tour (reconnaissance type it.32) : le branchement touche le pipeline de
  rendu par tick (RendererCache/signatures) avec un piège perf AVPlayer identifié AVANT
  de coder. it.50 = R14 (reader iOS d'abord, fidélité du produit principal), puis W1 inc.4.

## it.48 — R12 inc.2 : mutations locales sur le chemin dirty débouncé (40f75bf9d)

- Classification préalable des 10 callers de persistStoryCache : tous mutations locales/
  push socket ; le fetch full réseau sauve DIRECT (L351) hors wrapper → l'inc.2 = 1 corps
  de fonction (save → mergeUpdate), prouvé site par site cette fois.
- Vérif : 90/90 StoryViewModelTests (nouveau test caractérisation flush dirty) ; TEST
  BUILD SUCCEEDED. Le RED strict vit côté SDK (GRDBCacheStoreFreshnessTests, préexistants).
- R12 inc.1 (upsertPatch par story) DÉPRIORISÉ P3 de facto : le débounce coalesce déjà les
  rafales — l'encodage des N groupes par flush n'est plus dans le chemin critique.

## it.47 — R12 : re-preuve + plan, le « gros chantier » n'existe pas (356fc397c)

- Itération de PLAN (protocole R12). La re-preuve a invalidé la prémisse : le store est
  DÉJÀ relationnel par groupe (writeToL2 = row par item chiffrée) ; le vrai coût = save()
  synchrone full-rewrite ×11 sites ; les remèdes (upsertPatch/mergeUpdate + dirty-flush
  2 s) existent déjà dans GRDBCacheStore, utilisés par messages/conversations.
- Piège sémantique découvert AVANT le code : mergeUpdate préserve loadedAt (mutation
  locale) vs save qui reset la freshness — basculer aveuglément aurait cassé le SWR
  (re-refetch en boucle + full bloquant post-expiry). Routage par nature de site consigné
  au plan. Trade-off durabilité (fenêtre dirty ≤2 s sur kill dur) assumé : cache dont la
  vérité est serveur, isViewed déjà durable via l'outbox R6.
- Zéro code de prod ce tour. Exécution : it.48 = inc.2 du plan.

## it.46 — R8 inc.1 : le refetch silencieux consomme le delta-sync (c5c0c1e33)

- Re-preuve : `.stale` → fetch full 50 plein corps à chaque refresh silencieux ; APIPost.updatedAt
  existait déjà, StoryItem non → champ ajouté (pattern viewedAt it.35).
- Design : curseur DÉRIVÉ du cache (pas de lastSyncedAt persisté) ; merge = généralisation de
  insertOrMergeStoryGroups (mode replace, monotone) — le sink storyCreated garde son
  comportement append-dédup (défaut inchangé).
- RED : 4 tests VM (curseur max/nil legacy, replace+monotone+updatedAt traversant, insertion
  nouveau groupe, delta vide → tray intact) + capture lastListUpdatedSince au mock.
- Vérif : app 89/89 (StoryViewModelTests) + SDK 63/63 (StoryModels 50, StoryService 13 — le
  MockAPIClient stubbe par endpoint, le passage paginatedRequest→request(queryItems:) est
  transparent) ; TEST BUILD SUCCEEDED (recompile complète SDK→app ~10 min).
- Note déploiement : le delta est inoffensif AVANT le déploiement gateway (param ignoré → full).

## it.45 — G1(c) : pagination keyset du tray stories, volet serveur G1 fermé (ca867d419)

- Réutilisation : patron getStatuses copié à l'identique (decodeCursor/encodeCursor,
  OR keyset, take limit+1, slice) ; getStories aligné sur la shape { items, nextCursor,
  hasMore } commune à toutes les listes du service.
- RED : 3 tests service (keyset+tiebreaker, hasMore/nextCursor round-trip décodé,
  première page take 51 sans filtre) + 2 tests route (forward cursor/limit clampé,
  enveloppe pagination avec data tableau).
- Vérif : 593/593 sur 18 suites posts (bun) — la suite legacy posts-feed.test.ts stubbait
  encore la shape array (500 au premier run) → mock adapté ; tsc gateway 0 err.
- Rétro-compat : data reste [APIPost] ; hasMore/nextCursor ignorés par les clients actuels.

## it.44 — G1(b) : projection tray légère côté gateway (b70915dd0)

- RED : 5 tests service (select léger sans storyEffects, include full par défaut,
  isViewedByMe sous projection, skip réactions) + 2 tests route (whitelist parse).
- Vérif : 83/83 les 2 suites (bun) ; tsc gateway 0 err APRÈS rebuild shared dist +
  prisma generate locaux (les erreurs eventType/emoji au premier tsc = dist/client
  périmés par la PR replay-offline d'un autre agent, PAS mon code).
- Piège TS consigné : spread conditionnel `{select}|{include}` = union que l'overload
  findMany rejette → toujours DEUX appels explicites.
- G1 restes (c/index/conso client/déploiement) documentés dans l'item.

## it.43 — E4 inc.2 : undo/redo cross-crash via blob opaque du draft store (2474bbf3c)

- Re-preuve : `CommandStackSnapshot` déjà Codable+Sendable ; `story_draft_meta` (key/value
  TEXT) déjà purgée par `clear()` → blob base64 sans migration ni nouveau fichier.
- RED : 4 tests store (round-trip bytes, nil, overwrite, clear-purge) + 3 tests VM dont le
  bout-en-bout « composer neuf + blob → canUndo + undo revert sans replay ».
- Vérif : suites StoryDraftStoreSDKTests + TimelineHistoryPersistenceTests passed (simu 18.2,
  scheme MeeshySDK-Package) ; meeshy.sh build « Build succeeded in 77s » (warning fullSync
  préexistant, hors périmètre). Aucun bump généré.
- Piège d'exécution rencontré : `import os` manquant dans +Timeline.swift (Logger) — MeeshyUI
  n'hérite pas de l'import du core ; vérifier les imports de tout fichier qu'on étend.
- E4 FERMÉ. P1 restants : G1 (b) projection tray + (c) pagination cursor (avec R8).

## it.42 — R4 inc.2 : fetch unitaire des stories hors tray par postId (2b8687ef3)

- Re-preuve : container identifié par userId seul — story hors tray (plafond 50, auteur
  non suivi) = « introuvable » même quand GET /posts/:id la servirait. Le sink storyCreated
  portait déjà la logique d'insertion/merge exacte → extraite et partagée (réutilisation max).
- RED : 5 tests ensureStoryLoaded (compile RED — API inexistante) + assertion postId bridge.
- Vérif : 88/88 verts simu 18.2 (StoryViewModelTests 85 dont 5 nouveaux + sink non-régression,
  StoryActiveBridgeTests 3) ; TEST BUILD SUCCEEDED (app+tests). Pas de vérif visuelle : chemin
  réseau de secours non déclenchable simplement en simu (nécessite notif story hors tray).
- Worktree partagé : fichiers translator d'un autre agent en vol (translation_processor.py)
  laissés intacts, commit pathspec 7 fichiers.
- CI it.41 : run « CI » cancelled = concurrency group (PR #1438 derrière), pas un échec.

## it.41 — R5(c) : contrat d'intégration de la relecture offline pinné (855e6c673)

- Choix : seul reliquat P0 du backlog. Re-preuve de la chaîne complète avant conception :
  écriture = clé brute `FeedMedia.url` (prefetch/pin, routage R7) ; lecture = clé
  `URL(string:).absoluteString` (StoryViewerView.mediaIndex:795-806) + helpers disk-only
  (`videoLocalFileURL` StoryBackgroundLayer:658, `images.data` disk-hit loadImage:312,
  `audioLocalFileURL` mixer). Le maillon jamais prouvé : cohérence clé+store entre les 2 bouts.
- Test non-tautologique (dérivations indépendantes des 2 clés) ajouté à StoryViewModelTests
  (fichier EXISTANT — pas de churn xcodegen) : seed 3 stores → markViewed → disk-hit + pin
  sous la clé viewer pour video/audio/images.
- Vérif : 80/80 StoryViewModelTests verts simu 18.2 (build-for-testing + test-without-building,
  xcresult « TEST EXECUTE SUCCEEDED ») ; le seul « failed » du log = log runtime attendu du
  test loadStories_failure (-1009).
- Découverte backlog : R13 (P3) — `URL(string:)` ré-encode espaces/accents → divergence de
  clé théorique si URL serveur non encodée (preuve script ; pas de fix spéculatif).

## it.40 — FIN DE CYCLE (session au terme de son contexte) — rapport

**Bilan it.1→it.40** : ~30 livraisons de code sur main (CI verte), 3 plans posés dont 2
exécutés majoritairement. P0 4/4 ✅, P1 6/6 ✅ (+incréments partiels tracés), P2/P3
autonomes quasi épuisés. Missions produit : édition crash-safe ✅ · offline ✅ ·
progression=données ✅ (iOS+web) · lecture instantanée 🔶 (inc.1) · SOTA UI/UX 🔶.

**Pour la PROCHAINE session (contexte frais requis — cycles simulateur/screenshots)** :
U3 inc.1 (sidebar matériaux), U1 inc.1 (zoom transition, risque gestuel flaggé), U5,
W3, W1-inc.4, R12/G1-projection (plans), incréments 2 de R4/E4.

**EN ATTENTE DE L'UTILISATEUR** :
1. Décisions produit §4 : E7 (publish in-timeline : câbler ou retirer), E8 (multi-draft),
   WS5.4b (promotion media[0]), it.44 C.2 (repost-as-post), Phase 2 cover baké
   (touche RAW-publish/Prisme), chantier filtres (6 sans kernel Metal).
2. DÉPLOIEMENT gateway prod groupé : G1 (?updatedSince) + G2 (pipeline unique) +
   G3 (audience-driven) — pull + up -d explicite sur /opt/meeshy/production.
3. Validation visuelle de l'interstitiel d'identité (dès 2+ groupes tiers au tray)
   + réglages design éventuels.
4. Tests terrain device (stall réseau réel, TestFlight).

## it.39 — U1/U3 : plan design-system du reader posé

- Itération de plan (chantiers visuels → plan + vérif simulateur obligatoire par étape) ;
  plan : docs/superpowers/plans/2026-07-04-story-reader-design-system-plan.md ; zéro code.
- U1 : 6 sites de présentation recensés, namespace à faire voyager via le coordinator ;
  risque identifié : conflit navigationTransition ↔ drag-dismiss custom.

## it.38 — U4 inc.2 : la carte de reprise remplace l'alerte (9c4167dab)

- Gate conditionné vert après 1 correction (type app-side hors SDK). Incident mineur
  d'outillage : l'ancre du patch d'état a raté → commit code parti sans l'état ; réparé
  dans la foulée (ce commit). LEÇON : les patchs d'état à ancres longues sont fragiles —
  ancrer sur les titres de section courts.

## it.37 — U4 inc.1 : DraftResumeCard livré (0289e3f7a)

- 4/4 tests helper pur ; build app vert (gate CONDITIONNÉ — leçon it.35 appliquée).

## it.36 — U4 : plan de la carte de reprise posé

- Itération de plan (refonte UI → plan d'abord, protocole) ; zéro code.

## it.35 — R11 : viewedAt migration douce (2871df2f3) + HOTFIX build main (ce81369f8)

- ⚠️ Incident : BUILD FAILED masqué par mon enchaînement (le commit R11 est parti malgré le
  gate rouge — le script chaînait sans conditionner sur le grep). Cause RÉELLE : commit
  6726391a1 (autre agent) référençait AudioEffectsPanel.swift jamais commité → main cassé
  pour tous. Fix : xcodegen generate (project.yml = vérité, glob des fichiers RÉELS) +
  commit du pbxproj régénéré. R11 lui-même sain (tests modèles verts + full build vert
  post-fix). LEÇON (piège d'exécution) : toujours CONDITIONNER commit/push sur le résultat
  du gate (`grep -q "Build succeeded" || exit`), jamais un enchaînement inconditionnel.

- 6/6 tests modèles (round-trip + legacy decode) ; build vert.

## it.34 — U6 inc.3 : ÉCARTÉ avec preuve — U6 COMPLET

- accessibilityValue de progression déjà présent (PR #1211). Zéro code.

## it.33 — U6 inc.2 : actions VoiceOver prev/next sur le canvas (3fcf435f2)

- Build vert (retry après contention de build avec un agent parallèle — DB lock).

## it.32 — U6 inc.2 : repérage (session au bout de son contexte)

- Tour de reconnaissance : tap zones = gesture spatiale par position x, pas des
  onTapGesture → l'inc.2 sera des accessibilityActions custom (piste consignée dans
  l'item). Aucun code modifié.

## it.31 — U6 inc.1 : annonce VoiceOver du changement de slide (1e6a0f1f3)

- Build vert 18 s ; reste tap zones + progression (inc.2).

## it.30 — U7 : ÉCARTÉ avec preuve (frame rate déjà borné)

- Vérification pure, zéro changement de code.

## it.29 — W5 : preload du slide suivant web (4776ff52f)

- 147/147 suites story web.

## it.28 — W4 : réaltime web deleted + translation-updated (a263a16ba)

- 226/226 suites social+story web.

## it.27 — R10 : content legacy sur la chaîne de langue complète (ac378a96b)

- 4/4 StoryItemPrismeContentTests ; build vert.

## it.26 — G6 : expiry fallback client aligné sur le serveur, 21 h partout (0c81a2270)

- 13/13 StoryItemExpirationTests (pins 24 h adaptés + test de contrat) ; build vert.

## it.25 — U2 : haptics slide-change + gel/reprise (e078f29ab)

- 2 points d'ancrage branchés sur l'abstraction existante ; build vert (clean build 929 s).

## it.24 — W1 inc.2 : keyframes des mediaObjects foreground (9c90f496e)

- Réutilisation directe de l'infra it.23 (resolveKeyframeState + playhead) ; 147/147.

## it.23 — W1 inc.1 : keyframes des textObjects rendus sur le web (7c428a086)

- 8 tests de parité iOS (formules easing, clamp, segment, canaux, startTime offset) ;
  147/147 les 9 suites story web.

## it.22 — W2 : le timer web gèle sur le buffering vidéo (fe76f7411)

- 3 tests RED→GREEN (gel, reprise au restant, watchdog) + suites story web en non-régression.

## it.21 — G3 : textObjects traduits vers l'audience réelle (9f562ea89)

- 906/906 les 40 suites posts + 4 tests purs neufs ; tsc gateway 0 err.
- getActiveTargetLanguages (10 langues fixes) supprimée — les DEUX pipelines partagent
  désormais la même résolution d'audience.

## it.20 — G2 : un seul pipeline de traduction du content story (496dc4aab)

- RED : 2 nouveaux tests core.test.ts + adaptation de la suite dédiée (2 tests pinnaient
  le comportement supprimé). 902/902 sur les 40 suites posts (bun).

## it.19 — R9 : store stories chiffré (79a4543e0)

- 1 ligne + doc ; 49/49 suites cache (Encryption/GRDB/Coordinator) ; build vert.

## it.18 — E9 élargi : draft + publish queue purgés au logout (830ec1a61)

- Finding élargi en re-preuve : la queue persistée était le trou le plus grave (publication
  cross-compte au drain). 16/16 StoryPublishQueueTests (+1 clearAll purge fichiers), build 56 s.

## it.17 — E6 : le migrator de queue legacy court enfin au boot (b2fcdf5a5)

- Câblage 10 lignes (le migrator SDK était écrit/testé, zéro caller). Ordre critique :
  migrate → sweep E10 → subscribe → executor/drain.

## it.16 — E10 : la queue nettoie ses copies média (de9f32797)

- 15/15 StoryPublishQueueTests (2 nouveaux : succès rm fichiers+dossier, retryable garde) ;
  tests purs du sweep app ; build vert.

## it.15 — R7 : sniff d'extension avant routage vers les stores (c112ec962)

- Router pur SDK, 6/6 tests ; branché prefetch + pin (cohérence des deux chemins) ;
  test app RED→GREEN sur le cas confirmé (mp4 déclaré image).

## it.14 — R6 : markStoryViewed durable via l'outbox (018750c72)

- Réutilisation maximale : payload/coalescing/dispatch calqués sur le jumeau markAsRead
  (anchor générique = storyId). Aucun nouveau mécanisme.
- Vérif : StoryViewModelTests 78/78 (test adapté au seam outbox) + build app 53 s vert.
- Pièges rencontrés : (1) Swift 6 « actor-isolated default value » sur le default de la
  closure seam → corps extrait en `nonisolated static` ; (2) l'ajout d'un OutboxKind casse
  le switch exhaustif d'OutboxUIItem (groupe background receipts) — à retenir pour tout
  futur kind ; labels SyncPill ajoutés (string-based, pas de casse).

## it.13 — G1 incrément delta-sync : ?updatedSince sur le tray stories (ecfd6c9fd)

- RED : 2 tests PostFeedService (filtre présent avec option, absent sans). 34/34 service,
  111/111 les 6 suites feed (bun). Route : parse manuel tolérant (invalide → full).
- Note : le fichier d'état citait un ETag global — le code actuel n'en a plus (Cache-Control
  no-cache seul) ; citation corrigée de fait par la re-preuve.

## it.12 — E5 : write-ahead du publish online, story insubmersible (bb6bc9584)

- RED initial sur la suite queue : setPublishHandler AUTO-DRAINE une queue non vide (M5) —
  handler à poser AVANT enqueue dans les tests processNext (piège consigné).
- 13/13 StoryPublishQueueTests (3 nouveaux : skip in-flight, dequeue clears marker,
  clearInFlight ré-éligible) ; StoryViewModelTests en non-régression ; build app vert.
- Nouveau finding E10 (fuite disque dossiers queue) ajouté au backlog.

## it.11 — E4 incrément 1 : undo/redo survit au cycle de vie timeline (134ccf428)

- RED : TimelineHistoryPersistenceTests 3 tests (no-replay/no-double-apply, survie teardown,
  isolation cross-slide). Découvertes : commandes AUTO-INVERSIBLES (revert(from:)) → restore
  sans replay valide ; bootstrap ne reset PAS le stack (fuite cross-slide préexistante, fixée).
- Vérif : 69/69 (3 nouveaux + TimelineViewModelTests 23 + CommandStackTests 43), build 25 s.

## it.10 — E3 : flush timeline ouverte avant persistance (e96e94f10)

- Fix 12 lignes sur les 2 chemins de persistance ; briques VM (commitTimelineToCurrentSlide)
  déjà testées (roundtrip). 13/13 non-régression, build vert.

## it.9 — R4 incrément 1 : container deep link cache-first (e6bdabfa9)

- Fix 10 lignes View-only sur chemin froid uniquement (le hit `groupIndex` early-return
  inchangé) ; chemins VM sous-jacents déjà testés (loadStories SWR). Build 20 s vert.

## it.8 — U-DIR1 : interstitiel d'identité inter-groupes (1551a249e)

- Directive utilisateur directe (priorité sur backlog). Détail dans l'item U-DIR1 §3.
- Pièges rencontrés : build bloqué ~10 min par le fichier en vol d'un autre agent
  (ConversationListView — réparé par son commit 517b543a4) ; MeeshyAvatar n'a pas de
  param `size:` (taille par AvatarContext → .storyTray 88 pt).

## it.7 — R3 : indicateur discret de buffering mid-slide (27fdaa7c2 + 23cb48875)

- ⚠️ Worktree partagé en action : l'agent longpress a commité une PARTIE de mes hunks R3
  en vol (23cb48875) ; mon commit 27fdaa7c2 porte le reste. Intégrité vérifiée post-rebase
  (grep par symbole : zéro duplication, struct unique). Le code final main est complet.

- Le gel R1/R2/it.55 était une frame figée muette — désormais un spinner glass discret
  centré carte, grâce 350 ms, disparition immédiate, gate post-chargement-initial, reset
  au slide-change. App-side pur (le SDK n'expose que le signal brut).
- Vérif simulateur : lecture saine sans spinner parasite (screenshot scratchpad
  r3-viewer-2.png) ; pas de bump généré ce tour.

## it.6 — R2 : gel du playhead sur image bg non stampée (1c6873e34)

- Re-preuve actualisée : vidéo bg couverte par R1 depuis it.1 ; trou résiduel = image bg
  (status nil, jamais gatée). RED : 7 tests (matrice pure mediaPending + seam canvas).
- Fix : `isPrimaryMediaPending` (rule engine) + `isBackgroundImagePending()` sondant
  `hasFinalContentStamped` — readiness INTOUCHÉE, zéro nouvelle surface de deadlock.
- Vérif : 34/34 les 2 suites santé, build app 23 s vert. Pas de bump généré ce tour.
- Restes consignés dans l'item [~] : indicateur visuel (R3/U5), timeout long UI erreur,
  cas vidéo FG sans player sur fond couleur.

## it.5 — E1 : autosave débouncé du draft, édition crash-safe (294c89e5c)

- RED : StoryComposerAutosaveTests — autosaveTrigger/mediaKeysFingerprint inexistants.
- Fix : publisher lazy stored debounce 2,5 s (VM) + autosaveDraftAfterMutation (View) ;
  JSON léger à chaque accalmie, saveMedia gated par fingerprint des clés ; suspension
  post-clearAllDrafts (publish/quit). Piège évité : debounce inline dans body = re-souscrit
  à chaque render → timer jamais échu.
- Vérif : 13/13 (5 nouveaux + MergeEffects + ResetState) 18.2 ; build app 28 s vert.
- **Fin des P0.** Prochain : P1, ordre R2 → R3 → R4 → E3 → E4 → E5 → G1.

## it.4 — E2 : mergeEffects copy-through, timelineDuration/clipTransitions survivent (23e22b6eb)

- RED : StoryComposerMergeEffectsTests — mergeEffects inexistant ; l'ancien buildEffects
  perdait timelineDuration (12.5→nil) et clipTransitions à chaque sync.
- Fix d'altitude : inversion du défaut (copie intégrale de current + écrasement des seuls
  champs CanvasAuthoredState). Ferme la classe de bug récidiviste. Choix : E2 AVANT E1 (listé
  premier) car persistDraft→buildEffects — l'autosave E1 aurait amplifié la perte.
- Vérif : 8/8 (5 nouveaux + ResetState, 1 skip préexistant XCTSkip chemin bundle) 18.2 ;
  build app vert (76 s). Bumps 1211 intégrés au commit (directive user).

## it.3 — R5(b2) : pin des stories vues au markViewed (8a424e806)

- RED : `pinTargets`/`pinDeadline` inexistants ; markViewed ne pinnait rien (isPinned false).
- Fix app-side (`StoryViewModel`) : plan pur `pinTargets(for:)` + `pinDeadline(for:)` +
  `pinStoryMediaForOfflineReplay` câblé dans `markViewed` après le flip in-place (mutation
  StoryItem IN PLACE respectée — le pin lit `updated[j]`, pas de reconstruction).
- Décision : pin sur markViewed (signal « vu » exact) et PAS sur le prefetch du tray —
  pinner 8 groupes × N médias rendrait le store massivement non-évincable.
- Vérif : StoryViewModelTests (4 nouveaux tests) verts sur 18.2, dont câblage réel via
  `CacheCoordinator.shared.video.isPinned` (le pin ne touche pas le réseau).

## 8. Checklist QA composer↔reader — état consolidé (mise à jour à chaque itération majeure)

> Référence stable (contrairement au §7, append-only) — mettre à jour l'état d'un item
> plutôt que d'en ajouter un nouveau. `✅ sain` = vérifié simulateur cette itération ou une
> précédente sans régression depuis. `🔧 fixé` = bug réel trouvé + corrigé + reversé à ✅
> après. `⛔ non-testable` = limitation outillage documentée, PAS un défaut produit connu.
> `⬜ non testé` = jamais couvert par une itération.

### Outils de composition (slide courante)

| Outil | État | Vérifié par | Notes |
|---|---|---|---|
| Media → Image (Photos picker) | ✅ sain | it.96, it.97 | Rendu composer↔reader cohérent |
| Media → Vidéo réelle (Photos picker) | ✅ sain | it.104 | Réel fichier (10s) : rendu pixel-parfait composer+reader immédiat |
| Media → Vidéo stub simulateur (1703 octets) | ⛔ non-testable | it.101 | Placeholder Photos par défaut, sans piste vidéo décodable — pas un bug produit |
| Sound → Audio (fichier, `.fileImporter`) | ✅ sain | it.103-104 | Ouvre le picker Files correctement ; vide car simulateur sans fichiers audio (pas un bug) |
| Sound → Record (voix) — navigation sheet | ✅ sain | it.104 | Ouvre/annule proprement, sélecteur langue fonctionne |
| Sound → Record (voix) — capture réelle | ⛔ non-testable | it.104 | Nécessite un input microphone matériel réel ; `AudioRecorderManagerTests` (15 tests) couvre la state machine (init/stop/cancel/erreurs), pas la capture elle-même |
| Sound → toggle Foreground/Background (`StoryAudioCell`) | ⬜ non testé | — | UI existe (`onToggleBackground`), jamais exercée au simulateur faute d'un item audio capturable |
| Text → ajout/édition/style/couleur/taille/alignement/fond/cadrage/contour | ✅ sain | it.95, it.104 | Toolbar 9 boutons vérifiée, live preview correcte |
| Drawing (PencilKit) | ⛔ non-testable | (pré-session) | Trait multi-segment non simulable via `idb ui swipe` — historique de vérification manuelle extensif documenté ailleurs |
| Background (couleur/fond) | ✅ sain | it.104 (navigation) | Panneau accessible, chips fonctionnels |
| Filters (grille) | ⬜ non testé | — | `StoryFilterGridView` jamais exercée cette session |
| Timeline (édition/durée) | ✅ sain | it.98 | Bug switch-chip trouvé + fixé ; navigation panneau saine |

### Multi-slide

| Action | État | Vérifié par | Notes |
|---|---|---|---|
| Ajouter une slide (`Add a slide`) | ✅ sain | it.104 | Correctement gaté : désactivé tant que la slide courante est vide |
| Naviguer entre slides (tap miniature) | ✅ sain | it.104 | Miniatures reflètent fidèlement fond+texte de chaque slide |
| Réordonner (drag natif `.draggable`) | ⛔ non-testable | it.104 | Drag-and-drop natif iOS, hors de portée d'`idb ui swipe` ; `moveSlide`/`reorderSlides` couverts par `StoryComposerViewModelTests` |
| Supprimer une slide (`.contextMenu` long-press) | ⛔ non-testable | it.104 | Long-press idb ne déclenche pas `.contextMenu` natif (limitation documentée iOS 26) ; `removeSlide` testé unitairement |
| Dupliquer une slide (`.contextMenu`) | ⛔ non-testable | it.104 | Même limitation ; `duplicateSlide` testé unitairement |

### Visibilité / audience

| Écran | État | Vérifié par | Notes |
|---|---|---|---|
| Picker Public/Communautés/Contacts/Sauf/Seulement/Privé | ✅ sain | it.100 | 6 clés app catalog ajoutées, vérifié EN complet |
| Sheet « Except… » (sélection utilisateurs à exclure) | 🔧 fixé | it.102 | Titre+placeholder recherche non localisés (bundle manquant + clés FR-only) |
| Sheet « Only… » (sélection utilisateurs autorisés) | 🔧 fixé | it.102 | Même composant que Except, même fix |

### Export & partage

| Flux | État | Vérifié par | Notes |
|---|---|---|---|
| Export MP4 (bake + `UIActivityViewController`) | ✅ sain | it.103 | Bout-en-bout : bake réel (88 Ko), partage natif, fermeture propre |
| Sous-titre sheet export | 🔧 fixé | it.103 | Clé catalogue app manquante (oubli isolé, siblings déjà OK) |

### Accessibilité (VoiceOver)

| Surface | État | Vérifié par | Notes |
|---|---|---|---|
| Canvas composer+reader (média/texte/sticker/actions) | 🔧 fixé | it.104 | Calque entier jamais localisé (littéraux FR bruts) — 4 nouvelles clés + réutilisation de 4 clés existantes |

### Cohérence composer ↔ reader (exigence explicite user)

| Contenu | État | Vérifié par |
|---|---|---|
| Image de fond | ✅ sain | it.96 |
| Vidéo de fond (réelle) | ✅ sain | it.104 |
| Texte | ✅ sain | it.95, it.96 |
| Story multi-slide publiée | ✅ sain | it.104 (implicite via export) |

### Reste ouvert pour une itération future
1. Toggle Foreground/Background sur un item audio réel (bloqué tant que la capture n'est pas testable, mais le toggle UI pourrait être exercé sur un item audio importé via Files si un fichier de test y était placé).
2. Grille de filtres (`StoryFilterGridView`) — jamais ouverte cette session.
3. Éditeurs plein écran dédiés image/vidéo — recherche de code n'a trouvé AUCUNE feature de ce nom distincte des panneaux déjà testés (probable confusion initiale du backlog, à ne plus lister comme un gap réel sauf nouvelle preuve).
