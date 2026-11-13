import Foundation
import SwiftUI

/// Une ombre, en valeurs : opacité du noir, rayon, décalage vertical.
public nonisolated struct MeeshyThumbnailShadow: Equatable, Sendable {
    public let opacity: Double
    public let radius: CGFloat
    public let y: CGFloat

    public init(opacity: Double, radius: CGFloat, y: CGFloat) {
        self.opacity = opacity
        self.radius = radius
        self.y = y
    }
}

/// **La recette de la rangée en VALEURS** : un `View` ne s'inspecte pas, sa
/// recette si. Toute valeur chiffrée de la rangée vit ici, nulle part ailleurs.
/// K20 ne pose aucune matière : ni verre, ni flou, ni bande.
public nonisolated struct MeeshyThumbnailRowRecipe: Equatable, Sendable {
    public let tone: MeeshyGlassTone
    /// 1 sur la courante et sur la soulevée, sinon 0.
    public let ringOpacity: Double
    /// Le filet sombre qui détache chaque vignette d'une scène claire (`onLight`).
    public let outlineOpacity: Double
    /// Appui et survol 85 %, désactivée 40 %.
    public let opacity: Double
    public let plusVeilOpacity: Double
    /// La soulevée grandit et s'incline ; sous « réduire les animations », non.
    public let scale: CGFloat
    public let tiltDegrees: Double
    public let shadow: MeeshyThumbnailShadow
    public let isActionEnabled: Bool

    // MARK: Mesures de la planche

    public static let defaultTileHeight: CGFloat = 48
    public static let minTileHeight: CGFloat = 32
    public static let defaultAspectRatio: CGFloat = 9.0 / 16.0
    public static let radius = MeeshyRadius.xs
    public static let spacing = MeeshySpacing.xsPlus
    public static let ringWidth = MeeshyBorder.strong
    /// Le filet sombre d'une scène claire.
    public static let outlineWidth = MeeshyBorder.regular
    public static let onLightOutlineOpacity = 0.8

    public static let restShadow = MeeshyThumbnailShadow(opacity: 0.45, radius: 12, y: 4)
    public static let liftShadow = MeeshyThumbnailShadow(opacity: 0.6, radius: 30, y: 14)
    public static let liftScale: CGFloat = 1.15
    public static let liftTiltDegrees: Double = -6

    public static let plusVeilRestOpacity = 0.35
    public static let plusVeilOnLightOpacity = 0.62
    public static let plusStroke = MeeshyBorder.emphasis
    public static let plusStrokeOpacity = MeeshyOpacity.intense
    public static let plusGlyph = MeeshyIconSize.md

    public static let placeholderStroke = MeeshyBorder.emphasis
    public static let placeholderOpacity = 0.6

    public static let crossDisc: CGFloat = 24
    public static let crossStroke = MeeshyBorder.emphasis
    public static let crossGlyph = MeeshyIconSize.xs
    public static let crossOverhangX: CGFloat = 8
    public static let crossOverhangY: CGFloat = 10
    public static let crossTarget = MeeshyControlSize.tapTarget

    /// Le diamètre de l'anneau d'envoi : 22, ou la largeur de la vignette moins 4.
    public static let statusRing: CGFloat = 22
    public static let statusRingMargin: CGFloat = 4
    public static let waitingVeil = MeeshyOpacity.strong
    public static let waitingGlyph = MeeshyIconSize.sm

    public static let targetHeight = MeeshyControlSize.tapTarget
    /// Ce que la rangée défilante réserve autour des vignettes : le cercle, le
    /// filet et la croix qui déborde ne sont jamais rognés par le défilement.
    public static let reserveX: CGFloat = crossOverhangX + ringWidth + outlineWidth
    public static let reserveY: CGFloat = crossOverhangY + ringWidth + outlineWidth

    public static let disabledOpacity = 0.4
    public static let pressedOpacity = MeeshyOpacity.intense

    // MARK: Temps

    /// Un second toucher rapide : moins que cela, c'est un double toucher.
    public static let tapWindow: TimeInterval = 0.3
    public static let holdDuration: TimeInterval = 0.4
    /// L'appui long s'annule au-delà de ce déplacement.
    public static let holdSlop: CGFloat = 10
    /// Une fois armée, la vignette part au glisser dès ce déplacement.
    public static let armedDragSlop: CGFloat = 4
    public static let ringFadeDuration = 0.2
    public static let neighbourDuration = 0.2
    public static let revealDuration = 0.25
    public static let liftResponse = 0.3
    public static let liftDamping = 0.7
    /// La rangée défilante avance seule toutes les `edgeScrollInterval` secondes
    /// quand le doigt est dans la zone d'un bord.
    public static let edgeScrollInterval = 0.12

    // MARK: Résolution

    public static func resolve(
        tone: MeeshyGlassTone,
        isCurrent: Bool,
        isLifted: Bool,
        isPressed: Bool = false,
        isHovered: Bool = false,
        isEnabled: Bool = true,
        reduceMotion: Bool = false
    ) -> MeeshyThumbnailRowRecipe {
        let responding = (isPressed || isHovered) && isEnabled
        let lifts = isLifted && !reduceMotion
        return MeeshyThumbnailRowRecipe(
            tone: tone,
            ringOpacity: isCurrent || isLifted ? 1 : 0,
            outlineOpacity: tone == .onLight ? onLightOutlineOpacity : 0,
            opacity: isEnabled ? (responding ? pressedOpacity : 1) : disabledOpacity,
            plusVeilOpacity: tone == .onLight ? plusVeilOnLightOpacity : plusVeilRestOpacity,
            scale: lifts ? liftScale : 1,
            tiltDegrees: lifts ? liftTiltDegrees : 0,
            shadow: isLifted ? liftShadow : restShadow,
            isActionEnabled: isEnabled
        )
    }

    /// Le bouton « + » : il s'appuie à 85 %, sans échelle ; désactivé, il n'existe pas.
    public static func plusOpacity(isPressed: Bool, isHovered: Bool) -> Double {
        isPressed || isHovered ? pressedOpacity : 1
    }
}

// MARK: - Jetons

public nonisolated extension MeeshyThumbnailRowRecipe {
    /// L'encre du cercle, du « + » et de la croix : celle du média, ou celle du
    /// thème quand l'hôte pose le ton `theme`.
    func inkColor(isDark: Bool) -> Color {
        tone == .theme ? MeeshyColors.textPrimary(isDark: isDark) : MeeshyColors.onMedia
    }

    /// Le voile derrière le « + » : le noir de la scène, ou un voile de l'encre du thème.
    func plusVeilColor(isDark: Bool) -> Color {
        tone == .theme
            ? MeeshyColors.textPrimary(isDark: isDark).opacity(MeeshyOpacity.subtle)
            : MeeshyColors.mediaBackdrop.opacity(plusVeilOpacity)
    }

    var outlineColor: Color {
        MeeshyColors.mediaBackdrop.opacity(outlineOpacity)
    }

    var shadowColor: Color {
        MeeshyColors.mediaBackdrop.opacity(shadow.opacity)
    }
}

// MARK: - Contraste

/// Le contraste se calcule depuis la RECETTE : un contraste recopié mentirait
/// dès qu'une valeur change. La luminance du fond est celle de la scène sous la
/// rangée (0…1).
public nonisolated extension MeeshyThumbnailRowRecipe {

    /// Le cercle contre ce qui l'entoure : le fond, assombri par le filet sombre
    /// (`onLight`) ou par l'ombre portée de la vignette.
    func ringContrast(backdropLuminance: Double, isDark: Bool) -> Double {
        let darkening = outlineOpacity > 0 ? outlineOpacity : shadow.opacity
        let around = backdropLuminance * (1 - darkening)
        return CanvasChromeScheme.contrastRatio(Double(inkColor(isDark: isDark).luminance), around)
    }

    /// Le filet du « + » (blanc à 85 %) contre le fond sous son voile.
    func plusContrast(backdropLuminance: Double, isDark: Bool) -> Double {
        let veiled = backdropLuminance * (1 - plusVeilOpacity)
        let ink = Double(inkColor(isDark: isDark).luminance)
        let stroke = Self.plusStrokeOpacity * ink + (1 - Self.plusStrokeOpacity) * veiled
        return CanvasChromeScheme.contrastRatio(stroke, veiled)
    }

    /// Le glyphe de la croix, de l'encre sur le disque d'erreur.
    func crossContrast(isDark: Bool) -> Double {
        CanvasChromeScheme.contrastRatio(
            Double(inkColor(isDark: isDark).luminance),
            Double(MeeshyColors.error.luminance)
        )
    }
}
