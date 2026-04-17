# Story Toolbar Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the FOND/FRONT toolbar toggle with a unified CONTENU/EFFETS toggle — single group for all creative tools, effects tab with filters + timeline pills.

**Architecture:** Rename `StoryToolGroup` to `StoryTab` (contenu/effets), merge bgMedia+media into `.photo`, add `.filters`/`.timeline` tool modes. Rewrite `ContextualToolbar` to render unified pills per tab. Remove isFondToolActive/isFrontToolActive from canvas — use single editing state. Add `filterIntensity` to `StoryEffects` model (the `filter` field already exists).

**Tech Stack:** SwiftUI, CoreImage (CIFilter), MeeshySDK/MeeshyUI

**Spec:** `docs/superpowers/specs/2026-04-17-story-toolbar-unification-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` | Modify | Add `filterIntensity: Double?` to StoryEffects |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift` | Modify | Replace StoryToolGroup→StoryTab, merge bgMedia+media→photo, add filters/timeline modes, add selectedFilter/filterIntensity state, remove isFondToolActive/isFrontToolActive |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/ContextualToolbar.swift` | Rewrite | CONTENU/EFFETS toggle, unified pills, filter grid, timeline pill |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryFilterGridView.swift` | Create | Horizontal filter thumbnail grid + intensity slider |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasView.swift` | Modify | Remove isFondToolActive/isFrontToolActive refs, use single isDrawingActive check |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift` | Modify | Update activeToolPanel switch: remove .bgMedia/.media, add .photo/.filters/.timeline |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift` | Modify | Apply CIFilter to slide render when filter is set |

---

### Task 1: Add filterIntensity to StoryEffects model

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:418`

- [ ] **Step 1: Add filterIntensity field**

In `StoryModels.swift`, after line 418 (`public var filter: String?`), add:

```swift
public var filterIntensity: Double?
```

Also add it to the `init()` (around line 463+):

```swift
// Add parameter to init signature:
filterIntensity: Double? = nil,

// Add assignment in init body:
self.filterIntensity = filterIntensity
```

- [ ] **Step 2: Build to verify**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeded

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift
git commit -m "feat(sdk): add filterIntensity to StoryEffects model"
```

---

### Task 2: Replace StoryToolGroup with StoryTab, merge tool modes

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift:8-35`

- [ ] **Step 1: Replace StoryToolMode and StoryToolGroup**

Replace lines 8-35 in `StoryComposerViewModel.swift` with:

```swift
enum StoryToolMode: String, CaseIterable {
    // Contenu
    case photo
    case drawing
    case text
    case audio
    // Effets
    case filters
    case timeline

    var tab: StoryTab {
        switch self {
        case .photo, .drawing, .text, .audio: return .contenu
        case .filters, .timeline: return .effets
        }
    }
}

enum StoryTab: String {
    case contenu, effets
}
```

- [ ] **Step 2: Update isFondToolActive/isFrontToolActive**

Replace lines 106-107:

```swift
var isFondToolActive: Bool { activeTool?.group == .fond }
var isFrontToolActive: Bool { activeTool?.group == .front }
```

With:

```swift
var isContentToolActive: Bool { activeTool?.tab == .contenu }
```

- [ ] **Step 3: Update selectTool**

In `selectTool()` (around line 455), replace:

```swift
if tool?.group == .fond {
    selectedElementId = nil
}
```

With:

```swift
if tool == .drawing {
    selectedElementId = nil
}
```

- [ ] **Step 4: Add filter state**

After the timeline properties (around line 152), add:

```swift
// MARK: - Filter

var selectedFilter: String?
var filterIntensity: Double = 1.0

func applyFilter(_ name: String?) {
    selectedFilter = name
    var effects = currentEffects
    effects.filter = name
    effects.filterIntensity = name != nil ? filterIntensity : nil
    currentEffects = effects
}

func updateFilterIntensity(_ value: Double) {
    filterIntensity = value
    var effects = currentEffects
    effects.filterIntensity = value
    currentEffects = effects
}
```

- [ ] **Step 5: Build to check for compilation errors**

Run: `./apps/ios/meeshy.sh build`
Expected: Errors in ContextualToolbar.swift and StoryCanvasView.swift (they still reference old types). This is expected — we fix them in subsequent tasks.

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift
git commit -m "feat(sdk): replace StoryToolGroup with StoryTab, merge bgMedia+media into photo"
```

---

### Task 3: Update StoryCanvasView — remove fond/front distinction

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasView.swift:77-78,127,235-236,286-287,384-385`

- [ ] **Step 1: Replace computed properties**

Replace lines 77-78:

```swift
private var isFondToolActive: Bool { viewModel.isFondToolActive }
private var isFrontToolActive: Bool { viewModel.isFrontToolActive }
```

With:

```swift
private var isContentToolActive: Bool { viewModel.isContentToolActive }
```

- [ ] **Step 2: Update all references**

Search and replace in StoryCanvasView.swift:

- `!isFondToolActive && !isDrawingActive` → `!isDrawingActive`
- `isFondToolActive` → `false` (dimming front elements is no longer needed since there's no fond/front split)
- `!isFrontToolActive` → `true`
- `isDrawingActive || isFrontToolActive` → `isDrawingActive`

Specifically:

Line 127 — `mediaLayer(interactive: !isFondToolActive && !isDrawingActive)` → `mediaLayer(interactive: !isDrawingActive)`

Lines 235-236:
```swift
.allowsHitTesting(!isDrawingActive)
.gesture(isDrawingActive ? nil : backgroundImageGesture)
```

Line 286 — `let dimmed = isFondToolActive` → `let dimmed = false`
Line 287 — `let interactive = !isFondToolActive && !isDrawingActive` → `let interactive = !isDrawingActive`

Lines 384-385:
```swift
.allowsHitTesting(!isDrawingActive)
.gesture(isDrawingActive ? nil : backgroundImageGesture)
```

- [ ] **Step 3: Build to verify**

Run: `./apps/ios/meeshy.sh build`
Expected: Errors remain in ContextualToolbar.swift (next task). Canvas file should compile.

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasView.swift
git commit -m "refactor(sdk): remove fond/front distinction from StoryCanvasView"
```

---

### Task 4: Create StoryFilterGridView

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryFilterGridView.swift`

- [ ] **Step 1: Create the filter grid view**

```swift
import SwiftUI
import CoreImage
import CoreImage.CIFilterBuiltins
import MeeshySDK

struct StoryFilterGridView: View {
    @Bindable var viewModel: StoryComposerViewModel
    var previewImage: UIImage?

    private static let filters: [(name: String, ciName: String?)] = [
        ("Original", nil),
        ("Vivid", "CIColorControls"),
        ("N&B", "CIPhotoEffectMono"),
        ("Chaud", "CITemperatureAndTint"),
        ("Froid", "CITemperatureAndTint"),
        ("Vintage", "CIPhotoEffectTransfer"),
        ("Fade", "CIPhotoEffectFade"),
        ("Chrome", "CIPhotoEffectChrome"),
    ]

    var body: some View {
        VStack(spacing: 12) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(Self.filters, id: \.name) { filter in
                        filterThumbnail(filter)
                    }
                }
                .padding(.horizontal, 16)
            }

            if viewModel.selectedFilter != nil {
                intensitySlider
            }
        }
        .padding(.vertical, 12)
    }

    @ViewBuilder
    private func filterThumbnail(_ filter: (name: String, ciName: String?)) -> some View {
        let isSelected = viewModel.selectedFilter == filter.ciName

        Button {
            viewModel.applyFilter(filter.ciName)
            HapticFeedback.light()
        } label: {
            VStack(spacing: 4) {
                Group {
                    if let image = previewImage {
                        Image(uiImage: applyFilter(to: image, filterName: filter.ciName, filterDisplayName: filter.name))
                            .resizable()
                            .scaledToFill()
                    } else {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color(hex: viewModel.backgroundColor.replacingOccurrences(of: "#", with: "")))
                    }
                }
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(isSelected ? MeeshyColors.brandPrimary : Color.clear, lineWidth: 2)
                )

                Text(filter.name)
                    .font(.system(size: 10, weight: isSelected ? .bold : .regular))
                    .foregroundStyle(isSelected ? MeeshyColors.brandPrimary : .white.opacity(0.7))
            }
        }
        .buttonStyle(.plain)
    }

    private var intensitySlider: some View {
        HStack(spacing: 12) {
            Text(String(localized: "story.filters.intensity", defaultValue: "Intensite", bundle: .module))
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.white.opacity(0.6))

            Slider(value: Binding(
                get: { viewModel.filterIntensity },
                set: { viewModel.updateFilterIntensity($0) }
            ), in: 0...1)
            .tint(MeeshyColors.brandPrimary)

            Text("\(Int(viewModel.filterIntensity * 100))%")
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundStyle(.white)
                .frame(width: 40)
        }
        .padding(.horizontal, 16)
    }

    private func applyFilter(to image: UIImage, filterName: String?, filterDisplayName: String) -> UIImage {
        guard let filterName, let ciImage = CIImage(image: image) else { return image }

        let context = CIContext()
        var outputImage: CIImage?

        switch filterName {
        case "CIColorControls":
            let filter = CIFilter.colorControls()
            filter.inputImage = ciImage
            filter.saturation = Float(1.0 + 0.5 * viewModel.filterIntensity)
            outputImage = filter.outputImage

        case "CIPhotoEffectMono", "CIPhotoEffectTransfer", "CIPhotoEffectFade", "CIPhotoEffectChrome":
            guard let filter = CIFilter(name: filterName) else { return image }
            filter.setValue(ciImage, forKey: kCIInputImageKey)
            outputImage = filter.outputImage

        case "CITemperatureAndTint":
            let filter = CIFilter.temperatureAndTint()
            filter.inputImage = ciImage
            let shift = Float(viewModel.filterIntensity * 2000)
            filter.neutral = CIVector(x: 6500 + (filterDisplayName == "Chaud" ? CGFloat(shift) : CGFloat(-shift)), y: 0)
            outputImage = filter.outputImage

        default:
            return image
        }

        guard let output = outputImage,
              let cgImage = context.createCGImage(output, from: ciImage.extent) else {
            return image
        }
        return UIImage(cgImage: cgImage)
    }
}
```

- [ ] **Step 2: Build to verify (will still fail on ContextualToolbar — that's next)**

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryFilterGridView.swift
git commit -m "feat(sdk): add StoryFilterGridView with CIFilter thumbnails and intensity slider"
```

---

### Task 5: Rewrite ContextualToolbar — CONTENU/EFFETS

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/ContextualToolbar.swift` (full rewrite)

- [ ] **Step 1: Rewrite ContextualToolbar**

Replace the entire content of `ContextualToolbar.swift` with:

```swift
import SwiftUI
import MeeshySDK

struct ContextualToolbar: View {
    @Bindable var viewModel: StoryComposerViewModel
    @Environment(\.theme) private var theme
    @State private var selectedTab: StoryTab = .contenu

    var body: some View {
        VStack(spacing: 10) {
            segmentedToggle
            toolPills
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .padding(.bottom, 4)
        .onChange(of: viewModel.activeTool) { _, newTool in
            guard let tool = newTool else { return }
            if selectedTab != tool.tab {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    selectedTab = tool.tab
                }
            }
        }
    }

    // MARK: - Segmented Toggle

    private var segmentedToggle: some View {
        HStack(spacing: 0) {
            segmentButton(.contenu, label: String(localized: "story.toolbar.contenu", defaultValue: "CONTENU", bundle: .module))
            segmentButton(.effets, label: String(localized: "story.toolbar.effets", defaultValue: "EFFETS", bundle: .module))
        }
    }

    private func segmentButton(_ tab: StoryTab, label: String) -> some View {
        let isSelected = selectedTab == tab

        return Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                selectedTab = tab
                if viewModel.activeTool?.tab != tab {
                    viewModel.activeTool = nil
                }
            }
        } label: {
            HStack(spacing: 6) {
                Text(label)
                    .font(.system(size: 14, weight: isSelected ? .bold : .regular, design: .rounded))

                if tabBadge(tab) > 0 {
                    Text("\(tabBadge(tab))")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(minWidth: 16, minHeight: 16)
                        .background(MeeshyColors.indigo400)
                        .clipShape(Circle())
                }
            }
            .foregroundStyle(.white)
            .opacity(isSelected ? 1.0 : 0.4)
            .frame(maxWidth: .infinity)
            .frame(height: 44)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Tool Pills

    private var toolPills: some View {
        HStack(spacing: 8) {
            switch selectedTab {
            case .contenu:
                toolPill(.photo, icon: "photo.fill", label: String(localized: "story.toolbar.photo", defaultValue: "Photo", bundle: .module), badge: mediaCount)
                toolPill(.drawing, icon: "pencil.tip", label: String(localized: "story.toolbar.drawing", defaultValue: "Dessin", bundle: .module), badge: hasDrawing ? 1 : 0)
                toolPill(.text, icon: "textformat", label: String(localized: "story.toolbar.text", defaultValue: "Texte", bundle: .module), badge: textCount)
                toolPill(.audio, icon: "waveform", label: String(localized: "story.toolbar.audio", defaultValue: "Audio", bundle: .module), badge: audioCount)
            case .effets:
                toolPill(.filters, icon: "camera.filters", label: String(localized: "story.toolbar.filters", defaultValue: "Filtres", bundle: .module), badge: viewModel.selectedFilter != nil ? 1 : 0)
                toolPill(.timeline, icon: "timer", label: String(localized: "story.toolbar.timeline", defaultValue: "Timeline", bundle: .module), badge: 0)
            }
        }
        .animation(.spring(response: 0.25, dampingFraction: 0.8), value: selectedTab)
    }

    // MARK: - Tool Pill

    @ViewBuilder
    private func toolPill(
        _ tool: StoryToolMode,
        icon: String,
        label: String,
        badge: Int
    ) -> some View {
        let isActive = viewModel.activeTool == tool
        let isDisabled = isToolDisabled(tool)

        Button {
            guard !isDisabled else { return }
            viewModel.selectTool(tool)
        } label: {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .medium))
                Text(label)
                    .font(.system(size: 12, weight: .medium))
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(pillBackground(isActive: isActive))
            .foregroundStyle(isActive ? .white : theme.textSecondary)
            .clipShape(Capsule())
            .opacity(isDisabled ? 0.4 : 1.0)
            .overlay(alignment: .topTrailing) {
                if badge > 0 {
                    badgeView(count: badge)
                        .offset(x: 6, y: -6)
                }
            }
        }
        .buttonStyle(.plain)
        .animation(.easeInOut(duration: 0.15), value: isActive)
    }

    @ViewBuilder
    private func pillBackground(isActive: Bool) -> some View {
        if isActive {
            MeeshyColors.brandGradient
        } else {
            theme.backgroundTertiary
        }
    }

    private func badgeView(count: Int) -> some View {
        Text("\(count)")
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(.white)
            .frame(minWidth: 14, minHeight: 14)
            .background(MeeshyColors.indigo400)
            .clipShape(Circle())
    }

    // MARK: - Badge Counts

    private func tabBadge(_ tab: StoryTab) -> Int {
        switch tab {
        case .contenu: return mediaCount + (hasDrawing ? 1 : 0) + textCount + audioCount
        case .effets: return (viewModel.selectedFilter != nil ? 1 : 0)
        }
    }

    private var textCount: Int { viewModel.currentEffects.textObjects?.count ?? 0 }
    private var mediaCount: Int { viewModel.currentEffects.mediaObjects?.count ?? 0 }
    private var audioCount: Int { viewModel.currentEffects.audioPlayerObjects?.count ?? 0 }
    private var hasDrawing: Bool { viewModel.drawingData != nil }

    private func isToolDisabled(_ tool: StoryToolMode) -> Bool {
        switch tool {
        case .text: return !viewModel.canAddText
        case .photo: return !viewModel.canAddMedia
        case .audio: return !viewModel.canAddAudio
        default: return false
        }
    }
}
```

- [ ] **Step 2: Build to verify**

Run: `./apps/ios/meeshy.sh build`
Expected: Errors in StoryComposerView.swift (activeToolPanel switch still references .bgMedia/.media). Fixed in next task.

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/ContextualToolbar.swift
git commit -m "feat(sdk): rewrite ContextualToolbar — CONTENU/EFFETS tabs with unified pills"
```

---

### Task 6: Update StoryComposerView — activeToolPanel and picker refs

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift:676-701`

- [ ] **Step 1: Update activeToolPanel switch**

Replace the `activeToolPanel` computed property (around line 674-701):

```swift
@ViewBuilder
private var activeToolPanel: some View {
    switch viewModel.activeTool {
    case .photo:
        bgMediaPanel
    case .drawing:
        drawingPanel
    case .text:
        textPanel.padding(.bottom, 8)
    case .audio:
        fgAudioPanel
    case .filters:
        StoryFilterGridView(viewModel: viewModel, previewImage: selectedImage)
    case .timeline:
        TimelinePanel(viewModel: viewModel)
    case .none:
        EmptyView()
    }
}
```

- [ ] **Step 2: Update any remaining .bgMedia / .media references**

Search StoryComposerView.swift for `.bgMedia` and `.media` tool mode references and replace:
- `.bgMedia` → `.photo`
- `.media` → `.photo`
- `case .media:` → already handled in step 1

Also search for `viewModel.activeTool == .bgMedia` or `viewModel.activeTool == .media` and replace with `viewModel.activeTool == .photo`.

- [ ] **Step 3: Update StoryComposerView references to `.group` property**

Search for `.group` on tool modes and replace with `.tab`:
- `tool.group` → `tool.tab`
- `activeTool?.group` → `activeTool?.tab`

- [ ] **Step 4: Build to verify**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeded

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift
git commit -m "feat(sdk): update StoryComposerView for unified photo tool and filters/timeline panels"
```

---

### Task 7: Apply CIFilter in StoryCanvasReaderView

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift`

- [ ] **Step 1: Add filter overlay to slide render**

In `StoryCanvasReaderView`, find where each slide's content is rendered (the main ZStack with background + media + text layers). Wrap the entire slide content in a filter modifier.

Add this ViewModifier at the bottom of the file:

```swift
struct CIFilterModifier: ViewModifier {
    let filterName: String?
    let intensity: Double

    func body(content: Content) -> some View {
        if let filterName {
            content
                .colorEffect(ShaderLibrary.default.ciFilter(.string(filterName), .float(Float(intensity))))
        } else {
            content
        }
    }
}
```

Note: Since SwiftUI doesn't directly support CIFilter on views, the pragmatic approach is to apply the filter at **snapshot/publish time** via `StorySlideRenderer` and show a color overlay as a visual indicator during editing. For the reader, use `.colorMultiply()` or `.saturation()` as approximations for common filters.

Add a simple visual filter method to the slide content container:

```swift
@ViewBuilder
private func applySlideFilter(_ content: some View, effects: StoryEffects) -> some View {
    let filterName = effects.filter
    let intensity = effects.filterIntensity ?? 1.0

    switch filterName {
    case "CIPhotoEffectMono":
        content.saturation(1.0 - intensity)
    case "CIColorControls":
        content.saturation(1.0 + 0.5 * intensity)
    case "CIPhotoEffectFade":
        content.opacity(1.0 - 0.3 * intensity)
    case "CIPhotoEffectChrome":
        content.contrast(1.0 + 0.3 * intensity)
    case "CITemperatureAndTint":
        content.colorMultiply(Color.orange.opacity(0.1 * intensity))
    default:
        content
    }
}
```

Wrap the slide content ZStack with this method where the slide is rendered.

- [ ] **Step 2: Build to verify**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeded

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift
git commit -m "feat(sdk): apply visual filter approximation in story reader"
```

---

### Task 8: Add StoryFilterGridView to Xcode project + final build

**Files:**
- Modify: `apps/ios/Meeshy.xcodeproj/project.pbxproj` (if needed — SPM should auto-detect)

- [ ] **Step 1: Verify new file is picked up by SPM**

Since `StoryFilterGridView.swift` is inside the MeeshyUI SPM package, it should be auto-discovered. Build to confirm:

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeded

- [ ] **Step 2: Full clean build**

```bash
./apps/ios/meeshy.sh clean
./apps/ios/meeshy.sh build
```
Expected: Build succeeded

- [ ] **Step 3: Test on simulator**

```bash
./apps/ios/meeshy.sh run
```

Manual verification:
1. Open story composer
2. Verify CONTENU tab shows: Photo, Dessin, Texte, Audio pills
3. Switch to EFFETS tab — verify: Filtres, Timeline pills
4. Tap Filtres — verify filter thumbnails appear with intensity slider
5. Tap Timeline — verify timeline panel appears
6. Switch back to CONTENU — verify all tools work as before

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(ios): story toolbar unification — CONTENU/EFFETS replaces FOND/FRONT"
```
