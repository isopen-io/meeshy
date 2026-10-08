import SwiftUI
import AVFoundation
import Combine
import MeeshySDK

/// **La machine d'état de capture du viseur du composeur — UNE pour ses deux
/// montages** (#9134).
///
/// Le viseur en scène (`MeeshyComposerHost+Viewfinder`) et le viseur servi seul
/// en plein écran (`ComposerViewfinder`, #9125) câblaient chacun, sur leurs
/// propres états, la tenue, le cadenas, le zoom au glissé, le flash d'écran,
/// les segments et le `✓` : deux écritures des mêmes lois, qui divergent au
/// premier réglage. Les lois restent pures et vivent à leur place
/// (`ComposerCaptureHold`, `ComposerShutterGesture`, `ComposerCaptureSegments`,
/// `ComposerFrontFlash`, `ComposerCaptureZoom`) ; leur CÂBLAGE vit ici, une
/// fois. Chaque montage n'ajoute que ce qui lui est propre — l'hôte, l'armement
/// par la scène et la pose ; le plein écran, la remise par `onCapture`.
///
/// La session de capture appartient à CETTE machine, donc à la vue qui la
/// détient en `@StateObject` : un singleton laisserait la caméra ouverte après
/// la fermeture du composer.
@MainActor
final class ComposerCaptureSession: ObservableObject {

    /// Le modèle est construit MUET : `CameraModel` n'ouvre sa session qu'à la
    /// demande.
    let camera: CameraModel
    /// Les COMMANDES de l'objectif (#9464) — `camera` en temps normal, une
    /// doublure dans les témoins ; les vues lisent `camera`.
    let controls: any ComposerCaptureCameraProviding
    /// Le pont toucher → capteur de l'aperçu partagé (#9295) : l'aperçu s'y
    /// accroche, le toucher du chrome le lit.
    let focusPoints = CameraPreviewFocusPoints()

    /// L'étape du viseur — la loi est dans `ComposerSceneCamera`. Le guet des
    /// trames la suit : la bande peint dès le viseur armé (#9351).
    @Published var stage: ComposerSceneCameraStage {
        didSet { refreshFeed() }
    }
    /// La pastille annoncée ; `nil` tant que rien n'est armé.
    @Published var mode: ComposerSceneCameraMode?
    @Published var flash: AVCaptureDevice.FlashMode = .off
    /// L'intensité du flash, mémorisée d'un viseur à l'autre (#8671).
    @Published private(set) var flashIntensity: Double
    /// Les segments de la prise en cours (#4099) — chacun un FICHIER déjà écrit.
    @Published var segments: [ComposerCaptureSegment] = []
    /// L'instant où le doigt s'est posé, `nil` sans appui long en cours. Sa
    /// présence est aussi le témoin qui rend la levée sûre.
    @Published var holdStartedAt: Date?
    /// Le cadenas (#8671) : `.locked` dès que le glissé l'atteint, jusqu'au stop.
    @Published var holdPhase: ComposerCaptureHold.Phase?
    @Published var lockProgress: Double = 0
    /// La course du glissement qui range le viseur, pendant que le doigt est posé.
    @Published var dismissDrag: CGFloat = 0
    /// **Le look choisi EN DIRECT** (#9329) — un filtre et un cadre de l'appel.
    /// Le guet des trames ne s'arme qu'avec lui : sans look, aucune trame retenue.
    @Published var look = ComposerPhotoLook() {
        didSet { refreshFeed() }
    }
    /// La famille dont la bande est ouverte ; `nil` ⇒ la bande se replie sur la
    /// seule miniature choisie, qui sert de déclencheur (#9351).
    @Published var openFamily: ComposerLookFamily? {
        didSet { refreshFeed() }
    }
    /// Les proportions de ce que le viseur montre (#9557) : l'aperçu les mesure,
    /// tout ce qui part les garde. Une carte 9:16 tant que rien n'est monté.
    var canvasAspect = ComposerLookPainter.designAspect
    /// Le cadrage de la prise ; la retouche le règle (#9352).
    @Published var framing = ComposerFraming.identity
    /// On vise, ou on retouche (#9352).
    @Published var phase = ComposerCapturePhase.capturing
    /// Les proportions de la scène de retouche (#9567) — ce qui partira ;
    /// `nil` hors retouche.
    @Published var editAspect: CGFloat?
    /// Les proportions par presets sont ouvertes sous la scène.
    @Published var cropPresetsOpen = false
    /// La photo figée de l'édition, debout.
    var editPhoto: CGImage?
    /// Les octets de la prise : leur EXIF suit le rendu final.
    var editPhotoData: Data?
    /// Ce que le peintre lit en édition : la photo figée, ou la vidéo en boucle.
    var editSource: (any ComposerFrameSourcing)?
    /// La vidéo en boucle de l'édition (#9352).
    var loopPlayer: (any ComposerLoopPlayerProviding)?
    /// La plage gardée de la vidéo éditée (#9353).
    @Published var trim: ClosedRange<TimeInterval>?
    /// La plage que la boucle JOUE : celle du dernier geste fini.
    var loopedTrim: ClosedRange<TimeInterval>?
    /// Ce qui ouvre la boucle d'un fichier — une doublure dans les témoins.
    let loopPlayerFactory: @MainActor (URL) async -> (any ComposerLoopPlayerProviding)?
    /// Les segments s'assemblent, ou la vidéo se rend avec son look : le `✓`
    /// attend, et le dit.
    @Published var isRenderingLook = false
    /// La flèche ⬇︎ de la retouche (#9684) : la prise ne s'enregistre qu'une fois.
    @Published var takeSaveState = ComposerTakeSaveState.idle
    /// Ce que la capture écrit dans Photos — lu à chaque décision, jamais figé.
    let savePolicy: @MainActor () -> CaptureSavePolicy
    /// La date de la séance de prise : l'aperçu, la photo et la vidéo écrivent
    /// la MÊME dans leur cadre.
    let lookDate = Date()
    /// La température de l'appareil (#9349), guettée tant que le viseur vit.
    let thermal: any ThermalStateMonitorProviding
    /// Ce que l'aperçu et la bande ont le droit de coûter maintenant.
    @Published private(set) var thermalBudget = ComposerThermalBudget.budget(for: .nominal)
    /// Où part la prochaine vidéo DEMANDÉE (#9351) : la scène mène à l'édition,
    /// la miniature choisie à la galerie. Une photo porte la sienne en paramètre.
    var filmIntent = ComposerTakeIntent.edit
    /// L'intention de la photo EN VOL, figée quand l'obturateur part.
    var photoInFlightIntent = ComposerTakeIntent.edit
    /// La rampe du flash avant (0,25 s) : l'obturateur est parti, `isTakingPhoto`
    /// pas encore — une seconde demande y est refusée.
    var photoIsRamping = false
    /// L'écran éclaire une photo, de la rampe à la fin de la prise (#9566).
    @Published var screenFlashBurst = false
    /// La tenue attend la livraison de la prise précédente : ni haptique, ni
    /// cadenas, ni lumière tant qu'elle ne filme pas.
    var awaitsPreviousTake = false
    /// L'intention de chaque enregistrement, par SON jeton (`CameraModel.recordingId`) :
    /// une fin sans fichier ne décale jamais la suivante.
    var filmIntents: [String: ComposerTakeIntent] = [:]
    /// Les enregistrements en galerie passent un par un : jamais deux rendus
    /// pleine définition en mémoire à la fois.
    var galleryChain: Task<Void, Never>?
    /// Qui reçoit la prise de la scène — posé par l'hôte qui monte la capture,
    /// retiré au désarmement : un viseur fermé ne remet plus rien.
    var onDeliver: (@MainActor (CameraResult) -> Void)?
    let gallery: any ComposerGalleryProviding
    let scenes: any ComposerLookSceneProviding
    var takeSubscriptions = Set<AnyCancellable>()
    /// Les rendus qui partent en galerie pendant qu'on reste en capture.
    @Published private(set) var pendingGallerySaves = 0
    /// Chaque désarmement ouvre une nouvelle génération : un rendu lancé avant
    /// ne remet plus rien à un viseur que l'auteur a fermé.
    private(set) var renderGeneration = 0

    /// La durée du segment en cours, saisie À LA CLÔTURE : l'horloge du modèle
    /// repart à zéro au démarrage suivant, et le fichier n'arrive qu'après.
    private(set) var pendingSegmentDuration: TimeInterval = 0
    var zoomAnchor: ComposerCaptureZoomAnchor?
    /// Le facteur au premier écart des doigts, `nil` hors pincement (#9295).
    var pinchAnchor: CGFloat?
    /// Deux doigts sont posés : ni le rangement, ni l'appui long, ni un
    /// toucher ne partent.
    private(set) var isPinching = false
    private var pinchEndedAt: Date?
    /// Un appui long qu'un pincement a annulé ne repart pas quand un doigt se
    /// lève : seule la levée de CE geste (`endHold`) le libère.
    private var holdSpoiledByPinch = false
    /// Le glissé de rangement en cours, et s'il a croisé un pincement.
    private var dismissDragActive = false
    private var dismissDragSpoiled = false
    private var holdTask: Task<Void, Never>?
    /// L'armement, et le dernier toucher du viseur (#9464) : un double ne
    /// s'ouvre jamais sur le toucher qui a armé.
    var armedAt: Date?
    var lastViewfinderTap: ComposerCaptureLastTap?
    private let defaults: UserDefaults
    private var relais: AnyCancellable?

    init(stage: ComposerSceneCameraStage = .off,
         mode: ComposerSceneCameraMode? = nil,
         camera: CameraModel = CameraModel(),
         controls: (any ComposerCaptureCameraProviding)? = nil,
         defaults: UserDefaults = .standard,
         thermal: (any ThermalStateMonitorProviding)? = nil,
         gallery: any ComposerGalleryProviding = ComposerGallery.shared,
         scenes: any ComposerLookSceneProviding = ComposerLookSceneCache.shared,
         savePolicy: (@MainActor () -> CaptureSavePolicy)? = nil,
         loopPlayerFactory: @escaping @MainActor (URL) async -> (any ComposerLoopPlayerProviding)? = {
             await ComposerLoopPlayer.load(url: $0)
         }) {
        self.stage = stage
        self.mode = mode
        self.camera = camera
        self.controls = controls ?? camera
        self.defaults = defaults
        self.thermal = thermal ?? ThermalStateMonitor()
        self.gallery = gallery
        self.scenes = scenes
        self.savePolicy = savePolicy ?? { CaptureSavePolicy.stored(in: defaults) }
        self.loopPlayerFactory = loopPlayerFactory
        flashIntensity = defaults.object(forKey: ComposerFlashIntensity.storageKey) as? Double
            ?? ComposerFlashIntensity.defaultLevel
        relais = camera.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }
        subscribeToTakes()
    }

    // Deinit synthétisée ISOLÉE sous SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor :
    // double-free sur iOS 26.1 (garde : MainActorDeinitSourceGuardTests).
    nonisolated deinit {}

    // MARK: - Ce que la barre lit

    /// L'écran est-il le flash ? Objectif avant, flash actif (#8653). Le
    /// montage en fait un sol blanc autour de la scène, ou un éclair à la prise
    /// en plein écran (`ComposerCapturePlacement`, #9566).
    var screenIsTheFlash: Bool {
        ComposerFrontFlash.lightsFloor(flash: flash, position: controls.currentPosition, stage: stage)
    }

    var floorWhite: Double {
        ComposerFlashIntensity.floorWhite(flashIntensity)
    }

    var barCapture: ComposerSceneCameraBar.Capture {
        ComposerSceneCameraBar.Capture(
            holding: holdStartedAt != nil,
            lockProgress: lockProgress,
            locked: holdPhase == .locked || mode == ComposerShutterGesture.mode(locked: true),
            zoomFactor: camera.zoomFactor,
            zoomPresets: ComposerCaptureZoomScale.presets(in: camera.zoomRange),
            flipping: camera.isSwitchingCamera || camera.recordingIsPending,
            flashIntensity: flashIntensity)
    }

    // MARK: - L'armement et la sortie

    /// `configure()` demande la permission PUIS ouvre la session — un refus
    /// rend le panneau explicatif plutôt qu'un aperçu noir.
    func arm(mode: ComposerSceneCameraMode) {
        resetIntents()
        self.mode = mode
        stage = .armed
        armedAt = Date()
        watchThermalState()
        camera.configure()
    }

    /// **Une entrée, pas un mode** : la prise rendue, le viseur se retire et la
    /// session se ferme. L'étape d'arrivée vient de la loi. Une retouche encore
    /// ouverte se referme avec lui : ni lecteur ni lien d'affichage ne survivent.
    func finishCapture() {
        leaveEditing()
        stage = ComposerSceneCamera.stageAfterCapture
        mode = nil
        onDeliver = nil
        extinguishFlash()
        camera.stop()
        stopWatchingThermalState()
    }

    /// **Désarmer** ferme la session et emporte les segments abandonnés ET
    /// leurs fichiers : la prise suivante ne repart jamais avec des segments
    /// que l'auteur croyait jetés.
    func disarm() {
        renderGeneration += 1
        isRenderingLook = false
        abandonEditing()
        stage = .off
        mode = nil
        resetIntents()
        onDeliver = nil
        discardSegments()
        resetHold()
        holdStartedAt = nil
        zoomAnchor = nil
        resetPinch()
        dismissDrag = 0
        extinguishFlash()
        scenes.purge()
        CallFrameRenderer.purgeLayers()
        camera.stop()
        stopWatchingThermalState()
    }

    func applyThermal(_ state: ProcessInfo.ThermalState) {
        thermalBudget = ComposerThermalBudget.budget(for: state)
        refreshFeed()
        loopPlayer?.configure(fps: ComposerCaptureSurfaceRule.editFPS(thermalBudget),
                              declaredSpace: camera.liveFeed.declaredSpace)
    }

    func discardSegments() {
        for segment in segments {
            FileManager.default.removeItemLogging(
                at: segment.url, context: "segment de prise abandonné", logger: .media)
        }
        segments = []
        pendingSegmentDuration = 0
    }

    func beginGallerySave() { pendingGallerySaves += 1 }
    func endGallerySave() { pendingGallerySaves = max(0, pendingGallerySaves - 1) }

    // MARK: - La prise

    /// **Un appui bref PREND une photo.** Objectif avant, flash actif : l'ÉCRAN
    /// est le flash (#8653) — la luminosité monte, l'image part sous elle,
    /// sans le flash de l'objectif : jamais deux éclairs (#9464).
    func takePhoto(intent: ComposerTakeIntent = .edit) {
        guard stage == .armed, !camera.isTakingPhoto, !photoIsRamping, !controls.isSwitchingCamera else { return }
        photoInFlightIntent = intent
        mode = .photo
        HapticFeedback.medium()
        let flashDeLaPrise = flash
        guard screenIsTheFlash else {
            controls.takePhoto(flash: flashDeLaPrise)
            return
        }
        ComposerScreenFlash.shared.light(level: flashIntensity)
        photoIsRamping = true
        screenFlashBurst = true
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(ComposerFrontFlash.brightnessRamp * 1_000_000_000))
            photoIsRamping = false
            guard stage == .armed else { return }
            controls.takePhoto(flash: .off)
            try? await Task.sleep(nanoseconds: UInt64(ComposerFrontFlash.photoHold * 1_000_000_000))
            screenFlashBurst = false
            guard stage == .armed else { return }
            ComposerScreenFlash.shared.restore()
        }
    }

    /// **La prise commence.** Un cadenas atteint pendant l'ouverture de la
    /// caméra (#8671) la fait partir DÉJÀ verrouillée ; la vidéo s'éclaire
    /// aussi (#8653), à l'intensité du curseur.
    func startFilming() {
        guard stage == .armed, !controls.isSwitchingCamera else { return }
        mode = ComposerShutterGesture.mode(locked: holdPhase == .locked)
        let intent = noteRecordingStarted()
        stage = .recording
        controls.setTorch(ComposerFrontFlash.torch(flash: flash, position: controls.currentPosition),
                        level: flashIntensity)
        if screenIsTheFlash { ComposerScreenFlash.shared.light(level: flashIntensity) }
        Task { @MainActor in
            await camera.enableAudioCaptureIfNeeded()
            let avant = camera.recordingId
            camera.startRecording()
            bindRecording(intent, to: camera.isRecordingVideo && camera.recordingId != avant ? camera.recordingId : nil)
        }
    }

    /// La prise continue sans le doigt : seul le mode change.
    func lockTake() {
        guard stage == .recording else { return }
        mode = ComposerShutterGesture.mode(locked: true)
    }

    /// **La prise se clôt.** La durée est saisie AVANT l'arrêt.
    func closeTake() {
        guard stage == .recording else { return }
        stage = .armed
        holdPhase = nil
        lockProgress = 0
        zoomAnchor = nil
        pendingSegmentDuration = camera.recordingDuration
        camera.stopRecording()
        extinguishFlash()
        HapticFeedback.medium()
    }

    /// **Une vidéo s'ACCUMULE** (#4099) : `✓` concatène.
    func collectSegment(_ url: URL) {
        segments.append(ComposerCaptureSegment(url: url, duration: pendingSegmentDuration))
        pendingSegmentDuration = 0
    }

    /// Retirer le dernier segment supprime son FICHIER.
    func dropLastSegment() {
        let (gardés, orphelin) = ComposerCaptureSegments.droppingLast(segments)
        segments = gardés
        if let orphelin {
            FileManager.default.removeItemLogging(
                at: orphelin, context: "segment de prise retiré par l'auteur", logger: .media)
        }
        HapticFeedback.light()
    }

    /// **`✓` assemble les segments et ouvre la retouche** (#9352, spec § 3.2) :
    /// rien ne part avant « Terminé ». Un segment unique EST le fichier ; un
    /// assemblage qui échoue retombe sur le dernier segment plutôt que de perdre
    /// la prise entière. Un viseur fermé entre-temps n'ouvre rien.
    func validateSegments() {
        let pris = segments
        guard ComposerCaptureSegments.canValidate(pris) else { return }
        segments = []
        let generation = renderGeneration
        let assemble = ComposerCaptureSegments.needsMerge(pris)
        isRenderingLook = assemble
        Task { @MainActor in
            let finale = assemble ? await CameraModel.mergeSegments(pris.map(\.url)) : pris.first?.url
            guard generation == renderGeneration else { return }
            isRenderingLook = false
            guard let url = finale ?? pris.last?.url else { return }
            await beginEditing(video: url)
        }
    }

    // MARK: - La tenue, le cadenas, la levée

    /// **Le toucher prend la photo** dès que la session peut écrire — un
    /// toucher arrivé trop tôt attend plutôt que de se perdre. La demande part
    /// où son intention la mène (#9351) — portée par l'appel : une attente
    /// annulée ou vaine ne lègue rien.
    func photographWhenReady(intent: ComposerTakeIntent = .edit) {
        holdTask?.cancel()
        holdTask = Task { @MainActor in
            guard await controls.waitUntilCaptureReady(timeout: ComposerSceneQuickCapture.readinessTimeout),
                  !Task.isCancelled else { return }
            takePhoto(intent: intent)
        }
    }

    /// **L'appui long FILME** dès que la session peut écrire, et dure tant que
    /// le doigt reste — ou au-delà, verrouillé.
    func beginHold() {
        guard holdStartedAt == nil, !isPinching, !holdSpoiledByPinch else { return }
        filmIntent = .edit
        let attend = controls.recordingIsPending
        awaitsPreviousTake = attend
        if !attend { HapticFeedback.medium() }
        holdStartedAt = Date()
        holdPhase = .holding
        lockProgress = 0
        holdTask?.cancel()
        holdTask = Task { @MainActor in
            guard await awaitPreviousTake(),
                  await controls.waitUntilCaptureReady(timeout: ComposerSceneQuickCapture.readinessTimeout),
                  !Task.isCancelled,
                  holdStartedAt != nil || holdPhase == .locked else { return }
            if attend { HapticFeedback.medium() }
            startFilming()
        }
    }

    /// **Le doigt glisse pendant la tenue** : à DROITE il verrouille, à la
    /// verticale il zoome (#8671). Le verrou est idempotent.
    func holdChanged(_ translation: CGPoint) {
        guard holdStartedAt != nil else { return }
        if stage == .recording { dragZoom(translationY: translation.y) }
        // Deux doigts qui s'écartent à l'horizontale zooment ; ils ne
        // verrouillent pas la prise.
        guard holdPhase != .locked, !isPinching, !awaitsPreviousTake else { return }
        lockProgress = ComposerShutterGesture.lockProgress(translationX: translation.x)
        guard ComposerCaptureHold.phase(translation: translation, wasLocked: false) == .locked else { return }
        holdPhase = .locked
        lockProgress = 1
        HapticFeedback.medium()
        UIAccessibility.post(notification: .announcement, argument: ComposerSceneCameraCopy.lockedAnnouncement)
        lockTake()
    }

    /// **La levée décide** selon la loi du cadenas — tenue, la prise se clôt ;
    /// verrouillée, elle continue ; pas encore partie, rien n'est pris. Une
    /// levée SANS début ne fait rien : le canvas émet sa fin même quand l'hôte
    /// a refusé l'armement.
    func endHold() {
        zoomAnchor = nil
        holdSpoiledByPinch = false
        guard holdStartedAt != nil else {
            holdTask?.cancel()
            holdTask = nil
            return
        }
        holdStartedAt = nil
        switch ComposerCaptureHold.release(isRecording: stage == .recording, phase: holdPhase ?? .holding) {
        case .closeTake:
            resetHold()
            closeTake()
        case .keepFilming:
            break
        case .cancelPending:
            resetHold()
        }
    }

    /// **Une levée perdue ne laisse pas le cadenas affiché** : le doigt posé
    /// sur le déclencheur clôt une tenue que la scène croit encore tenue.
    func releaseStaleHold() {
        guard holdStartedAt != nil else { return }
        endHold()
    }

    private func resetHold() {
        holdTask?.cancel()
        holdTask = nil
        filmIntent = .edit
        holdPhase = nil
        lockProgress = 0
    }

    // MARK: - Le zoom et le flash

    /// Le premier glissé s'ANCRE sur le facteur courant et la course déjà
    /// faite : l'appui long a pu bouger avant que la caméra filme.
    func dragZoom(translationY: CGFloat) {
        guard ComposerCaptureHold.verticalDrag(stage: stage) == .zoom, !isPinching else { return }
        let ancre = zoomAnchor ?? ComposerCaptureZoomAnchor(factor: controls.zoomFactor, translationY: translationY)
        zoomAnchor = ancre
        controls.setZoom(ComposerCaptureZoom.factor(
            from: ancre.factor, translationY: translationY - ancre.translationY, range: controls.zoomRange))
    }

    func endZoomDrag() {
        zoomAnchor = nil
    }

    /// **Le pincement zoome l'objectif** (#9295) — écarter grandit, rapprocher
    /// rétrécit, ancré sur le facteur du premier écart. Un appui long qui
    /// attendait la caméra s'annule : deux doigts posés demandent un cadrage,
    /// pas une vidéo. Une prise DÉJÀ partie continue, et se zoome.
    func pinchZoom(scale: CGFloat) {
        guard stage != .off else { return }
        if !isPinching {
            isPinching = true
            dismissDrag = 0
            dismissDragSpoiled = true
            if holdStartedAt != nil, stage != .recording {
                holdStartedAt = nil
                holdSpoiledByPinch = true
                resetHold()
            }
        }
        let ancre = pinchAnchor ?? controls.zoomFactor
        pinchAnchor = ancre
        controls.setZoom(ComposerCaptureZoom.pinched(from: ancre, scale: scale, range: controls.zoomRange))
    }

    /// Idempotente : la fin d'un pincement arrive par `onEnded` ET par l'état
    /// du geste qui retombe — y compris quand le système l'annule sans fin.
    func endPinchZoom() {
        guard isPinching else { return }
        pinchAnchor = nil
        isPinching = false
        pinchEndedAt = Date()
    }

    private func resetPinch() {
        pinchAnchor = nil
        isPinching = false
        pinchEndedAt = nil
        holdSpoiledByPinch = false
        dismissDragActive = false
        dismissDragSpoiled = false
    }

    /// Un pincement en cours, ou qui vient de finir : ses doigts ne prennent
    /// ni photo, ni mise au point, ni rangement.
    var pinchSpoilsGestures: Bool {
        ComposerCaptureZoom.pinchSpoilsGestures(isPinching: isPinching, pinchEndedAt: pinchEndedAt, now: Date())
    }

    // MARK: - Le rangement au glissé

    /// **Le glissé vers le bas range le viseur, PROGRESSIF et ANNULABLE**
    /// (directive 2026-08-30) — sauf un glissé qui a croisé un pincement :
    /// celui-là reste gâté jusqu'à sa levée, il ne saute pas à sa course
    /// entière une fois le délai passé.
    func followDismissDrag(translationY: CGFloat) {
        if !dismissDragActive {
            dismissDragActive = true
            dismissDragSpoiled = pinchSpoilsGestures
        }
        if isPinching { dismissDragSpoiled = true }
        dismissDrag = dismissDragSpoiled ? 0 : translationY
    }

    /// La levée du glissé : `true` ⇒ le viseur se range. En édition le doigt
    /// cadre le média : il ne range rien.
    func releaseDismissDrag(translationY: CGFloat) -> Bool {
        let gate = dismissDragSpoiled || isPinching
        dismissDragActive = false
        dismissDragSpoiled = false
        dismissDrag = 0
        return !gate
            && !phase.isEditing
            && ComposerCaptureHold.verticalDrag(stage: stage) == .dismiss
            && ComposerSceneCameraFrame.dismisses(translationY: translationY)
    }

    // MARK: - La mise au point (#9295)

    /// **Le toucher vise ce point du repère global.** `false` ⇒ rien n'a été
    /// visé (pas d'image, toucher hors de l'aperçu) : l'anneau ne paraît pas
    /// pour une mise au point qui n'a pas eu lieu.
    @discardableResult
    func focus(atGlobalPoint point: CGPoint) -> Bool {
        guard let local = focusPoints.localPoint(fromGlobalPoint: point) else { return false }
        return focus(atPreviewPoint: local, previewSize: focusPoints.previewFrame.size)
    }

    /// VoiceOver ne glisse pas : il incrémente.
    func stepZoom(up: Bool) {
        controls.setZoom(ComposerCaptureZoom.stepped(controls.zoomFactor, up: up, range: controls.zoomRange))
    }

    func cycleFlash() {
        flash = ComposerCameraFlash.next(after: flash)
    }

    /// Le curseur règle la lumière qui BRILLE déjà : l'écran s'il est allumé,
    /// la torche si elle éclaire une prise à l'arrière.
    func setFlashIntensity(_ level: Double) {
        flashIntensity = ComposerFlashIntensity.clamped(level)
        defaults.set(flashIntensity, forKey: ComposerFlashIntensity.storageKey)
        ComposerScreenFlash.shared.adjust(level: flashIntensity)
        guard stage == .recording, controls.currentPosition == .back else { return }
        controls.setTorch(ComposerFrontFlash.torch(flash: flash, position: .back), level: flashIntensity)
    }

    /// Éteint tout ce que le flash a allumé — torche et luminosité.
    func extinguishFlash() {
        screenFlashBurst = false
        controls.setTorch(.off, level: ComposerFlashIntensity.defaultLevel)
        ComposerScreenFlash.shared.restore()
    }
}

// MARK: - Le look en direct (#9329)

extension ComposerCaptureSession {

    /// L'auteur, tel que les cadres l'écrivent.
    var lookPerson: CallFramePerson {
        let moi = AuthManager.shared.currentUser
        return ComposerPhotoLookPerson.author(id: moi?.id, displayName: moi?.displayName, username: moi?.username)
    }

    /// Le look ne change plus une fois la prise commencée.
    var lookIsLocked: Bool {
        ComposerLiveLookRule.isLocked(stage: stage, pendingSegments: segments.count)
    }
}
