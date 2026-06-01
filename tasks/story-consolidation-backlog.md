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
- [x] it.8 Viewer language-picker display OVERRIDE shipped — pushed main ae5e97be7. Pure helper
      StoryViewerView.viewerLanguageChain(base:override:) (6 tests GREEN), @State sessionLanguageOverride
      prepended to resolvedViewerLanguageChain, reset on slide change (.onChange currentStory?.id),
      onSelectLanguageOverride closure → StoryCardView + StoryActionSidebarView (full picker + strip both
      set it + requestTranslation). Full picker auto-dismisses on select → story re-renders in chosen lang.
      Build 21s OK. Falls through to next preferred lang if chosen lang not yet translated (never
      translations.first per Prisme rule #1); re-renders when translation arrives.

## Progress it.9 — realtime story TEXT translation delivery wired (2026-06-01)
- [x] it.9 PROVEN 2 pre-existing bugs that made the override work for cached translations ONLY:
      (1) SDK listened on stale event `post:story-translation-updated` while the gateway emits
          `story:translation-updated` (source of truth socketio-events.ts:242; gateway
          StoryTextObjectTranslationService:110) → translations never reached the client.
      (2) NO app subscriber to socialSocket.storyTranslationUpdated → even if received, no merge.
- [x] FIX (1): SocialSocketManager listens on `story:translation-updated`.
- [x] FIX (2): StoryViewModel subscribes to storyTranslationUpdated → merges per-text-object translations
      into the cached story (mirrors storyUpdated handler) → reader re-renders via observed VM.
- [x] SDK helper StoryItem.mergingTextObjectTranslations(at:translations:) — pure, immutable rebuild,
      6 tests GREEN (MeeshySDKTests). App helper viewerLanguageChain 6 tests GREEN. App + SDK build OK.
- [ ] KNOWN: open-viewer live-update for NON-cached translations depends on the presenter passing live
      viewModel.storyGroups. StoryViewerContainer does (live); StoryTrayView passes a frozen [group]
      snapshot → that path updates on re-open only. Pre-existing (storyUpdated has the same shape). Note.

## Progress it.10 — ThumbHash composite layer fidelity (2026-06-01)
- [x] PROVEN: StoryTrayView frozen [group] is the PREVIEW path (isPreviewMode, ephemeral) — figer est
      correct. The REAL viewing path is StoryViewerContainer (@ObservedObject viewModel, live storyGroups)
      → the it.9 realtime translation merge re-renders the open viewer live. (false-alarm item dropped)
- [x] PROVEN + FIXED: StorySlideRenderer.renderComposite (thumbHash) ignored the modern background
      MEDIA object — a `StoryMediaObject(isBackground:true)` was drawn by the foreground loop as a
      0.6× centred blob AFTER the text (occluding it), never full-bleed. Now draws resolvedBackgroundMedia
      full-bleed (parity with StoryBackgroundLayer/SlideMiniPreview) + foreground loop uses
      resolvedForegroundMediaObjects (excludes bg). 2 pixel tests GREEN.
- [x] FIXED: drawTextObject font /390 → /CanvasGeometry.designWidth (1080) — text was ~2.77× oversized
      in the composite (parity with SlideMiniPreview's /designWidth).
- [x] xcodebuild BUILD SUCCEEDED; MeeshyUITests bundle compiled + ran the new renderComposite (runtime-proven).

## Verified it.10b — per-media thumbHash loop is CORRECT (no fix)
- [x] PROVEN: StoryComposerView per-media thumbHash loop (line 2033) computes a thumbHash PER media-id
      including the background media — this is CORRECT: every media (bg or fg) needs its own loading-state
      blur (StoryBackgroundLayer uses the bg media's thumbHash). No bg-exclusion needed here. (false alarm)

## Audit it.11 — publication path + cache + mini-preview: SOLID (no bug found)
- [x] runStoryUpload: dedup-safe (skip slideIdx < alreadyPublishedCount on retry → no duplicate slides),
      RAW publish (bg + fg media uploaded individually, effects JSON), offline queue (enqueueStoryForOffline
      → StoryPublishQueue replay), onPublishedSlide → insertOrAppendStoryItem (id-dedup). Solid.
- [x] insertOrAppendStoryItem: dedups by story id (optimistic+echo → no double segment). persistStoryCache.
- [x] Cache coherence: realtime counters (reaction/comment) route via mutateStoryItem → persistStoryCache
      → survive cold start (local-first). storyUpdated/Deleted/TranslationUpdated all persist. Solid.
- [x] SlideMiniPreview: only used at StoryComposerView:853 with a 9:16 cell (thumbW = thumbH*9/16) →
      non-uniform .position(y: media.y*size.height) is consistent with the width-based reader. No bug.
  → 3 potential concerns verified as NON-issues (no blind fix). Publish/cache subsystem in good shape.

## Audit it.12 — composer sync architecture + leaf-view perf: SOLID (no bug)
- [x] GranularSync watches View-level state (filter/image/stickers/drawing/bgColor) → syncCurrentSlideEffects
      (= currentEffects = buildEffects(), full rebuild). VM mutation methods (text/media/drawing-strokes)
      write-through DIRECTLY: `var e = currentEffects; …; currentEffects = e` → slide.effects → mini-preview
      re-renders. Verified text edits (1166-1219), drawingStrokes computed setter (DrawingEditing:67-72),
      drawingData didSet (368) all write-through. No sync gap (text-not-synced hypothesis = FALSE).
- [x] drawingCount watch uses legacy drawingData?.count — redundant (modern strokes write-through), not a bug.
- [x] Leaf-view perf: StoryTrayView cells read ThemeManager.shared / PresenceManager.shared DIRECTLY
      (computed property, NOT @ObservedObject) → no per-event re-render. @ObservedObject viewModel only on
      the top-level tray. "Zero unnecessary re-render" principle respected. No bug.

## CONVERGENCE (2026-06-01)
After it.7→it.12 the core story create/view/publish subsystem is audited across composition (9:16),
language override, realtime translation, ThumbHash all-layers, publish path, cache coherence, sync
architecture, and leaf-view perf. Real bugs found+fixed: it.8 (override), it.9 (realtime translation
event-name + subscriber), it.10 (thumbHash bg-media + font). Other areas verified solid (no blind fixes).
Remaining work is on-device VISUAL/UX validation (best on the user's real account) + re-auditing any new
story-touching commits from parallel agents.

## Audit it.13 — drawing capture↔render alignment under scaling/zoom: SOLID (no bug)
- [x] StrokeCaptureLayer.projectionScale = (designW/bounds.w, designH/bounds.h); MeeshyStrokeCanvas render
      = context.scaleBy(size/designSize) — EXACT inverses → round-trip regardless of bounds aspect.
- [x] Capture bounds = canvasCore .frame(aspectFitSize) = 9:16; .scaleEffect/.offset (viewport zoom) apply
      AFTER the frame, so touches arrive in the 9:16 local space → shape + position preserved in the reader
      (StoryRenderer stretches design 1080×1920 → 9:16 renderSize uniformly). Verified in code, not claims.

## REPLENISHED backlog (next to consume)
- [ ] NEXT: genuine VISUAL SMOKE attempt — install latest (meeshy.sh run), re-login atabeth, navigate to a
      story, verify language strip + reader rendering. Accept fragility; bounded attempt per anti-rabbit-hole.
- [ ] RE-AUDIT trigger: new commit touching StoryViewModel / StoryComposer* / StoryViewer* /
      StorySlideRenderer / SocialSocketManager → re-run the relevant audit slice.
- [ ] (deferred, large + well-tested) repost flow, export flow, computedTotalDuration/keyframes.
- [ ] Reader language indicator: should the active override show a subtle "viewing in X" affordance + a
      one-tap revert to preferred? (Prisme discretion — currently silent revert on slide change only.)
- [ ] StorySlideRenderer.drawTextObject thumbHash font /390 → /designWidth (cosmetic, noted it.7).

## Audit it.14 — solid text background hides glyphs (REAL BUG, fixed 104ff0387)
Triggered by user report "Le texte effacé dans le fond noir ne rend pas le texte lisible".
Found via VISUAL SMOKE (composer → Texte → type → Fond=Noir → exit): committed canvas showed
an EMPTY BLACK BOX while the Texte list still listed the text. Root cause PROVEN (4 screenshots,
not claims): `StoryTextLayer.applyBackgroundStyle` posed the solid fill as a CALayer SUBLAYER with
zPosition=-1; Core Animation composites sublayers ABOVE the parent's own contents (the CATextLayer
glyphs) regardless of zPosition → the opaque fill occluded the glyphs. Inline editor (separate overlay
UIView) still painted glyphs on top → looked fine while editing, broke once committed. Thumbnail
composite (`StorySlideRenderer`) used `.backgroundColor` attribute (behind glyphs) → canvas diverged
from preview (the "incohérence").
- [x] Decisive control: a NO-bg committed text rendered VISIBLE (rules out the glyphsHidden hypothesis).
- [x] Fix: move solid fill to the layer's OWN backgroundColor + cornerRadius (painted before contents),
      reset on .none/.glass. 5 new tests (StoryTextLayerSolidBackgroundTests) + related suites green.
- [x] Visual verify post-fix: "Lisible" now renders white-on-black, readable; slide thumbnail too.
- [x] GLASS case PROVEN acceptable (not the same bug): glass backdrop is translucent (blur) so glyphs
      show through → readable. No risky glyph-on-top restructure needed. Hypothesis disproven by test.
- Lesson saved: [[feedback_calayer_sublayer_zposition_covers_contents]].

## REPLENISHED backlog (next to consume) — updated it.14
- [ ] NEXT: continue visual smoke on OTHER text controls now that the editor is reachable — verify
      Style (Aa cycle), Taille, Alignement, Contour (border) all render correctly on the committed canvas
      (same editor-vs-committed divergence class as the bg bug just fixed).
- [ ] Verify multi-line / long text + solid bg: backgroundColor now fills the full padded bounds — confirm
      wrapped text box still looks right (cornerRadius scales with bounds.height).
- [ ] RE-AUDIT trigger: new commit touching StoryTextLayer / StorySlideRenderer / StoryCanvas* → re-run.
- [ ] Reader language indicator affordance (deferred, Prisme discretion).
- [ ] (deferred, large + well-tested) repost flow, export flow, keyframes.
