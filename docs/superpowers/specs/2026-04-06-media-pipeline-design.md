# Meeshy Media Pipeline — Design Document

> **Date**: 2026-04-06
> **Scope**: iOS app (`apps/ios/`) + Swift SDK (`packages/MeeshySDK/`)
> **Status**: Partie implementee, partie a implementer

---

## 1. Vision

Chaque media (image, video, audio) doit s'afficher **instantanement** quand l'utilisateur le voit. Aucun spinner, aucun ecran vide, aucun delai de demarrage video. Le son doit etre coordonne globalement : un seul audio actif a la fois, ducking intelligent dans les stories, pas de conflit de sessions.

---

## 2. Architecture globale

```
                    ┌──────────────────────────────────────┐
                    │         PRESENTATION LAYER            │
                    │                                       │
                    │  CachedAsyncImage  InlineVideoPlayer  │
                    │  ProgressiveCached  AudioPlayerView   │
                    │  VideoThumbnail    StoryCanvasReader  │
                    └──────────┬───────────────┬───────────┘
                               │               │
                    ┌──────────▼───────────────▼───────────┐
                    │         COORDINATION LAYER            │
                    │                                       │
                    │  PlaybackCoordinator (exclusivite)    │
                    │  StoryMediaCoordinator (stories)      │
                    │  MediaSessionCoordinator (AVSession)  │
                    └──────────┬───────────────┬───────────┘
                               │               │
                    ┌──────────▼───────────────▼───────────┐
                    │          PLAYBACK LAYER               │
                    │                                       │
                    │  SharedAVPlayerManager (video)        │
                    │  AudioPlayerManager (audio SDK)       │
                    │  AudioPlayerManager (audio app)       │
                    │  ReaderState (story multi-track)      │
                    └──────────┬───────────────┬───────────┘
                               │               │
                    ┌──────────▼───────────────▼───────────┐
                    │           CACHE LAYER                 │
                    │                                       │
                    │  CacheCoordinator (hub central)       │
                    │  ├── DiskCacheStore (images 300MB)    │
                    │  ├── DiskCacheStore (audio 200MB)     │
                    │  ├── DiskCacheStore (video 500MB)     │
                    │  ├── DiskCacheStore (thumbs 50MB)     │
                    │  └── GRDBCacheStore (metadata)        │
                    │                                       │
                    │  StoryMediaLoader (preroll pool)      │
                    │  VideoFrameExtractor (timeline)       │
                    └──────────┬───────────────────────────┘
                               │
                    ┌──────────▼───────────────────────────┐
                    │          PREFETCH LAYER               │
                    │                                       │
                    │  FeedViewModel.prefetchMedia()        │
                    │  ConversationViewModel.prefetchRecent │
                    │  StoryViewModel.prefetchAllStoryMedia │
                    └──────────────────────────────────────┘
```

---

## 3. Inventaire : Implemente vs A implementer

### 3.1 Cache Infrastructure

| Composant | Status | Fichier | Description |
|---|---|---|---|
| DiskCacheStore 2-tier (NSCache L1 + disk L2) | **IMPLEMENTE** | `MeeshySDK/Cache/DiskCacheStore.swift` | Actor, 80MB L1, eviction LRU, freshness TTL |
| GRDBCacheStore (metadata) | **IMPLEMENTE** | `MeeshySDK/Cache/GRDBCacheStore.swift` | Actor generique, L1 memory + L2 SQLite |
| CacheCoordinator (hub) | **IMPLEMENTE** | `MeeshySDK/Cache/CacheCoordinator.swift` | 4 DiskCacheStores + 16 GRDBCacheStores + in-memory translation caches |
| CachePolicy SWR (fresh/stale/expired) | **IMPLEMENTE** | `MeeshySDK/Cache/CachePolicy.swift` | 16 policies predefinies avec TTL/staleTTL/maxBytes |
| Helpers nonisolated synchrones | **IMPLEMENTE** | `CacheCoordinator.swift:35-46` | `videoLocalFileURL()`, `audioLocalFileURL()`, `cachedImage()` |
| data(for:) avec download + dedup | **IMPLEMENTE** | `DiskCacheStore.swift:150-181` | Download HTTP si pas en cache, dedup in-flight |
| ThumbHash placeholders | **A IMPLEMENTER** | — | 28 bytes par image, compute serveur, decode 0.1ms client |
| Download resumable (Range header) | **A IMPLEMENTER** | — | Reprendre un download interrompu |
| Progressive JPEG rendering | **A IMPLEMENTER** | — | Afficher image floue pendant download (comme Telegram) |
| Frequency-weighted eviction | **A IMPLEMENTER** | — | LRU pondre par frequence d'acces (comme Instagram) |

### 3.2 Media Prefetch

| Composant | Status | Fichier | Description |
|---|---|---|---|
| Feed prefetch (scroll-driven) | **IMPLEMENTE** | `FeedViewModel.swift:528-599` | Debounce 150ms, TaskGroup parallele, fenetre [i-2, i+7] |
| Feed video preroll | **IMPLEMENTE** | `FeedViewModel.swift:594-597` | Fire-and-forget, 1ere video par fenetre |
| Conversation prefetch | **IMPLEMENTE** | `ConversationViewModel.swift:641-705` | Debounce 300ms, TaskGroup, 30 derniers messages |
| Conversation socket-triggered | **IMPLEMENTE** | `ConversationViewModel.swift:727` | Apres merge nouveaux messages |
| Story prefetch all | **IMPLEMENTE** | `StoryViewModel.swift:106-157` | Toutes stories, preroll 3 premiers groupes |
| Story transition prefetch | **IMPLEMENTE** | `StoryViewerView+Content.swift:805-873` | Prefetch next + 2 ahead, 200-300ms timeout |
| Thumbnail disk persistence | **IMPLEMENTE** | `StoryMediaLoader.swift:86-92` | videoThumbnail() ecrit dans NSCache + disk |
| iOS 18 onScrollPhaseChange | **A IMPLEMENTER** | — | Prefetch velocity-aware : accelerer/annuler selon phase scroll |
| Scroll velocity cancellation | **A IMPLEMENTER** | — | Cancel prefetch quand direction change |
| Prefetch byte budget | **A IMPLEMENTER** | — | Cap 20MB cellulaire, 50MB WiFi par session |
| Sliding window stories | **A IMPLEMENTER** | — | Remplacer prefetch-all par fenetre (current-1, current+2) |
| Network-aware depth | **A IMPLEMENTER** | — | Ajuster profondeur prefetch selon bande passante mesuree |

### 3.3 Video Playback

| Composant | Status | Fichier | Description |
|---|---|---|---|
| 3-tier fallback (prerolled → disk → stream) | **IMPLEMENTE** | `SharedAVPlayerManager.swift:33-70` | Check cache preroll, disk, puis stream |
| Preroll pool FIFO (6 players) | **IMPLEMENTE** | `StoryMediaLoader.swift:147-186` | AVQueuePlayer + preroll(atRate:1.0), eviction FIFO |
| Background cache pendant stream | **IMPLEMENTE** | `SharedAVPlayerManager.swift:69` | Task background data(for:) |
| PIP (Picture-in-Picture) | **IMPLEMENTE** | `SharedAVPlayerManager.swift:103-132` | AVPictureInPictureController |
| Watch progress reporting | **IMPLEMENTE** | `SharedAVPlayerManager.swift:136-156` | POST /attachments/:id/status |
| AVAssetResourceLoader cache-through | **A IMPLEMENTER** | — | Play + cache en un seul pass (comme Telegram) |
| Byte-range initial chunk | **A IMPLEMENTER** | — | Range request premiers 200-500KB pour demarrage rapide |
| First-frame pre-decode | **A IMPLEMENTER** | — | Decoder frame 0 en CGImage avant transition (gapless) |
| Gapless AVQueuePlayer transitions | **A IMPLEMENTER** | — | Enqueue next story dans le meme AVQueuePlayer |
| Adaptive bitrate (HLS) | **A IMPLEMENTER** | — | Serveur transcoder en HLS multi-qualite, client selection auto |

### 3.4 Audio Playback

| Composant | Status | Fichier | Description |
|---|---|---|---|
| Dual-mode (AVAudioPlayer + AVPlayer stream) | **IMPLEMENTE** | `MeeshySDK/Cache/AudioPlayerManager.swift` | Cache local → AVAudioPlayer instant, sinon → AVPlayer stream |
| Cache-first avec resolveMediaURL | **IMPLEMENTE** | `AudioPlayerManager.swift:40-55` | Check disk avant stream |
| onWillPlay/onDidStop callbacks | **IMPLEMENTE** | `AudioPlayerManager.swift:14-15` | Hooks pour PlaybackCoordinator externe |
| App AudioPlayerManager avec PlaybackCoordinator | **IMPLEMENTE** | `Services/AudioPlayerManager.swift` | StoppablePlayer, registre, willStartPlaying |
| AVAudioSession .duckOthers | **A IMPLEMENTER** | — | Baisser Spotify/Apple Music au lieu de couper (1 ligne) |
| Opus codec server-side | **A IMPLEMENTER** | — | Meilleure compression voix (16-32 kbps vs AAC ~64 kbps) |
| Waveform pre-computed server | **A IMPLEMENTER** | — | Calculer waveform a l'upload, envoyer en metadata |
| Cross-conversation playback bar | **A IMPLEMENTER** | — | Audio continue quand on change de conversation (WhatsApp) |

### 3.5 Audio/Video Coordination

| Composant | Status | Fichier | Description |
|---|---|---|---|
| PlaybackCoordinator (exclusivite) | **IMPLEMENTE** | `MeeshyUI/Media/PlaybackCoordinator.swift` | Stop all others, WeakRef, prune dead |
| StoryMediaCoordinator | **IMPLEMENTE** | `MeeshyUI/Story/StoryMediaCoordinator.swift` | Represente toutes stories comme 1 StoppablePlayer |
| MediaSessionCoordinator (actor) | **EXISTE NON UTILISE** | `MeeshySDK/MediaSessionCoordinator.swift` | Actor avec reference counting, 3 roles (play/record/playAndRecord) |
| AVAudioSession unifie (.default) | **IMPLEMENTE** | Multiple fichiers | Tous sur .playback .default (plus de .moviePlayback) |
| Intra-story ducking | **IMPLEMENTE** | `StoryCanvasReaderView.swift:868-883` | Reference-counted, duck bg a 30%, fade 0.4s |
| Ducking state reset | **IMPLEMENTE** | `StoryCanvasReaderView.swift:801` | Reset dans stopAllMedia() |
| System-level ducking (.duckOthers) | **A IMPLEMENTER** | — | AVAudioSession option pour Spotify/podcasts |

### 3.6 Story Multi-Track Engine

| Composant | Status | Fichier | Description |
|---|---|---|---|
| Background audio (looping, fade-in, cache-first) | **IMPLEMENTE** | `StoryCanvasReaderView.swift:653-690` | Prerolled → disk → network, fade 20%→100% sur 1s |
| Background video (muted, looping) | **IMPLEMENTE** | `StoryCanvasReaderView.swift:1090-1105` | Cache-first, AVPlayerLooper |
| Foreground videos (timing-deferred) | **IMPLEMENTE** | `StoryCanvasReaderView.swift:862-989` | pendingVideoStarts, check par timer 0.05s, KVO readyToPlay |
| Foreground audios (timing-deferred) | **IMPLEMENTE** | `StoryCanvasReaderView.swift:1046-1086` | Meme pattern que videos |
| Foreground images (parallel TaskGroup) | **IMPLEMENTE** | `StoryCanvasReaderView.swift:631-660` | Phase 1 sync cache, Phase 2 parallel network |
| Volume fade in/out par element | **IMPLEMENTE** | `StoryCanvasReaderView.swift:844-860` | Timer 20 steps, configurable par media |
| Global fadeOutThenStop | **IMPLEMENTE** | `StoryCanvasReaderView.swift:803-840` | Fade 2s vers 10% puis stop |
| Mute/unmute notifications | **IMPLEMENTE** | `StoryCanvasReaderView.swift:697-725` | storyComposerMuteCanvas/Unmute |
| Audio ducking (foreground → background) | **IMPLEMENTE** | `StoryCanvasReaderView.swift:868-883` | Duck bg quand fg joue |

### 3.7 Image Display

| Composant | Status | Fichier | Description |
|---|---|---|---|
| CachedAsyncImage (sync init + async fallback) | **IMPLEMENTE** | `MeeshyUI/Primitives/CachedAsyncImage.swift:4-84` | DiskCacheStore.cachedImage sync, puis async |
| ProgressiveCachedImage (thumb → full) | **IMPLEMENTE** | `CachedAsyncImage.swift:204-294` | 2 taches paralleles, fade anime |
| CachedAvatarImage (initials fallback) | **IMPLEMENTE** | `CachedAsyncImage.swift:92-146` | Avatar + fallback initiales colores |
| CachedBannerImage (gradient fallback) | **IMPLEMENTE** | `CachedAsyncImage.swift:148-202` | Banniere + gradient fallback |
| VideoThumbnailView (Range request 1er Mo) | **IMPLEMENTE** | `MeeshyUI/Media/VideoThumbnailView.swift` | Range: bytes=0-1048575, cache JPEG |
| ImageIO hardware downsampling | **IMPLEMENTE** | `StoryMediaLoader.swift:44-62` | CGImageSourceCreateThumbnailAtIndex, 5-10x plus efficient |
| ThumbHash placeholder | **A IMPLEMENTER** | — | 28 bytes → image floue coloree en 0.1ms |
| BlurHash placeholder (alternative) | **A IMPLEMENTER** | — | 34 bytes, plus repandu mais moins precis |

---

## 4. Flux detailles par contexte

### 4.1 Feed — Lifecycle d'un post media

```
1. FeedView.onAppear(post)
   └── viewModel.prefetchMediaForPost(post.id)
       └── debounce 150ms + distance guard (>= 2 index)
           └── prefetchMedia(around: index)
               ├── TaskGroup {
               │   ├── image.thumbnailUrl → resolveURL → imageStore.image()
               │   ├── image.fullUrl → resolveURL → imageStore.image()
               │   ├── video.thumbnailUrl → resolveURL → imageStore.image()
               │   │   └── OU videoThumbnail() → NSCache + disk "thumb:" prefix
               │   └── audio.url → resolveURL → audio.data() (download+cache)
               │ }
               └── Task { StoryMediaLoader.preloadAndCachePlayer(1ere video) }

2. FeedPostCard+Media renders
   ├── Image: ProgressiveCachedImage(thumbnailUrl:, fullUrl:)
   │   ├── init: DiskCacheStore.cachedImage(resolved) → INSTANT si prefetch
   │   └── .task: CacheCoordinator.images.image(resolved) → async fallback
   ├── Video: InlineVideoPlayerView
   │   ├── thumbnailLayer: CachedAsyncImage(thumbUrl) → INSTANT
   │   └── tap play: SharedAVPlayerManager.load(fileUrl)
   │       ├── 1. StoryMediaLoader.cachedPlayer(url) → INSTANT si prerolled
   │       ├── 2. CacheCoordinator.videoLocalFileURL → local file
   │       └── 3. AVPlayer(url:) stream + bg cache
   └── Audio: AudioPlaybackManager.play(fileUrl)
       ├── Cache: CacheCoordinator.audio.data() → AVAudioPlayer
       └── Network: AVPlayer(url:) stream → instant start

[A IMPLEMENTER] ThumbHash:
   API response includes thumbHash: "2fcaGQB3..."
   ProgressiveCachedImage.init: decode thumbHash → UIImage (0.1ms)
   → Phase 1: ThumbHash blur (instant)
   → Phase 2: Thumbnail (50-100ms si prefetch)
   → Phase 3: Full image (100-300ms)
```

### 4.2 Stories — Lifecycle d'un slide

```
1. StoryViewModel.loadStories()
   └── prefetchAllStoryMedia(groups)
       ├── Pour chaque story, chaque media:
       │   ├── Video/Audio: DiskCacheStore.data(url) download + cache
       │   │   └── 3 premiers groupes: StoryMediaLoader.preloadAndCachePlayer()
       │   └── Image: DiskCacheStore.image(url) download + NSCache
       └── Priority: .utility (background)

2. StoryViewerView.onAppear
   └── prefetchCurrentGroup()
       ├── Toutes stories du groupe actuel
       └── 2 premieres du groupe suivant

3. StoryCanvasReaderView.onAppear (par slide)
   ├── StoryMediaCoordinator.activate() → AVAudioSession + stop others
   ├── startPlaybackTimer() → currentTime = 0
   ├── startBackgroundAudio()
   │   ├── StoryMediaLoader.cachedPlayer(url) → INSTANT
   │   ├── CacheCoordinator.audioLocalFileURL → disk local
   │   └── AVPlayer(url:) → stream
   │   └── Fade-in 20% → targetVolume sur 1s
   ├── startForegroundVideos()
   │   └── Pour chaque video:
   │       ├── Si currentTime >= startTime → createAndStartVideoPlayer()
   │       │   ├── StoryMediaLoader.cachedPlayer(url) → INSTANT
   │       │   └── AVPlayer(url:) + KVO readyToPlay
   │       │   └── foregroundSoundDidStart() → DUCK background
   │       └── Sinon → pendingVideoStarts[id] (timer check 0.05s)
   ├── startForegroundAudios()
   │   └── Meme pattern que videos + foregroundSoundDidStart()
   └── .task { loadForegroundImages() }
       ├── Phase 1: sync (preloaded dict + DiskCacheStore.cachedImage)
       └── Phase 2: TaskGroup parallel network

4. Transition slide
   ├── onDisappear: StoryMediaCoordinator.deactivate() → stopAllMedia()
   │   └── Reset: activeForegroundSoundCount = 0, isDucked = false
   ├── Prefetch next: prefetchAllMedia(for: nextStory) avec 300ms timeout
   └── onAppear nouveau slide: cycle recommence

[A IMPLEMENTER] Gapless transition:
   Pendant slide N joue:
   ├── Pre-decoder frame 0 de slide N+1 en CGImage
   ├── Afficher CGImage instantanement au crossfade
   └── Swap vers AVPlayer prerolled en dessous
   Resultat: zero gap visuel (comme Instagram)
```

### 4.3 Messages — Lifecycle media conversation

```
1. ConversationView.onAppear
   └── viewModel.loadMessages()
       ├── Cache check → messages → prefetchRecentMedia()
       └── Network fallback → messages → prefetchRecentMedia()

2. prefetchRecentMedia() (debounce 300ms)
   └── executePrefetchRecentMedia()
       ├── Snapshot: last 30 messages with attachments
       ├── TaskGroup {
       │   ├── image thumbUrl → resolveURL → imageStore.image()
       │   ├── image fileUrl → resolveURL → imageStore.image()
       │   ├── video thumbUrl → resolveURL → imageStore.image()
       │   │   └── OU videoThumbnail() → NSCache + disk
       │   └── audio fileUrl → resolveURL → audio.data()
       │ }
       └── Task { preloadAndCachePlayer(1ere video) }

3. Nouveau message via socket
   └── observeSync() → merge → prefetchRecentMedia()

4. ThemedMessageBubble renders
   ├── Image: CachedAsyncImage → INSTANT si prefetch
   ├── Video: InlineVideoPlayerView → thumbnail INSTANT, play 3-tier
   └── Audio: App AudioPlayerManager.play()
       ├── resolveURL → CacheCoordinator.audio.data()
       └── PlaybackCoordinator.willStartPlaying(external:) → stop others
```

---

## 5. Audio Ducking — Design detaille

### 5.1 Intra-story (IMPLEMENTE)

```
ReaderState:
  activeForegroundSoundCount: Int = 0
  isDucked: Bool = false
  duckRatio: Float = 0.3 (30% du volume target)
  duckFadeDuration: TimeInterval = 0.4s

foregroundSoundDidStart():
  count += 1
  si !isDucked ET backgroundPlayer existe:
    isDucked = true
    fadeVolume(bg, from: bg.volume, to: targetVolume * 0.3, duration: 0.4s)

foregroundSoundDidStop():
  count = max(0, count - 1)
  si count == 0 ET isDucked ET backgroundPlayer existe:
    isDucked = false
    fadeVolume(bg, from: bg.volume, to: targetVolume, duration: 0.4s)

Appele depuis:
  - injectPrerolledVideoPlayer → play() → didStart
  - createAndStartVideoPlayer → play()/KVO ready → didStart
  - createAndStartAudioPlayer → play()/KVO ready → didStart
  - End-of-playback (non-loop) → didStop
  - stopAllMedia() → reset count=0, isDucked=false
```

### 5.2 System-level (A IMPLEMENTER)

```
[A IMPLEMENTER] AVAudioSession .duckOthers:

SharedAVPlayerManager.load():
  setCategory(.playback, mode: .default, options: [.duckOthers])
  → Spotify/Apple Music baise le volume automatiquement

SharedAVPlayerManager.stop():
  setActive(false, options: .notifyOthersOnDeactivation)
  → Spotify/Apple Music restaure le volume

App AudioPlayerManager.play():
  setCategory(.playback, mode: .default, options: [.duckOthers])
  → Meme comportement

StoryMediaCoordinator.activate():
  setCategory(.playback, mode: .default, options: [.mixWithOthers, .duckOthers])
  → Stories mix avec musique de fond mais a volume reduit
```

---

## 6. Optimisations SOTA a implementer (par priorite)

### P0 — Quick wins (< 1 jour chacun)

#### 6.1 AVAudioSession .duckOthers
**Effort**: 3 lignes de code
**Impact**: UX majeure — Spotify ne s'arrete plus quand on joue un vocal

```swift
// SharedAVPlayerManager.swift:43
options: [.duckOthers]

// App AudioPlayerManager.swift:29
options: [.duckOthers]

// StoryMediaCoordinator.swift:31
options: [.mixWithOthers, .duckOthers]
```

#### 6.2 ThumbHash server-side compute
**Effort**: 1 jour (gateway + iOS)
**Impact**: Plus jamais d'ecran vide

```
Gateway (a l'upload):
  1. sharp(image).resize(100, 100).raw() → rgbaPixels
  2. rgbaToThumbHash(w, h, rgba) → Uint8Array (28 bytes)
  3. Base64 encode → stocker sur Attachment.thumbHash

API response:
  { "fileUrl": "...", "thumbHash": "2fcaGQB3h3h4eIeFeEh3eYhw+j2w" }

iOS (CachedAsyncImage init):
  if let hash = attachment.thumbHash {
      let placeholder = ThumbHashDecoder.decode(hash) // 0.1ms
      _image = State(initialValue: placeholder)
  }
```

### P1 — Medium effort (1-3 jours chacun)

#### 6.3 iOS 18 scroll-aware prefetching
**Effort**: 1-2 jours
**Impact**: Prefetch intelligent selon vitesse scroll

```swift
// FeedView.swift
ScrollView {
    LazyVStack { ... }
}
.onScrollPhaseChange { oldPhase, newPhase in
    switch newPhase {
    case .decelerating:
        // Scroll ralentit → prefetch agressif autour de la position estimee
        viewModel.prefetchMedia(around: estimatedStopIndex, depth: .deep)
    case .tracking where velocity > threshold:
        // Scroll rapide → cancel tout, prefetch minimal
        viewModel.cancelPrefetch()
    case .idle:
        // Arret → prefetch dans les deux directions
        viewModel.prefetchMedia(around: currentIndex, depth: .normal)
    default: break
    }
}
```

#### 6.4 Gapless story transition (first-frame pre-decode)
**Effort**: 2-3 jours
**Impact**: Zero gap visuel entre stories

```swift
// Pendant slide N joue:
let nextStory = groups[currentGroupIndex].stories[currentStoryIndex + 1]
let preDecodedFrame: UIImage? = await preDecodeFirstFrame(story: nextStory)

// Au moment du crossfade:
// 1. Afficher preDecodedFrame comme Image statique (INSTANT)
// 2. En dessous, demarrer le vrai AVPlayer
// 3. Quand AVPlayer est readyToPlay → retirer l'Image statique
// Resultat: l'utilisateur ne voit jamais de frame noir
```

#### 6.5 Prefetch byte budget
**Effort**: 1 jour
**Impact**: Pas de data shock cellulaire

```swift
actor MediaPrefetchBudget {
    private var consumedBytes: Int = 0
    private let maxBytes: Int  // 20MB cellular, 50MB WiFi

    func canPrefetch(estimatedBytes: Int) -> Bool {
        consumedBytes + estimatedBytes <= maxBytes
    }
    func consume(_ bytes: Int) { consumedBytes += bytes }
    func reset() { consumedBytes = 0 }
}
```

### P2 — Higher effort (3-7 jours chacun)

#### 6.6 AVAssetResourceLoader cache-through
**Effort**: 5-7 jours
**Impact**: Video joue PENDANT le cache (pas fork cache OU stream)

```swift
// Custom URL scheme: cache-meeshy://
// AVAssetResourceLoaderDelegate intercepte toutes les requetes:
//   1. Verifier DiskCacheStore pour les bytes demandes
//   2. Si pas en cache → fetch depuis network
//   3. Ecrire en cache au fur et a mesure
//   4. Retourner les bytes au player immediatement
// Resultat: play + cache en un seul pass
```

#### 6.7 Network-aware prefetch depth
**Effort**: 2-3 jours
**Impact**: Optimiser bande passante selon connexion

```swift
actor NetworkQualityMonitor {
    private var recentSpeeds: [Double] = []  // bytes/sec
    
    func recordDownload(bytes: Int, duration: TimeInterval) {
        recentSpeeds.append(Double(bytes) / duration)
        if recentSpeeds.count > 10 { recentSpeeds.removeFirst() }
    }
    
    var estimatedBandwidth: Double {
        recentSpeeds.isEmpty ? 1_000_000 : recentSpeeds.reduce(0, +) / Double(recentSpeeds.count)
    }
    
    var prefetchDepth: Int {
        switch estimatedBandwidth {
        case ..<100_000: return 2   // < 100 KB/s → minimal
        case ..<500_000: return 4   // 100-500 KB/s → moderate
        case ..<2_000_000: return 7 // 500KB-2MB/s → aggressive
        default: return 10          // > 2 MB/s → max
        }
    }
}
```

#### 6.8 Progressive image rendering
**Effort**: 3-5 jours
**Impact**: Images apparaissent progressivement (flou → net) comme Telegram

```swift
// Modifier DiskCacheStore.image(for:) pour:
// 1. Telecharger par chunks (URLSession bytes stream)
// 2. A chaque chunk, decoder partiellement (CGImageSource incremental)
// 3. Publier l'image partielle via callback
// 4. CachedAsyncImage affiche chaque version de plus en plus nette
```

### P3 — Long terme (> 1 semaine)

#### 6.9 Serveur HLS multi-qualite
**Effort**: 2-3 semaines (backend)
**Impact**: Demarrage video instantane en basse qualite, montee progressive

```
Gateway/Translator (a l'upload video):
  1. Transcoder en 3 variantes: 240p/480p/720p
  2. Generer playlist HLS (.m3u8)
  3. Stocker sur CDN

iOS:
  AVPlayer(url: hlsPlaylistURL)
  → iOS choisit automatiquement la qualite selon bande passante
  → Demarrage en 240p (< 50ms), montee en 720p
```

#### 6.10 Waveform server-side
**Effort**: 1-2 jours (backend) + 1 jour (iOS)
**Impact**: Waveform audio instantanee sans compute client

```
Gateway (a l'upload audio):
  1. FFmpeg: extraire samples → reduire a 50 points
  2. Stocker: attachment.waveform = [0.2, 0.8, 0.3, ...]

iOS:
  AudioPlayerView recoit waveform[] dans l'API
  → Affiche immediatement sans decoder l'audio
```

---

## 7. Metriques cibles

| Metrique | Cible | Status actuel |
|---|---|---|
| Feed image → affichage | < 16ms (1 frame) si prefetch | ~16ms (cache hit), ~300ms (cache miss) |
| Video tap-to-play | < 100ms | ~100ms (prerolled), ~500ms (stream) |
| Audio tap-to-play | < 50ms | ~50ms (cache), ~1-2s (download complet) → ~200ms (stream) |
| Story transition | < 50ms | ~200-300ms (timeout) |
| Story slide images | < 1 frame | ~100-200ms (sequential → parallel : corrige) |
| Memory peak | < 300MB | ~490MB potentiel (a reduire) |
| Prefetch bandwidth waste | < 20% | ~30-40% estime (pas de cancellation) |

---

## 8. Fichiers cles et ownership

| Fichier | Module | Responsabilite |
|---|---|---|
| `MeeshySDK/Cache/CacheCoordinator.swift` | SDK | Hub central cache, helpers nonisolated |
| `MeeshySDK/Cache/DiskCacheStore.swift` | SDK | Cache media disk + memory, download + dedup |
| `MeeshySDK/Cache/CachePolicy.swift` | SDK | Politiques TTL/stale/maxBytes |
| `MeeshySDK/Cache/AudioPlayerManager.swift` | SDK | Audio dual-mode (local + stream) |
| `MeeshyUI/Media/SharedAVPlayerManager.swift` | UI | Video 3-tier fallback + PIP |
| `MeeshyUI/Media/PlaybackCoordinator.swift` | UI | Exclusivite lecture |
| `MeeshyUI/Story/StoryMediaLoader.swift` | UI | Preroll pool + ImageIO downsample + thumbnails |
| `MeeshyUI/Story/StoryMediaCoordinator.swift` | UI | Stories exclusive playback |
| `MeeshyUI/Story/StoryCanvasReaderView.swift` | UI | Multi-track engine + ducking |
| `MeeshyUI/Primitives/CachedAsyncImage.swift` | UI | Image loading progressif |
| `apps/ios/.../FeedViewModel.swift` | App | Feed prefetch + debounce |
| `apps/ios/.../ConversationViewModel.swift` | App | Message prefetch + debounce |
| `apps/ios/.../StoryViewModel.swift` | App | Story prefetch all |
| `apps/ios/.../Services/AudioPlayerManager.swift` | App | Audio app avec PlaybackCoordinator |
