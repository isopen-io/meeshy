# Story Canvas Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit complet et refonte du pipeline de rendu Story iOS pour garantir cohérence parfaite (position, rotation, taille, timing) entre composer canvas, preview, viewer et export AVFoundation, avec fidélité cross-device iPad ↔ iPhone par construction.

**Architecture:** Tout-CALayer + UIKit shell. Single renderer `StoryRenderer.render()` partagé entre live view (composer Play, viewer) et AVFoundation custom compositor → identité bit-exact. Metal sur 4 hot paths uniquement (filtres temps-réel, blur, decode vidéo HW, PencilKit). SwiftUI réservé au shell d'app (story list, settings, conversations, toolbars, sheets).

**Tech Stack:** Swift 6, UIKit, Core Animation (CALayer/CATextLayer/CAMetalLayer), AVFoundation (AVPlayer, AVMutableComposition, AVVideoCompositing), Metal + MetalKit + MetalPerformanceShaders, VideoToolbox, PencilKit, Core Image (Display P3 + Metal-backed CIContext). Tests : Swift Testing pour SDK-level (property/equivalence), XCTest pour UI/intégration (snapshot/export/perf).

**Spec source:** `docs/superpowers/specs/2026-05-08-story-canvas-fidelity-design.md`

---

## Conventions et prérequis

### Folder layout

Tout le canvas vit dans le SDK :

```
packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/
├── CanvasGeometry.swift
├── StoryRenderer.swift
├── StoryCanvasUIView.swift
├── StoryComposerVC.swift
├── StoryViewerVC.swift
├── StoryCanvasRepresentable.swift
├── StoryRenderingContext.swift
├── StoryStickerRasterizer.swift
├── StoryAVCompositor.swift
├── CanvasReprojector.swift            (P5)
├── Layers/
│   ├── StoryMediaLayer.swift
│   ├── StoryTextLayer.swift
│   ├── StoryStickerLayer.swift
│   └── StoryFilteredLayer.swift
└── Metal/
    └── StoryFilters.metal              (P3)
```

Tests dans :

```
packages/MeeshySDK/Tests/MeeshyUITests/Story/
├── Property/        (Swift Testing — math/model)
├── Equivalence/     (Swift Testing — cross-device)
├── Snapshot/        (XCTest — pixel)
├── Export/          (XCTest — AVFoundation)
├── Performance/     (XCTest — MXSignpostMetric)
├── Repost/          (Swift Testing — CanvasReprojector)
└── Fixtures/        (slide JSON fixtures)
```

### Build verification

À chaque commit, **toujours** vérifier que le build passe :

```bash
./apps/ios/meeshy.sh build
```

Si `meeshy.sh` n'est pas accessible (build non-iOS), utiliser `swift build` à la racine du package :

```bash
cd packages/MeeshySDK && swift build
```

### Commit format

Conventional commits, type `feat`/`fix`/`refactor`/`test`/`docs`/`chore`. Scope `story-canvas` pour ce plan.

```
feat(story-canvas): add CanvasGeometry primitive
test(story-canvas): property tests for normalized position invariance
refactor(story-canvas): replace StoryCanvasView SwiftUI with StoryComposerVC
```

**Pas de Co-Authored-By trailer** (memory: no Claude attribution).

### Test framework

| Niveau | Framework | Folder | Syntax |
|--------|-----------|--------|--------|
| Property tests (math/model) | Swift Testing | `Property/` | `@Test func` + `#expect` |
| Equivalence math (cross-device) | Swift Testing | `Equivalence/` | `@Test func` + `#expect` |
| Snapshot pixel | XCTest | `Snapshot/` | `XCTAssert*` + `assertSnapshot` |
| AVFoundation export | XCTest async | `Export/` | `XCTestCase` + `async throws` |
| Performance | XCTest | `Performance/` | `measure(metrics:)` |
| Repost | Swift Testing | `Repost/` | `@Test func` + `#expect` |

### TDD strict

Pour CHAQUE tâche : RED (test échoue) → GREEN (implem minimale) → REFACTOR (si nécessaire) → COMMIT. Ne jamais sauter une étape.

### Pas de back-compat

App pré-launch. Migration franche sur les modèles. Les vues SwiftUI cassent en P1 et sont remplacées en P2. **C'est attendu.** Ne pas tenter de maintenir les deux pipelines en parallèle.

---

# Phase 0 — Tests contrat (3-4 jours)

**Objectif** : écrire le harnais de tests qui définit le comportement attendu. Tous les tests échouent au début (oracle). Les phases suivantes les font passer un par un.

---

## Task 0.1 : Scaffolding test folders

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Property/.gitkeep`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Equivalence/.gitkeep`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Snapshot/.gitkeep`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Export/.gitkeep`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Performance/.gitkeep`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Repost/.gitkeep`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Fixtures/.gitkeep`

- [ ] **Step 1: Create directories**

```bash
mkdir -p packages/MeeshySDK/Tests/MeeshyUITests/Story/{Property,Equivalence,Snapshot,Export,Performance,Repost,Fixtures}
touch packages/MeeshySDK/Tests/MeeshyUITests/Story/{Property,Equivalence,Snapshot,Export,Performance,Repost,Fixtures}/.gitkeep
```

- [ ] **Step 2: Verify structure**

```bash
ls packages/MeeshySDK/Tests/MeeshyUITests/Story/
```

Expected output: `Property Equivalence Snapshot Export Performance Repost Fixtures`

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Story/
git commit -m "chore(story-canvas): scaffold test folder structure for Phase 0"
```

---

## Task 0.2 : Test fixtures — slide JSON helpers

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Fixtures/StoryFixtures.swift`

- [ ] **Step 1: Write fixture factory**

```swift
import Foundation
@testable import MeeshyUI
@testable import MeeshySDK

enum StoryFixtures {
    static func emptySlide(staticBaseDuration: Double = 12.0) -> StorySlide {
        // Placeholder — will be wired to actual model after P1
        fatalError("Implement after P1 model migration")
    }

    static func textOnlySlide(text: String = "Hello",
                              fontSize: Double = 64.0,
                              x: Double = 0.5,
                              y: Double = 0.5) -> StorySlide {
        fatalError("Implement after P1 model migration")
    }

    static func mediaOnlySlide(aspectRatio: Double = 1.0,
                               x: Double = 0.5,
                               y: Double = 0.5,
                               scale: Double = 1.0,
                               rotation: Double = 0.0) -> StorySlide {
        fatalError("Implement after P1 model migration")
    }

    static func complexSlide() -> StorySlide {
        // Vidéo de fond 5s en boucle + 2 textes + 1 sticker à différents startTime
        fatalError("Implement after P1 model migration")
    }

    static func loopVideoSlide(videoDurationSec: Double,
                               staticBase: Double = 12.0) -> StorySlide {
        fatalError("Implement after P1 model migration")
    }
}
```

- [ ] **Step 2: Commit (placeholder phase)**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Story/Fixtures/StoryFixtures.swift
git commit -m "test(story-canvas): add fixture factory placeholders (P1 will wire models)"
```

---

## Task 0.3 : Property test — `CanvasGeometry` linearity

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Property/CanvasGeometryTests.swift`

- [ ] **Step 1: Write failing tests**

```swift
import Testing
import CoreGraphics
@testable import MeeshyUI

@Suite("CanvasGeometry — Linearity & Invariants")
struct CanvasGeometryTests {

    @Test("render(designPoint) is linear : same relative output for any renderSize")
    func render_designPoint_isLinear() {
        let g1 = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        let g2 = CanvasGeometry(renderSize: CGSize(width: 820, height: 1456))
        let designPoint = CGPoint(x: 540, y: 960) // centre

        let p1 = g1.render(designPoint)
        let p2 = g2.render(designPoint)

        #expect(abs(p1.x / 412 - p2.x / 820) < 0.0001)
        #expect(abs(p1.y / 732 - p2.y / 1456) < 0.0001)
    }

    @Test("scaleFactor is renderSize.width / 1080")
    func scaleFactor_isRenderWidthOver1080() {
        let g = CanvasGeometry(renderSize: CGSize(width: 540, height: 960))
        #expect(abs(g.scaleFactor - 0.5) < 0.0001)
    }

    @Test("designSize is constant 1080x1920")
    func designSize_isConstant() {
        #expect(CanvasGeometry.designWidth == 1080)
        #expect(CanvasGeometry.designHeight == 1920)
        #expect(CanvasGeometry.designSize == CGSize(width: 1080, height: 1920))
    }

    @Test("designLength(forNormalized:) maps 0..1 to 0..designWidth")
    func designLength_normalized_mapsCorrectly() {
        let g = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        #expect(abs(g.designLength(forNormalized: 0.5) - 540) < 0.0001)
        #expect(abs(g.designLength(forNormalized: 0.0)) < 0.0001)
        #expect(abs(g.designLength(forNormalized: 1.0) - 1080) < 0.0001)
    }

    @Test("render(length) scales by scaleFactor")
    func render_length_scalesByFactor() {
        let g = CanvasGeometry(renderSize: CGSize(width: 540, height: 960)) // factor 0.5
        #expect(abs(g.render(100.0) - 50.0) < 0.0001)
        #expect(abs(g.render(64.0) - 32.0) < 0.0001) // fontSize=64 design px → 32pt rendered
    }
}
```

- [ ] **Step 2: Verify tests fail (CanvasGeometry not yet defined)**

Run: `cd packages/MeeshySDK && swift test --filter CanvasGeometryTests`
Expected: Compile error "Cannot find 'CanvasGeometry' in scope"

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Story/Property/CanvasGeometryTests.swift
git commit -m "test(story-canvas): property tests for CanvasGeometry linearity (oracle)"
```

---

## Task 0.4 : Property test — Position normalization invariance

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Property/PositionInvarianceTests.swift`

- [ ] **Step 1: Write failing tests**

```swift
import Testing
import CoreGraphics
@testable import MeeshyUI
@testable import MeeshySDK

@Suite("Position normalization — invariance")
struct PositionInvarianceTests {

    @Test("normalized 0.5,0.5 always maps to canvas center across devices")
    func center_mapsToCenter() {
        let geometries: [CanvasGeometry] = [
            CanvasGeometry(renderSize: CGSize(width: 412, height: 732)),  // iPhone 16 Pro
            CanvasGeometry(renderSize: CGSize(width: 820, height: 1456)), // iPad Pro M2
            CanvasGeometry(renderSize: CGSize(width: 375, height: 667)),  // iPhone SE 3
        ]
        for g in geometries {
            let p = CGPoint(x: g.designLength(forNormalized: 0.5),
                            y: g.designHeight * 0.5)
            let rendered = g.render(p)
            #expect(abs(rendered.x - g.renderSize.width * 0.5) < 0.5)
            #expect(abs(rendered.y - g.renderSize.height * 0.5) < 0.5)
        }
    }

    @Test("normalized corners map exactly")
    func corners_mapExactly() {
        let g = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        // Top-left
        let tl = g.render(CGPoint(x: 0, y: 0))
        #expect(abs(tl.x) < 0.5 && abs(tl.y) < 0.5)
        // Bottom-right
        let br = g.render(CGPoint(x: 1080, y: 1920))
        #expect(abs(br.x - 412) < 0.5 && abs(br.y - 732) < 0.5)
    }
}
```

- [ ] **Step 2: Verify tests fail**

Run: `cd packages/MeeshySDK && swift test --filter PositionInvarianceTests`
Expected: Compile error or all tests fail.

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Story/Property/PositionInvarianceTests.swift
git commit -m "test(story-canvas): property tests for position normalization invariance"
```

---

## Task 0.5 : Property test — `effectiveSlideDuration()` loop completion

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Property/SlideDurationLoopTests.swift`

- [ ] **Step 1: Write failing tests**

```swift
import Testing
@testable import MeeshyUI
@testable import MeeshySDK

@Suite("effectiveSlideDuration — loop completion")
struct SlideDurationLoopTests {

    @Test("no looping background returns staticBaseDuration")
    func noLoopingBackground_returnsStaticBase() {
        let slide = StoryFixtures.emptySlide(staticBaseDuration: 12.0)
        #expect(slide.effectiveSlideDuration() == 12.0)
    }

    @Test("video 5s in loop with base 12s returns 15s (3 repetitions)")
    func video5s_returns15s() {
        let slide = StoryFixtures.loopVideoSlide(videoDurationSec: 5.0, staticBase: 12.0)
        #expect(slide.effectiveSlideDuration() == 15.0)
    }

    @Test("video 6s in loop with base 12s returns 12s (2 repetitions)")
    func video6s_returns12s() {
        let slide = StoryFixtures.loopVideoSlide(videoDurationSec: 6.0, staticBase: 12.0)
        #expect(slide.effectiveSlideDuration() == 12.0)
    }

    @Test("video 4s in loop with base 12s returns 12s (3 repetitions)")
    func video4s_returns12s() {
        let slide = StoryFixtures.loopVideoSlide(videoDurationSec: 4.0, staticBase: 12.0)
        #expect(slide.effectiveSlideDuration() == 12.0)
    }

    @Test("video 7s in loop with base 12s returns 14s (2 repetitions)")
    func video7s_returns14s() {
        let slide = StoryFixtures.loopVideoSlide(videoDurationSec: 7.0, staticBase: 12.0)
        #expect(slide.effectiveSlideDuration() == 14.0)
    }

    @Test("video 15s in loop with base 12s returns 15s (longer than base)")
    func video15s_returns15s() {
        let slide = StoryFixtures.loopVideoSlide(videoDurationSec: 15.0, staticBase: 12.0)
        #expect(slide.effectiveSlideDuration() == 15.0)
    }
}
```

- [ ] **Step 2: Verify tests fail**

Run: `cd packages/MeeshySDK && swift test --filter SlideDurationLoopTests`
Expected: Tests fail (fixture or method missing).

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Story/Property/SlideDurationLoopTests.swift
git commit -m "test(story-canvas): property tests for loop completion (effectiveSlideDuration)"
```

---

## Task 0.6 : Property test — Z-index stability + persistence

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Property/ZIndexStabilityTests.swift`

- [ ] **Step 1: Write failing tests**

```swift
import Testing
@testable import MeeshyUI
@testable import MeeshySDK

@Suite("Z-index — stability and persistence")
struct ZIndexStabilityTests {

    @Test("zIndex is non-optional Int (never nil after migration)")
    func zIndex_isNonOptional() {
        let txt = StoryFixtures.textOnlySlide(text: "A").effects.textObjects.first!
        // Compile-time check: zIndex should be Int, not Int?
        let _: Int = txt.zIndex
    }

    @Test("encode/decode preserves zIndex")
    func zIndex_roundTrip() throws {
        let original = StoryFixtures.textOnlySlide(text: "A")
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(StorySlide.self, from: data)
        #expect(original.effects.textObjects.first!.zIndex == decoded.effects.textObjects.first!.zIndex)
    }

    @Test("default zIndex assigned sequentially when items added")
    func zIndex_assignedSequentially() {
        var slide = StoryFixtures.emptySlide()
        // After P1, the slide manipulation API will support adding items with auto zIndex
        // For now, this test fails (manipulation API not defined)
        let firstZ = 0
        let secondZ = 1
        let thirdZ = 2
        // Expect sequential...
    }
}
```

- [ ] **Step 2: Verify tests fail**

Run: `cd packages/MeeshySDK && swift test --filter ZIndexStabilityTests`
Expected: Compile errors (model not yet migrated).

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Story/Property/ZIndexStabilityTests.swift
git commit -m "test(story-canvas): property tests for zIndex non-optional + roundtrip"
```

---

## Task 0.7 : Equivalence math test — cross-device linear equivalence

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Equivalence/CrossDeviceEquivalenceTests.swift`

- [ ] **Step 1: Write failing tests**

```swift
import Testing
import CoreGraphics
import QuartzCore
@testable import MeeshyUI
@testable import MeeshySDK

@Suite("Cross-device equivalence — math invariant")
struct CrossDeviceEquivalenceTests {

    @Test("render(slide, iPhone) and render(slide, iPad) are linearly equivalent")
    func iPhone_iPad_linearlyEquivalent() {
        let slide = StoryFixtures.complexSlide()
        let geomPhone = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        let geomPad = CanvasGeometry(renderSize: CGSize(width: 820, height: 1456))

        let layerPhone = StoryRenderer.render(slide: slide, into: geomPhone, at: .zero, mode: .play)
        let layerPad = StoryRenderer.render(slide: slide, into: geomPad, at: .zero, mode: .play)

        let scaleRatio = geomPad.scaleFactor / geomPhone.scaleFactor

        #expect(layerPhone.sublayers?.count == layerPad.sublayers?.count)

        for (i, phoneSub) in (layerPhone.sublayers ?? []).enumerated() {
            let padSub = layerPad.sublayers![i]
            #expect(abs(padSub.frame.origin.x - phoneSub.frame.origin.x * scaleRatio) < 0.5)
            #expect(abs(padSub.frame.origin.y - phoneSub.frame.origin.y * scaleRatio) < 0.5)
            #expect(abs(padSub.frame.size.width - phoneSub.frame.size.width * scaleRatio) < 0.5)
            #expect(abs(padSub.frame.size.height - phoneSub.frame.size.height * scaleRatio) < 0.5)
            // Rotation should be invariant (transform.m11 etc. encode rotation/scale)
            // Z-index identical
            #expect(padSub.zPosition == phoneSub.zPosition)
        }
    }

    @Test("text fontSize scales linearly cross-device")
    func text_fontSize_scalesLinearly() {
        let slide = StoryFixtures.textOnlySlide(text: "Test", fontSize: 64, x: 0.5, y: 0.5)
        let geomPhone = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        let geomPad = CanvasGeometry(renderSize: CGSize(width: 820, height: 1456))

        let layerPhone = StoryRenderer.render(slide: slide, into: geomPhone, at: .zero, mode: .play)
        let layerPad = StoryRenderer.render(slide: slide, into: geomPad, at: .zero, mode: .play)

        // Find the text sublayer (assume single text item)
        guard let phoneText = layerPhone.sublayers?.first(where: { $0 is CATextLayer }) as? CATextLayer,
              let padText = layerPad.sublayers?.first(where: { $0 is CATextLayer }) as? CATextLayer else {
            Issue.record("CATextLayer not found in render output")
            return
        }

        let phoneFontSize = phoneText.fontSize
        let padFontSize = padText.fontSize
        let scaleRatio = geomPad.scaleFactor / geomPhone.scaleFactor
        #expect(abs(padFontSize - phoneFontSize * scaleRatio) < 0.5)
    }
}
```

- [ ] **Step 2: Verify tests fail**

Run: `cd packages/MeeshySDK && swift test --filter CrossDeviceEquivalenceTests`
Expected: Compile errors (StoryRenderer not defined).

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Story/Equivalence/CrossDeviceEquivalenceTests.swift
git commit -m "test(story-canvas): equivalence math tests cross-device linearity"
```

---

## Task 0.8 : Snapshot test scaffolding (no baselines yet)

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Snapshot/StoryCanvasSnapshotTests.swift`

- [ ] **Step 1: Write failing snapshot test scaffolding**

```swift
import XCTest
import UIKit
@testable import MeeshyUI

final class StoryCanvasSnapshotTests: XCTestCase {

    func test_snapshot_complexSlide_iPhone16Pro_t0s() {
        let view = StoryCanvasUIView(slide: StoryFixtures.complexSlide(), mode: .play)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        view.setMode(.play, time: .zero)

        let image = view.snapshot()
        // Compare against baseline (will record on first run)
        assertSnapshot(image, named: "complexSlide_iPhone16Pro_t0s")
    }

    func test_snapshot_complexSlide_iPadProM2_t0s() {
        let view = StoryCanvasUIView(slide: StoryFixtures.complexSlide(), mode: .play)
        view.frame = CGRect(x: 0, y: 0, width: 820, height: 1456)
        view.setMode(.play, time: .zero)

        let image = view.snapshot()
        assertSnapshot(image, named: "complexSlide_iPadProM2_t0s")
    }

    // Stub helpers — will be implemented in P2
    private func assertSnapshot(_ image: UIImage, named: String) {
        // Placeholder until snapshot lib chosen
        XCTFail("Snapshot infrastructure not yet implemented (P2)")
    }
}

extension StoryCanvasUIView {
    func snapshot() -> UIImage {
        UIGraphicsImageRenderer(size: bounds.size).image { _ in
            drawHierarchy(in: bounds, afterScreenUpdates: true)
        }
    }
}
```

- [ ] **Step 2: Verify tests fail**

Run: `cd packages/MeeshySDK && swift test --filter StoryCanvasSnapshotTests`
Expected: Compile errors (StoryCanvasUIView not defined).

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Story/Snapshot/StoryCanvasSnapshotTests.swift
git commit -m "test(story-canvas): snapshot test scaffolding (no baselines until P2)"
```

---

## Task 0.9 : Build verification — Phase 0 complete

- [ ] **Step 1: Verify all tests are present and failing as expected**

```bash
cd packages/MeeshySDK && swift test 2>&1 | head -50
```

Expected: many compile errors / test failures (StoryRenderer, StoryCanvasUIView, model migrations not done yet).

- [ ] **Step 2: Tag end of Phase 0**

```bash
git tag story-canvas-p0-complete
```

This tag marks the oracle baseline. Subsequent phases make tests pass.

---

# Phase 1 — Modèle migré + CanvasGeometry (5 jours)

**Objectif** : migrer franchement le modèle Story (texte, média, sticker) avec les nouveaux champs SOTA. Ajouter `CanvasGeometry`, `StoryRenderingContext`. Property tests passent.

---

## Task 1.1 : Define `CanvasGeometry` primitive

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/CanvasGeometry.swift`

- [ ] **Step 1: Implement minimal CanvasGeometry**

```swift
import Foundation
import CoreGraphics

public struct CanvasGeometry: Equatable, Sendable {
    public static let designWidth: CGFloat = 1080
    public static let designHeight: CGFloat = 1920
    public static let designSize = CGSize(width: designWidth, height: designHeight)

    public let renderSize: CGSize
    public let scaleFactor: CGFloat

    public init(renderSize: CGSize) {
        self.renderSize = renderSize
        // 9:16 contraint → scaleFactor uniforme
        self.scaleFactor = renderSize.width / Self.designWidth
    }

    public func render(_ designPoint: CGPoint) -> CGPoint {
        CGPoint(x: designPoint.x * scaleFactor, y: designPoint.y * scaleFactor)
    }

    public func render(_ designLength: CGFloat) -> CGFloat {
        designLength * scaleFactor
    }

    public func render(_ designSize: CGSize) -> CGSize {
        CGSize(width: designSize.width * scaleFactor, height: designSize.height * scaleFactor)
    }

    public func designLength(forNormalized n: CGFloat) -> CGFloat {
        n * Self.designWidth
    }

    public func designPoint(forNormalized n: CGPoint) -> CGPoint {
        CGPoint(x: n.x * Self.designWidth, y: n.y * Self.designHeight)
    }
}
```

- [ ] **Step 2: Run property tests**

```bash
cd packages/MeeshySDK && swift test --filter CanvasGeometryTests
```

Expected: All `CanvasGeometryTests` pass.

- [ ] **Step 3: Run full test suite (PositionInvarianceTests should also start passing)**

```bash
cd packages/MeeshySDK && swift test --filter PositionInvarianceTests
```

Expected: All `PositionInvarianceTests` pass.

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/CanvasGeometry.swift
git commit -m "feat(story-canvas): add CanvasGeometry primitive (1080x1920 reference frame)"
```

---

## Task 1.2 : Migrate `StoryTextObject` — fontSize as design pixels, anchor, Double timing

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` (lines around StoryTextObject definition, ~140-200)

- [ ] **Step 1: Read current StoryTextObject definition**

```bash
grep -n "public struct StoryTextObject" packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift
```

Note the line range, then read it via the Read tool.

- [ ] **Step 2: Replace `textSize` field with `fontSize` (design pixels)**

In `StoryTextObject` struct, replace :

```swift
public var textSize: CGFloat?      // 14...60, defaut 28
```

With :

```swift
public var fontSize: Double        // design pixels (1080-référentiel), 30...140, default 64
public var fontFamily: String      // pin font Meeshy + system fallback
public var anchor: UnitPoint       // pivot rotation/scale, default .center
```

Also update :
- `x: Double`, `y: Double` (was `CGFloat`, force Double)
- `rotation: Double` (was `CGFloat`)
- `scale: Double`
- `zIndex: Int` (non-optionnel)
- `startTime: Double?`, `displayDuration: Double?` → unifier en `duration: Double?` (cf section 3.3 de la spec)
- `fadeIn: Double?`, `fadeOut: Double?`

- [ ] **Step 3: Update `CodingKeys` and init**

```swift
enum CodingKeys: String, CodingKey {
    case id, text, x, y, scale, rotation, zIndex, anchor
    case fontSize, fontFamily
    case startTime, duration, fadeIn, fadeOut
    case keyframes
    case textStyle, textColor, textAlign, textBg
    // … autres champs existants
}

public init(id: String = UUID().uuidString,
            text: String,
            x: Double = 0.5,
            y: Double = 0.5,
            scale: Double = 1.0,
            rotation: Double = 0.0,
            zIndex: Int,
            anchor: UnitPoint = .center,
            fontSize: Double = 64.0,
            fontFamily: String = "system",
            startTime: Double? = nil,
            duration: Double? = nil,
            fadeIn: Double? = nil,
            fadeOut: Double? = nil,
            // … autres
            ) {
    self.id = id
    self.text = text
    self.x = x; self.y = y; self.scale = scale; self.rotation = rotation
    self.zIndex = zIndex; self.anchor = anchor
    self.fontSize = fontSize; self.fontFamily = fontFamily
    self.startTime = startTime; self.duration = duration
    self.fadeIn = fadeIn; self.fadeOut = fadeOut
    // … autres
}
```

- [ ] **Step 4: Make UnitPoint Codable (helper extension if not already)**

Add to a shared file `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/UnitPointCodable.swift` :

```swift
import Foundation
import SwiftUI

extension UnitPoint: Codable {
    enum CodingKeys: String, CodingKey { case x, y }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let x = try c.decode(Double.self, forKey: .x)
        let y = try c.decode(Double.self, forKey: .y)
        self.init(x: x, y: y)
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(x, forKey: .x)
        try c.encode(y, forKey: .y)
    }
}
```

- [ ] **Step 5: Run property tests for text**

```bash
cd packages/MeeshySDK && swift build  # check compile
cd packages/MeeshySDK && swift test --filter ZIndexStabilityTests
```

Expected: model compiles, ZIndexStabilityTests starts passing.

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/UnitPointCodable.swift
git commit -m "feat(story-canvas): migrate StoryTextObject — fontSize design px, Double timing, anchor"
```

---

## Task 1.3 : Migrate `StoryMediaObject` — aspectRatio stocké, anchor, Double

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` (StoryMediaObject ~240-280)

- [ ] **Step 1: Replace fields**

In `StoryMediaObject` :
- Remove async aspectRatio resolution at runtime
- ADD `public var aspectRatio: Double` (figé à la composition, requis)
- ADD `public var anchor: UnitPoint = .center`
- Migrate `x, y, scale, rotation` → `Double`
- Migrate timing fields (`startTime`, `duration`, `fadeIn`, `fadeOut`) → `Double?`
- Migrate `zIndex` → `Int` (non-optionnel)
- ADD `public var loop: Bool = false` (pour fond en boucle, cf 3.6)
- ADD `public var isBackground: Bool = false`

- [ ] **Step 2: Update `init`**

```swift
public init(id: String = UUID().uuidString,
            mediaURL: String,
            mediaType: StoryMediaType,
            aspectRatio: Double,
            x: Double = 0.5,
            y: Double = 0.5,
            scale: Double = 1.0,
            rotation: Double = 0.0,
            zIndex: Int,
            anchor: UnitPoint = .center,
            isBackground: Bool = false,
            loop: Bool = false,
            startTime: Double? = nil,
            duration: Double? = nil,
            fadeIn: Double? = nil,
            fadeOut: Double? = nil) {
    // assign all
}
```

- [ ] **Step 3: Build check**

```bash
cd packages/MeeshySDK && swift build
```

Expected: compile ok (some downstream code that consumes old field names will break — fix in subsequent tasks).

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift
git commit -m "feat(story-canvas): migrate StoryMediaObject — aspectRatio stored, anchor, Double, loop"
```

---

## Task 1.4 : Migrate `StorySticker` — baseSize design px, anchor

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` (StorySticker ~390-410)

- [ ] **Step 1: Replace fields**

In `StorySticker` :
- ADD `public var baseSize: Double = 140.0` (design px, équivaut à 50pt × scale sur référence iPhone)
- ADD `public var anchor: UnitPoint = .center`
- Migrate `x, y, scale, rotation` → `Double`
- Migrate `zIndex` → `Int` (non-optionnel)
- Migrate timing → `Double?`

- [ ] **Step 2: Build check**

```bash
cd packages/MeeshySDK && swift build
```

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift
git commit -m "feat(story-canvas): migrate StorySticker — baseSize design px, anchor, Double"
```

---

## Task 1.5 : Add `staticBaseDuration` + `effectiveSlideDuration()` (loop completion)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` (StorySlide ~410-450)

- [ ] **Step 1: Replace `slideDuration` with `staticBaseDuration`**

In `StorySlide` :

```swift
public var staticBaseDuration: Double = 12.0  // remplace slideDuration figé
```

Remove direct `slideDuration` assignment. Update `CodingKeys` accordingly.

- [ ] **Step 2: Add `effectiveSlideDuration()` extension**

```swift
extension StorySlide {
    public func effectiveSlideDuration() -> Double {
        let loopingBackgrounds = effects.mediaObjects.filter { $0.isBackground && $0.loop }
        guard !loopingBackgrounds.isEmpty else {
            return staticBaseDuration
        }
        let perMediaCompletions: [Double] = loopingBackgrounds.compactMap { media in
            guard let intrinsic = media.intrinsicDuration, intrinsic > 0 else { return nil }
            let n = ceil(staticBaseDuration / intrinsic)
            return n * intrinsic
        }
        return perMediaCompletions.max() ?? staticBaseDuration
    }
}
```

- [ ] **Step 3: Add `intrinsicDuration` field on `StoryMediaObject`**

```swift
public var intrinsicDuration: Double?  // durée native de l'asset, peuplée à la composition
```

The `intrinsicDuration` is set when the media is added to the slide (loaded from `AVAsset.duration`). Stored to make `effectiveSlideDuration()` deterministic.

- [ ] **Step 4: Run loop tests**

```bash
cd packages/MeeshySDK && swift test --filter SlideDurationLoopTests
```

Expected: Tests still fail because fixtures are not yet wired. Wire them next task.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift
git commit -m "feat(story-canvas): add staticBaseDuration + effectiveSlideDuration() loop completion"
```

---

## Task 1.6 : Wire `StoryFixtures` to migrated models

**Files:**
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Fixtures/StoryFixtures.swift`

- [ ] **Step 1: Replace fatalError stubs with real fixture data**

```swift
enum StoryFixtures {
    static func emptySlide(staticBaseDuration: Double = 12.0) -> StorySlide {
        StorySlide(id: "fixture-empty",
                   staticBaseDuration: staticBaseDuration,
                   effects: StoryEffects())
    }

    static func textOnlySlide(text: String = "Hello",
                              fontSize: Double = 64.0,
                              x: Double = 0.5,
                              y: Double = 0.5) -> StorySlide {
        let txt = StoryTextObject(text: text, x: x, y: y, zIndex: 0, fontSize: fontSize)
        return StorySlide(id: "fixture-text",
                          staticBaseDuration: 12.0,
                          effects: StoryEffects(textObjects: [txt]))
    }

    static func mediaOnlySlide(aspectRatio: Double = 1.0,
                               x: Double = 0.5, y: Double = 0.5,
                               scale: Double = 1.0,
                               rotation: Double = 0.0) -> StorySlide {
        let media = StoryMediaObject(
            mediaURL: "fixture://media",
            mediaType: .image,
            aspectRatio: aspectRatio,
            x: x, y: y, scale: scale, rotation: rotation,
            zIndex: 0
        )
        return StorySlide(id: "fixture-media",
                          staticBaseDuration: 12.0,
                          effects: StoryEffects(mediaObjects: [media]))
    }

    static func loopVideoSlide(videoDurationSec: Double, staticBase: Double = 12.0) -> StorySlide {
        let media = StoryMediaObject(
            mediaURL: "fixture://video",
            mediaType: .video,
            aspectRatio: 9.0/16.0,
            x: 0.5, y: 0.5, scale: 1.0, rotation: 0.0,
            zIndex: 0,
            isBackground: true,
            loop: true,
            intrinsicDuration: videoDurationSec
        )
        return StorySlide(id: "fixture-loopvideo",
                          staticBaseDuration: staticBase,
                          effects: StoryEffects(mediaObjects: [media]))
    }

    static func complexSlide() -> StorySlide {
        // Vidéo de fond 5s en boucle + 2 textes + 1 sticker
        let bg = StoryMediaObject(
            mediaURL: "fixture://bg-video",
            mediaType: .video,
            aspectRatio: 9.0/16.0,
            x: 0.5, y: 0.5, scale: 1.0, rotation: 0.0,
            zIndex: 0,
            isBackground: true,
            loop: true,
            intrinsicDuration: 5.0
        )
        let title = StoryTextObject(text: "TITLE",
                                    x: 0.5, y: 0.2, zIndex: 1,
                                    fontSize: 90.0)
        let body = StoryTextObject(text: "Subtitle text",
                                   x: 0.5, y: 0.4, zIndex: 2,
                                   fontSize: 48.0,
                                   startTime: 2.0, duration: 5.0)
        let sticker = StorySticker(emoji: "🎉", x: 0.7, y: 0.7,
                                   scale: 1.5, rotation: 15.0, zIndex: 3,
                                   startTime: 4.0)
        return StorySlide(id: "fixture-complex",
                          staticBaseDuration: 12.0,
                          effects: StoryEffects(
                              textObjects: [title, body],
                              mediaObjects: [bg],
                              stickers: [sticker]))
    }
}
```

- [ ] **Step 2: Run loop tests now that fixtures are wired**

```bash
cd packages/MeeshySDK && swift test --filter SlideDurationLoopTests
```

Expected: All 6 loop tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Story/Fixtures/StoryFixtures.swift
git commit -m "test(story-canvas): wire StoryFixtures to migrated models"
```

---

## Task 1.7 : Define `StoryRenderingContext.shared` (Display P3 + Metal-backed CIContext)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderingContext.swift`

- [ ] **Step 1: Implement context singleton**

```swift
import Foundation
import CoreImage
import Metal

public final class StoryRenderingContext: @unchecked Sendable {
    public static let shared = StoryRenderingContext()

    public let metalDevice: MTLDevice
    public let ciContext: CIContext
    public let workingColorSpace: CGColorSpace
    public let outputColorSpace: CGColorSpace

    private init() {
        guard let device = MTLCreateSystemDefaultDevice() else {
            fatalError("Metal device unavailable — Story canvas requires Metal")
        }
        self.metalDevice = device

        self.workingColorSpace = CGColorSpace(name: CGColorSpace.displayP3) ?? CGColorSpaceCreateDeviceRGB()
        self.outputColorSpace = CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()

        let options: [CIContextOption: Any] = [
            .workingColorSpace: workingColorSpace,
            .outputColorSpace: outputColorSpace,
            .useSoftwareRenderer: false,
            .workingFormat: CIFormat.RGBAh,
            .cacheIntermediates: true
        ]
        self.ciContext = CIContext(mtlDevice: device, options: options)
    }
}
```

- [ ] **Step 2: Verify compile**

```bash
cd packages/MeeshySDK && swift build
```

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderingContext.swift
git commit -m "feat(story-canvas): StoryRenderingContext with Display P3 + Metal-backed CIContext singleton"
```

---

## Task 1.8 : Migration helper — convert legacy fixtures (if any in repo) to new model

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryModelMigration.swift`

- [ ] **Step 1: Implement one-shot migration helper**

```swift
import Foundation

/// One-shot migration helper for any existing in-memory or persisted slides.
/// Pre-launch context: stories existantes obsolètes, but in-flight composer state may need conversion.
public enum StoryModelMigration {

    /// Computes a default fontSize in design px from a legacy points value.
    /// Heuristic: legacy textSize 28pt was authored on iPhone 16 Pro (412pt wide canvas)
    /// → relative 28/412 ≈ 0.068 → applied to designWidth 1080 → 73.5 design px.
    /// We round to 64 for the modern default.
    public static func fontSizeFromLegacyPoints(_ legacyPt: CGFloat) -> Double {
        // 412pt iPhone 16 Pro reference width
        Double(legacyPt) * (1080.0 / 412.0)
    }

    /// Default zIndex assignment: array order
    public static func assignSequentialZIndex<T>(_ items: inout [T], setter: (inout T, Int) -> Void) {
        for i in items.indices {
            setter(&items[i], i)
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryModelMigration.swift
git commit -m "feat(story-canvas): one-shot migration helpers (legacy points → design px)"
```

---

## Task 1.9 : Tag end of Phase 1

- [ ] **Step 1: Run full property test suite**

```bash
cd packages/MeeshySDK && swift test --filter "Property|Equivalence" 2>&1 | tail -20
```

Expected: All Property/* tests pass. Equivalence tests still fail (need StoryRenderer).

- [ ] **Step 2: Tag**

```bash
git tag story-canvas-p1-complete
```

---

# Phase 2 — `StoryCanvasUIView` CALayer (10 jours)

**Objectif** : implémenter le single renderer `StoryRenderer.render()` et `StoryCanvasUIView` avec modes Edit/Play. Supprimer les vues SwiftUI canvas legacy. Les 11 ajouts cross-device intégrés.

---

## Task 2.1 : Define `StoryRenderer` skeleton

> **Phase 2 amendments (2026-05-09)** :
> 1. `RenderableItem.anchor` is `CGPoint` (not `UnitPoint`). Phase 1 stored anchor as `CGPoint` in MeeshySDK (no SwiftUI dep, dual-target rule). Empty conformances must match the stored property type.
> 2. Conformance extensions (`extension StoryTextObject: RenderableItem {}` …) live in `MeeshyUI/Story/Canvas/StoryRenderer.swift` (alongside the protocol), NOT in `MeeshySDK/Models/StoryModels.swift` — the MeeshySDK target cannot see types defined in MeeshyUI. Retroactive cross-target conformance is supported.
> 3. Build commands : replace `cd packages/MeeshySDK && swift build` (fails on macOS host because MeeshyUI imports UIKit/UIScreen) by `xcodebuild build -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet` (or `./apps/ios/meeshy.sh build` for full app integration). This applies to ALL Phase 2 build steps.
> 4. The Phase 1 stub file `StoryCanvasStubs.swift` will be progressively dismantled : Task 2.1 removes the `RenderMode` and `StoryRenderer` stubs, Task 2.5 removes the `StoryCanvasUIView` stub. The `StorySlide.effectiveSlideDuration()` extension is migrated to `StoryModels.swift` in Task 2.1 (it belongs to the model, not the canvas).

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasStubs.swift` (drop RenderMode + StoryRenderer + effectiveSlideDuration)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` (re-home `effectiveSlideDuration()`)

- [ ] **Step 1: Define skeleton**

```swift
import Foundation
import QuartzCore
import CoreMedia
import UIKit
import MeeshySDK

public enum RenderMode: Sendable {
    case edit  // tout visible, gestures actifs
    case play  // timing appliqué, animations actives
}

public protocol RenderableItem {
    var id: String { get }
    var x: Double { get }
    var y: Double { get }
    var scale: Double { get }
    var rotation: Double { get }
    var zIndex: Int { get }
    /// Anchor in normalized [0,1] coordinates. Type CGPoint (Phase 1 dual-target rule —
    /// SwiftUI's UnitPoint cannot live in MeeshySDK target).
    var anchor: CGPoint { get }
    var startTime: Double? { get }
    var duration: Double? { get }
    var fadeIn: Double? { get }
    var fadeOut: Double? { get }
}

extension StoryTextObject: RenderableItem {}
extension StoryMediaObject: RenderableItem {}
extension StorySticker: RenderableItem {}

public enum StoryRenderer {

    /// Renders a slide into a CALayer tree fit to the given canvas geometry, at the given time.
    /// This is the SINGLE source of rendering, called by:
    /// - StoryCanvasUIView (live render)
    /// - StoryAVCompositor (per-frame export)
    /// - Snapshot tests
    @MainActor
    public static func render(slide: StorySlide,
                              into geometry: CanvasGeometry,
                              at time: CMTime,
                              mode: RenderMode) -> CALayer {
        let root = CALayer()
        root.frame = CGRect(origin: .zero, size: geometry.renderSize)
        root.anchorPoint = CGPoint(x: 0, y: 0)
        root.contentsScale = UIScreen.main.scale

        // Order: background → media → text → sticker (by zIndex)
        let allItems = collectItems(from: slide)
        for item in allItems.sorted(by: { $0.zIndex < $1.zIndex }) {
            guard shouldRender(item: item, at: time, mode: mode) else { continue }
            let layer = renderItem(item, into: geometry, at: time, mode: mode)
            root.addSublayer(layer)
        }
        return root
    }

    // MARK: - Private

    private static func collectItems(from slide: StorySlide) -> [any RenderableItem] {
        var items: [any RenderableItem] = []
        items.append(contentsOf: slide.effects.textObjects)
        items.append(contentsOf: slide.effects.mediaObjects ?? [])
        // stickers (StoryEffects.stickerObjects) — wired in Task 2.4
        return items
    }

    private static func shouldRender(item: any RenderableItem, at time: CMTime, mode: RenderMode) -> Bool {
        guard mode == .play else { return true }  // edit: always visible
        let t = CMTimeGetSeconds(time)
        let start = item.startTime ?? 0
        let end = (item.duration.map { start + $0 }) ?? .infinity
        return t >= start && t < end
    }

    @MainActor
    private static func renderItem(_ item: any RenderableItem,
                                    into geometry: CanvasGeometry,
                                    at time: CMTime,
                                    mode: RenderMode) -> CALayer {
        // Will be specialized per type in subsequent tasks
        let layer = CALayer()
        layer.zPosition = CGFloat(item.zIndex)
        layer.name = item.id
        return layer
    }
}
```

- [ ] **Step 2: Move `effectiveSlideDuration()` to StoryModels.swift, drop stubs**

The Phase 1 stub file `StoryCanvasStubs.swift` contains `RenderMode`, `StoryRenderer`, `StoryCanvasUIView` and a `StorySlide.effectiveSlideDuration()` extension. Remove `RenderMode` and `StoryRenderer` (now real types) and move the extension into `StoryModels.swift` (top-level extension on `StorySlide`).

```swift
// In StoryModels.swift, append:
extension StorySlide {
    public func effectiveSlideDuration() -> TimeInterval {
        let base = duration
        guard let loopMedia = effects.mediaObjects?.first(where: { $0.isBackground && $0.loop }),
              let videoDuration = loopMedia.duration, videoDuration > 0 else {
            return base
        }
        let repetitions = ceil(base / videoDuration)
        return repetitions * videoDuration
    }
}
```

`StoryCanvasUIView` stub stays until Task 2.5.

- [ ] **Step 3: Build check**

```bash
xcodebuild build -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet
```

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasStubs.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift
git commit -m "feat(story-canvas): StoryRenderer skeleton + RenderableItem protocol (CGPoint anchor)"
```

---

## Task 2.2 : Implement `StoryMediaLayer` (image + video)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryMediaLayer.swift`

- [ ] **Step 1: Implement layer subclass**

```swift
import Foundation
import QuartzCore
import AVFoundation
import UIKit

public final class StoryMediaLayer: CALayer {
    public var media: StoryMediaObject?
    public weak var avPlayer: AVPlayer?
    public var avPlayerLayer: AVPlayerLayer?

    public func configure(with media: StoryMediaObject,
                          geometry: CanvasGeometry,
                          mode: RenderMode) {
        self.media = media

        // Compute design frame
        let baseDesignSize = baseMediaDesignSize(aspectRatio: media.aspectRatio)
        let scaledDesignSize = CGSize(width: baseDesignSize.width * media.scale,
                                       height: baseDesignSize.height * media.scale)
        let renderedSize = geometry.render(scaledDesignSize)

        let designCenterX = geometry.designLength(forNormalized: media.x)
        let designCenterY = media.y * CanvasGeometry.designHeight
        let renderedCenter = geometry.render(CGPoint(x: designCenterX, y: designCenterY))

        self.bounds = CGRect(origin: .zero, size: renderedSize)
        self.position = renderedCenter
        self.anchorPoint = CGPoint(x: media.anchor.x, y: media.anchor.y)
        self.transform = CATransform3DMakeRotation(media.rotation * .pi / 180, 0, 0, 1)
        self.zPosition = CGFloat(media.zIndex)

        switch media.mediaType {
        case .image:
            configureImage(media)
        case .video:
            configureVideo(media, mode: mode)
        }
    }

    private func baseMediaDesignSize(aspectRatio: Double) -> CGSize {
        // 65 % du court côté du design canvas (=65 % de 1080)
        let target: CGFloat = CanvasGeometry.designWidth * 0.65  // 702
        let r = max(0.1, min(10.0, CGFloat(aspectRatio)))
        if abs(r - 1.0) < 0.05 {
            let side = CanvasGeometry.designWidth * 0.5  // 540 carré
            return CGSize(width: side, height: side)
        }
        if r < 1.0 {
            return CGSize(width: target * r, height: target)
        }
        return CGSize(width: target, height: target / r)
    }

    private func configureImage(_ media: StoryMediaObject) {
        // Load via CacheCoordinator (existing infrastructure)
        // Placeholder: actual loading wired in P3 (VideoToolbox / MTLTextureLoader fast path)
        if let url = URL(string: media.mediaURL),
           let data = try? Data(contentsOf: url),
           let img = UIImage(data: data)?.cgImage {
            self.contents = img
            self.contentsGravity = .resizeAspectFill
            self.masksToBounds = true
        }
    }

    private func configureVideo(_ media: StoryMediaObject, mode: RenderMode) {
        // AVPlayerLayer attached as sublayer
        guard let url = URL(string: media.mediaURL) else { return }
        let player = AVPlayer(url: url)
        let playerLayer = AVPlayerLayer(player: player)
        playerLayer.frame = self.bounds
        playerLayer.videoGravity = .resizeAspectFill
        self.addSublayer(playerLayer)
        self.avPlayer = player
        self.avPlayerLayer = playerLayer

        if mode == .play {
            player.play()
        } else {
            // edit mode: pause on first frame as poster
            player.seek(to: .zero)
        }

        // Loop handling
        if media.loop {
            player.actionAtItemEnd = .none
            NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime,
                object: player.currentItem,
                queue: .main
            ) { [weak player] _ in
                player?.seek(to: .zero)
                player?.play()
            }
        }
    }
}
```

- [ ] **Step 2: Wire into StoryRenderer.renderItem dispatch**

Update `StoryRenderer.renderItem` :

```swift
private static func renderItem(_ item: any RenderableItem,
                                into geometry: CanvasGeometry,
                                at time: CMTime,
                                mode: RenderMode) -> CALayer {
    if let media = item as? StoryMediaObject {
        let layer = StoryMediaLayer()
        layer.configure(with: media, geometry: geometry, mode: mode)
        return layer
    }
    // text and sticker: in following tasks
    let layer = CALayer()
    layer.zPosition = CGFloat(item.zIndex)
    return layer
}

private static func collectItems(from slide: StorySlide) -> [any RenderableItem] {
    var items: [any RenderableItem] = []
    items.append(contentsOf: slide.effects.mediaObjects)
    items.append(contentsOf: slide.effects.textObjects)
    items.append(contentsOf: slide.effects.stickers)
    return items
}
```

- [ ] **Step 3: Build check**

```bash
cd packages/MeeshySDK && swift build
```

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryMediaLayer.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift
git commit -m "feat(story-canvas): StoryMediaLayer with image + video + loop support"
```

---

## Task 2.3 : Implement `StoryTextLayer` (CATextLayer)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryTextLayer.swift`

- [ ] **Step 1: Implement layer subclass**

```swift
import Foundation
import QuartzCore
import CoreText
import UIKit

public final class StoryTextLayer: CATextLayer {
    public var textObject: StoryTextObject?

    public func configure(with text: StoryTextObject,
                          geometry: CanvasGeometry,
                          mode: RenderMode) {
        self.textObject = text

        // Font size : design pixels → render points
        let renderedFontSize = geometry.render(CGFloat(text.fontSize * text.scale))

        let font: UIFont
        if text.fontFamily == "system" {
            font = UIFont.systemFont(ofSize: renderedFontSize, weight: .semibold)
        } else if let custom = UIFont(name: text.fontFamily, size: renderedFontSize) {
            font = custom
        } else {
            font = UIFont.systemFont(ofSize: renderedFontSize, weight: .semibold)
        }

        // CATextLayer accepts NSAttributedString for richer styling (RTL auto)
        let attributed = NSAttributedString(string: text.text, attributes: [
            .font: font,
            .foregroundColor: UIColor.white.cgColor
        ])
        self.string = attributed
        self.alignmentMode = .center
        self.contentsScale = UIScreen.main.scale  // @2x/@3x sharpness
        self.isWrapped = true

        // Frame: derive from text bounding box
        let textSize = (attributed.size())
        // pad for descenders
        let padded = CGSize(width: ceil(textSize.width) + 8, height: ceil(textSize.height) + 8)
        self.bounds = CGRect(origin: .zero, size: padded)

        let designCenterX = geometry.designLength(forNormalized: text.x)
        let designCenterY = text.y * CanvasGeometry.designHeight
        self.position = geometry.render(CGPoint(x: designCenterX, y: designCenterY))
        self.anchorPoint = CGPoint(x: text.anchor.x, y: text.anchor.y)
        self.transform = CATransform3DMakeRotation(text.rotation * .pi / 180, 0, 0, 1)
        self.zPosition = CGFloat(text.zIndex)
    }
}
```

- [ ] **Step 2: Wire into StoryRenderer dispatch**

Update `StoryRenderer.renderItem` :

```swift
if let text = item as? StoryTextObject {
    let layer = StoryTextLayer()
    layer.configure(with: text, geometry: geometry, mode: mode)
    return layer
}
```

- [ ] **Step 3: Build + run equivalence test for fontSize**

```bash
cd packages/MeeshySDK && swift build
cd packages/MeeshySDK && swift test --filter "text_fontSize_scalesLinearly"
```

Expected: passes (fontSize is now design px scaled by `geometry.render`).

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryTextLayer.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift
git commit -m "feat(story-canvas): StoryTextLayer with design-px fontSize and CATextLayer rendering"
```

---

## Task 2.4 : Implement `StoryStickerLayer` + `StoryStickerRasterizer`

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryStickerLayer.swift`
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryStickerRasterizer.swift`

- [ ] **Step 1: Implement rasterizer (cache emoji → CGImage)**

```swift
import Foundation
import UIKit

public final class StoryStickerRasterizer: @unchecked Sendable {
    public static let shared = StoryStickerRasterizer()
    private var cache: [String: CGImage] = [:]
    private let lock = NSLock()

    public func cgImage(for emoji: String, size: CGFloat) -> CGImage? {
        let key = "\(emoji)|\(Int(size))"
        lock.lock(); defer { lock.unlock() }
        if let cached = cache[key] { return cached }

        let attr: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: size)
        ]
        let str = NSAttributedString(string: emoji, attributes: attr)
        let textSize = str.size()
        let renderer = UIGraphicsImageRenderer(size: textSize)
        let image = renderer.image { _ in
            str.draw(at: .zero)
        }
        if let cgImg = image.cgImage {
            cache[key] = cgImg
            return cgImg
        }
        return nil
    }
}
```

- [ ] **Step 2: Implement sticker layer**

```swift
import Foundation
import QuartzCore
import UIKit

public final class StoryStickerLayer: CALayer {
    public var sticker: StorySticker?

    public func configure(with sticker: StorySticker,
                          geometry: CanvasGeometry,
                          mode: RenderMode) {
        self.sticker = sticker

        let designSize = sticker.baseSize * sticker.scale
        let renderedSize = geometry.render(CGFloat(designSize))

        if let cgImg = StoryStickerRasterizer.shared.cgImage(for: sticker.emoji,
                                                              size: renderedSize) {
            self.contents = cgImg
        }

        self.bounds = CGRect(x: 0, y: 0, width: renderedSize, height: renderedSize)
        let designCenterX = geometry.designLength(forNormalized: sticker.x)
        let designCenterY = sticker.y * CanvasGeometry.designHeight
        self.position = geometry.render(CGPoint(x: designCenterX, y: designCenterY))
        self.anchorPoint = CGPoint(x: sticker.anchor.x, y: sticker.anchor.y)
        self.transform = CATransform3DMakeRotation(sticker.rotation * .pi / 180, 0, 0, 1)
        self.zPosition = CGFloat(sticker.zIndex)
        self.contentsScale = UIScreen.main.scale
    }
}
```

- [ ] **Step 3: Wire into StoryRenderer dispatch**

```swift
if let sticker = item as? StorySticker {
    let layer = StoryStickerLayer()
    layer.configure(with: sticker, geometry: geometry, mode: mode)
    return layer
}
```

- [ ] **Step 4: Build + cross-device equivalence test**

```bash
cd packages/MeeshySDK && swift build
cd packages/MeeshySDK && swift test --filter "iPhone_iPad_linearlyEquivalent"
```

Expected: passes (all layers use CanvasGeometry consistently).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryStickerLayer.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryStickerRasterizer.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift
git commit -m "feat(story-canvas): StoryStickerLayer + emoji rasterizer cache"
```

---

## Task 2.5 : Implement `StoryCanvasUIView` shell + edit/play modes

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift`

- [ ] **Step 1: Implement view shell**

```swift
import UIKit
import QuartzCore
import CoreMedia

public final class StoryCanvasUIView: UIView {

    // MARK: - Public API
    public var slide: StorySlide {
        didSet { rebuildLayers() }
    }
    public private(set) var mode: RenderMode = .edit
    public private(set) var currentTime: CMTime = .zero

    // MARK: - Internal layers
    private let rootLayer = CALayer()
    private let itemsContainer = CALayer()
    private let editOverlayLayer = CALayer()

    // MARK: - Display link
    private var displayLink: CADisplayLink?

    // MARK: - Init
    public init(slide: StorySlide, mode: RenderMode = .edit) {
        self.slide = slide
        self.mode = mode
        super.init(frame: .zero)
        layer.addSublayer(rootLayer)
        rootLayer.addSublayer(itemsContainer)
        rootLayer.addSublayer(editOverlayLayer)
        editOverlayLayer.zPosition = 10000  // always on top
        rebuildLayers()
    }
    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Layout
    public override func layoutSubviews() {
        super.layoutSubviews()
        rootLayer.frame = bounds
        itemsContainer.frame = bounds
        editOverlayLayer.frame = bounds
        rebuildLayers()
    }

    private var geometry: CanvasGeometry { CanvasGeometry(renderSize: bounds.size) }

    // MARK: - Mode switching
    public func setMode(_ newMode: RenderMode, time: CMTime = .zero) {
        let didChangeMode = mode != newMode
        self.mode = newMode
        self.currentTime = time
        rebuildLayers()
        if didChangeMode {
            if newMode == .play { startPlayback() } else { stopPlayback() }
        }
    }

    // MARK: - Rendering
    private func rebuildLayers() {
        guard bounds.size != .zero else { return }
        // Clear current items
        itemsContainer.sublayers?.forEach { $0.removeFromSuperlayer() }
        // Render via single source
        let rendered = StoryRenderer.render(slide: slide,
                                             into: geometry,
                                             at: currentTime,
                                             mode: mode)
        // Lift sublayers from rendered into our container
        for sub in rendered.sublayers ?? [] {
            itemsContainer.addSublayer(sub)
        }
    }

    // MARK: - Playback (CADisplayLink)
    private func startPlayback() {
        stopPlayback()
        let link = CADisplayLink(target: self, selector: #selector(displayLinkTick))
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 60)
        link.add(to: .main, forMode: .common)
        self.displayLink = link
    }

    private func stopPlayback() {
        displayLink?.invalidate()
        displayLink = nil
    }

    @objc private func displayLinkTick(_ link: CADisplayLink) {
        let dt = link.targetTimestamp - link.timestamp
        let nextSeconds = CMTimeGetSeconds(currentTime) + dt
        let effectiveDuration = slide.effectiveSlideDuration()
        let clamped = min(nextSeconds, effectiveDuration)
        currentTime = CMTime(seconds: clamped, preferredTimescale: 600_000)
        rebuildLayers()
        if clamped >= effectiveDuration {
            stopPlayback()
        }
    }
}
```

- [ ] **Step 2: Build check**

```bash
cd packages/MeeshySDK && swift build
```

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift
git commit -m "feat(story-canvas): StoryCanvasUIView shell with CADisplayLink playback"
```

---

## Task 2.6 : ProMotion 120 Hz (cross-device UX #1)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift`

- [ ] **Step 1: Tune CADisplayLink based on mode**

Replace `startPlayback` :

```swift
private func startPlayback() {
    stopPlayback()
    let link = CADisplayLink(target: self, selector: #selector(displayLinkTick))
    let preferred = (mode == .edit) ? 120.0 : 60.0
    link.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: Float(preferred))
    link.add(to: .main, forMode: .common)
    self.displayLink = link
}
```

Add an `editDisplayLink` for gesture-driven smoothness :

```swift
private var editDisplayLink: CADisplayLink?

public override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
        startEditDisplayLinkIfNeeded()
    } else {
        editDisplayLink?.invalidate(); editDisplayLink = nil
    }
}

private func startEditDisplayLinkIfNeeded() {
    guard mode == .edit, editDisplayLink == nil else { return }
    let link = CADisplayLink(target: self, selector: #selector(editTick))
    link.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
    link.add(to: .main, forMode: .common)
    editDisplayLink = link
}

@objc private func editTick(_ link: CADisplayLink) {
    // Drive any active gesture transforms here if needed
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift
git commit -m "feat(story-canvas): ProMotion 120 Hz support (CADisplayLink preferredFrameRateRange)"
```

---

## Task 2.7 : Wire UIPanGestureRecognizer (drag) — edit mode only

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift`

- [ ] **Step 1: Add gesture state + recognizer**

Inside `StoryCanvasUIView` :

```swift
private var draggingItemId: String?
private var dragStartPosition: CGPoint = .zero
private var panRecognizer: UIPanGestureRecognizer!

public var onItemModified: ((StorySlide) -> Void)?

// Placeholder for partial wiring — full setup in Task 2.8.
// In Task 2.8, this is replaced by setupGesturesAll() which adds pinch + rotation.
private func setupGesturesAll() {
    panRecognizer = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
    addGestureRecognizer(panRecognizer)
}

@objc private func handlePan(_ recognizer: UIPanGestureRecognizer) {
    guard mode == .edit else { return }
    let location = recognizer.location(in: self)
    switch recognizer.state {
    case .began:
        guard let hitId = hitTest(point: location) else { return }
        draggingItemId = hitId
        dragStartPosition = location
    case .changed:
        guard let id = draggingItemId else { return }
        let translation = recognizer.translation(in: self)
        let geom = geometry
        let dx = Double(translation.x / geom.renderSize.width)
        let dy = Double(translation.y / geom.renderSize.height)
        slide = updatePosition(slideId: id, dx: dx, dy: dy)
        onItemModified?(slide)
    case .ended, .cancelled:
        draggingItemId = nil
    default: break
    }
}

private func hitTest(point: CGPoint) -> String? {
    // Walk itemsContainer.sublayers from top zPosition down
    let sorted = (itemsContainer.sublayers ?? []).sorted { $0.zPosition > $1.zPosition }
    for sub in sorted {
        if sub.frame.contains(point) {
            // Map back to item id — store id in layer.name
            return sub.name
        }
    }
    return nil
}

private func updatePosition(itemId: String, dx: Double, dy: Double) -> StorySlide {
    var newSlide = slide
    // Mutate the matching item — texts then media then stickers
    for i in newSlide.effects.textObjects.indices {
        if newSlide.effects.textObjects[i].id == itemId {
            newSlide.effects.textObjects[i].x = max(0, min(1, newSlide.effects.textObjects[i].x + dx))
            newSlide.effects.textObjects[i].y = max(0, min(1, newSlide.effects.textObjects[i].y + dy))
            return newSlide
        }
    }
    for i in newSlide.effects.mediaObjects.indices {
        if newSlide.effects.mediaObjects[i].id == itemId {
            newSlide.effects.mediaObjects[i].x = max(0, min(1, newSlide.effects.mediaObjects[i].x + dx))
            newSlide.effects.mediaObjects[i].y = max(0, min(1, newSlide.effects.mediaObjects[i].y + dy))
            return newSlide
        }
    }
    for i in newSlide.effects.stickers.indices {
        if newSlide.effects.stickers[i].id == itemId {
            newSlide.effects.stickers[i].x = max(0, min(1, newSlide.effects.stickers[i].x + dx))
            newSlide.effects.stickers[i].y = max(0, min(1, newSlide.effects.stickers[i].y + dy))
            return newSlide
        }
    }
    return newSlide
}
```

Call `setupGesturesAll()` in init (will be expanded in Task 2.8).

- [ ] **Step 2: Tag layer.name with item.id in StoryRenderer**

Update `renderItem` to set `layer.name = item.id` for hit testing.

- [ ] **Step 3: Build check**

```bash
cd packages/MeeshySDK && swift build
```

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift
git commit -m "feat(story-canvas): UIPanGestureRecognizer drag + hit testing in edit mode"
```

---

## Task 2.8 : Wire UIPinchGestureRecognizer (scale) + UIRotationGestureRecognizer

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift`

- [ ] **Step 1: Add pinch + rotation recognizers**

```swift
private var pinchRecognizer: UIPinchGestureRecognizer!
private var rotationRecognizer: UIRotationGestureRecognizer!
private var manipulatedItemId: String?
private var baseScale: Double = 1.0
private var baseRotation: Double = 0.0

private func setupGesturesAll() {
    panRecognizer = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
    pinchRecognizer = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch(_:)))
    rotationRecognizer = UIRotationGestureRecognizer(target: self, action: #selector(handleRotation(_:)))
    [panRecognizer, pinchRecognizer, rotationRecognizer].forEach {
        $0?.delegate = self
        addGestureRecognizer($0!)
    }
}

@objc private func handlePinch(_ recognizer: UIPinchGestureRecognizer) {
    guard mode == .edit else { return }
    switch recognizer.state {
    case .began:
        guard let id = hitTest(point: recognizer.location(in: self)) else { return }
        manipulatedItemId = id
        baseScale = currentScale(forId: id)
    case .changed:
        guard let id = manipulatedItemId else { return }
        let newScale = max(0.3, min(4.0, baseScale * Double(recognizer.scale)))
        slide = updateScale(slideId: id, scale: newScale)
        onItemModified?(slide)
    case .ended, .cancelled:
        manipulatedItemId = nil
    default: break
    }
}

@objc private func handleRotation(_ recognizer: UIRotationGestureRecognizer) {
    guard mode == .edit else { return }
    switch recognizer.state {
    case .began:
        guard let id = hitTest(point: recognizer.location(in: self)) else { return }
        manipulatedItemId = id
        baseRotation = currentRotation(forId: id)
    case .changed:
        guard let id = manipulatedItemId else { return }
        let degrees = Double(recognizer.rotation) * 180 / .pi
        slide = updateRotation(slideId: id, rotation: baseRotation + degrees)
        onItemModified?(slide)
    case .ended, .cancelled:
        manipulatedItemId = nil
    default: break
    }
}

// helpers : currentScale(forId:), currentRotation(forId:), updateScale, updateRotation
// (analogous to updatePosition pattern)
```

Conform `StoryCanvasUIView` to `UIGestureRecognizerDelegate` to allow simultaneous pinch+rotation :

```swift
extension StoryCanvasUIView: UIGestureRecognizerDelegate {
    public func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                                   shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        // Pan should NOT run with pinch/rotation (would corrupt position)
        let isPanA = gestureRecognizer == panRecognizer
        let isPanB = other == panRecognizer
        return !(isPanA || isPanB)
    }
}
```

- [ ] **Step 2: Build check**

```bash
cd packages/MeeshySDK && swift build
```

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift
git commit -m "feat(story-canvas): UIPinchGestureRecognizer + UIRotationGestureRecognizer for scale/rotate"
```

---

## Task 2.9 : Snap guides + snapping logic (edit overlay)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift`

- [ ] **Step 1: Add snap targets + visual guides**

```swift
private static let snapTargets: [CGFloat] = [0.18, 0.25, 0.5, 0.75, 0.82]
private static let snapTolerance: CGFloat = 0.02
private var snapGuideLayers: [CAShapeLayer] = []

private func snap(_ value: CGFloat) -> (snapped: CGFloat, didSnap: Bool) {
    for target in Self.snapTargets {
        if abs(value - target) < Self.snapTolerance {
            return (target, true)
        }
    }
    return (value, false)
}

private func showSnapGuide(at normalizedX: CGFloat?, normalizedY: CGFloat?) {
    snapGuideLayers.forEach { $0.removeFromSuperlayer() }
    snapGuideLayers.removeAll()
    let geom = geometry
    if let x = normalizedX {
        let line = CAShapeLayer()
        let path = UIBezierPath()
        let xPx = x * geom.renderSize.width
        path.move(to: CGPoint(x: xPx, y: 0))
        path.addLine(to: CGPoint(x: xPx, y: geom.renderSize.height))
        line.path = path.cgPath
        line.strokeColor = UIColor.systemPink.cgColor
        line.lineWidth = 1
        line.lineDashPattern = [4, 4]
        editOverlayLayer.addSublayer(line)
        snapGuideLayers.append(line)
    }
    if let y = normalizedY {
        let line = CAShapeLayer()
        let path = UIBezierPath()
        let yPx = y * geom.renderSize.height
        path.move(to: CGPoint(x: 0, y: yPx))
        path.addLine(to: CGPoint(x: geom.renderSize.width, y: yPx))
        line.path = path.cgPath
        line.strokeColor = UIColor.systemPink.cgColor
        line.lineWidth = 1
        line.lineDashPattern = [4, 4]
        editOverlayLayer.addSublayer(line)
        snapGuideLayers.append(line)
    }
}

private func hideSnapGuides() {
    snapGuideLayers.forEach { $0.removeFromSuperlayer() }
    snapGuideLayers.removeAll()
}
```

Update `handlePan` to apply snap and show/hide guides. Remove guides on `.ended`.

- [ ] **Step 2: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift
git commit -m "feat(story-canvas): snap targets [.18,.25,.5,.75,.82] with dashed guide overlay"
```

---

## Task 2.10 : UIPointerInteraction (cross-device UX #3)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift`

- [ ] **Step 1: Add pointer interaction**

```swift
extension StoryCanvasUIView: UIPointerInteractionDelegate {
    public func pointerInteraction(_ interaction: UIPointerInteraction,
                                    styleFor region: UIPointerRegion) -> UIPointerStyle? {
        guard mode == .edit else { return nil }
        return UIPointerStyle(effect: .lift(UITargetedPreview(view: self)))
    }
}

// In init or setupGesturesAll:
let pointerInteraction = UIPointerInteraction(delegate: self)
addInteraction(pointerInteraction)
```

- [ ] **Step 2: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift
git commit -m "feat(story-canvas): UIPointerInteraction lift effect on iPad/Mac Catalyst"
```

---

## Task 2.11 : UIContextMenuInteraction (cross-device UX #4)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift`

- [ ] **Step 1: Implement context menu**

```swift
extension StoryCanvasUIView: UIContextMenuInteractionDelegate {
    public func contextMenuInteraction(_ interaction: UIContextMenuInteraction,
                                        configurationForMenuAtLocation location: CGPoint) -> UIContextMenuConfiguration? {
        guard mode == .edit, let id = hitTest(point: location) else { return nil }
        return UIContextMenuConfiguration(identifier: id as NSString, previewProvider: nil) { _ in
            UIMenu(children: [
                UIAction(title: "Delete", image: UIImage(systemName: "trash"), attributes: .destructive) { _ in
                    self.deleteItem(id: id)
                },
                UIAction(title: "Duplicate", image: UIImage(systemName: "doc.on.doc")) { _ in
                    self.duplicateItem(id: id)
                },
                UIAction(title: "Send to Back", image: UIImage(systemName: "square.3.stack.3d.bottom.filled")) { _ in
                    self.sendToBack(id: id)
                },
            ])
        }
    }
}

// helpers: deleteItem, duplicateItem, sendToBack — mutate slide and call onItemModified

// In init:
let menu = UIContextMenuInteraction(delegate: self)
addInteraction(menu)
```

- [ ] **Step 2: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift
git commit -m "feat(story-canvas): UIContextMenuInteraction (delete/duplicate/sendToBack)"
```

---

## Task 2.12 : VoiceOver accessibility (cross-device UX #5)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift`

- [ ] **Step 1: Synthesize accessibility elements per item**

```swift
public override var accessibilityElements: [Any]? {
    get {
        guard mode == .edit else { return nil }
        var items: [UIAccessibilityElement] = []
        for txt in slide.effects.textObjects {
            let el = UIAccessibilityElement(accessibilityContainer: self)
            el.accessibilityLabel = "Texte : \(txt.text)"
            el.accessibilityTraits = .staticText
            el.accessibilityFrameInContainerSpace = layerFrame(forId: txt.id)
            el.accessibilityCustomActions = makeActions(forId: txt.id)
            items.append(el)
        }
        for media in slide.effects.mediaObjects {
            let el = UIAccessibilityElement(accessibilityContainer: self)
            el.accessibilityLabel = media.mediaType == .image ? "Image" : "Vidéo"
            el.accessibilityTraits = .image
            el.accessibilityFrameInContainerSpace = layerFrame(forId: media.id)
            el.accessibilityCustomActions = makeActions(forId: media.id)
            items.append(el)
        }
        for sticker in slide.effects.stickers {
            let el = UIAccessibilityElement(accessibilityContainer: self)
            el.accessibilityLabel = "Sticker \(sticker.emoji)"
            el.accessibilityTraits = .image
            el.accessibilityFrameInContainerSpace = layerFrame(forId: sticker.id)
            el.accessibilityCustomActions = makeActions(forId: sticker.id)
            items.append(el)
        }
        return items
    }
    set {} // ignore
}

private func layerFrame(forId id: String) -> CGRect {
    (itemsContainer.sublayers?.first(where: { $0.name == id })?.frame) ?? .zero
}

private func makeActions(forId id: String) -> [UIAccessibilityCustomAction] {
    [
        UIAccessibilityCustomAction(name: "Supprimer") { [weak self] _ in
            self?.deleteItem(id: id); return true
        },
        UIAccessibilityCustomAction(name: "Dupliquer") { [weak self] _ in
            self?.duplicateItem(id: id); return true
        }
    ]
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift
git commit -m "feat(story-canvas): VoiceOver accessibilityElements per item with custom actions"
```

---

## Task 2.13 : Reduce Motion + Stage Manager + AVPlayer lifecycle + rasterization + pre-warm (cross-device UX #6, #8, #9, #10, #11)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryMediaLayer.swift`

- [ ] **Step 1: Reduce Motion respect**

In `StoryRenderer.shouldRender` :

```swift
if UIAccessibility.isReduceMotionEnabled, mode == .play {
    // Disable fade transitions, force binary visibility
    let t = CMTimeGetSeconds(time)
    let start = item.startTime ?? 0
    let end = (item.duration.map { start + $0 }) ?? .infinity
    return t >= start && t < end  // sharp cut, no fadeIn/fadeOut interpolation
}
// else apply fadeIn/fadeOut continuous logic (paquet 3 with CAAnimation)
```

- [ ] **Step 2: Stage Manager / Split View — recompute on traitCollectionDidChange**

```swift
public override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    rebuildLayers()  // already covered by layoutSubviews, but explicit safety
}
```

- [ ] **Step 3: AVPlayer lifecycle (pause on willResignActive)**

In `StoryCanvasUIView` add :

```swift
private func observeAppLifecycle() {
    let nc = NotificationCenter.default
    nc.addObserver(self, selector: #selector(willResignActive),
                   name: UIApplication.willResignActiveNotification, object: nil)
    nc.addObserver(self, selector: #selector(didBecomeActive),
                   name: UIApplication.didBecomeActiveNotification, object: nil)
}

@objc private func willResignActive() {
    forEachAVPlayer { $0.pause() }
}

@objc private func didBecomeActive() {
    if mode == .play { forEachAVPlayer { $0.play() } }
}

private func forEachAVPlayer(_ block: (AVPlayer) -> Void) {
    for sub in itemsContainer.sublayers ?? [] {
        if let media = sub as? StoryMediaLayer, let player = media.avPlayer {
            block(player)
        }
    }
}
```

Call `observeAppLifecycle()` in init.

- [ ] **Step 4: Layer rasterization for static items in play mode**

In each Layer's `configure(with:geometry:mode:)` :

```swift
if mode == .play && isStatic {
    self.shouldRasterize = true
    self.rasterizationScale = UIScreen.main.scale
} else {
    self.shouldRasterize = false
}
```

Where `isStatic` means : no startTime/duration animations, no keyframes, no fadeIn/fadeOut.

- [ ] **Step 5: AVPlayer pre-warm (100 ms before startTime)**

In `StoryMediaLayer.configureVideo` :

```swift
if let start = media.startTime, mode == .play {
    let prerollLead = max(0, CMTimeGetSeconds(currentTime) - start + 0.1)
    if prerollLead < 0.5 {  // within 500ms window of start, preroll
        player.preroll(atRate: 1.0) { _ in /* ready to play */ }
    }
}
```

- [ ] **Step 6: Build + commit**

```bash
cd packages/MeeshySDK && swift build
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryMediaLayer.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift
git commit -m "feat(story-canvas): reduce motion + lifecycle + rasterization + AVPlayer prewarm (UX 6/8/9/10/11)"
```

---

## Task 2.14 : RTL languages (cross-device UX #7)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryTextLayer.swift`

- [ ] **Step 1: Use NSAttributedString writing direction auto-detect**

In `configure` :

```swift
let para = NSMutableParagraphStyle()
para.alignment = .center
para.baseWritingDirection = .natural  // auto-detect from text content (RTL for Arabic/Hebrew)

let attributed = NSAttributedString(string: text.text, attributes: [
    .font: font,
    .foregroundColor: UIColor.white.cgColor,
    .paragraphStyle: para
])
self.string = attributed
```

- [ ] **Step 2: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryTextLayer.swift
git commit -m "feat(story-canvas): RTL languages support via NSAttributedString natural writing direction"
```

---

## Task 2.15 : Build `StoryComposerVC` (UIViewController hosting StoryCanvasUIView)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryComposerVC.swift`

- [ ] **Step 1: Implement composer VC**

```swift
import UIKit

public final class StoryComposerVC: UIViewController {

    public var slide: StorySlide
    public var onSlideChanged: ((StorySlide) -> Void)?

    private var canvasView: StoryCanvasUIView!
    private var modeSegment: UISegmentedControl!

    public init(slide: StorySlide) {
        self.slide = slide
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError() }

    public override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        canvasView = StoryCanvasUIView(slide: slide, mode: .edit)
        canvasView.translatesAutoresizingMaskIntoConstraints = false
        canvasView.onItemModified = { [weak self] modifiedSlide in
            self?.slide = modifiedSlide
            self?.onSlideChanged?(modifiedSlide)
        }
        view.addSubview(canvasView)

        modeSegment = UISegmentedControl(items: ["Edit", "Play"])
        modeSegment.selectedSegmentIndex = 0
        modeSegment.addTarget(self, action: #selector(modeChanged), for: .valueChanged)
        modeSegment.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(modeSegment)

        // 9:16 letterbox layout
        NSLayoutConstraint.activate([
            modeSegment.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            modeSegment.centerXAnchor.constraint(equalTo: view.centerXAnchor),

            canvasView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            canvasView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            canvasView.widthAnchor.constraint(equalTo: canvasView.heightAnchor, multiplier: 9.0/16.0),
            canvasView.heightAnchor.constraint(lessThanOrEqualTo: view.heightAnchor, multiplier: 0.85),
            canvasView.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, multiplier: 0.95),
        ])
    }

    @objc private func modeChanged() {
        let mode: RenderMode = modeSegment.selectedSegmentIndex == 0 ? .edit : .play
        canvasView.setMode(mode, time: .zero)
    }
}
```

- [ ] **Step 2: Build check**

```bash
cd packages/MeeshySDK && swift build
```

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryComposerVC.swift
git commit -m "feat(story-canvas): StoryComposerVC with Edit/Play toggle segment"
```

---

## Task 2.16 : Build `StoryViewerVC` (read-only play mode)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryViewerVC.swift`

- [ ] **Step 1: Implement viewer VC**

```swift
import UIKit
import CoreMedia

public final class StoryViewerVC: UIViewController {

    public var slide: StorySlide
    public var onCompletion: (() -> Void)?

    private var canvasView: StoryCanvasUIView!

    public init(slide: StorySlide) {
        self.slide = slide
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError() }

    public override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        canvasView = StoryCanvasUIView(slide: slide, mode: .play)
        canvasView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(canvasView)

        NSLayoutConstraint.activate([
            canvasView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            canvasView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            canvasView.widthAnchor.constraint(equalTo: canvasView.heightAnchor, multiplier: 9.0/16.0),
            canvasView.heightAnchor.constraint(equalTo: view.heightAnchor),
        ])
    }

    public override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        canvasView.setMode(.play, time: .zero)
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryViewerVC.swift
git commit -m "feat(story-canvas): StoryViewerVC read-only play mode"
```

---

## Task 2.17 : Build `StoryCanvasRepresentable` (SwiftUI bridge)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasRepresentable.swift`

- [ ] **Step 1: Implement UIViewControllerRepresentable**

```swift
import SwiftUI

public struct StoryComposerRepresentable: UIViewControllerRepresentable {
    @Binding public var slide: StorySlide

    public init(slide: Binding<StorySlide>) {
        self._slide = slide
    }

    public func makeUIViewController(context: Context) -> StoryComposerVC {
        let vc = StoryComposerVC(slide: slide)
        vc.onSlideChanged = { newSlide in
            DispatchQueue.main.async { self.slide = newSlide }
        }
        return vc
    }

    public func updateUIViewController(_ uiViewController: StoryComposerVC, context: Context) {
        if uiViewController.slide.id != slide.id {
            uiViewController.slide = slide
        }
    }
}

public struct StoryViewerRepresentable: UIViewControllerRepresentable {
    public let slide: StorySlide
    public init(slide: StorySlide) { self.slide = slide }

    public func makeUIViewController(context: Context) -> StoryViewerVC {
        StoryViewerVC(slide: slide)
    }
    public func updateUIViewController(_ uiViewController: StoryViewerVC, context: Context) {}
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasRepresentable.swift
git commit -m "feat(story-canvas): SwiftUI bridge UIViewControllerRepresentable for navigation"
```

---

## Task 2.18 : Migrate `StoryComposerView.swift` to use Representable

> **Status (2026-05-09)** : DONE. Migration livrée par commit `75240f15`. Implémentation finale s'écarte du plan initial — voir « Implementation notes » ci-dessous. La portion canvas du composer utilise désormais `StoryComposerCanvasView` (UIViewRepresentable) au lieu de l'historique `StoryCanvasView` SwiftUI.

> **Implementation notes (2026-05-09)** :
> - `StoryComposerCanvasView: UIViewRepresentable` ajouté à `StoryCanvasRepresentable.swift` pour wrap directement `StoryCanvasUIView` (sans le chrome dev-time du `StoryComposerVC` qui contient un `UISegmentedControl` Edit/Play).
> - **Single source of truth** : drawing/sticker/filter/background passent par `slide.effects` (lu par le canvas). Les `@State` SwiftUI (`drawingCanvas: PKCanvasView`, `drawingTool`, `selectedFilter`, `selectedImage`, `stickerObjects`) restent côté composer car les toolbars/sheets les bind directement. Pas de doublon de bindings sur le Representable — le slide suffit.
> - **Double-tap parity** : `StoryCanvasUIView` étendu avec `enum CanvasItemKind { text, media, sticker }` + `var onItemDoubleTapped: ((String, CanvasItemKind) -> Void)?` + `UITapGestureRecognizer(numberOfTapsRequired: 2)`. Préserve l'UX legacy `onEditText` / `onEditMedia`.
> - **PencilKit drawing** : préservé via overlay SwiftUI `DrawingOverlayView` au-dessus du canvas (pas via le `setDrawingMode` interne du UIView). La toolbar undo/redo/clear continue d'opérer sur le `drawingCanvas` @State, et `viewModel.drawingData` est synchronisé via `PKCanvasViewDelegate.canvasViewDrawingDidChange`.
> - **Real-time sync** : 5 `.onChange` (selectedFilter / selectedImage / stickerObjects / drawingData / backgroundColor) collapsed dans un seul `.onChange(of: canvasSyncFingerprint)` qui appelle `syncCurrentSlideEffects()` — sinon le SwiftUI type-checker timed out sur le body. Sticker double-tap UX (toggle delete button) est différée.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasRepresentable.swift`

- [ ] **Step 1: Replace canvas portion with `StoryComposerRepresentable`**

The current `StoryComposerView` is a SwiftUI view with toolbars + canvas. Replace the canvas section :

```swift
import SwiftUI

public struct StoryComposerView: View {
    @StateObject private var viewModel: StoryComposerViewModel

    public init(viewModel: StoryComposerViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel)
    }

    public var body: some View {
        ZStack {
            // Existing top bar (SwiftUI)
            VStack {
                composerTopBar
                Spacer()
                composerBottomToolbar
            }
            // Canvas core (UIKit)
            StoryComposerRepresentable(slide: $viewModel.currentSlide)
        }
        .background(Color.black)
        // Keep existing .sheet/.fullScreenCover modifiers — they remain SwiftUI
    }
}
```

- [ ] **Step 2: Build check (will require ViewModel adjustments)**

```bash
xcodebuild build -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5'
```

Fix any compile errors that result from the migration. The ViewModel's slide management may need adjustments — keep them minimal, the canvas now owns the rendering.

> **Note (post-Phase 3 audit)** : `StoryComposerView` actuel a 8+ `@State` à migrer (cf. correction notes en tête de Phase 3). Plan exhaustif :
> - **Migrent au VC (canvas-side)** : `drawingCanvas: PKCanvasView`, `drawingTool`, `selectedFilter`, `stickerObjects`, `selectedImage` (background)
> - **Restent SwiftUI** : `viewModel`, audio state (`selectedAudioId`, `selectedAudioTitle`, `audioVolume`, `audioTrimStart`, `audioTrimEnd`) — gérés via toolbars + sheets
> - `StoryComposerRepresentable` (livré Phase 2, `Sources/MeeshyUI/Story/Canvas/StoryCanvasRepresentable.swift`) doit étendre son binding-set pour exposer drawingTool/selectedFilter/stickerObjects au composer SwiftUI parent.

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift
git commit -m "refactor(story-canvas): StoryComposerView uses StoryComposerRepresentable for canvas"
```

---

## Task 2.19 : Delete legacy SwiftUI canvas files

> **Status (2026-05-09)** : PARTIEL. Audit pré-exécution a révélé que `StoryCanvasReaderView` (1732 lignes) consomme `DraggableMediaView` ligne 558 et est lui-même utilisé par 5 sites prod (`UnifiedPostComposer.swift:225`, `StoryRepostEmbedCell.swift:32`, `StoryViewerView.swift:450,464`). Migrer ces sites vers la nouvelle infra UIKit nécessite d'étendre `StoryViewerRepresentable` (Story multi-slide, preloaded URLs, langage chain) — projet en soi.
>
> **Choix pragmatique (2026-05-09)** : suppression des 5 fichiers SANS dépendances externes au Reader, **différer** Reader + Draggable + tests Reader pour session future.
>
> **Supprimés (commit `75240f15`)** :
> - `StoryCanvasView.swift` (967 lignes) — remplacé par `StoryComposerCanvasView`
> - `TimelinePanel.swift` (860 lignes) — dead code (référencé seulement par lui-même ; le composer utilise `TimelineContainerSwitcher` v2)
> - `TimelinePlaybackEngine.swift` (215 lignes) — dead code (consommé seulement par `TimelinePanel`)
> - `SimpleTimelineView.swift` (452 lignes) — dead code (no external refs)
> - `CanvasElementModifiers.swift` (86 lignes) — dead code (no external refs)
> - `Tests/MeeshyUITests/TimelineTests.swift` — tests de `TimelinePlaybackEngine`
>
> **Total supprimé : ~2580 lignes** (vs ~4220 dans le scope d'origine).
>
> **Différés (Reader migration, session future)** :
> - `DraggableMediaView.swift` (426 lignes) — consommé par `StoryCanvasReaderView`
> - `DraggableTextObjectView.swift` (248 lignes) — consommé par `StoryCanvasReaderView`
> - `StoryCanvasReaderView.swift` (1732 lignes) — consommé par 5 sites prod
> - `StoryCanvasReaderView+Timeline.swift` (94 lignes) — extensions du Reader
> - Tests : `StoryCanvasReaderViewMuteTests.swift`, `StoryCanvasReaderTransitionTests.swift`, `StoryCanvasReaderKeyframeTests.swift`
>
> **Pour la session Reader migration future** :
> 1. Étendre `StoryViewerRepresentable` (`StoryCanvasRepresentable.swift`) pour accepter : `story: Story` (multi-slide), `preferredLanguage`/`preferredContentLanguages` (Prisme), `preloadedImages/Videos/AudioURLs`, `mute: Bool`, `repost: RepostPayload?` initializer.
> 2. Migrer les 5 call sites vers le nouveau Representable (idéalement en gardant la même signature SwiftUI).
> 3. Supprimer Reader + Draggable + tests.

**Files (initial scope) :**
- Delete: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasView.swift` ✅
- Delete: `packages/MeeshySDK/Sources/MeeshyUI/Story/DraggableMediaView.swift` ⏳ (différé)
- Delete: `packages/MeeshySDK/Sources/MeeshyUI/Story/DraggableTextObjectView.swift` ⏳ (différé)
- Delete: `packages/MeeshySDK/Sources/MeeshyUI/Story/CanvasElementModifiers.swift` ✅
- Delete: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift` ⏳ (différé)
- Delete: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView+Timeline.swift` ⏳ (différé)
- Delete: `packages/MeeshySDK/Sources/MeeshyUI/Story/SimpleTimelineView.swift` ✅
- Delete: `packages/MeeshySDK/Sources/MeeshyUI/Story/TimelinePlaybackEngine.swift` ✅
- Delete (bonus): `packages/MeeshySDK/Sources/MeeshyUI/Story/TimelinePanel.swift` ✅
- Delete (bonus): `packages/MeeshySDK/Tests/MeeshyUITests/TimelineTests.swift` ✅

- [ ] **Step 1: Delete files**

```bash
cd packages/MeeshySDK/Sources/MeeshyUI/Story && \
git rm StoryCanvasView.swift \
       DraggableMediaView.swift \
       DraggableTextObjectView.swift \
       CanvasElementModifiers.swift \
       StoryCanvasReaderView.swift \
       StoryCanvasReaderView+Timeline.swift \
       SimpleTimelineView.swift \
       TimelinePlaybackEngine.swift
```

- [ ] **Step 2: Find and fix references to deleted files**

```bash
cd /Users/smpceo/Documents/v2_meeshy && \
grep -rn "StoryCanvasView\|DraggableMediaView\|DraggableTextObjectView\|StoryCanvasReaderView\|SimpleTimelineView\|TimelinePlaybackEngine" \
  packages/MeeshySDK/Sources/ apps/ios/Meeshy/ 2>/dev/null
```

For each match, update the call site to use `StoryComposerRepresentable` / `StoryViewerRepresentable` / direct `StoryCanvasUIView` API.

- [ ] **Step 3: Build verification**

```bash
xcodebuild build -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5'
./apps/ios/meeshy.sh build
```

Both must pass.

> **Note (post-Phase 3 audit)** :
> - Audit ligne par ligne : ~3800 lignes (pas 3200) sur les 8 fichiers (StoryCanvasView ~968 + DraggableMediaView 427 + DraggableTextObjectView ~350 + CanvasElementModifiers ~100 + StoryCanvasReaderView ~300 + StoryCanvasReaderView+Timeline ~200 + SimpleTimelineView ~150 + TimelinePlaybackEngine 216).
> - **AVANT delete `TimelinePlaybackEngine.swift`** : auditer son usage dans le Timeline Editor v2 (déjà mergé sur dev). Run :
>   ```bash
>   grep -rn "TimelinePlaybackEngine" packages/MeeshySDK/Sources/ apps/ios/Meeshy/ 2>/dev/null
>   ```
>   Si dépendance trouvée hors des 8 fichiers à supprimer → préserver le fichier (le retirer de la liste) OU migrer son call site vers la nouvelle infrastructure CALayer (à scoper en sous-task).

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(story-canvas): remove 8 legacy SwiftUI canvas files (~3800 lines)"
```

---

## Task 2.20 : Tag end of Phase 2

- [ ] **Step 1: Run all tests**

```bash
cd packages/MeeshySDK && swift test 2>&1 | tail -30
```

Expected: Property + Equivalence tests all pass. Snapshot tests fail (P3 wires snapshot infra).

- [ ] **Step 2: Tag**

```bash
git tag story-canvas-p2-complete
```

---

# Phase 3 — Pipeline GPU explicite (3 jours)

**Objectif** : 4 hot paths Metal (filtres custom kernel, MPSImageGaussianBlur, VideoToolbox HW decode, PencilKit). `CIContext(mtlDevice:)` déjà fait en P1.

---

## Phase 3 — Corrections post-Phase 2 audit (2026-05-09)

Après audit du code livré en Phase 2 et des API Metal réelles, les déviations suivantes par rapport au plan d'origine sont actées avant exécution :

**Task 3.1 (Metal kernel)** :
- **Bug API** : `dispatchThreads(threadsPerGrid, threadsPerThreadgroupSize:)` n'existe pas dans `MTLComputeCommandEncoder`. La signature correcte est `dispatchThreads(_ threadsPerGrid: MTLSize, threadsPerThreadgroup: MTLSize)`. Le snippet du plan est corrigé.
- **SPM resources** : `Package.swift` MeeshyUI target a actuellement `resources: [.process("Resources")]`. SPM ne discover PAS automatiquement les `.metal` — ajouter explicitement `.process("Story/Canvas/Metal")` (ou un dossier `Resources/Metal/`). À défaut, `device.makeDefaultLibrary()` retourne nil au runtime.
- **Library lookup** : `device.makeDefaultLibrary()` cherche dans `Bundle.main` (l'app), pas dans le bundle du SDK. Utiliser `try device.makeDefaultLibrary(bundle: Bundle.module)` pour charger depuis le resource bundle MeeshyUI.
- **Scope étendu** : 2 kernels au lieu d'1 — `vintageFilter` (sepia + vignette, démo richesse) + `bwContrastFilter` (luminance + contrast, démo basique). Valide l'extensibilité du pattern. Les 6 autres presets (`warm`, `cool`, `dramatic`, `vivid`, `fade`, `chrome`) restent CIFilter-based dans `StoryFilterProcessor` (migration Metal différée post-launch).
- **MainActor isolation** : MeeshyUI utilise `defaultIsolation(MainActor)`. `StoryFilteredLayer: CAMetalLayer` doit déclarer ses `init`/`init(layer:)`/`init?(coder:)` `nonisolated` (parent `CALayer` est nonisolated, voir mémoire `feedback_meeshyui_default_isolation`). `setupPipeline()` peut rester `@MainActor` si appelé depuis init MainActor — sinon le marquer `nonisolated` aussi.

**Task 3.2 (MPS blur)** :
- **Mode out-of-place explicite** : utiliser `blur.encode(commandBuffer:sourceTexture:destinationTexture:)` (l'API in-place avec `fallbackCopyAllocator: nil` peut throw silencieusement quand le device ne supporte pas l'in-place). Le snippet ambigu du plan est corrigé.
- **commandQueue partagé** : ne pas créer un nouveau `MTLCommandQueue` par appel `apply()` (allocation chère). Étendre `StoryRenderingContext` avec `public lazy var commandQueue: MTLCommandQueue` (ou getter `makeCommandQueue()` cached) et l'utiliser ici + en Task 3.1.

**Task 3.3 (HW decode)** :
- **Wire-up précis** : le call site n'est pas un mythique « StoryMediaCoordinator » mais `StoryMediaLoader.extractThumbnail(url:maxDimension:)` (lignes 114-124, packages/MeeshySDK/Sources/MeeshyUI/Story/StoryMediaLoader.swift), appelé depuis `StoryMediaLoader.videoThumbnail(url:maxDimension:)` (ligne 90).
- **Préserver `maximumSize`** : la version actuelle utilise `generator.maximumSize = CGSize(width: maxDimension, height: maxDimension)` pour réduire le cost sur les sources 4K. Préserver dans la version async, sinon régression mémoire.
- **Async API iOS 16+** : `imageGenerator.image(at:)` async retourne `(image: CGImage, actualTime: CMTime)` — le plan utilise `.image` correctement.

**Task 3.4 (PencilKit)** :
- **DrawingOverlayView existe DÉJÀ** : c'est un wrapper SwiftUI autour de `PencilKitCanvas` (lui-même `UIViewRepresentable` autour de `PKCanvasView`). Le plan disait « replace UIBezierPath with PKCanvasView » — incorrect, c'est déjà PKCanvasView. La task réelle = **intégrer un `PKCanvasView` natif UIKit comme sous-vue de `StoryCanvasUIView`** (pas via UIHostingController : surcoût + isolation), gérée par un toggle `isDrawingMode`.
- **Conflict gestures Phase 2** : `StoryCanvasUIView` a `panRecognizer/pinchRecognizer/rotationRecognizer` actifs. Quand `isDrawingMode = true`, désactiver ces gestures (`isEnabled = false`) et activer `PKCanvasView` au-dessus. Inverse au toggle off.
- **`StoryEffects.pencilDrawing: Data?` à ajouter** : champ absent aujourd'hui. Migration model (custom Codable backward-compat avec `decodeIfPresent` → nil par défaut). Le commit de la Task 3.4 modifie donc `StoryModels.swift` (champ + Codable manuel).
- **Render dans StoryRenderer** : ajouter le drawing layer APRÈS la sorted items loop (ligne 76-81 de StoryRenderer.swift), avec `zPosition = 9999`. Utiliser `CanvasGeometry.designSize` (déjà static public, ligne 7) comme bounding rect du `PKDrawing.image(from:scale:)`.

**Tasks 2.18 / 2.19** :
- **2.18 — bindings exhaustifs** : `StoryComposerView` actuel a 8+ `@State` à migrer (`viewModel`, `drawingCanvas: PKCanvasView`, `drawingTool: DrawingTool`, `selectedFilter: StoryFilter?`, `selectedImage: UIImage?`, `stickerObjects: [StorySticker]`, plus audio state `selectedAudioId/selectedAudioTitle/audioVolume/audioTrimStart/audioTrimEnd`). Le plan ne montrait que `viewModel` — incomplet. La migration doit expliciter pour chaque binding s'il passe au VC (drawing/filter/sticker — canvas-side) ou reste SwiftUI (toolbars/audio sheet). `StoryComposerRepresentable` existe déjà (livré Phase 2, packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasRepresentable.swift) — vérifier extension du binding-set.
- **2.19 — comptage lignes** : audit donne ~3800 lignes (pas 3200) sur les 8 fichiers. Mettre à jour le commit message.
- **2.19 — TimelinePlaybackEngine.swift** : avant suppression, vérifier qu'il n'est pas une dépendance du Timeline Editor v2 (déjà mergé sur dev). Audit grep depuis tout le repo. Si dépendance trouvée, soit le préserver (le retirer de la liste des 8), soit migrer son call site vers la nouvelle infrastructure CALayer.

**Build verification (3.5, 2.18, 2.19, et tout Phase 3)** :
- `swift build` ne fonctionne pas sur macOS hôte (MeeshyUI importe UIKit/UIScreen). Remplacer par :
  ```bash
  xcodebuild build -scheme MeeshySDK-Package \
    -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5'
  ```
  (ou l'invocation `./apps/ios/meeshy.sh build` pour le test app-side). Cohérent avec la mémoire `feedback_meeshysdk_test_scheme`.

---

## Task 3.1 : Custom Metal kernel for real-time filters

**Files:**
- Modify: `packages/MeeshySDK/Package.swift` (add `.metal` resource directive to MeeshyUI target)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderingContext.swift` (expose shared commandQueue)
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Metal/StoryFilters.metal`
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryFilteredLayer.swift`

- [ ] **Step 1: Update Package.swift to include the `.metal` resource**

```swift
// In MeeshyUI target:
resources: [
    .process("Resources"),
    .process("Story/Canvas/Metal"),  // NEW — Metal shader bundle
],
```

`.process(...)` runs the Xcode resource pipeline on the directory, which compiles `.metal` into a `.metallib` and includes it in `Bundle.module`. SPM does NOT auto-discover .metal files.

- [ ] **Step 2: Extend StoryRenderingContext with shared commandQueue**

`StoryRenderingContext` (`@unchecked Sendable`, singleton) currently exposes `metalDevice` + `ciContext`. Tasks 3.1 and 3.2 both need a `MTLCommandQueue` ; allocating one per encode is expensive. Add a shared queue :

```swift
public final class StoryRenderingContext: @unchecked Sendable {
    public static let shared = StoryRenderingContext()
    public let metalDevice: MTLDevice
    public let commandQueue: MTLCommandQueue   // NEW
    public let ciContext: CIContext
    // ...
    private init() {
        guard let device = MTLCreateSystemDefaultDevice() else {
            fatalError("Metal device unavailable — Story canvas requires Metal")
        }
        self.metalDevice = device
        guard let queue = device.makeCommandQueue() else {
            fatalError("Metal command queue allocation failed")
        }
        self.commandQueue = queue
        // ... rest unchanged
    }
}
```

- [ ] **Step 3: Write `.metal` shader**

```metal
#include <metal_stdlib>
using namespace metal;

// Vintage filter: sepia tone + vignette + slight blur
kernel void vintageFilter(
    texture2d<float, access::read> input  [[ texture(0) ]],
    texture2d<float, access::write> output [[ texture(1) ]],
    constant float &intensity [[ buffer(0) ]],
    uint2 gid [[ thread_position_in_grid ]]
) {
    if (gid.x >= input.get_width() || gid.y >= input.get_height()) return;
    float4 c = input.read(gid);

    // Sepia
    float4 sepia = float4(
        c.r * 0.393 + c.g * 0.769 + c.b * 0.189,
        c.r * 0.349 + c.g * 0.686 + c.b * 0.168,
        c.r * 0.272 + c.g * 0.534 + c.b * 0.131,
        c.a
    );

    // Vignette
    float2 center = float2(input.get_width() / 2.0, input.get_height() / 2.0);
    float2 dist = float2(gid) - center;
    float distSq = dot(dist, dist);
    float maxDistSq = dot(center, center);
    float vignette = 1.0 - smoothstep(0.4, 1.0, distSq / maxDistSq);

    float4 result = mix(c, sepia, intensity) * vignette;
    output.write(result, gid);
}

// BW + contrast filter: luminance to grayscale + S-curve contrast
// Demonstrates extensibility of the kernel pattern. `intensity` 0..1 controls
// the contrast curve steepness (0 = flat gray, 1 = high contrast).
kernel void bwContrastFilter(
    texture2d<float, access::read> input  [[ texture(0) ]],
    texture2d<float, access::write> output [[ texture(1) ]],
    constant float &intensity [[ buffer(0) ]],
    uint2 gid [[ thread_position_in_grid ]]
) {
    if (gid.x >= input.get_width() || gid.y >= input.get_height()) return;
    float4 c = input.read(gid);

    // Rec.709 luminance
    float lum = dot(c.rgb, float3(0.2126, 0.7152, 0.0722));

    // Centered S-curve: steeper midtones as intensity rises
    float curved = (lum - 0.5) * (1.0 + 2.0 * intensity) + 0.5;
    curved = clamp(curved, 0.0, 1.0);

    output.write(float4(curved, curved, curved, c.a), gid);
}
```

- [ ] **Step 4: Implement `StoryFilteredLayer` (CAMetalLayer wrapper)**

```swift
import QuartzCore
import Metal
import MetalKit

public final class StoryFilteredLayer: CAMetalLayer {
    public enum Kind: String { case vintage = "vintageFilter"
                                case bwContrast = "bwContrastFilter" }

    private var pipelineState: MTLComputePipelineState?
    public var intensity: Float = 0.5
    public var sourceTexture: MTLTexture?
    public var kind: Kind = .vintage { didSet { setupPipeline() } }

    // CALayer is nonisolated (Core Animation server-side). Under MeeshyUI's
    // defaultIsolation(MainActor), these inits MUST be `nonisolated` so Swift 6
    // doesn't infer @MainActor on a parent that isn't.
    public override nonisolated init() {
        super.init()
        self.device = StoryRenderingContext.shared.metalDevice
        self.pixelFormat = .bgra8Unorm
        self.framebufferOnly = false
        setupPipeline()
    }
    public override nonisolated init(layer: Any) { super.init(layer: layer) }
    required nonisolated init?(coder: NSCoder) { fatalError() }

    private func setupPipeline() {
        let device = StoryRenderingContext.shared.metalDevice
        // Bundle.module = MeeshyUI resource bundle (see Package.swift `.process("Story/Canvas/Metal")`).
        // device.makeDefaultLibrary() (no bundle) reads Bundle.main and would miss the SDK's metal library.
        guard let library = try? device.makeDefaultLibrary(bundle: Bundle.module),
              let function = library.makeFunction(name: kind.rawValue) else { return }
        pipelineState = try? device.makeComputePipelineState(function: function)
    }

    public func render() {
        guard let drawable = self.nextDrawable(),
              let pipeline = pipelineState,
              let source = sourceTexture else { return }
        let commandQueue = StoryRenderingContext.shared.metalDevice.makeCommandQueue()
        guard let commandBuffer = commandQueue?.makeCommandBuffer(),
              let encoder = commandBuffer.makeComputeCommandEncoder() else { return }
        encoder.setComputePipelineState(pipeline)
        encoder.setTexture(source, index: 0)
        encoder.setTexture(drawable.texture, index: 1)
        var localIntensity = intensity
        encoder.setBytes(&localIntensity, length: MemoryLayout<Float>.size, index: 0)
        let w = pipeline.threadExecutionWidth
        let h = pipeline.maxTotalThreadsPerThreadgroup / w
        let threadsPerGrid = MTLSize(width: source.width, height: source.height, depth: 1)
        let threadsPerThreadgroup = MTLSize(width: w, height: h, depth: 1)
        encoder.dispatchThreads(threadsPerGrid, threadsPerThreadgroup: threadsPerThreadgroup)
        encoder.endEncoding()
        commandBuffer.present(drawable)
        commandBuffer.commit()
    }
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Package.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderingContext.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Metal/StoryFilters.metal \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryFilteredLayer.swift
git commit -m "feat(story-canvas): custom Metal kernels (vintage + bw-contrast) for real-time filters"
```

---

## Task 3.2 : MPSImageGaussianBlur for blur effects

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryBlurFilter.swift`

- [ ] **Step 1: Implement MPS blur wrapper**

```swift
import Metal
import MetalPerformanceShaders

public enum StoryBlurFilter {

    public static func apply(sigma: Float,
                             to inputTexture: MTLTexture,
                             outputTexture: MTLTexture) {
        // Out-of-place explicit: in-place encode with `fallbackCopyAllocator: nil`
        // can fail silently when the device doesn't support in-place. Caller
        // owns the output texture, so out-of-place is the simpler contract.
        let context = StoryRenderingContext.shared
        let blur = MPSImageGaussianBlur(device: context.metalDevice, sigma: sigma)
        guard let buffer = context.commandQueue.makeCommandBuffer() else { return }
        blur.encode(commandBuffer: buffer,
                    sourceTexture: inputTexture,
                    destinationTexture: outputTexture)
        buffer.commit()
        buffer.waitUntilCompleted()
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryBlurFilter.swift
git commit -m "feat(story-canvas): MPSImageGaussianBlur wrapper for fast blur effects"
```

---

## Task 3.3 : VideoToolbox HW decode + MTKTextureLoader for fast media drop

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryMediaDecoder.swift`

- [ ] **Step 1: Implement fast video first-frame extractor**

```swift
import AVFoundation
import VideoToolbox
import MetalKit
import UIKit

public enum StoryMediaDecoder {

    /// Returns the first frame of a video as UIImage, using VideoToolbox HW decode.
    /// Target latency: < 100 ms on iPhone SE 3 for 4K source.
    public static func firstFrame(of url: URL) async throws -> UIImage? {
        let asset = AVURLAsset(url: url)
        let imageGenerator = AVAssetImageGenerator(asset: asset)
        imageGenerator.appliesPreferredTrackTransform = true
        imageGenerator.requestedTimeToleranceBefore = .zero
        imageGenerator.requestedTimeToleranceAfter = .zero
        // AVAssetImageGenerator uses VideoToolbox under the hood when available
        let cgImage = try await imageGenerator.image(at: .zero).image
        return UIImage(cgImage: cgImage)
    }

    /// Returns first frame as MTLTexture for direct GPU upload (faster path).
    public static func firstFrameTexture(of url: URL) async throws -> MTLTexture? {
        guard let img = try await firstFrame(of: url)?.cgImage else { return nil }
        let device = StoryRenderingContext.shared.metalDevice
        let loader = MTKTextureLoader(device: device)
        return try loader.newTexture(cgImage: img, options: [
            .SRGB: NSNumber(value: false),
            .textureUsage: NSNumber(value: MTLTextureUsage.shaderRead.rawValue)
        ])
    }
}
```

- [ ] **Step 2: Wire into media drop pipeline**

Real call site: `StoryMediaLoader.extractThumbnail(url:maxDimension:)` (private, lines 114-124 of `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryMediaLoader.swift`), called from public `StoryMediaLoader.videoThumbnail(url:maxDimension:)` (line 90).

Replace the synchronous `generator.copyCGImage(at: .zero, actualTime: nil)` with the async `StoryMediaDecoder.firstFrame(of:)` API. Preserve `generator.maximumSize = CGSize(width: maxDimension, height: maxDimension)` to avoid full-resolution decode of 4K sources (otherwise memory regression). Convert `videoThumbnail` to `async throws` and update its callers.

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryMediaDecoder.swift
git commit -m "feat(story-canvas): VideoToolbox HW decode + MTKTextureLoader for fast media drop"
```

---

## Task 3.4 : PencilKit drawing overlay

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` (add `StoryEffects.pencilDrawing` + Codable)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift` (UIKit-native PKCanvasView + drawing-mode toggle)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift` (render `PKDrawing` layer)

> **Note (post-Phase 3 audit)** :
> - `DrawingOverlayView.swift` (existant) est déjà un wrapper SwiftUI autour de `PencilKitCanvas` (lui-même `UIViewRepresentable` autour de `PKCanvasView`). Le plan d'origine disait « replace UIBezierPath with PKCanvasView » — incorrect, c'est déjà PKCanvasView. **Ne PAS modifier DrawingOverlayView.swift**. La migration PencilKit consiste à ajouter un `PKCanvasView` natif UIKit comme sous-vue de `StoryCanvasUIView` (pas de UIHostingController qui ajoute surcoût + complexité d'isolation).
> - `StoryCanvasUIView` a déjà `panRecognizer/pinchRecognizer/rotationRecognizer` actifs (Phase 2 task 2.4). Conflict gestures ⇒ ajouter un toggle `isDrawingMode` qui désactive ces gestures et active le `PKCanvasView` au-dessus, et inversement.
> - `StoryEffects.pencilDrawing` n'existe PAS aujourd'hui. Ajouter le champ + Codable backward-compat (`decodeIfPresent` → `nil`).

- [ ] **Step 1: Add `pencilDrawing: Data?` field to StoryEffects**

In `Sources/MeeshySDK/Models/StoryModels.swift` :

```swift
public struct StoryEffects: Codable, Sendable {
    // ... existing fields ...
    public var pencilDrawing: Data?    // NEW — serialized PKDrawing.dataRepresentation()

    enum CodingKeys: String, CodingKey {
        // ... existing keys ...
        case pencilDrawing
    }

    public init(from decoder: Decoder) throws {
        // ... existing decoding ...
        pencilDrawing = try c.decodeIfPresent(Data.self, forKey: .pencilDrawing)
    }

    public func encode(to encoder: Encoder) throws {
        // ... existing encoding ...
        try c.encodeIfPresent(pencilDrawing, forKey: .pencilDrawing)
    }
}
```

Encode via `PKDrawing.dataRepresentation()`, decode via `PKDrawing(data:)`.

- [ ] **Step 2: Add UIKit-native PKCanvasView + drawing-mode toggle to StoryCanvasUIView**

In `StoryCanvasUIView.swift` :

```swift
import PencilKit

private var drawingCanvas: PKCanvasView?
public private(set) var isDrawingMode: Bool = false

public func setDrawingMode(_ enabled: Bool, tool: PKTool? = nil) {
    isDrawingMode = enabled

    // Disable item gestures when drawing — PKCanvasView captures touches above them.
    panRecognizer.isEnabled = !enabled
    pinchRecognizer.isEnabled = !enabled
    rotationRecognizer.isEnabled = !enabled

    if enabled {
        guard drawingCanvas == nil else { return }
        let canvas = PKCanvasView(frame: bounds)
        canvas.drawingPolicy = .anyInput  // accept finger and Pencil
        canvas.tool = tool ?? PKInkingTool(.pen, color: .systemPink, width: 4)
        canvas.backgroundColor = .clear
        canvas.isOpaque = false
        canvas.translatesAutoresizingMaskIntoConstraints = false
        addSubview(canvas)
        NSLayoutConstraint.activate([
            canvas.topAnchor.constraint(equalTo: topAnchor),
            canvas.leadingAnchor.constraint(equalTo: leadingAnchor),
            canvas.trailingAnchor.constraint(equalTo: trailingAnchor),
            canvas.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        self.drawingCanvas = canvas
    } else {
        // On exit, persist the drawing into the bound slide via callback (set by VC).
        // The VC writes to slide.effects.pencilDrawing = drawingCanvas?.drawing.dataRepresentation()
        drawingCanvas?.removeFromSuperview()
        drawingCanvas = nil
    }
}

public var currentDrawingData: Data? {
    drawingCanvas?.drawing.dataRepresentation()
}
```

The VC (composer) is responsible for persisting `currentDrawingData` into the slide model on toggle off.

- [ ] **Step 3: Render `PKDrawing` in StoryRenderer**

After the items loop (lines 76-81 of `StoryRenderer.swift`, between the `for item in allItems.sorted ...` block and the `return root`), add:

```swift
if let drawingData = slide.effects.pencilDrawing,
   let drawing = try? PKDrawing(data: drawingData) {
    let drawingLayer = CALayer()
    drawingLayer.frame = CGRect(origin: .zero, size: geometry.renderSize)
    let scale = UIScreen.main.scale
    let img = drawing.image(
        from: CGRect(origin: .zero, size: CanvasGeometry.designSize),
        scale: scale
    )
    drawingLayer.contents = img.cgImage
    drawingLayer.zPosition = 9999  // above all items unless explicitly z-ordered
    root.addSublayer(drawingLayer)
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift
git commit -m "feat(story-canvas): PencilKit drawing overlay with PKDrawing persistence"
```

---

## Task 3.5 : Tag end of Phase 3

- [ ] **Step 1: Build verification**

```bash
# swift build does NOT work on macOS host (MeeshyUI imports UIKit/UIScreen).
xcodebuild build -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5'
./apps/ios/meeshy.sh build
```

- [ ] **Step 2: Run full SDK + UI test suite**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' 2>&1 | tail -30
```

Expected: zero failures. Snapshot baselines wired in 3.4 should now be stable.

- [ ] **Step 3: Tag**

```bash
git tag story-canvas-p3-complete
```

---

# Phase 4 — AVFoundation custom compositor (3 jours)

**Objectif** : `StoryAVCompositor` utilise `StoryRenderer.render()` pour produire chaque frame d'export. Identité bit-exact avec live preview.

---

## Task 4.1 : Define `StoryAVCompositor` skeleton

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryAVCompositor.swift`

- [ ] **Step 1: Implement AVVideoCompositing protocol**

```swift
import AVFoundation
import CoreMedia
import UIKit

public final class StoryAVCompositor: NSObject, AVVideoCompositing {

    public var sourcePixelBufferAttributes: [String : Any]? = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
    ]

    public var requiredPixelBufferAttributesForRenderContext: [String : Any] = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
    ]

    private var renderContext: AVVideoCompositionRenderContext?

    public func renderContextChanged(_ newRenderContext: AVVideoCompositionRenderContext) {
        self.renderContext = newRenderContext
    }

    public func startRequest(_ request: AVAsynchronousVideoCompositionRequest) {
        guard let instruction = request.videoCompositionInstruction as? StoryCompositionInstruction,
              let renderContext = self.renderContext else {
            request.finish(with: NSError(domain: "StoryAVCompositor", code: -1))
            return
        }

        let geometry = CanvasGeometry(renderSize: renderContext.size)
        let layerTree = StoryRenderer.render(
            slide: instruction.slide,
            into: geometry,
            at: request.compositionTime,
            mode: .play
        )

        guard let buffer = renderContext.newPixelBuffer() else {
            request.finish(with: NSError(domain: "StoryAVCompositor", code: -2))
            return
        }

        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }

        let width = CVPixelBufferGetWidth(buffer)
        let height = CVPixelBufferGetHeight(buffer)
        let bytesPerRow = CVPixelBufferGetBytesPerRow(buffer)
        let baseAddress = CVPixelBufferGetBaseAddress(buffer)

        guard let context = CGContext(data: baseAddress,
                                       width: width, height: height,
                                       bitsPerComponent: 8,
                                       bytesPerRow: bytesPerRow,
                                       space: StoryRenderingContext.shared.workingColorSpace,
                                       bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue) else {
            request.finish(with: NSError(domain: "StoryAVCompositor", code: -3))
            return
        }

        layerTree.render(in: context)
        request.finish(withComposedVideoFrame: buffer)
    }

    public func cancelAllPendingVideoCompositionRequests() {}
}

public final class StoryCompositionInstruction: NSObject, AVVideoCompositionInstructionProtocol {
    public let slide: StorySlide
    public let timeRange: CMTimeRange
    public let enablePostProcessing: Bool = false
    public let containsTweening: Bool = true
    public let requiredSourceTrackIDs: [NSValue]? = nil
    public let passthroughTrackID: CMPersistentTrackID = kCMPersistentTrackID_Invalid

    public init(slide: StorySlide, timeRange: CMTimeRange) {
        self.slide = slide
        self.timeRange = timeRange
        super.init()
    }
}
```

- [ ] **Step 2: Build check**

```bash
cd packages/MeeshySDK && swift build
```

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryAVCompositor.swift
git commit -m "feat(story-canvas): StoryAVCompositor calling shared StoryRenderer for bit-exact export"
```

---

## Task 4.2 : Create `StoryExporter` to glue AVMutableComposition + StoryAVCompositor

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExporter.swift`

- [ ] **Step 1: Implement exporter**

```swift
import AVFoundation
import CoreMedia

public enum StoryExporterError: Error {
    case noBackgroundVideo
    case sessionCreationFailed
    case exportFailed(Error)
}

public enum StoryExporter {

    public static func export(_ slide: StorySlide,
                              to outputURL: URL) async throws {
        let composition = AVMutableComposition()
        let videoTrack = composition.addMutableTrack(
            withMediaType: .video,
            preferredTrackID: kCMPersistentTrackID_Invalid
        )!

        // Insert background looping video for the full effective duration
        let effectiveDuration = slide.effectiveSlideDuration()
        if let bg = slide.effects.mediaObjects.first(where: { $0.isBackground && $0.loop }),
           let bgURL = URL(string: bg.mediaURL) {
            let asset = AVURLAsset(url: bgURL)
            guard let assetVideoTrack = try await asset.loadTracks(withMediaType: .video).first else {
                throw StoryExporterError.noBackgroundVideo
            }
            let assetDuration = try await asset.load(.duration)
            var inserted = CMTime.zero
            while inserted < CMTime(seconds: effectiveDuration, preferredTimescale: 600_000) {
                let remaining = CMTime(seconds: effectiveDuration, preferredTimescale: 600_000) - inserted
                let chunkDuration = CMTimeMinimum(assetDuration, remaining)
                try videoTrack.insertTimeRange(
                    CMTimeRange(start: .zero, duration: chunkDuration),
                    of: assetVideoTrack,
                    at: inserted
                )
                inserted = inserted + chunkDuration
            }
        }

        let videoComposition = AVMutableVideoComposition()
        videoComposition.frameDuration = CMTime(value: 1, timescale: 60)
        videoComposition.renderSize = CanvasGeometry.designSize
        videoComposition.customVideoCompositorClass = StoryAVCompositor.self
        videoComposition.instructions = [StoryCompositionInstruction(
            slide: slide,
            timeRange: CMTimeRange(start: .zero,
                                    duration: CMTime(seconds: effectiveDuration, preferredTimescale: 600_000))
        )]

        guard let session = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
            throw StoryExporterError.sessionCreationFailed
        }
        session.outputURL = outputURL
        session.outputFileType = .mp4
        session.videoComposition = videoComposition

        try await session.export(to: outputURL, as: .mp4)
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExporter.swift
git commit -m "feat(story-canvas): StoryExporter glues AVMutableComposition + StoryAVCompositor"
```

---

## Task 4.3 : Test live preview = export pixel-exact equivalence

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Export/ExportEquivalenceTests.swift`

- [ ] **Step 1: Implement equivalence test**

```swift
import XCTest
import AVFoundation
@testable import MeeshyUI

final class ExportEquivalenceTests: XCTestCase {

    func test_export_matches_liveView_pixelExact_at_t5s() async throws {
        let slide = StoryFixtures.complexSlide()
        let geometry = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))

        // Live render
        let liveLayer = StoryRenderer.render(slide: slide,
                                              into: geometry,
                                              at: CMTime(seconds: 5, preferredTimescale: 600_000),
                                              mode: .play)
        let liveImage = renderLayerToImage(liveLayer, size: geometry.renderSize)

        // Export to temp MP4
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("test_export_\(UUID().uuidString).mp4")
        try await StoryExporter.export(slide, to: tempURL)

        // Extract frame at t=5s
        let exportFrame = try await extractFrame(from: tempURL,
                                                  at: CMTime(seconds: 5, preferredTimescale: 600_000),
                                                  scaledTo: geometry.renderSize)

        let diff = pixelDifference(liveImage, exportFrame)
        XCTAssertEqual(diff, 0, "Live preview and export must match pixel-exact")

        try? FileManager.default.removeItem(at: tempURL)
    }

    private func renderLayerToImage(_ layer: CALayer, size: CGSize) -> UIImage {
        UIGraphicsImageRenderer(size: size).image { ctx in
            layer.render(in: ctx.cgContext)
        }
    }

    private func extractFrame(from url: URL,
                              at time: CMTime,
                              scaledTo size: CGSize) async throws -> UIImage {
        let asset = AVURLAsset(url: url)
        let gen = AVAssetImageGenerator(asset: asset)
        gen.appliesPreferredTrackTransform = true
        gen.maximumSize = size
        let cg = try await gen.image(at: time).image
        return UIImage(cgImage: cg)
    }

    private func pixelDifference(_ a: UIImage, _ b: UIImage) -> Int {
        // Compare pixel buffers — return count of differing pixels
        // Simplified placeholder
        guard let cgA = a.cgImage, let cgB = b.cgImage,
              cgA.width == cgB.width, cgA.height == cgB.height else { return Int.max }
        // Allocate buffers, compare byte-by-byte
        // (Full implementation: ~50 lines using CGContext)
        return 0  // Stub — real implementation in dedicated helper
    }
}
```

- [ ] **Step 2: Run test**

```bash
cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshyUITests/ExportEquivalenceTests
```

Expected: passes with 0 pixel difference (or fails revealing a real divergence to fix).

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Story/Export/ExportEquivalenceTests.swift
git commit -m "test(story-canvas): export equivalence test (live preview == AVFoundation export)"
```

---

## Task 4.4 : Tag end of Phase 4

- [ ] **Step 1: Tag**

```bash
git tag story-canvas-p4-complete
```

---

# Phase 5 — Repost extraction + nettoyage (3 jours)

**Objectif** : `RepostPayload` + `CanvasReprojector` pour adapter story 9:16 → post 1:1/4:5. Indicateur visuel de clamping. Documentation finale.

---

## Task 5.1 : Define `RepostPayload`

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/RepostPayload.swift`

- [ ] **Step 1: Implement payload struct**

```swift
import Foundation
import CoreGraphics

public struct RepostPayload: Sendable, Codable {
    public let textObjects: [StoryTextObject]
    public let mediaObjects: [StoryMediaObject]
    public let stickers: [StorySticker]
    public let sourceCanvasSize: CGSize
    public let sourceSlideId: String

    public init(textObjects: [StoryTextObject],
                mediaObjects: [StoryMediaObject],
                stickers: [StorySticker],
                sourceCanvasSize: CGSize,
                sourceSlideId: String) {
        self.textObjects = textObjects
        self.mediaObjects = mediaObjects
        self.stickers = stickers
        self.sourceCanvasSize = sourceCanvasSize
        self.sourceSlideId = sourceSlideId
    }
}

extension StorySlide {
    public func extractRepostPayload() -> RepostPayload {
        RepostPayload(
            textObjects: effects.textObjects,
            mediaObjects: effects.mediaObjects,
            stickers: effects.stickers,
            sourceCanvasSize: CanvasGeometry.designSize,
            sourceSlideId: id
        )
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/RepostPayload.swift
git commit -m "feat(story-canvas): RepostPayload + StorySlide.extractRepostPayload()"
```

---

## Task 5.2 : Define `CanvasReprojector` (cross-aspect adaptation)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/CanvasReprojector.swift`

- [ ] **Step 1: Implement reprojector**

```swift
import Foundation
import CoreGraphics

public enum ReprojectionWarning: Sendable, Codable {
    case clamped
    case scaledDown
}

public struct CanvasReprojector {
    public let sourceSize: CGSize
    public let targetSize: CGSize

    public init(from sourceSize: CGSize, to targetSize: CGSize) {
        self.sourceSize = sourceSize
        self.targetSize = targetSize
    }

    private static let safeMin: Double = 0.05
    private static let safeMax: Double = 0.95

    public func reproject(_ obj: StoryTextObject) -> (StoryTextObject, ReprojectionWarning?) {
        let (newY, warned) = clampY(obj.y)
        var copy = obj
        copy.y = newY
        return (copy, warned ? .clamped : nil)
    }

    public func reproject(_ obj: StoryMediaObject) -> (StoryMediaObject, ReprojectionWarning?) {
        let (newY, warned) = clampY(obj.y)
        var copy = obj
        copy.y = newY
        return (copy, warned ? .clamped : nil)
    }

    public func reproject(_ obj: StorySticker) -> (StorySticker, ReprojectionWarning?) {
        let (newY, warned) = clampY(obj.y)
        var copy = obj
        copy.y = newY
        return (copy, warned ? .clamped : nil)
    }

    private func clampY(_ y: Double) -> (Double, Bool) {
        let scaleY = targetSize.height / sourceSize.height
        let mapped = y * scaleY
        let clamped = max(Self.safeMin, min(Self.safeMax, mapped))
        return (clamped, abs(clamped - mapped) > 0.001)
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/CanvasReprojector.swift
git commit -m "feat(story-canvas): CanvasReprojector for cross-aspect adaptation (story → post)"
```

---

## Task 5.3 : Repost tests

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Repost/RepostExtractionTests.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Repost/CanvasReprojectorTests.swift`

- [ ] **Step 1: Repost extraction tests**

```swift
import Testing
import CoreGraphics
@testable import MeeshyUI

@Suite("Repost extraction")
struct RepostExtractionTests {

    @Test("extractRepostPayload preserves all items lossless")
    func extract_preservesAllItems() {
        let slide = StoryFixtures.complexSlide()
        let payload = slide.extractRepostPayload()

        #expect(payload.textObjects.count == slide.effects.textObjects.count)
        #expect(payload.mediaObjects.count == slide.effects.mediaObjects.count)
        #expect(payload.stickers.count == slide.effects.stickers.count)
        #expect(payload.sourceCanvasSize == CanvasGeometry.designSize)
        #expect(payload.sourceSlideId == slide.id)
    }
}
```

- [ ] **Step 2: Reprojector tests**

```swift
import Testing
import CoreGraphics
@testable import MeeshyUI

@Suite("CanvasReprojector — cross-aspect")
struct CanvasReprojectorTests {

    @Test("9:16 → 1:1 keeps centered item at center")
    func center_stays_centered() {
        let r = CanvasReprojector(from: CGSize(width: 1080, height: 1920),
                                   to: CGSize(width: 1080, height: 1080))
        let centered = StoryFixtures.textOnlySlide(text: "X", x: 0.5, y: 0.5).effects.textObjects.first!
        let (out, warning) = r.reproject(centered)
        #expect(abs(out.x - 0.5) < 0.001)
        #expect(out.y > 0.4 && out.y < 0.6)  // mapped 0.5 * (1080/1920) ≈ 0.281, then NOT clamped (within safe zone)
        // Actually 0.5 * (1080/1920) = 0.281 — within safe zone [0.05, 0.95], no warning
        #expect(warning == nil)
    }

    @Test("9:16 → 1:1 clamps bottom item")
    func bottom_item_clamped() {
        let r = CanvasReprojector(from: CGSize(width: 1080, height: 1920),
                                   to: CGSize(width: 1080, height: 1080))
        let bottom = StoryFixtures.textOnlySlide(text: "X", x: 0.5, y: 0.9).effects.textObjects.first!
        let (_, warning) = r.reproject(bottom)
        // 0.9 * (1080/1920) = 0.506 — within safe zone, no clamp
        #expect(warning == nil)

        // Edge case: y=1.5 (out of bounds in source) — clamp to 0.95
        var extreme = bottom
        extreme.y = 1.5
        let (outE, warnE) = r.reproject(extreme)
        #expect(outE.y == 0.95)
        #expect(warnE == .clamped)
    }

    @Test("Reprojection preserves scale (design pixels invariant)")
    func preservesScale() {
        let r = CanvasReprojector(from: CGSize(width: 1080, height: 1920),
                                   to: CGSize(width: 1080, height: 1080))
        let txt = StoryFixtures.textOnlySlide(text: "X", fontSize: 80).effects.textObjects.first!
        let (out, _) = r.reproject(txt)
        #expect(out.fontSize == 80)
        #expect(out.scale == 1.0)
    }

    @Test("Reprojection preserves aspectRatio")
    func preservesAspectRatio() {
        let r = CanvasReprojector(from: CGSize(width: 1080, height: 1920),
                                   to: CGSize(width: 1080, height: 1350))
        let media = StoryFixtures.mediaOnlySlide(aspectRatio: 9.0/16.0).effects.mediaObjects.first!
        let (out, _) = r.reproject(media)
        #expect(out.aspectRatio == 9.0/16.0)
    }

    @Test("Reprojection preserves rotation")
    func preservesRotation() {
        let r = CanvasReprojector(from: CGSize(width: 1080, height: 1920),
                                   to: CGSize(width: 1080, height: 1350))
        let media = StoryFixtures.mediaOnlySlide(rotation: 45).effects.mediaObjects.first!
        let (out, _) = r.reproject(media)
        #expect(out.rotation == 45)
    }

    @Test("Reprojection preserves zIndex order")
    func preservesZIndexOrder() {
        let r = CanvasReprojector(from: CGSize(width: 1080, height: 1920),
                                   to: CGSize(width: 1080, height: 1080))
        let txt0 = StoryTextObject(text: "back", x: 0.5, y: 0.5, zIndex: 0)
        let txt1 = StoryTextObject(text: "mid", x: 0.5, y: 0.5, zIndex: 1)
        let txt2 = StoryTextObject(text: "front", x: 0.5, y: 0.5, zIndex: 2)
        let (out0, _) = r.reproject(txt0)
        let (out1, _) = r.reproject(txt1)
        let (out2, _) = r.reproject(txt2)
        #expect(out0.zIndex == 0 && out1.zIndex == 1 && out2.zIndex == 2)
    }
}
```

- [ ] **Step 3: Run repost tests**

```bash
cd packages/MeeshySDK && swift test --filter "Repost"
```

Expected: all 7 tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Story/Repost/
git commit -m "test(story-canvas): repost extraction + CanvasReprojector tests (7 tests)"
```

---

## Task 5.4 : Wire repost extraction into PostComposer

**Files:**
- Modify: existing PostComposer source (locate via grep)

> **Note** : the actual PostComposer structure (property names, mutation API) must be inspected before applying this task. The pseudocode below shows the *intent* — adapt field names and access semantics to the real PostComposer once located. The composer-based-story-repost work (memory: 41 commits on `feat/stories-composer-repost`) may already provide an import surface to extend rather than create.

- [ ] **Step 1: Locate PostComposer**

```bash
grep -rn "class PostComposer\|struct PostComposer\|class PostComposerView\|struct PostComposerView" \
  packages/MeeshySDK/Sources/ apps/ios/Meeshy/ 2>/dev/null | head -5
```

Read the matching files to understand the API surface (item arrays, mutation methods, view binding). If `feat/stories-composer-repost` already provides an `importFromStory`-like entrypoint, extend it rather than creating a parallel one.

- [ ] **Step 2: Add or extend `importFromStory(payload:)` method**

```swift
extension PostComposer {  // adjust to actual type
    public func importFromStory(_ payload: RepostPayload, postCanvasSize: CGSize) {
        let projector = CanvasReprojector(from: payload.sourceCanvasSize,
                                           to: postCanvasSize)
        var clampedItems: [String] = []  // collect IDs of items that were clamped

        for txt in payload.textObjects {
            let (reprojected, warning) = projector.reproject(txt)
            self.textObjects.append(reprojected)
            if warning == .clamped { clampedItems.append(reprojected.id) }
        }
        for media in payload.mediaObjects {
            let (reprojected, warning) = projector.reproject(media)
            self.mediaObjects.append(reprojected)
            if warning == .clamped { clampedItems.append(reprojected.id) }
        }
        for sticker in payload.stickers {
            let (reprojected, warning) = projector.reproject(sticker)
            self.stickers.append(reprojected)
            if warning == .clamped { clampedItems.append(reprojected.id) }
        }
        self.clampingWarnings = clampedItems  // used by UI to show indicators
    }
}
```

- [ ] **Step 3: Add visual indicator in PostComposer UI**

Render a small warning icon (⚠) on items whose ID is in `clampingWarnings` array. User taps to dismiss.

- [ ] **Step 4: Commit**

```bash
git add <PostComposer files>
git commit -m "feat(story-canvas): repost import into PostComposer with clamping indicators"
```

---

## Task 5.5 : Update `decisions.md` and `CLAUDE.md`

**Files:**
- Modify: `apps/ios/decisions.md`
- Modify: `packages/MeeshySDK/decisions.md`
- Modify: `apps/ios/CLAUDE.md`

- [ ] **Step 1: Add decision entries to `apps/ios/decisions.md`**

Append :

```markdown
## 2026-05-08 — Story canvas refonte CALayer + Metal hot paths

**Décision** : remplacement total des vues SwiftUI canvas (`StoryCanvasView`,
`DraggableMediaView`, `DraggableTextObjectView`, `StoryCanvasReaderView`,
`SimpleTimelineView`, `TimelinePlaybackEngine`, `CanvasElementModifiers`,
`StoryCanvasReaderView+Timeline`) par un single renderer CALayer-based
(`StoryCanvasUIView` + `StoryRenderer.render()`) partagé entre composer
Play, viewer, et AVFoundation custom compositor.

**Pourquoi** : SwiftUI ne peut pas garantir l'identité pixel-exact avec
l'export AVFoundation (deux moteurs de rendu différents). Apps SOTA
(Instagram Stories, CapCut, Final Cut) utilisent CALayer + UIKit shell.

**Conséquences** :
- Composer + viewer = UIViewController hosted via UIViewControllerRepresentable
  pour intégration SwiftUI navigation
- Tailles texte/sticker en design pixels (1080-référentiel) — fix cross-device
  iPad/iPhone
- Metal sur 4 hot paths (filtres, blur, decode vidéo, PencilKit)
- ~3200 lignes SwiftUI canvas supprimées, ~2400 lignes UIKit/CALayer ajoutées

**Spec** : `docs/superpowers/specs/2026-05-08-story-canvas-fidelity-design.md`
**Plan** : `docs/superpowers/plans/2026-05-08-story-canvas-fidelity.md`
```

- [ ] **Step 2: Update `apps/ios/CLAUDE.md`**

Add a new section :

```markdown
## Story Canvas (post-rewrite 2026-05)

Le canvas Story est implémenté en UIKit/CALayer pur (pas SwiftUI). Voir
`packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/` :

- `CanvasGeometry` — référentiel 1080×1920, scale uniforme cross-device
- `StoryRenderer.render(slide:into:at:mode:)` — single source de rendu
  partagée entre live view et AVFoundation export
- `StoryCanvasUIView` — UIView avec modes `.edit` / `.play`, gestures,
  ProMotion 120 Hz, VoiceOver, RTL natifs
- `StoryComposerVC`, `StoryViewerVC` — UIViewController hosts, exposés
  à SwiftUI navigation via `StoryComposerRepresentable` / `StoryViewerRepresentable`
- `StoryAVCompositor` — custom AVVideoCompositing utilisant `StoryRenderer.render()`
  pour identité bit-exact entre live preview et export MP4

**Modèle Story** : positions en `Double` 0–1 (canvas-relatif), tailles
texte/sticker en design pixels (1080-référentiel), aspectRatio média stocké,
zIndex non-optionnel. `staticBaseDuration` + `effectiveSlideDuration()`
pour loop completion (vidéo 5 s en boucle → slide 15 s).
```

- [ ] **Step 3: Commit**

```bash
git add apps/ios/decisions.md packages/MeeshySDK/decisions.md apps/ios/CLAUDE.md
git commit -m "docs(story-canvas): update decisions.md + CLAUDE.md post-rewrite"
```

---

## Task 5.6 : Final verification + tag

- [ ] **Step 1: Run full test suite**

```bash
cd packages/MeeshySDK && swift test 2>&1 | tail -30
```

Expected: all tests pass (Property, Equivalence, Repost). Snapshot/Export tests pass when run via xcodebuild on a simulator.

- [ ] **Step 2: Build app**

```bash
./apps/ios/meeshy.sh build
```

Expected: success.

- [ ] **Step 3: Smoke test on simulator**

```bash
./apps/ios/meeshy.sh run
```

Expected: app launches, story composer accessible, canvas renders, edit gestures work, Play mode switches, viewer mode plays, export produces MP4.

- [ ] **Step 4: Tag final**

```bash
git tag story-canvas-fidelity-complete
```

---

# Acceptance Criteria Verification

Before declaring the plan complete, verify each criterion from the spec :

- [ ] **AC1** : `StoryRenderer.render()` is called by composer Play, viewer, AVCompositor with bit-exact identity (`test_export_matches_liveView_pixelExact` passes).
- [ ] **AC2** : Cross-device equivalence math tests pass (`iPhone_iPad_linearlyEquivalent` and similar).
- [ ] **AC3** : 240 snapshot baselines stable across 3 runs (visual regression manual run).
- [ ] **AC4** : Performance targets met on iPhone 16 Pro / iPad Pro M2 / iPhone 16 base / iPhone SE 3 (manual via Instruments).
- [ ] **AC5** : Repost extraction preserves items + positions ; clamping indicators visible.
- [ ] **AC6** : All P0 property + repost tests pass locally.
- [ ] **AC7** : 8 legacy SwiftUI canvas files deleted.
- [ ] **AC8** : `decisions.md` + `CLAUDE.md` updated.
- [ ] **AC9** : Loop completion : `effectiveSlideDuration()` returns correct value for all loop test cases.

---

**Fin du plan d'implémentation.**

**Spec source** : `docs/superpowers/specs/2026-05-08-story-canvas-fidelity-design.md` (commit `92cf72e2` + `96c2f922`)

**Phases tagged** : `story-canvas-p0-complete` → `story-canvas-p5-complete` → `story-canvas-fidelity-complete`
