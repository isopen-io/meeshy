import SwiftUI

/// La teinte de ce que la bande peint : le cercle, le fond plein, le voile
/// d'attente et le nom.
public nonisolated enum MeeshyTileTone: String, Sendable, Equatable, CaseIterable {
    case onMedia
    case themeInk
}

/// L'encre des glyphes que la bande dessine sur le fond plein de la courante.
public nonisolated enum MeeshyTileInk: String, Sendable, Equatable, CaseIterable {
    case indigo950
    case themeInverse
}

/// **La recette d'une vignette en VALEURS** : un `View` ne s'inspecte pas, sa
/// recette si. Toute valeur chiffrée de la vignette vit ici, nulle part ailleurs.
/// K19 ne pose aucune matière : ni verre, ni flou, ni liseré.
public nonisolated struct MeeshyTileRecipe: Equatable, Sendable {
    public let tone: MeeshyTileTone
    /// L'opacité du cercle : 1 sur la courante en style `ring`, sinon 0.
    public let ringOpacity: Double
    /// L'opacité du fond derrière l'aperçu : nulle en `ring`, pleine sur la
    /// courante en `fill`, un voile sur les autres.
    public let fillOpacity: Double
    public let fillInk: MeeshyTileInk?
    /// Appui et survol 85 %, désactivée 40 %.
    public let opacity: Double
    public let isActionEnabled: Bool

    public var respondsToTouch: Bool { isActionEnabled }
    public var playsHaptic: Bool { isActionEnabled }

    public static let disabledOpacity = 0.4
    public static let pressedOpacity = MeeshyOpacity.intense
    /// Le voile d'un aperçu en attente.
    public static let placeholderVeil = MeeshyOpacity.subtle
    /// Le voile des vignettes non courantes en style `fill`.
    public static let restFillOpacity = MeeshyOpacity.subtle
    public static let neighbourScale: CGFloat = 0.78
    public static let neighbourOpacity = 0.6
    public static let ringFadeDuration = 0.2
    public static let neighbourFadeDuration = 0.2
    public static let edgeFadeDuration = 0.15
    public static let revealDuration = 0.25
    /// Le défilement est au repos quand le centre n'a plus bougé depuis ce délai.
    public static let restDelay = 0.15
    public static let holdDuration = 0.45
    /// L'estompe de bord : la largeur d'une cible tactile.
    public static let edgeFade = MeeshyControlSize.tapTarget

    public static func resolve(
        surface: MeeshyTileSurface,
        selectionStyle: MeeshyTileSelectionStyle,
        isSelected: Bool,
        isPressed: Bool = false,
        isHovered: Bool = false,
        isEnabled: Bool = true
    ) -> MeeshyTileRecipe {
        let responding = (isPressed || isHovered) && isEnabled
        return MeeshyTileRecipe(
            tone: surface == .theme ? .themeInk : .onMedia,
            ringOpacity: selectionStyle == .ring && isSelected ? 1 : 0,
            fillOpacity: fillOpacity(style: selectionStyle, isSelected: isSelected),
            fillInk: fillInk(surface: surface, style: selectionStyle, isSelected: isSelected),
            opacity: isEnabled ? (responding ? pressedOpacity : 1) : disabledOpacity,
            isActionEnabled: isEnabled
        )
    }

    private static func fillOpacity(style: MeeshyTileSelectionStyle, isSelected: Bool) -> Double {
        guard style == .fill else { return 0 }
        return isSelected ? 1 : restFillOpacity
    }

    private static func fillInk(surface: MeeshyTileSurface, style: MeeshyTileSelectionStyle, isSelected: Bool) -> MeeshyTileInk? {
        guard style == .fill, isSelected else { return nil }
        return surface == .theme ? .themeInverse : .indigo950
    }
}

// MARK: - Jetons

public nonisolated extension MeeshyTileRecipe {
    func toneColor(isDark: Bool) -> Color {
        switch tone {
        case .onMedia: return MeeshyColors.onMedia
        case .themeInk: return MeeshyColors.textPrimary(isDark: isDark)
        }
    }

    func fillInkColor(isDark: Bool) -> Color? {
        switch fillInk {
        case .indigo950: return MeeshyColors.indigo950
        case .themeInverse: return MeeshyColors.backgroundPrimary(isDark: isDark)
        case nil: return nil
        }
    }

    /// Le cercle (ou le nom) contre le fond sur lequel la bande se pose : le
    /// contraste est celui de la RECETTE, pas d'une valeur recopiée.
    func contrast(against backdrop: Color, isDark: Bool) -> Double {
        CanvasChromeScheme.contrastRatio(Double(toneColor(isDark: isDark).luminance), Double(backdrop.luminance))
    }
}
