import SwiftUI
import MeeshySDK
import PencilKit

// MARK: - Tool Modes

enum StoryToolMode: String, CaseIterable {
    // Fond
    case bgMedia
    case drawing
    case bgAudio
    // Front
    case text
    case media
    case audio
    // Plus
    case filter
    case effects
    case timeline

    var group: StoryToolGroup {
        switch self {
        case .bgMedia, .drawing, .bgAudio: return .fond
        case .text, .media, .audio: return .front
        case .filter, .effects, .timeline: return .plus
        }
    }
}

enum StoryToolGroup: String {
    case fond, front, plus
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
        get { currentSlide.effects }
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

    // Per-slide background image transforms (persisted across slide changes)
    struct BackgroundTransform {
        var scale: CGFloat = 1.0
        var offsetX: CGFloat = 0
        var offsetY: CGFloat = 0
        var rotation: Double = 0
    }
    var backgroundTransform: BackgroundTransform = BackgroundTransform()
    private var backgroundTransformCache: [Int: BackgroundTransform] = [:]

    func saveBackgroundTransform() {
        backgroundTransformCache[currentSlideIndex] = backgroundTransform
    }

    func restoreBackgroundTransform() {
        backgroundTransform = backgroundTransformCache[currentSlideIndex] ?? BackgroundTransform()
    }

    // MARK: - Media Storage (pre-publication)

    var loadedImages: [String: UIImage] = [:]
    var loadedVideoURLs: [String: URL] = [:]
    var loadedAudioURLs: [String: URL] = [:]

    // MARK: - Timeline

    var isTimelineVisible: Bool = false
    var timelinePlaybackTime: Float = 0
    var isTimelinePlaying: Bool = false
    var timelineZoomScale: CGFloat = 1.0
    var timelineScrollOffset: CGFloat = 0
    var timelineAdvanced: Bool = false
    var isMuted: Bool = false
    var hasBackgroundImage: Bool = false

    // MARK: - Slide Duration

    var currentSlideDuration: Float {
        get { Float(currentSlide.duration) }
        set {
            let clamped = max(2, min(600, newValue))
            var slide = currentSlide
            slide.duration = TimeInterval(clamped)
            currentSlide = slide
        }
    }

    func autoExtendDuration(forElementEnd end: Float) {
        if end > currentSlideDuration {
            currentSlideDuration = min(600, end + 0.5)
        }
    }

    // MARK: - Canvas Viewport

    var canvasScale: CGFloat = 1.0
    var canvasOffset: CGSize = .zero
    var canvasSize: CGSize = .zero

    var isCanvasZoomed: Bool { canvasScale != 1.0 }

    func resetCanvasZoom() {
        canvasScale = 1.0
        canvasOffset = .zero
    }

    /// Returns the normalized (0-1) canvas position corresponding to the current viewport center.
    /// When zoomed/panned, new elements should appear at the visible center, not at (0.5, 0.5).
    func viewportCenter() -> CGPoint {
        guard canvasSize.width > 0, canvasSize.height > 0, canvasScale > 0 else {
            return CGPoint(x: 0.5, y: 0.5)
        }
        let nx = 0.5 - canvasOffset.width / (canvasScale * canvasSize.width)
        let ny = 0.5 - canvasOffset.height / (canvasScale * canvasSize.height)
        return CGPoint(
            x: max(0.05, min(0.95, nx)),
            y: max(0.05, min(0.95, ny))
        )
    }

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
    var canAddImage: Bool {
        canAddMedia &&
        (currentEffects.mediaObjects?.filter { $0.mediaType == "image" && $0.placement == "foreground" }.count ?? 0) < 5
    }
    var canAddVideo: Bool {
        canAddMedia &&
        (currentEffects.mediaObjects?.filter { $0.mediaType == "video" && $0.placement == "foreground" }.count ?? 0) < 4
    }
    var canAddAudio: Bool {
        canAddMedia &&
        (currentEffects.audioPlayerObjects?.filter { $0.placement == "foreground" }.count ?? 0) < 5
    }

    // MARK: - Slide Management

    func addSlide() {
        guard canAddSlide else { return }
        let slide = StorySlide(order: slides.count)
        slides.append(slide)
        currentSlideIndex = slides.count - 1
    }

    func removeSlide(at index: Int) {
        guard slides.count > 1, slides.indices.contains(index) else { return }
        let slideId = slides[index].id
        slides.remove(at: index)
        slideImages.removeValue(forKey: slideId)
        if currentSlideIndex >= slides.count {
            currentSlideIndex = slides.count - 1
        }
        reorderSlides()
    }

    func duplicateSlide(at index: Int) {
        guard canAddSlide, slides.indices.contains(index) else { return }
        var copy = slides[index]
        copy.id = UUID().uuidString
        copy.order = slides.count
        slides.insert(copy, at: index + 1)
        currentSlideIndex = index + 1
        reorderSlides()
    }

    func selectSlide(at index: Int) {
        guard slides.indices.contains(index) else { return }
        saveBackgroundTransform()
        selectedElementId = nil
        activeTool = nil
        currentSlideIndex = index
        zIndexMap = [:]
        nextZIndex = 1
        restoreBackgroundTransform()
    }

    func moveSlide(from source: Int, to destination: Int) {
        guard source < slides.count,
              destination < slides.count,
              source != destination else { return }
        let slide = slides.remove(at: source)
        slides.insert(slide, at: destination)
        reorderSlides()
        currentSlideIndex = destination
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
        let center = viewportCenter()
        let obj = StoryTextObject(
            content: "",
            x: center.x,
            y: center.y,
            scale: 1.0,
            rotation: 0,
            textStyle: "classic",
            textColor: "FFFFFF",
            textSize: 24,
            textAlign: "center"
        )
        var effects = currentEffects
        var texts = effects.textObjects ?? []
        texts.append(obj)
        effects.textObjects = texts
        currentEffects = effects
        selectedElementId = obj.id
        bringToFront(id: obj.id)
        activeTool = .text
        return obj
    }

    @discardableResult
    func addMediaObject(type: String, placement: String = "foreground") -> StoryMediaObject? {
        guard canAddMedia else { return nil }
        let center = viewportCenter()
        let obj = StoryMediaObject(
            postMediaId: "",
            mediaType: type,
            placement: placement,
            x: center.x,
            y: center.y,
            scale: 1.0,
            rotation: 0,
            volume: 1.0
        )
        var effects = currentEffects
        var medias = effects.mediaObjects ?? []
        medias.append(obj)
        effects.mediaObjects = medias
        currentEffects = effects
        selectedElementId = obj.id
        bringToFront(id: obj.id)
        return obj
    }

    @discardableResult
    func addAudioObject(placement: String = "foreground") -> StoryAudioPlayerObject? {
        guard canAddMedia else { return nil }
        let center = viewportCenter()
        let obj = StoryAudioPlayerObject(
            postMediaId: "",
            placement: placement,
            x: center.x,
            y: min(0.9, center.y + 0.15),
            volume: 1.0,
            waveformSamples: []
        )
        var effects = currentEffects
        var audios = effects.audioPlayerObjects ?? []
        audios.append(obj)
        effects.audioPlayerObjects = audios
        currentEffects = effects
        selectedElementId = obj.id
        bringToFront(id: obj.id)
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
        loadedImages.removeValue(forKey: id)
        loadedVideoURLs.removeValue(forKey: id)
        loadedAudioURLs.removeValue(forKey: id)
        zIndexMap.removeValue(forKey: id)
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
            let newId = UUID().uuidString
            media.id = newId
            media.x = min(1.0, media.x + 0.05)
            media.y = min(1.0, media.y + 0.05)
            effects.mediaObjects?.append(media)
            if let img = loadedImages[id] { loadedImages[newId] = img }
            if let url = loadedVideoURLs[id] { loadedVideoURLs[newId] = url }
            selectedElementId = media.id
        } else if var audio = effects.audioPlayerObjects?.first(where: { $0.id == id }) {
            guard canAddMedia else { return }
            let newId = UUID().uuidString
            audio.id = newId
            audio.x = min(1.0, audio.x + 0.05)
            audio.y = min(1.0, audio.y + 0.05)
            effects.audioPlayerObjects?.append(audio)
            if let url = loadedAudioURLs[id] { loadedAudioURLs[newId] = url }
            selectedElementId = audio.id
        }
        currentEffects = effects
    }

    // MARK: - Z-Order

    private var zIndexMap: [String: Int] = [:]
    private var nextZIndex: Int = 1

    func zIndex(for id: String) -> Int {
        zIndexMap[id] ?? 0
    }

    func bringToFront(id: String) {
        zIndexMap[id] = nextZIndex
        nextZIndex += 1
    }

    func sendToBack(id: String) {
        zIndexMap[id] = 0
    }

    // MARK: - Tool Actions

    func selectTool(_ tool: StoryToolMode?) {
        if activeTool == tool {
            activeTool = nil
        } else {
            activeTool = tool
        }
        if tool?.group == .fond {
            selectedElementId = nil
        }
    }

    func deselectAll() {
        selectedElementId = nil
        activeTool = nil
    }

    // MARK: - Slide Image Management

    func setImage(_ image: UIImage?, for slideId: String) {
        if let image {
            slideImages[slideId] = image
        } else {
            slideImages.removeValue(forKey: slideId)
        }
    }

    func imageForCurrentSlide() -> UIImage? {
        slideImages[currentSlide.id]
    }

    // MARK: - Reset
    // Note: Draft persistence is handled by StoryComposerView via StoryDraftStore — not by the ViewModel.

    func reset() {
        slides = [StorySlide()]
        currentSlideIndex = 0
        slideImages = [:]
        selectedElementId = nil
        activeTool = nil
        drawingData = nil
        drawingColor = .white
        drawingWidth = 5
        backgroundColor = "#000000"
        loadedImages = [:]
        loadedVideoURLs = [:]
        loadedAudioURLs = [:]
        isTimelineVisible = false
        timelinePlaybackTime = 0
        isTimelinePlaying = false
        timelineZoomScale = 1.0
        timelineScrollOffset = 0
        showPhotoPicker = false
        showVideoPicker = false
        showAudioPicker = false
        publishProgress = nil
        errorMessage = nil
        showDraftAlert = false
        canvasScale = 1.0
        canvasOffset = .zero
        zIndexMap = [:]
        nextZIndex = 1
    }
}

// MARK: - Safe Array Access

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
