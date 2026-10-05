import SwiftUI
import CoreMotion
import MeeshyUI

/// L'INCLINAISON DU TÉLÉPHONE (#9381) — conception, partie V : « irisation du
/// prisme selon l'inclinaison du téléphone (CoreMotion) ». Les mesures ne
/// tournent QUE tant que la vue est à l'écran : le capteur s'arrête avec elle.
@MainActor
final class GameTiltSource: ObservableObject {
    nonisolated deinit {}

    /// En tours, borné à ±0,5 ; 0 au repos.
    @Published private(set) var tilt: Double = 0

    private let manager = CMMotionManager()

    /// Le roulis (radians) ramené en tours, borné : le shader n'a pas besoin de plus.
    nonisolated static func turns(fromRoll roll: Double) -> Double {
        min(0.5, max(-0.5, roll / (2 * Double.pi)))
    }

    func start() {
        guard manager.isDeviceMotionAvailable, !manager.isDeviceMotionActive else { return }
        manager.deviceMotionUpdateInterval = 1.0 / 30.0
        manager.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
            guard let roll = motion?.attitude.roll else { return }
            let turns = GameTiltSource.turns(fromRoll: roll)
            Task { @MainActor in self?.tilt = turns }
        }
    }

    func stop() {
        manager.stopDeviceMotionUpdates()
    }
}

/// La règle de l'irisation : elle est la matière du PRISME (édition millième, rang
/// Mythe) et de lui seul — une pièce d'argent ou d'or n'en reçoit aucune. Le capteur
/// ne tourne que pour une irisation qui bouge à l'écran : figée sous « réduire les
/// animations » (le SDK la pose à une inclinaison de repos), elle n'en a pas besoin.
enum GamePrismTilt {
    static let activeIntensity = 0.6

    static func intensity(active: Bool) -> Double {
        active ? activeIntensity : 0
    }

    static func sensorRuns(active: Bool, visible: Bool, reduceMotion: Bool) -> Bool {
        active && visible && !reduceMotion
    }
}

/// Pose l'irisation du prisme sur une vue et la fait suivre le téléphone — sans
/// capteur (simulateur) elle reste au repos, jamais cassée. Inactive, elle ne peint
/// RIEN. Elle se pose sur la PIÈCE ou l'écu, jamais sur une scène qui garde un état :
/// passer d'actif à inactif change la structure du calque habillé, ce qu'une pièce
/// sans état supporte et une chorégraphie en cours non.
private struct GamePrismTiltModifier: ViewModifier {
    let active: Bool
    @StateObject private var source = GameTiltSource()
    @State private var visible = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .gamePrismIridescence(tilt: active ? source.tilt : 0, intensity: GamePrismTilt.intensity(active: active))
            .onAppear {
                visible = true
                syncSensor(active: active, visible: true, reduceMotion: reduceMotion)
            }
            .onDisappear {
                visible = false
                syncSensor(active: active, visible: false, reduceMotion: reduceMotion)
            }
            .adaptiveOnChange(of: active) { _, now in syncSensor(active: now, visible: visible, reduceMotion: reduceMotion) }
            .adaptiveOnChange(of: reduceMotion) { _, now in syncSensor(active: active, visible: visible, reduceMotion: now) }
    }

    private func syncSensor(active: Bool, visible: Bool, reduceMotion: Bool) {
        if GamePrismTilt.sensorRuns(active: active, visible: visible, reduceMotion: reduceMotion) {
            source.start()
        } else {
            source.stop()
        }
    }
}

extension View {
    /// L'irisation d'une édition « prisme » ou d'un rang Mythe, qui suit l'inclinaison.
    func gamePrismTilt(active: Bool = true) -> some View {
        modifier(GamePrismTiltModifier(active: active))
    }
}
