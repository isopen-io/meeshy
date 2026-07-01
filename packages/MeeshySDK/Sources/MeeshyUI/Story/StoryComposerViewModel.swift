import SwiftUI
import Combine
import UIKit
import MeeshySDK
import PencilKit

// MARK: - Tool Modes

public nonisolated enum StoryToolMode: String, CaseIterable, Sendable {
    case media
    case audio
    case drawing
    case text
    case filters
    case timeline
    case texture

    // Legacy alias
    static let photo: StoryToolMode = .media

    /// Outils exposés à l'utilisateur dans le chrome du composer (FABs, chips de
    /// switch, tuiles empty-state). Le filtre GLOBAL (`.filters`) est retiré de
    /// l'UI : les filtres s'appliquent désormais par média via l'éditeur unitaire
    /// (image/vidéo). Le case reste dans l'enum pour le rendu rétro-compatible des
    /// stories déjà filtrées ; il n'est simplement plus sélectionnable. Source
    /// unique consommée partout où la liste des onglets se construit.
    public static var selectableCases: [StoryToolMode] {
        allCases.filter { $0 != .filters }
    }
}


// MARK: - Canvas Element Protocol

enum CanvasElementType {
    case text, image, video, audio
}

// Protocol is @MainActor to match the module's defaultIsolation(MainActor).
// Identifiable is intentionally NOT inherited here — inheriting a non-isolated
// stdlib protocol would cause the conformance to "cross" actor boundaries.
// AnyCanvasElement conforms to Identifiable directly as a @MainActor type.
@MainActor
protocol CanvasElement {
    var id: String { get }
    var elementType: CanvasElementType { get }
    var zIndex: Int { get set }
}

// Explicit @MainActor matches the protocol's isolation and the module default.
// Separate Identifiable conformance avoids the stdlib witness-mismatch issue.
@MainActor
struct AnyCanvasElement: CanvasElement, Identifiable {
    var id: String
    var elementType: CanvasElementType
    var zIndex: Int
}

// MARK: - Media Asset

enum MediaAsset {
    case image(UIImage)
    case videoURL(URL)
    case audioURL(URL)
}

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

// MARK: - ViewModel

@MainActor
public final class StoryComposerViewModel: StoryComposerProviding, ObservableObject {

    // MARK: - Source Language Resolution (Prisme Linguistique)

    /// Pure resolver for the composer's source language.
    ///
    /// Per CLAUDE.md "Prisme Linguistique", the source language assigned to a
    /// newly authored story element (text, media, audio) MUST come from the
    /// user's in-app content preferences (`systemLanguage` then
    /// `regionalLanguage`), NEVER from the device locale or the active
    /// keyboard. A French speaker typing on an English keyboard still produces
    /// French content; using `UITextInputMode.primaryLanguage` here would
    /// mislabel that content as English and poison the translation pipeline.
    ///
    /// Resolution order matches `MeeshyUser.preferredContentLanguages` and the
    /// gateway's `resolveUserLanguage()`:
    /// 1. `systemLanguage` (primary in-app language)
    /// 2. `regionalLanguage` (secondary in-app language)
    /// 3. Hardcoded `"fr"` fallback.
    nonisolated public static func resolveComposerSourceLanguage(
        user: MeeshyUser?
    ) -> String {
        if let sys = user?.systemLanguage, !sys.isEmpty {
            return sys
        }
        if let reg = user?.regionalLanguage, !reg.isEmpty {
            return reg
        }
        return "fr"
    }

    var detectedKeyboardLanguage: String {
        Self.resolveComposerSourceLanguage(user: AuthManager.shared.currentUser)
    }

    // MARK: - Slides

    @Published var slides: [StorySlide] = [StorySlide()]
    @Published var currentSlideIndex: Int = 0
    @Published var slideImages: [String: UIImage] = [:]

    // MARK: - Repost source (Patch B.6 — exposed publicly so the iOS caller in Phase C
    // can read them before invoking PostService.create / createStory with repostOfId).
    @Published var repostOfId: String?
    @Published var originalRepostOfId: String?

    // Cancellable preload Task started by `init(reposting:authorHandle:)`.
    // Marked `nonisolated(unsafe)` so the `nonisolated deinit` below can cancel it
    // without requiring a MainActor hop (cancellation is Sendable / thread-safe).
    nonisolated(unsafe) var preloadTask: Task<Void, Never>?

    var currentSlide: StorySlide {
        get {
            // The composer holds the invariant `slides` is never empty
            // (init seeds [StorySlide()], removeSlide refuses to drop the
            // last one). If a future regression breaks that invariant we
            // must NOT crash with "Index out of range" — fall through to a
            // freshly-built empty slide instead so the composer keeps
            // rendering and the bug surfaces visibly rather than as a
            // hard crash on background queues.
            if let s = slides[safe: currentSlideIndex] { return s }
            if let first = slides.first { return first }
            return StorySlide()
        }
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

    @Published var selectedElementId: String?

    // MARK: - Floating Text Edit Mode

    /// Mode d'édition de texte plein écran (overlay flottant). `.inactive` par
    /// défaut. Voir `StoryComposerViewModel+TextEditing.swift` pour les
    /// transitions. La géométrie du texte (`x/y/scale/rotation/zIndex/fontSize`)
    /// n'est JAMAIS mutée pour l'édition : le texte est édité dans un overlay
    /// centré, le modèle reste la source de vérité pour le rendu et l'export.
    @Published var textEditingMode: TextEditingMode = .inactive

    // MARK: - Active Tool

    @Published var activeTool: StoryToolMode?

    var isContentToolActive: Bool {
        guard let tool = activeTool else { return false }
        switch tool {
        case .media, .audio, .drawing, .text, .texture: return true
        case .filters, .timeline: return false
        }
    }

    // MARK: - Drawing

    /// Données du dessin courant en design-coords (1080×1920) — écrites par le
    /// délégué `PKCanvasView`. La source de vérité historique pour le rendu
    /// canvas reste `currentSlide.effects.drawingData` (lu par `StoryRenderer`).
    /// Le `didSet` ci-dessous propage chaque write vers la slide courante
    /// sinon le canvas redessine la version persistée stale dès que l'overlay
    /// PKCanvasView disparaît — bug "garde un des dessins non correspondant"
    /// reporté 2026-05-27.
    @Published var drawingData: Data? {
        didSet {
            guard oldValue != drawingData else { return }
            guard slides.indices.contains(currentSlideIndex) else { return }
            if currentEffects.drawingData != drawingData {
                var effects = currentEffects
                effects.drawingData = drawingData
                currentEffects = effects
            }
        }
    }
    @Published var drawingColor: Color = .white
    @Published var drawingWidth: CGFloat = 5
    /// Pinceau actif pour la capture en mode dessin flottant (`StrokeCaptureLayer`).
    /// La couleur et la largeur du pinceau réutilisent `drawingColor`/`drawingWidth`.
    @Published var activeBrushTool: StrokeTool = .pen
    @Published var activeBrushSmoothing: StrokeSmoothing = .raw
    /// Mode d'édition de dessin flottant — contrôleurs posés sur `.ultraThinMaterial`
    /// au-dessus du canvas. Orthogonal à `BandStateMachine`, mirror de `textEditingMode`.
    /// Les traits éditables sont `drawingStrokes` (calculé sur `currentEffects`, cf.
    /// `StoryComposerViewModel+DrawingEditing.swift`).
    @Published var drawingEditingMode: DrawingEditingMode = .inactive
    var isDrawingActive: Bool { activeTool == .drawing }

    /// Trait en cours de tracé (WYSIWYG, C4). Rendu live PAR-DESSUS `drawingStrokes` via
    /// un `MeeshyStrokeCanvas` dédié dans `StoryComposerView`, avec notre moteur
    /// largeur-variable — l'aperçu correspond EXACTEMENT au trait commité au lift-up.
    /// `nil` quand aucun geste n'est en cours (effacé au commit/annulation).
    @Published var activeStrokePreview: StoryDrawingStroke?

    /// Pile de rétablissement (redo) du dessin. Les traits annulés via
    /// `undoLastStroke()` y sont empilés et réappliqués par `redoLastStroke()`.
    /// Vidée dès qu'un nouveau trait est dessiné (`commitStroke`) ou supprimé
    /// manuellement (`deleteStroke`) — sémantique undo/redo standard. Stockée ici
    /// (et non dans l'extension) car Swift interdit les propriétés stockées en
    /// extension. Voir `StoryComposerViewModel+DrawingEditing.swift`.
    @Published var drawingRedoStack: [StoryDrawingStroke] = []

    // MARK: - Background

    @Published var backgroundColor: String = "#\(StoryBackgroundPalette.randomBackgroundColor())"

    // Per-slide background image transforms (persisted across slide changes)
    struct BackgroundTransform {
        var scale: CGFloat = 1.0
        var offsetX: CGFloat = 0
        var offsetY: CGFloat = 0
        var rotation: Double = 0
        var videoFitMode: String? = nil
    }
    @Published var backgroundTransform: BackgroundTransform = BackgroundTransform()
    /// Per-slide background transform cache, keyed by `slide.id` rather than its index.
    /// Index keying broke after slide reordering or removal: deleting slide 0 promoted
    /// slide 1's content to position 0 but `restoreBackgroundTransform()` would still
    /// load the old slide 0's transform (now stranded at key `0`). Using the stable
    /// slide ID survives any reorder/insert/remove operation.
    var backgroundTransformCache: [String: BackgroundTransform] = [:]

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

    @Published var loadedImages: [String: UIImage] = [:]
    @Published var loadedVideoURLs: [String: URL] = [:]
    @Published var loadedAudioURLs: [String: URL] = [:]

    /// The current slide's background bitmap used as the base for filter-tile
    /// previews. Resolves the background media object (modern unified path,
    /// `loadedImages[bgMedia.id]`) first, then falls back to the legacy
    /// slide-level `slideImages` entry. `nil` for colour/gradient-only slides
    /// (the grid then shows its gradient placeholders). Mirrors how
    /// `SlideMiniPreview` and the canvas resolve the background image — passing
    /// only `slideImages[slide.id]` left every photo-backed slide's tiles blank
    /// because modern photos live in `mediaObjects`, not `slideImages`.
    var currentSlideBackgroundImage: UIImage? {
        if let bgId = currentSlide.effects.resolvedBackgroundMedia?.id,
           let img = loadedImages[bgId] {
            return img
        }
        return slideImages[currentSlide.id]
    }

    /// Cookie monotone bumpé à chaque édition d'un bitmap déjà présent dans
    /// `loadedImages` (typiquement `MeeshyImageEditorView` onAccept qui
    /// remplace la valeur sous une clé inchangée). Le `Coordinator` du
    /// `StoryComposerCanvasView` compare ce cookie à `lastLoadedImagesVersion`
    /// pour déclencher un rebuild des media layers — sans ça le canvas
    /// principal restait stale après image edit (les dicts UIImage ne sont
    /// pas Equatable et SwiftUI ne peut donc pas détecter une mutation
    /// de valeur intra-clé). Cf. `ComposerImageCacheReader.version`.
    @Published var loadedImagesVersion: UInt64 = 0

    /// Captions / transcription metadata produced by `MeeshyVideoEditorView`
    /// when the user transcribes a foreground video then taps « Terminer ».
    /// Keyed by `StoryMediaObject.id` (same key space as `loadedVideoURLs`).
    ///
    /// **Why a sibling map and not a field on `StoryMediaObject`** — captions
    /// are *render-time* metadata that the story canvas / exporter can
    /// optionally honour ; they don't belong in the persisted slide model
    /// (which is reused for re-rendering by viewers in their own language).
    /// Keeping them in a `@Published` dict avoids polluting `StoryMediaObject`
    /// and lets the consumer (canvas, exporter) read them lazily.
    @Published var loadedVideoCaptions: [String: StoryVideoCaptionMetadata] = [:]

    // MARK: - Media Aspect Ratios (render-time only, not persisted)

    /// Natural aspect ratio (width/height) for each loaded media object, keyed by mediaObject.id.
    /// Computed from UIImage.size or AVAsset track size. Used to render media in its natural
    /// proportions instead of forcing a square frame. When unknown, `1.0` is used as fallback.
    @Published var mediaAspectRatios: [String: CGFloat] = [:]

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

    @Published var activeDrag: ActiveDrag?

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

    @Published var isTimelineVisible: Bool = false
    @Published var timelinePlaybackTime: Float = 0
    @Published var isTimelinePlaying: Bool = false
    @Published var timelineZoomScale: CGFloat = 1.0
    @Published var timelineScrollOffset: CGFloat = 0
    @Published var timelineAdvanced: Bool = false
    @Published var isMuted: Bool = false
    @Published var hasBackgroundImage: Bool = false

    // MARK: - Timeline V2 wiring

    var _timelineViewModel: TimelineViewModel?

    public var timelineViewModel: TimelineViewModel {
        if let existing = _timelineViewModel { return existing }
        let engine = StoryTimelineEngine()
        let stack = CommandStack()
        let snap = SnapEngine(toleranceSeconds: 0.06)
        let vm = TimelineViewModel(engine: engine, commandStack: stack, snapEngine: snap)
        _timelineViewModel = vm
        return vm
    }

    /// Teardown du moteur timeline SI créé — sans forcer la création lazy.
    /// Seul caller production de `StoryTimelineEngine.shutdown()` (contrat
    /// "owner MUST call shutdown()") : sans lui, l'observer périodique
    /// AVPlayer n'était jamais retiré avant libération, l'AVAudioEngine du
    /// mixer jamais stoppé et un preview en cours jamais coupé. L'instance
    /// est nil-ée : le prochain `onAppear` → `loadCurrentSlideIntoTimeline()`
    /// recrée un moteur frais.
    public func shutdownTimelineIfNeeded() {
        _timelineViewModel?.shutdown()
        _timelineViewModel = nil
    }

    /// Prefix used for clips that the timeline editor surfaces for context but
    /// that are NOT real `slide.effects.mediaObjects`. The flagship example is
    /// the "background image" lane: a slide that only has a static bg image
    /// has nothing in `mediaObjects`, but the user still expects to see that
    /// image represented on the timeline as a locked, full-duration clip.
    /// Synthetic clips are stripped before persisting back to the slide via
    /// `commitTimelineToCurrentSlide()`.
    public static let syntheticTimelineClipIdPrefix = "_synthetic_bg_image_"

    public static func isSyntheticTimelineClipId(_ id: String) -> Bool {
        id.hasPrefix(syntheticTimelineClipIdPrefix)
    }

    /// Builds the synthetic background-image clip for a slide that has a static
    /// `slideImages[id]` image but no real background media object. Returns
    /// `nil` when the slide either has no bg image, or already has a real
    /// background media object (in which case the real one wins).
    ///
    /// `bgImageSize` est la taille naturelle de l'image bg (typiquement via
    /// `slideImages[slide.id]?.size`) — utilisée pour calculer l'aspectRatio
    /// réel au lieu de forcer 1.0 (qui rendait l'image en carré 540×540).
    public static func makeSyntheticBgImageClip(for slide: StorySlide,
                                                hasBgImage: Bool,
                                                existingMediaObjects: [StoryMediaObject],
                                                bgImageSize: CGSize? = nil) -> StoryMediaObject? {
        guard hasBgImage else { return nil }
        guard !existingMediaObjects.contains(where: { $0.isBackground == true }) else { return nil }
        let aspect: Double = {
            guard let size = bgImageSize, size.width > 0, size.height > 0 else { return 1.0 }
            return Double(size.width / size.height)
        }()
        return StoryMediaObject(
            id: "\(syntheticTimelineClipIdPrefix)\(slide.id)",
            postMediaId: "_bg_image_\(slide.id)",
            mediaType: StoryMediaKind.image.rawValue,
            placement: "media",
            aspectRatio: aspect,
            x: 0.5, y: 0.5,
            scale: 1.0,
            rotation: 0,
            volume: 0,
            isBackground: true,
            startTime: 0,
            duration: Double(slide.effects.slideDuration ?? Float(slide.duration))
        )
    }

    /// Bridges the composer's `currentSlide` into the timeline editor. Call
    /// this from `onAppear`, whenever the user switches slides, AND whenever
    /// the timeline sheet becomes visible (so any media added between mount
    /// and sheet-open is immediately visible).
    public func loadCurrentSlideIntoTimeline() {
        let slide = currentSlide
        var project = TimelineProject(from: slide)

        // Surface a static background image (stored separately in slideImages)
        // as a locked synthetic clip on the timeline so the user can see what
        // is playing under their composition. Stripped on commit so the actual
        // slide effects stay clean.
        if let synthetic = Self.makeSyntheticBgImageClip(
            for: slide,
            hasBgImage: slideImages[slide.id] != nil,
            existingMediaObjects: project.mediaObjects,
            bgImageSize: slideImages[slide.id]?.size
        ) {
            var medias = project.mediaObjects
            medias.insert(synthetic, at: 0)
            project.mediaObjects = medias
        }

        let mediaURLs = collectMediaURLs(for: slide)
        // Bootstrap dict is keyed by media.id (the foreground clip identifier).
        // `slideImages` is keyed by slideId, so we re-key the slide-level
        // background bitmap under the synthetic clip id so the timeline track
        // can render its thumbnail. User-added foreground media bitmaps live in
        // `loadedImages` which is already keyed correctly.
        var clipImages = loadedImages
        if let bgImage = slideImages[slide.id],
           let synthetic = project.mediaObjects.first(where: { Self.isSyntheticTimelineClipId($0.id) }) {
            clipImages[synthetic.id] = bgImage
        }
        timelineViewModel.bootstrap(
            project: project,
            mediaURLs: mediaURLs,
            images: clipImages
        )
        // Clear any selection that no longer exists in the new slide.
        if let id = timelineViewModel.selection.selectedClipId,
           !projectContains(clipId: id, in: project) {
            timelineViewModel.selectClip(id: nil)
        }
    }

    /// Writes the current `TimelineViewModel.project` back into `currentSlide.effects`
    /// so the publish pipeline ships V2 edits (transitions, keyframes, splits, trims).
    /// Call BEFORE invoking the publish queue.
    public func commitTimelineToCurrentSlide() {
        var project = timelineViewModel.project
        // Synthetic clips never persist — they only exist to make the editor
        // legible. Strip them before the project lands back on the slide.
        project.mediaObjects.removeAll { Self.isSyntheticTimelineClipId($0.id) }
        var slide = currentSlide
        project.apply(to: &slide)
        currentSlide = slide
    }

    /// Builds the `mediaURLs` dict passed to the timeline engine for a given slide.
    ///
    /// Resolution order per element:
    /// 1. `loadedVideoURLs` / `loadedAudioURLs` — URLs the composer recorded when the
    ///    user picked a file from the library during this session (always highest fidelity).
    /// 2. `CacheCoordinator.videoLocalFileURL` / `audioLocalFileURL` — synchronous disk-
    ///    cache lookup by the element's `postMediaId`. Used when the composer is
    ///    initialised from a repost or when the user re-enters the composer after the
    ///    media was previously downloaded.
    ///
    /// Elements whose URL cannot be resolved are omitted — the engine handles missing
    /// URLs gracefully (logs "skipping … no URL") without crashing.
    func collectMediaURLs(for slide: StorySlide) -> [String: URL] {
        var result: [String: URL] = [:]

        for media in slide.effects.mediaObjects ?? [] {
            if let url = resolveMediaURL(elementId: media.id, postMediaId: media.postMediaId, kind: .video) {
                result[media.id] = url
            }
        }
        for audio in slide.effects.audioPlayerObjects ?? [] {
            if let url = resolveMediaURL(elementId: audio.id, postMediaId: audio.postMediaId, kind: .audio) {
                result[audio.id] = url
            }
        }

        return result
    }

    enum MediaKind { case video, audio }

    func resolveMediaURL(elementId: String, postMediaId: String, kind: MediaKind) -> URL? {
        // Composer-session in-memory cache (highest priority).
        switch kind {
        case .video:
            if let url = loadedVideoURLs[elementId] { return url }
        case .audio:
            if let url = loadedAudioURLs[elementId] { return url }
        }
        // Disk cache — synchronous, nonisolated lookup by postMediaId.
        // `postMediaId` is the remote identifier used as the cache key when the
        // gateway delivers the media URL.  Falls back to nil when not yet cached.
        guard !postMediaId.isEmpty else { return nil }
        switch kind {
        case .video: return CacheCoordinator.videoLocalFileURL(for: postMediaId)
        case .audio: return CacheCoordinator.audioLocalFileURL(for: postMediaId)
        }
    }

    func projectContains(clipId: String, in project: TimelineProject) -> Bool {
        project.mediaObjects.contains(where: { $0.id == clipId })
        || project.audioPlayerObjects.contains(where: { $0.id == clipId })
        || project.textObjects.contains(where: { $0.id == clipId })
    }

    // MARK: - Filter

    @Published var selectedFilter: String?
    @Published var filterIntensity: Double = 1.0

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
        // Source de vérité = `effects.timelineDuration` (autoritaire, lu par
        // `computedTotalDuration`). Régler explicitement la durée du slide via ce
        // contrôle POSE donc un pin timeline — sinon le réglage serait ignoré au
        // playback (la centralisation 28/05 ignore `slide.duration`). Le getter
        // retombe sur la durée auto du contenu tant qu'aucun pin n'est posé.
        get { Float(currentSlide.effects.timelineDuration ?? currentSlide.computedTotalDuration()) }
        set {
            let clamped = max(2, min(600, newValue))
            var slide = currentSlide
            slide.duration = TimeInterval(clamped)            // miroir legacy
            slide.effects.timelineDuration = Double(clamped)  // autoritaire
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
        // Miroir legacy : `slide.duration` n'est plus la source de vérité (ignoré par
        // `computedTotalDuration`). Le contenu foreground est désormais couvert par
        // `contentDerivedDuration()` (qui inclut les vidéos non-bg), et le timeline pose
        // un pin `timelineDuration` quand l'auteur surcharge explicitement la durée — donc
        // on n'écrit PAS de pin ici (éviterait un pin obsolète après suppression du média).
        let current = Float(slides[targetIndex].duration)
        if end > current {
            slides[targetIndex].duration = TimeInterval(min(600, end + 0.5))
        }
    }

    // MARK: - Canvas Viewport

    @Published var canvasScale: CGFloat = 1.0
    @Published var canvasOffset: CGSize = .zero
    @Published var canvasSize: CGSize = .zero

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

    @Published var showPhotoPicker: Bool = false
    @Published var showVideoPicker: Bool = false
    @Published var showAudioPicker: Bool = false
    @Published var publishProgress: (current: Int, total: Int)?
    @Published var errorMessage: String?
    @Published var showDraftAlert: Bool = false

    // MARK: - Limits

    var textCount: Int { currentEffects.textObjects.count }
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
        // Supprimer un slide AVANT le slide courant décale tout le contenu d'un
        // cran vers la gauche : il faut décrémenter `currentSlideIndex` pour
        // rester sur le MÊME slide que l'on éditait. Sans ça (l'ancien code ne
        // faisait que clamper `>= count`), supprimer un slide antérieur via le
        // menu contextuel d'une vignette faisait sauter l'édition au slide
        // suivant (bug 2026-06-01). Le clamp couvre ensuite le cas « on a
        // supprimé le dernier slide qui était le courant ».
        if index < currentSlideIndex {
            currentSlideIndex -= 1
        }
        if currentSlideIndex >= slides.count {
            currentSlideIndex = slides.count - 1
        }
        reorderSlides()
    }

    /// Duplicate slide at `index`. The visual identity of the duplicated slide
    /// MUST match the original at duplication time — same background image,
    /// same media bitmaps, same video/audio URLs, same drawing, same filter.
    ///
    /// `StorySlide` itself is a value type, so the struct-level state (effects,
    /// duration, content) clones via `var copy = slides[index]`. But the
    /// composer holds side caches keyed by element/slide id (`loadedImages`,
    /// `loadedVideoURLs`, `loadedAudioURLs`, `mediaAspectRatios`, `slideImages`,
    /// `backgroundTransformCache`); these MUST be re-keyed under the freshly-
    /// generated ids so the new slide renders with its own bitmaps instead of
    /// landing on empty placeholders. Without this, the original slide's media
    /// stayed visible while the duplicate showed placeholders — and any later
    /// deletion of the original would orphan the bitmaps the duplicate was
    /// silently still pointing at via the shared old key.
    ///
    /// Mirrors the per-element id reassignment performed by `duplicateElement`.
    func duplicateSlide(at index: Int) {
        guard canAddSlide, slides.indices.contains(index) else { return }
        let originalSlideId = slides[index].id
        var copy = slides[index]
        let newSlideId = UUID().uuidString
        copy.id = newSlideId
        copy.order = slides.count

        // Re-key per-element side caches by generating a new id for every child
        // object and copying its bitmap / URL / aspect-ratio entry under the new
        // key. The mutations happen on `copy.effects` (a value type) before the
        // copy is inserted into `slides`, so the original slide is untouched.
        var effects = copy.effects

        // Text objects: ids are referenced by zIndex bookkeeping but carry no
        // side-cache. New id keeps future selection / persistZIndex from
        // clobbering the original text object's z value.
        effects.textObjects = effects.textObjects.map { text in
            var clone = text
            clone.id = UUID().uuidString
            return clone
        }

        // Media objects (image / video on canvas): the id keys
        // `loadedImages` (UIImage), `loadedVideoURLs` (URL) and
        // `mediaAspectRatios` (CGFloat). Walk the array, mint a new id for each
        // entry, and copy the side-cache rows over to the new key.
        if let medias = effects.mediaObjects {
            effects.mediaObjects = medias.map { media in
                var clone = media
                let newId = UUID().uuidString
                clone.id = newId
                if let img = loadedImages[media.id] { loadedImages[newId] = img }
                if let url = loadedVideoURLs[media.id] { loadedVideoURLs[newId] = url }
                if let ratio = mediaAspectRatios[media.id] { mediaAspectRatios[newId] = ratio }
                return clone
            }
        }

        // Audio player objects: the id keys `loadedAudioURLs`.
        if let audios = effects.audioPlayerObjects {
            effects.audioPlayerObjects = audios.map { audio in
                var clone = audio
                let newId = UUID().uuidString
                clone.id = newId
                if let url = loadedAudioURLs[audio.id] { loadedAudioURLs[newId] = url }
                return clone
            }
        }

        // Stickers: no side cache, but their ids are still referenced by the
        // composer's z-order bookkeeping (`zIndexMap`, `persistZIndex`). New
        // id avoids accidental id collisions on subsequent edits.
        if let stickers = effects.stickerObjects {
            effects.stickerObjects = stickers.map { sticker in
                var clone = sticker
                clone.id = UUID().uuidString
                return clone
            }
        }

        copy.effects = effects

        // Slide-level side caches keyed by slideId.
        if let bgImage = slideImages[originalSlideId] {
            slideImages[newSlideId] = bgImage
        }
        if let transform = backgroundTransformCache[originalSlideId] {
            backgroundTransformCache[newSlideId] = transform
        }

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
    func rehydrateZIndexMapFromSlide() {
        var map: [String: Int] = [:]
        var maxZ = 0
        let effects = currentEffects
        for obj in effects.textObjects {
            map[obj.id] = obj.zIndex; maxZ = max(maxZ, obj.zIndex)
        }
        for obj in (effects.mediaObjects ?? []) {
            map[obj.id] = obj.zIndex; maxZ = max(maxZ, obj.zIndex)
        }
        for obj in (effects.audioPlayerObjects ?? []) {
            if let z = obj.zIndex { map[obj.id] = z; maxZ = max(maxZ, z) }
        }
        for obj in (effects.stickerObjects ?? []) {
            map[obj.id] = obj.zIndex; maxZ = max(maxZ, obj.zIndex)
        }
        zIndexMap = map
        nextZIndex = maxZ + 1
    }

    /// Reorder slides. `destination` follows the SwiftUI `.onMove` / `.dropDestination`
    /// convention (offset in the PRE-move array, so it may equal `slides.count` for
    /// move-to-end) — identical to `moveMedia`, so the slide-strip drag wiring is
    /// mutualized with the media-list reorder. `currentSlideIndex` tracks the slide the
    /// user was EDITING by id (not the dropped slot), mirroring `removeSlide`'s
    /// preserve-the-edited-slide philosophy. Side caches are keyed by slide/element id,
    /// so a move needs no cache surgery — only `order` is reindexed. (it.37: was a
    /// remove+insert with a `destination < count` guard that rejected move-to-end and
    /// produced an off-by-one vs the drop offset; that path was also entirely unwired.)
    func moveSlide(from source: Int, to destination: Int) {
        guard slides.indices.contains(source),
              destination >= 0, destination <= slides.count,
              source != destination, source != destination - 1 else { return }
        let editedSlideId = slides[safe: currentSlideIndex]?.id
        slides.move(fromOffsets: IndexSet(integer: source), toOffset: destination)
        reorderSlides()
        if let editedSlideId, let newIndex = slides.firstIndex(where: { $0.id == editedSlideId }) {
            currentSlideIndex = newIndex
        }
    }

    func reorderSlides() {
        for i in slides.indices {
            slides[i].order = i
        }
    }

    // MARK: - Element Management

    @discardableResult
    func addText() -> StoryTextObject? {
        guard canAddText else { return nil }
        let center = CGPoint(x: 0.5, y: 0.5)
        // fontSize en design units (référentiel 1080-px). 96 design ≈ 36 pt
        // sur iPhone 16 Pro (scaleFactor ≈ 0.38) — taille parfaitement
        // lisible. La valeur précédente de 24 produisait du 9 pt rendu
        // (et un editor inline minuscule au moment de saisir).
        let obj = StoryTextObject(
            text: "",
            x: center.x,
            y: center.y,
            scale: 1.0,
            rotation: 0,
            fontSize: 96,
            textStyle: "classic",
            textColor: "FFFFFF",
            textAlign: "center",
            sourceLanguage: detectedKeyboardLanguage
        )
        var effects = currentEffects
        var texts = effects.textObjects
        texts.append(obj)
        effects.textObjects = texts
        currentEffects = effects
        selectedElementId = obj.id
        bringToFront(id: obj.id)
        activeTool = .text
        // `bringToFront` persists a new `zIndex` onto the stored object — return
        // the post-mutation copy so callers never see a stale `zIndex`.
        return currentEffects.textObjects.first { $0.id == obj.id } ?? obj
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
        // inclus : resolvedBackgroundMedia retombe sur le 1er existant). Un fond
        // statique stocké dans `slideImages` (slide-level bg image) compte aussi
        // comme background — sans ce check, un media ajouté APRÈS un setImage(...)
        // serait incorrectement marqué bg, masquerait l'image, et briserait le
        // synthetic-clip injecté par loadCurrentSlideIntoTimeline.
        let hasSlideLevelBgImage = slideImages[slides[targetSlideIndex].id] != nil
        let shouldBeBackground = targetEffects.resolvedBackgroundMedia == nil && !hasSlideLevelBgImage
        let obj = StoryMediaObject(
            postMediaId: "",
            kind: kind,
            placement: "media",
            aspectRatio: 1.0, // TODO Phase 2/3: compute real aspectRatio from asset
            x: center.x,
            y: center.y,
            scale: 1.0,
            rotation: 0,
            volume: 1.0,
            // Bg media loops by default so a short video/asset covers the
            // full slide duration. Without this, `StoryMediaObject.loop`
            // defaults to false → `bgVideo.loop ?? true` in StoryRenderer
            // never falls back to true → AVPlayerLooper never armed → video
            // stops at its native end while the slide progress bar continues
            // (user report 2026-05-27).
            isBackground: shouldBeBackground,
            loop: shouldBeBackground,
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

    /// Pin the natural asset duration on a media object so the reader's
    /// visibility window matches the actual playback length. Idempotent: a
    /// later trim from the timeline editor overwrites this baseline.
    func setMediaDuration(id: String, duration: Float, slideId: String? = nil) {
        let targetIndex: Int = {
            if let slideId, let idx = slides.firstIndex(where: { $0.id == slideId }) {
                return idx
            }
            return currentSlideIndex
        }()
        guard slides.indices.contains(targetIndex) else { return }
        var effects = slides[targetIndex].effects
        guard var medias = effects.mediaObjects,
              let mediaIdx = medias.firstIndex(where: { $0.id == id }) else { return }
        medias[mediaIdx].duration = Double(duration)
        effects.mediaObjects = medias
        slides[targetIndex].effects = effects
    }

    /// Set the `mediaURL` on a `StoryMediaObject`. Called after persisting
    /// a composer-loaded UIImage to a temp file so the CALayer canvas
    /// (`StoryMediaLayer.configureImage`) can load it via `file://` URL.
    /// Without this bridge the media object's `mediaURL` stays `nil` and the
    /// layer renders a black rectangle.
    func setMediaURL(id: String, url: String, slideId: String? = nil) {
        let targetIndex: Int = {
            if let slideId, let idx = slides.firstIndex(where: { $0.id == slideId }) {
                return idx
            }
            return currentSlideIndex
        }()
        guard slides.indices.contains(targetIndex) else { return }
        var effects = slides[targetIndex].effects
        guard var medias = effects.mediaObjects,
              let mediaIdx = medias.firstIndex(where: { $0.id == id }) else { return }
        medias[mediaIdx].mediaURL = url
        effects.mediaObjects = medias
        slides[targetIndex].effects = effects
    }

    /// Met à jour l'aspectRatio (width/height) d'un media. Appelé après le
    /// pick PhotosPicker / record une fois que l'asset natural size est
    /// mesurée via `UIImage.size` (image) ou `AVAssetTrack.naturalSize` +
    /// `preferredTransform` (vidéo). Sans ça, l'aspectRatio reste à 1.0 et
    /// la layer est rendue en carré 540x540 (cf. `baseMediaDesignSize`).
    func setMediaAspectRatio(id: String, aspectRatio: Double, slideId: String? = nil) {
        guard aspectRatio.isFinite, aspectRatio > 0 else { return }
        let targetIndex: Int = {
            if let slideId, let idx = slides.firstIndex(where: { $0.id == slideId }) {
                return idx
            }
            return currentSlideIndex
        }()
        guard slides.indices.contains(targetIndex) else { return }
        var effects = slides[targetIndex].effects
        guard var medias = effects.mediaObjects,
              let mediaIdx = medias.firstIndex(where: { $0.id == id }) else { return }
        medias[mediaIdx].aspectRatio = aspectRatio
        effects.mediaObjects = medias
        slides[targetIndex].effects = effects
        // Miroir dans le side-cache si d'autres surfaces le lisent.
        mediaAspectRatios[id] = CGFloat(aspectRatio)
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
        // Defensive guard : a locked text object (e.g. the repost-attribution
        // badge from `init(reposting:authorHandle:)`) cannot be deleted from
        // any path — context menu, timeline panel, contextual toolbar, etc.
        // The UI already hides these affordances on locked elements, but a
        // central refusal here closes any future call site we might miss.
        if currentEffects.textObjects.first(where: { $0.id == id })?.isLocked == true {
            return
        }
        var effects = currentEffects
        effects.textObjects.removeAll { $0.id == id }
        effects.mediaObjects?.removeAll { $0.id == id }
        effects.audioPlayerObjects?.removeAll { $0.id == id }
        effects.stickerObjects?.removeAll { $0.id == id }
        currentEffects = effects
        if selectedElementId == id { selectedElementId = nil }
        // Si on supprime le texte en cours d'édition flottante, sortir du mode.
        if textEditingMode.activeTextId == id { textEditingMode = .inactive }
        loadedImages.removeValue(forKey: id)
        loadedVideoURLs.removeValue(forKey: id)
        loadedAudioURLs.removeValue(forKey: id)
        mediaAspectRatios.removeValue(forKey: id)
        zIndexMap.removeValue(forKey: id)
    }

    func updateElementLanguage(elementId: String, language: String) {
        var effects = currentEffects

        if let idx = effects.textObjects.firstIndex(where: { $0.id == elementId }) {
            effects.textObjects[idx].sourceLanguage = language
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
        if var text = effects.textObjects.first(where: { $0.id == id }) {
            // Locked text objects (repost-attribution badge) are not duplicable —
            // duplicating would create a second editable copy that strips intent.
            if text.isLocked == true { return }
            guard canAddText else { return }
            text.id = UUID().uuidString
            // Offset is 20 design pixels in the 1080x1920 canvas (≈2% x, ≈1% y).
            // Small enough that the clone visibly overlaps its source so the
            // user sees the duplication happened, large enough to be selectable
            // independently. The previous 0.05 (54 design px) was too wide and
            // jumped the clone outside the source's selection rect.
            text.x = min(1.0, text.x + 20.0 / 1080.0)
            text.y = min(1.0, text.y + 20.0 / 1920.0)
            effects.textObjects.append(text)
            selectedElementId = text.id
        } else if var media = effects.mediaObjects?.first(where: { $0.id == id }) {
            guard canAddMedia else { return }
            let newId = UUID().uuidString
            media.id = newId
            // Le clone est TOUJOURS un foreground : dupliquer un média de fond
            // créait un 2e background (invariant « au plus 1 background / slide »
            // violé) qui remplit tout le canvas en ignorant l'offset → clone
            // invisible (l'utilisateur ne voyait rien). Bug 2026-06-01.
            media.isBackground = false
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
            // Idem média : le clone est foreground, sinon dupliquer l'audio de
            // fond créait un 2e background audio (invariant « 1 audio de fond /
            // slide » violé). Bug 2026-06-01.
            audio.isBackground = false
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

    /// Volume d'un audio (clamp [0, 1]). No-op si l'id ne match aucun audio.
    func setAudioVolume(audioId: String, volume: Float) {
        var effects = currentEffects
        guard var audios = effects.audioPlayerObjects,
              let i = audios.firstIndex(where: { $0.id == audioId }) else { return }
        audios[i].volume = max(0, min(1, volume))
        effects.audioPlayerObjects = audios
        currentEffects = effects
    }

    // MARK: - Media Reorder

    func moveMedia(from source: IndexSet, to destination: Int) {
        var effects = currentEffects
        guard var medias = effects.mediaObjects else { return }
        medias.move(fromOffsets: source, toOffset: destination)
        effects.mediaObjects = medias
        currentEffects = effects
    }

    // MARK: - Z-Order

    var zIndexMap: [String: Int] = [:]
    var nextZIndex: Int = 1

    func zIndex(for id: String) -> Int {
        if let mapped = zIndexMap[id] { return mapped }
        // Fall back to the model-stored zIndex for elements that haven't
        // been re-stamped via the in-memory map yet (e.g. media added
        // directly to `currentEffects` from outside the composer, or
        // elements loaded from a persisted slide). Mirrors the lookup
        // used inside `allElementsSortedByZ` so the public accessor and
        // the sort agree on the same value.
        let effects = currentEffects
        if let t = effects.textObjects.first(where: { $0.id == id }) { return t.zIndex }
        if let m = effects.mediaObjects?.first(where: { $0.id == id }) { return m.zIndex }
        if let a = effects.audioPlayerObjects?.first(where: { $0.id == id }) { return a.zIndex ?? 0 }
        if let s = effects.stickerObjects?.first(where: { $0.id == id }) { return s.zIndex }
        return 0
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

    func bringForward(id: String) {
        let all = allElementsSortedByZ()
        guard let index = all.firstIndex(where: { $0.id == id }) else { return }
        guard index < all.count - 1 else { return }

        let next = all[index + 1]
        let currentZ = zIndexMap[id] ?? zIndex(for: id)
        let nextZ = zIndexMap[next.id] ?? zIndex(for: next.id)
        
        let newCurrentZ = currentZ == nextZ ? nextZ + 1 : nextZ
        let newNextZ = currentZ == nextZ ? currentZ : currentZ
        
        persistZIndex(newCurrentZ, for: id)
        persistZIndex(newNextZ, for: next.id)
        zIndexMap[id] = newCurrentZ
        zIndexMap[next.id] = newNextZ
    }

    func sendBackward(id: String) {
        let all = allElementsSortedByZ()
        guard let index = all.firstIndex(where: { $0.id == id }) else { return }
        let currentZ = zIndex(for: id)

        // Pick the neighbor that needs to end up above us. When `index > 0`
        // that's the predecessor in sort order. When we're already at
        // sort-index 0 BUT tied at the same z with the next element, that
        // next element is the de-facto predecessor — without this branch,
        // a cross-kind tie (e.g. text bumped to the same z as a foreground
        // media) silently no-ops and the ordering never settles.
        let neighbor: AnyCanvasElement?
        if index > 0 {
            neighbor = all[index - 1]
        } else if all.count > 1, zIndex(for: all[1].id) == currentZ {
            neighbor = all[1]
        } else {
            neighbor = nil
        }
        guard let prev = neighbor else { return }

        let prevZ = zIndex(for: prev.id)
        if currentZ > prevZ {
            // Strict above: swap z values (the standard send-backward step).
            persistZIndex(prevZ, for: id)
            persistZIndex(currentZ, for: prev.id)
            zIndexMap[id] = prevZ
            zIndexMap[prev.id] = currentZ
        } else {
            // Tie: leave us where we are and bump the neighbor strictly above.
            persistZIndex(currentZ + 1, for: prev.id)
            zIndexMap[prev.id] = currentZ + 1
        }
    }

    func allElementsSortedByZ() -> [AnyCanvasElement] {
        var elements: [AnyCanvasElement] = []
        let effects = currentEffects
        for t in effects.textObjects {
            elements.append(AnyCanvasElement(id: t.id, elementType: .text, zIndex: zIndexMap[t.id] ?? t.zIndex))
        }
        for m in effects.mediaObjects ?? [] {
            elements.append(AnyCanvasElement(id: m.id, elementType: m.kind == .video ? .video : .image, zIndex: zIndexMap[m.id] ?? m.zIndex))
        }
        for a in effects.audioPlayerObjects ?? [] {
            elements.append(AnyCanvasElement(id: a.id, elementType: .audio, zIndex: zIndexMap[a.id] ?? a.zIndex ?? 0))
        }
        for s in effects.stickerObjects ?? [] {
            elements.append(AnyCanvasElement(id: s.id, elementType: .image, zIndex: zIndexMap[s.id] ?? s.zIndex))
        }
        return elements.sorted { $0.zIndex < $1.zIndex }
    }

    func persistZIndex(_ z: Int, for id: String) {
        var effects = currentEffects
        if let i = effects.textObjects.firstIndex(where: { $0.id == id }) {
            effects.textObjects[i].zIndex = z
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

    // MARK: - Phase 3 real implementation

    /// Returns true if the timeline has been customized away from defaults.
    public var timelineHasCustomizations: Bool {
        let p = timelineViewModel.project
        let hasKeyframes = p.mediaObjects.contains(where: { !($0.keyframes?.isEmpty ?? true) }) ||
                           p.textObjects.contains(where: { !($0.keyframes?.isEmpty ?? true) })
        let hasTransitions = !p.clipTransitions.isEmpty
        // `TimelineViewModel.init` seeds `slideDuration = 0` until
        // `bootstrap(project:)` runs, so a fresh composer would otherwise
        // report `hasNonDefaultDuration == true` (|0 - 6| > 0.01) before
        // any actual user customization. Treat the un-bootstrapped 0 as
        // the default value, not as a customization.
        let hasNonDefaultDuration = p.slideDuration > 0 && abs(p.slideDuration - 6.0) > 0.01
        return hasKeyframes || hasTransitions || hasNonDefaultDuration
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

    var memoryObserver: Any?

    func startMemoryObserver() {
        // Idempotent : un `onAppear` répété écrasait sinon le token précédent
        // sans le retirer — observers zombies accumulés dans NotificationCenter.
        stopMemoryObserver()
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
        if currentSlideId != nil {
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
        activeBrushTool = .pen
        activeBrushSmoothing = .raw
        drawingEditingMode = .inactive
        backgroundColor = "#\(StoryBackgroundPalette.randomBackgroundColor())"
        loadedImages = [:]
        loadedVideoURLs = [:]
        loadedAudioURLs = [:]
        loadedVideoCaptions = [:]
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
        // duration (6 s default for static reposts) and order (0).
        var cloned = StorySlide(
            id: UUID().uuidString,
            mediaURL: story.media.first?.url,
            mediaData: nil,
            content: story.content,
            effects: story.storyEffects ?? StoryEffects(),
            duration: 6,
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
            text: badgeText,
            x: 0.5, y: 0.92,
            scale: 1.0, rotation: 0,
            fontSize: 14,
            textStyle: "bold",
            textColor: "FFFFFF",
            textAlign: "center",
            textBg: "6366F1",
            isLocked: true
        )
        var effects = cloned.effects
        // Strip toute attribution verrouillée héritée de la source avant d'ajouter
        // la nôtre : reposter un repost empilerait sinon deux badges locked qui se
        // chevauchent au même point (x:0.5, y:0.92). Les text objects locked sont
        // EXCLUSIVEMENT des badges d'attribution (ce site est l'unique producteur de
        // `isLocked: true`), donc ce filtre ne touche jamais le texte éditable de
        // l'auteur. Le nouveau badge attribue à la source immédiate (`authorHandle`) ;
        // la racine reste tracée via `originalRepostOfId`.
        var texts = effects.textObjects.filter { $0.isLocked != true }
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

extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
