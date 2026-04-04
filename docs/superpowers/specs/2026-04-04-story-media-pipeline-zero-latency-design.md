# Story Media Pipeline — Zero Latency Design

## Objectif

Eliminer toute latence percue lors du chargement, affichage et interaction avec les medias (images, videos, audio) dans le Story Composer, Story Viewer et Feed. Pattern cible : poster frame instantane → video prerolled seamless.

## Problemes actuels

| # | Probleme | Impact | Freeze UI |
|---|----------|--------|-----------|
| 1 | `UIImage(data:)` synchrone main thread | Gel 100-500ms | Critique |
| 2 | Pas de downsampling — full-res 8-12MP en memoire | 80-200MB RAM | Critique |
| 3 | `generateVideoThumbnail()` synchrone main thread | Gel 500-1000ms | Critique |
| 4 | CIFilter recalcule a chaque render, pas de cache | CPU spike | Important |
| 5 | `VideoPlayer(player:)` SwiftUI — pas de preroll | Latence lecture | Important |
| 6 | Pas de cleanup fichiers temp ni gestion memoire | 500MB+ leak | Important |
| 7 | Pas de preload stories/feed | Ecran noir au swipe | Critique UX |
| 8 | Pas de poster frame → live video transition | Ecran noir pendant buffer | Critique UX |

## Design

### 1. StoryMediaLoader — Module centralise de chargement

**Fichier** : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryMediaLoader.swift` (NOUVEAU)

Actor singleton responsable du chargement et downsampling de tous les medias.

```swift
@MainActor
final class StoryMediaLoader {
    static let shared = StoryMediaLoader()

    // Downsample image via ImageIO (hardware-accelerated, zero-copy)
    func loadImage(data: Data, maxDimension: CGFloat = 1080) async -> UIImage?

    // Downsample image from PhotosPickerItem
    func loadImage(from item: PhotosPickerItem, maxDimension: CGFloat = 1080) async -> UIImage?

    // Extract first frame async + cache
    func videoThumbnail(url: URL, maxDimension: CGFloat = 400) async -> UIImage?

    // Preload video player with preroll
    func preloadVideoPlayer(url: URL) async -> AVPlayer
}
```

**Implementation cle — ImageIO downsampling :**
```swift
func downsample(data: Data, maxDimension: CGFloat) -> UIImage? {
    let options: [CFString: Any] = [
        kCGImageSourceShouldCache: false  // pas de cache systeme, on gere
    ]
    guard let source = CGImageSourceCreateWithData(data as CFData, options as CFDictionary) else { return nil }

    let downsampleOptions: [CFString: Any] = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceShouldCacheImmediately: true,  // decode maintenant, pas au premier render
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: maxDimension
    ]
    guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, downsampleOptions as CFDictionary) else { return nil }
    return UIImage(cgImage: cgImage)
}
```

**Avantages ImageIO vs UIImage(data:) :**
- Hardware-accelerated (GPU decode sur les SoC Apple)
- Downsampling PENDANT le decode (pas apres — economise 90% memoire)
- `kCGImageSourceShouldCacheImmediately` force le decode maintenant, pas au premier affichage

### 2. StoryVideoPlayerView — AVPlayerLayer natif

**Fichier** : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryVideoPlayerView.swift` (NOUVEAU)

UIViewRepresentable wrappant AVPlayerLayer pour remplacer SwiftUI VideoPlayer.

**Architecture :**
```
StoryVideoPlayerView (SwiftUI)
  └── _VideoLayerView (UIView)
        └── AVPlayerLayer
              └── AVPlayer (prerolled)
```

**Features :**
- `posterImage: UIImage?` — affichee instantanement pendant le buffer
- `preroll: Bool = true` — preroll automatique a la creation
- Looping via `AVPlayerLooper` (pas NotificationCenter)
- Transition seamless poster → video via opacity animation
- `player.currentItem?.preferredForwardBufferDuration = 2.0`

**Transition poster → video :**
```swift
// Observer KVO sur player.currentItem.status
if status == .readyToPlay {
    withAnimation(.easeIn(duration: 0.15)) {
        showPosterImage = false  // fade out poster, video underneath
    }
    player.play()
}
```

### 3. Cache filtres — NSCache

**Fichier** : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryFilterPicker.swift`

**Modification :**
```swift
private static let filterCache = NSCache<NSString, UIImage>()

static func apply(_ filter: StoryFilter?, to image: UIImage) -> UIImage {
    guard let filter else { return image }
    let key = "\(image.hash)_\(filter.rawValue)" as NSString
    if let cached = filterCache.object(forKey: key) { return cached }
    // ... CIFilter application ...
    filterCache.setObject(result, forKey: key)
    return result
}
```

Invalidation : NSCache s'auto-evicte sous pression memoire. Pas besoin de cleanup manuel.

### 4. Preload Pipeline — StoryPreloadManager

**Fichier** : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryPreloadManager.swift` (NOUVEAU)

**Role :** Precharger les medias des stories/slides N+1 et N+2 AVANT que l'utilisateur n'y arrive.

```swift
@MainActor
final class StoryPreloadManager {
    static let shared = StoryPreloadManager()

    // Pool de players prerolled (max 3 simultanes)
    private var playerPool: [String: AVPlayer] = [:]
    private var posterFrames: [String: UIImage] = [:]

    // Precharge les N prochaines stories d'un groupe
    func preloadStories(_ stories: [StoryItem], currentIndex: Int, count: Int = 2)

    // Recupere un player prerolled (ou en cree un nouveau si miss)
    func player(for url: URL) -> AVPlayer

    // Recupere la poster frame cachee
    func posterFrame(for url: URL) -> UIImage?

    // Libere les resources des stories passees
    func evictBefore(index: Int)
}
```

**Lifecycle preload :**
1. Utilisateur ouvre story index N
2. `preloadStories(stories, currentIndex: N, count: 2)` → precharge N+1, N+2
3. Pour chaque story avec video :
   - Extract poster frame async → `posterFrames[url.absoluteString]`
   - Cree AVPlayer + preroll → `playerPool[url.absoluteString]`
4. Utilisateur swipe → story N+1 play() instantane (deja prerolled)
5. `evictBefore(index: N)` → libere player N-1

**Integration Story Viewer :**
```swift
// StoryViewerView.swift — onChange de currentStoryIndex
.onChange(of: currentStoryIndex) { _, newIndex in
    StoryPreloadManager.shared.preloadStories(
        currentGroup?.stories ?? [],
        currentIndex: newIndex,
        count: 2
    )
    StoryPreloadManager.shared.evictBefore(index: newIndex - 1)
}
```

**Integration Story Composer :**
```swift
// Quand l'utilisateur change de slide
.onChange(of: viewModel.currentSlideIndex) { _, newIndex in
    preloadAdjacentSlides(around: newIndex)
}
```

### 5. Refactoring StoryComposerView — Media Loading

**Fichier** : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`

**Avant (synchrone main thread) :**
```swift
func loadBackgroundPhoto(from item: PhotosPickerItem?) {
    guard let item else { return }
    Task {
        if let data = try? await item.loadTransferable(type: Data.self) {
            selectedImage = UIImage(data: data)  // ← SYNCHRONE MAIN THREAD
        }
    }
}
```

**Apres (async downsampled) :**
```swift
func loadBackgroundPhoto(from item: PhotosPickerItem?) {
    guard let item else { return }
    isLoadingMedia = true
    Task {
        let image = await StoryMediaLoader.shared.loadImage(from: item, maxDimension: 1080)
        selectedImage = image
        if let image { viewModel.slideImages[viewModel.currentSlide.id] = image }
        isLoadingMedia = false
    }
}
```

**Avant (thumbnail synchrone) :**
```swift
static func generateVideoThumbnail(url: URL) -> UIImage? {
    let asset = AVURLAsset(url: url)
    let generator = AVAssetImageGenerator(asset: asset)
    generator.maximumSize = CGSize(width: 400, height: 400)
    return try? UIImage(cgImage: generator.copyCGImage(at: .zero, actualTime: nil))
}
```

**Apres (async cached) :**
```swift
// Supprime la methode statique, utilise StoryMediaLoader
let thumbnail = await StoryMediaLoader.shared.videoThumbnail(url: tempURL, maxDimension: 400)
viewModel.loadedImages[objId] = thumbnail
```

### 6. DraggableMediaView — Integration StoryVideoPlayerView

**Fichier** : `packages/MeeshySDK/Sources/MeeshyUI/Story/DraggableMediaView.swift`

**Avant :**
```swift
VideoPlayer(player: internalPlayer)
    .disabled(true)
```

**Apres :**
```swift
StoryVideoPlayerView(
    url: videoURL,
    posterImage: viewModel.loadedImages[element.id],
    preroll: true,
    loop: true
)
```

### 7. Cleanup & Memory Pressure

**Fichier** : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift`

**Ajouts :**
```swift
private var memoryObserver: Any?

func startMemoryObserver() {
    memoryObserver = NotificationCenter.default.addObserver(
        forName: UIApplication.didReceiveMemoryWarningNotification,
        object: nil, queue: .main
    ) { [weak self] _ in
        self?.evictNonVisibleSlideMedia()
    }
}

func evictNonVisibleSlideMedia() {
    for (index, slide) in slides.enumerated() where index != currentSlideIndex {
        slideImages.removeValue(forKey: slide.id)
    }
}

func cleanupTempFiles() {
    for (_, url) in loadedVideoURLs {
        try? FileManager.default.removeItem(at: url)
    }
    for (_, url) in loadedAudioURLs {
        try? FileManager.default.removeItem(at: url)
    }
}
```

## Fichiers concernes

| Fichier | Action |
|---------|--------|
| `StoryMediaLoader.swift` | CREER — ImageIO downsample, video thumbnail async |
| `StoryVideoPlayerView.swift` | CREER — AVPlayerLayer + poster frame + preroll |
| `StoryPreloadManager.swift` | CREER — Preload N+2, player pool, eviction |
| `StoryComposerView.swift` | MODIFIER — Utiliser StoryMediaLoader partout |
| `DraggableMediaView.swift` | MODIFIER — Remplacer VideoPlayer par StoryVideoPlayerView |
| `StoryFilterPicker.swift` | MODIFIER — Ajouter NSCache pour filtres |
| `StoryComposerViewModel.swift` | MODIFIER — Memory pressure + cleanup |
| `StoryViewerView.swift` | MODIFIER — Integrer StoryPreloadManager |

## Resultats attendus

| Metrique | Avant | Apres |
|----------|-------|-------|
| Temps affichage image | 100-500ms (freeze) | 0ms (background decode) |
| Temps thumbnail video | 500-1000ms (freeze) | 0ms (async + cache) |
| Temps premier frame video | 200-800ms (ecran noir) | 0ms (poster frame + preroll) |
| Filtre application | 500-2000ms (recalcul) | 0ms (cache hit) |
| RAM 10 slides 8MP | 80-200MB | 15-30MB |
| Fichiers temp | 500MB+ (jamais nettoyes) | Nettoyes a la fermeture |

## Hors scope

- Encoding/export video (gere par le backend apres upload)
- Streaming video depuis URL distante (les stories sont locales pendant l'edition)
- Metal custom shaders (CoreImage + ImageIO suffisent pour ce use case)
