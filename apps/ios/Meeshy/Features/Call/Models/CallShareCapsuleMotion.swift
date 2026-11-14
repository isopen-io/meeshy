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
        reduceMotion ? .opacity : .opacity.combined(with: .scale(scale: 0.92))
    }
}
