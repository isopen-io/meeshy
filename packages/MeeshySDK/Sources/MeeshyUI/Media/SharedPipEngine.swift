import AVFoundation
import AVKit
import Combine
import MeeshySDK
import os

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
    /// L'ouverture en cours — demandée par un toucher OU annoncée par le
    /// système (`willStart` de l'auto-PiP en sortie d'app, #11041).
    private var startLedger = PipStartLedger()

    /// Une ouverture a échoué (`failedToStart`). L'app s'y abonne : en
    /// arrière-plan, la vidéo n'a alors plus de lieu et doit s'arrêter.
    let startFailures = PassthroughSubject<Void, Never>()

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
        #if DEBUG
        if simulatesControllerForTesting { return true }
        #endif
        return pipController != nil
    }

    #if DEBUG
    /// Le simulateur ne fait pas de PiP : un test pose une fenêtre que le
    /// système est en train d'ouvrir (`willStart` de l'auto-PiP).
    private var simulatesControllerForTesting = false

    func simulateSystemStartForTesting() {
        simulatesControllerForTesting = true
        startLedger.systemWillStart()
    }
    #endif

    /// Une fenêtre s'ouvre (demandée ou automatique) sans avoir encore
    /// démarré ni échoué.
    var isStarting: Bool { startLedger.isStarting }

    /// La dernière ouverture a échoué.
    var hasFailedToStart: Bool { startLedger.hasFailed }

    /// Nombre d'échecs d'ouverture depuis la création du moteur.
    var startFailureCount: Int { startLedger.failureCount }

    /// AVKit accepterait d'ouvrir une fenêtre maintenant (journal seulement :
    /// la valeur bascule pendant la transition d'arrière-plan).
    var isPossible: Bool { pipController?.isPictureInPicturePossible == true }

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
            // Annulée par `teardown()`, la tâche ne touche plus à rien : une
            // demande neuve a peut-être déjà pris sa place.
            guard await cancellableSleep(for: SharedAVPlayerManager.deferredPipDelay), let self else { return }
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
        guard SharedAVPlayerManager.mayReplacePipController(isPipActive: isActive() || isEngaged || startLedger.isStarting) else { return }
        pipController?.invalidatePlaybackState()
        let controller = AVPictureInPictureController(playerLayer: playerLayer)
        controller?.canStartPictureInPictureAutomaticallyFromInline = true
        Logger.pip.info("controller created — exists=\(controller != nil, privacy: .public) possible=\(controller?.isPictureInPicturePossible ?? false, privacy: .public)")
        let delegate = PipDelegate(onWillStart: { [weak self] in
            Task { @MainActor [weak self] in
                self?.startLedger.systemWillStart()
            }
        }, onStart: { [weak self] in
            Task { @MainActor [weak self] in
                self?.startLedger.didStart()
                self?.setActive(true)
            }
        }, onStop: { [weak self] in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.startLedger.stopped()
                self.setActive(false)
                let wasInternal = self.pipTeardownIsInternal
                self.pipTeardownIsInternal = false
                if SharedAVPlayerManager.shouldHaltPlaybackOnPipStop(teardownWasInternal: wasInternal) {
                    self.haltPlayback()
                }
            }
        }, onFailedToStart: { [weak self] in
            Task { @MainActor [weak self] in
                guard let self else { return }
                let halts = self.startLedger.failedToStart()
                if self.isActive() { self.setActive(false) }
                // La surface qui a demandé la fenêtre s'est fermée derrière
                // elle : plus rien ne montre cette lecture, donc elle s'arrête
                // au lieu de reprendre dans une bulle sans qu'on l'ait demandé.
                if halts { self.pausePlayback() }
                self.startFailures.send(())
            }
        }, onRestore: { [weak self] completion in
            Task { @MainActor [weak self] in
                // The player is already shared — nothing to restore, but the
                // upcoming `didStop` must NOT halt playback (the user asked to
                // come BACK to the video, not to close it).
                self?.pipTeardownIsInternal = true
                completion(true)
            }
        })
        controller?.delegate = delegate
        self.pipController = controller
        self.pipDelegate = delegate
    }

    func start(haltsOnFailure: Bool) -> Bool {
        guard let pipController, pipController.isPictureInPicturePossible else {
            Logger.pip.info("manual start refused — controller=\(self.pipController != nil, privacy: .public) possible=false")
            return false
        }
        startLedger.requested(haltsOnFailure: haltsOnFailure)
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
        startLedger.stopped()
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
        startLedger.reset()
        #if DEBUG
        simulatesControllerForTesting = false
        #endif
    }
}

// MARK: - PIP Delegate

private final class PipDelegate: NSObject, AVPictureInPictureControllerDelegate {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    let onWillStart: () -> Void
    let onStart: () -> Void
    let onStop: () -> Void
    let onFailedToStart: () -> Void
    let onRestore: (@escaping (Bool) -> Void) -> Void

    init(onWillStart: @escaping () -> Void,
         onStart: @escaping () -> Void,
         onStop: @escaping () -> Void,
         onFailedToStart: @escaping () -> Void,
         onRestore: @escaping (@escaping (Bool) -> Void) -> Void) {
        self.onWillStart = onWillStart
        self.onStart = onStart
        self.onStop = onStop
        self.onFailedToStart = onFailedToStart
        self.onRestore = onRestore
    }

    /// Le seul signal d'un PiP AUTOMATIQUE (sortie d'app) avant la fin de
    /// son animation : sans lui, le garde d'arrière-plan croyait la vidéo
    /// sans fenêtre et la mettait en pause (#11041).
    func pictureInPictureControllerWillStartPictureInPicture(_ controller: AVPictureInPictureController) {
        Logger.pip.info("willStart")
        onWillStart()
    }

    func pictureInPictureController(_ controller: AVPictureInPictureController,
                                     failedToStartPictureInPictureWithError error: Error) {
        Logger.pip.error("failedToStart — \(error.localizedDescription, privacy: .public) (\((error as NSError).domain, privacy: .public) \((error as NSError).code, privacy: .public))")
        onFailedToStart()
    }

    func pictureInPictureControllerDidStartPictureInPicture(_ controller: AVPictureInPictureController) {
        Logger.pip.info("didStart")
        onStart()
    }

    func pictureInPictureControllerDidStopPictureInPicture(_ controller: AVPictureInPictureController) {
        Logger.pip.info("didStop")
        onStop()
    }

    func pictureInPictureController(_ controller: AVPictureInPictureController,
                                     restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completion: @escaping (Bool) -> Void) {
        onRestore(completion)
    }
}
