import SwiftUI
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Test double for `StoryComposerProviding` (Sprint 6 #61 — P4 testability).
///
/// Pure in-memory implementation of the composer surface, with stored-property
/// defaults for every protocol member and integer call counters on every
/// mutating method. No singleton dependency (`AuthManager.shared`,
/// `CacheCoordinator.shared`, `StoryTimelineEngine`, etc.) is touched — except
/// the lazy `timelineViewModel` which has to vend a real instance because the
/// concrete type is `final` in MeeshyUI and the protocol declares it as the
/// existential type itself.
///
/// Pattern (per CLAUDE.md iOS TDD requirements):
///   - one stored `var <member>` per protocol property (default value chosen to
///     match the production view-model's default — empty arrays / dicts /
///     `false` / `0` / etc.),
///   - one `_<method>Calls: Int` counter incremented on each invocation,
///   - one `_<method>LastArgs: <tuple>?` snapshot of the latest call (only on
///     methods whose tests care about argument plumbing).
///
/// `@MainActor` matches the protocol's isolation. The Mocks file lives under
/// `Tests/MeeshyUITests/Mocks/` so the `MeeshyUITests` target picks it up
/// without needing it listed as a `resources` entry on the test target.
@MainActor
final class MockStoryComposerViewModel: StoryComposerProviding {

    // MARK: - Slides
    var slides: [StorySlide] = [StorySlide()]
    var currentSlideIndex: Int = 0
    var slideImages: [String: UIImage] = [:]

    // Implements protocol's settable computed surface via a plain stored var.
    // The mock does NOT mirror the production "slides[currentSlideIndex]"
    // invariant — tests that need that behaviour should drive the real
    // `StoryComposerViewModel`. The mock guarantees `get` returns what was last
    // `set`, which is all the protocol contract requires.
    var currentSlide: StorySlide = StorySlide()
    var currentEffects: StoryEffects = StoryEffects()
    var canAddSlide: Bool = true

    // MARK: - Repost chain
    var repostOfId: String?
    var originalRepostOfId: String?

    // MARK: - Selection + Active Tool
    var selectedElementId: String?
    var activeTool: StoryToolMode?
    var isContentToolActive: Bool = false

    // MARK: - Drawing
    var drawingData: Data?
    var drawingColor: Color = .white
    var drawingWidth: CGFloat = 5
    var isDrawingActive: Bool = false

    // MARK: - Background
    var backgroundColor: String = "#000000"
    var backgroundTransform: StoryComposerViewModel.BackgroundTransform = .init()

    var _saveBackgroundTransformCalls: Int = 0
    func saveBackgroundTransform() { _saveBackgroundTransformCalls += 1 }

    var _restoreBackgroundTransformCalls: Int = 0
    func restoreBackgroundTransform() { _restoreBackgroundTransformCalls += 1 }

    // MARK: - Media Storage
    var loadedImages: [String: UIImage] = [:]
    var loadedVideoURLs: [String: URL] = [:]
    var loadedAudioURLs: [String: URL] = [:]
    var loadedImagesVersion: UInt64 = 0
    var loadedVideoCaptions: [String: StoryVideoCaptionMetadata] = [:]
    var mediaAspectRatios: [String: CGFloat] = [:]

    var _setAspectRatioCalls: Int = 0
    var _setAspectRatioLastArgs: (ratio: CGFloat, mediaId: String)?
    func setAspectRatio(_ ratio: CGFloat, for mediaId: String) {
        _setAspectRatioCalls += 1
        _setAspectRatioLastArgs = (ratio, mediaId)
        mediaAspectRatios[mediaId] = ratio
    }

    // MARK: - Active Drag
    var activeDrag: StoryComposerViewModel.ActiveDrag?

    var _beginDragCalls: Int = 0
    var _beginDragLastArgs: (elementId: String, position: CGPoint, size: CGSize)?
    func beginDrag(elementId: String, position: CGPoint, size: CGSize) {
        _beginDragCalls += 1
        _beginDragLastArgs = (elementId, position, size)
        activeDrag = .init(elementId: elementId, position: position, size: size)
    }

    var _updateDragCalls: Int = 0
    var _updateDragLastPosition: CGPoint?
    func updateDrag(position: CGPoint) {
        _updateDragCalls += 1
        _updateDragLastPosition = position
        if var current = activeDrag {
            current.position = position
            activeDrag = current
        }
    }

    var _endDragCalls: Int = 0
    func endDrag() {
        _endDragCalls += 1
        activeDrag = nil
    }

    // MARK: - Timeline state
    var isTimelineVisible: Bool = false
    var timelinePlaybackTime: Float = 0
    var isTimelinePlaying: Bool = false
    var timelineZoomScale: CGFloat = 1.0
    var timelineScrollOffset: CGFloat = 0
    var timelineAdvanced: Bool = false
    var isMuted: Bool = false
    var hasBackgroundImage: Bool = false

    /// Real `TimelineViewModel` to honour the protocol's existential return type.
    /// The concrete type is `final` and lives in MeeshyUI, so we instantiate it
    /// once with the same default dependencies the production VM uses. Building
    /// it costs nothing in tests (no playback is started until `bootstrap` runs).
    private lazy var _timelineViewModel: TimelineViewModel = {
        let engine = StoryTimelineEngine()
        let stack = CommandStack()
        let snap = SnapEngine(toleranceSeconds: 0.06)
        return TimelineViewModel(engine: engine, commandStack: stack, snapEngine: snap)
    }()

    var timelineViewModel: TimelineViewModel { _timelineViewModel }

    var _loadCurrentSlideIntoTimelineCalls: Int = 0
    func loadCurrentSlideIntoTimeline() {
        _loadCurrentSlideIntoTimelineCalls += 1
    }

    var _commitTimelineToCurrentSlideCalls: Int = 0
    func commitTimelineToCurrentSlide() {
        _commitTimelineToCurrentSlideCalls += 1
    }

    // MARK: - Filter
    var selectedFilter: String?
    var filterIntensity: Double = 1.0
    var filterAppliesToEntireSlide: Bool = false

    var _applyFilterCalls: Int = 0
    var _applyFilterLastName: String??
    func applyFilter(_ name: String?) {
        _applyFilterCalls += 1
        _applyFilterLastName = .some(name)
        selectedFilter = name
    }

    var _updateFilterIntensityCalls: Int = 0
    var _updateFilterIntensityLastValue: Double?
    func updateFilterIntensity(_ value: Double) {
        _updateFilterIntensityCalls += 1
        _updateFilterIntensityLastValue = value
        filterIntensity = value
    }

    // MARK: - Slide Duration
    var currentSlideDuration: Float = 12

    var _autoExtendDurationCalls: Int = 0
    var _autoExtendDurationLastArgs: (end: Float, slideId: String?)?
    func autoExtendDuration(forElementEnd end: Float, slideId: String?) {
        _autoExtendDurationCalls += 1
        _autoExtendDurationLastArgs = (end, slideId)
    }

    // MARK: - Canvas Viewport
    var canvasScale: CGFloat = 1.0
    var canvasOffset: CGSize = .zero
    var canvasSize: CGSize = .zero
    var isCanvasZoomed: Bool = false

    var _resetCanvasZoomCalls: Int = 0
    func resetCanvasZoom() {
        _resetCanvasZoomCalls += 1
        canvasScale = 1.0
        canvasOffset = .zero
    }

    var _viewportCenterCalls: Int = 0
    var stubViewportCenter: CGPoint = .init(x: 0.5, y: 0.5)
    func viewportCenter() -> CGPoint {
        _viewportCenterCalls += 1
        return stubViewportCenter
    }

    // MARK: - UI State
    var showPhotoPicker: Bool = false
    var showVideoPicker: Bool = false
    var showAudioPicker: Bool = false
    var publishProgress: (current: Int, total: Int)?
    var errorMessage: String?
    var showDraftAlert: Bool = false

    // MARK: - Limits
    var textCount: Int = 0
    var mediaCount: Int = 0
    var canAddText: Bool = true
    var canAddMedia: Bool = true
    var canAddImage: Bool = true
    var canAddVideo: Bool = true
    var canAddAudio: Bool = true

    // MARK: - Slide Management
    var _addSlideCalls: Int = 0
    func addSlide() { _addSlideCalls += 1 }

    var _removeSlideCalls: Int = 0
    var _removeSlideLastIndex: Int?
    func removeSlide(at index: Int) {
        _removeSlideCalls += 1
        _removeSlideLastIndex = index
    }

    var _duplicateSlideCalls: Int = 0
    var _duplicateSlideLastIndex: Int?
    func duplicateSlide(at index: Int) {
        _duplicateSlideCalls += 1
        _duplicateSlideLastIndex = index
    }

    var _selectSlideCalls: Int = 0
    var _selectSlideLastIndex: Int?
    func selectSlide(at index: Int) {
        _selectSlideCalls += 1
        _selectSlideLastIndex = index
        currentSlideIndex = index
    }

    var _moveSlideCalls: Int = 0
    var _moveSlideLastArgs: (source: Int, destination: Int)?
    func moveSlide(from source: Int, to destination: Int) {
        _moveSlideCalls += 1
        _moveSlideLastArgs = (source, destination)
    }

    // MARK: - Element Management
    var _addTextCalls: Int = 0
    var stubAddText: StoryTextObject?
    @discardableResult
    func addText() -> StoryTextObject? {
        _addTextCalls += 1
        return stubAddText
    }

    var _addMediaObjectCalls: Int = 0
    var _addMediaObjectLastArgs: (kind: StoryMediaKind, toSlideId: String?)?
    var stubAddMediaObject: StoryMediaObject?
    @discardableResult
    func addMediaObject(kind: StoryMediaKind, toSlideId: String?) -> StoryMediaObject? {
        _addMediaObjectCalls += 1
        _addMediaObjectLastArgs = (kind, toSlideId)
        return stubAddMediaObject
    }

    var _setMediaDurationCalls: Int = 0
    var _setMediaDurationLastArgs: (id: String, duration: Float, slideId: String?)?
    func setMediaDuration(id: String, duration: Float, slideId: String?) {
        _setMediaDurationCalls += 1
        _setMediaDurationLastArgs = (id, duration, slideId)
    }

    var _setMediaURLCalls: Int = 0
    var _setMediaURLLastArgs: (id: String, url: String, slideId: String?)?
    func setMediaURL(id: String, url: String, slideId: String?) {
        _setMediaURLCalls += 1
        _setMediaURLLastArgs = (id, url, slideId)
    }

    var _setMediaAspectRatioCalls: Int = 0
    var _setMediaAspectRatioLastArgs: (id: String, aspectRatio: Double, slideId: String?)?
    func setMediaAspectRatio(id: String, aspectRatio: Double, slideId: String?) {
        _setMediaAspectRatioCalls += 1
        _setMediaAspectRatioLastArgs = (id, aspectRatio, slideId)
    }

    var _addAudioObjectCalls: Int = 0
    var stubAddAudioObject: StoryAudioPlayerObject?
    @discardableResult
    func addAudioObject() -> StoryAudioPlayerObject? {
        _addAudioObjectCalls += 1
        return stubAddAudioObject
    }

    var _deleteElementCalls: Int = 0
    var _deleteElementLastId: String?
    func deleteElement(id: String) {
        _deleteElementCalls += 1
        _deleteElementLastId = id
    }

    var _updateElementLanguageCalls: Int = 0
    var _updateElementLanguageLastArgs: (elementId: String, language: String)?
    func updateElementLanguage(elementId: String, language: String) {
        _updateElementLanguageCalls += 1
        _updateElementLanguageLastArgs = (elementId, language)
    }

    var _duplicateElementCalls: Int = 0
    var _duplicateElementLastId: String?
    func duplicateElement(id: String) {
        _duplicateElementCalls += 1
        _duplicateElementLastId = id
    }

    // MARK: - Background toggle
    var _toggleBackgroundCalls: Int = 0
    var _toggleBackgroundLastId: String?
    func toggleBackground(id: String) {
        _toggleBackgroundCalls += 1
        _toggleBackgroundLastId = id
    }

    var stubIsBackground: [String: Bool] = [:]
    var _isBackgroundCalls: Int = 0
    func isBackground(id: String) -> Bool {
        _isBackgroundCalls += 1
        return stubIsBackground[id] ?? false
    }

    // MARK: - Audio
    var _setAudioVolumeCalls: Int = 0
    var _setAudioVolumeLastArgs: (id: String, volume: Float)?
    func setAudioVolume(audioId: String, volume: Float) {
        _setAudioVolumeCalls += 1
        _setAudioVolumeLastArgs = (audioId, volume)
    }

    // MARK: - Z-Order
    var stubZIndex: [String: Int] = [:]
    var _zIndexCalls: Int = 0
    func zIndex(for id: String) -> Int {
        _zIndexCalls += 1
        return stubZIndex[id] ?? 0
    }

    var _bringToFrontCalls: Int = 0
    var _bringToFrontLastId: String?
    func bringToFront(id: String) {
        _bringToFrontCalls += 1
        _bringToFrontLastId = id
    }

    var _sendToBackCalls: Int = 0
    var _sendToBackLastId: String?
    func sendToBack(id: String) {
        _sendToBackCalls += 1
        _sendToBackLastId = id
    }

    var _bringForwardCalls: Int = 0
    var _bringForwardLastId: String?
    func bringForward(id: String) {
        _bringForwardCalls += 1
        _bringForwardLastId = id
    }

    var _sendBackwardCalls: Int = 0
    var _sendBackwardLastId: String?
    func sendBackward(id: String) {
        _sendBackwardCalls += 1
        _sendBackwardLastId = id
    }

    // MARK: - Media Reorder
    var _moveMediaCalls: Int = 0
    var _moveMediaLastArgs: (source: IndexSet, destination: Int)?
    func moveMedia(from source: IndexSet, to destination: Int) {
        _moveMediaCalls += 1
        _moveMediaLastArgs = (source, destination)
    }

    // MARK: - Tool Actions
    var _selectToolCalls: Int = 0
    var _selectToolLastTool: StoryToolMode??
    func selectTool(_ tool: StoryToolMode?) {
        _selectToolCalls += 1
        _selectToolLastTool = .some(tool)
        activeTool = tool
    }

    var _deselectAllCalls: Int = 0
    func deselectAll() {
        _deselectAllCalls += 1
        selectedElementId = nil
        activeTool = nil
    }

    // MARK: - Memory Pressure & Cleanup
    var _startMemoryObserverCalls: Int = 0
    func startMemoryObserver() { _startMemoryObserverCalls += 1 }

    var _stopMemoryObserverCalls: Int = 0
    func stopMemoryObserver() { _stopMemoryObserverCalls += 1 }

    var _evictNonVisibleSlideMediaCalls: Int = 0
    func evictNonVisibleSlideMedia() { _evictNonVisibleSlideMediaCalls += 1 }

    var _cleanupTempFilesCalls: Int = 0
    func cleanupTempFiles() { _cleanupTempFilesCalls += 1 }

    // MARK: - Slide Image Management
    var _setImageCalls: Int = 0
    var _setImageLastArgs: (image: UIImage?, slideId: String)?
    func setImage(_ image: UIImage?, for slideId: String) {
        _setImageCalls += 1
        _setImageLastArgs = (image, slideId)
        if let image {
            slideImages[slideId] = image
        } else {
            slideImages.removeValue(forKey: slideId)
        }
    }

    var stubImageForCurrentSlide: UIImage?
    var _imageForCurrentSlideCalls: Int = 0
    func imageForCurrentSlide() -> UIImage? {
        _imageForCurrentSlideCalls += 1
        return stubImageForCurrentSlide
    }

    // MARK: - Reset
    var _resetCalls: Int = 0
    func reset() {
        _resetCalls += 1
        slides = [StorySlide()]
        currentSlideIndex = 0
        slideImages = [:]
        selectedElementId = nil
        activeTool = nil
        drawingData = nil
        loadedImages = [:]
        loadedVideoURLs = [:]
        loadedAudioURLs = [:]
        loadedVideoCaptions = [:]
        isTimelineVisible = false
        timelinePlaybackTime = 0
        isTimelinePlaying = false
        publishProgress = nil
        errorMessage = nil
        showDraftAlert = false
        canvasScale = 1.0
        canvasOffset = .zero
    }
}
