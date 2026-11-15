import CoreMotion
import SwiftUI

/// **Le niveau d'horizon du viseur** (CAM-10, doc 08 § R5) : grille activée
/// seulement, un trait fin au centre paraît sous 10° d'inclinaison et passe à
/// l'accent du viseur à ±1°, avec un tic de sélection en y entrant. Portrait comme
/// paysage : l'écart se mesure à l'horizontale la plus proche. À plat, il se tait.
nonisolated enum ComposerCaptureLevel {
    static let visibleWithin: Double = 10
    static let alignedWithin: Double = 1
    /// Une fois aligné, il le reste jusqu'à 1,5° : le capteur qui tremble au bord
    /// ne fait pas tiquer le doigt quinze fois par seconde.
    static let releaseWithin: Double = 1.5
    static let rate: Double = 15
    /// Au-delà, le téléphone est couché sur le dos ou sur le ventre.
    static let flatGravity: Double = 0.9

    nonisolated struct Reading: Equatable, Sendable {
        /// L'écart signé à l'horizontale, en degrés.
        let degrees: Double
        let aligned: Bool
    }

    /// L'écart signé, en degrés, entre l'appareil et la plus proche de ses tenues droites.
    static func tilt(gravityX x: Double, gravityY y: Double) -> Double {
        let angle = atan2(x, -y) * 180 / .pi
        return angle - 90 * (angle / 90).rounded()
    }

    static func reading(gravityX x: Double, gravityY y: Double, gravityZ z: Double,
                        wasAligned: Bool) -> Reading? {
        guard abs(z) < flatGravity else { return nil }
        let ecart = tilt(gravityX: x, gravityY: y)
        guard abs(ecart) < visibleWithin else { return nil }
        return Reading(degrees: ecart, aligned: abs(ecart) <= (wasAligned ? releaseWithin : alignedWithin))
    }

    /// Le tic ne part qu'en ENTRANT dans l'alignement.
    static func ticks(from avant: Reading?, to apres: Reading?) -> Bool {
        apres?.aligned == true && avant?.aligned != true
    }
}

/// Le capteur du niveau : il ne tourne que tant que le trait est monté.
@MainActor
final class ComposerCaptureLevelSource: ObservableObject {
    nonisolated deinit {}

    @Published private(set) var reading: ComposerCaptureLevel.Reading?

    private let manager = CMMotionManager()

    func start() {
        guard manager.isDeviceMotionAvailable, !manager.isDeviceMotionActive else { return }
        manager.deviceMotionUpdateInterval = 1 / ComposerCaptureLevel.rate
        manager.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
            guard let gravite = motion?.gravity else { return }
            let (x, y, z) = (gravite.x, gravite.y, gravite.z)
            Task { @MainActor in self?.receive(x: x, y: y, z: z) }
        }
    }

    func stop() {
        manager.stopDeviceMotionUpdates()
        reading = nil
    }

    private func receive(x: Double, y: Double, z: Double) {
        let suivante = ComposerCaptureLevel.reading(gravityX: x, gravityY: y, gravityZ: z,
                                                      wasAligned: reading?.aligned == true)
        if ComposerCaptureLevel.ticks(from: reading, to: suivante) { ComposerCaptureHaptic.play(.levelled) }
        reading = suivante
    }
}

/// Le trait d'horizon, au centre du viseur : il suit l'horizon réel, blanc, puis
/// jaune — l'accent du viseur, celui du flash et du retardateur — une fois droit.
/// Muet à VoiceOver et transparent au toucher, comme la grille qu'il accompagne.
struct ComposerCaptureLevelLine: View {
    @StateObject private var source = ComposerCaptureLevelSource()

    var body: some View {
        ZStack {
            if let lecture = source.reading {
                Capsule()
                    .fill(lecture.aligned ? Color.yellow : Color.white.opacity(0.85))
                    .frame(width: 88, height: 2)
                    .shadow(color: .black.opacity(0.35), radius: 1.5)
                    .rotationEffect(.degrees(lecture.aligned ? 0 : -lecture.degrees))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .onAppear { source.start() }
        .onDisappear { source.stop() }
    }
}
