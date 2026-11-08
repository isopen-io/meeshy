import AVFoundation
import Foundation
import QuartzCore

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

    /// La session — ou la couche d'aperçu — voyage avec la file, qui seule la touche.
    private struct Target<Value>: @unchecked Sendable {
        let value: Value
    }

    var wantsToRun: Bool {
        lock.lock()
        defer { lock.unlock() }
        return wantsRunning
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
        let cible = Target(value: session)
        // Capture FORTE : un modèle libéré juste après `stop()` ne laisse pas la
        // session tourner — la file n'est retenue que le temps du bloc.
        queue.async {
            self.lock.lock()
            let voulu = self.wantsRunning
            self.lock.unlock()
            if voulu, !cible.value.isRunning { cible.value.startRunning() }
            if !voulu, cible.value.isRunning { cible.value.stopRunning() }
        }
    }

    /// **La session s'est arrêtée sans qu'on le demande** (#10308) — erreur
    /// d'exécution, interruption levée : elle repart si le viseur la veut
    /// encore, jamais après un désarmement. AVFoundation ne la relance pas, et
    /// l'aperçu garderait sa dernière image, figée.
    func resumeIfWanted(_ session: any ComposerCaptureRunning) {
        let cible = Target(value: session)
        queue.async {
            self.lock.lock()
            let voulu = self.wantsRunning
            self.lock.unlock()
            if voulu, !cible.value.isRunning { cible.value.startRunning() }
        }
    }

    /// **La couche d'aperçu se rattache ICI** (#17041). `layer.session = …`
    /// ajoute ou retire la couche de la session et VALIDE une configuration :
    /// le fil qui l'écrit attend la file de capture — 1,12 s mesurée depuis
    /// `makeUIView`. Sur la file, il passe dans l'ordre des configurations ;
    /// la transaction explicite valide la couche sur place, sans attendre la
    /// boucle d'un fil qui n'en a pas.
    func attach(_ layer: AVCaptureVideoPreviewLayer, to session: AVCaptureSession?) {
        let couche = Target(value: layer)
        let cible = Target(value: session)
        queue.async {
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            couche.value.session = cible.value
            CATransaction.commit()
        }
    }

    /// Et sa connexion s'y règle (#10308, #17041) : `isEnabled` sur une session
    /// en marche la reconfigure — 9,03 s mesurées depuis le fil principal.
    func enableConnection(of layer: AVCaptureVideoPreviewLayer, _ enabled: Bool) {
        let couche = Target(value: layer)
        queue.async {
            guard let connexion = couche.value.connection, connexion.isEnabled != enabled else { return }
            connexion.isEnabled = enabled
        }
    }

    /// Attend que la file ait tout exécuté — pour les témoins.
    func drain() {
        queue.sync {}
    }
}
