# Réels — réduction de la chauffe iPhone (SOTA video playback)

## Diagnostic (vérifié dans le code)
Surchauffe = travail CPU/GPU au-delà du nécessaire pendant la lecture des réels.
Décodage sain (AVPlayerLayer GPU, pas de CIFilter/Metal par frame, pas de double-décode).

### Causes racines
1. **Re-render SwiftUI 10 Hz de l'arbre vidéo** — `SharedAVPlayerManager` publie `@Published currentTime`
   10×/s via un `Task { @MainActor }` par tick (callback déjà sur `.main`). `ReelVideoView` (observe le
   manager) ré-évalue son `body` 10×/s, **dont le `.blur(radius: 28)` plein écran** (`ReelImageBackdrop`)
   → tueur GPU. Idem `ReelFeedVideoSurface` (feed, sans blur, moins cher).
2. **6 AVQueuePlayer prérollés** (`StoryMediaLoader.maxCachedPlayers = 6`, `preroll(atRate:1.0)`,
   `forwardBuffer=2s`). SOTA short-video = pool ~3 (prev/current/next).
3. **Aucune adaptation thermique** — rien n'observe `ProcessInfo.thermalState` (WWDC19 #422).

### Déjà correct (NE PAS toucher)
- Loop manuel `didPlayToEndTime`+`seek(0)`+`play()` = recommandé Apple (vs AVPlayerLooper streaming).
- Pause off-screen + call-aware OK. Un seul player actif.

## Plan (Pack complet SOTA)
- [x] T1 (TDD) `MediaThermalPolicy` rule-engine pur (SDK MeeshyUI/Media) + 14 tests RED→GREEN.
- [x] T2 `SharedAVPlayerManager` : `MainActor.assumeIsolated` (plus de Task/tick), `lastHeartbeat`
      en propriété, cadence via policy, bitrate player actif via policy.
- [x] T3 `ReelImageBackdrop: Equatable` + `ReelPoster: Equatable` + `.equatable()` (4 sites)
      → mémoïse le flou 28pt + le poster sur le tick de lecture.
- [x] T4 `StoryMediaLoader` : pool 6→3 ; `preloadVideoPlayer` lit la policy (forwardBuffer 2→1, bitrate).
- [x] T5 `FeedViewModel.prefetchMedia` : gate preroll vidéo sous thermal critical.
- [x] T6 Build SDK+app (92s) + suites vertes (24 tests : 14 MediaThermalPolicy + 6 LoopMute + 3 Release + 1 WatchSample).

## Review
**Décision heat-first** : la policy bitrate ne décap JAMAIS (pas de `0`/ABR libre — le SOTA « uncap
when visible » maximise la qualité, pas l'objectif). Player visible plafonné 1.5 Mbps, preroll 1.0 Mbps,
serious 0.9 / critical 0.6.

**Fichiers touchés**
- SDK : `MediaThermalPolicy.swift` (nouveau), `SharedAVPlayerManager.swift`, `StoryMediaLoader.swift`,
  `MediaThermalPolicyTests.swift` (nouveau).
- App : `ReelsPlayerView.swift`, `ReelFeedVideoSurface.swift`, `FeedViewModel.swift`.

**Non-régressions vérifiées** : aucun test n'assertait l'ancien buffer 2.0s / pool 6 ; `SharedAVPlayer*`
verts ; app compile.

**Reste (non automatisable ici)** : validation thermique sur device réel par l'utilisateur (Instruments
Energy Log / ressenti). Levier principal attendu = mémoïsation du flou + cadence + pool.
