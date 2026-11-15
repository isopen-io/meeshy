import Foundation

/// **La rotation d'un objet de la scène sous deux doigts** : une seule loi
/// pour le canvas (UIKit) et la puce sonore posée par-dessus (SwiftUI, #16294).
///
/// Le doigt tourne l'objet de la MOITIÉ de son angle : à 1:1, chaque degré de
/// doigt devenait un degré d'objet, trop sensible pour viser juste. Deux tours
/// de doigts font toujours un tour complet.
public nonisolated enum SceneObjectRotationPolicy {

    public static let sensitivity: Double = 0.5

    /// La rotation, en degrés, d'un objet parti de `base` après un geste de
    /// `gestureRadians` ; un geste non fini laisse l'objet où il est.
    public static func settled(base: Double, gestureRadians: Double) -> Double {
        guard gestureRadians.isFinite else { return base }
        return base + gestureRadians * 180 / .pi * sensitivity
    }
}
