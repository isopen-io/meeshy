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

/// Pose l'irisation du prisme sur une vue et la fait suivre le téléphone — sans
/// capteur (simulateur) elle reste au repos, jamais cassée.
private struct GamePrismTiltModifier: ViewModifier {
    let active: Bool
    @StateObject private var source = GameTiltSource()

    func body(content: Content) -> some View {
        content
            .gamePrismIridescence(tilt: active ? source.tilt : 0)
            .onAppear { if active { source.start() } }
            .onDisappear { source.stop() }
    }
}

extension View {
    /// L'irisation d'une édition « prisme » ou d'un rang Mythe, qui suit l'inclinaison.
    func gamePrismTilt(active: Bool = true) -> some View {
        modifier(GamePrismTiltModifier(active: active))
    }
}
