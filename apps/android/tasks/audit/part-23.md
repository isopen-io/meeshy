# Audit Part 23 — Story Timeline Editor, Theme, Utilities, Voice Profile

Scope: 42 files from `packages/MeeshySDK/Sources/MeeshyUI/` covering the **Story Timeline video editor** (Plan 4 architecture), the **MeeshyUI theme system**, **shared utilities**, the **unified post composer**, and the **voice-cloning profile** flow.

---

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel+Plan4Helpers.swift

- **Purpose**: Extension of `TimelineViewModel` carrying the bulk of clip-mutation commands; split out only to keep the main VM file short.
- **Public API**: `commandHistoryDepth: Int`; `dragClip(id:deltaTimeSeconds:isCommitted:)`; `trimClipStart/trimClipEnd(id:deltaTimeSeconds:mediaDurationLimit:)`; `addMedia(id:postMediaId:kind:startTime:duration:)`; `addAudio(...)`; `didExtendClip(id:overlapWithNextSeconds:)`; `setSnapDisabled(_:)`; `setClipVolume/FadeIn/FadeOut/Loop/Background(id:...)`; `deleteClip(id:)`; `moveKeyframe` (time-only + transform/easing overload); `deleteKeyframe(clipId:keyframeId:)`; `changeTransition(transitionId:kind:duration:)`; `removeTransition(transitionId:)`.
- **Key behaviors**: Every mutation builds a typed `Command` (`TrimClipCommand`, `AddClipCommand`, `SetClipPropertyCommand`, `DeleteClipCommand`, `MoveKeyframeCommand`, `DeleteKeyframeCommand`, `ChangeTransitionCommand`, `RemoveTransitionCommand`), applies it to a mutable `project` value type via `cmd.apply(to:&project)`, pushes onto `commandStack`, and calls `scheduleEngineReconfigure()`. **Command pattern for full undo/redo**. Minimum durations clamped (0.05s). `SetClipProperty` captures the old value before mutating so undo is exact. Keyframe edits each push a separate command so `CommandStack` coalescing collapses a 60fps slider drag into one undo step. Audio clips have no keyframes (guards return nil/early). Errors surface to `errorMessage`.
- **Dependencies**: `TimelineProject`, `StoryMediaObject/AudioPlayerObject/TextObject`, `StoryKeyframe`, `StoryClipTransition`, `CommandStack`, command types — all from MeeshySDK core.
- **Android-port note**: Map to a Kotlin sealed `TimelineCommand` interface with `apply(project)` / `revert(project)`. The mutable-struct `project` becomes an immutable `data class` with `.copy()`. Hold this logic in the `TimelineViewModel` (Android `ViewModel` + `StateFlow<TimelineProject>`). Command stack = a plain list + cursor; coalescing rule must be preserved.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift

- **Purpose**: Core observable ViewModel for the timeline editor — owns project state, playback engine wiring, selection, drag, undo/redo, scrub, split, transitions, keyframes.
- **Public API**: protocol `TimelineEngineProviding` (testable seam: `currentTime`, `isPlaying`, `isMuted`, `masterVolume`, `onTimeUpdate/onPlaybackEnd/onElementBecameActive/onError` callbacks, `mode`, `configure/play/pause/seek/stop/toggle/setMode`); `@Observable @MainActor final class TimelineViewModel` with state `project`, `currentTime`, `isPlaying`, `isMuted`, `canUndo`, `canRedo`, `isSnapEnabled`, `selection: ClipSelectionState`, `mode: TimelineMode`, `zoomScale`, `errorMessage`, `showOfflineQueuedConfirmation`, `isScrubbing`. Methods: `bootstrap(project:mediaURLs:images:)`, `awaitConfigured()`, `selectClip`, `beginClipDrag/dragClipMoved/endClipDrag/cancelClipDrag`, `clipKind(forId:)`, `commandHistorySnapshot()`, `undo/redo`, `setMediaResolution`, `beginScrub/endScrub/scrub(to:)`, `splitSelectedAtPlayhead`, `addTransition`, `addKeyframeAtPlayhead`, `setMode/toggleSnap/togglePlayback/toggleMute`, `restoreCommandHistory(_:)`.
- **Key behaviors**: DI via init (`engine`, `commandStack`, `snapEngine`). `bootstrap` runs `engine.configure` in a cancellable `Task`; `scheduleEngineReconfigure` cancels & re-issues. Drag uses `snapEngine.snap` with candidates; **no-op drag (delta < 0.0005s) is not pushed** to the stack. Scrub auto-selects precision: `precise:false` during a continuous drag (sub-50ms tolerance — avoids AVPlayer GOP-decompression freeze at 60 calls/s), precise on release. `splitSelectedAtPlayhead` clamps both halves to ≥0.001s to avoid zero-length AVPlayer crash. `restoreCommandHistory` re-applies commands atomically with rollback on failure.
- **Dependencies**: `CommandStack`, `SnapEngine`, `TimelineEngineMode`, `TimelineProject`, `ClipSelectionState`, story object types.
- **Android-port note**: `@Observable` → Android `ViewModel` exposing `StateFlow`s. `TimelineEngineProviding` → a Kotlin interface backed by **ExoPlayer/Media3** for playback. Cancellable bootstrap = `viewModelScope` jobs with `Job.cancel()`. Scrub precision logic still matters (ExoPlayer `SeekParameters.CLOSEST_SYNC` vs `EXACT`).

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/ProTimelineEmptyState.swift

- **Purpose**: Empty-state placeholder shown when a timeline project has no clips.
- **Public API**: `struct ProTimelineEmptyState: View, Equatable` — `init(isDark:)`.
- **Android-port note**: Trivial Compose `Column` with icon + title + subtitle. Localized strings `story.timeline.empty.*`.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/ProTimelineView.swift

- **Purpose**: Landscape/iPad multi-track "Pro" editor — preview column (~30%) + grouped tracks (~70%) with floating inspector. Largest file in this part.
- **Public API**: `struct ProTimelineView` with `Section` enum (contenu/audio/effets), `TrackGroup`, `SelectionKind` enum (clip/keyframe/transition). Static pure helpers: `resolveTrackGroups`, `shouldShowClipInspector`, `resolveClipSnapshot`, `resolveKeyframeSnapshot`, `resolveTransitionSnapshot`, `mapInspectorEasing`, `isMutedForAudio`, `resolveSelectionKind`. Two inits (with/without `previewSlot`).
- **Key behaviors**: Layout splits compact (portrait vertical) vs regular (30/70 HStack) by `horizontalSizeClass`. Tracks grouped into 3 sections. **Inspector dispatch** resolves selection by priority clip → keyframe → transition (selection bus is shared across all 3 element types). Synthetic background clips suppress the inspector. Per-clip mute = global mute OR volume ≤ 0. Drag callbacks capture origin once in `selection.activeDrag.originalStartTime` to avoid cumulative-translation drift. `.equatable()` on all clip bars to short-circuit re-render during playhead scrubbing. Zoom 0.25–4.0, ruler resolution adapts to pixels-per-second.
- **Dependencies**: `TimelineViewModel`, `QuickTimelineView`, all clip bars/inspectors, `TimelineGeometry`, `StoryComposerViewModel.isSyntheticTimelineClipId`.
- **Android-port note**: Compose `BoxWithConstraints` for the 30/70 split; `WindowSizeClass` for compact/regular. Pure resolver helpers port 1:1 to Kotlin object functions. Inspector overlay = Compose `Box` `align`. Equatable optimization → Compose stable/`@Immutable` data classes + `key()`.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/QuickTimelineView.swift

- **Purpose**: Portrait-first "Quick" timeline — compact (≤3 tracks) vs expanded (all tracks) modes.
- **Public API**: `struct QuickTimelineView`; `compactMaxTracks = 3`; `CompactTrack` struct (id/title/kind/clipIds, `Kind` enum video/audio/text/image + bg variants). Static helpers `resolveCompactTracks`, `resolveAllTracks`, `clipTitle`, `footerLabelKey`, `previewHeightFraction`, `iconName(for:)`.
- **Key behaviors**: Media split by `mediaType` so images/videos get separate per-kind numbered tracks ("Image 1", "Vidéo 1"). Compact mode prioritizes the track containing the selected clip. Swipe-up gesture expands. Preview slot height 60% collapsed / 30% expanded. Footer "deploy N tracks" trigger hidden when nothing to reveal.
- **Android-port note**: Compose `Column` with `AnimatedVisibility`; swipe via `pointerInput`/`detectVerticalDragGestures`. Track resolution helpers port directly.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineContainerSwitcher.swift

- **Purpose**: Chooses Quick vs Pro container by size class with explicit user override; hosts the mode switcher header.
- **Public API**: `struct TimelineContainerSwitcher`; static `resolveAutoMode(horizontalSizeClass:currentMode:)`.
- **Key behaviors**: `.onChange(of: horizontalSizeClass)` auto-switches mode; user toggle via `TimelineModeSwitcher`. State lives in the VM so swap loses nothing.
- **Android-port note**: Compose conditional composition keyed on `WindowSizeClass`; mode held in VM `StateFlow`.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Controls/TimelineModeSwitcher.swift

- **Purpose**: Segmented control (Simple / Pro).
- **Public API**: `struct TimelineModeSwitcher: View, Equatable` — `init(mode:isDark:onSelect:)`; static `a11yLabelKey(for:)`.
- **Android-port note**: Compose `SegmentedButtonRow` (Material 3) or custom capsule pill.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Controls/TimelineToolbar.swift

- **Purpose**: Pro-only toolbar: undo/redo, snap toggle, ruler-resolution readout.
- **Public API**: `struct TimelineToolbar`; static `formatRulerResolution(seconds:)`, `snapAccessibilityKey(isOn:)`, `hasKeyboardShortcuts`, `minimumHitTargetSize` (44×44).
- **Key behaviors**: Keyboard shortcuts ⌘Z / ⇧⌘Z via invisible overlay buttons. 30×30 icons extended to 44×44 hit targets via `contentShape` inset.
- **Android-port note**: Compose `Row` of `IconButton`s; keyboard shortcuts via `onKeyEvent` (less common on Android — physical keyboard / Chromebook only). Maintain 48dp touch targets.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Controls/TransportBar.swift

- **Purpose**: Shared transport row (play/pause, time readout, zoom cluster, mute).
- **Public API**: `struct TransportBar` (primitive `let` props, no observed objects). Static `formatTime`, `formatTimeCompact`, `zoomLabel`, `modeSwitchLabel`, `hasKeyboardShortcuts`, `minimumHitTargetSize`.
- **Key behaviors**: Space = play/pause keyboard shortcut. Compact time format (`0:00.0` / `1:05`) for display, full ms precision reserved for accessibility. Zoom buttons multiply/divide by 1.25.
- **Android-port note**: Compose `Row`; primitive params → stateless composable. `monospacedDigit` → `FontFamily.Monospace` digits.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Indicators/OfflineIndicatorBadge.swift

- **Purpose**: Subtle ambient offline indicator (no red/modal/banner).
- **Public API**: `struct OfflineIndicatorBadge: View, Equatable` — `init(isOffline:)`. Hidden when online (zero layout).
- **Android-port note**: Compose `AnimatedVisibility` + `AssistChip`-style capsule. Tied to the offline-first architecture (NetworkObserver).

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipInspector.swift

- **Purpose**: Per-clip editor surface — stateless, snapshot in / callbacks out.
- **Public API**: `struct ClipInspector`; `ClipSnapshot` (id/displayName/`Kind`/startTime/duration/volume/fadeIn/fadeOut/isLooping/isBackground); `fadeRange 0...3`; callbacks `onVolumeChanged/onFadeIn/onFadeOut/onLoopToggled/onBackgroundToggled/onAddKeyframe/onDelete`. Static `hasAudioAffordances`, `supportsLoop`, `accessibilityLabel(for:)`, `formatTime`.
- **Key behaviors**: Local `@State` for smooth in-flight slider drags; **`.onChange(of: clip)` resyncs state after undo/redo** (SwiftUI keeps view identity, doesn't re-run init). Volume/loop hidden for image/text clips. Sliders commit on `editing == false` only.
- **Android-port note**: Compose: hoist callbacks; use `remember(clip)` keyed on snapshot to reset local slider state (equivalent of `.onChange`). Commit-on-release = track `Slider`'s `onValueChangeFinished`.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/InspectorPresentation.swift

- **Purpose**: Enum `InspectorPresentation` (`.sheet` Quick / `.popover` Pro).
- **Android-port note**: Kotlin enum; sheet = `ModalBottomSheet`, popover = anchored `Popup`/floating `Card`.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/KeyframeInspector.swift

- **Purpose**: Keyframe editor sheet (position X/Y, scale, opacity, easing).
- **Public API**: `struct KeyframeInspector`; `Easing` enum (linear/easeIn/easeOut/easeInOut/spring, `displayName`); `KeyframeSnapshot` (id/absoluteTime/x/y/scale/opacity); `exposedEasingsAtLaunch = [.linear]`, `exposedEasings(advanced:)`; callbacks `onPositionChanged/onScaleChanged/onOpacityChanged/onEasingChanged/onDelete`.
- **Key behaviors**: Sliders X/Y 0–1, scale 0.1–4.0, opacity 0–1; commit on release. Easing picker gated — only linear at launch unless `isAdvancedEnabled`.
- **Android-port note**: Compose sheet with `Slider`s + `SingleChoiceSegmentedButtonRow`. Easing maps to Compose `Easing` (`LinearEasing`, `FastOutSlowInEasing`, etc.).

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/TransitionInspector.swift

- **Purpose**: Transition editor (kind = crossfade/dissolve, duration 0.1–2.0s).
- **Public API**: `struct TransitionInspector`; `TransitionSnapshot` (id/fromClipId/toClipId/kind/duration); `durationRange 0.1...2.0`; static `linearEasingName`, `easingDisabledNoticeText`.
- **Android-port note**: Compose sheet. `StoryTransitionKind` is a shared SDK enum.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/DurationHandle.swift

- **Purpose**: Draggable diamond handle to set slide/clip duration.
- **Public API**: `struct DurationHandle`; static `clamp`. Min 2s / max 600s defaults; accessibility adjustable ±0.5s.
- **Android-port note**: Compose `Canvas` diamond + `draggable`; map drag px → seconds via `pixelsPerSecond`.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/KeyframeMarkerView.swift

- **Purpose**: Small diamond marker on a clip lane representing a keyframe.
- **Public API**: `struct KeyframeMarkerView: View, Equatable` — keyframeId/absoluteTime/geometry/laneHeight/isSelected + `onTap/onLongPress/onDragDelta`.
- **Android-port note**: Compose `Canvas` diamond + combined tap/long-press/drag gestures.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/PlayheadView.swift

- **Purpose**: Draggable playhead (triangle + vertical line) with scrub gesture.
- **Public API**: `struct PlayheadView: View, Equatable`; `onScrub/onScrubBegan/onScrubEnded`; `computedX`; `nonisolated static scrubTime(dragStartX:translationX:geometry:totalDuration:)` (pure, testable).
- **Key behaviors**: **Anchors `dragStartX` once at drag start** — derives position from `dragStartX + translation` not `computedX + translation`, preventing jitter when the engine async-updates `currentTime` mid-scrub. DragGesture has no `.onBegan` so it's synthesized via a `dragInFlight` flag. Accessibility step = 1/60s frame.
- **Android-port note**: Compose `Canvas` + `pointerInput` `detectDragGestures`; capture `dragStartX` in `onDragStart`. The anchor-once pattern is essential — keep it.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/RulerView.swift

- **Purpose**: Time ruler with adaptive tick interval + labels.
- **Public API**: `struct RulerView: View, Equatable`; static `tickInterval(for:zoom)`, `formatTick`, `labelHalfWidth`.
- **Key behaviors**: Tick interval scales with zoom (5s → 0.05s). Tap/drag emits time. Leftmost label shifted to avoid clipping; tick line stays time-anchored.
- **Android-port note**: Compose `Canvas` for ticks + `Text` labels; tick interval helper ports directly.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/SnapGuideView.swift

- **Purpose**: Magenta snap guide line + label shown while dragging near a snap target.
- **Public API**: `struct SnapGuideView`; `snapColorHex = "EC4899"` (intentional brand exception).
- **Android-port note**: Compose overlay `Box`, non-hit-testing.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/AudioClipBar.swift

- **Purpose**: Audio clip on a track lane — waveform, title chip, mute badge, drag.
- **Public API**: `struct AudioClipBar: View, Equatable`; full props + `onTap/onDoubleTap/onLongPress/onMoveDelta/onMoveEnded`; `accessibilityComposed`, `accessibilityValueDescription`.
- **Key behaviors**: Waveform renders only if `waveformSamples` non-empty (guards against past index-out-of-range crash). `.drawingGroup()` bakes waveform to a Metal layer for perf. `onMoveEnded` commits the drag (avoids cumulative drift).
- **Android-port note**: Compose `Canvas` waveform; `drawingGroup` → `Modifier.drawWithCache` / `graphicsLayer`. Combined gestures via `pointerInput`.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TextClipBar.swift

- **Purpose**: Text overlay clip on a track lane.
- **Public API**: `struct TextClipBar: View, Equatable`; static `previewSnippet(_:maxLength:)`; same gesture callbacks.
- **Android-port note**: Compose `Box` + truncated `Text`.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TrackBarView.swift

- **Purpose**: Generic track row — sticky 72pt leading label + scrollable lane (generic over `Content`).
- **Public API**: `struct TrackBarView<Content: View>`; `iconName` optional SF Symbol type marker; `accessibilityComposedLabel`.
- **Android-port note**: Compose composable taking a `content: @Composable () -> Unit` slot; sticky label = fixed-width `Row`.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TransitionBadge.swift

- **Purpose**: Diamond badge at clip boundary representing a transition; drag adjusts duration.
- **Public API**: `struct TransitionBadge: View, Equatable`; `onTap/onLongPress/onDurationDelta`; `accessibilityComposed`.
- **Android-port note**: Compose `Canvas` diamond + icon; drag → duration delta.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/VideoClipBar.swift

- **Purpose**: Video/image clip bar — frame strip, fade gradients, trim handles, drag, lock badge, selection halo.
- **Public API**: `struct VideoClipBar: View, Equatable`; `frames: [UIImage]`; callbacks `onTap/onDoubleTap/onLongPress/onTrimStartDelta/onTrimEndDelta/onMoveDelta/onMoveEnded`.
- **Key behaviors**: Locked (synthetic background) clips render muted indigo, no trim handles; real video clips render green. Frame strip divides width / frame count. Fade gradients sized by `geometry.width(for: fade)`. Equatable compares `frames.count` not identity (perf).
- **Android-port note**: Compose `Row` of frame `Image`s; trim handles = small draggable `Box`es at edges. Frames decoded via Media3 `MetadataRetriever` / a `VideoFrameExtractor` equivalent.

## packages/MeeshySDK/Sources/MeeshyUI/Story/TimelineTrackView.swift

- **Purpose**: **Legacy / parallel** track-bar implementation (Plan 3) — `TrackType` enum, `TimelineTrack` mutable struct, `TimelineTrackBar` (binding-based), `TrackLabel`.
- **Public API**: `enum TrackType` (video/image/drawing/audio/text + legacy bg/fg aliases, `icon`/`color`/`sortOrder`); `struct TimelineTrack: Identifiable`; `struct TimelineTrackBar` (`@Binding var track`, drag handles, gestures); `struct TrackLabel`.
- **Key behaviors**: Direct `@Binding` mutation of track + three drag gestures (left/right handle resize, center move) using `.simultaneously(with:)` to capture drag-start values. Loads video frames via `VideoFrameExtractor.shared.extractFrames`. Caps resize to `mediaDuration`.
- **TECH DEBT / Android note**: This is the **old Plan 3 design that the Plan 4 `TimelineViewModel` + clip-bar views supersede**. Two parallel timeline implementations exist (binding-mutation vs command-stack). **Android should port ONLY the Plan 4 architecture** (command stack + immutable project) and drop `TimelineTrackView.swift` / `TrackDetailPopover.swift`.

## packages/MeeshySDK/Sources/MeeshyUI/Story/TrackDetailPopover.swift

- **Purpose**: Legacy popover editor for a `TimelineTrack` (timing, fades, volume, loop, delete).
- **Public API**: `struct TrackDetailPopover` (`@Binding var track`, `onChanged/onDelete/onDismiss`).
- **Android-port note**: Legacy — superseded by `ClipInspector`. Skip; port `ClipInspector` instead.

## packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift

- **Purpose**: Unified composer for Post / Status / Story creation, including **repost-as-post** mode with canvas reprojection.
- **Public API**: `struct UnifiedPostComposer`; 4 inits (sync/async publish, sync/async repost). `RepostImportResult` struct (texts/media/stickers/drawingData/audios/warnings/targetSize, `hasClampedItems`). Extension `importFromStory(_:targetSize:)` reprojecting a `RepostPayload`. Test-only `triggerPublishForTests*`.
- **Key behaviors**: Type tabs (post/status/story). Story tab opens `StoryComposerView` full-screen. Photo/video picker via `PhotosPicker` → image editor (`MeeshyImagePreviewView`) / video preview. **Async publish with rollback** — `isPublishing` reset to `false` if handler throws so user can retry. Repost mode embeds `StoryReaderRepresentable`, auto-imports source story canvas items once, reprojects to target aspect ratio via `CanvasReprojector`, surfaces a discreet "N items repositioned" banner. Mood emoji picker for status.
- **Dependencies**: `StoryComposerView`, `StoryReaderRepresentable`, `MeeshyImagePreviewView/VideoPreviewView`, `CanvasReprojector`, `RepostPayload`, story object types, `ThemeManager`, `HapticFeedback`.
- **Android-port note**: Compose screen with tab row; `ActivityResultContracts.PickVisualMedia` for photo/video. Async publish + rollback = `viewModelScope.launch` with try/catch resetting an `isPublishing` `StateFlow`. Repost reprojection logic (`importFromStory`) ports to a pure Kotlin function.

## packages/MeeshySDK/Sources/MeeshyUI/Theme/ColorExtensions.swift

- **Purpose**: `Color(hex:)` initializer + WCAG `luminance` + `ConversationColorPalette → Color` accessors.
- **Public API**: `Color(hex:)`, `Color.luminance` (relative luminance for legible fg picking); `ConversationColorPalette.primaryColor/secondaryColor/accentColor`.
- **Android-port note**: Kotlin `Color(android.graphics.Color.parseColor("#$hex"))` extension; luminance via `ColorUtils.calculateLuminance`. Conversation accent palette is shared SDK logic.

## packages/MeeshySDK/Sources/MeeshyUI/Theme/DesignTokens.swift

- **Purpose**: Design constants — spacing, radius, font sizes, shadows, animations, iPad layout widths.
- **Public API**: `MeeshySpacing` (xs 4 … xxxl 32), `MeeshyRadius` (sm 10 … xxl 24, full), `MeeshyFont` sizes, `MeeshyShadow` (subtle/medium/strong), `MeeshyAnimation` (springFast/Default/Bouncy, staggerDelay), `MeeshyLayout` (formMaxWidth 600, contentMaxWidth 700); `View.iPadFormWidth(_:)`.
- **Android-port note**: Kotlin `object` with `Dp`/`Sp` constants — central design-token file for Compose theme. iPad form width → tablet `WindowSizeClass` constraint.

## packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift

- **Purpose**: Brand color palette — Indigo scale, semantic colors, gradients.
- **Public API**: `nonisolated struct MeeshyColors` — `indigo50…indigo950`, `brandPrimary/Deep`, `neutral400/500/600`, `brandPrimaryHex/brandDeepHex`, semantics `success/error/warning/info/readReceipt/pinnedBlue/errorDark`, `unreadBadgeBackground(isDark:)`, gradients `brandGradient`/`brandGradientLight`/`brandGradientSubtle`/`avatarRingGradient`/`accentGradient`, theme-aware gradient functions, deprecated legacy aliases (`pink`/`coral`/`cyan`…).
- **Android-port note**: Kotlin `object MeeshyColors` of `Color` constants; gradients → `Brush.linearGradient`. **Do NOT port deprecated aliases.** Signature gradient `#6366F1 → #4338CA` is sacred.

## packages/MeeshySDK/Sources/MeeshyUI/Theme/ThemeManager.swift

- **Purpose**: Singleton theme controller — light/dark/system preference, persisted, derived colors.
- **Public API**: `enum ThemePreference` (system/light/dark, `icon/label/tintColor/next()/resolvedMode`); `class ThemeManager: ObservableObject` singleton — `@Published mode`, `@Published preference` (persisted to `UserDefaults`), `resolveMode/syncWithSystem/cyclePreference`, `preferredColorScheme`, derived color accessors (`backgroundPrimary/Secondary/Tertiary`, `surface/border`, `textPrimary/Secondary/Muted`, `accentText`, `buttonGradient/Shadow`, `ambientOrbs`, `backgroundGradient`, `inputBackground/Border`, semantics). `ThemeKey` EnvironmentKey + `EnvironmentValues.theme`.
- **Key behaviors**: Reads system trait on init, observes `didBecomeActive` to re-resolve, persists preference. `ambientOrbs` returns positioned indigo orb specs.
- **Android-port note**: Kotlin singleton or DataStore-backed `ThemeRepository` exposing `StateFlow<ThemeMode>`; preference persisted via **DataStore** (not SharedPreferences ideally). Derived colors → a Compose `MaterialTheme` + custom `CompositionLocal` for the extended palette. `Environment(\.theme)` → `CompositionLocalProvider`.

## packages/MeeshySDK/Sources/MeeshyUI/Theme/ViewModifiers.swift

- **Purpose**: Reusable visual `ViewModifier`s and animations.
- **Public API**: `GlassCard`, `GlowingBorder`, `PressableButton`, `ShimmerEffect`, `PulseEffect`, `BreathingGlow`, `StaggeredAppear`, `BounceOnAppear`, `FloatingAnimation`, `BounceOnTap`, `BounceOnFocus`, `RoundedCorner` shape; `View` extensions `glassCard/glowingBorder/pressable/shimmer/pulse/breathingGlow/staggeredAppear/bounceOnAppear/floating/bounceOnTap/bounceOnFocus/ifTrue/cornerRadius(_:corners:)`.
- **Android-port note**: Each modifier → a Compose `Modifier` extension or wrapper composable. Shimmer/pulse/breathing/floating = `rememberInfiniteTransition`. Glass card = `Modifier.background` with blur/`graphicsLayer`. `ifTrue` → `Modifier.then` conditional.

## packages/MeeshySDK/Sources/MeeshyUI/Utilities/EmojiDetector.swift

- **Purpose**: Detects emoji-only messages (1–3 emoji) to render them oversized.
- **Public API**: `enum EmojiDetector`; `EmojiOnlyResult` (single/double/triple/notEmojiOnly, `fontSize` 90/60/45/nil); `analyze(_:)`.
- **Android-port note**: Kotlin object; emoji detection via `Character.getType` / ICU / `androidx.emoji2`. Used by chat bubble rendering.

## packages/MeeshySDK/Sources/MeeshyUI/Utilities/EntityImagePickerFlow.swift

- **Purpose**: `ViewModifier` wiring a `PhotosPicker` → image editor → compressed `Data` callback.
- **Public API**: `EntityImagePickerFlow` modifier; `View.entityImagePickerFlow(pickerItem:context:accentColor:maxSizeKB:onCompressed:)`. `UIImage: Identifiable` retroactive conformance.
- **Android-port note**: Compose: `rememberLauncherForActivityResult(PickVisualMedia)` + image-editor route + `ImageCompressor`. Used for avatar/entity image selection.

## packages/MeeshySDK/Sources/MeeshyUI/Utilities/HapticFeedback.swift

- **Purpose**: Wrapper over `UIFeedbackGenerator`.
- **Public API**: `struct HapticFeedback` — `light/medium/heavy/success/error` (`@MainActor`). Generators kept as warm static singletons.
- **Android-port note**: Kotlin object using `HapticFeedbackConstants` / `View.performHapticFeedback` or Compose `LocalHapticFeedback`. Map success/error to long-press/reject patterns.

## packages/MeeshySDK/Sources/MeeshyUI/Utilities/ImageCompressor.swift

- **Purpose**: JPEG compression to a target KB budget.
- **Public API**: `enum ImageCompressor` — `compress(_:maxSizeKB:)`, iteratively drops quality 0.8 → 0.1.
- **Android-port note**: Kotlin `Bitmap.compress(JPEG, quality, stream)` in a loop.

## packages/MeeshySDK/Sources/MeeshyUI/Utilities/LanguageDisplay.swift

- **Purpose**: Language metadata table — code → flag emoji, name, color hex (~40 languages).
- **Public API**: `struct LanguageDisplay` (code/flag/name/color); `defaultColor`, `colorHex(for:)`, `from(code:)`.
- **Android-port note**: Kotlin `object` with a `Map<String, LanguageDisplay>`. Central to the Prisme Linguistique UI (language badges). Reuse across the whole app.

## packages/MeeshySDK/Sources/MeeshyUI/Utilities/MessageTextRenderer.swift

- **Purpose**: Rich text renderer — markdown + Meeshy links + mentions + URLs → styled SwiftUI `Text`.
- **Public API**: `enum MessageTextRenderer` — `render(_:fontSize:color:mentionColor:accentColor:mentionDisplayNames:highlightTerm:)`, `extractURLs(from:)`, `highlightRanges(in:term:)`.
- **Key behaviors**: Priority-ordered regex rule pipeline (`**bold**`, `~~strike~~`, `__underline__`, `*italic*`, `m+TOKEN`, `@mention`, URL). Recursive parsing for nested markdown. **Custom regex URL matcher replaces `NSDataDetector`** — NSDataDetector had a stack-recursion crash on emoji/Unicode-heavy strings during UIKit cell diffing. `m+TOKEN` → `meeshy.me/l/TOKEN`, `@username` → `meeshy.me/u/username`. Mentions resolve to display names via `mentionDisplayNames` / `UserDisplayNameCache`. Search-term highlighting via `AttributedString` background color.
- **Android-port note**: Kotlin → Compose `AnnotatedString` builder + `ClickableText` / `LinkAnnotation`. Port the regex pipeline directly (Java/Kotlin `Regex`). The NSDataDetector lesson is iOS-specific — Android can use `Linkify`/`Patterns.WEB_URL` but a deterministic regex is still preferable. **High-reuse — core chat rendering.**

## packages/MeeshySDK/Sources/MeeshyUI/Utilities/TextAnalyzer.swift

- **Purpose**: On-device sentiment + language detection for the composer "smart context zone".
- **Public API**: `enum SentimentLevel` (7 levels, `emoji`, `from(score:)`); `struct DetectedLanguage` (id/code/flag/name, `supported` list of 9, `find(code:)`); `class TextAnalyzer: ObservableObject` (`@Published sentiment/language/languageConfidence/isLanguageLocked/languageOverride/showLanguagePicker`; `analyze/setLanguageOverride/lockToLanguage/reset`); `struct SmartContextZone: View`.
- **Key behaviors**: 0.3s debounce. Language detection via `NLLanguageRecognizer`; **locks after 10 words or >0.8 confidence** to stop re-analysis. Sentiment = lexicon scoring with FR/EN/ES/DE positive/negative word dictionaries, normalized to [-1, 1].
- **Android-port note**: Language detection → **ML Kit Language ID** (`LanguageIdentification`). Sentiment lexicon ports as Kotlin maps. `ObservableObject` → ViewModel `StateFlow`; debounce via `flow { }.debounce(300)`. `SmartContextZone` → Compose composable.

## packages/MeeshySDK/Sources/MeeshyUI/Utilities/UserDisplayName.swift

- **Purpose**: Display-name + initials resolution for the various user/sender API types.
- **Public API**: free functions `getUserDisplayName` / `getUserInitials` overloaded for `MeeshyUser`, `APIMessageSender`, `APIConversationUser`, `APIAuthor`.
- **Key behaviors**: Resolution order: displayName → "first last" → username → fallback. Initials = first letter of first two words.
- **Android-port note**: Kotlin extension functions or a `UserDisplayNameResolver` object; overloads → one function on a common interface. **High-reuse.**

## packages/MeeshySDK/Sources/MeeshyUI/VoiceProfile/VoiceProfileManageView.swift

- **Purpose**: Voice-profile management screen — status, cloning toggle, sample list, GDPR delete.
- **Public API**: `struct VoiceProfileManageView` (`init(accentColor:)`); `@MainActor class VoiceProfileManageViewModel: ObservableObject` (`@Published profile/samples/cloningEnabled/showDeleteConfirmation/isLoading`; `loadProfile/toggleCloning/deleteSample/deleteProfile`).
- **Key behaviors**: Loads profile + samples via `VoiceProfileService.shared`. Status card with sample count / total duration / quality %. Cloning toggle with optimistic rollback on failure. **GDPR-compliant delete-all** with confirmation alert (irreversible). Per-sample delete.
- **Dependencies**: `VoiceProfileService`, `VoiceProfile`, `VoiceSample` (SDK core).
- **Android-port note**: Compose screen + `ViewModel`. `VoiceProfileService` = a Retrofit/coroutine API client. GDPR delete = `AlertDialog`. Status enum maps directly.

## packages/MeeshySDK/Sources/MeeshyUI/VoiceProfile/VoiceProfileWizardView.swift

- **Purpose**: 5-step voice-cloning onboarding wizard.
- **Public API**: `struct VoiceProfileWizardView` (`init(accentColor:onComplete:)`); `@MainActor class VoiceProfileWizardViewModel` (`currentStep: VoiceProfileWizardStep`, `consentGiven`, `birthDate`, `voiceSamples: [Data]`, `errorMessage`; `advanceFromConsent/AgeVerification/Recording`, `processVoiceProfile`, `isAgeVerified`).
- **Key behaviors**: Steps consent → ageVerification → recording → processing → complete. **18+ age gate** computed from `birthDate`. Consent granted via `voiceService.grantConsent(ageVerification:birthDate:)`. Recording embeds `VoiceRecordingView` (≥3 samples, ≥10s each). Processing uploads each sample then waits ~2s. GDPR-explicit consent copy.
- **Android-port note**: Compose multi-step flow (single composable with `when(step)` or nav graph). `DatePicker` → Material 3 `DatePicker`. Progress capsules = `Row` of bars. Age check is a pure function.

## packages/MeeshySDK/Sources/MeeshyUI/VoiceProfile/VoiceRecordingView.swift

- **Purpose**: Voice sample recorder — prompt text, live waveform, sample list, submit.
- **Public API**: `struct VoiceRecordingView<Recorder: AudioRecordingProviding>` (generic over a recorder protocol — DI seam); `init(recorder:accentColor:minimumSamples:minimumDurationSeconds:onSamplesReady:)`; convenience init defaulting to `DefaultSDKAudioRecorder`. `struct RecordedSample` (id/duration/data/url).
- **Key behaviors**: Reads `recorder.isRecording/duration/audioLevels`. Live 15-bar waveform animated from `audioLevels`. Rotates 5 prompt texts. **Rejects samples shorter than `minimumDurationSeconds`**. Submit fires `onSamplesReady` with `[Data]` once ≥ `minimumSamples`.
- **Dependencies**: `AudioRecordingProviding` protocol, `DefaultSDKAudioRecorder` (SDK core), AVFoundation.
- **Android-port note**: `AudioRecordingProviding` → Kotlin interface backed by `MediaRecorder`/`AudioRecord`. Generic recorder = constructor DI. Waveform driven by amplitude polling (`MediaRecorder.getMaxAmplitude()`). Compose `Canvas` bars.

---

## Architecture observations

### State management
- **Plan 4 timeline = command-stack architecture**: `TimelineViewModel` (`@Observable @MainActor`) owns an immutable-ish `TimelineProject` value type. Every edit is a typed `Command` with `apply`/`revert`, pushed onto a `CommandStack` enabling full undo/redo and serializable history (`CommandStackSnapshot` for persistence). Android must port this exactly (sealed `TimelineCommand`, immutable `data class TimelineProject`, list+cursor stack).
- ViewModels use **constructor dependency injection** with `.shared` defaults and **protocol seams** (`TimelineEngineProviding`, `AudioRecordingProviding`) for testability — port these as Kotlin interfaces.
- Theme is a persisted singleton (`ThemeManager`) exposed via SwiftUI `Environment`; legacy voice-profile VMs use `ObservableObject` + `@Published`.

### Concurrency
- Bootstrap/reconfigure run in **cancellable `Task`s** — `scheduleEngineReconfigure` cancels any in-flight configure before re-issuing, preventing a race on the engine. Android: `viewModelScope` jobs with explicit `cancel()`.
- `TextAnalyzer` debounces (0.3s) and locks language detection after 10 words to bound CPU.

### Performance techniques (must preserve)
- **Equatable structs everywhere** (`VideoClipBar`, `AudioClipBar`, `RulerView`, `PlayheadView`, etc.) with `.equatable()` to short-circuit SwiftUI body re-evaluation during 60fps playhead scrubbing. Android → `@Immutable`/`@Stable` data classes + `key()` + skippable composables.
- **Leaf views take primitive `let` params, never `@ObservedObject`** on global singletons — explicit Instant-App rule. Android: hoist state, pass primitives.
- `.drawingGroup()` on the audio waveform bakes it to a Metal layer. Android → `graphicsLayer`/`drawWithCache`.
- **Anchor-once drag pattern**: playhead and clip drags capture the origin (`dragStartX` / `activeDrag.originalStartTime`) once at gesture start and derive position from `origin + cumulativeTranslation` — prevents jitter/snowball drift when async engine updates arrive mid-gesture. Critical to keep.
- Scrub precision auto-selection (imprecise during drag, precise on release) avoids AVPlayer GOP-decompression freeze — Android equivalent via ExoPlayer `SeekParameters`.

### Anti-patterns / tech debt — do NOT carry over
- **Two parallel timeline implementations coexist**: the legacy Plan 3 `TimelineTrackView.swift` (`TimelineTrack` mutable struct, `@Binding` mutation, `TrackDetailPopover`) vs the Plan 4 command-stack architecture. Android should port **only Plan 4** and discard `TimelineTrackView.swift` + `TrackDetailPopover.swift`.
- `MeeshyColors` carries a block of `@available(*, deprecated)` legacy aliases — exclude from the Android palette.
- Several VM error handlers silently swallow errors (`catch { // Handle error }`) in `VoiceProfileManageViewModel` — Android should surface these to UI state.

### Portable user-facing features
- [ ] Multi-track story video timeline editor (Quick + Pro modes, size-class adaptive)
- [ ] Clip add / move / trim / split / delete with full undo/redo (command stack)
- [ ] Keyframe animation (position, scale, opacity, easing) per clip
- [ ] Clip transitions (crossfade / dissolve, adjustable duration)
- [ ] Per-clip inspector: volume, fade in/out, loop, background, delete
- [ ] Timeline transport: play/pause, scrub playhead, zoom 0.25×–4×, mute
- [ ] Snap-to-grid with magenta snap guides + snap toggle
- [ ] Offline-aware composer with subtle offline indicator
- [ ] Unified post composer (Post / Status / Story tabs)
- [ ] Repost-as-post with canvas reprojection + "items repositioned" banner
- [ ] Photo/video attachment with in-app image editor & compression
- [ ] Voice-cloning onboarding wizard (consent → 18+ age gate → record ≥3 samples → process)
- [ ] Voice-profile management (status, cloning toggle, sample list, GDPR delete-all)
- [ ] Rich message text rendering (markdown, mentions, m+ links, URLs, search highlight)
- [ ] On-device sentiment + language detection "smart context zone" in composer
- [ ] Emoji-only message detection (oversized rendering)
- [ ] Light/dark/system theme with persisted preference
- [ ] Per-language flag/name/color metadata display (~40 languages)
