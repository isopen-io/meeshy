import SwiftUI
import Combine
import UIKit
import MeeshySDK
import PencilKit

// MARK: - ViewModel

@MainActor
public final class StoryComposerViewModel: StoryComposerProviding, ObservableObject {

    // MARK: - Source Language Resolution (Prisme Linguistique)

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

    // MARK: - Media Storage (pre-publication)

    @Published var loadedImages: [String: UIImage] = [:]
    @Published var loadedVideoURLs: [String: URL] = [:]
    @Published var loadedAudioURLs: [String: URL] = [:]

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

    enum MediaKind { case video, audio }

    // MARK: - Filter

    @Published var selectedFilter: String?
    @Published var filterIntensity: Double = 1.0

    // MARK: - Slide Duration

    // MARK: - Canvas Viewport

    @Published var canvasScale: CGFloat = 1.0
    @Published var canvasOffset: CGSize = .zero
    @Published var canvasSize: CGSize = .zero

    // MARK: - UI State

    @Published var showPhotoPicker: Bool = false
    @Published var showVideoPicker: Bool = false
    @Published var showAudioPicker: Bool = false
    @Published var publishProgress: (current: Int, total: Int)?
    @Published var errorMessage: String?
    @Published var showDraftAlert: Bool = false

    // MARK: - Limits

    // MARK: - Slide Management

    // MARK: - Element Management

    // MARK: - Background toggle

    // MARK: - Media Reorder

    // MARK: - Z-Order

    var zIndexMap: [String: Int] = [:]
    var nextZIndex: Int = 1

    // MARK: - Phase 3 real implementation

    // MARK: - Tool Actions

    // MARK: - Memory Pressure & Cleanup

    var memoryObserver: Any?

    // MARK: - Slide Image Management

    // MARK: - Reset
    // Note: Draft persistence is handled by StoryComposerView via StoryDraftStore — not by the ViewModel.

    // MARK: - Repost Initializer (Patch B.6)

    /// Default initializer (kept explicit so the convenience init below has a designated
    /// init to delegate to). All stored properties default-initialise, so the body is empty.
    public init() {}

    nonisolated deinit {
        preloadTask?.cancel()
    }
}
