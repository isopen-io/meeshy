import CoreGraphics
import Foundation

public nonisolated enum MeeshyMapTraceKind: String, Sendable, Equatable, CaseIterable {
    case route
    case link
    case history
}

public nonisolated enum MeeshyMapTraceWeight: String, Sendable, Equatable, CaseIterable {
    case regular
    case large
}

/// Un arrêt : `pointIndex` désigne un des points reçus ; `value` et `title` sont des textes opaques.
public struct MeeshyMapTraceStop: Identifiable, Equatable {
    public let id: String
    public let pointIndex: Int
    public let value: String
    public let title: String

    public init(id: String, pointIndex: Int, value: String, title: String) {
        self.id = id
        self.pointIndex = pointIndex
        self.value = value
        self.title = title
    }
}

/// **La loi pure du chemin (K54)** : les points d'écran reçus, leur longueur, la
/// fraction de chaque arrêt et la position d'une fraction. Le tracé commence sous le
/// premier point et finit sous le dernier : aucun point n'est inventé. `link` ne lit
/// que le premier et le dernier point. Aucun itinéraire, aucune projection ici.
public nonisolated struct MeeshyMapTracePath: Sendable, Equatable {

    public let points: [CGPoint]
    public let length: Double
    private let cumulative: [Double]

    public static func resolve(points: [CGPoint], kind: MeeshyMapTraceKind) -> MeeshyMapTracePath? {
        let usable = points.filter { $0.x.isFinite && $0.y.isFinite }
        guard usable.count >= 2, let first = usable.first, let last = usable.last else { return nil }
        let effective = kind == .link ? [first, last] : usable
        let cumulative = effective.indices.reduce(into: [Double]()) { result, index in
            result.append(index == 0 ? 0 : (result.last ?? 0) + distance(effective[index - 1], effective[index]))
        }
        return MeeshyMapTracePath(points: effective, length: cumulative.last ?? 0, cumulative: cumulative)
    }

    /// La part du chemin parcourue jusqu'à un des points reçus (de 0 à 1).
    public func fraction(ofPointAt index: Int) -> Double? {
        guard points.indices.contains(index) else { return nil }
        guard length > 0 else { return index == 0 ? 0 : 1 }
        return cumulative[index] / length
    }

    /// Le point posé à une fraction du chemin, bornée de 0 à 1.
    public func point(atFraction fraction: Double) -> CGPoint {
        guard !points.isEmpty, length > 0 else { return points.first ?? .zero }
        let clamped = min(max(fraction.isFinite ? fraction : 0, 0), 1)
        let target = clamped * length
        let segment = (1..<points.count).first { cumulative[$0] >= target } ?? points.count - 1
        let span = cumulative[segment] - cumulative[segment - 1]
        guard span > 0 else { return points[segment] }
        let t = (target - cumulative[segment - 1]) / span
        let from = points[segment - 1]
        let to = points[segment]
        return CGPoint(x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t)
    }

    private static func distance(_ a: CGPoint, _ b: CGPoint) -> Double {
        let dx = Double(b.x - a.x)
        let dy = Double(b.y - a.y)
        return (dx * dx + dy * dy).squareRoot()
    }
}
