# Refonte outil dessin Story Composer — Floating Controllers + Per-Stroke Editing

**Branche** : à créer `feat/story-drawing-floating-controllers`
**Cible** : iOS / `packages/MeeshySDK/Sources/MeeshyUI/Story/`
**Pattern de référence** : `TextEditFloatingBubbles` / `TextEditToolOptions` / `StoryComposerViewModel+TextEditing`
**Date** : 2026-05-30

## Objectif UX

Remplacer la feuille de contrôle classique de l'outil dessin (slider/palette dans le band inférieur) par des **contrôleurs flottants** posés sur `.ultraThinMaterial` au-dessus du canvas, exactement comme l'outil texte. Ajouter une **liste des traits avec édition individuelle** (couleur, épaisseur, lissage courbe/droite, suppression).

## Décisions de design (validation user requise avant Phase 1)

1. **Capture input** :
   - [ ] Option A — **Hybride** : `PKCanvasView` en mode single-stroke (Apple Pencil + palm rejection préservés), extraction immédiate en `StoryDrawingStroke` à chaque lift-up, puis clear. ✅ Recommandé.
   - [ ] Option B — **Full custom** : `DragGesture` SwiftUI pur, on perd palm rejection + Apple Pencil pressure.

2. **Backward compat des stories existantes** (`drawingData: Data?` legacy PKDrawing) :
   - [ ] Option A — **Migration best-effort** : à la lecture d'un slide existant, convertir `PKDrawing` → `[StoryDrawingStroke]` (préserve les dessins déjà publiés).
   - [ ] Option B — **Hard cutover** : nouveau format only, les dessins legacy n'apparaissent plus dans le composer (pré-launch, risque acceptable ?). ✅ Recommandé si zero-impact OK.

## Architecture cible

### SDK target `MeeshySDK` (atomes data + logique pure)
- `Sources/MeeshySDK/Models/StoryDrawingStroke.swift` (nouveau)
  - `struct StoryDrawingStroke: Codable, Sendable, Equatable, Identifiable { id, points: [CGPoint], colorHex, width, tool, smoothing, createdAt }`
  - `enum StrokeTool: pen, marker, eraser`
  - `enum StrokeSmoothing: raw, curve, line`
- `Sources/MeeshySDK/Story/Drawing/StrokeSmoothing.swift` (nouveau)
  - `enum CatmullRomSmoother { static func smooth(_ points: [CGPoint], samplesPerSegment: Int = 8) -> [CGPoint] }`
  - `enum RamerDouglasPeucker { static func straighten(_ points: [CGPoint], tolerance: CGFloat = 8) -> [CGPoint] }`
- `Sources/MeeshySDK/Story/Drawing/LegacyDrawingMigration.swift` (nouveau, conditionnel — Option A)
  - `extension StoryDrawingStroke { static func fromLegacyPKDrawing(_ data: Data) -> [StoryDrawingStroke] }`

### SDK target `MeeshyUI` (atomes UI rendu + capture)
- `Sources/MeeshyUI/Story/Drawing/MeeshyStrokeCanvas.swift` (nouveau)
  - `struct MeeshyStrokeCanvas: View { let strokes: [StoryDrawingStroke]; let selectedId: String? }`
  - Rend via `Canvas { ctx, size in ... }` + `Path` + `context.stroke()`. Sélection = halo glow.
- `Sources/MeeshyUI/Story/Drawing/StrokeCaptureLayer.swift` (nouveau)
  - `struct StrokeCaptureLayer: UIViewRepresentable { var activeTool, activeColor, activeWidth, onStrokeCommitted }`
  - PKCanvasView single-stroke + extraction immédiate (cf. Option A).

### MeeshyUI Story (UX produit composer)
- `Sources/MeeshyUI/Story/StoryComposerViewModel+DrawingEditing.swift` (nouveau, mirror de `+TextEditing.swift`)
  - `enum DrawingEditTool: tool, color, thickness, smoothing, layers` (5 outils)
  - `enum DrawingEditingMode: .inactive, .active(strokeId: String?, expandedTool: DrawingEditTool?)`
  - Méthodes : `enterDrawingEditingMode()`, `exitDrawingEditingMode()`, `setExpandedDrawingTool(_)`, `selectStroke(_)`, `deleteStroke(_)`, `updateSelectedStrokeColor(_)`, `updateSelectedStrokeWidth(_)`, `updateSelectedStrokeSmoothing(_)`
- `Sources/MeeshyUI/Story/DrawingEditFloatingBubbles.swift` (nouveau, mirror de `TextEditFloatingBubbles.swift`)
- `Sources/MeeshyUI/Story/DrawingEditToolOptions.swift` (nouveau, mirror de `TextEditToolOptions.swift`)
- `Sources/MeeshyUI/Story/StoryDrawingToolbar.swift` (nouveau, mirror de `StoryTextEditToolbar.swift`)
- **Refonte** `StoryComposerViewModel.swift` :
  - Remplacer `@Published var drawingData: Data?` par `@Published var drawingStrokes: [StoryDrawingStroke] = []`
  - Ajouter `@Published var drawingEditingMode: DrawingEditingMode = .inactive`
  - Ajouter `@Published var activeBrushColor`, `activeBrushWidth`, `activeBrushTool`, `activeBrushSmoothing` (pinceau actif)
- **Refonte** `StoryComposerView.swift` :
  - Mount `MeeshyStrokeCanvas` (rendu) + `StrokeCaptureLayer` (input) + `StoryDrawingToolbar` (overlay) au lieu du `DrawingOverlayView` existant
- **Refonte** `Controls/ComposerToolPanelHost.swift` :
  - `drawingPanel` retourne `EmptyView()` (les contrôles sont maintenant flottants, plus dans le band)
- **Refonte** `Canvas/StoryRenderer.swift` :
  - Rendre `[StoryDrawingStroke]` au lieu de `PKDrawing` (extract du slide.effects)
- **Refonte** `Models/StoryModels.swift` :
  - Ajouter `public var drawingStrokes: [StoryDrawingStroke]?` à `StoryEffects`
  - Conserver `drawingData: Data?` (legacy decode-only)
  - Migration au decode si Option A retenue

### Suppressions
- `DrawingOverlayView` + `DrawingToolbarPanel` + `PencilKitCanvas` → tout disparait du fichier `DrawingOverlayView.swift` (le fichier est supprimé ou réécrit complètement)

## Plan TDD par phase

Chaque phase suit RED → GREEN → REFACTOR. Tests avant code. Test du grain SDK Purity (CLAUDE.md SDK) appliqué avant chaque dépôt.

### Phase 1 — `StoryDrawingStroke` model
**Tests** :
- `test_codable_roundtrip_preserves_all_fields`
- `test_equatable_compares_points_and_metadata`
- `test_init_assigns_uuid_id`
- `test_empty_points_array_is_valid`
- `test_single_point_stroke_is_valid` (dot)
**Code** : struct + enums StrokeTool/StrokeSmoothing + Codable manuel CodingKeys

### Phase 2 — Smoothing algorithms
**Tests** :
- `test_catmullRom_returns_input_when_points_lt_4`
- `test_catmullRom_with_4_points_generates_samplesPerSegment_intermediates`
- `test_catmullRom_preserves_endpoints`
- `test_rdp_returns_endpoints_when_all_collinear`
- `test_rdp_with_tolerance_zero_returns_input`
- `test_rdp_with_large_tolerance_returns_endpoints_only`
**Code** : 2 enums pure-functions

### Phase 3 — Backward compat (si Option A retenue)
**Tests** :
- `test_fromLegacyPKDrawing_with_empty_data_returns_empty`
- `test_fromLegacyPKDrawing_with_3_strokes_returns_3_strokes`
- `test_fromLegacyPKDrawing_extracts_color_from_PKInk`
- `test_fromLegacyPKDrawing_extracts_points_in_design_coords`
- `test_StoryEffects_decode_legacy_drawingData_populates_drawingStrokes`
**Code** : extension + migration au decode StoryEffects

### Phase 4 — `MeeshyStrokeCanvas`
**Tests** (snapshot via SnapshotTesting) :
- `test_renders_empty_with_no_strokes`
- `test_renders_single_red_line`
- `test_renders_3_strokes_in_order`
- `test_renders_selected_stroke_with_halo`
**Code** : SwiftUI Canvas + Path generation per smoothing type

### Phase 5 — `StrokeCaptureLayer`
**Tests** :
- `test_onStrokeCommitted_called_with_design_space_points`
- `test_canvas_cleared_after_commit`
- `test_eraser_tool_does_not_commit_stroke_but_deletes_overlapping`
**Code** : PKCanvasView + Coordinator avec extraction

### Phase 6 — ViewModel transitions
**Tests** :
- `test_enterDrawingEditingMode_sets_active_with_nil_strokeId_and_nil_tool`
- `test_setExpandedDrawingTool_updates_when_active`
- `test_setExpandedDrawingTool_noop_when_inactive`
- `test_selectStroke_with_valid_id_updates_mode`
- `test_selectStroke_with_invalid_id_noop`
- `test_deleteStroke_removes_from_array_and_clears_selection_if_selected`
- `test_updateSelectedStrokeColor_mutates_stroke`
- `test_exit_resets_to_inactive`
**Code** : enum + extension méthodes + @Published refactor

### Phase 7 — `DrawingEditFloatingBubbles`
**Tests** (snapshot + interactions) :
- `test_renders_5_tool_bubbles_plus_dismiss`
- `test_active_bubble_has_brandGradient`
- `test_tap_invokes_onSelectTool`
- `test_dismiss_invokes_onDismiss`
**Code** : View (~60 lignes, mirror TextEditFloatingBubbles)

### Phase 8 — `DrawingEditToolOptions` + stroke list
**Tests** :
- `test_tool_option_shows_3_tools_pen_marker_eraser`
- `test_color_option_shows_9_swatches_active_selected`
- `test_thickness_option_shows_slider_1_30`
- `test_smoothing_option_shows_3_chips_raw_curve_line`
- `test_layers_option_shows_stroke_list_with_count`
- `test_layers_swipe_delete_calls_deleteStroke`
- `test_layers_tap_calls_selectStroke`
**Code** : switch sur DrawingEditTool + sous-vues

### Phase 9 — Wiring + StoryDrawingToolbar
**Tests** :
- `test_toolbar_shows_when_drawingEditingMode_active`
- `test_toolbar_hides_when_inactive`
- `test_options_panel_shows_only_when_expandedTool_non_nil`
**Code** : `StoryDrawingToolbar` (assemble bubbles + options) + edits `StoryComposerView.swift` (mount overlay) + `Controls/ComposerToolPanelHost.swift` (vide drawingPanel)

### Phase 10 — Cleanup + StoryRenderer + smoke
**Actions** :
- Supprimer `DrawingOverlayView.swift` (remplacé par les nouveaux atomes)
- Update `StoryRenderer.swift` pour bake `[StoryDrawingStroke]` en image (via Canvas headless ou CGContext)
- `./apps/ios/meeshy.sh build` doit passer
- `./apps/ios/meeshy.sh run` smoke test manuel : créer story, dessiner 3 traits, ouvrir liste, supprimer le 2, changer couleur du 1, lisser le 3 en courbe, publier, voir dans reader

## Risques identifiés

1. **`StoryRenderer.render` casse** si le bake `[StoryDrawingStroke]` → image n'est pas pixel-perfect. Mitigation : tests visuels A/B vs PKDrawing.image(from:) avant phase 10.
2. **Eraser tool** plus dur sans PKEraserTool : doit detecter intersection ray↔stroke et supprimer le stroke entier (pas pixel-by-pixel). Acceptable UX.
3. **Performance** sur dessins denses (>100 strokes). Canvas SwiftUI doit rester >60fps. Mitigation : `drawingGroup()` + `.equatable()` sur MeeshyStrokeCanvas.
4. **Migration legacy** : Option A peut ne pas matcher 100% des PKInk presets (alpha, marker = wider). Documenté comme best-effort.

## Tests à exécuter

```bash
# Tests SDK (modèles + smoothing + migration)
# NB : les suites smoothing s'appellent CatmullRomSmootherTests + RamerDouglasPeuckerTests
# (pas "StrokeSmoothingTests") — Swift Testing matche sur le nom de struct.
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro,OS=18.2' \
  -derivedDataPath apps/ios/Build \
  -only-testing:MeeshySDKTests/StoryDrawingStrokeTests \
  -only-testing:MeeshySDKTests/CatmullRomSmootherTests \
  -only-testing:MeeshySDKTests/RamerDouglasPeuckerTests \
  -only-testing:MeeshySDKTests/LegacyDrawingMigrationTests

# Tests MeeshyUI (canvas + capture + bubbles + options + viewmodel)
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/MeeshyStrokeCanvasTests \
  -only-testing:MeeshyUITests/DrawingEditFloatingBubblesTests \
  -only-testing:MeeshyUITests/DrawingEditToolOptionsTests \
  -only-testing:MeeshyUITests/StoryComposerViewModelDrawingTests

# Build app complet
./apps/ios/meeshy.sh build

# Smoke test final
./apps/ios/meeshy.sh run
```

## Review

### Progression (2026-05-30, reprise après crash machine)

**Décisions de design retenues** :
- Capture input → **Option A (hybride PKCanvasView)** — ✅ confirmé par user 2026-05-30.
- Backward compat → **Option A (migration best-effort)** — implémentée (`LegacyDrawingMigration` + decode `StoryEffects`).

**Phases livrées (SDK pur, toutes vertes)** :
- [x] **Phase 1** — `StoryDrawingStroke` + `StoryDrawingStrokePoint` + enums `StrokeTool`/`StrokeSmoothing` (`Models/StoryDrawingStroke.swift`). Suite `StoryDrawingStrokeTests`.
- [x] **Phase 2** — `CatmullRomSmoother` + `RamerDouglasPeucker` (`Story/Drawing/StrokeSmoothing.swift`). Suites `CatmullRomSmootherTests` (7) + `RamerDouglasPeuckerTests` (8) = 15 tests.
- [x] **Phase 3** — `StoryDrawingStroke.fromLegacyPKDrawing` + migration au decode de `StoryEffects` + champ `drawingStrokes: [StoryDrawingStroke]?` (`Story/Drawing/LegacyDrawingMigration.swift` + `Models/StoryModels.swift`). Suite `LegacyDrawingMigrationTests` (16). Fix : extraction hex couleur alignée sur la convention codebase (troncature `Int(x*255)`, pas arrondi).

**Reste** : Phases 4-10 (MeeshyUI : canvas rendu, capture layer, ViewModel transitions, floating bubbles, options, toolbar, wiring, cleanup + StoryRenderer). Pas encore commencées.

### Architecture rendu découverte (2026-05-30) — décision bridge additif

Le plan initial ne mentionnait que `StoryRenderer`. La surface réelle de consommation de `drawingData` :
1. `StoryRenderer.render` — bake CALayer (zPosition 9999) via `PKDrawing.image(from: designRect)`.
2. `StoryCanvasUIView` — live composing canvas (CALayer), rend le `drawingData` persisté quand `isDrawingOverlayActive == false` ; possède aussi son propre `setDrawingMode` PKCanvasView interne (non utilisé par le composer, qui passe par l'overlay SwiftUI).
3. `SlideMiniPreview` — thumbnail.
4. Repost : `RepostPayload` + `UnifiedPostComposer` + `CanvasReprojector.reproject(drawingData:)`.

**Décision** : `drawingStrokes` = source de vérité éditable du composer. Les 4 chemins de rendu **préfèrent `drawingStrokes` quand présent (rasterizer dédié), sinon fallback `drawingData`** (rétro-compat stories publiées). Bridge additif, pas d'arrachage. Brique partagée : `StoryStrokeRasterizer` (pure : `[StoryDrawingStroke]` + size → image/CGPath, honore raw/curve/line). Coords design 1080×1920 (identique au legacy → portable, pas de reprojection repost requise).

### Sous-découpage Phases 4-10 (ordre d'exécution) — TOUTES LIVRÉES ✅
- [x] 4a. `StrokePathBuilder` (SDK pur) — `stroke → CGPath` honorant smoothing. 7 tests.
- [x] 4b. `StoryStrokeRasterizer` (MeeshyUI) — `[stroke] → UIImage` via PathBuilder. 6 tests (dont sampling pixel → Risque #1 mitigé).
- [x] 4c. `MeeshyStrokeCanvas` (MeeshyUI) — SwiftUI Canvas + halo sélection, Equatable (Risque #3). 3 tests.
- [x] 5.  `StrokeCaptureLayer` (MeeshyUI) — PKCanvasView single-stroke, extraction design-space pure testable. 5 tests.
- [x] 6.  `StoryComposerViewModel+DrawingEditing` — enums `DrawingEditTool`/`DrawingEditingMode` + transitions + `drawingStrokes` calculé sur `currentEffects` (pas de cache `@Published` séparé → pas de staleness du legacy `drawingData`). 15 tests.
- [x] 7.  `DrawingEditFloatingBubbles` (mirror TextEditFloatingBubbles).
- [x] 8.  `DrawingEditToolOptions` + stroke list (sélection-aware : trait sélectionné sinon pinceau actif) + `StoryDrawingColors` palette relocalisée.
- [x] 9.  `StoryDrawingToolbar` + wiring `StoryComposerView` (overlay capture+render, `adaptiveOnChange(activeTool)` enter/exit, gate `isFloatingEditorActive`, hit-test gomme `eraseStrokes`) + `drawingPanel` → `EmptyView`.
- [x] 10. Render bridge 3 chemins effectifs (`StoryRenderer.bakedDrawingImage` prefer-strokes-fallback-legacy ; `SlideMiniPreview` via `MeeshyStrokeCanvas` ; `StoryCanvasUIView` déjà délégué à StoryRenderer). `buildEffects` ré-émet `drawingStrokes`. Checks empty/dirty étendus. Threading `drawingCanvas`/`drawingTool` retiré des 4 fichiers + `DrawingOverlayView.swift` **supprimé**.

### État final
- **Build SDK complet** : `TEST BUILD SUCCEEDED`. **Build app** (`meeshy.sh build`) : en cours de validation.
- **Tests** : 52 tests SDK (5 suites) + 53 tests UI (1 skip) sur le périmètre dessin + régression (reset/render/repost/protocol/controls) — **0 échec**.
- **Décision design notable** : `drawingStrokes` propriété calculée (pas `@Published`) — meilleur que le plan littéral (évite le double-cache stale du legacy).
- **Reste** : smoke test device (`meeshy.sh run`) — dessiner 3 traits, liste, supprimer le 2, recolorer le 1, lisser le 3, gommer, publier, voir dans reader. Non commité.

**Note** : rien n'est commité (branche `feat/story-drawing-floating-controllers`).
