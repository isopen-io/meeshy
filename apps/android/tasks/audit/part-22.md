# Audit Part 22 — Story Composer & Timeline Editor (iOS → Android)

Scope: 35 files in `packages/MeeshySDK/Sources/MeeshyUI/Story/` — the story
composer (multi-slide editor, text/media/drawing/filter tools) and the V2
timeline editor (AVFoundation playback engine, undo/redo, snap, keyframes).

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift

**Purpose**: Top-level SwiftUI host for the story composer — full-screen 9:16
canvas, top bar (slide strip + publish/preview/overflow), bottom toolbar /
empty-state picker, all sheets (filter, timeline, image/video/audio editors),
draft persistence, media import.

**Public API surface**:
- `StoryBackgroundPalette` (public enum): `colors: [String]`, `gradients: [(String,String)]`, `randomBackgroundColor() -> String` (HSB pastel pick: sat 0.14–0.24, brightness 0.93–0.98, dedup against fixed list), `randomBackgroundColorAsColor() -> Color`.
- `StoryComposerDraft` (Codable struct): `slides`, `visibilityPreference`; `userDefaultsKey = "storyComposerDraft"`.
- `SlidePublishAction` (public enum, Sendable): `retry`, `skip`, `cancel`.
- `StoryComposerView` (public View): two `init`s — default and repost-aware (`viewModel:`). Callbacks: `onPublishSlide`, `onPublishAllInBackground`, `onPreview`, `onDismiss`.
- `StoryLanguagePickerView` (View): searchable language list from `Locale.availableIdentifiers`.
- `MediaPillLabel` (View): adaptive-tinted toolbar pill.
- Wrappers: `EditingMediaImage`, `EditingMediaVideo`, private `AudioEditorItemWrapper`, `PendingImageWrapper`.

**Key behaviors / business logic**:
- Single `@State viewModel = StoryComposerViewModel()`; lots of composer-local `@State` (drawing canvas, filter, stickers, audio panel, transitions, keyboard height).
- `bottomRegion` swaps `emptyStateLargePicker` (2×2 tile grid: Médias/Texte/Dessin/Fond) for `ComposerControlsLayer` when composer empty and no tool selected.
- Empty-state tile tap: 220ms highlight animation, then `addText()` (for text) or `selectTool(_:)`, then opens band state machine.
- Canvas: CALayer-based `StoryComposerCanvasView` + `DrawingOverlayView` (PencilKit), pinch-to-zoom (`MagnifyGesture` 0.5–4.0) + drag-to-pan when zoomed; `viewportPinchDelta`/`viewportDragDelta` via `@GestureState`.
- Keyboard-aware canvas shift: `recomputeCanvasShift()` moves canvas up so the text being edited stays above keyboard+toolbar (model `y` normalized, no UIKit coord bridging).
- `granularCanvasSync` modifier: collapses 5 `.onChange` into one to dodge SwiftUI type-checker timeout; re-serializes composer-local state into `viewModel.currentEffects` via `buildEffects()`.
- Media import (`handleForegroundMediaSelection`/`addForegroundMedia`): pins `targetSlideId` at picker start (anti-race); video → write temp file, async thumbnail via `StoryMediaLoader`, AVAsset duration load, `addMediaObject` + `setMediaURL` + `setMediaDuration` + `autoExtendDuration`; image → ImageIO downsample to 1080px, write temp JPEG, set `mediaURL`.
- Publish: `publishAllSlides()` → `snapshotAllSlides()` (propagates `slideDuration`, computes `thumbHash` via `StorySlideRenderer`) → `onPublishAllInBackground`.
- Draft: `StoryDraftStore.shared` (slides + media) plus legacy `UserDefaults` fallback; lost-media detection surfaces an alert.
- `resetLocalState()` clears all composer-local @State in lock-step with `viewModel.reset()` so sync doesn't re-inject orphaned content.

**Dependencies / couplings**: `StoryComposerViewModel`, `StoryComposerCanvasView`, `DrawingOverlayView`, `ComposerControlsLayer`, `BandStateMachine`, `TimelineContainerSwitcher`, `StoryFilterPicker`, `MeeshyImageEditorView`, `MeeshyVideoEditorView`, `MeeshyAudioEditorView`, `StoryVoiceRecorder`, `StoryMediaLoader`, `StoryMediaCoordinator`, `StoryDraftStore`, `StorySlideRenderer`, `WaveformGenerator`, `MeeshyConfig`, `AuthManager`, PhotosUI, PencilKit, AVFoundation.

**Android-port note**: This is the heaviest screen. Map to a single Compose
screen + ViewModel. Canvas → custom `@Composable` with `Modifier.graphicsLayer`
or a `Canvas`/`AndroidView` wrapper (ExoPlayer/Media3 for video). Pinch/pan →
`Modifier.transformable`. Drawing overlay → custom Compose drawing surface (no
PencilKit equivalent — store strokes as paths). Photo picker → Android Photo
Picker (`PickVisualMedia`). Image downsample → `BitmapFactory.Options.inSampleSize`
or Coil. Keyboard shift → `WindowInsets.ime` + offset. Drafts → DataStore /
Room. SwiftUI type-checker workarounds (granularCanvasSync, extracted bodies)
do NOT carry over. Big screen — split into clear UI sub-composables.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift

**Purpose**: `@Observable @MainActor` single source of truth for the composer:
slides, selection, tools, drawing, background, media caches, z-order, timeline
V2 wiring, filters, repost initialization.

**Public API surface**:
- `StoryToolMode` (nonisolated enum, Sendable): `media`, `drawing`, `text`, `texture`, `filters`, `timeline`; legacy aliases `.photo`/`.audio`; `tab → StoryTab`.
- `StoryTab` enum: `contenu`, `effets`.
- `CanvasElementType` enum: `text`, `image`, `video`, `audio`.
- `CanvasElement` (@MainActor protocol): `id`, `elementType`, `zIndex`. `AnyCanvasElement` (@MainActor struct, Identifiable).
- `MediaAsset` enum: `image/videoURL/audioURL`.
- `StoryComposerProviding` (@MainActor protocol, AnyObject): full ~100-member test seam mirroring the VM.
- `StoryComposerViewModel` (@Observable @MainActor final class): conforms to `StoryComposerProviding`.
  - Static: `resolveComposerSourceLanguage(user:) -> String` (systemLanguage → regionalLanguage → "fr"); `syntheticTimelineClipIdPrefix`, `isSyntheticTimelineClipId(_:)`, `makeSyntheticBgImageClip(...)`.
  - State: `slides`, `currentSlideIndex`, `slideImages`, `currentSlide`/`currentEffects` (computed), `canAddSlide` (<10), `selectedElementId`, `textEditingMode`, `activeTool`, drawing props, `backgroundColor`/`backgroundTransform` + cache, `loadedImages/VideoURLs/AudioURLs`, `mediaAspectRatios`, `activeDrag`, timeline V1 props, `timelineViewModel` (lazy), filter props, `currentSlideDuration` (clamped 2–600).
  - Methods: slide CRUD (`addSlide`, `removeSlide`, `duplicateSlide`, `selectSlide`, `moveSlide`), element CRUD (`addText` ≤5, `addMediaObject` ≤10/5img/4video, `addAudioObject` ≤5, `deleteElement`, `duplicateElement`, `updateElementLanguage`), `toggleBackground`/`isBackground`, z-order (`bringToFront/sendToBack/bringForward/sendBackward`, `zIndexMap`), `moveMedia`, `selectTool`/`deselectAll`, memory observer + `evictNonVisibleSlideMedia`, `cleanupTempFiles`, `reset`.
  - `init()` + `convenience init(reposting:authorHandle:)`.
- `BackgroundTransform` struct, `ActiveDrag` struct, `MediaKind` private enum.

**Key behaviors**:
- Source language: NEVER device locale — always in-app prefs (Prisme Linguistique).
- `currentSlide` getter is crash-safe (falls back to fresh `StorySlide()` if index invalid).
- `duplicateSlide` / `duplicateElement` mint new UUIDs and re-key all side caches (loadedImages/VideoURLs/AudioURLs/aspectRatios/slideImages/backgroundTransformCache) so duplicates render their own bitmaps.
- z-index persisted into `effects` so order survives slide-switch + publish (WYSIWYG reader); `rehydrateZIndexMapFromSlide()` rebuilds map from model on slide select.
- Synthetic background clip: a static bg image surfaces as a locked full-duration timeline clip; stripped on commit.
- `loadCurrentSlideIntoTimeline()` / `commitTimelineToCurrentSlide()` bridge `currentSlide.effects` ↔ `TimelineProject`.
- `collectMediaURLs` resolution: in-session URLs first, then `CacheCoordinator.video/audioLocalFileURL` disk lookup by `postMediaId`.
- Memory pressure: observes `didReceiveMemoryWarningNotification`, evicts non-visible-slide media caches.
- Repost init: clones `StoryItem` → `StorySlide`, appends locked attribution badge text (`isLocked = true`, undeletable/unduplicable), preloads media via `CacheCoordinator` task.
- `autoExtendDuration` / `addMediaObject` / `setMediaURL` take `slideId` to avoid PhotosPicker async slide-switch race.

**Dependencies**: `StorySlide`/`StoryEffects`/`StoryMediaObject`/`StoryTextObject`/`StoryAudioPlayerObject`/`StorySticker` (shared models), `TimelineViewModel`, `StoryTimelineEngine`, `CommandStack`, `SnapEngine`, `TimelineProject`, `AuthManager`, `CacheCoordinator`, `StoryMediaLoader`, `MeeshyUser`, PencilKit/UIKit.

**Android-port note**: Kotlin `ViewModel` with `StateFlow`/`MutableState` (Compose
`mutableStateOf`). The `StoryComposerProviding` protocol → Kotlin `interface`
for testability (or just rely on a fake VM). Element limits, z-order, repost
flow, memory eviction all portable. `@Observable` getter/setter computed props →
backing `StateFlow` + derived state. Side-cache re-keying logic on duplicate is
load-bearing — preserve exactly. Memory warning → `ComponentCallbacks2.onTrimMemory`.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+TextEditing.swift

**Purpose**: Floating text-edit mode state machine, orthogonal to `BandStateMachine`.

**Public API surface**:
- `TextEditTool` (public enum, CaseIterable, Sendable): `style`, `color`, `size`, `align`, `background`, `border`; each has `sfSymbol` + `accessibilityLabel`. Case order = bubble display order.
- `TextEditingMode` (public enum, Equatable, Sendable): `inactive`, `active(textId:expandedTool:)`; computed `activeTextId`, `expandedTool`.
- `StoryComposerViewModel` extension: `enterTextEditingMode(textId:)` (idempotent, validates text exists), `exitTextEditingMode()`, `setExpandedTool(_:)`.

**Key behaviors**: Text geometry (x/y/scale/rotation/zIndex/fontSize) is NEVER
mutated for editing — the text is edited in place in the canvas; model stays
source of truth. Entering edit mode just sets `selectedElementId` + `textEditingMode`.

**Android-port note**: Sealed class `TextEditingMode` + enum `TextEditTool`.
Trivial port. Map SF Symbols to Material icons.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/StoryFilterGridView.swift

**Purpose**: Horizontal filter thumbnail strip + intensity slider, bound to `StoryComposerViewModel`.

**Public API surface**: `StoryFilterGridView` (internal struct View): `@Bindable viewModel`, `previewImage`. Renders "Original" + `StoryFilter.allCases` thumbnails; `intensitySlider` shown when `selectedFilter != nil`.

**Key behaviors**: `applyFilter(to:storyFilter:)` applies CIFilter live with intensity
(saturation via `CIColorControls`, mono/transfer/fade/chrome/process effects,
temperature via `CITemperatureAndTint`). Falls back to gradient placeholder when no preview image.

**Dependencies**: `StoryFilter` (shared), `StoryComposerViewModel`, CoreImage, `HapticFeedback`, `MeeshyColors`.

**Android-port note**: Compose `LazyRow` of filter chips + `Slider`. CIFilter → 
RenderEffect (API 31+) / `ColorMatrix` `ColorFilter` for grade filters, or
GPUImage/`RenderScript`-replacement. Live preview filtering should be off-main-thread.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/StoryFilterPicker.swift

**Purpose**: Public filter picker (sheet variant): thumbnail strip with async
per-filter thumbnail generation + the `StoryFilterProcessor` CIFilter engine.

**Public API surface**:
- `StoryFilterPicker` (public struct View): `@Binding selectedFilter: StoryFilter?`, `previewImage`.
- `StoryFilterProcessor` (public nonisolated struct): static `apply(_ filter:to:imageId:) -> UIImage` — NSCache-backed (`id_filterName` key), 8 filters (vintage/bw/warm/cool/dramatic/vivid/fade/chrome) via CIFilter.

**Key behaviors**: `generateThumbnails()` downsamples preview to 112×112 then
applies each filter on detached background tasks. Filter results cached in a
process-wide `NSCache`.

**Android-port note**: Picker = Compose bottom-sheet `LazyRow`. `StoryFilterProcessor`
→ a Kotlin object with an LRU `Bitmap` cache + Coil transformations or
RenderEffect. Keep the cache-key scheme (`imageId + filter`).

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/StoryMediaCoordinator.swift

**Purpose**: Single `StoppablePlayer` representing ALL active story media;
arbitrates app-wide audio focus with `PlaybackCoordinator`.

**Public API surface**: `StoryMediaCoordinator` (@MainActor public final class,
`StoppablePlayer`): `.shared`; `activate(onStop:)`, `deactivate()`, `stop()`;
internal `backgroundAudioSourceId` (test introspection).

**Key behaviors**: `activate` registers with `PlaybackCoordinator`, sets
`AVAudioSession` `.playback` + `.mixWithOthers`/`.duckOthers`. When external
audio (e.g. message vocal) starts, `stop()` fires the registered handler. Within
a story, multiple tracks may play simultaneously.

**Dependencies**: `PlaybackCoordinator`, `StoppablePlayer` protocol, AVFoundation.

**Android-port note**: Map to `AudioManager.requestAudioFocus` /
`AudioFocusRequest` + Media3 `Player`. The "story claims exclusive focus,
restores on dismiss" contract is portable. Singleton ok.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/StoryMediaLoader.swift

**Purpose**: Centralized media loading — hardware-accelerated image downsample
(ImageIO), async cached video thumbnails, prerolled `AVPlayer` cache.

**Public API surface**: `StoryMediaLoader` (@MainActor public final class):
`.shared`; `loadImage(from:maxDimension:)`/`loadImage(data:maxDimension:)`
(default 1080), `videoThumbnail(url:maxDimension:)` (default 400, cached + disk
persist), `preloadVideoPlayer(url:)`, `preloadAndCachePlayer(url:)`,
`cachedPlayer(for:)` (removes — AVPlayer not shareable), `clearPlayerCache()`,
`clearThumbnailCache()`.

**Key behaviors**:
- ImageIO `CGImageSourceCreateThumbnailAtIndex` downsample (5–10× more memory-efficient than `UIImage(data:)` + resize); runs on detached background task.
- Video thumbnail via `StoryMediaDecoder.firstFrame` (VideoToolbox HW decode), cached in `NSCache` (count 100, 30MB) + persisted to `CacheCoordinator.thumbnails` disk store.
- Player preroll: waits for `.readyToPlay` via KVO with 5s timeout, then `preroll(atRate:)`.
- FIFO player cache (max 6); memory-warning observer clears thumbnail + player caches.

**Dependencies**: `StoryMediaDecoder`, `CacheCoordinator`, ImageIO, AVFoundation, PhotosUI.

**Android-port note**: Image downsample → `BitmapFactory.Options.inSampleSize`
or Coil with `.size()`. Video thumbnail → `MediaMetadataRetriever.getFrameAtTime`
+ `Bitmap` cache (`LruCache`). Player preroll/cache → Media3 `ExoPlayer` pool;
`prepare()` ahead of display. Keep FIFO eviction + memory-trim hooks.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/StoryOfflineQueueBootstrap.swift

**Purpose**: Wires `StoryOfflineQueue` to the production publish pipeline and
flushes it when the network returns.

**Public API surface**:
- `OfflineToPublishBridging` (public protocol, Sendable): `enqueueForPublish(_:) async -> Bool`.
- `DefaultOfflineToPublishBridge` (struct): forwards to `StoryPublishQueue.shared`.
- `StoryOfflineQueueBootstrap` (@MainActor public final class): `.shared`; `start()` (idempotent), `publish(item:) async -> Bool`.

**Key behaviors**: `start()` wires `StoryOfflineQueue.setOnPublish`, subscribes
to `NetworkMonitor.$isOffline` (`.removeDuplicates()`) and flushes when back
online. `publish` maps `StoryOfflineQueueItem` → `StoryPublishQueueItem`
(slidePayloadJSON → Data, media/audio paths → `StoryMediaReference`s).

**Dependencies**: `StoryOfflineQueue`, `StoryPublishQueue`, `StoryPublishQueueItem`, `StoryMediaReference`, `NetworkMonitor`, Combine, os.Logger.

**Android-port note**: WorkManager is the natural fit — `OneTimeWorkRequest` with
`NetworkType.CONNECTED` constraint replaces the manual NetworkMonitor flush.
Offline queue → Room table. Keep the offline-first contract (never silently
drop user work).

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/StorySlideManager.swift

**Purpose**: DEPRECATED legacy `ObservableObject` slide container + legacy
carousel. Duplicates `StoryComposerViewModel` state — SSoT violation.

**Public API surface**: `StorySlideManager` (@available deprecated, @MainActor
ObservableObject): `slides`, `currentSlideIndex`, `slideImages`, `maxSlides=10`,
slide CRUD. `StorySlideCarousel` (deprecated View).

**Android-port note**: DO NOT PORT. Tech debt explicitly marked for removal.
Use the composer ViewModel as the sole slide source of truth.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/StorySlideRenderer.swift

**Purpose**: Renders a slide composite (bg + text + foreground images + stickers)
to a low-res ~100×178 UIImage for `thumbHash` blur-placeholder computation.

**Public API surface**: `StorySlideRenderer` (public enum): `renderComposite(slide:bgImage:loadedImages:) -> UIImage?`, `computeThumbHash(...) -> String?`. Private `UIColor(hex:)` extension.

**Key behaviors**: `UIGraphicsImageRenderer` draws bg color → bg image → text
objects (scaled relative to 390pt screen width, alignment, optional text bg) →
foreground media images (positioned/scaled) → sticker emojis. Output fed to
`toThumbHash()`.

**Android-port note**: Render to a `Bitmap` via `Canvas` (offscreen). ThumbHash
has Kotlin/Java implementations. Keep the layered composite logic. Used only for
placeholder generation — not perf-critical.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextEditToolbar.swift

**Purpose**: Bottom-docked text-formatting toolbar (floating bubbles + optional
expanded options panel), shown only while `textEditingMode` is `.active`.

**Public API surface**: `StoryTextEditToolbar` (internal struct View):
`@Bindable viewModel`. Renders `TextEditToolOptions` (if a tool is expanded) +
`TextEditFloatingBubbles`.

**Key behaviors**: Live `Binding<StoryTextObject>` for the edited object; empty
when `.inactive`. Tool selection toggles `setExpandedTool`.

**Android-port note**: Compose `Column` anchored above the IME inset; visible
only in edit mode. Bind to a `StoryTextObject` state.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextEditorView.swift

**Purpose**: Alternate hierarchical text editor panel (collapsible sections:
style/color/size/timing) with a text input field. Used in the band-panel flow.

**Public API surface**:
- `StoryTextEditorView` (public struct View): `@Binding textObject: StoryTextObject`, `onDelete: (() -> Void)?`.
- `StoryTextColors` (public enum): `palette: [String]` — 14 hex colors.
- Private `TextEditorSection` enum.

**Key behaviors**: Text field (`axis: .vertical`, 1–4 lines), quick actions
(style cycle, alignment cycle, bg toggle, color dot), section picker tabs,
expanded sections — style chips (`StoryTextStyle`), color palette dots, font
size slider (14–60), timing sliders (start/duration 0–30s, fadeIn/fadeOut 0–5s).
Bindings convert `0` ↔ `nil` for optional timing fields.

**Dependencies**: `StoryTextObject`, `StoryTextStyle`, `storyFont(for:size:)`, `MeeshyColors`.

**Android-port note**: Compose `Column` with expandable sections, `TextField`,
`Slider`s, color chips `LazyRow`. Timing/style/color all portable. Note there
are two text-editing UIs (this + the floating toolbar) — Android should pick one
or unify.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/StoryVideoPlayerView.swift

**Purpose**: High-performance video player using `AVPlayerLayer` directly
(not SwiftUI `VideoPlayer`), with poster frame + seamless looping + preroll.

**Public API surface**:
- `VideoPlayerCoordinator` (@MainActor final class, ObservableObject): `isPlayerReady`, `setup(url:posterImage:preroll:loop:autoplay:muted:)`, `teardown()`.
- `StoryVideoPlayerView` (internal struct View): `url`, `posterImage`, `preroll/loop/autoplay/muted` flags; `.playing(_:)` modifier extension.
- Private `_AVPlayerLayerView` (UIViewRepresentable), `_PlayerUIView`.

**Key behaviors**: Uses `StoryMediaLoader.cachedPlayer(for:)` (zero-latency path)
when available, else builds fresh `AVQueuePlayer` + KVO readiness observer.
`AVPlayerLooper` for seamless loop. Poster image overlays until `isPlayerReady`,
then opacity fade. `AVPlayerLayer` for GPU-composited rendering.

**Android-port note**: Media3 `ExoPlayer` + `PlayerView` (or `AndroidView` over
`SurfaceView`/`TextureView`). Looping → `Player.REPEAT_MODE_ONE`. Poster →
crossfade an `Image` over the player surface until `STATE_READY`. Coordinator →
a remembered holder tied to composition lifecycle.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/StoryVoiceRecorder.swift

**Purpose**: Voice recording UI for stories — waveform meter, hold/tap-to-record,
60s max.

**Public API surface**: `StoryVoiceRecorder<Recorder: AudioRecordingProviding>`
(public struct View): generic over a recorder protocol; `onRecordComplete: (URL) -> Void`.
Convenience init for `DefaultSDKAudioRecorder`.

**Key behaviors**: Mic permission request via `AVAudioSession.requestRecordPermission`;
0.05s timer enforces 60s cap; 15-bar live waveform from `recorder.audioLevels`;
discards recordings ≤ 0.5s.

**Dependencies**: `AudioRecordingProviding` protocol, `DefaultSDKAudioRecorder`, AVFoundation, `HapticFeedback`.

**Android-port note**: `MediaRecorder` or `AudioRecord` behind an injectable
interface. `RECORD_AUDIO` runtime permission. Waveform from amplitude polling
(`MediaRecorder.getMaxAmplitude`). Compose UI with animated bars.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/TextBackgroundStylePicker.swift

**Purpose**: Three-way chip control for text background style: `Aucun` / `Couleur` / `Verre` (glass).

**Public API surface**: `TextBackgroundStylePicker` (public struct View):
`@Binding textObject: StoryTextObject`.

**Key behaviors**: Mutates `textObject.backgroundStyle` (`StoryTextBackgroundStyle`);
solid preserves prior hex (or legacy `textBg`, defaults `000000`); glass inits
`radius = 24`. Reads `resolvedBackgroundStyle`. Explicitly avoids `@ObservedObject`
on `ThemeManager` (Zero-Re-render rule) — uses `@Environment(\.colorScheme)`.

**Android-port note**: Compose segmented chip row. `StoryTextBackgroundStyle` →
sealed class. Glass = blur background (RenderEffect API 31+ or translucent fill).

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditFloatingBubbles.swift

**Purpose**: Row of 6 floating tool bubbles (36×36) + dismiss X bubble, shown above
the text being edited.

**Public API surface**: `TextEditFloatingBubbles` (internal struct View):
`expandedTool`, `onSelectTool: (TextEditTool) -> Void`, `onDismiss: () -> Void`.

**Key behaviors**: Active bubble uses brand gradient; X bubble (error red) dismisses
editor + lowers keyboard.

**Android-port note**: Compose `Row` of `IconButton`s. Trivial.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditToolOptions.swift

**Purpose**: Preset options panel shown under the text when a tool bubble is
expanded — style/color/size/align/background/border controls.

**Public API surface**: `TextEditToolOptions` (internal struct View): `tool: TextEditTool`, `@Binding textObject: StoryTextObject`.

**Key behaviors**: Per-tool sub-views: style chips (`StoryTextStyle`), color dots
(`StoryTextColors.palette`), size slider (14–160), alignment buttons, background
chips (none/glass/4 solid presets incl. 65%-alpha variants), border (width chips
none/2/4/8 + color palette). Writes directly into the bound object.

**Android-port note**: Compose `when(tool)` switch over sub-composables. Border
support (`borderColor`/`borderWidth`) and bg-style presets are load-bearing for
parity. `StoryTextStyle` font mapping needed.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/AudioMixer.swift

**Purpose**: Multi-track audio mixer for timeline playback — `AVAudioEngine` with
per-clip `AVAudioPlayerNode`s, sample-accurate scheduling.

**Public API surface**:
- `AudioMixerProviding` (@MainActor protocol): `isMuted`, `maxActiveNodes`, `configure(audios:urls:)`, `play()`, `pause()`, `seek(to:)`, `setVolume(_:for:)`, `setMute(_:)`, `teardown()`, `shutdown()`, `prepareAllNodes()`.
- `AudioMixer` (@MainActor public final class): impl; `maxActiveNodes` (default 6), `lastSeekTime`, `isPlaying`, `activeNodeCount`, `intendedVolume(for:)`. Static `hostTime(forDelaySeconds:)` / `(_:timebase:)`.

**Key behaviors**:
- Per-clip node attached to `mainMixerNode`; capped at `maxActiveNodes`.
- Sample-accurate scheduling: `scheduleNodeFromTimelineTime` — if timeline before clip start, schedules at future `AVAudioTime(hostTime:)`; else schedules a `scheduleSegment` from a file offset (mid-flight seek).
- `hostTime` conversion uses cached `mach_timebase_info`, computed in `Double` to avoid `UInt64` overflow on Intel timebases, clamped to `UInt64` range.
- `play()` starts engine before flipping `_isPlayingStorage` (never lies about state); audio failure is non-fatal.
- `shutdown()` idempotent; `deinit` only logs a warning (can't safely call MainActor teardown from deinit).

**Android-port note**: Media3 / `AudioTrack` with multiple sources, or `SoundPool`
for short clips. For sample-accurate multi-track sync use `ExoPlayer`s with a
shared clock or `MediaCodec` + `AudioTrack` and `AudioTimestamp`. The
timeline-time → host-time scheduling logic must be reimplemented against the
Android audio clock. Cap active tracks. Non-trivial — budget time.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/CustomTransitionCompositor.swift

**Purpose**: STUB custom `AVVideoCompositing` reserved for future non-opacity
transitions (push/wipe/zoom/swipe) via Metal compute kernels.

**Public API surface**: `CustomTransitionCompositor` (@objc public final class,
`AVVideoCompositing`, `@unchecked Sendable`): `isMetalAvailable` static check;
`startRequest` currently finishes with an error (never reached at launch).

**Key behaviors**: Registered on `AVMutableVideoComposition` only when a
non-built-in transition kind is present. Holds `MTLDevice` + `MTLCommandQueue`.

**Android-port note**: Not yet functional — defer. When implemented, Android
equivalent = OpenGL ES / Vulkan shader or `GLSurfaceView` compositor, or a
Media3 `GlEffect`/`Effect` in the transformer pipeline.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/DissolveVideoCompositor.swift

**Purpose**: Functional custom `AVVideoCompositing` that applies `CIDissolveTransition`
(GPU via Metal CIContext) for dissolve transitions.

**Public API surface**: `DissolveVideoCompositor` (public final class,
`AVVideoCompositing`, `@unchecked Sendable`): `transitionFilterName = "CIDissolveTransition"`,
`startRequest`, `renderContextChanged`, `cancelAllPendingVideoCompositionRequests`.

**Key behaviors**: Per-call `CIContext` (concurrent-render thread safety) bound to
shared `MTLDevice`; computes `tweenFactor` from elapsed/duration, applies
`CIDissolveTransition` between two source frames; single-track path passes frame
through.

**Android-port note**: Dissolve = cross-dissolve shader in a Media3 `Effect` or
GL compositor — interpolate between two frame textures with `mix(from, to, t)`.
The tween-factor math is portable.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine+Providing.swift

**Purpose**: One-line conformance bridging `StoryTimelineEngine` to the
`TimelineEngineProviding` protocol (declaration-only — all members already match).

**Android-port note**: N/A — Kotlin doesn't need this bridge file; the engine
class implements the interface directly.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift

**Purpose**: `@MainActor` AVFoundation playback engine for the timeline editor —
builds an `AVMutableComposition` + `AVMutableVideoComposition`, drives an
`AVPlayer` + `AudioMixer`.

**Public API surface**: `StoryTimelineEngine` (@MainActor public final class):
- State: `currentTime`, `isPlaying`, `mode: TimelineEngineMode`, `isMuted`, `masterVolume`, `currentProjectSnapshot`.
- Callbacks: `onTimeUpdate`, `onPlaybackEnd`, `onElementBecameActive`, `onError`.
- Methods: `init(audioMixer:)`, `shutdown()`, `setMode(_:)`, `configure(project:mediaURLs:images:)`, `play()`, `pause()`, `toggle()`, `seek(to:precise:)`, `stop()`, `export(to:preset:)` (stub — throws `notImplemented`).

**Key behaviors**:
- `configureCore`: configures `AVAudioSession` (`.playback`/`.moviePlayback`/`.mixWithOthers`, 5ms IO buffer), tears down, inserts video tracks (background videos excluded), builds video composition via `VideoCompositor`, attaches `AVPlayer` + `AudioMixer`.
- `insertVideoTracks`: per video clip loads asset (`loadAssetWithRetry` — 1 retry after 500ms), inserts time range at `clip.startTime`.
- Periodic time observer at 60Hz; end observer on `AVPlayerItemDidPlayToEndTime`.
- `seek` clamped to `[0, slideDuration]`; `precise` flag toggles zero vs 0.05s tolerance (scrub vs final).
- `setMode(.editing)` pauses if playing.
- `shutdown()` idempotent; deinit only warns (can't call MainActor teardown).
- Wrapped in `TimelineSignposter` intervals for Instruments profiling.

**Dependencies**: `AudioMixer`/`AudioMixerProviding`, `VideoCompositor`, `TimelineMediaSource`, `TimelineProject`, `TimelineEngineMode`, `StoryTimelineEngineError`, `TimelineSignposter`, AVFoundation.

**Android-port note**: This is the core editor playback engine. Map to Media3:
`ExoPlayer` with a composed `MediaSource` (concatenating/merging clips) or the
Media3 `Transformer`/`Composition` API (which natively supports multi-clip
sequences + effects + audio). Track insertion at offsets → `ClippingMediaSource`
+ `ConcatenatingMediaSource`, or a `Composition` of `EditedMediaItem`s. Seek
tolerance → `ExoPlayer.setSeekParameters` (`EXACT` vs `CLOSEST_SYNC`). Export
stub → Media3 `Transformer`. Significant effort — central to the editor.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngineErrors.swift

**Purpose**: Error + preset enums for the timeline engine.

**Public API surface**:
- `StoryTimelineEngineError` (Error, Sendable, Equatable): `assetLoadFailed(clipId:reason:)`, `audioEngineUnavailable(reason:)`, `configurationFailed(reason:)`, `noProjectConfigured`.
- `StoryTimelineExportError` (Error): `notImplemented`, `sessionFailed(String)`.
- `StoryTimelineExportPreset` (Sendable): `hd720`, `hd1080`, `hd4k`.

**Android-port note**: Kotlin sealed classes / enums. Trivial.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/TimelineMediaSource.swift

**Purpose**: Sendable value abstraction of a timeline media source (video/audio/image)
with async asset loading.

**Public API surface**: `TimelineMediaSource` (public struct, Sendable, Identifiable,
Equatable): `id`, `kind` (`video`/`audio`/`image`), `url`; static
`fromMediaObject(...)`, `fromAudioObject(...)`; `loadAsset() async throws -> AVURLAsset`.
`TimelineMediaSourceError` enum: `missingURL`, `notApplicableForImage`, `assetLoadFailed`.

**Key behaviors**: `loadAsset` builds `AVURLAsset` with precise timing, awaits
`.tracks`/`.duration`; throws for image kind / missing URL.

**Android-port note**: Kotlin data class. `loadAsset` → build a Media3 `MediaItem`
+ retrieve metadata via `MediaMetadataRetriever` or `MediaItem.Builder`.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/TimelineSignposter.swift

**Purpose**: `OSSignposter` wrapper for hot-path instrumentation of the engine
(Instruments + MetricKit aggregation).

**Public API surface**: `TimelineSignposter` (public struct): static
`interval(_:_:)` (sync) / `intervalAsync(_:_:)` (async) — wrap a block in a signpost.

**Android-port note**: Map to `androidx.tracing.Trace` (`trace("name") { ... }`)
for Perfetto/systrace. Production aggregation → custom analytics or
`androidx.metrics`. Low priority — instrumentation only.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/VideoCompositor.swift

**Purpose**: Pure (nonisolated, no UIKit) logic that turns a `TimelineProject`
into a configured `AVMutableVideoComposition` — segments, layer instructions,
opacity ramps, transition compositor selection.

**Public API surface**:
- `OpacityRamp`, `LayerInstructionConfig`, `CompositionSegment` (public Sendable structs).
- `VideoCompositor` (public struct, Sendable): static `makeComposition(project:composition:renderSize:)` (default 1080×1920, 60fps), `computeSegments(clips:slideDuration:)`, `layerInstructionConfig(...)`, `makeLayerInstruction(...)`.

**Key behaviors**:
- `computeSegments`: collects clip-start/end boundaries, builds contiguous segments each tagged with active clip IDs.
- Per-segment layer instructions: opacity ramps for fadeIn/fadeOut + `.crossfade` transitions; `.dissolve` skips ramps (custom compositor handles blend).
- Compositor selection: non-built-in kind + Metal available → `CustomTransitionCompositor`; else dissolve present → `DissolveVideoCompositor`; else native.
- `makeTrackIDMap` pairs video clips to composition tracks by deterministic insertion order; `makePreciseDuration` uses timescale 600_000 to avoid Float-truncation.

**Android-port note**: Reimplement against Media3 `Composition`/`EditedMediaItemSequence`.
Segment + boundary computation is pure math — directly portable to Kotlin.
Opacity ramps → alpha animation in `Effect`s; crossfade/dissolve → overlap +
`Presentation`/`OverlayEffect` or shader. Keep `computeSegments` as a pure
testable function.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/CommandStack.swift

**Purpose**: Linear undo/redo stack with FIFO cap (default 50) + time-based
coalescing (0.5s window); snapshot/restore for persistence.

**Public API surface**:
- `CommandStackSnapshot` (public Codable, Sendable): `commands: [AnyEditCommand]`, `cursor`.
- `CommandStack` (@MainActor public final class): `maxSize`, `coalesceWindow`, `didChange` callback, `canUndo`/`canRedo`, `count`, `push(_:)`, `undo()`, `redo()`, `snapshot()`, `restore(_:)`.

**Key behaviors**:
- `push` truncates redo branch, coalesces same-target/same-kind commands within window (only `MoveClip`, `TrimClip`, `MoveKeyframe` — emitted at ~60fps during drags), enforces FIFO cap.
- Coalesce preserves pre-drag `old*` + current `new*` so one undo reverts a whole gesture; `MoveKeyframe` does per-axis merge (x/y/scale/opacity/easing).
- `restore` clamps cursor to valid range (tolerates corrupt snapshots).

**Dependencies**: `AnyEditCommand`, `MoveClipCommand`, `TrimClipCommand`, `MoveKeyframeCommand` (shared edit-command types).

**Android-port note**: Pure Kotlin class — directly portable. Sealed class
`EditCommand` + a `CommandStack` holding a `MutableList`. Persistence →
serialize to JSON (kotlinx.serialization). Coalescing logic is load-bearing for
gesture UX — preserve exactly.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/KeyframeInterpolator.swift

**Purpose**: Generic pure-Swift keyframe interpolation with a `Lerpable` protocol.

**Public API surface**:
- `Lerpable` (public protocol, Sendable): `lerp(from:to:t:)` — conformances for `Float`, `CGFloat`, `CGPoint`, `CGSize`.
- `KeyframeInterpolator` (public enum): static `interpolate<T: Lerpable>(keyframes:at:) -> T?`.

**Key behaviors**: 0 keyframes → nil; 1 → constant; N → finds bracketing segment,
applies per-origin `StoryEasing`, clamps before/after endpoints.

**Android-port note**: Kotlin generic `interface Lerpable` + `KeyframeInterpolator`
object. Implement for `Float`, `Offset`, `Size`. Pure logic — trivial port,
fully unit-testable.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/SnapEngine.swift

**Purpose**: Pure-Swift snap engine — snaps a raw drag time to the nearest
candidate within tolerance, with priority tie-breaking.

**Public API surface**:
- `SnapCandidate` (public struct, Equatable, Sendable): `kind` (playhead/clipStart/clipEnd/gridMajor/gridMinor/keyframe/slideStart/slideEnd), `time`, `label`.
- `SnapResult` (public struct): `snappedTime`, `matched: SnapCandidate?`.
- `SnapEngine` (public struct, Sendable): `toleranceSeconds`; `snap(rawTime:candidates:disabled:) -> SnapResult`; static `priority(for:)`, `pickBest(...)`.

**Key behaviors**: O(n) over candidates; picks closest within tolerance, ties
broken by priority hierarchy (playhead 70 > clip 60 > keyframe 50 > grid > slide
20); non-finite times skipped; `disabled` bypasses (2-finger override).

**Android-port note**: Pure Kotlin — directly portable. Used during clip /
keyframe / playhead drags. UI computes tolerance as `6pt / pixelsPerSecond`.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Model/TimelineEngineMode.swift

**Purpose**: Shared engine mode enum.

**Public API surface**: `TimelineEngineMode` (public enum, Sendable, Equatable):
`editing`, `preview`.

**Android-port note**: Kotlin enum. `editing` = audio mixer active for live
controls, playback paused on switch; `preview` = continuous playback default.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Util/SOTAImageThumbnail.swift

**Purpose**: Fast ImageIO thumbnail extraction from local file URLs for the
timeline filmstrip (2–4× faster than `UIImage.preparingThumbnail`).

**Public API surface**: `SOTAImageThumbnail` (public enum): `thumbnail(from:maxPixelSize:) -> UIImage?` (sync, nonisolated), `thumbnailAsync(from:maxPixelSize:) async -> UIImage?`.

**Android-port note**: `BitmapFactory` with `inSampleSize` / `inJustDecodeBounds`,
or `ThumbnailUtils.createImageThumbnail` / Coil. Used by the timeline clip-bar
strip renderer.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/ClipSelectionState.swift

**Purpose**: Pure value struct tracking selected clip + active drag — passed by
value into leaf views to avoid observation churn.

**Public API surface**: `ClipSelectionState` (public struct, Equatable, Sendable):
`selectedClipId`, `activeDrag: ActiveDrag?`, `isDragging`, `isSelected(_:)`;
mutations `select`/`deselect`/`beginDrag`/`updateDrag`/`endDrag`. Nested
`ActiveDrag` struct with `SnappedKind` enum.

**Android-port note**: Kotlin `data class` (immutable copy-on-mutate). Pass by
value to Compose leaf composables — supports `@Stable`/skippability.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineGeometry.swift

**Purpose**: Pure deterministic px-per-second contract for all timeline views.

**Public API surface**: `TimelineGeometry` (public struct, Equatable, Sendable):
`basePixelsPerSecond = 50`, `zoomScale` (clamped ≥0.05); `pixelsPerSecond`,
`x(for:)`, `time(forX:)`, `width(for:)`, `snapToleranceSeconds` (= 6pt/pps).

**Android-port note**: Kotlin `data class` — convert to/from `Dp`/`Px` carefully
(Android density). The time↔pixel mapping is the foundation of timeline layout.
Trivial pure port.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineMode.swift

**Purpose**: Two-way UI mode switch — `.quick` (portrait, ~3 tracks) vs `.pro`
(landscape, multi-track CapCut-style).

**Public API surface**: `TimelineMode` (public enum, Codable, Sendable, CaseIterable):
`quick`, `pro`; `toggled`, `isPro`.

**Android-port note**: Kotlin enum. Drives which timeline UI layout is rendered.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel+OfflinePublish.swift

**Purpose**: Offline-first publish extension for `TimelineViewModel` — enqueue to
`StoryOfflineQueue` when offline or online-publish fails.

**Public API surface**:
- `TimelineOnlinePublishing` (public protocol, Sendable): `publishTimelineItem(_:) async throws`.
- `StubOnlinePublisher` (public struct): always throws (pipeline not wired).
- `TimelineViewModel` extension: `handlePublishTap(visibility:originalLanguage:networkMonitor:offlineQueue:onlinePublisher:)`, `dismissOfflineQueuedConfirmation()`, internal `buildOfflineQueueItem(...)`.
- `StoryVisibility` (public enum, Codable, Sendable): `public`/`friends`/`private` ("PUBLIC"/"FRIENDS"/"PRIVATE").

**Key behaviors**: Offline-first contract — never sets `errorMessage`, always
shows confirmation. `buildOfflineQueueItem` serializes the full `TimelineProject`
to JSON (ISO8601 dates), splits `pendingMediaURLs` into media vs audio paths
(via `audioClipIds()`), stamps `originalLanguage` (Prisme Linguistique — falls
back to `"fr"` if empty) for gateway NLLB-200 routing.

**Dependencies**: `TimelineViewModel`, `StoryOfflineQueue`/`OfflineQueueProviding`, `StoryOfflineQueueItem`, `NetworkMonitor`/`NetworkMonitorProviding`, `StoryComposerViewModel.resolveComposerSourceLanguage`, `AuthManager`.

**Android-port note**: Kotlin extension function or VM method. Offline queue →
Room + WorkManager (network-constrained worker). Keep offline-first contract
(confirmation, not failure) and the language-stamping for translation routing.

---

## Architecture observations

### State management
- **Composer**: `@Observable @MainActor StoryComposerViewModel` is the single
  source of truth (slides/effects/selection/tool). `StoryComposerView` carries a
  large body of composer-local `@State` that must be kept in lock-step via
  `granularCanvasSync` + `resetLocalState()` — a fragile coupling. **Android
  should consolidate ALL composer state into the ViewModel** and eliminate the
  parallel local-state mirror entirely.
- **Timeline**: clean layered design — pure value types (`TimelineGeometry`,
  `ClipSelectionState`, `SnapEngine`, `KeyframeInterpolator`, `VideoCompositor`,
  `CommandStack`) sit below `TimelineViewModel`, which sits above
  `StoryTimelineEngine` (AVFoundation). Protocols (`TimelineEngineProviding`,
  `AudioMixerProviding`, `OfflineQueueProviding`, `TimelineOnlinePublishing`)
  provide test seams. This split ports cleanly to Kotlin and should be preserved.

### Caching / SWR / memory
- `StoryMediaLoader`: ImageIO HW downsample, `NSCache` thumbnail cache (100/30MB),
  FIFO prerolled-player cache (max 6), disk persistence via `CacheCoordinator`.
- Memory-warning observers in `StoryComposerViewModel` + `StoryMediaLoader` evict
  caches and tear down players. Android → `onTrimMemory` + `LruCache`.
- Media URL resolution is multi-tier: in-session map → disk cache by `postMediaId`.

### Concurrency
- `@MainActor` isolation throughout (SE-0466 module default). `nonisolated`
  pure-logic types for the timeline. Heavy work (image decode, thumbnails,
  filter application) on `Task.detached`. `AudioMixer`/`StoryTimelineEngine`
  have explicit `shutdown()` because `deinit` can't safely call MainActor code —
  Android (GC-based) avoids this entirely but still needs explicit
  `release()`/lifecycle teardown for `ExoPlayer`/`AudioTrack`.

### Performance techniques
- CALayer-based canvas + direct `AVPlayerLayer` (not SwiftUI `VideoPlayer`) for
  GPU-composited rendering; player preroll for zero-latency playback.
- 60Hz periodic time observer; signpost instrumentation (`TimelineSignposter`).
- Sample-accurate audio scheduling via `mach_absolute_time` host ticks.
- Body-extraction + `granularCanvasSync` are SwiftUI type-checker workarounds —
  **do NOT carry over** to Compose.

### Navigation
- Composer is a full-screen modal; sheets for filter/timeline/editors;
  `fullScreenCover` for image/video editors. Android → modal destination +
  bottom sheets / nested screens.

### Anti-patterns / tech debt (do NOT port)
- `StorySlideManager` + `StorySlideCarousel`: `@available(deprecated)`, explicit
  SSoT violation duplicating `StoryComposerViewModel`. Slated for removal.
- `StubOnlinePublisher` / timeline online-publish pipeline is unwired — offline
  queue is the only working path. Android must actually wire online publish.
- `CustomTransitionCompositor` is a non-functional stub.
- `StoryTimelineEngine.export(...)` throws `notImplemented` — no export pipeline.
- Composer-local `@State` mirror of ViewModel state (fragile sync).
- Two separate text-editing UIs (`StoryTextEditToolbar`/floating bubbles vs
  `StoryTextEditorView` sections) — Android should unify on one.
- `StoryComposerView` was split into many extracted vars purely to dodge the
  SwiftUI compiler — Android should structure by genuine UI concern instead.

### Portable user-facing features / capabilities
- [ ] Multi-slide story composer (≤10 slides; add/remove/duplicate/reorder)
- [ ] 9:16 canvas with pinch-to-zoom + drag-to-pan viewport
- [ ] Text elements (≤5/slide): style, color, size, alignment, background (none/solid/glass), border, fade timing
- [ ] In-place floating text editor with tool bubbles + keyboard-aware canvas shift
- [ ] Media elements (≤10/slide, ≤5 images, ≤4 videos): photo/video import, crop/edit, aspect-ratio preservation
- [ ] Audio elements (≤5/slide): voice recording (60s), audio file import, waveform, audio editor
- [ ] Drawing layer (pen tool, color, width)
- [ ] Background: random pastel color, color/gradient palette, background image with transform
- [ ] 8 photo filters (vintage/bw/warm/cool/dramatic/vivid/fade/chrome) with intensity slider, per-slide or per-layer
- [ ] Z-order controls (bring to front/back, forward/backward) persisted for WYSIWYG playback
- [ ] Per-element + per-slide duration control
- [ ] Background designation toggle (1 visual + 1 audio per slide)
- [ ] Repost flow: clone source story + locked, undeletable attribution badge
- [ ] Draft save/restore with media persistence + lost-media detection
- [ ] Preview before publish; publish-all-in-background
- [ ] Visibility selection (Public / Friends / Private)
- [ ] V2 timeline editor: multi-track, quick vs pro modes, zoomable, snap-to-grid/clips/keyframes/playhead
- [ ] Timeline clip transitions (crossfade, dissolve)
- [ ] Keyframe animation (position/scale/opacity with easing)
- [ ] Undo/redo with gesture coalescing (FIFO 50), persisted across composer reopen
- [ ] Multi-track timeline playback with sample-accurate audio mixing
- [ ] Offline-first publish (queue when offline, flush on reconnect, never lose work)
- [ ] Story media audio focus arbitration (story claims app audio, restores on dismiss)
- [ ] thumbHash blur-placeholder generation per slide
- [ ] Source-language stamping (Prisme Linguistique — in-app prefs, never device locale)
