# Story Glass Backdrop — MPS Snapshot Wiring (design)

**Date** : 2026-05-12
**Status** : Design draft — not yet ready for implementation plan
**Related** :
- `docs/superpowers/specs/2026-05-08-story-canvas-fidelity-design.md` (spec mère D-6)
- `docs/superpowers/specs/2026-05-09-story-canvas-phase4-followups-design.md` (Plan B — synthetic track + SSIM + cache)
- Commits `22248479` (StoryBlurFilter wired to model field, CAFilter fallback active) + `56b9bcb9` (picker surfaced in composer)

## Goal

Activate the real MPS path in `StoryGlassBackdropLayer.applyMPSPath()`. Currently the layer ships the visual effect via the `CAFilter` "gaussianBlur" private API fallback. The MPS path is API-complete + unit-tested but no caller invokes `setBackdropTexture(_:)`.

Wiring the MPS path is required for Phase 4 fidelity promise : **live preview pixels == AVFoundation export pixels**. `CAFilter` may not survive `AVAssetExportSession` compositor cleanly ; `MPSImageGaussianBlur` baked into the layer tree does.

## Why it's not a one-commit job

The naive snapshot is wrong. If we capture the canvas WITH the glass text layer visible, the captured texture contains the text glyphs. Applying Gaussian blur to that and presenting it as backdrop produces a "double-text halo" — the blurred text underneath the sharp re-rendered text.

The correct backdrop snapshot must capture **everything BEHIND the glass layer, excluding the glass text layer itself**. This requires either :

1. **Layer-tree exclusion** — temporarily hide the text layer, render parent tree to texture via `CARenderer.run(atTime:)`, restore visibility. Risk : a frame flash if the live composer re-renders between hide and restore.
2. **Shadow layer-tree** — maintain a parallel CALayer tree without glass-text layers. Render this shadow tree per frame to texture, feed to all glass backdrops. State management doubles.
3. **2-pass render in `StoryRenderer`** — pass 1 builds the non-text-glass tree → renders to backdrop texture cache ; pass 2 builds the glass-text layers consuming the cached texture. Requires refactor of `StoryRenderer.render()` and its compositor consumer.

Option 3 is the cleanest long-term. It also benefits the `StoryAVCompositor` export path naturally (the compositor already runs once per frame and can drive both passes).

## Proposed architecture (option 3)

```
StoryRenderer.render(slide:into:at:mode:languages:cache:)
  Phase A — non-glass layer tree
    For each item with backgroundStyle ≠ .glass :
      buildLayer(...)
    → produces CALayer tree "rootA"
  Phase B — backdrop texture capture
    For each glass text layer :
      Compute its frame in canvas space
      via CARenderer.run(atTime:) on rootA → MTLTexture covering canvas
      Crop to glass layer's frame → backdropTexture
  Phase C — glass layer tree
    For each item with backgroundStyle == .glass :
      buildLayer(...) → calls textLayer.setBackdropTexture(backdropTexture)
    Add to rootA as sibling layers above
  Return rootA
```

Performance estimate :
- Phase B requires 1 CARenderer.run per frame regardless of glass count
- iPhone 16 Pro : ~2-3ms per CARenderer pass at 1080×1920
- Slide with no glass texts → Phase B skipped entirely
- Trade-off : 2-3ms per frame for full MPS pipeline visibility, instead of 0ms with CAFilter fallback

## Files affected

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift` — 2-pass render path
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift` — live composer ticker that invokes `setBackdropTexture` per frame
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryAVCompositor.swift` — export per-frame variant
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryGlassBackdropLayer.swift` — remove `applyCAFilterFallback()` once MPS path is universal (or keep as `.reduceTransparency` accessibility fallback)
- Tests for the 2-pass render + cropping geometry + perf benchmark (Phase 4 SSIM activation : the MPS pipeline must equal AVFoundation export pixel-exact)

## Acceptance criteria

1. `test_glass_backdrop_uses_mps_not_cafilter_when_provider_wired`
2. `test_glass_backdrop_excludes_owner_textLayer_from_snapshot`
3. `test_glass_backdrop_crop_geometry_correct_at_iPad_and_iPhone`
4. SSIM equivalence test (B2 reactivated) holds with glass text fixture
5. `./apps/ios/meeshy.sh build` + MeeshyUITests still green
6. Live preview perf : iPhone 16 Pro maintains 120fps with 3 glass texts visible
7. AVFoundation export of slide with glass text : produces correct frosted output (no double-text halo, no CAFilter API regression in AVAssetExportSession)

## Out of scope

- Caching the backdrop texture across frames (perf optim, like `StoryRendererCache` did for layers — defer)
- `.glass` style for stickers (only text covered here ; stickers can come later via same hook)
- Reduce-Transparency accessibility : when system flag is on, fall back to solid `MeeshyColors.indigo50.withAlphaComponent(0.6)` instead of CAFilter

## Why this can ship later (not blocking)

`CAFilter "gaussianBlur"` is the exact private API Apple uses inside `UIVisualEffectView`. It's stable since iOS 8, ships in production at billion-device scale. The visual quality of the live composer is on par with the system glassmorphism today. The only deferrable cost : potential pixel drift between live preview and AVFoundation export.

Until this design lands, `StoryGlassBackdropLayer.applyCAFilterFallback()` carries the production visual.

---

**Next step** : convert this design to an implementation plan + execute under a dedicated worktree.
