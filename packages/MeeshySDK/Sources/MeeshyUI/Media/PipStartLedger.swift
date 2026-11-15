import Foundation

/// **Où en est l'ouverture de la fenêtre PiP du lecteur partagé** (#11041).
///
/// Une fenêtre s'ouvre de deux façons : un toucher (`requested`) ou le
/// système, qui part en PiP automatique quand l'utilisateur quitte l'app
/// (`canStartPictureInPictureAutomaticallyFromInline`) et ne s'annonce qu'au
/// rappel `willStart`. Les deux lèvent « en cours d'ouverture » : c'est ce
/// que lit le garde d'arrière-plan pour ne pas mettre en pause — donc avorter
/// — une fenêtre qui s'ouvre. `isPictureInPictureActive` ne se lève qu'à la
/// fin de l'animation, trop tard pour lui.
nonisolated struct PipStartLedger: Equatable {
    /// Une fenêtre a été demandée ou annoncée, et n'a ni démarré ni échoué.
    private(set) var isStarting = false
    /// La dernière ouverture a échoué (`failedToStart`).
    private(set) var hasFailed = false
    /// La surface qui a demandé la fenêtre s'est fermée derrière sa demande :
    /// un échec arrête alors la lecture, qui n'a plus aucun lieu.
    private(set) var failureHaltsPlayback = false
    /// Nombre d'échecs depuis la création du moteur : une attente ne compte
    /// que les échecs survenus PENDANT elle, jamais celui d'une demande
    /// ancienne restée au registre.
    private(set) var failureCount = 0

    mutating func requested(haltsOnFailure: Bool) {
        isStarting = true
        hasFailed = false
        failureHaltsPlayback = haltsOnFailure
    }

    mutating func systemWillStart() {
        isStarting = true
        hasFailed = false
    }

    mutating func didStart() {
        isStarting = false
        failureHaltsPlayback = false
    }

    /// Rend `true` si la lecture doit s'arrêter.
    mutating func failedToStart() -> Bool {
        let halts = failureHaltsPlayback
        isStarting = false
        hasFailed = true
        failureHaltsPlayback = false
        failureCount += 1
        return halts
    }

    mutating func stopped() {
        isStarting = false
        failureHaltsPlayback = false
    }

    /// Le contrôleur part : plus d'ouverture en cours ni d'échec à
    /// rapporter. Le compte des échecs, lui, ne recule jamais.
    mutating func reset() {
        self = PipStartLedger(failureCount: failureCount)
    }

    init() {}

    private init(failureCount: Int) {
        self.failureCount = failureCount
    }
}
