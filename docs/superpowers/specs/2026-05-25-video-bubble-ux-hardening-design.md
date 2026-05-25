# iOS — Video bubble UX hardening (2026-05-25)

**Status** : Design approuvé, prêt pour writing-plans.
**Branche cible** : `feat/ios-video-bubble-ux-hardening` (worktree à créer).
**Surface** : `packages/MeeshySDK/Sources/MeeshyUI/Media/`, `apps/ios/Meeshy/Features/Main/Views/Bubble/`.

## Contexte

User report (2026-05-25) — 4 régressions UX sur les vidéos en attachement dans les bulles de conversation :

1. **Bandes noires sur vidéos verticales** — pillarbox visible pendant ~100–500 ms au montage.
2. **Pas de retour thumbnail** — fin de lecture ou scroll hors écran laisse la dernière frame figée.
3. **Bouton vitesse absent en inline** — pas d'affordance pour cycler 1×→2× dans la bulle.
4. **Fullscreen sans contrôles complets** — contrôles invisibles parfois + manque AirPlay/mute/PIP/loop.

Réponses utilisateur (validées en brainstorming) :
- Fin de lecture inline → snap back vers thumbnail + bouton play replay.
- Scroll hors écran → release du player, retour thumbnail au scroll back.
- Fix aspect ratio **iOS-only** (cache + thumbnail hint) ; pas de touche gateway dans ce sprint.
- Layout fullscreen **Option B** : top bar inchangé + mini-toolbar séparée pour les contrôles vidéo (mute/loop/pip/airplay).

## Architecture actuelle (mapping)

```
BubbleStandardLayout+Media.videoBody
  → VideoAvailabilityResolver(attachment)
    → MeeshyVideoPlayer(style: .inline, controls: .inlineDefault, frame: .bubble)
      → _InlineRenderer
        → MeeshyVideoSurface(player: manager.player, gravity: .resizeAspect)
        → _InlineOverlayControls (gated sur showControls)
        → MeeshyVideoThumbnail (gated sur !isThisActive)

BubbleStandardLayout.fullScreenCover(item: fullscreenAttachment)
  → VideoAvailabilityResolver(attachment)
    → MeeshyVideoPlayer(style: .fullscreen, controls: .fullscreenDefault, frame: .flat)
      → _FullscreenRenderer
        → MeeshyVideoSurface(player: manager.player, gravity: videoGravity)
        → _FullscreenOverlayControls (gated sur showControls)
```

`SharedAVPlayerManager.shared` (singleton actor SwiftUI) coordonne un seul player inline actif à la fois + PIP + watch progress reporting.

## Design

### Section 1 — Fix aspect ratio (vidéos verticales)

**Cause racine** : `_InlineRenderer.bubbleAspectRatio` retombe initialement sur `attachment.videoAspectRatio` (souvent valeur **storage paysage** car les iPhones stockent les vidéos portrait en 1280×720 + `preferredTransform` de rotation 90°) ou sur `16:9` par défaut. La résolution async via `AVAsset.preferredTransform` corrige en portrait ~100–500 ms plus tard. Pendant ce délai, la bulle est dimensionnée paysage, `MeeshyVideoSurface` en `.resizeAspect` letterbox la vidéo portrait → pillarbox visible sur les côtés (le `Color.black` du ZStack outer devient visible).

**Solution iOS-only — 2 sources synchrones + 1 cache async** :

1. **Nouveau `VideoDisplayAspectCache.shared`** (actor sous `MeeshyUI/Media/`) :
   ```swift
   actor VideoDisplayAspectCache {
       static let shared = VideoDisplayAspectCache()
       private var cache: [String: CGFloat] = [:]
       func ratio(for url: String) -> CGFloat? { cache[url] }
       func store(_ ratio: CGFloat, for url: String) { cache[url] = ratio }
   }
   ```
   - Vie : session (in-memory, vidé au cold start de l'app).
   - Empreinte : ~24 bytes par entrée → négligeable même pour 10k vidéos vues.

2. **Hint synchrone depuis le thumbnail** : `MeeshyVideoThumbnail` charge déjà l'image via `ProgressiveCachedImage` → expose la taille naturelle de l'UIImage dès qu'elle arrive (souvent instantané depuis le cache disque). En pratique, le thumbnail PNG sert le ratio d'affichage attendu (côté backend Whisper/enrichment + `AVAssetImageGenerator` côté iOS appliquent tous deux le `preferredTransform`). Si une vidéo donnée ne respectait pas cette invariant, le fallback `attachment.videoAspectRatio` puis le cache async corrigeraient ensuite — pas de régression possible, juste un flash potentiel équivalent à l'état actuel. Nouveau callback :
   ```swift
   MeeshyVideoThumbnail(..., onImageLoaded: { naturalSize in
       thumbnailAspectRatio = naturalSize.width / naturalSize.height
   })
   ```

3. **`_InlineRenderer.bubbleAspectRatio` priorise** :
   ```swift
   private var bubbleAspectRatio: CGFloat {
       displayAspectRatio                            // 1. cache hit ou résolu
       ?? thumbnailAspectRatio                       // 2. hint synchrone (thumbnail)
       ?? player.attachment.videoAspectRatio         // 3. storage metadata (peut être faux)
       ?? (16.0 / 9.0)                               // 4. fallback final
   }
   ```

4. **Résolution AVAsset → write cache** :
   ```swift
   private func resolveDisplayAspectRatio() async {
       let url = player.attachment.fileUrl
       if let cached = await VideoDisplayAspectCache.shared.ratio(for: url) {
           displayAspectRatio = cached
           return
       }
       // ... AVAsset.preferredTransform comme aujourd'hui ...
       await VideoDisplayAspectCache.shared.store(ratio, for: url)
       displayAspectRatio = ratio
   }
   ```

**Conséquence UX** :
- 1ère vue d'une vidéo portrait, cold cache thumbnail → flash ~50–150 ms possible (avant que le thumbnail arrive). Acceptable.
- 1ère vue, thumbnail déjà en cache (cas normal car le thumbnail est éagerly prefetché) → ratio juste instantanément.
- Vues suivantes (même session, même URL) → cache hit, instantané toujours.

**Follow-up backend (backlog, hors scope)** : faire calculer `videoAspectRatio` côté gateway au post-upload (ffprobe + rotation metadata). Quand ce fix arrive, le cache iOS devient redondant mais inoffensif → garder comme défensif.

### Section 2 — Retour thumbnail (fin lecture + scroll out)

**Comportement** :
- Fin de lecture inline → snap thumbnail + play button replay.
- Scroll hors écran → release du player ; au scroll back, thumbnail.
- Pause manuelle (tap pause button) → reste sur surface avec contrôles (distinct du release).

**Changements `SharedAVPlayerManager`** :

```swift
/// Libère le player pour cette URL. No-op si une autre URL est active.
/// Utilisé par les bubbles inline sur fin de lecture ou .onDisappear pour
/// permettre le retour au thumbnail au scroll back.
@MainActor
func release(urlString: String) {
    guard activeURL == urlString else { return }
    player?.pause()
    removeKVOObservers()
    player = nil
    activeURL = ""
    duration = 0
    currentTime = 0
    isPlaying = false
    // Note : `playbackSpeed` et `isMuted` sont conservés (préférences globales session)
}
```

**Changements `_InlineRenderer`** :

```swift
@State private var endObserver: NSObjectProtocol?

private func observeEndIfActive() {
    guard endObserver == nil, isThisActive, let item = manager.player?.currentItem else { return }
    endObserver = NotificationCenter.default.addObserver(
        forName: .AVPlayerItemDidPlayToEndTime,
        object: item, queue: .main
    ) { [url = player.attachment.fileUrl] _ in
        Task { @MainActor in
            SharedAVPlayerManager.shared.release(urlString: url)
        }
    }
}

private func teardown() {
    controlsTimer?.invalidate(); controlsTimer = nil
    if let obs = endObserver {
        NotificationCenter.default.removeObserver(obs)
        endObserver = nil
    }
    manager.release(urlString: player.attachment.fileUrl)
}
```

Câblage : observer mounté dans `.adaptiveOnChange(of: isThisActive)` quand `nowActive == true`, retiré quand `nowActive == false` ou dans `.onDisappear`. `teardown()` (déjà appelé sur `.onDisappear`) passe de `manager.pause()` à `manager.release(urlString:)`.

**Animation** : la transition surface ↔ thumbnail bénéficie déjà du `.animation(.easeInOut(duration: 0.15), value: isThisActive)` existant.

**Distinction pause vs release** :
- `manager.togglePlayPause()` → pause sans clear → surface reste mountée → contrôles visibles → user peut reprendre.
- `_InlineRenderer.teardown()` (sur disappear ou fin) → release → activeURL vidée → `isThisActive == false` → thumbnail.

### Section 3 — Bouton vitesse inline

```swift
// MeeshyVideoPlayer.ControlSet
public static let inlineDefault: ControlSet = [.playPause, .scrubber, .duration, .expand, .speed]
```

Une ligne. Le rendu est déjà câblé dans `_InlineOverlayControls.topBar` (lignes 82–94), avec capsule accent-tinted top-right. Cycle 1.0× → 1.25× → 1.5× → 1.75× → 2.0× → 1.0× via `manager.cycleSpeed()` existant.

### Section 4 — Fullscreen (bug + features)

#### 4a) Fix bug "controls invisibles"

**Cause probable** : `_FullscreenRenderer.body` switch sur `availability` → si `.ready` + `isActive == false`, rend `loadingState` (ProgressView seul, AUCUN contrôle). La transition `loadingState` → `playerContent` dépend de `manager.load` qui peut prendre 1–2 s sur cold cache disque. Pendant ce délai l'utilisateur voit un écran noir avec spinner et pense "pas de contrôles".

**Restructuration** : toujours rendre les contrôles overlay dès `.ready`, indépendamment de `isActive`. ProgressView devient un élément central INTÉRIEUR à l'overlay (au-dessus du fond noir, en dessous des contrôles top/bottom). Top bar (close/share/save) toujours visible. Boutons centre désactivés tant que `manager.player == nil`. Speed/seekbar désactivés tant que `manager.duration <= 0`.

```swift
case .ready:
    ZStack {
        Color.black
        if let p = manager.player {
            MeeshyVideoSurface(player: p, gravity: videoGravity, isMuted: manager.isMuted)
                .onTapGesture { toggleControls() }
        } else {
            ProgressView().tint(.white)
                .onAppear {
                    manager.attachmentId = player.attachment.id
                    manager.load(urlString: player.attachment.fileUrl)
                    manager.play()
                }
        }
        if showControls {
            _FullscreenOverlayControls(...)  // toujours rendu si .ready
            authorAndCaptionOverlay
        }
    }
```

Bonus défensif : `.onAppear { showControls = true }` sur le body du `_FullscreenRenderer` pour reset si l'écran est revisité.

#### 4b) Features ajoutées — AirPlay, Mute, PIP, Loop

**Ajouts à `ControlSet`** :
```swift
public static let airplay = ControlSet(rawValue: 1 << 11)
public static let pip     = ControlSet(rawValue: 1 << 12)
public static let loop    = ControlSet(rawValue: 1 << 13)
// .mute (1 << 7) déjà déclaré, jusqu'ici inutilisé.
```

**Nouveau `fullscreenDefault`** :
```swift
public static let fullscreenDefault: ControlSet = [
    .playPause, .scrubber, .duration, .save, .share, .close,
    .speed, .author, .mute, .airplay, .pip, .loop
]
```

**Layout Option B (validé)** :
```
┌─────────────────────────────────────────────┐
│ [×]  filename.mov           [↗] [↓]         │ ← top bar (existant)
│                                             │
│                                             │
│           ←10s  [⏸ 72pt]  10s→              │ ← center controls (existant)
│                                             │
│         [🔇]  [🔁]  [▭]  [📡]                │ ← NEW mini-toolbar
│         ━━━━━━━●━━━━━━━━━━━━━              │ ← seek bar
│         0:42                       2:15      │ ← duration
│         [1×] [1.25×] [1.5×] [1.75×] [2×]    │ ← speed row (existant)
└─────────────────────────────────────────────┘
```

Mini-toolbar : centré, icônes 28pt dans capsules `.ultraThinMaterial` + accent tint à 0.20 quand actif. Placée entre `centerControls` et `bottomStack` dans le `VStack`.

**Câblage** :

| Contrôle | Icône SFSymbols | State | Action |
|---|---|---|---|
| Mute | `speaker.slash.fill` / `speaker.wave.2.fill` | `manager.isMuted: Bool` (@Published) | Toggle → `MeeshyVideoSurface.isMuted` se met à jour reactivement |
| Loop | `repeat` | `manager.shouldLoop: Bool` (@Published) | Toggle. Callback `AVPlayerItemDidPlayToEndTime` côté fullscreen → si loop, `seek(to: 0); play()` au lieu de release |
| PIP | `pip.enter` / `pip.exit` | `manager.isPipActive: Bool` | Tap → `manager.startPip()` ou `manager.stopPip()` (existants) |
| AirPlay | (icône native iOS via AVKit) | n/a | `AVRoutePickerView` wrapped en `UIViewRepresentable` |

**Nouveaux properties `SharedAVPlayerManager`** :
```swift
@Published var isMuted: Bool = false {
    didSet { player?.isMuted = isMuted }
}
@Published var shouldLoop: Bool = false
@Published private(set) var isPipActive: Bool = false
```

**Loop interaction avec release-on-end de la Section 2** :
- Inline : pas de loop → release-on-end → thumbnail. (Inline n'expose pas `.loop`.)
- Fullscreen : si `manager.shouldLoop == true` → callback `AVPlayerItemDidPlayToEndTime` côté fullscreen restart la lecture au lieu de release.
- Pour éviter race : le `_InlineRenderer.observeEndIfActive` callback vérifie `!manager.shouldLoop` AVANT de release (defensive — l'utilisateur ne devrait pas pouvoir activer loop en inline mais on garde le check).

**Wrapper AirPlay** :
```swift
struct AirPlayRoutePicker: UIViewRepresentable {
    let tintColor: UIColor

    func makeUIView(context: Context) -> AVRoutePickerView {
        let v = AVRoutePickerView()
        v.tintColor = tintColor
        v.activeTintColor = tintColor
        return v
    }

    func updateUIView(_ uiView: AVRoutePickerView, context: Context) {
        uiView.tintColor = tintColor
    }
}
```

## Tests

### Unit tests (SDK)

**`MeeshyVideoPlayerTests`** :
- `test_inlineDefault_includesSpeed` — confirme que `.speed` est dans inlineDefault.
- `test_fullscreenDefault_includesNewControls` — confirme `.airplay`, `.pip`, `.loop`, `.mute`.
- `test_controlSet_rawValues_areStable` — sanity check sur les bits.

**`SharedAVPlayerManagerTests`** :
- `test_release_clearsActiveUrl_whenMatches`
- `test_release_noOps_whenDifferentUrl`
- `test_release_pausesPlayer_andNilsPlayer`
- `test_release_resetsDurationAndCurrentTime`
- `test_setMuted_propagatesToCurrentPlayer`
- `test_shouldLoop_defaultsFalse`
- `test_shouldLoop_canToggle`

**`VideoDisplayAspectCacheTests`** :
- `test_store_thenRatio_returnsValue`
- `test_ratio_missingKey_returnsNil`
- `test_concurrent_storeAndRead_isSafe` (actor isolation test)

### App-side tests

**`_InlineRendererBehaviorTests`** (XCTest, MeeshyTests, via SwiftUI ViewInspector ou pur logic test via extraction d'une struct `InlineRendererState`) :
- `test_aspectRatio_priorityOrder_cacheBeforeThumbnailBeforeAttachment`
- `test_endOfPlayback_releasesPlayer`
- `test_disappear_releasesPlayer`
- `test_pause_doesNotRelease`

### Snapshot tests (différé, post-launch)

- Bulle portrait sans cache thumbnail (cold) → vérifier pas de pillarbox visible (ratio résolu via attachment ou fallback).
- Bulle portrait avec cache thumbnail hit → vérifier surface remplit la bulle.
- Fullscreen avec all controls visible → vérifier layout Option B.

### Smoke checklist (QA manuel)

- [ ] Vidéo portrait : ouvrir conversation contenant une vidéo verticale, pas de bandes noires (au scroll initial ou après hot cache).
- [ ] Lire vidéo inline → attendre fin → vérifier snap thumbnail + bouton play replay.
- [ ] Lire vidéo inline → scroller la bulle hors écran → revenir → vérifier thumbnail (pas frame figée).
- [ ] Vidéo inline : tap pause → vérifier contrôles restent visibles + surface reste mountée + reprise au tap play.
- [ ] Vidéo inline : vérifier capsule "1×" en top-right, cycler en tappant.
- [ ] Vidéo fullscreen : open → vérifier tous contrôles visibles dès l'apparition (pas écran noir).
- [ ] Fullscreen : tap mute → audio coupé, icône change ; retap → audio retour.
- [ ] Fullscreen : tap loop → fin de lecture restart depuis 0 ; détap → fin = arrêt normal.
- [ ] Fullscreen : tap PIP → mini-fenêtre flotte ; tap PIP de retour → retour fullscreen.
- [ ] Fullscreen : tap AirPlay → picker système ouvre.
- [ ] Fullscreen : tap ±10s → seek 10s back/forward depuis position courante.
- [ ] Fullscreen : tap une vitesse → vitesse appliquée, capsule highlight accent.

## Risques

1. **Cache aspect ratio peut grossir** — bornage à ~1000 entrées via LRU si jamais on observe une fuite. Non bloquant launch.
2. **AVRoutePickerView en SwiftUI** — c'est du UIKit wrappé, attention au sizing : forcer `.frame(width: 44, height: 44)` pour matcher les autres icônes.
3. **PIP en simulateur** — `AVPictureInPictureController.isPictureInPictureSupported` retourne `false` sur simulateur. Désactiver le bouton PIP visuellement si non supporté.
4. **Loop interaction race** — si user toggle loop pendant la fin de lecture, le callback `AVPlayerItemDidPlayToEndTime` peut s'exécuter avec la mauvaise valeur. Lire `manager.shouldLoop` au moment du callback (pas en capture), donc OK.
5. **Mute persisté entre sessions** — décision : NON. `isMuted` reset à `false` au cold start (UX standard iOS Photos). Si on veut persister plus tard, ajouter un store `MediaDownloadPreferencesStore.isMutedByDefault`.
6. **Release pendant un seek user en cours** — si l'user disappear pendant qu'il drag le scrubber, le release peut crasher le drag. Le `_InlineOverlayControls.seekBar` capture sa propre `@State isSeeking` — le release ferait que `manager.player == nil` au `.onEnded`. Ajouter un guard dans `release(urlString:)` : `guard !isSeekingInProgress else { return }` — ou plus simple, capture l'URL au début du drag et noop si elle a changé.

## Découpage en commits (proposition pour writing-plans)

1. `feat(sdk/media): VideoDisplayAspectCache + thumbnail size hint`
2. `feat(sdk/media): SharedAVPlayerManager.release(urlString:) + isMuted + shouldLoop`
3. `feat(sdk/media): _InlineRenderer end-of-playback + disappear → release`
4. `feat(sdk/media): .speed in inlineDefault + ControlSet.airplay/pip/loop`
5. `feat(sdk/media): _FullscreenRenderer overlay toujours rendu (fix bug)`
6. `feat(sdk/media): mini-toolbar fullscreen (mute/loop/pip/airplay)`
7. `feat(sdk/media): AirPlayRoutePicker UIViewRepresentable`
8. `test(sdk): coverage release + cache + loop + mute`
9. `docs(qa): smoke checklist video bubble UX hardening`

Chaque commit reste indépendamment buildable + testé. Pas de pbxproj cross-team (tout sous `packages/MeeshySDK/Sources/MeeshyUI/Media/`).

## Hors scope (explicite)

- Pas de touche backend / gateway dans ce sprint (calcul ratio post-upload = backlog).
- Pas de migration des vidéos déjà uploadées (le cache iOS couvre).
- Pas de loop en inline (volontairement omis du `inlineDefault`).
- Pas de persistance mute cross-session (décision : reset cold start).
- Pas de snapshot tests visuels dans ce sprint (différé post-launch).
- Pas de fix pour les call attachments vidéo (hors périmètre — c'est un autre flow WebRTC).
