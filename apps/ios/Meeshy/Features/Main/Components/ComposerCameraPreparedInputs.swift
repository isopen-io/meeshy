import AVFoundation
import Foundation
import QuartzCore

/// **L'entrée de l'autre objectif, prête AVANT le toucher** (#9753, porteur
/// 2026-10-09 : « changement de caméra trop long […] préparer la session de
/// l'autre caméra, éviter la reconstruction complète »).
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
    private let lock = NSLock()
    private var inputs: [AVCaptureDevice.Position: Input] = [:]

    nonisolated deinit {}

    init() {}

    /// L'entrée prête pour `position`, retirée du stock : elle ne sert qu'une fois.
    func take(_ position: AVCaptureDevice.Position) -> Input? {
        lock.lock()
        defer { lock.unlock() }
        return inputs.removeValue(forKey: position)
    }

    /// Prépare `position` si rien n'y est prêt ; `make` ne s'appelle que dans ce cas.
    func prepare(_ position: AVCaptureDevice.Position, make: () -> Input?) {
        lock.lock()
        let pret = inputs[position] != nil
        lock.unlock()
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
        lock.lock()
        defer { lock.unlock() }
        return inputs[position] != nil
    }

    func reset() {
        lock.lock()
        inputs = [:]
        lock.unlock()
    }

    private func store(_ entree: Input, for position: AVCaptureDevice.Position) {
        lock.lock()
        inputs[position] = entree
        lock.unlock()
    }
}

/// **Le temps de la bascule, mesuré** (#9753) : du toucher à l'objectif publié,
/// en millisecondes — relevé dans la console (`Logger.media`, « camera switch »)
/// sur l'appareil, là où il se juge.
nonisolated enum ComposerCameraSwitchTiming {
    static func milliseconds(from start: CFTimeInterval, to end: CFTimeInterval) -> Int {
        Int(((end - start) * 1000).rounded())
    }

    static func opposite(of position: AVCaptureDevice.Position) -> AVCaptureDevice.Position {
        position == .front ? .back : .front
    }
}
