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

    /// L'étape du viseur — la loi est dans `ComposerSceneCamera`.
    @Published var stage: ComposerSceneCameraStage
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

    /// La durée du segment en cours, saisie À LA CLÔTURE : l'horloge du modèle
    /// repart à zéro au démarrage suivant, et le fichier n'arrive qu'après.
    private(set) var pendingSegmentDuration: TimeInterval = 0
    private var zoomAnchor: ComposerCaptureZoomAnchor?
    private var holdTask: Task<Void, Never>?
    private let defaults: UserDefaults
    private var relais: AnyCancellable?

    init(stage: ComposerSceneCameraStage = .off,
         mode: ComposerSceneCameraMode? = nil,
         camera: CameraModel = CameraModel(),
         defaults: UserDefaults = .standard) {
        self.stage = stage
        self.mode = mode
        self.camera = camera
        self.defaults = defaults
        flashIntensity = defaults.object(forKey: ComposerFlashIntensity.storageKey) as? Double
            ?? ComposerFlashIntensity.defaultLevel
        relais = camera.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }
    }

    // Deinit synthétisée ISOLÉE sous SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor :
    // double-free sur iOS 26.1 (garde : MainActorDeinitSourceGuardTests).
    nonisolated deinit {}

    // MARK: - Ce que la barre lit

    /// Le sol blanc du flash avant est-il allumé ? (#8653)
    var floorIsLit: Bool {
        ComposerFrontFlash.lightsFloor(flash: flash, position: camera.currentPosition, stage: stage)
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
            flashIntensity: flashIntensity)
    }

    // MARK: - L'armement et la sortie

    /// `configure()` demande la permission PUIS ouvre la session — un refus
    /// rend le panneau explicatif plutôt qu'un aperçu noir.
    func arm(mode: ComposerSceneCameraMode) {
        self.mode = mode
        stage = .armed
        camera.configure()
    }

    /// **Une entrée, pas un mode** : la prise rendue, le viseur se retire et la
    /// session se ferme. L'étape d'arrivée vient de la loi.
    func finishCapture() {
        stage = ComposerSceneCamera.stageAfterCapture
        mode = nil
        extinguishFlash()
        camera.stop()
    }

    /// **Désarmer** ferme la session et emporte les segments abandonnés ET
    /// leurs fichiers : la prise suivante ne repart jamais avec des segments
    /// que l'auteur croyait jetés.
    func disarm() {
        stage = .off
        mode = nil
        discardSegments()
        resetHold()
        holdStartedAt = nil
        zoomAnchor = nil
        dismissDrag = 0
        extinguishFlash()
        camera.stop()
    }

    func discardSegments() {
        for segment in segments {
            FileManager.default.removeItemLogging(
                at: segment.url, context: "segment de prise abandonné", logger: .media)
        }
        segments = []
        pendingSegmentDuration = 0
    }

    // MARK: - La prise

    /// **Un appui bref PREND une photo.** Objectif avant, flash actif : l'ÉCRAN
    /// est le flash (#8653) — la luminosité monte, l'image part sous elle.
    func takePhoto() {
        guard stage == .armed, !camera.isTakingPhoto else { return }
        mode = .photo
        HapticFeedback.medium()
        let flashDeLaPrise = flash
        guard floorIsLit else {
            camera.takePhoto(flash: flashDeLaPrise)
            return
        }
        ComposerScreenFlash.shared.light(level: flashIntensity)
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(ComposerFrontFlash.brightnessRamp * 1_000_000_000))
            camera.takePhoto(flash: flashDeLaPrise)
            try? await Task.sleep(nanoseconds: UInt64(ComposerFrontFlash.photoHold * 1_000_000_000))
            ComposerScreenFlash.shared.restore()
        }
    }

    /// **La prise commence.** Un cadenas atteint pendant l'ouverture de la
    /// caméra (#8671) la fait partir DÉJÀ verrouillée ; la vidéo s'éclaire
    /// aussi (#8653), à l'intensité du curseur.
    func startFilming() {
        guard stage == .armed else { return }
        mode = ComposerShutterGesture.mode(locked: holdPhase == .locked)
        stage = .recording
        camera.setTorch(ComposerFrontFlash.torch(flash: flash, position: camera.currentPosition),
                        level: flashIntensity)
        if floorIsLit { ComposerScreenFlash.shared.light(level: flashIntensity) }
        Task { @MainActor in
            await camera.enableAudioCaptureIfNeeded()
            camera.startRecording()
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

    /// **`✓` concatène et rend.** Un segment unique EST le fichier final ; une
    /// concaténation qui échoue retombe sur le dernier segment plutôt que de
    /// perdre la prise entière.
    func validateSegments(deliver: @escaping @MainActor (URL) -> Void) {
        let pris = segments
        guard ComposerCaptureSegments.canValidate(pris) else { return }
        segments = []
        Task { @MainActor in
            let finale = ComposerCaptureSegments.needsMerge(pris)
                ? await CameraModel.mergeSegments(pris.map(\.url))
                : pris.first?.url
            guard let url = finale ?? pris.last?.url else { return }
            deliver(url)
        }
    }

    // MARK: - La tenue, le cadenas, la levée

    /// **Le toucher prend la photo** dès que la session peut écrire — un
    /// toucher arrivé trop tôt attend plutôt que de se perdre.
    func photographWhenReady() {
        holdTask?.cancel()
        holdTask = Task { @MainActor in
            guard await camera.waitUntilCaptureReady(timeout: ComposerSceneQuickCapture.readinessTimeout),
                  !Task.isCancelled else { return }
            takePhoto()
        }
    }

    /// **L'appui long FILME** dès que la session peut écrire, et dure tant que
    /// le doigt reste — ou au-delà, verrouillé.
    func beginHold() {
        guard holdStartedAt == nil else { return }
        HapticFeedback.medium()
        holdStartedAt = Date()
        holdPhase = .holding
        lockProgress = 0
        holdTask?.cancel()
        holdTask = Task { @MainActor in
            guard await camera.waitUntilCaptureReady(timeout: ComposerSceneQuickCapture.readinessTimeout),
                  !Task.isCancelled,
                  holdStartedAt != nil || holdPhase == .locked else { return }
            startFilming()
        }
    }

    /// **Le doigt glisse pendant la tenue** : à DROITE il verrouille, à la
    /// verticale il zoome (#8671). Le verrou est idempotent.
    func holdChanged(_ translation: CGPoint) {
        guard holdStartedAt != nil else { return }
        if stage == .recording { dragZoom(translationY: translation.y) }
        guard holdPhase != .locked else { return }
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
        holdPhase = nil
        lockProgress = 0
    }

    // MARK: - Le zoom et le flash

    /// Le premier glissé s'ANCRE sur le facteur courant et la course déjà
    /// faite : l'appui long a pu bouger avant que la caméra filme.
    func dragZoom(translationY: CGFloat) {
        guard ComposerCaptureHold.verticalDrag(stage: stage) == .zoom else { return }
        let ancre = zoomAnchor ?? ComposerCaptureZoomAnchor(factor: camera.zoomFactor, translationY: translationY)
        zoomAnchor = ancre
        camera.setZoom(ComposerCaptureZoom.factor(
            from: ancre.factor, translationY: translationY - ancre.translationY, range: camera.zoomRange))
    }

    func endZoomDrag() {
        zoomAnchor = nil
    }

    /// VoiceOver ne glisse pas : il incrémente.
    func stepZoom(up: Bool) {
        camera.setZoom(ComposerCaptureZoom.stepped(camera.zoomFactor, up: up, range: camera.zoomRange))
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
        guard stage == .recording, camera.currentPosition == .back else { return }
        camera.setTorch(ComposerFrontFlash.torch(flash: flash, position: .back), level: flashIntensity)
    }

    /// Éteint tout ce que le flash a allumé — torche et luminosité.
    func extinguishFlash() {
        camera.setTorch(.off)
        ComposerScreenFlash.shared.restore()
    }
}
