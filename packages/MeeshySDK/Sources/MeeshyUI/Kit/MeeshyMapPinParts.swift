import SwiftUI

/// Les mesures des pièces de K36 que l'hôte pose dans les emplacements de l'épingle.
public nonisolated enum MeeshyMapPinPartsRecipe {
    public static let presenceDotDiameter: Double = 14
    public static let presenceRimWidth: Double = 2
    public static let presenceRimOpacity: Double = MeeshyOpacity.medium
}

/// **Le contenu de MON épingle (K36 `own`)** : le disque de la marque et la silhouette blanche. Un seul dessin pour
/// toutes les cartes qui posent « moi », pour qu'aucune copie ne diverge.
public struct MeeshyMapPinOwnContent: View {
    public init() {}

    public var body: some View {
        ZStack {
            MeeshyColors.brandPrimary
            Image(systemName: "person.fill")
                .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .bold))
                .foregroundStyle(Color.white)
        }
        .accessibilityHidden(true)
    }
}

/// **Le point de présence d'une épingle (K36 `badge`)** : la couleur que l'hôte a déjà résolue (la loi de présence
/// est la sienne), cerclée pour se détacher de l'avatar. Sans couleur, rien n'est dessiné : hors ligne, ou présence
/// non servie, l'épingle ne porte aucun point.
public struct MeeshyMapPinPresenceDot: View {
    private let color: Color?

    public init(color: Color?) {
        self.color = color
    }

    public var body: some View {
        if let color {
            Circle()
                .fill(color)
                .frame(width: CGFloat(MeeshyMapPinPartsRecipe.presenceDotDiameter),
                       height: CGFloat(MeeshyMapPinPartsRecipe.presenceDotDiameter))
                .overlay(Circle().strokeBorder(Color.black.opacity(MeeshyMapPinPartsRecipe.presenceRimOpacity),
                                               lineWidth: CGFloat(MeeshyMapPinPartsRecipe.presenceRimWidth)))
                .accessibilityHidden(true)
        }
    }
}
