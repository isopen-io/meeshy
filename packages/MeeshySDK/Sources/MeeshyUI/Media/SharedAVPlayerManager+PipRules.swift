import Foundation

// Les verdicts PURS de la fenêtre PiP du lecteur partagé : ils ne lisent que
// leurs entrées, `SharedPipEngine` les consulte.
extension SharedAVPlayerManager {

    /// Pure, testable decision: must playback halt when the PiP window tears
    /// down? Closing the window (X) is the user saying "stop the video" —
    /// letting it run would leak invisible audio in the background. Internal
    /// teardowns (programmatic `stopPip()`, in-app restore) keep playing.
    public nonisolated static func shouldHaltPlaybackOnPipStop(teardownWasInternal: Bool) -> Bool {
        !teardownWasInternal
    }

    /// Le délai d'un PiP différé : la page vient de se poser, la création du
    /// contrôleur (≈ 3 % du fil principal mesurés au balayage, #10354) passe
    /// après la dernière image du défilement.
    nonisolated static let deferredPipDelay: Duration = .milliseconds(250)

    /// Pure : la création différée a encore un sens — la couche montre
    /// toujours le lecteur du moteur, et aucun contrôleur ne la sert déjà.
    public nonisolated static func mayCreateDeferredPip(layerShowsEnginePlayer: Bool, alreadyServed: Bool) -> Bool {
        layerShowsEnginePlayer && !alreadyServed
    }

    /// Une fenêtre PiP vivante ne change pas de contrôleur sous elle.
    public nonisolated static func mayReplacePipController(isPipActive: Bool) -> Bool {
        !isPipActive
    }
}
