import Foundation
import CoreGraphics

/// Driver de largeur normalisé `[0,1]` par point, orienté « haut = épais ». Source pencil
/// (force) ou doigt (vitesse). Pur, calculé côté capture (jamais au rendu).
public enum StrokeWidthDriver {
    public static let neutral: CGFloat = 0.5
    public static let designVMax: CGFloat = 4000   // design-px/sec, tunable

    public static func velocity(from previous: CGPoint?, to current: CGPoint, dt: CGFloat) -> CGFloat? {
        guard let previous, dt > 0 else { return nil }
        return hypot(current.x - previous.x, current.y - previous.y) / dt
    }

    public static func movingAverage(_ values: [CGFloat], window: Int) -> [CGFloat] {
        guard window > 1, values.count > 1 else { return values }
        let half = window / 2
        return values.indices.map { i in
            let lo = max(0, i - half), hi = min(values.count - 1, i + half)
            let slice = values[lo...hi]
            return slice.reduce(0, +) / CGFloat(slice.count)
        }
    }

    public static func normalize(_ velocity: CGFloat, vMax: CGFloat) -> CGFloat {
        guard vMax > 0 else { return 0 }
        return clamp01(velocity / vMax)
    }

    public static func pencilDriver(force: CGFloat, maxForce: CGFloat) -> CGFloat {
        guard maxForce > 0 else { return neutral }
        return clamp01(force / maxForce)
    }

    public static func fingerDriver(normalizedSmoothedVelocity: CGFloat) -> CGFloat {
        clamp01(1 - normalizedSmoothedVelocity)
    }

    static func clamp01(_ x: CGFloat) -> CGFloat { min(1, max(0, x)) }
}
