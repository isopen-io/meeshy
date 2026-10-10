import AVFoundation
import Foundation

/// Ce que la file lance et arrête — `AVCaptureSession` en production, une
/// doublure dans les témoins.
nonisolated protocol ComposerCaptureRunning: AnyObject {
    var isRunning: Bool { get }
    func startRunning()
    func stopRunning()
}

nonisolated extension AVCaptureSession: ComposerCaptureRunning {}

/// **Une seule file série pour la session de capture** (#9464).
///
/// Configurer, lancer et arrêter une `AVCaptureSession` bloque le fil qui le
/// fait ; deux `Task.detached` qui s'en chargeaient ne s'ordonnaient pas, et
/// désarmer puis réarmer vite pouvait laisser un `stopRunning` passer APRÈS le
/// `startRunning` — un viseur armé, noir. Tout passe désormais ici, dans
/// l'ordre ; l'état publié revient au fil principal.
///
/// Le lancement suit le DERNIER vœu : chaque passage relit `wantsRunning` au
/// moment où la file l'exécute, donc une rafale arme / désarme / arme finit
/// toujours en marche, et l'inverse à l'arrêt.
nonisolated final class ComposerCaptureSessionQueue: @unchecked Sendable {
    private let queue = DispatchQueue(label: "me.meeshy.composer.capture.session", qos: .userInitiated)
    private let lock = NSLock()
    private var wantsRunning = false

    /// La session voyage avec la file, qui seule la touche.
    private struct Target: @unchecked Sendable {
        let session: any ComposerCaptureRunning
    }

    func perform(_ work: @escaping @Sendable () -> Void) {
        queue.async(execute: work)
    }

    /// Une configuration dont l'appelant attend le verdict (le micro avant la prise).
    func run<Value: Sendable>(_ work: @escaping @Sendable () -> Value) async -> Value {
        await withCheckedContinuation { (continuation: CheckedContinuation<Value, Never>) in
            queue.async { continuation.resume(returning: work()) }
        }
    }

    func setRunning(_ running: Bool, _ session: any ComposerCaptureRunning) {
        lock.lock()
        wantsRunning = running
        lock.unlock()
        let cible = Target(session: session)
        // Capture FORTE : un modèle libéré juste après `stop()` ne laisse pas la
        // session tourner — la file n'est retenue que le temps du bloc.
        queue.async {
            self.lock.lock()
            let voulu = self.wantsRunning
            self.lock.unlock()
            if voulu, !cible.session.isRunning { cible.session.startRunning() }
            if !voulu, cible.session.isRunning { cible.session.stopRunning() }
        }
    }

    /// Attend que la file ait tout exécuté — pour les témoins.
    func drain() {
        queue.sync {}
    }
}
