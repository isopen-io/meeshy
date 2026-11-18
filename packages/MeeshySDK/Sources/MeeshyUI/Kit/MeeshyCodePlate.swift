import SwiftUI

/// **La recette de la plaque de code (K31) en VALEURS** : la plaque claire qui porte
/// la matrice, posée dans la carte ou À PLAT hors d'elle (un billet, une vignette).
/// Le côté va de 56 à 220 ; la marge et le rayon suivent les trois tailles de la
/// carte (72 → 6 / 14, 160 → 12 / 22, 220 → 16 / 28) et s'interpolent entre elles.
/// La miniature n'a ni yeux teintés ni pastille centrale.
public nonisolated struct MeeshyCodePlateRecipe: Sendable, Equatable {
    public static let sideRange: ClosedRange<Double> = 56...220
    /// Un point d'ancrage : le côté, la marge et le rayon d'une taille de la carte.
    nonisolated struct Anchor: Sendable, Equatable {
        let side: Double
        let margin: Double
        let radius: Double
    }

    /// Les points d'ancrage, du plus petit au plus grand : ceux des tailles de la carte.
    static let anchors: [Anchor] = MeeshyCodeCardSize.allCases.map {
        Anchor(side: $0.side, margin: MeeshyCodeCardRecipe.plateMargin(for: $0),
               radius: MeeshyCodeCardRecipe.plateRadius(for: $0))
    }

    public let side: Double
    public let margin: Double
    public let radius: Double
    /// La boîte de la plaque : le code et sa marge de chaque côté.
    public let outerSide: Double
    public let centerSide: Double
    public let tintsEyes: Bool

    public init(side: Double, margin: Double, radius: Double, outerSide: Double, centerSide: Double, tintsEyes: Bool) {
        self.side = side
        self.margin = margin
        self.radius = radius
        self.outerSide = outerSide
        self.centerSide = centerSide
        self.tintsEyes = tintsEyes
    }

    public static func resolve(side requested: Double, isThumbnail: Bool) -> MeeshyCodePlateRecipe {
        let side = min(max(requested.isFinite ? requested : sideRange.lowerBound, sideRange.lowerBound),
                       sideRange.upperBound)
        let margin = interpolated(side: side) { $0.margin }
        return MeeshyCodePlateRecipe(
            side: side,
            margin: margin,
            radius: interpolated(side: side) { $0.radius },
            outerSide: side + 2 * margin,
            centerSide: isThumbnail ? 0 : MeeshyCodeCardRecipe.centerSide(forSide: side),
            tintsEyes: !isThumbnail
        )
    }

    private static func interpolated(side: Double, _ value: (Anchor) -> Double) -> Double {
        guard let first = anchors.first, let last = anchors.last else { return 0 }
        if side <= first.side { return value(first) }
        if side >= last.side { return value(last) }
        let upperIndex = anchors.firstIndex { $0.side >= side } ?? anchors.count - 1
        let upper = anchors[upperIndex]
        let lower = anchors[max(upperIndex - 1, 0)]
        guard upper.side > lower.side else { return value(upper) }
        let share = (side - lower.side) / (upper.side - lower.side)
        return value(lower) + (value(upper) - value(lower)) * share
    }
}

/// **La plaque de code (K31)** : la matrice sur sa plaque toujours claire, avec la
/// pastille centrale que l'hôte pose (avatar, médaillon). C'est la plaque de la
/// carte de code, extraite pour se poser à plat ailleurs : dans un billet, un
/// partage, une vignette. Le `payload` n'est jamais lu ni nommé : l'image porte
/// `label`. Sans `payload`, un squelette tient la place. Avec `onPress`, c'est un
/// bouton (cible de 44 au moins).
public struct MeeshyCodePlate<Center: View>: View {
    private let payload: String?
    private let label: String
    private let tint: Color?
    private let side: Double
    private let style: MeeshyCodeCardStyle
    private let isThumbnail: Bool
    private let centerShift: Double
    private let onPress: (() -> Void)?
    private let center: Center

    public init(payload: String?,
                label: String,
                tint: Color? = nil,
                side: Double = MeeshyCodeCardSize.compact.side,
                style: MeeshyCodeCardStyle = .glass,
                isThumbnail: Bool = false,
                centerShift: Double = 0,
                onPress: (() -> Void)? = nil,
                @ViewBuilder center: () -> Center) {
        self.payload = payload
        self.label = label
        self.tint = tint
        self.side = side
        self.style = style
        self.isThumbnail = isThumbnail
        self.centerShift = centerShift
        self.onPress = onPress
        self.center = center()
    }

    public var body: some View {
        let recipe = MeeshyCodePlateRecipe.resolve(side: side, isThumbnail: isThumbnail)
        Group {
            if let onPress {
                Button(action: onPress) { plate(recipe: recipe) }
                    .buttonStyle(.plain)
                    .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
            } else {
                plate(recipe: recipe)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityAddTraits(onPress == nil ? .isImage : [.isImage, .isButton])
    }

    private func plate(recipe: MeeshyCodePlateRecipe) -> some View {
        let plateColor = MeeshyCodeCardRecipe.plateColor(style: style).color
        return ZStack {
            if payload == nil {
                MeeshySkeleton(shape: .card(aspect: 1, radius: 14))
                    .frame(width: CGFloat(recipe.side), height: CGFloat(recipe.side))
            } else {
                MeeshyCodeMatrix(payload: payload, label: label, tint: recipe.tintsEyes ? tint : nil, side: recipe.side)
                    .accessibilityHidden(true)
                if recipe.centerSide > 0 {
                    center
                        .frame(width: CGFloat(recipe.centerSide), height: CGFloat(recipe.centerSide))
                        .background(plateColor, in: Circle())
                        .clipShape(Circle())
                        .offset(x: CGFloat(centerShift))
                }
            }
        }
        .padding(CGFloat(recipe.margin))
        .background(RoundedRectangle(cornerRadius: CGFloat(recipe.radius), style: .continuous).fill(plateColor))
    }
}

extension MeeshyCodePlate where Center == EmptyView {
    public init(payload: String?,
                label: String,
                tint: Color? = nil,
                side: Double = MeeshyCodeCardSize.compact.side,
                style: MeeshyCodeCardStyle = .glass,
                isThumbnail: Bool = false,
                onPress: (() -> Void)? = nil) {
        self.init(payload: payload, label: label, tint: tint, side: side, style: style, isThumbnail: isThumbnail,
                  onPress: onPress, center: { EmptyView() })
    }
}
