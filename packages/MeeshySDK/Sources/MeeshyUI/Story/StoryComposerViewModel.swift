import SwiftUI
import Combine
import UIKit
import MeeshySDK
import PencilKit

// MARK: - ViewModel

@MainActor
public final class StoryComposerViewModel: StoryComposerProviding, ObservableObject {

    // MARK: - Slides

    // `public internal(set)` (#4038) : le meuble app-side LIT les slides pour
    // dériver le rail et savoir laquelle porte quel média — il n'en MUTE jamais
    // le tableau, les mutations passant par `addSlide` / `removeSlide` /
    // `selectSlide`. Déjà exposées par le protocole `StoryComposerProviding`.
    @Published public internal(set) var slides: [StorySlide] = [StorySlide()]
    @Published public internal(set) var currentSlideIndex: Int = 0
    /// `public internal(set)` comme ses voisines (`loadedImages`, `loadedVideoURLs`,
    /// `loadedAudioURLs`) : un hôte app doit pouvoir composer l'APERÇU sans monter
    /// l'atelier — `snapshotAllSlides()` vit sur la VUE, donc hors de portée d'un
    /// meuble qui incruste la scène. En écriture, le ViewModel reste seul maître.
    @Published public internal(set) var slideImages: [String: UIImage] = [:]

    // MARK: - Repost source (Patch B.6 — exposed publicly so the iOS caller in Phase C
    // can read them before invoking PostService.create / createStory with repostOfId).
    @Published var repostOfId: String?
    @Published var originalRepostOfId: String?

    // MARK: - Edit mode (directive 2026-07-29 — édition d'une story publiée)

    /// Non-nil quand le composer ÉDITE une story publiée (`init(editing:)`).
    /// L'app le lit au publish pour router vers `PUT /posts/:id` (update +
    /// reset d'engagement serveur) au lieu de `createStory`. Le mode édition
    /// désactive aussi le système de brouillons (restore/save) et le
    /// multi-slide — une story publiée = UN slide.
    public internal(set) var editingPostId: String?
    /// Ids des `PostMedia` attachés à la story au moment de l'hydratation —
    /// sert à diff-er `removeMediaIds` au publish (médias plus référencés).
    public internal(set) var editingOriginalMediaIds: [String] = []
    /// Id du média de FOND original (celui de `story.media` qui n'est
    /// référencé par aucun objet des effects) — conservé tel quel si le fond
    /// n'a pas changé, retiré + ré-uploadé sinon.
    public internal(set) var editingOriginalBackgroundMediaId: String?
    /// Instance UIImage posée par le préchargement d'hydratation comme fond
    /// de slide. Comparaison d'IDENTITÉ (`===`) au publish : la même instance
    /// = fond inchangé (ne pas ré-uploader), une autre = l'utilisateur a
    /// remplacé le fond.
    public internal(set) var editingHydratedBackgroundImage: UIImage?
    /// Visibilité initiale de la story éditée (seed de l'état du composer).
    public internal(set) var editingInitialVisibility: String?
    public internal(set) var editingInitialVisibilityUserIds: [String] = []
    /// L'ensemble DÉCLARÉ de la story éditée est-il connu EN ENTIER ?
    ///
    /// `false` tant que le composer n'a pas relu le post à l'unité : les
    /// charges utiles de LISTE amputent le jeu (le select du feed écarte les
    /// SILENCIEUSES), et seule la lecture unitaire projette POUR L'AUTEUR.
    ///
    /// Tant qu'il vaut `false`, l'édition se TAIT sur les références (clé
    /// absente, le serveur préserve) : republier un jeu amputé les révoquerait
    /// sans que l'auteur les ait seulement vues, et leur retirerait du même
    /// coup l'accès au contenu.
    public internal(set) var editingKnowsDeclaredReferences = false

    // Cancellable preload Task started by `init(reposting:authorHandle:)`.
    // Marked `nonisolated(unsafe)` so the `nonisolated deinit` below can cancel it
    // without requiring a MainActor hop (cancellation is Sendable / thread-safe).
    nonisolated(unsafe) var preloadTask: Task<Void, Never>?

    // MARK: - Références

    /// L'ensemble des personnes que cette story nomme, tous modes confondus.
    ///
    /// PINNED a EN PLUS un badge sur le canevas ; les trois autres modes
    /// n'existent qu'ici, et c'est la publication qui les déclare. La liste
    /// vit donc hors de `StoryEffects` : y ranger une référence SILENCIEUSE la
    /// publierait à tous les lecteurs du blob d'effets, ce qui est exactement
    /// ce que ce mode promet de ne pas faire.
    ///
    /// Écrite par `addReference` / `removeReference` (et par la suppression
    /// d'un badge sur le canevas) — jamais de l'extérieur.
    @Published public internal(set) var references: [ComposerReference] = []

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
    @Published public internal(set) var canUndoGlobal = false
    @Published public internal(set) var canRedoGlobal = false

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
    public private(set) lazy var historyTrigger: AnyPublisher<Void, Never> = objectWillChange
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
    /// Les octets animés d'un sticker supprimé — même purge paresseuse que les
    /// bitmaps : un undo qui ramène le sticker doit le ramener ANIMÉ, pas figé
    /// sur son image 1.
    var retiredStickerAnimations: [String: Data] = [:]

    // MARK: - Floating Text Edit Mode

    /// Mode d'édition de texte plein écran (overlay flottant). `.inactive` par
    /// défaut. Voir `StoryComposerViewModel+TextEditing.swift` pour les
    /// transitions. La géométrie du texte (`x/y/scale/rotation/zIndex/fontSize`)
    /// n'est JAMAIS mutée pour l'édition : le texte est édité dans un overlay
    /// centré, le modèle reste la source de vérité pour le rendu et l'export.
    /// `public` en LECTURE (#4401) : le meuble monte le contrôleur de texte et
    /// relaie l'édition en ligne quand un texte est actif. L'ÉCRITURE reste au
    /// module — elle passe par `enterTextEditingMode` / `exitTextEditingMode`,
    /// qui gardent le verrou du badge de republication et suppriment les
    /// coquilles vides. Un site d'appel qui poserait le mode à la main
    /// contournerait les deux.
    @Published public internal(set) var textEditingMode: TextEditingMode = .inactive

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
    /// `public` en LECTURE : le rail *leading* montre les contrôleurs de
    /// l'outil ouvert et TEINTE celui dont le panneau est déplié (directive
    /// porteur 2026-08-30). L'écriture reste au module — elle passe par
    /// `beginDrawing` / `endDrawing` / `setExpandedDrawingTool`, qui posent les
    /// drapeaux par paires.
    @Published public internal(set) var drawingEditingMode: DrawingEditingMode = .inactive

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
    /// `public` en LECTURE ET EN ÉCRITURE (#4403) : la bande de fond du
    /// plateau choisit l'effet comme le fait le panneau de l'atelier, et la
    /// persistance passe par la même chaîne `granularCanvasSync` — aucun
    /// callback de synchro à câbler par surface.
    @Published public var openingEffect: StoryTransitionEffect?
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

    // `public internal(set)` (#4038) : `EmbeddedSceneCanvas` doit RECEVOIR ces
    // bitmaps, sinon un fond MÉDIA ne se stampe pas — l'app les lit pour les lui
    // passer, elle ne les écrit jamais.
    @Published public internal(set) var loadedImages: [String: UIImage] = [:]
    @Published public internal(set) var loadedVideoURLs: [String: URL] = [:]
    @Published public internal(set) var loadedAudioURLs: [String: URL] = [:]

    /// **Les octets ANIMÉS d'un sticker collé, keyés par id d'élément** (#3956)
    /// — vide pour tout sticker fixe, qui ne paie donc rien.
    ///
    /// Jumelle de `loadedVideoURLs` : le composer tient à part ce qu'une
    /// `UIImage` ne sait pas porter. `loadedImages[id]` garde la PREMIÈRE image
    /// du même sticker — la cover, l'export, le thumbHash et la vignette de
    /// grille continuent de la lire sans rien connaître de l'animation.
    ///
    /// Les octets, et non des images décodées : un GIF de trente images décodé
    /// en mémoire pour chaque sticker posé coûterait des dizaines de mégaoctets
    /// que rien ne borne. Le site qui PEINT décode au budget de sa surface.
    @Published public internal(set) var loadedStickerAnimations: [String: Data] = [:]

    /// **Les sources déjà PORTÉES dans la scène (B1, #3924).** Clé
    /// d'idempotence d'`applyContentMedia` : les closures de bascule de mode
    /// refirent à chaque changement (Post↔Story↔Réel), et sans cette mémoire un
    /// simple aller-retour dupliquerait chaque média du document. La source est
    /// l'URL LOCALE que l'hôte passe — jamais l'`obj.id` généré, qui change à
    /// chaque pose.
    var carriedContentSources: Set<URL> = []

    /// Cookie monotone bumpé à chaque édition d'un bitmap déjà présent dans
    /// `loadedImages` (typiquement `MeeshyImageEditorView` onAccept qui
    /// remplace la valeur sous une clé inchangée). Le `Coordinator` du
    /// `StoryComposerCanvasView` compare ce cookie à `lastLoadedImagesVersion`
    /// pour déclencher un rebuild des media layers — sans ça le canvas
    /// principal restait stale après image edit (les dicts UIImage ne sont
    /// pas Equatable et SwiftUI ne peut donc pas détecter une mutation
    /// de valeur intra-clé). Cf. `ComposerImageCacheReader.version`.
    @Published public internal(set) var loadedImagesVersion: UInt64 = 0

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

    /// Enregistre (ou retire, si `data == nil`) les octets ANIMÉS d'un sticker
    /// sous sa clé, **et bump `loadedImagesVersion`** pour la même raison que
    /// `registerLoadedImage` : sans ce bump, le `ComposerImageCacheReader` du
    /// canvas reste périmé et le sticker collé s'affiche figé sur son image 1
    /// — un défaut MUET, puisque quelque chose s'affiche.
    func registerLoadedStickerAnimation(_ data: Data?, for id: String) {
        if let data {
            loadedStickerAnimations[id] = data
        } else {
            loadedStickerAnimations.removeValue(forKey: id)
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

    // MARK: - Identité de brouillon

    /// Brouillon sous lequel cette session du composer s'autosauvegarde.
    ///
    /// Le store était mono-brouillon : commencer une deuxième story écrasait
    /// silencieusement la première. Chaque session porte désormais son id —
    /// neuf pour une ardoise vierge, celui du brouillon repris sinon
    /// (spec 2026-08-01).
    public private(set) var draftId: String = UUID().uuidString

    /// Vrai quand la session a été rattachée à un brouillon CHOISI par
    /// l'utilisateur (`adoptDraft(id:)`, tap dans « Mes stories »). Le composer
    /// restaure alors ce brouillon dès l'ouverture SANS re-proposer le bandeau
    /// de reprise — l'utilisateur vient de trancher — et « Recommencer » s'en
    /// détache (`detachFromAdoptedDraft`) au lieu de le détruire.
    public private(set) var isAdoptedDraftSession = false

    /// Vrai quand la session a été SEMÉE par une porte (`init(seeding:)`) —
    /// un média posé sur le canvas avant même que l'atelier ne s'ouvre.
    ///
    /// Elle n'est ni une session vierge, ni une session adoptée, et elle ne
    /// peut se comporter comme aucune des deux : une session vierge n'appelle
    /// jamais `restoreCanvas`, si bien que le fond semé ne serait jamais
    /// recopié dans le `@State` de la vue — canvas VIDE sous une porte qui
    /// vient d'annoncer un média posé —, et elle propose en plus une carte
    /// « Reprendre » dont `restoreDraft()` écrase `slides` sans condition,
    /// détruisant la graine d'un tap. `openingDraftAction` lit ce drapeau ;
    /// `internal(set)` parce que `init(seeding:)` vit dans un autre fichier du
    /// même module, sur le modèle exact d'`editingPostId`.
    ///
    /// Il ne vaut `true` que si la graine a effectivement POSÉ quelque chose :
    /// une graine vidéo dont le fichier a disparu laisse une ardoise vierge,
    /// donc une session vierge, qui retrouve ses droits de reprise.
    public internal(set) var isSeededSession = false

    /// Rattache la session à un brouillon existant. Appelé AVANT toute
    /// restauration : l'autosave qui suit doit écrire sous le bon id.
    public func adoptDraft(id: String) {
        draftId = id
        isAdoptedDraftSession = true
    }

    /// « Recommencer » sur une session adoptée : la session repart sous un id
    /// NEUF et rend le brouillon choisi, qui reste intact en magasin. Le
    /// supprimer ici détruirait précisément ce que l'utilisateur venait de
    /// désigner comme « à reprendre ».
    public func detachFromAdoptedDraft() {
        draftId = UUID().uuidString
        isAdoptedDraftSession = false
    }

    /// **Semer une couleur de fond depuis un hôte app (F2, #3885).** Point
    /// d'entrée PUBLIC : le composer POST fait naître la scène 9:16 en posant un
    /// fond (« un post sans visuel devient une toile »), et cette couleur doit
    /// apparaître sur la scène montée. `backgroundColor` reste `internal` —
    /// l'atelier l'écrit lui-même par son picker ; l'hôte passe par cette porte,
    /// qui normalise le préfixe `#`. Le `didSet` propage à la slide courante.
    public func applyBackground(hex: String) {
        backgroundColor = hex.hasPrefix("#") ? hex : "#\(hex)"
        // Phase 2 (#3939) — poser aussi le fond SUR la slide courante, pour que
        // la scène incrustée dans l'écran document l'AFFICHE immédiatement (sans
        // dépendre de la chaîne de sync de l'atelier plein écran, qui ne tourne
        // pas sous la surface document). Idempotent (garde d'égalité interne).
        applyBackgroundColorToCurrentSlide()
    }

    /// **Retirer le fond de couleur (#4047).** Jumelle d'`applyBackground` —
    /// sans elle, poser une couleur est une porte à SENS UNIQUE : l'hôte peut
    /// l'écrire et jamais l'effacer, si bien qu'un post devenu toile ne pouvait
    /// plus redevenir un post sans toile.
    ///
    /// Le fond RETOMBE sur une couleur de palette tirée au sort, comme à la
    /// naissance du composer (`reset()`), plutôt que sur du vide : `background`
    /// n'est pas optionnel dans `StoryEffects`, et y poser une chaîne vide
    /// donnerait un canvas NOIR — le défaut de 2026-07-20, dans l'autre sens.
    /// Ce qui disparaît est l'INTENTION de l'auteur, portée côté hôte
    /// (`documentBackground`), qui cesse alors de faire naître la scène.
    public func clearBackground() {
        applyBackground(hex: StoryBackgroundPalette.randomBackgroundColor())
    }

    /// **Semer le CONTENU depuis un hôte app (B1, #3924).** Point d'entrée
    /// PUBLIC : le composer garde UN seul contenu (`documentText`) quand il
    /// change de mode — la scène qui naît le reçoit sur la slide courante
    /// (`StorySlide.content`), d'où il partira à la publication et où B2 le
    /// rendra dans une section description repliable. Idempotent : re-semer le
    /// même texte ne dirty pas la slide.
    public func applyContentText(_ text: String) {
        let value = text.isEmpty ? nil : text
        var slide = currentSlide
        guard slide.content != value else { return }
        slide.content = value
        currentSlide = slide
    }

    /// **E1/E3 (#3886/#3888) — la langue DÉCLARÉE au bas du composer, défaut de
    /// TOUT objet posé sur la scène.** La capsule du composer (`documentLanguage`)
    /// la sème ; chaque `MeeshyObject` créé (texte, média, audio, sticker, lieu)
    /// naît avec elle comme `sourceLanguage`, et l'auteur peut la surcharger par
    /// objet (E3, `updateElementLanguage`). Défaut de repli `defaultSourceLanguage`
    /// (« fr ») tant qu'aucun hôte ne l'a semée — jamais un « fr » codé en dur
    /// sur l'objet.
    public var declaredContentLanguage: String = StoryComposerViewModel.defaultSourceLanguage

    /// Absorbe les médias d'un brouillon restauré en UNE passe et bump
    /// `loadedImagesVersion` quand des bitmaps sont arrivés : le canvas ne
    /// reconstruit son `ComposerImageCacheReader` que sur ce cookie — merger
    /// `loadedImages` sans lui laissait les images du brouillon repris
    /// invisibles (même invariant que `registerLoadedImage`).
    func mergeRestoredMedia(images: [String: UIImage],
                            videoURLs: [String: URL],
                            audioURLs: [String: URL]) {
        loadedImages.merge(images) { _, new in new }
        loadedVideoURLs.merge(videoURLs) { _, new in new }
        loadedAudioURLs.merge(audioURLs) { _, new in new }
        guard !images.isEmpty else { return }
        loadedImagesVersion &+= 1
    }

    /// Default initializer (kept explicit so the convenience init below has a designated
    /// init to delegate to). All stored properties default-initialise, so the body is empty.
    public init() {}

    nonisolated deinit {
        preloadTask?.cancel()
    }
}
