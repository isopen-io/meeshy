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
  gardent save). RESTE : inc.2 (2 wrappers + classification des ~11 sites + tests
  flush/reload/SWR) puis inc.1 (upsertPatch mono-story site par site).

- [ ] **R13 (P3, découvert it.41) Clé cache média non normalisée entre écriture et lecture.**
  Preuve (script Foundation) : `URL(string: raw).absoluteString` ré-encode espaces/accents
  (`with space.jpg` → `with%20space.jpg`) — si le gateway émettait une URL média NON encodée,
  la clé viewer (mediaIndex, URL round-trip) divergerait de la clé prefetch/pin (string brute)
  → relecture offline cassée pour ce média + double entrée cache. Impact actuel : nul (URLs
  gateway générées encodées, test it.41 vert sur le cas nominal). Fix si symptôme : dériver
  la clé via le MÊME round-trip URL aux deux bouts (pinTargets/prefetch). Pas de fix spéculatif.

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
- [ ] **G5 (P3) Consolider les 3 implémentations de visibilité** (PostFeedService,
  PostService, canUserViewPost) en un module unique — risque de dérive/fuite documenté.
- [x] **G6 (P3) Constante d'expiry unifiée.** ✅ it.26
  `StoryItem.defaultExpiryInterval = 21 h` (aligné STORY_EXPIRY_HOURS serveur) remplace le
  défaut interne 24 h d'`isExpired` ; test du contrat + pins adaptés (le pin 24 h a échoué
  comme attendu — preuve que le piège était réel). toStoryGroups/pinDeadline déjà à 21 h.

### WEB (secondaire — parité lecteur)

- [~] **W1 (P2) Keyframes/transitions non rendus.** — INCRÉMENT 1 FAIT it.23
  Plan : `docs/superpowers/plans/2026-07-03-web-story-keyframes-plan.md`.
  ✅ Inc.1 : portage 1:1 de `KeyframeInterpolator.swift` en TS pur (`story-transforms.ts` —
  tri, constante, clamp, easing du kf BAS, canaux indépendants, time relatif au startTime),
  hook playhead rAF activé UNIQUEMENT si le slide a des keyframes (hérite du gel W2 :
  startedAtRef nul → temps figé), appliqué aux TEXTOBJECTS (x/y/scale/opacity).
  ✅ Inc.2 (it.24) : mediaObjects foreground animés (mêmes canaux, style factorisé,
  slideHasKeyframes étendu). RESTE : inc.4 clipTransitions (voir plan).
- [x] **W2 (P2) Timer découplé de la vidéo.** ✅ it.22
  Porté le pattern iOS R1/R2 : `isBuffering` piloté par les événements natifs du <video>
  principal (waiting/stalled → gel ; playing/canplay → reprise), watchdog 5 s anti-deadlock
  (parité playbackStallWatchdogSeconds), barre CSS gelée via prop `isFrozen` (pause OU
  buffering). BONUS préexistant corrigé : le timer repart du temps RESTANT (avant, une
  pause rejouait la durée entière pendant que la barre CSS gardait sa position → désync).
  Handlers posés sur les 2 formes de fond vidéo (mediaUrl + mediaObjects isBackground).
  Piège de test consigné : avec fake timers, le timer reposé par un effet React post-watchdog
  ne se flush qu'à la fin de l'act → découper les advanceTimersByTime.
- [ ] **W3 (P2) Composer web : visibilités COMMUNITY/EXCEPT/ONLY + overlays.** Reliquat connu
  (mémoire story-status-community-visibility). `visibilityUserIds` déjà dans
  `CreateStoryRequest` web — manque l'UI.
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

- [ ] **U1 (P2) Transition tray→viewer** : sur iOS 18+, `navigationTransition(.zoom)` /
  matched-geometry depuis l'anneau du tray vers la carte reader ; fallback animation actuelle
  iOS 16-17. Ne PAS casser appearScale/drag-dismiss existants (cf. it.33).
- [x] **U2 (P2) Haptics du reader.** ✅ it.25
  Livré via l'abstraction multi-version EXISTANTE `HapticFeedback` (UIImpactFeedbackGenerator,
  iOS 16+) : tick léger au changement de slide + gel perceptible quand le spinner R3 apparaît
  (après la grâce 350 ms — pas de haptic sur micro-stall) + reprise SI le gel avait été montré.
  Publication réussie : déjà couvert (HapticFeedback.success au publish, it.12 constaté).
  Décision : pas de doublon .sensoryFeedback 17+ — l'abstraction existante est le single
  source du produit ; migrer TOUTE l'app vers .sensoryFeedback = chantier design system global.
- [ ] **U3 (P2) Chrome du reader en matériaux natifs** : header/footer/sidebar en
  `.ultraThinMaterial` + sur iOS 26 adopter les surfaces Liquid Glass (`glassEffect` API si
  dispo dans le SDK cible) — TOUJOURS via gating `if #available`, jamais de régression 16-25.
  Respecter la mémoire « texte blanc illisible en Light sur verre » (épingler colorScheme si
  besoin).
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
- [ ] **U5 (P3) État de chargement prolongé** (avec R2) : ThumbHash + progress ring fine autour
  de l'avatar auteur (métaphore déjà connue du tray), bouton passer.
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

## 7. Journal d'itérations (l'agent APPEND ici)

> Format : `## it.N — <titre> (<commit>)` + preuves (RED reproduit, tests verts, vérif visuelle)
> + items cochés/ajoutés ci-dessus. Si un item s'avère déjà corrigé ou infondé au re-check :
> le cocher avec la mention ÉCARTÉ + preuve, sans fix.

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
