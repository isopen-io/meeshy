import SwiftUI
import MeeshySDK

// MARK: - L'anneau des actes, dessiné (#17768)
//
// MIROIR de `MenuActsRing` (`apps/web/src/components/menu-acts-ring.tsx`) : un segment par acte du rêve du jour,
// allumé (`MeeshyColors.warning`) quand l'acte est réalisé, posé AUTOUR d'un disque qui est déjà là. Aucun texte,
// aucun élément ajouté à l'écran. Décoratif (`accessibilityHidden`) : c'est le bouton qui le décrit. Immobile — le
// mouvement attend la table #17381.

/// Où commence et où finit chaque segment, en fractions du tour, à partir du haut et dans le sens des aiguilles.
public enum MenuActsRingGeometry {
    /// Le jour entre deux segments, en fraction du tour (14 unités sur 300, comme le web).
    public static let gap: Double = 14.0 / 300.0
    /// L'anneau déborde le disque de quelques points, sans le toucher.
    public static let overhang: CGFloat = 5
    public static let lineWidth: CGFloat = 3.5

    public struct Segment: Equatable, Sendable {
        public let from: Double
        public let to: Double
        public let isDone: Bool
    }

    public static func segments(for ring: GameActsRing) -> [Segment] {
        guard ring.total > 0 else { return [] }
        let part = 1.0 / Double(ring.total)
        return (0..<ring.total).map { index in
            Segment(from: Double(index) * part + gap / 2, to: Double(index + 1) * part - gap / 2, isDone: index < ring.done)
        }
    }
}

public struct MenuActsRingView: View {
    private let ring: GameActsRing
    private let diameter: CGFloat

    /// `diameter` : celui du disque que l'anneau entoure.
    public init(ring: GameActsRing, diameter: CGFloat) {
        self.ring = ring
        self.diameter = diameter
    }

    public var body: some View {
        let side = diameter + MenuActsRingGeometry.overhang * 2
        ZStack {
            ForEach(Array(MenuActsRingGeometry.segments(for: ring).enumerated()), id: \.offset) { _, segment in
                Circle()
                    .trim(from: segment.from, to: segment.to)
                    .stroke(segment.isDone ? MeeshyColors.warning : Color.black.opacity(0.35),
                            style: StrokeStyle(lineWidth: MenuActsRingGeometry.lineWidth, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
        }
        .padding(MenuActsRingGeometry.lineWidth / 2)
        .frame(width: side, height: side)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
