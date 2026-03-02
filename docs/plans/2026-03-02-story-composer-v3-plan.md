# Story Composer V3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite the Story Composer with a clean @Observable ViewModel, contextual toolbar (Fond/Front groups), per-track timeline (Simple + Advanced toggle), pure gesture interactions, and individual audio/video playback on canvas.

**Architecture:** Single `StoryComposerViewModel` (@Observable) replaces 50+ @State. Unified `CanvasElement` protocol wraps existing model types for canvas rendering. Toolbar shows grouped tools (Fond/Front/Plus) with contextual dimming. Timeline panel shows one track per timed element with Simple/Advanced toggle.

**Tech Stack:** SwiftUI + @Observable (Swift 5.9), PencilKit, AVFoundation, existing MeeshySDK models (StoryModels.swift), MeeshyUI theme (MeeshyColors, ThemeManager)

**Design Doc:** `docs/plans/2026-03-02-story-composer-v3-design.md`

---

## File Paths Reference

```
BASE = /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK

Models:  {BASE}/Sources/MeeshySDK/Models/StoryModels.swift (756 lines)
Story UI: {BASE}/Sources/MeeshyUI/Story/
  - StoryComposerView.swift (2064 lines — REPLACE)
  - StoryCanvasView.swift (372 lines — REPLACE)
  - StoryCanvasReaderView.swift (— UPDATE for timing)
  - DraggableTextObjectView.swift (174 lines — KEEP, minor update)
  - DraggableMediaView.swift (— KEEP, add play button)
  - StoryAudioPlayerView.swift (— KEEP, add play button)
  - StorySlideManager.swift (189 lines — KEEP as-is)
  - StoryTextEditorView.swift (— KEEP as-is)
  - DrawingOverlayView.swift (— KEEP as-is)
  - MeeshyAudioEditorView.swift (— KEEP as-is)
Theme: {BASE}/Sources/MeeshyUI/Theme/MeeshyColors.swift
       {BASE}/Sources/MeeshyUI/Theme/ThemeManager.swift
```

---

## Task 1: Extend StoryModels with timing fields

**Files:**
- Modify: `Sources/MeeshySDK/Models/StoryModels.swift`

**Context:** Add `startTime`, `displayDuration`/`duration`, `loop`, `fadeIn`, `fadeOut` to StoryTextObject (line 133), StoryMediaObject (line 186), and StoryAudioPlayerObject (line 215). All new fields are optional with defaults so existing data decodes without breaking.

**Step 1: Add timing fields to StoryTextObject**

At `StoryModels.swift:182` (end of StoryTextObject), before the closing brace, add:

```swift
// Timeline timing
public var startTime: Float = 0        // when text appears (seconds)
public var displayDuration: Float?     // how long visible (nil = permanent)
public var fadeIn: Float?              // fade-in animation (seconds)
public var fadeOut: Float?             // fade-out animation (seconds)
```

**Step 2: Add timing fields to StoryMediaObject**

At `StoryModels.swift:211` (end of StoryMediaObject), before the closing brace, add:

```swift
// Timeline timing
public var startTime: Float = 0        // offset in seconds
public var duration: Float?            // playback duration (nil = full)
public var loop: Bool = false          // auto-loop
public var fadeIn: Float?              // fade-in (seconds)
public var fadeOut: Float?             // fade-out (seconds)
```

**Step 3: Add timing fields to StoryAudioPlayerObject**

At `StoryModels.swift:236` (end of StoryAudioPlayerObject), before the closing brace, add:

```swift
// Timeline timing
public var startTime: Float = 0        // offset in seconds
public var duration: Float?            // playback duration (nil = full)
public var loop: Bool = false          // auto-loop
public var fadeIn: Float?              // fade-in (seconds)
public var fadeOut: Float?             // fade-out (seconds)
```

**Step 4: Verify build**

Run: `./apps/ios/meeshy.sh build`
Expected: SUCCESS — all fields have defaults, Codable auto-synthesis handles optionals.

**Step 5: Commit**

```
feat(models): add timeline timing fields to story objects
```

---

## Task 2: Create StoryComposerViewModel

**Files:**
- Create: `Sources/MeeshyUI/Story/StoryComposerViewModel.swift`

**Context:** Single @Observable class that replaces the 50+ @State properties in StoryComposerView. Owns all composer state: slides, selection, active tool, loaded media, timeline visibility.

**Step 1: Create the ViewModel file**

```swift
import SwiftUI
import MeeshySDK
import PencilKit

// MARK: - Tool Modes

enum StoryToolMode: String, CaseIterable {
    // Fond
    case bgMedia        // background image/video
    case drawing        // pencil kit
    case bgAudio        // ambient audio
    // Front
    case text           // add/edit text
    case image          // add foreground image
    case video          // add foreground video
    case audio          // add foreground audio
    // Plus
    case filter         // image filters
    case effects        // transitions
    case timeline       // timeline panel

    var group: StoryToolGroup {
        switch self {
        case .bgMedia, .drawing, .bgAudio: return .fond
        case .text, .image, .video, .audio: return .front
        case .filter, .effects, .timeline: return .plus
        }
    }
}

enum StoryToolGroup: String {
    case fond, front, plus
}

enum TimelineMode: String {
    case simple, advanced
}

// MARK: - Canvas Element Protocol

enum CanvasElementType {
    case text, image, video, audio
}

protocol CanvasElement: Identifiable {
    var id: String { get }
    var elementType: CanvasElementType { get }
    var zIndex: Int { get set }
}

// MARK: - Media Asset

enum MediaAsset {
    case image(UIImage)
    case videoURL(URL)
    case audioURL(URL)
}

// MARK: - ViewModel

@Observable
@MainActor
final class StoryComposerViewModel {

    // MARK: - Slides

    var slides: [StorySlide] = [StorySlide()]
    var currentSlideIndex: Int = 0
    var slideImages: [String: UIImage] = [:]

    var currentSlide: StorySlide {
        get { slides[safe: currentSlideIndex] ?? slides[0] }
        set {
            guard slides.indices.contains(currentSlideIndex) else { return }
            slides[currentSlideIndex] = newValue
        }
    }

    var currentEffects: StoryEffects {
        get { currentSlide.effects ?? StoryEffects() }
        set {
            var slide = currentSlide
            slide.effects = newValue
            currentSlide = slide
        }
    }

    var canAddSlide: Bool { slides.count < 10 }

    // MARK: - Selection

    var selectedElementId: String?

    // MARK: - Active Tool

    var activeTool: StoryToolMode?

    var isFondToolActive: Bool { activeTool?.group == .fond }
    var isFrontToolActive: Bool { activeTool?.group == .front }

    // MARK: - Drawing

    var drawingData: Data?
    var drawingColor: Color = .white
    var drawingWidth: CGFloat = 5
    var isDrawingActive: Bool { activeTool == .drawing }

    // MARK: - Background

    var backgroundColor: String = "#000000"

    // MARK: - Media Storage (pre-publication)

    var loadedImages: [String: UIImage] = [:]
    var loadedVideoURLs: [String: URL] = [:]
    var loadedAudioURLs: [String: URL] = [:]

    // MARK: - Timeline

    var isTimelineVisible: Bool = false
    var timelineMode: TimelineMode = .simple

    // MARK: - UI State

    var showPhotoPicker: Bool = false
    var showVideoPicker: Bool = false
    var showAudioPicker: Bool = false
    var publishProgress: (current: Int, total: Int)?
    var errorMessage: String?
    var showDraftAlert: Bool = false

    // MARK: - Limits

    var textCount: Int { currentEffects.textObjects?.count ?? 0 }
    var mediaCount: Int {
        (currentEffects.mediaObjects?.count ?? 0) +
        (currentEffects.audioPlayerObjects?.count ?? 0)
    }
    var canAddText: Bool { textCount < 5 }
    var canAddMedia: Bool { mediaCount < 10 }
    var canAddImage: Bool { canAddMedia && (currentEffects.mediaObjects?.filter { $0.mediaType == "image" && $0.placement == "foreground" }.count ?? 0) < 5 }
    var canAddVideo: Bool { canAddMedia && (currentEffects.mediaObjects?.filter { $0.mediaType == "video" && $0.placement == "foreground" }.count ?? 0) < 4 }
    var canAddAudio: Bool { canAddMedia && (currentEffects.audioPlayerObjects?.filter { $0.placement == "foreground" }.count ?? 0) < 5 }

    // MARK: - Slide Management

    func addSlide() {
        guard canAddSlide else { return }
        let slide = StorySlide()
        slides.append(slide)
        currentSlideIndex = slides.count - 1
    }

    func removeSlide(at index: Int) {
        guard slides.count > 1 else { return }
        slides.remove(at: index)
        if currentSlideIndex >= slides.count {
            currentSlideIndex = slides.count - 1
        }
        reorderSlides()
    }

    func duplicateSlide(at index: Int) {
        guard canAddSlide, slides.indices.contains(index) else { return }
        var copy = slides[index]
        copy.id = UUID().uuidString
        slides.insert(copy, at: index + 1)
        currentSlideIndex = index + 1
        reorderSlides()
    }

    func selectSlide(at index: Int) {
        guard slides.indices.contains(index) else { return }
        selectedElementId = nil
        activeTool = nil
        currentSlideIndex = index
    }

    private func reorderSlides() {
        for i in slides.indices {
            slides[i].order = i
        }
    }

    // MARK: - Element Management

    @discardableResult
    func addText() -> StoryTextObject? {
        guard canAddText else { return nil }
        var obj = StoryTextObject()
        obj.id = UUID().uuidString
        obj.content = ""
        obj.x = 0.5
        obj.y = 0.5
        obj.scale = 1.0
        obj.rotation = 0
        obj.textStyle = "classic"
        obj.textColor = "#FFFFFF"
        obj.textSize = 24
        obj.textAlign = "center"
        var effects = currentEffects
        var texts = effects.textObjects ?? []
        texts.append(obj)
        effects.textObjects = texts
        currentEffects = effects
        selectedElementId = obj.id
        activeTool = .text
        return obj
    }

    func addMediaObject(type: String, placement: String = "foreground") -> StoryMediaObject? {
        guard canAddMedia else { return nil }
        var obj = StoryMediaObject()
        obj.id = UUID().uuidString
        obj.mediaType = type
        obj.placement = placement
        obj.x = 0.5
        obj.y = 0.5
        obj.scale = 1.0
        obj.rotation = 0
        obj.volume = 1.0
        var effects = currentEffects
        var medias = effects.mediaObjects ?? []
        medias.append(obj)
        effects.mediaObjects = medias
        currentEffects = effects
        selectedElementId = obj.id
        return obj
    }

    func addAudioObject(placement: String = "foreground") -> StoryAudioPlayerObject? {
        guard canAddMedia else { return nil }
        var obj = StoryAudioPlayerObject()
        obj.id = UUID().uuidString
        obj.placement = placement
        obj.x = 0.5
        obj.y = 0.8
        obj.volume = 1.0
        var effects = currentEffects
        var audios = effects.audioPlayerObjects ?? []
        audios.append(obj)
        effects.audioPlayerObjects = audios
        currentEffects = effects
        selectedElementId = obj.id
        return obj
    }

    func deleteElement(id: String) {
        var effects = currentEffects
        effects.textObjects?.removeAll { $0.id == id }
        effects.mediaObjects?.removeAll { $0.id == id }
        effects.audioPlayerObjects?.removeAll { $0.id == id }
        effects.stickerObjects?.removeAll { $0.id == id }
        currentEffects = effects
        if selectedElementId == id { selectedElementId = nil }
    }

    func duplicateElement(id: String) {
        var effects = currentEffects
        if var text = effects.textObjects?.first(where: { $0.id == id }) {
            guard canAddText else { return }
            text.id = UUID().uuidString
            text.x = min(1.0, text.x + 0.05)
            text.y = min(1.0, text.y + 0.05)
            effects.textObjects?.append(text)
            selectedElementId = text.id
        } else if var media = effects.mediaObjects?.first(where: { $0.id == id }) {
            guard canAddMedia else { return }
            media.id = UUID().uuidString
            media.x = min(1.0, media.x + 0.05)
            media.y = min(1.0, media.y + 0.05)
            effects.mediaObjects?.append(media)
            selectedElementId = media.id
        } else if var audio = effects.audioPlayerObjects?.first(where: { $0.id == id }) {
            guard canAddMedia else { return }
            audio.id = UUID().uuidString
            audio.x = min(1.0, audio.x + 0.05)
            audio.y = min(1.0, audio.y + 0.05)
            effects.audioPlayerObjects?.append(audio)
            selectedElementId = audio.id
        }
        currentEffects = effects
    }

    // MARK: - Z-Order

    private var nextZIndex: Int = 1

    func bringToFront(id: String) {
        nextZIndex += 1
        // Z-index is tracked locally per element type
        // The view layer uses this to set zIndex modifier
    }

    func sendToBack(id: String) {
        // Set zIndex to 0 for this element
    }

    // MARK: - Tool Actions

    func selectTool(_ tool: StoryToolMode?) {
        if activeTool == tool {
            activeTool = nil
        } else {
            activeTool = tool
        }
        // Clear selection when switching to fond tools
        if tool?.group == .fond {
            selectedElementId = nil
        }
    }

    func deselectAll() {
        selectedElementId = nil
        activeTool = nil
    }

    // MARK: - Draft

    private let draftKey = "storyComposerDraft_v3"

    func saveDraft() {
        guard let data = try? JSONEncoder().encode(slides) else { return }
        UserDefaults.standard.set(data, forKey: draftKey)
    }

    func loadDraft() -> Bool {
        guard let data = UserDefaults.standard.data(forKey: draftKey),
              let saved = try? JSONDecoder().decode([StorySlide].self, from: data) else {
            return false
        }
        slides = saved
        currentSlideIndex = 0
        return true
    }

    func clearDraft() {
        UserDefaults.standard.removeObject(forKey: draftKey)
    }
}

// MARK: - Safe Array Access

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
```

**Step 2: Verify build**

Run: `./apps/ios/meeshy.sh build`
Expected: SUCCESS

**Step 3: Commit**

```
feat(story): add StoryComposerViewModel with @Observable
```

---

## Task 3: Create ContextualToolbar

**Files:**
- Create: `Sources/MeeshyUI/Story/ContextualToolbar.swift`

**Context:** Horizontal scrollable toolbar with pills grouped into Fond / Front / Plus, separated by subtle dividers. Each pill shows a badge counter when content exists. Active pill uses indigo gradient.

**Step 1: Create the toolbar**

```swift
import SwiftUI
import MeeshySDK

struct ContextualToolbar: View {
    @Bindable var viewModel: StoryComposerViewModel
    @Environment(\.meeshyTheme) private var theme

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                // FOND group
                toolGroupLabel("FOND")
                toolPill(.bgMedia, icon: "photo.fill", label: "Fond", badge: bgMediaCount)
                toolPill(.drawing, icon: "pencil.tip", label: "Dessin", badge: hasDrawing ? 1 : 0)
                toolPill(.bgAudio, icon: "music.note", label: "Ambiance", badge: hasBgAudio ? 1 : 0)

                divider

                // FRONT group
                toolGroupLabel("FRONT")
                toolPill(.text, icon: "textformat", label: "Texte", badge: textCount)
                toolPill(.image, icon: "photo", label: "Image", badge: fgImageCount)
                toolPill(.video, icon: "video.fill", label: "Vidéo", badge: fgVideoCount)
                toolPill(.audio, icon: "waveform", label: "Audio", badge: fgAudioCount)

                divider

                // PLUS group
                toolPill(.filter, icon: "camera.filters", label: "Filtre", badge: hasFilter ? 1 : 0)
                toolPill(.effects, icon: "sparkles", label: "Effets", badge: hasEffects ? 1 : 0)
                toolPill(.timeline, icon: "timeline.selection", label: "Timeline", badge: 0)
            }
            .padding(.horizontal, 12)
        }
        .frame(height: 44)
    }

    // MARK: - Pill

    @ViewBuilder
    private func toolPill(_ tool: StoryToolMode, icon: String, label: String, badge: Int) -> some View {
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
                        .offset(x: 4, y: -4)
                }
            }
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func pillBackground(isActive: Bool) -> some View {
        if isActive {
            LinearGradient(
                colors: [Color(hex: "#6366F1"), Color(hex: "#4338CA")],
                startPoint: .leading,
                endPoint: .trailing
            )
        } else {
            theme.surfaceTertiary
        }
    }

    private func badgeView(count: Int) -> some View {
        Text("\(count)")
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(.white)
            .frame(minWidth: 14, minHeight: 14)
            .background(Color(hex: "#818CF8"))
            .clipShape(Circle())
    }

    private func toolGroupLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 9, weight: .heavy, design: .rounded))
            .foregroundStyle(theme.textTertiary)
            .padding(.trailing, 2)
    }

    private var divider: some View {
        Rectangle()
            .fill(theme.borderSubtle)
            .frame(width: 1, height: 24)
            .padding(.horizontal, 4)
    }

    // MARK: - Badge Counts

    private var textCount: Int { viewModel.currentEffects.textObjects?.count ?? 0 }
    private var fgImageCount: Int { viewModel.currentEffects.mediaObjects?.filter { $0.mediaType == "image" && $0.placement == "foreground" }.count ?? 0 }
    private var fgVideoCount: Int { viewModel.currentEffects.mediaObjects?.filter { $0.mediaType == "video" && $0.placement == "foreground" }.count ?? 0 }
    private var fgAudioCount: Int { viewModel.currentEffects.audioPlayerObjects?.filter { $0.placement == "foreground" }.count ?? 0 }
    private var bgMediaCount: Int { viewModel.currentEffects.mediaObjects?.filter { $0.placement == "background" }.count ?? 0 }
    private var hasDrawing: Bool { viewModel.drawingData != nil }
    private var hasBgAudio: Bool { viewModel.currentEffects.backgroundAudioId != nil }
    private var hasFilter: Bool { viewModel.currentEffects.filter != nil }
    private var hasEffects: Bool { viewModel.currentEffects.opening != nil || viewModel.currentEffects.closing != nil }

    private func isToolDisabled(_ tool: StoryToolMode) -> Bool {
        switch tool {
        case .text: return !viewModel.canAddText
        case .image: return !viewModel.canAddImage
        case .video: return !viewModel.canAddVideo
        case .audio: return !viewModel.canAddAudio
        default: return false
        }
    }
}
```

**Step 2: Verify build**

Run: `./apps/ios/meeshy.sh build`
Expected: May need to add `Color(hex:)` initializer if not already available or adjust theme property names. Fix any compilation errors.

**Step 3: Commit**

```
feat(story): add contextual toolbar with Fond/Front/Plus groups
```

---

## Task 4: Create SelectionGlowModifier and ContextMenuModifier

**Files:**
- Create: `Sources/MeeshyUI/Story/CanvasElementModifiers.swift`

**Context:** Pure gesture interaction — no chrome borders. Selected element gets a subtle indigo glow. Long press shows context menu (duplicate, delete, bring forward/back, timing, lock).

**Step 1: Create the modifiers file**

```swift
import SwiftUI
import MeeshySDK

// MARK: - Selection Glow

struct SelectionGlowModifier: ViewModifier {
    let isSelected: Bool

    func body(content: Content) -> some View {
        content
            .shadow(
                color: isSelected ? Color(hex: "#6366F1").opacity(0.6) : .clear,
                radius: isSelected ? 8 : 0
            )
            .animation(.easeInOut(duration: 0.2), value: isSelected)
    }
}

extension View {
    func selectionGlow(_ isSelected: Bool) -> some View {
        modifier(SelectionGlowModifier(isSelected: isSelected))
    }
}

// MARK: - Canvas Element Context Menu

struct CanvasContextMenu: ViewModifier {
    let elementId: String
    let elementType: CanvasElementType
    @Bindable var viewModel: StoryComposerViewModel

    func body(content: Content) -> some View {
        content
            .contextMenu {
                Button {
                    viewModel.duplicateElement(id: elementId)
                } label: {
                    Label("Dupliquer", systemImage: "doc.on.doc")
                }

                Button(role: .destructive) {
                    viewModel.deleteElement(id: elementId)
                } label: {
                    Label("Supprimer", systemImage: "trash")
                }

                Divider()

                Button {
                    viewModel.bringToFront(id: elementId)
                } label: {
                    Label("Mettre devant", systemImage: "square.3.layers.3d.top.filled")
                }

                Button {
                    viewModel.sendToBack(id: elementId)
                } label: {
                    Label("Mettre derrière", systemImage: "square.3.layers.3d.bottom.filled")
                }

                if elementType == .video || elementType == .audio || elementType == .text {
                    Divider()

                    Button {
                        viewModel.activeTool = .timeline
                        viewModel.selectedElementId = elementId
                    } label: {
                        Label("Timing", systemImage: "clock")
                    }
                }
            }
    }
}

extension View {
    func canvasContextMenu(
        elementId: String,
        elementType: CanvasElementType,
        viewModel: StoryComposerViewModel
    ) -> some View {
        modifier(CanvasContextMenu(
            elementId: elementId,
            elementType: elementType,
            viewModel: viewModel
        ))
    }
}
```

**Step 2: Verify build**

Run: `./apps/ios/meeshy.sh build`

**Step 3: Commit**

```
feat(story): add selection glow and context menu modifiers
```

---

## Task 5: Create TimelinePanel (Simple + Advanced)

**Files:**
- Create: `Sources/MeeshyUI/Story/TimelinePanel.swift`
- Create: `Sources/MeeshyUI/Story/TimelineTrackView.swift`

**Context:** Bottom sheet panel showing one track per timed element. Simple mode = list with basic controls. Advanced mode = horizontal timeline with playhead, fades, trim, volume curve. Toggle between modes.

**Step 1: Create TimelineTrackView (reusable track row)**

```swift
import SwiftUI
import MeeshySDK

// MARK: - Track Data

struct TimelineTrack: Identifiable {
    let id: String
    let name: String
    let type: TrackType
    var startTime: Float
    var duration: Float?
    var volume: Float?
    var loop: Bool
    var fadeIn: Float?
    var fadeOut: Float?

    enum TrackType {
        case bgVideo, bgAudio, fgVideo, fgAudio, text

        var icon: String {
            switch self {
            case .bgVideo: return "tv.fill"
            case .bgAudio: return "music.note"
            case .fgVideo: return "video.fill"
            case .fgAudio: return "waveform"
            case .text: return "textformat"
            }
        }

        var color: Color {
            switch self {
            case .bgVideo: return Color(hex: "#4338CA")   // indigo700
            case .bgAudio: return Color(hex: "#4F46E5")   // indigo600
            case .text:    return Color(hex: "#C7D2FE")    // indigo200
            case .fgVideo: return Color(hex: "#818CF8")    // indigo400
            case .fgAudio: return Color(hex: "#A5B4FC")    // indigo300
            }
        }
    }
}

// MARK: - Simple Track Row

struct SimpleTrackRow: View {
    @Binding var track: TimelineTrack
    let totalDuration: Float
    var onPlay: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                // Icon + Name
                Image(systemName: track.type.icon)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(track.type.color)
                    .frame(width: 20)

                Text(track.name)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                Spacer()

                // Play button (audio/video only)
                if track.type != .text {
                    Button(action: { onPlay?() }) {
                        Image(systemName: "play.fill")
                            .font(.system(size: 10))
                            .foregroundStyle(.white)
                            .frame(width: 24, height: 24)
                            .background(track.type.color.opacity(0.8))
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                }

                // Loop toggle (audio/video only)
                if track.type != .text {
                    Button {
                        track.loop.toggle()
                    } label: {
                        Image(systemName: "repeat")
                            .font(.system(size: 11))
                            .foregroundStyle(track.loop ? track.type.color : .secondary)
                    }
                    .buttonStyle(.plain)
                }
            }

            // Timing bar
            GeometryReader { geo in
                let w = geo.size.width
                let startPct = CGFloat(track.startTime / totalDuration)
                let durPct = CGFloat((track.duration ?? (totalDuration - track.startTime)) / totalDuration)

                ZStack(alignment: .leading) {
                    // Background rail
                    Capsule()
                        .fill(Color.secondary.opacity(0.15))
                        .frame(height: 8)

                    // Active segment
                    Capsule()
                        .fill(track.type.color)
                        .frame(width: max(12, w * durPct), height: 8)
                        .offset(x: w * startPct)
                }
            }
            .frame(height: 8)

            // Timing labels
            HStack {
                Text(formatTime(track.startTime))
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(.secondary)

                Spacer()

                if let dur = track.duration {
                    Text(formatTime(track.startTime + dur))
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
            }

            // Volume slider (audio/video only)
            if let vol = track.volume, track.type != .text {
                HStack(spacing: 6) {
                    Image(systemName: "speaker.fill")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                    Slider(value: Binding(
                        get: { Double(vol) },
                        set: { track.volume = Float($0) }
                    ), in: 0...1)
                    .tint(track.type.color)
                    Text("\(Int(vol * 100))%")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .frame(width: 32)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private func formatTime(_ seconds: Float) -> String {
        let m = Int(seconds) / 60
        let s = Int(seconds) % 60
        let ms = Int((seconds - Float(Int(seconds))) * 10)
        return String(format: "%d:%02d.%d", m, s, ms)
    }
}
```

**Step 2: Create TimelinePanel**

```swift
import SwiftUI
import MeeshySDK

struct TimelinePanel: View {
    @Bindable var viewModel: StoryComposerViewModel
    @State private var tracks: [TimelineTrack] = []
    @State private var playheadPosition: Float = 0
    @State private var isPlaying: Bool = false

    var body: some View {
        VStack(spacing: 0) {
            // Header with toggle
            timelineHeader

            Divider()

            // Tracks
            if viewModel.timelineMode == .simple {
                simpleTimeline
            } else {
                advancedTimeline
            }
        }
        .background(Color(hex: "#13111C").opacity(0.95))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .onAppear { buildTracks() }
        .onChange(of: viewModel.currentSlideIndex) { buildTracks() }
    }

    // MARK: - Header

    private var timelineHeader: some View {
        HStack {
            Text("Timeline")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white)

            Spacer()

            // Simple / Avancé toggle
            Picker("Mode", selection: $viewModel.timelineMode) {
                Text("Simple").tag(TimelineMode.simple)
                Text("Avancé").tag(TimelineMode.advanced)
            }
            .pickerStyle(.segmented)
            .frame(width: 160)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    // MARK: - Simple Mode

    private var simpleTimeline: some View {
        ScrollView(.vertical, showsIndicators: false) {
            LazyVStack(spacing: 2) {
                ForEach($tracks) { $track in
                    SimpleTrackRow(
                        track: $track,
                        totalDuration: slideTotalDuration,
                        onPlay: { playTrack(track) }
                    )
                    Divider().padding(.horizontal, 12)
                }
            }
        }
        .frame(maxHeight: 280)
    }

    // MARK: - Advanced Mode

    private var advancedTimeline: some View {
        VStack(spacing: 0) {
            // Transport controls
            transportBar

            // Time axis + tracks
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 1) {
                    timeAxis
                    ForEach($tracks) { $track in
                        advancedTrackRow(track: $track)
                    }
                }
            }
            .frame(maxHeight: 320)
        }
    }

    private var transportBar: some View {
        HStack(spacing: 16) {
            Button(action: { playheadPosition = 0 }) {
                Image(systemName: "backward.end.fill")
                    .font(.system(size: 14))
            }

            Button(action: { isPlaying.toggle() }) {
                Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 16))
            }

            Button(action: { playheadPosition = slideTotalDuration }) {
                Image(systemName: "forward.end.fill")
                    .font(.system(size: 14))
            }

            Spacer()

            Text(formatTime(playheadPosition))
                .font(.system(size: 12, weight: .medium, design: .monospaced))
                .foregroundStyle(.white)

            Text("/ \(formatTime(slideTotalDuration))")
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(.secondary)
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    private var timeAxis: some View {
        GeometryReader { geo in
            let w = geo.size.width - 32 // padding
            let totalSec = max(1, slideTotalDuration)

            ZStack(alignment: .leading) {
                // Tick marks
                ForEach(0...Int(totalSec), id: \.self) { sec in
                    let x = 16 + (w * CGFloat(sec) / CGFloat(totalSec))
                    VStack(spacing: 1) {
                        Rectangle()
                            .fill(Color.secondary.opacity(0.4))
                            .frame(width: 1, height: sec % 5 == 0 ? 10 : 5)
                        if sec % 5 == 0 {
                            Text("\(sec)s")
                                .font(.system(size: 8, design: .monospaced))
                                .foregroundStyle(.secondary)
                        }
                    }
                    .position(x: x, y: 12)
                }

                // Playhead
                Rectangle()
                    .fill(.white)
                    .frame(width: 2, height: 24)
                    .position(
                        x: 16 + (w * CGFloat(playheadPosition / max(1, totalSec))),
                        y: 12
                    )
                    .gesture(
                        DragGesture()
                            .onChanged { val in
                                let pct = Float((val.location.x - 16) / w)
                                playheadPosition = max(0, min(totalSec, totalSec * pct))
                            }
                    )
            }
        }
        .frame(height: 28)
    }

    @ViewBuilder
    private func advancedTrackRow(track: Binding<TimelineTrack>) -> some View {
        let t = track.wrappedValue
        HStack(spacing: 6) {
            // Label
            HStack(spacing: 3) {
                Image(systemName: t.type.icon)
                    .font(.system(size: 10))
                Text(t.name)
                    .font(.system(size: 10))
                    .lineLimit(1)
            }
            .foregroundStyle(t.type.color)
            .frame(width: 70, alignment: .leading)

            // Track bar
            GeometryReader { geo in
                let w = geo.size.width
                let totalSec = max(1.0, slideTotalDuration)
                let startPct = CGFloat(t.startTime / totalSec)
                let durSec = t.duration ?? (totalSec - t.startTime)
                let durPct = CGFloat(durSec / totalSec)

                ZStack(alignment: .leading) {
                    // Rail
                    Rectangle()
                        .fill(Color.secondary.opacity(0.08))
                        .frame(height: 28)

                    // Bar with fades
                    HStack(spacing: 0) {
                        // Fade in
                        if let fi = t.fadeIn, fi > 0 {
                            LinearGradient(
                                colors: [t.type.color.opacity(0.2), t.type.color],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                            .frame(width: max(4, w * durPct * CGFloat(fi / durSec)))
                        }

                        // Main body
                        Rectangle().fill(t.type.color)

                        // Fade out
                        if let fo = t.fadeOut, fo > 0 {
                            LinearGradient(
                                colors: [t.type.color, t.type.color.opacity(0.2)],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                            .frame(width: max(4, w * durPct * CGFloat(fo / durSec)))
                        }
                    }
                    .frame(width: max(12, w * durPct), height: 28)
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                    .offset(x: w * startPct)
                    .gesture(
                        DragGesture()
                            .onChanged { val in
                                let newStart = Float(val.location.x / w) * totalSec
                                track.wrappedValue.startTime = max(0, min(totalSec - (t.duration ?? 1), newStart))
                            }
                    )
                }
            }
            .frame(height: 28)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 2)
    }

    // MARK: - Helpers

    private var slideTotalDuration: Float { 15.0 } // default slide duration

    private func buildTracks() {
        var result: [TimelineTrack] = []
        let effects = viewModel.currentEffects

        // Background video
        if let bgVid = effects.mediaObjects?.first(where: { $0.placement == "background" && $0.mediaType == "video" }) {
            result.append(TimelineTrack(
                id: bgVid.id, name: "Vidéo BG", type: .bgVideo,
                startTime: bgVid.startTime, duration: bgVid.duration,
                volume: bgVid.volume, loop: bgVid.loop,
                fadeIn: bgVid.fadeIn, fadeOut: bgVid.fadeOut
            ))
        }

        // Background audio
        if effects.backgroundAudioId != nil {
            result.append(TimelineTrack(
                id: "bg-audio", name: "Audio BG", type: .bgAudio,
                startTime: 0, duration: nil,
                volume: effects.backgroundAudioVolume ?? 1.0, loop: true,
                fadeIn: nil, fadeOut: nil
            ))
        }

        // Texts
        for text in effects.textObjects ?? [] {
            result.append(TimelineTrack(
                id: text.id, name: text.content.prefix(12) + (text.content.count > 12 ? "…" : ""), type: .text,
                startTime: text.startTime, duration: text.displayDuration,
                volume: nil, loop: false,
                fadeIn: text.fadeIn, fadeOut: text.fadeOut
            ))
        }

        // Foreground videos
        for vid in effects.mediaObjects?.filter({ $0.placement == "foreground" && $0.mediaType == "video" }) ?? [] {
            result.append(TimelineTrack(
                id: vid.id, name: "Vidéo", type: .fgVideo,
                startTime: vid.startTime, duration: vid.duration,
                volume: vid.volume, loop: vid.loop,
                fadeIn: vid.fadeIn, fadeOut: vid.fadeOut
            ))
        }

        // Foreground audios
        for aud in effects.audioPlayerObjects?.filter({ $0.placement == "foreground" }) ?? [] {
            result.append(TimelineTrack(
                id: aud.id, name: "Audio", type: .fgAudio,
                startTime: aud.startTime, duration: aud.duration,
                volume: aud.volume, loop: aud.loop,
                fadeIn: aud.fadeIn, fadeOut: aud.fadeOut
            ))
        }

        tracks = result
    }

    private func playTrack(_ track: TimelineTrack) {
        // Individual playback — will be wired to AVPlayer/AVAudioPlayer
    }

    private func formatTime(_ seconds: Float) -> String {
        let m = Int(seconds) / 60
        let s = Int(seconds) % 60
        return String(format: "%d:%02d", m, s)
    }
}
```

**Step 3: Verify build**

Run: `./apps/ios/meeshy.sh build`

**Step 4: Commit**

```
feat(story): add timeline panel with simple and advanced modes
```

---

## Task 6: Rewrite StoryCanvasView with ViewModel

**Files:**
- Modify: `Sources/MeeshyUI/Story/StoryCanvasView.swift` (replace content)

**Context:** Replace binding-heavy canvas with ViewModel-driven rendering. Layer order: background color → bg image/video (gesture-manipulable) → drawing → front elements (text, media, audio). Selection glow, play buttons on media, double-tap to edit.

**Step 1: Rewrite StoryCanvasView**

The new canvas reads from `StoryComposerViewModel` instead of individual bindings. Key changes:
- Background image/video is manipulable (drag, pinch, rotate gestures)
- Foreground elements use `selectionGlow()` and `canvasContextMenu()` modifiers
- Videos/audios show integrated play button
- Tap on element = select + auto bring-to-front
- Double-tap text = open editor
- Double-tap image/video = open editor
- Fond tools active → front elements at opacity 0.4 + `.allowsHitTesting(false)`
- Front tools active → fond non-interactive

**This is a full file rewrite.** The implementer should:
1. Read the current `StoryCanvasView.swift` (372 lines)
2. Preserve the layer rendering logic (background, drawing, text, sticker, media, audio)
3. Replace all `@Binding` parameters with `@Bindable var viewModel: StoryComposerViewModel`
4. Add gesture-manipulable background media (drag + pinch + rotate on bg image/video)
5. Add selection glow on selected elements
6. Add context menu on long press
7. Add play buttons on video/audio elements
8. Add opacity dimming based on active tool group
9. Use the existing `DraggableTextObjectView`, `DraggableMediaView`, `StoryAudioPlayerView` subviews

**Step 2: Verify build**

Run: `./apps/ios/meeshy.sh build`

**Step 3: Commit**

```
feat(story): rewrite StoryCanvasView with ViewModel-driven rendering
```

---

## Task 7: Rewrite StoryComposerView as thin shell

**Files:**
- Modify: `Sources/MeeshyUI/Story/StoryComposerView.swift` (replace content)

**Context:** The new StoryComposerView is a thin container (~300 lines instead of 2064). It creates the ViewModel, composes TopBar + Canvas + ContextualToolbar + ActivePanel. All state lives in the ViewModel.

**Step 1: Rewrite StoryComposerView**

The implementer should:
1. Create `@State private var viewModel = StoryComposerViewModel()`
2. Body = ZStack of:
   - `StoryCanvasView(viewModel: viewModel)` (9:16 aspect ratio)
   - `TopBar` (dismiss, slide strip, preview, publish)
   - `ContextualToolbar(viewModel: viewModel)` at bottom
   - Active tool panel (conditional on `viewModel.activeTool`)
   - `TimelinePanel(viewModel: viewModel)` when timeline tool active
3. Keep the existing callbacks: `onPublishSlide`, `onPreview`, `onDismiss`
4. Keep the publish flow: `publishAllSlides()` iterates slides, snapshots, calls callback
5. Keep draft save/load
6. Wire up photo/video/audio pickers to ViewModel methods

**Step 2: Verify build**

Run: `./apps/ios/meeshy.sh build`

**Step 3: Commit**

```
feat(story): rewrite StoryComposerView as thin ViewModel-driven shell
```

---

## Task 8: Update StoryCanvasReaderView for timing playback

**Files:**
- Modify: `Sources/MeeshyUI/Story/StoryCanvasReaderView.swift`

**Context:** The reader must now respect `startTime`, `duration`, `fadeIn`, `fadeOut` on all elements. Text elements appear/disappear based on their timing. Audio/video elements start at their offset. Background video is gesture-positioned (using stored x, y, scale, rotation).

**Step 1: Add timing-aware rendering**

The implementer should:
1. Track a `currentTime: TimeInterval` that increments during playback
2. For each text object: show only when `currentTime >= startTime && currentTime < startTime + (displayDuration ?? ∞)`
3. Apply `fadeIn` opacity animation on appearance, `fadeOut` on disappearance
4. For media/audio: start AVPlayer at `startTime` offset, stop at `duration`
5. For loop elements: restart when reaching end of duration
6. For background video: apply stored position/scale/rotation (not interactive in reader)

**Step 2: Verify build**

Run: `./apps/ios/meeshy.sh build`

**Step 3: Commit**

```
feat(story): add timing-aware playback to StoryCanvasReaderView
```

---

## Task 9: Update DraggableMediaView with play button

**Files:**
- Modify: `Sources/MeeshyUI/Story/DraggableMediaView.swift`

**Context:** Add a semi-transparent play/pause button in the bottom-left corner of video and audio elements. Tap on button = play/pause. Tap elsewhere = select/deselect. Double-tap = open editor.

**Step 1: Add play button overlay**

Add to the media view body:
- For videos: small `▶`/`⏸` button (24×24, semi-transparent bg) at bottom-left
- Button tap toggles `AVPlayer.play()`/`pause()`
- The button has its own tap gesture that does NOT propagate to the drag gesture

**Step 2: Verify build**

Run: `./apps/ios/meeshy.sh build`

**Step 3: Commit**

```
feat(story): add integrated play/pause button to media elements
```

---

## Task 10: Integration test and polish

**Files:**
- All newly created/modified files

**Context:** End-to-end verification of the full composer flow.

**Step 1: Build and launch**

Run: `./apps/ios/meeshy.sh run`
Verify: App launches, navigate to story creation

**Step 2: Verify toolbar**

- [ ] All pills visible in scrollable toolbar
- [ ] Fond/Front/Plus groups separated by dividers
- [ ] Badge counters update when adding elements
- [ ] Active pill shows indigo gradient
- [ ] Disabled pills (at limit) show reduced opacity

**Step 3: Verify canvas interactions**

- [ ] Tap element = select (indigo glow)
- [ ] Tap empty = deselect
- [ ] Drag = move element
- [ ] Pinch = resize
- [ ] Two-finger rotate = rotate
- [ ] Double-tap text = open editor
- [ ] Double-tap image/video = open editor
- [ ] Long press = context menu (duplicate, delete, z-order, timing)
- [ ] Last touched = auto bring to front
- [ ] Background image/video = gesture manipulable (drag, pinch, rotate)

**Step 4: Verify timeline**

- [ ] Timeline opens from toolbar
- [ ] All elements shown as tracks (bg video, bg audio, texts, fg videos, fg audios)
- [ ] Simple mode: timing bars, volume sliders, loop toggles
- [ ] Advanced mode: time axis, playhead, fade visuals, drag to reposition
- [ ] Toggle between Simple/Advanced preserved

**Step 5: Verify playback**

- [ ] Play button on videos works (play/pause)
- [ ] Play button on audios works (play/pause)
- [ ] Preview button plays full slide with timing

**Step 6: Verify publish**

- [ ] Publication flow works as before
- [ ] New timing fields serialized in effects
- [ ] Draft save/load includes new fields

**Step 7: Final commit**

```
feat(story): Story Composer V3 complete — contextual toolbar, timeline, pure gestures
```

---

## Summary

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| 1 | Extend StoryModels with timing fields | Small |
| 2 | Create StoryComposerViewModel | Large |
| 3 | Create ContextualToolbar | Medium |
| 4 | Create SelectionGlow + ContextMenu modifiers | Small |
| 5 | Create TimelinePanel (Simple + Advanced) | Large |
| 6 | Rewrite StoryCanvasView | Large |
| 7 | Rewrite StoryComposerView (thin shell) | Large |
| 8 | Update StoryCanvasReaderView for timing | Medium |
| 9 | Update DraggableMediaView with play button | Small |
| 10 | Integration test and polish | Medium |

**Total new files:** 4 (ViewModel, ContextualToolbar, CanvasElementModifiers, TimelinePanel+TrackView)
**Total modified files:** 5 (StoryModels, StoryCanvasView, StoryComposerView, StoryCanvasReaderView, DraggableMediaView)
