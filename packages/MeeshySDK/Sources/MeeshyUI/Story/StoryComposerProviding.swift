import SwiftUI
import Combine
import UIKit
import MeeshySDK
import PencilKit

// MARK: - StoryComposerProviding (Testability Seam — Sprint 6 #61)
//
// Protocol surface that mirrors the public + internal API the composer host
// view (`StoryComposerView`, toolbar, timeline panel, canvas) consumes from
// `StoryComposerViewModel`. The concrete view model conforms trivially —
// every member below matches an existing property or method on the class
// verbatim, so the conformance is a single `: StoryComposerProviding` on the
// class declaration with no shim layer.
//
// Why a protocol? The host view's smoke / behavior tests need a way to drive
// the composer surface without standing up the real `ObservableObject` class
// (which transitively pulls `AuthManager.shared`, `CacheCoordinator.shared`,
// `StoryTimelineEngine`, `TimelineViewModel`, `PencilKit`, etc.). A protocol
// existential lets the tests inject `MockStoryComposerViewModel` with
// preconfigured state and assert that user gestures end up flipping the
// expected setters / call counters.
//
// Isolation: `@MainActor` matches the concrete view model's annotation. The
// `MeeshyUI` target enables `defaultIsolation(MainActor)` (SE-0466) so any
// adopter inherits that anyway — keeping the explicit `@MainActor` here also
// documents the contract for adopters defined in other modules.
//
// `AnyObject` constrains adopters to reference types: the composer is a
// long-lived `ObservableObject final class` that views hold via `@StateObject` /
// `@ObservedObject`. Mocks use the same identity-based bookkeeping.
//
// Members intentionally omitted (documented mismatches with earlier design):
//   - selectElement(id:) / deselectElement() — selection happens via
//     `selectedElementId` setter + `deselectAll()`.
//   - setStoryDuration(_:) — duration is per-slide via `currentSlideDuration`.
//   - attachAudioTrack(_:to:) / removeAudioTrack(from:) — handled by
//     `addAudioObject()` + `deleteElement(id:)`.
//   - validateForPublish() — host view callback (`onPublishSlide`), not VM.
//   - clearFilter(slideId:) — `applyFilter(nil)` is the single path.
@MainActor
protocol StoryComposerProviding: AnyObject {

    // MARK: Slides
    var slides: [StorySlide] { get set }
    var currentSlideIndex: Int { get set }
    var slideImages: [String: UIImage] { get set }
    var currentSlide: StorySlide { get set }
    var currentEffects: StoryEffects { get set }
    var canAddSlide: Bool { get }

    // MARK: Repost chain (Patch B.6)
    var repostOfId: String? { get set }
    var originalRepostOfId: String? { get set }

    // MARK: Selection + Active Tool
    var selectedElementId: String? { get set }
    var activeTool: StoryToolMode? { get set }
    var isContentToolActive: Bool { get }

    // MARK: Drawing
    var drawingData: Data? { get set }
    var drawingColor: Color { get set }
    var drawingWidth: CGFloat { get set }
    var isDrawingActive: Bool { get }

    // MARK: Background
    var backgroundColor: String { get set }
    var backgroundTransform: StoryComposerViewModel.BackgroundTransform { get set }
    func saveBackgroundTransform()
    func restoreBackgroundTransform()

    // MARK: Media Storage (pre-publication)
    var loadedImages: [String: UIImage] { get set }
    var loadedVideoURLs: [String: URL] { get set }
    var loadedAudioURLs: [String: URL] { get set }
    /// Cookie monotone à bumper après chaque édition utile d'un bitmap déjà
    /// présent dans `loadedImages`. Lu par le `StoryComposerCanvasView` pour
    /// déclencher un rebuild canvas. Cf. impl pour le rationale détaillé.
    var loadedImagesVersion: UInt64 { get set }
    /// Captions de transcription (vidéo) produites par `MeeshyVideoEditorView`
    /// au confirm. Keyed par `StoryMediaObject.id`. Metadata render-time —
    /// pas persistée dans le slide model (cf. doc dans l'impl).
    var loadedVideoCaptions: [String: StoryVideoCaptionMetadata] { get set }
    var mediaAspectRatios: [String: CGFloat] { get set }
    func setAspectRatio(_ ratio: CGFloat, for mediaId: String)

    // MARK: Active Drag (alignment guides + warnings)
    var activeDrag: StoryComposerViewModel.ActiveDrag? { get set }
    func beginDrag(elementId: String, position: CGPoint, size: CGSize)
    func updateDrag(position: CGPoint)
    func endDrag()

    // MARK: Timeline (V1 state + V2 wiring)
    var isTimelineVisible: Bool { get set }
    var timelinePlaybackTime: Float { get set }
    var isTimelinePlaying: Bool { get set }
    var timelineZoomScale: CGFloat { get set }
    var timelineScrollOffset: CGFloat { get set }
    var timelineAdvanced: Bool { get set }
    var isMuted: Bool { get set }
    var hasBackgroundImage: Bool { get set }
    var timelineViewModel: TimelineViewModel { get }
    func loadCurrentSlideIntoTimeline()
    func commitTimelineToCurrentSlide()

    // MARK: Filter
    var selectedFilter: String? { get set }
    var filterIntensity: Double { get set }
    func applyFilter(_ name: String?)
    func updateFilterIntensity(_ value: Double)

    // MARK: Slide Duration
    var currentSlideDuration: Float { get set }
    func autoExtendDuration(forElementEnd end: Float, slideId: String?)

    // MARK: Canvas Viewport
    var canvasScale: CGFloat { get set }
    var canvasOffset: CGSize { get set }
    var canvasSize: CGSize { get set }
    var isCanvasZoomed: Bool { get }
    func resetCanvasZoom()
    func viewportCenter() -> CGPoint

    // MARK: UI State (pickers, publish progress, alerts)
    var showPhotoPicker: Bool { get set }
    var showVideoPicker: Bool { get set }
    var showAudioPicker: Bool { get set }
    var publishProgress: (current: Int, total: Int)? { get set }
    var errorMessage: String? { get set }
    var showDraftAlert: Bool { get set }

    // MARK: Limits
    var textCount: Int { get }
    var mediaCount: Int { get }
    var canAddText: Bool { get }
    var canAddMedia: Bool { get }
    var canAddImage: Bool { get }
    var canAddVideo: Bool { get }
    var canAddAudio: Bool { get }

    // MARK: Slide Management
    func addSlide()
    func removeSlide(at index: Int)
    func duplicateSlide(at index: Int)
    func selectSlide(at index: Int)
    func moveSlide(from source: Int, to destination: Int)

    // MARK: Element Management
    @discardableResult
    func addText() -> StoryTextObject?
    @discardableResult
    func addMediaObject(kind: StoryMediaKind, toSlideId: String?) -> StoryMediaObject?
    func setMediaDuration(id: String, duration: Float, slideId: String?)
    func setMediaURL(id: String, url: String, slideId: String?)
    func setMediaAspectRatio(id: String, aspectRatio: Double, slideId: String?)
    @discardableResult
    func addAudioObject() -> StoryAudioPlayerObject?
    func deleteElement(id: String)
    func updateElementLanguage(elementId: String, language: String)
    func duplicateElement(id: String)

    // MARK: Background toggle
    func toggleBackground(id: String)
    func isBackground(id: String) -> Bool

    // MARK: Audio
    func setAudioVolume(audioId: String, volume: Float)

    // MARK: Z-Order
    func zIndex(for id: String) -> Int
    func bringToFront(id: String)
    func sendToBack(id: String)
    func bringForward(id: String)
    func sendBackward(id: String)

    // MARK: Media Reorder
    func moveMedia(from source: IndexSet, to destination: Int)

    // MARK: Tool Actions
    func selectTool(_ tool: StoryToolMode?)
    func deselectAll()

    // MARK: Memory Pressure & Cleanup
    func startMemoryObserver()
    func stopMemoryObserver()
    func evictNonVisibleSlideMedia()
    func cleanupTempFiles()

    // MARK: Slide Image Management
    func setImage(_ image: UIImage?, for slideId: String)
    func imageForCurrentSlide() -> UIImage?

    // MARK: Reset
    func reset()
}
