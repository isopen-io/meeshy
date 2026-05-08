# Story Canvas Fidelity — Design Spec

**Date** : 2026-05-08
**Author** : Claude (brainstorming session avec J. Charles N. M.)
**Status** : Approved (design phase) — Ready for implementation plan
**Related** :
- `docs/superpowers/specs/2026-05-05-story-timeline-editor-design.md` (timeline editor v2 déjà mergé)
- `docs/superpowers/specs/2026-05-04-composer-based-story-repost-design.md` (repost — étendu ici)
- `apps/ios/CLAUDE.md` · `packages/MeeshySDK/CLAUDE.md`

---

## 1. Contexte et objectif

### 1.1 Problème
Le rendu d'une story Meeshy passe par **trois surfaces** : composer canvas (édition live), composer preview (Pro Timeline avec AVFoundation), et story viewer (publié). Sept divergences mesurables ont été cataloguées entre ces surfaces (audit du 2026-05-08) :

| # | Divergence | Impact |
|---|------------|--------|
| 1 | Texte / sticker en points absolus (vs media canvas-relatif) | iPad rend ~2× plus petit qu'iPhone proportionnellement |
| 2 | Z-index calculé composer (`vm.zIndex(for:)`) vs persisté viewer (`obj.zIndex`) | Couches potentiellement réordonnées |
| 3 | Composer canvas ignore le timing (tout visible à l'édition) | Aveugle sur quand chaque item apparaît |
| 4 | Texte vs média : `displayDuration` ≠ `duration` | Texte sans `displayDuration` éternel composer / disparaît viewer |
| 5 | Transitions invisibles à l'édition (CIFilter chain seulement à la lecture) | Édition montre des cuts, viewer crossfade |
| 6 | Animation `.easeInOut(0.15s)` sur opacity time-gated dans viewer | Coupures « propres » deviennent fondus de 150 ms |
| 7 | Audio sync : composer 30-100 ms jitter (`timelineDidStartPlaying`) vs viewer sample-exact | Voice-over désync à l'édition |

**Constat fondamental** : composer canvas + viewer en SwiftUI, AVFoundation export en CALayer. Deux moteurs de rendu différents → fidélité pixel-exact entre live preview et export final est **structurellement impossible** avec l'architecture actuelle.

### 1.2 Objectif
Audit complet et refonte du pipeline de rendu Story pour garantir :
- **Cohérence parfaite** entre composer canvas, preview, viewer et export AVFoundation (identité bit-exact mesurable).
- **Fidélité cross-device** : iPad ↔ iPhone produisent rigoureusement le même rendu relatif (story authorée sur iPad rend identique sur iPhone après scaling, et vice-versa).
- **Fluidité d'édition** : 120 fps sur ProMotion (iPhone 14 Pro+, iPad Pro), 60 fps minimum sur iPhone SE 3.
- **Manipulation média fluide** : drop vidéo 4K < 100 ms premier frame, drag/pinch/rotate sans saccade.
- **Repost natif** : extraction des médias et textes avec positionnement préservé pour affichage correct dans le post composer.

### 1.3 Contraintes
- App pré-launch → migration franche autorisée (pas de back-compat avec stories existantes).
- Pas de CI Xcode disponible pour l'instant → tests écrits, run manuel, pas d'enforcement automatique.
- Repost story → post natif doit fonctionner avec re-projection cross-aspect (story 9:16 → post 1:1 ou 4:5).

---

## 2. Décisions architecturales validées

| # | Décision | Validée |
|---|----------|---------|
| D-1 | Périmètre : audit complet (position, rotation, taille, timing × image/vidéo/texte/sticker × 3 surfaces × 2 form factors) | ✅ |
| D-2 | Migration franche, pas de back-compat. Stories existantes obsolètes. Modèle doit permettre extraction texte+média pour repost natif. | ✅ |
| D-3 | Composer hybride : toggle Edit / Play sur la même `UIView`. Edit = tout visible, gestes actifs. Play = timing appliqué, pas de gestes (sauf tap pause). | ✅ |
| D-4 | Stratégie de tests : property tests + equivalence math + snapshot tests + AVFoundation export equivalence. | ✅ |
| D-5 | **Architecture rendering** : tout-CALayer + UIKit shell. SwiftUI uniquement pour l'app shell (story list, settings, conversations, toolbars, sheets). Composer + viewer = `UIViewController`. **Pas de wrapping `UIViewRepresentable` autour de la canvas elle-même**, refonte totale. | ✅ |
| D-6 | **GPU Metal** : utilisé seulement où le gain est immédiat et perceptible. 4 hot paths : custom kernel filtres temps-réel, MPSImageGaussianBlur, VideoToolbox HW decode, PencilKit. CALayer reste base. | ✅ |
| D-7 | CI testing différé : tests écrits sans enforcement automatique tant que l'environnement Xcode CI n'est pas disponible. | ✅ |

---

## 3. Paquet 1 — Modèle de données, CanvasGeometry, contrats de rendu

### 3.1 Design canvas canonique

```
designSize = 1080 × 1920 pixels (constante)
aspectRatio = 9:16 (portrait, stable)
```

C'est le référentiel unique. Tous les objets sont stockés comme s'ils vivaient sur ce canvas. Le rendu scale linéairement vers la taille effective de chaque appareil.

### 3.2 `CanvasGeometry` primitif

```swift
public struct CanvasGeometry: Equatable, Sendable {
    public static let designWidth: CGFloat = 1080
    public static let designHeight: CGFloat = 1920
    public static let designSize = CGSize(width: designWidth, height: designHeight)

    public let renderSize: CGSize       // taille effective de rendu
    public let scaleFactor: CGFloat     // renderSize.width / 1080 — uniforme

    public func render(_ designPoint: CGPoint) -> CGPoint
    public func render(_ designLength: CGFloat) -> CGFloat
    public func render(_ designSize: CGSize) -> CGSize
    public func designLength(forNormalized n: CGFloat) -> CGFloat
}
```

Une seule règle : **tout ce qui sort du modèle de données passe par `CanvasGeometry` avant d'être posé sur l'écran.**

### 3.3 Modèle migré

**Tous les objets canvas (Text/Media/Sticker)** :

| Champ | Type | Sémantique | Défaut |
|-------|------|------------|--------|
| `x`, `y` | `Double` | Normalisé 0–1 (1080-référentiel) | 0.5, 0.5 |
| `rotation` | `Double` | Degrés, ±360 | 0 |
| `anchor` | `UnitPoint` 🆕 | Point de pivot rotation/scale | `.center` |
| `zIndex` | `Int` | Non-optionnel, persisté | attribué auto |
| `startTime` | `Double?` | Secondes (Double, pas Float) | nil = 0 |
| `duration` | `Double?` | Secondes | nil = jusqu'à end |
| `fadeIn` | `Double?` | Secondes | nil |
| `fadeOut` | `Double?` | Secondes | nil |

**`StoryTextObject` — spécifique** :

| Champ | Type | Sémantique | Défaut |
|-------|------|------------|--------|
| `fontSize` | `Double` 🆕 | Design pixels (1080-référentiel) | 64 (≈28pt iPhone 16 Pro) |
| `fontFamily` | `String` | Pin font Meeshy + system fallback | "system" |
| `displayDuration` | `Double?` | Synonyme de `duration` (à unifier en P1) | nil |

**Note** : `displayDuration` doit être unifié avec `duration` en P1 pour résoudre la divergence #4.

**`StoryMediaObject` — spécifique** :

| Champ | Type | Sémantique | Défaut |
|-------|------|------------|--------|
| `aspectRatio` | `Double` 🆕 stocké | Figé à la composition (plus de calcul async runtime) | requis |
| `scale` | `Double` | Multiplicateur sur `baseSize = 702` (= 65 % de 1080) | 1.0 |

**`StorySticker` — spécifique** :

| Champ | Type | Sémantique | Défaut |
|-------|------|------------|--------|
| `baseSize` | `Double` 🆕 | 140 design px (= 50pt × 2.8 sur référence iPhone) | 140 |
| `scale` | `Double` | Multiplicateur | 1.0 |

Rendu sticker = `baseSize × scale × scaleFactor`.

### 3.4 Contrats de rendu

- **Color space** : `Display P3` working partout (composer, viewer, AVFoundation). Single `StoryRenderingContext.shared` avec `CIContext(mtlDevice:)` figé. `outputColorSpace = sRGB` pour la sérialisation des images uploadées.
- **Sub-pixel preserved** : tout en `Double` jusqu'à la rasterization. Pas de `floor/round/Int` dans la chaîne. SwiftUI/CALayer/Metal gèrent le sub-pixel.
- **Animation `.easeInOut(0.15s)` sur opacity time-gated → SUPPRIMÉE.** Les fondus passent par `fadeIn/fadeOut` explicites du modèle, pas par un effet caché.

### 3.5 Précision temporelle

- Modèle : `Double` (pas `Float`).
- Moteur AVFoundation : `CMTime(value: Int64(time × 600_000), timescale: 600_000)`. Un seul timescale partout.
- Keyframe interpolation : tous calculs en `Double`. Conversion `CGFloat` uniquement à l'attache CALayer finale.

---

## 4. Paquet 2 — `StoryCanvasUIView` : single renderer CALayer

### 4.1 Architecture

```
StoryCanvasUIView : UIView
├── rootLayer : CALayer (frame = renderSize, anchorPoint = 0,0)
│   ├── backgroundLayer : CALayer / AVPlayerLayer
│   ├── itemsContainer : CALayer
│   │   ├── StoryMediaLayer  : CALayer (+ AVPlayerLayer si vidéo)
│   │   ├── StoryTextLayer   : CATextLayer custom
│   │   ├── StoryStickerLayer: CALayer (emoji pré-rasterisé)
│   │   └── StoryFilteredLayer : CAMetalLayer (filtres temps-réel)
│   ├── drawingLayer : PKCanvasView (PencilKit)
│   └── editOverlayLayer : CALayer (selection handles, snap guides — visible mode .edit)
│
├── mode : .edit | .play
├── currentTime : CMTime
├── slide : StorySlide
├── geometry : CanvasGeometry (calculée depuis bounds)
├── metalDevice : MTLDevice (singleton)
├── ciContext : CIContext(mtlDevice:) — partagé avec AVCompositor
└── displayLink : CADisplayLink (preferredFrameRateRange = 60…120)
```

### 4.2 Modes Edit / Play

| Aspect | mode `.edit` | mode `.play` |
|--------|--------------|--------------|
| Time gating | Désactivé (tout visible) | Actif (`startTime ≤ t < startTime+duration`) |
| Gestures | UIPan + UIPinch + UIRotation | Tap-only (pause/play) |
| Selection handles | Visibles | Cachés |
| Snap guides | Visibles pendant drag | Cachés |
| Animations CAAnimation | Désactivées | Actives (fadeIn/fadeOut/keyframes) |
| AVPlayer videos | Pause + frame poster | Playing, sync `mach_absolute_time` |

**Une seule view, deux états.** Bascule via `setMode(.play, time:)`.

### 4.3 Contrat de rendu unique

```swift
func render(_ slide: StorySlide,
            into geometry: CanvasGeometry,
            at time: CMTime,
            mode: RenderMode) -> CALayer
```

Appelée par :
- `StoryCanvasUIView` à chaque update du modèle ou du time
- `StoryAVCompositor` pour chaque frame de l'export AVFoundation
- Tests : `renderToImage(slide, geometry, time)` produit un `CGImage` déterministique

**Une fois cette fonction écrite, les 3 surfaces de rendu final (live preview composer Play, viewer publié, export) sont identiques par construction.**

### 4.4 Layers spécialisés

**`StoryMediaLayer`** :
- Image : `contents = CGImage` chargée via `CacheCoordinator.shared.images`
- Vidéo : `AVPlayerLayer` enfant + `AVPlayer` synchronisé sur `currentTime`
- `transform = CATransform3DConcat(scale, rotation)` autour de `anchorPoint`

**`StoryTextLayer`** :
- Sous-classe `CATextLayer`
- `font = CTFontCreateWithName("...", fontSize × scaleFactor, nil)`
- `contentsScale = UIScreen.main.scale` pour rendu @2x/@3x net
- `string = NSAttributedString` avec writing direction auto-détectée (RTL natif)

**`StoryStickerLayer`** :
- Emoji rasterisé une fois via `NSAttributedString` → `UIImage` → `CGImage`
- Cache par emoji+size dans `StoryStickerRasterizer.shared`

### 4.5 Gestures (mode `.edit` seulement)

Trois `UIGestureRecognizer` sur la `StoryCanvasUIView` :

```swift
UIPanGestureRecognizer        → updates currentItem.position (norm 0-1)
UIPinchGestureRecognizer      → updates currentItem.scale
UIRotationGestureRecognizer   → updates currentItem.rotation
```

`requireGestureRecognizerToFail` chaîné. Hit-test traverse `itemsContainer.sublayers` du plus haut zIndex au plus bas.

**Snapping** : positions snappées à `[0.5, 0.25, 0.75, 0.18, 0.82]` pendant le drag avec tolerance 0.02. Snap guides sur `editOverlayLayer`.

### 4.6 11 ajouts cross-device UX

| # | Ajout | Implémentation |
|---|-------|----------------|
| 1 | **ProMotion 120 Hz** | `CADisplayLink.preferredFrameRateRange = (60…120, preferred: 120)` mode `.edit` ; `60` mode `.play` (sync vidéo) |
| 2 | **Apple Pencil** | `PKCanvasView` (PencilKit, déjà Metal-backed) pour `DrawingOverlayView` — pression + inclinaison natives |
| 3 | **Pointer / trackpad** | `UIPointerInteraction` sur edit handles → curseur change, hover lift, accent |
| 4 | **Context menu** | `UIContextMenuInteraction` sur items canvas (long-press) : delete, duplicate, send to back, replace media |
| 5 | **VoiceOver** | `UIAccessibilityElement` par item canvas avec labels, traits `.image`/`.staticText`, ordre Z. `.accessibilityCustomActions` pour move/resize/delete |
| 6 | **Reduce Motion** | `UIAccessibility.isReduceMotionEnabled` → désactive transitions/keyframes, force coupures sèches mode `.play` |
| 7 | **RTL languages** | `CATextLayer` avec `NSWritingDirection` auto-detect via `NSAttributedString`. Pas de force layout LTR |
| 8 | **Stage Manager / Split View** | `traitCollectionDidChange` + `layoutSubviews` recalculent `CanvasGeometry` ; layer tree re-render auto |
| 9 | **AVPlayer lifecycle** | `willResignActive` → pause + saveTime ; `didBecomeActive` → resume from saveTime. Évite audio fantôme |
| 10 | **Layer rasterization** | `shouldRasterize = true` + `rasterizationScale = UIScreen.main.scale` sur items statiques mode `.play`. Re-rasterize si transform change |
| 11 | **AVPlayer pre-warm** | `player.preroll(atRate:)` 100 ms avant `startTime`. Élimine le startup gap |

### 4.7 Performance targets par device

| Action | iPhone 16 Pro | iPad Pro M2 | iPhone 16 base | iPhone SE 3 |
|--------|--------------|-------------|----------------|-------------|
| Edit gesture (drag) | 120 fps | 120 fps | 60 fps | 60 fps |
| Play preview | 60 fps | 60 fps | 60 fps | 60 fps |
| Cold canvas → first paint | < 250 ms | < 250 ms | < 350 ms | < 500 ms |
| Memory (50 layers) | < 80 MB | < 80 MB | < 80 MB | < 60 MB |
| Drop vidéo 4K → premier frame | < 60 ms | < 50 ms | < 100 ms | < 150 ms |
| Pinch/rotate 12 objets | 120 fps | 120 fps | 60 fps | 60 fps |
| Slider filtre intensité | 120 fps | 120 fps | 120 fps | 60 fps |
| Export 12s slide → MP4 | < 4 s | < 3 s | < 6 s | < 10 s |

Mesures via `MXSignpostMetric` + `os_signpost`. Targets sont des asserts dans les tests perf (run manuel pour l'instant, CI plus tard).

### 4.8 Migration : fichiers SwiftUI supprimés

| Existant (SwiftUI) | Remplacé par |
|--------------------|--------------|
| `StoryCanvasView.swift` (738 lignes) | `StoryComposerVC` (UIViewController) hébergeant `StoryCanvasUIView` |
| `DraggableMediaView.swift` (450 lignes) | `StoryMediaLayer` + gesture handling dans `StoryCanvasUIView` |
| `DraggableTextObjectView.swift` (~300 lignes) | `StoryTextLayer` + gesture handling |
| `StoryCanvasReaderView.swift` (1700 lignes) | `StoryViewerVC` (UIViewController) hébergeant `StoryCanvasUIView` mode `.play` |
| `StoryCanvasReaderView+Timeline.swift` | Logique intégrée au `StoryRenderer.render()` |
| `CanvasElementModifiers.swift` | Inutile (transforms appliqués au CALayer directement) |
| `SimpleTimelineView.swift` | Remplacé par mode `.play` du `StoryCanvasUIView` |
| `TimelinePlaybackEngine.swift` | Remplacé par `CADisplayLink` driven render dans `StoryCanvasUIView` |

`StoryComposerView.swift` (SwiftUI) devient hôte minimal :
- Top bar + bottom toolbar SwiftUI
- Center canvas = `UIViewControllerRepresentable` du `StoryComposerVC` (un seul wrapping au niveau navigation, pas autour de la canvas elle-même)
- Sheets / palettes SwiftUI inchangées

**Total estimé** : ~3200 lignes SwiftUI canvas supprimées, ~2400 lignes UIKit/CALayer ajoutées. Net : -800 lignes.

---

## 5. Paquet 3 — Pipeline GPU explicite + AVFoundation

### 5.1 Stratégie : CALayer base + Metal pour 4 hot paths

CALayer est déjà GPU (Core Animation render server). On descend explicitement à Metal/MPS/VideoToolbox seulement où le gain est immédiat et perceptible. Latences cibles données pour devices ProMotion (iPhone 14 Pro+, iPad Pro M2) ; sur iPhone SE 3 / iPhone 16 base, doubler la latence (60 fps stable au lieu de 120) :

| Hot path | Frame bas-niveau | Gain | Latence cible (ProMotion) |
|----------|------------------|------|---------------------------|
| **Filtres temps-réel** (slider intensité) | `CAMetalLayer` + custom Metal compute kernel (.metal) | 3–5× vs CIFilter chain | < 8 ms (120 fps) |
| **Blur variable** (glass UI, glow stickers) | `MPSImageGaussianBlur` (Metal Performance Shaders) | 3× vs `CIGaussianBlur` | < 4 ms |
| **Drawing Pencil** | `PKCanvasView` (PencilKit, déjà Metal-backed) | Apple natif | 9 ms (Apple Pencil 2/Pro) |
| **Décode vidéo 4K drop** | `VTDecompressionSession` (VideoToolbox HW) + `MTKTextureLoader` direct GPU | 10× vs `AVAssetImageGenerator` | < 100 ms premier frame |

**Différés** (gain marginal ou cas rare, ajouter si profiling le confirme) :
- `MTLRenderCommandEncoder` instanced multi-select (cas 50+ objets, rare)
- `MTLTexture` direct pour image HEIC/RAW (gain 40 ms imperceptible)
- `MTLTexturePool` (micro-optimisation)

Code Metal custom : ~250 lignes (un seul `.metal` file pour les filtres + intégration MPS). Le reste du canvas reste CALayer.

### 5.2 `StoryAVCompositor` : custom AVVideoCompositing

```swift
final class StoryAVCompositor: NSObject, AVVideoCompositing {
    func startRequest(_ request: AVAsynchronousVideoCompositionRequest) {
        let time = request.compositionTime
        let geometry = CanvasGeometry(renderSize: request.renderContext.size)

        // Le MÊME renderer que StoryCanvasUIView
        let layerTree = StoryRenderer.render(
            slide: instruction.slide,
            into: geometry,
            at: time,
            mode: .play
        )

        let buffer = request.renderContext.newPixelBuffer()!
        let context = StoryRenderingContext.shared.cgContext
        layerTree.render(in: context)

        request.finish(withComposedVideoFrame: buffer)
    }
}
```

**Identité bit-exact** : la fonction `StoryRenderer.render()` est la SEULE source de rendu. Appelée à 60 fps par la `StoryCanvasUIView` ; appelée frame-par-frame par `StoryAVCompositor`. Même code, même résultat.

### 5.3 `AVMutableVideoComposition` setup

```swift
let composition = AVMutableComposition()
// Insertion video tracks aux startTime stockés (paquet 1)

let videoComposition = AVMutableVideoComposition(propertiesOf: composition)
videoComposition.customVideoCompositorClass = StoryAVCompositor.self
videoComposition.frameDuration = CMTime(value: 1, timescale: 60)  // 60 fps
videoComposition.renderSize = CanvasGeometry.designSize             // 1080×1920

let audioMix = AudioMixer.makeMix(for: slide)  // ReaderAudioMixer existant
```

L'export et la preview Pro Timeline utilisent le même `videoComposition`. La preview AVPlayer affiche exactement ce qui sera exporté.

### 5.4 Pipeline media drop fluide

```
User drag-and-drop d'un .mov 4K
       ↓
[Main thread] PHPickerViewController returns NSItemProvider (< 16 ms)
       ↓
[Background thread] AVAsset(url:) async load (.tracks, .duration)
       ↓ (50–200 ms async, non-bloquant)
       │ ┌─ AVAssetReader pour décode HW VideoToolbox
       │ │     ↓ CVPixelBuffer (NV12, GPU-friendly)
       │ │     ↓ MTKTextureLoader.newTexture(cgImage:) → MTLTexture
       │ │     ↓ CALayer.contents = MTLTexture as Any → GPU direct
       │ │     ↓ PREMIER FRAME VISIBLE
       │ └────────────────────────────
       ↓ (parallèle)
[Background] AVPlayer.preroll(atRate:) prépare playback
       ↓
[Main thread] AVPlayerLayer attaché à StoryMediaLayer, prêt à jouer

TOTAL : < 100 ms de drag-end à premier frame visible (target iPhone SE 3)
```

---

## 6. Paquet 4 — Repost extraction avec positionnement fidèle

### 6.1 `RepostPayload` : modèle d'extraction unifié

```swift
public struct RepostPayload: Sendable {
    public let textObjects: [StoryTextObject]
    public let mediaObjects: [StoryMediaObject]
    public let stickers: [StorySticker]
    public let sourceCanvasSize: CGSize       // 1080×1920 (story origin)
    public let sourceSlideId: String          // traçabilité
}

extension StorySlide {
    public func extractRepostPayload() -> RepostPayload { … }
}

extension PostComposer {
    public func importFromStory(_ payload: RepostPayload) {
        let projector = CanvasReprojector(
            from: payload.sourceCanvasSize,
            to: postDesignSize  // ex: 1080×1080 ou 1080×1350
        )
        items.append(contentsOf: payload.textObjects.map { projector.reproject($0) })
        items.append(contentsOf: payload.mediaObjects.map { projector.reproject($0) })
        items.append(contentsOf: payload.stickers.map { projector.reproject($0) })
    }
}
```

### 6.2 `CanvasReprojector` : adaptation cross-aspect

```swift
struct CanvasReprojector {
    let sourceSize: CGSize       // (1080, 1920)
    let targetSize: CGSize       // (1080, 1080) ou (1080, 1350)

    func reproject<T: PositionedItem>(_ obj: T) -> T {
        // Stratégie "fit-y" pour 9:16 → 1:1 :
        //   - Position : re-clamper aux nouvelles bornes (safe zone)
        //   - Scale : préserver en design pixels (taille perçue invariante)
        //   - aspectRatio : invariant
        //   - Rotation : invariant
        //   - Si l'objet sort du cadre target → flag .reprojectionWarning(.clamped)
    }
}
```

Le post composer affiche un **indicateur visuel discret** sur les items clampés → l'utilisateur peut ré-ajuster avant de poster.

### 6.3 Tests dédiés repost

7 tests :
- `test_extractRepostPayload_preservesAllItems` (round-trip lossless)
- `test_canvasReprojector_9_16_to_1_1_keepsCenteredItem` (objet au centre reste au centre)
- `test_canvasReprojector_9_16_to_1_1_clampsBottomItem` (objet en bas y=0.9 story → y=0.95 max post 1:1)
- `test_canvasReprojector_preservesScale` (taille en design pixels invariante)
- `test_canvasReprojector_preservesAspectRatio` (vidéo conserve son aspectRatio stocké)
- `test_canvasReprojector_preservesRotation` (rotation invariante)
- `test_canvasReprojector_preservesZIndexOrder` (ordre des couches préservé)

---

## 7. Stratégie de tests à 4 niveaux (sans CI pour l'instant)

### 7.0 Choix du framework par niveau

Le projet utilise deux frameworks de test (cf. `apps/ios/CLAUDE.md`) :
- **Swift Testing** (`@Test` + `#expect`) : pour tests SDK pures (modèles, math, equivalence)
- **XCTest** (`XCTAssert*`, `XCUITest`) : pour tests UI/intégration (snapshots, AVFoundation export, performance)

Mapping pour cette spec :
- Niveau 1 (property) → Swift Testing dans `MeeshyUITests/Story/Property/`
- Niveau 2 (equivalence math) → Swift Testing dans `MeeshyUITests/Story/Equivalence/`
- Niveau 3 (snapshot pixel) → XCTest dans `MeeshyUITests/Story/Snapshot/` avec `assertSnapshot`
- Niveau 4 (AVFoundation export) → XCTest async dans `MeeshyUITests/Story/Export/`
- Niveau 5 (performance regression) → XCTest avec `measure(metrics:)`

Les pseudocodes ci-dessous utilisent la syntaxe Swift Testing (`@Test`, `#expect`) pour la concision ; à traduire en XCTest pour les niveaux 3-5.

### 7.1 Niveau 1 — Property tests (math, rapides)

```swift
@Test func canvasGeometry_renderIsLinear() {
    let g1 = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
    let g2 = CanvasGeometry(renderSize: CGSize(width: 820, height: 1456))
    let designPoint = CGPoint(x: 540, y: 960)

    let p1 = g1.render(designPoint)
    let p2 = g2.render(designPoint)

    #expect(p1.x / 412 == p2.x / 820)
}
```

~50 tests propriétés. Run < 5 s. Coverage des invariants mathématiques.

### 7.2 Niveau 2 — Equivalence math tests (cross-device sans pixels)

```swift
@Test func render_iPhone_iPad_areLinearlyEquivalent() async {
    let slide = makeFixture(.complexSlide)
    let iPhoneLayer = StoryRenderer.render(slide, into: .iPhone16Pro, at: .zero, mode: .play)
    let iPadLayer = StoryRenderer.render(slide, into: .iPadProM2, at: .zero, mode: .play)

    let scaleRatio = CanvasGeometry.iPadProM2.scaleFactor
                   / CanvasGeometry.iPhone16Pro.scaleFactor

    for (i, iphoneSub) in iPhoneLayer.sublayers!.enumerated() {
        let ipadSub = iPadLayer.sublayers![i]
        #expect(ipadSub.frame.origin.x == iphoneSub.frame.origin.x * scaleRatio)
        #expect(ipadSub.frame.size.width == iphoneSub.frame.size.width * scaleRatio)
        #expect(ipadSub.transform.m11 == iphoneSub.transform.m11)
    }
}
```

15 tests. **Preuve mathématique** que cross-device fidelity tient. Pas besoin de pixels.

### 7.3 Niveau 3 — Snapshot tests pixel

```swift
@Test func snapshot_complexSlide_iPhone16Pro() async {
    let view = StoryCanvasUIView(slide: .complexFixture, mode: .play, time: CMTime(seconds: 5))
    view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
    let image = view.snapshot()
    assertSnapshot(of: image, as: .image, named: "complexSlide_iPhone16Pro_t5s")
}
```

20 fixtures × 4 devices × 3 timestamps = **240 snapshots**. Tolerance 0 px (CALayer déterministe → identité parfaite attendue). Baselines en Git binaire (ou LFS plus tard).

### 7.4 Niveau 4 — AVFoundation export equivalence

```swift
@Test func export_matches_liveView_pixelExact() async throws {
    let slide = makeFixture(.complexSlide)
    let liveImage = StoryCanvasUIView(slide: slide, mode: .play, time: CMTime(seconds: 5)).snapshot()

    let exportURL = try await StoryExporter.export(slide).get()
    let exportFrame = try await extractFrame(from: exportURL, at: CMTime(seconds: 5))

    #expect(pixelDifference(liveImage, exportFrame) == 0)
}
```

Le test qui prouve que `live preview == export` au pixel près. **Validation ultime de la promesse orfèvre.**

### 7.5 Niveau 5 — Performance regression

```swift
@Test func performance_complexSlide_60fps_iPhone16Pro() async {
    measure(metrics: [XCTOSSignpostMetric.applicationLaunch]) {
        let view = StoryCanvasUIView(slide: .complexFixture, mode: .play)
        view.runFor(seconds: 12)
    }
    // Asserts dropped frames < 5 sur 720 frames (12 s × 60 fps)
}
```

Targets du paquet 2 (table par device) deviennent des asserts. Run manuel via `MXSignpostMetric` visible dans Instruments. Pas de CI pour l'instant.

### 7.6 Niveau 6 — Locale + Dynamic Type

5-10 fixtures supplémentaires :
- `test_snapshot_textSlide_arabicRTL`
- `test_snapshot_textSlide_chineseLong`
- `test_snapshot_textSlide_dynamicTypeXL` (chrome respecte ; canvas content non)

### 7.7 Run sans CI (mode actuel)

- Tests dans `packages/MeeshySDK/Tests/MeeshyUITests/Story/`
- Run manuel via `./apps/ios/meeshy.sh test` ou `xcodebuild test` quand env Xcode disponible
- Snapshot baselines en Git binaire — versionnées avec le code
- Performance metrics via `os_signpost` visibles dans Instruments — pas d'asserts hard pour l'instant
- Quand Xcode CI revient : ajouter workflow qui lance le test plan complet sur PR

---

## 8. Plan d'exécution en 6 phases

| Phase | Livrables | Estimation | Mergeable seul ? |
|-------|-----------|-----------:|:----------------:|
| **P0 — Tests contrat** | Property tests (50) + equivalence math (15) + structure snapshot tests (sans baselines). Toutes échouent au début. Définit l'oracle. | 3-4 j | ✅ |
| **P1 — Modèle + CanvasGeometry** | Migration franche modèle Story (paquet 1) : `fontSize`, `aspectRatio` stocké, `anchor`, `zIndex` obligatoire, `Double` partout. `CanvasGeometry`, `StoryRenderingContext.shared`. Property tests passent. | 5 j | ✅ (vues SwiftUI cassent — P2 les remplace) |
| **P2 — `StoryCanvasUIView` CALayer** | Renderer mono-fonction `StoryRenderer.render()`. `StoryCanvasUIView` modes `.edit`/`.play`. Layers spécialisés. 11 ajouts cross-device. **Suppression totale** des fichiers SwiftUI canvas (8 fichiers, ~3200 lignes). | 10 j | ✅ |
| **P3 — Pipeline GPU explicite (réduit)** | 4 hot paths Metal : custom kernel filtres + MPSImageGaussianBlur + VideoToolbox decode + PencilKit. `CIContext(mtlDevice:)` singleton. ~250 lignes Metal. | 3 j | ✅ |
| **P4 — AVFoundation custom compositor** | `StoryAVCompositor` utilise `StoryRenderer.render()`. `AVMutableVideoComposition` aligné. Test équivalence pixel live preview = export. | 3 j | ✅ |
| **P5 — Repost extraction + nettoyage** | `CanvasReprojector` + `RepostPayload` + import dans `PostComposer`. Indicateur clamping. Tests repost. Nettoyage code mort. `decisions.md` + `CLAUDE.md` mis à jour. | 3 j | ✅ |

**Total estimé : ~27 jours-homme** (≈ 5-6 semaines, 1 dev focus).

### 8.1 Ordre de merge

P0 → P1 → P2 → P3 → P4 → P5 (séquentiel, chaque phase build sur la précédente).

P3 et P4 peuvent être parallélisés si plusieurs devs.

P5 (repost) peut commencer dès que P1 est mergé, en parallèle de P2-P4.

### 8.2 Risques par phase

| Phase | Risque | Mitigation |
|-------|--------|------------|
| P1 | Migration franche casse les vues SwiftUI existantes | Accepté (pré-launch). P2 enchaîne immédiatement. |
| P2 | Refonte UIKit/CALayer = perte productivité SwiftUI | One-shot : 10 j focus, après c'est stable. |
| P2 | Bugs subtils gestures hit-testing CALayer | Tests E2E sur device réel + fixtures complexes |
| P3 | Metal kernel custom = code à maintenir | ~250 lignes seulement, isolé dans `.metal` file |
| P4 | AVFoundation custom compositor complexe | Test export-equivalence valide bit-exact |
| P5 | Re-projection cross-aspect peut clamp items | Indicateur visuel utilisateur, ajustement manuel possible |

---

## 9. Nettoyage final (P5)

### 9.1 Supprimés

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/DraggableMediaView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/DraggableTextObjectView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/CanvasElementModifiers.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView+Timeline.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/SimpleTimelineView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/TimelinePlaybackEngine.swift`

### 9.2 Refactorés

- `StoryComposerView.swift` → hôte SwiftUI minimal (toolbars + sheets + `UIViewControllerRepresentable` du `StoryComposerVC`)
- `StoryComposerViewModel.swift` → simplifié, pas de logique de rendu
- Renderer logic centralisée dans `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/`

### 9.3 Ajoutés

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/CanvasGeometry.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryMediaLayer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryTextLayer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryStickerLayer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryFilteredLayer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderingContext.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryStickerRasterizer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryAVCompositor.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Metal/StoryFilters.metal`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/CanvasReprojector.swift` (P5)
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryComposerVC.swift` (UIViewController)
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryViewerVC.swift` (UIViewController)
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasRepresentable.swift` (UIViewControllerRepresentable, point d'entrée unique depuis SwiftUI navigation)

### 9.4 Documentation

- `apps/ios/CLAUDE.md` : section « Story canvas (post-rewrite) » avec architecture finale
- `apps/ios/decisions.md` : décisions D-1 à D-7 actées
- `packages/MeeshySDK/decisions.md` : choix CALayer + Metal hot paths + designSize 1080×1920

---

## 10. Hors-scope (différé)

- **Metal pur partout** — différé tant qu'AR/particles/VFX templates ne sont pas dans la roadmap (gain immédiat < 5 % sur stories typiques)
- **MTLRenderCommandEncoder instanced multi-select** — différé tant que cas 50+ objets ne pose pas problème en réel
- **MTLTexture pour image HEIC/RAW** — différé (gain 40 ms imperceptible)
- **MTLTexturePool** — micro-optimisation, à mesurer
- **MetalFX upscaling** — différé (optimisation post-launch)
- **Vision (face/body detection)** — différé (AR sticker hors roadmap)
- **CI Xcode** — différé tant que l'environnement n'est pas disponible
- **Mac Catalyst** — pas dans la roadmap actuelle

---

## 11. Acceptance criteria

Le design est considéré comme implémenté correctement quand :

1. ✅ `StoryRenderer.render()` est appelé par les 3 surfaces de rendu final (composer Play, viewer, AVCompositor) avec **identité bit-exact** prouvée par `test_export_matches_liveView_pixelExact`.
2. ✅ Les tests d'équivalence math passent : pour toute slide, `render(s, iPhone16Pro)` et `render(s, iPadProM2)` sont linéairement équivalents sous le ratio des `scaleFactor`.
3. ✅ Les 240 snapshots golden iPhone+iPad sont identiques à 0 px de différence après 3 runs consécutifs.
4. ✅ Performance targets atteints sur tous les devices (iPhone 16 Pro / iPad Pro M2 / iPhone 16 / iPhone SE 3).
5. ✅ Repost extraction préserve tous les items et leurs positions ; clamping signalé visuellement à l'utilisateur.
6. ✅ Tous les tests P0 (property + equivalence + repost) passent en local.
7. ✅ Code SwiftUI canvas legacy supprimé (8 fichiers).
8. ✅ `decisions.md` et `CLAUDE.md` mis à jour.

---

**Fin du document.**
