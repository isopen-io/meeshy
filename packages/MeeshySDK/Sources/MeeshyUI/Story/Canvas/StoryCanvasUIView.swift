import UIKit
import QuartzCore
import CoreMedia
import AVFoundation
import Metal
import PencilKit
import Combine
import os
import MeeshySDK

// MARK: - Story Canvas Notifications

/// Notification names shared across the story canvas, composer, viewer, and audio player.
/// Previously defined in StoryCanvasReaderView.swift (legacy); moved here after that file
/// was deleted in the Phase A4 reader migration.
public extension Notification.Name {
    /// Posted by the viewer approximately 2 s before the end of a slide to trigger audio fade-out.
    static let storyAudioFadeOut = Notification.Name("storyAudioFadeOut")
    /// Posted by the composer to mute all canvas audio (e.g., while the audio picker is open).
    static let storyComposerMuteCanvas = Notification.Name("storyComposerMuteCanvas")
    /// Posted by the composer to restore canvas audio after muting.
    static let storyComposerUnmuteCanvas = Notification.Name("storyComposerUnmuteCanvas")
    /// Posted by the viewer when the user toggles the story to a paused state
    /// (long-press toggle). The canvas pauses ALL media playback —
    /// background video, foreground videos and audio engine — so the story
    /// freezes as a single unit alongside the progress-bar timer.
    static let storyPlayerPause = Notification.Name("storyPlayerPause")
    /// Posted by the viewer when the user toggles the story back to playing
    /// (tap on a paused story). Mirrors `storyPlayerPause` — the canvas
    /// resumes background video, foreground videos and audio engine together.
    static let storyPlayerResume = Notification.Name("storyPlayerResume")
    /// Posted by the timeline when playback starts inside the composer.
    static let timelineDidStartPlaying = Notification.Name("timelineDidStartPlaying")
    /// Posted by the timeline when playback stops inside the composer.
    static let timelineDidStopPlaying = Notification.Name("timelineDidStopPlaying")
}

// MARK: - Canvas Manipulation Layer

/// Couche active pour la manipulation des éléments du canvas. Détermine quel
/// type d'élément reçoit les gestes (pan/pinch/rotate) selon le contenu de la
/// slide. Le verrouillage se fait en cascade : dès qu'un foreground est posé,
/// le background n'est plus manipulable. Voir spec
/// `2026-05-20-stories-video-layers-text-sprint-design.md` § 4.
public enum CanvasManipulationLayer: String, Sendable, Equatable {
    /// Slide vierge (aucun média / texte / sticker). Aucune manipulation.
    case canvas
    /// Background media posé, aucun foreground. Le bg seul est manipulable.
    case background
    /// Au moins un foreground (média fg, texte ou sticker). Le fg sous le
    /// doigt est manipulable ; le bg et le canvas root sont gelés.
    case foreground
}

/// The UIKit canvas surface that renders a `StorySlide` and switches between
/// `.edit` (gestures, all items visible, ProMotion 120 Hz) and `.play`
/// (timing-driven playback at 60 Hz with optional 120 Hz wake-up for gestures).
///
/// Internally this view does NOT own its own layout logic for items — it
/// delegates to `StoryRenderer.render(slide:into:at:mode:)`, the single source
/// of rendering shared with `StoryAVCompositor` (Phase 4 export).
///
/// Layer hierarchy:
/// ```
/// view.layer
///  └─ rootLayer            (frame = bounds, anchorPoint = (0,0))
///      ├─ itemsContainer   (per-item layers from StoryRenderer)
///      └─ editOverlayLayer (snap guides, selection markers)
/// ```
public final class StoryCanvasUIView: UIView {

    // MARK: - Public API

    public var slide: StorySlide {
        didSet {
            // Refresh the cached background media id BEFORE early return paths
            // so handlePan can branch correctly even mid-gesture.
            backgroundMediaObjectId = slide.effects.mediaObjects?
                .first(where: { $0.isBackground })?.id

            // Skip expensive full-layer rebuild while a gesture is actively
            // manipulating an item (pan/pinch/rotate). The gesture handlers
            // update the specific CALayer transform directly. A full rebuild
            // happens once the gesture ends (manipulatedItemId becomes nil).
            guard manipulatedItemId == nil else {
                updateManipulatedItemLayer()
                return
            }
            // Recalculer la couche active. Si la suppression d'un élément a
            // changé la couche (ex: dernier fg supprimé → repasse en
            // `.background` ou `.canvas`), notifie l'UI.
            updateManipulationLayer()
            // The captured filter source texture is content-dependent. Drop the
            // freshness token so the next `updateFilterLayer()` rebuilds it
            // against the new slide. Geometry-only changes (`layoutSubviews`)
            // already invalidate via `lastCapturedSize`.
            slideContentRevision &+= 1
            rebuildLayers()
            // Slide content (incl. audio model) changed — reload the mixer and
            // restart playback so the new slide's audio is heard. No-op outside
            // `.play` mode. `reconfigureAudioForPlayback()` guards on the
            // revision token, so this fires at most once per slide change.
            if mode == .play {
                // Reset le mute per-piste + le playhead uniquement quand
                // l'id de slide change (pas sur chaque mutation mineure
                // comme un keyframe). Sinon on perdrait l'état mute au
                // milieu de la lecture si la slide est dirty-mise-à-jour
                // (rare en `.play` mais le garde-fou est cheap).
                if oldValue.id != slide.id {
                    StoryReaderAudioMuteRegistry.shared.clear()
                    lastAppliedMutedSet.removeAll()
                    StoryReaderPlayheadState.shared.reset()
                }
                reconfigureAudioForPlayback()
                startAudioPlayback()
            }
        }
    }
    public private(set) var mode: RenderMode
    public private(set) var currentTime: CMTime = .zero

    /// Corner radius (in this view's own coordinate space) applied to the
    /// backing layer so the rounded « card » clips the actual CALayer story
    /// content (background image/video + items). A SwiftUI `.clipShape` wrapped
    /// around this `UIViewRepresentable` does NOT mask the embedded CALayer
    /// tree — only the UIKit layer's own `cornerRadius` + `masksToBounds` does.
    /// `0` = square (free/immersive state). The composer passes a value already
    /// compensated for its `.scaleEffect(framing.scale)` so the on-screen radius
    /// lands at the intended ~22pt.
    public var canvasCornerRadius: CGFloat = 0 {
        didSet {
            guard oldValue != canvasCornerRadius else { return }
            layer.cornerRadius = canvasCornerRadius
            layer.masksToBounds = canvasCornerRadius > 0
        }
    }

    /// Opt-in du **composer** (`StoryComposerCanvasView`) pour faire JOUER et
    /// boucler les vidéos (fond + foreground) sur le canvas d'édition — live
    /// preview. Le mode `.edit` est aussi celui du prefetcher hors-écran, qui
    /// DOIT rester silencieux ; ce drapeau (défaut `false`) garantit que seul
    /// le canvas composer déclenche la lecture en édition. Sans effet en
    /// `.play` (le reader joue toujours, une fois pour le foreground).
    public var playsVideoInEditMode: Bool = false {
        didSet {
            guard oldValue != playsVideoInEditMode else { return }
            applyEditPlayback()
        }
    }

    // MARK: - Reader context (Task 5)

    private var readerContext: StoryReaderContext = .empty
    private var completionFired: Bool = false

    /// Called whenever a gesture mutates the slide (Tasks 2.7+).
    public var onItemModified: ((StorySlide) -> Void)?

    /// Classifies an item that was hit by a gesture so the parent can route to
    /// the correct editor (text panel vs media editor sheet vs sticker UX).
    public enum CanvasItemKind: Sendable, Equatable {
        case text, media, sticker
    }

    /// Called when the user single-taps an item on the canvas. Used by the
    /// composer to open the inline format panel (text editor / media format
    /// band) on touch — the user requested touch-to-edit parity with the
    /// UniversalComposerBar ephemeral-toggle UX (controls slide up the moment
    /// the element is touched). Fires only when the tap doesn't escalate to
    /// a double-tap (`doubleTapRecognizer` is the dominant gate).
    public var onItemTapped: ((String, CanvasItemKind) -> Void)?

    /// Called when the user double-taps an item on the canvas. The parent
    /// composer typically uses this to open the inline text editor or the
    /// media editor sheet (legacy `onEditText` / `onEditMedia` UX parity).
    public var onItemDoubleTapped: ((String, CanvasItemKind) -> Void)?

    /// Called after the context-menu "Dupliquer" action creates a copy of an
    /// element. Parent uses this to mirror viewModel-owned ephemeral state
    /// (loadedImages / loadedVideoURLs) under the new UUID so the duplicate
    /// inherits its thumbnail / preview immediately. Fires AFTER the slide
    /// mutation has been propagated via `onItemModified`.
    public var onItemDuplicated: ((_ oldId: String, _ newId: String, _ kind: CanvasItemKind) -> Void)?

    /// Fired exactly once per slide rebuild when the background media has
    /// finished loading (image bytes decoded into `contents`, video transitioned
    /// to `.readyToPlay`, or synchronous color/gradient applied). Item layers
    /// are already built by the time `rebuildLayers()` returns, so the
    /// background is the only async gate; once it is settled the slide is
    /// visually complete and the reader's slide-duration timer is safe to
    /// start (see `StoryReaderTimerController`).
    ///
    /// The callback is `@MainActor` because all KVO callbacks below are
    /// dispatched onto the main run loop; using a `nonisolated` closure type
    /// would silently strand the caller off the main actor on Swift 6.
    public var onContentReady: (@MainActor () -> Void)?

    /// Fraction `[0, 1]` du contenu de la slide actuellement disponible
    /// localement. Émis à chaque transition d'état d'asset (KVO video.status,
    /// arrivée du bitmap image, etc.). `1.0` correspond au signal binaire
    /// `onContentReady`. Permet de piloter un overlay loader granulaire
    /// (cf. spec § 3.D.2).
    public var onContentProgress: (@MainActor (Double) -> Void)?

    /// Position de lecture canonique de la slide (secondes), émise à chaque
    /// tick du displayLink interne en mode `.play`. Source de vérité unique
    /// pour la progress bar du viewer parent — elle reflète l'avancement réel
    /// de la timeline (vidéo BG, audio, keyframes) avec auto-pause sur
    /// `setStoryPlaybackPaused(true)` et accumulation cohérente avec
    /// `slide.computedTotalDuration()` (qui inclut le roundup des cycles bg).
    ///
    /// Le viewer dérive `progress = playheadTime / computedTotalDuration` et
    /// déclenche `goToNext()` sur `onCompletion` (et non sur son propre
    /// wall-clock), garantissant que la transition n'interrompt JAMAIS un
    /// cycle vidéo bg mid-loop.
    public var onPlaybackTime: (@MainActor (Double) -> Void)?

    /// Émis quand l'état de progression RÉELLE de la lecture du média PRIMAIRE
    /// de la slide change : `true` quand il joue (ou qu'aucune vidéo n'est à
    /// gater), `false` quand il bufferise (`.waitingToPlayAtSpecifiedRate`) ou
    /// se met en pause de façon inattendue. Le viewer parent câble ce signal sur
    /// `StoryReaderTimerController.setPlaybackStalled(!progressing)` pour geler la
    /// progress bar + l'auto-advance EN PHASE avec la lecture (timeline unifiée).
    /// Le SDK n'émet QUE le signal bas niveau ; la décision produit « geler la
    /// timeline » reste app-side (SDK purity). Emit-on-change uniquement ; jamais
    /// émis pour une slide sans vidéo primaire (image / couleur / audio-only).
    public var onPlaybackProgressing: (@MainActor (Bool) -> Void)?

    // MARK: - Internal layers

    private let rootLayer = CALayer()
    let itemsContainer = CALayer()
    private let editOverlayLayer = CALayer()

    /// Background layer (color/gradient/image/video). Inserted at z=0 beneath itemsContainer.
    /// `internal` (not private) so test seams can introspect transform during live drag tests.
    internal let backgroundLayer = StoryBackgroundLayer()

    /// Monotonic counter incremented whenever `slide` is reassigned (semantic
    /// content revision). Drives the foreground `StoryRendererCache` signature
    /// and the audio mixer key; in `.play` it stays stable between display-link
    /// ticks (only `currentTime` advances). Also used in tests to assert a
    /// mutation triggers a predictable number of `didSet`s.
    internal var slideContentRevision: UInt64 = 0

    /// Monotonic token bumped by `invalidateImageCache()` when the composer's
    /// in-memory image cache changes (an in-place image edit bumped
    /// `loadedImagesVersion`). Passed to `backgroundLayer.configure` as
    /// `contentVersion` so the background re-stamps an edited bitmap under the
    /// same media id. The story filter is BAKED into the background bitmap by
    /// `StoryBackgroundLayer` (no overlay) since the 2026-06-03 pivot.
    private var composerImageRevision: UInt64 = 0

    /// Two-pass backdrop snapshot helper. Drives the MPS path on
    /// `StoryGlassBackdropLayer` by capturing the canvas-minus-glass tree
    /// once per `rebuildLayers()` tick and serving cropped regions to each
    /// glass-text item via the `BackdropProvider` closure. When no glass
    /// items exist on the slide the capture is a no-op (single boolean scan).
    /// See `docs/superpowers/specs/2026-05-12-story-glass-backdrop-snapshot-design.md`.
    private let backdropCapture = StoryBackdropCapture()

    /// Cache CALayer partagé entre tous les ticks de `rebuildLayers()` (.play
    /// 60 Hz + .edit). Évite de recréer un `AVPlayer` 60 fois par seconde
    /// pendant la lecture (cf. spec § 2.2 A.1). L'extension content fingerprint
    /// de `ItemSignature` détecte les mutations de modèle à id constant pour
    /// invalider correctement le cache d'une frame à l'autre.
    private let rendererCache = StoryRendererCache()

    // MARK: - Content readiness tracking

    /// `true` after `onContentReady` has fired for the current background
    /// state. Reset on every slide change (via `slide.didSet` → `rebuildLayers`)
    /// and on every `setReaderContext` so re-keying replays the wait.
    private(set) public var contentReadyFired: Bool = false

    /// `true` once the slide background (color / gradient / image / video) is
    /// visually settled. The combined `onContentReady` signal additionally
    /// waits on foreground video readiness (T6).
    private var backgroundContentReady: Bool = false

    /// `true` quand l'activation du background playback (vidéo bg + audio bg)
    /// a été demandée en `.play` mais que `contentReadyFired` était encore
    /// `false`. Le user-spec : ni la vidéo bg ni l'audio bg ne doivent jouer
    /// tant que TOUS les médias chargeables (image bg + foreground videos)
    /// ne sont pas prêts. `fireContentReadyIfNeeded()` consomme ce drapeau
    /// dès que `onContentReady` fire et active les deux à la fois. Sans ce
    /// gate, l'audio jouait sur une slide dont l'image bg n'avait jamais
    /// loadée (file:// dead, resolver nil, 404 réseau) — le user voit un
    /// loader à 0% mais entend la TTS / musique de fond, et/ou la vidéo bg
    /// joue sans son image fixed → désynchro UX inacceptable.
    private var pendingBackgroundActivation: Bool = false

    /// Intention de lecture des vidéos FOREGROUND — source de vérité unique,
    /// tenue EN PHASE avec `backgroundLayer.isPlaybackActive` et le mixer audio
    /// pour que le démarrage des vidéos foreground soit synchronisé avec la
    /// vidéo de fond + le son (au lieu de démarrer dès l'attach, en avance).
    /// Sticky : `rebuildLayers()` le propage aux layers fraîchement attachées,
    /// et `StoryMediaLayer.attachPlayer` le consulte pour qu'une vidéo dont les
    /// octets arrivent APRÈS le « GO » (content-ready) démarre immédiatement.
    private var foregroundVideosPlaybackActive: Bool = false {
        didSet {
            guard oldValue != foregroundVideosPlaybackActive else { return }
            forEachMediaLayer { $0.isPlaybackActive = foregroundVideosPlaybackActive }
        }
    }

    /// KVO token watching `backgroundLayer.contentLayer.contents` while an
    /// image background is loading. Held until the real bytes land or the
    /// background is replaced. `NSKeyValueObservation` invalidates on deinit
    /// so there is no manual `invalidate()` requirement on dealloc.
    private var imageContentsObserver: NSKeyValueObservation?

    /// KVO token watching `avPlayer.currentItem.status` while a video
    /// background is preparing. Released when the player reaches
    /// `.readyToPlay` or the background is replaced.
    private var videoStatusObserver: NSKeyValueObservation?

    /// KVO token watching the background `AVPlayerLayer.isReadyForDisplay`
    /// (première frame réellement décodée ET composée à l'écran). C'est CE
    /// signal — pas la simple présence disque du fichier — qui gate la progress
    /// bar, pour qu'elle n'avance jamais sur le flou ThumbHash pendant le
    /// spinup du decoder. Libéré dans `teardownReadinessObservers`.
    private var videoFirstFrameObserver: NSKeyValueObservation?

    /// Tâche de sondage utilisée pour la branche cache-miss de
    /// `scheduleContentReadyEvaluation(.video)` : quand `backgroundLayer
    /// .configure` lance une `Task` async pour télécharger l'URL distante,
    /// `avPlayer` n'existe pas encore au moment de l'évaluation et il faut
    /// attendre son apparition pour brancher l'observer status. Annulée à
    /// chaque changement de slide et dans `teardownReadinessObservers`.
    private var pendingVideoReadinessTask: Task<Void, Never>?

    /// `CGImage` captured the moment the ThumbHash placeholder was assigned
    /// to `backgroundLayer.contentLayer.contents`. Used to distinguish
    /// "still showing the placeholder" from "real bitmap landed" — the
    /// `imageContentsObserver` only fires `onContentReady` once `contents`
    /// transitions to a `CGImage` that is not this reference.
    private weak var thumbHashPlaceholderRef: AnyObject?

    // MARK: - Gestures

    private var panRecognizer: UIPanGestureRecognizer!
    private var pinchRecognizer: UIPinchGestureRecognizer!
    private var rotationRecognizer: UIRotationGestureRecognizer!
    private var singleTapRecognizer: UITapGestureRecognizer!
    private var doubleTapRecognizer: UITapGestureRecognizer!
    /// Pinch à 3 doigts dédié au zoom du viewport (canvas entier). Séparé du
    /// `pinchRecognizer` 2-doigts qui agit sur un élément/fond : sans cette
    /// séparation, un pinch sur un élément faisait aussi scaler le conteneur
    /// SwiftUI (`.scaleEffect(canvasScale)`) parce que les deux gestures
    /// firent en parallèle.
    private var canvasZoomPinchRecognizer: ThreeFingerPinchGestureRecognizer!

    // MARK: - Drawing mode (Phase 3 Task 3.4)

    /// PencilKit drawing surface. Non-nil iff `isDrawingMode == true`.
    private var drawingCanvas: PKCanvasView?

    public private(set) var isDrawingMode: Bool = false

    /// Latest drawing data captured from `drawingCanvas`. The composer VC reads
    /// this on toggle-off and persists it into `slide.effects.drawingData`.
    public var currentDrawingData: Data? {
        drawingCanvas?.drawing.dataRepresentation()
    }

    /// Item currently being dragged/scaled/rotated. Reset on .ended/.cancelled.
    private var manipulatedItemId: String?
    private var dragStartSlideX: Double = 0
    private var dragStartSlideY: Double = 0
    private var baseScale: Double = 1.0
    private var baseRotation: Double = 0.0

    /// Cache the id of the background media (resolved in `slide.didSet`).
    /// Used by handlers to skip foreground-only behaviors (snap guides,
    /// bring-to-front) and by `updateManipulatedItemLayer` to route the
    /// live CALayer transform towards `backgroundLayer` instead of looking
    /// for the layer in `itemsContainer` (where the bg never lives).
    ///
    /// Unification BG/FG (2026-05-29) : depuis le refactor, le bg media
    /// utilise les MÊMES fonctions de gesture que les items foreground
    /// (`updateScale`/`updatePosition`/`updateRotation` mutent
    /// `mediaObjects[bg]`). La seule différence est le routing de l'apply
    /// CALayer live qui passe par `backgroundLayer.applyContentTransform`.
    private var backgroundMediaObjectId: String?

    /// Fires when the background transform is committed (currently only by
    /// the double-tap fit mode cycle, which is bg-specific). Parent composer
    /// uses this to mirror the value into its viewModel cache.
    public var onBackgroundTransformChanged: ((StoryBackgroundTransform) -> Void)?

    /// `true` quand le composer affiche son `DrawingOverlayView` (PKCanvasView
    /// SwiftUI overlay) au-dessus du canvas. Tant que `true`, le canvas ne
    /// rend PLUS le drawing persisté de `slide.effects.drawingData` —
    /// l'overlay live le remplace, sinon les 2 drawings se superposent
    /// (l'ancien à la mauvaise position en design space + le nouveau en
    /// bounds space → bug "écrit en double" reporté 2026-05-27). Le composer
    /// toggle ce flag en miroir de `viewModel.isDrawingActive`. Force un
    /// rebuild pour ré-render (suppression / re-apparition du drawingLayer).
    public var isDrawingOverlayActive: Bool = false {
        didSet {
            guard oldValue != isDrawingOverlayActive else { return }
            slideContentRevision &+= 1
            rebuildLayers()
        }
    }

    /// `true` quand un gesture pan/pinch/rotate est en cours sur un item.
    /// Indique au parent SwiftUI (`StoryCanvasRepresentable.updateUIView`) que
    /// la vérité de `slide` est temporairement dans UIKit ; les mutations
    /// parent doivent être différées jusqu'à la fin du geste pour éviter
    /// scintillement et conflits de réécriture.
    public var isGestureActive: Bool { manipulatedItemId != nil }

    /// Couche active courante. Recalculée à chaque `slide.didSet` via
    /// `updateManipulationLayer()`. Le routage des gestes pan/pinch/rotate
    /// se fait à partir de cette valeur. Voir `CanvasManipulationLayer`.
    public private(set) var currentManipulationLayer: CanvasManipulationLayer = .canvas

    /// Notifié lorsque la couche active change (transition `.canvas` ↔
    /// `.background` ↔ `.foreground`). Le composer peut s'abonner pour
    /// mettre à jour l'indicateur visuel (chip row) et / ou bloquer des
    /// commandes inadéquates pour la couche courante.
    public var onManipulationLayerChanged: ((CanvasManipulationLayer) -> Void)?

    /// Notifié pendant un pinch à 3 doigts (zoom du viewport). Le composer
    /// SwiftUI s'y abonne pour piloter `canvasScale` + l'overlay éphémère
    /// `viewportPinchDelta` sans avoir besoin d'un `MagnificationGesture`
    /// SwiftUI parallèle (qui réagissait à un pinch 2-doigts sur un
    /// élément). Le `scale` est cumulatif depuis `.began` ; le composer
    /// applique son propre clamp + commit à `.ended`.
    public var onCanvasZoomScaleChanged: ((CGFloat, UIGestureRecognizer.State) -> Void)?

    // MARK: - Audio

    /// Sample-accurate foreground+background audio engine for mode `.play`.
    private let audioMixer = ReaderAudioMixer()
    /// Reflects the current mute state driven by `setReaderContext` or
    /// `.storyComposerMuteCanvas` / `.storyComposerUnmuteCanvas` notifications.
    public private(set) var isAudioMuted: Bool = false
    /// `slideContentRevision` the `audioMixer` was last configured against.
    /// Lets `reconfigureAudioForPlayback()` skip the (expensive) AVAudioFile
    /// reload when the slide content hasn't changed — `rebuildLayers()` runs
    /// every display-link tick in `.play` mode, but the audio model only
    /// changes when `slide` itself is reassigned.
    private var lastAudioConfigRevision: UInt64?

    /// `true` while this view holds a balanced `.playback` claim on the shared
    /// `MediaSessionCoordinator` (RC4.3). Keeps request/release symmetric.
    /// `nonisolated(unsafe)` so the `nonisolated deinit` can read it to decide
    /// whether to release the session — all mutations happen in MainActor
    /// playback methods, so single-context mutation is preserved.
    private nonisolated(unsafe) var didRequestPlaybackSession: Bool = false

    /// Subscription to `MediaSessionCoordinator.events` — pauses the mixer on
    /// interruptions / headset unplug and resumes it on an explicit
    /// shouldResume while the viewer is still foreground (RC4.3 / T7).
    /// `nonisolated(unsafe)` so the `nonisolated deinit` can cancel it without
    /// a MainActor hop — `AnyCancellable.cancel()` is idempotent and the
    /// property is only assigned once, from a MainActor init path.
    private nonisolated(unsafe) var audioSessionEventsCancellable: AnyCancellable?

    /// Souscription au `$muted` du `StoryReaderAudioMuteRegistry` partagé. Le
    /// chip foreground du reader pousse sur la registry ; on diff l'ensemble
    /// publié contre `lastAppliedMutedSet` pour n'appeler `setMute(_:for:)`
    /// que pour les pistes qui ont effectivement changé d'état.
    private nonisolated(unsafe) var muteRegistryCancellable: AnyCancellable?
    private var lastAppliedMutedSet: Set<String> = []

    /// KVO tokens watching foreground video readiness so `onContentReady`
    /// does not fire while a foreground clip is still a black rectangle (T6).
    private var foregroundVideoStatusObservers: [NSKeyValueObservation] = []

    /// Failsafe timeout for the foreground-video readiness gate. The background
    /// already owns a 2 s failsafe (`pendingVideoReadinessTask`) so a stuck
    /// background can never freeze the slide — but the foreground gate had
    /// none, so a foreground clip whose `AVPlayerItem.status` hangs on
    /// `.unknown` (slow / stalled network, never reaching `.readyToPlay` NOR
    /// `.failed`) held `contentReadyFired` false forever → the looping
    /// background video was never activated and the playhead stayed frozen
    /// ("le fond vidéo ne démarre jamais / se fige quand il y a une vidéo
    /// foreground", user 2026-06-23). Armed once by `observePendingForegroundVideos`,
    /// cancelled in `teardownReadinessObservers`.
    private var foregroundVideoReadinessFailsafe: Task<Void, Never>?

    /// Set by `foregroundVideoReadinessFailsafe` when the foreground gate has
    /// waited past its window. Lets `fireContentReadyIfNeeded()` proceed even
    /// though a foreground clip is still `.unknown` — the clip remains a
    /// timeline component that appears once its bytes land. Reset on every
    /// `scheduleContentReadyEvaluation` (new slide / rebuild).
    private var foregroundReadinessTimedOut: Bool = false

    // MARK: - Display link

    /// Drives `currentTime` advance during `.play` mode (preferred 60 Hz, range 60–120).
    // `nonisolated(unsafe)` : invalidé par le `nonisolated deinit` (backstop
    // pour un canvas qui reçoit `setMode` mais n'entre jamais en window —
    // willMove/didMove ne couvrent pas ce chemin). Le link cible un
    // `WeakDisplayLinkTarget`, donc le deinit est atteignable.
    private nonisolated(unsafe) var displayLink: CADisplayLink?

    /// Always-on while in `.edit` and the view is in a window — preferred 120 Hz on
    /// ProMotion devices for buttery gesture transforms (active rendering happens
    /// inside the gesture handlers; this link's tick is a no-op for now and exists
    /// so the display server keeps the high-rate clock running while editing).
    private nonisolated(unsafe) var editDisplayLink: CADisplayLink?

    // MARK: - Inline text editing

    /// Champ d'édition en place, sous-vue du canvas. Non-nil pendant l'édition.
    var inlineEditor: StoryInlineTextEditor?
    /// Id du texte en cours d'édition en place (nil hors édition).
    public internal(set) var inlineEditingTextId: String?
    /// Notifié à chaque frappe : (textId, nouvelle chaîne).
    public var onInlineTextChanged: ((String, String) -> Void)?
    /// Notifié quand l'édition se termine (textId).
    public var onInlineTextEditEnded: ((String) -> Void)?

    /// Notifié lors d'un tap sur le fond (zone vide) du canvas.
    public var onBackgroundTapped: (() -> Void)?

    // MARK: - Active canvas registry (canvas-wide preemption)

    /// Faible-ref registry de toutes les instances actuellement en `.play`
    /// **dans tout le process**. Mutée uniquement depuis `MainActor`. Sert à
    /// préempter (pause bg/FG/audio mixer) les anciennes instances dès qu'une
    /// nouvelle entre en `.play`.
    ///
    /// Pourquoi un registry SDK et non `PlaybackCoordinator` ?
    /// `PlaybackCoordinator.willStartPlaying(external:)` mutex uniquement les
    /// `StoppablePlayer` enregistrés (typiquement les `audioMixer`). Il ignore
    /// les `AVPlayer` bg/FG attachés au canvas. SwiftUI peut maintenir deux
    /// canvases en window pendant 1-2 frames lors d'un swap `.id(story.id)`
    /// (~16-33 ms), assez pour que les pistes audio des vidéos bg se
    /// chevauchent audiblement quand on enchaîne back→forward sur des slides
    /// vidéo. Ce registry coordonne le **canvas entier**.
    ///
    /// NSHashTable.weakObjects() s'auto-nettoie quand les canvases sont
    /// désalloués — aucune cleanup explicite requise au `deinit` (sauf le
    /// removeAll que ferait NSHashTable spontanément).
    @MainActor private static let activePlayingCanvases = NSHashTable<StoryCanvasUIView>.weakObjects()

    /// Pause tout le média actif sur ce canvas — bg AVPlayer + FG AVPlayer +
    /// audio mixer — sans changer le `mode`. Utilisé par la préemption
    /// canvas-wide pour qu'un canvas évincé n'émette plus rien jusqu'à ce que
    /// SwiftUI le détruise officiellement (willMove(toWindow: nil)).
    ///
    /// Note : on ne touche pas au displayLink ni à `isPlaybackPaused` —
    /// l'instance est en fin de vie côté SwiftUI, son cleanup viendra. On
    /// coupe juste les sources sonores et visuelles immédiatement.
    fileprivate func preemptMediaPlayback() {
        backgroundLayer.isPlaybackActive = false
        foregroundVideosPlaybackActive = false
        audioMixer.stop()
    }

    /// Enregistre `self` comme canvas actif et préempte tous les autres
    /// canvases en `.play` (sauf self). Appelé à chaque entrée en mode `.play`
    /// (init avec mode `.play`, ou `setMode(.play)`).
    @MainActor private func registerAsActiveAndPreemptOthers() {
        let others = Self.activePlayingCanvases.allObjects.filter { $0 !== self }
        for other in others {
            other.preemptMediaPlayback()
            Self.activePlayingCanvases.remove(other)
        }
        Self.activePlayingCanvases.add(self)
    }

    /// Retire `self` du registry actif. Appelé à chaque sortie de `.play` :
    /// `setMode(.edit)`, `willMove(toWindow: nil)`, et lors du deinit (via
    /// la `weakObjects` table — auto-cleanup en théorie, mais on le fait
    /// explicitement quand on sait que le canvas quitte la window).
    @MainActor private func unregisterFromActive() {
        Self.activePlayingCanvases.remove(self)
    }

    // MARK: - Init

    public init(slide: StorySlide, mode: RenderMode = .edit) {
        self.slide = slide
        self.mode = mode
        self.backgroundMediaObjectId = slide.effects.mediaObjects?
            .first(where: { $0.isBackground })?.id
        super.init(frame: .zero)
        layer.addSublayer(rootLayer)
        rootLayer.insertSublayer(backgroundLayer, at: 0)
        rootLayer.addSublayer(itemsContainer)
        rootLayer.addSublayer(editOverlayLayer)
        editOverlayLayer.zPosition = 10_000  // always on top
        // `.clear` au lieu de `.black` : pendant les transitions (1st mount,
        // drop d'un élément foreground qui déclenche `slide.didSet → rebuildLayers`,
        // lancement preview / viewer avec un canvas fraîchement instancié)
        // UIKit composite le view AVANT que `backgroundLayer` ait son contenu
        // dessiné. Avec un fond noir, ces transitions flashent ~16ms de noir
        // perçu comme un scintillement. Avec `.clear`, on voit le parent
        // (typiquement le fond du composer / viewer, déjà du contenu utile)
        // pendant cette latence. Le fond cinema des stories est porté par
        // `backgroundLayer` (image / video / couleur de slide), pas par
        // cette view.
        backgroundColor = .clear
        isOpaque = false
        // Rounded-card clipping (when `canvasCornerRadius > 0`) uses a continuous
        // (squircle) curve to match the SwiftUI `RoundedRectangle(style: .continuous)`.
        layer.cornerCurve = .continuous
        setupGesturesAll()
        observeAppLifecycle()
        observeMuteNotifications()
        observeStoryPlayerNotifications()
        // Attach différé du player vidéo de fond (cache froid : l'URL distante
        // est résolue/téléchargée par une Task async, le player n'existe pas
        // encore quand `scheduleContentReadyEvaluation` tourne). Ré-arme
        // l'observation de readiness à l'attach, sans fenêtre de temps —
        // c'est le seul pont fiable entre « download terminé » et
        // `contentReadyFired` (bug user 2026-06-11 : story vidéo figée sur
        // thumbnail, progression sans frames ni audio).
        backgroundLayer.onPlayerAttached = { [weak self] in
            guard let self, !self.contentReadyFired else { return }
            guard case .video = self.backgroundLayer.kind else { return }
            guard self.backgroundLayer.avPlayer != nil else { return }
            // `currentItem` volontairement optionnel : un AVQueuePlayer
            // loopé l'expose nil quelques runloops après l'attach.
            self.armBackgroundVideoReadinessObservation(item: self.backgroundLayer.avPlayer?.currentItem)
        }
        // Single-owner audio registry: registering the reader mixer lets a
        // second reader surface (viewer + composer preview mounted together)
        // stop this engine before starting its own (RC4.6).
        PlaybackCoordinator.shared.registerExternal(audioMixer)
        // Canvas-wide preemption : si on entre en `.play`, on coupe TOUS les
        // canvases déjà en `.play` (bg AVPlayer + FG AVPlayer + audio mixer).
        // Doit arriver AVANT `backgroundLayer.isPlaybackActive = true` plus
        // bas, sinon le bg AVPlayer de self démarre AVANT que les autres
        // canvases soient coupés → leur audio bleed pendant la fenêtre de
        // teardown SwiftUI (~16-33 ms entre body re-render et
        // removeFromSuperview du canvas évincé). User report 2026-05-28 :
        // « quand je reviens à une story arrière avec vidéo de fond puis
        // repars à la story suivante, j'ai les deux médias qui jouent en
        // même temps ».
        if mode == .play {
            registerAsActiveAndPreemptOthers()
        }
        observeAudioSessionEvents()
        // Calcul initial de la couche active à partir du contenu initial.
        // `slide.didSet` ne se déclenche pas dans l'init donc on appelle
        // explicitement (silencieux : pas de callback car la valeur n'a pas
        // « changé » depuis sa valeur par défaut `.canvas`).
        updateManipulationLayer()
        // Alignement initial du gate de lecture du background vidéo sur le
        // mode du canvas. Sans cette ligne, un canvas créé directement en
        // `.play` (cas du viewer via `StoryReaderRepresentable`) n'active
        // jamais `isPlaybackActive` (pas de transition de mode) et la vidéo
        // de fond reste figée même quand l'utilisateur la regarde. Pour
        // les canvas en `.edit` (prefetcher, composer preview), on reste
        // sur `false` — la vidéo est attachée silencieuse, prête à jouer
        // dès la promotion au mode `.play`.
        backgroundLayer.isPlaybackActive = (mode == .play)
        // Démarre le `CADisplayLink` quand le canvas est créé directement
        // en `.play` (StoryReaderRepresentable.makeUIView). Sans ça, le
        // displayLink n'est créé que via `setMode(.play)` — qui n'est
        // appelé QU'AU SLIDE-CHANGE (identityChanged). Pour la première
        // story ouverte (canvas frais en .play, pas de transition), le
        // displayLink restait inexistant → `displayLinkTick` jamais appelé
        // → `currentTime` n'avançait pas → `onPlaybackTime` jamais émis
        // → progress bar du viewer gelée à 0 % même quand la vidéo BG
        // jouait en boucle (video bg piloté par `isPlaybackActive`,
        // indépendant du displayLink). Bug user-reporté 2026-05-27 :
        // « la vidéo joue en boucle mais la progress bar n'avance pas ».
        if mode == .play {
            // ALL-STOP préventif des autres mixers externes AVANT que le
            // displayLink + setReaderContext de ce canvas démarrent leur
            // audio. Empêche l'audio du slide précédent de jouer pendant
            // la fenêtre `oldCanvas.deinit` → deferred Task → unregister
            // (qui peut prendre plusieurs runloop ticks). Bug
            // user-reporté 2026-05-27 « des audios de slide précédent
            // jouent dans les autres slide ». Le `willStartPlaying(external:)`
            // itère tous les externals enregistrés et les stop sauf
            // celui passé en argument.
            PlaybackCoordinator.shared.willStartPlaying(external: audioMixer)
            startPlayback()
        }
    }

    nonisolated deinit {
        NotificationCenter.default.removeObserver(self)
        audioSessionEventsCancellable?.cancel()
        displayLink?.invalidate()
        editDisplayLink?.invalidate()
        // `shutdown()` is @MainActor-isolated and deinit is nonisolated —
        // capture the mixer and defer the call to the main actor so it
        // outlives this view's deallocation.
        let mixer = audioMixer
        let releaseSession = didRequestPlaybackSession
        Task { @MainActor in
            PlaybackCoordinator.shared.unregisterExternal(mixer)
            mixer.shutdown()
            if releaseSession {
                await MediaSessionCoordinator.shared.release()
            }
        }
    }

    @available(*, unavailable)
    public required init?(coder: NSCoder) {
        fatalError("StoryCanvasUIView does not support NSCoder")
    }

    public override var isAccessibilityElement: Bool {
        get { false }
        set {}
    }

    public override var accessibilityElements: [Any]? {
        get { synthesizedAccessibilityElements() }
        set {}
    }

    private func synthesizedAccessibilityElements() -> [Any]? {
        switch mode {
        case .edit:
            return editAccessibilityElements()
        case .play:
            return playAccessibilityElements()
        }
    }

    private func editAccessibilityElements() -> [UIAccessibilityElement] {
        var elements: [UIAccessibilityElement] = []
        for txt in slide.effects.textObjects {
            elements.append(makeAccessibilityElement(
                label: "Texte : \(txt.text)",
                traits: .staticText,
                id: txt.id,
                allowCustomActions: true
            ))
        }
        for media in slide.effects.mediaObjects ?? [] {
            elements.append(makeAccessibilityElement(
                label: media.kind == .video ? "Vidéo" : "Image",
                traits: .image,
                id: media.id,
                allowCustomActions: true
            ))
        }
        for sticker in slide.effects.stickerObjects ?? [] {
            elements.append(makeAccessibilityElement(
                label: "Sticker \(sticker.emoji)",
                traits: .image,
                id: sticker.id,
                allowCustomActions: true
            ))
        }
        return elements
    }

    /// Builds VoiceOver elements for `.play` (reader) mode.
    ///
    /// Prisme Linguistique : `StoryTextObject.resolvedText(preferredLanguages:)`
    /// is used so the spoken label matches the language the user sees
    /// (`systemLanguage` > `regionalLanguage` > `customDestinationLanguage`).
    /// Background media is announced explicitly ("Photo de fond" / "Vidéo de fond")
    /// because it covers the full canvas and would otherwise be invisible
    /// to VoiceOver. Custom destructive actions (delete/duplicate/back) are
    /// suppressed in `.play` — they only make sense while composing.
    private func playAccessibilityElements() -> [UIAccessibilityElement] {
        let languages = readerContext.preferredLanguages
        var elements: [UIAccessibilityElement] = []
        for media in slide.effects.mediaObjects ?? [] where media.isBackground {
            elements.append(makeAccessibilityElement(
                label: media.kind == .video ? "Vidéo de fond" : "Photo de fond",
                traits: .image,
                id: media.id,
                allowCustomActions: false
            ))
        }
        for txt in slide.effects.textObjects {
            let resolved = txt.resolvedText(preferredLanguages: languages)
            elements.append(makeAccessibilityElement(
                label: resolved,
                traits: .staticText,
                id: txt.id,
                allowCustomActions: false
            ))
        }
        for media in slide.effects.mediaObjects ?? [] where !media.isBackground {
            elements.append(makeAccessibilityElement(
                label: media.kind == .video ? "Vidéo" : "Image",
                traits: .image,
                id: media.id,
                allowCustomActions: false
            ))
        }
        for sticker in slide.effects.stickerObjects ?? [] {
            elements.append(makeAccessibilityElement(
                label: stickerAccessibilityLabel(for: sticker),
                traits: .image,
                id: sticker.id,
                allowCustomActions: false
            ))
        }
        return elements
    }

    private func makeAccessibilityElement(label: String,
                                          traits: UIAccessibilityTraits,
                                          id: String,
                                          allowCustomActions: Bool) -> UIAccessibilityElement {
        let el = UIAccessibilityElement(accessibilityContainer: self)
        el.accessibilityLabel = label
        el.accessibilityTraits = traits
        el.accessibilityFrameInContainerSpace = accessibilityFrame(forId: id)
        if allowCustomActions {
            el.accessibilityCustomActions = makeCustomActions(forId: id)
        }
        return el
    }

    /// Returns the frame the accessibility element should occupy, in this
    /// view's container space.
    ///
    /// Strategy:
    /// 1. Prefer the live `CALayer` frame on `itemsContainer` (set by the
    ///    renderer during `rebuildLayers()`). This is the most accurate frame
    ///    once layers exist.
    /// 2. Fall back to projecting the design-space position of the item
    ///    through `CanvasGeometry.render(_:)` when no layer is present yet
    ///    (e.g. when VoiceOver queries before the first layout pass).
    /// 3. Default to `.zero` when the item id is unknown.
    private func accessibilityFrame(forId id: String) -> CGRect {
        if let layerFrame = itemsContainer.sublayers?.first(where: { $0.name == id })?.frame,
           layerFrame != .zero {
            return layerFrame
        }
        return projectedDesignFrame(forId: id) ?? .zero
    }

    /// Returns a coarse render-space frame computed from the item's normalised
    /// (0–1) position via `CanvasGeometry.render(_:)`. Used as a fallback when
    /// the CALayer hasn't been built yet so VoiceOver focus is still located
    /// roughly where the item will appear.
    private func projectedDesignFrame(forId id: String) -> CGRect? {
        let g = geometry
        guard g.renderSize.width > 0 else { return nil }
        if let t = slide.effects.textObjects.first(where: { $0.id == id }) {
            let designSize = CGSize(
                width: CGFloat(t.fontSize) * CGFloat(max(t.scale, 0.1)) * 6,
                height: CGFloat(t.fontSize) * CGFloat(max(t.scale, 0.1)) * 1.4
            )
            return centeredFrame(normalizedX: CGFloat(t.x),
                                 normalizedY: CGFloat(t.y),
                                 designSize: designSize,
                                 geometry: g)
        }
        if let m = slide.effects.mediaObjects?.first(where: { $0.id == id }) {
            if m.isBackground {
                return CGRect(origin: .zero, size: g.renderSize)
            }
            let side: CGFloat = 540
            let designSize = CGSize(width: side * CGFloat(m.scale),
                                    height: side * CGFloat(m.scale) / CGFloat(max(m.aspectRatio, 0.01)))
            return centeredFrame(normalizedX: CGFloat(m.x),
                                 normalizedY: CGFloat(m.y),
                                 designSize: designSize,
                                 geometry: g)
        }
        if let s = slide.effects.stickerObjects?.first(where: { $0.id == id }) {
            let side = CGFloat(s.baseSize) * CGFloat(max(s.scale, 0.1))
            return centeredFrame(normalizedX: CGFloat(s.x),
                                 normalizedY: CGFloat(s.y),
                                 designSize: CGSize(width: side, height: side),
                                 geometry: g)
        }
        return nil
    }

    private func centeredFrame(normalizedX nx: CGFloat,
                               normalizedY ny: CGFloat,
                               designSize: CGSize,
                               geometry g: CanvasGeometry) -> CGRect {
        let designCenter = g.designPoint(forNormalized: CGPoint(x: nx, y: ny))
        let designOrigin = CGPoint(x: designCenter.x - designSize.width / 2,
                                   y: designCenter.y - designSize.height / 2)
        let renderOrigin = g.render(designOrigin)
        let renderSize = g.render(designSize)
        return CGRect(origin: renderOrigin, size: renderSize)
    }

    /// Heuristic VoiceOver label for a sticker.
    ///
    /// `StorySticker.emoji` may be either a literal emoji glyph or, for
    /// custom-image stickers, an asset identifier. We use the Unicode
    /// "Name" property to provide a localized name when present (e.g. "🔥"
    /// → "Fire"); otherwise we fall back to "Sticker".
    private func stickerAccessibilityLabel(for sticker: StorySticker) -> String {
        let emoji = sticker.emoji
        if !emoji.isEmpty,
           let scalar = emoji.unicodeScalars.first,
           let name = scalar.properties.nameAlias ?? scalar.properties.name,
           !name.isEmpty {
            return "Sticker \(name.capitalized)"
        }
        return "Sticker"
    }

    private func makeCustomActions(forId id: String) -> [UIAccessibilityCustomAction] {
        [
            UIAccessibilityCustomAction(name: "Supprimer") { [weak self] _ in
                self?.deleteItem(id: id)
                return true
            },
            UIAccessibilityCustomAction(name: "Dupliquer") { [weak self] _ in
                self?.duplicateItem(id: id)
                return true
            },
            UIAccessibilityCustomAction(name: "Mettre à l'arrière") { [weak self] _ in
                self?.sendToBack(id: id)
                return true
            },
        ]
    }

    // MARK: - Layout

    public override func layoutSubviews() {
        super.layoutSubviews()
        // Wrap les assignations de frame des sublayers : sans
        // `CATransaction.setDisableActions(true)`, un parent qui anime un
        // resize / reposition (présentation modale, rotation, transition de
        // mode `.edit` → `.play`) anime IMPLICITEMENT la position des
        // sublayers, ce qui révèle 1-2 frames du fond pendant l'interpolation
        // et flashe à l'écran. `rebuildLayers()` a son propre wrapper interne
        // mais ce dernier ne protège pas l'assignation du frame ci-dessous.
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        rootLayer.frame = bounds
        itemsContainer.frame = bounds
        editOverlayLayer.frame = bounds
        CATransaction.commit()
        rebuildLayers()
    }

    /// `CanvasGeometry` derived from the current bounds. Tests, `StoryRenderer`,
    /// gestures and `StoryAVCompositor` all consume this as the single source
    /// of design→render projection.
    public var geometry: CanvasGeometry {
        CanvasGeometry(renderSize: bounds.size)
    }

    // MARK: - Mode switching

    /// Enables or disables PencilKit drawing on top of the canvas. While drawing
    /// is enabled, item gestures (pan/pinch/rotation) are suspended so PKCanvasView
    /// can capture every touch. The composer VC is responsible for reading
    /// `currentDrawingData` on toggle-off and writing it into the slide model.
    /// Re-enabling the mode restores the previous strokes from
    /// `slide.effects.drawingData`.
    public func setDrawingMode(_ enabled: Bool, tool: PKTool? = nil) {
        guard isDrawingMode != enabled else { return }
        isDrawingMode = enabled

        panRecognizer.isEnabled = !enabled
        pinchRecognizer.isEnabled = !enabled
        rotationRecognizer.isEnabled = !enabled

        if enabled {
            let canvas = PKCanvasView(frame: bounds)
            canvas.drawingPolicy = .anyInput
            canvas.tool = tool ?? PKInkingTool(.pen, color: .systemPink, width: 4)
            canvas.backgroundColor = .clear
            canvas.isOpaque = false
            canvas.translatesAutoresizingMaskIntoConstraints = false
            // Restore prior strokes if any so re-entering drawing mode picks
            // up where the user left off.
            if let data = slide.effects.drawingData,
               let drawing = try? PKDrawing(data: data) {
                canvas.drawing = drawing
            }
            addSubview(canvas)
            NSLayoutConstraint.activate([
                canvas.topAnchor.constraint(equalTo: topAnchor),
                canvas.leadingAnchor.constraint(equalTo: leadingAnchor),
                canvas.trailingAnchor.constraint(equalTo: trailingAnchor),
                canvas.bottomAnchor.constraint(equalTo: bottomAnchor),
            ])
            drawingCanvas = canvas
        } else {
            drawingCanvas?.removeFromSuperview()
            drawingCanvas = nil
        }
    }

    /// Injects runtime params for mode `.play` reader playback (Prisme Linguistique,
    /// mute state, completion callback). Idempotent — safe to call from `updateUIView`.
    public func setReaderContext(_ context: StoryReaderContext) {
        readerContext = context
        isAudioMuted = context.mute
        audioMixer.setMute(context.mute)
        // Propagation immédiate aux video media layers : `rebuildLayers()` qui
        // suit peut recréer des layers, mais celles qui survivent (cache LRU
        // live) doivent voir leur AVPlayer.isMuted basculer maintenant. Les
        // nouvelles layers consommeront `isMuted` via leur propre
        // `attachPlayer()` au moment du re-stamping.
        forEachMediaLayer { $0.isMuted = context.mute }
        backgroundLayer.isMuted = context.mute
        rebuildLayers()
        // The context carries `postMediaURLResolver` / `preferredLanguages`,
        // both inputs to audio URL resolution. A context swap (e.g. `.empty`
        // placeholder → real resolver) must force a mixer reload, so drop the
        // revision gate and reconfigure when already playing.
        if mode == .play {
            lastAudioConfigRevision = nil
            reconfigureAudioForPlayback()
            startAudioPlayback()
        }
    }

    /// Force le re-stamping des bitmap layers en invalidant le
    /// `StoryRendererCache`. Appelé EXCLUSIVEMENT par
    /// `StoryComposerCanvasView` quand `loadedImagesVersion` bump (édition
    /// d'image) — sans ce bump, les layers du cache stampent l'ancien
    /// bitmap (cache keyé par révision). Le reader N'APPELLE PAS cette
    /// méthode : sa playback (progress bar, video bg) s'appuie sur la
    /// stabilité de la révision entre setReaderContext et startAudio, donc
    /// bumper ici cassait la progress bar (régression 2026-05-27 reportée
    /// par le user — « progress bar ne progresse même plus du tout »).
    public func invalidateImageCache() {
        slideContentRevision &+= 1
        // Dedicated token for composer image-cache invalidation (an in-place image
        // edit bumped `loadedImagesVersion`). Passed to `backgroundLayer.configure`
        // as `contentVersion` so the background re-stamps the edited bitmap under
        // the same media id. Distinct from `slideContentRevision` (which bumps on
        // every edit incl. text keystrokes) to avoid needless bg re-fetches.
        composerImageRevision &+= 1
        rebuildLayers()
    }

    public func setMode(_ newMode: RenderMode, time: CMTime = .zero) {
        let wasPlay = mode == .play
        let didChange = mode != newMode
        mode = newMode
        currentTime = time
        if newMode == .play {
            completionFired = false
        }
        // Flush du cache CALayer à chaque transition de mode : en `.edit`
        // les mutations modèle ne sont pas toutes capturées par le fingerprint
        // signature ; en repartant en `.play` on doit reconstruire from scratch
        // pour ne pas servir un layer obsolète.
        if didChange { rendererCache.invalidate() }
        rebuildLayers()
        // Apply slide opening animation when transitioning edit→play at t=0.
        // Runs after rebuildLayers() so the layer tree is fresh.
        if newMode == .play && !wasPlay {
            StoryRenderer.applyOpening(slide.effects.opening,
                                       rootLayer: rootLayer,
                                       elapsed: time.seconds)
        }
        if didChange {
            switch newMode {
            case .play:
                // Préemption canvas-wide : on coupe les autres canvases en
                // `.play` AVANT de démarrer notre propre playback. Évite la
                // double-lecture pendant le swap visible↔outgoing du
                // cross-fade quand SwiftUI tarde à détruire l'ancien canvas.
                registerAsActiveAndPreemptOthers()
                stopEditDisplayLink()
                startPlayback()
                reconfigureAudioForPlayback()
                startAudioPlayback()
            case .edit:
                unregisterFromActive()
                stopPlayback()
                audioMixer.pause()
                releasePlaybackSessionIfNeeded()
                startEditDisplayLinkIfNeeded()
            }
        }
    }

    // MARK: - Reader audio transport (Sprint 4)

    /// Stable identifier for the current slide content + language resolution.
    /// Drives `ReaderAudioMixer`'s idempotence guard: a re-render replays with
    /// the same key (no echo) while a genuine content change re-schedules
    /// against a fresh key (RC4.6).
    private var currentSlideKey: String {
        let langs = readerContext.preferredLanguages.joined(separator: ",")
        return "\(slide.id)#\(slideContentRevision)#\(langs)"
    }

    /// Materialises the slide's `t = 0` as a host-time. When the playhead is
    /// already advanced (`currentTime > 0`, composer preview scrub) the origin
    /// is back-dated so audio and the canvas playhead share one zero (RC4.4).
    private func captureSlideTimelineOrigin() -> UInt64 {
        let now = mach_absolute_time()
        let elapsed = currentTime.seconds
        guard elapsed > 0, elapsed.isFinite else { return now }
        let back = ReaderAudioMixer.hostTime(forDelaySeconds: elapsed)
        return back < now ? now - back : now
    }

    /// Single funnel for the three `.play` audio entry points (`slide.didSet`,
    /// `setReaderContext`, `setMode(.play)`). Captures the timeline origin,
    /// activates the audio session, enforces single-owner exclusion and applies
    /// the default fade envelope — consistently every time.
    private func startAudioPlayback() {
        guard mode == .play else { return }
        // Call-safety gate (WS3.2) : ouvrir un reader pendant un appel ne doit
        // PAS faire tourner l'AVAudioEngine du reader sur la session détenue par
        // l'appel. La reprise post-appel est déclenchée par l'événement
        // `MediaSessionCoordinator.callEndedShouldResume` (F3) — émis sur le front
        // descendant de `setCallActive`, car le teardown WebRTC/RTCAudioSession
        // in-process NE poste PAS de façon fiable une fin d'interruption système.
        // Cet événement est géré dans `observeAudioSessionEvents` ci-dessous, qui
        // rappelle `startAudioPlayback()`. Miroir du gate composer
        // (StoryTimelineEngine).
        guard !MediaSessionCoordinator.shared.isCallActive else { return }
        // Off-screen / host-pause gate (RF3) : le funnel audio est ré-entré de
        // façon asynchrone (`reconfigureAudioForPlayback` Task, `fireContentReady
        // IfNeeded`) APRÈS le chargement média. Si l'hôte a posé `setPaused(true)`
        // entre-temps (slide scrollée hors-écran en PostDetail, ou appel actif),
        // ces ré-entrées ne doivent PAS rallumer le mixer sous une slide gelée —
        // sinon l'audio fuit hors-écran. Le détail repost passe désormais en
        // `mute: false`, donc ce gate central (et non plus le backstop `mute`) est
        // l'unique garant. La reprise repasse par `setStoryPlaybackPaused(false)`
        // qui remet `isPlaybackPaused = false` AVANT de rappeler cette méthode.
        guard !isPlaybackPaused else { return }
        // Gate "all media loaded": ne pas démarrer l'audio bg tant que les
        // autres médias chargeables (image bg + foreground videos) ne sont
        // pas prêts. `fireContentReadyIfNeeded()` consomme le drapeau dès que
        // `onContentReady` fire et appelle à nouveau cette méthode.
        if !contentReadyFired {
            pendingBackgroundActivation = true
            return
        }
        requestPlaybackSessionIfNeeded()
        let origin = captureSlideTimelineOrigin()
        // Stop any other reader engine before starting this one (RC4.6).
        PlaybackCoordinator.shared.willStartPlaying(external: audioMixer)
        do {
            _ = try audioMixer.play(originHost: origin,
                                    slideKey: currentSlideKey)
            // Default fade envelope retiré 2026-05-27 — user feedback
            // « il y a encore des fade out et in dans le jeu des audio ».
            // Le mixer respecte uniquement les fadeIn/fadeOut explicites
            // posés par l'auteur via le composer (cf. `scheduleFades` pour
            // foreground, `scheduleExplicitBackgroundFades` pour bg). Plus
            // d'enveloppe automatique 30%→100%→5% — le son joue à volume
            // plein dès le début et jusqu'au changement de slide.
        } catch {
            os.Logger(subsystem: "me.meeshy.app", category: "media")
                .error("ReaderAudioMixer.play failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Activates the shared `.playback` `AVAudioSession` through the existing
    /// `MediaSessionCoordinator` (RC4.3). Refcounted; the boolean keeps this
    /// view's request/release at exactly one claim.
    private func requestPlaybackSessionIfNeeded() {
        guard !didRequestPlaybackSession else { return }
        didRequestPlaybackSession = true
        Task { try? await MediaSessionCoordinator.shared.request(role: .playback) }
    }

    /// Balances `requestPlaybackSessionIfNeeded()`.
    private func releasePlaybackSessionIfNeeded() {
        guard didRequestPlaybackSession else { return }
        didRequestPlaybackSession = false
        Task { await MediaSessionCoordinator.shared.release() }
    }

    /// Subscribes to `MediaSessionCoordinator` interruption / route-change
    /// events and applies Apple's playback policy to the reader engine: pause
    /// on interruption-began and on headset unplug, resume only on an explicit
    /// `shouldResume` while still foreground (RC4.3 / T7).
    private func observeAudioSessionEvents() {
        audioSessionEventsCancellable = MediaSessionCoordinator.shared.events
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                switch event {
                case .interruptionBegan, .routeChangedOldDeviceUnavailable:
                    self.audioMixer.pause()
                case .interruptionEndedShouldResume, .callEndedShouldResume:
                    // `.callEndedShouldResume` (F3) : un appel VoIP vient de se
                    // terminer ; le teardown in-process ne poste pas de fin
                    // d'interruption système, donc l'audio du reader gaté à
                    // `startAudioPlayback` resterait muet jusqu'au prochain
                    // changement de slide. On le relance ici, mêmes gardes que la
                    // fin d'interruption.
                    // `!isPlaybackPaused` : si l'utilisateur était en pause
                    // (long-press latch / pause UI) au moment de
                    // l'interruption, la fin d'interruption ne doit PAS
                    // relancer l'audio sous une slide visuellement gelée.
                    guard self.mode == .play,
                          self.window != nil,
                          !self.completionFired,
                          !self.isPlaybackPaused else { return }
                    self.startAudioPlayback()
                case .interruptionEndedShouldNotResume, .routeChangedOther:
                    break
                }
            }
    }

    /// Loads the slide's foreground + background audio clips into the
    /// `audioMixer` so the subsequent `startAudioPlayback()` actually emits
    /// sound. No-op outside `.play` mode (the composer never plays while
    /// editing) and skipped
    /// when the slide content hasn't changed since the last configure pass —
    /// `configure(audios:urls:)` tears down prior clips, so repeated calls are
    /// safe but reload AVAudioFiles, which we avoid on every display-link tick.
    ///
    /// URL resolution: `ReaderAudioMixer` keys the `urls` dict by the audio
    /// object's `id`, but `StoryReaderContext.postMediaURLResolver` maps a
    /// `postMediaId` → `URL`. We bridge the two here, dropping any clip whose
    /// `postMediaId` does not resolve.
    private func reconfigureAudioForPlayback() {
        guard mode == .play else { return }
        guard lastAudioConfigRevision != slideContentRevision else { return }
        lastAudioConfigRevision = slideContentRevision

        let effects = slide.effects
        let languages = readerContext.preferredLanguages
        let resolver = readerContext.postMediaURLResolver

        let foreground = effects.resolvedForegroundAudioPlayers
        let background = effects.resolvedBackgroundAudio
        let rawAudioCount = effects.audioPlayerObjects?.count ?? 0
        let legacyBgId = effects.backgroundAudioId ?? "nil"
        os.Logger.storyAudio.info(
            "reconfigureAudioForPlayback slide=\(self.slide.id, privacy: .public) rawAudios=\(rawAudioCount) resolvedFg=\(foreground.count) resolvedBg=\(background == nil ? 0 : 1) legacyBgId=\(legacyBgId, privacy: .public) langs=\(languages.joined(separator: ","), privacy: .public) resolverPresent=\(resolver != nil)"
        )

        // `AVAudioFile(forReading:)` only accepts `file://` URLs. The viewer
        // resolver typically hands us HTTPS URLs from `StoryItem.media` — we
        // must pre-cache them to disk before passing to the mixer or every
        // `configure` call fails with OSStatus 2003334207 ("not a file").
        // The pre-cache is async; we therefore fire-and-forget a Task and
        // call `startAudioPlayback()` from inside it once the configure has
        // populated `entries`. Direct callers of `reconfigureAudioForPlayback`
        // that also call `startAudioPlayback()` synchronously become no-ops
        // (entries=0 at that moment) — the in-Task call is what actually
        // schedules the buffers once the cache is warm.
        let slideId = slide.id
        Task { @MainActor [weak self] in
            guard let self else { return }
            var fgURLs: [String: URL] = [:]
            for audio in foreground {
                let mediaId = audio.resolvedPostMediaId(preferredLanguages: languages)
                guard let remoteURL = resolver?(mediaId) else {
                    os.Logger.storyAudio.error(
                        "FG audio URL not resolved audioId=\(audio.id, privacy: .public) postMediaId=\(mediaId, privacy: .public)"
                    )
                    continue
                }
                if let localURL = await Self.cachedAudioFileURL(remote: remoteURL) {
                    fgURLs[audio.id] = localURL
                    os.Logger.storyAudio.debug(
                        "FG audio cached audioId=\(audio.id, privacy: .public) localFile=\(localURL.lastPathComponent, privacy: .public)"
                    )
                } else {
                    os.Logger.storyAudio.error(
                        "FG audio cache failed audioId=\(audio.id, privacy: .public) remote=\(remoteURL.absoluteString, privacy: .public)"
                    )
                }
            }

            // Slide may have changed during await (user swiped). Bail if so —
            // a fresh `reconfigureAudioForPlayback` will run for the new slide.
            guard self.slide.id == slideId else { return }

            do {
                try self.audioMixer.configure(audios: foreground, urls: fgURLs)
            } catch {
                os.Logger.storyAudio.error(
                    "ReaderAudioMixer.configure failed: \(error.localizedDescription, privacy: .public)"
                )
            }

            // Background clip (at most one per slide).
            if let background {
                let mediaId = background.resolvedPostMediaId(preferredLanguages: languages)
                if let remoteURL = resolver?(mediaId) {
                    if let localURL = await Self.cachedAudioFileURL(remote: remoteURL) {
                        guard self.slide.id == slideId else { return }
                        os.Logger.storyAudio.debug(
                            "BG audio cached audioId=\(background.id, privacy: .public) localFile=\(localURL.lastPathComponent, privacy: .public)"
                        )
                        do {
                            try self.audioMixer.configureBackground(
                                audio: background,
                                url: localURL,
                                looping: background.loop ?? true
                            )
                        } catch {
                            os.Logger.storyAudio.error(
                                "ReaderAudioMixer.configureBackground failed audioId=\(background.id, privacy: .public): \(error.localizedDescription, privacy: .public)"
                            )
                        }
                    } else {
                        os.Logger.storyAudio.error(
                            "BG audio cache failed audioId=\(background.id, privacy: .public) remote=\(remoteURL.absoluteString, privacy: .public)"
                        )
                    }
                } else {
                    os.Logger.storyAudio.error(
                        "BG audio URL not resolved audioId=\(background.id, privacy: .public) postMediaId=\(mediaId, privacy: .public)"
                    )
                }
            }

            self.audioMixer.setMute(self.readerContext.mute)

            // The synchronous `startAudioPlayback()` call that follows
            // `reconfigureAudioForPlayback()` in `setMode(.play)` /
            // `setReaderContext` / `slide.didSet` hit the mixer when
            // `entries.count == 0`. Re-run it now that buffers are loaded.
            if self.mode == .play, self.slide.id == slideId {
                self.startAudioPlayback()
            }
        }
    }

    /// Returns a `file://` URL for `remote`, downloading and caching the bytes
    /// when the disk cache misses. Returns `nil` if every path fails — the
    /// caller logs the failure context.
    private nonisolated static func cachedAudioFileURL(remote: URL) async -> URL? {
        if remote.isFileURL { return remote }
        if let cached = CacheCoordinator.audioLocalFileURL(for: remote.absoluteString) {
            return cached
        }
        _ = try? await CacheCoordinator.shared.audio.data(for: remote.absoluteString)
        return CacheCoordinator.audioLocalFileURL(for: remote.absoluteString)
    }

    // MARK: - Rendering

    private func rebuildLayers() {
        guard bounds.size != .zero else { return }
        // CATransaction with disableActions avoids implicit fade animations on
        // every rebuild — important for a smooth ~60 Hz playback loop.
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }

        // Background layer
        let bgKind = StoryRenderer.renderBackground(slide: slide,
                                                    languages: readerContext.preferredLanguages)
        // BG transform : priorité à `mediaObjects[bg]` (source de vérité
        // unifiée avec les items FG depuis 2026-05-29). Fallback sur le
        // champ legacy `slide.effects.backgroundTransform.scale/offset/rotation`
        // pour les stories publiées AVANT l'unification (les valeurs y sont
        // gelées mais valides). `videoFitMode` reste toujours sur
        // `backgroundTransform` (n'est pas une coord géométrique).
        let bgTransform: BackgroundTransform = {
            let videoFitMode = slide.effects.backgroundTransform?.videoFitMode
            // Source unique : `mediaObjects[bg]` est TOUJOURS la source de
            // vérité dès qu'il existe — y compris quand toutes ses valeurs
            // sont aux défauts (scale=1.0, x=y=0.5, rotation=0). L'ancienne
            // garde de transition (scale != 1.0 || x != 0.5 || ...) basculait
            // sur `backgroundTransform` legacy quand le user dezoomait
            // exactement à 1.0, provoquant un saut visible entre les deux
            // sources si la legacy avait un scale différent (bug 2026-05-29).
            // `backgroundTransform` n'est utilisée qu'en pur fallback quand
            // `mediaObjects[bg]` n'existe pas (stories pré-unification).
            if let bg = slide.effects.mediaObjects?.first(where: { $0.isBackground }) {
                return BackgroundTransform(
                    scale: bg.scale,
                    offsetX: (bg.x - 0.5) * Double(geometry.renderSize.width),
                    offsetY: (bg.y - 0.5) * Double(geometry.renderSize.height),
                    rotation: bg.rotation,
                    videoFitMode: videoFitMode
                )
            }
            if let t = slide.effects.backgroundTransform {
                return BackgroundTransform(scale: Double(t.scale ?? 1),
                                           offsetX: Double(t.offsetX ?? 0),
                                           offsetY: Double(t.offsetY ?? 0),
                                           rotation: t.rotation ?? 0,
                                           videoFitMode: videoFitMode)
            }
            return BackgroundTransform(scale: 1, offsetX: 0, offsetY: 0,
                                       rotation: 0, videoFitMode: videoFitMode)
        }()
        backgroundLayer.frame = CGRect(origin: .zero, size: geometry.renderSize)
        // Letterbox fill : la couleur de fond de la slide n'habille les bandes QUE
        // s'il n'y a PAS de média de fond visuel. Avec un fond image/vidéo
        // (`bgKind.isVisualMedia`), aucune couleur — letterbox neutre (transparente)
        // → le fond coloré est supprimé dès qu'un visuel de fond existe (user
        // 2026-06-03, inverse la préférence 2026-05-28). En pratique le média
        // remplit le canvas (resizeAspectFill par défaut) ; la bande neutre ne
        // concerne que le mode fit explicite (double-tap auteur).
        let letterboxColor: UIColor? = {
            guard !bgKind.isVisualMedia, let hex = slide.effects.background else { return nil }
            return Self.parseBackgroundHex(hex)
        }()
        backgroundLayer.configure(
            kind: bgKind,
            transform: bgTransform,
            geometry: geometry,
            resolver: readerContext.postMediaURLResolver,
            imageCache: readerContext.imageCache,
            letterboxColor: letterboxColor,
            // Slide-level thumbHash flows through so `.solidColor` and
            // `.gradient` cases can stamp the preview ON TOP of the flat tint
            // (user spec 2026-05-28: thumbnail visible above color, not below).
            slidePreviewThumbHash: slide.effects.thumbHash,
            // Filter is BAKED into the background bitmap at stamp time (no overlay) —
            // renders identically in composer / preview / reader / published, and an
            // in-place image edit re-filters via `contentVersion` (2026-06-03 pivot).
            filter: slide.effects.filter.flatMap { StoryFilter(rawValue: $0) },
            filterIntensity: Float(slide.effects.filterIntensity ?? 1.0),
            contentVersion: composerImageRevision
        )

        // Items — détache les sublayers existants AVANT de les ré-attacher.
        // Les layers cachés (StoryRendererCache) restent retenus côté cache
        // et seront ré-attachés via `addSublayer` à la prochaine itération,
        // ce qui détache automatiquement du parent précédent (O(1)).
        itemsContainer.sublayers?.forEach { $0.removeFromSuperlayer() }

        // Drop the stale canvas backdrop captured during the previous tick,
        // then re-capture against the current slide state. The helper short-
        // circuits to a no-op when no glass-style text exists on the slide,
        // so this is essentially free for the common path.
        backdropCapture.invalidate()
        _ = backdropCapture.captureCanvasBackdrop(slide: slide,
                                                  geometry: geometry,
                                                  time: currentTime,
                                                  mode: mode,
                                                  languages: readerContext.preferredLanguages)

        // Cache CALayer : utilisé uniquement en `.play` où `displayLinkTick`
        // rebuild à 60 Hz sans mutation du modèle (seul `currentTime` avance).
        // En `.edit`, `rebuildLayers()` ne se déclenche que sur `slide.didSet`
        // — i.e. après mutation du modèle — et le fingerprint actuel
        // (position/scale/rotation/opacity/visible/languages/postMediaId/text/emoji)
        // ne capture pas toutes les mutations possibles (fontSize, textColor,
        // backgroundStyle, etc.). Passer `cache: nil` en `.edit` garantit
        // une frame correcte après n'importe quelle mutation.
        let cacheForRender: StoryRendererCache? = (mode == .play) ? rendererCache : nil
        if let cacheForRender {
            cacheForRender.invalidateIfNeeded(slideId: slide.id,
                                              languages: readerContext.preferredLanguages,
                                              mode: mode)
        }

        let rendered = StoryRenderer.render(slide: slide,
                                            into: geometry,
                                            at: currentTime,
                                            mode: mode,
                                            languages: readerContext.preferredLanguages,
                                            resolver: readerContext.postMediaURLResolver,
                                            imageCache: readerContext.imageCache,
                                            cache: cacheForRender,
                                            backdropProvider: { [weak backdropCapture] frame in
                                                backdropCapture?.cropRegion(frame)
                                            },
                                            suppressDrawingOverlay: isDrawingOverlayActive)
        for sub in rendered.sublayers ?? [] {
            itemsContainer.addSublayer(sub)
        }

        // Re-stamp l'état mute global sur les media layers fraîchement
        // (re-)attachées + sur le background layer. `StoryRenderer.renderItem`
        // et `StoryRenderer.renderBackground` n'ont pas accès à `isAudioMuted`
        // au moment de créer le layer ; sans cette passe, une vidéo (foreground
        // OU background) attachée après que l'utilisateur a tapé Mute en
        // sidebar jouerait son audio jusqu'au prochain toggle.
        // Re-stamp aussi l'intention de lecture foreground : une vidéo
        // foreground (re)créée pendant ce rebuild hérite de l'état « GO » courant
        // (`foregroundVideosPlaybackActive`) — elle ne démarre donc qu'en phase
        // avec la vidéo de fond + l'audio, jamais en avance dès l'attach.
        // `slidePlayheadSeconds` AVANT `isPlaybackActive` : si ce dernier flippe
        // true (didSet → calage timeline), le player se cale sur le playhead à
        // jour. Mis à jour à chaque rebuild (≈60 Hz en lecture) pour qu'un layer
        // qui attache/démarre tard rattrape la bonne position.
        let playheadSeconds = currentTime.seconds
        forEachMediaLayer {
            $0.slidePlayheadSeconds = playheadSeconds
            $0.isMuted = isAudioMuted
            $0.isPlaybackActive = foregroundVideosPlaybackActive
        }
        backgroundLayer.slidePlayheadSeconds = playheadSeconds
        backgroundLayer.isMuted = isAudioMuted

        // Prune le cache des layers dont l'id n'est plus présent dans la
        // slide (élément supprimé) — libère les AVPlayer associés.
        if let cacheForRender {
            var keepIds = Set<String>()
            slide.effects.textObjects.forEach { keepIds.insert($0.id) }
            (slide.effects.mediaObjects ?? []).forEach { keepIds.insert($0.id) }
            (slide.effects.stickerObjects ?? []).forEach { keepIds.insert($0.id) }
            cacheForRender.prune(keepIds: keepIds)
        }

        applyForegroundFrames()
        scheduleContentReadyEvaluation(for: bgKind)
        // Emit l'état initial de progression (généralement 0.0 hors color/gradient
        // qui passent immédiatement à backgroundContentReady=true via le path sync).
        recomputeContentProgress()
        reapplyInlineEditingIfNeeded()
        // Composer live preview : (re)démarre la lecture/boucle des vidéos en
        // `.edit` sur des layers fraîchement reconstruits. No-op hors composer.
        applyEditPlayback()
    }

    /// Trace un cadre autour des médias foreground (images / vidéos non-bg).
    /// Appliqué dans TOUS les modes — édition, preview ET viewer — car le cadre
    /// fait partie du rendu de la story, pas seulement une aide d'édition.
    ///
    /// Implémentation : on définit `borderWidth` / `borderColor` directement sur
    /// chaque sublayer (le `name` du layer == element id) plutôt qu'un overlay
    /// CAShapeLayer séparé. Ça suit les transformations / drag / pinch sans
    /// avoir besoin de re-synchroniser un layer supplémentaire à chaque tick.
    private func applyForegroundFrames() {
        // Les textes ne reçoivent PAS de cadre permanent : le contour
        // rectangulaire entoure inutilement la chaîne de caractères et alourdit
        // le rendu (le glyph dessine déjà sa propre forme). Seuls les médias
        // visuels foreground (images / vidéos) gardent un cadre.
        let fgMediaIds = Set((slide.effects.mediaObjects ?? []).filter { !$0.isBackground }.map { $0.id })
        let fgTextIds: Set<String> = []

        // Cadre blanc franc. Le média se détache toujours du fond (slide
        // sombre, photo, dégradé) avec un liseré blanc — c'est le rendu
        // attendu pour un média foreground, façon photo encadrée.
        let frameColor: CGColor = UIColor.white.cgColor

        for sub in itemsContainer.sublayers ?? [] {
            guard let name = sub.name else { continue }
            if fgMediaIds.contains(name) || fgTextIds.contains(name) {
                sub.borderColor = frameColor
                sub.borderWidth = 2
                // `cornerRadius` n'est PAS écrasé ici : `StoryMediaLayer`
                // l'a déjà posé sur ce même layer. Le border CALayer suit
                // automatiquement ce rayon — bordure et image partagent donc
                // l'arrondi exact. `borderWidth`/`borderColor` étant portés
                // par le `StoryMediaLayer`, ils héritent de son `transform`
                // (rotation) et de sa `position` : le cadre reste solidaire
                // des déplacements et rotations du média.
            }
        }
    }

    // MARK: - Content readiness (drives StoryReaderTimerController)

    /// Decides when the background media for the current slide is fully
    /// usable on screen and fires `onContentReady` exactly once per
    /// `rebuildLayers()` cycle. Behaviour per `Kind`:
    ///
    /// - `.solidColor`, `.gradient` : ready immediately (synchronous draw).
    ///   We post the callback through the next runloop tick to mirror the
    ///   async paths and keep the contract observable from a single test
    ///   `XCTestExpectation`.
    /// - `.image` : `StoryBackgroundLayer.configure(...)` writes a ThumbHash
    ///   placeholder synchronously, then `Task`-fetches the real bitmap and
    ///   reassigns `contentLayer.contents`. We KVO-observe that property and
    ///   fire when contents transitions from `nil`/`placeholder` to a real
    ///   `CGImage`. A nil ThumbHash + first contents arrival also counts.
    /// - `.video` : KVO `avPlayer.currentItem.status` and fire on
    ///   `.readyToPlay`. If the player is already ready at observation time
    ///   we fire on the next runloop tick.
    ///
    /// The observers are torn down on every entry so they cannot stack across
    /// slides (slide swipe in the reader rebuilds layers on every keyframe).
    private func scheduleContentReadyEvaluation(for kind: StoryBackgroundLayer.Kind) {
        contentReadyFired = false
        backgroundContentReady = false
        foregroundReadinessTimedOut = false
        teardownReadinessObservers()

        // Explicit `_` placeholders on the comma-combined cases — Swift 6.2
        // under iOS 26.5 SDK no longer accepts the bare `.solidColor, .gradient`
        // shorthand here (the Xcode Cloud build reports `error: switch must be
        // exhaustive` for this site, misattributed to StoryAVCompositor.swift
        // because of cross-file batch compilation). Pinning the arities makes
        // the pattern unambiguous: solidColor has 1 associated value, gradient
        // has 2 named (colors:, direction:).
        switch kind {
        case .solidColor(_), .gradient(_, _):
            // No async work — yield to the next runloop tick so the caller
            // can attach `onContentReady` after `rebuildLayers()` returns
            // (the prefetcher attaches the callback right after init).
            DispatchQueue.main.async { [weak self] in
                self?.backgroundDidBecomeReady()
            }
        case .image:
            // Fast-path warm hit : si le `StoryBackgroundLayer` a déjà stampé
            // une image FINALE (warm L1 cache hit synchrone), le KVO observer
            // ne firerait jamais — quand le NSCache renvoie la même instance
            // UIImage entre le warm-hit et le re-stamp async, `contents` ne
            // change pas d'identité de référence. On fire `backgroundDidBecomeReady()`
            // directement, sans installer l'observer. Régression introduite
            // par a60f636b5 (2026-05-20) — sans ce shortcut, le loader reste
            // à 0% indéfiniment sur les stories image dès que le cache est
            // warmed (prefetcher ou première vue).
            if backgroundLayer.hasFinalContentStamped {
                DispatchQueue.main.async { [weak self] in
                    self?.backgroundDidBecomeReady()
                }
                break
            }
            thumbHashPlaceholderRef = backgroundLayer.contentLayer?.contents.map { $0 as AnyObject }
            // If the real bytes already landed synchronously (warm L1 cache),
            // we still want to honor the contract: fire on the next runloop
            // tick when no observable transition is pending.
            if let layer = backgroundLayer.contentLayer {
                imageContentsObserver = layer.observe(\.contents, options: [.new]) { [weak self] _, change in
                    // Convert the new contents to a Sendable `ObjectIdentifier`
                    // inside the KVO callback. AnyObject is non-Sendable so we
                    // cannot ship it across the actor hop, but ObjectIdentifier
                    // (a UInt wrapper) is Sendable and gives us the reference-
                    // equality semantics we need to distinguish the ThumbHash
                    // placeholder from the real loaded CGImage.
                    let newAny: Any? = change.newValue.flatMap { $0 }
                    let snapshotID: ObjectIdentifier? = (newAny as AnyObject?).map { ObjectIdentifier($0) }
                    Task { @MainActor in
                        guard let self else { return }
                        guard let snapshotID else { return }
                        // Fire only once the new contents differ from the
                        // ThumbHash placeholder reference. A nil placeholder
                        // (no thumbHash on the slide) makes the first non-nil
                        // assignment the trigger.
                        let placeholderID = self.thumbHashPlaceholderRef.map { ObjectIdentifier($0) }
                        if let placeholderID, snapshotID == placeholderID { return }
                        self.backgroundDidBecomeReady()
                    }
                }
                // Failsafe timeout 2s — si le KVO `contents` n'a jamais fire
                // (image déjà stampée avant que l'observer ne soit attaché,
                // ou bug d'identité de référence sur le NSCache), on force
                // `backgroundDidBecomeReady` après 2s pour ne pas geler la
                // progress bar indéfiniment (bug user-reporté 2026-05-27
                // « progress bar ne progresse même plus du tout »).
                pendingVideoReadinessTask?.cancel()
                pendingVideoReadinessTask = Task { @MainActor [weak self] in
                    try? await Task.sleep(for: .seconds(2))
                    if Task.isCancelled { return }
                    guard let self else { return }
                    guard !self.contentReadyFired else { return }
                    self.backgroundDidBecomeReady()
                }
            } else {
                // Defensive — no contentLayer means the kind switch already
                // settled (e.g. solidColor path took precedence). Fire async
                // so the contract still observes a single trailing-edge tick.
                DispatchQueue.main.async { [weak self] in
                    self?.backgroundDidBecomeReady()
                }
            }
        case .video:
            storyMediaLog.debug("readiness eval kind=video hasPlayer=\(self.backgroundLayer.avPlayer != nil, privacy: .public) hasItem=\(self.backgroundLayer.avPlayer?.currentItem != nil, privacy: .public) mode=\(String(describing: self.mode), privacy: .public)")
            // Gate sur la PRÉSENCE DU PLAYER, pas de `currentItem` : un
            // `AVQueuePlayer` fraîchement attaché (fond loopé) a un
            // `currentItem` nil le temps que son `AVPlayerLooper` enqueue le
            // template — exiger l'item ici faisait rater l'armement et,
            // `displayLinkTick` étant gated sur `contentReadyFired`, plus
            // rien ne ré-évaluait jamais : slide gelée sur son thumbnail
            // (bug user 2026-06-11).
            if backgroundLayer.avPlayer != nil {
                armBackgroundVideoReadinessObservation(item: backgroundLayer.avPlayer?.currentItem)
            }
            // Path cache miss : `backgroundLayer.configure` a démarré une
            // `Task` async pour résoudre l'URL distante (download / cache
            // disk) et le player n'est pas encore créé. Aucun sondage ici :
            // `backgroundLayer.onPlayerAttached` (câblé dans l'init) ré-arme
            // l'observation dès que l'attach différé survient — quelle que
            // soit la durée du download. L'ancien sondage 30 × 50 ms
            // abandonnait silencieusement après 1,5 s : un download plus
            // lent laissait `contentReadyFired` à false pour toujours →
            // thumbnail figé, progression sans frames ni audio, son qui ne
            // démarrait qu'au retour foreground via le bypass
            // `handleDidBecomeActive` (bug user 2026-06-11).
        }
    }

    /// Arme l'observation de readiness du fond vidéo : première frame
    /// composée (`isReadyForDisplay`), repli KVO `.status` quand aucun
    /// `AVPlayerLayer` n'est exploitable, et failsafe 2 s (un KVO peut être
    /// attaché APRÈS la transition sur un item recyclé warm — bug
    /// user-reporté 2026-05-27 « progress bar reste à 0% »). Réutilisé par
    /// l'évaluation initiale (player déjà attaché) ET par l'attach différé
    /// (`onPlayerAttached`) — volontairement NON destructif : ne touche ni
    /// `contentReadyFired` ni `backgroundContentReady`, donc inoffensif si
    /// la readiness a déjà fire.
    private func armBackgroundVideoReadinessObservation(item: AVPlayerItem?) {
        storyMediaLog.debug("arm video readiness layerReady=\(self.backgroundLayer.avPlayerLayer?.isReadyForDisplay ?? false, privacy: .public) itemStatus=\(item?.status.rawValue ?? -1, privacy: .public)")
        // La progress bar ne doit démarrer que sur la PREMIÈRE FRAME
        // réellement à l'écran. `AVPlayerLayer.isReadyForDisplay`
        // (false→true une fois la frame décodée ET composée) est le seul
        // signal fiable : `isFileURL` ne prouve que la présence disque,
        // le decoder spinup (~50-150 ms, parfois bien plus sur un
        // fichier local lent/partiel) n'est PAS couvert — c'est ce qui
        // faisait avancer la progression sur le flou ThumbHash (bug
        // user-reporté 2026-06-09). Le ThumbHash reste visible pendant
        // le gap (UX inchangée), seul le timer attend la vraie frame.
        if waitBackgroundVideoFirstFrame() == false, let item {
            // Aucun `AVPlayerLayer` exploitable (cas rare) — repli sur le
            // KVO `.status` (métadonnées prêtes), ancien comportement.
            // `item` peut être nil (AVQueuePlayer dont le looper n'a pas
            // encore enqueué) — le failsafe 2 s ci-dessous couvre ce cas.
            videoStatusObserver = item.observe(\.status, options: [.new]) { [weak self] observed, _ in
                guard observed.status == .readyToPlay else { return }
                Task { @MainActor in
                    self?.backgroundDidBecomeReady()
                }
            }
        }
        pendingVideoReadinessTask?.cancel()
        pendingVideoReadinessTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(2))
            if Task.isCancelled { return }
            guard let self else { return }
            guard !self.contentReadyFired else { return }
            self.backgroundDidBecomeReady()
        }
    }

    /// Démarre la readiness du fond vidéo sur la PREMIÈRE FRAME réellement
    /// composée à l'écran (`AVPlayerLayer.isReadyForDisplay`), et NON sur la
    /// simple présence disque du fichier. Fire `backgroundDidBecomeReady()`
    /// quand la frame est prête (immédiatement si déjà composée — ré-attache
    /// warm). Retourne `false` si aucun `AVPlayerLayer` n'est disponible : le
    /// caller retombe alors sur un observer `AVPlayerItem.status`. Le token KVO
    /// est libéré par `teardownReadinessObservers()`.
    @discardableResult
    private func waitBackgroundVideoFirstFrame() -> Bool {
        guard let playerLayer = backgroundLayer.avPlayerLayer else { return false }
        if playerLayer.isReadyForDisplay {
            DispatchQueue.main.async { [weak self] in
                self?.backgroundDidBecomeReady()
            }
            return true
        }
        // `.initial` re-lit la valeur courante à l'enregistrement : protège
        // contre une transition false→true survenue entre le pré-check ci-dessus
        // et l'attache du KVO. Le `guard` interne rend l'appel synchrone no-op
        // tant que la frame n'est pas prête.
        videoFirstFrameObserver = playerLayer.observe(\.isReadyForDisplay, options: [.new, .initial]) { [weak self] layer, _ in
            guard layer.isReadyForDisplay else { return }
            Task { @MainActor in
                self?.backgroundDidBecomeReady()
            }
        }
        return true
    }

    /// Marks the slide background as visually settled. The combined readiness
    /// signal (`onContentReady`) still waits on foreground video — see
    /// `fireContentReadyIfNeeded()`.
    private func backgroundDidBecomeReady() {
        backgroundContentReady = true
        recomputeContentProgress()
        fireContentReadyIfNeeded()
    }

    private func fireContentReadyIfNeeded() {
        guard !contentReadyFired else { return }
        // The background must be settled first — a foreground video KVO ping
        // can otherwise call in before the background image bytes land.
        guard backgroundContentReady else {
            storyMediaLog.debug("contentReady held: background not settled")
            return
        }
        // T6 — the background may be settled, but if a foreground video clip is
        // still preparing the slide could be a black rectangle. Hold the signal
        // (and the progress timer) until at least one foreground video is
        // `.readyToPlay`; the KVO tokens re-trigger this method when it lands.
        //
        // CRITICAL — this gate applies ONLY when the background is NOT itself
        // visual media. With a background video/image the canvas is already
        // FILLED (the background fills it via resizeAspectFill), so there is no
        // black rectangle to hide: a slow / stalled foreground clip must NEVER
        // hold back the looping background video. Gating it here meant a
        // foreground clip on a slow network froze the background video — it
        // never started, never looped, and the playhead stayed frozen ("le fond
        // vidéo doit jouer en boucle même avec des vidéos en foreground", user
        // 2026-06-23). The foreground video is a timeline component: it appears
        // once its bytes land, like every other foreground element. The
        // `foregroundReadinessTimedOut` failsafe covers the remaining
        // colour/gradient-background case so it can never hang forever either.
        if !backgroundLayer.kind.isVisualMedia {
            guard foregroundVideosReady() || foregroundReadinessTimedOut else {
                storyMediaLog.debug("contentReady held: foreground video(s) not ready")
                observePendingForegroundVideos()
                return
            }
        }
        storyMediaLog.debug("contentReady FIRED mode=\(String(describing: self.mode), privacy: .public) pendingActivation=\(self.pendingBackgroundActivation, privacy: .public)")
        contentReadyFired = true
        onContentReady?()
        // Consume pending background activation: vidéo bg ET audio bg
        // démarrent ensemble une fois tous les médias chargés. Réutilise les
        // entry points canoniques pour ne pas dupliquer la session/setup
        // logic.
        if pendingBackgroundActivation {
            pendingBackgroundActivation = false
            if mode == .play {
                // Cale les players sur le playhead courant AVANT de lever les
                // gates : au GO `currentTime` vaut ~0 (slide fraîche) mais peut
                // être > 0 sur une ouverture à position (cover dismiss). Garantit
                // que `alignToTimelineThenPlay()` voie la bonne cible.
                pushSlidePlayheadToLayers()
                backgroundLayer.isPlaybackActive = true
                // « GO » synchronisé : la vidéo de fond, les vidéos foreground
                // et le mixer audio démarrent ensemble une fois tous les médias
                // chargeables prêts. `foregroundVideosPlaybackActive` lève le
                // gate des `StoryMediaLayer` (démarre celles déjà attachées et
                // autorise celles qui attacheront plus tard). Gardé sur
                // `window != nil` comme `handleDidBecomeActive` : un canvas
                // `.play` retenu hors écran (préemption / cross-fade sortant) ne
                // doit pas relancer ses foreground players.
                if window != nil {
                    // F7 — DELIBERATE double-cover. Setting
                    // `foregroundVideosPlaybackActive = true` raises each layer's
                    // `isPlaybackActive`, whose didSet aligns+plays layers attached
                    // BEFORE GO. The `forEachMediaLayer { startAlignedIfActive() }`
                    // second pass then also starts layers that attach AFTER GO; for
                    // already-aligned layers it is a NO-OP (the didSet idempotency
                    // guard skips them, and `alignToTimelineThenPlay`'s `play()` is
                    // a no-op when already playing + the seek only fires past the
                    // drift seuil). Both passes route through the single drift-aware
                    // path, replacing the raw `forEachAVPlayer { play() }` that
                    // bypassed timeline alignment (open-at-t>0 could flash frame 0).
                    foregroundVideosPlaybackActive = true
                    forEachMediaLayer { $0.startAlignedIfActive() }
                }
                startAudioPlayback()
            }
        }
        // Force `onContentProgress(1.0)` au moment où le signal binaire fire
        // afin que les listeners SwiftUI puissent fermer leur overlay même
        // si la slide n'a aucun foreground media (cas slide texte+bg).
        recomputeContentProgress()
    }

    /// Recalcule la fraction `[0, 1]` de contenu disponible localement et
    /// notifie via `onContentProgress`. Aggregé sur :
    /// - 1 point : background ready
    /// - N points : chaque foreground media (image=contents non nil, vidéo=AVPlayerItem.status != .unknown)
    private func recomputeContentProgress() {
        guard onContentProgress != nil else { return }
        let bg: Double = backgroundContentReady ? 1.0 : 0.0
        var fgReady: Double = 0
        var fgTotal: Double = 0
        for sub in itemsContainer.sublayers ?? [] {
            guard let media = sub as? StoryMediaLayer,
                  let model = media.media,
                  model.isBackground == false else { continue }
            fgTotal += 1
            switch model.kind {
            case .image:
                if media.contents != nil { fgReady += 1 }
            case .video:
                if let status = media.avPlayer?.currentItem?.status,
                   status != .unknown {
                    fgReady += 1
                }
            case .none:
                fgReady += 1  // unknown kind, ne bloque pas
            }
        }
        let total = 1.0 + fgTotal
        let ready = bg + fgReady
        let progress = total > 0 ? min(1.0, max(0.0, ready / total)) : 1.0
        onContentProgress?(progress)
    }

    /// `AVPlayerItem`s of every foreground video layer currently on the canvas.
    /// A foreground video whose URL never resolved has no `AVPlayer` and so
    /// never blocks the readiness signal.
    private func foregroundVideoItems() -> [AVPlayerItem] {
        var items: [AVPlayerItem] = []
        for sub in itemsContainer.sublayers ?? [] {
            if let media = sub as? StoryMediaLayer,
               let item = media.avPlayer?.currentItem {
                items.append(item)
            }
        }
        return items
    }

    /// Foreground videos are "ready" when there are none, or every one has
    /// *resolved* — `.readyToPlay` OR `.failed`. A broken / stuck clip
    /// (status `.failed`) must not freeze the slide timer forever, so it
    /// counts as resolved rather than blocking indefinitely.
    private func foregroundVideosReady() -> Bool {
        let items = foregroundVideoItems()
        guard !items.isEmpty else { return true }
        return items.allSatisfy { $0.status != .unknown }
    }

    private func observePendingForegroundVideos() {
        foregroundVideoStatusObservers.forEach { $0.invalidate() }
        foregroundVideoStatusObservers = []
        for item in foregroundVideoItems() where item.status == .unknown {
            let token = item.observe(\.status, options: [.new]) { [weak self] observed, _ in
                guard observed.status != .unknown else { return }
                Task { @MainActor in
                    self?.recomputeContentProgress()
                    self?.fireContentReadyIfNeeded()
                }
            }
            foregroundVideoStatusObservers.append(token)
        }
        // Arm the failsafe ONCE — a foreground clip stuck on `.unknown` (its
        // KVO never fires `.readyToPlay` nor `.failed`) would otherwise hold
        // `contentReadyFired` false forever. Mirrors the background's 2 s
        // `pendingVideoReadinessTask`. Guarded on `== nil` so the repeated
        // gate re-entries during loading don't restart the timer.
        guard foregroundVideoReadinessFailsafe == nil else { return }
        foregroundVideoReadinessFailsafe = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(2))
            if Task.isCancelled { return }
            guard let self, !self.contentReadyFired else { return }
            self.foregroundReadinessTimedOut = true
            self.fireContentReadyIfNeeded()
        }
    }

    private func teardownReadinessObservers() {
        imageContentsObserver?.invalidate()
        imageContentsObserver = nil
        videoStatusObserver?.invalidate()
        videoStatusObserver = nil
        videoFirstFrameObserver?.invalidate()
        videoFirstFrameObserver = nil
        pendingVideoReadinessTask?.cancel()
        pendingVideoReadinessTask = nil
        thumbHashPlaceholderRef = nil
        foregroundVideoStatusObservers.forEach { $0.invalidate() }
        foregroundVideoStatusObservers = []
        foregroundVideoReadinessFailsafe?.cancel()
        foregroundVideoReadinessFailsafe = nil
    }

    /// Test-only seam : forces the readiness signal as if the background
    /// media had finished loading. Lets unit tests exercise the timer-gating
    /// contract on `StoryReaderTimerController` without staging a real
    /// `URLSession` fetch or `AVPlayer` status transition.
    public func _forceContentReadyForTesting() {
        // Bypasses the foreground-video gate — this seam exists precisely to
        // force the signal without staging a real `AVPlayer` status transition.
        guard !contentReadyFired else { return }
        contentReadyFired = true
        onContentReady?()
    }

    /// Test-only seam : drives the REAL `fireContentReadyIfNeeded()` path with
    /// the background marked settled, so the foreground-video gating decision
    /// (skipped when the background is itself visual media) can be asserted
    /// deterministically without staging a real `AVPlayer` first-frame
    /// transition. Returns whether `onContentReady` fired as a result.
    @discardableResult
    public func _markBackgroundReadyForTesting() -> Bool {
        backgroundContentReady = true
        fireContentReadyIfNeeded()
        return contentReadyFired
    }

    /// Test-only seam : read-only access to the reader audio engine so the
    /// lifecycle tests can assert transport state (`isPlaying`) after a
    /// background / window-detach / interruption event without a fixture.
    public var _readerAudioMixerForTesting: ReaderAudioMixer { audioMixer }

    // MARK: - Window lifecycle

    public override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil {
            startEditDisplayLinkIfNeeded()
            // Ré-arme le link de lecture invalidé par `willMove(toWindow: nil)`
            // quand le canvas revient à l'écran sans repasser par `setMode`
            // (cover/sheet présenté au-dessus du viewer puis dismissé).
            if mode == .play, displayLink == nil {
                registerAsActiveAndPreemptOthers()
                startPlayback()
                if isPlaybackPaused {
                    // Le canvas était long-press pausé au détachement : on
                    // ré-arme l'horloge (sinon le resume `displayLink?.isPaused
                    // = false` tomberait sur nil → gel définitif) mais on
                    // préserve l'état pause — pas de vidéo/audio sous une
                    // slide visuellement gelée.
                    displayLink?.isPaused = true
                    backgroundLayer.isPlaybackActive = false
                    foregroundVideosPlaybackActive = false
                } else {
                    // Miroir de `setMode(.play)` : willMove a stoppé le mixer
                    // et rendu la session — sans cette restauration le slide
                    // rejouait en vidéo muette après le dismiss d'un cover.
                    reconfigureAudioForPlayback()
                    startAudioPlayback()
                }
            }
        } else {
            stopEditDisplayLink()
        }
    }

    public override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        // Stage Manager / Split View on iPad can change horizontal/vertical
        // size classes without bounds changing; force a rebuild defensively.
        rebuildLayers()
    }

    // MARK: - App lifecycle (UIScene-aware)

    private func observeAppLifecycle() {
        let nc = NotificationCenter.default
        nc.addObserver(self,
                       selector: #selector(handleWillResignActive),
                       name: UIApplication.willResignActiveNotification,
                       object: nil)
        nc.addObserver(self,
                       selector: #selector(handleDidBecomeActive),
                       name: UIApplication.didBecomeActiveNotification,
                       object: nil)
    }

    private func observeMuteNotifications() {
        let nc = NotificationCenter.default
        nc.addObserver(self,
                       selector: #selector(handleComposerMute),
                       name: .storyComposerMuteCanvas,
                       object: nil)
        nc.addObserver(self,
                       selector: #selector(handleComposerUnmute),
                       name: .storyComposerUnmuteCanvas,
                       object: nil)
        muteRegistryCancellable = StoryReaderAudioMuteRegistry.shared.$muted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] muted in
                self?.applyPerTrackMute(muted)
            }
    }

    /// Diff la nouvelle valeur du registry contre celle déjà appliquée et
    /// invoque `setMute(_:for:)` uniquement pour les ids qui ont basculé.
    /// Gating sur `.play` : en `.edit` la registry n'a pas de sens (le
    /// composer mute via son propre slider de volume).
    private func applyPerTrackMute(_ next: Set<String>) {
        guard mode == .play else { return }
        let toMute = next.subtracting(lastAppliedMutedSet)
        let toUnmute = lastAppliedMutedSet.subtracting(next)
        for id in toMute { audioMixer.setMute(true, for: id) }
        for id in toUnmute { audioMixer.setMute(false, for: id) }
        lastAppliedMutedSet = next
    }

    /// Listens to viewer-level pause/resume notifications (`.storyPlayerPause`
    /// / `.storyPlayerResume`) emitted when the user toggles the story with
    /// a long-press. The story progress-bar timer in `StoryViewerView` and
    /// this canvas form a single playback unit: pausing the timer pauses
    /// every media here (bg video, foreground videos, audio mixer, effect
    /// display-link), exactly like pausing a video player.
    private func observeStoryPlayerNotifications() {
        let nc = NotificationCenter.default
        nc.addObserver(self,
                       selector: #selector(handleStoryPlayerPause),
                       name: .storyPlayerPause,
                       object: nil)
        nc.addObserver(self,
                       selector: #selector(handleStoryPlayerResume),
                       name: .storyPlayerResume,
                       object: nil)
    }

    /// `true` while the story is paused via the viewer-level long-press
    /// toggle. Distinct from `isAudioMuted` (which controls volume only) —
    /// `isPlaybackPaused` freezes every clock-driven surface so the story
    /// stops as a unit (the « long-press = stop comme une vidéo »
    /// requirement).
    private var isPlaybackPaused: Bool = false

    @objc private func handleStoryPlayerPause() {
        setStoryPlaybackPaused(true)
    }

    @objc private func handleStoryPlayerResume() {
        setStoryPlaybackPaused(false)
    }

    /// Single entry point for the viewer-level pause/resume toggle. Pauses
    /// (or resumes) **every** media surface this canvas owns:
    /// - the background video (`backgroundLayer.isPlaybackActive`)
    /// - every foreground `AVPlayer` (`forEachAVPlayer`)
    /// - the foreground+background audio engine (`audioMixer.pause/play`)
    /// - the keyframe effects clock (`displayLink.isPaused`)
    ///
    /// **Soft pause** : on ne **détruit pas** le `CADisplayLink` ni les
    /// players — on les met juste en `isPaused = true` / pause. Cela
    /// évite un rebuild coûteux à chaque cycle pause/resume (1 frame de
    /// stutter mesurable au Time Profiler) et préserve les buffers audio
    /// déjà schedulés par `audioMixer`. La destruction reste réservée à
    /// `stopPlayback()` (changement de slide, dismiss du viewer).
    ///
    /// Idempotent — re-applying the same state est cheap (early-return).
    /// Gated on `.play` because pause has no meaning in edit / preview modes.
    /// Public seam pour le viewer parent : propage les pauses UI (sheets,
    /// composer, drag-to-dismiss, long-press) au canvas afin que la timeline
    /// canvas (displayLink + AVPlayer + audioMixer) gèle EN PHASE avec la
    /// progress bar du viewer. Sans ça, `lastPlaybackTime` continuait à
    /// avancer pendant qu'un sheet était ouvert → saut visible au resume.
    /// Idempotent — re-applying the same state est cheap (early-return dans
    /// `setStoryPlaybackPaused`).
    public func setPaused(_ paused: Bool) {
        setStoryPlaybackPaused(paused)
    }

    private func setStoryPlaybackPaused(_ paused: Bool) {
        guard mode == .play else { return }
        guard isPlaybackPaused != paused else { return }
        isPlaybackPaused = paused

        if paused {
            // Freeze every media clock — mais ON GARDE le displayLink et
            // les players vivants pour un resume instantané. Vidéo de fond ET
            // vidéos foreground gèlent ensemble via leur gate respectif.
            foregroundVideosPlaybackActive = false
            backgroundLayer.isPlaybackActive = false
            audioMixer.pause()
            displayLink?.isPaused = true
        } else {
            // Resume in place. Réveille le displayLink et les players
            // depuis leur dernière position — pas de re-init coûteuse. Fond,
            // foreground et audio repartent en phase. `pushSlidePlayheadToLayers`
            // rafraîchit la cible timeline ; comme le playhead n'a pas bougé
            // pendant la pause, la dérive est ~0 → aucun seek (pas de hoquet).
            displayLink?.isPaused = false
            pushSlidePlayheadToLayers()
            backgroundLayer.isPlaybackActive = true
            foregroundVideosPlaybackActive = true
            if window != nil, !completionFired {
                startAudioPlayback()
            }
        }
    }

    @objc private func handleComposerMute() {
        isAudioMuted = true
        audioMixer.setMute(true)
        forEachMediaLayer { $0.isMuted = true }
        backgroundLayer.isMuted = true
    }

    @objc private func handleComposerUnmute() {
        isAudioMuted = false
        audioMixer.setMute(false)
        forEachMediaLayer { $0.isMuted = false }
        backgroundLayer.isMuted = false
    }

    @objc private func handleWillResignActive() {
        // Pause transitoire SANS effacer l'intention `isPlaybackActive` —
        // symétrique au `backgroundLayer.handleAppLifecycle`. Le retour
        // foreground ne relancera que les vidéos que le canvas autorisait.
        forEachMediaLayer { $0.handleAppLifecycle(active: false) }
        backgroundLayer.handleAppLifecycle(active: false)
        // RC4.5 — cut the reader audio engine the moment the app leaves the
        // foreground so no sound leaks behind a backgrounded app. Releasing
        // the session lets other apps' audio un-duck.
        audioMixer.stop()
        releasePlaybackSessionIfNeeded()
    }

    @objc private func handleDidBecomeActive() {
        // `window != nil` est OBLIGATOIRE pour TOUTES les reprises, pas
        // seulement l'audio mixer : un canvas `.play` retenu hors écran
        // (viewer fermé mais instance vivante, canvas sortant de cross-fade)
        // reçoit aussi cette notification — sans le guard, ses AVPlayer
        // foreground + le fond vidéo rejouaient à la réouverture de l'app
        // alors qu'aucun viewer n'était visible (bug user 2026-06-11).
        guard mode == .play, window != nil else { return }
        // Reprise gated par layer : ne relance que les vidéos foreground dont
        // le canvas avait levé `isPlaybackActive` (slide à l'écran, non pausée),
        // en phase avec la reprise de la vidéo de fond.
        forEachMediaLayer { $0.handleAppLifecycle(active: true) }
        backgroundLayer.handleAppLifecycle(active: true)
        // Resume reader audio (re-acquires the session via startAudioPlayback)
        // only while the slide has not finished.
        if !completionFired {
            startAudioPlayback()
        }
    }

    /// RC4.5 — deterministic teardown when SwiftUI detaches the canvas view
    /// (viewer dismissed, slide swiped away) without waiting for ARC `deinit`.
    /// On coupe TOUTES les sources audio/vidéo (background video, foreground
    /// AVPlayers, audio mixer) pour éviter que les media de la slide quittée
    /// continuent à jouer pendant que SwiftUI monte la suivante. Bug user
    /// 2026-05-27 « les média semblent jouent en double ou s'entrevauche ».
    public override func willMove(toWindow newWindow: UIWindow?) {
        super.willMove(toWindow: newWindow)
        guard newWindow == nil else { return }
        unregisterFromActive()
        // RC5 — `stopPlayback()` (pas seulement la pause des médias) : le
        // CADisplayLink de lecture cible `self` et le RETIENT. Détaché de la
        // fenêtre sans invalidation (swipe-to-dismiss, slide swipée), la
        // chaîne run loop → link → canvas rendait le canvas entier immortel
        // (deinit inatteignable : layer tree, bitmaps, ReaderAudioMixer +
        // AVAudioEngine leakés à chaque fermeture). Ré-armé symétriquement
        // dans `didMoveToWindow` pour le cas re-attach sans `setMode`.
        stopPlayback()
        forEachAVPlayer { $0.pause() }
        audioMixer.stop()
        releasePlaybackSessionIfNeeded()
    }

    private func forEachAVPlayer(_ block: (AVPlayer) -> Void) {
        for sub in itemsContainer.sublayers ?? [] {
            if let media = sub as? StoryMediaLayer, let player = media.avPlayer {
                block(player)
            }
        }
    }

    /// Itère sur toutes les `StoryMediaLayer` du canvas (vidéos + images de
    /// fond), même celles dont l'`AVPlayer` n'est pas encore attaché. Utile
    /// pour propager un toggle de mute global : on stocke l'état sur la
    /// layer, qui le stampera sur le player dès `attachPlayer()` — ferme la
    /// fenêtre de course où un player fraîchement créé jouait audible le
    /// temps d'un cycle de display-link.
    private func forEachMediaLayer(_ block: (StoryMediaLayer) -> Void) {
        for sub in itemsContainer.sublayers ?? [] {
            if let media = sub as? StoryMediaLayer {
                block(media)
            }
        }
    }

    /// Pousse le playhead unifié courant (`currentTime`) sur la vidéo de fond et
    /// toutes les `StoryMediaLayer`, afin que `alignToTimelineThenPlay()` cale le
    /// player sur la bonne position au prochain démarrage. Appelé aux transitions
    /// de lecture (GO, resume) où aucun rebuild ne vient rafraîchir la valeur.
    private func pushSlidePlayheadToLayers() {
        let playheadSeconds = currentTime.seconds
        backgroundLayer.slidePlayheadSeconds = playheadSeconds
        forEachMediaLayer { $0.slidePlayheadSeconds = playheadSeconds }
    }

    /// Composer live preview : démarre (et fait boucler) la lecture des vidéos
    /// du canvas en mode `.edit` quand `playsVideoInEditMode` est levé. No-op en
    /// `.play` (le reader gère sa propre lecture) et quand le drapeau est bas
    /// (prefetcher hors-écran → reste silencieux). Idempotent : appelé à chaque
    /// `rebuildLayers()` (les layers `.edit` sont reconstruits à neuf à chaque
    /// mutation) et au flip du drapeau.
    private func applyEditPlayback() {
        guard mode == .edit, playsVideoInEditMode else { return }
        // Éditeur sonore (choix produit) : pose la session `.playback` pour que
        // l'audio des vidéos qui bouclent soit audible même silent-switch ON.
        // Idempotent / call-aware via la source unique.
        if AVAudioSession.sharedInstance().category != .playback {
            MediaSessionCoordinator.shared.activatePlaybackSync(options: [.mixWithOthers, .duckOthers])
        }
        // Fond : `isPlaybackActive` joue le player (qui boucle déjà via son
        // `AVPlayerLooper`). Audio inclus (choix produit : éditeur sonore).
        backgroundLayer.isPlaybackActive = true
        // Foreground : marque chaque layer pour qu'elle (re)joue — y compris
        // après un swap d'URL async (cache local résolu) — et démarre le
        // player déjà attaché. Le loop est armé par `attachPlayer` (loop en
        // `.edit`).
        forEachMediaLayer { layer in
            layer.playsInEditMode = true
            layer.avPlayer?.play()
        }
    }

    // MARK: - Playback (CADisplayLink)

    private func startPlayback() {
        stopPlayback()
        // Nouvelle session de lecture → on repart « progressant » (non gaté).
        // Couvre init(.play), setMode(.play) au slide-change, et le re-arm
        // `didMoveToWindow` (dismiss d'un cover). Le sondage du tick re-dérivera
        // l'état réel dès la première frame.
        resetPlaybackHealthState()
        // Proxy weak partagé : le link ne retient pas le canvas — un canvas
        // jamais fenêtré (setMode avant attach puis jeté) reste libérable.
        let link = WeakDisplayLinkTarget.makeLink { [weak self] link in
            guard let self else {
                link.invalidate()
                return
            }
            self.displayLinkTick(link)
        }
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 60)
        link.add(to: .main, forMode: .common)
        displayLink = link
        // Autorise (ou ré-autorise après pause) la lecture du player vidéo de
        // fond. `attachBackgroundPlayer` ne joue plus automatiquement —
        // l'autorisation passe désormais EXCLUSIVEMENT par ce drapeau, ce qui
        // garantit qu'un canvas en `.edit` mode (prefetcher, composer
        // preview) n'émet jamais d'audio même si son player est attaché et
        // prêt. Gate supplémentaire : tant que tous les médias chargeables
        // ne sont pas prêts (cf. `contentReadyFired`), la vidéo bg attend —
        // le user-spec exige que ni vidéo ni audio bg ne joue tant que la
        // slide n'est pas visuellement complète.
        if contentReadyFired {
            backgroundLayer.isPlaybackActive = true
            foregroundVideosPlaybackActive = true
        } else {
            pendingBackgroundActivation = true
        }
    }

    private func stopPlayback() {
        displayLink?.invalidate()
        displayLink = nil
        // Pause symétrique des players vidéo (fond + foreground). Une slide qui
        // sort du mode `.play` (changement de mode, dismiss du viewer, transition
        // vers prefetch off-screen) ne doit plus émettre ni vidéo ni audio.
        backgroundLayer.isPlaybackActive = false
        foregroundVideosPlaybackActive = false
    }

    @objc private func displayLinkTick(_ link: CADisplayLink) {
        guard mode == .play else { return }
        // Timeline unifiée : sonder la santé de lecture du média PRIMAIRE AVANT
        // d'avancer le playhead, afin de geler EN PHASE avec un buffer stall
        // (et de la reprendre dès que la vidéo rejoue). Le sondage tourne sur
        // le displayLink déjà actif (zéro observer KVO à gérer / fuir) et reste
        // un simple lecture d'enum + comparaisons — négligeable face au
        // `rebuildLayers()` 60 Hz qui suit. Le link continue de ticker pendant
        // un stall (seul `isPlaybackPaused` met le link en pause), donc ce
        // sondage détecte aussi la reprise alors que le playhead est gelé.
        refreshPlaybackHealth(now: link.timestamp)
        advancePlayheadIfActive(by: link.targetTimestamp - link.timestamp)
    }

    /// Avance le playhead canvas (`currentTime`) si la lecture est active.
    /// Gated sur :
    /// - mode == .play (l'edit a son propre `editDisplayLink`)
    /// - contentReadyFired (sans ça, currentTime avançait pendant le chargement
    ///   initial → progress bar du viewer sautait dès le content ready)
    /// - !isPlaybackPaused (pauses user/lifecycle propagées par le viewer via `setPaused`)
    /// - !isPlaybackStalled (buffer stall du média primaire — parité in-canvas
    ///   avec la progress bar du viewer ; sans ce gate les keyframes foreground
    ///   et le playhead audio dériveraient devant une vidéo de fond gelée)
    ///
    /// Si le gate échoue, on RETOURNE sans rebuild — les mutations modèle sont
    /// déjà capturées par `slide.didSet → rebuildLayers()` à l'écriture. L'ancien
    /// `rebuildLayers()` inconditionnel ici causait un scintillement (60
    /// rebuilds/s avant content ready). Bug user-reporté 2026-05-27 « la story
    /// scintille seulement ».
    private func advancePlayheadIfActive(by dt: Double) {
        guard mode == .play, contentReadyFired, !isPlaybackPaused, !isPlaybackStalled else {
            return
        }
        let nextSeconds = CMTimeGetSeconds(currentTime) + dt
        let effectiveDuration = slide.computedTotalDuration()
        let clamped = min(nextSeconds, effectiveDuration)
        currentTime = CMTime(seconds: clamped, preferredTimescale: 600_000)
        // Publie le playhead pour les overlays SwiftUI (chip audio foreground).
        // Préfère le clock audio réel du mixer (`slideElapsedSeconds`) quand une
        // slide est en lecture audio — même référentiel host-time que les
        // `AVAudioTime` qui schedulent les buffers, donc sample-accurate.
        // Fallback sur le `clamped` du displayLink pour les slides sans audio.
        let publishedTime = audioMixer.slideElapsedSeconds ?? clamped
        StoryReaderPlayheadState.shared.publish(min(publishedTime, effectiveDuration))
        // Source de vérité timeline pour la progress bar du viewer — on émet la
        // même valeur que celle du clamp (et non le `publishedTime`
        // audio-priorisé) pour rester cohérent avec le check
        // `clamped >= effectiveDuration` qui fire `onCompletion`.
        onPlaybackTime?(clamped)
        rebuildLayers()
        if clamped >= effectiveDuration {
            stopPlayback()
            if !completionFired {
                completionFired = true
                readerContext.onCompletion?()
            }
        }
    }

    // MARK: - Playback health (unified timeline)

    /// Watchdog : si la lecture du média primaire reste non-`.playing` en
    /// CONTINU pendant ce laps, on retombe sur l'horloge murale
    /// (progressing=true) pour qu'une story ne puisse JAMAIS rester gelée sur un
    /// flux mort/jamais-prêt. Stall-relatif (et non « 5 s après content-ready »)
    /// pour couvrir aussi le cas « la vidéo joue puis meurt » sans hard-stall.
    static let playbackStallWatchdogSeconds: CFTimeInterval = 5.0

    /// `true` quand le média primaire de la slide bufferise / est en pause
    /// inattendue. Gèle l'avance du playhead canvas (`advancePlayheadIfActive`)
    /// pour rester EN PHASE avec la progress bar du viewer.
    private(set) public var isPlaybackStalled: Bool = false

    /// Dernière valeur émise via `onPlaybackProgressing` — emit-on-change only.
    /// Démarre à `true` : une slide commence « progressante » (non gatée).
    private var lastProgressingEmitted: Bool = true

    /// Timestamp `CADisplayLink` du début du dernier épisode CONTINU de
    /// non-lecture. `nil` tant que la lecture est saine. Alimente le watchdog.
    private var playbackStallSince: CFTimeInterval?

    /// Le player média « primaire » de la slide qui pilote la timeline : vidéo
    /// de fond en priorité, sinon première vidéo foreground. `nil` pour une
    /// slide sans vidéo (image / couleur / audio-only) → jamais gatée.
    private func primaryMediaPlayer() -> AVPlayer? {
        if case .video = backgroundLayer.kind, let player = backgroundLayer.avPlayer {
            return player
        }
        for sub in itemsContainer.sublayers ?? [] {
            if let media = sub as? StoryMediaLayer,
               media.media?.isBackground == false,
               media.media?.kind == .video,
               let player = media.avPlayer {
                return player
            }
        }
        return nil
    }

    /// Production feed : sonde le player primaire à chaque tick (uniquement une
    /// fois le contenu prêt — avant ça la timeline est déjà gatée par
    /// content-ready et la vidéo bg n'a pas démarré).
    private func refreshPlaybackHealth(now: CFTimeInterval) {
        guard contentReadyFired else { return }
        let player = primaryMediaPlayer()
        applyPlaybackHealth(status: player?.timeControlStatus,
                            failed: player?.currentItem?.status == .failed,
                            now: now)
    }

    /// Cœur testable : timing du watchdog + mapping pur (`StoryPlaybackHealth`)
    /// + emit-on-change. Alimenté en prod par `refreshPlaybackHealth`, en test
    /// par `_refreshPlaybackHealthForTesting` (statut injecté).
    private func applyPlaybackHealth(status: AVPlayer.TimeControlStatus?,
                                     failed: Bool,
                                     now: CFTimeInterval) {
        // Le watchdog n'accumule QUE pendant une non-lecture réelle d'un média
        // gaté. `.playing`, absence de vidéo, pause user, et échec comptent comme
        // « sains » (reset) — l'échec retombe déjà sur l'horloge murale.
        let healthyForWatchdog = status == .playing || status == nil || isPlaybackPaused || failed
        if healthyForWatchdog {
            playbackStallSince = nil
        } else if playbackStallSince == nil {
            playbackStallSince = now
        }
        let watchdogExpired = playbackStallSince.map { now - $0 >= Self.playbackStallWatchdogSeconds } ?? false
        let progressing = StoryPlaybackHealth.isProgressing(
            status: status,
            isUserPaused: isPlaybackPaused,
            isFailed: failed,
            watchdogExpired: watchdogExpired
        )
        isPlaybackStalled = !progressing
        guard progressing != lastProgressingEmitted else { return }
        lastProgressingEmitted = progressing
        onPlaybackProgressing?(progressing)
    }

    /// Remet l'état de santé à « progressant » au démarrage d'une session de
    /// lecture (nouveau slide / re-attach). N'ÉMET PAS — `setCurrentSlide`/`reset`
    /// du timer côté viewer réinitialisent symétriquement leur propre `isPlaybackStalled`.
    private func resetPlaybackHealthState() {
        isPlaybackStalled = false
        lastProgressingEmitted = true
        playbackStallSince = nil
    }

    /// Test-only seam : drive the health core with an injected `timeControlStatus`
    /// (and `failed`) at an explicit `now` so the watchdog + emit-on-change +
    /// freeze contract is exercised without a live `AVPlayer` or `CADisplayLink`.
    public func _refreshPlaybackHealthForTesting(status: AVPlayer.TimeControlStatus?,
                                                 failed: Bool,
                                                 now: CFTimeInterval) {
        applyPlaybackHealth(status: status, failed: failed, now: now)
    }

    /// Test-only seam : run the gated playhead advance exactly as `displayLinkTick`
    /// does, so the `!isPlaybackStalled` freeze can be asserted deterministically.
    public func _advancePlayheadForTesting(by dt: Double) {
        advancePlayheadIfActive(by: dt)
    }

    /// Test-only seam: simulate a displayLink tick at a specific timestamp
    /// to validate completion logic without spinning a real CADisplayLink.
    /// Bypasses the `contentReadyFired` gate of `displayLinkTick` — tests
    /// drive the seam directly, so the gate isn't relevant for unit testing.
    /// Émet aussi `onPlaybackTime` pour parité avec le tick réel.
    public func simulateTickAt(seconds: Double) {
        let effectiveDuration = slide.computedTotalDuration()
        let clamped = min(seconds, effectiveDuration)
        currentTime = CMTime(seconds: clamped, preferredTimescale: 600_000)
        onPlaybackTime?(clamped)
        rebuildLayers()
        if !completionFired,
           mode == .play,
           currentTime.seconds >= effectiveDuration {
            completionFired = true
            readerContext.onCompletion?()
        }
    }


    // MARK: - ProMotion edit-mode link

    private func startEditDisplayLinkIfNeeded() {
        guard mode == .edit, editDisplayLink == nil else { return }
        let link = WeakDisplayLinkTarget.makeLink { [weak self] link in
            guard let self else {
                link.invalidate()
                return
            }
            self.editTick(link)
        }
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
        link.add(to: .main, forMode: .common)
        editDisplayLink = link
    }

    private func stopEditDisplayLink() {
        editDisplayLink?.invalidate()
        editDisplayLink = nil
    }

    private var lastEditBackdropTimestamp: CFTimeInterval = 0

    @objc private func editTick(_ link: CADisplayLink) {
        // Gesture handlers drive their own rebuilds; the tick keeps the 120 Hz
        // clock alive on ProMotion while editing AND (WS2.1) re-feeds the glass
        // text backdrop so it tracks a playing video background between rebuilds.
        refreshEditGlassBackdropIfNeeded(now: link.timestamp)
    }

    /// WS2.1 — keep glass-style text backdrops in sync with a PLAYING video
    /// background while editing. `rebuildLayers()` only re-captures the backdrop
    /// on a model mutation, so without this the glass blur froze on the video
    /// frame present at the last rebuild. Bounded to the narrow "glass text over
    /// a video bg, in edit" case: it no-ops for static (image/color) backgrounds
    /// (the backdrop can't change between rebuilds) and `captureCanvasBackdrop`
    /// itself short-circuits when the slide carries no glass text. Throttled to
    /// ~18 fps via `StoryEditBackdropThrottle` since the link runs up to 120 Hz.
    /// Reuses the exact capture path of `rebuildLayers` (same `geometry`,
    /// `currentTime`, languages) so the crop geometry can't drift.
    private func refreshEditGlassBackdropIfNeeded(now: CFTimeInterval) {
        guard mode == .edit, case .video = backgroundLayer.kind else { return }
        guard StoryEditBackdropThrottle.shouldEmit(now: now, last: lastEditBackdropTimestamp) else { return }
        lastEditBackdropTimestamp = now
        backdropCapture.invalidate()
        _ = backdropCapture.captureCanvasBackdrop(slide: slide,
                                                  geometry: geometry,
                                                  time: currentTime,
                                                  mode: mode,
                                                  languages: readerContext.preferredLanguages)
        // Re-feed the already-attached text layers in place — no rebuildLayers().
        // `setBackdropTexture` is a no-op on a non-glass text layer (its glass
        // backdrop sublayer is nil), so the filter is the crop work, which the
        // capture skips entirely when no glass text exists.
        itemsContainer.sublayers?.forEach { sub in
            guard let textLayer = sub as? StoryTextLayer else { return }
            textLayer.setBackdropTexture(backdropCapture.cropRegion(textLayer.frame))
        }
    }

    // MARK: - Gesture wiring

    private func setupGesturesAll() {
        panRecognizer = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
        pinchRecognizer = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch(_:)))
        rotationRecognizer = UIRotationGestureRecognizer(target: self, action: #selector(handleRotation(_:)))
        singleTapRecognizer = UITapGestureRecognizer(target: self, action: #selector(handleSingleTap(_:)))
        singleTapRecognizer.numberOfTapsRequired = 1
        doubleTapRecognizer = UITapGestureRecognizer(target: self, action: #selector(handleDoubleTap(_:)))
        doubleTapRecognizer.numberOfTapsRequired = 2
        // Le single-tap n'émet qu'après l'échec du double-tap pour éviter
        // qu'un double-tap déclenche deux fois le format panel (open puis
        // open-via-double). Pattern UIKit standard.
        singleTapRecognizer.require(toFail: doubleTapRecognizer)
        canvasZoomPinchRecognizer = ThreeFingerPinchGestureRecognizer(
            target: self,
            action: #selector(handleCanvasZoomPinch(_:))
        )
        for recognizer: UIGestureRecognizer in [panRecognizer, pinchRecognizer, rotationRecognizer, singleTapRecognizer, doubleTapRecognizer, canvasZoomPinchRecognizer] {
            recognizer.delegate = self
            addGestureRecognizer(recognizer)
        }
        addInteraction(UIPointerInteraction(delegate: self))
        addInteraction(UIContextMenuInteraction(delegate: self))
    }

    @objc private func handleSingleTap(_ recognizer: UITapGestureRecognizer) {
        guard mode == .edit, recognizer.state == .ended else { return }
        let location = recognizer.location(in: self)
        guard let id = hitTestItem(at: location), let kind = itemKind(forId: id) else {
            // Tap sur une zone vide du canvas pendant l'édition de texte en
            // place → sortie de l'édition (déclencheur nº2 de la spec). `endEditing`
            // résigne le `StoryInlineTextEditor`, ce qui déclenche
            // `textViewDidEndEditing` → `onInlineTextEditEnded`.
            if inlineEditingTextId != nil {
                endEditing(true)
            } else {
                onBackgroundTapped?()
            }
            return
        }
        // Sémantique tactile : le tap simple ramène l'élément touché au
        // premier plan (`bringForegroundToFront`) puis le sélectionne via
        // `onItemTapped`. Le double-tap reste réservé à l'édition dédiée
        // (cropper image / éditeur vidéo). `bringForegroundToFront` est un
        // no-op si l'élément est déjà au sommet ou si c'est un média de fond.
        bringForegroundToFront(id: id)
        onItemTapped?(id, kind)
    }

    @objc private func handleDoubleTap(_ recognizer: UITapGestureRecognizer) {
        guard mode == .edit, recognizer.state == .ended else { return }
        let location = recognizer.location(in: self)

        // Background double-tap → cycle videoFitMode (auto → fit → fill → auto).
        // Use `resolveManipulationTarget` to honour the active manipulation
        // layer (so a tap on the bg in `.background` layer triggers the cycle
        // even when no foreground item is hit). Foreground items still get
        // their dedicated double-tap handling below via `hitTestItem`.
        if let bgId = backgroundMediaObjectId,
           resolveManipulationTarget(at: location) == bgId,
           hitTestItem(at: location) == nil {
            let current = slide.effects.backgroundTransform?.videoFitMode
            let next: String?
            switch current {
            case nil:    next = "fit"
            case "fit":  next = "fill"
            case "fill": next = nil
            default:     next = nil
            }
            var updated = slide
            var bg = updated.effects.backgroundTransform ?? StoryBackgroundTransform()
            bg.videoFitMode = next
            updated.effects.backgroundTransform = bg.isIdentity ? nil : bg
            slide = updated
            onItemModified?(slide)
            onBackgroundTransformChanged?(bg)
            return
        }

        guard let id = hitTestItem(at: location), let kind = itemKind(forId: id) else { return }
        onItemDoubleTapped?(id, kind)
    }

    private func itemKind(forId id: String) -> CanvasItemKind? {
        if slide.effects.textObjects.contains(where: { $0.id == id }) { return .text }
        if (slide.effects.mediaObjects ?? []).contains(where: { $0.id == id }) { return .media }
        if (slide.effects.stickerObjects ?? []).contains(where: { $0.id == id }) { return .sticker }
        return nil
    }

    @objc private func handlePinch(_ recognizer: UIPinchGestureRecognizer) {
        guard mode == .edit else { return }
        // Garde-fou : ce recognizer est dédié au pinch 2 doigts (élément ou
        // fond). Si trois doigts sont posés, c'est le `canvasZoomPinch` qui
        // doit prendre la main — on annule pour éviter le double zoom
        // (élément ET viewport).
        if recognizer.numberOfTouches >= 3 {
            recognizer.state = .cancelled
            return
        }
        switch recognizer.state {
        case .began:
            // Routage par couche : `.canvas` absorbe (recognizer cancelled),
            // `.background` cible le bg media, `.foreground` hit-teste les fg
            // (avec fallback bg si le doigt ne touche aucun foreground).
            //
            // Unification BG ↔ FG (2026-05-29) : le bg media est dans
            // `mediaObjects[]` avec `isBackground: true`, donc `currentScale`
            // / `updateScale` fonctionnent déjà pour lui. On utilise donc
            // EXACTEMENT le même flow que les items foreground (mute
            // mediaObjects[bg].scale via updateScale, le mini-preview et le
            // reader voient le changement live via @Binding/slide.didSet,
            // updateManipulatedItemLayer route le bg vers backgroundLayer
            // pour le rendu live sur le canvas principal).
            guard let id = resolveManipulationTarget(at: recognizer.location(in: self)) else {
                recognizer.state = .cancelled
                return
            }
            manipulatedItemId = id
            baseScale = currentScale(forId: id) ?? 1.0
            if id != backgroundMediaObjectId {
                bringForegroundToFront(id: id)
            }
        case .changed:
            guard let id = manipulatedItemId else { return }
            let newScale = max(0.3, min(4.0, baseScale * Double(recognizer.scale)))
            slide = updateScale(slideId: id, scale: newScale)
            onItemModified?(slide)
        case .ended, .cancelled, .failed:
            manipulatedItemId = nil
            slideContentRevision &+= 1
            rebuildLayers()
        default:
            break
        }
    }

    /// Pinch à 3 doigts → relaie l'échelle au composer pour piloter le zoom
    /// du viewport. Ne mute pas la slide (le viewport est un état SwiftUI).
    @objc private func handleCanvasZoomPinch(_ recognizer: ThreeFingerPinchGestureRecognizer) {
        guard mode == .edit else { return }
        onCanvasZoomScaleChanged?(recognizer.scale, recognizer.state)
    }

    @objc private func handleRotation(_ recognizer: UIRotationGestureRecognizer) {
        guard mode == .edit else { return }
        switch recognizer.state {
        case .began:
            guard let id = resolveManipulationTarget(at: recognizer.location(in: self)) else {
                recognizer.state = .cancelled
                return
            }
            // Rotation interdite sur le background media — user feedback
            // 2026-05-27 « la rotation du media doit etre … bloqués sur les
            // background ». Les 2-doigts pour pan+pinch firent souvent une
            // rotation accidentelle non désirée sur le fond. Le foreground
            // reste rotable (intent explicite).
            if id == backgroundMediaObjectId {
                recognizer.state = .cancelled
                return
            }
            manipulatedItemId = id
            baseRotation = currentRotation(forId: id) ?? 0
            bringForegroundToFront(id: id)
        case .changed:
            guard let id = manipulatedItemId else { return }
            // Sensibilité rotation divisée par 2 — user feedback 2026-05-27 :
            // la rotation 1:1 (chaque degré de doigt = 1° sur l'élément) était
            // trop sensible et difficile à contrôler avec précision. Le user
            // peut quand même tourner à 360° en faisant 2 tours avec les
            // doigts, ce qui reste raisonnable pour un geste manuel.
            let degrees = (Double(recognizer.rotation) * 180 / .pi) * 0.5
            slide = updateRotation(slideId: id, rotation: baseRotation + degrees)
            onItemModified?(slide)
        case .ended, .cancelled, .failed:
            manipulatedItemId = nil
            slideContentRevision &+= 1
            rebuildLayers()
        default:
            break
        }
    }

    @objc private func handlePan(_ recognizer: UIPanGestureRecognizer) {
        guard mode == .edit else { return }
        let location = recognizer.location(in: self)
        switch recognizer.state {
        case .began:
            guard let id = resolveManipulationTarget(at: location),
                  let (sx, sy) = currentItemNormalizedPosition(forId: id) else {
                recognizer.state = .cancelled
                return
            }
            manipulatedItemId = id
            dragStartSlideX = sx
            dragStartSlideY = sy

            // Bring-to-front au touch : couvre tap simple ET début de drag.
            // Skip pour le background media (toujours derrière les fg) — le
            // helper filtre déjà mais on est explicite ici pour la lisibilité.
            if id != backgroundMediaObjectId {
                bringForegroundToFront(id: id)
            }
        case .changed:
            guard let id = manipulatedItemId, bounds.size != .zero else { return }
            let translation = recognizer.translation(in: self)
            // Projection écran → normalisé alignée sur la projection design→render
            // utilisée par `StoryRenderer.renderItem` (cf. `updateManipulatedItemLayer`).
            // - x reste linéaire sur la largeur du canvas
            // - y est mappé sur `1920 * scaleFactor` pour rester cohérent quand
            //   le canvas n'a pas un ratio exactement 9:16.
            let geo = CanvasGeometry(renderSize: bounds.size)
            let renderHeightFor1920 = geo.render(CanvasGeometry.designHeight)
            let dxNorm = Double(translation.x / bounds.width)
            let dyNorm = Double(translation.y / renderHeightFor1920)

            // Unification BG/FG (2026-05-29) : pour le bg, on ne snap pas
            // (le bg media n'a pas de "position" sémantique sur les rails
            // 0.18/0.25/0.5/0.75/0.82 — il est centré et se zoom/pan dans
            // ses propres bounds). updatePosition mute mediaObjects[bg].x/y
            // qui est lu par le converter bgTransform de rebuildLayers et
            // appliqué via applyContentTransform sur le contentLayer du bg.
            //
            // Sensibilité réduite (× 0.5) pour le pan BG : le geste s'applique
            // au repositionnement d'une image qui couvre déjà tout le canvas,
            // donc un déplacement 1:1 du doigt à la position normalisée est
            // trop sensible pour ajuster finement le cadrage (user feedback
            // 2026-05-29 : « avec une faible sensibilité »).
            if id == backgroundMediaObjectId {
                let rawX = clamp(dragStartSlideX + dxNorm * 0.5)
                let rawY = clamp(dragStartSlideY + dyNorm * 0.5)
                slide = updatePosition(slideId: id, x: rawX, y: rawY)
                onItemModified?(slide)
                return
            }

            let rawX = clamp(dragStartSlideX + dxNorm)
            let rawY = clamp(dragStartSlideY + dyNorm)
            let (snappedX, didSnapX) = snap(rawX)
            let (snappedY, didSnapY) = snap(rawY)
            updateSnapGuides(x: didSnapX ? snappedX : nil,
                             y: didSnapY ? snappedY : nil)
            slide = updatePosition(slideId: id, x: snappedX, y: snappedY)
            onItemModified?(slide)
        case .ended, .cancelled, .failed:
            manipulatedItemId = nil
            hideSnapGuides()
            slideContentRevision &+= 1
            rebuildLayers()
        default:
            break
        }
    }

    // MARK: - Snap guides

    private nonisolated static let snapTargets: [Double] = [0.18, 0.25, 0.5, 0.75, 0.82]
    private nonisolated static let snapTolerance: Double = 0.02

    private var snapGuideLayers: [CAShapeLayer] = []

    private nonisolated func snap(_ value: Double) -> (snapped: Double, didSnap: Bool) {
        for target in Self.snapTargets where abs(value - target) < Self.snapTolerance {
            return (target, true)
        }
        return (value, false)
    }

    private func updateSnapGuides(x: Double?, y: Double?) {
        // Désactive les actions implicites de CoreAnimation (fade in / out de
        // contents) pour éviter tout scintillement quand on recrée les guides
        // à chaque tick de drag. Voir spec § 2.5 A.4.a.
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        hideSnapGuides()
        guard bounds.size != .zero else { return }
        if let x {
            let line = makeGuideLine(verticalAt: CGFloat(x) * bounds.width,
                                     length: bounds.height,
                                     vertical: true)
            editOverlayLayer.addSublayer(line)
            snapGuideLayers.append(line)
        }
        if let y {
            let line = makeGuideLine(verticalAt: CGFloat(y) * bounds.height,
                                     length: bounds.width,
                                     vertical: false)
            editOverlayLayer.addSublayer(line)
            snapGuideLayers.append(line)
        }
    }

    private func hideSnapGuides() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        snapGuideLayers.forEach { $0.removeFromSuperlayer() }
        snapGuideLayers.removeAll()
        CATransaction.commit()
    }

    private func makeGuideLine(verticalAt offset: CGFloat,
                               length: CGFloat,
                               vertical: Bool) -> CAShapeLayer {
        let path = UIBezierPath()
        if vertical {
            path.move(to: CGPoint(x: offset, y: 0))
            path.addLine(to: CGPoint(x: offset, y: length))
        } else {
            path.move(to: CGPoint(x: 0, y: offset))
            path.addLine(to: CGPoint(x: length, y: offset))
        }
        let line = CAShapeLayer()
        line.path = path.cgPath
        line.strokeColor = UIColor.systemPink.cgColor
        line.lineWidth = 1
        line.lineDashPattern = [4, 4]
        line.fillColor = UIColor.clear.cgColor
        return line
    }

    // MARK: - Lightweight gesture update

    /// During an active gesture (pan/pinch/rotate), update only the manipulated
    /// item's CALayer transform instead of rebuilding all layers. This keeps
    /// drag/resize fluid even with many layers on canvas.
    private func updateManipulatedItemLayer() {
        guard let id = manipulatedItemId else { return }
        let bounds = self.bounds
        guard bounds.size != .zero else { return }

        // Background media : pas dans itemsContainer mais dans
        // `backgroundLayer`. On apply le transform au contentLayer interne
        // via `applyContentTransform`, miroir exact du chemin que prend le
        // converter `bgTransform` lors d'un rebuildLayers complet.
        //
        // Unification BG/FG (2026-05-29) : le bg passe par les mêmes
        // updateScale/updatePosition/updateRotation que les items FG (qui
        // mutent `mediaObjects[bg]`), donc les valeurs lues ici viennent de
        // la même source de vérité que le mini-preview et le reader.
        if id == backgroundMediaObjectId,
           let bg = slide.effects.mediaObjects?.first(where: { $0.id == id }) {
            let live = BackgroundTransform(
                scale: bg.scale,
                offsetX: (bg.x - 0.5) * Double(bounds.width),
                offsetY: (bg.y - 0.5) * Double(bounds.height),
                rotation: bg.rotation,
                videoFitMode: slide.effects.backgroundTransform?.videoFitMode
            )
            backgroundLayer.applyContentTransform(live.caTransform())
            return
        }

        guard let layer = itemsContainer.sublayers?.first(where: { $0.name == id }) else { return }

        // Position dans le même référentiel que `StoryRenderer.renderItem` :
        // - x  est mappé en `media.x * renderWidth` (linéaire sur la largeur)
        // - y  est mappé en `media.y * 1920 * scaleFactor` où scaleFactor est
        //   `renderWidth / 1080` → c'est la projection design→render utilisée
        //   par `StoryMediaLayer.configure`. Sans cet alignement, la layer
        //   sautait au release du drag : updateManipulatedItemLayer plaçait via
        //   `bounds.height * y` (qui ≠ 1920*scaleFactor*y dès que bounds.height
        //   ≠ 16/9 × bounds.width, ce qui arrive systématiquement quand la
        //   safe area top/bottom est non-nulle).
        let geo = CanvasGeometry(renderSize: bounds.size)
        func renderPosition(x: Double, y: Double) -> CGPoint {
            let designX = geo.designLength(forNormalized: CGFloat(x))
            let designY = CGFloat(y) * CanvasGeometry.designHeight
            return geo.render(CGPoint(x: designX, y: designY))
        }

        // Read the current model values for this item
        if let media = slide.effects.mediaObjects?.first(where: { $0.id == id }) {
            // Alignement strict sur `StoryMediaLayer.configure` : scale cuit
            // dans `bounds` (base × scale), transform = rotation only.
            // L'ancien chemin posait `transform = scale × rotation` sur des
            // `bounds` déjà × scale (depuis le dernier configure), ce qui
            // double-scale dès le 2e geste sur le même media → bug
            // "media grossit après rotation puis pan" (2026-05-27). Même
            // pattern que la branche text plus bas qui ne pose que la
            // rotation parce que scale est déjà cuit dans fontSize.
            let baseDesign = StoryMediaLayer.baseMediaDesignSize(aspectRatio: media.aspectRatio)
            let scaledDesign = CGSize(width: baseDesign.width * CGFloat(media.scale),
                                      height: baseDesign.height * CGFloat(media.scale))
            let renderedSize = geo.render(scaledDesign)
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            if layer.bounds.size != renderedSize {
                layer.bounds = CGRect(origin: .zero, size: renderedSize)
            }
            layer.position = renderPosition(x: media.x, y: media.y)
            let rotation = CGFloat(media.rotation * .pi / 180)
            layer.transform = CATransform3DMakeRotation(rotation, 0, 0, 1)
            CATransaction.commit()
        } else if let text = slide.effects.textObjects.first(where: { $0.id == id }) {
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            layer.position = renderPosition(x: text.x, y: text.y)
            // Text scale is baked into the rendered `fontSize` at configure-time
            // (see `StoryTextLayer.configure`: `text.fontSize * text.scale`).
            // Applying scale again on the CATextLayer.transform would
            // double-scale the glyphs during the gesture and snap back to the
            // correct size only at .ended → user-perceived "text grows then
            // shrinks while dragging" (regression report 2026-05-27).
            let rotation = CGFloat(text.rotation * .pi / 180)
            layer.transform = CATransform3DMakeRotation(rotation, 0, 0, 1)
            CATransaction.commit()
        } else if let sticker = slide.effects.stickerObjects?.first(where: { $0.id == id }) {
            // Alignement strict sur `StoryStickerLayer.configure` : scale cuit
            // dans bounds (baseSide × scale), transform = rotation only.
            // Mêmes raisons que la branche media — éviter le double-scale au
            // 2e geste sur le même sticker.
            let designSide = CGFloat(sticker.baseSize * sticker.scale)
            let renderedSide = geo.render(designSide)
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            let newBounds = CGRect(x: 0, y: 0, width: renderedSide, height: renderedSide)
            if layer.bounds.size != newBounds.size {
                layer.bounds = newBounds
            }
            layer.position = renderPosition(x: sticker.x, y: sticker.y)
            let rotation = CGFloat(sticker.rotation * .pi / 180)
            layer.transform = CATransform3DMakeRotation(rotation, 0, 0, 1)
            CATransaction.commit()
        }
    }

    // MARK: - Hit testing

    private func hitTestItem(at point: CGPoint) -> String? {
        guard let hit = itemsContainer.hitTest(point) else { return nil }
        var current: CALayer? = hit
        while let c = current {
            if let id = c.name,
               !id.isEmpty,
               c.superlayer === itemsContainer || c === itemsContainer {
                return id
            }
            current = c.superlayer
        }
        return nil
    }

    /// Hit-test qui exclut explicitement les médias `isBackground == true`.
    /// Utilisé en mode `.foreground` pour empêcher la manipulation du fond
    /// quand au moins un foreground est posé sur la slide.
    private func hitTestForegroundItem(at point: CGPoint) -> String? {
        guard let id = hitTestItem(at: point) else { return nil }
        if let media = slide.effects.mediaObjects?.first(where: { $0.id == id }),
           media.isBackground == true {
            return nil
        }
        return id
    }

    // MARK: - Manipulation layer

    /// Recalcule `currentManipulationLayer` à partir du contenu de la slide.
    /// Textes et stickers comptent comme foreground (cohérent avec le modèle
    /// de couches : tout ce qui n'est pas un bg media bloque la manipulation
    /// du bg). N'émet via `onManipulationLayerChanged` que si la valeur a
    /// effectivement changé — pour les re-emissions « défensives »
    /// (bootstrap, resync SwiftUI), utiliser `emitCurrentManipulationLayer()`.
    private func updateManipulationLayer() {
        let new = Self.resolveManipulationLayer(for: slide.effects)
        guard new != currentManipulationLayer else { return }
        currentManipulationLayer = new
        onManipulationLayerChanged?(new)
    }

    /// Résolution pure de la couche manipulable à partir des effets d'une
    /// slide. Extraite en `static` pour permettre les tests sans monter de
    /// UIView. Règle : fg media OU text OU sticker → `.foreground`, sinon
    /// bg media → `.background`, sinon `.canvas`.
    public static func resolveManipulationLayer(for effects: StoryEffects) -> CanvasManipulationLayer {
        let medias = effects.mediaObjects ?? []
        let hasFg = medias.contains(where: { $0.isBackground != true })
            || !effects.textObjects.isEmpty
            || !(effects.stickerObjects ?? []).isEmpty
        if hasFg { return .foreground }
        let hasBg = medias.contains(where: { $0.isBackground == true })
            || effects.resolvedBackgroundMedia != nil
        if hasBg { return .background }
        return .canvas
    }

    /// Force la propagation de la couche courante (sans recompute) — appelée
    /// par le `UIViewRepresentable` après (re)assignation du callback côté
    /// SwiftUI pour garantir que le chip indicator reflète bien la couche
    /// active dès la première frame, et après chaque body eval.
    public func emitCurrentManipulationLayer() {
        onManipulationLayerChanged?(currentManipulationLayer)
    }

    /// Résout l'id de l'élément manipulable courant pour un gesture qui
    /// vient de commencer. Retourne `nil` si la couche active est `.canvas`
    /// (gesture absorbé), ou si le hit-test n'a rien trouvé de manipulable
    /// pour la couche courante.
    ///
    /// Règle `.foreground` : si un foreground est sous le doigt, il prend la
    /// priorité ; sinon on retombe sur le background media (s'il existe).
    /// Sans ce fallback le fond devenait figé dès qu'on posait un texte /
    /// sticker — frustrant pour recadrer une image de fond.
    internal func resolveManipulationTarget(at location: CGPoint) -> String? {
        switch currentManipulationLayer {
        case .canvas:
            return nil
        case .background:
            return resolveBackgroundMediaId()
        case .foreground:
            if let fgId = hitTestForegroundItem(at: location) {
                return fgId
            }
            // Pas de foreground sous le doigt → on manipule le bg s'il existe
            // pour permettre le recadrage du fond même quand des éléments
            // sont déjà posés (cf. spec UX décidée 2026-05-22).
            return resolveBackgroundMediaId()
        }
    }

    /// Résolution unique du bg media : préfère le flag explicite
    /// `isBackground == true`, retombe sur `resolvedBackgroundMedia`.
    private func resolveBackgroundMediaId() -> String? {
        if let bg = slide.effects.mediaObjects?.first(where: { $0.isBackground == true }) {
            return bg.id
        }
        return slide.effects.resolvedBackgroundMedia?.id
    }

    // MARK: - Slide mutation helpers

    private func currentItemNormalizedPosition(forId id: String) -> (Double, Double)? {
        if let t = slide.effects.textObjects.first(where: { $0.id == id }) {
            return (t.x, t.y)
        }
        if let m = slide.effects.mediaObjects?.first(where: { $0.id == id }) {
            return (m.x, m.y)
        }
        if let s = slide.effects.stickerObjects?.first(where: { $0.id == id }) {
            return (s.x, s.y)
        }
        return nil
    }

    private func currentScale(forId id: String) -> Double? {
        if let t = slide.effects.textObjects.first(where: { $0.id == id }) { return t.scale }
        if let m = slide.effects.mediaObjects?.first(where: { $0.id == id }) { return m.scale }
        if let s = slide.effects.stickerObjects?.first(where: { $0.id == id }) { return s.scale }
        return nil
    }

    private func currentRotation(forId id: String) -> Double? {
        if let t = slide.effects.textObjects.first(where: { $0.id == id }) { return t.rotation }
        if let m = slide.effects.mediaObjects?.first(where: { $0.id == id }) { return m.rotation }
        if let s = slide.effects.stickerObjects?.first(where: { $0.id == id }) { return s.rotation }
        return nil
    }

    private func updatePosition(slideId: String, x: Double, y: Double) -> StorySlide {
        mutateItem(slideId: slideId,
                   text:    { $0.x = x; $0.y = y },
                   media:   { $0.x = x; $0.y = y },
                   sticker: { $0.x = x; $0.y = y })
    }

    private func updateScale(slideId: String, scale: Double) -> StorySlide {
        mutateItem(slideId: slideId,
                   text:    { $0.scale = scale },
                   media:   { $0.scale = scale },
                   sticker: { $0.scale = scale })
    }

    private func updateRotation(slideId: String, rotation: Double) -> StorySlide {
        mutateItem(slideId: slideId,
                   text:    { $0.rotation = rotation },
                   media:   { $0.rotation = rotation },
                   sticker: { $0.rotation = rotation })
    }

    private func mutateItem(slideId: String,
                            text:    (inout StoryTextObject)  -> Void,
                            media:   (inout StoryMediaObject) -> Void,
                            sticker: (inout StorySticker)     -> Void) -> StorySlide {
        var newSlide = slide
        for i in newSlide.effects.textObjects.indices where newSlide.effects.textObjects[i].id == slideId {
            text(&newSlide.effects.textObjects[i])
            return newSlide
        }
        if var arr = newSlide.effects.mediaObjects {
            for i in arr.indices where arr[i].id == slideId {
                media(&arr[i])
                newSlide.effects.mediaObjects = arr
                return newSlide
            }
        }
        if var arr = newSlide.effects.stickerObjects {
            for i in arr.indices where arr[i].id == slideId {
                sticker(&arr[i])
                newSlide.effects.stickerObjects = arr
                return newSlide
            }
        }
        return newSlide
    }

    private nonisolated func clamp(_ value: Double) -> Double {
        max(0, min(1, value))
    }

    /// Parses a `#RRGGBB` or `RRGGBB` hex string into a UIColor.
    /// Local helper; matches the logic used by StoryRenderer + StoryAVCompositor.
    nonisolated static func parseBackgroundHex(_ hex: String) -> UIColor? {
        var s = hex
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        return UIColor(red: CGFloat((v >> 16) & 0xff) / 255,
                       green: CGFloat((v >> 8) & 0xff) / 255,
                       blue: CGFloat(v & 0xff) / 255,
                       alpha: 1)
    }

    // MARK: - Item commands (used by context menu + accessibility)

    func deleteItem(id: String) {
        var newSlide = slide
        newSlide.effects.textObjects.removeAll { $0.id == id }
        newSlide.effects.mediaObjects?.removeAll { $0.id == id }
        newSlide.effects.stickerObjects?.removeAll { $0.id == id }
        slide = newSlide
        onItemModified?(slide)
    }

    func duplicateItem(id: String) {
        var newSlide = slide
        if let original = newSlide.effects.textObjects.first(where: { $0.id == id }) {
            var copy = original
            copy.id = UUID().uuidString
            copy.x = clamp(copy.x + 0.05)
            copy.y = clamp(copy.y + 0.05)
            copy.zIndex = nextTopZ()
            newSlide.effects.textObjects.append(copy)
            slide = newSlide
            onItemModified?(slide)
            return
        }
        if let original = newSlide.effects.mediaObjects?.first(where: { $0.id == id }) {
            var copy = original
            copy.id = UUID().uuidString
            copy.x = clamp(copy.x + 0.05)
            copy.y = clamp(copy.y + 0.05)
            copy.zIndex = nextTopZ()
            newSlide.effects.mediaObjects = (newSlide.effects.mediaObjects ?? []) + [copy]
            slide = newSlide
            onItemModified?(slide)
            return
        }
        if let original = newSlide.effects.stickerObjects?.first(where: { $0.id == id }) {
            var copy = original
            copy.id = UUID().uuidString
            copy.x = clamp(copy.x + 0.05)
            copy.y = clamp(copy.y + 0.05)
            copy.zIndex = nextTopZ()
            newSlide.effects.stickerObjects = (newSlide.effects.stickerObjects ?? []) + [copy]
            slide = newSlide
            onItemModified?(slide)
            return
        }
    }

    func sendToBack(id: String) {
        let newZ = nextBottomZ()
        slide = mutateItem(slideId: id,
                           text:    { $0.zIndex = newZ },
                           media:   { $0.zIndex = newZ },
                           sticker: { $0.zIndex = newZ })
        onItemModified?(slide)
    }

    func bringForward(id: String) {
        var elements = slide.effects.textObjects.map { ($0.id, $0.zIndex) }
        elements += (slide.effects.mediaObjects ?? []).map { ($0.id, $0.zIndex) }
        elements += (slide.effects.audioPlayerObjects ?? []).map { ($0.id, $0.zIndex ?? 0) }
        elements += (slide.effects.stickerObjects ?? []).map { ($0.id, $0.zIndex) }
        
        elements.sort { $0.1 < $1.1 }
        
        guard let index = elements.firstIndex(where: { $0.0 == id }), index < elements.count - 1 else { return }
        
        let currentZ = elements[index].1
        let nextZ = elements[index + 1].1
        
        // Quand currentZ == nextZ (égalité fortuite), on doit "casser" l'égalité
        // en plaçant current au-dessus. Sinon swap pur (newCurrentZ = nextZ,
        // newNextZ = currentZ). Dans les deux cas, newNextZ vaut currentZ — le
        // ternaire trivial `cond ? currentZ : currentZ` a été remplacé.
        let newCurrentZ = (currentZ == nextZ) ? nextZ + 1 : nextZ
        let newNextZ = currentZ

        let nextId = elements[index + 1].0

        slide = mutateItem(slideId: id, text: { $0.zIndex = newCurrentZ }, media: { $0.zIndex = newCurrentZ }, sticker: { $0.zIndex = newCurrentZ })
        slide = mutateItem(slideId: nextId, text: { $0.zIndex = newNextZ }, media: { $0.zIndex = newNextZ }, sticker: { $0.zIndex = newNextZ })
        onItemModified?(slide)
    }

    func sendBackward(id: String) {
        var elements = slide.effects.textObjects.map { ($0.id, $0.zIndex) }
        elements += (slide.effects.mediaObjects ?? []).map { ($0.id, $0.zIndex) }
        elements += (slide.effects.audioPlayerObjects ?? []).map { ($0.id, $0.zIndex ?? 0) }
        elements += (slide.effects.stickerObjects ?? []).map { ($0.id, $0.zIndex) }
        
        elements.sort { $0.1 < $1.1 }
        
        guard let index = elements.firstIndex(where: { $0.0 == id }), index > 0 else { return }
        
        let currentZ = elements[index].1
        let prevZ = elements[index - 1].1
        
        // Miroir de bringForward : si égalité fortuite, on incrémente prev
        // au-dessus pour casser l'égalité. Sinon swap pur. newCurrentZ vaut
        // prevZ dans les deux cas (ternaire trivial nettoyé).
        let newCurrentZ = prevZ
        let newPrevZ = (currentZ == prevZ) ? currentZ + 1 : currentZ
        
        let prevId = elements[index - 1].0
        
        slide = mutateItem(slideId: id, text: { $0.zIndex = newCurrentZ }, media: { $0.zIndex = newCurrentZ }, sticker: { $0.zIndex = newCurrentZ })
        slide = mutateItem(slideId: prevId, text: { $0.zIndex = newPrevZ }, media: { $0.zIndex = newPrevZ }, sticker: { $0.zIndex = newPrevZ })
        onItemModified?(slide)
    }

    private func nextTopZ() -> Int {
        let allZ = slide.effects.textObjects.map(\.zIndex)
            + (slide.effects.mediaObjects?.map(\.zIndex) ?? [])
            + (slide.effects.stickerObjects?.map(\.zIndex) ?? [])
        return (allZ.max() ?? 0) + 1
    }

    private func nextBottomZ() -> Int {
        let allZ = slide.effects.textObjects.map(\.zIndex)
            + (slide.effects.mediaObjects?.map(\.zIndex) ?? [])
            + (slide.effects.stickerObjects?.map(\.zIndex) ?? [])
        return (allZ.min() ?? 0) - 1
    }
}

// MARK: - UIContextMenuInteractionDelegate (long-press / right-click)

extension StoryCanvasUIView: UIContextMenuInteractionDelegate {
    public func contextMenuInteraction(_ interaction: UIContextMenuInteraction,
                                       configurationForMenuAtLocation location: CGPoint)
    -> UIContextMenuConfiguration? {
        guard mode == .edit, let id = hitTestItem(at: location) else { return nil }
        
        let kind: CanvasItemKind = {
            if slide.effects.textObjects.contains(where: { $0.id == id }) { return .text }
            if slide.effects.stickerObjects?.contains(where: { $0.id == id }) == true { return .sticker }
            return .media
        }()

        return UIContextMenuConfiguration(
            identifier: id as NSString,
            previewProvider: nil
        ) { [weak self] _ in
            UIMenu(children: [
                UIAction(title: "Modifier",
                         image: UIImage(systemName: "pencil")) { _ in
                    self?.onItemDoubleTapped?(id, kind)
                },
                UIAction(title: "Dupliquer",
                         image: UIImage(systemName: "doc.on.doc")) { _ in
                    self?.contextDuplicate(id: id)
                },
                UIAction(title: "Mettre au premier plan",
                         image: UIImage(systemName: "square.3.stack.3d.top.filled")) { _ in
                    self?.contextBringForward(id: id)
                },
                UIAction(title: "Mettre à l'arrière",
                         image: UIImage(systemName: "square.2.stack.3d.bottom.filled")) { _ in
                    self?.contextSendBackward(id: id)
                },
                UIAction(title: "Supprimer",
                         image: UIImage(systemName: "trash"),
                         attributes: .destructive) { _ in
                    self?.contextDelete(id: id)
                },
            ])
        }
    }

    /// Provide a targeted preview so the system only lifts the specific
    /// element layer instead of the entire canvas view.
    public func contextMenuInteraction(
        _ interaction: UIContextMenuInteraction,
        previewForHighlightingMenuWithConfiguration configuration: UIContextMenuConfiguration
    ) -> UITargetedPreview? {
        return targetedPreview(for: configuration)
    }

    public func contextMenuInteraction(
        _ interaction: UIContextMenuInteraction,
        previewForDismissingMenuWithConfiguration configuration: UIContextMenuConfiguration
    ) -> UITargetedPreview? {
        return targetedPreview(for: configuration)
    }

    private func targetedPreview(for configuration: UIContextMenuConfiguration) -> UITargetedPreview? {
        guard let id = configuration.identifier as? String,
              let layer = itemsContainer.sublayers?.first(where: { $0.name == id }) else { return nil }

        // Aperçu de lift transparent. `UITargetedPreview` applique un flou
        // système sur les aperçus adossés à une image, ce qui « fantômait »
        // le média pendant le long-press ; une `UIView` claire garde
        // l'élément net derrière le menu. Aucune bordure : le média porte
        // déjà son propre cadre blanc — un liseré d'aperçu en doublon était
        // superflu et a été retiré (le cadre apparaissait « à la sélection »).
        let overlay = UIView(frame: layer.frame)
        overlay.backgroundColor = .clear
        overlay.isUserInteractionEnabled = false
        addSubview(overlay)

        let params = UIPreviewParameters()
        params.backgroundColor = .clear
        let preview = UITargetedPreview(view: overlay, parameters: params)

        // Remove the temporary overlay after the menu's lift animation.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            overlay.removeFromSuperview()
        }
        return preview
    }

    // MARK: - Context menu actions

    /// These mutate the slide and re-fire onItemModified so the binding
    /// propagates back to the SwiftUI composer layer.
    /// Réordonne un élément foreground pour le placer en tête de la liste
    /// `mediaObjects` / `textObjects` / `stickerObjects`. Appelé au touch
    /// (`handlePan.began`, `handlePinch.began`, `handleRotation.began`) pour
    /// que l'élément manipulé soit immédiatement le plus en avant. No-op pour
    /// le background media (les bg restent toujours derrière les fg via le
    /// filtre de `StoryRenderer.collectItems`).
    /// Ramène l'élément touché au premier plan visuel.
    ///
    /// **Important** : le rendu canvas (`StoryRenderer.render`) trie les
    /// éléments par `zIndex` (pas par leur ordre dans les arrays).
    /// Réordonner uniquement les tableaux (`remove + append`) ne suffisait
    /// donc pas — le visuel ne bougeait pas alors que les listes de
    /// l'inspecteur (qui lisent l'ordre du tableau) reflétaient bien le
    /// mouvement. On assigne maintenant `nextTopZ()` à l'élément pour piloter
    /// le z-order de rendu, et on réordonne aussi le tableau pour rester
    /// cohérent avec l'inspecteur.
    ///
    /// **Perf** : chaque mutation passe par une copie locale puis UNE
    /// réassignation au `slide`. Mutations directes via subscript (`.foo[i]
    /// = ...`) ou `remove/append` sur la propriété déclencheraient
    /// `slide.didSet` plusieurs fois — donc `rebuildLayers()` plusieurs
    /// fois par tap — visible jitter sur les devices lents.
    ///
    /// `internal` plutôt que `private` pour symétrie avec `sendToBack(id:)`
    /// et pour permettre les tests sans simuler un tap UIKit.
    internal func bringForegroundToFront(id: String) {
        let topZ = nextTopZ()

        // Texte
        if let idx = slide.effects.textObjects.firstIndex(where: { $0.id == id }) {
            var texts = slide.effects.textObjects
            // Skip only when BOTH the z-index AND the array position
            // already reflect the "front" state — `||` would always
            // continue because `nextTopZ()` returns `currentMax + 1`,
            // so `zIndex < topZ` is always true.
            guard texts[idx].zIndex < topZ - 1
                  || idx != texts.count - 1 else { return }
            texts[idx].zIndex = topZ
            let item = texts.remove(at: idx)
            texts.append(item)
            slide.effects.textObjects = texts
            onItemModified?(slide)
            return
        }
        // Media foreground (skip si bg)
        if var medias = slide.effects.mediaObjects,
           let idx = medias.firstIndex(where: { $0.id == id }),
           medias[idx].isBackground == false {
            // Same `< topZ - 1` rationale as in the texts branch above.
            guard medias[idx].zIndex < topZ - 1
                  || idx != medias.count - 1 else { return }
            medias[idx].zIndex = topZ
            let item = medias.remove(at: idx)
            medias.append(item)
            slide.effects.mediaObjects = medias
            onItemModified?(slide)
            return
        }
        // Sticker
        if var stickers = slide.effects.stickerObjects,
           let idx = stickers.firstIndex(where: { $0.id == id }) {
            // Same `< topZ - 1` rationale as in the texts branch above.
            guard stickers[idx].zIndex < topZ - 1
                  || idx != stickers.count - 1 else { return }
            stickers[idx].zIndex = topZ
            let item = stickers.remove(at: idx)
            stickers.append(item)
            slide.effects.stickerObjects = stickers
            onItemModified?(slide)
            return
        }
    }

    private func contextDuplicate(id: String) {
        var duplicatedNewId: String?
        var duplicatedKind: CanvasItemKind?
        // Branche media : `guard var` au lieu de `mediaObjects![idx]` — même si
        // l'optional est non-nil au moment du firstIndex (single-thread
        // MainActor), le force unwrap restait fragile face à un refacto futur.
        if var medias = slide.effects.mediaObjects,
           let idx = medias.firstIndex(where: { $0.id == id }) {
            var copy = medias[idx]
            let newId = UUID().uuidString
            copy.id = newId
            copy.x += 0.05
            copy.y += 0.05
            copy.isBackground = false
            copy.zIndex = nextTopZ()
            medias.append(copy)
            slide.effects.mediaObjects = medias
            duplicatedNewId = newId
            duplicatedKind = .media
        } else if let idx = slide.effects.textObjects.firstIndex(where: { $0.id == id }) {
            var copy = slide.effects.textObjects[idx]
            let newId = UUID().uuidString
            copy.id = newId
            copy.x += 0.05
            copy.y += 0.05
            copy.zIndex = nextTopZ()
            slide.effects.textObjects.append(copy)
            duplicatedNewId = newId
            duplicatedKind = .text
        } else if var stickers = slide.effects.stickerObjects,
                  let idx = stickers.firstIndex(where: { $0.id == id }) {
            // Parité avec `duplicateItem` (ligne 2706) — la branche sticker
            // manquait dans le context menu : tap "Dupliquer" sur un sticker
            // restait un no-op silencieux.
            var copy = stickers[idx]
            let newId = UUID().uuidString
            copy.id = newId
            copy.x += 0.05
            copy.y += 0.05
            copy.zIndex = nextTopZ()
            stickers.append(copy)
            slide.effects.stickerObjects = stickers
            duplicatedNewId = newId
            duplicatedKind = .sticker
        }
        onItemModified?(slide)
        if let newId = duplicatedNewId, let kind = duplicatedKind {
            onItemDuplicated?(id, newId, kind)
        }
    }

    private func contextBringForward(id: String) {
        if var medias = slide.effects.mediaObjects,
           let idx = medias.firstIndex(where: { $0.id == id }),
           idx < medias.count - 1 {
            medias.swapAt(idx, idx + 1)
            slide.effects.mediaObjects = medias
            onItemModified?(slide)
        }
    }

    private func contextSendBackward(id: String) {
        if var medias = slide.effects.mediaObjects,
           let idx = medias.firstIndex(where: { $0.id == id }),
           idx > 0 {
            medias.swapAt(idx, idx - 1)
            slide.effects.mediaObjects = medias
            onItemModified?(slide)
        }
    }

    private func contextDelete(id: String) {
        slide.effects.mediaObjects?.removeAll { $0.id == id }
        slide.effects.textObjects.removeAll { $0.id == id }
        slide.effects.stickerObjects?.removeAll { $0.id == id }
        onItemModified?(slide)
    }
}

// MARK: - UIPointerInteractionDelegate (iPad / Mac Catalyst)

extension StoryCanvasUIView: UIPointerInteractionDelegate {
    public func pointerInteraction(_ interaction: UIPointerInteraction,
                                   regionFor request: UIPointerRegionRequest,
                                   defaultRegion: UIPointerRegion) -> UIPointerRegion? {
        guard mode == .edit, hitTestItem(at: request.location) != nil else { return nil }
        return defaultRegion
    }

    public func pointerInteraction(_ interaction: UIPointerInteraction,
                                   styleFor region: UIPointerRegion) -> UIPointerStyle? {
        guard mode == .edit, let view = interaction.view else { return nil }
        let preview = UITargetedPreview(view: view)
        return UIPointerStyle(effect: .lift(preview))
    }

    #if DEBUG
    /// Test seam mirroring `handleDoubleTap` cycle (auto → fit → fill → auto)
    /// for the background. Commits to the model + fires the callback.
    /// The double-tap is bg-specific (toggle fit mode override) and not part
    /// of the unified BG/FG gesture flow, so it keeps its dedicated test seam.
    internal func performDoubleTapForTesting(targetId: String) {
        guard targetId == backgroundMediaObjectId else { return }
        let current = slide.effects.backgroundTransform?.videoFitMode
        let next: String?
        switch current {
        case nil:    next = "fit"
        case "fit":  next = "fill"
        case "fill": next = nil
        default:     next = nil
        }
        var updated = slide
        var bg = updated.effects.backgroundTransform ?? StoryBackgroundTransform()
        bg.videoFitMode = next
        updated.effects.backgroundTransform = bg.isIdentity ? nil : bg
        slide = updated
        onBackgroundTransformChanged?(bg)
    }
    #endif
}

// MARK: - UIGestureRecognizerDelegate

extension StoryCanvasUIView: UIGestureRecognizerDelegate {
    /// Pinch + rotation are allowed simultaneously (natural two-finger transform).
    /// Pan is exclusive — running it alongside pinch/rotation would corrupt the
    /// snapshot-based deltas (drag uses translation, others use scale/rotation).
    /// Le `canvasZoomPinchRecognizer` (3 doigts) est exclusif vis-à-vis du
    /// `pinchRecognizer` (2 doigts) pour éviter qu'un pinch sur élément
    /// scale aussi le viewport.
    public func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                                   shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        let isPanA = gestureRecognizer === panRecognizer
        let isPanB = other === panRecognizer
        if isPanA || isPanB { return false }
        let isCanvasZoomA = gestureRecognizer === canvasZoomPinchRecognizer
        let isCanvasZoomB = other === canvasZoomPinchRecognizer
        if isCanvasZoomA || isCanvasZoomB { return false }
        return true
    }
}

// MARK: - ThreeFingerPinchGestureRecognizer

/// Custom recognizer qui détecte un pinch à exactement 3 doigts. Utilisé
/// par `StoryCanvasUIView` pour le zoom du viewport — l'API standard
/// `UIPinchGestureRecognizer` est verrouillée à 2 doigts, ce qui entrait
/// en collision avec le pinch d'élément (mêmes 2 doigts, deux gestures
/// firent en parallèle → l'élément ET le canvas scalent).
///
/// Géométrie : `scale` est calculé comme le ratio entre la distance moyenne
/// actuelle des touches au centroïde et la distance moyenne à l'instant de
/// `.began`. Comportement équivalent à `UIPinchGestureRecognizer.scale`
/// mais sur N touches.
///
/// État :
/// - `.possible` → tant que moins de 3 doigts ne sont pas posés
/// - `.began` → 3ᵉ doigt posé, distance initiale capturée
/// - `.changed` → mouvement d'un des 3 doigts (recalcule `scale`)
/// - `.ended` → un doigt levé (passe à <3) après `.began/.changed`
/// - `.failed` → 4ᵉ doigt posé avant `.began` (on n'accepte que 3 doigts)
/// - `.cancelled` → touchesCancelled (interruption système)
final class ThreeFingerPinchGestureRecognizer: UIGestureRecognizer {
    /// Échelle cumulée depuis `.began`. Reset à 1.0 dans `reset()`.
    private(set) var scale: CGFloat = 1.0
    private var initialAverageDistance: CGFloat = 0

    private static let requiredTouches: Int = 3

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesBegan(touches, with: event)
        let count = numberOfTouches
        if count < Self.requiredTouches {
            // Pas encore assez de doigts — on reste `.possible`.
            return
        }
        if count > Self.requiredTouches {
            // Trop de doigts : ce recognizer cible exactement 3.
            state = .failed
            return
        }
        // count == 3 → capture la distance initiale et lance `.began`.
        initialAverageDistance = Self.averageDistanceFromCentroid(of: self)
        if state == .possible {
            state = .began
        }
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesMoved(touches, with: event)
        guard numberOfTouches == Self.requiredTouches,
              initialAverageDistance > 0 else { return }
        let current = Self.averageDistanceFromCentroid(of: self)
        scale = current / initialAverageDistance
        if state == .began || state == .changed {
            state = .changed
        }
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesEnded(touches, with: event)
        guard numberOfTouches < Self.requiredTouches else { return }
        if state == .began || state == .changed {
            state = .ended
        } else {
            state = .failed
        }
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesCancelled(touches, with: event)
        state = .cancelled
    }

    override func reset() {
        super.reset()
        scale = 1.0
        initialAverageDistance = 0
    }

    /// Pure helper — extrait `static` pour permettre les tests sans monter
    /// un environnement UITouch (testé via `Self.averageDistance(...)`).
    /// Retourne 0 si moins d'une touche ou pas de view attachée.
    private static func averageDistanceFromCentroid(of recognizer: UIGestureRecognizer) -> CGFloat {
        guard let view = recognizer.view, recognizer.numberOfTouches > 0 else { return 0 }
        let count = recognizer.numberOfTouches
        let points = (0..<count).map { recognizer.location(ofTouch: $0, in: view) }
        return Self.averageDistance(points: points)
    }

    /// Version pure pour les tests — calcule la distance moyenne d'un set
    /// de points au centroïde. Retourne 0 si moins d'un point.
    static func averageDistance(points: [CGPoint]) -> CGFloat {
        guard !points.isEmpty else { return 0 }
        let cx = points.reduce(0) { $0 + $1.x } / CGFloat(points.count)
        let cy = points.reduce(0) { $0 + $1.y } / CGFloat(points.count)
        let centroid = CGPoint(x: cx, y: cy)
        let totalDist = points.reduce(CGFloat(0)) { acc, p in
            let dx = p.x - centroid.x
            let dy = p.y - centroid.y
            return acc + sqrt(dx * dx + dy * dy)
        }
        return totalDist / CGFloat(points.count)
    }
}
