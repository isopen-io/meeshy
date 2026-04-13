# Story: Per-Element Language, 9:16 Canvas, iPad Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each story element carries its own sourceLanguage (auto-detected from keyboard, editable in timeline), canvas is constrained to 9:16 on all devices, hardcoded sizes replaced with proportional values.

**Architecture:** Add `sourceLanguage: String?` to 3 SDK models. Detect keyboard language on element creation. Add language badge to SimpleTimelineView segments. Wrap both canvas views in a 9:16 aspect-ratio container. Replace hardcoded pt values with proportional calculations.

**Tech Stack:** SwiftUI, MeeshySDK models, UITextInputMode, GeometryReader

---

### Task 1: Add sourceLanguage to SDK models

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:133-271`

- [ ] **Step 1: Add sourceLanguage to StoryTextObject**

In `StoryModels.swift`, add `sourceLanguage` field to `StoryTextObject`:

```swift
// After line 140 (translations field)
public var sourceLanguage: String?
```

Add to `CodingKeys` enum (line 156):
```swift
case id, content, x, y, scale, rotation, translations, sourceLanguage
```

Add to `init` parameters (after `translations: [String: String]? = nil`):
```swift
sourceLanguage: String? = nil,
```

Add to `init` body (after `self.translations = translations`):
```swift
self.sourceLanguage = sourceLanguage
```

- [ ] **Step 2: Add sourceLanguage to StoryMediaObject**

In `StoryModels.swift`, add to `StoryMediaObject`:

```swift
// After line 213 (fadeOut field)
public var sourceLanguage: String?
```

Add to `CodingKeys` (line 216):
```swift
case id, postMediaId, mediaType, placement, x, y, scale, rotation, volume
case startTime, duration, loop, fadeIn, fadeOut, sourceLanguage
```

Add to `init` parameters (after `fadeOut: Float? = nil`):
```swift
sourceLanguage: String? = nil
```

Add to `init` body (after `self.fadeOut = fadeOut`):
```swift
self.sourceLanguage = sourceLanguage
```

- [ ] **Step 3: Add sourceLanguage to StoryAudioPlayerObject**

Same pattern in `StoryAudioPlayerObject`:

```swift
// After line 252 (fadeOut field)
public var sourceLanguage: String?
```

Add to `CodingKeys` (line 255):
```swift
case id, postMediaId, placement, x, y, volume, waveformSamples
case startTime, duration, loop, fadeIn, fadeOut, sourceLanguage
```

Add to `init` parameters (after `fadeOut: Float? = nil`):
```swift
sourceLanguage: String? = nil
```

Add to `init` body (after `self.fadeOut = fadeOut`):
```swift
self.sourceLanguage = sourceLanguage
```

- [ ] **Step 4: Build to verify**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeded (fields are optional, backward compatible)

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift
git commit -m "feat(sdk): add sourceLanguage to StoryTextObject, StoryMediaObject, StoryAudioPlayerObject"
```

---

### Task 2: Auto-detect keyboard language on element creation

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift:281-350`

- [ ] **Step 1: Add keyboard detection helper**

Add at the top of `StoryComposerViewModel` (after the existing properties):

```swift
private var detectedKeyboardLanguage: String {
    if let kbd = UITextInputMode.activeInputModes.first?.primaryLanguage {
        return String(kbd.prefix(2))
    }
    return AuthManager.shared.currentUser?.systemLanguage ?? "fr"
}
```

Add `import UIKit` at the top of the file if not already present.

- [ ] **Step 2: Pass sourceLanguage in addText()**

Modify `addText()` (line 284) to include `sourceLanguage`:

```swift
let obj = StoryTextObject(
    content: "",
    x: center.x,
    y: center.y,
    scale: 1.0,
    rotation: 0,
    sourceLanguage: detectedKeyboardLanguage,
    textStyle: "classic",
    textColor: "FFFFFF",
    textSize: 24,
    textAlign: "center"
)
```

- [ ] **Step 3: Pass sourceLanguage in addMediaObject()**

Modify `addMediaObject()` (line 310) to include `sourceLanguage`:

```swift
let obj = StoryMediaObject(
    postMediaId: "",
    mediaType: type,
    placement: placement,
    x: center.x,
    y: center.y,
    scale: 1.0,
    rotation: 0,
    volume: 1.0,
    sourceLanguage: detectedKeyboardLanguage
)
```

- [ ] **Step 4: Pass sourceLanguage in addAudioObject()**

Modify `addAudioObject()` (line 334) to include `sourceLanguage`:

```swift
let obj = StoryAudioPlayerObject(
    postMediaId: "",
    placement: placement,
    x: center.x,
    y: min(0.9, center.y + 0.15),
    volume: 1.0,
    waveformSamples: [],
    sourceLanguage: detectedKeyboardLanguage
)
```

- [ ] **Step 5: Build and commit**

Run: `./apps/ios/meeshy.sh build`

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift
git commit -m "feat(sdk): auto-detect keyboard language on story element creation"
```

---

### Task 3: Language badge in SimpleTimelineView segments

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/SimpleTimelineView.swift:5-13, 134-200`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift` (add update method)

- [ ] **Step 1: Add sourceLanguage to SimpleSegment**

In `SimpleTimelineView.swift`, update `SimpleSegment` (line 5):

```swift
struct SimpleSegment: Identifiable {
    let id: String
    let name: String
    let type: TrackType
    var startTime: Float
    var duration: Float
    var image: UIImage?
    var waveformSamples: [Float]?
    var sourceLanguage: String?
}
```

- [ ] **Step 2: Pass sourceLanguage when building segments**

Find the `buildSegments()` method and ensure each segment receives the `sourceLanguage` from the corresponding element. Search for where `SimpleSegment(` is constructed and add `sourceLanguage: textObj.sourceLanguage` (or mediaObj/audioObj accordingly).

- [ ] **Step 3: Add language badge to segmentView**

Modify `segmentView(_ segment:)` (line 134) to overlay a language badge:

```swift
return ZStack(alignment: .topTrailing) {
    ZStack {
        RoundedRectangle(cornerRadius: 6, style: .continuous)
            .fill(segment.type.color.opacity(0.5))

        segmentContent(segment, width: width)

        RoundedRectangle(cornerRadius: 6, style: .continuous)
            .strokeBorder(
                isSelected ? MeeshyColors.brandPrimary : theme.textPrimary.opacity(0.1),
                lineWidth: isSelected ? 2 : 0.5
            )
    }

    // Language badge
    if let lang = segment.sourceLanguage {
        languageBadge(lang: lang, elementId: segment.id)
    }
}
.frame(width: width, height: segmentHeight - 8)
.shadow(
    color: isSelected ? MeeshyColors.brandPrimary.opacity(0.3) : .clear,
    radius: isSelected ? 4 : 0,
    y: isSelected ? 1 : 0
)
.clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
```

- [ ] **Step 4: Create languageBadge component with Menu**

Add the language badge view below `segmentView`:

```swift
private func languageBadge(lang: String, elementId: String) -> some View {
    Menu {
        ForEach(DetectedLanguage.supported) { language in
            Button {
                viewModel.updateElementLanguage(elementId: elementId, language: language.code)
            } label: {
                HStack {
                    Text("\(language.flag) \(language.name)")
                    if language.code == lang {
                        Image(systemName: "checkmark")
                    }
                }
            }
        }
    } label: {
        Text(lang.uppercased())
            .font(.system(size: 8, weight: .bold, design: .rounded))
            .foregroundColor(.white)
            .padding(.horizontal, 4)
            .padding(.vertical, 2)
            .background(Capsule().fill(MeeshyColors.brandPrimary.opacity(0.8)))
    }
    .offset(x: -2, y: 2)
}
```

- [ ] **Step 5: Add updateElementLanguage to ViewModel**

In `StoryComposerViewModel.swift`, add:

```swift
func updateElementLanguage(elementId: String, language: String) {
    var effects = currentEffects

    if var texts = effects.textObjects,
       let idx = texts.firstIndex(where: { $0.id == elementId }) {
        texts[idx].sourceLanguage = language
        effects.textObjects = texts
    }

    if var medias = effects.mediaObjects,
       let idx = medias.firstIndex(where: { $0.id == elementId }) {
        medias[idx].sourceLanguage = language
        effects.mediaObjects = medias
    }

    if var audios = effects.audioPlayerObjects,
       let idx = audios.firstIndex(where: { $0.id == elementId }) {
        audios[idx].sourceLanguage = language
        effects.audioPlayerObjects = audios
    }

    currentEffects = effects
}
```

- [ ] **Step 6: Build and commit**

Run: `./apps/ios/meeshy.sh build`

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/SimpleTimelineView.swift \
      packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift
git commit -m "feat(sdk): language badge per element in story timeline with picker"
```

---

### Task 4: Remove global story language chip

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift:96, 452, 502-521, 1408`

- [ ] **Step 1: Keep storyLanguage for CreateStoryRequest.originalLanguage but remove UI**

The `storyLanguage` state (line 96) stays — it's used for the story-level `originalLanguage` (the `content` caption). But remove the chip from the toolbar.

Remove or comment out the `storyLanguageChip` reference at line 452:
```swift
// Remove: storyLanguageChip
```

Remove the `storyLanguageChip` computed property (lines 502-521).

Remove the `showLanguagePicker` state if only used by the chip.

Initialize `storyLanguage` from keyboard instead of user systemLanguage:
```swift
@State private var storyLanguage: String = {
    if let kbd = UITextInputMode.activeInputModes.first?.primaryLanguage {
        return String(kbd.prefix(2))
    }
    return AuthManager.shared.currentUser?.systemLanguage ?? "fr"
}()
```

- [ ] **Step 2: Build and commit**

Run: `./apps/ios/meeshy.sh build`

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift
git commit -m "refactor(sdk): remove global language chip, keep storyLanguage for caption originalLanguage"
```

---

### Task 5: 9:16 canvas constraint — StoryCanvasReaderView (viewer)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift:45-60`

- [ ] **Step 1: Wrap canvas body in 9:16 constraint**

Replace the body (lines 45-60):

```swift
public var body: some View {
    GeometryReader { geo in
        let canvasSize = Self.canvasSize(fitting: geo.size)
        ZStack {
            backgroundLayer
            backgroundMediaLayer
            filterOverlay
            drawingLayer
            stickerLayer(size: canvasSize)
            textLayer(size: canvasSize)
            textObjectsLayer(size: canvasSize)
            foregroundMediaLayer
            foregroundAudioLayer
        }
        .frame(width: canvasSize.width, height: canvasSize.height)
        .clipped()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    // ... keep existing .task, .onAppear, etc.
```

- [ ] **Step 2: Add static canvasSize helper**

Add to `StoryCanvasReaderView`:

```swift
static func canvasSize(fitting available: CGSize) -> CGSize {
    let targetRatio: CGFloat = 9.0 / 16.0
    if available.width / available.height < targetRatio {
        return CGSize(width: available.width, height: available.width / targetRatio)
    } else {
        return CGSize(width: available.height * targetRatio, height: available.height)
    }
}
```

- [ ] **Step 3: Replace hardcoded text maxWidth**

Replace both `maxWidth: 280` (lines 273 and 311) with proportional:

```swift
.frame(maxWidth: size.width * 0.75)
```

Where `size` is the `canvasSize` passed to `textObjectsLayer(size:)`.

- [ ] **Step 4: Build and commit**

Run: `./apps/ios/meeshy.sh build`

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift
git commit -m "feat(sdk): 9:16 canvas constraint in StoryCanvasReaderView, proportional text width"
```

---

### Task 6: 9:16 canvas constraint — StoryCanvasView (editor)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasView.swift:116-140`

- [ ] **Step 1: Wrap editor canvas in 9:16 constraint**

Replace the body (lines 116-140):

```swift
var body: some View {
    GeometryReader { geo in
        let canvasSize = StoryCanvasReaderView.canvasSize(fitting: geo.size)
        ZStack {
            backgroundLayer
            backgroundMediaLayer
            foregroundMediaLayer(interactive: !isFondToolActive && !isDrawingActive)
            drawingLayer
            frontElementsGroup(canvasSize: canvasSize)
                .zIndex(1000)
        }
        .frame(width: canvasSize.width, height: canvasSize.height)
        .clipped()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .overlay(
            // ... keep existing overlays
```

Update any usage of `geo.size` in child calls to use `canvasSize` instead.

- [ ] **Step 2: Build and commit**

Run: `./apps/ios/meeshy.sh build`

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasView.swift
git commit -m "feat(sdk): 9:16 canvas constraint in StoryCanvasView editor"
```

---

### Task 7: Proportional media sizes

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/DraggableMediaView.swift:133`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/SlideMiniPreview.swift:118`

- [ ] **Step 1: Make DraggableMediaView base size proportional**

Replace hardcoded `baseMediaSize` (line 133). The view needs a `canvasWidth` parameter:

Add property to `DraggableMediaView`:
```swift
var canvasWidth: CGFloat = 393
```

Replace line 133:
```swift
private var baseMediaSize: CGFloat { canvasWidth * 0.4 }
```

Update all call sites to pass `canvasWidth:` from the parent's canvas size.

- [ ] **Step 2: Fix SlideMiniPreview font normalization**

Replace line 118:
```swift
let fontSize = max(3, (text.textSize ?? 24) * size.width / size.width)
```

Wait — that would be `1.0`. The intent is to scale font relative to the preview size vs full canvas. The correct fix:

```swift
let referenceWidth: CGFloat = 393  // Full-size canvas reference (9:16 on iPhone)
let fontSize = max(3, (text.textSize ?? 24) * size.width / referenceWidth)
```

This is already what it does, but `393` should be documented. Actually the real fix for iPad is that the full canvas width changes. Since we now force 9:16, the full canvas width on iPad portrait (810pt screen) would be `810 * 9/16 = 455pt`. The preview should scale relative to its own full-canvas-width.

Better: pass the reference canvas width as a parameter, or keep `393` as the design reference (Instagram standard). The mini preview always renders in a small thumbnail — `393` is fine as a constant reference.

Keep as-is but add a comment:
```swift
// 393 = design reference width (9:16 on iPhone 14 Pro). Previews scale relative to this.
let fontSize = max(3, (text.textSize ?? 24) * size.width / 393)
```

- [ ] **Step 3: Build and commit**

Run: `./apps/ios/meeshy.sh build`

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/DraggableMediaView.swift \
      packages/MeeshySDK/Sources/MeeshyUI/Story/SlideMiniPreview.swift
git commit -m "feat(sdk): proportional media sizes, document font reference width"
```

---

### Task 8: StoryViewerView 9:16 container

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift`

- [ ] **Step 1: Ensure StoryViewerView canvas is 9:16 centered in black ZStack**

The `StoryViewerView` already uses a ZStack with black background. The `StoryCanvasReaderView` inside it will now self-constrain to 9:16 (from Task 5). Verify that the parent doesn't force a different size.

Check that the canvas is centered (not stretched). If the parent uses `.frame(maxWidth: .infinity, maxHeight: .infinity)`, the inner 9:16 canvas will center itself automatically.

If `UIScreen.main.bounds` is used for sizing, replace with GeometryReader.

- [ ] **Step 2: Build and test on iPad simulator**

Run: `./apps/ios/meeshy.sh build`

Test: Open story viewer on both iPhone and iPad simulators. iPhone should look unchanged. iPad should show 9:16 canvas centered with black bars.

- [ ] **Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift
git commit -m "fix(ios): story viewer uses 9:16 canvas, centered on iPad"
```
