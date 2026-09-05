import UIKit
import QuartzCore
import CoreMedia
import AVFoundation
import Metal
import PencilKit
import Combine
import os
import MeeshySDK

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

    /// Mémo de `slide.computedTotalDuration()` — posé par le `didSet` de
    /// `slide`, résolu paresseusement au premier accès (le `didSet` ne joue
    /// pas à l'init). `internal` : lu par l'extension `+Playback` (une
    /// propriété `private` serait inaccessible depuis un fichier frère).
    var cachedSlideTotalDuration: TimeInterval?

    /// Durée totale effective de la slide, sans reparcourir le contenu à
    /// chaque tick de display-link.
    var effectiveSlideTotalDuration: TimeInterval {
        if let cachedSlideTotalDuration { return cachedSlideTotalDuration }
        let computed = slide.computedTotalDuration()
        cachedSlideTotalDuration = computed
        return computed
    }

    public var slide: StorySlide {
        didSet {
            // Refresh the cached background media id BEFORE early return paths
            // so handlePan can branch correctly even mid-gesture.
            backgroundMediaObjectId = slide.effects.mediaObjects?
                .first(where: { $0.isBackground })?.id
            // Durée totale mémoïsée AVANT les early returns : le tick du
            // display-link la lisait via `computedTotalDuration()` (parcours de
            // tous les media/audio/text objects) à chaque frame — elle ne
            // change qu'à la réassignation de `slide`.
            cachedSlideTotalDuration = slide.computedTotalDuration()

            // Any real slide mutation while editing counts as user activity —
            // the single choke point through which every composer control
            // (color/font/filter panels, sticker add/remove, background
            // transform chips, gesture-driven drags) and every inline text
            // edit eventually mutate the model, deduped against spurious
            // SwiftUI re-renders by `StoryComposerCanvasView.slidesEqualForCanvas`
            // upstream. Wakes the idle-throttled edit clock immediately
            // (issue #3906) — see `noteEditInteraction()`.
            if mode == .edit { noteEditInteraction() }

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
            // L'audio ne se re-planifie que sur un changement de COMPOSITION.
            // Cf. `slideAudioRevision` : sans ce diff, taper une lettre suffisait
            // à repartir de zéro.
            let fingerprint = Self.structureFingerprint(of: slide)
            if fingerprint != slideStructureFingerprint {
                slideStructureFingerprint = fingerprint
                slideAudioRevision &+= 1
            }
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
    public internal(set) var mode: RenderMode
    public internal(set) var currentTime: CMTime = .zero

    /// Timeline preview (« preview vivante ») : non-nil tant que la sheet
    /// timeline pilote ce canvas comme moniteur de preview. Le canvas reste
    /// en `.edit` pour la plomberie gestes/overlays mais REND en sémantique
    /// `.play` à ce temps-là (fenêtres temporelles, keyframes, transitions).
    /// L'audio appartient au StoryTimelineEngine pendant toute la preview —
    /// les AVPlayer du canvas sont re-stampés muets via `effectiveAudioMuted`.
    public internal(set) var timelinePreviewSeconds: Double?
    /// Transport timeline en lecture pendant la preview : bascule la
    /// stratégie vidéo entre seek-en-pause (scrub) et lecture muette calée.
    var timelinePreviewPlaying: Bool = false

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

    /// Jumeau de `playsVideoInEditMode` pour l'AUDIO : opt-in du composer pour
    /// jouer les clips audio/voix (via `ReaderAudioMixer`) sur le canvas
    /// d'édition — sans lui, seul le son des vidéos jouait en édition et les
    /// clips audio de fond restaient muets (directive user 2026-07-14). Posé à
    /// `true` uniquement par `StoryComposerCanvasView` ; le prefetcher hors-écran
    /// reste silencieux. Sans effet en `.play`.
    public var playsAudioInEditMode: Bool = false {
        didSet {
            guard oldValue != playsAudioInEditMode else { return }
            if playsAudioInEditMode {
                lastAudioConfigRevision = nil
                reconfigureAudioForPlayback()
            } else {
                audioMixer.stop()
            }
        }
    }

    /// Troisième jumeau de `playsVideoInEditMode` et `playsAudioInEditMode`,
    /// pour les DÉCORATIONS (#4999, directive porteur 2026-09-03 : « sur la
    /// scène les stickers doivent être vivants tout comme les vidéos et
    /// audios »). Posé à `true` par le seul canvas composer ; le prefetcher
    /// hors-écran, lui aussi en `.edit`, ne le lève jamais. Sans effet en
    /// `.play`, où `StoryRenderer` applique déjà la pose à chaque tick.
    ///
    /// Éteint en cours de route, il rend aux décorations la pose de l'auteur
    /// plutôt que de les abandonner à leur dernière image.
    public var playsStickerMotionInEditMode: Bool = false {
        didSet {
            guard oldValue != playsStickerMotionInEditMode else { return }
            guard !playsStickerMotionInEditMode else { return }
            // Rendre la pose plutôt que reconstruire : `rebuildLayers()`
            // recyclerait des couches du cache, qui porteraient encore la
            // dernière pose. On DÉFAIT ce qu'on a posé, c'est la seule forme
            // qui ne dépende pas de ce que le cache a gardé.
            restStickerMotion(animatedStickers)
            stickerMotionClock = StoryStickerMotionClock()
        }
    }

    /// L'horloge du mouvement en composition — un temps ÉCOULÉ, jamais un
    /// playhead. Elle vit ici parce qu'elle survit aux reconstructions de
    /// couches : la phase d'une décoration ne doit pas repartir de zéro parce
    /// qu'on a déplacé sa voisine.
    var stickerMotionClock = StoryStickerMotionClock()

    // MARK: - Reader context (Task 5)

    var readerContext: StoryReaderContext = .empty
    var completionFired: Bool = false

    /// Called whenever a gesture mutates the slide (Tasks 2.7+).
    public var onItemModified: ((StorySlide) -> Void)?

    /// Classifies an item that was hit by a gesture so the parent can route to
    /// the correct editor (text panel vs media editor sheet vs sticker UX).
    public nonisolated enum CanvasItemKind: Sendable, Equatable, Hashable, CaseIterable {
        case text, media, sticker, place, audio
    }

    /// **Les kinds dont l'hôte sait RÉELLEMENT ouvrir un éditeur** (#4074).
    ///
    /// `onItemDoubleTapped != nil` répond à « l'hôte a-t-il câblé un éditeur ? ».
    /// C'est une question de CANVAS, et « Modifier » est une décision par
    /// OBJET : l'atelier câble le rappel, puis fait `case .sticker, .location:
    /// break` — le menu offrait donc « Modifier » sur un sticker, et rien ne se
    /// produisait.
    ///
    /// > **Un booléen de canvas ne peut pas répondre à une question par objet.**
    /// > Le menu a la `kind` sous la main (`contextMenu(for:kind:)`) ; ce qui
    /// > manquait était de la CONSULTER.
    ///
    /// Défaut `[.text, .media]` — ce que le rappel de l'atelier traite
    /// réellement. Un hôte qui n'en sait éditer qu'un le restreint (la scène
    /// incrustée sert `[.text]` tant qu'aucun éditeur média n'y est monté).
    public var editableKinds: Set<CanvasItemKind> = [.text, .media]

    /// **Le site UNIQUE de la question « cet objet a-t-il un éditeur ? »**, lu
    /// par le menu visuel ET par les actions VoiceOver.
    ///
    /// Les deux avaient déjà DIVERGÉ : l'accessibilité restreignait à
    /// `kind == .text || kind == .media` en local, le menu visuel non — pendant
    /// que le doc-comment de l'accessibilité affirmait appliquer « la MÊME règle
    /// que le menu long-press ». Une règle déclarée partagée et écrite deux fois
    /// diverge sans que rien ne le voie : chaque copie reste cohérente avec
    /// elle-même.
    func hasEditor(for kind: CanvasItemKind) -> Bool {
        onItemDoubleTapped != nil && editableKinds.contains(kind)
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
    /// **L'objet SORT de la scène (#4046)** — l'hôte décide ce qu'il devient
    /// (en Post : une slide du carrousel). Non câblée, l'action n'est pas
    /// offerte : le SDK ne fabrique pas un geste sans destinataire.
    public var onItemLeftScene: ((String, CanvasItemKind) -> Void)?

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

    let rootLayer = CALayer()
    let itemsContainer = CALayer()
    let editOverlayLayer = CALayer()

    /// **L'objet SÉLECTIONNÉ, et ce qu'on en dit** (#4073, vue `1c`).
    ///
    /// Le doc-comment de `editOverlayLayer` promettait « snap guides, selection
    /// markers » depuis toujours ; seuls les guides existaient. Le canvas
    /// n'avait AUCUNE notion d'objet sélectionné — la scène du composer
    /// affichait donc son inspecteur, ses contrôleurs et son menu contextuel
    /// sans jamais montrer SUR QUOI ils portaient.
    ///
    /// > Un commentaire qui décrit un mécanisme absent ne se fait contredire
    /// > par rien (leçon 335). Celui-ci a survécu à toutes les passes parce
    /// > qu'il énonçait la bonne intention au bon endroit.
    ///
    /// Le libellé du badge vient de l'HÔTE : ce que dit « TEXT · PLAN FG · z 2 »
    /// est du vocabulaire produit, pas une donnée du canvas. Le canvas tient la
    /// GÉOMÉTRIE, l'app tient les MOTS.
    var selectionMarkerId: String?
    var selectionMarkerBadge: String?
    var selectionMarkerLayers: [CALayer] = []

    /// Background layer (color/gradient/image/video). Inserted at z=0 beneath itemsContainer.
    /// `internal` (not private) so test seams can introspect transform during live drag tests.
    internal let backgroundLayer = StoryBackgroundLayer()

    /// Compteur monotone des RÉASSIGNATIONS de `slide` — une par `didSet`
    /// effectif. Il ne pilote plus l'ordonnancement audio (cf.
    /// `slideAudioRevision`) : il ne sert qu'à prouver, en test, qu'une
    /// mutation ne déclenche qu'un seul `didSet` (donc un seul
    /// `rebuildLayers()`).
    internal var slideContentRevision: UInt64 = 0

    /// Empreinte STRUCTURELLE de la slide : identités TRIÉES des objets
    /// qu'elle porte, plus le rôle fond / premier plan des médias et des
    /// audios. Deux slides de même empreinte ne diffèrent que par des
    /// VALEURS — texte tapé, position, échelle, rotation, couleur, z-index —
    /// jamais par leur composition.
    internal var slideStructureFingerprint: String = ""

    /// Jeton d'ordonnancement de l'AUDIO. Incrémenté UNIQUEMENT quand
    /// `slideStructureFingerprint` change, c'est-à-dire à l'ajout ou à la
    /// suppression d'un objet (ou au basculement fond ⇄ premier plan d'un
    /// média / audio, qui change réellement la composition sonore).
    ///
    /// Il remplace `slideContentRevision` dans `currentSlideKey` et dans la
    /// garde de `reconfigureAudioForPlayback()`. Avec l'ancien compteur, TOUTE
    /// mutation — une lettre tapée dans un texte, un déplacement d'élément —
    /// produisait une nouvelle clé de slide : `ReaderAudioMixer.play` ne
    /// reconnaissait plus la passe en cours et RE-SCHEDULAIT tout depuis
    /// l'origine, donc la musique / la voix de fond repartait à zéro à chaque
    /// frappe (constat user 2026-07-30). Désormais éditer ou bouger un objet
    /// laisse la clé intacte → `play()` se contente de reprendre le transport.
    internal var slideAudioRevision: UInt64 = 0

    /// Empreinte structurelle pure et testable — sans SwiftUI ni UIKit.
    ///
    /// Le tri rend l'empreinte insensible à l'ORDRE : remonter un élément au
    /// premier plan (`bringForegroundToFront`) réordonne les tableaux mais ne
    /// change pas la composition, et ne doit donc pas relancer le son.
    nonisolated static func structureFingerprint(of slide: StorySlide) -> String {
        let effects = slide.effects
        var parts: [String] = []
        parts.append(contentsOf: effects.textObjects.map { "t:\($0.id)" })
        parts.append(contentsOf: (effects.mediaObjects ?? [])
            .map { "m:\($0.id):\($0.isBackground ? 1 : 0)" })
        parts.append(contentsOf: (effects.stickerObjects ?? []).map { "s:\($0.id)" })
        parts.append(contentsOf: slide.locationObjects.map { "l:\($0.id)" })
        parts.append(contentsOf: (effects.audioPlayerObjects ?? [])
            .map { "a:\($0.id):\($0.isBackground == true ? 1 : 0)" })
        parts.append("bga:\(effects.backgroundAudioId ?? "-")")
        return parts.sorted().joined(separator: "|")
    }

    /// Monotonic token bumped by `invalidateImageCache()` when the composer's
    /// in-memory image cache changes (an in-place image edit bumped
    /// `loadedImagesVersion`). Passed to `backgroundLayer.configure` as
    /// `contentVersion` so the background re-stamps an edited bitmap under the
    /// same media id. The story filter is BAKED into the background bitmap by
    /// `StoryBackgroundLayer` (no overlay) since the 2026-06-03 pivot.
    var composerImageRevision: UInt64 = 0

    /// Two-pass backdrop snapshot helper. Drives the MPS path on
    /// `StoryGlassBackdropLayer` by capturing the canvas-minus-glass tree
    /// once per `rebuildLayers()` tick and serving cropped regions to each
    /// glass-text item via the `BackdropProvider` closure. When no glass
    /// items exist on the slide the capture is a no-op (single boolean scan).
    /// See `docs/superpowers/specs/2026-05-12-story-glass-backdrop-snapshot-design.md`.
    let backdropCapture = StoryBackdropCapture()

    /// Cache CALayer partagé entre tous les ticks de `rebuildLayers()` (.play
    /// 60 Hz + .edit). Évite de recréer un `AVPlayer` 60 fois par seconde
    /// pendant la lecture (cf. spec § 2.2 A.1). L'extension content fingerprint
    /// de `ItemSignature` détecte les mutations de modèle à id constant pour
    /// invalider correctement le cache d'une frame à l'autre.
    let rendererCache = StoryRendererCache()

    // MARK: - Content readiness tracking

    /// `true` after `onContentReady` has fired for the current background
    /// state. Reset on every slide change (via `slide.didSet` → `rebuildLayers`)
    /// and on every `setReaderContext` so re-keying replays the wait.
    internal(set) public var contentReadyFired: Bool = false

    /// `true` once the slide background (color / gradient / image / video) is
    /// visually settled. The combined `onContentReady` signal additionally
    /// waits on foreground video readiness (T6).
    var backgroundContentReady: Bool = false

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
    var pendingBackgroundActivation: Bool = false

    /// Intention de lecture des vidéos FOREGROUND — source de vérité unique,
    /// tenue EN PHASE avec `backgroundLayer.isPlaybackActive` et le mixer audio
    /// pour que le démarrage des vidéos foreground soit synchronisé avec la
    /// vidéo de fond + le son (au lieu de démarrer dès l'attach, en avance).
    /// Sticky : `rebuildLayers()` le propage aux layers fraîchement attachées,
    /// et `StoryMediaLayer.attachPlayer` le consulte pour qu'une vidéo dont les
    /// octets arrivent APRÈS le « GO » (content-ready) démarre immédiatement.
    var foregroundVideosPlaybackActive: Bool = false {
        didSet {
            guard oldValue != foregroundVideosPlaybackActive else { return }
            forEachMediaLayer { $0.isPlaybackActive = foregroundVideosPlaybackActive }
        }
    }

    /// KVO token watching `backgroundLayer.contentLayer.contents` while an
    /// image background is loading. Held until the real bytes land or the
    /// background is replaced. `NSKeyValueObservation` invalidates on deinit
    /// so there is no manual `invalidate()` requirement on dealloc.
    var imageContentsObserver: NSKeyValueObservation?

    /// KVO token watching `avPlayer.currentItem.status` while a video
    /// background is preparing. Released when the player reaches
    /// `.readyToPlay` or the background is replaced.
    var videoStatusObserver: NSKeyValueObservation?

    /// KVO token watching the background `AVPlayerLayer.isReadyForDisplay`
    /// (première frame réellement décodée ET composée à l'écran). C'est CE
    /// signal — pas la simple présence disque du fichier — qui gate la progress
    /// bar, pour qu'elle n'avance jamais sur le flou ThumbHash pendant le
    /// spinup du decoder. Libéré dans `teardownReadinessObservers`.
    var videoFirstFrameObserver: NSKeyValueObservation?

    /// Tâche de sondage utilisée pour la branche cache-miss de
    /// `scheduleContentReadyEvaluation(.video)` : quand `backgroundLayer
    /// .configure` lance une `Task` async pour télécharger l'URL distante,
    /// `avPlayer` n'existe pas encore au moment de l'évaluation et il faut
    /// attendre son apparition pour brancher l'observer status. Annulée à
    /// chaque changement de slide et dans `teardownReadinessObservers`.
    var pendingVideoReadinessTask: Task<Void, Never>?

    /// `CGImage` captured the moment the ThumbHash placeholder was assigned
    /// to `backgroundLayer.contentLayer.contents`. Used to distinguish
    /// "still showing the placeholder" from "real bitmap landed" — the
    /// `imageContentsObserver` only fires `onContentReady` once `contents`
    /// transitions to a `CGImage` that is not this reference.
    weak var thumbHashPlaceholderRef: AnyObject?

    // MARK: - Gestures

    var panRecognizer: UIPanGestureRecognizer!
    var pinchRecognizer: UIPinchGestureRecognizer!
    var rotationRecognizer: UIRotationGestureRecognizer!
    var singleTapRecognizer: UITapGestureRecognizer!
    var doubleTapRecognizer: UITapGestureRecognizer!
    /// **L'appui long sur le FOND** — jamais sur un objet, où
    /// `UIContextMenuInteraction` règne déjà (`hitTestItem` y rend un id, et
    /// le menu se configure ; sur le fond il rend `nil`, laissant la place).
    var backgroundLongPressRecognizer: UILongPressGestureRecognizer!
    /// Pinch à 3 doigts dédié au zoom du viewport (canvas entier). Séparé du
    /// `pinchRecognizer` 2-doigts qui agit sur un élément/fond : sans cette
    /// séparation, un pinch sur un élément faisait aussi scaler le conteneur
    /// SwiftUI (`.scaleEffect(canvasScale)`) parce que les deux gestures
    /// firent en parallèle.
    var canvasZoomPinchRecognizer: ThreeFingerPinchGestureRecognizer!

    // MARK: - Drawing mode (Phase 3 Task 3.4)

    /// PencilKit drawing surface. Non-nil iff `isDrawingMode == true`.
    var drawingCanvas: PKCanvasView?

    public internal(set) var isDrawingMode: Bool = false

    /// Item currently being dragged/scaled/rotated. Reset on .ended/.cancelled.
    var manipulatedItemId: String?
    var dragStartSlideX: Double = 0
    var dragStartSlideY: Double = 0
    var baseScale: Double = 1.0
    var baseRotation: Double = 0.0

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
    var backgroundMediaObjectId: String?

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

    /// Couche active courante. Recalculée à chaque `slide.didSet` via
    /// `updateManipulationLayer()`. Le routage des gestes pan/pinch/rotate
    /// se fait à partir de cette valeur. Voir `CanvasManipulationLayer`.
    public internal(set) var currentManipulationLayer: CanvasManipulationLayer = .canvas

    /// Sélection utilisateur explicite via les chips « Arrière-plan » /
    /// « Premier plan » (directive user 2026-07-14). `nil` = auto-dérivation
    /// depuis le contenu. Consommée par `resolveManipulationLayer(for:override:)`
    /// et posée par `setManipulationLayer(_:)`.
    public internal(set) var manualManipulationLayerOverride: CanvasManipulationLayer?

    /// Notifié lorsque la couche active change (transition `.canvas` ↔
    /// `.background` ↔ `.foreground`). Le composer peut s'abonner pour
    /// mettre à jour l'indicateur visuel (chip row) et / ou bloquer des
    /// commandes inadéquates pour la couche courante.
    public var onManipulationLayerChanged: ((CanvasManipulationLayer) -> Void)?

    /// **Le canvas DIT quand il s'endort** (#3915).
    ///
    /// `isEditClockThrottled` vivait en UIKit et n'en sortait pas : la couche
    /// SwiftUI posée par-dessus — la puce audio de premier plan et ses deux
    /// `TimelineView(.animation(…))` — continuait donc de redessiner à 30 fps
    /// sur un écran au repos, sur l'horloge d'ANIMATION de SwiftUI, que la mise
    /// en veille d'`editDisplayLink` n'atteint pas.
    ///
    /// Appelé aux DEUX bascules (`idleDownEditClock`, `resumeEditClockFromIdle`)
    /// et à elles seules : c'est ce qui garantit qu'un réveil n'attend aucune
    /// frame — l'interaction qui réveille l'horloge réveille l'animation dans le
    /// même tour.
    public var onEditClockThrottleChanged: ((Bool) -> Void)?

    /// Notifié pendant un pinch à 3 doigts (zoom du viewport). Le composer
    /// SwiftUI s'y abonne pour piloter `canvasScale` + l'overlay éphémère
    /// `viewportPinchDelta` sans avoir besoin d'un `MagnificationGesture`
    /// SwiftUI parallèle (qui réagissait à un pinch 2-doigts sur un
    /// élément). Le `scale` est cumulatif depuis `.began` ; le composer
    /// applique son propre clamp + commit à `.ended`.
    public var onCanvasZoomScaleChanged: ((CGFloat, UIGestureRecognizer.State) -> Void)?

    // MARK: - Audio

    /// Sample-accurate foreground+background audio engine for mode `.play`.
    let audioMixer = ReaderAudioMixer()
    /// Reflects the current mute state driven by `setReaderContext` or
    /// `.storyComposerMuteCanvas` / `.storyComposerUnmuteCanvas` notifications.
    public internal(set) var isAudioMuted: Bool = false

    /// **Le muet de CE canvas est-il verrouillé ?** (#4084)
    ///
    /// Posé par `setReaderContext` depuis `ScenePlayerConfig.locksMute`. Une
    /// carte de fil est muette PAR CONSTRUCTION ; sans ce champ, le verrou
    /// n'existait qu'au niveau du prop et n'atteignait le canvas qu'à la passe
    /// de rendu suivante. Entre les deux, une notification DIFFUSÉE gagnait.
    public internal(set) var muteIsLocked: Bool = false
    /// `slideAudioRevision` contre laquelle `audioMixer` a été configuré la
    /// dernière fois. Permet à `reconfigureAudioForPlayback()` de sauter le
    /// rechargement (coûteux) des `AVAudioFile` tant que la COMPOSITION de la
    /// slide n'a pas bougé — `rebuildLayers()` tourne à chaque tick de
    /// display-link en `.play` et à chaque frappe en `.edit`, alors que le
    /// modèle audio, lui, ne change qu'à l'ajout/retrait d'un objet.
    /// `nil` = garde levée : la prochaine passe reconfigure et re-planifie
    /// (changement de contexte / de langue, entrée-sortie de preview timeline).
    var lastAudioConfigRevision: UInt64?

    /// `true` while this view holds a balanced `.playback` claim on the shared
    /// `MediaSessionCoordinator` (RC4.3). Keeps request/release symmetric.
    /// `nonisolated(unsafe)` so the `nonisolated deinit` can read it to decide
    /// whether to release the session — all mutations happen in MainActor
    /// playback methods, so single-context mutation is preserved.
    nonisolated(unsafe) var didRequestPlaybackSession: Bool = false

    /// Subscription to `MediaSessionCoordinator.events` — pauses the mixer on
    /// interruptions / headset unplug and resumes it on an explicit
    /// shouldResume while the viewer is still foreground (RC4.3 / T7).
    /// `nonisolated(unsafe)` so the `nonisolated deinit` can cancel it without
    /// a MainActor hop — `AnyCancellable.cancel()` is idempotent and the
    /// property is only assigned once, from a MainActor init path.
    nonisolated(unsafe) var audioSessionEventsCancellable: AnyCancellable?

    /// Souscription au `$muted` du `StoryReaderAudioMuteRegistry` partagé. Le
    /// chip foreground du reader pousse sur la registry ; on diff l'ensemble
    /// publié contre `lastAppliedMutedSet` pour n'appeler `setMute(_:for:)`
    /// que pour les pistes qui ont effectivement changé d'état.
    nonisolated(unsafe) var muteRegistryCancellable: AnyCancellable?
    var lastAppliedMutedSet: Set<String> = []

    /// KVO tokens watching foreground video readiness so `onContentReady`
    /// does not fire while a foreground clip is still a black rectangle (T6).
    var foregroundVideoStatusObservers: [NSKeyValueObservation] = []

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
    var foregroundVideoReadinessFailsafe: Task<Void, Never>?

    /// Set by `foregroundVideoReadinessFailsafe` when the foreground gate has
    /// waited past its window. Lets `fireContentReadyIfNeeded()` proceed even
    /// though a foreground clip is still `.unknown` — the clip remains a
    /// timeline component that appears once its bytes land. Reset on every
    /// `scheduleContentReadyEvaluation` (new slide / rebuild).
    var foregroundReadinessTimedOut: Bool = false

    // MARK: - Display link

    /// Drives `currentTime` advance during `.play` mode (preferred 60 Hz, range 60–120).
    // `nonisolated(unsafe)` : invalidé par le `nonisolated deinit` (backstop
    // pour un canvas qui reçoit `setMode` mais n'entre jamais en window —
    // willMove/didMove ne couvrent pas ce chemin). Le link cible un
    // `WeakDisplayLinkTarget`, donc le deinit est atteignable.
    nonisolated(unsafe) var displayLink: CADisplayLink?

    /// Runs while in `.edit` and the view is in a window — preferred 120 Hz on
    /// ProMotion devices for buttery gesture transforms (active rendering happens
    /// inside the gesture handlers; the tick itself only re-feeds the glass
    /// backdrop, see `refreshEditGlassBackdropIfNeeded`) so the display server
    /// keeps the high-rate clock running while editing.
    ///
    /// **Not actually always-on (issue #3906).** After
    /// `EditClockThrottle.defaultIdleDelay` seconds without a detected
    /// interaction (and no genuinely active media, e.g. a playing timeline
    /// preview), `driveEditClock(now:)` pauses this link (`isPaused = true`)
    /// and suspends the ambient edit-mode preview loop — a screen nobody is
    /// touching must not keep the GPU/decoder awake and heat the device.
    /// `noteEditInteraction()` (called from every interaction entry point:
    /// gestures, text edits, timeline scrub/play, slide mutations) resumes
    /// both instantly. See `isEditClockThrottled`.
    nonisolated(unsafe) var editDisplayLink: CADisplayLink?

    // MARK: - Inline text editing

    /// Champ d'édition en place, sous-vue du canvas. Non-nil pendant l'édition.
    var inlineEditor: StoryInlineTextEditor?
    /// Id du texte en cours d'édition en place (nil hors édition).
    public internal(set) var inlineEditingTextId: String?
    /// Notifié à chaque frappe : (textId, nouvelle chaîne).
    public var onInlineTextChanged: ((String, String) -> Void)?
    /// Notifié quand l'édition se termine (textId).
    public var onInlineTextEditEnded: ((String) -> Void)?

    /// Y (coordonnées ÉCRAN) du bord supérieur des contrôleurs de l'outil
    /// texte — chips flottantes, panneau déplié, clavier. Le texte en cours
    /// d'édition ne descend JAMAIS sous cette ligne : sa dernière ligne reste
    /// au-dessus des chips, et un texte long déborde vers le HAUT de l'écran
    /// (directive user 2026-07-30). Posé par le composer, qui mesure la rangée
    /// réellement rendue — même patron que `onBandTopYChange` pour la band.
    ///
    /// `.greatestFiniteMagnitude` (défaut) = aucun plafond connu : le texte
    /// reste centré comme avant. La conversion écran → canvas est faite par
    /// `convert(_:from: nil)`, donc elle absorbe le `scaleEffect`/`offset` que
    /// SwiftUI applique au conteneur.
    public var inlineEditFloorGlobalY: CGFloat = .greatestFiniteMagnitude {
        didSet {
            guard oldValue != inlineEditFloorGlobalY, inlineEditingTextId != nil else { return }
            reapplyInlineEditingIfNeeded()
        }
    }

    /// Y (coordonnées ÉCRAN) du bord INFÉRIEUR du bouton « Terminé », posé sous
    /// l'encoche. Symétrique de `inlineEditFloorGlobalY` : les deux bornent la
    /// ZONE d'édition, dans laquelle le bloc édité se centre (spec 2026-08-01).
    ///
    /// `.greatestFiniteMagnitude` (défaut) = aucune zone connue : le texte reste
    /// centré sur le canvas et grandit librement, comportement d'origine.
    public var inlineEditCeilingGlobalY: CGFloat = .greatestFiniteMagnitude {
        didSet {
            guard oldValue != inlineEditCeilingGlobalY, inlineEditingTextId != nil else { return }
            reapplyInlineEditingIfNeeded()
        }
    }

    /// Ombrage posé sur TOUT le canvas pendant l'édition d'un texte en place :
    /// les autres textes et éléments reculent, le texte édité — dont les
    /// glyphes sont peints par `inlineEditor`, une sous-VUE donc au-dessus de
    /// cette calque — reste net (directive user 2026-08-01).
    ///
    /// Une `CALayer` nue n'intercepte aucun toucher : le tap « ailleurs » qui
    /// sort de l'édition continue d'atteindre le canvas.
    let inlineEditScrimLayer = CALayer()

    /// Notifié lors d'un tap sur le fond (zone vide) du canvas.
    public var onBackgroundTapped: (() -> Void)?

    /// **Appui long sur une zone VIDE du canvas.**
    ///
    /// Le SDK dit ce qui a été touché ; l'hôte décide de ce que cela
    /// déclenche. C'est la même répartition que `onBackgroundTapped`, et
    /// c'est ce qui permet au composer d'y ouvrir la caméra (#4036) sans
    /// que l'atelier plein écran, qui ne branche rien, change de
    /// comportement.
    ///
    /// > Un geste ajouté à un composant PARTAGÉ doit être inerte chez qui
    /// > ne le branche pas. Une closure optionnelle le garantit par
    /// > construction — un booléen de configuration ne l'aurait pas fait.
    public var onBackgroundLongPressed: (() -> Void)?

    /// **L'appui long sur un média DE FOND demande son menu** (#5041).
    ///
    /// Distinct de `onBackgroundLongPressed`, qui appartient au viseur : la
    /// scène qui porte un fond n'est pas vide, et le geste y ouvre supprimer /
    /// ramener en avant / éditer — les mêmes verbes que le menu contextuel d'un
    /// objet de premier plan, pour que le geste ait un seul sens.
    ///
    /// **Sa présence est un FAIT que la règle lit** : tant que l'hôte ne le
    /// branche pas, `StoryCanvasBackgroundLongPress` retombe sur le viseur
    /// plutôt que de rendre le geste muet. Un composant partagé reste inerte
    /// chez qui ne le branche pas — le doc-comment ci-dessus le dit déjà de son
    /// jumeau, et la même construction le garantit ici.
    public var onBackgroundMediaLongPressed: ((String) -> Void)?

    /// **La LEVÉE d'un appui long armé sur une scène vide** (#5041).
    ///
    /// L'appui long n'émettait que son `.began` : de quoi ouvrir un viseur,
    /// jamais de quoi tenir une prise. Ces deux rappels donnent au geste sa
    /// durée — la translation pendant qu'on tient, puis le relâchement.
    ///
    /// **Ils ne sont émis que si le `.began` a passé les trois gardes.** Sans
    /// cette condition, relâcher un appui long REFUSÉ (en lecture, sur un objet,
    /// pendant une saisie) déclencherait la fin d'une prise que rien n'avait
    /// armée.
    public var onBackgroundLongPressChanged: ((CGPoint) -> Void)?

    /// Le relâchement — ou l'annulation, qui doit rendre le même verdict : un
    /// geste interrompu par le système laisserait sinon la prise ouverte.
    public var onBackgroundLongPressEnded: (() -> Void)?

    /// Le point où l'appui long ARMÉ a commencé, `nil` quand rien n'est armé.
    /// C'est lui qui porte la condition ci-dessus : sa présence EST la preuve
    /// que `.began` est passé, et sa remise à `nil` désarme.
    var backgroundLongPressOrigin: CGPoint?

    /// Miroir du zoom viewport SwiftUI (`canvasScale != 1`). Quand `true`,
    /// un double-tap sur le fond demande un reset du viewport — prioritaire
    /// sur le cycle videoFitMode, qui reste le double-tap à l'échelle 1 (C4).
    public var isViewportZoomed: Bool = false
    /// Notifié quand un double-tap fond doit réinitialiser le zoom viewport.
    public var onViewportZoomResetRequested: (() -> Void)?

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
    @MainActor static let activePlayingCanvases = NSHashTable<StoryCanvasUIView>.weakObjects()

    // MARK: - Init

    public init(slide: StorySlide, mode: RenderMode = .edit) {
        self.slide = slide
        self.mode = mode
        self.backgroundMediaObjectId = slide.effects.mediaObjects?
            .first(where: { $0.isBackground })?.id
        // Semé ici : `didSet` ne tire pas sur l'initialisation d'une propriété
        // stockée. Sans ce seed, la PREMIÈRE mutation venue (une lettre tapée)
        // comparerait la composition réelle à l'empreinte vide et relancerait
        // le son une fois — exactement ce que cette révision doit éviter.
        self.slideStructureFingerprint = Self.structureFingerprint(of: slide)
        super.init(frame: .zero)
        layer.addSublayer(rootLayer)
        rootLayer.insertSublayer(backgroundLayer, at: 0)
        rootLayer.addSublayer(itemsContainer)
        rootLayer.addSublayer(editOverlayLayer)
        editOverlayLayer.zPosition = 10_000  // always on top
        // `insertSublayer(_:above:)` plutôt qu'un `addSublayer` : l'ordre doit
        // rester déterministe quel que soit le moment où `inlineEditor` devient
        // sous-vue (première ouverture, ré-ouverture, bascule texte A → B), sa
        // calque étant alors ajoutée en fin de liste, donc au-dessus du scrim.
        inlineEditScrimLayer.backgroundColor = UIColor.black
            .withAlphaComponent(Self.inlineEditScrimAlpha).cgColor
        inlineEditScrimLayer.opacity = 0
        inlineEditScrimLayer.isHidden = true
        layer.insertSublayer(inlineEditScrimLayer, above: rootLayer)
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

    // MARK: - Rendering

    /// `true` while the story is paused via the viewer-level long-press
    /// toggle. Distinct from `isAudioMuted` (which controls volume only) —
    /// `isPlaybackPaused` freezes every clock-driven surface so the story
    /// stops as a unit (the « long-press = stop comme une vidéo »
    /// requirement).
    var isPlaybackPaused: Bool = false

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
    internal(set) public var isPlaybackStalled: Bool = false

    /// Dernière valeur émise via `onPlaybackProgressing` — emit-on-change only.
    /// Démarre à `true` : une slide commence « progressante » (non gatée).
    var lastProgressingEmitted: Bool = true

    /// Timestamp `CADisplayLink` du début du dernier épisode CONTINU de
    /// non-lecture. `nil` tant que la lecture est saine. Alimente le watchdog.
    var playbackStallSince: CFTimeInterval?

    /// C-DIR3 — début de l'épisode continu où le player primaire est `.paused`
    /// alors que toutes les portes disent « joue ». Alimente le self-heal
    /// (`StoryPlaybackHealth.shouldKickPlayback`). `nil` hors épisode.
    var playbackPausedProbeSince: CFTimeInterval?
    /// Kicks de self-heal déjà délivrés pour la session de lecture courante
    /// (reset par `resetPlaybackHealthState`). Borné par `maxPlaybackKicks`.
    var playbackSelfHealKicks: Int = 0

    /// `true` quand la slide courante porte au moins un clip audio résolu
    /// (foreground ou background). Posé de façon SYNCHRONE par
    /// `reconfigureAudioForPlayback()` (une fois par `slideContentRevision`)
    /// pour que la sonde 60 Hz `isSlideAudioPending()` ne recalcule pas la
    /// résolution d'effets à chaque tick.
    var slideHasSchedulableAudio: Bool = false

    /// Présence d'une piste audio par identifiant de média vidéo, sondée une
    /// seule fois par clip puis mémorisée.
    ///
    /// On ne peut pas s'appuyer sur `StoryAudioAvailability.videoAudioTracks` :
    /// cette table n'est alimentée que par le lecteur plein écran, alors que
    /// l'atténuation doit aussi valoir dans le composer et à l'export. Une clé
    /// absente signifie « pas encore sondé » et n'active aucune atténuation —
    /// on n'atténue jamais sur une hypothèse.
    var videoHasAudioTrack: [String: Bool] = [:]

    // MARK: - ProMotion edit-mode link

    var lastEditBackdropTimestamp: CFTimeInterval = 0

    // MARK: - Edit clock idle throttle (issue #3906)

    /// Timestamp (`CACurrentMediaTime()` domain — same as `CADisplayLink
    /// .timestamp`) of the last detected user interaction on this canvas:
    /// a gesture beginning (`gestureRecognizerShouldBegin`), an inline text
    /// keystroke (`textViewDidChange`), a timeline-preview scrub/play
    /// (`setTimelinePreview`/`setTimelinePreviewPlaying`), or a genuine
    /// model mutation reaching `slide.didSet` while editing. Re-seeded to
    /// "now" whenever `editDisplayLink` is (re)armed
    /// (`startEditDisplayLinkIfNeeded`) so a freshly opened/reattached
    /// composer always gets a full grace window before it can idle down.
    /// Feeds `EditClockThrottle.regime(...)` from `driveEditClock(now:)`.
    var lastEditInteractionAt: CFTimeInterval = 0

    /// `true` while `editDisplayLink` is idled down (paused) and the
    /// edit-mode preview loop (background/foreground video, foreground/
    /// background audio) is suspended after
    /// `EditClockThrottle.defaultIdleDelay` seconds without interaction or
    /// genuinely active media. `public internal(set)` so composer-level
    /// instrumentation and tests can observe the throttle without spinning
    /// a real `CADisplayLink`.
    public internal(set) var isEditClockThrottled: Bool = false

    // MARK: - Snap guides

    nonisolated static let snapTargets: [Double] = [0.18, 0.25, 0.5, 0.75, 0.82]
    nonisolated static let snapTolerance: Double = 0.02

    /// Cibles de snap du CADRAGE d'arrière-plan (directive user 2026-07-14 :
    /// « effet snap pour cadrer le contenu en centrant ou en collant bordure »).
    /// `0.5` = centré, `0.0`/`1.0` = collé au bord. Tolérance plus large que le
    /// foreground : le pan bg est ralenti (× 0.5), le snap doit rester perceptible.
    nonisolated static let backgroundSnapTargets: [Double] = [0.0, 0.5, 1.0]
    nonisolated static let backgroundSnapTolerance: Double = 0.035

    var snapGuideLayers: [CAShapeLayer] = []
    /// Dernières cibles de snap bg engagées (x/y) — pour n'émettre le haptic
    /// qu'à l'ENTRÉE dans une zone de snap, pas à chaque tick de drag.
    var lastBgSnapX: Double?
    var lastBgSnapY: Double?

}
