# Audit Part 21 — Story Canvas, Renderer, Composer Controls & Story UI

Scope: 35 files from `packages/MeeshySDK/Sources/MeeshyUI/Story/` — the Story rendering pipeline (CALayer/Metal-backed canvas, AV export, renderer cache), the composer controls layer (FAB/band/tiles state machine), and Story-specific UI panels (drawing, fonts, stickers, audio).

This area is the **most architecturally significant and porting-risk-heavy** chunk in the audit: it is a custom UIKit/CoreAnimation/Metal rendering engine with a parallel AVFoundation export path, all sharing one `StoryRenderer`.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryBackdropCapture.swift

Purpose: Two-pass GPU snapshot helper for "glass" (frosted-blur) text backgrounds. Captures the slide-minus-glass-text layer tree into an `MTLTexture`, then serves cropped regions to each glass text layer so the blur doesn't double-blur the glyphs.

Public API:
- `protocol BackdropCapturing: AnyObject` (`@MainActor`) — `captureCanvasBackdrop(slide:geometry:time:mode:languages:) -> MTLTexture?`, `cropRegion(_:) -> MTLTexture?`, `invalidate()`.
- `final class StoryBackdropCapture: BackdropCapturing` — production impl, caches the full-canvas backdrop per render tick.

Key behaviors:
- Fast exit: scans `slide.effects.textObjects` for `.glass` resolved background style; if none, returns nil and the layer falls back to a `CAFilter` "gaussianBlur" path.
- `slideWithoutGlass(_:)` filters glass text out of a slide copy; renders that tree via `StoryRenderer.render(backdropProvider: nil)` into a `CARenderer`-backed `.shared`-storage `MTLTexture`.
- `cropRegion` clamps the requested rect to canvas extents (out-of-range blits crash Metal validation), blits a sub-region, blocks on `waitUntilCompleted()` so the consumer can CPU-read.
- Per-tick cache keyed on `renderSize`; `invalidate()` drops only per-frame texture, keeps long-lived Metal resources on `StoryRenderingContext.shared`.

Dependencies: `StoryRenderer`, `StoryRenderingContext`, `CanvasGeometry`, `StorySlide`, `RenderMode`, Metal/QuartzCore/CoreMedia.

Android-port note: Android has no `CARenderer`. The glass-text effect maps to: render the slide-minus-glass layer to an offscreen `Bitmap`/`RenderEffect` target (Hardware-accelerated `Canvas` or a `GraphicsLayer`), then apply `RenderEffect.createBlurEffect` (API 31+) to a cropped region. Compose's `Modifier.graphicsLayer { renderEffect = ... }` or `Modifier.blur()` covers the common case. Keep the two-pass concept (snapshot-without-glyphs → blur → composite) to avoid the double-text halo. Consider `RenderNode` for the offscreen capture.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryBlurFilter.swift

Purpose: Stateless Gaussian blur over Metal textures via `MPSImageGaussianBlur`.

Public API: `enum StoryBlurFilter` — `apply(sigma:to:output:)` (sync, blocks GPU), `encode(sigma:on:source:destination:)` (async, caller waits).

Key behaviors: Reuses the shared command queue (allocating one per call wasteful at 60–120fps). Out-of-place encode (caller owns both textures).

Android-port note: Maps to `RenderEffect.createBlurEffect` or RenderScript-replacement (`Toolkit.blur` from `renderscript-toolkit`, or a GPU shader via `AGSL` `RuntimeShader`). Sigma → blur radius conversion needed.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasRepresentable.swift

Purpose: SwiftUI `UIViewRepresentable` wrapper (`StoryComposerCanvasView`) bridging `StoryCanvasUIView` into the SwiftUI composer.

Public API: `struct StoryComposerCanvasView: UIViewRepresentable` — `@Binding slide`, callbacks `onItemTapped/onItemDoubleTapped/onItemDuplicated/onInlineTextChanged/onInlineTextEditEnded`, `editingTextId`.

Key behaviors:
- `updateUIView` refreshes closures every update, pushes outside-driven slide changes only when `slidesEqualForCanvas` is false.
- `slidesEqualForCanvas` compares **stable JSON fingerprints** (`JSONEncoder` with `.sortedKeys`) of two slides — any encoded field flip triggers a rebuild. `mediaData` is intentionally excluded from `CodingKeys` (ephemeral composer state). Encoding failure → "not equal" (fail-safe to latest state).
- Drives inline text edit begin/end based on `editingTextId` mismatch.

Android-port note: In Compose this is an `AndroidView` wrapping the custom canvas `View`, OR a fully native Compose `Canvas`/custom `Layout`. The JSON-fingerprint equality check is a smell — Compose's structural equality + `Stable`/`Immutable` annotations on the slide model handle this for free. Prefer modeling `StorySlide` as immutable Kotlin data classes so `==` is correct and cheap.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+InlineTextEdit.swift

Purpose: `UITextViewDelegate` extension on `StoryCanvasUIView` enabling in-place text editing — overlays a transparent `StoryInlineTextEditor` on the text layer, hides the layer's glyphs (keeps its background), opens the keyboard.

Public API: `beginInlineTextEdit(textId:)`, `endInlineTextEdit()`, `reapplyInlineEditingIfNeeded()` (internal), `textViewDidChange`, `textViewDidEndEditing`.

Key behaviors:
- `endInlineTextEdit` nils `inlineEditingTextId` BEFORE `resignFirstResponder()` to prevent a re-entrant `onInlineTextEditEnded`.
- `position(_:over:)` derives the editor's `center` from the layer's `position` corrected by `anchorPoint`, plus rotation extracted via `atan2(transform.m12, m11)`.
- During edits the `UITextView` is the source of truth for the string; rebuilds re-hide glyphs and re-sync style/geometry but never re-write text.

Android-port note: Maps to overlaying an `EditText`/Compose `BasicTextField` over the rendered text element. Keep the "renderer keeps drawing the background, editor only draws glyphs" split, or simpler: hide the canvas element entirely during edit and show a styled `TextField` matching font/color/alignment. The re-entrancy guard pattern is worth preserving.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift

Purpose: **The core UIKit canvas surface** (~1900 lines). Renders a `StorySlide` and switches between `.edit` (gestures, all items visible, 120Hz ProMotion) and `.play` (timing-driven 60Hz playback). Delegates item layout to `StoryRenderer`.

Public API:
- `final class StoryCanvasUIView: UIView`.
- `var slide: StorySlide { didSet }`, `mode: RenderMode`, `currentTime: CMTime`.
- `enum CanvasItemKind { text, media, sticker }`.
- Callbacks: `onItemModified`, `onItemTapped`, `onItemDoubleTapped`, `onItemDuplicated`, `onContentReady (@MainActor)`, `onInlineTextChanged`, `onInlineTextEditEnded`.
- `setDrawingMode(_:tool:)`, `setReaderContext(_:)`, `setMode(_:time:)`, `simulateTickAt(seconds:)`, `_forceContentReadyForTesting()`, `_captureFilterSourceForTesting(renderSize:)`.
- `geometry: CanvasGeometry`, `currentDrawingData: Data?`, `isDrawingMode`, `isAudioMuted`.

Layer hierarchy: `view.layer → rootLayer → [backgroundLayer(z0), itemsContainer, editOverlayLayer(z10000)]`; optional `filteredLayer` and `StoryFilteredLayer`.

Key behaviors / algorithms worth preserving:
- **Gesture-aware rebuild skipping**: `slide.didSet` skips full `rebuildLayers()` while `manipulatedItemId != nil` (active pan/pinch/rotate) — instead `updateManipulatedItemLayer()` mutates only the one CALayer transform. Full rebuild fires on gesture end. Critical perf technique.
- **Revision token cache**: `slideContentRevision` (UInt64, `&+= 1`) gates filter-source-texture re-capture (`lastCapturedRevision`) and audio reconfigure (`lastAudioConfigRevision`) — in `.play` the slide model doesn't mutate per tick (only `currentTime`), so expensive captures happen once per slide.
- **Two display links**: `displayLink` (60Hz play, range 60–120) advances `currentTime`, fires `readerContext.onCompletion` once at `effectiveSlideDuration`; `editDisplayLink` (120Hz, no-op tick) just keeps the ProMotion clock alive while editing.
- **Content readiness**: `scheduleContentReadyEvaluation` fires `onContentReady` once per rebuild — immediate for solid/gradient, KVO on `contentLayer.contents` for images (distinguishes ThumbHash placeholder from real bitmap via `ObjectIdentifier`), KVO on `AVPlayerItem.status` for video. Drives `StoryReaderTimerController`.
- **Filter pipeline**: `updateFilterLayer` captures the slide content into an `MTLTexture` via a transient `CARenderer` (`captureFilterSourceTexture` — builds a *fresh* layer tree, never re-targets the live `rootLayer`), feeds `StoryFilteredLayer` Metal compute kernel.
- **Snap guides**: `snapTargets [0.18,0.25,0.5,0.75,0.82]`, tolerance 0.02; dashed `CAShapeLayer` guides.
- **Gestures**: pan (exclusive), pinch+rotation (simultaneous), single-tap (requires double-tap to fail), double-tap; `UIContextMenuInteraction` (Modifier/Dupliquer/bring-forward/send-back/Supprimer with custom transparent-border `UITargetedPreview`), `UIPointerInteraction` (iPad). Scale clamp 0.3–4.0.
- **z-order**: `bringForegroundToFront` reorders arrays on touch; `bringForward/sendBackward` swap `zIndex`; `nextTopZ/nextBottomZ`.
- **Accessibility**: synthesizes `UIAccessibilityElement`s per item, `.play` uses `resolvedText(preferredLanguages:)` (Prisme Linguistique), custom actions delete/duplicate/send-to-back.
- **Audio**: owns a `ReaderAudioMixer`; `reconfigureAudioForPlayback` bridges `postMediaId → URL` resolver; mute via notifications `storyComposerMuteCanvas/Unmute`.
- App lifecycle: pauses/resumes AVPlayers and background layer on resign/become-active.
- `deinit` defers `audioMixer.shutdown()` to MainActor.

Dependencies: `StoryRenderer`, `StoryBackdropCapture`, `StoryBackgroundLayer`, `StoryFilteredLayer`, `StoryMediaLayer`, `StoryTextLayer`, `ReaderAudioMixer`, `StoryReaderContext`, `CanvasGeometry`, PencilKit, Metal, AVFoundation.

Android-port note: This is the single biggest port. Map to a custom `View` with hardware-accelerated `Canvas` + `RenderNode` per item, OR a native Compose `Layout` with per-item `graphicsLayer`. The two-display-link model maps to `Choreographer` frame callbacks (play) — Android has no ProMotion-toggle API, just use frame callbacks. KVO-based content readiness maps to `ImageRequest` listeners (Coil) + `MediaPlayer`/`ExoPlayer` state listeners. The Metal filter capture maps to `RenderEffect`/AGSL `RuntimeShader`. The gesture-aware partial-update optimization is essential — replicate it (don't rebuild the whole scene per pointer move). PencilKit drawing → Android has no equivalent; build a custom stroke-capture `View` (path-based) or use a third-party ink lib.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExporter.swift

Purpose: Exports a single `StorySlide` to an MP4 via `AVMutableComposition` + a custom `StoryAVCompositor`, reusing the same `StoryRenderer.render()` as the live canvas.

Public API:
- `enum StoryExporterError` (noBackgroundVideo, invalidMediaURL, sessionCreationFailed, exportFailed, exportCancelled, syntheticAssetGenerationFailed, …).
- `enum StoryExporter` — `static export(_:to:languages:progress:) async throws`.

Key behaviors:
- Background-video selection priority: looped bg video repeated to cover `effectiveSlideDuration()`; non-looped bg video played once + transparent-tail padding; otherwise synthesizes a 1-sec transparent BGRA `.mov` substrate (cached in `CacheCoordinator.video` keyed by render size) looped to cover duration.
- Master composition: 60fps, render size `1080×1920` (`CanvasGeometry.designSize`), `customVideoCompositorClass = StoryAVCompositor`.
- Progress polled at 10Hz against `AVAssetExportSession.progress`; terminal `1.0` emitted explicitly.
- Synthetic `.mov` generated off-main via `Task.detached` (AVAssetWriter is sync-blocking). H.264 discards alpha — fine, compositor overwrites every pixel.
- MUST NOT be called synchronously from MainActor (compositor bridges back to main per frame → deadlock).

Dependencies: `StoryAVCompositor`, `StoryCompositionInstruction`, `CacheCoordinator`, `CanvasGeometry`, AVFoundation.

Android-port note: Maps to `MediaCodec` + `MediaMuxer`, or the higher-level `Media3 Transformer` (`androidx.media3.transformer`) with a custom `VideoFrameProcessor`/`GlEffect` that draws story overlays per frame. The synthetic-transparent-substrate trick is unnecessary on Android if using `Transformer` with a generated frame source — but the concept (need a video track substrate to drive a frame processor) still applies. Keep the "same renderer for live + export" principle. Progress → `Transformer.Listener` / `ProgressHolder`.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryInlineTextEditor.swift

Purpose: Transparent `UITextView` styled like a `StoryTextObject`, overlaid on the text layer during in-place editing. Renders only the editable glyphs (the layer below paints the real solid/glass background).

Public API: `final class StoryInlineTextEditor: UITextView` — `apply(textObject:geometry:setText:)`, `updatePlaceholderVisibility()`, `isPlaceholderHidden`.

Key behaviors:
- `apply` resolves the font via `StoryTextFontResolver`, applies color/alignment, and sets glyph **stroke** via `.strokeColor`/`.strokeWidth` attributes (negative width = fill+stroke), as `typingAttributes` AND on existing `textStorage` for live re-render.
- Localized placeholder ("Saisissez votre texte…"), 6/8-digit hex color parsing.

Android-port note: Maps to a styled Compose `BasicTextField` or `EditText` with a custom `Span`/`Paint` for stroked text (Android stroke text needs drawing the text twice: `Paint.Style.STROKE` then `FILL`, or `Paint.style` toggle in a custom `Drawable`). Placeholder → `placeholder` slot in `TextField`.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryMediaDecoder.swift

Purpose: HW-accelerated media decode utilities — first-frame extraction from video.

Public API: `enum StoryMediaDecoder` — `firstFrame(of:maxDimension:) async throws -> UIImage?`, `firstFrameTexture(of:maxDimension:) async throws -> MTLTexture?`. `enum DecodeError`.

Key behaviors: `AVAssetImageGenerator` (VideoToolbox HW decode), `appliesPreferredTrackTransform`, zero time tolerance, optional `maximumSize` cap for 4K memory budget. Texture path skips the `UIImage` round-trip via `MTKTextureLoader`. Target <100ms on iPhone SE 3.

Android-port note: `MediaMetadataRetriever.getFrameAtTime()` / `getScaledFrameAtTime()` for first frame; `ExoPlayer`/`MediaCodec` for HW decode. Texture path → decode to a `Bitmap`, upload to a GL texture or use directly in Compose.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderContext.swift

Purpose: Runtime parameter bundle for `.play` reader playback.

Public API:
- `struct StoryReaderContext: Sendable` — `preferredLanguages`, `mute`, `onCompletion`, `postMediaURLResolver: (String) -> URL?`, `imageCache: ImageCacheReader?`; `.empty` static.
- `protocol ImageCacheReader: Sendable` — `cachedImage(for:) async -> UIImage?` (conformed by `CacheCoordinator.images`).

Android-port note: A plain Kotlin `data class` holding the language chain, mute flag, completion lambda, a `(String) -> Uri?` resolver, and an image-cache interface (Coil `ImageLoader` wrapper). Trivial port.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderPrefetcher.swift

Purpose: Pre-bootstraps `StoryCanvasUIView` instances for adjacent slides `[N-1, N, N+1]` so the next/prev slide's first frame is instant — no decode/Metal cold start/AVPlayer init on transition.

Public API: `final class StoryReaderPrefetcher` — `hostView`, `attach(to:)`, `detach()`, `view(for:) -> StoryCanvasUIView?`, `updateWindow(items:currentIndex:context:preferredLanguages:)`, `windowIndices(around:count:)`.

Key behaviors:
- Sliding window of ≤3 canvas views, keyed by `StoryItem.id`. Evicts everything outside the window **before** allocating new (memory pressure on low-RAM devices).
- Off-screen `hostView` at 1×1 frame (not `.zero` — `rebuildLayers` short-circuits on empty bounds), `alpha = 0`, inserted behind visible content so children get a real `layoutSubviews` + decode cycle.

Android-port note: Maps to a `ViewPager2` with `offscreenPageLimit = 1` (which already prefetches ±1), or a Compose `HorizontalPager` with `beyondViewportPageCount`. The explicit prefetcher is largely unnecessary if using Pager — but the "evict-before-allocate" memory discipline and pre-warming media decoders (Coil prefetch, ExoPlayer pre-buffer) is worth keeping for the ±1 neighbors.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift

Purpose: SwiftUI drop-in (`StoryReaderRepresentable`) wrapping `StoryCanvasUIView` in `.play` mode. Three inits: from `StoryItem`, `RepostContent`, `APIPost`.

Public API: `struct StoryReaderRepresentable: UIViewRepresentable` — `init(story:…)`, `init(repost:…)`, `init(post:…)`. Plus `struct PreloadedImageCacheReader: ImageCacheReader`.

Key behaviors:
- Language chain resolution: `preferredContentLanguages ?? preferredLanguages`, falling back to `[preferredLanguage]`.
- Composer "Preview" path: `preloadedImages` (in-memory `UIImage`, non-Sendable) are persisted ONCE to temp `file://` PNGs in `makeUIView` so the resolver/cache closures can capture `Sendable` URLs.
- Resolver priority: preloaded local assets → published `StoryItem.media` remote URLs.
- `APIPost` init converts `APIPostMedia → FeedMedia`, derives a thumbnail color from MIME type.

Android-port note: Becomes a Compose `@Composable StoryReader(...)` with overloaded entry points. The Sendable/persist-to-temp-file dance is a Swift-6-concurrency artifact — Kotlin doesn't need it; pass `Bitmap`s or `Uri`s directly. Keep the resolver-priority logic (local preview assets > remote URLs).

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderResolvers.swift

Purpose: Pure resolvers for timeline transition opacity and keyframe interpolation, shared by reader + compositor.

Public API:
- `enum ReaderTransitionResolver` — `opacity(for media:transitions:currentTime:) -> Float`.
- `enum ReaderKeyframeResolver` — `resolvedPosition`, `resolvedScale`, `resolvedOpacity` (all `nonisolated`).

Key behaviors:
- Transition resolver clips to the media's `[startTime, startTime+duration]` window (returns 0 outside), multiplies matching crossfade factors, delegates curve math to `StoryRenderer.clipTransitionOpacity`.
- Keyframe resolvers delegate per-channel interpolation to `KeyframeInterpolator`, treat keyframe `.time` as offset relative to `media.startTime`.

Android-port note: Pure Kotlin functions/objects — direct 1:1 port. Crossfade and keyframe interpolation are math-only. Reuse the same `KeyframeInterpolator` port everywhere (live + export) per the single-source-of-truth principle.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderTimerController.swift

Purpose: Drives the reader's per-slide auto-advance countdown, **gated** on the canvas content-readiness signal.

Public API:
- `protocol StoryReaderTimerControlling: AnyObject` (`@MainActor`) — `isActive`, `progress`, `currentSlideId`, `setCurrentSlide(id:duration:)`, `markContentReady(slideId:)`, `reset()`, `_advanceClockForTesting(by:)`.
- `final class StoryReaderTimerController: NSObject` — `onProgressChange`, `onCompletion`.

Key behaviors:
- Per-slide lifecycle: `setCurrentSlide` → `pending` (progress held at 0); `markContentReady` → `active` only if `slideId == currentSlideId` (readiness from off-screen prefetch N±1 is ignored); progress reaches 1.0 → `onCompletion` once.
- `CADisplayLink` (30–60Hz) created lazily; `useDisplayLink: false` in tests with `_advanceClockForTesting`.
- `displayLink` is `nonisolated(unsafe)` so the `nonisolated deinit` can invalidate it.

Android-port note: Maps to a `Choreographer`-driven or coroutine-based timer (`flow { … }` emitting progress, or a `CountDownTimer`). The **content-gating** (don't start countdown until the slide's media is loaded, ignore readiness signals for non-current slides) is the key behavior to preserve — replicate with an explicit state machine (`Pending → Active → Complete`).

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift

Purpose: **Single source of rendering** for the Story canvas — used by `StoryCanvasUIView` (live), `StoryAVCompositor` (export), and snapshot tests. Builds a fresh `CALayer` tree per call.

Public API:
- `enum RenderMode { edit, play }` (+ nonisolated `Equatable`).
- `protocol RenderableItem` — `id, x, y, scale, rotation, zIndex, anchor, startTime?, duration?, fadeIn?, fadeOut?`; `isStatic` computed. Conformed by `StoryTextObject`, `StoryMediaObject`, `StorySticker`.
- `enum StoryRenderer` — `typealias BackdropProvider = (CGRect) -> MTLTexture?`; `render(slide:into:at:mode:languages:cache:backdropProvider:contentsScale:) -> CALayer`; `renderBackground(slide:languages:) -> StoryBackgroundLayer.Kind`; `applyOpening(_:rootLayer:elapsed:)`; `clipTransitionOpacity(...)`; `applyKeyframes(...)`; `fadeOpacity(item:at:)`; `struct KeyframeOverrides`.

Key behaviors / algorithms worth preserving:
- `collectItems` gathers text + foreground media (filters `isBackground` — background media is drawn by `StoryBackgroundLayer`, NOT as a centered item — fixes a "image-in-center-of-black" double-render bug) + stickers, sorted by `zIndex`.
- `shouldRender` (`.play` only) — sharp timing-window visibility gate (Reduce-Motion safe; fades are snapshot opacity not CAAnimation).
- `renderItem` builds `StoryMediaLayer`/`StoryTextLayer`/`StoryStickerLayer`; applies fade envelope then keyframe overrides (keyframes win over fade).
- **Prisme Linguistique**: `.play` uses `text.resolvedText(preferredLanguages:)`; `.edit` always shows raw source text (author edits the original).
- `renderBackground` priority: bg video object → bg image object → `slide.mediaURL` → `effects.background` hex → `.solidColor(.black)`. Routes via `postMediaId` or falls back to `mediaURL` (file://) for composer-local media.
- Persisted PencilKit drawing rendered as a single overlay layer at `zPosition 9999`, authored on the 1080×1920 design canvas.
- `applyOpening`: `.reveal` (animated circular `CAShapeLayer` mask), `.fade` (opacity `CABasicAnimation`); `.zoom/.slide` reserved no-op.
- `contentsScale` — live keeps device scale, export MUST pass `1.0` (avoid 3× upsampling).

Dependencies: `StoryBackgroundLayer`, `StoryMediaLayer`, `StoryTextLayer`, `StoryStickerLayer`, `StoryFilteredLayer`, `StoryRendererCache`, `KeyframeInterpolator`, `CanvasGeometry`, PencilKit, Metal.

Android-port note: This is the architectural keystone — build ONE Kotlin renderer (`StoryRenderer` object) consumed by both live (custom `View`/Compose `Canvas`) and export (`Media3` `GlEffect`/frame processor). Render items into per-item `RenderNode`s or draw directly to a `Canvas`. The design-space (1080×1920) → render-space projection (`CanvasGeometry`) is critical — keep it as a pure utility. zIndex sort, timing-window gate, Prisme language resolution split (edit=source / play=resolved), background priority chain — all port 1:1.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRendererCache.swift

Purpose: Per-export `CALayer` reuse cache for `StoryRenderer.render` — avoids rebuilding the full layer tree for every one of ~720 export frames.

Public API:
- `final class StoryRendererCache: @unchecked Sendable` — `layer(for:at:languages:build:) -> CALayer`, `invalidate()`, `invalidateIfNeeded(slideId:languages:mode:) -> Bool`, `cacheHitCount`, `cacheMissCount`.
- `struct ItemSignature: Hashable, Sendable` — id + interpolated position/scale/rotation/opacity/visible + languages.

Key behaviors:
- Keys layers by `ItemSignature`; identical signature → returns the same `CALayer` instance unchanged.
- **Design limitation (documented)**: signature captures only spatial/opacity/visibility/languages — NOT text content/font/style/emoji. Safe ONLY for the compositor's frozen per-export slide. Live composer MUST pass `cache: nil`.
- `invalidateIfNeeded` flushes when slide id / languages / mode change (no-op after frame 1 of a session).

Android-port note: For a `Media3 Transformer` export pipeline, an analogous frame-to-frame `RenderNode`/draw-command cache keyed by an interpolated item signature. The "static items don't change → reuse" optimization matters for export throughput. Keep the explicit "live path must not share the export cache" rule.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderingContext.swift

Purpose: Shared singleton holding one Metal device + Display-P3 working `CIContext` so every canvas surface (composer, viewer, AV compositor) renders bit-exact.

Public API: `final class StoryRenderingContext: @unchecked Sendable` — `.shared`; `metalDevice`, `commandQueue`, `ciContext`, `workingColorSpace` (Display P3), `outputColorSpace` (sRGB). `fatalError` if Metal unavailable.

Android-port note: An equivalent shared `EGLContext`/GL context or a shared `RenderEffect` setup. Color management: Display-P3 working space → sRGB output maps to Android's `ColorSpace.Named.DISPLAY_P3` / `SRGB` and wide-gamut `Bitmap.Config.RGBA_F16`. A process-wide singleton holding the GPU context is the right pattern.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryStickerRasterizer.swift

Purpose: Caches rasterized emoji glyphs (`emoji|sizePx → CGImage`) so a sticker draws through Core Text at most once per (emoji, integer size) pair.

Public API: `final class StoryStickerRasterizer: @unchecked Sendable` — `.shared`; `cgImage(for emoji:size:) -> CGImage?`; `clear()`; `defaultCountLimit = 100`.

Key behaviors: `NSCache<NSString, CGImage>` (LRU eviction, thread-safe), `countLimit` default 100; subscribes to `didReceiveMemoryWarningNotification` and flushes all glyphs (deterministic, testable).

Android-port note: `LruCache<String, Bitmap>` keyed by `"$emoji|$sizePx"`; rasterize emoji by drawing into a `Bitmap`-backed `Canvas` with `Paint.setTextSize`. Hook `ComponentCallbacks2.onTrimMemory` to clear. Straightforward.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryTextFontResolver.swift

Purpose: Single source of `UIFont` resolution for canvas rendering of a `StoryTextObject` (UIKit side; shared by `StoryTextLayer` + `StoryInlineTextEditor`).

Public API: `enum StoryTextFontResolver` — `resolveFont(forTextObject:size:) -> UIFont`.

Key behaviors: Custom `fontFamily` wins; otherwise mapped from `parsedTextStyle`: bold=`.black`, neon=semibold+rounded, typewriter=monospaced, handwriting=custom-name-or-serif, classic=medium+serif.

Android-port note: Returns a `Typeface` from a `StoryTextStyle`. bold→`Typeface.create(DEFAULT, BOLD)` (weight 900 via `Typeface.create(family, 900, false)` API 28+), monospaced→`Typeface.MONOSPACE`, rounded/serif→bundled font resources (Android has no built-in "rounded"/"serif design" — ship font files). Custom fonts via `res/font` or `Typeface.createFromAsset`.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/BandStateMachine.swift

Purpose: Pure value-type state machine for the composer's bottom "band" (toolbar drawer).

Public API:
- `enum BandCategory { contenu, effets }` (+ `.swapped`).
- `enum BandElementKind { text, media }`.
- `enum BandState { hidden, tiles(BandCategory), toolPanel(StoryToolMode), formatPanel(BandElementKind, elementId:) }` (+ `activeCategory`).
- `extension StoryToolMode { var bandCategory }`.
- `struct BandStateMachine: Equatable, Sendable` — `tapFAB`, `swipeUpOnFAB`, `swipeDownOnBand`, `swipeHorizontalOnBand`, `openFormatPanel`, `tapTile`, `closeFormatPanel`, `backFromToolPanel`, `reset`.

Key behaviors: `formatPanel` takes precedence over FAB/tile interactions. `closeFormatPanel` restores `lastCategoryBeforeFormat`. Horizontal swipe only valid in `.tiles` (swaps category). Transitions fully enumerated and pure.

Android-port note: 1:1 port to a Kotlin `sealed interface BandState` + a state-holder class or a reducer feeding a `MutableStateFlow<BandState>`. Pure logic — ideal candidate for shared unit-tested code. Excellent design; carry it over verbatim.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerBottomBand.swift

Purpose: The bottom band SwiftUI view — renders content per `BandState` (tiles grid / tool panel / text format panel), with a drag handle and animated slide transitions.

Public API: `struct ComposerBottomBand: View` (internal) — `state`, `@Bindable viewModel`, bindings (drawingCanvas/Tool, selectedFilter, fgMediaItem, picker flags), callbacks (`onTapTile`, `onBack…`, `onCloseFormatPanel`, `onEditMedia/Text`, `onDeleteText`, `onShowInTimeline`).

Key behaviors:
- `stateKey` string drives `.id()` so SwiftUI animates panel swaps; spring animation.
- `textObjectBinding(for:)` derives a `Binding<StoryTextObject>` on the fly from `viewModel.currentEffects.textObjects` (getter find-by-id, setter replace-in-array).
- `.formatPanel(.media,...)` is now `EmptyView` — media editing moved to a full-screen image editor. Theme-adaptive opaque tint (indigo950@92% dark / white@92% light) under the material.

Android-port note: Compose `Column` switching content on `BandState` with `AnimatedContent`. The "derive a binding from an array element by id" pattern → in Compose, pass the element + an `onChange` lambda, or use an indexed `MutableState`. Carry the theme-aware opaque-tint-under-blur lesson.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerControlsLayer.swift

Purpose: Top-level composer controls overlay — composes `ComposerFABColumn` + `ComposerBottomBand`, owns the `BandStateMachine` binding and FAB visibility.

Public API: `struct ComposerControlsLayer: View` (public) — `init(viewModel:bandStateMachine:areFabsVisible:drawing…:selectedFilter:fgMediaItem:showAudioDocumentPicker:showVoiceRecorderSheet:onOpenMediaCrop:)`.

Key behaviors:
- FABs visible only when `band == .hidden`. Swipe-down on band dismisses → restores FABs.
- Routes tile taps: `.timeline` → `viewModel.isTimelineVisible = true`; others → `bandStateMachine.tapTile` + `viewModel.selectTool`.
- `DragGesture` on the band: swipe-down → `swipeDownOnBand`; swipe-horizontal → `swipeHorizontalOnBand`.
- On `currentSlideIndex` change → `bandStateMachine.reset()` (format panel ids belong to the previous slide).
- `contenuBadge`/`effetsBadge` count active elements.

Android-port note: Compose overlay `Box`/`Column` aligned bottom. Drag gestures via `Modifier.draggable`/`pointerInput`. The slide-change → reset-state-machine guard is important. Badges = simple derived counts.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerFABColumn.swift

Purpose: Two floating action buttons (Contenu + Effets) pinned bottom-leading, with swipe ↑/↓ detection.

Public API: `struct ComposerFABColumn: View, Equatable` — primitive inputs (`contenuBadge`, `effetsBadge`, `activeCategory`, 5 callbacks). `struct FABPanGestureWrapper<Content>: UIViewRepresentable`, `final class FABPanGestureCoordinator`.

Key behaviors:
- `Equatable` on primitives → SwiftUI skips re-eval (perf).
- Swipe detection via a `UIPanGestureRecognizer`-wrapping `UIViewRepresentable` (≥20pt vertical-dominant translation → up/down).
- **Tech-debt note in comments**: the coordinator is deliberately non-nested/non-generic to avoid a swift-frontend `SIGSEGV` in the optimizer — a compiler-workaround artifact, NOT to be carried over.
- Badge overlay capsule, brand-gradient fill when active.

Android-port note: Two `FloatingActionButton`s in a `Column`. Swipe up/down via `Modifier.pointerInput`/`draggable` directly — no `UIViewRepresentable` wrapper needed (the whole wrapper exists only for the iOS gesture bridge). The Swift compiler workaround is irrelevant. Badges → `BadgedBox`.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerTilesGrid.swift

Purpose: Horizontal grid of tool tiles inside the band's `.tiles` state — 4 tiles for `contenu` (Médias/Dessin/Texte/Fond), 2 for `effets` (Effets/Timeline).

Public API: `struct ComposerTilesGrid: View, Equatable` — `category`, count inputs, `onTapTile`.

Key behaviors: Per-tile icon/title/accent color + element-count badge; haptic on tap; `Equatable` on primitives for render-skip.

Android-port note: Compose `Row` of tile `Card`s; tap → `onTapTile(StoryToolMode)`. Badges via `BadgedBox`. Trivial.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerToolPanelHost.swift

Purpose: Hosts the tool-specific panel body inside the band's `.toolPanel` state — Médias / Dessin / Texte / Fond / Effets panels.

Public API: `struct ComposerToolPanelHost: View` (internal) — `tool`, `@Bindable viewModel`, bindings + callbacks.

Key behaviors:
- Per-tool `panelHeight` and body: media panel (PhotosPicker add, audio file/record buttons, drag-to-reorder list via `.draggable`/`.dropDestination` — no hamburger, native long-press), drawing panel (`DrawingToolbarPanel`), text panel (add + list of texts with edit/duplicate/timeline/delete actions), texture panel (horizontal `StoryBackgroundPalette` color swatches), filters panel (`StoryFilterGridView`).
- WCAG-AA-tuned adaptive text colors (primary ≥4.5:1, secondary ≈4.5:1, muted ≈3:1).
- Media reorder maps drop index correctly relative to drag direction.

Android-port note: Compose `Column`/`LazyColumn` per tool. Drag-to-reorder → `LazyColumn` + `Modifier.draggable` or the `reorderable` lib / `LazyListState` reorder. Photo picker → `ActivityResultContracts.PickVisualMedia`. Color swatches → `LazyRow`. Carry the WCAG contrast tuning.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/StoryComposerObject+Duplicate.swift

Purpose: `duplicated(withNewId:offsetBy:)` extensions on `StoryTextObject`/`StoryMediaObject`/`StorySticker` — clone with new id, offset position by a design-space delta.

Key behaviors: Position offset normalized by `1080`/`1920` design dimensions.

Android-port note: Kotlin extension functions on the data classes — `fun StoryTextObject.duplicated(newId, delta) = copy(id = newId, x = x + delta.x/1080.0, y = y + delta.y/1920.0)`. Trivial.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/DrawingOverlayView.swift

Purpose: PencilKit drawing surface + toolbar for the composer.

Public API:
- `struct DrawingOverlayView: View` (PencilKit canvas only).
- `struct DrawingToolbarPanel: View` (width slider, color palette, tool buttons, undo/redo/clear).
- `enum DrawingTool { pen, marker, eraser }` (+ icon/label).
- `enum DrawingColorOption` — 9-color `palette`.
- `struct PencilKitCanvas: UIViewRepresentable` (+ `Coordinator: PKCanvasViewDelegate`).

Key behaviors:
- `PencilKitCanvas` syncs `drawingData` ↔ `PKDrawing`; `isUpdatingFromDelegate` flag prevents echo loops; tool mapped per `DrawingTool` (marker = 2× width, eraser = bitmap 3× width).
- Drawing data persisted as `PKDrawing.dataRepresentation()`.

Android-port note: **No PencilKit equivalent.** Build a custom stroke-capture `View`/Compose `Canvas` that records `Path` strokes (pressure-sensitive via `MotionEvent` for stylus). Serialize strokes to a custom format (list of points + color + width + tool) instead of `PKDrawing` opaque blob — important: the `drawingData` blob is iOS-proprietary, so the **stored format must change** for cross-platform stories. Marker = lower-alpha wide stroke, eraser = `PorterDuff.CLEAR` or path subtraction. Undo/redo = a stroke stack.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/FontStylePicker.swift

Purpose: Horizontal picker of text styles ("Aa" previews) + a SwiftUI `Font` resolution helper.

Public API: `struct FontStylePicker: View` — `@Binding selectedStyle: StoryTextStyle`. `func storyFont(for:size:) -> Font` (global, SwiftUI side, parallel to UIKit `StoryTextFontResolver`).

Key behaviors: `StoryTextStyle.allCases` swatches; spring animation on selection; bold/neon/typewriter/handwriting/classic → SwiftUI `Font` variants.

Android-port note: Compose `LazyRow` of style chips; `storyFont` → returns a Compose `FontFamily`/`Typeface`. Note the duplication (SwiftUI `Font` vs UIKit `UIFont`) — on Android unify into one `Typeface` resolver used by both the canvas and the picker preview.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/MediaPlacementSheet.swift

Purpose: Legacy media-placement enum + an audio-source selection sheet.

Public API:
- `enum MediaPlacement { background, foreground }` (kept for DB back-compat).
- `enum AudioSource { library, record }`.
- `struct AudioSourceSheet: View` — `onSelect: (AudioSource) -> Void`.

Key behaviors: Two-button sheet (Bibliothèque / Enregistrer), `presentationDetents([.height(180)])`.

Android-port note: `AudioSource` enum + a `ModalBottomSheet` with two buttons. `MediaPlacement` is a back-compat enum — keep the string raw values for DB parity.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/ReaderAudioMixer.swift

Purpose: **Sample-accurate** foreground+background audio mixer for the story reader, replacing per-clip `AVPlayer` (which had 30–100ms startup latency + 50ms timer jitter).

Public API: `final class ReaderAudioMixer` (`@MainActor`) — `configure(audios:urls:)`, `configureBackground(audio:url:looping:)`, `play()`, `pause()`, `stop()`, `setVolume(_:for:)`, `setMute(_:)`, `shutdown()`, `fadeOutAndStop(duration:)`, `duckingEnabled`, `duckedBackgroundVolume`, `activeClipCount`, `backgroundClipCount`, `isMuted`, `isPlaying`.

Key behaviors / algorithms worth preserving:
- One persistent `AVAudioEngine`; each clip is an `AVAudioPlayerNode` scheduled at a precise **host time** (`mach_absolute_time` + `clip.startTime`) so playback fires on the exact sample regardless of display-link tick boundaries.
- `hostTime(forDelaySeconds:)` delegates to a hardened `AudioMixer` helper (Double-based, overflow-clamped — the old local impl overflowed on non-Apple-Silicon timebases for delays >9.22s).
- Loop = re-schedule the file on completion (gapless).
- Fades: fade-in/fade-out volume ramps scheduled via `Timer` + a 30fps `Task.sleep` ramp loop (sample-accurate automation deemed overkill for 0.1–0.5s fades).
- Ducking: bg volume drops when fg clips play; `fadeOutAndStop` 50Hz global ramp.
- `shutdown()` must be called before drop (deinit warns otherwise) — deterministic engine teardown.

Dependencies: `AVAudioEngine`, `StoryAudioPlayerObject`, `AudioMixer` (shared helper).

Android-port note: Maps to `ExoPlayer` with multiple sources / `AudioTrack` for sample-accurate scheduling, or `SoundPool` (too limited) — best is `AudioTrack` with `play()` at a computed frame position, or `MediaCodec`+`AudioTrack`. `mach_absolute_time` → `System.nanoTime()` / `AudioTimestamp`. The "schedule each clip at host-time = origin + startTime" model is essential for sync — Android's `AudioTrack.write` + presentation timestamps, or `ExoPlayer`'s `MediaSource` with clip offsets. Volume ramps via `AudioTrack.setVolume` on a coroutine ticker. Keep the explicit `shutdown()` lifecycle.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/SlideMiniPreview.swift

Purpose: Mini composite thumbnail of a slide at t=0 — renders background/drawing/foreground media/text/stickers preserving normalized position/scale/rotation.

Public API: `struct SlideMiniPreview: View` (internal) — `effects`, `bgImage`, `drawingData`, `loadedImages`, `index`.

Key behaviors:
- `GeometryReader` + `ZStack` layering; background color → bg image → bg media object (`effects.resolvedBackgroundMedia`); drawing rendered from `PKDrawing.image`; foreground media at `size.width * 0.35` base; text font scaled `fontSize * width/393`; stickers as emoji `Text`.
- Index badge bottom-right; bg-color dot when a bg image is present.

Android-port note: A small Compose `Canvas`/`Box` reusing the SAME renderer abstraction as the full canvas (ideally `StoryRenderer` rendering to a small `Bitmap`) rather than a separate hand-rolled layout — this file IS a duplication of render logic and is a maintenance hazard. On Android, render the slide once to a thumbnail `Bitmap` via the shared renderer.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/StickerPickerView.swift

Purpose: Emoji sticker picker — category tabs + searchable grid.

Public API: `struct StickerPickerView: View` — `onStickerSelected: (String) -> Void`. `enum StickerCategory { smileys, animals, food, activities, travel, objects, symbols, flags }` (+ icon + ~14–21 emojis each).

Key behaviors: `LazyVGrid` 7-column; search filters across all categories by unicode scalar name match (weak heuristic).

Android-port note: Compose `LazyVerticalGrid`; categories as `LazyRow` tabs. Emoji search on Android — use `androidx.emoji2` metadata for proper name-based search. The hardcoded emoji lists port directly.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/StoryAudioPanel.swift

Purpose: Audio selection panel — library (server-fetched, searchable, previewable) + record tab.

Public API: `struct StoryAudioPanel: View` — `@Binding selectedAudioId/Title/audioVolume`, `onRecordingReady: (URL) -> Void`. Private `AudioItem: Decodable`, `enum AudioPanelTab`.

Key behaviors:
- Fetches `GET /stories/audio` (optional `?q=` search) via `APIClient.shared`.
- Preview playback via `AudioPlayerManager`; preview posts `storyComposerMuteCanvas`/`Unmute` notifications to mute the composer canvas while previewing.
- Record tab embeds `StoryVoiceRecorder`. Volume slider, "no audio" row.
- `AudioItem` decodes a nested `uploader.username` object.

Android-port note: Compose panel; library list via Retrofit `GET /stories/audio`; preview via `ExoPlayer`/`MediaPlayer`; mute the canvas via a shared event bus / `StateFlow` instead of `NotificationCenter`. Recording → `MediaRecorder`. The endpoint + `AudioItem` shape port directly.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/StoryAudioPlayerView.swift

Purpose: On-canvas audio player widget (waveform + play/mute button) — works in composer (editing) and reader (viewer) modes.

Public API: `struct StoryAudioPlayerView: View` — `@Binding audioObject: StoryAudioPlayerObject`, `url`, `isEditing`, `externalPlayer: AVPlayer?`, `parentManagesPlayback: Bool`, `onDragEnd`.

Key behaviors:
- **Double-playback prevention**: when `externalPlayer` (owned by `ReaderState`) is provided, this view never creates its own `AVPlayer` — only renders UI + observes progress. `parentManagesPlayback` suppresses the internal autoplay fallback even when `externalPlayer` is momentarily nil at first `onAppear` (parent hasn't reached the clip's startTime yet) — fixes audible echo/phasing.
- Late-arriving external player handled via `onChange(of: externalPlayer != nil)`.
- Animated `Canvas`-drawn waveform (`TimelineView`, played bars get a sine-wave wobble).
- Drag to reposition (editing only).
- Responds to `storyComposerMute/Unmute` and `timelineDidStart/StopPlaying` notifications (composer-only — skipped when an external player exists).

Android-port note: Compose composable; waveform via `Canvas` + a `withFrameNanos`/animation loop. The external-vs-internal player ownership split is the key bug-prevention pattern — replicate it: when the reader owns an `ExoPlayer`, the on-canvas widget only observes it. Use a shared playback-state holder rather than notifications.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasGuides.swift

Purpose: Composer canvas helper overlays — safe zone, alignment snap math/guides, out-of-bounds warning, and a shared SwiftUI filter-blend overlay.

Public API:
- `extension StrokeStyle { .storyDashed }`.
- `enum StorySafeZone` — insets (top 0.18, bottom 0.25, horizontal 0.05), `normalizedRect`, `denormalizedRect(in:)`, `isOutOfBounds(_:)`.
- `enum StoryAlignmentSnap` — `snapTolerance 0.015`, horizontal/vertical targets (edges + thirds + center), `snappedX/Y`, `apply(to:)`.
- `struct SafeZoneOverlay`, `struct AlignmentGuidesOverlay`, `struct OutOfBoundsWarningOverlay`.
- `struct StoryFilterOverlayView: View` — SwiftUI blend-mode filter (vintage/bw/warm/cool/dramatic/vivid/fade/chrome with intensity).

Key behaviors: Pure snap math; dashed guides; pulsing red OOB warning. `StoryFilterOverlayView` shared by composer + reader for pixel-identical filter rendering (SwiftUI blend modes, distinct from the Metal `StoryFilteredLayer` path).

Android-port note: Snap/safe-zone math = pure Kotlin utilities. Overlays = Compose `Canvas`/`Box` drawing dashed rects. `StoryFilterOverlayView` blend modes → Compose `Modifier.drawWithContent` + `BlendMode` (`Multiply`, `SoftLight`, `Lighten`), `saturation`/`contrast` → `ColorMatrix`/`ColorFilter`. Note there are TWO filter implementations (SwiftUI blend + Metal kernel) — on Android consolidate to one (AGSL `RuntimeShader` or `RenderEffect` color filters).

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+GranularSync.swift

Purpose: A `View` modifier (`granularCanvasSync`) that offloads the SwiftUI type-checker from `StoryComposerView`'s giant body and provides O(1) granular change tracking instead of computing an artificial fingerprint over all stickers per render.

Public API: `extension View { func granularCanvasSync(filter:hasImage:stickersCount:drawingCount:bgColor:action:) }`.

Key behaviors: Chains `.onChange` for filter/hasImage/stickersCount/drawingCount/bgColor → calls `action()` (re-serialize slide).

Android-port note: A SwiftUI-type-checker-budget workaround — irrelevant on Android. In Compose, change detection is automatic via `State` reads + recomposition; use `LaunchedEffect`/`snapshotFlow` keyed on the specific values if an explicit side-effect (re-serialize) is needed. Do NOT carry over the fingerprint/modifier pattern.

---

## Architecture observations

### Rendering architecture
- **Single shared renderer (`StoryRenderer`)** is the keystone: live composer canvas, live reader canvas, and AVFoundation export all build their `CALayer` trees from the same code. The Android rebuild MUST preserve this — one Kotlin renderer feeding both a live custom-`View`/Compose-`Canvas` and a `Media3 Transformer` export `GlEffect`. Divergence here = WYSIWYG bugs.
- **Design-space → render-space projection** (`CanvasGeometry`, 1080×1920 design canvas) is a pure, well-isolated utility — port as-is. All item positions are normalized [0,1].
- The canvas is a **custom UIKit/CoreAnimation/Metal engine**, not SwiftUI. Layer tree: background / items / edit-overlay / optional filter. Android has no `CALayer`/`CARenderer` — port to `RenderNode`s + hardware `Canvas`, or a Compose custom `Layout` with per-item `graphicsLayer`. This is the single largest porting effort in the whole app.
- **Two parallel filter implementations**: a Metal compute-kernel path (`StoryFilteredLayer`, fed by `CARenderer` texture capture) and a SwiftUI blend-mode path (`StoryFilterOverlayView`). Tech-debt — consolidate to ONE on Android (AGSL `RuntimeShader` / `RenderEffect`).

### Performance techniques (preserve these)
- **Gesture-aware partial updates**: during an active pan/pinch/rotate, only the manipulated layer's transform is updated; the full scene rebuilds once on gesture end. Essential for 120Hz drag smoothness.
- **Revision-token caching**: `slideContentRevision` (monotonic UInt64) gates expensive re-captures (filter source texture) and audio reconfiguration — in `.play` the model is frozen per tick, so a per-slide capture is reused across all 60 frames.
- **Per-export layer cache** (`StoryRendererCache`): reuses `CALayer` instances across the ~720 frames of an export when an item's interpolated signature is unchanged.
- **Adjacent-slide prefetching** (`StoryReaderPrefetcher`): ≤3 bootstrapped canvas views `[N-1,N,N+1]`, evict-before-allocate. On Android, `HorizontalPager`/`ViewPager2` offscreen limit largely covers this.
- **Glyph rasterization cache** (`StoryStickerRasterizer`): emoji → `CGImage` LRU, memory-warning flush.
- ProMotion 120Hz edit clock — Android has no toggle; just use `Choreographer`.

### Concurrency
- Heavy `@MainActor` isolation (MeeshyUI compiles with `defaultIsolation(MainActor)`); GPU context (`StoryRenderingContext`) is `@unchecked Sendable` and `nonisolated`. Several `nonisolated(unsafe)` / `@unchecked Sendable` escapes for display links and caches. Many Swift-6-concurrency artifacts (persist-to-temp-file for `Sendable`, compiler-crash workarounds) are **iOS-specific noise — do not port**.
- Audio mixer uses host-time (`mach_absolute_time`) sample-accurate scheduling — the timing model (schedule each clip at `origin + startTime`) must be preserved on Android via `AudioTrack`/`ExoPlayer` timestamps.

### State management & navigation
- `BandStateMachine` — exemplary pure value-type state machine for the composer toolbar drawer; fully enumerated transitions, format-panel-takes-precedence rule. Port verbatim to a Kotlin `sealed`-based reducer.
- Composer drives an observable `StoryComposerViewModel` (`@Bindable`); reader drives `StoryReaderContext` + `StoryReaderTimerController` (content-gated countdown state machine).
- Cross-component coordination via `NotificationCenter` (mute/unmute canvas, timeline play/stop) — **anti-pattern**; replace with a typed shared event bus / `StateFlow` on Android.

### Anti-patterns / tech debt NOT to carry over
- JSON-fingerprint slide equality (`slidesEqualForCanvas`) — use immutable Kotlin data classes with correct `==`.
- `granularCanvasSync` modifier + sticker-fingerprint — SwiftUI type-checker budget workaround; Compose recomposition handles this.
- `FABPanGestureCoordinator` non-nested-to-avoid-compiler-SIGSEGV — Swift-only artifact.
- `SlideMiniPreview` re-implements render logic separately from `StoryRenderer` — duplication; render thumbnails through the shared renderer instead.
- `NotificationCenter`-based component coupling.
- iOS PencilKit `drawingData` is an opaque proprietary blob — **the persisted drawing format must change** to a portable point/stroke representation for cross-platform stories.
- Token storage / general SDK debt noted elsewhere is out of scope here.

### Portable user-facing features / capabilities
- [ ] Story canvas: place/move/scale/rotate text, media (image/video), stickers via touch gestures
- [ ] In-place text editing overlaid on the canvas (font style, color, stroke, alignment)
- [ ] Snap-to-guide alignment + safe-zone overlay + out-of-bounds warning while dragging
- [ ] PencilKit-style freehand drawing layer (pen/marker/eraser, color palette, width, undo/redo/clear)
- [ ] Emoji sticker picker (categorized + searchable)
- [ ] Background: solid color palette / image / looping or non-looping video
- [ ] Slide filters (vintage, b&w, warm, cool, dramatic, vivid, fade, chrome) with intensity
- [ ] Glass / frosted-blur text backgrounds
- [ ] Audio: pick from a server library, search, preview, record voice, on-canvas audio player widget with waveform
- [ ] Timeline: per-element start time / duration / fade in-out / keyframe animation (position/scale/opacity) / crossfade clip transitions
- [ ] Slide opening animations (reveal, fade)
- [ ] Story reader: timed auto-advance slideshow gated on media-load readiness, with adjacent-slide prefetch
- [ ] Reader Prisme Linguistique — text overlays display in the viewer's preferred content language; composer always shows the source language
- [ ] Multi-element z-order management (bring forward / send back / send to back)
- [ ] Context menu on canvas elements (edit, duplicate, reorder, delete) + element duplication
- [ ] Export a slide to a shareable MP4 video with progress reporting
- [ ] Sample-accurate multi-clip audio playback (foreground + background, fades, ducking, looping)
- [ ] Slide mini-preview thumbnails (composer slide strip)
- [ ] Composer FAB + bottom-band toolbar UX (Contenu / Effets categories, tiles, tool panels, format panels, swipe gestures)
- [ ] VoiceOver/accessibility for canvas elements (labels, custom delete/duplicate/reorder actions)
