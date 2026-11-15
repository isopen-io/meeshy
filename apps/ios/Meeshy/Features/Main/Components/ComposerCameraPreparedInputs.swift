import AVFoundation
import Foundation
import MeeshySDK
import QuartzCore

/// **L'entrée de l'autre objectif, prête AVANT le toucher** (#9753, éviter la reconstruction complète »).
///
/// Une bascule payait, sur la file de la session, la découverte de l'objectif
/// et la création de son `AVCaptureDeviceInput` avant même de reconfigurer. La
/// session ouverte, l'entrée de l'objectif opposé se crée au repos ; à chaque
/// bascule, l'entrée RETIRÉE est gardée pour le retour — un aller-retour ne crée
/// plus rien. Seule la reconfiguration (retirer, ajouter, valider) reste dans
/// le temps de la bascule.
///
/// Thread-safe : lue et écrite sur la file de la session, vidée à la fermeture.
nonisolated final class ComposerCameraPreparedInputs<Input: AnyObject>: @unchecked Sendable {
    private let inputs = Locked<[AVCaptureDevice.Position: Input]>(uncheckedState: [:])

    nonisolated deinit {}

    init() {}

    /// L'entrée prête pour `position`, retirée du stock : elle ne sert qu'une fois.
    func take(_ position: AVCaptureDevice.Position) -> Input? {
        inputs.mutateUnchecked { $0.removeValue(forKey: position) }
    }

    /// Prépare `position` si rien n'y est prêt ; `make` ne s'appelle que dans ce cas.
    func prepare(_ position: AVCaptureDevice.Position, make: () -> Input?) {
        let pret = inputs.mutateUnchecked { $0[position] != nil }
        guard !pret, let entree = make() else { return }
        store(entree, for: position)
    }

    /// **Après une bascule réussie, l'entrée retirée est gardée pour le retour.**
    /// Une bascule refusée (`kept`, `none`) ne garde rien : l'ancienne est en place.
    func keep(after outcome: ComposerCameraInputSwap.Outcome, removed: Input?, at position: AVCaptureDevice.Position?) {
        guard outcome == .swapped, let removed, let position else { return }
        store(removed, for: position)
    }

    func isPrepared(_ position: AVCaptureDevice.Position) -> Bool {
        inputs.mutateUnchecked { $0[position] != nil }
    }

    func reset() {
        inputs.mutateUnchecked { $0 = [:] }
    }

    private func store(_ entree: Input, for position: AVCaptureDevice.Position) {
        inputs.mutateUnchecked { $0[position] = entree }
    }
}

/// Où passe le temps d'une bascule (#9778), en millisecondes : l'attente de
/// la file, la trame de couverture, la reconfiguration (retirer, ajouter,
/// orienter, ouvrir l'objectif, valider), le zoom ré-affirmé après elle, et la
/// publication sur le fil principal.
nonisolated struct ComposerCameraSwitchPhases: Equatable, Sendable {
    var queue = 0
    var frame = 0
    var commit = 0
    var settle = 0
    var main = 0
}

/// **Le temps de la bascule, mesuré** (#9753) : du toucher à l'objectif publié,
/// en millisecondes — relevé dans la console (`Logger.media`, « camera switch »)
/// sur l'appareil, là où il se juge ; ses phases disent où il passe (#9778).
nonisolated enum ComposerCameraSwitchTiming {
    static func milliseconds(from start: CFTimeInterval, to end: CFTimeInterval) -> Int {
        Int(((end - start) * 1000).rounded())
    }

    static func report(to position: AVCaptureDevice.Position, total: Int, phases: ComposerCameraSwitchPhases) -> String {
        let objectif = position == .front ? "front" : "back"
        return "camera switch to \(objectif): \(total) ms (queue \(phases.queue) · frame \(phases.frame)"
            + " · commit \(phases.commit) · settle \(phases.settle) · main \(phases.main))"
    }

    static func opposite(of position: AVCaptureDevice.Position) -> AVCaptureDevice.Position {
        position == .front ? .back : .front
    }
}
