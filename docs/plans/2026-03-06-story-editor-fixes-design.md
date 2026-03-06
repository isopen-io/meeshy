# Story Editor Fixes — Design Document

**Date**: 2026-03-06
**Scope**: Fix 9 critical+medium bugs in the iOS Story editor (canvas, timeline, duration sync)
**Constraint**: No new features — complete and fix the existing implementation

## Problem Statement

The Story editor has functional architecture (FRONT/BACK layers, canvas gestures, timeline UI) but several critical data persistence and UX issues prevent it from being production-ready.

## Worktree Strategy

Three parallel worktrees, each touching distinct files to avoid merge conflicts:

| Worktree | Branch | Fixes |
|----------|--------|-------|
| `canvas-fixes` | `fix/story-canvas-persistence` | C1, C2, C3, C4, C6 |
| `timeline-fixes` | `fix/story-timeline-ux` | T1, T2, T6 |
| `duration-sync` | `fix/story-duration-sync` | T5 |

Merge order: `canvas-fixes` → `timeline-fixes` → `duration-sync`

---

## Canvas Fixes (Worktree 1)

### C1 — Background Image Transform Persistence

**Problem**: `imageScale`, `imageOffset`, `imageRotation` in `StoryCanvasView` are local `@State`. Lost on publish/slide change.

**Solution**: Add to `StoryEffects`:
```swift
var backgroundScale: CGFloat?
var backgroundOffsetX: CGFloat?
var backgroundOffsetY: CGFloat?
var backgroundRotation: CGFloat?  // degrees
```

Replace `@State` locals in `StoryCanvasView` with bindings to `viewModel.currentEffects.background*`. Gesture `.onEnded` writes to ViewModel. `StoryCanvasReaderView` reads these for rendering.

**Files**: `StoryModels.swift`, `StoryCanvasView.swift`, `StoryCanvasReaderView.swift`

### C2 — Z-Index Serialization

**Problem**: `zIndexMap` is runtime-only, resets on `selectSlide()`.

**Solution**: Add `var zIndex: Int?` to `StoryTextObject`, `StoryMediaObject`, `StoryAudioPlayerObject`, `StorySticker`. In `bringToFront(id:)` / `sendToBack(id:)`, write to both `zIndexMap` AND the corresponding model object. On `selectSlide()`, rebuild `zIndexMap` from the slide's objects instead of clearing. Reader uses serialized values.

**Files**: `StoryModels.swift`, `StoryComposerViewModel.swift`, `StoryCanvasView.swift`, `StoryCanvasReaderView.swift`

### C3 — Rotation Unit Unification (Degrees)

**Problem**: `DraggableTextObjectView` stores rotation in degrees, `DraggableMediaView` in radians.

**Solution**: Change `DraggableMediaView` to use degrees:
- `.rotationEffect(.degrees(effectiveRotation))` instead of `.radians()`
- Accumulate via `value.rotation.degrees` instead of `.radians`
- `StoryCanvasReaderView` already uses `.degrees()` for text — harmonize for media

**Files**: `DraggableMediaView.swift`

### C4 — Sticker Z-Index Support

**Problem**: Sticker `ForEach` has no `.zIndex()` modifier. Stickers always render below tapped text/media.

**Solution**: Apply `.zIndex(Double(viewModel.zIndex(for: sticker.id)))` to each sticker in `StoryCanvasView`. Add `var zIndex: Int?` to `StorySticker` (part of C2).

**Files**: `StoryCanvasView.swift`, `StoryModels.swift` (already in C2)

### C6 — Sticker State Sync

**Problem**: `stickerObjects` is a local `@State` in `StoryComposerView`, separate from `viewModel.currentEffects.stickerObjects`. Mutations on canvas may not propagate to the model.

**Solution**: Remove the local `@State stickerObjects`. Use `viewModel.currentEffects.stickerObjects` directly via binding, matching the pattern used for `textObjects` and `mediaObjects`.

**Files**: `StoryComposerView.swift`, `StoryCanvasView.swift`

---

## Timeline Fixes (Worktree 2)

### T1 — Playhead Auto-Scroll

**Problem**: Horizontal `ScrollView` does not follow the playhead during playback.

**Solution**:
1. Wrap horizontal content in `ScrollViewReader`
2. Add invisible anchor view at playhead position: `Color.clear.frame(width: 1).id("playhead")`
3. In `onTimeUpdate` callback (throttled to ~10Hz), call `proxy.scrollTo("playhead", anchor: .center)`
4. Add `isUserScrolling` flag — set `true` on manual drag, reset on play/seek

**Files**: `TimelinePanel.swift`

### T2 — Zoom State Sync with ViewModel

**Problem**: `TimelinePanel` uses local `@State private var zoomScale` while `viewModel.timelineZoomScale` exists but is unused.

**Solution**: Remove local `@State zoomScale`. Use `viewModel.timelineZoomScale` directly. The `MagnificationGesture` writes to the ViewModel. Zoom persists between panel open/close.

**Files**: `TimelinePanel.swift`

### T6 — Async AVURLAsset Duration

**Problem**: `intrinsicDuration(url:)` reads `AVURLAsset.duration` potentially on main thread.

**Solution**: Use `Task { try await AVURLAsset(url:).load(.duration) }`. Update `mediaDurations` cache asynchronously. Show placeholder track width until resolved.

**Files**: `TimelinePanel.swift`

---

## Duration Sync (Worktree 3)

### T5 — Viewer/Composer Duration Agreement

**Problem**: `StoryViewerView` recalculates `computedStoryDuration` from `FeedMedia.duration`, ignoring the authoritative `StorySlide.duration`.

**Solution**:
1. Add `var slideDuration: Float?` to `StoryEffects`
2. At publish time, serialize `StorySlide.duration` into `StoryEffects.slideDuration`
3. In `StoryViewerView.updateStoryDuration()`: if `storyEffects.slideDuration` is present, use it
4. Fallback to existing calculation for pre-migration stories

**Files**: `StoryModels.swift` (shared with canvas worktree — merge last), `StoryViewerView+Content.swift`, `StoryComposerView.swift` (publish path)

---

## File Ownership Matrix

| File | canvas-fixes | timeline-fixes | duration-sync |
|------|:---:|:---:|:---:|
| `StoryModels.swift` | X | | X (merge last) |
| `StoryComposerViewModel.swift` | X | | |
| `StoryCanvasView.swift` | X | | |
| `StoryCanvasReaderView.swift` | X | | |
| `DraggableMediaView.swift` | X | | |
| `StoryComposerView.swift` | X | | X |
| `StoryAudioPlayerView.swift` | | | |
| `TimelinePanel.swift` | | X | |
| `TimelineTrackView.swift` | | X | |
| `StoryViewerView+Content.swift` | | | X |

**Note**: `StoryModels.swift` is touched by both `canvas-fixes` and `duration-sync`. Merge order: canvas first, duration-sync last to resolve cleanly.

## Testing Strategy

Each worktree runs `./apps/ios/meeshy.sh build` before merge. After all merges, clean build from `dev` to catch integration issues.

Manual verification:
- C1: Pan/zoom background → switch slide → return → transforms preserved
- C2: Bring element to front → switch slide → return → z-order preserved
- C3: Rotate media object → reader shows same rotation
- C4: Tap sticker after tapping text → sticker renders on top
- C6: Add sticker → publish → sticker appears in viewer
- T1: Play timeline → playhead stays visible without manual scroll
- T2: Zoom timeline → close panel → reopen → zoom preserved
- T5: Publish story with 15s duration → viewer shows 15s progress bar
- T6: Open timeline with video track → no main thread stall
