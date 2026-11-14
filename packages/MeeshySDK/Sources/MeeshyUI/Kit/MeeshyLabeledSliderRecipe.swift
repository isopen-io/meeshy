import SwiftUI

/// L'encre d'un curseur : blanche sur un média, panneau ou verre ; celle du
/// thème sur une feuille claire (ton `theme`).
public nonisolated enum MeeshyLabeledSliderInk: String, Sendable, Equatable, CaseIterable {
    case onMedia
    case theme
}

/// La recette en valeurs d'un curseur : toutes ses mesures propres, nulle part ailleurs.
public nonisolated struct MeeshyLabeledSliderRecipe: Sendable, Equatable {
    public static let trackHeight: CGFloat = 4
    public static let thumbDiameter: CGFloat = 20
    /// Le centre du pouce va de `thumbInset` à largeur − `thumbInset` : il reste dans la piste.
    public static let thumbInset: CGFloat = thumbDiameter / 2
    public static let haloDiameter: CGFloat = 32
    public static let pressedHaloOpacity = 0.22
    public static let hoveredHaloOpacity = pressedHaloOpacity / 2
    public static let pressedScale = 1.2
    public static let disabledOpacity = 0.4
    public static let restValueOpacity = 0.85
    public static let emptyTrackOpacity = 0.2
    public static let shadowRadius: CGFloat = 6
    public static let shadowOffsetY: CGFloat = 2
    public static let shadowOpacity = 0.35
    public static let focusRingDiameter: CGFloat = thumbDiameter + 8
    public static let focusRingWidth: CGFloat = 2
    /// Le glissé ne part qu'au-delà de ce seuil : un toucher bref reste un toucher, un glissé vertical reste à l'hôte.
    public static let dragThreshold: CGFloat = 6
    /// Valeur changée hors du doigt (remise, annulation, clavier) : le pouce glisse en 200 ms.
    public static let settleDuration = 0.2

    public let hitHeight: CGFloat
    public let thumbScale: Double
    public let haloOpacity: Double
    public let contentOpacity: Double
    public let valueOpacity: Double
    public let ink: MeeshyLabeledSliderInk
    public let tint: Color?

    public static func resolve(
        tone: MeeshyGlassTone,
        isEnabled: Bool,
        isPressed: Bool,
        isOffNeutral: Bool,
        tint: Color?,
        reduceMotion: Bool = false,
        isHovered: Bool = false
    ) -> MeeshyLabeledSliderRecipe {
        let held = isPressed && isEnabled
        let hovered = isHovered && isEnabled && !held
        return MeeshyLabeledSliderRecipe(
            hitHeight: MeeshyControlSize.tapTarget,
            thumbScale: held && !reduceMotion ? pressedScale : 1,
            haloOpacity: held ? pressedHaloOpacity : hovered ? hoveredHaloOpacity : 0,
            contentOpacity: isEnabled ? 1 : disabledOpacity,
            valueOpacity: isOffNeutral ? 1 : restValueOpacity,
            ink: tone == .theme ? .theme : .onMedia,
            tint: tint
        )
    }
}

// MARK: - Jetons

public nonisolated extension MeeshyLabeledSliderRecipe {
    func inkColor(isDark: Bool) -> Color {
        switch ink {
        case .onMedia: return MeeshyColors.onMedia
        case .theme: return MeeshyColors.textPrimary(isDark: isDark)
        }
    }

    func valueColor(isDark: Bool) -> Color {
        inkColor(isDark: isDark).opacity(valueOpacity)
    }

    func emptyTrackColor(isDark: Bool) -> Color {
        inkColor(isDark: isDark).opacity(Self.emptyTrackOpacity)
    }

    func fillColor(isDark: Bool) -> Color {
        tint ?? inkColor(isDark: isDark)
    }

    func haloColor(isDark: Bool) -> Color {
        inkColor(isDark: isDark).opacity(haloOpacity)
    }

    var shadowColor: Color {
        MeeshyColors.mediaBackdrop.opacity(Self.shadowOpacity)
    }

    /// Le pouce contre le fond qu'il touche : le fond de l'app pour le ton
    /// `theme`, le fond d'une visionneuse sinon.
    func thumbContrast(isDark: Bool) -> Double {
        let ground = ink == .theme ? MeeshyColors.backgroundPrimary(isDark: isDark) : MeeshyColors.mediaBackdrop
        return CanvasChromeScheme.contrastRatio(
            Double(inkColor(isDark: isDark).luminance), Double(ground.luminance)
        )
    }
}
