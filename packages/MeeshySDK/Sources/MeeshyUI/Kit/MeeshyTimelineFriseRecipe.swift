import SwiftUI

/// L'encre de la frise : blanche sur la plaque sombre d'un média, celle du
/// thème sur une feuille claire (ton `theme`).
public nonisolated enum MeeshyTimelineFriseInk: String, Sendable, Equatable, CaseIterable {
    case onMedia
    case theme
}

/// **La recette en valeurs de la frise** : toutes ses mesures propres, nulle
/// part ailleurs (fiche K22 § 6), et ce que l'état du geste en fait.
public nonisolated struct MeeshyTimelineFriseRecipe: Sendable, Equatable {
    // Rangées, barres, couloir.
    public static let rowHeight: CGFloat = MeeshyControlSize.tapTarget
    public static let regularBarHeight: CGFloat = 34
    public static let tallBarHeight: CGFloat = 40
    public static let laneWidth: CGFloat = 26
    public static let laneGap: CGFloat = MeeshySpacing.xsPlus
    public static let iconSize: CGFloat = MeeshyIconSize.md
    public static let iconOpacity = 0.75
    public static let bedOpacity = 0.06
    public static let radius: CGFloat = MeeshyRadius.xs
    // Règle.
    public static let rulerHeight: CGFloat = MeeshyControlSize.tapTarget
    public static let rulerDrawnHeight: CGFloat = 18
    public static let minorTickHeight: CGFloat = 4
    public static let majorTickHeight: CGFloat = 9
    public static let tickWidth: CGFloat = 1
    public static let minorTickOpacity = 0.35
    public static let majorTickOpacity = 0.7
    public static let labelOpacity = 0.85
    public static let scrollBarHeight: CGFloat = 1.5
    public static let scrollBarMinimumWidth: CGFloat = 6
    public static let scrollBarOpacity = 0.8
    // Piste choisie.
    public static let ringWidth: CGFloat = 2
    public static let haloRadius: CGFloat = 14
    public static let haloOpacity = 0.45
    public static let dimmedOpacity = 0.5
    public static let handleWidth: CGFloat = 10
    public static let keyframeSize: CGFloat = 12
    public static let keyframeBorder: CGFloat = 2
    // Accroche.
    public static let snapLineWidth: CGFloat = 2
    public static let snapDash: [CGFloat] = [4, 3]
    // Tête.
    public static let playheadWidth: CGFloat = 2
    public static let playheadOverflow: CGFloat = 5
    public static let playheadCap: CGFloat = 14
    public static let playheadHaloRadius: CGFloat = 10
    // Liserés, désactivée.
    public static let edgeWidth: CGFloat = 1
    public static let edgeOpacity = 0.55
    public static let disabledOpacity = 0.4
    public static let focusRingWidth: CGFloat = 2
    // Ligne du haut.
    public static let topLineGap: CGFloat = MeeshySpacing.smPlus
    public static let hintHeight: CGFloat = 34
    // Durées.
    public static let snapFade = 0.1
    public static let selectionFade = 0.15
    public static let settleDuration = 0.2
    /// Le glissé d'une barre ou d'une poignée ne part qu'au-delà de ce seuil.
    public static let dragThreshold: CGFloat = 2
    /// Le défilement du fond d'une frise zoomée.
    public static let panThreshold: CGFloat = 8

    public let heldPart: MeeshyTimelineFrisePart?
    public let isSnapped: Bool
    public let isZoomed: Bool
    public let hasSelection: Bool
    public let contentOpacity: Double
    public let ink: MeeshyTimelineFriseInk

    public static func resolve(
        tone: MeeshyGlassTone,
        isEnabled: Bool,
        held: MeeshyTimelineFrisePart?,
        isSnapped: Bool,
        isZoomed: Bool,
        hasSelection: Bool
    ) -> MeeshyTimelineFriseRecipe {
        let active = isEnabled ? held : nil
        return MeeshyTimelineFriseRecipe(
            heldPart: active,
            isSnapped: isSnapped && active != nil && active != .playhead,
            isZoomed: isZoomed,
            hasSelection: hasSelection,
            contentOpacity: isEnabled ? 1 : disabledOpacity,
            ink: tone == .theme ? .theme : .onMedia
        )
    }

    public static func barHeight(_ height: MeeshyTimelineFriseTrackHeight) -> CGFloat {
        height == .tall ? tallBarHeight : regularBarHeight
    }

    /// Une piste choisie efface les autres barres à 50 % ; rien de choisi, aucune.
    public func barOpacity(isSelected: Bool) -> Double {
        hasSelection && !isSelected ? Self.dimmedOpacity : 1
    }

    /// Les losanges s'effacent pendant qu'une poignée est tenue.
    public var keyframeOpacity: Double {
        heldPart == .start || heldPart == .end ? 0 : 1
    }

    /// Le couloir d'icônes et la règle (fiche : 26 + 6).
    public static var timeInset: CGFloat { laneWidth + laneGap }
}

// MARK: - Jetons

public nonisolated extension MeeshyTimelineFriseRecipe {
    /// La tête, l'anneau, les poignées et les losanges : blancs, toujours sur un liseré sombre.
    var markColor: Color { MeeshyColors.onMedia }

    var edgeColor: Color { MeeshyColors.mediaBackdrop.opacity(Self.edgeOpacity) }

    var haloColor: Color { MeeshyColors.onMedia.opacity(Self.haloOpacity) }

    var playheadHaloColor: Color { MeeshyColors.onMedia.opacity(Self.haloOpacity) }

    func inkColor(isDark: Bool) -> Color {
        switch ink {
        case .onMedia: return MeeshyColors.onMedia
        case .theme: return MeeshyColors.textPrimary(isDark: isDark)
        }
    }

    func labelColor(isDark: Bool) -> Color { inkColor(isDark: isDark).opacity(Self.labelOpacity) }

    func tickColor(isMajor: Bool, isDark: Bool) -> Color {
        inkColor(isDark: isDark).opacity(isMajor ? Self.majorTickOpacity : Self.minorTickOpacity)
    }

    func bedColor(isDark: Bool) -> Color { inkColor(isDark: isDark).opacity(Self.bedOpacity) }

    func iconColor(isDark: Bool) -> Color { inkColor(isDark: isDark).opacity(Self.iconOpacity) }

    func scrollBarColor(isDark: Bool) -> Color { inkColor(isDark: isDark).opacity(Self.scrollBarOpacity) }

    /// La ligne d'accroche : jaune sur la plaque d'un média, à l'encre du thème
    /// sur une feuille claire (le jaune y tomberait à 1,7:1).
    func snapLineColor(isDark: Bool) -> Color {
        switch ink {
        case .onMedia: return MeeshyColors.mediaTrim
        case .theme: return MeeshyColors.textPrimary(isDark: isDark)
        }
    }

    /// L'étiquette d'accroche reste jaune, encre sombre, dans les deux tons.
    var snapLabelFill: Color { MeeshyColors.mediaTrim }

    var snapLabelInk: Color { MeeshyColors.mediaBackdrop }

    /// La puce de l'invite : le voile d'un média, ou un voile de l'encre du thème
    /// sur une feuille claire (le voile blanc y disparaîtrait).
    func hintFill(isDark: Bool) -> Color {
        switch ink {
        case .onMedia: return MeeshyColors.mediaFill
        case .theme: return inkColor(isDark: isDark).opacity(Self.bedOpacity)
        }
    }

    func focusColor(isDark: Bool) -> Color { inkColor(isDark: isDark) }

    /// Le contraste calculé, jamais déclaré : l'encre de l'étiquette sur son jaune.
    var snapLabelContrast: Double {
        CanvasChromeScheme.contrastRatio(Double(snapLabelInk.luminance), Double(snapLabelFill.luminance))
    }

    /// La ligne d'accroche contre ce qui la porte : la plaque sombre, ou le fond de l'app.
    func snapLineContrast(isDark: Bool) -> Double {
        let ground = ink == .theme ? MeeshyColors.backgroundPrimary(isDark: isDark) : MeeshyColors.mediaBackdrop
        return CanvasChromeScheme.contrastRatio(Double(snapLineColor(isDark: isDark).luminance), Double(ground.luminance))
    }

    /// Une marque blanche contre son liseré sombre : lisible sur toute barre teintée.
    var markContrast: Double {
        CanvasChromeScheme.contrastRatio(Double(markColor.luminance), Double(MeeshyColors.mediaBackdrop.luminance))
    }
}
