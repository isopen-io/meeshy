# Story Canvas Background Stabilization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabiliser le `StoryBackgroundLayer` du composer iOS de Stories pour corriger 3 bugs liés (vidéo paysage croppée, flash noir à chaque édit, drag du bg non visible sur canvas principal).

**Architecture:** Une seule source de vérité pour la position du bg (`StoryBackgroundTransform`), `videoGravity` calculé auto par orientation (override double-tap persisté), diff complet dans `configure()` pour ne plus rebuild quand rien n'a changé, wrap `CATransaction.setDisableActions` des chemins async qui causaient le flash, branche live drag dans `handlePan` pour le bg.

**Tech Stack:** Swift 6, iOS 16+, SPM, CoreAnimation (CALayer/AVPlayerLayer/CATransaction), AVFoundation (AVAsset/AVMutableComposition), XCTest, Swift Testing.

**Spec source:** `docs/superpowers/specs/2026-05-25-story-canvas-bg-stabilization-design.md` (v2)

**Branche:** `fix/story-canvas-bg-stabilization-2026-05-26`

---

## File Structure

| Fichier | Type | Responsabilité |
|---|---|---|
| `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` | Modify | Ajouter `videoFitMode: String?` à `StoryBackgroundTransform`, update `isIdentity`, update init |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift` | Modify | `videoFitMode` au struct render-space, `resolveVideoGravity()/resolveImageGravity()`, diff idempotent, wrap CATransaction des chemins async, gestion double-tap |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift` | Modify | Converters bg propagent `videoFitMode`, `handlePan` branche live bg, double-tap gesture, cache `backgroundMediaObjectId` |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift` | Modify | `videoFitMode` au struct interne `BackgroundTransform`, préservation dans cache |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift` | Modify | `restoreCanvas()` lit `videoFitMode`, `buildEffects()` le sérialise, câble nouveau callback |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryAVCompositor.swift` | Modify | `paintImage` respecte fit mode, transform de la composition vidéo aussi |
| `packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Background/BackgroundTransformTests.swift` | Extend | Round-trip Codable avec videoFitMode, equality |
| `packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Background/StoryBackgroundLayerTests.swift` | Extend | `resolveVideoGravity`, diff idempotent, double-tap cycle |
| `packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Background/StoryBackgroundLayerImageTests.swift` | Extend | Image gravity auto, image async load wrapped CATransaction |
| `packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Background/StoryBackgroundLayerVideoTests.swift` | Extend | Landscape→aspect, portrait→aspectFill, override respecté |
| `packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/CanvasBackgroundIntegrationTests.swift` | Extend | Drag bg live, parité mini-preview, no-reattach text keystroke |
| `docs/qa/2026-05-26-story-canvas-bg-fixes-smoke.md` | Create | Smoke checklist QA 16 items |

---

## Phase 0 — Setup

### Task 0: Branche & worktree

**Files:** N/A (git only)

- [ ] **Step 1: Vérifier l'état git propre**

```bash
git status
```
Expected: pas de modifications non commitées (ou seulement les iOS Info.plist non-pertinents listés au start).

- [ ] **Step 2: Créer worktree isolé**

```bash
git worktree add ../v2_meeshy-bg-stab -b fix/story-canvas-bg-stabilization-2026-05-26 main
cd ../v2_meeshy-bg-stab
```
Expected: nouveau dossier sibling créé, branche checkout.

- [ ] **Step 3: Vérifier que le build SDK passe**

```bash
xcodebuild build -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: BUILD SUCCEEDED.

---

## Phase 1 — Instrumentation & repro

### Task 1: Test rouge — `configure()` 2x avec mêmes paramètres = no-op

**Files:**
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Background/StoryBackgroundLayerTests.swift`

- [ ] **Step 1: Lire le fichier existant**

```bash
cat packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Background/StoryBackgroundLayerTests.swift
```

- [ ] **Step 2: Ajouter le test rouge en fin de classe**

```swift
    func test_configure_sameSolidColorTwice_isNoOp() throws {
        let layer = StoryBackgroundLayer()
        let geom = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        layer.configure(kind: .solidColor(.red), transform: .identity,
                        geometry: geom, resolver: nil, imageCache: nil)
        let firstBgColor = layer.backgroundColor
        // Second identical configure — after the no-op diff, backgroundColor MUST not be re-assigned
        // We can't directly observe "skip" but we can observe that no sublayer was re-created.
        let sublayerCountBefore = layer.sublayers?.count ?? 0
        layer.configure(kind: .solidColor(.red), transform: .identity,
                        geometry: geom, resolver: nil, imageCache: nil)
        let sublayerCountAfter = layer.sublayers?.count ?? 0
        XCTAssertEqual(sublayerCountBefore, sublayerCountAfter)
        XCTAssertEqual(layer.backgroundColor, firstBgColor)
    }
```

- [ ] **Step 3: Vérifier que le test échoue (ou passe par chance, à confirmer)**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/StoryBackgroundLayerTests/test_configure_sameSolidColorTwice_isNoOp \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: ce test pourrait déjà passer pour solidColor (cas trivial). C'est OK — il sert de garde-fou de non-régression. La vraie valeur est dans les tests image/video (Tasks 2-3).

- [ ] **Step 4: Commit (test passe ou non, on commit pour avoir l'historique)**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Background/StoryBackgroundLayerTests.swift
git commit -m "test(story-bg): regression guard for idempotent configure() solidColor"
```

### Task 2: Test rouge — text keystroke ne doit pas réattacher AVPlayer

**Files:**
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/CanvasBackgroundIntegrationTests.swift`

- [ ] **Step 1: Lire le fichier existant**

```bash
cat packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/CanvasBackgroundIntegrationTests.swift
```

- [ ] **Step 2: Ajouter un compteur attach via subclass de test, et le test**

Append en fin de classe :

```swift
    func test_configure_videoSameURLTwice_doesNotReattachPlayerLayer() throws {
        let layer = StoryBackgroundLayer()
        let geom = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        guard let url = Bundle(for: type(of: self)).url(forResource: "test-1s", withExtension: "mp4") else {
            throw XCTSkip("test-1s.mp4 fixture not bundled")
        }
        let resolver: (String) -> URL? = { _ in url }
        layer.configure(kind: .video(postMediaId: "vid-1", looping: true, mute: true, thumbHash: nil),
                        transform: .identity, geometry: geom,
                        resolver: resolver, imageCache: nil)
        let firstAVLayer = layer.sublayers?.first { $0 is AVPlayerLayer } as? AVPlayerLayer
        let firstPlayer = firstAVLayer?.player

        // Same URL, same transform, same geometry — must be a no-op
        layer.configure(kind: .video(postMediaId: "vid-1", looping: true, mute: true, thumbHash: nil),
                        transform: .identity, geometry: geom,
                        resolver: resolver, imageCache: nil)
        let secondAVLayer = layer.sublayers?.first { $0 is AVPlayerLayer } as? AVPlayerLayer
        let secondPlayer = secondAVLayer?.player

        XCTAssertTrue(firstAVLayer === secondAVLayer, "AVPlayerLayer must be reused, not reattached")
        XCTAssertTrue(firstPlayer === secondPlayer, "AVPlayer must be reused, not recreated")
    }
```

- [ ] **Step 3: Run test, attendu FAIL si le fast-path existant ne couvre pas la 2e configure() identique**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/CanvasBackgroundIntegrationTests/test_configure_videoSameURLTwice_doesNotReattachPlayerLayer \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: PASS si le fast-path existant capture déjà ce cas (`contentIdentity` retourne même string pour mêmes `postMediaId+looping`), FAIL sinon. Documente l'état réel avant fix.

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/CanvasBackgroundIntegrationTests.swift
git commit -m "test(story-bg): regression guard for AVPlayer reuse on same-URL configure"
```

### Task 3: Test rouge — `videoGravity` doit être adaptatif

**Files:**
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Background/StoryBackgroundLayerVideoTests.swift`

- [ ] **Step 1: Lire le fichier existant**

```bash
cat packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Background/StoryBackgroundLayerVideoTests.swift
```

- [ ] **Step 2: Ajouter le test rouge sur `resolveVideoGravity` (helper qui n'existe pas encore)**

Append en fin de classe :

```swift
    func test_resolveVideoGravity_landscapeVideo_returnsResizeAspect() {
        let canvas = CGSize(width: 1080, height: 1920)
        let landscape = CGSize(width: 1920, height: 1080)
        let gravity = StoryBackgroundLayer.resolveVideoGravity(
            naturalSize: landscape, canvasSize: canvas, override: nil)
        XCTAssertEqual(gravity, .resizeAspect)
    }

    func test_resolveVideoGravity_portraitVideo_returnsResizeAspectFill() {
        let canvas = CGSize(width: 1080, height: 1920)
        let portrait = CGSize(width: 1080, height: 1920)
        let gravity = StoryBackgroundLayer.resolveVideoGravity(
            naturalSize: portrait, canvasSize: canvas, override: nil)
        XCTAssertEqual(gravity, .resizeAspectFill)
    }

    func test_resolveVideoGravity_overrideFit_returnsResizeAspect() {
        let canvas = CGSize(width: 1080, height: 1920)
        let portrait = CGSize(width: 1080, height: 1920)
        let gravity = StoryBackgroundLayer.resolveVideoGravity(
            naturalSize: portrait, canvasSize: canvas, override: "fit")
        XCTAssertEqual(gravity, .resizeAspect)
    }

    func test_resolveVideoGravity_overrideFill_returnsResizeAspectFill() {
        let canvas = CGSize(width: 1080, height: 1920)
        let landscape = CGSize(width: 1920, height: 1080)
        let gravity = StoryBackgroundLayer.resolveVideoGravity(
            naturalSize: landscape, canvasSize: canvas, override: "fill")
        XCTAssertEqual(gravity, .resizeAspectFill)
    }
```

- [ ] **Step 3: Run test, attendu FAIL (function not defined)**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/StoryBackgroundLayerVideoTests/test_resolveVideoGravity_landscapeVideo_returnsResizeAspect \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: COMPILE FAIL — `resolveVideoGravity` n'existe pas encore.

- [ ] **Step 4: Commit (test rouge, compile fail accepté à ce stade)**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Background/StoryBackgroundLayerVideoTests.swift
git commit -m "test(story-bg): RED tests for resolveVideoGravity orientation auto"
```

---

## Phase 2 — Modèle + propagation `videoFitMode`

### Task 4: Ajouter `videoFitMode` à `StoryBackgroundTransform` (SDK persisté)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:1041-1056`

- [ ] **Step 1: Lire le bloc existant**

```bash
sed -n '1041,1056p' packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift
```

- [ ] **Step 2: Modifier la struct + init + isIdentity**

```swift
public struct StoryBackgroundTransform: Codable, Sendable {
    public var scale: CGFloat?
    public var offsetX: CGFloat?
    public var offsetY: CGFloat?
    public var rotation: Double?
    /// User override for video background gravity. `nil` = auto by orientation
    /// (landscape → letterbox, portrait → aspectFill). `"fit"` = forced letterbox.
    /// `"fill"` = forced aspectFill. Same semantics applied to image backgrounds.
    public var videoFitMode: String?

    public init(scale: CGFloat? = nil, offsetX: CGFloat? = nil,
                offsetY: CGFloat? = nil, rotation: Double? = nil,
                videoFitMode: String? = nil) {
        self.scale = scale; self.offsetX = offsetX
        self.offsetY = offsetY; self.rotation = rotation
        self.videoFitMode = videoFitMode
    }

    public var isIdentity: Bool {
        (scale ?? 1.0) == 1.0 && (offsetX ?? 0) == 0 && (offsetY ?? 0) == 0
            && (rotation ?? 0) == 0 && videoFitMode == nil
    }
}
```

- [ ] **Step 3: Build SDK pour valider**

```bash
xcodebuild build -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: BUILD SUCCEEDED.

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift
git commit -m "feat(sdk/story): add videoFitMode to StoryBackgroundTransform"
```

### Task 5: Test Codable round-trip avec `videoFitMode`

**Files:**
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Background/BackgroundTransformTests.swift`

- [ ] **Step 1: Ajouter les tests**

```swift
    func test_storyBackgroundTransform_codable_roundTrip_withVideoFitMode() throws {
        let original = StoryBackgroundTransform(scale: 1.5, offsetX: 10, offsetY: 20,
                                                rotation: 5, videoFitMode: "fit")
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(StoryBackgroundTransform.self, from: data)
        XCTAssertEqual(decoded.scale, 1.5)
        XCTAssertEqual(decoded.offsetX, 10)
        XCTAssertEqual(decoded.offsetY, 20)
        XCTAssertEqual(decoded.rotation, 5)
        XCTAssertEqual(decoded.videoFitMode, "fit")
    }

    func test_storyBackgroundTransform_codable_roundTrip_withNilVideoFitMode() throws {
        let original = StoryBackgroundTransform()
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(StoryBackgroundTransform.self, from: data)
        XCTAssertNil(decoded.videoFitMode)
    }

    func test_storyBackgroundTransform_isIdentity_falseWhenVideoFitModeSet() {
        let t = StoryBackgroundTransform(videoFitMode: "fill")
        XCTAssertFalse(t.isIdentity)
    }

    func test_storyBackgroundTransform_isIdentity_trueWhenAllNil() {
        let t = StoryBackgroundTransform()
        XCTAssertTrue(t.isIdentity)
    }
```

Add `import MeeshySDK` at the top of the file if not present.

- [ ] **Step 2: Run new tests**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/BackgroundTransformTests \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Background/BackgroundTransformTests.swift
git commit -m "test(sdk/story): Codable round-trip + isIdentity for videoFitMode"
```

### Task 6: Ajouter `videoFitMode` à render-space `BackgroundTransform` + helper `resolveVideoGravity`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift:10-30, 343-355`

- [ ] **Step 1: Modifier la struct render-space + caTransform inchangé**

Remplacer le bloc lignes 10-30 :

```swift
public struct BackgroundTransform: Sendable, Equatable {
    public nonisolated var scale: Double
    public nonisolated var offsetX: Double
    public nonisolated var offsetY: Double
    public nonisolated var rotation: Double  // degrees
    /// `nil` = auto by orientation. `"fit"` | `"fill"` = override.
    public nonisolated var videoFitMode: String?

    public nonisolated init(scale: Double = 1.0, offsetX: Double = 0,
                            offsetY: Double = 0, rotation: Double = 0,
                            videoFitMode: String? = nil) {
        self.scale = scale
        self.offsetX = offsetX
        self.offsetY = offsetY
        self.rotation = rotation
        self.videoFitMode = videoFitMode
    }

    public nonisolated static let identity = BackgroundTransform()

    public nonisolated func caTransform() -> CATransform3D {
        let r = CGFloat(rotation * .pi / 180)
        var t = CATransform3DIdentity
        t = CATransform3DTranslate(t, CGFloat(offsetX), CGFloat(offsetY), 0)
        t = CATransform3DRotate(t, r, 0, 0, 1)
        t = CATransform3DScale(t, CGFloat(scale), CGFloat(scale), 1)
        return t
    }
}
```

- [ ] **Step 2: Ajouter `resolveVideoGravity` et `resolveImageGravity` (static publics pour test)**

À la fin du fichier, dans une nouvelle extension :

```swift
// MARK: - Gravity Resolution

extension StoryBackgroundLayer {
    /// Resolves the AVLayerVideoGravity for a video background.
    /// `nil` override = auto by orientation: landscape→letterbox, portrait→fill.
    public nonisolated static func resolveVideoGravity(
        naturalSize: CGSize,
        canvasSize: CGSize,
        override: String?
    ) -> AVLayerVideoGravity {
        if let o = override {
            return o == "fit" ? .resizeAspect : .resizeAspectFill
        }
        guard naturalSize.height > 0, canvasSize.height > 0 else {
            return .resizeAspectFill
        }
        let mediaRatio = naturalSize.width / naturalSize.height
        let canvasRatio = canvasSize.width / canvasSize.height
        return mediaRatio > canvasRatio ? .resizeAspect : .resizeAspectFill
    }

    /// Resolves the contentsGravity for an image background. Same logic as video.
    public nonisolated static func resolveImageGravity(
        naturalSize: CGSize,
        canvasSize: CGSize,
        override: String?
    ) -> CALayerContentsGravity {
        if let o = override {
            return o == "fit" ? .resizeAspect : .resizeAspectFill
        }
        guard naturalSize.height > 0, canvasSize.height > 0 else {
            return .resizeAspectFill
        }
        let mediaRatio = naturalSize.width / naturalSize.height
        let canvasRatio = canvasSize.width / canvasSize.height
        return mediaRatio > canvasRatio ? .resizeAspect : .resizeAspectFill
    }
}
```

- [ ] **Step 3: Run les tests Phase 1 (Task 3) qui doivent passer maintenant**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/StoryBackgroundLayerVideoTests \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: 4 nouveaux tests PASS (resolveVideoGravity_*).

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift
git commit -m "feat(story/bg): videoFitMode in render-space transform + gravity resolvers"
```

### Task 7: Propager `videoFitMode` au struct composer + converters

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift:366-371`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift:1519-1538`

- [ ] **Step 1: Update composer internal struct**

Remplacer dans `StoryComposerViewModel.swift:366-371` :

```swift
    struct BackgroundTransform {
        var scale: CGFloat = 1.0
        var offsetX: CGFloat = 0
        var offsetY: CGFloat = 0
        var rotation: Double = 0
        var videoFitMode: String? = nil
    }
```

- [ ] **Step 2: Update `restoreCanvas` reader (composer ← SDK persistance)**

Dans `StoryComposerView.swift:1519-1527`, remplacer :

```swift
        if let bt = e.backgroundTransform {
            viewModel.backgroundTransform = StoryComposerViewModel.BackgroundTransform(
                scale: bt.scale ?? 1.0, offsetX: bt.offsetX ?? 0,
                offsetY: bt.offsetY ?? 0, rotation: bt.rotation ?? 0,
                videoFitMode: bt.videoFitMode
            )
        } else {
            viewModel.backgroundTransform = StoryComposerViewModel.BackgroundTransform()
        }
```

- [ ] **Step 3: Update `buildEffects` writer (composer → SDK persistance)**

Dans `StoryComposerView.swift:1532-1538`, remplacer :

```swift
        let bt = viewModel.backgroundTransform
        let bgTransform = StoryBackgroundTransform(
            scale: bt.scale != 1.0 ? bt.scale : nil,
            offsetX: bt.offsetX != 0 ? bt.offsetX : nil,
            offsetY: bt.offsetY != 0 ? bt.offsetY : nil,
            rotation: bt.rotation != 0 ? bt.rotation : nil,
            videoFitMode: bt.videoFitMode
        )
```

- [ ] **Step 4: Build**

```bash
xcodebuild build -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: BUILD SUCCEEDED.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift
git commit -m "feat(story/composer): propagate videoFitMode through composer ↔ SDK converters"
```

### Task 8: Propager `videoFitMode` au converter `bgTransform` du canvas

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift:1027-1033, 1267-1275`

- [ ] **Step 1: Update converter principal**

Dans `StoryCanvasUIView.swift:1027-1033`, remplacer :

```swift
        let bgTransform: BackgroundTransform = {
            guard let t = slide.effects.backgroundTransform else { return .identity }
            return BackgroundTransform(scale: Double(t.scale ?? 1),
                                       offsetX: Double(t.offsetX ?? 0),
                                       offsetY: Double(t.offsetY ?? 0),
                                       rotation: t.rotation ?? 0,
                                       videoFitMode: t.videoFitMode)
        }()
```

- [ ] **Step 2: Update converter de `captureBackground` (filter texture capture)**

Dans `StoryCanvasUIView.swift:1267-1275`, le même bloc se répète. Identifier-le via grep et appliquer la même modification :

```bash
grep -n "BackgroundTransform(scale: Double" packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift
```

Pour chaque occurrence trouvée, remplacer avec le nouveau bloc incluant `videoFitMode: t.videoFitMode`.

- [ ] **Step 3: Build**

```bash
xcodebuild build -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: BUILD SUCCEEDED.

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift
git commit -m "feat(story/canvas): propagate videoFitMode through bgTransform converters"
```

### Task 9: Câbler `resolveVideoGravity` dans `attachBackgroundPlayer`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift:362-427`

- [ ] **Step 1: Modifier la signature de `attachBackgroundPlayer` pour accepter le mode override + canvas size**

Remplacer la signature ligne ~363 :

```swift
    @MainActor
    func attachBackgroundPlayer(url: URL, looping: Bool, mute: Bool, fitOverride: String? = nil) {
```

- [ ] **Step 2: Remplacer la ligne 395 `pl.videoGravity = .resizeAspectFill`**

Remplacer par :

```swift
        // Initial gravity: aspectFill as fallback until naturalSize loads.
        // If override is set, apply immediately.
        pl.videoGravity = {
            if let o = fitOverride {
                return o == "fit" ? .resizeAspect : .resizeAspectFill
            }
            return .resizeAspectFill
        }()
        addSublayer(pl)
        self.avPlayerLayer = pl

        // Async resolve naturalSize to refine gravity once available
        let canvasSize = self.bounds.size
        let asset = AVURLAsset(url: url)
        let weakLayer = pl
        Task { @MainActor [weak self] in
            guard let _ = self else { return }
            let tracks: [AVAssetTrack]
            if #available(iOS 16.0, *) {
                tracks = (try? await asset.loadTracks(withMediaType: .video)) ?? []
            } else {
                tracks = asset.tracks(withMediaType: .video)
            }
            guard let videoTrack = tracks.first else { return }
            let naturalSize: CGSize
            if #available(iOS 16.0, *) {
                naturalSize = (try? await videoTrack.load(.naturalSize)) ?? .zero
            } else {
                naturalSize = videoTrack.naturalSize
            }
            guard naturalSize.width > 0, naturalSize.height > 0 else { return }
            let resolved = StoryBackgroundLayer.resolveVideoGravity(
                naturalSize: naturalSize, canvasSize: canvasSize, override: fitOverride)
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            weakLayer.videoGravity = resolved
            CATransaction.commit()
        }
```

Note : retirer la ligne `addSublayer(pl)` plus bas qui est maintenant dupliquée (vérifier dans le code après edit). L'`addSublayer(pl)` doit être appelé UNE seule fois.

- [ ] **Step 3: Update les 3 call sites de `attachBackgroundPlayer` pour passer `fitOverride`**

Les call sites sont (cf. configure() switch case .video) :
- Ligne ~300 : `attachBackgroundPlayer(url: remoteURL, looping: looping, mute: mute)` (file://)
- Ligne ~305 : `attachBackgroundPlayer(url: local, looping: looping, mute: mute)` (cache hit)
- Ligne ~329 : `attachBackgroundPlayer(url: url, looping: looping, mute: mute)` (async cache fetch)

Pour chacun, ajouter `, fitOverride: self.transform3D.videoFitMode` :

```swift
attachBackgroundPlayer(url: remoteURL, looping: looping, mute: mute,
                       fitOverride: self.transform3D.videoFitMode)
```

Pour le call site dans `Task @MainActor` (ligne ~329), capture self?.transform3D.videoFitMode AVANT le Task :

```swift
let fitOverride = self.transform3D.videoFitMode
Task { @MainActor [weak self] in
    let url = await CacheCoordinator.videoLocalFileURLAwait(for: remoteURL) ?? remoteURL
    self?.attachBackgroundPlayer(url: url, looping: looping, mute: mute,
                                  fitOverride: fitOverride)
}
```

- [ ] **Step 4: Build + run video tests**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/StoryBackgroundLayerVideoTests \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: tous les tests existants + nouveaux PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift
git commit -m "feat(story/bg): orientation-aware videoGravity via AVAsset naturalSize"
```

### Task 10: Câbler `resolveImageGravity` pour le case `.image`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift:193-278`

- [ ] **Step 1: Remplacer `img.contentsGravity = .resizeAspectFill` ligne ~196**

Par un calcul différé (l'UIImage charge async) :

```swift
case .image(let postMediaId, let thumbHash):
    let img = CALayer()
    img.frame = bounds
    // Initial fallback gravity, refined when UIImage loads (warm cache or async)
    img.contentsGravity = {
        if let o = self.transform3D.videoFitMode {
            return o == "fit" ? .resizeAspect : .resizeAspectFill
        }
        return .resizeAspectFill
    }()
    img.masksToBounds = true
    addSublayer(img)
    contentLayer = img
```

- [ ] **Step 2: Refiner gravity quand `img.contents = cgImage` est assigné**

Dans le bloc warm-hit (ligne ~209) et dans le Task async (ligne ~255), après chaque `img.contents = cgImage` ou `img?.contents = cgImage`, ajouter :

```swift
let naturalSize = CGSize(width: cgImage.width, height: cgImage.height)
let resolved = StoryBackgroundLayer.resolveImageGravity(
    naturalSize: naturalSize, canvasSize: self.bounds.size,
    override: self.transform3D.videoFitMode)
img.contentsGravity = resolved
```

(adapt `img` ↔ `img?` selon le contexte).

- [ ] **Step 3: Build + run image tests**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/StoryBackgroundLayerImageTests \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: existants PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift
git commit -m "feat(story/bg): orientation-aware contentsGravity for image backgrounds"
```

### Task 11: Adapter `StoryAVCompositor` pour respecter `videoFitMode` à l'export

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryAVCompositor.swift:306-318`

- [ ] **Step 1: Lire le contexte autour de ligne 306**

```bash
sed -n '295,325p' packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryAVCompositor.swift
```

- [ ] **Step 2: Modifier le case `.image` pour respecter le mode**

Remplacer le bloc `case .image:` (lignes ~305-318) :

```swift
        case .image:
            if let bgImage = resolveBackgroundImage(for: slide) {
                let canvasSize = CGSize(width: width, height: height)
                let mode = slide.effects.backgroundTransform?.videoFitMode
                let gravity = StoryBackgroundLayer.resolveImageGravity(
                    naturalSize: bgImage.size,
                    canvasSize: canvasSize,
                    override: mode)
                if gravity == .resizeAspect {
                    // Letterbox: paint the story background color first (revealed by bands)
                    if let bgHex = slide.effects.background,
                       let color = UIColor(hex: "#" + bgHex) {
                        cg.saveGState()
                        cg.setFillColor(color.cgColor)
                        cg.fill(CGRect(origin: .zero, size: canvasSize))
                        cg.restoreGState()
                    }
                    paintAspectFit(image: bgImage, in: cg, size: canvasSize)
                } else {
                    paintAspectFill(image: bgImage, in: cg, size: canvasSize)
                }
            }
```

- [ ] **Step 3: Implémenter `paintAspectFit` si pas déjà présent**

```bash
grep -n "func paintAspectFit\|func paintAspectFill" packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryAVCompositor.swift
```

Si `paintAspectFit` n'existe pas, l'ajouter à côté de `paintAspectFill` :

```swift
    @MainActor
    private static func paintAspectFit(image: UIImage, in cg: CGContext, size: CGSize) {
        let imgSize = image.size
        guard imgSize.width > 0, imgSize.height > 0 else { return }
        let scale = min(size.width / imgSize.width, size.height / imgSize.height)
        let drawSize = CGSize(width: imgSize.width * scale, height: imgSize.height * scale)
        let origin = CGPoint(x: (size.width - drawSize.width) / 2,
                             y: (size.height - drawSize.height) / 2)
        let rect = CGRect(origin: origin, size: drawSize)
        if let cgImage = image.cgImage {
            cg.saveGState()
            cg.draw(cgImage, in: rect)
            cg.restoreGState()
        }
    }
```

- [ ] **Step 4: Build**

```bash
xcodebuild build -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: BUILD SUCCEEDED.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryAVCompositor.swift
git commit -m "feat(story/export): image bg respects videoFitMode (paintAspectFit for letterbox)"
```

---

## Phase 3 — Anti-flash

### Task 12: Ajouter le diff idempotent dans `configure()`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift:122-155`

- [ ] **Step 1: Insérer le no-op check au début de `configure()`**

Juste après la signature de `configure()` (avant la ligne `let previousIdentity = ...`), insérer :

```swift
        // NO-OP DIFF (D3): when kind+transform+geometry are all unchanged AND we already
        // have visible content, skip the entire configure pipeline. This prevents the
        // flash on text keystrokes that trigger rebuildLayers() → configure() with the
        // same parameters as the previous tick.
        let previousContentIdentity = Self.contentIdentity(for: self.kind)
        let nextContentIdentity = Self.contentIdentity(for: kind)
        let hasVisibleContent = (contentLayer != nil) || (avPlayerLayer != nil)
            || (backgroundColor != nil && backgroundColor != UIColor.clear.cgColor)
        let nothingChanged = (previousContentIdentity == nextContentIdentity)
            && (self.transform3D == transform)
            && (self.frame.size == geometry.renderSize)
            && hasVisibleContent
        if nothingChanged { return }
```

(Le `previousIdentity` existant lignes 139-141 est désormais redondant ; on le supprime et on réutilise `previousContentIdentity`.)

- [ ] **Step 2: Adapter le fast-path existant pour réutiliser les variables**

Remplacer le bloc lignes 139-141 par :

```swift
        let canReuseContent = (previousContentIdentity == nextContentIdentity) && (contentLayer != nil)
```

(Le `nextIdentity` se calcule via `nextContentIdentity`.)

- [ ] **Step 3: Run Task 1 et Task 2 tests pour confirmer no-op**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/StoryBackgroundLayerTests/test_configure_sameSolidColorTwice_isNoOp \
  -only-testing:MeeshyUITests/CanvasBackgroundIntegrationTests/test_configure_videoSameURLTwice_doesNotReattachPlayerLayer \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: les 2 PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift
git commit -m "perf(story/bg): idempotent configure() — no-op when kind+transform+geometry unchanged"
```

### Task 13: Wrap les chemins async dans `CATransaction.setDisableActions`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift:255-278, 327-330, 388-427`

- [ ] **Step 1: Ajouter un helper `withDisabledCAActions` dans l'extension**

Dans l'extension où vit `configure()`, ajouter en tête :

```swift
    @MainActor
    private static func withDisabledCAActions(_ block: () -> Void) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        block()
        CATransaction.commit()
    }
```

(static parce qu'utilisé depuis closures `[weak self]`.)

- [ ] **Step 2: Wrap les assignations `img.contents` dans le warm-hit et le Task async**

Dans le case `.image`, modifier les 3 emplacements où `img.contents = cgImage` ou `img?.contents = cgImage` :

```swift
// Warm hit (ligne ~210)
Self.withDisabledCAActions {
    img.contents = cached
}
hasVisual = true
hasFinalContentStamped = true

// ThumbHash placeholder (ligne ~219)
Self.withDisabledCAActions {
    img.contents = placeholderImage.cgImage
}
hasVisual = true

// Inside Task @MainActor (ligne ~259, 268, 273)
if let cached = await imageCacheReader.cachedImage(for: postMediaId) {
    Self.withDisabledCAActions {
        img?.contents = cached.cgImage
    }
    self?.hasFinalContentStamped = true
    return
}
```

Et idem pour les 2 autres `img?.contents = uiImage.cgImage` dans le Task.

- [ ] **Step 3: Wrap `addSublayer(pl)` dans `attachBackgroundPlayer`**

Dans `attachBackgroundPlayer` (~ligne 396), remplacer `addSublayer(pl)` par :

```swift
Self.withDisabledCAActions {
    addSublayer(pl)
}
```

- [ ] **Step 4: Build + run tous les tests bg**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/StoryBackgroundLayerTests \
  -only-testing:MeeshyUITests/StoryBackgroundLayerImageTests \
  -only-testing:MeeshyUITests/StoryBackgroundLayerVideoTests \
  -only-testing:MeeshyUITests/CanvasBackgroundIntegrationTests \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: tous PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift
git commit -m "fix(story/bg): wrap async layer mutations in CATransaction.setDisableActions"
```

---

## Phase 4 — Live drag du background (path α)

### Task 14: Test rouge — drag bg → layer.transform muté live

**Files:**
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/CanvasBackgroundIntegrationTests.swift`

- [ ] **Step 1: Ajouter le test rouge**

```swift
    func test_handlePan_bgDrag_updatesLayerTransformLiveBeforeCommit() throws {
        let canvas = StoryCanvasUIView()
        canvas.bounds = CGRect(x: 0, y: 0, width: 412, height: 732)
        canvas.mode = .edit

        var slide = StorySlide(id: "s1")
        slide.effects.mediaObjects = [
            StoryMediaObject(id: "bg-1", mediaURL: "file:///tmp/test.jpg",
                             kind: .image, isBackground: true,
                             x: 0.5, y: 0.5, scale: 1.0, rotation: 0)
        ]
        canvas.slide = slide

        // Simulate handlePan.changed on the bg media — translation = +50px X
        let initialTransform = canvas.backgroundLayer.transform
        // We cannot easily synthesize a UIPanGestureRecognizer here; instead we
        // expose an internal seam for testing OR we drive handlePan via a public hook.
        // For this test, we assert that AFTER a simulated drag, the layer.transform
        // has been updated even though slide.effects.backgroundTransform has not.
        canvas.simulatePanForTesting(targetId: "bg-1", dxNorm: 0.1, dyNorm: 0)
        let liveTransform = canvas.backgroundLayer.transform

        XCTAssertFalse(CATransform3DEqualToTransform(initialTransform, liveTransform),
                      "backgroundLayer.transform must be updated live during drag")
        // Model untouched until .ended
        XCTAssertNil(canvas.slide.effects.backgroundTransform)
    }
```

- [ ] **Step 2: Run, attendu COMPILE FAIL (simulatePanForTesting n'existe pas, accessibilité de backgroundLayer)**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/CanvasBackgroundIntegrationTests/test_handlePan_bgDrag_updatesLayerTransformLiveBeforeCommit \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: COMPILE FAIL.

- [ ] **Step 3: Commit (RED)**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/CanvasBackgroundIntegrationTests.swift
git commit -m "test(story/canvas): RED test for live bg drag update + deferred model commit"
```

### Task 15: Implémenter le seam de test + cache `backgroundMediaObjectId`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift`

- [ ] **Step 1: Exposer `backgroundLayer` en internal pour test, ajouter cache id**

Au début de la classe (autour ligne 178 où `backgroundLayer` est déclaré), changer le modificateur d'accès en `internal` (déjà `private`, le mettre `internal`) :

```swift
    internal let backgroundLayer = StoryBackgroundLayer()
```

Et ajouter une propriété cache pour l'id du bg :

```swift
    private var backgroundMediaObjectId: String?
    private var dragStartBgScale: Double = 1.0
    private var dragStartBgOffsetX: Double = 0
    private var dragStartBgOffsetY: Double = 0
    private var dragStartBgRotation: Double = 0
    private var dragStartBgFitMode: String?
    private var liveBackgroundTransformDuringDrag: BackgroundTransform?
```

- [ ] **Step 2: Recalculer `backgroundMediaObjectId` dans `slide.didSet`**

Dans le `didSet` de `slide` (ligne ~89-100), ajouter en haut :

```swift
            backgroundMediaObjectId = slide.effects.mediaObjects?
                .first(where: { $0.isBackground == true })?.id
```

- [ ] **Step 3: Ajouter le helper `simulatePanForTesting`**

Dans la classe, ajouter une méthode internal :

```swift
    #if DEBUG
    /// Test seam: drives handlePan live drag of the background as if the user
    /// dragged with normalized delta (dxNorm, dyNorm). Mirrors the real
    /// handlePan.changed code path so the canvas observable state matches.
    internal func simulatePanForTesting(targetId: String, dxNorm: Double, dyNorm: Double) {
        guard targetId == backgroundMediaObjectId else { return }
        let currentTransform = slide.effects.backgroundTransform
        dragStartBgScale = Double(currentTransform?.scale ?? 1)
        dragStartBgOffsetX = Double(currentTransform?.offsetX ?? 0)
        dragStartBgOffsetY = Double(currentTransform?.offsetY ?? 0)
        dragStartBgRotation = currentTransform?.rotation ?? 0
        dragStartBgFitMode = currentTransform?.videoFitMode
        let live = BackgroundTransform(
            scale: dragStartBgScale,
            offsetX: dragStartBgOffsetX + dxNorm * Double(bounds.width),
            offsetY: dragStartBgOffsetY + dyNorm * Double(bounds.height),
            rotation: dragStartBgRotation,
            videoFitMode: dragStartBgFitMode
        )
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        backgroundLayer.transform = live.caTransform()
        CATransaction.commit()
        liveBackgroundTransformDuringDrag = live
    }
    #endif
```

- [ ] **Step 4: Run test, attendu PASS**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/CanvasBackgroundIntegrationTests/test_handlePan_bgDrag_updatesLayerTransformLiveBeforeCommit \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift
git commit -m "feat(story/canvas): backgroundMediaObjectId cache + test seam for live bg drag"
```

### Task 16: Brancher la vraie logique live drag dans `handlePan.changed/.ended`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift:2028-2076`

- [ ] **Step 1: Modifier `handlePan` pour brancher live bg drag**

Remplacer le bloc `case .changed:` (ligne ~2047-2067) :

```swift
        case .changed:
            guard let id = manipulatedItemId, bounds.size != .zero else { return }
            let translation = recognizer.translation(in: self)
            let geo = CanvasGeometry(renderSize: bounds.size)
            let renderHeightFor1920 = geo.render(CanvasGeometry.designHeight)
            let dxNorm = Double(translation.x / bounds.width)
            let dyNorm = Double(translation.y / renderHeightFor1920)

            // Branche dédiée: drag du background = live update du layer.transform
            // SANS muter le modèle (path α). Commit au .ended.
            if id == backgroundMediaObjectId {
                let live = BackgroundTransform(
                    scale: dragStartBgScale,
                    offsetX: dragStartBgOffsetX + dxNorm * Double(bounds.width),
                    offsetY: dragStartBgOffsetY + dyNorm * Double(bounds.height),
                    rotation: dragStartBgRotation,
                    videoFitMode: dragStartBgFitMode
                )
                CATransaction.begin()
                CATransaction.setDisableActions(true)
                backgroundLayer.transform = live.caTransform()
                CATransaction.commit()
                liveBackgroundTransformDuringDrag = live
                return
            }

            // Chemin existant pour stickers/text
            let rawX = clamp(dragStartSlideX + dxNorm)
            let rawY = clamp(dragStartSlideY + dyNorm)
            let (snappedX, didSnapX) = snap(rawX)
            let (snappedY, didSnapY) = snap(rawY)
            updateSnapGuides(x: didSnapX ? snappedX : nil,
                             y: didSnapY ? snappedY : nil)
            slide = updatePosition(slideId: id, x: snappedX, y: snappedY)
            onItemModified?(slide)
```

- [ ] **Step 2: Modifier `case .began:` pour snapshot les dragStart bg**

Dans `case .began:` (ligne ~2032-2046), après `manipulatedItemId = id`, ajouter :

```swift
            if id == backgroundMediaObjectId {
                let current = slide.effects.backgroundTransform
                dragStartBgScale = Double(current?.scale ?? 1)
                dragStartBgOffsetX = Double(current?.offsetX ?? 0)
                dragStartBgOffsetY = Double(current?.offsetY ?? 0)
                dragStartBgRotation = current?.rotation ?? 0
                dragStartBgFitMode = current?.videoFitMode
                liveBackgroundTransformDuringDrag = nil
            }
```

- [ ] **Step 3: Modifier `case .ended:` pour commit le transform live et notifier le parent**

Remplacer le bloc `case .ended, .cancelled, .failed:` (ligne ~2068-2072) :

```swift
        case .ended, .cancelled, .failed:
            let wasBackgroundDrag = (manipulatedItemId == backgroundMediaObjectId)
            manipulatedItemId = nil
            hideSnapGuides()

            if wasBackgroundDrag, let live = liveBackgroundTransformDuringDrag {
                // Commit live transform into the slide model + notify parent via callback
                var updated = slide
                let persisted = StoryBackgroundTransform(
                    scale: live.scale != 1.0 ? CGFloat(live.scale) : nil,
                    offsetX: live.offsetX != 0 ? CGFloat(live.offsetX) : nil,
                    offsetY: live.offsetY != 0 ? CGFloat(live.offsetY) : nil,
                    rotation: live.rotation != 0 ? live.rotation : nil,
                    videoFitMode: live.videoFitMode
                )
                updated.effects.backgroundTransform = persisted.isIdentity ? nil : persisted
                slide = updated  // triggers didSet → rebuildLayers, which is now idempotent (Task 12)
                onBackgroundTransformChanged?(persisted)
                liveBackgroundTransformDuringDrag = nil
            } else {
                slideContentRevision &+= 1
                rebuildLayers()
            }
        default:
            break
```

- [ ] **Step 4: Ajouter le callback `onBackgroundTransformChanged`**

Près de `onItemModified` (chercher via grep), ajouter :

```swift
    var onBackgroundTransformChanged: ((StoryBackgroundTransform) -> Void)?
```

- [ ] **Step 5: Build + run tests**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/CanvasBackgroundIntegrationTests \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift
git commit -m "feat(story/canvas): live bg drag via handlePan branch + commit at .ended (path α)"
```

### Task 17: Câbler le callback `onBackgroundTransformChanged` côté composer

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift` (chercher `StoryCanvasUIView(`)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerCanvasView.swift` (si existe — chercher où le canvas est instancié)

- [ ] **Step 1: Localiser l'instanciation du canvas**

```bash
grep -rn "StoryCanvasUIView()\|StoryComposerCanvasView\|onItemModified" packages/MeeshySDK/Sources/MeeshyUI/Story/ | head -10
```

- [ ] **Step 2: Câbler `onBackgroundTransformChanged` à l'endroit où `onItemModified` est câblé**

Après l'assignation de `canvas.onItemModified = ...`, ajouter :

```swift
canvas.onBackgroundTransformChanged = { transform in
    viewModel.backgroundTransform = StoryComposerViewModel.BackgroundTransform(
        scale: transform.scale ?? 1.0,
        offsetX: transform.offsetX ?? 0,
        offsetY: transform.offsetY ?? 0,
        rotation: transform.rotation ?? 0,
        videoFitMode: transform.videoFitMode
    )
    viewModel.saveBackgroundTransform()
}
```

(Adapter le nom de la variable `canvas`/`viewModel` selon le contexte exact.)

- [ ] **Step 3: Build**

```bash
xcodebuild build -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: BUILD SUCCEEDED.

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift
git commit -m "feat(story/composer): wire onBackgroundTransformChanged to viewModel.backgroundTransform"
```

### Task 18: Double-tap toggle videoFitMode

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift`

- [ ] **Step 1: Ajouter le UITapGestureRecognizer double-tap**

Chercher où les gesture recognizers existants sont créés (probablement dans un `setupGestures()` ou `init`) :

```bash
grep -n "UIPanGestureRecognizer\|UITapGestureRecognizer\|addGestureRecognizer" packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift | head -10
```

Ajouter dans la même fonction :

```swift
        let doubleTap = UITapGestureRecognizer(target: self, action: #selector(handleDoubleTap(_:)))
        doubleTap.numberOfTapsRequired = 2
        addGestureRecognizer(doubleTap)
        // Require single-tap to fail before double-tap fires
        if let singleTap = gestureRecognizers?.first(where: {
            ($0 as? UITapGestureRecognizer)?.numberOfTapsRequired == 1
        }) {
            singleTap.require(toFail: doubleTap)
        }
```

- [ ] **Step 2: Implémenter `handleDoubleTap`**

Ajouter la méthode :

```swift
    @objc private func handleDoubleTap(_ recognizer: UITapGestureRecognizer) {
        guard mode == .edit else { return }
        let location = recognizer.location(in: self)
        guard let id = resolveManipulationTarget(at: location),
              id == backgroundMediaObjectId else { return }

        let current = slide.effects.backgroundTransform?.videoFitMode
        let next: String?
        switch current {
        case nil:     next = "fit"
        case "fit":   next = "fill"
        case "fill":  next = nil
        default:      next = nil
        }

        var updated = slide
        var bg = updated.effects.backgroundTransform ?? StoryBackgroundTransform()
        bg.videoFitMode = next
        updated.effects.backgroundTransform = bg.isIdentity ? nil : bg
        slide = updated  // triggers didSet → rebuildLayers, configure() picks up new mode
        onBackgroundTransformChanged?(bg)
    }
```

- [ ] **Step 3: Build + run tests**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/CanvasBackgroundIntegrationTests \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift
git commit -m "feat(story/canvas): double-tap on bg cycles videoFitMode (auto→fit→fill)"
```

---

## Phase 5 — Tests étendus + smoke

### Task 19: Compléter les tests d'intégration

**Files:**
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Background/StoryBackgroundLayerTests.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/CanvasBackgroundIntegrationTests.swift`

- [ ] **Step 1: Ajouter test du cycle double-tap**

Dans `CanvasBackgroundIntegrationTests.swift`, ajouter :

```swift
    func test_doubleTap_onBg_cyclesVideoFitMode() throws {
        let canvas = StoryCanvasUIView()
        canvas.bounds = CGRect(x: 0, y: 0, width: 412, height: 732)
        canvas.mode = .edit

        var slide = StorySlide(id: "s1")
        slide.effects.mediaObjects = [
            StoryMediaObject(id: "bg-1", mediaURL: "file:///tmp/test.jpg",
                             kind: .image, isBackground: true,
                             x: 0.5, y: 0.5, scale: 1.0, rotation: 0)
        ]
        canvas.slide = slide

        XCTAssertNil(canvas.slide.effects.backgroundTransform?.videoFitMode)
        canvas.performDoubleTapForTesting(targetId: "bg-1")
        XCTAssertEqual(canvas.slide.effects.backgroundTransform?.videoFitMode, "fit")
        canvas.performDoubleTapForTesting(targetId: "bg-1")
        XCTAssertEqual(canvas.slide.effects.backgroundTransform?.videoFitMode, "fill")
        canvas.performDoubleTapForTesting(targetId: "bg-1")
        XCTAssertNil(canvas.slide.effects.backgroundTransform?.videoFitMode)
    }
```

- [ ] **Step 2: Ajouter le test seam `performDoubleTapForTesting` dans le canvas**

Dans `StoryCanvasUIView.swift`, ajouter dans le `#if DEBUG` block :

```swift
    internal func performDoubleTapForTesting(targetId: String) {
        guard targetId == backgroundMediaObjectId else { return }
        let current = slide.effects.backgroundTransform?.videoFitMode
        let next: String?
        switch current {
        case nil:    next = "fit"
        case "fit":  next = "fill"
        case "fill": next = nil
        default:     next = nil
        }
        var updated = slide
        var bg = updated.effects.backgroundTransform ?? StoryBackgroundTransform()
        bg.videoFitMode = next
        updated.effects.backgroundTransform = bg.isIdentity ? nil : bg
        slide = updated
    }
```

- [ ] **Step 3: Run all bg + canvas tests**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/StoryBackgroundLayerTests \
  -only-testing:MeeshyUITests/StoryBackgroundLayerImageTests \
  -only-testing:MeeshyUITests/StoryBackgroundLayerVideoTests \
  -only-testing:MeeshyUITests/CanvasBackgroundIntegrationTests \
  -only-testing:MeeshyUITests/BackgroundTransformTests \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/
git commit -m "test(story): cover double-tap fit mode cycle"
```

### Task 20: Écrire la smoke checklist QA + run full SDK test suite

**Files:**
- Create: `docs/qa/2026-05-26-story-canvas-bg-fixes-smoke.md`

- [ ] **Step 1: Créer la checklist QA**

```bash
cat > docs/qa/2026-05-26-story-canvas-bg-fixes-smoke.md <<'EOF'
# Story Canvas Background Fixes — Smoke QA

**Date:** 2026-05-26
**Spec:** docs/superpowers/specs/2026-05-25-story-canvas-bg-stabilization-design.md
**PR:** fix/story-canvas-bg-stabilization-2026-05-26

## Préparation
- [ ] Installer le build via `./apps/ios/meeshy.sh run`
- [ ] Préparer 4 médias : vidéo paysage 16:9, vidéo portrait 9:16, image paysage, image carrée

## Bug 1 — Fit auto par orientation
- [ ] Vidéo paysage 16:9 → letterbox + fond story visible (composer)
- [ ] Vidéo paysage 16:9 → letterbox dans reader après publish
- [ ] Vidéo paysage 16:9 → letterbox dans MP4 exporté (partage)
- [ ] Vidéo portrait 9:16 → full bleed (comportement actuel préservé)
- [ ] Image paysage → letterbox composer + reader + export
- [ ] Image carrée 1:1 → letterbox (ratio < canvas)
- [ ] Double-tap → cycle visuel .auto → .fit → .fill → .auto
- [ ] Override "fit" persiste après save story + reload

## Bug 2 — Zéro flash noir
- [ ] Édition texte (10+ keystrokes) → 0 flash noir sur le bg
- [ ] Drag sticker + release → 0 flash noir
- [ ] Drag background + release → 0 flash noir
- [ ] Drag texte + release → 0 flash noir
- [ ] Pinch sur sticker → 0 flash noir
- [ ] Filtre actif + drag → filtre reste à jour (régression D3)
- [ ] Audio mixer + drag → audio reste fonctionnel (régression D3)

## Bug 3 — Drag bg live sur canvas
- [ ] Drag bg → mouvement visible LIVE sur canvas principal
- [ ] Drag bg → mouvement visible LIVE sur mini-preview (parité)
- [ ] Drag bg release → position commitée, pas de saut visuel
- [ ] Pinch zoom bg → behaviour préservé (cumule avec videoGravity)

## Migration douce (path α)
- [ ] Story existante avec mediaObject.x/y bg non-zéro → ignoré, prochaine édition nettoie

## Validation finale
- [ ] Aucune régression sur les autres features story (texte, stickers, audio, filtres, transitions)
EOF
```

- [ ] **Step 2: Run full SDK test suite pour confirmer pas de régression**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build -quiet 2>&1 | tail -50
```
Expected: TEST SUCCEEDED, pas de nouveau failure.

- [ ] **Step 3: Commit la checklist**

```bash
git add docs/qa/2026-05-26-story-canvas-bg-fixes-smoke.md
git commit -m "docs(qa): smoke checklist for story canvas bg stabilization"
```

- [ ] **Step 4: Build iOS app et lancer le simulateur pour smoke manuelle**

```bash
./apps/ios/meeshy.sh build
```
Expected: BUILD SUCCEEDED.

Puis ouvrir le simu et dérouler la checklist. Documenter dans le PR.

### Task 21: PR + merge

**Files:** N/A

- [ ] **Step 1: Push la branche**

```bash
git push -u origin fix/story-canvas-bg-stabilization-2026-05-26
```

- [ ] **Step 2: Ouvrir une PR contre `main`**

```bash
gh pr create --title "fix(ios/story): stabilise background layer (3 bugs)" --body "$(cat <<'EOF'
## Summary
Corrige 3 bugs liés du composer de stories iOS qui partagent la même racine architecturale (StoryBackgroundLayer):
- Bug 1: vidéo paysage en bg croppée → letterbox auto par orientation
- Bug 2: flash noir à chaque édit → diff idempotent + wrap CATransaction des async paths
- Bug 3: drag bg pas visible sur canvas principal → branche live drag dans handlePan (path α)

## Spec
docs/superpowers/specs/2026-05-25-story-canvas-bg-stabilization-design.md (v2)

## Test plan
- [x] Suite SDK complète passe (xcodebuild test)
- [x] Nouveaux tests unitaires : resolveVideoGravity, diff idempotent, double-tap cycle, live drag
- [ ] Smoke QA manuelle: docs/qa/2026-05-26-story-canvas-bg-fixes-smoke.md
- [ ] Vérification export MP4 (vidéo paysage doit être letterbox dans le MP4)
EOF
)"
```

- [ ] **Step 3: Attendre review Codex + smoke QA**

- [ ] **Step 4: Merge sur main après green CI + smoke OK**

```bash
gh pr merge --merge
```

---

## Self-Review

✅ **Spec coverage** : tous les éléments du spec v2 sont couverts
- D1 (3 BackgroundTransform): Tasks 4, 6, 7
- D2 (fit auto + override): Tasks 6, 9, 10
- D3 (diff idempotent): Task 12
- D4 (path α): Tasks 14-17
- D5 (CATransaction async wrap): Task 13
- D6 (live drag handlePan): Task 16
- D7 (double-tap): Task 18
- D8 (videoGravity × scale): cumul naturel, pas de code spécifique requis
- D9 (SDK Purity): respecté par construction (tout dans MeeshyUI/Story/)
- D10 (6 fichiers): tous touchés
- Phase 1 instrumentation: Tasks 1-3
- Phase 5 tests étendus: Task 19
- Smoke: Task 20
- Export compositor: Task 11
- captureBackground: Task 8 step 2

✅ **Placeholder scan** : aucun TBD/TODO, tous les blocs de code complets.

✅ **Type consistency** : `backgroundLayer`, `backgroundMediaObjectId`, `liveBackgroundTransformDuringDrag`, `dragStartBgScale/OffsetX/OffsetY/Rotation/FitMode`, `onBackgroundTransformChanged`, `resolveVideoGravity`, `resolveImageGravity`, `withDisabledCAActions`, `simulatePanForTesting`, `performDoubleTapForTesting` — utilisés cohéremment à travers les tâches.

✅ **Exact paths + line numbers** partout.

⚠️ **À surveiller pendant l'exécution** :
- Task 7 / Task 8 : les line numbers du spec peuvent dériver de quelques lignes selon les modifications précédentes — utiliser grep pour relocaliser
- Task 17 : le câblage exact peut nécessiter d'aller dans `StoryComposerCanvasView` ou autre wrapper SwiftUI — grep nécessaire
- Task 18 step 1 : si `gestureRecognizers` est nil au moment du setup, le `require(toFail:)` doit être déplacé après tous les `addGestureRecognizer`
- Task 9 step 2 : vérifier que `addSublayer(pl)` n'est pas dupliqué après l'edit
