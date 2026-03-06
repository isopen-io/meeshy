# Story Editor Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 9 critical+medium bugs in the iOS Story editor to make canvas persistence, timeline UX, and duration sync fully functional.

**Architecture:** Three parallel git worktrees, each touching distinct files. Canvas worktree fixes model persistence and gesture consistency. Timeline worktree fixes scroll/zoom UX. Duration worktree ensures viewer/composer agreement.

**Tech Stack:** Swift 5.9, SwiftUI, @Observable, AVFoundation, CADisplayLink, PencilKit

---

## Worktree Setup

Before starting any task, create the three worktrees from `main`:

```bash
git worktree add ../v2_meeshy-fix-story-canvas -b fix/story-canvas-persistence main
git worktree add ../v2_meeshy-fix-story-timeline -b fix/story-timeline-ux main
git worktree add ../v2_meeshy-fix-story-duration -b fix/story-duration-sync main
```

Merge order after all complete: `fix/story-canvas-persistence` → `fix/story-timeline-ux` → `fix/story-duration-sync`

---

## WORKTREE 1: Canvas Fixes (`fix/story-canvas-persistence`)

**Directory:** `../v2_meeshy-fix-story-canvas`

**Files touched:**
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/DraggableMediaView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`

### Task 1: Add `zIndex` field to all canvas element models (C2)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`

**Step 1: Add `zIndex: Int?` to StoryTextObject**

In `StoryTextObject` (line 153), add after `fadeOut`:
```swift
    public var zIndex: Int?
```

In `CodingKeys` (line 155), add `zIndex`:
```swift
    enum CodingKeys: String, CodingKey {
        case id, content, x, y, scale, rotation, translations
        case textStyle, textColor, textSize, textAlign, textBg
        case startTime, displayDuration, fadeIn, fadeOut, zIndex
    }
```

In `init` (line 161), add parameter `zIndex: Int? = nil` and assign `self.zIndex = zIndex`.

**Step 2: Add `zIndex: Int?` to StoryMediaObject**

In `StoryMediaObject` (line 213), add after `fadeOut`:
```swift
    public var zIndex: Int?
```

In `CodingKeys` (line 215), add `zIndex`:
```swift
    enum CodingKeys: String, CodingKey {
        case id, postMediaId, mediaType, placement, x, y, scale, rotation, volume
        case startTime, duration, loop, fadeIn, fadeOut, zIndex
    }
```

In `init` (line 220), add parameter `zIndex: Int? = nil` and assign `self.zIndex = zIndex`.

**Step 3: Add `zIndex: Int?` to StoryAudioPlayerObject**

In `StoryAudioPlayerObject` (line 252), add after `fadeOut`:
```swift
    public var zIndex: Int?
```

In `CodingKeys` (line 254), add `zIndex`:
```swift
    enum CodingKeys: String, CodingKey {
        case id, postMediaId, placement, x, y, volume, waveformSamples
        case startTime, duration, loop, fadeIn, fadeOut, zIndex
    }
```

In `init` (line 259), add parameter `zIndex: Int? = nil` and assign `self.zIndex = zIndex`.

**Step 4: Add `zIndex: Int?` to StorySticker**

In `StorySticker` (line 298), add after `rotation`:
```swift
    public var zIndex: Int?
```

Add `CodingKeys` enum (currently absent — needed for backward-compat):
```swift
    enum CodingKeys: String, CodingKey {
        case id, emoji, x, y, scale, rotation, zIndex
    }
```

In `init` (line 300), add parameter `zIndex: Int? = nil` and assign `self.zIndex = zIndex`.

**Step 5: Update `toJSON()` in StoryEffects to include zIndex**

In `toJSON()`, in the `textObjects` mapping (line 546), add:
```swift
if let zi = t.zIndex { d["zIndex"] = zi }
```

In the `mediaObjects` mapping (line 515), add:
```swift
if let zi = o.zIndex { d["zIndex"] = zi }
```

In the `audioPlayerObjects` mapping (line 528), add:
```swift
if let zi = p.zIndex { d["zIndex"] = zi }
```

In the `stickerObjects` mapping (line 500-502), update to include zIndex:
```swift
dict["stickers"] = so.map { s in
    var d: [String: Any] = ["emoji": s.emoji, "x": s.x, "y": s.y, "scale": s.scale, "rotation": s.rotation]
    if let zi = s.zIndex { d["zIndex"] = zi }
    return d
}
```

**Step 6: Build to verify**

```bash
cd ../v2_meeshy-fix-story-canvas && ./apps/ios/meeshy.sh build
```

**Step 7: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift
git commit -m "feat(story): add zIndex field to all canvas element models"
```

---

### Task 2: Add background transform fields to StoryEffects (C1)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`

**Step 1: Add background transform properties to StoryEffects**

After line 417 (`backgroundAudioVariants`), add:
```swift
    // Background image transforms (persisted from composer gestures)
    public var backgroundScale: CGFloat?
    public var backgroundOffsetX: CGFloat?
    public var backgroundOffsetY: CGFloat?
    public var backgroundRotation: CGFloat?
```

**Step 2: Update StoryEffects init**

Add parameters to the init (after `backgroundAudioVariants` param on line 439):
```swift
                backgroundScale: CGFloat? = nil,
                backgroundOffsetX: CGFloat? = nil,
                backgroundOffsetY: CGFloat? = nil,
                backgroundRotation: CGFloat? = nil
```

Add assignments in init body (after line 456):
```swift
        self.backgroundScale = backgroundScale
        self.backgroundOffsetX = backgroundOffsetX
        self.backgroundOffsetY = backgroundOffsetY
        self.backgroundRotation = backgroundRotation
```

**Step 3: Update `toJSON()` to serialize background transforms**

After line 510 (closing transition), add:
```swift
        if let bs = backgroundScale { dict["backgroundScale"] = bs }
        if let bx = backgroundOffsetX { dict["backgroundOffsetX"] = bx }
        if let by = backgroundOffsetY { dict["backgroundOffsetY"] = by }
        if let br = backgroundRotation { dict["backgroundRotation"] = br }
```

**Step 4: Build to verify**

```bash
cd ../v2_meeshy-fix-story-canvas && ./apps/ios/meeshy.sh build
```

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift
git commit -m "feat(story): add background transform fields to StoryEffects"
```

---

### Task 3: Persist z-index in ViewModel (C2)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift`

**Step 1: Update `bringToFront` to write zIndex into model objects**

Replace `bringToFront` (lines 381-384):
```swift
    func bringToFront(id: String) {
        zIndexMap[id] = nextZIndex
        nextZIndex += 1
        persistZIndex(id: id, value: zIndexMap[id]!)
    }
```

Replace `sendToBack` (lines 386-388):
```swift
    func sendToBack(id: String) {
        zIndexMap[id] = 0
        persistZIndex(id: id, value: 0)
    }
```

Add new private method after `sendToBack`:
```swift
    private func persistZIndex(id: String, value: Int) {
        var effects = currentEffects
        if var idx = effects.textObjects?.firstIndex(where: { $0.id == id }) {
            effects.textObjects?[idx].zIndex = value
        } else if var idx = effects.mediaObjects?.firstIndex(where: { $0.id == id }) {
            effects.mediaObjects?[idx].zIndex = value
        } else if var idx = effects.audioPlayerObjects?.firstIndex(where: { $0.id == id }) {
            effects.audioPlayerObjects?[idx].zIndex = value
        } else if var idx = effects.stickerObjects?.firstIndex(where: { $0.id == id }) {
            effects.stickerObjects?[idx].zIndex = value
        }
        currentEffects = effects
    }
```

**Step 2: Rebuild zIndexMap from slide instead of clearing**

Replace `selectSlide` (lines 230-237):
```swift
    func selectSlide(at index: Int) {
        guard slides.indices.contains(index) else { return }
        selectedElementId = nil
        activeTool = nil
        currentSlideIndex = index
        rebuildZIndexMap()
    }

    private func rebuildZIndexMap() {
        zIndexMap = [:]
        var maxZ = 0
        let effects = currentEffects
        for obj in effects.textObjects ?? [] {
            if let z = obj.zIndex { zIndexMap[obj.id] = z; maxZ = max(maxZ, z) }
        }
        for obj in effects.mediaObjects ?? [] {
            if let z = obj.zIndex { zIndexMap[obj.id] = z; maxZ = max(maxZ, z) }
        }
        for obj in effects.audioPlayerObjects ?? [] {
            if let z = obj.zIndex { zIndexMap[obj.id] = z; maxZ = max(maxZ, z) }
        }
        for obj in effects.stickerObjects ?? [] {
            if let z = obj.zIndex { zIndexMap[obj.id] = z; maxZ = max(maxZ, z) }
        }
        nextZIndex = maxZ + 1
    }
```

**Step 3: Build to verify**

```bash
cd ../v2_meeshy-fix-story-canvas && ./apps/ios/meeshy.sh build
```

**Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift
git commit -m "fix(story): persist z-index in model objects instead of ephemeral map"
```

---

### Task 4: Unify rotation to degrees (C3)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/DraggableMediaView.swift`

**Step 1: Change rotation from radians to degrees**

In `mediaContentWithGestures` (line 134), change:
```swift
// BEFORE:
let effectiveRotation = isEditing ? currentRotation + gestureRotation.radians : currentRotation
// AFTER:
let effectiveRotation = isEditing ? currentRotation + gestureRotation.degrees : currentRotation
```

In the editing block (line 141), change:
```swift
// BEFORE:
.rotationEffect(.radians(effectiveRotation))
// AFTER:
.rotationEffect(.degrees(effectiveRotation))
```

In the non-editing block (line 173), change:
```swift
// BEFORE:
.rotationEffect(.radians(currentRotation))
// AFTER:
.rotationEffect(.degrees(currentRotation))
```

In `rotateGesture` (line 220-221), change:
```swift
// BEFORE:
let newRotation = currentRotation + value.radians
// AFTER:
let newRotation = currentRotation + value.rotation.degrees
```

**Step 2: Build to verify**

```bash
cd ../v2_meeshy-fix-story-canvas && ./apps/ios/meeshy.sh build
```

**Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/DraggableMediaView.swift
git commit -m "fix(story): unify media rotation to degrees (was radians)"
```

---

### Task 5: Add `.zIndex()` to sticker layer (C4)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasView.swift`

**Step 1: Add zIndex to sticker ForEach**

In `stickerLayer` (lines 307-323), add `.zIndex()` after `.allowsHitTesting`:
```swift
    private func stickerLayer(canvasSize: CGSize, interactive: Bool) -> some View {
        ForEach(stickerObjects, id: \.id) { sticker in
            DraggableSticker(
                sticker: sticker,
                canvasSize: canvasSize,
                onUpdate: { updated in
                    if let i = stickerObjects.firstIndex(where: { $0.id == sticker.id }) {
                        stickerObjects[i] = updated
                    }
                },
                onRemove: {
                    stickerObjects.removeAll { $0.id == sticker.id }
                }
            )
            .allowsHitTesting(interactive)
            .zIndex(Double(viewModel.zIndex(for: sticker.id)))
        }
    }
```

**Step 2: Build to verify**

```bash
cd ../v2_meeshy-fix-story-canvas && ./apps/ios/meeshy.sh build
```

**Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasView.swift
git commit -m "fix(story): add zIndex to sticker layer for proper interleaving"
```

---

### Task 6: Persist background transforms (C1)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasView.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`

**Step 1: Replace @State locals with ViewModel-backed computed properties**

In `StoryCanvasView`, replace the local state declarations (lines 22-28):
```swift
// BEFORE:
@State private var imageScale: CGFloat = 1.0
@State private var imageOffset: CGSize = .zero
@GestureState private var dragDelta: CGSize = .zero
@GestureState private var pinchDelta: CGFloat = 1.0
@GestureState private var rotationDelta: Angle = .zero
@State private var imageRotation: Angle = .zero

// AFTER:
@GestureState private var dragDelta: CGSize = .zero
@GestureState private var pinchDelta: CGFloat = 1.0
@GestureState private var rotationDelta: Angle = .zero
```

Add computed properties for background transforms (after the GestureState declarations):
```swift
private var imageScale: CGFloat {
    get { viewModel.currentEffects.backgroundScale ?? 1.0 }
    nonmutating set {
        var effects = viewModel.currentEffects
        effects.backgroundScale = newValue
        viewModel.currentEffects = effects
    }
}

private var imageOffset: CGSize {
    get {
        CGSize(
            width: viewModel.currentEffects.backgroundOffsetX ?? 0,
            height: viewModel.currentEffects.backgroundOffsetY ?? 0
        )
    }
    nonmutating set {
        var effects = viewModel.currentEffects
        effects.backgroundOffsetX = newValue.width
        effects.backgroundOffsetY = newValue.height
        viewModel.currentEffects = effects
    }
}

private var imageRotation: Angle {
    get { .degrees(viewModel.currentEffects.backgroundRotation ?? 0) }
    nonmutating set {
        var effects = viewModel.currentEffects
        effects.backgroundRotation = newValue.degrees
        viewModel.currentEffects = effects
    }
}
```

**Important:** The `backgroundImageGesture` `.onEnded` handlers (lines 220-238) already write to `imageScale`, `imageOffset`, and `imageRotation` — now these writes will flow through to the ViewModel automatically.

**Step 2: Remove the `onChange(of: selectedImage)` reset** that was clearing the transforms

Search in `StoryCanvasView` for any `.onChange(of: selectedImage)` that resets `imageScale`/`imageOffset`/`imageRotation`. If found, remove the reset lines since transforms should persist.

**Step 3: Update `buildEffects()` in StoryComposerView to include background transforms**

In `buildEffects()` (lines 981-999), update the `StoryEffects` constructor to pass through the background transforms. The transforms are already in `viewModel.currentEffects` (via the computed properties), so just forward them:

```swift
    private func buildEffects() -> StoryEffects {
        let bgHex = selectedImage != nil ? nil : viewModel.backgroundColor.replacingOccurrences(of: "#", with: "")
        let existingEffects = viewModel.currentEffects
        return StoryEffects(
            background: bgHex,
            filter: selectedFilter?.rawValue,
            stickers: stickerObjects.isEmpty ? nil : stickerObjects.map(\.emoji),
            stickerObjects: stickerObjects.isEmpty ? nil : stickerObjects,
            drawingData: viewModel.drawingData,
            backgroundAudioId: selectedAudioId,
            backgroundAudioVolume: selectedAudioId != nil ? audioVolume : nil,
            backgroundAudioStart: selectedAudioId != nil ? audioTrimStart : nil,
            backgroundAudioEnd: selectedAudioId != nil && audioTrimEnd > 0 ? audioTrimEnd : nil,
            opening: openingEffect,
            closing: closingEffect,
            textObjects: existingEffects.textObjects,
            mediaObjects: existingEffects.mediaObjects,
            audioPlayerObjects: existingEffects.audioPlayerObjects,
            backgroundScale: existingEffects.backgroundScale,
            backgroundOffsetX: existingEffects.backgroundOffsetX,
            backgroundOffsetY: existingEffects.backgroundOffsetY,
            backgroundRotation: existingEffects.backgroundRotation
        )
    }
```

**Step 4: Build to verify**

```bash
cd ../v2_meeshy-fix-story-canvas && ./apps/ios/meeshy.sh build
```

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasView.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift
git commit -m "fix(story): persist background image transforms in StoryEffects"
```

---

### Task 7: Apply background transforms in reader (C1)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift`

**Step 1: Apply background transforms in `backgroundMediaLayer`**

In `StoryCanvasReaderView`, in the `backgroundMediaLayer` computed property (lines 110-157), apply transforms to ALL background image/video views.

For the network-loaded background image (lines 115-121), wrap with transforms:
```swift
CachedAsyncImage(url: urlStr) {
    Color.clear
}
.scaledToFill()
.scaleEffect(story.storyEffects?.backgroundScale ?? 1.0)
.rotationEffect(.degrees(story.storyEffects?.backgroundRotation ?? 0))
.offset(
    x: story.storyEffects?.backgroundOffsetX ?? 0,
    y: story.storyEffects?.backgroundOffsetY ?? 0
)
.frame(maxWidth: .infinity, maxHeight: .infinity)
.clipped()
```

Apply the same transforms to the video player (lines 126-130), the preloaded image (lines 134-138), and the legacy media fallbacks (lines 142-155).

**Step 2: Build to verify**

```bash
cd ../v2_meeshy-fix-story-canvas && ./apps/ios/meeshy.sh build
```

**Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift
git commit -m "fix(story): apply persisted background transforms in canvas reader"
```

---

### Task 8: Eliminate sticker sync gap (C6)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasView.swift`

**Step 1: Replace local `@State stickerObjects` with ViewModel binding**

In `StoryComposerView`, remove the local `@State` (line 62):
```swift
// DELETE this line:
@State private var stickerObjects: [StorySticker] = []
```

Add a computed property instead:
```swift
private var stickerObjects: [StorySticker] {
    get { viewModel.currentEffects.stickerObjects ?? [] }
    nonmutating set {
        var effects = viewModel.currentEffects
        effects.stickerObjects = newValue.isEmpty ? nil : newValue
        viewModel.currentEffects = effects
    }
}
```

**Step 2: Update StoryCanvasView to accept Binding from ViewModel**

In `StoryCanvasView`, change the `stickerObjects` binding (line 15) — no change needed since it's already `@Binding var stickerObjects: [StorySticker]`. The caller now passes a different binding.

In `StoryComposerView` canvas invocation (line 188), change from `$stickerObjects` to a computed binding:
```swift
stickerObjects: Binding(
    get: { viewModel.currentEffects.stickerObjects ?? [] },
    set: { newValue in
        var effects = viewModel.currentEffects
        effects.stickerObjects = newValue.isEmpty ? nil : newValue
        viewModel.currentEffects = effects
    }
),
```

**Step 3: Remove sticker sync in `restoreCanvas`**

In `restoreCanvas` (line 965), remove:
```swift
// DELETE this line:
stickerObjects = e.stickerObjects ?? []
```
The stickerObjects are now read directly from `viewModel.currentEffects`.

**Step 4: Update `buildEffects()` to read stickers from ViewModel**

In `buildEffects()`, the sticker lines (986-987) should now read from the ViewModel:
```swift
stickers: (viewModel.currentEffects.stickerObjects ?? []).isEmpty ? nil : (viewModel.currentEffects.stickerObjects ?? []).map(\.emoji),
stickerObjects: viewModel.currentEffects.stickerObjects,
```

**Step 5: Update `handleDismiss` or any other place that checks `stickerObjects`**

Search for `stickerObjects` references in `StoryComposerView` and ensure they all go through the computed property or ViewModel.

**Step 6: Build to verify**

```bash
cd ../v2_meeshy-fix-story-canvas && ./apps/ios/meeshy.sh build
```

**Step 7: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasView.swift
git commit -m "fix(story): eliminate sticker sync gap — single source of truth via ViewModel"
```

---

### Task 9: Final build + verify canvas worktree

```bash
cd ../v2_meeshy-fix-story-canvas && ./apps/ios/meeshy.sh build
```

Verify no warnings related to Story files. If build succeeds, this worktree is complete.

---

## WORKTREE 2: Timeline Fixes (`fix/story-timeline-ux`)

**Directory:** `../v2_meeshy-fix-story-timeline`

**Files touched:**
- `packages/MeeshySDK/Sources/MeeshyUI/Story/TimelinePanel.swift`

### Task 10: Replace local zoom with ViewModel zoom (T2)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/TimelinePanel.swift`

**Step 1: Remove local `@State private var zoomScale` and use ViewModel**

Remove line 10:
```swift
// DELETE:
@State private var zoomScale: CGFloat = 1.0
```

Update `pixelsPerSecond` (line 20):
```swift
// BEFORE:
private var pixelsPerSecond: CGFloat { basePixelsPerSecond * zoomScale }
// AFTER:
private var pixelsPerSecond: CGFloat { basePixelsPerSecond * viewModel.timelineZoomScale }
```

Update the `MagnificationGesture` in `timelineContent` (lines 175-179):
```swift
.gesture(
    MagnificationGesture()
        .onChanged { value in
            viewModel.timelineZoomScale = max(0.5, min(4.0, value))
        }
)
```

Update any references to `zoomScale` in the transport bar (zoom percentage badge) to `viewModel.timelineZoomScale`.

**Step 2: Build to verify**

```bash
cd ../v2_meeshy-fix-story-timeline && ./apps/ios/meeshy.sh build
```

**Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/TimelinePanel.swift
git commit -m "fix(story): sync timeline zoom with ViewModel instead of local state"
```

---

### Task 11: Add playhead auto-scroll (T1)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/TimelinePanel.swift`

**Step 1: Add state for auto-scroll control**

After the existing `@State` properties (around line 11), add:
```swift
@State private var isUserDragging: Bool = false
@State private var lastAutoScrollTime: CFTimeInterval = 0
```

**Step 2: Wrap horizontal ScrollView in ScrollViewReader**

Replace the horizontal `ScrollView` in `timelineContent` (lines 156-168):
```swift
ScrollViewReader { proxy in
    ScrollView(.horizontal, showsIndicators: false) {
        ZStack(alignment: .topLeading) {
            VStack(spacing: 0) {
                rulerRow
                trackRows(grouped: grouped)
            }

            gridLines(grouped: grouped)
            playheadOverlay(grouped: grouped)
            durationHandleOverlay

            // Invisible anchor that moves with the playhead
            Color.clear
                .frame(width: 1, height: 1)
                .id("playhead-anchor")
                .offset(x: CGFloat(viewModel.timelinePlaybackTime) * pixelsPerSecond)
        }
        .frame(width: totalTimelineWidth)
    }
    .onChange(of: viewModel.timelinePlaybackTime) {
        guard viewModel.isTimelinePlaying, !isUserDragging else { return }
        let now = CACurrentMediaTime()
        guard now - lastAutoScrollTime >= 0.1 else { return }
        lastAutoScrollTime = now
        withAnimation(.linear(duration: 0.1)) {
            proxy.scrollTo("playhead-anchor", anchor: .center)
        }
    }
}
```

**Step 3: Set `isUserDragging` flag on playhead drag**

In `playheadOverlay` (around line 405), update the gesture:
```swift
.gesture(
    DragGesture(minimumDistance: 0)
        .onChanged { val in
            isUserDragging = true
            let t = Float(val.location.x / pixelsPerSecond)
            engine.seek(to: max(0, min(slideDuration, t)))
        }
        .onEnded { _ in
            isUserDragging = false
        }
)
```

**Step 4: Build to verify**

```bash
cd ../v2_meeshy-fix-story-timeline && ./apps/ios/meeshy.sh build
```

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/TimelinePanel.swift
git commit -m "feat(story): auto-scroll timeline to follow playhead during playback"
```

---

### Task 12: Fix synchronous AVURLAsset.duration (T6)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/TimelinePanel.swift`

**Step 1: Replace synchronous `intrinsicDuration` with async version**

Replace `intrinsicDuration` (lines 666-675):
```swift
    /// Async-safe intrinsic duration from a local media URL. Caches result.
    private func intrinsicDuration(url: URL?) -> Float? {
        guard let url else { return nil }
        let key = url.lastPathComponent
        if let cached = mediaDurationCache[key] { return cached }
        // Start async load — result will arrive via cache update
        Task { @MainActor in
            let asset = AVURLAsset(url: url)
            guard let duration = try? await asset.load(.duration) else { return }
            let dur = Float(CMTimeGetSeconds(duration))
            guard dur > 0, dur.isFinite else { return }
            mediaDurationCache[key] = dur
            buildTracks()  // Rebuild to pick up the new duration
        }
        return nil  // Placeholder until async completes
    }
```

**Step 2: Build to verify**

```bash
cd ../v2_meeshy-fix-story-timeline && ./apps/ios/meeshy.sh build
```

**Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/TimelinePanel.swift
git commit -m "fix(story): load AVURLAsset duration asynchronously to avoid main thread stall"
```

---

### Task 13: Final build + verify timeline worktree

```bash
cd ../v2_meeshy-fix-story-timeline && ./apps/ios/meeshy.sh build
```

---

## WORKTREE 3: Duration Sync (`fix/story-duration-sync`)

**Directory:** `../v2_meeshy-fix-story-duration`

**Files touched:**
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift`

### Task 14: Add `slideDuration` to StoryEffects (T5)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`

**Step 1: Add `slideDuration` field**

After the background transform fields added in Task 2 (or after `backgroundAudioVariants` if merging independently), add:
```swift
    // Durée totale du slide (sérialisée au publish)
    public var slideDuration: Float?
```

**Step 2: Update init to include `slideDuration`**

Add parameter `slideDuration: Float? = nil` and assign `self.slideDuration = slideDuration`.

**Step 3: Update `toJSON()`**

Add:
```swift
        if let sd = slideDuration { dict["slideDuration"] = sd }
```

**Step 4: Build to verify**

```bash
cd ../v2_meeshy-fix-story-duration && ./apps/ios/meeshy.sh build
```

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift
git commit -m "feat(story): add slideDuration to StoryEffects for viewer/composer sync"
```

---

### Task 15: Serialize slide duration at publish time (T5)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`

**Step 1: Set `slideDuration` in `buildEffects()`**

In `buildEffects()`, add `slideDuration` to the constructor:
```swift
            slideDuration: Float(viewModel.currentSlideDuration)
```

This ensures the composer's authoritative duration is serialized into the effects.

**Step 2: Build to verify**

```bash
cd ../v2_meeshy-fix-story-duration && ./apps/ios/meeshy.sh build
```

**Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift
git commit -m "fix(story): serialize slide duration at publish time"
```

---

### Task 16: Use serialized duration in viewer (T5)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift`

**Step 1: Update `updateStoryDuration()` to prefer `slideDuration`**

At the start of `updateStoryDuration()` (line 550), after the guard, add:
```swift
    // Prefer serialized slide duration from composer (authoritative)
    if let authoritative = story.storyEffects?.slideDuration, authoritative > 0 {
        computedStoryDuration = Double(authoritative)
        return
    }
```

This goes right after `var maxDuration: Double = 5.0` (line 556), before the media scanning loop. Pre-migration stories without `slideDuration` fall through to the existing calculation.

**Step 2: Build to verify**

```bash
cd ../v2_meeshy-fix-story-duration && ./apps/ios/meeshy.sh build
```

**Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift
git commit -m "fix(story): viewer uses composer's authoritative slide duration"
```

---

### Task 17: Final build + verify duration worktree

```bash
cd ../v2_meeshy-fix-story-duration && ./apps/ios/meeshy.sh build
```

---

## Merge Sequence

After all three worktrees pass their builds:

```bash
# 1. Merge canvas fixes first (pure model + UI)
cd /Users/smpceo/Documents/v2_meeshy
git checkout dev
git merge fix/story-canvas-persistence --no-ff

# 2. Merge timeline fixes (no overlapping files)
git merge fix/story-timeline-ux --no-ff

# 3. Merge duration sync last (StoryModels.swift overlap — resolve by keeping both additions)
git merge fix/story-duration-sync --no-ff

# 4. Integration build
./apps/ios/meeshy.sh build

# 5. Cleanup worktrees
git worktree remove ../v2_meeshy-fix-story-canvas
git worktree remove ../v2_meeshy-fix-story-timeline
git worktree remove ../v2_meeshy-fix-story-duration
```

---

## Verification Checklist

After merge, manual testing:

- [ ] C1: Pan/zoom/rotate background → switch slide → return → transforms preserved
- [ ] C2: "Mettre devant" on element → switch slide → return → z-order preserved
- [ ] C3: Rotate media object in composer → same angle shown in viewer/reader
- [ ] C4: Tap sticker after tapping text → sticker renders on top
- [ ] C6: Add sticker → publish → sticker appears in viewer
- [ ] T1: Play timeline → playhead stays centered in scroll view
- [ ] T2: Zoom timeline to 2x → close panel → reopen → zoom preserved at 2x
- [ ] T5: Publish story with 15s slide duration → viewer progress bar runs for 15s
- [ ] T6: Open timeline with video track → no visible freeze/stall
