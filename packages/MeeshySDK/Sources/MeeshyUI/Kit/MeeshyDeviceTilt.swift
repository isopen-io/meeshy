import SwiftUI
import Combine
#if canImport(CoreMotion)
import CoreMotion
#endif

/// **La source d'inclinaison de l'appareil** (K27, K31) : l'angle de roulis en
/// degrés, lu à 30 Hz tant que la vue le demande. Sans capteur (simulateur, Mac),
/// l'angle reste nul : le décor flotte, sans parallaxe. Le capteur s'arrête avec
/// la vue, jamais avant qu'on l'ait demandé.
@MainActor
public final class MeeshyDeviceTilt: ObservableObject {
    @Published public private(set) var degrees: Double = 0
    #if canImport(CoreMotion)
    private let manager = CMMotionManager()
    #endif

    public init() {}

    public var isAvailable: Bool {
        #if canImport(CoreMotion)
        manager.isDeviceMotionAvailable
        #else
        false
        #endif
    }

    public func start() {
        #if canImport(CoreMotion)
        guard manager.isDeviceMotionAvailable, !manager.isDeviceMotionActive else { return }
        manager.deviceMotionUpdateInterval = 1.0 / 30.0
        manager.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
            guard let motion else { return }
            let roll = motion.attitude.roll * 180 / Double.pi
            MainActor.assumeIsolated { self?.degrees = roll }
        }
        #endif
    }

    public func stop() {
        #if canImport(CoreMotion)
        manager.stopDeviceMotionUpdates()
        #endif
        degrees = 0
    }
}
