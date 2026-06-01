# Story consolidation — standing backlog (loop-driven, 2026-06-01)

Goal: story create/view/publish fully functional + pleasant. Unified composition logic,
no bug, no unwired feature, all callbacks wired, fluidity, display perf, sync across
preview / mini-preview / Thumbnail / ThumbHash with ALL layers (image+text+drawing).
Local-first, efficient cache, FABs, show-only-necessary. Each fix: prove → fix → review
→ commit → push. Maintain & replenish this backlog across iterations.

## Principles (senior SWE)
- Prove every hypothesis in the real code before fixing (no blind fixes).
- Local-first; cache-first display; only render what's necessary.
- Single source of truth (CanvasGeometry, StoryRenderer, resolveUserLanguage).
- Review after each change.

## IN PROGRESS / DONE this session (proven fixes, pushed)
- [x] Composer canvas 9:16 parity (coordination bug) — CanvasGeometry.aspectFitSize
- [x] Drawing UX: resizable dedicated band + canvas scaled/rounded above
- [x] Comments overlay pauses the story timer
- [x] Voice caption respects full Prisme chain
- [x] Translation badge respects full Prisme chain
- [x] markViewed decodes gateway Bool
- [x] Reaction count no over-count on repeated same emoji
- [x] Slide delete keeps editing the same slide
- [x] Duplicate background element clones as foreground
- [x] **ThumbHash composite includes the DRAWING layer** (renderComposite) ← active

## BACKLOG (to consume, then replenish)
### Thumbnail / ThumbHash / preview sync (ALL layers)
- [ ] Verify SlideMiniPreview renders the drawing layer at the right z-order/scale (it uses
      MeeshyStrokeCanvas — confirm parity with StoryRenderer order: bg→media→drawing→text).
- [ ] renderComposite z-order vs real StoryRenderer (text drawn before media here = media
      over text; confirm acceptable for thumbhash, else align order).
- [ ] Thumbnail used in tray ring vs slide-strip vs reader loading overlay — single source?
- [ ] ThumbHash recomputed when drawing/text edited (staleness)? slideImages invalidation.

### Composition consistency / unified logic
- [ ] Confirm StoryRenderer is the single render path for composer + reader + export (it is)
      and SlideMiniPreview is the only re-implementation (audit its parity drift).
- [ ] Repost: RepostPayload drops modern drawingStrokes (DORMANT — only diagnostic consumer
      today; fix when a consumer builds content from RepostImportResult).

### Callbacks wired / no unwired feature
- [ ] Audit StoryComposerView / StoryViewerView closures for any no-op / unwired callback.
- [ ] Language picker in viewer: does picking a non-preferred language change the display
      (override) or only request translation? (UX gap suspected.)

### UI/UX (ios-simulator)
- [ ] Drawing band grabber resize feel + canvas rounding/inset on device.
- [ ] Navigation: create (Ma story idx0) vs view (idx1); alignment/positioning checks.
- [ ] Composer tool panels (media/text/audio) layout + canvas-scale-above generalization.

### Local-first / cache / perf
- [ ] Confirm cache-first on story tray + viewer (CacheCoordinator.stories) — stale-while-revalidate.
- [ ] Leaf views: no @ObservedObject on global singletons in story cells.

## Progress — structured loop (2026-06-01)
- [x] it.1 ThumbHash composite includes drawing layer (all layers) — pushed main 0c8fe3d7d
- [x] it.2 Drawing topmost everywhere (renderComposite + SlideMiniPreview parity) — pushed main 4a83174dd
- [x] it.3 Tray own-first sort on network/cache load (unified w/ socket path) — pushed main 30dc06754
- [x] it.4 Visual review (latest build): drawing band + canvas scale/round/below-island + draw OK, no regression.

## Verified-correct this session (no fix needed, proven)
- buildEffects includes drawingStrokes (publish keeps drawing); currentEffects write-through (live thumbnail).
- addMediaObject sets real aspectRatio for images + videos (TODO@1037 is stale, handled at picker).
- loadStories cache-first + stale-while-revalidate (textbook); availableTranslationLanguages correct.
- toggleBackground enforces 1-bg invariant; resolvedBackgroundAudio legacy synth correct.

## FEATURE GAPS (need design decision, NOT blind-fixable)
- Viewer language picker (showFullLanguagePicker) calls requestTranslation only — NO display override
  and NO user feedback. Per Prisme "explore other languages", picking should display the chosen language
  (needs: session override @State, fold into resolvedViewerLanguageChain, re-render on translation arrival,
  revert-on-slide-change policy). Mirror messages' activeTranslationOverrides. Medium feature, design-gated.
- Repost: RepostPayload drops modern drawingStrokes (DORMANT — only diagnostic consumer today).

## NEXT to consume
- [ ] ios-simulator: systematic nav/visual/alignment pass (login lost on reinstall — batch checks; don't reinstall per-iter).
- [ ] Thumbnail single-source audit (tray ring vs slide-strip vs reader loading overlay).
- [ ] Confirm leaf story cells have no @ObservedObject on global singletons (zero-rerender).

## Progress it.5-6
- [x] it.5 Preview-surface default-bg audit: minor/rare gap only (nil bg color differs canvas/thumbhash/mini) — not worth blind fix (pastel auto-applied).
- [x] it.6 ios-simulator visual pass (viewer): real story (photo + 'Zero' text) renders clean — 9:16 canvas, letterbox blur, text/photo positioning, sidebar, composer all aligned; tap-right advance/dismiss OK. No visual/nav/alignment bug.

## DECISION NEEDED (highest remaining value = an IMPROVEMENT, not a bug)
- Viewer language-picker display override: complete the half-wired "explore other languages" Prisme
  feature. Plan (mirror messages' activeTranslationOverrides): add @State sessionLanguageOverride in
  StoryViewerView; resolvedViewerLanguageChain prepends it when set; picker sets it (+ requestTranslation);
  re-render on translation arrival; clear on slide change. Medium async feature — implement next iteration
  unless user redirects. Until then picker = request-only (no display change).

## Progress it.7 — composer↔reader alignment EMPIRICALLY + DATA verified (2026-06-01)
- [x] it.7 Pulled REAL stored positions via API (GET /posts/feed/stories). jcnm "Zero" 6a1ccd74:
      image isBackground=true x=0.525 y=0.568 ratio=1.333 ; text "Zero" y=0.82. "Noir Sacré" 6a1ccefa:
      image isBackground=true x=0.306 (left!) y=0.632 ; texts y=0.25 / y=0.963.
- [x] PROVEN ROOT CAUSE (no blind fix): background media offset = (x-0.5)·renderSize.width,
      (y-0.5)·renderSize.height (StoryCanvasUIView). renderSize.height differs old composer (874)
      vs reader (714) → same normalized y renders at different px → bg pan + text shift in reader.
      These stories are PRE-9:16-fix (composed ~00h, fix ~04h). NOT migratable (normalized positions
      are render-size-independent; only the composer that captured them used 874).
- [x] EMPIRICAL CONFIRM new stories align: composed bg image in current (9:16) composer → in-composer
      preview (=reader pipeline, .play) renders the bg image IDENTICALLY (full-frame, centered, no canvas
      bg). edit==reader for new stories. (screenshots /tmp/c6 edit, /tmp/c7_preview reader)
- [x] No code fix needed for the coordination bug — already fixed by aspectFitSize 9:16 parity; the
      perceived misalignment in the J.Charles story is unmigratable old data.

## NEW backlog item (minor, low-priority cosmetic)
- [ ] StorySlideRenderer.drawTextObject (thumbHash composite) font uses /390.0 (device width) instead of
      /CanvasGeometry.designWidth (1080) → text ~2.77× oversized in the 100×178 blur composite. Cosmetic
      only (thumbHash is a ~28-byte blur placeholder, downsampled to ~32×32) but inconsistent w/ the fixed
      SlideMiniPreview (/designWidth). Align for single-source consistency when touching this file.

## NOW ACTIVE (user-queued after the create/view loop)
- [ ] Viewer language-picker display OVERRIDE (the "explore other languages" Prisme feature). See plan above.
