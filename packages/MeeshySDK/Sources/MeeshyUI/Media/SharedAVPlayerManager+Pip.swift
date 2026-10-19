import AVFoundation
import Combine

// MARK: - Picture-in-Picture — façade publique de `SharedPipEngine`

extension SharedAVPlayerManager {

    /// PiP réellement engagé — état LIVE du contrôleur, pas le `@Published`
    /// `isPipActive` qui traverse un hop MainActor.
    public var isPipEngaged: Bool {
        pip.isEngaged
    }

    /// Une surface a opté pour le PiP sur la vidéo courante (le simulateur ne
    /// supporte pas le PiP : toujours `false` là-bas).
    public var isPipConfigured: Bool {
        pip.isConfigured
    }

    /// Une fenêtre PiP s'ouvre ou est ouverte. « S'ouvre » se lève dès le
    /// `willStart` de l'auto-PiP en sortie d'app (#11041) : c'est ce que lit
    /// le garde d'arrière-plan pour ne pas mettre en pause — donc avorter —
    /// une fenêtre que le système est en train d'ouvrir.
    public var isPipStartingOrEngaged: Bool {
        pip.isStarting || pip.isEngaged
    }

    /// AVKit accepterait d'ouvrir une fenêtre maintenant — pour le journal :
    /// la valeur bascule pendant la transition d'arrière-plan, elle ne décide
    /// de rien.
    public var isPipPossible: Bool {
        pip.isPossible
    }

    /// La dernière ouverture de fenêtre PiP a échoué.
    public var hasPipFailedToStart: Bool {
        pip.hasFailedToStart
    }

    /// Chaque échec d'ouverture d'une fenêtre PiP. L'app s'y abonne pour
    /// arrêter, en arrière-plan, une vidéo restée sans lieu.
    public var pipStartFailures: AnyPublisher<Void, Never> {
        pip.startFailures.eraseToAnyPublisher()
    }

    /// Attend (borné) que l'auto-PiP se DÉCLARE pendant la transition vers
    /// l'arrière-plan — `willStart`, `didStart` ou un échec survenu PENDANT
    /// l'attente (celui d'une demande ancienne ne compte pas). AVKit l'annonce
    /// d'ordinaire avant que la scène ne passe en `.background` ; l'attente
    /// n'est qu'un filet pour un `willStart` arrivé juste après. Rend `true`
    /// si une fenêtre s'ouvre ou est ouverte.
    public func waitForPipHandOff(timeout: TimeInterval) async -> Bool {
        let failuresBefore = pip.startFailureCount
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if pip.startFailureCount > failuresBefore { return false }
            if isPipStartingOrEngaged { return true }
            try? await Task.sleep(for: .milliseconds(50))
        }
        return isPipStartingOrEngaged
    }

    /// Attach PIP to a given AVPlayerLayer. Call this from the UIViewRepresentable that hosts the player.
    ///
    /// `deferred` (#10354) : le lecteur de réels demande son contrôleur pour
    /// la page POSÉE ; la création attend `deferredPipDelay`, coalescée — une
    /// rafale de demandes (montage, `load()`, mise à jour) n'en crée qu'un, et
    /// une demande dont la couche ne montre plus le moteur ne crée rien. Le
    /// passage automatique en arrière-plan
    /// (`canStartPictureInPictureAutomaticallyFromInline`) reste posé.
    public func configurePip(playerLayer: AVPlayerLayer, deferred: Bool = false) {
        pip.configure(playerLayer: playerLayer, deferred: deferred)
    }

    /// Demande la fenêtre PiP. Rend `true` si la demande est PARTIE — la
    /// surface qui se ferme derrière sait alors que la lecture a un autre lieu.
    ///
    /// `haltsOnFailure` : la surface qui demande va se FERMER (sortie du plein
    /// écran). Si la fenêtre échoue à s'ouvrir, la lecture s'arrête plutôt que
    /// de continuer sans lieu. Une surface qui reste à l'écran le laisse à
    /// `false` : en cas d'échec, elle joue toujours.
    ///
    /// `isPipActive` ne se lève qu'au rappel `didStart` : la couche d'origine
    /// doit rester montée pendant l'ouverture, et le verdict de montage la
    /// démonterait. L'ouverture en cours protège le contrôleur d'ici là.
    @discardableResult
    public func startPip(haltsOnFailure: Bool = false) -> Bool {
        pip.start(haltsOnFailure: haltsOnFailure)
    }

    public func stopPip() {
        pip.stop()
    }

    #if DEBUG
    /// Test seam — une fenêtre PiP automatique s'ouvre (`willStart`).
    public func simulateSystemPipStartForTesting() {
        pip.simulateSystemStartForTesting()
    }

    /// Test seam — oublie le contrôleur et l'ouverture simulés.
    public func resetPipForTesting() {
        pip.reset()
    }
    #endif
}
