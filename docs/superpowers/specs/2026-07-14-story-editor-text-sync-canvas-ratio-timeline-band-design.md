# Story editor: live text size/color sync, content-driven canvas ratio, timeline in band

Date: 2026-07-14
Scope: iOS story composer (`packages/MeeshySDK/Sources/MeeshyUI/Story/`, consumed by `apps/ios/Meeshy`)

## Context

Three independent bugs/requests in the story composer, reported together but touching unrelated subsystems:

1. Pinching a text object on the canvas doesn't live-update the text-tool size slider (and the slider doesn't reflect the true post-pinch size); text color changes should be instant.
2. The canvas is hard-locked to two discrete shapes (9:16 portrait or 16:9 landscape) instead of following the actual aspect ratio of the background media, full width.
3. The timeline tool opens as a modal `.sheet()` instead of appearing inline in the same resizable bottom band as every other tool (media, text, drawing, filters, texture).

Each section below is independently implementable and testable.

## 1. Text size/color live sync

### Root cause

`StoryTextObject` (`MeeshySDK/Models/StoryModels.swift`) carries two size-related fields:
- `fontSize` (14...160, design px) — read/written by the text-tool `Slider` (`TextEditToolOptions.swift:129`).
- `scale` (0.3...4.0) — written live by the canvas pinch gesture (`StoryCanvasUIView+Gestures.swift` `handlePinch`, via `updateScale`).

Rendered size is `fontSize × scale` (`StoryTextLayer.swift:71`). Pinch never writes back to `fontSize`; at gesture end only `manipulatedItemId = nil` + `rebuildLayers()` happen, leaving `scale` permanently drifted from `1.0`. The slider only reads `fontSize`, so:
- After a pinch, the slider shows a stale value that no longer matches the on-screen size.
- A subsequent slider drag recomputes `fontSize × scale` using the stale leftover `scale`, producing a jump that doesn't match the slider's 14...160 range semantics.

Text color is already live via direct `@Binding` writes (`TextEditToolOptions.swift` color swatches → `textObject.textColor = hex`), propagated through `StoryCanvasRepresentable.updateUIView`'s `slidesEqualForCanvas` full-fingerprint diff. The one exception: while `StoryCanvasUIView.isGestureActive` is true (a pinch/pan/rotate is actively held), `updateUIView` intentionally skips pushing SwiftUI-side changes into the UIKit canvas to avoid gesture flicker (`StoryCanvasRepresentable.swift:250`) — this only affects the corner case of editing color with one hand while still holding a pinch with the other, and self-heals the instant the gesture ends. No fix planned for this corner case (documented as intentional, out of scope).

### Fix

**a. Bake `scale` into `fontSize` at gesture end.** In `StoryCanvasUIView+Gestures.swift`, `handlePinch`'s `.ended`/`.cancelled`/`.failed` branch: when the manipulated item is a text object, before clearing `manipulatedItemId`, compute `newFontSize = clamp(text.fontSize * text.scale, 14...160)`, write it back (`text.fontSize = newFontSize; text.scale = 1`), and push through `onItemModified`. Media/sticker pinch is untouched (they have no competing "size tool" reading a sub-component of their scale, so no duality bug exists for them).

**b. Live slider tracking during the pinch itself.** Without recomputing text layout every frame (the existing `liveTextGestureTransform` CATransform3D trick deliberately avoids that cost — see the 2026-07-11 comment in `StoryCanvasUIView+Manipulation.swift`), add a lightweight callback `onLiveTextSizeChanged: ((id: String, effectiveFontSize: Double) -> Void)?` on `StoryCanvasUIView`, fired on each pinch `.changed` tick for a text target with the transient `fontSize × scale` value (clamped to the slider's 14...160 display range). The composer wires this into a small transient `@State` override on the size-tool binding: `TextEditToolOptions`'s slider displays the live override value while this exact text id is being pinched, and falls back to reading `textObject.fontSize` the rest of the time (including immediately after gesture end, once (a) has baked the true value in).

**c. Slider → canvas direction needs no fix.** Verified: dragging the SwiftUI slider mutates `fontSize` directly; `StoryCanvasRepresentable.updateUIView` is not gated by `isGestureActive` in this path (no UIKit gesture is active), and `slidesEqualForCanvas` does a full JSON-fingerprint comparison (not the old count-based heuristic), so the change is detected and `uiView.slide = slide` triggers `rebuildLayers()` on every tick. Already live.

### Testing

- Unit test the baking math as a pure function (mirroring `liveTextGestureTransform`'s existing `nonisolated static` testability pattern): `bakeScale(fontSize:scale:) -> Double` clamped to 14...160.
- Existing `StoryCanvasUIView+Gestures` / `+Manipulation` test coverage pattern (pure static functions tested without mounting a UIView) extends naturally.

## 2. Canvas ratio follows background content

### Current behavior

`StoryEffects.canvasAspectRatio: Double?` (`StoryModels.swift:1337`) is **already a free-form persisted `Double?`** — not an enum. `StoryCanvasAspect` (`StoryModels.swift:1228`) is a separate coarse classifier (`.portrait`/`.landscape`, ratio 0.5625/1.7778) used for bucketed lookups elsewhere (e.g. `RepostPayload.swift`'s `repostSourceCanvasSize`), not the storage format. No Codable/migration work is needed — old stories already decode fine into the same field regardless of what value it holds.

The actual bug is at the write site: `StoryComposerViewModel+Elements.swift:81-85`, `canvasAspectRatio(forBackgroundOf:)` computes `StoryCanvasAspect.from(width: bg.width, height: bg.height).ratio` — snapping any imported background to exactly one of two buckets — instead of using the background's real continuous ratio.

`CanvasGeometry.aspectFitSize(in:ratio:)` (`CanvasGeometry.swift:87-91`) already accepts an arbitrary `ratio: CGFloat` and is the single source of truth shared by composer (`.edit`) and reader/export (`.play`) — no changes needed there. For realistic phone-camera content (ratio ≥ ~9:16), width is already the binding constraint (`widthBound = min(available.width, available.height * ratio)`), so "full width, height derived" falls out naturally from existing code.

### Fix

- `canvasAspectRatio(forBackgroundOf:)`: return the background media's actual `aspectRatio` (already measured and stored on `StoryMediaObject.aspectRatio` at import time — `setMediaAspectRatio`), clamped to **[9/21, 21/9]** (≈0.4286...2.3333) to prevent a degenerate sliver canvas from a pathological background (panorama, ultra-tall screenshot). No snapping to two buckets.
- Fallback stays portrait (9/16) when there is no background media yet — unchanged default.
- `StoryCanvasAspect.from(width:height:)` (the binary bucketer) is left in place as-is for its existing bucketed consumers (e.g. repost source sizing) — it is a different concern from the stored ratio and out of scope here.
- Reader/export parity: confirm (during implementation, not design) that the reader's canvas setup reads `effects.canvasAspectRatio` directly rather than going through the coarse `effects.canvasAspect` enum property — if it already does (expected, since `CanvasGeometry` documents itself as shared read-time source of truth), zero reader-side changes are needed.

### Testing

- Unit test `canvasAspectRatio(forBackgroundOf:)` with a range of background dimensions (portrait, landscape, near-square, extreme panorama) asserting the continuous ratio is preserved and the clamp bounds are respected.
- Snapshot/manual verification in composer with a 4:5 and a 1:1 background to confirm full-width, non-cropped rendering.

## 3. Timeline as a band tool panel, not a modal sheet

### Current behavior

`BandStateMachine` (`Controls/BandStateMachine.swift`) explicitly excludes `.timeline` from ever reaching `.toolPanel(.timeline)` via guards in `tapFAB`, `swipeUpOnFAB`, and `tapTile`. `ComposerToolPanelHost.panelHeight`/`placeholderPanel` special-case `.timeline` to height 0 / `EmptyView()`. All entry points (FAB tap/swipe-up in `ComposerControlsLayer.swift`, band tile tap, `onShowInTimeline` row buttons, top-bar button in `StoryComposerView+TopBar.swift:246`, empty-state canvas tile in `StoryComposerView+Canvas.swift:529-536`) instead set `viewModel.isTimelineVisible = true`, which drives a `.sheet(isPresented:)` in `StoryComposerView+Media.swift:71-94` presenting `TimelineSheetContent` at `.presentationDetents([.fraction(0.45), .large])`.

`viewModel.isTimelineVisible` (a `@Published var` on `StoryComposerViewModel`) is also read by: `StoryComposerView+SyncRestore.swift` (restore-sync gate), `StoryComposerViewModel+Timeline.swift` (playhead-tick gate), `StoryComposerView+Canvas.swift:768` (`presentedSystemSheetFraction` → 0.45 canvas-shrink for the system sheet), and `StoryComposerViewModel+Lifecycle.swift:93` (reset on slide change). These consumers only care about the boolean value, not about *how* the timeline is presented — they are unaffected by this change as long as `isTimelineVisible` keeps meaning "timeline is the active editing surface."

### Fix — follow the existing drawing-mode override precedent

`ComposerControlsLayer.effectiveBandState` (lines 77-86) already implements exactly this pattern for drawing mode: it forces `.toolPanel(.drawing)` when `viewModel.drawingEditingMode.isActive` and the underlying `bandStateMachine.state` is `.hidden`, falling back to `bandStateMachine.state` otherwise. Timeline gets the same treatment:

```swift
private var effectiveBandState: BandState {
    if viewModel.drawingEditingMode.isActive, !viewModel.isDrawingImmersive,
       bandStateMachine.state == .hidden {
        return .toolPanel(.drawing)
    }
    if viewModel.isDrawingImmersive { return .hidden }
    if viewModel.isTimelineVisible, bandStateMachine.state == .hidden {
        return .toolPanel(.timeline)
    }
    return bandStateMachine.state
}
```

Concretely:

- **`BandStateMachine.swift`**: remove the 3 `guard category/tool != .timeline else { return }` guards — no longer needed since real `.toolPanel(.timeline)` values are only ever produced via the `effectiveBandState` override above, not via the state machine itself; leaving the guards would just make them permanently unreachable dead code.
- **`ComposerToolPanelHost.swift`**: give `.timeline` a real `panelHeight` (proposed default ~320, same 160...540 band-wide bounds and grabber-resize behavior as every other tool — matches the "band, standard resizing" option chosen) and a real `timelinePanel` view embedding `TimelineSheetContent(composer: viewModel)` instead of `EmptyView()`.
- **Dismiss paths** — mirror the drawing precedent's `onResizeDismiss` handling (`ComposerControlsLayer.swift:232-245`, which sets `viewModel.activeTool = nil` for drawing so `effectiveBandState` doesn't immediately re-force the panel): add `if viewModel.isTimelineVisible { viewModel.isTimelineVisible = false }` to (1) `onResizeDismiss` (grabber pulled below minimum), (2) `onBackFromToolPanel` when the current effective tool is timeline, (3) the `else` branch of `onTapTile` (switching to a different tool tile while timeline is open) — without this, `isTimelineVisible` would stay stuck `true` in the background after leaving timeline, corrupting the other consumers listed above (canvas-carding, restore-sync gate, playhead-tick gate).
- **`StoryComposerView+Media.swift`**: remove the `.sheet(isPresented: $viewModel.isTimelineVisible, ...)` entirely. Move its `onDismiss` cleanup (stop playback if playing, `canvasTimelineBridge.end()`, `commitTimelineToCurrentSlide()`) into the existing `.adaptiveOnChange(of: viewModel.isTimelineVisible)` handler's false-transition branch (the true-transition branch already does `loadCurrentSlideIntoTimeline()` + initial scrub — unchanged).
- **`StoryComposerView+Canvas.swift:768`** (`presentedSystemSheetFraction`): remove the `if viewModel.isTimelineVisible { return 0.45 }` branch — timeline is no longer a system sheet, so this stale-carding path is obsolete.
- **`canvasIsCarded`** (`StoryComposerView+Canvas.swift:779-784`): add `viewModel.isTimelineVisible` as an explicit OR-condition alongside the existing `drawingActive`/`textActive` checks passed into `StoryCanvasFraming.isCarded(...)`, so the canvas cards/scales correctly while the timeline band is open via the same generic band-height-driven mechanism every other tool already uses (`ComposerControlsLayer`'s `onBandHeightChange` reporting real rendered band height).

### Testing

- `BandStateMachineTests` (if present) simplify — no more `.timeline` guard assertions needed since the state machine no longer special-cases it.
- New test coverage for `effectiveBandState`'s timeline-forcing branch (mirroring existing drawing-mode override tests if any exist) and for the three dismiss paths resetting `isTimelineVisible`.
- Manual verification: open timeline via FAB, top-bar button, and media/text row "Timeline" buttons — confirm it opens inline in the band (not a sheet), grabber-resizes like other tools, and closing via grabber-pull/back/tool-switch correctly commits and stops playback.

## Out of scope

- Text object rotation (only size/color were reported; rotation has its own working live-transform path already, untouched).
- The rare two-handed pinch+color-tap race (self-heals, documented as intentional).
- `StoryCanvasAspect`'s binary bucketing helper and its existing consumers (repost sizing) — unrelated to the stored ratio fix.
- Fanout diagnostic logging gaps and Feed-screen pull-to-refresh story reload — tracked separately (unrelated subsystem, real-time story sync investigation, 2026-07-14).
