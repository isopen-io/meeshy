import SwiftUI

/// La disposition de la rangée de la pilule : serrée sur son contenu (le
/// composer), ou répartie à largeur égale sous un plafond (les appels).
public nonisolated enum MeeshyGlassPillLayout: Sendable, Equatable {
    case hug
    case spread(maxWidth: CGFloat = MeeshyGlassPillRecipe.spreadMaxWidth)
}

/// **Toutes les valeurs de la pilule de verre**, nulle part ailleurs : les
/// mesures de la planche, les largeurs, les durées et le ressort. Les jetons du
/// design system (`MeeshySpacing`) y sont nommés ; ce qui n'a pas de jeton (le
/// rayon, les plafonds, le filet, le débord) vit ici.
public nonisolated enum MeeshyGlassPillRecipe {

    // MARK: Mesures

    /// Les trois tailles essayées, dans l'ordre : la première qui tient gagne.
    public static let sizes: [MeeshyGlassButtonSize] = [.s48, .s44, .s40]
    /// La hauteur au repos : des boutons de 48 et une marge de 8.
    public static let restingHeight: CGFloat = 64
    /// Le rayon : la moitié de la hauteur au repos (`MeeshyRadius` s'arrête à 24).
    public static let radius: CGFloat = 32
    public static let gap: CGFloat = MeeshySpacing.xsPlus
    public static let inset: CGFloat = MeeshySpacing.sm
    public static let spreadVerticalInset: CGFloat = MeeshySpacing.smPlus
    public static let spreadMaxWidth: CGFloat = 440
    public static let expandedMaxWidth: CGFloat = 560
    /// Un toucher à moins de 8 de son bord reste à la pilule (#8735).
    public static let overflow: CGFloat = 8
    /// Le fondu de bord de la rangée qui défile.
    public static let edgeFade: CGFloat = 8

    // MARK: Filet

    public static let dividerInset: CGFloat = MeeshySpacing.lg
    public static let dividerHeight: CGFloat = 0.5
    public static let dividerOpacity: Double = 0.14

    // MARK: Dock

    public static let defaultSideMargin: CGFloat = MeeshySpacing.md
    public static let defaultBottomGap: CGFloat = MeeshySpacing.md
    public static let defaultMinimumBottom: CGFloat = 28

    // MARK: Durées et ressort

    public static let stowDuration: TimeInterval = 0.25
    public static let reducedStowDuration: TimeInterval = 0.15
    public static let reducedSizeDuration: TimeInterval = 0.2
    public static let springResponse: Double = 0.35
    public static let springDamping: Double = 0.85

    /// Le morphisme du verre : un ressort ; sous « réduire les animations »,
    /// 200 ms sans ressort. Aussi la transaction que l'hôte pose quand son
    /// contenu change de largeur.
    public static func morphAnimation(reduceMotion: Bool) -> Animation {
        reduceMotion
            ? .easeInOut(duration: reducedSizeDuration)
            : .spring(response: springResponse, dampingFraction: springDamping)
    }

    // MARK: Lois pures

    /// La largeur du verre. Avec un dessus, le plafond est `expandedMaxWidth` ;
    /// répartie, son plafond ; serrée, le contenu : toujours sous la place.
    public static func width(
        layout: MeeshyGlassPillLayout,
        hasAbove: Bool,
        place: CGFloat,
        naturalWidth: CGFloat,
        expandedMaxWidth: CGFloat
    ) -> CGFloat {
        if hasAbove { return min(place, expandedMaxWidth) }
        switch layout {
        case .spread(let maxWidth): return min(place, maxWidth)
        case .hug: return min(place, naturalWidth)
        }
    }

    /// La distance du bas de l'écran : la zone sûre plus l'écart, jamais sous le plancher.
    public static func bottomMargin(safeBottom: CGFloat, bottomGap: CGFloat, minimumBottom: CGFloat) -> CGFloat {
        max(safeBottom + bottomGap, minimumBottom)
    }

    /// La largeur d'une rangée serrée.
    public static func rowWidth(widths: [CGFloat], gap: CGFloat) -> CGFloat {
        guard !widths.isEmpty else { return 0 }
        return widths.reduce(0, +) + gap * CGFloat(widths.count - 1)
    }

    /// Le début de chaque élément de la rangée. Serrée, ils se suivent à
    /// `gap`. Répartie, chacun est centré dans une case de largeur égale ; si
    /// la place ne suffit pas, ils se suivent.
    public static func rowOffsets(widths: [CGFloat], gap: CGFloat, available: CGFloat, spreads: Bool) -> [CGFloat] {
        guard !widths.isEmpty else { return [] }
        let canSpread = spreads && available.isFinite && rowWidth(widths: widths, gap: 0) <= available
        guard canSpread else { return sequentialOffsets(widths: widths, gap: gap) }
        let slot = available / CGFloat(widths.count)
        return widths.enumerated().map { index, width in CGFloat(index) * slot + (slot - width) / 2 }
    }

    private static func sequentialOffsets(widths: [CGFloat], gap: CGFloat) -> [CGFloat] {
        var cursor: CGFloat = 0
        return widths.map { width in
            defer { cursor += width + gap }
            return cursor
        }
    }
}
