import AVFoundation
import AVKit

/// La fenêtre Picture in Picture du lecteur partagé : le contrôleur AVKit, son
/// délégué, les drapeaux de transition et la création différée. Le moteur
/// (`SharedAVPlayerManager`) en reste le propriétaire et la façade ; il remet
/// ici ce qu'il est seul à tenir (le lecteur courant, le drapeau publié
/// `isPipActive`, l'arrêt et la pause de la lecture) sous forme de closures.
@MainActor
final class SharedPipEngine {
    nonisolated deinit {}

    private let enginePlayer: () -> AVPlayer?
    private let isActive: () -> Bool
    private let setActive: (Bool) -> Void
    private let haltPlayback: () -> Void
    private let pausePlayback: () -> Void

    private var pipController: AVPictureInPictureController?
    private var pipDelegate: PipDelegate?
    /// Armé AVANT tout teardown PiP qui ne doit PAS arrêter la lecture :
    /// `stopPip()` programmatique (toggle transport, fin naturelle) et le
    /// chemin de restauration in-app (flèche de la fenêtre PiP). Consommé par
    /// le delegate `didStop` — s'il est retombé, la fenêtre a été fermée par
    /// l'utilisateur (X) et la lecture s'arrête, sinon l'audio continuerait
    /// invisible en arrière-plan.
    private var pipTeardownIsInternal = false
    /// Une fenêtre PiP a été DEMANDÉE et n'a encore ni démarré ni échoué.
    private var isPipStarting = false
    /// La surface qui a demandé le PiP s'est fermée derrière sa demande.
    private var pipFailureHaltsPlayback = false

    /// La surface qui a demandé un PiP DIFFÉRÉ, et la création qui l'attend.
    private weak var pendingPipLayer: AVPlayerLayer?
    private var pipCreationTask: Task<Void, Never>?

    init(enginePlayer: @escaping () -> AVPlayer?,
         isActive: @escaping () -> Bool,
         setActive: @escaping (Bool) -> Void,
         haltPlayback: @escaping () -> Void,
         pausePlayback: @escaping () -> Void) {
        self.enginePlayer = enginePlayer
        self.isActive = isActive
        self.setActive = setActive
        self.haltPlayback = haltPlayback
        self.pausePlayback = pausePlayback
    }

    /// PiP réellement engagé — état LIVE du contrôleur.
    var isEngaged: Bool {
        pipController?.isPictureInPictureActive == true
    }

    /// Une surface a opté pour le PiP sur la vidéo courante.
    var isConfigured: Bool {
        pipController != nil
    }

    func configure(playerLayer: AVPlayerLayer, deferred: Bool) {
        guard AVPictureInPictureController.isPictureInPictureSupported() else { return }
        guard pipController?.playerLayer !== playerLayer else { return }
        guard deferred else {
            createPipController(for: playerLayer)
            return
        }
        pendingPipLayer = playerLayer
        guard pipCreationTask == nil else { return }
        pipCreationTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: SharedAVPlayerManager.deferredPipDelay)
            // Annulée par `teardown()`, la tâche ne touche plus à rien : une
            // demande neuve a peut-être déjà pris sa place.
            guard let self, !Task.isCancelled else { return }
            self.pipCreationTask = nil
            guard let layer = self.pendingPipLayer else { return }
            self.pendingPipLayer = nil
            let player = self.enginePlayer()
            guard SharedAVPlayerManager.mayCreateDeferredPip(
                layerShowsEnginePlayer: player != nil && layer.player === player,
                alreadyServed: self.pipController?.playerLayer === layer
            ) else { return }
            self.createPipController(for: layer)
        }
    }

    private func createPipController(for playerLayer: AVPlayerLayer) {
        // Une fenêtre PiP ouverte (ou en train de s'ouvrir) garde SON
        // contrôleur : une surface qui se monte pendant ce temps — la bulle
        // restée sous un plein écran qu'on ferme — le remplacerait et tuerait
        // la fenêtre que l'utilisateur vient de demander (#9575).
        guard SharedAVPlayerManager.mayReplacePipController(isPipActive: isActive() || isEngaged || isPipStarting) else { return }
        pipController?.invalidatePlaybackState()
        let controller = AVPictureInPictureController(playerLayer: playerLayer)
        controller?.canStartPictureInPictureAutomaticallyFromInline = true
        let delegate = PipDelegate { [weak self] in
            Task { @MainActor [weak self] in
                self?.isPipStarting = false
                self?.pipFailureHaltsPlayback = false
                self?.setActive(true)
            }
        } onStop: { [weak self] in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.isPipStarting = false
                self.setActive(false)
                let wasInternal = self.pipTeardownIsInternal
                self.pipTeardownIsInternal = false
                if SharedAVPlayerManager.shouldHaltPlaybackOnPipStop(teardownWasInternal: wasInternal) {
                    self.haltPlayback()
                }
            }
        } onFailedToStart: { [weak self] in
            Task { @MainActor [weak self] in
                guard let self else { return }
                let halts = self.pipFailureHaltsPlayback
                self.isPipStarting = false
                self.pipFailureHaltsPlayback = false
                if self.isActive() { self.setActive(false) }
                // La surface qui a demandé la fenêtre s'est fermée derrière
                // elle : plus rien ne montre cette lecture, donc elle s'arrête
                // au lieu de reprendre dans une bulle sans qu'on l'ait demandé.
                if halts { self.pausePlayback() }
            }
        } onRestore: { [weak self] completion in
            Task { @MainActor [weak self] in
                // The player is already shared — nothing to restore, but the
                // upcoming `didStop` must NOT halt playback (the user asked to
                // come BACK to the video, not to close it).
                self?.pipTeardownIsInternal = true
                completion(true)
            }
        }
        controller?.delegate = delegate
        self.pipController = controller
        self.pipDelegate = delegate
    }

    func start(haltsOnFailure: Bool) -> Bool {
        guard let pipController, pipController.isPictureInPicturePossible else { return false }
        isPipStarting = true
        pipFailureHaltsPlayback = haltsOnFailure
        pipController.startPictureInPicture()
        return true
    }

    func stop() {
        // Le flag n'est armé QUE si une fenêtre PiP est réellement ouverte :
        // un no-op (`stopPictureInPicture()` sans PiP actif) laisserait sinon
        // un flag orphelin qui avalerait la PROCHAINE fermeture utilisateur.
        if pipController?.isPictureInPictureActive == true {
            pipTeardownIsInternal = true
        }
        pipController?.stopPictureInPicture()
        isPipStarting = false
        pipFailureHaltsPlayback = false
        if isActive() { setActive(false) }
    }

    /// Annule la création différée en attente, puis ferme la fenêtre.
    func teardown() {
        pipCreationTask?.cancel()
        pipCreationTask = nil
        pendingPipLayer = nil
        stop()
    }

    /// Le contrôleur part avec son délégué : aucun `didStop` ne viendra
    /// rabaisser les drapeaux, on les rabaisse ici.
    func reset() {
        pipController = nil
        pipDelegate = nil
        pipTeardownIsInternal = false
        isPipStarting = false
        pipFailureHaltsPlayback = false
    }
}

// MARK: - PIP Delegate

private final class PipDelegate: NSObject, AVPictureInPictureControllerDelegate {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    let onStart: () -> Void
    let onStop: () -> Void
    let onFailedToStart: () -> Void
    let onRestore: (@escaping (Bool) -> Void) -> Void

    init(onStart: @escaping () -> Void,
         onStop: @escaping () -> Void,
         onFailedToStart: @escaping () -> Void,
         onRestore: @escaping (@escaping (Bool) -> Void) -> Void) {
        self.onStart = onStart
        self.onStop = onStop
        self.onFailedToStart = onFailedToStart
        self.onRestore = onRestore
    }

    func pictureInPictureController(_ controller: AVPictureInPictureController,
                                     failedToStartPictureInPictureWithError error: Error) {
        onFailedToStart()
    }

    func pictureInPictureControllerDidStartPictureInPicture(_ controller: AVPictureInPictureController) {
        onStart()
    }

    func pictureInPictureControllerDidStopPictureInPicture(_ controller: AVPictureInPictureController) {
        onStop()
    }

    func pictureInPictureController(_ controller: AVPictureInPictureController,
                                     restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completion: @escaping (Bool) -> Void) {
        onRestore(completion)
    }
}
