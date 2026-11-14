import SwiftUI

/// L'encre du halo : blanche sur une scène sombre ou moyenne, sombre sur une
/// scène claire (ton `onLight`).
public nonisolated enum MeeshySelectionHaloInk: String, Sendable, Equatable, CaseIterable {
    case onMedia
    case mediaBackdrop

    public var color: Color {
        switch self {
        case .onMedia: return MeeshyColors.onMedia
        case .mediaBackdrop: return MeeshyColors.mediaBackdrop
        }
    }
}

/// Une lueur du halo : sans décalage, un flou et une opacité.
public nonisolated struct MeeshySelectionHaloLayer: Sendable, Equatable {
    public let radius: CGFloat
    public let opacity: Double

    public init(radius: CGFloat, opacity: Double) {
        self.radius = radius
        self.opacity = opacity
    }
}

/// Le halo résolu : son encre et ses deux lueurs, rayons en points d'écran.
public nonisolated struct MeeshySelectionHaloRecipe: Sendable, Equatable {
    public let ink: MeeshySelectionHaloInk
    public let layers: [MeeshySelectionHaloLayer]

    public init(ink: MeeshySelectionHaloInk, layers: [MeeshySelectionHaloLayer]) {
        self.ink = ink
        self.layers = layers
    }
}

/// Ce que le halo peint pour une forme et une intensité de lueur (0 : éteint,
/// 1 : allumé) : les opacités des deux lueurs de la silhouette, et les lueurs
/// de la boîte arrondie. Éteint, la boîte n'a AUCUNE couche : un objet non
/// choisi ne porte aucun calque.
public nonisolated struct MeeshySelectionHaloPaint: Sendable, Equatable {
    public let silhouette: [Double]
    public let box: [MeeshySelectionHaloLayer]

    public init(silhouette: [Double], box: [MeeshySelectionHaloLayer]) {
        self.silhouette = silhouette
        self.box = box
    }
}

/// Les traits des repères : la ligne engagée, les lignes candidates et le
/// contour de la scène.
public nonisolated struct MeeshySnapGuidesStyle: Sendable, Equatable {
    public let engagedWidth: CGFloat
    public let engagedEdgeWidth: CGFloat
    public let candidateOpacity: Double
    public let candidateWidth: CGFloat
    public let candidateDash: [CGFloat]
    public let boundsOpacity: Double
    public let boundsWidth: CGFloat
    public let boundsInset: CGFloat

    public init(
        engagedWidth: CGFloat, engagedEdgeWidth: CGFloat,
        candidateOpacity: Double, candidateWidth: CGFloat, candidateDash: [CGFloat],
        boundsOpacity: Double, boundsWidth: CGFloat, boundsInset: CGFloat
    ) {
        self.engagedWidth = engagedWidth
        self.engagedEdgeWidth = engagedEdgeWidth
        self.candidateOpacity = candidateOpacity
        self.candidateWidth = candidateWidth
        self.candidateDash = candidateDash
        self.boundsOpacity = boundsOpacity
        self.boundsWidth = boundsWidth
        self.boundsInset = boundsInset
    }
}

/// La recette en valeurs de K23 : toutes ses mesures propres, nulle part ailleurs.
/// Le canvas UIKit (`StoryCanvasUIView+Limits`) lit les mêmes constantes.
public nonisolated enum MeeshySelectionFeedbackRecipe {
    /// Les deux lueurs de la planche : flou 10 à 95 %, flou 24 à 55 % (σ 5 et 12).
    public static let haloLayers: [MeeshySelectionHaloLayer] = [
        MeeshySelectionHaloLayer(radius: 10, opacity: 0.95),
        MeeshySelectionHaloLayer(radius: 24, opacity: 0.55),
    ]
    /// « Augmenter le contraste » : 100 % et 80 %.
    public static let haloLayersIncreasedContrast: [MeeshySelectionHaloLayer] = [
        MeeshySelectionHaloLayer(radius: 10, opacity: 1),
        MeeshySelectionHaloLayer(radius: 24, opacity: 0.8),
    ]
    public static let haloFadeIn = 0.15
    public static let haloFadeOut = 0.1

    public static let engagedWidth: CGFloat = 1.5
    /// Le liseré sombre de chaque côté de la ligne engagée, pour qu'elle tienne sur une scène claire.
    public static let engagedEdgeWidth: CGFloat = 0.5
    public static let candidateOpacity = 0.3
    public static let candidateWidth: CGFloat = 0.5
    public static let candidateDash: [CGFloat] = [2, 6]
    public static let boundsOpacity = 0.9
    public static let boundsWidth: CGFloat = 2
    public static let boundsInset: CGFloat = 1
    /// Deux fractions à moins de cet écart sont la même ligne.
    public static let sameLineTolerance: CGFloat = 0.000_001

    /// Le halo d'un ton : l'encre suit le ton, les rayons se divisent par
    /// l'échelle que l'hôte applique à l'objet (le flou reste en points d'écran).
    public static func halo(tone: MeeshyGlassTone, isIncreasedContrast: Bool, scale: CGFloat) -> MeeshySelectionHaloRecipe {
        let divisor = scale.isFinite && scale > 0 ? scale : 1
        let layers = isIncreasedContrast ? haloLayersIncreasedContrast : haloLayers
        return MeeshySelectionHaloRecipe(
            ink: tone == .onLight ? .mediaBackdrop : .onMedia,
            layers: layers.map { MeeshySelectionHaloLayer(radius: $0.radius / divisor, opacity: $0.opacity) }
        )
    }

    /// La peinture d'un halo : la silhouette ne prend que la forme `.content`,
    /// la boîte que `.rounded`, et rien ne se peint lueur éteinte.
    public static func paint(_ recipe: MeeshySelectionHaloRecipe, shape: MeeshySelectionHaloShape, glow: Double) -> MeeshySelectionHaloPaint {
        let lit = glow.isFinite && glow > 0
        let intensity = lit ? min(glow, 1) : 0
        switch shape {
        case .content:
            return MeeshySelectionHaloPaint(silhouette: recipe.layers.map { $0.opacity * intensity }, box: [])
        case .rounded:
            let box = lit ? recipe.layers.map { MeeshySelectionHaloLayer(radius: $0.radius, opacity: $0.opacity * intensity) } : []
            return MeeshySelectionHaloPaint(silhouette: Array(repeating: 0.0, count: recipe.layers.count), box: box)
        }
    }

    public static func guides() -> MeeshySnapGuidesStyle {
        MeeshySnapGuidesStyle(
            engagedWidth: engagedWidth, engagedEdgeWidth: engagedEdgeWidth,
            candidateOpacity: candidateOpacity, candidateWidth: candidateWidth, candidateDash: candidateDash,
            boundsOpacity: boundsOpacity, boundsWidth: boundsWidth, boundsInset: boundsInset
        )
    }

    /// Le fondu du halo : 150 ms à l'apparition, 100 ms au retrait, aucun sous « réduire les animations ».
    public static func fade(appearing: Bool, reduceMotion: Bool) -> Animation? {
        MeeshyMotion.animation(.easeOut(duration: appearing ? haloFadeIn : haloFadeOut), reduce: reduceMotion)
    }
}
