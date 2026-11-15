import SwiftUI
import MeeshyUI

/// #17763 — le mouvement de la capsule de partage d'écran (loi 17 : rien
/// n'apparaît ni ne disparaît d'un coup). Transformation et opacité seulement ;
/// « Réduire les animations » remplace tout mouvement par un fondu court.
enum CallShareCapsuleMotion {
    /// Fondu de la fenêtre d'appel quand elle se monte ou se retire : le
    /// déploiement depuis la capsule et la contraction vers elle.
    nonisolated static func windowFade(reduceMotion: Bool, appearing: Bool) -> TimeInterval {
        guard !reduceMotion else { return MeeshyGlassPillRecipe.reducedStowDuration }
        return appearing ? 0.22 : 0.18
    }

    /// Le même ressort que le morphisme du verre.
    static func swapAnimation(reduceMotion: Bool) -> Animation {
        MeeshyGlassPillRecipe.morphAnimation(reduceMotion: reduceMotion)
    }

    /// Ce qui entre et sort de la capsule quand le partage commence ou finit.
    static func swapTransition(reduceMotion: Bool) -> AnyTransition {
        reduceMotion ? .opacity : .opacity.combined(with: .scale(scale: CallWindowMotion.shortScale))
    }

    /// P18.4 · P18.8 — l'écran d'appel se contracte VERS l'appel réduit et se redéploie
    /// DEPUIS lui. La bannière vit en haut au centre : l'échelle part de là. Sans appel
    /// réduit vivant, l'échelle courte au centre. « Réduire les animations » : fondu seul.
    /// Miroir d'Android `CallShareCapsuleMotion.window` (#18449), mêmes vecteurs.
    nonisolated static func window(reduceMotion: Bool, capsuleLive: Bool) -> CallWindowMotion {
        if reduceMotion { return CallWindowMotion(scale: 1, pivotX: 0.5, pivotY: 0.5) }
        guard capsuleLive else { return CallWindowMotion(scale: CallWindowMotion.shortScale, pivotX: 0.5, pivotY: 0.5) }
        return CallWindowMotion(scale: CallWindowMotion.contractedScale, pivotX: 0.5, pivotY: 0)
    }

    /// P18.4 — depuis la bulle (forme déplaçable, propre à iOS), l'écran part du centre
    /// MESURÉ de la bulle, en fractions de l'écran, borné à l'écran. Sans mesure, la bannière.
    nonisolated static func window(reduceMotion: Bool, bubbleCenter: CGPoint, in size: CGSize) -> CallWindowMotion {
        guard !reduceMotion, size.width > 0, size.height > 0 else {
            return window(reduceMotion: reduceMotion, capsuleLive: true)
        }
        return CallWindowMotion(
            scale: CallWindowMotion.contractedScale,
            pivotX: min(max(bubbleCenter.x / size.width, 0), 1),
            pivotY: min(max(bubbleCenter.y / size.height, 0), 1)
        )
    }
}

/// L'échelle extrême de l'écran d'appel pendant son passage, et le point (fractions de
/// sa largeur et de sa hauteur) vers lequel il se contracte ou depuis lequel il se
/// déploie. `scale` = 1 : aucune mise à l'échelle, fondu seul.
nonisolated struct CallWindowMotion: Equatable, Sendable {
    static let contractedScale: CGFloat = 0.1
    static let shortScale: CGFloat = 0.92

    let scale: CGFloat
    let pivotX: CGFloat
    let pivotY: CGFloat

    var anchor: UnitPoint { UnitPoint(x: pivotX, y: pivotY) }

    /// L'échelle vue à `progress` (0 = plein écran, 1 = contracté).
    func scale(at progress: CGFloat) -> CGFloat {
        1 - (1 - scale) * progress
    }
}
