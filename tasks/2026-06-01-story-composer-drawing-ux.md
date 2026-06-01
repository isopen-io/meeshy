# Story Composer — fixes & drawing UX redesign (2026-06-01)

## PART 1 — Coordination bug (composer <-> reader <-> mini-preview) — DONE & user-validated

Root cause (proven: code + math + runtime log + screenshots): composer canvas was
full-screen (402x874 iPhone 16 Pro) while reader/preview/export are all 9:16 (402x714).
Width-based projection (scaleFactor = width/1080) let text/media round-trip (same width)
but the drawing (non-uniform bounds projection 1920/h) compressed vertically by 714/874
~= 0.82 -> detached from text; bottom content cropped.

Fix shipped:
- CanvasGeometry.aspectFitSize(in:) — shared 9:16 fit (single source of truth).
- Composer canvas (StoryComposerView.canvasComposerLayer) constrained to 9:16, centered.
- Reader canvasFitSize delegates to the shared helper.
- SlideMiniPreview font /393 -> /designWidth(1080) + media 0.35*w -> baseMediaDesignSize.
- Tests: CanvasGeometryTests +5 (incl composer<->reader parity). 16/16 green.
- Runtime verified: composer logs 402x714 (was 402x874); drawing stays aligned with text
  in composer AND preview/reader.

## PART 2 — Drawing UX redesign (confirmed, IN PROGRESS)

Decisions (AskUserQuestion):
- Scope: "Dessin d'abord, puis etendre".
- Resize: "Oui, redimensionnable multi-hauteurs" (band draggable small/med/large, canvas re-scales).
- Earlier asks: draw-immediately on Dessin; stroke list in resizable bottom panel w/ grabber
  + back-nav + quick access to other tools ("comme les autres"); brush controls float on
  canvas; AVOID DUPLICATION (make original band flexible, no parallel sheet); when a panel
  opens, canvas scales + stays visible ABOVE it.

Discovered wiring (respect):
- Tool entry: empty-state tile -> selectTool(tool) (sets activeTool) + bandStateMachine.tapFAB+tapTile.
  FAB column onTap -> bandStateMachine.tapFAB only.
- activeTool==.drawing -> adaptiveOnChange calls enterDrawingEditingMode() (floating).
- isFloatingEditorActive (text OR drawing) hides bottomRegion (band) -> band hidden during drawing;
  ComposerToolPanelHost.drawingPanel is EmptyView today.
- Band height today = intrinsic per-tool panelHeight (drawing 140, text 280...).
- ComposerToolPanelHost.headerRow already = back (chevron + tool) + switch chips = the
  "comme les autres" chrome -> drawing should reuse it (render through the band).

Plan (build+verify each increment):
1. Drawing into the band (no parallel sheet): drawingPanel = DrawingStrokeList (fills);
   stop hiding band during drawing; drive bandStateMachine=.toolPanel(.drawing) on entry;
   remove stroke list from floating StoryDrawingToolbar (keep bubbles). Free back+switch header.
2. Canvas scales above the band: avail = screen - topBar - bandHeight; scale 9:16 canvas to
   fit + center; compose with canvasScale/canvasEditShift. PKCanvasView bounds stay 9:16 ->
   drawing capture still round-trips. Verify stroke<->text alignment.
3. Resizable band (multi-height): detent dimension (S/M/L) via grabber drag; bandHeight=f(detent);
   canvas re-scales. @State bandDetent in StoryComposerView; keep BandStateMachine untouched.
4. Generalize scaling + resizable band to other tools, verifying each.

Risks: composer is core + recently refactored (floating-controllers refonte 2026-05-30).
Changing band visibility + canvas transform can regress gestures/FAB/swipe-collapse/
keyboard-avoidance (canvasEditShift). Verify on simulator after each increment.

Status: parallel-sheet experiment reverted per "avoid duplication". Tree back to original
drawing UX; Part 1 coordination fix intact. NB: a parallel agent edits apps/ios/.../Bubble/*
(AudioCarousel) in the same worktree -> intermittent app-target build breakage is from there.

---
## Progress update (03:12)
- Increment 1 (drawing in band) + Increment 2 (canvas scaled above the open band): DONE & verified on simulator.
  - drawingPanel = DrawingStrokeList in the standard band; band header (back + switch chips) reused = "comme les autres".
  - Floating brush bubbles kept on canvas (bottomInset lifts them above the band).
  - Canvas fits 9:16 into the region above the band (bottomPanelHeight reserved); stays 9:16 → coordination preserved.
  - isFloatingEditorActive excludes drawing; band shown during drawing; activeTool<->band synced (both onChange handlers, idempotent).
  - Verified: drawing on the scaled canvas works (stroke captured, band "1 trait"->"2 traits"); header + switch chips present.
  - Tests 16/16 green (CanvasGeometry + DrawingEditing).
- Tuning constants: ComposerToolPanelHost.panelHeight(.drawing)=120 (peek), StoryComposerView.drawingBandReservedHeight=215.
- REMAINING: Increment 3 (multi-height resizable band via grabber drag — user said "Oui") ; Increment 4 (generalize canvas-scaling + resize to other tools).
