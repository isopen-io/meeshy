import SwiftUI
import UIKit
import MeeshySDK
import PencilKit

// MARK: - Tool Modes

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
public final class StoryComposerViewModel {

    // MARK: - Keyboard Language Detection

    private var detectedKeyboardLanguage: String {
        if let kbd = UITextInputMode.activeInputModes.first?.primaryLanguage {
            return String(kbd.prefix(2))
        }
        return AuthManager.shared.currentUser?.systemLanguage ?? "fr"
    }

    // MARK: - Slides

    var slides: [StorySlide] = [StorySlide()]
    var currentSlideIndex: Int = 0
    var slideImages: [String: UIImage] = [:]

    // MARK: - Repost source (Patch B.6 — exposed publicly so the iOS caller in Phase C
    // can read them before invoking PostService.create / createStory with repostOfId).
    var repostOfId: String?
    var originalRepostOfId: String?

    // Cancellable preload Task started by `init(reposting:authorHandle:)`.
    // Marked `nonisolated(unsafe)` so the `nonisolated deinit` below can cancel it
    // without requiring a MainActor hop (cancellation is Sendable / thread-safe).
    nonisolated(unsafe) private var preloadTask: Task<Void, Never>?

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

    var isContentToolActive: Bool { activeTool?.tab == .contenu }

    // MARK: - Drawing

    var drawingData: Data?
    var drawingColor: Color = .white
    var drawingWidth: CGFloat = 5
    var isDrawingActive: Bool { activeTool == .drawing }

    // MARK: - Background

    var backgroundColor: String = "#\(StoryBackgroundPalette.randomBackgroundColor())"

    // Per-slide background image transforms (persisted across slide changes)
    struct BackgroundTransform {
        var scale: CGFloat = 1.0
        var offsetX: CGFloat = 0
        var offsetY: CGFloat = 0
        var rotation: Double = 0
    }
    var backgroundTransform: BackgroundTransform = BackgroundTransform()
    /// Per-slide background transform cache, keyed by `slide.id` rather than its index.
    /// Index keying broke after slide reordering or removal: deleting slide 0 promoted
    /// slide 1's content to position 0 but `restoreBackgroundTransform()` would still
    /// load the old slide 0's transform (now stranded at key `0`). Using the stable
    /// slide ID survives any reorder/insert/remove operation.
    private var backgroundTransformCache: [String: BackgroundTransform] = [:]

    func saveBackgroundTransform() {
        guard let id = slides[safe: currentSlideIndex]?.id else { return }
        backgroundTransformCache[id] = backgroundTransform
    }

    func restoreBackgroundTransform() {
        guard let id = slides[safe: currentSlideIndex]?.id else {
            backgroundTransform = BackgroundTransform()
            return
        }
        backgroundTransform = backgroundTransformCache[id] ?? BackgroundTransform()
    }

    // MARK: - Media Storage (pre-publication)

    var loadedImages: [String: UIImage] = [:]
    var loadedVideoURLs: [String: URL] = [:]
    var loadedAudioURLs: [String: URL] = [:]

    // MARK: - Media Aspect Ratios (render-time only, not persisted)

    /// Natural aspect ratio (width/height) for each loaded media object, keyed by mediaObject.id.
    /// Computed from UIImage.size or AVAsset track size. Used to render media in its natural
    /// proportions instead of forcing a square frame. When unknown, `1.0` is used as fallback.
    var mediaAspectRatios: [String: CGFloat] = [:]

    func setAspectRatio(_ ratio: CGFloat, for mediaId: String) {
        guard ratio.isFinite, ratio > 0 else { return }
        mediaAspectRatios[mediaId] = ratio
    }

    // MARK: - Active Drag State (for alignment guides + warnings)

    /// Snapshot of the foreground element being dragged. Held as a single optional struct
    /// to keep id / position / size in sync — three independent properties would invite
    /// inconsistent intermediate states. `nil` when no drag is active.
    struct ActiveDrag: Equatable {
        let elementId: String
        var position: CGPoint
        var size: CGSize
    }

    var activeDrag: ActiveDrag?

    func beginDrag(elementId: String, position: CGPoint, size: CGSize) {
        activeDrag = ActiveDrag(elementId: elementId, position: position, size: size)
    }

    func updateDrag(position: CGPoint) {
        guard var current = activeDrag, current.position != position else { return }
        current.position = position
        activeDrag = current
    }

    func endDrag() {
        activeDrag = nil
    }

    // MARK: - Timeline

    var isTimelineVisible: Bool = false
    var timelinePlaybackTime: Float = 0
    var isTimelinePlaying: Bool = false
    var timelineZoomScale: CGFloat = 1.0
    var timelineScrollOffset: CGFloat = 0
    var timelineAdvanced: Bool = false
    var isMuted: Bool = false
    var hasBackgroundImage: Bool = false

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

    func autoExtendDuration(forElementEnd end: Float, slideId: String? = nil) {
        // Target the slide that owns the element, NOT the currently-visible one.
        // Without this, a video added to slide 0 while the user is on slide 1
        // (PhotosPicker async race) would extend slide 1's duration.
        let targetIndex: Int = {
            if let id = slideId, let idx = slides.firstIndex(where: { $0.id == id }) {
                return idx
            }
            return currentSlideIndex
        }()
        guard slides.indices.contains(targetIndex) else { return }
        let current = Float(slides[targetIndex].duration)
        if end > current {
            slides[targetIndex].duration = TimeInterval(min(600, end + 0.5))
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
        (currentEffects.mediaObjects?.filter { $0.kind == .image }.count ?? 0) < 5
    }
    var canAddVideo: Bool {
        canAddMedia &&
        (currentEffects.mediaObjects?.filter { $0.kind == .video }.count ?? 0) < 4
    }
    var canAddAudio: Bool {
        canAddMedia &&
        (currentEffects.audioPlayerObjects?.count ?? 0) < 5
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
        let slide = slides[index]
        let slideId = slide.id
        let mediaIds = (slide.effects.mediaObjects ?? []).map(\.id)
        let audioIds = (slide.effects.audioPlayerObjects ?? []).map(\.id)
        slides.remove(at: index)
        slideImages.removeValue(forKey: slideId)
        backgroundTransformCache.removeValue(forKey: slideId)
        for id in mediaIds {
            loadedImages.removeValue(forKey: id)
            loadedVideoURLs.removeValue(forKey: id)
            mediaAspectRatios.removeValue(forKey: id)
            zIndexMap.removeValue(forKey: id)
        }
        for id in audioIds {
            loadedAudioURLs.removeValue(forKey: id)
            zIndexMap.removeValue(forKey: id)
        }
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
        rehydrateZIndexMapFromSlide()
        restoreBackgroundTransform()
    }

    /// Rebuild `zIndexMap` from the current slide's persisted `zIndex` fields. The map
    /// is the in-memory cache for `bringToFront` ordering during composer edits;
    /// hydrating from the model means an element promoted on slide 0 retains its
    /// front-position when the user comes back from slide 1. `nextZIndex` advances
    /// past the highest persisted value so newly-promoted elements still rise above.
    private func rehydrateZIndexMapFromSlide() {
        var map: [String: Int] = [:]
        var maxZ = 0
        let effects = currentEffects
        for obj in (effects.textObjects ?? []) {
            if let z = obj.zIndex { map[obj.id] = z; maxZ = max(maxZ, z) }
        }
        for obj in (effects.mediaObjects ?? []) {
            if let z = obj.zIndex { map[obj.id] = z; maxZ = max(maxZ, z) }
        }
        for obj in (effects.audioPlayerObjects ?? []) {
            if let z = obj.zIndex { map[obj.id] = z; maxZ = max(maxZ, z) }
        }
        for obj in (effects.stickerObjects ?? []) {
            if let z = obj.zIndex { map[obj.id] = z; maxZ = max(maxZ, z) }
        }
        zIndexMap = map
        nextZIndex = maxZ + 1
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
        let center = CGPoint(x: 0.5, y: 0.5)
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
    func addMediaObject(kind: StoryMediaKind, toSlideId: String? = nil) -> StoryMediaObject? {
        guard canAddMedia else { return nil }
        // Resolve the target slide. If the caller pinned a specific id (e.g., the
        // PhotosPicker started on slide 0 and the user switched to slide 1 mid-load),
        // honour it — without this guard, the new media object would be appended to
        // whichever slide happened to be active when the async task resolved.
        let targetSlideIndex: Int = {
            if let id = toSlideId, let idx = slides.firstIndex(where: { $0.id == id }) {
                return idx
            }
            return currentSlideIndex
        }()
        guard slides.indices.contains(targetSlideIndex) else { return nil }

        let center = CGPoint(x: 0.5, y: 0.5)
        var targetEffects = slides[targetSlideIndex].effects
        // Auto-background uniquement si la slide n'a aucun media visuel (pre-migration
        // inclus : resolvedBackgroundMedia retombe sur le 1er existant).
        let shouldBeBackground = targetEffects.resolvedBackgroundMedia == nil
        let obj = StoryMediaObject(
            postMediaId: "",
            kind: kind,
            placement: "media",
            x: center.x,
            y: center.y,
            scale: 1.0,
            rotation: 0,
            volume: 1.0,
            isBackground: shouldBeBackground ? true : nil,
            sourceLanguage: detectedKeyboardLanguage
        )
        var medias = targetEffects.mediaObjects ?? []
        medias.append(obj)
        targetEffects.mediaObjects = medias
        slides[targetSlideIndex].effects = targetEffects
        // Selection / z-index state is composer-global; only mutate it when we're
        // actually adding to the currently-visible slide so the UI doesn't jump.
        if targetSlideIndex == currentSlideIndex {
            selectedElementId = obj.id
            bringToFront(id: obj.id)
        }
        return obj
    }

    @discardableResult
    func addAudioObject() -> StoryAudioPlayerObject? {
        guard canAddMedia else { return nil }
        let center = CGPoint(x: 0.5, y: 0.5)
        // Auto-bascule en background si aucun audio n'est déjà en background
        // (ni via isBackground=true, ni via le champ legacy backgroundAudioId).
        let hasExistingBackgroundAudio = currentEffects.resolvedBackgroundAudio != nil
        let obj = StoryAudioPlayerObject(
            postMediaId: "",
            placement: "overlay",
            x: center.x,
            y: min(0.9, center.y + 0.15),
            volume: 1.0,
            waveformSamples: [],
            isBackground: hasExistingBackgroundAudio ? nil : true,
            sourceLanguage: detectedKeyboardLanguage
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
        mediaAspectRatios.removeValue(forKey: id)
        zIndexMap.removeValue(forKey: id)
    }

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

    // MARK: - Background toggle

    /// Bascule le statut background pour un media visuel OU un audio.
    /// Contrainte : au plus 1 media visuel en background + 1 audio en background par slide.
    /// Toggle ON sur un élément → les autres du même type sont repassés en foreground.
    /// Toggle OFF → l'élément redevient foreground (aucun autre n'est promu automatiquement).
    func toggleBackground(id: String) {
        var effects = currentEffects

        if let idx = effects.mediaObjects?.firstIndex(where: { $0.id == id }) {
            let current = effects.mediaObjects![idx].isBackground == true
                // Si le media est le background implicite (pas de flag explicite mais
                // positionné par la règle legacy), on considère qu'il est déjà en bg.
                || effects.resolvedBackgroundMedia?.id == id
            let newValue = !current
            if newValue {
                for i in effects.mediaObjects!.indices {
                    effects.mediaObjects![i].isBackground = (i == idx) ? true : false
                }
            } else {
                // Matérialise le flag à `false` pour neutraliser la règle legacy.
                effects.mediaObjects![idx].isBackground = false
            }
            currentEffects = effects
            return
        }

        if let idx = effects.audioPlayerObjects?.firstIndex(where: { $0.id == id }) {
            let current = effects.audioPlayerObjects![idx].isBackground == true
            let newValue = !current
            if newValue {
                for i in effects.audioPlayerObjects!.indices {
                    effects.audioPlayerObjects![i].isBackground = (i == idx) ? true : false
                }
                // Toggle ON sur un audio foreground → on retire aussi le bg legacy pour
                // éviter d'avoir 2 audios bg qui jouent en parallèle.
                effects.backgroundAudioId = nil
                effects.backgroundAudioVolume = nil
                effects.backgroundAudioStart = nil
                effects.backgroundAudioEnd = nil
                effects.backgroundAudioVariants = nil
            } else {
                effects.audioPlayerObjects![idx].isBackground = false
            }
            currentEffects = effects
        }
    }

    /// True si l'élément (media ou audio) est actuellement résolu comme background.
    func isBackground(id: String) -> Bool {
        if currentEffects.resolvedBackgroundMedia?.id == id { return true }
        if currentEffects.resolvedBackgroundAudio?.id == id { return true }
        return false
    }

    // MARK: - Z-Order

    private var zIndexMap: [String: Int] = [:]
    private var nextZIndex: Int = 1

    func zIndex(for id: String) -> Int {
        zIndexMap[id] ?? 0
    }

    /// Promote an element to the front. Persists the value into the slide's effects so
    /// the order survives slide-switches AND publish (the reader applies the same
    /// `zIndex` modifier for WYSIWYG playback). Previously the map was in-memory only,
    /// so re-entering slide N showed elements in array-order with no memory of past
    /// `bringToFront` actions.
    func bringToFront(id: String) {
        let z = nextZIndex
        zIndexMap[id] = z
        nextZIndex += 1
        persistZIndex(z, for: id)
    }

    func sendToBack(id: String) {
        zIndexMap[id] = 0
        persistZIndex(0, for: id)
    }

    private func persistZIndex(_ z: Int, for id: String) {
        var effects = currentEffects
        if var texts = effects.textObjects, let i = texts.firstIndex(where: { $0.id == id }) {
            texts[i].zIndex = z; effects.textObjects = texts
        } else if var medias = effects.mediaObjects, let i = medias.firstIndex(where: { $0.id == id }) {
            medias[i].zIndex = z; effects.mediaObjects = medias
        } else if var audios = effects.audioPlayerObjects, let i = audios.firstIndex(where: { $0.id == id }) {
            audios[i].zIndex = z; effects.audioPlayerObjects = audios
        } else if var stickers = effects.stickerObjects, let i = stickers.firstIndex(where: { $0.id == id }) {
            stickers[i].zIndex = z; effects.stickerObjects = stickers
        } else {
            return  // Sticker handled by view-level state — caller patches via onUpdate
        }
        currentEffects = effects
    }

    // MARK: - Tool Actions

    func selectTool(_ tool: StoryToolMode?) {
        if activeTool == tool {
            activeTool = nil
        } else {
            activeTool = tool
        }
        if tool == .drawing {
            selectedElementId = nil
        }
    }

    func deselectAll() {
        selectedElementId = nil
        activeTool = nil
    }

    // MARK: - Memory Pressure & Cleanup

    private var memoryObserver: Any?

    func startMemoryObserver() {
        memoryObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.evictNonVisibleSlideMedia() }
        }
    }

    func stopMemoryObserver() {
        if let observer = memoryObserver {
            NotificationCenter.default.removeObserver(observer)
            memoryObserver = nil
        }
    }

    /// Evict cached media for slides not currently visible. Triggered by
    /// `UIApplication.didReceiveMemoryWarningNotification` via `startMemoryObserver`.
    /// Previously only `slideImages` (background thumbnails) and the global thumbnail
    /// cache were purged — `loadedImages` / `loadedVideoURLs` / `loadedAudioURLs` /
    /// `mediaAspectRatios` of foreground media on non-visible slides leaked, which
    /// could keep ~50 MB of UIImages around with 10 slides × 5 photos.
    /// Active-slide caches are preserved; the user is currently editing them and
    /// their re-decoding cost would be visible.
    func evictNonVisibleSlideMedia() {
        let currentSlideId = slides[safe: currentSlideIndex]?.id
        var keepIds = Set<String>()
        if let id = currentSlideId {
            for obj in (currentEffects.mediaObjects ?? []) { keepIds.insert(obj.id) }
            for obj in (currentEffects.audioPlayerObjects ?? []) { keepIds.insert(obj.id) }
        }

        for (index, slide) in slides.enumerated() where index != currentSlideIndex {
            slideImages.removeValue(forKey: slide.id)
            for obj in (slide.effects.mediaObjects ?? []) where !keepIds.contains(obj.id) {
                loadedImages.removeValue(forKey: obj.id)
                loadedVideoURLs.removeValue(forKey: obj.id)
                mediaAspectRatios.removeValue(forKey: obj.id)
            }
            for obj in (slide.effects.audioPlayerObjects ?? []) where !keepIds.contains(obj.id) {
                loadedAudioURLs.removeValue(forKey: obj.id)
            }
        }
        StoryMediaLoader.shared.clearThumbnailCache()
    }

    /// Remove temp video/audio files written during this session.
    func cleanupTempFiles() {
        for (_, url) in loadedVideoURLs {
            try? FileManager.default.removeItem(at: url)
        }
        for (_, url) in loadedAudioURLs {
            try? FileManager.default.removeItem(at: url)
        }
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
        backgroundColor = "#\(StoryBackgroundPalette.randomBackgroundColor())"
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

    // MARK: - Repost Initializer (Patch B.6)

    /// Default initializer (kept explicit so the convenience init below has a designated
    /// init to delegate to). All stored properties default-initialise, so the body is empty.
    public init() {}

    /// Initializes the composer pre-populated for reposting `story`.
    ///
    /// Clones the active `StoryItem` (the slide currently displayed in the viewer) into a
    /// fresh `StorySlide` (the composer's internal type — different from `StoryItem`),
    /// appends a non-editable "locked" badge sticker at the bottom-center of the canvas,
    /// and triggers an asynchronous media preload via the shared `CacheCoordinator`
    /// (3-tier cache) so the canvas paints instantly once mounted.
    ///
    /// - Parameters:
    ///   - story: The source story (the viewer's `StoryItem`). Carries the repost-chain
    ///            IDs we need (`id`, `repostOfId`, `originalRepostOfId`) — that is why we
    ///            do not require an `APIPost` here.
    ///   - authorHandle: What to render in the badge ("Reposté de @\(authorHandle)") —
    ///                   typically `currentGroup.username` from the iOS caller.
    ///
    /// The publish flow itself is NOT modified — `StoryComposerViewModel` still does not
    /// call `PostService.create*` directly. Publication is delegated to the
    /// `onPublishSlide` callback (`StoryComposerView.swift`) implemented by the iOS app
    /// caller (Phase C), which reads `vm.repostOfId` and forwards it to
    /// `PostService.create(...)` / `createStory(...)` (B.5c).
    public convenience init(reposting story: StoryItem, authorHandle: String) {
        self.init()

        // Repost chain IDs (root-flatten):
        // `repostOfId` always points to the immediate parent (the story we are reposting
        // from). `originalRepostOfId` walks up the chain to the root: prefer the source
        // story's `originalRepostOfId`, else its `repostOfId` (intermediate parent), else
        // the source itself (this story IS the root).
        self.repostOfId = story.id
        self.originalRepostOfId = story.originalRepostOfId
            ?? story.repostOfId
            ?? story.id

        // Convert StoryItem → StorySlide (composer's internal type). Lossy conversion:
        // we keep the first media URL, the content and the effects ; defaults for
        // duration (5 s) and order (0 — single slide).
        var cloned = StorySlide(
            id: UUID().uuidString,
            mediaURL: story.media.first?.url,
            mediaData: nil,
            content: story.content,
            effects: story.storyEffects ?? StoryEffects(),
            duration: 5,
            order: 0
        )

        // Locked badge sticker — non-editable text rendered at bottom-center.
        // The composer (StoryTextObject `isLocked == true`, see Patch B.3) skips
        // drag/edit/delete for this object so reposters cannot strip the attribution.
        // Direct interpolation : the Localizable.xcstrings catalog does not yet have
        // a `story.repost.badge` key with a `%@` placeholder, and `String(localized:)`
        // requires a StaticString literal (not a runtime-interpolated key). When the
        // catalog grows a proper entry, switch to `String(format: NSLocalizedString(...))`.
        let badgeText = "Reposté de @\(authorHandle)"
        let badge = StoryTextObject(
            id: UUID().uuidString,
            content: badgeText,
            x: 0.5, y: 0.92,
            scale: 1.0, rotation: 0,
            textStyle: "bold",
            textColor: "FFFFFF",
            textSize: 14,
            textAlign: "center",
            textBg: "6366F1",
            isLocked: true
        )
        var effects = cloned.effects
        var texts = effects.textObjects ?? []
        texts.append(badge)
        effects.textObjects = texts
        cloned.effects = effects

        self.slides = [cloned]
        self.currentSlideIndex = 0

        // Preload images via CacheCoordinator (3-tier cache, cancellable).
        // FeedMedia.url is `String?` and MeeshyConfig.resolveMediaURL returns `URL?` with
        // SSRF validation — both guards stay so we never hand a tainted URL to the cache.
        let mediaList = story.media
        preloadTask = Task { [weak self] in
            await withTaskGroup(of: (String, UIImage?).self) { group in
                for media in mediaList {
                    guard let urlString = media.url,
                          let url = MeeshyConfig.resolveMediaURL(urlString) else { continue }
                    let key = url.absoluteString
                    group.addTask {
                        let image = await CacheCoordinator.shared.images.image(for: key)
                        return (key, image)
                    }
                }
                for await (key, image) in group {
                    guard !Task.isCancelled, let self, let image else { continue }
                    self.slideImages[key] = image
                }
            }
        }
    }

    nonisolated deinit {
        preloadTask?.cancel()
    }
}

// MARK: - Safe Array Access

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
