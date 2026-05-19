# Unified Video Editor — Redesign

Branche : `claude/redesign-video-editor-DRpy9`

Replaced the fragmented two-step (edit / use) video editing flow with a single
immersive ThemeManager-driven editor for editing an existing video (loaded or
freshly filmed). Simple / Pro switch + FAB + Controller pattern from the Story
composer.

## Engine (MeeshySDK core — no SwiftUI)
- [x] `Video/VideoEditModels.swift` — non-destructive document model + errors
- [x] `Video/VideoEditOperations.swift` — pure operations (trim/split/speed/rotate/crop/audio)
- [x] `Video/VideoEditHistory.swift` — bounded undo/redo
- [x] `Video/VideoRenderGeometry.swift` — rotation/crop transform math (pure, tested)
- [x] `Video/VideoCompositionBuilder.swift` — AVMutableComposition + videoComposition + audioMix
- [x] `Video/VideoExportPipeline.swift` — async, cancelable, progress, timeout-safe export
- [x] `Video/VideoEditSessionStore.swift` — autosave + crash recovery
- [x] `EdgeTranscriptionService` — timeout-safe + cancellation-safe transcription (crash fix)

## UI (MeeshyUI)
- [x] `Media/VideoEditor/VideoEditorMode.swift` — Simple / Pro mode + tools + band state
- [x] `Media/VideoEditor/VideoEditorViewModel.swift` — @MainActor view model
- [x] `Media/VideoEditor/VideoEditorModeSwitcher.swift` — Simple/Pro toggle (timeline style)
- [x] `Media/VideoEditor/VideoEditorTimeline.swift` — center-playhead scrub strip, zoom, snapping
- [x] `Media/VideoEditor/VideoEditorFABColumn.swift` — FAB column (Story composer pattern)
- [x] `Media/VideoEditor/VideoEditorToolPanels.swift` — band + 8 tool controllers
- [x] `Media/VideoEditor/VideoEditorStage.swift` — AVPlayerLayer surface + captions overlay
- [x] `Media/VideoEditor/VideoEditorCaptionsPanel.swift` — transcription + LanguageData picker
- [x] `Media/MeeshyVideoEditorView.swift` — REWRITE: single unified fullscreen view
- [x] Delete `Media/MeeshyVideoPreviewView.swift`

## Call sites
- [x] StoryComposerView, UnifiedPostComposer, FeedView+Attachments (x2), ConversationView+Composer

## Tests
- [x] VideoEditDocument operations, history undo/redo, render geometry (Swift Testing)

## Review

### Architecture delivered
- Single immersive `MeeshyVideoEditorView(url:context:accentColor:onComplete:onCancel:)`.
- Strict module separation: timeline model / composition (render) / export pipeline /
  transcription / effects all live in `MeeshySDK` core as pure types; UI in `MeeshyUI`.
- Non-destructive: `VideoEditDocument` describes edits; source file untouched until
  confirm. Undo/redo via `VideoEditHistory`. Autosave + crash recovery via
  `VideoEditSessionStore`.
- Same `AVComposition` plan drives both live preview and export → WYSIWYG.
- Transcription crash fixed: bounded by timeout, cancellation-safe continuation,
  single-resume guard (`RecognitionBox`). Routed through `EdgeTranscriptionService`.
- Captions use `LanguageData.allLanguages` (canonical list — no parallel list).

### Feature set
trim · split · merge (segment delete/re-merge) · per-segment & global speed ·
rotate · crop (aspect presets) · filters (CIPhotoEffect presets) · color grading
(brightness/contrast/saturation) · audio volume/mute/fade · transcription +
multi-language captions · undo/redo · autosave/recovery.

### Notes / known limits
- BUILD NOT VERIFIED: this environment is Linux (no Xcode). Needs a macOS build
  pass (`./apps/ios/meeshy.sh build` + `xcodebuild test`).
- FeedView "tap pending video" and ConversationView "edit pending video" call
  sites keep prior behavior (edit result not re-threaded into the existing
  pending attachment) — the attachment-replacement API was out of safe reach
  without a build. The add-video / story / post paths DO apply the edited URL.
- Deferred behind clean extension points: keyframes, green screen, multi-track
  of distinct videos, LUT, motion blur, AI effects, transitions, stickers, PiP,
  burned-in captions, free-form crop overlay, reverse.
</content>
