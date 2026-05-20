# Stories Sprint — Vidéo / Couches / Texte — Design Spec

**Date** : 2026-05-20
**Statut** : Approuvé en brainstorming, revu par Opus, corrigé
**Auteur** : Claude (Opus 4.7) + J. Charles N. M.
**Scope** : `packages/MeeshySDK/Sources/MeeshyUI/Story/`, `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`
**Cible** : iOS 17.0+
**Pré-requis** : `2026-05-20-stories-audio-hotfix-design.md` mergé

## 1. Contexte

Trois douleurs UX distinctes dans le composer/reader Stories iOS, traitées dans le même sprint car elles touchent les mêmes fichiers (`StoryCanvasUIView`, `StoryMediaLayer`, `StoryComposerView`) :

| Axe | Symptômes utilisateur |
|-----|----------------------|
| **A — Vidéo / cache / ThumbHash** | Vidéo qui bloque, redémarre, scintille au début ; chaque ouverture re-télécharge le contenu pourtant en cache ; aucun ThumbHash placeholder de chargement |
| **B — Manipulation par couche** | Pinch/drag affectent à la fois le canvas et les médias indistinctement ; pas de verrouillage logique entre fond et premier plan |
| **C — Texte** | Texte créé trop petit pour être lisible ; placeholder peu engageant |

## 2. Axe A — Vidéo, cache, ThumbHash

### 2.1 Diagnostic root-cause

#### A.1 Cold-restart permanent du AVPlayer (P0)

`StoryCanvasUIView.displayLinkTick` (`packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift:1334-1349`) appelle `rebuildLayers()` à 60-120 Hz pendant la lecture. **Mais `StoryRendererCache` existe déjà** (`packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRendererCache.swift:40-118`) — la vraie root cause est que `StoryCanvasUIView.rebuildLayers` ne **passe pas** ce cache à `StoryRenderer.render(...)`. Conséquence : chaque appel construit un nouveau `StoryMediaLayer()` + nouveau `AVPlayer(url:).play()`.

Limitation actuelle du `StoryRendererCache.ItemSignature` : il keye sur position/scale/rotation/opacity/visible/languages **mais pas sur le contenu** (`postMediaId`, `text`, `emoji`). Si on partage le cache live composer, des changements de contenu ne re-rendraient pas. À étendre.

#### A.2 Cache vidéo contourné (P0)

`StoryBackgroundLayer.swift:167-189` consulte synchronement `CacheCoordinator.videoLocalFileURL(for:)`. Si cache miss, on lance `Task { data(for:) }` en arrière-plan mais **on retourne immédiatement l'URL HTTP distante** au lecteur → stream sauvage. La prochaine visite subit aussi A.1.

#### A.3 ThumbHash absent en placeholder foreground (P1)

- `StorySlide.thumbHash: String?` existe (composé de la slide entière)
- Utilisé uniquement par `StoryBackgroundLayer` pour pre-render le **fond**
- `StoryMediaObject` (média foreground) **n'a pas de champ `thumbHash`** → aucun placeholder pendant chargement
- Auteur voit un carré vide pendant le fetch

#### A.4 Sources de flicker résiduelles (P2)

- `updateSnapGuides` recrée des `CAShapeLayer` à chaque tick sans `CATransaction.setDisableActions`
- `bringForegroundToFront` mute zIndex sans `CATransaction`
- Boucle double-mutation `onItemModified` → `DispatchQueue.main.async` → `updateUIView` → `uiView.slide = slide` ré-entre dans `didSet` ; cependant `didSet` court-circuite déjà via `manipulatedItemId != nil`. Le risque réel : un re-render parent SwiftUI imbriqué peut arriver avec `manipulatedItemId == nil` (gesture .ended/timing race) et déclencher `rebuildLayers()`. La garde la plus propre est au niveau du `StoryCanvasRepresentable.updateUIView`.

### 2.2 Fix A.1 — Étendre `StoryRendererCache` et le passer à `rebuildLayers`

**Pas de nouveau cache parallèle.** On étend l'existant :

```swift
// packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRendererCache.swift
struct ItemSignature: Hashable, Sendable {
    let id: String
    let kind: ItemKind  // existing
    // existing geometry fields
    let x: Double
    let y: Double
    let scale: Double
    let rotation: Double
    let opacity: Double
    let visible: Bool
    let zIndex: Int
    let languages: String  // joined preferred languages

    // NEW — content fingerprint to invalidate when content changes
    let mediaPostMediaId: String?  // for .media
    let textContent: String?       // for .text (already-resolved Prisme)
    let stickerEmoji: String?      // for .sticker
}
```

Dans `StoryCanvasUIView.swift` :

```swift
private var rendererCache = StoryRendererCache()
```

`rebuildLayers()` ligne ~816 : passer `cache: rendererCache` à `StoryRenderer.render(...)`. La signature de `StoryRenderer.render` accepte déjà un `cache:` optionnel (utilisé par `StoryAVCompositor` ligne 37).

À la fin de chaque `rebuildLayers()`, après l'itération, le cache élimine les entrées dont l'ID n'apparaît plus dans la slide (méthode `prune(ids: Set<String>)` à ajouter — éviction propre des `AVPlayer.pause()` + `removeAllObservers`).

**Critère de succès** : 2 `rebuildLayers()` consécutifs sans changement de contenu → `mediaLayer.avPlayerLayer?.player` reste identique (vérifié en integration test).

### 2.3 Fix A.2 — Cache respecté avant playback

`StoryMediaLayer.configureVideo` ré-architecturé. Trois points à respecter :

1. `avPlayer` est déclaré `weak var` (ligne 46) — le strong path passe par `avPlayerLayer?.player`.
2. Si l'URL change pendant le chargement, annuler la Task précédente (`currentVideoLoadTask`).
3. Ne `play()` qu'après cache local garanti.

```swift
private var currentVideoLoadTask: Task<Void, Never>?

@MainActor
private func configureVideo(_ media: StoryMediaObject,
                            mode: RenderMode,
                            resolver: (@Sendable (String) -> URL?)?) {
    guard let remoteURL = resolvedMediaURL(for: media, resolver: resolver) else { return }
    applyThumbHashPlaceholder(media.thumbHash)
    currentVideoLoadTask?.cancel()
    currentVideoLoadTask = Task { @MainActor [weak self] in
        guard let self else { return }
        guard let localURL = await Self.resolveLocalFileURL(remote: remoteURL) else {
            os.Logger.story.error("Video resolve failed: \(remoteURL.absoluteString, privacy: .public)")
            return
        }
        if Task.isCancelled { return }
        let asset = AVURLAsset(url: localURL)
        let item = AVPlayerItem(asset: asset)
        item.preferredForwardBufferDuration = 2.0
        if let existingPlayer = self.avPlayerLayer?.player {
            existingPlayer.replaceCurrentItem(with: item)
        } else {
            let player = AVPlayer(playerItem: item)
            let playerLayer = AVPlayerLayer(player: player)
            playerLayer.frame = self.bounds
            playerLayer.videoGravity = .resizeAspectFill
            self.avPlayerLayer = playerLayer
            self.avPlayer = player
            self.addSublayer(playerLayer)
        }
        await self.waitForReadyToPlay(timeout: 3.0)
        if Task.isCancelled { return }
        self.fadeOutPlaceholder(duration: 0.2)
        if mode == .play { self.avPlayerLayer?.player?.play() }
    }
}

private static func resolveLocalFileURL(remote: URL) async -> URL? {
    if remote.isFileURL { return remote }
    if let cached = CacheCoordinator.videoLocalFileURL(for: remote.absoluteString) {
        return cached
    }
    _ = try? await CacheCoordinator.shared.video.data(for: remote.absoluteString)
    return CacheCoordinator.videoLocalFileURL(for: remote.absoluteString)
}
```

`waitForReadyToPlay` observe `AVPlayerItem.status` via `NSKeyValueObservation` ; timeout 3s ; fallback play même si pas ready (best-effort).

**`StoryBackgroundLayer.swift:167-189`** : appliquer le même pattern (cache-first avant `AVPlayer`).

### 2.4 Fix A.3 — ThumbHash sur média foreground

#### Modèle

`packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` — `StoryMediaObject` :

```swift
/// ThumbHash du contenu (première frame pour vidéo, image pour image).
/// Généré au publish, utilisé comme placeholder pendant le fetch.
public var thumbHash: String?
```

Décodage tolère l'absence (default `nil` — back-compat).

#### Génération au publish — cascade async documentée

`StoryComposerView.snapshotAllSlides()` (`StoryComposerView.swift:1561`) devient **async** :

```swift
private func snapshotAllSlides() async -> (slides: [StorySlide], bgImages: [String: UIImage]) {
    var slides = viewModel.slides
    for i in slides.indices {
        let bgImage = viewModel.slideImages[slides[i].id]
        slides[i].effects.thumbHash = StorySlideRenderer.computeThumbHash(
            slide: slides[i], bgImage: bgImage, loadedImages: viewModel.loadedImages
        )
        // ThumbHash per-media foreground (parallélisé avec TaskGroup)
        if let mediaIndices = slides[i].effects.mediaObjects?.indices {
            await withTaskGroup(of: (Int, String?).self) { group in
                for idx in mediaIndices where slides[i].effects.mediaObjects?[idx].thumbHash == nil {
                    let media = slides[i].effects.mediaObjects![idx]
                    group.addTask { [weak viewModel] in
                        let hash = await Self.computeMediaThumbHash(
                            media: media, resolver: viewModel?.resolveMediaURLClosure
                        )
                        return (idx, hash)
                    }
                }
                for await (idx, hash) in group {
                    slides[i].effects.mediaObjects?[idx].thumbHash = hash
                }
            }
        }
    }
    return (slides, viewModel.slideImages)
}

private static func computeMediaThumbHash(
    media: StoryMediaObject,
    resolver: ((StoryMediaObject) -> URL?)?
) async -> String? {
    guard let url = resolver?(media) else { return nil }
    switch media.kind {
    case .image:
        guard let img = await loadImage(from: url) else { return nil }
        return img.toThumbHash()
    case .video:
        let asset = AVURLAsset(url: url)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 100, height: 100)
        let time = CMTime(seconds: 0.1, preferredTimescale: 600)
        // iOS 17+ async API
        guard let cgImage = try? await generator.image(at: time).image else { return nil }
        return UIImage(cgImage: cgImage).toThumbHash()
    default:
        return nil  // sticker / audio → no thumbHash
    }
}
```

#### Cascade async côté `publishAllSlides`

`publishAllSlides()` (`StoryComposerView.swift:1553`) doit aussi devenir async ou wrappé dans une `Task`. Le `Button { publishAllSlides() }` (ligne 624) wrap dans une `Task` + `@State private var isPublishing = false` :

```swift
@State private var isPublishing: Bool = false

Button {
    Task { @MainActor in
        isPublishing = true
        defer { isPublishing = false }
        await publishAllSlides()
    }
} label: {
    if isPublishing { ProgressView() } else { Text("Publier") }
}
.disabled(isPublishing)
```

Cap parallélisme : `TaskGroup` traite les médias d'une slide en parallèle, mais les slides séquentiellement. Timeout par média : 5 s (via `withTimeout(_:)` helper, sinon hash `nil` et on continue). Pour ≤ 10 médias par slide, l'overhead reste sous 2-3s en pratique.

**UX** : bouton désactivé pendant le compute, spinner visible. Si l'utilisateur dismiss pendant le compute, la `Task` est annulée (capture `isPublishing` via `@State`).

#### Consommation côté lecture

`StoryMediaLayer.applyThumbHashPlaceholder` :

```swift
private var placeholderLayer: CALayer?

private func applyThumbHashPlaceholder(_ hash: String?) {
    placeholderLayer?.removeFromSuperlayer()
    placeholderLayer = nil
    guard let hash, let img = ThumbHashDecoder.decodeIfAvailable(hash) else { return }
    let placeholder = CALayer()
    placeholder.frame = bounds
    placeholder.contents = img.cgImage
    placeholder.contentsGravity = .resizeAspectFill
    placeholderLayer = placeholder
    insertSublayer(placeholder, at: 0)
}

override public func layoutSublayers() {
    super.layoutSublayers()
    placeholderLayer?.frame = bounds  // suivre les changements de bounds
}

private func fadeOutPlaceholder(duration: TimeInterval) {
    guard let layer = placeholderLayer else { return }
    CATransaction.begin()
    CATransaction.setAnimationDuration(duration)
    CATransaction.setCompletionBlock { [weak self] in
        self?.placeholderLayer?.removeFromSuperlayer()
        self?.placeholderLayer = nil
    }
    layer.opacity = 0
    CATransaction.commit()
}
```

### 2.5 Fix A.4 — Anti-flicker gesture

#### A.4.a Snap guides en CATransaction

```swift
private func updateSnapGuides(x: Double?, y: Double?) {
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    hideSnapGuides()
    // create new guides
    CATransaction.commit()
}
```

#### A.4.b bringForegroundToFront en CATransaction

```swift
private func bringForegroundToFront(id: String) {
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    // reorder sublayers
    CATransaction.commit()
}
```

#### A.4.c Skip sync SwiftUI via property publique `isGestureActive`

`StoryCanvasUIView.swift` — exposition d'un computed read-only :

```swift
/// `true` quand un gesture pan/pinch/rotate est en cours sur un item.
/// Indique au parent SwiftUI que la vérité de `slide` est temporairement
/// dans UIKit ; les mutations parent doivent être différées.
public var isGestureActive: Bool { manipulatedItemId != nil }
```

`StoryCanvasRepresentable.updateUIView` ajoute la garde :

```swift
public func updateUIView(_ uiView: StoryCanvasUIView, context: Context) {
    if uiView.isGestureActive {
        // Gesture actif → UIKit est la source de vérité. À l'`.ended`,
        // l'`onItemModified` callback va resync le parent et un futur
        // `updateUIView` propre arrivera avec `isGestureActive == false`.
        return
    }
    if !Self.slidesEqualForCanvas(uiView.slide, slide) {
        uiView.slide = slide
    }
}
```

**Note sur mutations légitimes via toolbar** : si l'utilisateur change un filtre via la toolbar pendant un drag (rare), la mutation parent est skippée. À la fin du gesture (`onItemModified`), le callback renvoie le slide à jour avec la position finale ; le diff incrémental SwiftUI inclura aussi le filtre changé, et le prochain `updateUIView` (gesture nil) re-pousse tout. Acceptable trade-off.

## 3. Axe B — Manipulation par couche (verrouillage en cascade)

### 3.1 Modèle des 3 couches

```swift
public enum CanvasManipulationLayer: String, Sendable {
    case canvas       // aucun média ni élément → pas de manipulation autorisée
    case background   // 1 bg posé, pas de fg → manipulation du bg
    case foreground   // ≥ 1 fg posé → manipulation du fg sous le doigt
}
```

**Décision corrective** : pas de pan/zoom du canvas root en mode `.canvas` dans ce sprint. Le transform ne peut pas être persisté en l'état actuel (pas de champ `effects.canvasTransform`), donc serait éphémère et casserait l'export `StoryAVCompositor`. Reporté en out of scope (cf. § 9). En mode `.canvas`, les gestures sont **absorbés silencieusement** (recognizer.state = .cancelled au .began).

### 3.2 Résolution de la couche active

À chaque `slide.didSet` (et au `viewDidLoad`), recalcul :

```swift
private var currentManipulationLayer: CanvasManipulationLayer = .canvas

private func updateManipulationLayer() {
    let hasBg = slide.effects.mediaObjects?.contains(where: { $0.isBackground }) ?? false
    let hasFg = (slide.effects.mediaObjects?.contains(where: { !$0.isBackground }) ?? false)
             || (slide.effects.textObjects?.isEmpty == false)
             || (slide.effects.stickerObjects?.isEmpty == false)
    let new: CanvasManipulationLayer = hasFg ? .foreground : (hasBg ? .background : .canvas)
    guard new != currentManipulationLayer else { return }
    currentManipulationLayer = new
    onManipulationLayerChanged?(new)
}
```

Textes et stickers comptent comme foreground (cohérent avec le modèle de couches).

### 3.3 Routage des gestures

`handlePan(.began)` réécrit :

```swift
@objc private func handlePan(_ recognizer: UIPanGestureRecognizer) {
    guard mode == .edit else { return }
    switch recognizer.state {
    case .began:
        switch currentManipulationLayer {
        case .canvas:
            recognizer.state = .cancelled
            return
        case .background:
            guard let bg = slide.effects.mediaObjects?.first(where: { $0.isBackground }) else {
                recognizer.state = .cancelled
                return
            }
            manipulatedItemId = bg.id
            captureBaseState(for: bg.id)
        case .foreground:
            let location = recognizer.location(in: self)
            guard let id = hitTestForegroundItem(at: location) else {
                // Tap sur vide ou sur bg en mode fg → absorbé
                recognizer.state = .cancelled
                return
            }
            manipulatedItemId = id
            bringForegroundToFront(id: id)
            captureBaseState(for: id)
        }
    case .changed:
        guard let id = manipulatedItemId else { return }
        // applique translation au target (bg ou fg item)
    case .ended, .cancelled, .failed:
        manipulatedItemId = nil
        hideSnapGuides()
        slideContentRevision &+= 1
        rebuildLayers()  // resync filtre + cleanup
    }
}
```

`hitTestForegroundItem(at:)` exclut explicitement les médias `isBackground == true`. **En mode `.foreground`, le bg et le canvas root sont gelés** : aucune transformation possible.

Routage identique pour `handlePinch` et `handleRotation`.

**Transition de couche pendant un gesture** : si l'utilisateur supprime via undo ou via le panneau le dernier élément manipulable pendant un drag (cas rare), au prochain `slide.didSet` `updateManipulationLayer()` est appelé ; si `currentManipulationLayer` change vers `.canvas` ou si l'item manipulé disparaît, `manipulatedItemId = nil` + `hideSnapGuides()` + `rebuildLayers()` (équivalent .cancelled).

### 3.4 Indicator visuel — Chip row non-tappable

Nouveau composant `CanvasLayerIndicator` dans `StoryComposerView`. **Pas de `Button`** — composition `HStack(Image, Text)` pour rester décoratif (accessible via `accessibilityLabel` seul, pas de zone tactile sans feedback).

```
┌────────────────────────────────────────────────┐
│ Édition :  ◷ Canvas   ◻ Fond   ✦ Premier      │
└────────────────────────────────────────────────┘
```

- 3 chips, actif highlighté indigo500 / outline grisé
- Hauteur 28 pt, padding latéraux, font caption2
- Fade in 200ms via `.animation(.easeInOut(duration: 0.2), value: layer)`
- SF Symbols : `circle.dashed` (canvas), `rectangle` (bg), `square.stack.3d.up` (fg)
- i18n : `story.canvas.layer.canvas`, `story.canvas.layer.background`, `story.canvas.layer.foreground`

## 4. Axe C — Texte (taille + placeholder)

### 4.1 Taille par défaut

`packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` — `StoryTextObject.init` :

```swift
public init(
    id: String = UUID().uuidString,
    text: String = "",
    fontSize: Double = 96.0,  // 64.0 → 96.0
    // ...
)
```

96 design pixels / 1080 ref × 390 pt écran (iPhone 14 régulier) ≈ **35 pt** rendu. Sur iPhone Pro Max (430pt) ≈ 38 pt. Sur iPad (834+pt) ≈ 74 pt — large, mais l'auteur peut redimensionner.

**Decoder fallback** : il faut aussi modifier le `fallback` dans le custom decoder de `StoryTextObject` (cf. `StoryModels.swift` ~ligne 338) — sinon des stories décodées sans `fontSize` resteront à 64. Migrer à 96 pour les nouveaux et garder 64 pour le decoder legacy (la rétro-compat l'exige : les stories anciennes ont déjà été créées avec fontSize=64 implicite).

Décision : le decoder **utilise 64 comme fallback** (préserve les stories existantes) ; seul l'init publique passe à 96 (nouveau texte créé).

### 4.2 Placeholder « Exprimez-vous… »

**Pas de modification SwiftUI** — `StoryInlineTextEditor` est une `UITextView` (UIKit). Le placeholder est déjà câblé via `placeholderLabel` (`StoryInlineTextEditor.swift:24-29`) qui lit `String(localized: "story.textEditor.placeholder", defaultValue: "Saisissez votre texte…", bundle: .module)`.

Deux modifications minimales :

1. **`Localizable.xcstrings`** : valeur de la clé `story.textEditor.placeholder` :
   - FR : « Exprimez-vous… »
   - EN : « Express yourself… »

2. **`StoryInlineTextEditor.swift:27`** : `defaultValue: "Exprimez-vous…"` (aligné avec le FR pour le fallback dev).

## 5. Fichiers modifiés (consolidé)

| Phase | Fichier | Changement |
|-------|---------|------------|
| A.1 | `Canvas/StoryRendererCache.swift` | Étendre `ItemSignature` (`mediaPostMediaId`, `textContent`, `stickerEmoji`) + `prune(ids:)` |
| A.1 | `Canvas/StoryCanvasUIView.swift` | `rendererCache` membre + passé à `StoryRenderer.render` dans `rebuildLayers()` |
| A.2 | `Canvas/Layers/StoryMediaLayer.swift` | `configureVideo` cache-first + `currentVideoLoadTask` cancel chain |
| A.2 | `Canvas/Layers/StoryBackgroundLayer.swift` | Même pattern cache-first pour vidéo de fond |
| A.3 | `Models/StoryModels.swift` | `StoryMediaObject.thumbHash: String?` (back-compat tolérante) |
| A.3 | `Story/StoryComposerView.swift` | `snapshotAllSlides` async + TaskGroup + `isPublishing` |
| A.3 | `Canvas/Layers/StoryMediaLayer.swift` | `applyThumbHashPlaceholder` + `fadeOutPlaceholder` |
| A.4 | `Canvas/StoryCanvasUIView.swift` | `CATransaction` autour de `updateSnapGuides` et `bringForegroundToFront` ; `isGestureActive: Bool` public computed |
| A.4 | `Canvas/StoryCanvasRepresentable.swift` | Skip sync si `uiView.isGestureActive` |
| B.1-3 | `Canvas/StoryCanvasUIView.swift` | `CanvasManipulationLayer` enum + routing gestures + transition guard |
| B.4 | `Story/StoryComposerView.swift` | Composant `CanvasLayerIndicator` (HStack non-tappable) |
| B.4 | `Resources/Localizable.xcstrings` | 3 clés `story.canvas.layer.*` |
| C.1 | `Models/StoryModels.swift` | `StoryTextObject.init` default `fontSize: Double = 96.0` (decoder fallback reste 64) |
| C.2 | `Resources/Localizable.xcstrings` | `story.textEditor.placeholder` → « Exprimez-vous… » / « Express yourself… » |
| C.2 | `Canvas/StoryInlineTextEditor.swift` | Ligne 27 : `defaultValue: "Exprimez-vous…"` |

## 6. Stratégie tests

### 6.1 Unit

- `StoryMediaObject.thumbHash` decode/encode + back-compat (absence du champ = nil)
- `StoryTextObject.fontSize` default = 96.0 via init publique ; decoder sans `fontSize` = 64.0
- `StoryRendererCache.ItemSignature` : changement de `mediaPostMediaId` → cache miss
- `computeManipulationLayer()` : combinaisons bg/fg/text/sticker → bon enum
- `hitTestForegroundItem` ne renvoie jamais un media `isBackground == true`

### 6.2 Integration

- `rendererCache` : 2 `rebuildLayers()` consécutifs sans changement → `mediaLayer.avPlayerLayer?.player` identique (strong ref retenue par le test)
- `configureVideo` cache miss : ne `play()` qu'après cache populé (mock `CacheCoordinator`)
- `applyThumbHashPlaceholder` visible avant `play()`, fade-out à `readyToPlay`
- Mode `.foreground` : gesture sur le bg ignoré (`manipulatedItemId` reste celui du fg ou nil)
- Mode `.background` : tap n'importe où dans le canvas → manipule le bg
- Mode `.canvas` (no media) : gesture absorbé (.cancelled au .began)
- `StoryComposerView.snapshotAllSlides` async produit `media.thumbHash != nil` pour chaque image/vidéo

### 6.3 Snapshot

- `CanvasLayerIndicator` 3 états (light/dark)
- `StoryInlineTextEditor` placeholder visible (light/dark, font 96 design px)
- `StoryMediaLayer` avec ThumbHash placeholder (avant et après fade-out)

### 6.4 Manuel (E2E sur device)

1. **Vidéo cold-start** : ajouter vidéo en story → preview démarre instantanément, pas de scintillement
2. **Cache vidéo** : poster story vidéo, fermer, rouvrir → pas de network call (vérifier Charles/Proxyman), démarrage instant
3. **ThumbHash placeholder** : airplane mode après publish, ouvrir story → placeholder blur visible sur média fg avant échec de fetch
4. **Mode canvas (no media)** : pinch dans canvas vide → rien ne se passe (gesture absorbé)
5. **Drag bg seul** : ajouter bg, pinch n'importe où → bg s'agrandit
6. **Drag fg** : ajouter bg + fg, pinch sur le fg → fg s'agrandit ; pinch sur le bg → rien
7. **Indicator** : ajouter bg → chip "Fond" devient actif ; ajouter fg → chip "Premier" devient actif
8. **Texte créé** : insertion texte → taille suffisante immédiate, placeholder « Exprimez-vous… » visible
9. **Publish UX** : taper publish sur une story 5+ médias → spinner visible, bouton désactivé, complétion en < 5s

## 7. Risques & mitigations

| Risque | Probabilité | Mitigation |
|--------|-------------|------------|
| `rendererCache` accumule des layers fantômes | Faible | `prune(ids:)` à chaque rebuildLayers + test integration `dict.count == slide.items.count` |
| `AVAssetImageGenerator` lent au publish | Moyen | TaskGroup parallèle ; timeout 5s par média ; fallback `nil` |
| `preferredForwardBufferDuration: 2.0` insuffisant 3G | Faible | Standard, ajustable à 4s si retour utilisateur |
| Indicator chip row visuellement pollue | Moyen | Hauteur 28pt seul, fade-in animé, peut être masqué via flag de feature |
| `currentManipulationLayer` désync entre didSet et gesture .began | Faible | Recompute systématique au .began en plus du didSet |
| iOS < 17 incompatible avec `generator.image(at:)` async | N/A | Cible iOS 17.0+ confirmée par `Package.swift` |
| Cascade async `publishAllSlides` brise capture `@State` | Moyen | Tests integration explicit ; spinner UI cover le compute |
| `weak avPlayer` libéré pendant Task | Moyen | Utiliser `avPlayerLayer?.player` strong path + `weak self` dans Task |
| `prune` libère `AVPlayer` qui jouait encore | Faible | `player.pause()` + `replaceCurrentItem(with: nil)` avant retrait du dict |

## 8. Décisions tranchées

- **Pas de `mediaLayerCache` parallèle** : étendre `StoryRendererCache` existant (cf. § 2.2)
- **Pas de pan/zoom canvas root** : reporté ; en mode `.canvas` les gestures sont absorbés silencieusement (cf. § 3.1)
- **Pas de TextField SwiftUI à modifier** : `StoryInlineTextEditor` est UITextView, placeholder déjà câblé via `placeholderLabel`. Seulement modifier i18n + defaultValue ligne 27 (cf. § 4.2)
- **`isGestureActive` public computed** : préserve l'encapsulation de `manipulatedItemId` private tout en permettant la garde Representable (cf. § 2.5 A.4.c)
- **iOS 17+** : confirmé par `Package.swift`. Pas de fallback iOS 16.
- **Decoder fallback `fontSize`** : reste 64.0 pour back-compat ; seul `init publique` passe à 96.

## 9. Out of scope (déféré)

- **Pan/zoom du canvas root en mode `.canvas`** : nécessite `effects.canvasTransform: CGAffineTransform` persisté + export `StoryAVCompositor` qui le respecte. Sprint dédié si demandé.
- Sélection multi-fg simultanée (pinch sur 2 fg)
- Indicator interactif (tap pour switcher couche) — préparation `onTap` no-op possible mais hors scope
- Migration stories existantes (`StoryMediaObject.thumbHash` recalculé serveur-side)
- Cross-fade transitions entre slides
- Audio waveform animée pendant playback viewer (post-launch)

## 10. Critères d'acceptation

1. Vidéo en story démarre sans scintillement ni cold-restart (vérifiable visuellement)
2. Revisite d'une story vidéo n'émet aucun call réseau pour le contenu (Charles/Proxyman)
3. ThumbHash placeholder visible avant chargement réel sur médias foreground (airplane mode)
4. Mode `.canvas` (aucun média) : gestures absorbés, pas de manipulation
5. Mode `.background` (1 bg) : pinch/pan/rotate manipulent le bg, canvas immobile
6. Mode `.foreground` (≥ 1 fg) : gestures sur fg fonctionnent, sur bg/canvas ignorés
7. Indicator visuel reflète l'état actuel
8. Texte créé apparaît à 96 design px (~35 pt rendu)
9. Placeholder « Exprimez-vous… » visible dans l'inline editor
10. Pas de scintillement visible pendant drag de média
11. Publish multi-média : spinner UX correct, complétion < 5s pour 5 médias
12. Tests unit + integration + snapshots passent
13. Checklist E2E manuelle validée sur device

## 11. Décisions de design (récapitulatif)

| Décision | Choix | Raison |
|----------|-------|--------|
| Ordre des phases | A (P0) → B (P1) → C (P2) | A bloque chaque visionnage, B améliore édition, C cosmétique |
| Cache layers | Étendre `StoryRendererCache` existant | Pas de dual-cache contradictoire |
| FG actif | Hit-test au point de contact | Pas d'état "actif" persistant à gérer |
| Indicator visuel | Subtile chip row non-tappable | Informatif sans zone tactile inerte |
| ThumbHash vidéo | Première frame à t=0.1s via `AVAssetImageGenerator` async iOS 17+ | Standard, prévisible |
| Back-compat ThumbHash | Tolérance silencieuse (`nil`) | Pas de migration legacy |
| Canvas root pan/zoom | Reporté | Nécessite persistence non implémentée |
| Taille texte init | 96 design px (~35 pt rendu) | Équilibre titre/sous-titre |
| Decoder fallback texte | Reste 64 | Préserve les stories existantes |
| Placeholder texte | « Exprimez-vous… » | Plus expressif et brand-friendly |
| `isGestureActive` | Computed public read-only | Préserve encapsulation `manipulatedItemId` private |
| `publishAllSlides` | Async + TaskGroup parallèle | UX correcte (spinner) sans bloquer le main |
| AVPlayer ref | Toujours via `avPlayerLayer?.player` | Contourne la `weak var avPlayer` |
