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
