import SwiftUI

/// **Ce qu'une rangée qui défile cache encore, de chaque côté.** La loi vaut
/// pour les deux axes et les deux sens de lecture : `start` est le côté où le
/// contenu commence (à gauche en LTR, à droite en RTL, en haut en vertical),
/// `end` celui où il finit. Un demi-point d'arrondi n'est pas un débord.
public nonisolated struct MeeshyScrollEdges: Equatable, Sendable {
    public var start: Bool
    public var end: Bool

    public init(start: Bool, end: Bool) {
        self.start = start
        self.end = end
    }

    public static let none = MeeshyScrollEdges(start: false, end: false)
    public static let tolerance: CGFloat = 0.5

    public var hasOverflow: Bool { start || end }

    /// La loi, en distances le long de l'axe. `offset` : de combien le début du
    /// contenu a passé le début du viewport (négatif au rebond). Tout tient ⇒
    /// aucun bord, quel que soit le décalage.
    public static func of(content: CGFloat, viewport: CGFloat, offset: CGFloat) -> MeeshyScrollEdges {
        guard content > viewport + tolerance else { return .none }
        return MeeshyScrollEdges(start: offset > tolerance, end: content - offset > viewport + tolerance)
    }

    /// La même loi lue depuis le cadre PHYSIQUE du contenu, dans l'espace du
    /// viewport. En RTL horizontal, le contenu commence à droite.
    public static func of(
        contentFrame: CGRect,
        viewport: CGFloat,
        axis: Axis,
        isRightToLeft: Bool
    ) -> MeeshyScrollEdges {
        switch axis {
        case .vertical:
            return of(content: contentFrame.height, viewport: viewport, offset: -contentFrame.minY)
        case .horizontal:
            let offset = isRightToLeft ? contentFrame.maxX - viewport : -contentFrame.minX
            return of(content: contentFrame.width, viewport: viewport, offset: offset)
        }
    }

    /// Les bords vus du côté PHYSIQUE : le côté des petites coordonnées, puis
    /// celui des grandes. Miroite `start` et `end` en RTL horizontal.
    public func physicalSides(axis: Axis, isRightToLeft: Bool) -> (low: Bool, high: Bool) {
        axis == .horizontal && isRightToLeft ? (low: end, high: start) : (low: start, high: end)
    }
}

/// **Le masque de l'estompe** : opaque au milieu, transparent sur `fade` points
/// du bord qui cache encore quelque chose. Il ne prend aucun toucher : une
/// puce à demi effacée reste une cible entière.
public struct MeeshyScrollEdgeMask: View, Equatable {
    private let edges: MeeshyScrollEdges
    private let axis: Axis
    private let isRightToLeft: Bool
    private let fade: CGFloat

    public init(edges: MeeshyScrollEdges, axis: Axis, isRightToLeft: Bool, fade: CGFloat) {
        self.edges = edges
        self.axis = axis
        self.isRightToLeft = isRightToLeft
        self.fade = fade
    }

    public var body: some View {
        let sides = edges.physicalSides(axis: axis, isRightToLeft: isRightToLeft)
        return stack(low: sides.low ? fade : 0, high: sides.high ? fade : 0)
            .environment(\.layoutDirection, .leftToRight)
            .meeshyAnimation(.easeInOut(duration: MeeshyChipRecipe.edgeFadeDuration), value: edges)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }

    @ViewBuilder
    private func stack(low: CGFloat, high: CGFloat) -> some View {
        switch axis {
        case .horizontal:
            HStack(spacing: 0) {
                ramp(.clear, Self.opaque, .leading, .trailing).frame(width: low)
                Self.opaque
                ramp(Self.opaque, .clear, .leading, .trailing).frame(width: high)
            }
        case .vertical:
            VStack(spacing: 0) {
                ramp(.clear, Self.opaque, .top, .bottom).frame(height: low)
                Self.opaque
                ramp(Self.opaque, .clear, .top, .bottom).frame(height: high)
            }
        }
    }

    /// Un masque ne lit que l'opacité : n'importe quelle couleur pleine y fait.
    private static var opaque: Color { MeeshyColors.onMedia }

    private func ramp(_ from: Color, _ to: Color, _ start: UnitPoint, _ end: UnitPoint) -> LinearGradient {
        LinearGradient(colors: [from, to], startPoint: start, endPoint: end)
    }
}

/// Le nom de l'espace de coordonnées du défilement : une bande qui mesure son
/// contenu depuis l'intérieur (la plage visible, le décalage) le lit ici.
public nonisolated enum MeeshyFadingScrollSpace {
    public static let name = "meeshy.fading-scroll"
}

/// **Un défilement qui s'estompe là où il reste du contenu.** Il mesure deux
/// booléens (`MeeshyScrollEdges`) qui ne changent qu'au seuil : défiler ne
/// redessine rien d'autre que le masque. Jamais de barre de défilement.
public struct MeeshyFadingScrollView<Content: View>: View {
    private let axis: Axis
    private let fade: CGFloat
    private let content: Content

    @State private var viewport: CGFloat = 0
    @State private var edges: MeeshyScrollEdges = .none
    @Environment(\.layoutDirection) private var layoutDirection

    private static var space: String { MeeshyFadingScrollSpace.name }

    public init(axis: Axis = .horizontal, fade: CGFloat = MeeshyChipRecipe.edgeFade, @ViewBuilder content: () -> Content) {
        self.axis = axis
        self.fade = fade
        self.content = content()
    }

    public var body: some View {
        let axis = self.axis
        let axes: Axis.Set = axis == .horizontal ? .horizontal : .vertical
        let knownViewport = viewport
        let isRightToLeft = layoutDirection == .rightToLeft
        let space = Self.space
        return ScrollView(axes, showsIndicators: false) {
            content.onGeometryChange(for: MeeshyScrollEdges.self) { proxy in
                MeeshyScrollEdges.of(
                    contentFrame: proxy.frame(in: .named(space)),
                    viewport: knownViewport,
                    axis: axis,
                    isRightToLeft: isRightToLeft
                )
            } action: { measured in
                edges = measured
            }
        }
        .coordinateSpace(name: space)
        .onGeometryChange(for: CGFloat.self) { proxy in
            axis == .horizontal ? proxy.size.width : proxy.size.height
        } action: { measured in
            viewport = measured
        }
        .mask {
            MeeshyScrollEdgeMask(edges: edges, axis: axis, isRightToLeft: isRightToLeft, fade: fade)
        }
    }
}
