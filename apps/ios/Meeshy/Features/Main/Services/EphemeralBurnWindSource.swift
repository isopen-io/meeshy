import Foundation
import CoreMotion
import UIKit
import MeeshySDK
import MeeshyUI

/// **Quand le capteur tourne, et ce qu'il lit** (#17938) — pur, hors de
/// CoreMotion, testable sans appareil.
///
/// Le vent n'est demandé qu'entre la DERNIÈRE MINUTE d'un éphémère et la fin
/// de sa combustion : un fil qui ne porte rien d'imminent ne réveille aucun
/// capteur. Sous « Réduire les animations » la combustion est un fondu, qui
/// n'a pas de vent : le capteur ne tourne pas.
nonisolated enum EphemeralBurnWindPolicy {

    /// Le filtre passe-bas de l'accélération latérale : un geste, pas une vibration.
    static let lateralSmoothing: Double = 0.2

    /// Vrai dès qu'un éphémère est dans sa dernière minute ou en combustion.
    static func wanted(deadlines: [String: Date], burning: Bool, now: Date) -> Bool {
        if burning { return true }
        return deadlines.values.contains { $0.timeIntervalSince(now) <= EphemeralDeadline.countdownThreshold }
    }

    static func sensorRuns(wanted: Bool, reduceMotion: Bool) -> Bool {
        wanted && !reduceMotion
    }

    static func smoothedLateral(previous: Double, sample: Double) -> Double {
        previous + (sample - previous) * lateralSmoothing
    }

    /// Le roulis (radians) ramené en tours, borné à ±0,5 — comme `GameTiltSource.turns`.
    static func rollTurns(fromRadians roll: Double) -> Double {
        min(0.5, max(-0.5, roll / (2 * Double.pi)))
    }
}

/// **LE VENT DE L'APPAREIL** (#17938) — ce que CoreMotion dit du téléphone,
/// versé dans l'atome `EphemeralBurnWind` du SDK que le fil pose sur ses
/// cellules. Le SDK ne tourne aucun capteur (SDK Purity) : c'est ici, dans
/// l'app, que l'on décide QUAND écouter et ce qu'on lit — le roulis et
/// l'accélération latérale, à 30 Hz, le temps d'une dernière minute.
///
/// `ingest` est séparé du capteur pour être éprouvé sans lui : un témoin lui
/// donne un roulis et une accélération, et lit le vent brut qui en sort.
@MainActor
final class EphemeralBurnWindSource {
    // Même raison que `EphemeralExpiryCoordinator` : sous SE-0466 la `deinit`
    // synthétisée serait isolée au MainActor. Garde : `MainActorDeinitSourceGuardTests`.
    nonisolated deinit {}

    /// L'atome du SDK, écrit ici et lu par `EphemeralBurnEffect`.
    let wind = EphemeralBurnWind()

    private let manager = CMMotionManager()
    private var lateral: Double = 0
    private var running = false

    /// Démarre ou arrête le capteur selon ce que le fil porte. Idempotent.
    func sync(wanted: Bool) {
        let runs = EphemeralBurnWindPolicy.sensorRuns(wanted: wanted, reduceMotion: UIAccessibility.isReduceMotionEnabled)
        if runs { start() } else { stop() }
    }

    /// Une lecture du capteur : roulis en radians, accélération latérale en g.
    func ingest(rollRadians: Double, lateralG: Double) {
        lateral = EphemeralBurnWindPolicy.smoothedLateral(previous: lateral, sample: lateralG)
        wind.raw = EphemeralBurnLaw.rawWind(
            rollTurns: EphemeralBurnWindPolicy.rollTurns(fromRadians: rollRadians),
            lateralG: lateral
        )
    }

    private func start() {
        guard !running, manager.isDeviceMotionAvailable else { return }
        running = true
        manager.deviceMotionUpdateInterval = 1.0 / 30.0
        manager.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
            guard let motion else { return }
            let roll = motion.attitude.roll
            let lateral = motion.userAcceleration.x
            Task { @MainActor in self?.ingest(rollRadians: roll, lateralG: lateral) }
        }
    }

    /// À l'arrêt, le vent redevient inconnu : une combustion qui suivrait ne
    /// doit pas hériter du dernier geste d'il y a dix minutes.
    private func stop() {
        if running {
            manager.stopDeviceMotionUpdates()
            running = false
        }
        lateral = 0
        wind.raw = nil
    }
}
