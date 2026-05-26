# Audit Part 19 — MeeshyUI Media, Navigation, Notifications, Primitives

Scope: 25 files from `packages/MeeshySDK/Sources/MeeshyUI/` covering the media playback/editing subsystem, collapsible navigation header, notification UI, and two UI primitives. This is the reusable SwiftUI component layer of the SDK (UI target), depending on the `MeeshySDK` core target.

---

## packages/MeeshySDK/Sources/MeeshyUI/Media/InlineVideoPlayerView.swift

Purpose: Inline (in-bubble / feed) video player that plays through the shared singleton `SharedAVPlayerManager`, with thumbnail-then-player swap and auto-hiding controls.

Public API:
- `struct InlineVideoPlayerView: View` — init(`attachment: MeeshyMessageAttachment`, `accentColor: String`, `onExpandFullscreen: (() -> Void)?`).
- Private `AVPlayerLayerView: UIViewRepresentable` wrapping `AVPlayerLayer` in a `PlayerUIView` (UIKit-backed layer host).

Key behaviors:
- Aspect ratio derived from `attachment.width/height` (fallback 16:9); capped at `maxHeight 400`.
- "Active" only when `manager.activeURL == attachment.fileUrl` AND local `isActive` flag — prevents multiple inline players from sharing the singleton incorrectly.
- Thumbnail layer chooses: `ProgressiveCachedImage` (thumbHash + URL progressive load) > `VideoThumbnailView` (extract frame) > solid color.
- Controls auto-hide after 3s via `Timer`; tap toggles. On disappear, pauses the shared manager if it owns this URL.
- Duration badge formatted from `attachment.durationFormatted`.

Dependencies: `SharedAVPlayerManager`, `MeeshyMessageAttachment`, `ProgressiveCachedImage`, `VideoThumbnailView`, `VideoPlayerOverlayControls`, `HapticFeedback`, `Color(hex:)`.

Android port: `PlayerView` (Media3/ExoPlayer) inside Compose `AndroidView`. Use a shared `ExoPlayer` from a process-scoped holder mirroring `SharedAVPlayerManager`. Thumbnail = Coil with a video frame fetcher. Auto-hide controls via `LaunchedEffect` + delay coroutine.

---

## packages/MeeshySDK/Sources/MeeshyUI/Media/MediaTranscriptionView.swift

Purpose: Karaoke-style synchronized transcription display — flowing colored text segments that highlight in time with playback and auto-scroll the active segment into view.

Public API:
- `struct MediaTranscriptionView: View` — init(`segments: [TranscriptionDisplaySegment]`, `currentTime: Double`, `accentColor`, `maxHeight`, `onSeek: ((Double) -> Void)?`).
- `struct FlowLayout: Layout` (internal) — custom text-wrapping layout container.

Key behaviors:
- `FlowLayout` implements SwiftUI `Layout` to wrap word/segment spans like text (row-fill with spacing).
- `activeIndex` = first segment where `currentTime` is in `[startTime, endTime)`.
- Each segment is a tappable `Button` calling `onSeek(startTime)`; active = bold + accent + tinted bg, past = dimmed, future = very dim.
- `ScrollViewReader` scrolls active segment to center on change.

Dependencies: `TranscriptionDisplaySegment` (MediaTypes), `ThemeManager`, `HapticFeedback`.

Android port: Compose `FlowRow` (foundation-layout) replaces `FlowLayout`. Highlight via styled `Text` spans; auto-scroll with `LazyColumn`/`rememberLazyListState().animateScrollToItem`. Drive `currentTime` from player position flow.

---

## packages/MeeshySDK/Sources/MeeshyUI/Media/MediaTypes.swift

Purpose: Shared value types/enums for the entire media subsystem — player context, composer modes, playback speed, transcription segments, document/code-language detection, crop ratios, preview contexts, format helpers.

Public API (enums/types — all portable):
- `enum MediaPlayerContext` (messageBubble, composerAttachment, feedPost, storyOverlay, fullscreen) with computed `isCompact/isEditable/showsSocialActions/isImmersive/showsDeleteButton/cornerRadius`.
- `enum ComposerMode` (message, post, status, story, comment, caption) with `placeholder`, `maxLength`, and feature-flag computed props (`showVoice`, `showAttachment`, `showLanguageSelector`, `showEphemeral`, `showEffectsSheet`, `showPermanentEffects`, `sendIcon`).
- `struct AttachmentStatusBody: Encodable` — watch-progress reporting payload (action, playPositionMs, durationMs, complete, wasZoomed).
- `enum PlaybackSpeed: Double` (0.8x–2.25x) with `label` and `next()`.
- `struct TranscriptionDisplaySegment: Identifiable` — text/start/end/speakerId/speakerColor; `speakerPalette` (8 colors); `from(_:speakerIndex:)`, `buildFrom(...)` map `MessageTranscriptionSegment` → display segments assigning per-speaker colors.
- `enum DocumentMediaType` (pdf, pptx, spreadsheet, code(CodeLanguage), generic) with icon/label/color/isCode + `detect(from: MeeshyMessageAttachment)`.
- `enum CodeLanguage` (31 languages) with displayName, color, highlightJsName, and `detect(fileName:mimeType:)` via extension/mime/filename maps.
- `enum CropRatio` (square/4x3/16x9/9x16/free) with aspectRatio + label.
- `enum MediaPreviewContext` (story, post, message, avatar, banner) with cornerRadius/isImmersive/preferredCropRatio/contextLabel/contextIcon.
- `func formatMediaDuration(_:)`, `formatMediaDurationMs(_:)`.

Android port: Direct Kotlin `enum class` / `data class` / `sealed class` translation. `CodeLanguage` detection maps → Kotlin `Map`. `AttachmentStatusBody` → `@Serializable data class`. Highly reusable, low-risk — port verbatim.

---

## packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyAudioEditorView.swift

Purpose: Full-screen audio editor — interactive waveform, trim/crop handles, word-by-word on-device transcription with language selector. Callback returns trimmed URL + transcriptions + trim bounds.

Public API: `struct MeeshyAudioEditorView: View` — init(`url: URL`, `accentColor`, `onConfirm: (URL, [StoryVoiceTranscription], TimeInterval, TimeInterval) -> Void`, `onDismiss`, `onCancel?`).

Key behaviors:
- `AVPlayer` with 0.05s periodic time observer; loops playback within `[trimStart, trimEnd]`.
- Waveform via `AudioWaveformAnalyzer` (StateObject, `analyze(url:barCount:)`); 100 bars; bars colored by in-trim-region + playhead progress.
- Scrub gesture maps drag x → seek; trim handles use 44pt touch targets, nearest-handle detection, min 0.5s gap.
- Playback rates: 0.75–2.0x.
- Transcription: `SFSpeechRecognizer` — exports the *trimmed segment only* (`AVAssetExportSession`, M4A preset) before recognition; word-level `TimedSegment` with timestamps; highlighted `AttributedString` follows playback.
- Language picker: `SFSpeechRecognizer.supportedLocales()` filtered to those with a `LanguageDisplay` SDK entry; default device locale → fr fallback.

Dependencies: `AVFoundation`, `Speech`, `AudioWaveformAnalyzer`, `StoryVoiceTranscription`, `LanguageDisplay`, `DynamicColorGenerator`, `ThemeManager`, `MeeshyColors`, `HapticFeedback`.

Android port: ExoPlayer/MediaPlayer + custom waveform Canvas. Trim/transcription = Android `SpeechRecognizer` is poor for file URLs — prefer server-side transcription (translator service) or ML Kit. Trim export via `MediaMuxer`/`MediaExtractor`. Significant rework; consider delegating transcription to backend.

---

## packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyAudioPreviewView.swift

Purpose: Pre-send audio preview screen rendered per `MediaPreviewContext` (story/post/message styling), with Edit (opens editor) and Use/OK actions.

Public API: `struct MeeshyAudioPreviewView: View` — init(`url`, `context: MediaPreviewContext`, `accentColor`, `onAccept: (URL, [StoryVoiceTranscription], TimeInterval, TimeInterval) -> Void`, `onCancel?`).

Key behaviors:
- Context-specific layouts: story = big circle + waveform; post = card row; message = compact bubble.
- `AudioWaveformAnalyzer` waveform (40/60 bars); progress fill follows `currentTime`.
- `fullScreenCover` presents `MeeshyAudioEditorView`; stores edited transcriptions + trim bounds; `acceptAudio()` forwards either edited or full-range bounds.

Dependencies: `MeeshyAudioEditorView`, `AudioWaveformAnalyzer`, `MediaPreviewContext`, `StoryVoiceTranscription`.

Android port: Compose screen with `when(context)` branching; `ModalBottomSheet`/full-screen dialog for editor. Same waveform component as editor.

---

## packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyImageEditorView.swift

Purpose: Full-screen image editor — crop (with ratio presets + draggable handles), filters, adjustments, and effects, with rotate. Renders final `UIImage`.

Public API:
- `struct MeeshyImageEditorView: View` — init(`image: UIImage`, `initialCropRatio: CropRatio?`, `accentColor`, `onAccept: (UIImage) -> Void`, `onCancel?`).
- `struct CropOverlayView` (internal) — `@Binding cropRect`, draggable handles; `CropHandle` enum (corners/edges/center).
- Private `CropFrameView`, `GridLinesView` (rule-of-thirds), `CornerHandleShape`, `CropRatioButton`.

Key behaviors:
- Tabs: crop / filters / adjustments / effects (`EditTab`).
- `ImageFilterEngine` (StateObject) drives filters/brightness/contrast/saturation/sharpness/vignette/effect; thumbnails generated async via `generateThumbnails(from:)`.
- Debounced preview rendering (100ms `Task.sleep`, cancelable).
- Crop math: display rect computed from aspect fit; aspect-ratio-locked handle dragging; `applyCrop()` scales crop rect to image coordinates and uses `cgImage.cropping`.
- `applyRotation` via `UIGraphicsImageRenderer` affine transform.
- Effects panel = `LazyVGrid` (3 cols); filters = horizontal scroll of 68pt thumbnails.

Dependencies: `ImageFilterEngine`, `ImageFilter`, `ImageEffect`, `CropRatio`, `HapticFeedback`, Core Image (via engine).

Android port: This is the heaviest port. Compose + custom `Canvas`/`Modifier.pointerInput` for crop handles. Filters/adjustments via `RenderEffect` (API 31+) or GPUImage/RenderScript-replacement library or a Compose graphics-layer color matrix. Crop export via `Bitmap` region decode. Plan a dedicated image-editing module.

---

## packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyImagePreviewView.swift

Purpose: Pre-send image preview rendered per `MediaPreviewContext`, with Edit (opens `MeeshyImageEditorView`) and Use/OK actions.

Public API: `struct MeeshyImagePreviewView: View` — init(`image: UIImage`, `context: MediaPreviewContext`, `accentColor`, `onAccept: (UIImage) -> Void`, `onCancel?`).

Key behaviors:
- Context layouts: story = full-bleed fill; post = rounded + caption stub; message = rounded; avatar = circle 120; banner = 200h clip.
- `fullScreenCover` → editor; `displayImage` = edited ?? original; passes `context.preferredCropRatio` to editor.

Android port: Compose screen, `when(context)` styling, Coil/`Image` with `ContentScale`. Editor launched via dialog/route.

---

## packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoEditorView.swift

Purpose: Full-screen video editor/preview — looping playback, mute toggle, scrubber, auto-hiding controls, and on-device transcription panel.

Public API: `struct MeeshyVideoEditorView: View` — init(`url: URL`, `accentColor`, `onAccept: () -> Void`, `onCancel?`).

Key behaviors:
- `VideoPlayer` (disabled hit-testing) + custom tap-to-play/pause with center flash (`VideoPlayPauseFlash`).
- Looping via `AVPlayerItemDidPlayToEndTime`.
- Controls auto-hide after 2.5s (`Task.sleep`); reschedule on interaction.
- Custom scrubber gesture; mute button.
- Transcription: `SFSpeechRecognizer` on full video URL; `VideoTranscriptionState` (idle/loading/done/failed); slide-up panel.
- Note: editor does NOT actually trim — `onAccept` just confirms (transcription/preview only).

Dependencies: `AVKit`, `Speech`, `HapticFeedback`, `MeeshyColors`.

Android port: ExoPlayer `PlayerView` with custom controls overlay; loop via `Player.REPEAT_MODE_ONE`. Transcription → backend recommended.

---

## packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPreviewView.swift

Purpose: Pre-send video preview per `MediaPreviewContext`, with Edit (opens `MeeshyVideoEditorView`) and Use/OK.

Public API: `struct MeeshyVideoPreviewView: View` — init(`url`, `context`, `accentColor`, `onAccept: () -> Void`, `onCancel?`).

Key behaviors: Per-context layouts; auto-looping `VideoPlayer`; tap to play/pause with play-icon overlay; `fullScreenCover` → editor.

Android port: Same pattern as image preview, ExoPlayer-backed.

---

## packages/MeeshySDK/Sources/MeeshyUI/Media/PlaybackCoordinator.swift

Purpose: Singleton arbiter ensuring only one media player plays at a time across audio managers, the shared video manager, and generic external players.

Public API:
- `protocol StoppablePlayer: AnyObject @MainActor { func stop() }`.
- `final class PlaybackCoordinator` (`@MainActor`, `.shared`):
  - `register/unregister(_: AudioPlaybackManager)`, `registerExternal/unregisterExternal(_: StoppablePlayer)`.
  - `willStartPlaying(audio:)`, `willStartPlaying(video:)`, `willStartPlaying(external:)` — stop all others.
  - `stopAll()`.

Key behaviors: Holds players via weak wrappers (`WeakAudioPlayer`, `WeakStoppablePlayer`); prunes dead refs before each operation. `SharedAVPlayerManager.shared` is always stopped on audio/external start.

Android port: Kotlin `object PlaybackCoordinator` with `WeakReference` sets, or better: a single app-scoped `ExoPlayer` + Android `AudioManager.requestAudioFocus` which naturally enforces single-playback. Recommended to lean on audio-focus instead of manual coordination.

---

## packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager.swift

Purpose: Process-wide singleton `ObservableObject` owning a single `AVPlayer` for video — cache-first loading, playback controls, Picture-in-Picture, and watch-progress reporting to the API.

Public API: `final class SharedAVPlayerManager` (`@MainActor`, `.shared`, `ObservableObject`):
- `@Published`: `player`, `isPlaying`, `currentTime`, `duration`, `playbackSpeed`, `activeURL`, `isPipActive`; `attachmentId`.
- `load(urlString:)`, `play()`, `pause()`, `togglePlayPause()`, `seek(to:)`, `skip(seconds:)`, `setSpeed(_:)`, `cycleSpeed()`, `stop()`.
- `configurePip(playerLayer:)`, `startPip()`, `stopPip()`.

Key behaviors:
- 3-tier load: (1) prerolled cached player from `StoryMediaLoader`, (2) `CacheCoordinator.videoLocalFileURL` local file, (3) network stream + background cache fetch.
- Configures `AVAudioSession` `.playback`/`.duckOthers`.
- `play()` calls `PlaybackCoordinator.willStartPlaying(video:)` to stop other players.
- Watch progress: reports `AttachmentStatusBody` action `"watched"` to `POST /attachments/{id}/status` on pause (if ≥3s watched) and on completion.
- KVO via Combine publishers for `rate`, `currentItem.duration`; periodic 0.1s time observer.
- PiP via `AVPictureInPictureController` + `PipDelegate`.

Dependencies: `AVKit`, `Combine`, `StoryMediaLoader`, `CacheCoordinator`, `MeeshyConfig.resolveMediaURL`, `APIClient`, `PlaybackCoordinator`.

Android port: App-scoped `ExoPlayer` holder (`StateFlow`-backed). Cache-first → ExoPlayer `SimpleCache` (the 3-tier logic collapses naturally). PiP → Android `PictureInPictureParams` on the host Activity. Watch progress reporting → reuse `APIClient` equivalent. This is a core architectural component — port carefully.

---

## packages/MeeshySDK/Sources/MeeshyUI/Media/SyntaxHighlighter.swift

Purpose: Pure-Swift regex-free syntax highlighter for code attachments — tokenizer + GitHub-themed `AttributedString` builder, supporting ~16 language definitions.

Public API:
- `enum SyntaxTokenType` (plain, keyword, string, comment, number, type, function, preprocessor, operator_, property, attribute, tag, punctuation).
- `struct SyntaxToken` (text, type).
- `struct SyntaxTheme: Sendable` — full color set; `github(isDark:)`, `githubDark`, `githubLight`, `color(for:)`.
- `struct LanguageDefinition` — keywords/typeKeywords/builtins sets + comment/string config; `definition(for: CodeLanguage)`.
- `struct SyntaxHighlighter` — `tokenize(_:language:) -> [[SyntaxToken]]`, `highlight(_:language:theme:fontSize:) -> [AttributedString]`.

Key behaviors: Hand-written char-by-char tokenizer handling multi-line comments (carried across lines), triple-quoted/backtick/regular strings, preprocessor directives, hex/binary numbers with suffixes, identifiers (function-call detection by trailing `(`), operators, punctuation. Per-language keyword sets for Python/JS/TS/Swift/Go/Rust/Java-Kotlin-Scala/C-Cpp-ObjC/Ruby/PHP/Shell/SQL/CSS-HTML-XML/JSON/YAML + generic fallback.

Android port: Port the tokenizer logic verbatim to Kotlin (returns `List<List<SyntaxToken>>`); render with Compose `AnnotatedString` + `SpanStyle`. `SyntaxTheme` → Kotlin data class with `Color`. Fully portable, no platform dependency.

---

## packages/MeeshySDK/Sources/MeeshyUI/Media/TranscriptionBadgeView.swift

Purpose: Collapsible inline badge showing a transcription preview; expands to full text with language/confidence/on-device metadata chips.

Public API: `struct TranscriptionBadgeView: View` — init(`transcriptionText`, `language: String?`, `confidence: Double?`, `isOnDevice: Bool`, `accentColor`).

Key behaviors: Collapsed = icon + 40-char preview + chevron; expanded shows full text + globe(lang) + sparkles(confidence%) + iphone(on-device) chips. Spring expand animation. Accessibility labels/hints.

Android port: Compose expandable `Card`/`Column` with `AnimatedVisibility`; chips via `AssistChip`/custom rows.

---

## packages/MeeshySDK/Sources/MeeshyUI/Media/UniversalAudioRecorderView.swift

Purpose: Unified full-screen audio recorder (messages/stories/posts) — large record button, live waveform, duration, then preview/edit flow.

Public API: `struct UniversalAudioRecorderView<Recorder: AudioRecordingProviding>: View` — generic over a recorder protocol; init(`recorder`, `context: MediaPreviewContext`, `accentColor`, `settings: AudioRecordingSettings`, `onComplete: (URL, [StoryVoiceTranscription], TimeInterval, TimeInterval) -> Void`, `onCancel`).

Key behaviors:
- Generic dependency injection over `AudioRecordingProviding` (protocol-based — testable; SDK iOS TDD convention).
- Live waveform = 15 bars from `recorder.audioLevels`; recording duration display with blinking red dot; idle prompt.
- Mic permission via `AVAudioSession.requestRecordPermission`.
- `settings.minimumDuration`/`maxDuration` enforced; on stop → `MeeshyAudioPreviewView` in `fullScreenCover`.

Dependencies: `AudioRecordingProviding`, `AudioRecordingSettings`, `MeeshyAudioPreviewView`, `MediaPreviewContext`, `HapticFeedback`.

Android port: `MediaRecorder`/`AudioRecord` behind a `AudioRecorder` interface (DI mirrors the protocol). Mic permission via `ActivityResultContracts.RequestPermission`. Live levels from `AudioRecord` amplitude sampling.

---

## packages/MeeshySDK/Sources/MeeshyUI/Media/VideoFullscreenPlayerView.swift

Purpose: Immersive fullscreen video player using `SharedAVPlayerManager` — full controls, seek bar, speed row, swipe-to-dismiss (→PiP), pinch zoom, save-to-photos, caption rendering.

Public API:
- `struct FullscreenAVPlayerLayerView: UIViewRepresentable` (public) — hosts `AVPlayerLayer`, configures PiP, supports gravity updates.
- `final class OrientationManager` (`@MainActor`, `.shared`, `ObservableObject`) — `orientationLock`, `unlock()`, `lockPortrait()` (uses `requestGeometryUpdate`).
- `struct VideoFullscreenPlayerView: View` — init(`urlString`, `accentColor`, `fileName`, `caption: String?`, `mentionDisplayNames: [String:String]?`).

Key behaviors:
- Unlocks rotation on appear, re-locks portrait on disappear.
- Controls auto-hide 4s; tap toggles.
- Swipe-down >150pt → starts PiP (if playing) then dismisses.
- Pinch toggles `videoGravity` (aspect ↔ aspectFill).
- Speed row (1.0–2.0x); custom seek bar.
- Save-to-photos: downloads file, `PhotoLibraryManager.saveVideo`, `SaveState` machine with 2s reset.
- Caption rendered via `MessageTextRenderer` (mention support).

Dependencies: `SharedAVPlayerManager`, `PhotoLibraryManager`, `MeeshyConfig`, `MessageTextRenderer`, `HapticFeedback`.

Android port: Fullscreen Activity/Composable with ExoPlayer `PlayerView`. Orientation = `requestedOrientation` on Activity. Swipe-to-dismiss → PiP via `enterPictureInPictureMode`. Save to gallery via `MediaStore`. Caption via the mention-aware text renderer equivalent.

---

## packages/MeeshySDK/Sources/MeeshyUI/Media/VideoPlayerOverlayControls.swift

Purpose: Reusable overlay controls (top bar, center transport, bottom seek bar) bound to `SharedAVPlayerManager`, sized for inline vs fullscreen.

Public API: `struct VideoPlayerOverlayControls: View` — init(`manager: SharedAVPlayerManager`, `accentColor`, `isFullscreen: Bool`, `onExpandFullscreen: (() -> Void)?`, `onClose: (() -> Void)?`).

Key behaviors: Scrim gradients top/bottom; expand or close button depending on mode; speed cycle button; skip ±10s; play/pause; draggable seek bar with thumb; time labels. Layout metrics scale with `isFullscreen`.

Android port: Compose overlay `Box` with gradient scrims; controls bound to player `StateFlow`. Reusable across inline/fullscreen.

---

## packages/MeeshySDK/Sources/MeeshyUI/Media/VideoPlayerView.swift

Purpose: Context-aware video player for message bubbles / composer / feed / story — thumbnail + play overlay, inline play for feed/story, speed control, transcription toggle, edit/delete affordances, and a separate self-contained fullscreen player.

Public API:
- `struct VideoPlayerView: View` — init(`attachment: MeeshyMessageAttachment`, `context: MediaPlayerContext`, `accentColor`, `transcription: MessageTranscription?`, `onRequestTranscription`, `onDelete`, `onEdit`).
- `struct VideoFullscreenPlayer: View` — init(`urlString`, `speed: PlaybackSpeed`, `attachmentId: String?`); independent `AVPlayer` (not the shared manager), watch-progress reporting, save-to-photos with `"downloaded"` status report.

Key behaviors:
- `videoHeight`/`videoAspectRatio` per context.
- Feed/story → inline `VideoPlayer`; other contexts → `fullScreenCover` with `VideoFullscreenPlayer`.
- Speed cycling, transcription panel via `MediaTranscriptionView`, delete/edit buttons for composer context.
- `VideoFullscreenPlayer` reports watch progress (`"watched"` ≥3s / on completion) and `"downloaded"` on save.

Dependencies: `AVKit`, `MeeshyMessageAttachment`, `MessageTranscription`, `VideoThumbnailView`, `MediaTranscriptionView`, `PhotoLibraryManager`, `APIClient`, `MeeshyConfig`.

Note / tech-debt: Two parallel fullscreen players exist (`VideoFullscreenPlayerView` using the shared manager + `VideoFullscreenPlayer` using a private player). Watch-progress reporting is duplicated in 3 places. Android port should consolidate to ONE player abstraction.

Android port: Compose component with `when(context)` sizing; ExoPlayer; single fullscreen route.

---

## packages/MeeshySDK/Sources/MeeshyUI/Media/VideoThumbnailView.swift

Purpose: Extracts and caches a video's first-frame thumbnail by range-downloading the first 1 MB of the file.

Public API: `struct VideoThumbnailView: View` — init(`videoUrlString`, `accentColor`).

Key behaviors:
- Checks `CacheCoordinator.shared.thumbnails` (key `thumb:{resolvedUrl}`) for persisted JPEG.
- Else: HTTP `Range: bytes=0-1048575` request, writes temp mp4, `AVAssetImageGenerator` frame at 0.1s (max 300x300), stores JPEG q0.7 back into thumbnail cache.
- Gradient placeholder with video icon while loading.

Dependencies: `AVFoundation`, `CacheCoordinator`, `MeeshyConfig`.

Android port: ExoPlayer/`MediaMetadataRetriever.getFrameAtTime` — Android can retrieve frames over network, but partial-range download then `MediaMetadataRetriever.setDataSource` is the efficient mirror. Cache via Coil disk cache or the `CacheCoordinator` equivalent.

---

## packages/MeeshySDK/Sources/MeeshyUI/Navigation/CollapsibleHeader.swift

Purpose: Reusable scroll-collapsing navigation header — interpolates height/title-size/back-arrow size between expanded (64pt) and collapsed (44pt) based on scroll offset.

Public API:
- `enum CollapsibleHeaderMetrics` — `expandedHeight 64`, `collapsedHeight 44`.
- `struct CollapsibleHeader<LeadingContent, TitleContent, TrailingContent>: View` — generic over three slots; init with title/subtitle/scrollOffset/showBackButton/onBack/colors + `@ViewBuilder` leading/titleView/trailing. Two convenience inits (no-leading-no-title; custom-title-no-leading).

Key behaviors:
- `progress = clamp(-scrollOffset / 60, 0..1)`; `lerp` interpolation of all metrics.
- Subtitle cross-fades between expanded (under title) and collapsed (inline) positions.
- `.ultraThinMaterial` background + gradient overlay; bottom divider fades in with progress.
- Back button + trailing have 44pt minimum tap targets.

Android port: Compose `TopAppBar` with `enterAlwaysScrollBehavior`/`exitUntilCollapsedScrollBehavior` (Material3) covers most of this; or custom `Layout` driven by a `nestedScroll` offset for the cross-fading subtitle. Generic slots → composable lambda params.

---

## packages/MeeshySDK/Sources/MeeshyUI/Navigation/ScrollOffsetPreferenceKey.swift

Purpose: SwiftUI `PreferenceKey` to bubble a scroll-view's vertical offset up to a parent (feeds `CollapsibleHeader`).

Public API: `struct ScrollOffsetPreferenceKey: PreferenceKey` — `defaultValue: CGFloat = 0` (`nonisolated(unsafe)`), `reduce` takes latest.

Android port: No equivalent needed — Compose uses `LazyListState.firstVisibleItemScrollOffset` or `nestedScrollConnection` directly. Drop this file.

---

## packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationListView.swift

Purpose: Full notification center screen — category filter chips, paginated list with SWR caching, real-time socket updates, mark-read/delete.

Public API:
- `struct NotificationListView: View` — init(`onNotificationTap: ((APINotification) -> Void)?`, `onDismiss`).
- `enum NotificationCategory` (internal) — all/unread/messages/reactions/mentions/social/contacts/groups/calls/translations/system; each with label/icon/color and `matchingTypes: Set<MeeshyNotificationType>` + `matches(_:)`.
- `final class NotificationListViewModel` (`@MainActor`, internal) — `notifications`, `isLoading`, `hasMore`, `unreadOnly`, `selectedCategory`, `filteredNotifications`; `loadInitial/loadMore/markRead/markAllRead/deleteNotification`.

Key behaviors:
- SWR cache: `loadInitial` reads `CacheCoordinator.shared.notifications.load(for:"all")` — `.fresh` returns immediately, `.stale` shows then refreshes, `.expired/.empty` shows loader then refreshes; refresh writes back to cache.
- Real-time: subscribes to `NotificationManager` publishers (`objectWillChange`, `newNotificationReceived` → debounced 500ms refresh, `notificationMarkedRead`, `notificationWasDeleted`).
- Category filter is client-side over loaded list; pagination only for `.all`.
- Header = `CollapsibleHeader` driven by `ScrollOffsetPreferenceKey`; "mark all read" trailing action.
- Per-category empty states.

Dependencies: `NotificationManager`, `NotificationService`, `CacheCoordinator`, `APINotification`, `MeeshyNotificationType`, `CollapsibleHeader`, `NotificationRowView`, `os.Logger`.

Android port: Compose screen + `ViewModel` (Hilt). SWR via repository emitting cached-then-network. Real-time via socket event flows. Filter chips = `FilterChip` row. Pagination via Paging 3 or manual `loadMore` on scroll-end.

---

## packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationRowView.swift

Purpose: Single notification list row — avatar with unread dot, title/body, conversation context, relative timestamp, swipe actions.

Public API: `struct NotificationRowView: View` — init(`notification: APINotification`, `onTap`, `onMarkRead`, `onDelete`).

Key behaviors:
- Accent color from `notifType.accentHex`; unread → tinted row bg + dot overlay on avatar.
- `MeeshyAvatar` (context `.notification`) with `senderAvatar` URL.
- Swipe trailing → delete (destructive); swipe leading → mark-read.
- `contextualMessage` — large `switch` over all `MeeshyNotificationType` cases producing human-readable French strings (covers messages, reactions, mentions, contacts, groups, calls, social, security/login, translations, achievements, stories, moods, etc.).
- `relativeTime` parses ISO8601 (with/without fractional seconds) → "maintenant/Nmin/Nh/Nj/Nsem".
- Combined accessibility element.

Dependencies: `APINotification`, `MeeshyNotificationType`, `MeeshyAvatar`, `ThemeManager`.

Android port: Compose row with `SwipeToDismissBox` (Material3) for swipe actions; relative time via `DateUtils.getRelativeTimeSpanString` or custom. The `contextualMessage` switch should ideally move to a shared/server-driven label, but port as-is if needed.

---

## packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationToastView.swift

Purpose: Transient in-app toast for a real-time socket notification event — author avatar (initials), name + conversation context, body preview.

Public API: `struct NotificationToastView: View` — init(`event: SocketNotificationEvent`, `onTap`).

Key behaviors:
- `authorName` resolved from displayName/username/title; `authorInitials` from name parts; `authorColor` from `DynamicColorGenerator.colorForName(senderId/name)`.
- `bodyText` combines `attachmentLabel` + `messagePreview`/`content`.
- `conversationLabel` shown only for non-direct conversations.
- `.ultraThinMaterial` rounded card with accent border + shadow.

Dependencies: `SocketNotificationEvent`, `MeeshyNotificationType`, `DynamicColorGenerator`, `ThemeManager`.

Android port: Compose toast/snackbar-style overlay surfaced from socket event flow; deterministic color via the color-generation port.

---

## packages/MeeshySDK/Sources/MeeshyUI/Primitives/AchievementBadge.swift

Purpose: Circular achievement badge with progress ring, locked/unlocked states, and pulse animation.

Public API: `struct AchievementBadge: View` — init(`achievement: Achievement`).

Key behaviors: 68pt progress ring (`Circle().trim(to: progress)`), 60pt gradient badge, SF Symbol icon, checkmark overlay when unlocked, dimmed (0.4 opacity) when locked, `.pulse` modifier when unlocked.

Tech-debt: uses deprecated `MeeshyColors.pink` for the checkmark badge — Android port should use a semantic/brand color instead.

Dependencies: `Achievement` model, `ThemeManager`, `.pulse` view modifier.

Android port: Compose `Box` with `CircularProgressIndicator`-style arc via `Canvas`/`drawArc`, gradient `Brush`, pulse via `rememberInfiniteTransition`.

---

## packages/MeeshySDK/Sources/MeeshyUI/Primitives/AnimatedLogoView.swift

Purpose: Animated Meeshy brand logo — three stacked dashes of decreasing length that draw in sequentially with an optional continuous "breathe" animation.

Public API:
- `struct MeeshyDashesShape: Shape` — init(`dashIndex: Int` 0/1/2); draws one dash line in a 1024-unit coordinate space, scaled/centered to the view rect.
- `struct AnimatedLogoView: View` — init(`color: Color`, `lineWidth: CGFloat`, `continuous: Bool`).

Key behaviors: Each dash uses `trim(0..1)` reveal with staggered delays (0.1s); when `continuous`, opacity + 1.05 scale "breathe" repeats forever.

Android port: Compose `Canvas` drawing three `drawLine` paths with `PathEffect`/`trim` via animated `Float`; staggered `Animatable` launches; brand logo asset.

---

## Architecture observations

State management & DI
- Singletons dominate: `SharedAVPlayerManager.shared`, `PlaybackCoordinator.shared`, `OrientationManager.shared`, `ThemeManager.shared`, `CacheCoordinator.shared`, `NotificationManager.shared`. Android should map these to DI-provided app-scoped objects (Hilt `@Singleton`) rather than global statics, to keep them testable.
- Good DI pattern worth keeping: `UniversalAudioRecorderView` is generic over an `AudioRecordingProviding` protocol — clean injection point. Mirror with a Kotlin interface.
- Editor views use a debounced rendering `Task` (cancel-on-change) to keep filter previews responsive — port as a cancelable coroutine.

Media architecture (most significant area)
- A single shared video player (`SharedAVPlayerManager`) is the source of truth; inline players key off `manager.activeURL` to avoid conflicts. Android: one app-scoped `ExoPlayer`.
- 3-tier cache-first load (prerolled player → local file → network+background-cache) — strong instant-app behavior; ExoPlayer `SimpleCache` collapses this neatly.
- `PlaybackCoordinator` enforces single-playback across audio/video/external players. On Android, prefer Android `AudioManager` audio-focus, which gives this for free, plus the coordinator pattern only where focus is insufficient.
- Tech-debt to NOT carry over: TWO fullscreen video players (`VideoFullscreenPlayerView` vs `VideoFullscreenPlayer`) and watch-progress reporting (`AttachmentStatusBody` → `/attachments/{id}/status`) duplicated in 3 files. Consolidate into one player + one reporting hook.

Caching / SWR
- `NotificationListView` is a clean reference SWR implementation: `CacheResult` (`.fresh/.stale/.expired/.empty`) → serve stale immediately + background refresh + write-back. Replicate this repository pattern on Android (cached-then-network flow).
- Thumbnails persisted via `CacheCoordinator` with `thumb:` key prefix; range-download (first 1 MB) avoids fetching whole videos for a frame — a worthwhile optimization to keep.

Concurrency
- Heavy use of `@MainActor` + `Task`-based async; `withCheckedContinuation` bridges callback APIs (`SFSpeechRecognizer`, permissions). Android maps to coroutines + `suspendCancellableCoroutine`.
- Real-time updates via Combine publishers from `NotificationManager`; debounced refresh (500ms). Android: `Flow` + `debounce`.

Navigation / performance
- `CollapsibleHeader` + `ScrollOffsetPreferenceKey` implement scroll-driven header collapse — Compose Material3 `TopAppBar` scroll behaviors cover this; the `PreferenceKey` file is unnecessary on Android.
- Lists use `LazyVStack` (Compose `LazyColumn`). No UIKit collection views in this chunk.

Platform-bound risks for the port
- Image editing (`MeeshyImageEditorView`, Core Image filters, crop overlay) is the largest rewrite — needs a dedicated Android module (RenderEffect/graphics-layer color matrices, custom `Canvas` crop UI).
- On-device transcription (`SFSpeechRecognizer`) is used in audio/video editors; Android `SpeechRecognizer` does not transcribe arbitrary files well — recommend routing transcription through the backend translator service instead.
- PiP, orientation control, photo-library save, audio-session management all have Android equivalents but require Activity-level wiring.

Reusable / low-risk ports
- `MediaTypes.swift` and `SyntaxHighlighter.swift` are pure logic — port verbatim to Kotlin, no platform dependency. `SyntaxHighlighter` supplies code-attachment rendering and supports ~16 languages.

Portable user-facing features / capabilities
- [ ] Inline video playback in message bubbles and feed posts (thumbnail → play, auto-hiding controls)
- [ ] Fullscreen immersive video player (seek bar, ±10s skip, speed 1.0–2.0x, swipe-to-dismiss)
- [ ] Picture-in-Picture for video
- [ ] Single-active-player coordination across audio and video
- [ ] Save video to device gallery
- [ ] Video watch-progress reporting to the backend
- [ ] Synchronized karaoke-style transcription display (tap segment to seek)
- [ ] Collapsible/expandable inline transcription badge with language/confidence metadata
- [ ] Full-screen audio editor: waveform, trim/crop, word-level transcription, language picker
- [ ] Audio preview screen with context-specific styling (story/post/message)
- [ ] Universal audio recorder with live waveform, duration limits, min-duration enforcement
- [ ] Full-screen image editor: crop with ratio presets, filters, brightness/contrast/saturation/sharpness/vignette adjustments, effects, rotate
- [ ] Image/video preview screens per posting context (story/post/message/avatar/banner) with Edit + Use
- [ ] Code attachment syntax highlighting (~16 languages, GitHub light/dark themes)
- [ ] Code language auto-detection from file extension/MIME/filename
- [ ] Document type detection (PDF, presentation, spreadsheet, code, generic)
- [ ] Playback speed control with on-screen badge
- [ ] Notification center with category filters (messages, reactions, mentions, social, contacts, groups, calls, translations, system)
- [ ] Notification list with stale-while-revalidate caching and real-time socket updates
- [ ] Notification row swipe actions (mark-read, delete) + unread indicators
- [ ] Mark-all-read and per-notification delete
- [ ] In-app real-time notification toast
- [ ] Achievement badge with progress ring (locked/unlocked states)
- [ ] Animated brand logo (sequential dash draw-in + breathe)
- [ ] Scroll-collapsing navigation header
