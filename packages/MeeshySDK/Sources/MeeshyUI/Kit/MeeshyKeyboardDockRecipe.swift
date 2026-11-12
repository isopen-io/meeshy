import CoreGraphics
import Foundation

/// **Les mesures du dock** (K17) : celles de la planche (390 × 844, clavier de 291) et les valeurs propres
/// du composant. Nulle part ailleurs.
public nonisolated enum MeeshyKeyboardDockRecipe {

    /// Les bords de la barre.
    public static let edge: CGFloat = MeeshySpacing.sm
    /// La marge intérieure de la barre.
    public static let barPadding: CGFloat = MeeshySpacing.xs
    /// Entre le bas de la barre et le haut du clavier.
    public static let keyboardGap: CGFloat = MeeshySpacing.xsPlus
    /// Entre la bande `above` et la barre.
    public static let aboveGap: CGFloat = MeeshySpacing.xs
    public static let barHeight: CGFloat = MeeshyControlSize.tapTarget + 2 * MeeshySpacing.xs
    public static let barRadius: CGFloat = barHeight / 2
    public static let toolDiameter: CGFloat = MeeshyControlSize.tapTarget
    public static let confirmHeight: CGFloat = MeeshyModeChromeRecipe.capsuleHeight
    public static let confirmMargin: CGFloat = MeeshyModeChromeRecipe.capsuleMargin
    /// La distance sous laquelle les verres des outils fondent l'un dans l'autre (iOS 26+).
    public static let toolGlassSpacing: CGFloat = MeeshySpacing.sm
    public static let maxItems = 5
    public static let maxBarWidth: CGFloat = 480

    /// Ce que prend le panneau quand aucun clavier n'a été mesuré : un clavier d'iPhone sans suggestions.
    public static let fallbackKeyboardHeight: CGFloat = 291
    /// Le repli ne dépasse jamais cette part de la fenêtre.
    public static let fallbackShare: CGFloat = 0.45
    /// En deçà, ce qui monte n'est pas un clavier logiciel (barre seule d'un clavier matériel, clavier flottant).
    public static let minimumKeyboardHeight: CGFloat = 160
    /// Où finit la scène au-dessus du dock.
    public static let sceneGap: CGFloat = MeeshySpacing.mdPlus
    public static let bottomWithoutKeyboardMargin: CGFloat = MeeshySpacing.xsPlus
    public static let bottomWithoutKeyboardFloor: CGFloat = MeeshySpacing.md

    public static let panelHorizontalPadding: CGFloat = MeeshySpacing.lg
    public static let panelVerticalPadding: CGFloat = MeeshySpacing.mdPlus
    public static let panelGap: CGFloat = MeeshySpacing.md
    public static let panelBottomFloor: CGFloat = MeeshySpacing.mdPlus

    /// La montée de la barre sur le web ; sur iOS elle suit le clavier du système.
    public static let barRiseDuration: Double = 0.26
    public static let bandEnterDuration: Double = 0.25
    public static let bandExitDuration: Double = 0.2
    public static let panelFadeDuration: Double = 0.15
    public static let bandTravel: CGFloat = 12
    public static let fallbackKeyboardDurationMs = 250

    /// Sans animation, la bande ne se translate plus : le fondu reste.
    public static func bandTravel(reduceMotion: Bool) -> CGFloat {
        reduceMotion ? 0 : bandTravel
    }

    /// La largeur de la barre dans son conteneur : bords à 8, bornée, donc centrée sur grand écran.
    public static func barWidth(containerWidth: CGFloat) -> CGFloat {
        max(0, min(containerWidth - 2 * edge, maxBarWidth))
    }

    /// Le bas de la barre quand aucun clavier ne la porte : la zone sûre plus 6, au moins 12.
    public static func bottomWithoutKeyboard(safeBottom: CGFloat) -> CGFloat {
        max(safeBottom + bottomWithoutKeyboardMargin, bottomWithoutKeyboardFloor)
    }

    /// Le bas du contenu du panneau : la zone sûre, au moins 14.
    public static func panelBottom(safeBottom: CGFloat) -> CGFloat {
        max(safeBottom, panelBottomFloor)
    }
}
