import SwiftUI
import Combine
import UIKit
import MeeshySDK
import PencilKit

// MARK: - ViewModel

@MainActor
public final class StoryComposerViewModel: StoryComposerProviding, ObservableObject {

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

    // MARK: - Timeline history (E4 — undo/redo survit au teardown du moteur)

    /// Historique undo/redo PAR SLIDE : le `CommandStack` vit avec le moteur
    /// timeline lazy, qui est jeté à chaque démontage du canvas
    /// (`shutdownTimelineIfNeeded`) — sans ce stash, l'historique était perdu
    /// à chaque fermeture de sheet ET fuyait entre slides (bootstrap ne reset
    /// pas le stack).
    var timelineHistoryBySlide: [String: CommandStackSnapshot] = [:]
    /// Slide dont l'historique est actuellement chargé dans le moteur —
    /// la clé de stash au prochain load/shutdown.
    var timelineLoadedSlideId: String?

    // MARK: - Draft autosave (E1 — crash-safe editing)

    /// Intervalle du debounce d'autosave. `var` pour les tests uniquement :
    /// poser une valeur courte AVANT le premier accès à `autosaveTrigger`
    /// (le publisher est figé au premier accès, lazy).
    var autosaveDebounceInterval: TimeInterval = 2.5

    /// Publisher STABLE (lazy stored) qui émet ~2,5 s après la DERNIÈRE
    /// mutation du ViewModel — le signal « l'édition s'est posée, persiste le
    /// brouillon ». Stocké et non recalculé : un `objectWillChange.debounce`
    /// construit inline dans `body` serait re-souscrit à chaque évaluation de
    /// la vue, ce qui resetterait perpétuellement le timer sous édition
    /// active (renders fréquents) — le save ne tirerait jamais.
    private(set) lazy var autosaveTrigger: AnyPublisher<Void, Never> = objectWillChange
        .debounce(for: .seconds(autosaveDebounceInterval), scheduler: DispatchQueue.main)
        .map { _ in () }
        .eraseToAnyPublisher()

    // MARK: - Undo/redo global (C9)

    /// Pile de snapshots `[StorySlide]` encodés (JSON `.sortedKeys` —
    /// déterminisme requis pour la dédup, l'ordre des clés JSONEncoder est
    /// instable sur iOS 26). Voir le plan
    /// `2026-07-04-composer-global-undo-plan.md`.
    var history = HistoryStore<Data>(cap: 50)
    /// Miroirs @Published de `history.canUndo/canRedo` — n'assignent QUE sur
    /// changement réel (sinon la boucle flags → objectWillChange → trigger →
    /// push ne se poserait jamais ; la dédup du store ferme le cycle).
    /// Setter interne (pas `private(set)`) : muté par l'extension `+History`.
    @Published var canUndoGlobal = false
    @Published var canRedoGlobal = false

    /// Intervalle du debounce de capture. `var` pour les tests uniquement
    /// (à poser AVANT le premier accès à `historyTrigger`, lazy figé).
    var historyDebounceInterval: TimeInterval = 0.5

    /// Publisher STABLE (lazy stored — même piège que `autosaveTrigger` :
    /// un debounce inline dans `body` serait re-souscrit à chaque render et
    /// ne tirerait jamais) : émet ~0,5 s après la DERNIÈRE mutation du VM —
    /// « l'édition s'est posée, capture une étape d'annulation ». Couverture
    /// TOTALE par construction (toute mutation passe par objectWillChange) ;
    /// la dédup du HistoryStore absorbe les émissions sans changement de
    /// `slides` (sélections, états d'UI…).
    private(set) lazy var historyTrigger: AnyPublisher<Void, Never> = objectWillChange
        .debounce(for: .seconds(historyDebounceInterval), scheduler: DispatchQueue.main)
        .map { _ in () }
        .eraseToAnyPublisher()

    /// C9 Inc.3 — purge PARESSEUSE : les bitmaps/URLs des médias supprimés
    /// sont mis de côté (au lieu d'être jetés) tant que l'historique peut les
    /// restaurer — sans ça, l'undo d'une suppression ramènerait une référence
    /// SANS bitmap (le piège du plan). Vidés par `seedHistory()` et `reset()`.
    var retiredImages: [String: UIImage] = [:]
    var retiredVideoURLs: [String: URL] = [:]
    var retiredAudioURLs: [String: URL] = [:]
    var retiredSlideImages: [String: UIImage] = [:]

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

    /// Plein écran de TRACÉ (user 2026-07-11 v2) : l'outil dessin s'ouvre en
    /// mode LISTE (band avec les traits, rien d'activé) ; la sélection d'un
    /// pinceau bascule ce flag — canvas plein écran dessinable jusqu'aux
    /// angles, bulles seules, pinch-zoom. Retombe à `false` à la sortie du
    /// mode dessin (`exitDrawingEditingMode`).
    @Published var isDrawingImmersive = false

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

    /// Couleur/dégradé de fond sélectionné au Background tool. Appliqué EN
    /// DIRECT à `currentSlide.effects.background` — avant, la valeur ne
    /// rejoignait la slide qu'au prochain sync (publish/autosave) et le
    /// canvas ne re-rendait pas à la sélection (retour user 2026-07-11).
    @Published var backgroundColor: String = "#\(StoryBackgroundPalette.randomBackgroundColor())" {
        didSet {
            guard oldValue != backgroundColor else { return }
            applyBackgroundColorToCurrentSlide()
        }
    }

    /// Scheme épinglé sur le chrome posé SUR le canvas (header, FABs, bulles,
    /// history) : suit le fond RÉEL de la slide, jamais le thème de l'app.
    /// Couvre les DEUX chemins média : legacy `hasBackgroundImage`
    /// (selectedImage) ET les `mediaObjects` modernes `isBackground == true`
    /// (chip Background) — ce dernier échappait au calcul et laissait le
    /// chrome en `.light` (pastel aléatoire) sur un letterbox blur sombre,
    /// boutons inexploitables (captures user 2026-07-20). Un média de fond
    /// suit la luminance RÉELLE de son bitmap (2e vague de captures : capture
    /// d'écran BLANCHE en Background → chrome blanc invisible avec un `.dark`
    /// forfaitaire) ; sans bitmap mesurable, convention viewer → `.dark`.
    var canvasChromeScheme: ColorScheme {
        CanvasChromeScheme.scheme(
            background: backgroundColor,
            hasMediaBackground: hasBackgroundImage || currentEffects.hasVisualBackgroundMedia,
            mediaLuminance: backgroundMediaLuminance
        )
    }

    /// Luminance WCAG moyenne du bitmap de fond effectivement affiché
    /// (`currentSlideBackgroundImage` : média moderne d'abord, legacy
    /// ensuite). Cache mono-entrée par IDENTITÉ d'image — le bitmap ne change
    /// que quand l'utilisateur change de fond, et `canvasChromeScheme` est
    /// relu à chaque évaluation de body. `nil` = pas de bitmap (fond couleur,
    /// vidéo sans thumbnail chargée) → le scheme retombe sur `.dark`.
    var backgroundMediaLuminance: Double? {
        guard let image = currentSlideBackgroundImage else { return nil }
        let key = ObjectIdentifier(image)
        if let cached = backgroundLuminanceCache, cached.key == key { return cached.value }
        let value = CanvasChromeScheme.averageRelativeLuminance(of: image)
        backgroundLuminanceCache = (key, value)
        return value
    }
    private var backgroundLuminanceCache: (key: ObjectIdentifier, value: Double?)?

    /// Format `effects.background` : hex SANS « # » ou `gradient:HEX1:HEX2`
    /// (cf. le restore SyncRestore qui re-préfixe le hex nu).
    func applyBackgroundColorToCurrentSlide() {
        let value = backgroundColor.hasPrefix("#")
            ? String(backgroundColor.dropFirst())
            : backgroundColor
        var slide = currentSlide
        guard slide.effects.background != value else { return }
        slide.effects.background = value
        currentSlide = slide
    }

    // MARK: - Transitions du slide courant
    //
    // État VM (et non @State View) : une seule source de vérité pour la sheet
    // ⋯ Transitions ET le panneau Fond du band (C1), et surtout couverte par
    // `reset()` — l'ancien @State View survivait à `viewModel.reset()` et la
    // chaîne de sync ré-injectait l'effet dans le slide vierge (la classe de
    // bug que `resetLocalState()` documente).
    @Published var openingEffect: StoryTransitionEffect?
    @Published var closingEffect: StoryTransitionEffect?

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

    /// Enregistre (ou retire, si `image == nil`) le bitmap importé/édité d'un
    /// média sous sa clé ET **bump `loadedImagesVersion`** dans la foulée.
    /// Le `StoryComposerCanvasView` ne reconstruit son `ComposerImageCacheReader`
    /// — donc ne stampe le bitmap sur le canvas — QUE lorsque cette version
    /// change (cf. `StoryCanvasRepresentable.updateUIView`). Muter `loadedImages`
    /// directement sans ce bump laisse le reader périmé : un média fraîchement
    /// ajouté ne s'affiche jamais et le canvas reste noir (bug user 2026-07-20).
    /// Toute *nouvelle* écriture dans `loadedImages` DOIT passer par ici.
    func registerLoadedImage(_ image: UIImage?, for id: String) {
        if let image {
            loadedImages[id] = image
        } else {
            loadedImages.removeValue(forKey: id)
        }
        loadedImagesVersion &+= 1
    }

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

    /// Pont UIKit timeline → canvas (preview vivante) : le canvas visible
    /// derrière la sheet timeline suit chaque mouvement du playhead sans
    /// re-évaluation SwiftUI du composer. Enregistré par
    /// `StoryComposerCanvasView.makeUIView`, alimenté par les callbacks du
    /// `timelineViewModel` (cf. StoryComposerViewModel+Timeline).
    public let canvasTimelineBridge = StoryCanvasTimelineBridge()

    enum MediaKind { case video, audio }

    // MARK: - Filter

    @Published var selectedFilter: String?
    @Published var filterIntensity: Double = 1.0

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

    // MARK: - Z-Order

    var zIndexMap: [String: Int] = [:]
    var nextZIndex: Int = 1

    // MARK: - Memory Pressure & Cleanup

    var memoryObserver: Any?

    // MARK: - Repost Initializer (Patch B.6)

    /// Default initializer (kept explicit so the convenience init below has a designated
    /// init to delegate to). All stored properties default-initialise, so the body is empty.
    public init() {}

    nonisolated deinit {
        preloadTask?.cancel()
    }
}
