# iOS Video Player Unification — Design

**Date** : 2026-05-23
**Auteur** : Refonte vidéo unifiée
**Scope** : Tous les lecteurs vidéo de consommation iOS (apps/ios + packages/MeeshySDK/MeeshyUI/Media + Story canvas video paths).
**Hors scope** : `MeeshyVideoEditorView` (éditeur trim/captions), `MeeshyAudioPlayerView` (audio), pipeline d'export Story MP4.

---

## 1. Contexte

L'app iOS héberge aujourd'hui **9 lecteurs vidéo** distincts qui se recouvrent largement (~2 200 lignes au total), avec des comportements divergents sur :

- Cap d'aspect ratio (`InlineVideoPlayerView.maxHeight = 400`, `VideoPlayerView` cap par `context`, parents qui forcent une hauteur fixe).
- Set de contrôles exposés (chacun réinvente play/scrub/expand/download/save/share).
- Couplage download policy (`VideoMediaView` et `GatedVideoFullscreenPlayer` côté app dupliquent la résolution).
- Lifecycle AVPlayer (`SharedAVPlayerManager` singleton vs AVPlayer dédié vs AVPlayerLooper Story).

Conséquences concrètes :
- Une vidéo portrait 9:16 dans une bulle message est rendue avec `height: 200pt` fixe → squashée.
- Le carousel d'attachements force `height: 300pt` → idem.
- La logique de download policy est dupliquée entre `VideoMediaView` et `GatedVideoFullscreenPlayer`.
- Chaque ajout de feature (auteur, share, save) doit être propagé manuellement à N lecteurs.

## 2. Objectif

Ramener à **5 composants** (4 visibles + 1 atome SwiftUI) :

1. `MeeshyVideoPlayer` (SwiftUI, public) — composant polymorphe avec `Style` enum + `ControlSet` OptionSet + `Frame` + `PerformanceOptions`.
2. `MeeshyVideoSurface` (SwiftUI, internal) — atome `UIViewRepresentable` hostant `AVPlayerLayer` directement (pas `VideoPlayer` SwiftUI).
3. `MeeshyVideoCanvasLayer` (CALayer subclass, public) — atome pour Story canvas. Compose `AVPlayerLayer` + `AVPlayerLooper` + observers. Consommé par `StoryMediaLayer` / `StoryBackgroundLayer`.
4. `MeeshyVideoThumbnail` (SwiftUI, public) — preview static (image cached OU first-frame via `AVAssetImageGenerator`), play badge + duration badge optionnels, `onTap` callback. Aucun `AVPlayer` instancié.
5. `VideoAvailabilityResolver` (SwiftUI helper, **app-side**) — view wrapper qui résout `VideoAvailability` via `CacheCoordinator.video.isCached` + `AttachmentDownloader` + `MediaDownloadPolicyEngine` et fournit `(availability, onDownload)` à son content builder. Vit dans `apps/ios/Meeshy/Features/Main/Views/VideoAvailabilityResolver.swift`. Remplace `VideoMediaView` et `GatedVideoFullscreenPlayer` (orchestration UX produit, pas atome SDK générique). `AttachmentDownloader` **reste app-side** (`apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift`) car c'est de la composition Meeshy-specific des building blocks SDK — le SDK doit rester pur (atomes + services low-level, pas d'orchestration UX).

Objectifs annexes :
- Aspect ratio piloté par le **format réel de la vidéo** (`attachment.width` / `attachment.height`), avec cap configurable (`1.6 × width` par défaut). Plus aucune hauteur fixe parent.
- Fluidité tap-to-play <100ms (cache local → `playImmediately(atRate: 1.0)` + buffer 2s + thumbnail poster).
- Story canvas reste en CALayer pur (perf composer/reader préservée). La logique AVPlayer est mutualisée via `MeeshyVideoCanvasLayer`.

## 3. Architecture

```
                         AVPlayer / AVPlayerItem
                                 ▲
              ┌──────────────────┴──────────────────┐
              │ rendu surface                       │ rendu canvas
              │                                     │
   ┌──────────────────────┐              ┌──────────────────────┐
   │ MeeshyVideoSurface   │              │ MeeshyVideoCanvasLayer
   │ UIViewRepresentable  │              │ CALayer subclass     │
   │  • AVPlayerLayer     │              │  • AVPlayerLayer     │
   │  • videoGravity      │              │  • AVPlayerLooper    │
   │  • mute/loop param   │              │  • observers KVO     │
   └──────────┬───────────┘              └──────────┬───────────┘
              │                                     │
              │ host SwiftUI                        │ composed by
              ▼                                     ▼
   ┌──────────────────────┐              ┌──────────────────────────┐
   │  MeeshyVideoPlayer   │              │ StoryMediaLayer          │
   │  (SwiftUI, public)   │              │ StoryBackgroundLayer     │
   │  Style enum          │              │ (gardent effects:        │
   │  ControlSet          │              │  filters/transforms/blur)│
   │  Frame               │              └──────────────────────────┘
   │  PerformanceOptions  │
   └──────────────────────┘
              ▲
              │ resolves availability
              │
   ┌──────────────────────┐              ┌──────────────────────┐
   │ VideoAvailability    │              │ MeeshyVideoThumbnail │
   │ Resolver             │              │ (SwiftUI, public)    │
   │ (view wrapper)       │              │  • static preview    │
   │  • CacheCoordinator  │              │  • play+duration     │
   │  • AttachmentDownloader│            │  • no playback       │
   │  • MediaDownloadPolicyEngine│       │  • onTap callback    │
   └──────────────────────┘              └──────────────────────┘
```

## 4. API publique

### 4.1 `MeeshyVideoPlayer`

```swift
public struct MeeshyVideoPlayer: View {

    // MARK: - Style

    public enum Style: Sendable {
        case flat         // pas de chrome, autoplay+loop+mute (preview SwiftUI hors canvas)
        case inline       // thumbnail → tap-play + overlay controls (bubble, carousel, feed, post)
        case mini         // thumb + play badge + duration, tap = délégué (reply chip, composer)
        case fullscreen   // full chrome (scrub, save, share, close, auteur)
    }

    // MARK: - ControlSet

    public struct ControlSet: OptionSet, Sendable {
        public let rawValue: Int
        public init(rawValue: Int) { self.rawValue = rawValue }

        public static let playPause   = ControlSet(rawValue: 1 << 0)
        public static let scrubber    = ControlSet(rawValue: 1 << 1)
        public static let duration    = ControlSet(rawValue: 1 << 2)
        public static let expand      = ControlSet(rawValue: 1 << 3)
        public static let download    = ControlSet(rawValue: 1 << 4)
        public static let save        = ControlSet(rawValue: 1 << 5)
        public static let share       = ControlSet(rawValue: 1 << 6)
        public static let mute        = ControlSet(rawValue: 1 << 7)
        public static let speed       = ControlSet(rawValue: 1 << 8)
        public static let close       = ControlSet(rawValue: 1 << 9)
        public static let author      = ControlSet(rawValue: 1 << 10)

        public static let none: ControlSet              = []
        public static let inlineDefault: ControlSet     = [.playPause, .scrubber, .duration, .expand]
        public static let fullscreenDefault: ControlSet = [.playPause, .scrubber, .duration, .save, .share, .close, .speed, .author]
        public static let miniDefault: ControlSet       = [.duration]
    }

    // MARK: - Frame

    public struct Frame: Sendable {
        public var maxAspectRatio: CGFloat?   // 1.6 = portrait 5:8 max. nil = pas de cap.
        public var maxHeight: CGFloat?        // cap absolu pt. nil = pas de cap.
        public var cornerRadius: CGFloat      // 0 = pas de masque
        public var border: BorderStyle?

        public struct BorderStyle: Sendable {
            public let color: Color
            public let width: CGFloat
            public init(color: Color, width: CGFloat) {
                self.color = color
                self.width = width
            }
        }

        public static let bubble = Frame(maxAspectRatio: 1.6, maxHeight: nil,  cornerRadius: 0,  border: nil)
        public static let card   = Frame(maxAspectRatio: 1.6, maxHeight: nil,  cornerRadius: 12, border: nil)
        public static let mini   = Frame(maxAspectRatio: 1.0, maxHeight: 120,  cornerRadius: 8,  border: nil)
        public static let flat   = Frame(maxAspectRatio: nil, maxHeight: nil,  cornerRadius: 0,  border: nil)
    }

    // MARK: - PerformanceOptions

    public struct PerformanceOptions: Sendable {
        public var sharedPlayer: Bool                      // true = SharedAVPlayerManager (1 actif à la fois)
        public var preloadOnAppear: Bool                   // warm AVPlayerItem dès .onAppear
        public var preferredForwardBufferDuration: Double  // 2s = démarrage rapide
        public var waitsToMinimizeStalling: Bool           // false = playImmediately
        public var preferredPeakBitRate: Double?           // nil = adaptatif HLS

        public static let inline     = PerformanceOptions(sharedPlayer: true,  preloadOnAppear: false, preferredForwardBufferDuration: 2.0, waitsToMinimizeStalling: false, preferredPeakBitRate: nil)
        public static let carousel   = PerformanceOptions(sharedPlayer: false, preloadOnAppear: true,  preferredForwardBufferDuration: 2.0, waitsToMinimizeStalling: false, preferredPeakBitRate: nil)
        public static let flat       = PerformanceOptions(sharedPlayer: false, preloadOnAppear: true,  preferredForwardBufferDuration: 1.0, waitsToMinimizeStalling: false, preferredPeakBitRate: nil)
        public static let fullscreen = PerformanceOptions(sharedPlayer: false, preloadOnAppear: true,  preferredForwardBufferDuration: 4.0, waitsToMinimizeStalling: false, preferredPeakBitRate: nil)
        public static let mini       = PerformanceOptions(sharedPlayer: false, preloadOnAppear: false, preferredForwardBufferDuration: 0,   waitsToMinimizeStalling: true,  preferredPeakBitRate: nil)
    }

    // MARK: - VideoAuthor

    public struct VideoAuthor: Sendable {
        public let displayName: String
        public let avatarUrl: String?
        public let userId: String
        public let onTap: (() -> Void)?
        public init(displayName: String, avatarUrl: String?, userId: String, onTap: (() -> Void)? = nil) {
            self.displayName = displayName
            self.avatarUrl = avatarUrl
            self.userId = userId
            self.onTap = onTap
        }
    }

    // MARK: - Init

    public init(
        attachment: MeeshyMessageAttachment,
        style: Style,
        controls: ControlSet,
        accentColor: String,
        frame: Frame = .bubble,
        availability: VideoAvailability = .ready,
        performance: PerformanceOptions? = nil,        // nil → inféré du Style
        author: VideoAuthor? = nil,
        caption: String? = nil,
        mentionDisplayNames: [String: String]? = nil,
        onDownload: (() -> Void)? = nil,
        onExpand: (() -> Void)? = nil,
        onClose: (() -> Void)? = nil,
        onSaveSuccess: (() -> Void)? = nil
    )
}
```

**Inférence `performance` depuis `style` quand `nil`** :

| Style | Perf preset |
|---|---|
| `.flat` | `.flat` |
| `.inline` | `.inline` |
| `.mini` | `.mini` |
| `.fullscreen` | `.fullscreen` |

Le caller peut override pour cas custom (ex: carousel feed → `performance: .carousel`).

### 4.2 Comportement par Style

**`.flat`** — pas de chrome.
- **Hors canvas** (preview SwiftUI, ex: story picker) : autoplay onAppear + loop + mute via AVPlayerLooper interne. Aucune réaction au tap par défaut.
- **Dans canvas** (Story composer/reader) : **on ne passe pas par `MeeshyVideoPlayer(style: .flat)`**. Le canvas utilise directement `MeeshyVideoCanvasLayer` driven par le pipeline `StoryMediaLayer`/`StoryBackgroundLayer`.

**`.inline`** — affiche thumbnail (image cached OU first-frame async) + play button center.
- Tap play → fade thumbnail → mount `MeeshyVideoSurface` → `playImmediately(atRate: 1.0)`.
- Overlay controls (scrub + duration + expand) bas, autohide 3s.
- Re-tap surface → toggle controls.
- Si `controls.expand` actif, bouton expand → `onExpand()`.

**`.mini`** — utilise `MeeshyVideoThumbnail` en interne. Aucun `AVPlayer` instancié. Tap → `onExpand?()`. Économie mémoire critique pour les listes/composer.

**`.fullscreen`** — démarre directement player (pas de gate thumbnail).
- Full chrome : scrubber, time current/total, save button, share button, close, speed selector, author chip top-leading, caption bottom.
- Gravity togglable (resizeAspect ↔ resizeAspectFill) sur tap double-finger (immersion mode).
- `onClose` mandatory.

### 4.3 `MeeshyVideoSurface` (internal SDK atom)

```swift
internal struct MeeshyVideoSurface: UIViewRepresentable {
    let player: AVPlayer
    let gravity: AVLayerVideoGravity
    let isMuted: Bool

    func makeUIView(context: Context) -> _SurfaceUIView {
        let view = _SurfaceUIView()
        view.isOpaque = true
        view.playerLayer.videoGravity = gravity
        view.playerLayer.player = player
        player.isMuted = isMuted
        return view
    }

    func updateUIView(_ uiView: _SurfaceUIView, context: Context) {
        // CRITIQUE : ne JAMAIS recréer playerLayer. Comparer par référence.
        if uiView.playerLayer.player !== player {
            uiView.playerLayer.player = player
        }
        if uiView.playerLayer.videoGravity != gravity {
            uiView.playerLayer.videoGravity = gravity
        }
        if player.isMuted != isMuted {
            player.isMuted = isMuted
        }
    }

    final class _SurfaceUIView: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }
}
```

Pourquoi `layerClass` override : le layer principal **est** l'`AVPlayerLayer`. Pas de sublayer ajouté → 1 layer au lieu de 2, pas de layout sync overhead, pas de mismatch de bounds.

### 4.4 `MeeshyVideoCanvasLayer` (Story canvas atom)

```swift
public final class MeeshyVideoCanvasLayer: CALayer {
    public let avPlayerLayer = AVPlayerLayer()
    private var queuePlayer: AVQueuePlayer?
    private var looper: AVPlayerLooper?
    private var endObserver: NSObjectProtocol?
    private var statusObserver: NSKeyValueObservation?

    public var onReadyToPlay: (() -> Void)?
    public var onPlaybackEnded: (() -> Void)?

    public override init() {
        super.init()
        addSublayer(avPlayerLayer)
        avPlayerLayer.videoGravity = .resizeAspectFill   // background story = fill
    }
    public override init(layer: Any) { super.init(layer: layer) }
    public required init?(coder: NSCoder) { fatalError() }

    public override func layoutSublayers() {
        super.layoutSublayers()
        avPlayerLayer.frame = bounds
    }

    public func attach(url: URL, loops: Bool = true, muted: Bool = true, bufferDuration: Double = 1.0) {
        detach()
        let item = AVPlayerItem(url: url)
        item.preferredForwardBufferDuration = bufferDuration
        let queue = AVQueuePlayer(playerItem: item)
        queue.isMuted = muted
        queue.automaticallyWaitsToMinimizeStalling = false
        if loops {
            looper = AVPlayerLooper(player: queue, templateItem: item)
        }
        avPlayerLayer.player = queue
        queuePlayer = queue
        observeItem(item)
    }

    public func play() { queuePlayer?.playImmediately(atRate: 1.0) }
    public func pause() { queuePlayer?.pause() }

    public func detach() {
        statusObserver?.invalidate()
        statusObserver = nil
        if let obs = endObserver {
            NotificationCenter.default.removeObserver(obs)
            endObserver = nil
        }
        looper?.disableLooping()
        looper = nil
        queuePlayer?.pause()
        queuePlayer = nil
        avPlayerLayer.player = nil
    }

    private func observeItem(_ item: AVPlayerItem) {
        statusObserver = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            guard item.status == .readyToPlay else { return }
            DispatchQueue.main.async { self?.onReadyToPlay?() }
        }
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            self?.onPlaybackEnded?()
        }
    }
}
```

`StoryMediaLayer` et `StoryBackgroundLayer` composent cette layer comme sublayer interne, en remplacement de leur AVPlayerLayer + AVPlayerLooper actuels duplicates. Ils conservent leurs effets (filters, transforms, backdrop blur MPS).

### 4.5 `MeeshyVideoThumbnail`

```swift
public struct MeeshyVideoThumbnail: View {
    public let attachment: MeeshyMessageAttachment
    public var showPlayBadge: Bool = true
    public var showDurationBadge: Bool = true
    public var accentColor: String
    public var cornerRadius: CGFloat = 0
    public var onTap: (() -> Void)? = nil

    public init(...)
}
```

Comportement :
- Affiche le `attachment.thumbnailUrl` si présent (via `ProgressiveCachedImage` + `thumbHash` placeholder).
- Sinon, `AVAssetImageGenerator.generateCGImageAsynchronously(for: time:)` (iOS 16+) extrait le first-frame, caché dans `CacheCoordinator.images` keyed by `videoURL+t0`.
- Sinon, `Color(hex: attachment.thumbnailColor)` placeholder.
- Play badge optionnel (cercle ultraThinMaterial + accent tint + play.fill).
- Duration badge optionnel (capsule monospaced en bas-droite).
- `onTap` callback.

### 4.6 `VideoAvailabilityResolver` (app-side : `apps/ios/Meeshy/Features/Main/Views/`)

```swift
struct VideoAvailabilityResolver<Content: View>: View {
    let attachment: MessageAttachment           // = MeeshyMessageAttachment via typealias
    let content: (VideoAvailability, @escaping () -> Void) -> Content

    @State private var resolvedAvailability: VideoAvailability = .needsDownload
    @StateObject private var downloader = AttachmentDownloader()
}
```

**Pourquoi app-side et pas SDK** : ce wrapper orchestre les building blocks SDK (`CacheCoordinator`, `MediaDownloadPolicyEngine`, `NetworkConditionMonitor`, `MediaDownloadPreferencesStore`) pour exprimer une décision UX produit Meeshy — quand auto-DL, quels stores cibler, comment cascader cache → downloader → policy. C'est de la composition applicative, pas un atome générique. Le SDK reste pur (atomes + services low-level) ; l'app compose.

`AttachmentDownloader` reste lui aussi app-side (`ConversationMediaViews.swift:208`) pour la même raison — il connaît les `CacheStoreKind` Meeshy et résout via `MeeshyConfig.resolveMediaURL`.

Comportement :
- `.task(id: attachment.fileUrl)` : résout `availability` via `CacheCoordinator.video.isCached`.
- Si `availability == .needsDownload` et `MediaDownloadPolicyEngine.shouldAutoDownload(kind: .video, condition: NetworkConditionMonitor.shared.condition, prefs: MediaDownloadPreferencesStore.shared.preferences) == true`, fire auto-DL.
- Construit l'`availability` calculé en combinant `downloader.isDownloading`, `downloader.isCached`, et `resolvedAvailability`.
- Passe `(availability, onDownload: { downloader.start(...) })` au content builder.

Usage type :

```swift
VideoAvailabilityResolver(attachment: att) { availability, onDownload in
    MeeshyVideoPlayer(
        attachment: att,
        style: .inline,
        controls: .inlineDefault,
        accentColor: contactColor,
        frame: .bubble,
        availability: availability,
        onDownload: onDownload,
        onExpand: { fullscreenAttachment = att }
    )
}
```

## 5. Best practices fluidité codifiées

Le composant les applique automatiquement selon `PerformanceOptions`. Aucun caller n'a à les répliquer.

1. **`AVPlayerLayer` direct (pas `VideoPlayer` SwiftUI)** — `MeeshyVideoSurface` utilise `layerClass` override. Zéro overhead AVKit.
2. **`automaticallyWaitsToMinimizeStalling = false`** sur tous les players sauf `.mini`. Démarrage instantané dès qu'il y a du buffer.
3. **`playImmediately(atRate: 1.0)`** au lieu de `play()`. Bypasse l'attente du rate sync.
4. **`preferredForwardBufferDuration` explicite** : 1s (flat), 2s (inline/carousel), 4s (fullscreen). Pas de défaut adaptatif lent.
5. **Thumbnail-first** : `AVPlayerLayer.contents` reçoit le `UIImage` thumbnail au mount → poster image immédiate, pas de frame noir. Fade-in vidéo (0.15s) quand `item.status == .readyToPlay`.
6. **Preload conditionnel** : `preloadOnAppear=true` (carousel, fullscreen, flat) crée l'`AVPlayerItem` dès `.onAppear` même sans `.play()`. Le decode HW commence en background. Au tap (inline) ou onAppear (flat/fullscreen), `playImmediately()` → démarrage <100ms.
7. **AVPlayer pooling carousel** : `performance: .carousel` instancie un AVPlayer dédié (pas SharedManager). Les slides `N ± 1` ont leur AVPlayer pause+buffered ; au swipe, `playImmediately()` instantané. **Règle de release** : quand l'index courant passe à `N`, les slides `< N-1` et `> N+1` libèrent leur AVPlayer et retombent sur `MeeshyVideoThumbnail`. iOS limite à ~4 décodeurs HW concurrents → safe.
8. **Pas de body recompute pendant playback** :
   - Scrubber : `addPeriodicTimeObserver(forInterval: 0.1)` met à jour un `@State` local de la sous-vue scrubber → seule la scrubber bar re-render.
   - Sous-vues marquées `Equatable` + `.equatable()` (overlay controls, badges, author chip).
   - Pas d'`@ObservedObject` sur `SharedAVPlayerManager` au niveau parent → bindings ciblés à la sous-vue concernée.
9. **Mute pour `.flat` et autoplay** : conforme AVAudioSession sans interrompre la musique utilisateur. AVAudioSession category `.ambient` pour `.flat`.
10. **AVAudioSession `.playback`** configurée au mount premier `.inline`/`.fullscreen` (déjà géré par `SharedAVPlayerManager`).
11. **Décodage HW H.264/HEVC** : automatique via AVPlayer, rien à faire.
12. **Pas de SwiftUI animation sur frame size** pendant playback (sinon l'AVPlayerLayer relayoute → frame drop). Animer seulement `opacity`, `transform`, jamais `frame`.
13. **Cleanup strict on `.onDisappear`** :
    - `.inline` : pause + retire de SharedManager si `activeURL == fileUrl`.
    - `.flat` : pause + détacher (le caller décide si on garde le player pour resume rapide via `@StateObject`).
    - `.fullscreen` : pause + report watch progress + remove observer.
14. **Thumbnail extract async** (pour `MeeshyVideoThumbnail` sans URL thumb) : `AVAssetImageGenerator.generateCGImageAsynchronously(for: time:)` (iOS 16+), cache résultat dans `CacheCoordinator.images` keyed by `videoURL+t0`.
15. **`MeeshyVideoSurface.updateUIView`** ne recrée jamais le `AVPlayerLayer` ; juste compare par référence et update.
16. **No layout thrashing** : `MeeshyVideoPlayer` mesure son frame via `aspectRatio(videoRatio, .fit)` + `.frame(maxHeight:)`. Une seule passe de layout par re-render.
17. **State machine playback explicite** dans `_VideoPlaybackController: ObservableObject` propre à `MeeshyVideoPlayer` :
    ```swift
    enum PlaybackState { case idle, buffering, playing, paused, ended, error(Error) }
    @Published var state: PlaybackState = .idle
    ```
    Pas de propriété calculée qui interroge `player.timeControlStatus` à chaque body re-eval (coût KVO).
18. **HapticFeedback** sur tap play / expand / save : 1 ms latency perçue gain.
19. **Pour scrubber fullscreen** : `isScrubbing` state bloque l'updater de time observer pendant le drag → pas de jump back-and-forth.
20. **`MeeshyVideoSurface` `isOpaque = true`** sur la UIView host. Réduit la composition cost CA.

## 6. Aspect ratio adaptatif (résout le bug initial)

Helper partagé pur et testable :

```swift
public extension MeeshyMessageAttachment {
    /// Ratio width/height de la vidéo ; nil si dimensions inconnues.
    var videoAspectRatio: CGFloat? {
        guard let w = width, let h = height, w > 0, h > 0 else { return nil }
        return CGFloat(w) / CGFloat(h)
    }
    /// Hauteur cible pour une largeur donnée, plafonnée à `maxRatio × width`.
    /// Fallback 16:9 si dimensions inconnues.
    func videoHeight(forWidth width: CGFloat, maxRatio: CGFloat = 1.6) -> CGFloat {
        let ratio = videoAspectRatio ?? (16.0 / 9.0)
        return min(width / ratio, width * maxRatio)
    }
}
```

`MeeshyVideoPlayer` applique automatiquement `aspectRatio(attachment.videoAspectRatio, contentMode: .fit)` + `.frame(maxHeight: frame.maxAspectRatio.map { width * $0 })` quand un parent lui fixe une largeur.

**Conséquence pour la bulle message** : la grille solo vidéo n'impose plus `height: 200`. La hauteur est `width × min(1/ratio, 1.6)`. Portrait 9:16 → height = `width × 1.6` (cap), paysage 16:9 → height = `width × 9/16 ≈ 0.56 × width`, carré 1:1 → height = `width`.

## 7. Mapping des call sites

### Tableau de migration

| Site (avant) | Composant avant | Composant après | Style | Controls | Frame | Perf |
|---|---|---|---|---|---|---|
| `ThemedMessageBubble+Media.swift:271` (bubble grille solo vidéo) | `VideoMediaView` | `VideoAvailabilityResolver { MeeshyVideoPlayer }` | `.inline` | `.inlineDefault` | `.bubble` | `.inline` |
| `ThemedMessageBubble+Media.swift:729` (carousel slide vidéo) | `VideoMediaView` | `VideoAvailabilityResolver { MeeshyVideoPlayer }` | `.inline` | `.inlineDefault` | `.bubble` | `.carousel` |
| `BubbleStandardLayout` fullscreen sheet | `GatedVideoFullscreenPlayer` | `VideoAvailabilityResolver { MeeshyVideoPlayer }` | `.fullscreen` | `.fullscreenDefault` | `.flat` | `.fullscreen` |
| `FeedPostCard+Media.swift:236` (feed post vidéo) | `VideoMediaView` | `VideoAvailabilityResolver { MeeshyVideoPlayer }` | `.inline` | `.inlineDefault` | `.card` | `.inline` |
| `PostDetailView.swift:983` (post detail vidéo) | `VideoMediaView` | `VideoAvailabilityResolver { MeeshyVideoPlayer }` | `.inline` | `.inlineDefault` | `.card` | `.inline` |
| Post detail fullscreen sheet | `GatedVideoFullscreenPlayer` | `VideoAvailabilityResolver { MeeshyVideoPlayer }` | `.fullscreen` | `.fullscreenDefault` | `.flat` | `.fullscreen` |
| Reply quoted chip (zone reply visual) | hardcoded thumbnail | `MeeshyVideoPlayer` | `.mini` | `.miniDefault` | `.mini` | `.mini` |
| Composer attachment preview (poste + message) | hardcoded | `MeeshyVideoPlayer` | `.mini` | `.miniDefault` | `.mini` | `.mini` |
| Story composer foreground media (canvas) | `StoryMediaLayer` (avec son propre AVPlayer) | `StoryMediaLayer` composant `MeeshyVideoCanvasLayer` | n/a (CALayer) | n/a | n/a | n/a |
| Story composer background (canvas) | `StoryBackgroundLayer` (avec son propre AVPlayer) | `StoryBackgroundLayer` composant `MeeshyVideoCanvasLayer` | n/a (CALayer) | n/a | n/a | n/a |
| Story reader/viewer background (canvas) | idem ↑ | idem ↑ | n/a | n/a | n/a | n/a |
| Story reader/viewer foreground (canvas) | idem ↑ | idem ↑ | n/a | n/a | n/a | n/a |
| Story foreground PREVIEW hors canvas (picker, etc.) | `StoryVideoPlayerView` | `MeeshyVideoPlayer` | `.flat` | `.none` | `.flat` | `.flat` |
| Carousel poste (multi-attachments) | hardcoded ou `VideoMediaView` | `VideoAvailabilityResolver { MeeshyVideoPlayer }` | `.inline` | `.inlineDefault` | `.card` | `.carousel` |
| Search results vidéo | `VideoThumbnailView` | `MeeshyVideoThumbnail` | n/a | n/a | n/a | n/a |
| Grille profile media | `VideoThumbnailView` | `MeeshyVideoThumbnail` | n/a | n/a | n/a | n/a |
| Attachment manifest (4+ items) overflow tile | `VideoThumbnailView` | `MeeshyVideoThumbnail` | n/a | n/a | n/a | n/a |

### Fichiers supprimés

| Fichier | Lignes |
|---|---|
| `apps/ios/Meeshy/Features/Main/Views/VideoMediaView.swift` | 140 |
| `packages/MeeshySDK/Sources/MeeshyUI/Media/InlineVideoPlayerView.swift` | 312 |
| `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoPlayerView.swift` | 447 |
| `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoFullscreenPlayerView.swift` | 665 |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryVideoPlayerView.swift` | 195 |
| `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoPlayerOverlayControls.swift` | 257 (fusionné en sous-vue privée) |

**Total supprimé** : ~2 016 lignes.
**Ajouté** (estimé) : ~900 lignes (`MeeshyVideoPlayer` + atomes + helper + thumbnail).
**Net** : ~-1 100 lignes, **1 composant à apprendre au lieu de 9**.

`VideoThumbnailView.swift` est **renommé** `MeeshyVideoThumbnail.swift` (git mv), pas supprimé.

## 8. Plan d'implémentation (5 phases incrémentales)

Chaque phase merge isolément ; app build vert à chaque étape.

### Phase 1 — Atomes partagés (3-4h)

- `MeeshyVideoSurface` (SwiftUI atom, UIViewRepresentable).
- `MeeshyVideoCanvasLayer` (CALayer subclass).
- `_VideoPlaybackController` (ObservableObject privé).

**Tests** :
- `MeeshyVideoSurfaceTests.updateUIView_sameInputs_doesNotRecreateLayer()`
- `MeeshyVideoSurfaceTests.updateUIView_gravityChange_updatesLayer()`
- `MeeshyVideoCanvasLayerTests.attach_then_detach_releasesObservers()`
- `MeeshyVideoCanvasLayerTests.attach_loopsTrue_createsLooper()`
- `MeeshyVideoCanvasLayerTests.play_callsPlayImmediately()`
- `VideoPlaybackControllerTests.stateTransitions_idleToBufferingToPlaying()`
- `VideoPlaybackControllerTests.error_setsErrorState()`

### Phase 2 — `MeeshyVideoPlayer` et `MeeshyVideoThumbnail` (1-2j)

- Implémente les 4 styles + ControlSet + Frame + PerformanceOptions.
- Sous-vues privées : `_FlatRenderer`, `_InlineRenderer`, `_MiniRenderer`, `_FullscreenRenderer`. Chaque sous-vue Equatable.
- Sous-vue privée `_OverlayControlsBar` (ex `VideoPlayerOverlayControls`).
- `MeeshyVideoThumbnail` enrichi (badges optionnels, `AVAssetImageGenerator` async fallback).
- Helper `MeeshyMessageAttachment.videoHeight(forWidth:maxRatio:)`.

**Tests** :
- `MeeshyMessageAttachment_VideoSizingTests` :
  - `videoHeight_forLandscape16x9_returnsWidthOver1_78()`
  - `videoHeight_forPortrait9x16_capsAt1_6Width()`
  - `videoHeight_forSquare1x1_returnsWidth()`
  - `videoHeight_forMissingDimensions_returnsWidthOver16x9()`
- `MeeshyVideoPlayer_ControlSetTests` :
  - `inlineDefault_includesPlayPauseScrubberDurationExpand()`
  - `fullscreenDefault_includesSaveShareCloseSpeedAuthor()`
  - `miniDefault_includesOnlyDuration()`
- `MeeshyVideoPlayer_SnapshotTests` (SnapshotTesting) :
  - 4 styles × 3 ratios (16:9, 9:16, 1:1) × 2 themes (light/dark) = 24 baselines.
- `MeeshyVideoThumbnail_Tests` :
  - `thumbnail_withCachedImage_rendersImage()`
  - `thumbnail_noURL_extractsFirstFrame()`
  - `thumbnail_failedExtract_fallsBackToColor()`
  - `thumbnail_onTap_firesCallback()`

### Phase 3 — `VideoAvailabilityResolver` (4h)

- View wrapper qui résout `availability` via `CacheCoordinator.video.isCached` + `AttachmentDownloader` + `MediaDownloadPolicyEngine`.

**Tests** :
- `VideoAvailabilityResolverTests.resolve_localFile_returnsReady()`
- `VideoAvailabilityResolverTests.resolve_cached_returnsReady()`
- `VideoAvailabilityResolverTests.resolve_uncached_returnsNeedsDownload()`
- `VideoAvailabilityResolverTests.autoDownload_whenPolicyAllows_fires()`
- `VideoAvailabilityResolverTests.autoDownload_whenPolicyDenies_doesNotFire()`
- `VideoAvailabilityResolverTests.disappear_cleansDownloader()`

### Phase 4 — Migration des call sites (1-2j, lots indépendants)

Lots indépendants, build vert entre chaque :

**Lot 4a** : Bulle message (grille solo + carousel) — remplace `VideoMediaView` calls dans `ThemedMessageBubble+Media.swift`. **Fix simultanément le bug "hauteur fixe 200pt squashe la vidéo"** (objet initial du sprint). Test de non-régression : portrait 9:16 dans bulle solo doit avoir `height ≈ width × 1.6`, paysage 16:9 doit avoir `height ≈ width × 0.56`.

**Lot 4b** : FeedPostCard + PostDetailView — remplace `VideoMediaView` + `GatedVideoFullscreenPlayer`. Retire `minHeight: 180, maxHeight: 280` du Feed.

**Lot 4c** : Reply chip + Composer attachment preview — `MeeshyVideoPlayer(style: .mini)`. Cartographie préalable des sites nécessaire (à faire en amont du lot).

**Lot 4d** : Story canvas — `StoryMediaLayer` et `StoryBackgroundLayer` composent `MeeshyVideoCanvasLayer` en interne. Garde leur API publique inchangée. **Risque le plus élevé** : smoke test composer + reader obligatoire avant merge.

**Lot 4e** : Story picker/preview SwiftUI hors canvas — `MeeshyVideoPlayer(style: .flat)` remplace `StoryVideoPlayerView`.

**Lot 4f** : Search results, profile media grid — `MeeshyVideoThumbnail` remplace `VideoThumbnailView`.

### Phase 5 — Suppression et cleanup (1-2h)

- Supprime `InlineVideoPlayerView.swift`, `VideoPlayerView.swift`, `VideoFullscreenPlayerView.swift`, `StoryVideoPlayerView.swift`, `VideoMediaView.swift`, `GatedVideoFullscreenPlayer` struct, `VideoPlayerOverlayControls.swift`.
- Supprime entries pbxproj des fichiers supprimés.
- `VideoThumbnailView.swift` → `git mv` vers `MeeshyVideoThumbnail.swift`.
- Update tous les imports.
- Run `./apps/ios/meeshy.sh build` clean depuis main pour catch les erreurs.
- Run suite tests SDK + app : `xcodebuild test -scheme MeeshySDK-Package` + `./apps/ios/meeshy.sh test`.

**Durée totale estimée** : 3-4j développeur, ou ~6j en mode TDD strict avec snapshots re-recorded.

## 9. Tests d'intégration

- **Bubble carousel** : swipe entre slides vidéo, pas de glitch, AVPlayer N+1 préchargé.
- **Bubble grille solo portrait + paysage** : hauteur change selon ratio source, plus de squash.
- **Story canvas** : attacher `MeeshyVideoCanvasLayer` comme sublayer, vérifier que loop tourne sans flash, detach propre. Composer/reader smoke test complet.
- **Fullscreen sheet** : open from inline, scrub fluide, save to Photos succès.
- **Reply chip** : tap → ouvre parent message.
- **Composer preview** : ajout/retrait vidéo → preview mini change instantanément.

## 10. Tests manuels smoke (post-phase 5)

Sur iPhone 16 Pro simulator + device réel :
- Chaque site (bubble, carousel, feed, post detail, story composer, story reader, reply, composer, fullscreen) avec :
  - 1 vidéo portrait 9:16.
  - 1 vidéo paysage 16:9.
  - 1 vidéo carrée 1:1.
- Profile avec Instruments :
  - Time Profiler pendant scroll + swipe carousel (zero dropped frames cible).
  - Allocations (no leak entre 10 ouvertures/fermetures de fullscreen).
  - Core Animation FPS (60fps stable sur scroll list).
- Memory : décodeurs HW AVPlayer ≤4 simultanés.

## 11. Risques + mitigations

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Story canvas : factorisation `MeeshyVideoCanvasLayer` casse les effects (backdrop blur MPS, filters) de `StoryMediaLayer`/`StoryBackgroundLayer` | Moyenne | Élevé | Phase 4d en dernier. Conserver structure des layers existants. `MeeshyVideoCanvasLayer` ajoutée comme sublayer interne sans toucher aux autres sublayers. Smoke test canvas (composer + reader) obligatoire avant merge. |
| Tap-to-play latence > 100ms sur device réel | Moyenne | Moyen | Profile avec Instruments avant merge. Ajuster `preferredForwardBufferDuration` si besoin. Vérifier que `playImmediately` est bien appelé. |
| Pool AVPlayer carousel dépasse 4 décodeurs HW | Faible | Élevé | Limit explicite : seulement les 3 slides visibles (current ± 1) ont AVPlayer instancié. Au-delà → `MeeshyVideoThumbnail` static. |
| `SharedAVPlayerManager` interfère avec fullscreen | Faible | Moyen | `.fullscreen` instancie son propre AVPlayer (perf preset). Quand fullscreen apparaît, pause SharedManager. |
| Régression snapshot tests | Élevée | Faible | Re-record explicite des snapshots après chaque phase. Review visuelle obligatoire dans le PR. |
| Reply chip et composer preview sans behavior unifié → besoin de découvrir les usages | Moyenne | Faible | Cartographie en amont du Lot 4c. Si pas de site clair, lot reporté en post-launch (pas bloquant). |
| Build casse en milieu de migration | Faible | Élevé | Chaque phase keep ancien + nouveau côte à côte jusqu'à phase 5 cleanup. Build vert obligatoire entre chaque lot. |
| iOS 16 vs 18 différences d'AVPlayer behavior | Faible | Moyen | Code cible iOS 16+. `MeeshyVideoSurface` utilise APIs disponibles depuis iOS 13. `AVAssetImageGenerator.generateCGImageAsynchronously` requiert iOS 16 → OK. Tests sur iOS 16 (minimum) et iOS 18 (cible). |
| Régression non-détectée du fix "hauteur fixe 200" | Moyenne | Élevé | Test snapshot dédié au Lot 4a : portrait/paysage/carré dans bulle solo + carousel. Smoke manuel obligatoire. |

## 12. Hors scope explicite

- `MeeshyVideoEditorView` (éditeur trim, captions, filters, keyframes) — reste indépendant.
- `MeeshyAudioPlayerView` — audio uniquement, non couvert.
- Pipeline d'export Story MP4 (`StoryVideoExportService`, `StoryExporter`) — reste indépendant.
- HLS / DASH adaptation côté backend — hors scope iOS.
- PIP (Picture-in-Picture) — déjà géré par `SharedAVPlayerManager`, pas modifié.

## 13. Dépendances

- iOS 16+ (déjà cible app).
- `MeeshySDK.MediaDownloadPolicyEngine`, `MediaDownloadPreferencesStore`, `NetworkConditionMonitor`, `AttachmentDownloader`, `CacheCoordinator`, `MeeshyConfig.resolveMediaURL`, `SharedAVPlayerManager`, `PhotoLibraryManager` — tous existants.
- `MeeshyMessageAttachment.width/height/durationFormatted/thumbnailUrl/thumbHash/thumbnailColor` — déjà disponibles.
- `VideoAvailability` enum — existant dans MediaTypes.swift.
