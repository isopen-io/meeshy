# Story Composer & Reader UI Improvements

**Date:** 2026-04-07
**Status:** Approved

## Problem Statement

The Story Composer has several UI issues:
1. Background color is always the same default (`#0F0C29`) on new stories — no variety
2. FOND/FRONT toggle buttons use a heavy glassmorphic container with gradient fill — should be minimal text-only
3. FOND elements can visually overlap FRONT elements during editing
4. No background color indicator in the timeline thumbnails
5. Adding media to the canvas has no loading/compression feedback
6. Media dropped into the canvas is not centered
7. Audio player buttons in the story reader should be mutable (mute/unmute per audio)
8. When audio is longer than video on a story slide, the video should loop until the audio finishes

## Changes

### 1. Random Background Color on New Story

When the composer opens for a **new** story (not restoring an existing slide), generate a random color that is NOT in `StoryBackgroundPalette.colors`.

**Generation method:**
```swift
static func randomBackgroundColor() -> String {
    let hue = Double.random(in: 0...1)
    let saturation = Double.random(in: 0.5...0.9)
    let brightness = Double.random(in: 0.2...0.7)
    let color = UIColor(hue: hue, saturation: saturation, brightness: brightness, alpha: 1.0)
    // Convert to hex, verify not in StoryBackgroundPalette.colors, regenerate if collision
    return hexString
}
```

- Saturation 0.5-0.9: avoids dull grays
- Brightness 0.2-0.7: avoids washed-out whites and near-blacks
- Collision check against the 17 existing palette colors (regenerate if match)
- Only applied on **new** story creation. Restoring existing slides keeps their saved color.

**File:** `StoryComposerView.swift` — add static method to `StoryBackgroundPalette`, call in composer init when no existing slide is loaded.

### 2. FOND/FRONT Toggle — Text Only

**Current:** Segmented control with `ultraThinMaterial` background, `RoundedRectangle(cornerRadius: 14)`, brand gradient fill on active segment.

**New:**

| State | Font Weight | Opacity | Background |
|-------|-------------|---------|------------|
| Selected | `.bold` | 1.0 | `.clear` (none) |
| Not selected | `.regular` | 0.4 | `.clear` (none) |

- Remove the `HStack` wrapping background (`RoundedRectangle.fill(.ultraThinMaterial)`)
- Remove the `.clipShape(RoundedRectangle)`
- Remove the gradient background on active segment
- Keep text color: `.white`
- Keep font: system size 14, design `.rounded`
- Keep badge count circle (unchanged styling)
- Keep the `HStack(spacing: 0)` layout with equal-width segments

**File:** `ContextualToolbar.swift` — modify `segmentButton()` and the FOND/FRONT `HStack`.

### 3. Z-Ordering: FOND Always Behind FRONT

In the canvas editor (`StoryCanvasView` or equivalent), enforce strict layer separation:

- **Layer 0 (bottom):** Background color fill
- **Layer 1:** Background image/video (with transforms)
- **Layer 2:** Drawing overlay
- **Layer 3 (top):** FRONT elements (text, media, audio) in their own sub-ZStack

During drag, resize, or editing of any FOND element, it must remain below Layer 3. No `zIndex` promotion that would cause a FOND element to render above FRONT elements.

**File:** `StoryCanvasView.swift` — verify/enforce the ZStack ordering of canvas layers.

### 4. Background Color in Timeline

Each slide thumbnail in the timeline should display its background color:

- If the slide has no background image: the thumbnail already shows the background color (natural behavior)
- If the slide has a background image: add a small color dot (8x8pt circle) in the bottom-left corner of the thumbnail, filled with the slide's background color, with a thin white border (0.5pt) for visibility

**File:** `StoryComposerView.swift` — in the timeline/slide thumbnail section.

### 5. Loading Animation When Adding Media

When the user selects media (image/video) to add to the composer:

1. Immediately show a placeholder in the canvas at center position
2. The placeholder displays a circular progress indicator
3. During compression/processing, show progress (indeterminate spinner or percentage if available)
4. Once ready, replace the placeholder with the actual media element
5. Smooth crossfade transition (0.3s)

**Implementation:**
- Add a `loadingMedia: Bool` state to the ViewModel
- Show an overlay with `ProgressView()` in the canvas while loading
- On completion, set the media element and dismiss the overlay

**File:** `StoryComposerView.swift` and `StoryComposerViewModel.swift`

### 6. Media Centering on Drop

When a media element is added to the canvas:

- Position: **centered** (center of media = center of canvas)
- Size: natural size or a reasonable default (e.g., 60% of canvas width if larger), but **not forced** — user can freely resize
- No forced aspect ratio constraint — the media keeps its natural proportions but the user is free to distort if they want

**Implementation:** When creating a new `StoryElement` of type media, set `offsetX: 0, offsetY: 0` (center-relative coordinates).

**File:** `StoryComposerViewModel.swift` — in the method that adds media elements.

### 7. Audio Mute/Unmute Buttons in Story Reader

In the story reader, each foreground audio component (`StoryAudioPlayerView` with `isEditing: false`) already supports mute/unmute via the speaker icon button. This works correctly — tapping toggles `player?.isMuted`.

**Ensure the button is clearly interactive:**
- The speaker icon must be visually prominent (not blending into the background)
- Add a subtle tap feedback (scale animation on press)
- The muted state (`speaker.slash.fill`) must be clearly distinguishable from unmuted (`speaker.wave.2.fill`)
- Each audio component is independently mutable — muting one does not affect others

**Current behavior is correct**, this change is about making the button more obviously tappable and responsive.

**File:** `StoryAudioPlayerView.swift` — enhance reader-mode button feedback.

### 8. Video Loops When Audio is Longer

When a story slide has both foreground video and foreground audio, and the audio duration exceeds the video duration, the video must **loop continuously** until the audio finishes.

**Current behavior:** Video plays once (10s) then freezes on last frame while audio continues (30s). The slide duration correctly accounts for the audio (30s), but the video stops.

**New behavior:** If any foreground audio element has a longer effective duration than a foreground video element, that video must loop.

**Implementation in `StoryCanvasReaderView.swift` (ReaderState):**

1. In `checkPendingVideoStarts()` (around lines 893-989), after setting up the video player:
   - Calculate the slide's max audio end time from all foreground audio objects
   - Calculate this video's end time (`startTime + duration`)
   - If max audio end time > video end time → enable looping on this video via `AVPlayerLooper`
   - The video loops seamlessly until the slide advances (which happens when the longest element finishes)

2. The loop is controlled by the audio duration, not infinite:
   - When the slide timer reaches the audio end time, the slide advances naturally
   - The video stops when the slide transitions, regardless of loop position

3. No change to the slide duration calculation — it already uses `max(all element end times)` which correctly picks the audio duration.

**Key code change:**
```swift
// In checkPendingVideoStarts(), after creating the player:
let maxAudioEndTime = calculateMaxAudioEndTime(for: currentSlide)
let videoEndTime = startTime + videoDuration

if maxAudioEndTime > videoEndTime {
    // Audio is longer — loop the video
    if let queuePlayer = player as? AVQueuePlayer,
       let item = queuePlayer.currentItem {
        let looper = AVPlayerLooper(player: queuePlayer, templateItem: item)
        // Store looper reference to keep it alive
    }
}
```

**File:** `StoryCanvasReaderView.swift` — modify `checkPendingVideoStarts()` in `ReaderState`.

## Files Modified

| File | Changes |
|------|---------|
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift` | Random background color generation, timeline color dot, loading overlay |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift` | Loading state, media centering on add |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/ContextualToolbar.swift` | FOND/FRONT text-only styling |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasView.swift` | Z-ordering enforcement |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryAudioPlayerView.swift` | Enhanced mute button feedback in reader mode |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift` | Video looping when audio is longer |

## Non-Goals

- No changes to the color palette itself (existing 17 colors + 6 gradients stay)
- No changes to background image selection flow
- No changes to the story save/publish pipeline
