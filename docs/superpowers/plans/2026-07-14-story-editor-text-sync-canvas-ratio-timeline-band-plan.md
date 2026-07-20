# Story editor: live text sync, content-ratio canvas, timeline in band — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three independent story-composer bugs: the text-tool size slider doesn't reflect live pinch resizing; the canvas is hard-locked to 9:16/16:9 instead of following the background's real proportions; the timeline tool opens as a modal sheet instead of the same resizable bottom band as every other tool.

**Architecture:** No new subsystems — each fix follows an existing pattern already present in the codebase (computed-binding display values, a pure ratio-clamp helper, and the drawing-mode "ViewModel-flag overrides the band state machine" precedent). All three land in `packages/MeeshySDK/Sources/MeeshyUI/Story/`.

**Tech Stack:** Swift 6, SwiftUI, XCTest + Swift Testing (`@Test`/`#expect` for `BandStateMachineTests`, XCTest elsewhere per file), SPM (`MeeshySDK-Package` scheme).

## Global Constraints

- SDK Purity: nothing here crosses into `apps/ios/` — all three fixes are pure `MeeshyUI` composer changes (packages/MeeshySDK/CLAUDE.md).
- No `any` / force-unwraps introduced; follow existing Swift 6 strict-concurrency patterns in each touched file.
- TDD non-negotiable: every step below writes/updates a test before the corresponding implementation and shows the expected RED then GREEN output.
- Canvas ratio clamp bounds: **[9/21, 21/9]** (≈0.4286…2.3333) — confirmed by user 2026-07-14.
- Timeline band panel height: same 160...540pt bounds and grabber-resize mechanism as every other tool (user chose the "standard" option, not an extended max-height variant).
- Spec: `docs/superpowers/specs/2026-07-14-story-editor-text-sync-canvas-ratio-timeline-band-design.md`.

## Task Dependency Order

Tasks 1 and 2 are fully independent of everything else and of each other. Tasks 3, 4, 5 are independent of each other but Task 6 depends on all three being done (it wires their outputs together). Task 7 runs last.

```
Task 1 (text sync)        — independent
Task 2 (canvas ratio)     — independent
Task 3 (BandStateMachine) ─┐
Task 4 (isCarded param)   ─┼─→ Task 6 (cutover) → Task 7 (full verify)
Task 5 (timeline panel)   ─┘
```

---

### Task 1: Text-tool size slider reflects live pinch scale

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditToolOptions.swift:122-139` (the `sizeOptions` computed property)
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Story/TextEditToolOptionsSizeTests.swift`

**Interfaces:**
- Produces: `TextEditToolOptions.displayedSize(for text: StoryTextObject) -> Double`, `TextEditToolOptions.applyingSliderValue(_ value: Double, to text: inout StoryTextObject)` — both `nonisolated static`, consumed only by `sizeOptions` in this same file.
- Consumes: `StoryTextObject.fontSize: Double`, `StoryTextObject.scale: Double` (existing fields, `MeeshySDK/Models/StoryModels.swift`).

**Context:** `StoryTextLayer.configure` renders text at `fontSize × scale` design-px. The canvas pinch gesture (`StoryCanvasUIView+Gestures.swift` `handlePinch`, `.changed` case) already live-mutates `scale` on every touch tick and pushes it through `onItemModified?(slide)` → `StoryComposerCanvasView.makeUIView`'s `onItemModified` closure → the `@Binding var slide` → `viewModel.currentSlide`. That means `textObject.scale` is **already** updated live in the SwiftUI-visible model during a pinch — the only bug is that the slider reads raw `fontSize` instead of the effective `fontSize × scale`, so it doesn't track the pinch, and a subsequent manual drag compounds with the stale `scale`. No changes to any UIKit gesture code are needed.

- [ ] **Step 1: Write the failing tests**

```swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class TextEditToolOptionsSizeTests: XCTestCase {

    func test_displayedSize_multipliesFontSizeByScale() {
        var obj = StoryTextObject(text: "Hi")
        obj.fontSize = 40
        obj.scale = 1.5

        XCTAssertEqual(TextEditToolOptions.displayedSize(for: obj), 60, accuracy: 0.0001)
    }

    func test_displayedSize_withDefaultScale_equalsRawFontSize() {
        var obj = StoryTextObject(text: "Hi")
        obj.fontSize = 40
        obj.scale = 1.0

        XCTAssertEqual(TextEditToolOptions.displayedSize(for: obj), 40, accuracy: 0.0001)
    }

    func test_applyingSliderValue_setsFontSizeAndResetsScale() {
        var obj = StoryTextObject(text: "Hi")
        obj.fontSize = 40
        obj.scale = 2.0 // leftover from a prior pinch

        TextEditToolOptions.applyingSliderValue(90, to: &obj)

        XCTAssertEqual(obj.fontSize, 90, accuracy: 0.0001)
        XCTAssertEqual(
            obj.scale, 1.0, accuracy: 0.0001,
            "A manual slider drag must clear any leftover pinch scale so it never compounds with the new value."
        )
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet \
  -only-testing:MeeshyUITests/TextEditToolOptionsSizeTests
```
Expected: **compile failure** — `type 'TextEditToolOptions' has no member 'displayedSize'` / `'applyingSliderValue'`. This is the correct RED state for a new-API TDD step in Swift (the symbol doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Replace the `sizeOptions` property (`TextEditToolOptions.swift:122-139`):

```swift
    // MARK: - Size

    private var sizeOptions: some View {
        HStack(spacing: 10) {
            Image(systemName: "textformat.size.smaller")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
            Slider(
                value: Binding(
                    get: { Self.displayedSize(for: textObject) },
                    set: { Self.applyingSliderValue($0, to: &textObject) }
                ),
                in: 14...160, step: 1
            )
            .tint(MeeshyColors.brandPrimary)
            Image(systemName: "textformat.size.larger")
                .font(.system(size: 16))
                .foregroundStyle(.secondary)
            Text("\(Int(Self.displayedSize(for: textObject)))")
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundStyle(.secondary)
                .frame(width: 34)
        }
    }

    /// The value the size slider displays: the object's effective rendered
    /// size (`fontSize × scale`, cf. `StoryTextLayer.configure`). The canvas
    /// pinch gesture live-mutates `scale` on every `.changed` tick
    /// (`StoryCanvasUIView+Gestures.handlePinch` → `onItemModified` →
    /// `viewModel.currentSlide`), so reading the product here makes the
    /// slider track a pinch live with no extra plumbing.
    nonisolated static func displayedSize(for text: StoryTextObject) -> Double {
        text.fontSize * text.scale
    }

    /// Applies a slider drag: writes the new value into `fontSize` and
    /// resets `scale` to 1 so a leftover pinch scale never compounds with a
    /// later manual resize.
    nonisolated static func applyingSliderValue(_ value: Double, to text: inout StoryTextObject) {
        text.fontSize = value
        text.scale = 1
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2.
Expected: `Test Suite 'TextEditToolOptionsSizeTests' passed` — 3/3.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditToolOptions.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/TextEditToolOptionsSizeTests.swift
git commit -m "fix(ios/story): text size slider tracks live pinch scale, resets scale on manual resize"
```

---

### Task 2: Canvas ratio follows the background's continuous aspect ratio

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+Elements.swift:81-85`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryComposerViewModelCanvasAspectTests.swift` (full replacement)

**Interfaces:**
- Produces: `StoryComposerViewModel.canvasAspectRatio(forBackgroundOf effects: StoryEffects) -> Double?` — signature unchanged, only its return values change (continuous instead of binary-snapped). No other file calls this function, so no other call sites need updates.
- Consumes: `StoryMediaObject.aspectRatio: Double`, `StoryEffects.resolvedBackgroundMedia: StoryMediaObject?` (existing).

**Context:** `StoryEffects.canvasAspectRatio` is already a free-form `Double?` — no Codable/migration work needed. The only bug is at the write site, which snaps any background to exactly `9/16` or `16/9` via `StoryCanvasAspect.from(ratio:)`. `CanvasGeometry.aspectFitSize(in:ratio:)` already accepts an arbitrary ratio and needs no changes.

- [ ] **Step 1: Replace the test file (existing behavior changes, new clamp coverage)**

```swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// « L'import du fond de la story impose le cadre et forme du Canvas » — le
/// canvas suit le RATIO CONTINU du fond (plus de snap binaire 9:16/16:9),
/// clampé à [9/21, 21/9] pour éviter un canvas dégénéré sur un fond au ratio
/// extrême (directive user 2026-07-14).
@MainActor
final class StoryComposerViewModelCanvasAspectTests: XCTestCase {

    private func makeBackground(kind: StoryMediaKind, aspectRatio: Double) -> StoryEffects {
        let media = StoryMediaObject(
            id: "bg-1", postMediaId: "pm-1", kind: kind,
            aspectRatio: aspectRatio, isBackground: true
        )
        var effects = StoryEffects()
        effects.mediaObjects = [media]
        return effects
    }

    func test_landscapeImageBackground_resolvesItsExactRatio() {
        let effects = makeBackground(kind: .image, aspectRatio: 16.0 / 9.0)
        XCTAssertEqual(StoryComposerViewModel.canvasAspectRatio(forBackgroundOf: effects), 16.0 / 9.0, accuracy: 0.0001)
    }

    func test_landscapeVideoBackground_resolvesItsExactRatio() {
        let effects = makeBackground(kind: .video, aspectRatio: 16.0 / 9.0)
        XCTAssertEqual(StoryComposerViewModel.canvasAspectRatio(forBackgroundOf: effects), 16.0 / 9.0, accuracy: 0.0001)
    }

    func test_portraitVideoBackground_resolvesItsExactRatio_noLongerSnapsToNil() {
        let effects = makeBackground(kind: .video, aspectRatio: 9.0 / 16.0)
        XCTAssertEqual(StoryComposerViewModel.canvasAspectRatio(forBackgroundOf: effects), 9.0 / 16.0, accuracy: 0.0001)
    }

    func test_portraitImageBackground_resolvesItsExactRatio_noLongerSnapsToNil() {
        let effects = makeBackground(kind: .image, aspectRatio: 9.0 / 16.0)
        XCTAssertEqual(StoryComposerViewModel.canvasAspectRatio(forBackgroundOf: effects), 9.0 / 16.0, accuracy: 0.0001)
    }

    func test_nearSquareBackground_resolvesItsExactRatio() {
        let effects = makeBackground(kind: .image, aspectRatio: 4.0 / 5.0)
        XCTAssertEqual(StoryComposerViewModel.canvasAspectRatio(forBackgroundOf: effects), 4.0 / 5.0, accuracy: 0.0001)
    }

    func test_noBackgroundMedia_staysNil() {
        XCTAssertNil(StoryComposerViewModel.canvasAspectRatio(forBackgroundOf: StoryEffects()))
    }

    // MARK: - Clamp [9/21, 21/9] — never a degenerate sliver canvas

    func test_extremePanoramaBackground_clampsToUpperBound() {
        let effects = makeBackground(kind: .image, aspectRatio: 4.0)
        XCTAssertEqual(StoryComposerViewModel.canvasAspectRatio(forBackgroundOf: effects), 21.0 / 9.0, accuracy: 0.0001)
    }

    func test_extremeTallScreenshotBackground_clampsToLowerBound() {
        let effects = makeBackground(kind: .image, aspectRatio: 0.2)
        XCTAssertEqual(StoryComposerViewModel.canvasAspectRatio(forBackgroundOf: effects), 9.0 / 21.0, accuracy: 0.0001)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet \
  -only-testing:MeeshyUITests/StoryComposerViewModelCanvasAspectTests
```
Expected: FAIL — `test_portraitVideoBackground_resolvesItsExactRatio_noLongerSnapsToNil` and `test_portraitImageBackground_resolvesItsExactRatio_noLongerSnapsToNil` fail because the current code returns `nil`; `test_extremePanoramaBackground_clampsToUpperBound` and `test_extremeTallScreenshotBackground_clampsToLowerBound` fail because the current code returns the binary-snapped `16/9` instead of the clamped value; `test_nearSquareBackground_resolvesItsExactRatio` fails (current code returns `nil` for ratio ≤ 1).

- [ ] **Step 3: Write minimal implementation**

Replace `canvasAspectRatio(forBackgroundOf:)` (`StoryComposerViewModel+Elements.swift:75-85`):

```swift
    /// Ratio de canvas à PERSISTER (`nil` = pas de fond, portrait 9:16 par
    /// défaut) dérivé du fond d'un slide : « l'import du fond impose le cadre
    /// et forme du Canvas ». Ratio CONTINU du fond (pas de snap binaire
    /// portrait/landscape, directive user 2026-07-14), clampé à [9/21, 21/9]
    /// pour éviter un canvas dégénéré sur un fond au ratio extrême (panorama,
    /// capture ultra-haute).
    static func canvasAspectRatio(forBackgroundOf effects: StoryEffects) -> Double? {
        guard let bg = effects.resolvedBackgroundMedia else { return nil }
        return clampedCanvasRatio(bg.aspectRatio)
    }

    /// Clamp pur, testé indirectement via `canvasAspectRatio(forBackgroundOf:)`.
    private static func clampedCanvasRatio(_ ratio: Double) -> Double {
        min(21.0 / 9.0, max(9.0 / 21.0, ratio))
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2.
Expected: `Test Suite 'StoryComposerViewModelCanvasAspectTests' passed` — 8/8.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+Elements.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryComposerViewModelCanvasAspectTests.swift
git commit -m "fix(ios/story): canvas follows background's continuous aspect ratio, clamped 9:21-21:9"
```

---

### Task 3: `BandStateMachine` — timeline becomes a normal tool

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/BandStateMachine.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Controls/BandStateMachineTests.swift:121-153` (replace the "C5" block)

**Interfaces:**
- Produces: `BandStateMachine.tapFAB/.swipeUpOnFAB/.tapTile` no longer special-case `.timeline` — calling any of them with `.timeline` now behaves exactly like any other `StoryToolMode`, reaching `.toolPanel(.timeline)`.
- Consumed by: Task 6 (`ComposerControlsLayer`), which is the only production caller that will now actually reach these paths for a tool tile tap while the timeline panel is showing (see Task 6, `onTapTile`'s else-branch).

- [ ] **Step 1: Replace the "C5" test block with inverted assertions**

In `BandStateMachineTests.swift`, replace lines 121-153 (the `// MARK: - Timeline routes to a sheet...` block and its 4 tests) with:

```swift
    // MARK: - Timeline is a normal band tool (2026-07-14)
    // Presented inline via ComposerControlsLayer.resolveEffectiveBandState's
    // override, exactly like drawing mode. The state machine itself no
    // longer special-cases it — see ComposerControlsLayerEffectiveBandStateTests.

    @Test("tapFAB(.timeline) from .hidden opens .toolPanel(.timeline)")
    func tapFABTimelineOpensToolPanel() {
        var sm = BandStateMachine()
        sm.tapFAB(.timeline)
        #expect(sm.state == .toolPanel(.timeline))
    }

    @Test("swipeUpOnFAB(.timeline) opens .toolPanel(.timeline)")
    func swipeUpOnFABTimelineOpensToolPanel() {
        var sm = BandStateMachine()
        sm.swipeUpOnFAB(.timeline)
        #expect(sm.state == .toolPanel(.timeline))
    }

    @Test("tapTile(.timeline) opens .toolPanel(.timeline)")
    func tapTileTimelineOpensToolPanel() {
        var sm = BandStateMachine()
        sm.tapTile(.timeline)
        #expect(sm.state == .toolPanel(.timeline))
    }

    @Test("tapFAB(.timeline) while another panel is open swaps to it, like any other tool")
    func tapFABTimelineSwapsOpenPanel() {
        var sm = BandStateMachine()
        sm.tapFAB(.media)
        sm.tapFAB(.timeline)
        #expect(sm.state == .toolPanel(.timeline))
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet \
  -only-testing:MeeshyUITests/BandStateMachineTests
```
Expected: FAIL — all 4 new tests fail because the current guards keep `sm.state == .hidden`.

- [ ] **Step 3: Write minimal implementation**

In `BandStateMachine.swift`, remove the 3 timeline guards:

```swift
    public mutating func tapFAB(_ category: BandCategory) {
        switch state {
        case .hidden:
            state = .toolPanel(StoryToolMode.from(category: category))
        case .toolPanel(let tool):
            if tool.bandCategory == category {
                state = .hidden
            } else {
                state = .toolPanel(StoryToolMode.from(category: category))
            }
        case .formatPanel:
            // Format panel takes precedence — tap on FAB does not interrupt it.
            break
        }
    }

    public mutating func swipeUpOnFAB(_ category: BandCategory) {
        // Force open (idempotent on same category).
        switch state {
        case .formatPanel:
            break  // formatPanel takes precedence
        default:
            state = .toolPanel(StoryToolMode.from(category: category))
        }
    }
```

(removes the `guard category != .timeline else { return }` line at the top of each function body — everything else in `tapFAB`/`swipeUpOnFAB` is unchanged)

```swift
    public mutating func tapTile(_ tool: StoryToolMode) {
        switch state {
        case .formatPanel:
            break  // formatPanel takes precedence
        default:
            state = .toolPanel(tool)
        }
    }
```

(removes the `guard tool != .timeline else { return }` line)

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2.
Expected: `Test Suite 'BandStateMachineTests' passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/BandStateMachine.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/Controls/BandStateMachineTests.swift
git commit -m "refactor(ios/story): BandStateMachine stops special-casing .timeline"
```

---

### Task 4: `StoryCanvasFraming.isCarded` gains a `timelineActive` parameter

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasFraming.swift:65-67`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryCanvasFramingTests.swift:127-137`

**Interfaces:**
- Produces: `StoryCanvasFraming.isCarded(bandPresent: Bool, drawingActive: Bool, textActive: Bool, timelineActive: Bool = false) -> Bool`. The default value keeps the one existing call site (`StoryComposerView+Canvas.swift`, unmodified until Task 6) compiling unchanged, so this task is independently buildable and testable.

- [ ] **Step 1: Update the truth-table test**

Replace `test_isCarded_truthTable` (`StoryCanvasFramingTests.swift:127-137`):

```swift
    func test_isCarded_truthTable() {
        XCTAssertFalse(StoryCanvasFraming.isCarded(bandPresent: false, drawingActive: false, textActive: false, timelineActive: false))
        XCTAssertTrue(StoryCanvasFraming.isCarded(bandPresent: true, drawingActive: false, textActive: false, timelineActive: false))
        // Mode dessin IMMERSIF (user 2026-07-11) : le dessin seul ne carde
        // PLUS — canvas plein écran, dessinable jusqu'aux angles, bulles
        // flottantes sans sheet. (Remplace la spec 2026-06-02 « identique
        // pour tous les outils, dessin inclus ».)
        XCTAssertFalse(StoryCanvasFraming.isCarded(bandPresent: false, drawingActive: true, textActive: false, timelineActive: false))
        XCTAssertTrue(StoryCanvasFraming.isCarded(bandPresent: false, drawingActive: false, textActive: true, timelineActive: false))
        XCTAssertTrue(StoryCanvasFraming.isCarded(bandPresent: true, drawingActive: true, textActive: true, timelineActive: false))
        // Timeline (2026-07-14) : la timeline force le cadrage exactement
        // comme l'édition de texte — le panneau timeline est présenté via
        // l'override de ComposerControlsLayer pendant que
        // `bandStateMachine.state` reste `.hidden`, donc `bandPresent` seul
        // ne peut pas le voir.
        XCTAssertTrue(StoryCanvasFraming.isCarded(bandPresent: false, drawingActive: false, textActive: false, timelineActive: true))
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet \
  -only-testing:MeeshyUITests/StoryCanvasFramingTests/test_isCarded_truthTable
```
Expected: **compile failure** — `isCarded` does not have a `timelineActive` argument label yet.

- [ ] **Step 3: Write minimal implementation**

In `StoryCanvasFraming.swift`, replace the `isCarded` function:

```swift
    /// Truth-table helper for `canvasIsCarded`.
    ///
    /// Mode dessin IMMERSIF (user 2026-07-11) : `drawingActive` ne carde PLUS —
    /// pendant le dessin le canvas reste plein écran (`.free`), dessinable
    /// jusqu'aux angles, avec les seules bulles flottantes par-dessus (aucune
    /// sheet). Remplace la spec 2026-06-02 « identique pour tous les outils,
    /// dessin inclus ». Le paramètre est conservé pour documenter la table de
    /// vérité (testée par `StoryCanvasFramingTests.test_isCarded_truthTable`).
    ///
    /// Timeline (2026-07-14) : forcée via `ComposerControlsLayer`'s override
    /// pendant que `bandStateMachine.state` lui-même reste `.hidden` (le band
    /// panel est présenté sans passer par le state machine) — `timelineActive`
    /// capture donc ce cas séparément, comme `drawingActive`/`textActive`.
    /// Default `false` keeps pre-existing call sites source-compatible.
    public static func isCarded(bandPresent: Bool, drawingActive: Bool, textActive: Bool, timelineActive: Bool = false) -> Bool {
        bandPresent || textActive || timelineActive
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasFraming.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryCanvasFramingTests.swift
git commit -m "feat(ios/story): StoryCanvasFraming.isCarded gains timelineActive"
```

---

### Task 5: `ComposerToolPanelHost` renders a real timeline panel

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerToolPanelHost.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Controls/ComposerToolPanelHostTimelineTests.swift`

**Interfaces:**
- Produces: `ComposerToolPanelHost.defaultPanelHeight(for tool: StoryToolMode) -> CGFloat` (`static`, extracted from the existing `panelHeight` switch for testability) and a `timelinePanel` computed View property.
- Consumes: `viewModel.loadCurrentSlideIntoTimeline()`, `viewModel.canvasTimelineBridge.scrub(seconds:)`, `viewModel.canvasTimelineBridge.end()`, `viewModel.timelineViewModel.currentTime`, `.isPlaying`, `.togglePlayback()`, `viewModel.commitTimelineToCurrentSlide()` — all pre-existing `StoryComposerViewModel`/`TimelineViewModel` APIs, previously called from the `.sheet`'s `onDismiss`/`.adaptiveOnChange` in `StoryComposerView+Media.swift` (moved here in Task 6, not duplicated — Task 6 removes them from `StoryComposerView+Media.swift`).

This task is self-contained and independently testable even though nothing routes to `.toolPanel(.timeline)` yet (that's Task 6) — `defaultPanelHeight` and the `placeholderPanel` switch are directly testable/greppable regardless.

- [ ] **Step 1: Write the failing tests**

```swift
import XCTest
@testable import MeeshyUI

/// `ComposerToolPanelHost` renders the timeline inline in the band like every
/// other tool (2026-07-14) — it used to special-case `.timeline` to height 0
/// / `EmptyView()` because the timeline was sheet-only.
final class ComposerToolPanelHostTimelineTests: XCTestCase {

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_defaultPanelHeight_timeline_isNoLongerZero() {
        XCTAssertEqual(ComposerToolPanelHost.defaultPanelHeight(for: .timeline), 320)
    }

    func test_defaultPanelHeight_otherTools_unchanged() {
        XCTAssertEqual(ComposerToolPanelHost.defaultPanelHeight(for: .media), 220)
        XCTAssertEqual(ComposerToolPanelHost.defaultPanelHeight(for: .audio), 220)
        XCTAssertEqual(ComposerToolPanelHost.defaultPanelHeight(for: .drawing), 280)
        XCTAssertEqual(ComposerToolPanelHost.defaultPanelHeight(for: .text), 280)
        XCTAssertEqual(ComposerToolPanelHost.defaultPanelHeight(for: .texture), 236)
        XCTAssertEqual(ComposerToolPanelHost.defaultPanelHeight(for: .filters), 180)
    }

    func test_placeholderPanel_timelineCase_rendersTimelinePanel_notEmptyView() throws {
        let source = try sdkSource("Sources/MeeshyUI/Story/Controls/ComposerToolPanelHost.swift")
        guard let placeholderRange = source.range(of: "private var placeholderPanel") else {
            XCTFail("ComposerToolPanelHost must expose placeholderPanel")
            return
        }
        let end = source.index(placeholderRange.lowerBound, offsetBy: 700, limitedBy: source.endIndex) ?? source.endIndex
        let block = String(source[placeholderRange.lowerBound..<end])
        XCTAssertTrue(
            block.contains("timelinePanel"),
            "placeholderPanel's .timeline case must render timelinePanel, not EmptyView()."
        )
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet \
  -only-testing:MeeshyUITests/ComposerToolPanelHostTimelineTests
```
Expected: FAIL — `test_defaultPanelHeight_timeline_isNoLongerZero` fails with compile error (no such static func yet); once stubbed mentally, `test_placeholderPanel_timelineCase_rendersTimelinePanel_notEmptyView` fails because the source still contains `case .timeline:\n            EmptyView()`.

- [ ] **Step 3: Write minimal implementation**

Replace `panelHeight` (`ComposerToolPanelHost.swift:175-191`):

```swift
    private var panelHeight: CGFloat {
        // Le grabber pilote la hauteur du panneau pour TOUS les outils (2026-06-02) :
        // quand le band est redimensionnable, `panelHeightOverride` (= hauteur du band
        // tirée par le grabber) prime sur la hauteur intrinsèque par défaut — sinon
        // tirer la poignée ne rétrécissait PAS le menu hors dessin (le contenu gardait
        // sa hauteur fixe). Le contenu scrolle s'il est plus grand que l'espace.
        panelHeightOverride ?? Self.defaultPanelHeight(for: tool)
    }

    /// Hauteur par défaut d'un panneau d'outil avant tout redimensionnement au
    /// grabber. Pure et testable indépendamment du montage SwiftUI.
    static func defaultPanelHeight(for tool: StoryToolMode) -> CGFloat {
        switch tool {
        case .media:    return 220
        case .audio:    return 220
        case .drawing:  return 280   // liste des traits
        case .text:     return 280
        case .texture:  return 236  // couleurs + rangée « Ouverture » (C1)
        case .filters:  return 180
        case .timeline: return 320  // scrubber + pistes clips (2026-07-14, band comme les autres outils)
        }
    }
```

Replace `placeholderPanel`'s `.timeline` case (`ComposerToolPanelHost.swift:193-219`) and add the new `timelinePanel` property:

```swift
    @ViewBuilder
    private var placeholderPanel: some View {
        switch tool {
        case .media:
            mediaPanel
        case .audio:
            audioPanel
        case .drawing:
            drawingPanel
        case .text:
            textPanel
        case .texture:
            texturePanel
        case .filters:
            StoryFilterGridView(viewModel: viewModel,
                                previewImage: viewModel.currentSlideBackgroundImage)
        case .timeline:
            timelinePanel
        }
    }

    // MARK: - Timeline Panel

    /// Contenu de la timeline embarqué inline dans le band, comme tous les
    /// autres outils (2026-07-14 — auparavant présenté en `.sheet()` modal,
    /// cf. `docs/superpowers/specs/2026-07-14-story-editor-text-sync-canvas-ratio-timeline-band-design.md`).
    /// Le chargement du slide courant + la resynchronisation du scrub à
    /// l'ouverture, et l'arrêt de la lecture + le commit à la fermeture,
    /// suivent maintenant le cycle de vie du panneau (onAppear/onDisappear)
    /// plutôt que celui de l'ancienne sheet système.
    private var timelinePanel: some View {
        TimelineSheetContent(composer: viewModel)
            .onAppear {
                viewModel.loadCurrentSlideIntoTimeline()
                viewModel.canvasTimelineBridge.scrub(
                    seconds: Double(viewModel.timelineViewModel.currentTime))
            }
            .onDisappear {
                if viewModel.timelineViewModel.isPlaying {
                    viewModel.timelineViewModel.togglePlayback()
                }
                viewModel.canvasTimelineBridge.end()
                viewModel.commitTimelineToCurrentSlide()
            }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2.
Expected: `Test Suite 'ComposerToolPanelHostTimelineTests' passed` — 3/3.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerToolPanelHost.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/Controls/ComposerToolPanelHostTimelineTests.swift
git commit -m "feat(ios/story): ComposerToolPanelHost renders a real inline timeline panel"
```

---

### Task 6: Cutover — timeline opens in the band, the modal sheet is removed

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerControlsLayer.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+Canvas.swift:762-791`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+Media.swift:71-94`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Controls/ComposerControlsLayerEffectiveBandStateTests.swift`

**Interfaces:**
- Produces: `ComposerControlsLayer.resolveEffectiveBandState(machineState: BandState, drawingActive: Bool, drawingImmersive: Bool, timelineVisible: Bool) -> BandState` — `static`, pure, extracted from the existing `effectiveBandState` computed property for testability (mirrors the existing `StoryCanvasUIView.resolveManipulationLayer` pattern in this same codebase).
- Consumes: Task 3's un-guarded `BandStateMachine`, Task 4's `StoryCanvasFraming.isCarded(..., timelineActive:)`, Task 5's `ComposerToolPanelHost.timelinePanel`.

This is one task (not split further) because `ComposerControlsLayer`, `StoryComposerView+Canvas.swift`, and `StoryComposerView+Media.swift` must change together — wiring only the override without removing the old sheet (or vice versa) leaves a genuinely broken intermediate UI (timeline reachable through two conflicting presentation mechanisms at once).

- [ ] **Step 1: Write the failing tests for the extracted resolver**

```swift
import XCTest
@testable import MeeshyUI

final class ComposerControlsLayerEffectiveBandStateTests: XCTestCase {

    func test_hiddenMachine_noOverrides_staysHidden() {
        let result = ComposerControlsLayer.resolveEffectiveBandState(
            machineState: .hidden, drawingActive: false, drawingImmersive: false, timelineVisible: false)
        XCTAssertEqual(result, .hidden)
    }

    func test_timelineVisible_hiddenMachine_forcesTimelinePanel() {
        let result = ComposerControlsLayer.resolveEffectiveBandState(
            machineState: .hidden, drawingActive: false, drawingImmersive: false, timelineVisible: true)
        XCTAssertEqual(result, .toolPanel(.timeline))
    }

    func test_timelineVisible_machineAlreadyOnAnotherTool_doesNotOverride() {
        let result = ComposerControlsLayer.resolveEffectiveBandState(
            machineState: .toolPanel(.text), drawingActive: false, drawingImmersive: false, timelineVisible: true)
        XCTAssertEqual(
            result, .toolPanel(.text),
            "Switching to another tool tile while timeline is open must show that tool, not re-force timeline."
        )
    }

    func test_drawingActive_takesPrecedenceOverTimeline() {
        let result = ComposerControlsLayer.resolveEffectiveBandState(
            machineState: .hidden, drawingActive: true, drawingImmersive: false, timelineVisible: true)
        XCTAssertEqual(result, .toolPanel(.drawing))
    }

    func test_drawingImmersive_hidesRegardlessOfTimeline() {
        let result = ComposerControlsLayer.resolveEffectiveBandState(
            machineState: .hidden, drawingActive: true, drawingImmersive: true, timelineVisible: true)
        XCTAssertEqual(result, .hidden)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet \
  -only-testing:MeeshyUITests/ComposerControlsLayerEffectiveBandStateTests
```
Expected: **compile failure** — `resolveEffectiveBandState` does not exist yet.

- [ ] **Step 3a: Extract the resolver and wire the override — `ComposerControlsLayer.swift`**

Replace `effectiveBandState` (`ComposerControlsLayer.swift:72-86`):

```swift
    /// État effectif du band — dessin en DEUX temps (user 2026-07-11 v2) et
    /// timeline embarquée (user 2026-07-14) : voir `resolveEffectiveBandState`
    /// pour la logique pure et testable.
    private var effectiveBandState: BandState {
        Self.resolveEffectiveBandState(
            machineState: bandStateMachine.state,
            drawingActive: viewModel.drawingEditingMode.isActive,
            drawingImmersive: viewModel.isDrawingImmersive,
            timelineVisible: viewModel.isTimelineVisible
        )
    }

    /// Résolution pure de l'état effectif du band à partir de la machine brute
    /// et des overrides ViewModel (dessin, timeline). Extrait en `static` pour
    /// être testable sans monter la View — même pattern que
    /// `StoryCanvasUIView.resolveManipulationLayer`.
    ///
    /// Mode dessin LISTE (band forcé sur `drawingPanel`) tant que non
    /// immersif ; `isDrawingImmersive` masque le band entièrement, priorité
    /// absolue. Timeline (2026-07-14) : force `.toolPanel(.timeline)`
    /// uniquement quand la machine est `.hidden` — si un autre outil est déjà
    /// ouvert (l'utilisateur a tapé une autre tuile), on ne réécrase pas ce
    /// choix (cf. `onTapTile`, qui remet `isTimelineVisible = false` dans ce cas).
    static func resolveEffectiveBandState(
        machineState: BandState,
        drawingActive: Bool,
        drawingImmersive: Bool,
        timelineVisible: Bool
    ) -> BandState {
        if drawingActive, !drawingImmersive, machineState == .hidden {
            return .toolPanel(.drawing)
        }
        if drawingImmersive { return .hidden }
        if timelineVisible, machineState == .hidden {
            return .toolPanel(.timeline)
        }
        return machineState
    }
```

Update the `onTapTile` closure (around line 184-191):

```swift
                    onTapTile: { tool in
                        if tool == .timeline {
                            viewModel.isTimelineVisible = true
                        } else {
                            viewModel.isTimelineVisible = false
                            bandStateMachine.tapTile(tool)
                            viewModel.selectTool(tool)
                        }
                    },
```

Update `onBackFromToolPanel` (around line 192):

```swift
                    onBackFromToolPanel: {
                        if viewModel.isTimelineVisible {
                            viewModel.isTimelineVisible = false
                        } else {
                            bandStateMachine.backFromToolPanel()
                        }
                    },
```

Update `onResizeDismiss` (around line 232-245) — add the timeline reset alongside the existing drawing reset:

```swift
                    onResizeDismiss: {
                        // C-DIR2 (b), directive user 2026-07-04 : tirer le
                        // grabber sous le min ne replie PLUS le band en poignée
                        // — il FERME le panneau et rend les FABs. En dessin,
                        // fermer le band = quitter le mode ; en timeline, fermer
                        // le band = quitter la timeline (sinon effectiveBandState
                        // le re-forcerait aussitôt dans les deux cas).
                        if viewModel.drawingEditingMode.isActive {
                            viewModel.activeTool = nil
                        }
                        if viewModel.isTimelineVisible {
                            viewModel.isTimelineVisible = false
                        }
                        bandStateMachine.swipeDownOnBand()
                        areFabsVisible = true
                    }
```

Also apply the FAB tap and swipe-up branches — remove the `else if cat == .timeline { viewModel.isTimelineVisible = true }` special case's asymmetry by leaving `isTimelineVisible = true` (unchanged, still correct — no `bandStateMachine` call needed since the override now forces the panel), but this is unchanged from current code and needs no edit.

- [ ] **Step 3b: Update `canvasIsCarded` / `presentedSystemSheetFraction` — `StoryComposerView+Canvas.swift`**

Replace `presentedSystemSheetFraction` (`StoryComposerView+Canvas.swift:762-771`):

```swift
    /// Fraction d'écran occupée par une sheet SYSTÈME partielle présentée
    /// au-dessus du canvas — sticker / vocal / transitions (`.medium` ≈ 0.5).
    /// La timeline n'est plus une sheet système (2026-07-14, présentée inline
    /// dans le band comme les autres outils — cf. `canvasIsCarded`'s
    /// `timelineActive`). Exclut l'audience picker (`.large` par défaut) et
    /// les `.fullScreenCover` (éditeurs) : ils couvrent l'écran, le canvas
    /// derrière n'a pas à rester visible.
    var presentedSystemSheetFraction: CGFloat? {
        if showStickerPicker || showVoiceRecorderSheet || showTransitionSheet { return 0.5 }
        return nil
    }
```

Replace `canvasIsCarded` (`StoryComposerView+Canvas.swift:779-791`):

```swift
    var canvasIsCarded: Bool {
        let bandPresent = bandStateMachine.state != .hidden
        let drawingActive = viewModel.drawingEditingMode.isActive
        let textActive = viewModel.textEditingMode != .inactive
        if StoryCanvasFraming.isCarded(
            bandPresent: bandPresent,
            drawingActive: drawingActive,
            textActive: textActive,
            timelineActive: viewModel.isTimelineVisible
        ) {
            return true
        }
        return presentedSystemSheetFraction != nil
    }
```

- [ ] **Step 3c: Remove the modal sheet — `StoryComposerView+Media.swift`**

Delete the `.sheet(isPresented: $viewModel.isTimelineVisible, ...)` block and the `.adaptiveOnChange(of: viewModel.isTimelineVisible)` block entirely (`StoryComposerView+Media.swift:71-94`) — this logic now lives in `ComposerToolPanelHost.timelinePanel`'s `.onAppear`/`.onDisappear` (Task 5). The `sheetModifiers` chain goes directly from the `showStickerPicker` sheet (ending at line 70) to the `showTransitionSheet` sheet (starting at line 95) with nothing in between.

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2, then also re-run Tasks 3, 4, 5's suites to confirm nothing regressed:
```bash
cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet \
  -only-testing:MeeshyUITests/ComposerControlsLayerEffectiveBandStateTests \
  -only-testing:MeeshyUITests/BandStateMachineTests \
  -only-testing:MeeshyUITests/StoryCanvasFramingTests \
  -only-testing:MeeshyUITests/ComposerToolPanelHostTimelineTests
```
Expected: all 4 suites PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerControlsLayer.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+Canvas.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+Media.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/Controls/ComposerControlsLayerEffectiveBandStateTests.swift
git commit -m "feat(ios/story): timeline opens inline in the composer band, modal sheet removed"
```

---

### Task 7: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full SDK test suite**

```bash
cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet
```
Expected: all `MeeshySDKTests` + `MeeshyUITests` suites pass (no regressions outside the files touched above).

- [ ] **Step 2: App build**

```bash
./apps/ios/meeshy.sh build
```
Expected: builds clean (this SDK is consumed by `apps/ios/Meeshy` via local SPM — confirms nothing in `apps/ios/` broke against the changed public signatures).

- [ ] **Step 3: Manual verification in the simulator**

```bash
./apps/ios/meeshy.sh run
```
In the story composer, verify:
1. **Text sync**: add a text object, open the size tool, pinch it on the canvas — the slider thumb and the numeric label move live during the pinch; release, then drag the slider — it resizes from the true current size (no jump). Change the text color via the palette — it updates instantly.
2. **Canvas ratio**: import a background photo with a 4:5 or 1:1 ratio — the canvas card fills the full screen width and derives its height from that ratio instead of snapping to 9:16 or 16:9. Import a 16:9 landscape background — canvas still switches to landscape as before.
3. **Timeline in band**: tap the timeline FAB, the top-bar timeline button, and a media/text row's "Timeline" button — each opens the timeline inline in the same resizable bottom band as text/media/drawing (not a modal sheet). Drag the grabber to resize it. Close it via (a) dragging the grabber below the minimum, (b) the back button, and (c) tapping a different tool tile — in all three cases the timeline commits its edits and playback stops correctly (no stuck audio, no lost edits on the next reopen).

- [ ] **Step 4: Amend the spec doc if the manual pass surfaced any deviation**

If Step 3 reveals a discrepancy from `docs/superpowers/specs/2026-07-14-story-editor-text-sync-canvas-ratio-timeline-band-design.md` (e.g., the panel height needs tuning), update that file in a follow-up commit — do not silently diverge from the committed spec.

- [ ] **Step 5: Final commit (if Step 4 produced changes)**

```bash
git add docs/superpowers/specs/2026-07-14-story-editor-text-sync-canvas-ratio-timeline-band-design.md
git commit -m "docs(ios/story): amend spec after manual verification pass"
```
