import SwiftUI

/// Un disque résolu, en VALEURS : un `View` ne s'inspecte pas, sa recette si.
/// Le repos est un verre dense à l'encre blanche ; le chaud reprend le fond et
/// l'encre de la tenue de K02 (`active` pour la duplication, `destructive`
/// pour la poubelle) et pose un anneau de la couleur du fond.
public nonisolated struct MeeshyDragTargetsDiscRecipe: Equatable, Sendable {
    public let target: MeeshyDragTarget
    public let isHot: Bool
    public let diameter: Double
    public let scale: Double
    public let glyphSize: Double
    public let density: MeeshyGlassDensity
    /// Ce que K25 demande à K01 : le verre au ton de l'hôte, ce verre teinté
    /// de rouge, ou aucune matière quand le fond est plein.
    public let glass: MeeshyGlassButtonGlassRequest
    public let fill: MeeshyGlassButtonFill
    public let fillOpacity: Double
    public let ink: MeeshyGlassButtonInk
    public let ringWidth: Double
    public let ringOpacity: Double
    let button: MeeshyGlassButtonRecipe

    public func fillColor(isDark: Bool) -> Color {
        isHot ? button.fillColor(isDark: isDark) : .clear
    }

    public func inkColor(isDark: Bool) -> Color {
        isHot ? button.inkColor(isDark: isDark) : MeeshyColors.onMedia
    }

    /// La couleur de l'anneau : celle du fond chaud. Sous Liquid Glass le fond
    /// de la poubelle est le verre teinté ; l'anneau reste rouge.
    public func ringColor(isDark: Bool) -> Color {
        target == .remove ? MeeshyColors.errorStrong : button.fillColor(isDark: isDark)
    }

    /// L'encre contre son fond plein, à pleine opacité ; `nil` au repos et
    /// quand le fond est le verre.
    public func solidContrast(isDark: Bool) -> Double? {
        isHot ? button.solidContrast(isDark: isDark) : nil
    }
}

/// La recette de K25 : toutes ses mesures propres, nulle part ailleurs.
public nonisolated enum MeeshyDragTargetsRecipe {
    public static let diameter = 60.0
    public static let hotScale = 1.25
    public static let glyphSize = 26.0
    public static let ringWidth = Double(MeeshySpacing.xsPlus)
    public static let ringOpacity = 0.3

    /// L'objet glissé au-dessus de la poubelle : 64 sur 112, à 75 %.
    public static let draggedScale = 0.57
    public static let draggedOpacity = 0.75

    public static let appearDuration = 0.2
    public static let appearScale = 0.8
    public static let exitDuration = 0.15
    public static let heatFadeDuration = 0.15
    public static let heatResponse = 0.3
    public static let heatDamping = 0.7

    /// Le rayon du disque chaud : on entre quand le doigt y arrive.
    public static let captureRadius = diameter * hotScale / 2
    /// Le bord de l'anneau : on sort quand le doigt le dépasse.
    public static let releaseRadius = captureRadius + ringWidth

    public static func disc(
        target: MeeshyDragTarget,
        isHot: Bool,
        tone: MeeshyGlassTone,
        material: MeeshyGlassMaterial
    ) -> MeeshyDragTargetsDiscRecipe {
        let button = MeeshyGlassButtonRecipe.resolve(
            kind: target == .duplicate ? .active : .destructive,
            size: .s44,
            tone: tone,
            material: material
        )
        return MeeshyDragTargetsDiscRecipe(
            target: target,
            isHot: isHot,
            diameter: diameter,
            scale: isHot ? hotScale : 1,
            glyphSize: glyphSize,
            density: .dense,
            glass: isHot ? button.glass : .neutral,
            fill: isHot ? button.fill : .clear,
            fillOpacity: isHot ? button.fillOpacity : 0,
            ink: isHot ? button.ink : .onMedia,
            ringWidth: ringWidth,
            ringOpacity: isHot ? ringOpacity : 0,
            button: button
        )
    }

    /// L'objet glissé : réduit et allégé au-dessus de la poubelle seulement.
    public static func draggedScale(over target: MeeshyDragTarget?) -> Double {
        target == .remove ? draggedScale : 1
    }

    public static func draggedOpacity(over target: MeeshyDragTarget?) -> Double {
        target == .remove ? draggedOpacity : 1
    }

    /// L'apparition et la sortie : fondu, 200 ms à l'entrée et 150 ms à la sortie.
    public static func presence(appearing: Bool) -> Animation {
        .easeOut(duration: appearing ? appearDuration : exitDuration)
    }

    /// Le passage au chaud : un ressort sur l'échelle, aucun sous « réduire les animations ».
    public static func heat(reduceMotion: Bool) -> Animation? {
        MeeshyMotion.animation(.spring(response: heatResponse, dampingFraction: heatDamping), reduce: reduceMotion)
    }

    /// Le fondu enchaîné du fond au passage au chaud.
    public static func heatFade(reduceMotion: Bool) -> Animation? {
        MeeshyMotion.animation(.easeInOut(duration: heatFadeDuration), reduce: reduceMotion)
    }

    /// L'objet glissé se réduit par ressort, d'un coup sous « réduire les animations ».
    public static func dragged(reduceMotion: Bool) -> Animation? {
        heat(reduceMotion: reduceMotion)
    }
}
