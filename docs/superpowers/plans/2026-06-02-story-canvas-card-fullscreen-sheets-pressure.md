# Story Canvas — Card framing, reader fullscreen, flexible sheets & drawing pressure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the story canvas a rounded "card" framed below the header and above the bottom sheet in the composer (uniform for ALL tools), card the reader with an animated immersive fullscreen zoom, give every band tool the drawing tool's resize + collapse flexibility, and render drawing strokes with pressure-driven variable width.

**Architecture:** A single **container-transform** technique underpins everything: the canvas (`StoryCanvasUIView`) keeps **fixed intrinsic 9:16 bounds** (`CanvasGeometry.aspectFitSize` of the full viewport) and is placed/animated via a SwiftUI container applying `scaleEffect` + `offset` + `clipShape(RoundedRectangle(cornerRadius:))` — **never** by animating the `UIViewRepresentable` frame (which would trigger `StoryCanvasUIView.layoutSubviews → rebuildLayers()` every animation frame). Fixed bounds keep `CanvasGeometry.scaleFactor` constant, so text/sticker/drawing placement is identical across card sizes and across composer/reader/fullscreen (parity preserved). Drawing pressure stores a per-point normalized driver in `StoryDrawingStrokePoint.pressure`, gated by a new `StoryDrawingStroke.captureVersion` so legacy strokes render pixel-identical.

**Tech Stack:** Swift 6, SwiftUI + UIKit/CALayer (MeeshyUI), PencilKit (drawing capture), XCTest + Swift Testing (`MeeshySDK-Package` scheme). Pure helpers live in the **core `MeeshySDK`** target (nonisolated, tests NOT `@MainActor`); view wiring lives in `MeeshyUI` and the app.

**Source spec:** `docs/superpowers/specs/2026-06-01-story-canvas-card-fullscreen-sheets-pressure-design.md` (v2, revised after Opus multi-agent review).

---

## File Structure

**New files (pure, unit-tested):**
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasFraming.swift` — pure container-transform solver (scale/offset/cornerRadius for `free`/`carded`/`immersive`). **MeeshyUI** target (depends on `CanvasGeometry`, which lives in MeeshyUI), `public nonisolated`. (Lot A)
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/BandLayoutState.swift` — pure per-tool sheet height + collapse model. (Lot B)
- `packages/MeeshySDK/Sources/MeeshySDK/Story/Drawing/StrokeWidthDriver.swift` — pure pencil-force / finger-velocity → `[0,1]` driver. (Lot C)
- `packages/MeeshySDK/Sources/MeeshySDK/Story/Drawing/StrokeWidthMapping.swift` — pure driver → effective width, legacy non-regression. (Lot C)
- `packages/MeeshySDK/Sources/MeeshySDK/Story/Drawing/VariableWidthStrokeBuilder.swift` — pure triangle-strip geometry + tessellation cache. (Lot C)

**New test files:** mirror under `Tests/MeeshySDKTests/Story/…` and `Tests/MeeshyUITests/Story/…` (SPM globs them — no `project.pbxproj` edits for SDK targets).

**Modified files:**
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift` — canvas container transform, `canvasIsCarded`, band-height coupling.
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/{BandStateMachine,ComposerControlsLayer,ComposerBottomBand,ComposerToolPanelHost}.swift` — universal resize + collapse.
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Drawing/{StrokeCaptureLayer,MeeshyStrokeCanvas,StoryStrokeRasterizer}.swift` + `StrokeSmoothing.swift`, `StrokePathBuilder.swift` (core) — pressure capture + variable-width render.
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryDrawingStroke.swift` — `captureVersion`.
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift`, `StoryViewerView+Canvas.swift`, `StoryViewerView+Sidebar.swift` — reader carding + immersive.

---

## Cross-Lot Interface Contract (read before starting)

These names are the single source of truth; every lot must use them verbatim.

1. **`StoryCanvasFraming` (Lot A, MeeshyUI, `public nonisolated`).** Lives in MeeshyUI because it depends on `CanvasGeometry` (also MeeshyUI). Canonical API is:
   ```swift
   StoryCanvasFraming.resolve(_ input: StoryCanvasFraming.Input) -> StoryCanvasFraming.Result
   // Input(viewport:headerInset:bottomInset:state:cardedCornerRadius:)
   // Result(scale:offset:cornerRadius:)
   // Presentation: .free | .carded | .immersive
   // StoryCanvasFraming.isCarded(bandPresent:drawingActive:textActive:) -> Bool
   ```
   Both composer (A1) and reader (A2/A3) AND Lot B's coupling (B4) call `resolve(.init(...))`. There is **no** `compose(...)` variant — any draft note referencing `compose` means `resolve(.init(...))`.

2. **`BandLayoutState` (Lot B, MeeshyUI).** Pure value type; `applyingResize/collapsing/expanding`, `height(for:)`, `isCollapsed(_:)`, `canvasIsFull(for:)`, static `clamp/cappedMax/isBandEligible`. Lot B feeds `bandSheetHeight` into `StoryCanvasFraming.resolve(... bottomInset: bandSheetHeight ...)`.

3. **Drawing types (Lot C, core):** `StoryDrawingStroke.captureVersion: Int` (default 0 = legacy), `StrokeWidthDriver`, `StrokeWidthMapping.effectiveWidth(of:pressure:)`, `StrokePathBuilder.StrokeWidthPoint` + `renderWidthPoints(for:)`, `VariableWidthStrokeBuilder`. **Verify the actual drawing-tool enum name** on `StoryDrawingStroke.tool` before writing `StrokeWidthMapping.base` (the draft assumes `StrokeTool` with `.pen/.marker/.eraser`; if the real type differs, use it — the RED compile step will catch a wrong name immediately).

4. **Dependency order:** **A → B** (B4 supersedes A1's interim `presentedSheetHeight` with the `BandLayoutState`-derived `bandSheetHeight`). **C is independent** (projection already uniform at 9:16) and **C1+C2 ship first** behind the still-constant renderer.

5. **Constants:** all commits end at the last meaningful line (no `Co-Authored-By`). SDK test command (reused everywhere):
   ```bash
   xcodebuild test -scheme MeeshySDK-Package \
     -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
     -derivedDataPath apps/ios/Build/DerivedData \
     -only-testing:<Target>/<Suite> -quiet
   ```
   App build/run: `./apps/ios/meeshy.sh build` / `./apps/ios/meeshy.sh run`.

---

## Lot A — Canvas card framing + reader fullscreen

> Scope: A4 framing helper (pure, unit-tested) → A1 composer card-above-sheet → A2/A3 reader carding + immersive fullscreen → A validation gate.
> Cross-cutting technique (mandatory, never violate): the canvas (`StoryCanvasUIView`) keeps **fixed intrinsic 9:16 bounds = `CanvasGeometry.aspectFitSize` of the FULL viewport**. Card placement and the immersive zoom are rendered by a **SwiftUI container** applying `scaleEffect` + `offset` + `clipShape(RoundedRectangle(cornerRadius:))`. **Never animate the `UIViewRepresentable` frame** (that triggers `StoryCanvasUIView.layoutSubviews → rebuildLayers()` every animation frame — `StoryCanvasUIView.swift:823-838`).

### Task A4.1 — RED: create the failing framing-helper test file

- [ ] Create `packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryCanvasFramingTests.swift` (new file; SPM globs `Tests/MeeshyUITests/**`, no pbxproj edit).
- [ ] The test class is `final class StoryCanvasFramingTests: XCTestCase` — **NOT `@MainActor`** (SUT is `nonisolated`).
- [ ] Paste the COMPLETE test body:

```swift
import XCTest
import CoreGraphics
@testable import MeeshyUI

final class StoryCanvasFramingTests: XCTestCase {

    private func viewport() -> CGSize { CGSize(width: 402, height: 874) } // iPhone 16 Pro pt

    private func makeInput(
        viewport: CGSize? = nil,
        headerInset: CGFloat = 100,
        bottomInset: CGFloat = 320,
        state: StoryCanvasFraming.Presentation = .carded,
        cornerRadius: CGFloat = 22
    ) -> StoryCanvasFraming.Input {
        StoryCanvasFraming.Input(
            viewport: viewport ?? self.viewport(),
            headerInset: headerInset,
            bottomInset: bottomInset,
            state: state,
            cardedCornerRadius: cornerRadius
        )
    }

    func test_resolve_free_isIdentityNoCorners() {
        let r = StoryCanvasFraming.resolve(makeInput(state: .free))
        XCTAssertEqual(r.scale, 1, accuracy: 0.0001)
        XCTAssertEqual(r.offset, .zero)
        XCTAssertEqual(r.cornerRadius, 0, accuracy: 0.0001)
    }

    func test_resolve_immersive_isIdentityNoCorners() {
        let r = StoryCanvasFraming.resolve(makeInput(state: .immersive))
        XCTAssertEqual(r.scale, 1, accuracy: 0.0001)
        XCTAssertEqual(r.offset, .zero)
        XCTAssertEqual(r.cornerRadius, 0, accuracy: 0.0001)
    }

    func test_resolve_carded_shrinksAndRoundsCorners() {
        let r = StoryCanvasFraming.resolve(makeInput(state: .carded))
        XCTAssertLessThan(r.scale, 1)
        XCTAssertGreaterThan(r.scale, 0)
        XCTAssertEqual(r.cornerRadius, 22, accuracy: 0.0001)
    }

    func test_resolve_carded_symmetricInsets_sameCardSizeOwnVsOthers() {
        let own = StoryCanvasFraming.resolve(makeInput(headerInset: 100, bottomInset: 130))
        let others = StoryCanvasFraming.resolve(makeInput(headerInset: 100, bottomInset: 130))
        XCTAssertEqual(own.scale, others.scale, accuracy: 0.0001)
        XCTAssertEqual(own.offset.height, others.offset.height, accuracy: 0.0001)
        XCTAssertEqual(own.cornerRadius, others.cornerRadius, accuracy: 0.0001)
    }

    func test_resolve_carded_scaleMonotonicallyDecreasesWithBottomInset() {
        let small = StoryCanvasFraming.resolve(makeInput(bottomInset: 200)).scale
        let mid = StoryCanvasFraming.resolve(makeInput(bottomInset: 360)).scale
        let large = StoryCanvasFraming.resolve(makeInput(bottomInset: 520)).scale
        XCTAssertGreaterThan(small, mid)
        XCTAssertGreaterThan(mid, large)
    }

    func test_resolve_carded_collapsedSheet_scaleApproachesFull() {
        let r = StoryCanvasFraming.resolve(makeInput(headerInset: 0, bottomInset: 0))
        XCTAssertEqual(r.scale, 1, accuracy: 0.001)
    }

    func test_resolve_carded_canvasBottomNeverBelowSheetTop() {
        let vp = viewport()
        let headerInset: CGFloat = 100
        let bottomInset: CGFloat = 360
        let r = StoryCanvasFraming.resolve(makeInput(headerInset: headerInset, bottomInset: bottomInset))
        let intrinsic = CanvasGeometry.aspectFitSize(in: vp)
        let presentedHeight = intrinsic.height * r.scale
        let centerY = vp.height / 2 + r.offset.height
        let canvasBottom = centerY + presentedHeight / 2
        let sheetTop = vp.height - bottomInset
        XCTAssertLessThanOrEqual(canvasBottom, sheetTop + 0.5)
    }

    func test_resolve_carded_canvasTopNeverAboveHeaderBottom() {
        let vp = viewport()
        let headerInset: CGFloat = 120
        let r = StoryCanvasFraming.resolve(makeInput(headerInset: headerInset, bottomInset: 360))
        let intrinsic = CanvasGeometry.aspectFitSize(in: vp)
        let presentedHeight = intrinsic.height * r.scale
        let centerY = vp.height / 2 + r.offset.height
        let canvasTop = centerY - presentedHeight / 2
        XCTAssertGreaterThanOrEqual(canvasTop, headerInset - 0.5)
    }

    func test_resolve_zeroViewport_returnsSafeIdentity() {
        let r = StoryCanvasFraming.resolve(makeInput(viewport: .zero, state: .carded))
        XCTAssertEqual(r.scale, 1, accuracy: 0.0001)
        XCTAssertEqual(r.offset, .zero)
        XCTAssertEqual(r.cornerRadius, 0, accuracy: 0.0001)
    }

    func test_isCarded_truthTable() {
        XCTAssertFalse(StoryCanvasFraming.isCarded(bandPresent: false, drawingActive: false, textActive: false))
        XCTAssertTrue(StoryCanvasFraming.isCarded(bandPresent: true, drawingActive: false, textActive: false))
        XCTAssertTrue(StoryCanvasFraming.isCarded(bandPresent: false, drawingActive: true, textActive: false))
        XCTAssertTrue(StoryCanvasFraming.isCarded(bandPresent: false, drawingActive: false, textActive: true))
        XCTAssertTrue(StoryCanvasFraming.isCarded(bandPresent: true, drawingActive: true, textActive: true))
    }
}
```

- [ ] Run `-only-testing:MeeshyUITests/StoryCanvasFramingTests` (see Cross-Lot command). Expected: **compile error** `cannot find 'StoryCanvasFraming' in scope` (RED).

### Task A4.2 — GREEN: implement the pure framing helper

- [ ] Create `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasFraming.swift` (MeeshyUI target — `CanvasGeometry` lives here; the enum is `public nonisolated` so it stays testable off-main under MeeshyUI's `defaultIsolation(MainActor)`):

```swift
import Foundation
import CoreGraphics

/// Pure, `nonisolated` framing solver for the story canvas **container transform**.
/// The canvas keeps fixed intrinsic 9:16 bounds (`CanvasGeometry.aspectFitSize` of the
/// full viewport); this helper computes the `scale`/`offset`/`cornerRadius` a SwiftUI
/// container applies to place it in the free region `[headerInset … viewport.height - bottomInset]`.
/// Shared by composer (A1) and reader (A2/A3). No SwiftUI/UIKit/main-actor → unit-testable off-main.
public nonisolated enum StoryCanvasFraming {

    public enum Presentation: Equatable, Sendable { case free, carded, immersive }

    public struct Input: Equatable, Sendable {
        public let viewport: CGSize
        public let headerInset: CGFloat
        public let bottomInset: CGFloat
        public let state: Presentation
        public let cardedCornerRadius: CGFloat
        public init(viewport: CGSize, headerInset: CGFloat, bottomInset: CGFloat,
                    state: Presentation, cardedCornerRadius: CGFloat) {
            self.viewport = viewport; self.headerInset = headerInset
            self.bottomInset = bottomInset; self.state = state
            self.cardedCornerRadius = cardedCornerRadius
        }
    }

    public struct Result: Equatable, Sendable {
        public let scale: CGFloat
        public let offset: CGSize
        public let cornerRadius: CGFloat
        public init(scale: CGFloat, offset: CGSize, cornerRadius: CGFloat) {
            self.scale = scale; self.offset = offset; self.cornerRadius = cornerRadius
        }
        static let identity = Result(scale: 1, offset: .zero, cornerRadius: 0)
    }

    /// Truth-table helper for `canvasIsCarded` (A1).
    public static func isCarded(bandPresent: Bool, drawingActive: Bool, textActive: Bool) -> Bool {
        bandPresent || drawingActive || textActive
    }

    public static func resolve(_ input: Input) -> Result {
        guard input.state == .carded else { return .identity }
        let intrinsic = CanvasGeometry.aspectFitSize(in: input.viewport)
        guard intrinsic.width > 0, intrinsic.height > 0,
              input.viewport.width > 0, input.viewport.height > 0 else { return .identity }

        let regionTop = max(0, input.headerInset)
        let regionBottom = max(regionTop, input.viewport.height - max(0, input.bottomInset))
        let regionHeight = max(0, regionBottom - regionTop)
        guard regionHeight > 0 else { return .identity }

        let rawScale = regionHeight / intrinsic.height
        let scale = min(1, max(0, rawScale))

        let regionCenterY = regionTop + regionHeight / 2
        let offsetY = regionCenterY - input.viewport.height / 2
        let corner = scale < 1 ? input.cardedCornerRadius : 0
        return Result(scale: scale, offset: CGSize(width: 0, height: offsetY), cornerRadius: corner)
    }
}
```

- [ ] Re-run `-only-testing:MeeshyUITests/StoryCanvasFramingTests`. Expected: **PASS** (all assertions).
- [ ] Commit: `feat(story): pure StoryCanvasFraming container-transform solver (Lot A)`.

### Task A1.1 — Composer: add `canvasIsCarded` + interim sheet-height plumbing

- [ ] In `StoryComposerView.swift`, add a computed `canvasIsCarded` near `canvasIsInset` (~`:1302`):
  - `bandPresent = bandStateMachine.state != .hidden`; `drawingActive = viewModel.drawingEditingMode.isActive`; `textActive = viewModel.textEditingMode != .inactive`; return `StoryCanvasFraming.isCarded(bandPresent:drawingActive:textActive:)`.
- [ ] Add an interim `presentedSheetHeight: CGFloat` (Lot B Task B4 replaces this source with the `BandLayoutState`-derived value): when `canvasIsCarded`, the current band height capped at `min(540, screenHeight * 0.42)` (reuse `composerBandHeight` for band/drawing; `keyboardHeight + 132` for text editing); else `0`. Derive `screenHeight` like `recomputeCanvasEditShift` (`StoryComposerView.swift:1611-1614`).
- [ ] Add `cappedSheetMaxHeight(screenHeight:) = min(540, screenHeight * 0.42)`. Do NOT delete `composerBandMaxHeight = 540` (Lot B references it).

### Task A1.2 — Composer: replace Option-A overlap with the container transform

- [ ] In `canvasComposerLayer` (`StoryComposerView.swift:1232-1295`), delete the Option-A overlap logic (`let scaled = canvasIsInset`, the `topReserve`/`regionHeight` block, the `clipShape(... scaled ? 22 : 0 ...)`).
- [ ] Inside `GeometryReader { proxy in … }`, compute the framing and FIXED intrinsic size:

```swift
let headerInset = max(proxy.safeAreaInsets.top, 59) + 12
let bottomInset = presentedSheetHeight
let framing = StoryCanvasFraming.resolve(.init(
    viewport: proxy.size, headerInset: headerInset, bottomInset: bottomInset,
    state: canvasIsCarded ? .carded : .free, cardedCornerRadius: 22))
let fit = CanvasGeometry.aspectFitSize(in: proxy.size)   // FULL-viewport intrinsic, FIXED
```

- [ ] Build the canvas with fixed bounds + the container transform (user pinch/drag `canvasScale`/`canvasOffset` compose on top):

```swift
canvasCore
    .frame(width: fit.width, height: fit.height)               // FIXED 9:16 — never animated
    .scaleEffect(viewModel.canvasScale * viewportPinchDelta)
    .offset(x: viewModel.canvasOffset.width + viewportDragDelta.width,
            y: viewModel.canvasOffset.height + viewportDragDelta.height)
    .gesture(isCanvasGestureEnabled && isPanEnabled ? viewportDragGesture : nil)
    .overlay { mediaLoadingOverlay }
    .overlay(alignment: .topTrailing) { canvasZoomResetButton }
    .overlay(alignment: .top) { CanvasLayerIndicator(layer: manipulationLayer).padding(.top, 6).allowsHitTesting(false) }
    .background(/* keep existing canvasNaturalFrame GeometryReader — see A1.3 */)
    // ── Container transform (A4): card placement above the sheet ──
    .scaleEffect(framing.scale)
    .offset(framing.offset)
    .clipShape(RoundedRectangle(cornerRadius: framing.cornerRadius, style: .continuous))
    .frame(width: proxy.size.width, height: proxy.size.height, alignment: .center)
    .offset(y: -canvasEditShift)
    .animation(.spring(response: 0.32, dampingFraction: 0.85), value: framing)
    .animation(.spring(response: 0.32, dampingFraction: 0.85), value: canvasEditShift)
```

- [ ] Verify `.frame(width: fit.width, height: fit.height)` is set ONCE from the FULL-viewport `aspectFitSize`, **independent of `canvasIsCarded`** — only the container `scaleEffect`/`offset`/`clipShape` react. This is the no-`rebuildLayers`-storm guarantee.
- [ ] Make the band/sheet (`ComposerControlsLayer` sibling in `mainContent` ZStack `:280-310`) bottom-pinned and bounded to `presentedSheetHeight` so it never overlaps the carded canvas (canvas region ends at `viewport.height - bottomInset`). No ZStack overlap remains.

### Task A1.3 — Composer: `canvasNaturalFrame` presented frame + settle recompute

- [ ] Keep the `.background(GeometryReader { p in … canvasNaturalFrame = p.frame(in: .global) })` (`:1272-1280`) attached **before** the container `scaleEffect`/`offset` so it reports the presented (post-scale) rect used by `recomputeCanvasEditShift` (`:1615-1618`).
- [ ] Recompute `canvasEditShift` at the spring settle: `.adaptiveOnChange(of: canvasIsCarded) { _, _ in DispatchQueue.main.asyncAfter(deadline: .now() + 0.34) { recomputeCanvasEditShift() } }`.
- [ ] If `StoryDrawingToolbar(bottomInset:)` (`:326`) previously used `drawingDrawerHeight` only to clear the Option-A overlap, repoint it to `presentedSheetHeight` (the sheet is now bounded). Verify by build.

### Task A1.4 — Composer: build + manual component test

- [ ] `./apps/ios/meeshy.sh build` → expect `** BUILD SUCCEEDED **`.
- [ ] `./apps/ios/meeshy.sh run`. Manual checklist — for EACH band tool (Text/Format, Color, Size, Align, Background, Border, Media, Audio, Texture, **Drawing**):
  - [ ] Open tool → sheet rises AND canvas **shrinks into the region above the sheet** with rounded corners; canvas **never behind/under** the sheet.
  - [ ] Drag grabber up → canvas tracks down (inverse coupling), monotonic, no overlap at any height.
  - [ ] Collapse → canvas grows toward full; fully collapsed → canvas full, corners → 0.
  - [ ] Sheet height never exceeds `min(540, screenHeight*0.42)`.
  - [ ] **Drawing**: identical to other tools (no Option-A full-canvas-behind-drawer).
  - [ ] **Inline text editor**: tap text element → editor opens; text stays aligned (no jump) before/after settle; keyboard never covers active text.

### Task A2.1 — Reader: symmetric composition reserve (own == others)

- [ ] In `StoryViewerView+Canvas.swift`, the canvas framing must use a **symmetric** bottom inset (reserve the composition band even when `isOwnStory`, left empty) so the card is identical for own and others. (Keep the sidebar's own `bottomReserved` `:991` if it must differ, but the canvas framing must be symmetric.)
- [ ] Add to `StoryCardView`:

```swift
private var readerCanvasFraming: StoryCanvasFraming.Result {
    StoryCanvasFraming.resolve(.init(
        viewport: geometry.size,
        headerInset: topInset + 100,                          // header + progress bars (:990)
        bottomInset: geometry.safeAreaInsets.bottom + 96,     // SYMMETRIC band (own == others)
        state: isImmersive ? .immersive : .carded,
        cardedCornerRadius: 22))
}
```

### Task A2.2 — Reader: apply the container transform to the canvas only

- [ ] Wrap the reader canvas (`StoryReaderRepresentable` + its loader overlay, `:746-800`) — canvas + 9:16 letterbox content only — with the transform:
  - Keep `.frame(width: canvasFitSize.width, height: canvasFitSize.height)` (`:651-656,757-758`) — FIXED full-viewport intrinsic.
  - After the existing frame/clip: `.scaleEffect(readerCanvasFraming.scale)` → `.offset(readerCanvasFraming.offset)` → `.clipShape(RoundedRectangle(cornerRadius: readerCanvasFraming.cornerRadius, style: .continuous))`.
- [ ] Do NOT apply the framing to: gesture overlay (`:186`), sidebar (`:993-1055`), scrims (`:846-877`), backdrop (`:1270-1281`) — they stay full-viewport. Tap zones unchanged.
- [ ] Bottom-scrim retune in carded mode: when `!isImmersive`, reduce the bottom scrim height/opacity OR reframe it onto the card rect (`:865-873`) so it doesn't darken the backdrop letterbox band. Keep immersive scrim as-is.

### Task A3.1 — Reader: `isImmersive` state distinct from `isFullscreenStorySession`

- [ ] In `StoryViewerView.swift`, add `@State var isImmersive: Bool = false` (next to `isFullscreenStorySession` `:159`); pass as `@Binding var isImmersive` into `StoryCardView` (binding block `StoryViewerView+Canvas.swift:541-589`) and wire at the call site.
- [ ] State matrix:
  - `isImmersive == false` → carded canvas + chrome visible + long-press = toggle chrome (current, `+Canvas.swift:127,143,162`).
  - `isImmersive == true` → full-bleed canvas + chrome hidden + **long-press = pause ONLY** (no chrome reveal): in the gesture handlers, when `isImmersive`, drop the `onChromeVisibilityChange(...)` chrome-reveal calls, keep only the `isLongPressPaused` mutation.
- [ ] Repurpose the hamburger toggle (`StoryViewerView+Sidebar.swift:571-589`) to drive `isImmersive`:

```swift
isImmersive.toggle()
withAnimation(.spring(response: 0.42, dampingFraction: 0.82)) { chromeVisible = !isImmersive }
```

  The container transform animates automatically (`readerCanvasFraming.state` flips `carded ↔ immersive` inside `body` under the same transaction): `cornerRadius 22→0`, `scale→1`, `offset→.zero`.

### Task A3.2 — Reader: coordinate with the card transform stack (avoid triple corner-radius)

- [ ] `StoryViewerContentView` clips the WHOLE card with `cardCornerRadius + slideProgress*16` (`+Canvas.swift:1413`; `cardCornerRadius` `StoryViewerView.swift:837-839`). To avoid stacking three radii, **neutralize the static internal radius while immersive**: when `isImmersive`, force the card-level radius term to 0 (multiply `cardCornerRadius` by `isImmersive ? 0 : 1`).
- [ ] **Disable drag-to-dismiss while immersive**: gate the dismiss `DragGesture` inactive when `isImmersive` (or exit immersive first), preventing dismiss `cardScale`/`cardCornerRadius` (`StoryViewerView.swift:832-839`) from fighting the immersive transform. No frame animated → no `rebuildLayers` storm.

### Task A3.3 — Reader: build + manual validation

- [ ] `./apps/ios/meeshy.sh run`. Manual checklist:
  - [ ] Normal: canvas **carded** (~22 corners, inset), backdrop framing it, chrome visible; card size **identical** own vs others.
  - [ ] Tap left/right backdrop still navigates prev/next.
  - [ ] Hamburger "Plein écran" → spring zoom to full-bleed, corners→0, chrome fades to 0.
  - [ ] While immersive: long-press **pauses only** (no chrome reveal); drag-to-dismiss disabled.
  - [ ] "Quitter le plein écran" → reverse (corners re-round, re-inset, chrome back).
  - [ ] No flicker/background flash during the zoom (confirms container transform).

### Task A.5 — A — Validation gate

- [ ] `-only-testing:MeeshyUITests/StoryCanvasFramingTests` → all green.
- [ ] `./apps/ios/meeshy.sh run` → `** BUILD SUCCEEDED **`, app launches.
- [ ] Full manual pass: composer all tools card above sheet + resize/collapse + drawing included + inline text aligned; reader own == others carded; reader fullscreen zoom in/out, long-press pause-only, dismiss disabled; no flicker.
- [ ] Commit Lot A:

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasFraming.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryCanvasFramingTests.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift \
        apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift \
        apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift \
        apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift
git commit -m "feat(story): canvas card framing + reader immersive fullscreen (Lot A)"
```

---

## Lot B — Universal flexible sheets

> **Depends on Lot A.** B feeds the animated band height into A's inverse coupling (`canvasIsCarded` → `StoryCanvasFraming`). Do not start B until A4's `StoryCanvasFraming` exists and A1's container transform consumes a band-height input.
> Scope: resize + collapse-as-peek generalize to **every band tool** (text/color/size/align/background/border, media, audio, texture, filters, drawing). `.timeline` excluded (full-screen sheet, never in the band — `ComposerControlsLayer.swift:133-135`, `ComposerToolPanelHost.swift:180,199-200`).

### Task B1 — Extract a pure `BandLayoutState` model (RED → GREEN)

**Placement:** `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/BandLayoutState.swift`. Pure value type → `public nonisolated` (like sibling `BandStateMachine.swift`) even under MeeshyUI `.defaultIsolation(MainActor.self)` (`Package.swift:27`). Tests NOT `@MainActor` (Swift Testing, mirroring `BandStateMachineTests`).

- [ ] RED: create `packages/MeeshySDK/Tests/MeeshyUITests/Story/Controls/BandLayoutStateTests.swift` with COMPLETE content:

```swift
import Testing
@testable import MeeshyUI

@Suite("BandLayoutState")
struct BandLayoutStateTests {

    @Test("clamp pins below-min height to min")
    func clampBelowMin() { #expect(BandLayoutState.clamp(100, cappedMax: 540) == 160) }
    @Test("clamp pins above-max height to cappedMax")
    func clampAboveMax() { #expect(BandLayoutState.clamp(900, cappedMax: 540) == 540) }
    @Test("clamp leaves an in-range height untouched")
    func clampInRange() { #expect(BandLayoutState.clamp(300, cappedMax: 540) == 300) }
    @Test("clamp honours a reduced cappedMax (canvas carded)")
    func clampReducedCap() { #expect(BandLayoutState.clamp(500, cappedMax: 360) == 360) }
    @Test("clamp floor wins when cappedMax is degenerate (< min)")
    func clampDegenerateCap() { #expect(BandLayoutState.clamp(300, cappedMax: 120) == 160) }

    @Test("cappedMax is the absolute ceiling when canvas is not carded")
    func cappedMaxFree() { #expect(BandLayoutState.cappedMax(screenHeight: 900, canvasCarded: false) == 540) }
    @Test("cappedMax shrinks to screen fraction when canvas is carded")
    func cappedMaxCarded() { #expect(BandLayoutState.cappedMax(screenHeight: 900, canvasCarded: true) == 378) }
    @Test("cappedMax never exceeds 540 on a tall screen when carded")
    func cappedMaxCardedTallScreen() { #expect(BandLayoutState.cappedMax(screenHeight: 2000, canvasCarded: true) == 540) }

    @Test("height defaults to the per-tool default before any resize")
    func defaultHeightPerTool() {
        let s = BandLayoutState()
        #expect(s.height(for: .drawing) == 280)
        #expect(s.height(for: .media) == 220)
        #expect(s.height(for: .texture) == 160)
        #expect(s.height(for: .filters) == 180)
    }
    @Test("resizing one tool does not change another tool's height")
    func perCategoryRetention() {
        var s = BandLayoutState()
        s = s.applyingResize(for: .media, to: 300, cappedMax: 540)
        #expect(s.height(for: .media) == 300)
        #expect(s.height(for: .text) == 280)
    }
    @Test("a resized height is clamped on the way in")
    func resizeIsClamped() {
        var s = BandLayoutState()
        s = s.applyingResize(for: .filters, to: 999, cappedMax: 400)
        #expect(s.height(for: .filters) == 400)
    }
    @Test("retained height survives a collapse/expand round-trip")
    func retentionAcrossCollapse() {
        var s = BandLayoutState()
        s = s.applyingResize(for: .audio, to: 330, cappedMax: 540)
        s = s.collapsing(.audio); s = s.expanding(.audio)
        #expect(s.height(for: .audio) == 330)
    }

    @Test("a fresh tool is not collapsed")
    func notCollapsedByDefault() { #expect(BandLayoutState().isCollapsed(.drawing) == false) }
    @Test("collapsing then expanding is idempotent")
    func collapseExpandIdempotent() {
        var s = BandLayoutState()
        s = s.collapsing(.text); #expect(s.isCollapsed(.text) == true)
        s = s.expanding(.text); #expect(s.isCollapsed(.text) == false)
    }
    @Test("collapsing twice stays collapsed")
    func collapseTwiceIdempotent() {
        var s = BandLayoutState()
        s = s.collapsing(.media); s = s.collapsing(.media)
        #expect(s.isCollapsed(.media) == true)
    }
    @Test("collapse is per-tool")
    func collapsePerTool() {
        var s = BandLayoutState()
        s = s.collapsing(.media)
        #expect(s.isCollapsed(.media) == true)
        #expect(s.isCollapsed(.text) == false)
    }

    @Test("collapsed tool ⇒ canvas goes full (peek)")
    func collapsedMeansCanvasFull() {
        var s = BandLayoutState()
        s = s.collapsing(.drawing)
        #expect(s.canvasIsFull(for: .drawing) == true)
    }
    @Test("expanded tool ⇒ canvas is carded")
    func expandedMeansCanvasCarded() { #expect(BandLayoutState().canvasIsFull(for: .drawing) == false) }

    @Test("timeline is not band-eligible")
    func timelineNotEligible() { #expect(BandLayoutState.isBandEligible(.timeline) == false) }
    @Test("every non-timeline tool is band-eligible")
    func nonTimelineEligible() {
        for tool in StoryToolMode.allCases where tool != .timeline {
            #expect(BandLayoutState.isBandEligible(tool) == true)
        }
    }
    @Test("timeline has no resize and never collapses to peek")
    func timelineHasNoLayout() {
        var s = BandLayoutState()
        s = s.applyingResize(for: .timeline, to: 400, cappedMax: 540)
        s = s.collapsing(.timeline)
        #expect(s.isCollapsed(.timeline) == false)
        #expect(s.canvasIsFull(for: .timeline) == false)
    }
}
```

- [ ] Run `-only-testing:MeeshyUITests/BandLayoutStateTests` → RED (`cannot find 'BandLayoutState'`).
- [ ] GREEN: create `BandLayoutState.swift`:

```swift
import Foundation

/// Pure, `nonisolated` layout model for the composer bottom band — single source of
/// truth for each band tool's sheet height + collapse (peek). Replaces drawing-only
/// `@State` (`composerBandHeight`, `drawingDrawerCollapsed`). `.timeline` excluded.
public nonisolated struct BandLayoutState: Equatable, Sendable {

    public static let minHeight: CGFloat = 160
    public static let maxHeight: CGFloat = 540
    public static let cardedMaxFraction: CGFloat = 0.42

    private var heights: [StoryToolMode: CGFloat] = [:]
    private var collapsed: Set<StoryToolMode> = []

    public init() {}

    public static func isBandEligible(_ tool: StoryToolMode) -> Bool { tool != .timeline }

    public static func clamp(_ height: CGFloat, cappedMax: CGFloat) -> CGFloat {
        let ceiling = Swift.max(minHeight, cappedMax)
        return Swift.min(ceiling, Swift.max(minHeight, height))
    }

    public static func cappedMax(screenHeight: CGFloat, canvasCarded: Bool) -> CGFloat {
        guard canvasCarded else { return maxHeight }
        return Swift.min(maxHeight, screenHeight * cardedMaxFraction)
    }

    private static func defaultHeight(for tool: StoryToolMode) -> CGFloat {
        switch tool {
        case .media:    return 220
        case .audio:    return 220
        case .drawing:  return 280
        case .text:     return 280
        case .texture:  return 160
        case .filters:  return 180
        case .timeline: return 0
        }
    }

    public func height(for tool: StoryToolMode) -> CGFloat { heights[tool] ?? Self.defaultHeight(for: tool) }
    public func isCollapsed(_ tool: StoryToolMode) -> Bool { Self.isBandEligible(tool) && collapsed.contains(tool) }
    public func canvasIsFull(for tool: StoryToolMode) -> Bool { isCollapsed(tool) }

    public func applyingResize(for tool: StoryToolMode, to height: CGFloat, cappedMax: CGFloat) -> BandLayoutState {
        guard Self.isBandEligible(tool) else { return self }
        var copy = self; copy.heights[tool] = Self.clamp(height, cappedMax: cappedMax); return copy
    }
    public func collapsing(_ tool: StoryToolMode) -> BandLayoutState {
        guard Self.isBandEligible(tool) else { return self }
        var copy = self; copy.collapsed.insert(tool); return copy
    }
    public func expanding(_ tool: StoryToolMode) -> BandLayoutState {
        var copy = self; copy.collapsed.remove(tool); return copy
    }
}
```

> Verify `StoryToolMode` has the exact cases above and conforms to `CaseIterable` (for `allCases`). If `.text`/`.texture`/`.filters` are named differently in the real enum, use the real names (RED compile will surface mismatches). The default heights mirror `ComposerToolPanelHost.swift` `panelHeight`.

- [ ] Run again → GREEN. (If `cappedMaxCarded` shows `378.0 vs 378`, equality holds — 0.42×900 is exact.)
- [ ] Commit: `feat(story): pure BandLayoutState (per-tool sheet height + collapse) — Lot B`.

### Task B2 — Generalize resize to ALL band tools (view wiring)

- [ ] `ComposerControlsLayer.swift:62` — replace the drawing-only gate:

```swift
private var isBandResizable: Bool {
    guard let tool = effectiveBandState.activeTool else { return false }
    return BandLayoutState.isBandEligible(tool)
}
```

  If `BandState` has no `activeTool`, add it in `BandStateMachine.swift` next to `activeCategory` (`:20-25`):

```swift
public var activeTool: StoryToolMode? {
    switch self {
    case .hidden, .formatPanel: return nil
    case .toolPanel(let t): return t
    }
}
```

- [ ] `ComposerControlsLayer.swift:177` — `resizableHeight` call site unchanged (`isBandResizable ? $resizableBandHeight : nil`); the generalized gate makes it apply to all tools. Confirm `.formatPanel(.text,…)` stays NON-resizable (its `activeTool` is `nil`).
- [ ] `ComposerControlsLayer.swift:197-216` — the whole-band swipe `DragGesture` is now disarmed for every tool (grabber owns vertical drag). Verify each tool retains a reachable close affordance: the tool back chevron (`ComposerToolPanelHost.backButton :84-103` → `onBackFromToolPanel` → `bandStateMachine.backFromToolPanel()`). Confirm in B5.
- [ ] `ComposerToolPanelHost.swift:27,119,176` — rename `drawingPanelHeightOverride` → `panelHeightOverride: CGFloat?` and apply to every non-timeline tool:

```swift
// :27
var panelHeightOverride: CGFloat? = nil
// :176
private var panelHeight: CGFloat {
    if let override = panelHeightOverride, tool != .timeline { return override }
    switch tool { /* existing per-tool defaults unchanged */ }
}
```

  Update call site `ComposerBottomBand.swift:119` (`drawingPanelHeightOverride:` → `panelHeightOverride:`).
- [ ] `ComposerBottomBand.swift:22-28` — update docstrings ("mode dessin / Option A" → "every band tool except timeline; canvas carded above the sheet"). No behavioral change.

### Task B3 — Universal collapse-as-peek

- [ ] `ComposerControlsLayer.swift:24-26,44,57` — drop `@Binding var drawingDrawerCollapsed: Bool` in favor of the band layout. Introduce a `@Binding var layout: BandLayoutState` (hoisted in B4); update init + call site (`:668-671`).
- [ ] `ComposerControlsLayer.swift:180-192` — rewire callbacks to the active tool:

```swift
onResizeDismiss: {
    guard let tool = effectiveBandState.activeTool, BandLayoutState.isBandEligible(tool) else { return }
    layout = layout.collapsing(tool)
},
drawingCollapsed: {
    guard let tool = effectiveBandState.activeTool else { return false }
    return layout.isCollapsed(tool)
}(),
onExpandDrawer: {
    guard let tool = effectiveBandState.activeTool else { return }
    layout = layout.expanding(tool)
}
```

- [ ] `ComposerBottomBand.swift:24-36,80-245` — rename `drawingCollapsed` → `collapsed` (param + the `if !drawingCollapsed` body gate `:89`) and update docstrings. The grabber collapse threshold (`:238`) and collapsed-grabber expand drag (`:210-221`) are already tool-agnostic.
- [ ] Manual (B5): per eligible tool, open → drag grabber below fold → sheet shrinks to grabber, tool stays selected (FABs do NOT return), canvas full → drag up → restores. `.timeline` shows no grabber/collapse.

### Task B4 — Hoist `BandLayoutState` + wire B into A's `canvasIsCarded`

- [ ] `StoryComposerView.swift:197,202,205` — replace the three `@State` with `@State private var bandLayout = BandLayoutState()` (keep `drawingDrawerGrabberHeight` constant if reused as the peek grabber height). Reference `BandLayoutState.minHeight/.maxHeight` instead of duplicating `composerBandMinHeight/MaxHeight`.
- [ ] `StoryComposerView.swift:668-671` — update the `ComposerControlsLayer` call site:

```swift
resizableBandHeight: Binding(
    get: { bandStateMachine.state.activeTool.map { bandLayout.height(for: $0) } ?? BandLayoutState.minHeight },
    set: { newValue in
        guard let tool = bandStateMachine.state.activeTool else { return }
        let cap = BandLayoutState.cappedMax(screenHeight: UIScreen.main.bounds.height, canvasCarded: true)
        bandLayout = bandLayout.applyingResize(for: tool, to: newValue, cappedMax: cap)
    }
),
bandMinHeight: BandLayoutState.minHeight,
bandMaxHeight: BandLayoutState.cappedMax(screenHeight: UIScreen.main.bounds.height, canvasCarded: true),
layout: $bandLayout,
```

  (`UIScreen.main.bounds` read inside a `@MainActor` View body is safe — do NOT lift into a Combine pipeline per memory.)
- [ ] `StoryComposerView.swift:1304-1314` — abandon Option-A (`canvasIsInset`/`drawingDrawerHeight`); add:

```swift
private var activeBandTool: StoryToolMode? { bandStateMachine.state.activeTool }

private var canvasIsCarded: Bool {
    if let tool = activeBandTool, BandLayoutState.isBandEligible(tool), !bandLayout.isCollapsed(tool) { return true }
    return viewModel.drawingEditingMode.isActive || viewModel.textEditingMode != .inactive
}

/// Animated sheet height feeding A4 (0 when collapsed/hidden → canvas full).
private var bandSheetHeight: CGFloat {
    guard let tool = activeBandTool, BandLayoutState.isBandEligible(tool), !bandLayout.isCollapsed(tool) else { return 0 }
    return bandLayout.height(for: tool) + 40
}
```

- [ ] **Replace A1's interim `presentedSheetHeight`** with `bandSheetHeight` as the `bottomInset` fed to `StoryCanvasFraming.resolve(...)` in `canvasComposerLayer` (the canvas region becomes `[header … screenHeight - bandSheetHeight]`). This is the A→B handoff — the framing call defined in Lot A Task A1.2 now reads `bottomInset: bandSheetHeight`. No new framing math; A4's unit tests already cover inverse-coupling monotonicity.
- [ ] Animate the coupling: `.animation(.spring(response: 0.3, dampingFraction: 0.85), value: bandSheetHeight)` on the canvas container (matching the band spring `ComposerControlsLayer.swift:220`). Animate only the container transform — never the canvas frame.

### Task B5 — B — Validation gate

- [ ] `./apps/ios/meeshy.sh run` (if exit 1 with stale `.app`, `rm -rf` the `.app` and rebuild — memory note).
- [ ] Manual per band tool (text, color, size, align, background, border, media, audio, texture, filters, drawing): open → carded above sheet (no overlap); grabber up → canvas scales down (inverse, capped); grabber down past fold → collapses to grabber, tool stays selected, canvas full; grabber up → re-cards; back chevron closes to FABs.
- [ ] Timeline: opens full-screen sheet, no grabber, no carding coupling (unchanged).
- [ ] No `rebuildLayers` storm during resize/collapse (container transform only).
- [ ] `-only-testing:MeeshyUITests/BandLayoutStateTests` → green; also re-run `BandStateMachineTests` + `ComposerControlsLayerTests` (the `activeTool` add + renames must not regress).
- [ ] Commit:

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/BandLayoutState.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/Controls/BandLayoutStateTests.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/BandStateMachine.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerControlsLayer.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerBottomBand.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerToolPanelHost.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift
git commit -m "feat(story): universal flexible band sheets (resize + collapse-as-peek) — Lot B"
```

---

## Lot C — Drawing thickness + pressure

> Scope: variable-width strokes driven by Apple Pencil force (iPad) and finger velocity (iPhone), full non-regression on legacy strokes. Ships in two waves: **C1+C2 first** (capture driver + width mapping, computed but invisible behind the still-constant renderer), then **C3+C4** (variable-width render + live-preview perf). C is independent of A/B (projection already uniform at 9:16).
>
> Hard invariant: **`captureVersion` default 0 keeps every legacy stroke pixel-identical.** Pure helpers + the variable-width builder live in CORE `MeeshySDK` (`Sources/MeeshySDK/Story/Drawing/`), `nonisolated`; their tests in `MeeshySDKTests` are NOT `@MainActor`. View-adjacent wiring (`StrokeCaptureLayer`, `MeeshyStrokeCanvas`, `StoryStrokeRasterizer`, `StoryComposerView`) is MeeshyUI; tests in `MeeshyUITests`.
>
> **Before C2: verify the real drawing-tool enum** on `StoryDrawingStroke.tool` (draft assumes `StrokeTool` with `.pen/.marker/.eraser`). Use the actual type/case names.

### C1 — Capture: per-point width driver

**C1.0 — Add `captureVersion` to the model (RED → GREEN)**

- [ ] RED: create `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryDrawingStrokeCaptureVersionTests.swift`:

```swift
import Testing
import Foundation
@testable import MeeshySDK

@Suite("StoryDrawingStroke.captureVersion — default 0, codable, legacy-tolerant")
struct StoryDrawingStrokeCaptureVersionTests {
    @Test("default captureVersion is 0 (legacy)")
    func default_is_zero() { #expect(StoryDrawingStroke(colorHex: "FF0000", width: 5).captureVersion == 0) }

    @Test("captureVersion round-trips through Codable")
    func roundtrips() throws {
        let s = StoryDrawingStroke(colorHex: "FF0000", width: 5, captureVersion: 1)
        let data = try JSONEncoder().encode(s)
        let back = try JSONDecoder().decode(StoryDrawingStroke.self, from: data)
        #expect(back.captureVersion == 1)
    }

    @Test("legacy JSON without captureVersion key decodes to 0")
    func legacy_json_defaults_zero() throws {
        let json = #"{"id":"x","points":[],"colorHex":"FF0000","width":5,"tool":"pen","smoothing":"raw","createdAt":0}"#
        let dec = JSONDecoder(); dec.dateDecodingStrategy = .secondsSince1970
        let s = try dec.decode(StoryDrawingStroke.self, from: Data(json.utf8))
        #expect(s.captureVersion == 0)
    }
}
```

> Verify the exact `StoryDrawingStroke` init label/order and the `tool`/`smoothing`/`createdAt` JSON keys/encodings before finalizing the legacy-JSON fixture (adjust keys to the real `CodingKeys`).

- [ ] GREEN: in `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryDrawingStroke.swift`, add (after `smoothing`):

```swift
/// Version du pipeline de capture. 0 = legacy (rendu largeur constante `base`,
/// identique à aujourd'hui). ≥1 = chaque point porte un driver réel dans `pressure`.
public var captureVersion: Int
```

  Add `captureVersion: Int = 0` (last, defaulted) to `init`; assign it. Ensure decoding tolerates a missing key: in the custom `init(from:)` use `captureVersion = try container.decodeIfPresent(Int.self, forKey: .captureVersion) ?? 0` (add `.captureVersion` to `CodingKeys`). Prefer synthesized `encode` (no manual `encode(to:)`); if a manual encoder is required, any byte-equality test must use `.sortedKeys` (memory lesson) — none here.
- [ ] Run `-only-testing:MeeshySDKTests/StoryDrawingStrokeCaptureVersionTests` → 3 PASS.
- [ ] Commit: `feat(story/drawing): add captureVersion to StoryDrawingStroke (default 0 = legacy)`.

**C1.1 — Pure width-driver functions (RED → GREEN)**

- [ ] RED: create `packages/MeeshySDK/Tests/MeeshySDKTests/Story/StrokeWidthDriverTests.swift` (Swift Testing, NOT `@MainActor`):

```swift
import Testing
import CoreGraphics
@testable import MeeshySDK

@Suite("StrokeWidthDriver — per-point pressure driver (high = thick), [0,1]")
struct StrokeWidthDriverTests {
    @Test("first point → nil velocity (no predecessor)")
    func firstPointNeutral() {
        #expect(StrokeWidthDriver.neutral == 0.5)
        #expect(StrokeWidthDriver.velocity(from: nil, to: CGPoint(x: 10, y: 10), dt: 0.016) == nil)
    }
    @Test("Δt == 0 → nil velocity (guard)")
    func zeroDtGuard() { #expect(StrokeWidthDriver.velocity(from: .zero, to: CGPoint(x: 10, y: 0), dt: 0) == nil) }
    @Test("velocity = distance / dt")
    func velocityValue() { #expect(StrokeWidthDriver.velocity(from: .zero, to: CGPoint(x: 30, y: 40), dt: 0.5) == 100) }
    @Test("moving-average smoothing over a window (3)")
    func smoothingWindow() {
        let smoothed = StrokeWidthDriver.movingAverage([0, 0, 30, 0, 0], window: 3)
        #expect(smoothed.count == 5); #expect(smoothed[2] == 10); #expect(smoothed.allSatisfy { $0 <= 30 })
    }
    @Test("normalize by Vmax, clamp [0,1]")
    func normalizeVmax() {
        #expect(StrokeWidthDriver.normalize(0, vMax: 4000) == 0)
        #expect(StrokeWidthDriver.normalize(4000, vMax: 4000) == 1)
        #expect(StrokeWidthDriver.normalize(8000, vMax: 4000) == 1)
    }
    @Test("pencil driver = clamp01(force/maxForce)")
    func pencilOrientation() {
        #expect(StrokeWidthDriver.pencilDriver(force: 0, maxForce: 4) == 0)
        #expect(StrokeWidthDriver.pencilDriver(force: 4, maxForce: 4) == 1)
        #expect(StrokeWidthDriver.pencilDriver(force: 2, maxForce: 4) == 0.5)
        #expect(StrokeWidthDriver.pencilDriver(force: 1, maxForce: 0) == StrokeWidthDriver.neutral)
    }
    @Test("finger driver = 1 - normalizedSmoothedVelocity (slow = thick)")
    func fingerOrientation() {
        #expect(StrokeWidthDriver.fingerDriver(normalizedSmoothedVelocity: 0) == 1)
        #expect(StrokeWidthDriver.fingerDriver(normalizedSmoothedVelocity: 1) == 0)
        #expect(StrokeWidthDriver.fingerDriver(normalizedSmoothedVelocity: 0.25) == 0.75)
    }
    @Test("all drivers clamp into [0,1]")
    func clampRange() {
        #expect(StrokeWidthDriver.pencilDriver(force: 99, maxForce: 4) == 1)
        #expect(StrokeWidthDriver.fingerDriver(normalizedSmoothedVelocity: 2) == 0)
    }
}
```

- [ ] GREEN: create `packages/MeeshySDK/Sources/MeeshySDK/Story/Drawing/StrokeWidthDriver.swift`:

```swift
import Foundation
import CoreGraphics

/// Driver de largeur normalisé `[0,1]` par point, orienté « haut = épais ». Source pencil
/// (force) ou doigt (vitesse). Pur / `nonisolated`, calculé côté capture (jamais au rendu).
public enum StrokeWidthDriver {
    public static let neutral: CGFloat = 0.5
    public static let designVMax: CGFloat = 4000   // design-px/sec, tunable on device

    public static func velocity(from previous: CGPoint?, to current: CGPoint, dt: CGFloat) -> CGFloat? {
        guard let previous, dt > 0 else { return nil }
        return hypot(current.x - previous.x, current.y - previous.y) / dt
    }
    public static func movingAverage(_ values: [CGFloat], window: Int) -> [CGFloat] {
        guard window > 1, values.count > 1 else { return values }
        let half = window / 2
        return values.indices.map { i in
            let lo = max(0, i - half), hi = min(values.count - 1, i + half)
            let slice = values[lo...hi]
            return slice.reduce(0, +) / CGFloat(slice.count)
        }
    }
    public static func normalize(_ velocity: CGFloat, vMax: CGFloat) -> CGFloat {
        guard vMax > 0 else { return 0 }
        return clamp01(velocity / vMax)
    }
    public static func pencilDriver(force: CGFloat, maxForce: CGFloat) -> CGFloat {
        guard maxForce > 0 else { return neutral }
        return clamp01(force / maxForce)
    }
    public static func fingerDriver(normalizedSmoothedVelocity: CGFloat) -> CGFloat {
        clamp01(1 - normalizedSmoothedVelocity)
    }
    static func clamp01(_ x: CGFloat) -> CGFloat { min(1, max(0, x)) }
}
```

- [ ] Run → PASS. Commit: `feat(story/drawing): pure StrokeWidthDriver (pencil force / finger velocity → [0,1])`.

**C1.2 — Wire `StrokeCaptureLayer.extract` to populate pressure + `captureVersion = 1`**

- [ ] RED: extend `packages/MeeshySDK/Tests/MeeshyUITests/Story/StrokeCaptureLayerTests.swift` (stays `@MainActor`). Add a parametrized `point(_:_:t:force:maxForce:)` helper (non-zero `timeOffset`/`force`) and:

```swift
private func point(_ x: CGFloat, _ y: CGFloat, t: TimeInterval, force: CGFloat, maxForce: CGFloat = 4) -> PKStrokePoint {
    PKStrokePoint(location: CGPoint(x: x, y: y), timeOffset: t, size: CGSize(width: 5, height: 5),
                  opacity: 1, force: force, azimuth: 0, altitude: 0)
}

func test_extract_setsCaptureVersion1_andPerPointPressure() {
    let d = drawing([point(100, 100, t: 0, force: 0, maxForce: 4),
                     point(200, 100, t: 0.10, force: 4, maxForce: 4)])
    let event = StrokeCaptureLayer.extract(from: d, bounds: bounds, tool: .pen,
                                           colorHex: "00FF00", width: 7, smoothing: .raw)
    guard case .stroke(let stroke) = event else { return XCTFail("expected .stroke") }
    XCTAssertEqual(stroke.captureVersion, 1)
    XCTAssertEqual(stroke.points.count, 2)
    XCTAssertGreaterThan(stroke.points.last!.pressure, stroke.points.first!.pressure)
    XCTAssertLessThanOrEqual(stroke.points.last!.pressure, 1.0)
    XCTAssertGreaterThanOrEqual(stroke.points.first!.pressure, 0.0)
}

func test_extract_zeroTimeOffsetDelta_doesNotCrash_usesNeutral() {
    let d = drawing([point(0, 0, t: 0, force: 0, maxForce: 0),
                     point(50, 0, t: 0, force: 0, maxForce: 0)])
    let event = StrokeCaptureLayer.extract(from: d, bounds: bounds, tool: .pen,
                                           colorHex: "FFFFFF", width: 5, smoothing: .raw)
    guard case .stroke(let stroke) = event else { return XCTFail("expected .stroke") }
    XCTAssertTrue(stroke.points.allSatisfy { $0.pressure.isFinite })
    XCTAssertTrue(stroke.points.allSatisfy { (0...1).contains($0.pressure) })
}
```

> Confirm the real `extract` signature and `.stroke`/`.erase`/`.none` event enum names; adapt if different.

- [ ] GREEN: edit `StrokeCaptureLayer.swift` `extract(...)` (~35-62). After computing `(scaleX, scaleY)`:

```swift
let pkPoints = Array(pkStroke.path)
let designPoints: [CGPoint] = pkPoints.map { CGPoint(x: $0.location.x * scaleX, y: $0.location.y * scaleY) }
guard !designPoints.isEmpty else { return .none }
if tool == .eraser { return .erase(designPoints) }

let usesPencilForce = pkPoints.contains { $0.maximumPossibleForce > 0 }
let pressures: [CGFloat] = usesPencilForce
    ? pkPoints.map { StrokeWidthDriver.pencilDriver(force: $0.force, maxForce: $0.maximumPossibleForce) }
    : Self.fingerPressures(designPoints: designPoints, pkPoints: pkPoints)

let strokePoints = zip(designPoints, pressures).map { pt, p in
    StoryDrawingStrokePoint(x: pt.x, y: pt.y, pressure: Double(p))
}
let stroke = StoryDrawingStroke(points: strokePoints, colorHex: colorHex, width: width,
                                tool: tool, smoothing: smoothing, captureVersion: 1)
return .stroke(stroke)
```

  Add `private static func fingerPressures(designPoints:pkPoints:) -> [CGFloat]`: raw velocities via `StrokeWidthDriver.velocity` over consecutive `pkPoints[i].timeOffset` deltas + design-space distances (substitute `0` where `nil`); `movingAverage(_, window: 5)`; `normalize(_, vMax: StrokeWidthDriver.designVMax)`; `fingerDriver`; first point → `neutral`.
- [ ] Run `-only-testing:MeeshyUITests/StrokeCaptureLayerTests` → existing + 2 new PASS.
- [ ] Commit: `feat(story/drawing): StrokeCaptureLayer.extract populates per-point pressure + captureVersion=1`.

### C2 — Width mapping + non-regression (ships first behind constant renderer)

**C2.1 — Pure `effWidth` mapping (RED → GREEN)**

- [ ] RED: create `packages/MeeshySDK/Tests/MeeshySDKTests/Story/StrokeWidthMappingTests.swift` (Swift Testing):

```swift
import Testing
import CoreGraphics
@testable import MeeshySDK

@Suite("StrokeWidthMapping — pressure → effective width, legacy non-regression")
struct StrokeWidthMappingTests {
    private func stroke(width: Double, tool: StrokeTool, captureVersion: Int, pressure: Double) -> StoryDrawingStroke {
        StoryDrawingStroke(points: [StoryDrawingStrokePoint(x: 0, y: 0, pressure: pressure)],
                           colorHex: "FF0000", width: width, tool: tool, smoothing: .raw, captureVersion: captureVersion)
    }
    @Test("base width: pen ×1, marker ×2")
    func baseWidth() {
        #expect(StrokeWidthMapping.base(width: 10, tool: .pen) == 10)
        #expect(StrokeWidthMapping.base(width: 10, tool: .marker) == 20)
    }
    @Test("pressure 0 maps to 0.5×base (≥1)")
    func pressureLow() { #expect(StrokeWidthMapping.effectiveWidth(of: stroke(width: 10, tool: .pen, captureVersion: 1, pressure: 0), pressure: 0) == 5) }
    @Test("0.5×base never drops below 1")
    func lowClampFloor() { #expect(StrokeWidthMapping.effectiveWidth(of: stroke(width: 1, tool: .pen, captureVersion: 1, pressure: 0), pressure: 0) == 1) }
    @Test("pressure 1 maps to 1.6×base (≤2.5×base)")
    func pressureHigh() { #expect(StrokeWidthMapping.effectiveWidth(of: stroke(width: 10, tool: .pen, captureVersion: 1, pressure: 1), pressure: 1) == 16) }
    @Test("marker multiplier flows through base")
    func markerThrough() { #expect(StrokeWidthMapping.effectiveWidth(of: stroke(width: 10, tool: .marker, captureVersion: 1, pressure: 1), pressure: 1) == 32) }
    @Test("legacy captureVersion 0 → constant base (pressure ignored)")
    func legacyConstant() {
        #expect(StrokeWidthMapping.effectiveWidth(of: stroke(width: 10, tool: .pen, captureVersion: 0, pressure: 0), pressure: 0) == 10)
        #expect(StrokeWidthMapping.effectiveWidth(of: stroke(width: 10, tool: .pen, captureVersion: 0, pressure: 1), pressure: 1) == 10)
    }
}
```

- [ ] GREEN: create `packages/MeeshySDK/Sources/MeeshySDK/Story/Drawing/StrokeWidthMapping.swift`:

```swift
import Foundation
import CoreGraphics

/// Mappe le driver de pression `[0,1]` vers une largeur effective. Fonction pure unique,
/// partagée live + baked. Legacy (`captureVersion == 0`) → `base` constant (non-régression).
public enum StrokeWidthMapping {
    private static let minPressureFactor: CGFloat = 0.5
    private static let maxPressureFactor: CGFloat = 1.6
    private static let hardCapFactor: CGFloat = 2.5
    private static let minWidth: CGFloat = 1

    public static func base(width: Double, tool: StrokeTool) -> CGFloat {
        CGFloat(width) * (tool == .marker ? 2 : 1)
    }
    public static func effectiveWidth(of stroke: StoryDrawingStroke, pressure: Double) -> CGFloat {
        let base = base(width: stroke.width, tool: stroke.tool)
        guard stroke.captureVersion >= 1 else { return max(minWidth, base) }
        let factor = minPressureFactor + (maxPressureFactor - minPressureFactor) * CGFloat(pressure)
        return min(hardCapFactor * base, max(minWidth, base * factor))
    }
}
```

- [ ] Run → PASS. Confirm renderers untouched (still constant) and existing render suites green:
  `-only-testing:MeeshySDKTests/StrokePathBuilderTests -only-testing:MeeshyUITests/StoryStrokeRasterizerTests`.
- [ ] Commit: `feat(story/drawing): pure StrokeWidthMapping + legacy non-regression`.

> **De-risk checkpoint:** C1+C2 complete = strokes capture a real driver + a mapping exists, but on-screen result is byte-identical to today. Safe to land in parallel with A/B.

### C3 — Width-carrying smoothing + shared variable-width builder

**C3.1 — Width-annotated render points (RED → GREEN)**

- [ ] RED: create `packages/MeeshySDK/Tests/MeeshySDKTests/Story/StrokeWidthSmoothingTests.swift`:

```swift
import Testing
import CoreGraphics
@testable import MeeshySDK

@Suite("Width-carrying smoothing — Catmull-Rom & RDP keep width in lockstep")
struct StrokeWidthSmoothingTests {
    private func stroke(_ pts: [(CGFloat, CGFloat, Double)], smoothing: StrokeSmoothing) -> StoryDrawingStroke {
        StoryDrawingStroke(points: pts.map { StoryDrawingStrokePoint(x: $0.0, y: $0.1, pressure: $0.2) },
                           colorHex: "FF0000", width: 10, tool: .pen, smoothing: smoothing, captureVersion: 1)
    }
    @Test("raw: one width-point per captured point, effWidth applied")
    func raw_lockstep() {
        let wp = StrokePathBuilder.renderWidthPoints(for: stroke([(0,0,0), (100,0,1)], smoothing: .raw))
        #expect(wp.count == 2); #expect(wp[0].point == CGPoint(x: 0, y: 0))
        #expect(wp[0].width == 5); #expect(wp[1].width == 16)
    }
    @Test("curve: interpolated points carry interpolated width (bracketed)")
    func curve_carriesWidth() {
        let wp = StrokePathBuilder.renderWidthPoints(for: stroke([(0,0,0), (50,100,1), (100,0,0)], smoothing: .curve))
        #expect(wp.count > 3)
        #expect(wp.first?.point == CGPoint(x: 0, y: 0)); #expect(wp.last?.point == CGPoint(x: 100, y: 0))
        #expect(wp.first?.width == 5); #expect(wp.last?.width == 5)
        #expect(wp.allSatisfy { $0.width >= 5 - 0.001 && $0.width <= 16 + 0.001 })
    }
    @Test("line: RDP keeps kept-points' width in lockstep")
    func line_keepsWidth() {
        let wp = StrokePathBuilder.renderWidthPoints(for: stroke([(0,0,0), (10,10,0.5), (20,20,0.5), (30,30,1)], smoothing: .line))
        #expect(wp.count == 2)
        #expect(wp.first?.point == CGPoint(x: 0, y: 0)); #expect(wp.last?.point == CGPoint(x: 30, y: 30))
        #expect(wp.first?.width == 5); #expect(wp.last?.width == 16)
    }
    @Test("legacy captureVersion 0 → all widths equal constant base")
    func legacy_constantWidth() {
        let s = StoryDrawingStroke(points: [StoryDrawingStrokePoint(x: 0, y: 0, pressure: 0),
                                            StoryDrawingStrokePoint(x: 100, y: 0, pressure: 1)],
                                   colorHex: "FF0000", width: 10, tool: .pen, smoothing: .raw, captureVersion: 0)
        #expect(StrokePathBuilder.renderWidthPoints(for: s).allSatisfy { $0.width == 10 })
    }
}
```

- [ ] GREEN: extend `StrokeSmoothing.swift` with width-carrying overloads (keep position-only ones):
  - `CatmullRomSmoother.smooth(_ points: [CGPoint], widths: [CGFloat], samplesPerSegment: Int = 8) -> (points: [CGPoint], widths: [CGFloat])` — same basis on the width scalar in lockstep; endpoints keep source widths.
  - `RamerDouglasPeucker.straighten(_ points: [CGPoint], widths: [CGFloat], tolerance: CGFloat = 8) -> (points: [CGPoint], widths: [CGFloat])` — carry indices so kept points retain width.
- [ ] GREEN: in `StrokePathBuilder.swift` add `public struct StrokeWidthPoint: Equatable { public let point: CGPoint; public let width: CGFloat }` and:

```swift
public static func renderWidthPoints(for stroke: StoryDrawingStroke) -> [StrokeWidthPoint] {
    let pts = stroke.points.map { CGPoint(x: $0.x, y: $0.y) }
    let widths = stroke.points.map { StrokeWidthMapping.effectiveWidth(of: stroke, pressure: $0.pressure) }
    let (p, w): ([CGPoint], [CGFloat])
    switch stroke.smoothing {
    case .raw:   (p, w) = (pts, widths)
    case .curve: (p, w) = CatmullRomSmoother.smooth(pts, widths: widths)
    case .line:  (p, w) = RamerDouglasPeucker.straighten(pts, widths: widths)
    }
    return zip(p, w).map { StrokeWidthPoint(point: $0, width: $1) }
}
```

- [ ] Run `-only-testing:MeeshySDKTests/StrokeWidthSmoothingTests` + existing `StrokeSmoothingTests` (must stay green — overloads not replacements).
- [ ] Commit: `feat(story/drawing): width-carrying Catmull-Rom/RDP + renderWidthPoints`.

**C3.2 — Shared variable-width builder + cache (RED → GREEN)**

- [ ] RED: create `packages/MeeshySDK/Tests/MeeshySDKTests/Story/VariableWidthStrokeBuilderTests.swift`:

```swift
import Testing
import CoreGraphics
@testable import MeeshySDK

@Suite("VariableWidthStrokeBuilder — triangle-strip along centerline + cache")
struct VariableWidthStrokeBuilderTests {
    private func stroke(_ pts: [(CGFloat, CGFloat, Double)]) -> StoryDrawingStroke {
        StoryDrawingStroke(points: pts.map { StoryDrawingStrokePoint(x: $0.0, y: $0.1, pressure: $0.2) },
                           colorHex: "FF0000", width: 10, tool: .pen, smoothing: .raw, captureVersion: 1)
    }
    @Test("strip has 2 offset vertices per width-point")
    func vertexCount() {
        let geo = VariableWidthStrokeBuilder().geometry(for: stroke([(0,0,1), (100,0,1), (200,0,1)]))
        #expect(geo.vertices.count == 6)
    }
    @Test("offsets perpendicular at half effective width")
    func offsetsPerpendicular() {
        let geo = VariableWidthStrokeBuilder().geometry(for: stroke([(0,0,1), (100,0,1)]))
        let v0 = geo.vertices[0], v1 = geo.vertices[1]
        #expect(abs(v0.y - 8) < 0.01 || abs(v0.y + 8) < 0.01)
        #expect(abs((v0.y - v1.y).magnitude - 16) < 0.01)
        #expect(abs(v0.x) < 0.01)
    }
    @Test("width varies along strip when pressure varies")
    func widthVaries() {
        let geo = VariableWidthStrokeBuilder().geometry(for: stroke([(0,0,0), (100,0,1)]))
        #expect((geo.vertices[2].y - geo.vertices[3].y).magnitude > (geo.vertices[0].y - geo.vertices[1].y).magnitude)
    }
    @Test("cache hit returns identical geometry for the same stroke")
    func cacheHit() {
        let b = VariableWidthStrokeBuilder(); let s = stroke([(0,0,1), (100,0,1)])
        let a = b.geometry(for: s); let c = b.geometry(for: s)
        #expect(b.cacheHits == 1); #expect(a.vertices == c.vertices)
    }
    @Test("cache miss when pressure changes")
    func cacheMissOnKeyChange() {
        let b = VariableWidthStrokeBuilder()
        _ = b.geometry(for: stroke([(0,0,1), (100,0,1)]))
        _ = b.geometry(for: stroke([(0,0,0), (100,0,0)]))
        #expect(b.cacheHits == 0)
    }
}
```

- [ ] GREEN: create `packages/MeeshySDK/Sources/MeeshySDK/Story/Drawing/VariableWidthStrokeBuilder.swift`:

```swift
import Foundation
import CoreGraphics

/// Géométrie largeur-variable en triangle-strip le long de la centerline (2 sommets décalés
/// par width-point — pas d'empilement de disques). Partagé live + baked. Cache par stroke.
public final class VariableWidthStrokeBuilder {
    public struct Geometry: Equatable, Sendable { public let vertices: [CGPoint] }

    private var cache: [Int: Geometry] = [:]
    public private(set) var cacheHits = 0
    public init() {}

    public func geometry(for stroke: StoryDrawingStroke) -> Geometry {
        let key = cacheKey(for: stroke)
        if let cached = cache[key] { cacheHits += 1; return cached }
        let geo = Self.tessellate(StrokePathBuilder.renderWidthPoints(for: stroke))
        cache[key] = geo
        return geo
    }

    static func tessellate(_ wps: [StrokePathBuilder.StrokeWidthPoint]) -> Geometry {
        guard wps.count >= 1 else { return Geometry(vertices: []) }
        var verts: [CGPoint] = []; verts.reserveCapacity(wps.count * 2)
        for i in wps.indices {
            let p = wps[i].point, half = wps[i].width / 2
            let t = Self.tangent(at: i, in: wps)
            let n = CGPoint(x: -t.y, y: t.x)
            verts.append(CGPoint(x: p.x + n.x * half, y: p.y + n.y * half))   // left
            verts.append(CGPoint(x: p.x - n.x * half, y: p.y - n.y * half))   // right
        }
        return Geometry(vertices: verts)
    }
    private static func tangent(at i: Int, in wps: [StrokePathBuilder.StrokeWidthPoint]) -> CGPoint {
        let prev = wps[max(0, i - 1)].point, next = wps[min(wps.count - 1, i + 1)].point
        let dx = next.x - prev.x, dy = next.y - prev.y
        let len = max(hypot(dx, dy), 0.0001)
        return CGPoint(x: dx / len, y: dy / len)
    }
    private func cacheKey(for stroke: StoryDrawingStroke) -> Int {
        var h = Hasher()
        for pt in stroke.points { h.combine(pt.x); h.combine(pt.y); h.combine(pt.pressure) }
        h.combine(stroke.width); h.combine(stroke.smoothing); h.combine(stroke.tool); h.combine(stroke.captureVersion)
        return h.finalize()
    }
}
```

- [ ] Run → PASS. Commit: `feat(story/drawing): shared variable-width triangle-strip builder + cache`.

**C3.3 — Switch live + baked renderers to the shared builder (RED → GREEN, parity)**

- [ ] RED: add `packages/MeeshySDK/Tests/MeeshySDKTests/Story/StrokeRenderParityTests.swift`:

```swift
import Testing
import CoreGraphics
@testable import MeeshySDK

@Suite("Stroke render parity — live & baked consume identical geometry")
struct StrokeRenderParityTests {
    @Test("identical geometry for the same stroke")
    func liveBakedGeometryParity() {
        let a = VariableWidthStrokeBuilder(), b = VariableWidthStrokeBuilder()
        let s = StoryDrawingStroke(points: [StoryDrawingStrokePoint(x: 0, y: 0, pressure: 0.2),
                                            StoryDrawingStrokePoint(x: 100, y: 40, pressure: 0.9)],
                                   colorHex: "FF0000", width: 12, tool: .marker, smoothing: .curve, captureVersion: 1)
        #expect(a.geometry(for: s).vertices == b.geometry(for: s).vertices)
    }
}
```

- [ ] GREEN — `MeeshyStrokeCanvas.swift` `paint(_:in:)` (~42-55): replace the constant-width `context.stroke(path, style: StrokeStyle(lineWidth:))` with a FILL of the variable-width ribbon: build a `Path` from the builder's left-offset verts forward then right-offset verts reversed (closed ribbon), filled with the stroke color (marker opacity preserved). Add round end-caps (circles radius `firstWidth/2`, `lastWidth/2`). Hold one `VariableWidthStrokeBuilder` for the view so committed strokes hit cache.
- [ ] GREEN — `StoryStrokeRasterizer.swift` `draw(_:in:)` (~42-53): replace `setLineWidth(constant)` + `addPath(centerline)` + `strokePath()` with `addPath(ribbon)` + `fillPath()` using the SAME `VariableWidthStrokeBuilder.geometry`. Keep marker alpha 0.45 + round end-caps.
  - Non-regression: legacy `captureVersion == 0` → all widths equal `base` → ribbon is uniform → visually equivalent to old constant stroke. Existing `StoryStrokeRasterizerTests` fixtures default `captureVersion = 0` → must still pass.
- [ ] Run `-only-testing:MeeshySDKTests/StrokeRenderParityTests -only-testing:MeeshyUITests/StoryStrokeRasterizerTests`. Expect parity PASS + rasterizer PASS (keep the red-pixel sample on the centerline y=960, where the ribbon is centered).
- [ ] Commit: `feat(story/drawing): render live + baked via shared variable-width builder`.

### C4 — Live preview + perf (view-adjacent — manual validation)

**C4.1 — Neutralize PencilKit ink for pen/marker (keep eraser feedback)**

- [ ] Edit `StrokeCaptureLayer.swift` `applyTool(to:)` (~100-110): for `.pen`/`.marker` set transparent ink (`UIColor.clear`) so PencilKit's native ink no longer shows the flat-vs-tapered appearance during the gesture (Meeshy preview paints the visible stroke). Leave `.eraser` untouched (`:107-110` keeps `systemGray @0.4`). Geometry capture is unaffected (`extract` reads `drawing.strokes`).

**C4.2 — Separate active-stroke layer (perf)**

- [ ] Edit `StoryComposerView.swift` (~1450-1470 overlay): split into TWO `MeeshyStrokeCanvas`:
  - Committed: `MeeshyStrokeCanvas(strokes: viewModel.drawingStrokes, selectedId:…).equatable()` (not re-tessellated mid-gesture once the active stroke is removed from this array).
  - Active: `MeeshyStrokeCanvas(strokes: viewModel.activeStrokePreview.map { [$0] } ?? [], selectedId: nil)`.
- [ ] In `StoryComposerViewModel.swift` add `@Published var activeStrokePreview: StoryDrawingStroke?`. Change capture: add `onStrokeChanged: (StoryDrawingStroke) -> Void` firing on intermediate ticks (updates `activeStrokePreview` only); keep `onStrokeCommitted` firing once at gesture end. Detect lift-up via the canvas `drawingGestureRecognizer.state == .ended/.cancelled` in the coordinator (PencilKit doesn't surface lift-up in `canvasViewDrawingDidChange`). On commit: `activeStrokePreview = nil` + `viewModel.commitStroke(stroke)` (existing path `:1461-1464`).
- [ ] Width projection: both canvases already `context.scaleBy(design→bounds)` (`MeeshyStrokeCanvas.swift:32-33`); ribbon vertices are design-space → width projected by the same uniform `scaleFactor` (9:16). No extra code.
- [ ] Manual: `./apps/ios/meeshy.sh run`, drawing mode —
  - [ ] Finger fast → thin, slow → thick (continuous taper).
  - [ ] Pencil hard → thick, light → thin (iPad/sim Pencil if available).
  - [ ] **No jump on commit**: live thickness == committed thickness at lift-up.
  - [ ] PencilKit native ink invisible for pen/marker during gesture; eraser feedback still visible.
  - [ ] Dense canvas (30+ strokes): no per-tick re-tessellate stutter.
- [ ] Commit: `feat(story/drawing): live variable-width preview + separate active-stroke layer (perf)`.

### C — Validation gate

- [ ] SDK units (C1/C2/C3) all green:

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -derivedDataPath apps/ios/Build/DerivedData \
  -only-testing:MeeshySDKTests/StoryDrawingStrokeCaptureVersionTests \
  -only-testing:MeeshySDKTests/StrokeWidthDriverTests \
  -only-testing:MeeshySDKTests/StrokeWidthMappingTests \
  -only-testing:MeeshySDKTests/StrokeWidthSmoothingTests \
  -only-testing:MeeshySDKTests/VariableWidthStrokeBuilderTests \
  -only-testing:MeeshySDKTests/StrokeRenderParityTests \
  -only-testing:MeeshyUITests/StrokeCaptureLayerTests -quiet
```

- [ ] Non-regression (legacy pixel-identical):

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -derivedDataPath apps/ios/Build/DerivedData \
  -only-testing:MeeshySDKTests/StrokePathBuilderTests \
  -only-testing:MeeshySDKTests/StrokeSmoothingTests \
  -only-testing:MeeshyUITests/StoryStrokeRasterizerTests -quiet
```

  (Re-run once before flagging a failure — `StrokeCaptureLayerTests` & timing-adjacent suites are known intermittently flaky.)
- [ ] App build + the C4.2 manual draw checklist (finger velocity, Pencil force, no commit jump, ink neutralization, eraser intact, dense-canvas perf); composer live ≈ reader baked ("visually equivalent", not pixel-exact).
- [ ] Each sub-step committed in isolation (no Co-Authored-By trailer).

> **Sequencing:** land C1.0 → C1.1 → C1.2 → C2.1 first (invisible behind constant renderer; parallelizable with A/B), then C3.1 → C3.2 → C3.3 → C4.1 → C4.2.

---

## Whole-feature validation (after all lots)

- [ ] Full SDK unit suite for the new pure helpers green (StoryCanvasFraming, BandLayoutState, StrokeWidthDriver, StrokeWidthMapping, StrokeWidthSmoothing, VariableWidthStrokeBuilder, StrokeRenderParity) + existing suites non-regressed (StrokePathBuilder, StrokeSmoothing, StoryStrokeRasterizer, BandStateMachine, ComposerControlsLayer, StrokeCaptureLayer).
- [ ] `./apps/ios/meeshy.sh run` clean build; one end-to-end manual pass: composer (every tool cards above sheet, resize/collapse, no overlap, drawing included), reader (own == others card size, fullscreen zoom in/out), drawing (finger velocity + Pencil force vary width, no commit jump, dense-canvas perf).
- [ ] No canvas flicker/rebuild storm during any card change or zoom (confirms container transform).
