import SwiftUI

/// Le fond de la capsule : le voile de l'encre claire, l'encre du thème, ou la
/// teinte de l'hôte (la courante teintée).
public nonisolated enum MeeshyChipFill: String, Sendable, Equatable, CaseIterable {
    case onMedia
    case themeInk
    case tint
}

/// L'encre du titre et des glyphes.
public nonisolated enum MeeshyChipInk: String, Sendable, Equatable, CaseIterable {
    case onMedia
    case indigo950
    case themeInk
    case themeInverse
}

/// **La recette d'une puce en VALEURS** : un `View` ne s'inspecte pas, sa
/// recette si. Toute valeur chiffrée de la puce vit ici, nulle part ailleurs.
/// K04 ne pose aucune matière : un voile plat, jamais de verre ni de liseré.
public nonisolated struct MeeshyChipRecipe: Equatable, Sendable {
    /// La police d'une puce à la taille que l'hôte a déjà mise à l'échelle
    /// (@ScaledMetric du titre, tailles d'icône du système de design).
    public static func font(size: CGFloat, weight: Font.Weight) -> Font {
        Font.system(size: size, weight: weight)
    }

    public let fill: MeeshyChipFill
    /// L'opacité du fond, appui et survol compris.
    public let fillOpacity: Double
    public let ink: MeeshyChipInk
    /// Désactivée : tout le contenu à 40 %.
    public let opacity: Double
    public let isActionEnabled: Bool

    public var respondsToTouch: Bool { isActionEnabled }
    public var playsHaptic: Bool { isActionEnabled }

    public static let disabledOpacity = 0.4
    public static let restFillOpacity = MeeshyOpacity.subtle
    public static let pressedFillOpacity = MeeshyOpacity.light
    public static let selectedFillOpacity = 1.0
    public static let selectedPressedFillOpacity = MeeshyOpacity.intense
    public static let toneFadeDuration = 0.2
    public static let edgeFadeDuration = 0.15
    public static let revealDuration = 0.25
    /// L'estompe de bord : la largeur d'une cible tactile.
    public static let edgeFade = MeeshyControlSize.tapTarget

    public static func resolve(
        surface: MeeshyChipRowSurface,
        isSelected: Bool,
        isPressed: Bool = false,
        isHovered: Bool = false,
        isEnabled: Bool = true,
        isTinted: Bool = false
    ) -> MeeshyChipRecipe {
        let responding = (isPressed || isHovered) && isEnabled
        let tinted = isSelected && isTinted
        return MeeshyChipRecipe(
            fill: tinted ? .tint : surface == .theme ? .themeInk : .onMedia,
            fillOpacity: fillOpacity(isSelected: isSelected, responding: responding),
            ink: ink(surface: surface, isSelected: isSelected, isTinted: tinted),
            opacity: isEnabled ? 1 : disabledOpacity,
            isActionEnabled: isEnabled
        )
    }

    private static func fillOpacity(isSelected: Bool, responding: Bool) -> Double {
        switch (isSelected, responding) {
        case (true, true): return selectedPressedFillOpacity
        case (true, false): return selectedFillOpacity
        case (false, true): return pressedFillOpacity
        case (false, false): return restFillOpacity
        }
    }

    private static func ink(surface: MeeshyChipRowSurface, isSelected: Bool, isTinted: Bool) -> MeeshyChipInk {
        if isTinted { return .onMedia }
        switch (surface, isSelected) {
        case (.onMedia, true): return .indigo950
        case (.onMedia, false): return .onMedia
        case (.theme, true): return .themeInverse
        case (.theme, false): return .themeInk
        }
    }
}

// MARK: - Jetons

public nonisolated extension MeeshyChipRecipe {
    func fillColor(isDark: Bool, tint: Color?) -> Color {
        switch fill {
        case .onMedia: return MeeshyColors.onMedia
        case .themeInk: return MeeshyColors.textPrimary(isDark: isDark)
        case .tint: return tint ?? MeeshyColors.onMedia
        }
    }

    func inkColor(isDark: Bool) -> Color {
        switch ink {
        case .onMedia: return MeeshyColors.onMedia
        case .indigo950: return MeeshyColors.indigo950
        case .themeInk: return MeeshyColors.textPrimary(isDark: isDark)
        case .themeInverse: return MeeshyColors.backgroundPrimary(isDark: isDark)
        }
    }

    /// L'encre contre le fond de la feuille, une fois le voile posé dessus
    /// (composition en luminance linéaire, comme `CanvasChromeScheme`). Le
    /// contraste est celui de la RECETTE, pas d'une valeur recopiée.
    func contrast(over backdrop: Color, isDark: Bool, tint: Color? = nil) -> Double {
        let veil = fillColor(isDark: isDark, tint: tint)
        let ink = inkColor(isDark: isDark)
        let covered = backdrop.luminance * CGFloat(1 - fillOpacity) + veil.luminance * CGFloat(fillOpacity)
        return CanvasChromeScheme.contrastRatio(Double(ink.luminance), Double(covered))
    }
}
