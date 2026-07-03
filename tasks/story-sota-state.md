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
- [~] **E4 (P1) Persister le CommandStack (undo/redo) avec le draft.** — INTRA-SESSION FAIT it.11
  ✅ Incrément 1 : `timelineHistoryBySlide` (composer VM) — stash au shutdown ET avant chaque
  re-bootstrap ; restore via NOUVELLE API `restoreCommandHistoryWithoutReplay` (le projet
  committé EST l'état au cursor ; le `restoreCommandHistory` existant REJOUE et suppose l'état
  zéro → aurait doublé les AddClip). Undo/redo survit à chaque fermeture de sheet + BONUS :
  corrige la contamination cross-slide préexistante (bootstrap ne resettait pas le stack —
  l'historique de la slide A restait actif sur la slide B).
  RESTE (incrément 2) : persistance disque cross-crash — blob opaque Data dans un sidecar
  StoryDraftStore (`saveCommandHistoryBlob`/`loadCommandHistoryBlob` + purge dans `clear()`,
  le store SDK core ne peut pas dépendre de CommandStackSnapshot/MeeshyUI) ; encode/restore
  au rythme E1 ; restore du dict au restore du draft.
- [ ] **E10 (P2, NOUVEAU it.12) Fuite disque : dossiers `meeshy_offline_queue/<tempStoryId>/`
  jamais nettoyés au succès du chemin QUEUE.** Preuve : grep `removeItem` sur StoryPublishQueue +
  StoryPublishService → zéro cleanup des copies médias après publication réussie via drain.
  Le chemin ONLINE est couvert depuis it.12 (`removeOfflineQueueMediaDirectory` au dequeue) —
  brancher le même helper sur le succès du drain (publishSucceeded → tempStoryId → rm dir),
  + balayage one-shot des dossiers orphelins (sans item de queue correspondant) au boot.
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
- [ ] **E6 (P2) `StoryQueueMigrator.migrateLegacyOfflineQueue()` jamais appelé en prod.**
  Preuve : grep → définition + tests seulement. Soit l'appeler au boot (one-shot idempotent,
  déjà testé), soit supprimer le legacy si plus aucun install n'a l'ancien fichier.
- [ ] **E7 (P2) Code mort Timeline publish** : `handlePublishTap` + `StubOnlinePublisher`
  (throw toujours, zéro caller) ; `buildOfflineQueueItem` limitation F5 (perd
  background/filter/drawing sur flush). Décision : retirer ou câbler — trancher avec le user si
  le bouton publish in-timeline est souhaité.
- [ ] **E8 (P2) Multi-draft.** `save()` fait `DELETE FROM story_draft_slide` — un seul brouillon.
  Feature : galerie de brouillons (id draft + updatedAt + cover composite), reprise au choix.
  Décision produit à confirmer avant d'implémenter (scope UI non trivial).
- [ ] **E9 (P2) Draft store hors purge de compte.** `meeshy_story_draft.db` séparé
  d'AppDatabase ; `CacheCoordinator.reset()` (logout) ne l'atteint pas — vérifier et brancher
  `StoryDraftStore.clear()` sur le logout (confidentialité multi-compte).

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
- [~] **R4 (P1) Deep link / notification : rendu progressif au lieu du spinner bloquant.** — it.9
  ✅ Incrément 1 (le cas majoritaire) : `ensureGroupAvailable` est désormais CACHE-FIRST —
  `loadStories()` (SWR : .fresh zéro réseau / .stale servi + refetch silencieux) sert le tray
  du cache 24 h AVANT tout réseau ; le body réactif (`groupIndex` sur @Published) monte le
  viewer sans spinner. `forceNetwork: true` ne court plus QUE si le cache ignore le groupe
  (comportement historique conservé, y c. guard isLoading vs boot load).
  RESTE (incrément 2) : fetch unitaire par POST id → groupe minimal → rendu ThumbHash
  immédiat pour le cas « story hors tray » (nécessite le plumbing postId dans les ~5 call
  sites du container + éventuellement endpoint stories-par-user, à coordonner avec G1/R8).
- [~] **R5 (P0) Garantir la relecture OFFLINE des stories vues.** — EN COURS
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
  RESTE (it.4+) : (c) test d'intégration « voir → couper réseau → relire → zéro requête »
  (scénario simulateur) ; raffinement : les stories de l'AUTEUR courant ne passent pas par
  markViewed → non pinnées (mineur : l'auteur garde ses assets composer en local).
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
- [ ] **R8 (P2) Pagination du tray (client).** `fetchStoriesFromNetwork` appelle
  `list(cursor: nil, limit: 50)` — curseur ignoré, plafond 50. À traiter AVEC G1 (le serveur ne
  pagine pas non plus).
- [ ] **R9 (P2) Chiffrer le store `stories`.** `CacheCoordinator.swift:230` — stories en clair
  alors que messages/profiles/notifications sont chiffrés. Contenu social sensible.
- [ ] **R10 (P3) `toRenderableSlide` : `content` legacy résolu sur `chain.first` seulement**
  (`StoryModels.swift:1990-2058`) vs chaîne complète pour textObjects. Harmoniser.
- [ ] **R11 (P3) `isViewed: Bool` → `viewedAt: Date?`** (règle CLAUDE.md « nullable DateTime,
  pas de boolean redondant »). Migration douce : garder le decode Bool, ajouter le timestamp.
- [ ] **R12 (P2, architecture) Story store relationnel.** Le tray = UN blob JSON
  `stories:recent_tray_v2` ré-encodé en entier à chaque write (chiffrement futur = encore plus
  cher). Cible : clé par groupe (`stories:group:<authorId>`) ou table dédiée + persistence
  actor (parité feed/messages). Gros chantier — passer par un plan dédié
  (`docs/superpowers/plans/`), pas une itération loop.

### BACKEND — instantanéité réseau

- [~] **G1 (P1) Tray léger + delta-sync.** — DELTA-SYNC FAIT it.13
  ✅ Incrément (a) : `GET /posts/feed/stories?updatedSince=<ISO8601>` — ne renvoie que les
  stories créées/modifiées depuis le timestamp (`where.AND += { updatedAt: { gt } }`),
  convention alignée sur le précédent `GET /conversations?updatedSince`. Timestamp invalide
  ignoré (full). Rétro-compatible. Disparitions couvertes par story:deleted + expiry client.
  RESTE : (b) projection légère `?projection=tray`, (c) pagination cursor (avec R8 client),
  consommation iOS du delta (`fetchStoriesFromNetwork` + merge), index Prisma
  `@@index([type, updatedAt])` sur Post à poser avec un déploiement schema, et DÉPLOIEMENT
  gateway prod (pull+up explicite) avant que le client ne s'y branche.
- [ ] **G2 (P2) Double pipeline de traduction du `content` story.**
  Preuve : `PostService.createPost` L193 (`triggerStoryTextTranslation`, audience-driven) ET
  `routes/posts/core.ts` L98-115 (`translatePost`, 5 langues fixes) écrivent tous deux dans
  `Post.translations`. Redondance ZMQ + écritures concurrentes. Garder le pipeline
  audience-driven, gater l'autre pour type STORY (vérifier les tests gateway existants).
- [ ] **G3 (P2) textObjects → langues audience-driven.** `getActiveTargetLanguages` = 10 langues
  codées en dur (TODO explicite `PostService.ts:392`). Réutiliser la résolution d'audience du
  pipeline A (contacts de l'auteur).
- [ ] **G4 (P3) Champ mort `Post.storyViews Json?`** (schema L2874, jamais écrit/lu — PostView
  est la vérité). Retirer du schema (migration) ou documenter.
- [ ] **G5 (P3) Consolider les 3 implémentations de visibilité** (PostFeedService,
  PostService, canUserViewPost) en un module unique — risque de dérive/fuite documenté.
- [ ] **G6 (P3) Constante d'expiry unifiée.** Serveur = 21 h (`STORY_EXPIRY_HOURS`), client
  `toStoryGroups` fallback = createdAt+21 h mais `isExpired` défaut interne = +24 h. Sans effet
  aujourd'hui (expiresAt toujours posé) mais piège dormant — une seule constante partagée.

### WEB (secondaire — parité lecteur)

- [ ] **W1 (P2) Keyframes/transitions non rendus** (objets statiques). Interpolation CSS/JS
  depuis `StoryKeyframe[]` (portés par chaque textObject/mediaObject).
- [ ] **W2 (P2) Timer découplé de la vidéo** (`setTimeout` indépendant, vidéos muettes forcées).
  Porter le pattern iOS : gate sur `canplay`/`waiting`/`stalled` du `<video>`.
- [ ] **W3 (P2) Composer web : visibilités COMMUNITY/EXCEPT/ONLY + overlays.** Reliquat connu
  (mémoire story-status-community-visibility). `visibilityUserIds` déjà dans
  `CreateStoryRequest` web — manque l'UI.
- [ ] **W4 (P3) Realtime web : écouter `story:deleted` ; brancher `story:translation-updated`**
  (écouté dans use-social-socket mais handler absent de useStoriesRealtime).
- [ ] **W5 (P3) Préchargement du média du slide suivant** (aucun `preload` dans StoryViewer.tsx).

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
- [ ] **U2 (P2) Haptics** : `.sensoryFeedback` (iOS 17+) sur changement de slide, gel/reprise
  buffering, publication réussie ; fallback `UIImpactFeedbackGenerator` iOS 16.
- [ ] **U3 (P2) Chrome du reader en matériaux natifs** : header/footer/sidebar en
  `.ultraThinMaterial` + sur iOS 26 adopter les surfaces Liquid Glass (`glassEffect` API si
  dispo dans le SDK cible) — TOUJOURS via gating `if #available`, jamais de régression 16-25.
  Respecter la mémoire « texte blanc illisible en Light sur verre » (épingler colorScheme si
  besoin).
- [ ] **U4 (P2) Reprise de brouillon** : remplacer l'alerte texte par une carte de reprise
  (cover composite du draft, « Reprendre / Recommencer »), présentée dans le composer et/ou en
  chip sur « Ma story ». C'est le pendant UX de E1.
- [ ] **U5 (P3) État de chargement prolongé** (avec R2) : ThumbHash + progress ring fine autour
  de l'avatar auteur (métaphore déjà connue du tray), bouton passer.
- [ ] **U6 (P3) Dynamic Type/VoiceOver du viewer** : étendre la passe a11y (PR #1211) aux
  overlays reader (labels des zones tap prev/next, annonce du changement de slide,
  `accessibilityValue` de progression).
- [ ] **U7 (P3) ProMotion** : vérifier `CADisplayLink.preferredFrameRateRange` du timer reader
  (économie batterie 120 Hz → ne commiter la barre qu'à 1/300 déjà fait ; vérifier le link).

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

## it.15 — R7 : sniff d'extension avant routage vers les stores (hash au push)

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
