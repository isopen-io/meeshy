# Timeline Editor — Audit SOTA des choix techniques

**Date:** 2026-05-06
**Auditeur:** Senior Performance Engineer (recherches WebSearch + WebFetch, ~16 WebSearch + 6 WebFetch)
**Cible:** iOS 17+, Swift 6, devices iPhone SE 3 → iPhone 16 Pro
**Documents audités:**
- spec : `docs/superpowers/specs/2026-05-05-story-timeline-editor-design.md`
- 4 plans : `docs/superpowers/plans/2026-05-05-timeline-plan-{1,2,3,4}-*.md`

---

## Synthèse exécutive

| # | Pilier | Choix actuel | Verdict | Action |
|---|--------|--------------|---------|--------|
| 1 | Vidéo composition | `AVMutableComposition` + `AVMutableVideoComposition` + `AVAsynchronousCIImageFilteringRequest` (CIDissolveTransition) | ⚠️ Hybride | Garder pour crossfade ; pour `dissolve` et toute future transition non-opacity, basculer sur `AVVideoCompositing` custom Metal |
| 2 | Vidéo preview / scrubbing | `AVPlayer + AVPlayerItem(asset: composition)` + `addPeriodicTimeObserver` | ✅ SOTA pour preview standard | Garder ; ajouter `AVPlayerItemVideoOutput` + `CMSampleBufferDisplayLayer` UNIQUEMENT pour le scrub manuel hors lecture (path déjà mentionné en §3.5) |
| 3 | Upscaling / compositing GPU | Render natif 1080×1920, pas d'upscaling | ✅ SOTA | Ne PAS introduire MetalFX (coût mémoire/thermal trop élevé sur SE 3 pour un gain négligeable). Justifier explicitement l'absence dans le spec |
| 4 | Audio engine multi-piste | `AVAudioEngine` + `AVAudioPlayerNode` + `AVAudioMixerNode` | ✅ SOTA | Garder. Ajouter cible latence explicite (~1.5 ms à 64 frames) et `AVAudioSession.setPreferredIOBufferDuration` |
| 5 | Audio DSP (waveform, FFT) | ~80 samples pré-calculés + `AVAudioFile.read` chunked 4096 | ✅ SOTA | Garder. Si besoin de FFT live un jour : vDSP (8x plus rapide que MPS sur les tailles cibles). Documenter le choix |
| 6 | Image pipeline (filtres, thumbnails) | `CIContext(metal:)` + `CIFilter` + AsyncImage/CacheCoordinator (Kingfisher retiré 2026-05) + `UIImage.preparingThumbnail` | ⚠️ Hybride | Pour les frame-strip thumbnails depuis disque local (cas timeline), basculer sur `CGImageSourceCreateThumbnailAtIndex` + `kCGImageSourceShouldCacheImmediately:false` (2-4x plus rapide, moins de mémoire) |
| 7 | Compositing UI (ruler, waveform) | SwiftUI `Canvas` + Metal-backed CALayers indirects | ✅ SOTA | Garder. Ajouter `.drawingGroup()` sur `RulerView` et `AudioClipBar`. PAS de MTKView |
| 8 | Concurrency (orchestration) | `@MainActor` + `Sendable` + `Combine PassthroughSubject` | ⚠️ Hybride | Pour Socket.IO events legacy : garder Combine. Pour les nouvelles streams 60Hz internes timeline : préférer `AsyncStream` + `Observation`. Cache `actor` → garder, mais évaluer `Mutex` (Swift 6 / iOS 18) si profiling montre contention |
| 9 | Encoding export (futur) | `AVAssetExportSession` (stub) | ⚠️ Hybride | Pour preset HD1080 sans transition custom : OK. Dès que `dissolve` ou keyframe-driven export entre en jeu, basculer sur `AVAssetWriter` + `AVAssetReader` + `AVVideoCompositing` custom. À documenter MAINTENANT dans le stub |
| 10 | Profiling / observabilité | `XCTMetric` (Clock, Memory, OSSignpost) | ⚠️ Hybride | Compléter avec `OSSignposter` (iOS 16+, API Swift native) + intégrer `MXSignpostMetric` dans MetricKit pour la prod (perf live sans Instruments) |
| 11 | Pipeline réseau | Socket.IO 16.1 + URLSession + uploads chunked custom | ⚠️ Hybride | Garder Socket.IO court terme (cross-platform, reconnexion auto). HTTP/3 déjà actif par défaut iOS 15+. Pour uploads >50 MB : `URLSession.uploadTask(withStreamedRequest:)` + `InputStream` chunked (jamais charger fichier en mémoire) |

**Résumé** : **3 piliers ✅ SOTA tels quels**, **8 piliers ⚠️ hybrides** (à ajuster), **0 pilier ❌ obsolète**. Le spec est globalement excellent, surtout pour un v1. Les ajustements proposés sont chirurgicaux, pas de refonte.

---

## Pilier 1 — Vidéo composition

**Choix actuel** : `AVMutableComposition` + `AVMutableVideoComposition` + `AVAsynchronousCIImageFilteringRequest` (`CIDissolveTransition` pour le dissolve).

**Sources consultées** :
- [WWDC25 — Discover Metal 4](https://developer.apple.com/videos/play/wwdc2025/205/) — Metal 4 unifié, MetalFX Frame Interpolation, ray tracing denoiser. **Aucune mention de nouvelle API `AVVideoCompositing`** en 2025
- [Apple Doc — AVAsynchronousCIImageFilteringRequest](https://developer.apple.com/documentation/avfoundation/avasynchronousciimagefilteringrequest) — confirme l'API officielle Apple pour CI filtering frame-par-frame dans une `AVMutableVideoComposition`
- [Apple Doc — AVVideoComposition](https://developer.apple.com/documentation/avfoundation/avvideocomposition) — toujours canon en 2026
- [Use Your Loaf — WWDC 2024 Viewing Guide](https://useyourloaf.com/blog/wwdc-2024-viewing-guide/) — WWDC 2024 sur AVFoundation : intégrations HLS interstitials + media performance API, **pas de nouvelle API composition timeline**
- StackOverflow / forums Apple : custom `AVVideoCompositing` + Metal compute = pattern utilisé par CapCut/InShot pour transitions complexes

**Comparatif SOTA** :

| Approche | Cas d'usage | Perf | Complexité |
|----------|-------------|------|------------|
| `AVMutableVideoCompositionLayerInstruction.setOpacityRamp` | Crossfade, fade in/out | ⭐⭐⭐⭐⭐ (natif, zéro custom) | ⭐ |
| `AVAsynchronousCIImageFilteringRequest` + CIDissolveTransition | Dissolve simple | ⭐⭐⭐ (CI Metal-backed mais 1 frame de latence par filter chain) | ⭐⭐ |
| `AVVideoCompositing` custom + Metal compute kernel | Push, wipe, swipe, zoom, masques organiques | ⭐⭐⭐⭐⭐ (full GPU, 0 latency) | ⭐⭐⭐⭐ |

**Verdict** : ⚠️ Hybride. Le choix actuel est OK pour le v1 (crossfade + dissolve simple), mais le `dissolve` via `AVAsynchronousCIImageFilteringRequest` introduit un overhead de pipeline CI vs un Metal compute pur. Pour les transitions futures non-opacity (push, wipe, zoom listées comme "futur" dans le spec §2.1), un `AVVideoCompositing` custom + Metal sera obligatoire.

**Recommandation** :
1. Garder `setOpacityRamp` pour `crossfade` (c'est littéralement la primitive optimale Apple)
2. Garder CIDissolveTransition pour le launch (`dissolve`), MAIS ajouter dans le spec une note d'architecture : "Quand on ajoutera `push/wipe/zoom`, prévoir une refacto vers `AVVideoCompositing` custom + Metal compute kernel"
3. Ajouter au spec section 3.4 une mention explicite : **les nouvelles transitions ne doivent JAMAIS utiliser CIDissolveTransition comme template** — sinon on hérite de la même latence CI

**Patches au spec/plans** :
- Spec section 3.4 : ajouter sous-section "Stratégie d'extension transitions" listant les 3 approches ci-dessus et le critère de bascule
- Plan 3 Task 11 (`VideoCompositor`) : ajouter task d'architecture pour préparer `AVVideoCompositing` protocol implementation (juste un stub `CustomTransitionCompositor: NSObject, AVVideoCompositing`) → permet tests futurs sans refacto

---

## Pilier 2 — Vidéo preview / scrubbing

**Choix actuel** : `AVPlayer + AVPlayerItem(asset: composition)` + `addPeriodicTimeObserver(forInterval: CMTime(value:1, timescale:60))`. Le spec mentionne `CMSampleBufferDisplayLayer` en §3.5 comme "cache pour preview ultra-réactive au seek" sans détailler.

**Sources consultées** :
- [Apple Doc — AVSampleBufferDisplayLayer](https://developer.apple.com/documentation/AVFoundation/AVSampleBufferDisplayLayer) — couche compressée/décompressée, plus légère que `AVPlayerLayer`
- [Apple Doc — AVPlayerItemVideoOutput](https://developer.apple.com/documentation/avfoundation/avplayeritemvideooutput) — pipeline CVPixelBuffer pour Metal/MTKView
- [Real-time video editor with Metal — Day 2](https://medium.com/@nathan.fooo/real-time-video-editor-with-metal-day-2-a24f7f3fd933) — pattern AVPlayer → AVPlayerItemVideoOutput → CADisplayLink → MTKView pour scrub frame-perfect
- [Smooth frame-by-frame scrubbing gist](https://gist.github.com/shaps80/ac16b906938ad256e1f47b52b4809512) — reproduction du scrubbing iMovie/FCP via AVPlayerItemVideoOutput
- [iOS Performance — AVPlayer edition](https://medium.com/tech-romance/ios-performance-avplayer-edition-257c9575e3ea) — confirmé pattern AVPlayer pour multi-clip mais paywalled (intro montre que main thread blocking est le problème #1)

**Comparatif SOTA** :

| Approche | Force | Faiblesse |
|----------|-------|-----------|
| `AVPlayerLayer` (statu quo) | Simple, géré | Scrubbing reverse / frame-perfect = saccadé |
| `AVSampleBufferDisplayLayer` | Plus léger, idéal pour pipeline déjà-décodé | Doit fournir les CMSampleBuffer soi-même (pas branché direct sur AVPlayer) |
| `AVPlayerItemVideoOutput` → `MTKView` (Metal) | Frame-by-frame scrub fluide, accès Metal direct | Implémentation lourde, bypass certains controls AVPlayer |

**Verdict** : ✅ SOTA pour le mode lecture standard. Le pattern `AVPlayer + addPeriodicTimeObserver` est exactement ce qu'Apple recommande pour la preview. Le scrubbing sur drag du playhead reste le seul cas où on peut vouloir mieux.

**Recommandation** :
1. Garder `AVPlayer` comme moteur principal (zéro changement)
2. Pour le scrub manuel (drag du playhead), envisager UNIQUEMENT si profiling montre des saccades : layer overlay avec `AVPlayerItemVideoOutput.copyPixelBuffer(forItemTime:)` sur drag — fallback sur AVPlayer.seek classique pour les autres cas
3. Le spec mentionne `CMSampleBufferDisplayLayer` en §3.5 comme cache, mais ne détaille pas. À moins d'avoir une intention claire, **retirer cette ligne pour éviter une dette d'architecture non implémentée**

**Patches au spec/plans** :
- Spec §3.5 ligne "Cache `CMSampleBufferDisplayLayer` pour preview ultra-réactive au seek" : soit supprimer (recommandé), soit détailler en sous-section dédiée avec API précise
- Plan 3 Task 13 : ajouter test perf XCTest "scrub 5s back-and-forth → ≥ 55 fps" et benchmark explicite avant d'implémenter quoi que ce soit de Metal

---

## Pilier 3 — Vidéo upscaling et compositing GPU

**Choix actuel** : Pas mentionné explicitement, render natif 1080×1920 via `AVMutableVideoComposition.renderSize`.

**Sources consultées** :
- [Apple Doc — MetalFX](https://developer.apple.com/documentation/metalfx) — temporal/spatial scaler, conçu pour gaming
- [Apple Doc — MTLFXTemporalScaler](https://developer.apple.com/documentation/metalfx/mtlfxtemporalscaler) — nécessite color, depth, motion textures (=> pipeline Metal complet)
- [I Repurposed Apple's Gaming Framework to Upscale Video on iOS](https://medium.com/@kovallux/i-repurposed-apples-gaming-framework-to-upscale-video-on-ios-here-s-how-metalfx-actually-works-0ce26645fa7c) (Mars 2026) — **8-15 ms par frame** sur iPhone 15 Pro (720p → 4K), pitfalls : **thermal throttling après 2-3 min de GPU sustain, gestion mémoire stricte**
- [WWDC22 — Boost performance with MetalFX Upscaling](https://developer.apple.com/videos/play/wwdc2022/10103/)

**Comparatif SOTA** :

| Approche | Cible | Coût |
|----------|-------|------|
| Render natif 1080p (statu quo) | Standard production | ~0 |
| Render 720p + MetalFX Spatial → 1080p | Optim perf preview | 8-15 ms/frame + thermal après 2-3 min |
| Render 720p + MetalFX Temporal → 1080p | Qualité maximale | + nécessite motion vectors → refonte pipeline |

**Verdict** : ✅ SOTA tel quel. **MetalFX n'a aucun sens dans ce contexte** :
- Notre cible 1080p = native au render. Pas de gain à upscaler depuis 720p
- Thermal throttling sur SE 3 (A15) = killer pour une session édition de 5 min
- Mémoire : MetalFX nécessite texture pooling agressif (cf. article)
- Notre vraie contrainte est latence drag (16 ms) et memory peak (250 MB), pas la qualité de scaling

**Recommandation** : Documenter explicitement dans le spec **pourquoi on ne fait PAS de MetalFX** (anti-pattern pour stories courtes mobile). Cela évite qu'un futur dev "améliore" la perf en ajoutant MetalFX.

**Patches au spec/plans** :
- Spec section "Stack technique iOS — garanties no freeze, no lag" : ajouter sous "Anti-patterns à proscrire" : "❌ MetalFX upscaling : non pertinent en édition stories 9:16. Coût thermal (sustain GPU 2-3 min cause throttling sur A15) et mémoire (texture pooling) supérieurs au gain marginal de qualité"

---

## Pilier 4 — Audio engine multi-piste

**Choix actuel** : `AVAudioEngine` + `AVAudioPlayerNode` (un par audio actif) + `AVAudioMixerNode`, cap à 6 nodes, `scheduleSegment(at:)` pour seek.

**Sources consultées** :
- [AudioEngine Loopback Latency Test (GitHub)](https://github.com/jnpdx/AudioEngineLoopbackLatencyTest) — confirme **AVAudioEngine ~1.5 ms à 44.1 kHz, buffer 64 samples**
- [Apple Doc — AVAudioNode latency](https://developer.apple.com/documentation/avfaudio/avaudionode/latency) — API officielle pour mesurer
- [WWDC14 — AVAudioEngine in Practice](https://asciiwwdc.com/2014/sessions/502) — design originel
- [Apple Doc — scheduleSegment](https://developer.apple.com/documentation/avfaudio/avaudioplayernode/2867815-schedulesegment) — confirme l'API recommandée
- [Audio API Overview — objc.io](https://www.objc.io/issues/24-audio/audio-api-overview/) — comparaison niveaux d'abstraction
- Forum Apple : `AVAudioPlayerNode` peut avoir 100 ms de latence si initialisé puis play(at:) immédiatement → besoin de pré-prepare

**Comparatif SOTA** :

| Niveau | API | Latence | Cas d'usage |
|--------|-----|---------|-------------|
| Bas | Audio Toolbox / AURemoteIO | ~1 ms | Synthé, DAW pro |
| Bas | AUv3 host | ~1.5 ms | Hébergement plugin pro |
| Haut | **AVAudioEngine** (statu quo) | ~1.5 ms à 64 frames | Multi-track preview, mix dynamique |
| Très haut | AVPlayer audio tracks | ~30-50 ms | Lecture passive |

**Verdict** : ✅ SOTA. AVAudioEngine est exactement le bon niveau d'abstraction pour notre cas. AUv3/Audio Toolbox seraient overkill pour des stories où la latence cible est > 16 ms (UI frame), pas microseconde.

**Recommandation** :
1. Garder le design actuel
2. Ajouter explicitement dans `AudioMixer.configure(...)` : `AVAudioSession.setPreferredIOBufferDuration(0.005)` (5 ms) AVANT `engine.start()` pour cible latence basse
3. Pré-`prepare` les player nodes au load (pas au premier play) pour éviter les 100 ms de cold start documentés
4. Documenter latence cible dans le spec : "scheduleSegment → audible : < 30 ms (mode édition)"

**Patches au spec/plans** :
- Spec §3.3 : ajouter "Latence cible : 30 ms en mode édition (scheduleSegment → audible). `AVAudioSession.setPreferredIOBufferDuration(0.005)` configuré au start"
- Plan 3 Task 8 : ajouter sub-task "Pré-prepare des AVAudioPlayerNode au configure() pour éviter cold start ~100 ms"
- Plan 3 Task 8 : ajouter test : `test_play_afterConfigure_audibleWithin30ms`

---

## Pilier 5 — Audio DSP (waveform extraction, FFT)

**Choix actuel** : ~80 samples waveform pré-calculés à la composition (existant) + `AVAudioFile.read(into:frameCount:)` chunked à 4096 samples.

**Sources consultées** :
- [The spectrogram on Apple devices: vDSP vs Metal](https://medium.com/techpro-studio/the-spectrogram-on-apple-devices-vdsp-vs-metal-8c859756e50a) — **vDSP ~8x plus rapide que Metal pour nfft=256 sur iPhone 11**. Metal devient compétitif uniquement pour nfft<48 ET inputs très grands
- [Apple Doc — vDSP_fft_zrip](https://developer.apple.com/documentation/accelerate/1450150-vdsp_fft_zrip) — toujours l'API canonique
- [Apple Doc — Visualizing sound as audio spectrogram](https://developer.apple.com/documentation/Accelerate/visualizing-sound-as-an-audio-spectrogram) — sample code Apple, vDSP-based
- [Apple Forum — MPS FFT add request](https://developer.apple.com/forums/thread/695668) — MPS n'a TOUJOURS PAS de FFT natif en 2025

**Comparatif SOTA** :

| Approche | nfft cibles | Perf |
|----------|-------------|------|
| `vDSP_fft_zrip` Accelerate (référence) | Pow of 2, ≥ 48 | ⭐⭐⭐⭐⭐ |
| MPS FFT | N/A (pas implémenté) | ❌ |
| Custom Metal compute FFT | Tous | ⭐⭐ (overhead CPU↔GPU > gain) |

**Verdict** : ✅ SOTA. Le choix de pré-calculer 80 samples à la composition est parfait pour notre UX (pas de FFT live nécessaire). Si un jour on veut une waveform live pendant enregistrement, **vDSP est le seul choix valide**, jamais MPS/Metal.

**Recommandation** :
1. Garder le design actuel
2. Documenter dans le spec : "Si waveform live requise un jour : vDSP exclusivement (8x plus rapide que MPS sur les tailles cibles)"
3. 80 samples est suffisant pour visualisation à l'échelle d'un slide (10s typique). Si zoom 10x sur la timeline, considérer 200-400 samples pré-calculés (mais c'est un upgrade futur, pas v1)

**Patches au spec/plans** :
- Spec §"Audio DSP" : ajouter une note "Choix vDSP justifié : 8x plus rapide que MPS pour les nfft cibles (256-1024). MPS n'a pas de FFT natif en 2026"

---

## Pilier 6 — Image pipeline (filtres, thumbnails)

**Choix actuel** : `CIContext(metal:)` + `CIFilter` + AsyncImage/`CacheCoordinator` 3-tier (Kingfisher retiré 2026-05) + `UIImage.preparingThumbnail(of:)` + `ImageIO` (`CGImageSourceCreateThumbnailAtIndex`).

**Sources consultées** :
- [Fast Thumbnails with CGImageSource (Max Seelemann)](https://macguru.dev/fast-thumbnails-with-cgimagesource/) (avril 2026) — **CGImageSource path : HEIC 52ms / JPEG 24ms / PNG 95ms**, vs UIImageRenderer **HEIC 83ms / JPEG 105ms / PNG 363ms** → **2-4x plus rapide**
- [Apple Doc — preparingThumbnail](https://developer.apple.com/documentation/uikit/uiimage/3750835-preparingthumbnail) — pattern UIImage, varie selon l'init (Data vs path)
- [Working with Core Image — Custom Filters and MPS](https://www.momentslog.com/development/ios/working-with-core-image-custom-filters-and-metal-performance-shaders-in-objective-c) — Metal direct **9 ms** vs CIFilter **14 ms** sur 1000×1000 (différence marginale)
- [Apple Doc — generateCGImagesAsynchronously](https://developer.apple.com/documentation/avfoundation/avassetimagegenerator/generatecgimagesasynchronously(fortimes:completionhandler:)) — l'API canonique pour les frame-strips video
- [generateCGImageAsynchronously single image](https://developer.apple.com/documentation/avfoundation/avassetimagegenerator/generatecgimageasynchronously(for:completionhandler:)) — préférée pour requêtes one-shot

**Comparatif SOTA** :

| Source | Approche optimale | Perf |
|--------|-------------------|------|
| Image disque (HEIC/JPEG/PNG) | **`CGImageSourceCreateThumbnailAtIndex` + `kCGImageSourceShouldCacheImmediately:false`** | ⭐⭐⭐⭐⭐ |
| Image en mémoire (Data/UIImage) | `UIImage.preparingThumbnail` | ⭐⭐⭐⭐ |
| Frame vidéo | `AVAssetImageGenerator.generateCGImagesAsynchronously` | ⭐⭐⭐⭐⭐ |
| Filtre simple (blur/scale) | `MPSImageGaussianBlur` direct | ⭐⭐⭐⭐⭐ |
| Filtre simple (blur/scale) | `CIFilter` Metal-backed | ⭐⭐⭐⭐ (suffisant) |

**Verdict** : ⚠️ Hybride. Le mix d'APIs est correct mais pas hiérarchisé. Le timeline strip (frames vidéo) + thumbnails (images disque) sont les 2 hot paths perf.

**Recommandation** :
1. **Pour les thumbnails depuis disque** (cas timeline thumbnails statiques) : préférer **systématiquement** `CGImageSourceCreateThumbnailAtIndex` avec `kCGImageSourceCreateThumbnailFromImageAlways:true` + `kCGImageSourceThumbnailMaxPixelSize` + `kCGImageSourceShouldCacheImmediately:false`. 2-4x plus rapide que `UIImage.preparingThumbnail` quand l'image est sur disque
2. **Pour les frames vidéo strip** (8 frames/clip) : `AVAssetImageGenerator.generateCGImagesAsynchronously` (plural) — bien indiqué en spec
3. **Pour les network images (avatars, etc.)** : utiliser `AsyncImage` + `CachedAsyncImage` + `CacheCoordinator` 3-tier (Kingfisher a été retiré du projet en 2026-05). PAS pour le timeline strip — préférer le path SOTA ci-dessus.
4. **CIFilter** : garder. La différence de 5 ms vs MPS direct ne justifie pas la complexité d'un Metal compute kernel pour les filtres standards (blur, brightness, etc.)

**Patches au spec/plans** :
- Spec §"Image" : ajouter règle d'aiguillage : "Thumbnails depuis disque local → `CGImageSourceCreateThumbnailAtIndex` (2-4x plus rapide que preparingThumbnail). Network images → AsyncImage + CacheCoordinator 3-tier (Kingfisher retiré 2026-05). Frames vidéo → AVAssetImageGenerator.generateCGImagesAsynchronously"
- Plan 3 Task 11 (`VideoFrameExtractor` reuse) : ajouter test perf "extract 8 frames de 5s vidéo → < 100 ms total"
- Plan 4 (Views) : ajouter dans `VideoClipBar` que la frame strip utilise `AVAssetImageGenerator` pas `UIImage`

---

## Pilier 7 — Compositing UI (ruler, waveform display, timeline grid)

**Choix actuel** : SwiftUI `Canvas` + Metal-backed CALayers indirects via SwiftUI.

**Sources consultées** :
- [WWDC23 — Demystify SwiftUI Performance](https://developer.apple.com/videos/play/wwdc2023/10160/)
- [WWDC25 — Optimize SwiftUI performance with Instruments](https://developer.apple.com/videos/play/wwdc2025/306/) — nouvelles tooling Instruments 2025 pour SwiftUI body re-evaluations
- [Hacking with Swift — drawingGroup() Metal rendering](https://www.hackingwithswift.com/books/ios-swiftui/enabling-high-performance-metal-rendering-with-drawinggroup) — drawingGroup → off-screen Metal render
- [SwiftUI Canvas API: 40% Faster in iOS 2025 (Medium)](https://ravi6997.medium.com/swiftuis-canvas-revolution-how-apple-s-new-drawing-api-is-transforming-ios-development-in-2025-ac0c1eb838df) — Canvas + TimelineView = 60/120 fps (ProMotion)
- [Metal in SwiftUI: How to Write Shaders (Bartlett)](https://blog.jacobstechtavern.com/p/metal-in-swiftui-how-to-write-shaders) — `.colorEffect`, `.distortionEffect`, `.layerEffect` iOS 17+
- [EquatableView (Swift with Majid)](https://swiftwithmajid.com/2020/01/22/optimizing-views-in-swiftui-using-equatableview/) + [Airbnb Tech Blog](https://medium.com/airbnb-engineering/understanding-and-improving-swiftui-performance-37b77ac61896)

**Comparatif SOTA** :

| Approche | Cas | Perf |
|----------|-----|------|
| SwiftUI `Canvas` + `TimelineView` | Drawings dynamiques (ruler, waveform) | ⭐⭐⭐⭐⭐ (60/120 fps) |
| SwiftUI `Canvas` + `.drawingGroup()` | Cas complexes statiques | ⭐⭐⭐⭐⭐ |
| SwiftUI `+ .colorEffect/.layerEffect` Metal shader | Effets visuels per-pixel | ⭐⭐⭐⭐⭐ |
| MTKView wrapped en `UIViewRepresentable` | Render full Metal custom | ⭐⭐⭐⭐ (overhead bridge) |

**Verdict** : ✅ SOTA. SwiftUI Canvas est le bon choix. MTKView serait sur-engineered pour ruler + waveform.

**Recommandation** :
1. **Garder Canvas**
2. Ajouter `.drawingGroup()` sur `RulerView` et `AudioClipBar` (waveform) — bake le rendu en Metal layer cached
3. Pour les leaf views (`VideoClipBar`, `AudioClipBar`, `ThemedMessageBubble` style) : appliquer `.equatable()` + struct conform `Equatable` pour éviter re-evaluation cascade
4. Pour le drag du playhead : passer le temps en `let time: TimeInterval` (pas `@Binding`) au composant child + utiliser `.equatable()` sur le child immutable

**Patches au spec/plans** :
- Spec §"Garanties de performance" : ajouter règle "Tous les composants Track/* MUST conformer `Equatable` et utiliser `.equatable()` modifier"
- Plan 4 Task 7 (`RulerView`) : ajouter `.drawingGroup()` sur le canvas
- Plan 4 Task 8 (`AudioClipBar`) : ajouter `.drawingGroup()` sur la zone waveform
- Plan 4 Task 11 (`VideoClipBar`) : conform `Equatable`, appliquer `.equatable()` au call site

---

## Pilier 8 — Concurrency (orchestration timeline)

**Choix actuel** : `@MainActor` + `Sendable` + `Combine PassthroughSubject` pour les events Socket.IO.

**Sources consultées** :
- [Observation Framework vs Combine: Migration Guide](https://medium.com/@gauravharkhani01/observation-framework-vs-combine-migration-guide-c9ba2b8415cd) — Observation **30-50% plus rapide** que Combine sur SwiftUI render cycles
- [Michael Tsai — Swift 6.2 Observations](https://mjtsai.com/blog/2025/10/31/swift-6-2-observations/)
- [AsyncStream vs Combine Publishers (DEV)](https://dev.to/arshtechpro/asyncstream-vs-combine-publishers-the-hidden-miss-that-can-hang-your-ios-app-4o00)
- [Async sequences, streams, and Combine — Swift by Sundell](https://www.swiftbysundell.com/articles/async-sequences-streams-and-combine/)
- [Jacob Bartlett — Synchronization Framework](https://blog.jacobstechtavern.com/p/the-synchronisation-framework) — **OSAllocatedUnfairLock 4.4s, Mutex 6.3s, Actor 8.3s** sur 10M ops cache (lock 50% plus rapide que actor)
- [Modern Swift Lock — SwiftLee](https://www.avanderlee.com/concurrency/modern-swift-lock-mutex-the-synchronization-framework/) — `Synchronization.Mutex` iOS 18+
- [WWDC22 — Visualize and optimize Swift concurrency](https://wwdcnotes.com/documentation/wwdcnotes/wwdc22-110350-visualize-and-optimize-swift-concurrency/) + [WWDC25 — Optimize SwiftUI performance with Instruments](https://developer.apple.com/videos/play/wwdc2025/306/)

**Comparatif SOTA** :

| Pattern | Cas | Verdict |
|---------|-----|---------|
| `@MainActor` ViewModels | UI binding | ✅ canonique |
| Combine `PassthroughSubject` | Socket.IO events legacy bridge | ⚠️ OK mais Observation préféré pour le NEW code |
| `Observation` (`@Observable`) | Nouveaux ViewModels | ✅ 30-50% plus rapide en SwiftUI render |
| `AsyncStream` | Streams async unidir (60Hz playhead, etc.) | ✅ pour Swift Concurrency natif |
| `actor` cache | Cache Sendable safe | ✅ par défaut |
| `OSAllocatedUnfairLock` | Cache contention forte, fast read | ⭐⭐⭐⭐⭐ si profiling le justifie |
| `Synchronization.Mutex` (iOS 18+) | Cache Swift 6 idiomatique | ⭐⭐⭐⭐⭐ si target iOS 18+ |

**Verdict** : ⚠️ Hybride. Le choix actuel est correct mais pas optimisé. Trois leviers :

**Recommandation** :
1. **NEW ViewModels timeline** : utiliser `@Observable` (Observation framework) pas `ObservableObject`. Le spec mentionne déjà `@Observable @MainActor` pour `StoryComposerViewModel`, étendre à `TimelineViewModel`. Cohérent avec décision #6 spec
2. **Streams 60Hz playhead/scrub** : préférer `AsyncStream<Float>` plutôt que `PassthroughSubject<Float, Never>`. Plus simple, intégré Swift Concurrency, cancellation idiomatique
3. **Socket.IO bridge** (legacy) : garder Combine. Pas de bénéfice à migrer maintenant
4. **Caches internes timeline** (frame cache, waveform cache) :
   - Si target iOS 17+ : `actor` (statu quo) — sûr, idiomatique
   - Si on peut target iOS 18+ : envisager `Synchronization.Mutex` POUR LE CACHE SEUL (50% plus rapide que actor pour fast-read scenarios). MAIS profiler avant — l'écart absolu de 2 sec sur 10M ops est négligeable pour notre cas
5. Tooling : utiliser `OSSignposter` (iOS 16+) avec `dynamicTracking` autour des opérations engine (`configure`, `seek`, `recompose`) → visibles dans Instruments + MetricKit

**Patches au spec/plans** :
- Spec §"Stack technique → Interaction & Sync UI" : remplacer "`Combine PassthroughSubject` partout" par règles d'aiguillage : "Streams internes timeline (playhead, time updates) → `AsyncStream`. Bridge Socket.IO existant → `PassthroughSubject` (legacy). ViewModels → `@Observable`"
- Plan 3 Task 12 (`StoryTimelineEngine`) : `onTimeUpdate: ((Float) -> Void)?` → ajouter alternative `var timeUpdates: AsyncStream<Float>` exposée à côté du callback
- Plan 2 Task 5 (`CommandStack`) : si concurrent push from multiple actors, considérer `OSAllocatedUnfairLock` au lieu de actor (à benchmarker)

---

## Pilier 9 — Encoding export (futur MP4)

**Choix actuel** : `AVAssetExportSession` (mentionné en stub futur, retourne `throw .notImplemented`).

**Sources consultées** :
- [Apple Doc — AVAssetExportSession](https://developer.apple.com/documentation/avfoundation/avassetexportsession) — high-level, preset-based
- [SDAVAssetExportSession (GitHub)](https://github.com/rs/SDAVAssetExportSession) — drop-in replacement custom, écrit avec AVAssetWriter
- [VideoExport sample code](https://github.com/scottcarter/VideoExport) — pattern composé custom
- [Apple Doc — Apple HEVC support](https://support.apple.com/en-us/101939) — HEVC **40% plus petit** que H.264 à qualité égale
- [WWDC21 — Explore low-latency video encoding with VideoToolbox](https://developer.apple.com/videos/play/wwdc2021/10158/)
- [HandBrake docs — VideoToolbox](https://handbrake.fr/docs/en/latest/technical/video-videotoolbox.html) — confirme VideoToolbox = scaler less sharp + options encoder limitées vs software

**Comparatif SOTA** :

| API | Custom transitions | Perf | Contrôle |
|-----|--------------------|------|----------|
| `AVAssetExportSession` + preset | ❌ Non si AVVideoCompositing custom | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| `AVAssetExportSession` + `videoComposition` | ⭐⭐⭐ (CI filters via AVAsynchronousCIImageFilteringRequest) | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| `AVAssetWriter` + `AVAssetReader` + `AVVideoCompositing` custom | ✅ Tout | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| `VideoToolbox` direct | ✅ Tout (low-level) | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ (mais quality scaler moins sharp) |

**Verdict** : ⚠️ Hybride. AVAssetExportSession est OK pour preset basique. Dès qu'une transition `dissolve` (avec CI handler) ou un keyframe-driven export entre en jeu, ça commence à coincer. Pour les transitions `push/wipe/zoom` futures, `AVAssetExportSession` ne suffira pas.

**Recommandation** :
1. Garder `AVAssetExportSession` pour le **MVP export** (crossfade + dissolve via CI handler). C'est déjà ce que fait le spec
2. **Anticiper la migration** : structurer l'API d'export pour permettre une bascule future vers `AVAssetWriter`. Concrètement : encapsuler le code export derrière un protocol `TimelineExporting` avec deux conformances futures (`SimpleExporter` AVAssetExportSession + `AdvancedExporter` AVAssetWriter)
3. **Codec par défaut** : HEVC (40% plus petit, hardware accelerated A11+) avec fallback H.264 pour devices < A11. Pour stories courtes (< 60s), HEVC est gagnant net
4. **Audio** : embarquer AAC 128 kbps (standard story) — `AVAssetExportSession` le fait par défaut
5. **PAS** de VideoToolbox direct pour le launch — overhead complexité non justifié pour stories courtes

**Patches au spec/plans** :
- Spec §3.1 : ajouter dans `ExportPreset` les encoders : `enum ExportPreset { case hd720, hd1080, hd4k; var codec: AVVideoCodecType { .hevc /* fallback h264 si pre-A11 */ } }`
- Spec §3.1 : structurer `func export(...)` derrière protocol `TimelineExporting` (préparation refacto future)
- Spec §"Goals/Non-Goals" : ajouter à Non-Goals : "Custom AVAssetWriter export pipeline (futur — sera nécessaire dès que push/wipe/zoom transitions implémentées)"

---

## Pilier 10 — Profiling / observabilité

**Choix actuel** : `XCTMetric` (`XCTClockMetric`, `XCTMemoryMetric`, `XCTOSSignpostMetric`).

**Sources consultées** :
- [Beyond Firebase: MetricKit, os_signpost, Instruments — modern SwiftUI](https://medium.com/@wesleymatlock/%EF%B8%8F-beyond-firebase-using-metrickit-os-signpost-and-instruments-in-a-modern-swiftui-app-f6dfdfb8d1e1)
- [A Practical Guide to Apple's MetricKit](https://medium.com/@rajanTheSilentCompiler/a-practical-guide-to-apples-metrickit-stop-guessing-start-measuring-your-ios-app-s-health-5639db388e9c) (Fév 2026)
- [Apple Doc — MetricKit](https://developer.apple.com/documentation/MetricKit) + [MXSignpost.h](https://github.com/xybp888/iOS-SDKs/blob/master/iPhoneOS13.0.sdk/System/Library/Frameworks/MetricKit.framework/Headers/MXSignpost.h)
- [WWDC23 — Analyze hangs with Instruments](https://developer.apple.com/videos/play/wwdc2023/10248/)
- [WWDC25 — Optimize SwiftUI performance with Instruments](https://developer.apple.com/videos/play/wwdc2025/306/)
- [Polpiella — Time Profiler + os_signposts](https://www.polpiella.dev/time-profiler-instruments/)
- [Apple Doc — OSSignposter (iOS 16+, Swift)](https://developer.apple.com/documentation/os/recording-performance-data)

**Comparatif SOTA** :

| Outil | Cas | Verdict |
|-------|-----|---------|
| `XCTMetric` (Clock, Memory, OSSignpost) | Tests CI perf gates | ✅ pour PR gates |
| `OSSignposter` (Swift, iOS 16+) | Instrumentation in-process Instruments | ✅ devrait être added |
| `MXSignpostMetric` (MetricKit) | Aggregation prod opportune | ✅ pour monitoring prod |
| `MetricKit` general (`mxSignpost` C API) | Hang/CPU/memory aggregée | ✅ déjà en place pour Crashlytics |
| Instruments custom track via `signpost.dtrace` | Visualisation dédiée timeline | ⭐⭐⭐⭐ pour DX |

**Verdict** : ⚠️ Hybride. `XCTMetric` couvre le CI mais ne donne PAS de signal en prod. `OSSignposter` Swift natif est sous-utilisé.

**Recommandation** :
1. Garder `XCTMetric` pour les PR gates (Plan 4 Task 16+)
2. Ajouter `OSSignposter` autour des opérations engine critiques :
   - `engine.configure()` : signpost interval
   - `seek(to:precise:)` : signpost interval
   - `recompose()` : signpost interval (pour mesurer impact des transitions)
   - `commandStack.apply()` : signpost interval
3. Brancher `MXSignpostMetric` pour aggregation prod (MetricKit reçoit ces signposts et les remonte dans `MXMetricPayload`)
4. Créer un fichier `meeshy-timeline.instrumentspackage` (custom Instruments package) à committer dans le repo — visualisation dédiée timeline lors des sessions Instruments

**Patches au spec/plans** :
- Spec §"Profiling obligatoire" : ajouter "Instrumenter `StoryTimelineEngine` avec `OSSignposter` (iOS 16+) sur configure/seek/recompose/apply commands. Brancher `MXSignpostMetric` pour aggregation prod via MetricKit"
- Plan 3 Task 12 (engine) : ajouter sub-task "Wrap les méthodes critiques avec OSSignposter intervals"
- Plan 1 Task 4 (TimelineViewModel) : ajouter sub-task "MXMetricManager subscribe pour récupérer les payloads en prod"

---

## Pilier 11 — Pipeline réseau (réception/émission données)

**Choix actuel SDK Meeshy** : Socket.IO Client 16.1 (temps-réel) + URLSession + Alamofire-style HTTP (upload média) + ZMQ/REST côté backend.

**Sources consultées** :
- [Real-Time Networking iOS: WebSocketTask vs Socket.IO vs Starscream vs SSE](https://medium.com/@sreejithbhatt/real-time-networking-in-ios-websockettask-vs-socket-io-vs-starscream-vs-server-sent-events-1111b1992de1)
- [State of Swift WebSockets — Dept Engineering](https://engineering.deptagency.com/state-of-swift-websockets)
- [HTTP/3 support for URLSession — Eidinger](https://blog.eidinger.info/http3-support-for-urlsession) — **HTTP/3 enabled BY DEFAULT depuis iOS 15**, fallback HTTP/2 auto
- [WWDC21 — Accelerate networking with HTTP/3 and QUIC](https://developer.apple.com/videos/play/wwdc2021/10094/)
- [WWDC23 — Build robust and resumable file transfers](https://developer.apple.com/videos/play/wwdc2023/10006/)
- [Handling Multiple Image Uploads URLSession Best Practices](https://www.momentslog.com/development/ios/handling-multiple-image-uploads-with-urlsession-best-practices-for-large-files)
- [Bipsync — Uploading large files from iOS](https://bipsync.com/blog/uploading-large-files-from-ios-applications/)
- [Apple Doc — NWConnection](https://developer.apple.com/documentation/network/nwconnection) — pour TCP/UDP custom, pas requis pour HTTP standard

**Comparatif SOTA** :

| Cas | API | Verdict |
|-----|-----|---------|
| WebSocket événementiel cross-platform | Socket.IO 16.1 (statu quo) | ✅ OK — built-in reconnect, ack, events |
| WebSocket natif minimal | `URLSessionWebSocketTask` (iOS 13+) | ⚠️ moins de features (manual reconnect, heartbeat) |
| HTTP REST / upload <50 MB | `URLSession` standard | ✅ HTTP/3 par défaut |
| Upload >50 MB | **`URLSession.uploadTask(withStreamedRequest:)` + `InputStream`** | ✅ jamais charger fichier en mémoire |
| Upload chunked résumable | `URLSessionUploadTask` background config + chunks 1-5 MB | ✅ pour vidéos stories |
| Custom TCP/UDP | `Network.NWConnection` | ❌ overkill pour notre cas (HTTP suffit) |

**Verdict** : ⚠️ Hybride. Le choix Socket.IO est OK (reconnect auto, cross-platform avec gateway Node). Le HTTP/3 est déjà actif par défaut. Le seul vrai risque : uploads vidéo de 100+ MB.

**Recommandation** :
1. **Socket.IO 16.1** : garder. La migration vers `URLSessionWebSocketTask` natif coûterait 2-3 semaines pour un gain marginal et casse la compat avec gateway Node
2. **HTTP/3** : déjà actif par défaut iOS 15+. Ajouter `request.assumesHTTP3Capable = true` sur les premières requêtes (skip le délai discovery du `Alt-Svc` header)
3. **Uploads gros médias (>50 MB)** : utiliser EXCLUSIVEMENT `URLSession.uploadTask(withStreamedRequest:)` + `InputStream` pointant sur le fichier disque. JAMAIS charger en mémoire (cf. règle "memory < 250 MB" du spec)
4. **Background uploads** : utiliser `URLSessionConfiguration.background(withIdentifier:)` pour les uploads stories — survit au backgrounding de l'app
5. **Chunked upload** : 1-5 MB par chunk, retry par chunk individuel, finalisation server-side. Le pattern recommandé Apple WWDC23 est resumable
6. **Network.framework** : NON requis. Overkill pour HTTP. Réservé pour cas custom (P2P, multipath) qu'on n'a pas

**Patches au spec/plans** :
- Spec : ajouter section "Pipeline réseau timeline" (manquante actuellement) avec règles ci-dessus
- Plan 3 (engine) : si l'export futur upload le résultat, prévoir `URLSession.uploadTask(withStreamedRequest:)` dans le stub d'export
- (Hors spec timeline, mais à propager au CLAUDE.md du SDK) : documenter règle "uploads >50 MB = streamed inputStream obligatoire, never Data"

---

## Patches consolidés à appliquer

### Patches au SPEC (`docs/superpowers/specs/2026-05-05-story-timeline-editor-design.md`)

| # | Section | Patch | Priorité |
|---|---------|-------|----------|
| P1 | §3.4 (VideoCompositor) | Ajouter sous-section "Stratégie d'extension transitions" — quand basculer de CIDissolveTransition vers `AVVideoCompositing` custom Metal | Haute |
| P2 | §3.5 (Performance) | Soit retirer la mention `CMSampleBufferDisplayLayer` (recommandé), soit la détailler en sous-section dédiée avec API précise | Haute |
| P3 | §"Stack technique" Anti-patterns | Ajouter "❌ MetalFX upscaling : non pertinent (thermal+memory > gain marginal sur stories courtes)" | Moyenne |
| P4 | §3.3 (AudioMixer) | Ajouter "Latence cible 30 ms en mode édition. `AVAudioSession.setPreferredIOBufferDuration(0.005)` configuré au start. Pré-`prepare` AVAudioPlayerNode au configure() pour éviter cold-start ~100 ms" | Haute |
| P5 | §"Audio DSP" | Note : "vDSP exclusivement pour FFT live (8x plus rapide que MPS). MPS n'a pas de FFT natif en 2026" | Basse |
| P6 | §"Image" | Règle d'aiguillage thumbnail : "Disque local → CGImageSourceCreateThumbnailAtIndex (2-4x plus rapide). Network → AsyncImage + CacheCoordinator 3-tier (Kingfisher retiré 2026-05). Frames vidéo → AVAssetImageGenerator.generateCGImagesAsynchronously" | Haute |
| P7 | §"Garanties de performance" | Règle : "Tous les composants Track/* MUST conformer Equatable et utiliser `.equatable()` modifier. `.drawingGroup()` sur RulerView et zone waveform" | Haute |
| P8 | §"Stack technique → Interaction & Sync UI" | Aiguillage : "Streams 60Hz internes timeline → AsyncStream. Bridge Socket.IO existant → PassthroughSubject (legacy). Nouveaux ViewModels → @Observable" | Moyenne |
| P9 | §3.1 (engine API) | `ExportPreset` : ajouter `var codec: AVVideoCodecType { .hevc }` avec fallback H.264 pre-A11. Encapsuler export derrière protocol `TimelineExporting` | Moyenne |
| P10 | §"Profiling obligatoire" | Ajouter "OSSignposter wrapping configure/seek/recompose/apply. MXSignpostMetric pour aggregation prod via MetricKit. Custom .instrumentspackage à committer dans repo" | Haute |
| P11 | §"Pipeline réseau" (nouvelle section) | Section manquante — ajouter règles HTTP/3, uploads streamés, background URLSession | Moyenne |

### Patches aux PLANS

| Plan | Task | Patch | Priorité |
|------|------|-------|----------|
| Plan 3 | Task 11 (`VideoCompositor`) | Stub `CustomTransitionCompositor: NSObject, AVVideoCompositing` pour préparer extensions futures (push/wipe/zoom) | Moyenne |
| Plan 3 | Task 13 (preview perf) | Test perf XCTest "scrub 5s back-and-forth → ≥ 55 fps" AVANT d'envisager AVPlayerItemVideoOutput Metal | Moyenne |
| Plan 3 | Task 8 (`AudioMixer`) | Sub-task "Pré-prepare AVAudioPlayerNode au configure()" + test `test_play_afterConfigure_audibleWithin30ms` | Haute |
| Plan 3 | Task 11 (frame extractor) | Test perf "extract 8 frames de 5s vidéo → < 100 ms total" | Moyenne |
| Plan 3 | Task 12 (engine) | Sub-task "Wrap configure/seek/recompose/apply avec OSSignposter intervals". Exposer `var timeUpdates: AsyncStream<Float>` à côté du callback `onTimeUpdate` | Haute |
| Plan 4 | Task 7 (`RulerView`) | Ajouter `.drawingGroup()` sur le canvas | Haute |
| Plan 4 | Task 8 (`AudioClipBar`) | Ajouter `.drawingGroup()` sur la zone waveform | Haute |
| Plan 4 | Task 11 (`VideoClipBar`) | Conform `Equatable`, appliquer `.equatable()` au call site dans TrackBarView | Haute |
| Plan 1 | Task 4 (TimelineViewModel) | Sub-task "MXMetricManager subscribe pour récupérer les payloads MetricKit en prod" | Basse |
| Plan 2 | Task 5 (`CommandStack`) | Si profiling montre contention, considérer `OSAllocatedUnfairLock` au lieu de actor (à benchmarker) | Basse |

### Nouvelles tasks à ajouter (avec estimation effort)

| Task | Estimation | Pilier | Priorité |
|------|------------|--------|----------|
| **NT1** : Créer `meeshy-timeline.instrumentspackage` custom (visualisation OSSignpost intervals dédiée timeline) | 0.5j | 10 | Haute |
| **NT2** : Test bench `vDSP_fft_zrip` sur waveform pré-calc — confirmer 80 samples en < 16 ms | 0.25j | 5 | Moyenne |
| **NT3** : Test bench `CGImageSourceCreateThumbnailAtIndex` vs `UIImage.preparingThumbnail` sur 50 thumbnails contigus en scroll timeline | 0.5j | 6 | Haute |
| **NT4** : Test bench scrub fluidité (60 fps) avec 5 clips actifs sur iPhone SE 3 | 0.5j | 2 | Haute |
| **NT5** : Stub `CustomTransitionCompositor: AVVideoCompositing` + test "render frame avec custom compositor invoqué" | 1j | 1 | Moyenne |
| **NT6** : Documenter dans `apps/ios/CLAUDE.md` les patterns réseau (HTTP/3 forcé, uploads streamés) | 0.25j | 11 | Basse |

**Effort total nouveaux patches** : ~3 jours-dev senior pour appliquer toutes les recommandations, dont ~1.5j de patches code + ~1.5j de tests/bench.

---

## Liens utiles (bibliographie)

### Apple officiel
- [WWDC25 — Discover Metal 4](https://developer.apple.com/videos/play/wwdc2025/205/) — accessed 2026-05-06
- [WWDC25 — Optimize SwiftUI performance with Instruments](https://developer.apple.com/videos/play/wwdc2025/306/)
- [WWDC23 — Demystify SwiftUI Performance](https://developer.apple.com/videos/play/wwdc2023/10160/)
- [WWDC23 — Analyze hangs with Instruments](https://developer.apple.com/videos/play/wwdc2023/10248/)
- [WWDC23 — Build robust and resumable file transfers](https://developer.apple.com/videos/play/wwdc2023/10006/)
- [WWDC22 — Boost performance with MetalFX Upscaling](https://developer.apple.com/videos/play/wwdc2022/10103/)
- [WWDC22 — Display HDR video in EDR with AVFoundation and Metal](https://developer.apple.com/videos/play/wwdc2022/110565/)
- [WWDC22 — Visualize and optimize Swift concurrency](https://wwdcnotes.com/documentation/wwdcnotes/wwdc22-110350-visualize-and-optimize-swift-concurrency/)
- [WWDC21 — Accelerate networking with HTTP/3 and QUIC](https://developer.apple.com/videos/play/wwdc2021/10094/)
- [WWDC21 — Explore low-latency video encoding with VideoToolbox](https://developer.apple.com/videos/play/wwdc2021/10158/)
- [WWDC20 — Optimize the Core Image pipeline for your video app](https://developer.apple.com/videos/play/wwdc2020/10008/)
- [Apple Doc — AVVideoComposition](https://developer.apple.com/documentation/avfoundation/avvideocomposition)
- [Apple Doc — AVAsynchronousCIImageFilteringRequest](https://developer.apple.com/documentation/avfoundation/avasynchronousciimagefilteringrequest)
- [Apple Doc — AVPlayerItemVideoOutput](https://developer.apple.com/documentation/avfoundation/avplayeritemvideooutput)
- [Apple Doc — AVSampleBufferDisplayLayer](https://developer.apple.com/documentation/AVFoundation/AVSampleBufferDisplayLayer)
- [Apple Doc — AVAssetImageGenerator.generateCGImagesAsynchronously](https://developer.apple.com/documentation/avfoundation/avassetimagegenerator/generatecgimagesasynchronously(fortimes:completionhandler:))
- [Apple Doc — MetalFX](https://developer.apple.com/documentation/metalfx)
- [Apple Doc — MTLFXTemporalScaler](https://developer.apple.com/documentation/metalfx/mtlfxtemporalscaler)
- [Apple Doc — vDSP_fft_zrip](https://developer.apple.com/documentation/accelerate/1450150-vdsp_fft_zrip)
- [Apple Doc — Visualizing sound as audio spectrogram](https://developer.apple.com/documentation/Accelerate/visualizing-sound-as-an-audio-spectrogram)
- [Apple Doc — UIImage.preparingThumbnail](https://developer.apple.com/documentation/uikit/uiimage/3750835-preparingthumbnail)
- [Apple Doc — AVAudioNode latency](https://developer.apple.com/documentation/avfaudio/avaudionode/latency)
- [Apple Doc — scheduleSegment](https://developer.apple.com/documentation/avfaudio/avaudioplayernode/2867815-schedulesegment)
- [Apple Doc — URLSessionWebSocketTask](https://developer.apple.com/documentation/foundation/urlsessionwebsockettask)
- [Apple Doc — NWConnection](https://developer.apple.com/documentation/network/nwconnection)
- [Apple Doc — MetricKit](https://developer.apple.com/documentation/MetricKit)
- [Apple Doc — Recording Performance Data (OSSignposter)](https://developer.apple.com/documentation/os/recording-performance-data)
- [Apple Doc — AVAssetExportSession](https://developer.apple.com/documentation/avfoundation/avassetexportsession)
- [Apple Doc — Adopting Swift 6 strict concurrency](https://developer.apple.com/documentation/swift/adoptingswift6)
- [Apple Support — HEVC encoding](https://support.apple.com/en-us/101939)

### Articles techniques (2025-2026)
- [Fast Thumbnails with CGImageSource — Max Seelemann (avril 2026)](https://macguru.dev/fast-thumbnails-with-cgimagesource/)
- [Spectrogram on Apple devices: vDSP vs Metal](https://medium.com/techpro-studio/the-spectrogram-on-apple-devices-vdsp-vs-metal-8c859756e50a)
- [I Repurposed Apple's Gaming Framework to Upscale Video on iOS (mars 2026)](https://medium.com/@kovallux/i-repurposed-apples-gaming-framework-to-upscale-video-on-ios-here-s-how-metalfx-actually-works-0ce26645fa7c)
- [HTTP/3 Support for URLSession — Eidinger](https://blog.eidinger.info/http3-support-for-urlsession)
- [Real-Time Networking iOS: WebSocketTask vs Socket.IO vs Starscream vs SSE](https://medium.com/@sreejithbhatt/real-time-networking-in-ios-websockettask-vs-socket-io-vs-starscream-vs-server-sent-events-1111b1992de1)
- [Jacob Bartlett — The Synchronization Framework in Swift 6](https://blog.jacobstechtavern.com/p/the-synchronisation-framework)
- [Jacob Bartlett — Mutex vs Actors vs OSAllocatedUnfairLock benchmark](https://x.com/jacobtechtavern/status/1877400040773201930)
- [Modern Swift Lock — SwiftLee](https://www.avanderlee.com/concurrency/modern-swift-lock-mutex-the-synchronization-framework/)
- [Michael Tsai — Swift 6.2 Observations (oct 2025)](https://mjtsai.com/blog/2025/10/31/swift-6-2-observations/)
- [Observation Framework vs Combine: Migration Guide](https://medium.com/@gauravharkhani01/observation-framework-vs-combine-migration-guide-c9ba2b8415cd)
- [A Deep Dive Into Observation — Boost SwiftUI Performance](https://fatbobman.com/en/posts/mastering-observation/)
- [Beyond Firebase: MetricKit, os_signpost, Instruments — modern SwiftUI](https://medium.com/@wesleymatlock/%EF%B8%8F-beyond-firebase-using-metrickit-os-signpost-and-instruments-in-a-modern-swiftui-app-f6dfdfb8d1e1)
- [A Practical Guide to Apple's MetricKit (fév 2026)](https://medium.com/@rajanTheSilentCompiler/a-practical-guide-to-apples-metrickit-stop-guessing-start-measuring-your-ios-app-s-health-5639db388e9c)
- [Polpiella — Time Profiler with Instruments and os_signposts](https://www.polpiella.dev/time-profiler-instruments/)
- [Hacking with Swift — drawingGroup() Metal rendering](https://www.hackingwithswift.com/books/ios-swiftui/enabling-high-performance-metal-rendering-with-drawinggroup)
- [SwiftUI Canvas API: 40% Faster in iOS 2025](https://ravi6997.medium.com/swiftuis-canvas-revolution-how-apple-s-new-drawing-api-is-transforming-ios-development-in-2025-ac0c1eb838df)
- [Metal in SwiftUI: How to Write Shaders — Bartlett](https://blog.jacobstechtavern.com/p/metal-in-swiftui-how-to-write-shaders)
- [EquatableView — Swift with Majid](https://swiftwithmajid.com/2020/01/22/optimizing-views-in-swiftui-using-equatableview/)
- [Understanding and Improving SwiftUI Performance — Airbnb Engineering](https://medium.com/airbnb-engineering/understanding-and-improving-swiftui-performance-37b77ac61896)
- [AsyncStream vs Combine Publishers — DEV](https://dev.to/arshtechpro/asyncstream-vs-combine-publishers-the-hidden-miss-that-can-hang-your-ios-app-4o00)
- [Async sequences, streams, and Combine — Swift by Sundell](https://www.swiftbysundell.com/articles/async-sequences-streams-and-combine/)
- [State of Swift WebSockets — Dept Engineering](https://engineering.deptagency.com/state-of-swift-websockets)
- [Real-time Video Editor with Metal — Day 2](https://medium.com/@nathan.fooo/real-time-video-editor-with-metal-day-2-a24f7f3fd933)
- [How to Build a Simple Real-Time Video Editor with Metal — IMG.LY](https://img.ly/blog/build-a-simple-real-time-video-editor-with-metal-for-ios/)
- [Smooth frame-by-frame scrubbing — gist](https://gist.github.com/shaps80/ac16b906938ad256e1f47b52b4809512)
- [Audio API Overview — objc.io](https://www.objc.io/issues/24-audio/audio-api-overview/)
- [AudioEngineLoopbackLatencyTest — GitHub](https://github.com/jnpdx/AudioEngineLoopbackLatencyTest)
- [Use Your Loaf — WWDC 2024 Viewing Guide](https://useyourloaf.com/blog/wwdc-2024-viewing-guide/)
- [Use Your Loaf — WWDC 2025 Viewing Guide](https://useyourloaf.com/blog/wwdc-2025-viewing-guide/)

### Sources comparatives industrie
- [Final Cut Pro for iPad — Apple Support timeline guide](https://support.apple.com/guide/final-cut-pro-ipad/create-and-work-with-timelines-devd26ede7b9/ipados)
- [OpenTimelineIO-AVFoundation — bridge OTIO/AVFoundation](https://github.com/OpenTimelineIO/OpenTimelineIO-AVFoundation)
- [Enhancing HDR on Instagram for iOS With Dolby Vision — Meta Engineering (nov 2025)](https://engineering.fb.com/2025/11/17/ios/enhancing-hdr-on-instagram-for-ios-with-dolby-vision/)
- [SDAVAssetExportSession — drop-in custom replacement](https://github.com/rs/SDAVAssetExportSession)
