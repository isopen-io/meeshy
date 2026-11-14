import SwiftUI

/// L'encre du relevé : blanche sur un média, panneau ou verre ; celle du thème
/// sur une feuille claire (ton `theme`).
public nonisolated enum MeeshyTrimTrackInk: String, Sendable, Equatable, CaseIterable {
    case onMedia
    case theme
}

/// La recette en valeurs d'une piste de coupe : toutes ses mesures propres, nulle part ailleurs.
public nonisolated struct MeeshyTrimTrackRecipe: Sendable, Equatable {
    public static let regularHeight: CGFloat = 56
    public static let tallHeight: CGFloat = 60
    public static let radius: CGFloat = MeeshyRadius.smPlus
    public static let handleWidth: CGFloat = MeeshySpacing.mdPlus
    public static let frameThickness: CGFloat = 3
    public static let gripWidth: CGFloat = 3
    public static let restGripHeight: CGFloat = 18
    public static let heldGripHeight: CGFloat = 26
    public static let hoveredGripHeight: CGFloat = 22
    public static let gripRadius: CGFloat = 2
    public static let gripOpacity = 0.55
    public static let handleShadowRadius: CGFloat = 2
    public static let handleShadowOpacity = 0.35
    public static let playheadWidth: CGFloat = 3
    public static let heldPlayheadWidth: CGFloat = 4
    public static let playheadHaloRadius: CGFloat = 8
    public static let playheadHaloOpacity = 0.5
    public static let veilOpacity = 0.62
    public static let loupeOpacity = 0.78
    public static let disabledOpacity = 0.4
    public static let readoutOpacity = 0.85
    public static let readoutGap: CGFloat = MeeshySpacing.xsPlus
    public static let readoutShrink: CGFloat = 0.7
    public static let hitWidth: CGFloat = MeeshyControlSize.tapTarget
    public static let focusRingWidth: CGFloat = 2
    public static let tickWidth: CGFloat = 1
    public static let centerLineWidth: CGFloat = 2
    public static let minorTickFraction: CGFloat = 0.3
    public static let majorTickFraction: CGFloat = 0.6
    public static let minorTickOpacity = 0.5
    public static let majorTickOpacity = 0.9
    public static let capsuleOpacity = 0.6
    /// L'appui long qui ouvre la précision, et le jeu toléré pendant qu'il tient.
    public static let holdDuration = 0.4
    public static let holdSlop: CGFloat = 4
    /// Le glissé ne part qu'au-delà de ce seuil.
    public static let dragThreshold: CGFloat = 2
    public static let loupeFade = 0.15
    /// Plage changée par l'hôte (annuler, réinitialiser) : la poignée glisse en 200 ms.
    public static let settleDuration = 0.2

    public let heldPart: MeeshyTrimTrackPart?
    public let isPrecise: Bool
    public let isRemoval: Bool
    public let contentOpacity: Double
    public let ink: MeeshyTrimTrackInk

    public static func resolve(
        tone: MeeshyGlassTone,
        selection: MeeshyTrimTrackSelection,
        isEnabled: Bool,
        held: MeeshyTrimTrackPart?,
        isPrecise: Bool
    ) -> MeeshyTrimTrackRecipe {
        let active = isEnabled ? held : nil
        return MeeshyTrimTrackRecipe(
            heldPart: active,
            isPrecise: isPrecise && active != nil && active != .playhead,
            isRemoval: selection == .removed,
            contentOpacity: isEnabled ? 1 : disabledOpacity,
            ink: tone == .theme ? .theme : .onMedia
        )
    }

    public static func height(_ height: MeeshyTrimTrackHeight) -> CGFloat {
        height == .tall ? tallHeight : regularHeight
    }

    /// La prise d'une poignée : 18 de haut, 26 tenue, 22 sous le pointeur.
    public func gripHeight(of part: MeeshyTrimTrackPart, isHovered: Bool = false) -> CGFloat {
        if heldPart == part { return Self.heldGripHeight }
        return isHovered ? Self.hoveredGripHeight : Self.restGripHeight
    }

    public var playheadWidth: CGFloat {
        heldPart == .playhead ? Self.heldPlayheadWidth : Self.playheadWidth
    }

    /// En précision, seule la poignée tenue reste ; la tête, le liseré et le relevé s'effacent.
    public func handleOpacity(of part: MeeshyTrimTrackPart) -> Double {
        isPrecise && heldPart != part ? 0 : 1
    }

    public var chromeOpacity: Double { isPrecise ? 0 : 1 }
}

// MARK: - Jetons

public nonisolated extension MeeshyTrimTrackRecipe {
    /// Le jaune de la coupe, la couleur d'erreur d'un retrait.
    var handleColor: Color { isRemoval ? MeeshyColors.error : MeeshyColors.mediaTrim }

    var bedColor: Color { MeeshyColors.mediaBackdrop }

    var veilColor: Color { MeeshyColors.mediaBackdrop.opacity(Self.veilOpacity) }

    var gripColor: Color { MeeshyColors.mediaBackdrop.opacity(Self.gripOpacity) }

    var handleShadowColor: Color { MeeshyColors.mediaBackdrop.opacity(Self.handleShadowOpacity) }

    var playheadColor: Color { MeeshyColors.onMedia }

    var playheadHaloColor: Color { MeeshyColors.onMedia.opacity(Self.playheadHaloOpacity) }

    var loupeColor: Color { MeeshyColors.mediaBackdrop.opacity(Self.loupeOpacity) }

    var capsuleColor: Color { MeeshyColors.mediaBackdrop.opacity(Self.capsuleOpacity) }

    var capsuleInk: Color { MeeshyColors.onMedia }

    func readoutColor(isDark: Bool) -> Color {
        switch ink {
        case .onMedia: return MeeshyColors.onMediaSecondary
        case .theme: return MeeshyColors.textPrimary(isDark: isDark).opacity(Self.readoutOpacity)
        }
    }

    /// La durée gardée : en jaune sur un média, en encre pleine sur une feuille claire.
    func keptColor(isDark: Bool) -> Color {
        switch ink {
        case .onMedia: return MeeshyColors.mediaTrim
        case .theme: return MeeshyColors.textPrimary(isDark: isDark)
        }
    }

    var keptWeight: Font.Weight { .semibold }

    func tickColor(isMajor: Bool) -> Color {
        MeeshyColors.onMedia.opacity(isMajor ? Self.majorTickOpacity : Self.minorTickOpacity)
    }

    /// Le contraste calculé, jamais déclaré : la tête sur le lit sombre.
    var playheadContrast: Double {
        CanvasChromeScheme.contrastRatio(Double(playheadColor.luminance), Double(bedColor.luminance))
    }

    /// La durée gardée contre ce qui la porte : le lit sombre, ou le fond de l'app en ton `theme`.
    func keptContrast(isDark: Bool) -> Double {
        let ground = ink == .theme ? MeeshyColors.backgroundPrimary(isDark: isDark) : MeeshyColors.mediaBackdrop
        return CanvasChromeScheme.contrastRatio(Double(keptColor(isDark: isDark).luminance), Double(ground.luminance))
    }
}
