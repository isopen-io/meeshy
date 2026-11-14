import SwiftUI

/// **L'appui long d'un bouton flottant s'annonce par un écrasement des deux côtés** (#18428).
///
/// Le doigt qui tient le disque le resserre en largeur, symétriquement autour de
/// son centre, à mesure que l'appui long approche de l'ouverture de la vue liée ;
/// la largeur revient à l'ouverture ou à l'abandon (doigt levé tôt, glissé au-delà
/// du seuil). Sous « Réduire les animations », aucune déformation : un fondu court
/// estompe le disque à la place, et revient de même.
///
/// La progression est la valeur que SwiftUI interpole : 1 tant que le doigt tient,
/// 0 sinon ; l'animation de montée dure exactement l'appui long, si bien que
/// l'écrasement atteint son terme à l'instant où la vue s'ouvre.
public nonisolated enum FloatingButtonHoldSquash {
    /// La durée de l'appui long qui ouvre la vue liée, et de l'écrasement qui l'annonce.
    public static let holdDuration: Double = 0.5
    /// La largeur du disque au terme de l'appui long, en fraction de sa largeur au repos.
    public static let squashedWidth: CGFloat = 0.86
    /// L'opacité du disque au terme de l'appui long, sous « Réduire les animations ».
    public static let reducedOpacity: Double = 0.6

    /// Un bouton sans appui long ne s'écrase jamais : rien ne s'ouvrirait au terme.
    public static func progress(isHolding: Bool, hasLongPress: Bool) -> Double {
        isHolding && hasLongPress ? 1 : 0
    }

    public static func horizontalScale(progress: Double, reduceMotion: Bool) -> CGFloat {
        guard !reduceMotion else { return 1 }
        return 1 - (1 - squashedWidth) * CGFloat(clamped(progress))
    }

    public static func opacity(progress: Double, reduceMotion: Bool) -> Double {
        guard reduceMotion else { return 1 }
        return 1 - (1 - reducedOpacity) * clamped(progress)
    }

    /// Montée linéaire sur l'appui long, retour par `springFast` à l'ouverture ou à l'abandon.
    @MainActor public static func motion(isHolding: Bool) -> Animation {
        isHolding ? .linear(duration: holdDuration) : MeeshyAnimation.springFast
    }

    /// Le fondu court du mode réduit, à la montée comme au retour.
    public static var reducedAnimation: Animation { MeeshyMotion.reducedFade }

    private static func clamped(_ progress: Double) -> Double {
        min(max(progress, 0), 1)
    }
}

/// L'écrasement posé sur un bouton flottant : largeur resserrée autour du centre,
/// ou fondu court sous « Réduire les animations » (les deux moitiés lues).
struct FloatingButtonHoldSquashEffect: ViewModifier {
    let isHolding: Bool
    let hasLongPress: Bool
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userForcedReduceMotion

    func body(content: Content) -> some View {
        let reduceMotion = MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: userForcedReduceMotion)
        let progress = FloatingButtonHoldSquash.progress(isHolding: isHolding, hasLongPress: hasLongPress)
        return content
            .scaleEffect(x: FloatingButtonHoldSquash.horizontalScale(progress: progress, reduceMotion: reduceMotion), y: 1)
            .opacity(FloatingButtonHoldSquash.opacity(progress: progress, reduceMotion: reduceMotion))
            .meeshyAnimation(
                FloatingButtonHoldSquash.motion(isHolding: isHolding),
                reduced: FloatingButtonHoldSquash.reducedAnimation,
                value: isHolding
            )
    }
}
